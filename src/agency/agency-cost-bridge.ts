/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 💰 Agency Cost Bridge
 *
 * يربط نظام تتبع التكاليف الموجود (cost-tracker.ts) بنظام الوكالة.
 * يتتبع استهلاك كل وكيل من التوكن ويحسب التكلفة بالدولار.
 *
 * يعمل فوق cost-tracker.ts الموجود — لا يستبدله.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs'
import * as path from 'path'
import { getOriginalCwd } from '../bootstrap/state.js'
import { writeDailyLog } from './shared-memory.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentCostEntry {
  agentName: string
  model: string
  inputTokens: number
  outputTokens: number
  estimatedCostUSD: number
  timestamp: string
  taskId?: string
}

export interface AgentCostSummary {
  agentName: string
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  totalCostUSD: number
  callCount: number
  models: Record<string, {
    inputTokens: number
    outputTokens: number
    costUSD: number
    callCount: number
  }>
}

export interface AgencyCostReport {
  period: string
  generatedAt: string
  totalCostUSD: number
  totalTokens: number
  totalCalls: number
  agentBreakdown: AgentCostSummary[]
  modelBreakdown: Record<string, {
    totalCostUSD: number
    totalTokens: number
    callCount: number
  }>
  topConsumer: { agent: string; costUSD: number } | null
  cheapestModel: { model: string; costPerToken: number } | null
  recommendations: string[]
}

// ─── Model Pricing (USD per 1M tokens)  ──────────────────────────────────────

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-1.5-pro':            { input: 3.50,  output: 10.50 },
  'gemini-1.5-flash':          { input: 0.075, output: 0.30  },
  'gemini-1.5-flash-8b':       { input: 0.0375,output: 0.15  },
  'gemini-2.0-flash':          { input: 0.10,  output: 0.40  },
  'gemini-2.5-pro':            { input: 1.25,  output: 10.00 },
  'gemini-2.5-flash':          { input: 0.15,  output: 0.60  },
  'gpt-4o':                    { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':               { input: 0.15,  output: 0.60  },
  'claude-3-opus':             { input: 15.00, output: 75.00 },
  'claude-3.5-sonnet':         { input: 3.00,  output: 15.00 },
  'claude-3.5-haiku':          { input: 0.80,  output: 4.00  },
  'claude-sonnet-4':           { input: 3.00,  output: 15.00 },
  'deepseek-coder':            { input: 0.14,  output: 0.28  },
  'deepseek-chat':             { input: 0.14,  output: 0.28  },
  'llama-3.1-70b-versatile':   { input: 0.59,  output: 0.79  },
  'llama-3.1-8b-instant':      { input: 0.05,  output: 0.08  },
}

// ─── Storage ──────────────────────────────────────────────────────────────────

function getCostDir(): string {
  const dir = path.join(getOriginalCwd(), '.claude', 'agency', 'costs')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getTodayDateString(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function getDailyCostPath(date?: string): string {
  return path.join(getCostDir(), `costs-${date || getTodayDateString()}.json`)
}

function loadDailyEntries(date?: string): AgentCostEntry[] {
  const fp = getDailyCostPath(date)
  if (!fs.existsSync(fp)) return []
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf-8'))
  } catch {
    return []
  }
}

function saveDailyEntries(entries: AgentCostEntry[], date?: string): void {
  fs.writeFileSync(getDailyCostPath(date), JSON.stringify(entries, null, 2), 'utf-8')
}

// ─── Cost Calculation ─────────────────────────────────────────────────────────

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Find pricing (try exact match, then partial)
  let pricing = MODEL_PRICING[model]
  if (!pricing) {
    const key = Object.keys(MODEL_PRICING).find(k => model.includes(k) || k.includes(model))
    if (key) {
      pricing = MODEL_PRICING[key]
    }
  }

  if (!pricing) {
    // Default fallback pricing
    pricing = { input: 1.0, output: 3.0 }
  }

  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * يسجل استهلاك توكن لوكيل معين.
 * يُستدعى بعد كل طلب API.
 */
export function trackAgentCost(
  agentName: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  taskId?: string,
): AgentCostEntry {
  const costUSD = calculateCost(model, inputTokens, outputTokens)

  const entry: AgentCostEntry = {
    agentName,
    model,
    inputTokens,
    outputTokens,
    estimatedCostUSD: Math.round(costUSD * 1_000_000) / 1_000_000, // 6 decimal places
    timestamp: new Date().toISOString(),
    taskId,
  }

  const entries = loadDailyEntries()
  entries.push(entry)

  // Keep max 1000 entries per day
  if (entries.length > 1000) entries.splice(0, entries.length - 1000)

  saveDailyEntries(entries)
  return entry
}

/**
 * يحسب ملخص تكلفة وكيل معين لليوم.
 */
export function getAgentCostSummary(agentName: string, date?: string): AgentCostSummary {
  const entries = loadDailyEntries(date).filter(e => e.agentName === agentName)
  return buildSummary(agentName, entries)
}

/**
 * يحسب ملخص تكلفة جميع الوكلاء.
 */
export function getAllAgentCosts(date?: string): AgentCostSummary[] {
  const entries = loadDailyEntries(date)
  const agents = [...new Set(entries.map(e => e.agentName))]
  return agents.map(agent => {
    const agentEntries = entries.filter(e => e.agentName === agent)
    return buildSummary(agent, agentEntries)
  }).sort((a, b) => b.totalCostUSD - a.totalCostUSD)
}

function buildSummary(agentName: string, entries: AgentCostEntry[]): AgentCostSummary {
  const models: AgentCostSummary['models'] = {}

  let totalInput = 0
  let totalOutput = 0
  let totalCost = 0

  for (const e of entries) {
    totalInput += e.inputTokens
    totalOutput += e.outputTokens
    totalCost += e.estimatedCostUSD

    if (!models[e.model]) {
      models[e.model] = { inputTokens: 0, outputTokens: 0, costUSD: 0, callCount: 0 }
    }
    models[e.model]!.inputTokens += e.inputTokens
    models[e.model]!.outputTokens += e.outputTokens
    models[e.model]!.costUSD += e.estimatedCostUSD
    models[e.model]!.callCount++
  }

  return {
    agentName,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalTokens: totalInput + totalOutput,
    totalCostUSD: Math.round(totalCost * 1_000_000) / 1_000_000,
    callCount: entries.length,
    models,
  }
}

// ─── Report Generation ────────────────────────────────────────────────────────

/**
 * يُولد تقرير تكاليف شامل للوكالة.
 */
export function generateCostReport(date?: string): AgencyCostReport {
  const entries = loadDailyEntries(date)
  const agentBreakdown = getAllAgentCosts(date)
  const period = date || getTodayDateString()

  // Model breakdown
  const modelBreakdown: AgencyCostReport['modelBreakdown'] = {}
  for (const e of entries) {
    if (!modelBreakdown[e.model]) {
      modelBreakdown[e.model] = { totalCostUSD: 0, totalTokens: 0, callCount: 0 }
    }
    modelBreakdown[e.model]!.totalCostUSD += e.estimatedCostUSD
    modelBreakdown[e.model]!.totalTokens += e.inputTokens + e.outputTokens
    modelBreakdown[e.model]!.callCount++
  }

  const totalCostUSD = entries.reduce((sum, e) => sum + e.estimatedCostUSD, 0)
  const totalTokens = entries.reduce((sum, e) => sum + e.inputTokens + e.outputTokens, 0)
  const totalCalls = entries.length

  // Top consumer
  const topConsumer = agentBreakdown.length > 0
    ? { agent: agentBreakdown[0]!.agentName, costUSD: agentBreakdown[0]!.totalCostUSD }
    : null

  // Cheapest model (cost per token)
  let cheapestModel: AgencyCostReport['cheapestModel'] = null
  const modelCostPerToken = Object.entries(modelBreakdown)
    .filter(([, v]) => v.totalTokens > 0)
    .map(([model, v]) => ({
      model,
      costPerToken: v.totalCostUSD / v.totalTokens,
    }))
    .sort((a, b) => a.costPerToken - b.costPerToken)

  if (modelCostPerToken.length > 0) {
    cheapestModel = modelCostPerToken[0]!
  }

  // Smart recommendations
  const recommendations = generateRecommendations(agentBreakdown, modelBreakdown, totalCostUSD)

  return {
    period,
    generatedAt: new Date().toISOString(),
    totalCostUSD: Math.round(totalCostUSD * 100) / 100,
    totalTokens,
    totalCalls,
    agentBreakdown,
    modelBreakdown,
    topConsumer,
    cheapestModel,
    recommendations,
  }
}

function generateRecommendations(
  agents: AgentCostSummary[],
  models: AgencyCostReport['modelBreakdown'],
  totalCost: number,
): string[] {
  const recs: string[] = []

  // 1. Identify expensive agents
  for (const agent of agents) {
    if (totalCost > 0 && agent.totalCostUSD / totalCost > 0.5) {
      recs.push(`💡 ${agent.agentName} يستهلك ${Math.round(agent.totalCostUSD / totalCost * 100)}% من التكلفة — فكر في تحسين prompts أو استخدام نموذج أرخص.`)
    }
  }

  // 2. Suggest cheaper models
  const expensiveModels = Object.entries(models)
    .filter(([model]) => MODEL_PRICING[model]?.input && MODEL_PRICING[model]!.input > 2.0)
    .map(([model]) => model)

  if (expensiveModels.length > 0) {
    recs.push(`💰 النماذج الغالية المستخدمة: ${expensiveModels.join(', ')}. جرب deepseek-coder للكود (أرخص 10x) أو gemini-flash للمهام العامة.`)
  }

  // 3. High call count warning
  for (const agent of agents) {
    if (agent.callCount > 50) {
      recs.push(`⚠️ ${agent.agentName} أجرى ${agent.callCount} طلب API — يمكن تقليلها بتجميع الطلبات أو تحسين الـ prompts.`)
    }
  }

  if (recs.length === 0) {
    recs.push('✅ التكاليف ضمن الحدود الطبيعية.')
  }

  return recs
}

// ─── Formatted Output ─────────────────────────────────────────────────────────

/**
 * يُنتج تقريراً منسقاً بـ Markdown
 */
export function formatCostReport(report: AgencyCostReport): string {
  let md = `# 💰 تقرير تكاليف الوكالة\n\n`
  md += `> **الفترة:** ${report.period}\n`
  md += `> **التكلفة الإجمالية:** $${report.totalCostUSD.toFixed(4)}\n`
  md += `> **التوكن المستهلكة:** ${report.totalTokens.toLocaleString()}\n`
  md += `> **عدد الطلبات:** ${report.totalCalls}\n\n`

  // Agent breakdown table
  if (report.agentBreakdown.length > 0) {
    md += `## 🤖 التكلفة لكل وكيل\n\n`
    md += `| الوكيل | التوكن | التكلفة | الطلبات |\n`
    md += `|--------|--------|---------|----------|\n`
    for (const agent of report.agentBreakdown) {
      md += `| ${agent.agentName} | ${agent.totalTokens.toLocaleString()} | $${agent.totalCostUSD.toFixed(4)} | ${agent.callCount} |\n`
    }
    md += '\n'
  }

  // Model breakdown
  if (Object.keys(report.modelBreakdown).length > 0) {
    md += `## 🧠 التكلفة لكل نموذج\n\n`
    md += `| النموذج | التوكن | التكلفة | الطلبات |\n`
    md += `|---------|--------|---------|----------|\n`
    for (const [model, data] of Object.entries(report.modelBreakdown)) {
      md += `| ${model} | ${data.totalTokens.toLocaleString()} | $${data.totalCostUSD.toFixed(4)} | ${data.callCount} |\n`
    }
    md += '\n'
  }

  // Highlights
  if (report.topConsumer) {
    md += `> 🏆 **الأكثر استهلاكاً:** ${report.topConsumer.agent} ($${report.topConsumer.costUSD.toFixed(4)})\n`
  }
  if (report.cheapestModel) {
    md += `> 💚 **الأرخص:** ${report.cheapestModel.model}\n`
  }
  md += '\n'

  // Recommendations
  md += `## 💡 توصيات\n\n`
  report.recommendations.forEach(r => {
    md += `- ${r}\n`
  })

  return md
}

// ─── Cost History ─────────────────────────────────────────────────────────────

/**
 * يُرجع قائمة بأيام التكاليف المتاحة
 */
export function listCostDays(): string[] {
  const dir = getCostDir()
  try {
    return fs.readdirSync(dir)
      .filter(f => f.startsWith('costs-') && f.endsWith('.json'))
      .map(f => f.replace('costs-', '').replace('.json', ''))
      .sort()
      .reverse()
  } catch {
    return []
  }
}

/**
 * يحسب التكلفة الإجمالية لعدة أيام
 */
export function getTotalCostForPeriod(days: number = 7): {
  totalCostUSD: number
  totalTokens: number
  dailyCosts: Array<{ date: string; costUSD: number }>
} {
  const allDays = listCostDays().slice(0, days)
  let totalCostUSD = 0
  let totalTokens = 0
  const dailyCosts: Array<{ date: string; costUSD: number }> = []

  for (const day of allDays) {
    const entries = loadDailyEntries(day)
    const dayCost = entries.reduce((sum, e) => sum + e.estimatedCostUSD, 0)
    const dayTokens = entries.reduce((sum, e) => sum + e.inputTokens + e.outputTokens, 0)

    totalCostUSD += dayCost
    totalTokens += dayTokens
    dailyCosts.push({ date: day, costUSD: Math.round(dayCost * 10000) / 10000 })
  }

  return {
    totalCostUSD: Math.round(totalCostUSD * 100) / 100,
    totalTokens,
    dailyCosts,
  }
}
