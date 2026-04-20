/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⏱️ API Rate Limiter - Token Bucket Algorithm
 * يمنع تجاوز حدود كل نموذج ذكاء اصطناعي
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Model Limits ─────────────────────────────────────────────────────────────

export interface ModelLimits {
  rpm:           number
  tpm?:          number
  retryAfterMs?: number
}

export const MODEL_LIMITS: Record<string, ModelLimits> = {
  // ─── Gemini 2.5 (Latest Stable) ───
  'gemini-2.5-pro':              { rpm: 5,  tpm: 1000000,  retryAfterMs: 12000 },
  'gemini-2.5-flash':            { rpm: 15, tpm: 1000000,  retryAfterMs: 4000  },
  'gemini-2.5-flash-lite':       { rpm: 30, tpm: 1000000,  retryAfterMs: 2000  },
  // ─── Gemini 3.x (Preview) ───
  'gemini-3-pro-preview':        { rpm: 5,  tpm: 1000000,  retryAfterMs: 12000 },
  'gemini-3-flash-preview':      { rpm: 15, tpm: 1000000,  retryAfterMs: 4000  },
  'gemini-3.1-pro-preview':      { rpm: 5,  tpm: 1000000,  retryAfterMs: 12000 },
  // ─── Gemini 2.0 ───
  'gemini-2.0-flash':            { rpm: 15, tpm: 1000000,  retryAfterMs: 4000  },
  'gemini-2.0-flash-lite':       { rpm: 30, tpm: 1000000,  retryAfterMs: 2000  },
  // ─── Legacy ───
  'gemini-1.5-pro':              { rpm: 2,  tpm: 32000,    retryAfterMs: 30000 },
  'gemini-1.5-flash':            { rpm: 15, tpm: 1000000,  retryAfterMs: 4000  },
  'gemini-1.5-flash-8b':         { rpm: 15, tpm: 1000000,  retryAfterMs: 4000  },
  // ─── Groq ───
  'llama-3.1-70b-versatile':     { rpm: 30, tpm: 6000,    retryAfterMs: 2000  },
  'llama-3.1-8b-instant':        { rpm: 30, tpm: 6000,    retryAfterMs: 2000  },
  'llama3-groq-70b-8192-tool-use': { rpm: 30,             retryAfterMs: 2000  },
  // ─── DeepSeek ───
  'deepseek-coder':              { rpm: 60,                retryAfterMs: 1000  },
  'deepseek-chat':               { rpm: 60,                retryAfterMs: 1000  },
  // ─── GPT ───
  'gpt-4o':                      { rpm: 10, tpm: 30000,    retryAfterMs: 6000  },
}

// ─── Token Bucket ─────────────────────────────────────────────────────────────

interface Bucket {
  tokens:       number
  lastRefill:   number
  maxTokens:    number
  refillRateMs: number
}

const buckets = new Map<string, Bucket>()

function getBucket(modelId: string): Bucket {
  if (!buckets.has(modelId)) {
    const limits     = MODEL_LIMITS[modelId] ?? { rpm: 10 }
    const maxTokens  = limits.rpm
    const refillRate = (60 * 1000) / maxTokens

    buckets.set(modelId, {
      tokens:       maxTokens,
      lastRefill:   Date.now(),
      maxTokens,
      refillRateMs: refillRate,
    })
  }
  return buckets.get(modelId)!
}

function refill(bucket: Bucket): void {
  const now      = Date.now()
  const elapsed  = now - bucket.lastRefill
  const toAdd    = Math.floor(elapsed / bucket.refillRateMs)

  if (toAdd > 0) {
    bucket.tokens    = Math.min(bucket.maxTokens, bucket.tokens + toAdd)
    bucket.lastRefill = now
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// ─── Core: waitForSlot ────────────────────────────────────────────────────────

export async function waitForSlot(
  modelId:   string,
  agentName: string = 'unknown'
): Promise<void> {
  const bucket = getBucket(modelId)

  return new Promise(resolve => {
    const tryAcquire = () => {
      refill(bucket)
      if (bucket.tokens >= 1) {
        bucket.tokens -= 1
        resolve()
        return
      }
      setTimeout(tryAcquire, bucket.refillRateMs)
    }
    tryAcquire()
  })
}

// ─── Wrapper: callWithRateLimit ───────────────────────────────────────────────

export async function callWithRateLimit<T>(
  modelId:    string,
  agentName:  string,
  apiCall:    () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await waitForSlot(modelId, agentName)

    try {
      return await apiCall()

    } catch (err: any) {
      lastError = err

      const is429 = err?.status === 429 || err?.code === 429
      if (is429) {
        const limits       = MODEL_LIMITS[modelId]
        const base         = limits?.retryAfterMs ?? 10000
        const waitWithJitter = base + Math.random() * 1000

        console.warn(
          `⏳ [${agentName}] Rate limit على "${modelId}". ` +
          `المحاولة ${attempt}/${maxRetries}. ` +
          `انتظر ${Math.round(waitWithJitter / 1000)}s...`
        )
        await sleep(waitWithJitter)
        continue
      }

      if (attempt < maxRetries) {
        await sleep(1000 * attempt)
      }
    }
  }

  throw lastError ?? new Error(`فشل بعد ${maxRetries} محاولات`)
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export function getRateLimiterStats(): Record<string, {
  model:          string
  tokensAvailable: number
  maxTokens:      number
  usagePercent:   number
}> {
  const stats: Record<string, any> = {}

  for (const [modelId, bucket] of buckets.entries()) {
    refill(bucket)
    stats[modelId] = {
      model:           modelId,
      tokensAvailable: Math.round(bucket.tokens),
      maxTokens:       bucket.maxTokens,
      usagePercent:    Math.round(
        ((bucket.maxTokens - bucket.tokens) / bucket.maxTokens) * 100
      ),
    }
  }

  return stats
}

export function resetBucket(modelId: string): void {
  buckets.delete(modelId)
}

export function resetAllBuckets(): void {
  buckets.clear()
}
