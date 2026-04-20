/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🗜️ Smart Context Compressor
 *
 * يضغط السياقات الكبيرة بذكاء قبل إرسالها للنموذج:
 * - يحافظ على: القرارات، الأوامر التقنية، الأخطاء المهمة
 * - يحذف: التكرار، التفاصيل القديمة، المحادثات الروتينية
 * - يدعم مستويات ضغط: light (50%), medium (75%), aggressive (90%)
 *
 * التوفير المحتمل: 50-90% في التوكن = تكلفة أقل وسياق أنقى.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type CompressionLevel = 'light' | 'medium' | 'aggressive'

export interface CompressionResult {
  /** النص المضغوط */
  compressed: string
  /** الطول الأصلي (بالحروف) */
  originalLength: number
  /** الطول بعد الضغط */
  compressedLength: number
  /** نسبة التوفير (0-100%) */
  savingsPercent: number
  /** التوكن المقدرة قبل وبعد */
  estimatedTokensBefore: number
  estimatedTokensAfter: number
  /** العناصر المحذوفة */
  removedSections: number
  /** العناصر المحفوظة */
  preservedSections: number
}

export interface CompressionOptions {
  /** مستوى الضغط */
  level: CompressionLevel
  /** الحد الأقصى للتوكن المقدرة */
  maxTokens?: number
  /** كلمات يجب الحفاظ عليها في أي حال */
  preserveKeywords?: string[]
  /** هل نحافظ على code blocks؟ */
  preserveCode?: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** أنماط المحتوى المهم — نحتفظ بها دائماً */
const CRITICAL_PATTERNS: RegExp[] = [
  // قرارات
  /(?:قرار|قررنا|اخترنا|chosen|decided|decision)\s*[:：]?\s*.+/gi,
  // أخطاء وتحذيرات
  /(?:خطأ|مشكلة|تحذير|error|bug|warning|critical|⚠️|❌|🔴)\s*[:：]?\s*.+/gi,
  // تهيئات تقنية
  /(?:port|host|database|api|env|config|url)\s*[:=]\s*\S+/gi,
  // أوامر
  /(?:npm|npx|yarn|pip|docker|git)\s+\S+/gi,
  // Markdown headings (important structure)
  /^#{1,3}\s+.+$/gm,
]

/** أنماط المحتوى الذي يمكن حذفه */
const REMOVABLE_PATTERNS: RegExp[] = [
  // timestamps and dates in conversation
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g,
  // Long separator lines
  /^[─═\-=_*]{10,}$/gm,
  // Empty lines (excessive)
  /\n{4,}/g,
  // Decorative emojis at start of line (keep the text)
  /^([🔗✅⏳🔄🔒📝📊📋📂👥📨⚠️⚖️💾📰🏗️🧠🔍📈🎨💻🎯📌🔬🧪])\s*/gm,
]

/** الكلمات التي تدل على محتوى مهم */
const IMPORTANT_KEYWORDS = [
  // Arabic
  'قرار', 'مهم', 'تنبيه', 'خطير', 'أساسي', 'مطلوب', 'إلزامي', 'ضروري',
  'اختيار', 'حل', 'نتيجة', 'مخرج', 'بنية', 'هيكل', 'بروتوكول',
  // English
  'decision', 'important', 'critical', 'required', 'must', 'essential',
  'architecture', 'protocol', 'security', 'password', 'key', 'secret',
  'breaking', 'migration', 'deploy', 'production',
]

// ─── Core Compressor ──────────────────────────────────────────────────────────

/**
 * يضغط نصاً كبيراً بذكاء مع الحفاظ على المعلومات المهمة.
 */
export function compressContext(
  text: string,
  options: CompressionOptions = { level: 'medium' },
): CompressionResult {
  const originalLength = text.length
  const estimatedTokensBefore = estimateTokens(text)

  // If text is small enough, no compression needed
  if (options.maxTokens && estimatedTokensBefore <= options.maxTokens) {
    return {
      compressed: text,
      originalLength,
      compressedLength: originalLength,
      savingsPercent: 0,
      estimatedTokensBefore,
      estimatedTokensAfter: estimatedTokensBefore,
      removedSections: 0,
      preservedSections: 0,
    }
  }

  // Step 1: Split into logical sections
  const sections = splitIntoSections(text)

  // Step 2: Score each section for importance
  const scored = sections.map(section => ({
    text: section,
    score: scoreSection(section, options.preserveKeywords || []),
    isCode: /```[\s\S]*?```/.test(section),
  }))

  // Step 3: Apply compression based on level
  const threshold = getThreshold(options.level)
  let preserved: typeof scored = []
  let removedCount = 0

  for (const section of scored) {
    // Always keep critical sections
    if (section.score >= 8) {
      preserved.push(section)
      continue
    }

    // Keep code blocks if option is set
    if (options.preserveCode && section.isCode) {
      preserved.push(section)
      continue
    }

    // Apply threshold
    if (section.score >= threshold) {
      // For medium/aggressive: summarize instead of keeping full text
      if (options.level !== 'light' && section.text.length > 300) {
        preserved.push({
          ...section,
          text: summarizeSection(section.text),
        })
      } else {
        preserved.push(section)
      }
    } else {
      removedCount++
    }
  }

  // Step 4: If still too long and maxTokens specified, truncate least important
  if (options.maxTokens) {
    preserved = truncateToFit(preserved, options.maxTokens)
  }

  // Step 5: Reassemble
  let compressed = preserved.map(s => s.text).join('\n\n')

  // Post-processing: clean up
  compressed = postProcess(compressed)

  const compressedLength = compressed.length
  const estimatedTokensAfter = estimateTokens(compressed)
  const savingsPercent = originalLength > 0
    ? Math.round((1 - compressedLength / originalLength) * 100)
    : 0

  return {
    compressed,
    originalLength,
    compressedLength,
    savingsPercent,
    estimatedTokensBefore,
    estimatedTokensAfter,
    removedSections: removedCount,
    preservedSections: preserved.length,
  }
}

// ─── Section Management ───────────────────────────────────────────────────────

function splitIntoSections(text: string): string[] {
  // Split by markdown headers or double newlines
  const headerSplit = text.split(/(?=^#{1,3}\s)/m)

  const sections: string[] = []
  for (const chunk of headerSplit) {
    // If chunk is very long, split further by paragraphs
    if (chunk.length > 1000) {
      const paragraphs = chunk.split(/\n\n+/)
      sections.push(...paragraphs.filter(p => p.trim().length > 0))
    } else if (chunk.trim().length > 0) {
      sections.push(chunk.trim())
    }
  }

  return sections
}

function scoreSection(text: string, extraKeywords: string[]): number {
  let score = 0
  const lower = text.toLowerCase()

  // Check critical patterns
  for (const pattern of CRITICAL_PATTERNS) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0
    if (pattern.test(text)) score += 3
  }

  // Check important keywords
  const allKeywords = [...IMPORTANT_KEYWORDS, ...extraKeywords]
  for (const keyword of allKeywords) {
    if (lower.includes(keyword.toLowerCase())) score += 1
  }

  // Headers are important
  if (/^#{1,3}\s/m.test(text)) score += 2

  // Code blocks are important
  if (/```[\s\S]*?```/.test(text)) score += 2

  // Lists with data are more organized = more important
  if (/^[-*]\s/m.test(text)) score += 1

  // Recent content is more important (heuristic: shorter sections at the end)
  // Short sections are often actionable
  if (text.length < 200 && text.length > 30) score += 1

  // Very long, unstructured text = less important
  if (text.length > 500 && !/^#{1,3}\s/m.test(text) && !/```/.test(text)) {
    score -= 1
  }

  return Math.max(0, Math.min(10, score))
}

function getThreshold(level: CompressionLevel): number {
  switch (level) {
    case 'light':      return 2  // Keep most
    case 'medium':     return 4  // Keep important
    case 'aggressive': return 6  // Keep only critical
  }
}

// ─── Summarization ────────────────────────────────────────────────────────────

/**
 * يلخص قسماً طويلاً بالحفاظ على أول سطر + النقاط المهمة.
 */
function summarizeSection(text: string): string {
  const lines = text.split('\n')
  const summary: string[] = []

  // Keep header
  const header = lines.find(l => /^#{1,3}\s/.test(l))
  if (header) summary.push(header)

  // Keep first substantive line
  const firstLine = lines.find(l => l.trim().length > 20 && !/^#{1,3}\s/.test(l))
  if (firstLine && firstLine !== header) summary.push(firstLine)

  // Keep bullet points with important keywords
  for (const line of lines) {
    if (/^[-*]\s/.test(line)) {
      const lower = line.toLowerCase()
      if (IMPORTANT_KEYWORDS.some(kw => lower.includes(kw))) {
        summary.push(line)
      }
    }
  }

  // Keep code blocks (summarized)
  const codeBlocks = text.match(/```[\s\S]*?```/g) || []
  for (const block of codeBlocks.slice(0, 2)) {
    const blockLines = block.split('\n')
    if (blockLines.length > 10) {
      // Keep first 5 lines + last 2 lines
      const summarized = [
        ...blockLines.slice(0, 5),
        `  // ... (${blockLines.length - 7} lines omitted)`,
        ...blockLines.slice(-2),
      ].join('\n')
      summary.push(summarized)
    } else {
      summary.push(block)
    }
  }

  return summary.join('\n')
}

// ─── Truncation ───────────────────────────────────────────────────────────────

function truncateToFit(
  sections: Array<{ text: string; score: number; isCode: boolean }>,
  maxTokens: number,
): typeof sections {
  // Sort by score (keep highest scoring)
  const sorted = [...sections].sort((a, b) => b.score - a.score)

  const result: typeof sections = []
  let currentTokens = 0

  for (const section of sorted) {
    const sectionTokens = estimateTokens(section.text)
    if (currentTokens + sectionTokens <= maxTokens) {
      result.push(section)
      currentTokens += sectionTokens
    }
  }

  // Restore original order
  return sections.filter(s => result.includes(s))
}

// ─── Post-Processing ──────────────────────────────────────────────────────────

function postProcess(text: string): string {
  // Remove excessive blank lines
  let clean = text.replace(/\n{3,}/g, '\n\n')

  // Remove trailing/leading whitespace per line
  clean = clean.split('\n').map(l => l.trimEnd()).join('\n')

  // Remove long separator lines
  clean = clean.replace(/^[─═\-=_*]{10,}$/gm, '---')

  return clean.trim()
}

// ─── Token Estimation ─────────────────────────────────────────────────────────

/**
 * يقدر عدد التوكن تقريبياً (1 token ≈ 4 حروف إنجليزية أو 2 حرف عربي).
 */
export function estimateTokens(text: string): number {
  // Count Arabic characters (they use more tokens)
  const arabicChars = (text.match(/[\u0600-\u06FF\u0750-\u077F]/g) || []).length
  const otherChars = text.length - arabicChars

  // Arabic: ~1 token per 2 chars | English: ~1 token per 4 chars
  return Math.ceil(arabicChars / 2 + otherChars / 4)
}

// ─── Convenience Functions ────────────────────────────────────────────────────

/**
 * ضغط خفيف — يحذف التكرار والزوائد فقط (~50% توفير)
 */
export function compressLight(text: string, maxTokens?: number): string {
  return compressContext(text, { level: 'light', preserveCode: true, maxTokens }).compressed
}

/**
 * ضغط متوسط — يلخص الأقسام الطويلة (~75% توفير)
 */
export function compressMedium(text: string, maxTokens?: number): string {
  return compressContext(text, { level: 'medium', preserveCode: true, maxTokens }).compressed
}

/**
 * ضغط عنيف — يحتفظ فقط بالقرارات والأوامر (~90% توفير)
 */
export function compressAggressive(text: string, maxTokens?: number): string {
  return compressContext(text, { level: 'aggressive', preserveCode: false, maxTokens }).compressed
}
