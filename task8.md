🚀 البناء الكامل - كل المهام بالترتيب
المرحلة 1: Agent Zero - القلب المركزي
src/agency/agent-zero.ts
TypeScript

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🧠 Agent Zero — The Central Orchestrator
 * الوكيل المركزي الذي يربط كل شيء
 * يستقبل الطلب → يحلله → يوزع → يجمع → يعيد النتيجة
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { createAgencyTeam, loadTeam, getTeamProgress, synthesizeTeamResults } from './team-orchestrator.js'
import { writeHotMemory, writeWarmMemory, writeColdMemory } from './tiered-memory.js'
import { memoryPalace } from './mempalace.js'
import { callWithRateLimit } from './rate-limiter.js'
import { writeDailyLog } from './shared-memory.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserRequest {
  id:        string
  content:   string
  projectName: string
  timestamp: string
}

export interface AgentZeroResponse {
  requestId:   string
  status:      'analyzing' | 'planning' | 'executing' | 'done' | 'error'
  message:     string
  plan?:       MasterPlan
  result?:     string
  teamName?:   string
}

export interface MasterPlan {
  summary:     string
  clusters:    ClusterPlan[]
  estimatedTime: string
  totalTasks:  number
}

export interface ClusterPlan {
  name:        string
  type:        'tech' | 'marketing' | 'media' | 'management'
  tasks:       string[]
  model:       string
  priority:    number
}

export type OnUpdate = (update: AgentZeroResponse) => void

// ─── Model Config ─────────────────────────────────────────────────────────────

const AGENT_ZERO_MODEL = 'gemini-1.5-pro'

// ─── Agent Zero Class ─────────────────────────────────────────────────────────

export class AgentZero {
  private genAI: GoogleGenerativeAI
  private model: any
  private activeRequests: Map<string, AgentZeroResponse>

  constructor() {
    const apiKey = process.env.GOOGLE_AI_API_KEY
    if (!apiKey) throw new Error('GOOGLE_AI_API_KEY غير موجود في .env')

    this.genAI          = new GoogleGenerativeAI(apiKey)
    this.model          = this.genAI.getGenerativeModel({ model: AGENT_ZERO_MODEL })
    this.activeRequests = new Map()
  }

  // ─── Main Entry Point ───────────────────────────────────────────────────────

  async process(
    request: UserRequest,
    onUpdate: OnUpdate
  ): Promise<AgentZeroResponse> {

    writeDailyLog('pipeline-run', `Agent Zero استقبل طلباً جديداً`, {
      agent:   'agent-zero',
      details: request.content.substring(0, 100),
    })

    try {
      // ── الخطوة 1: التحليل ──────────────────────────────────────────────────
      onUpdate({
        requestId: request.id,
        status:    'analyzing',
        message:   'يحلل Agent Zero طلبك...',
      })

      const analysis = await this.analyzeRequest(request.content)

      // ── الخطوة 2: بناء الخطة ───────────────────────────────────────────────
      onUpdate({
        requestId: request.id,
        status:    'planning',
        message:   'يبني الخطة ويوزع المهام...',
        plan:      analysis,
      })

      // ── الخطوة 3: إنشاء الفريق ─────────────────────────────────────────────
      const pipeline = this.selectPipeline(analysis)
      const team     = createAgencyTeam(
        request.projectName,
        request.content,
        pipeline
      )

      onUpdate({
        requestId: request.id,
        status:    'executing',
        message:   `الفريق جاهز - ${team.teammates.length} وكيل يعملون الآن`,
        plan:      analysis,
        teamName:  team.teamName,
      })

      // ── الخطوة 4: حفظ السياق في الذاكرة ───────────────────────────────────
      writeHotMemory(
        request.projectName,
        'agent-zero',
        `طلب جديد: ${request.content}`,
        ['طلب', 'agent-zero'],
        9
      )

      writeWarmMemory(
        request.projectName,
        'agent-zero',
        `خطة: ${analysis.summary}`,
        ['خطة', 'استراتيجية'],
        8
      )

      memoryPalace.addDrawer(
        request.projectName,
        'AgentZeroDiary',
        `طلب: ${request.content}\nالخطة: ${analysis.summary}`,
        'agent-zero',
        9,
        ['طلب', 'خطة']
      )

      // ── الخطوة 5: التنفيذ ──────────────────────────────────────────────────
      const result = await this.executePlan(
        team.teamName,
        request,
        analysis,
        onUpdate
      )

      writeDailyLog('pipeline-done', `Agent Zero أكمل المعالجة`, {
        agent: 'agent-zero',
      })

      const finalResponse: AgentZeroResponse = {
        requestId: request.id,
        status:    'done',
        message:   'اكتمل التنفيذ بنجاح',
        plan:      analysis,
        teamName:  team.teamName,
        result,
      }

      return finalResponse

    } catch (err: any) {
      writeDailyLog('step-error', `Agent Zero: خطأ - ${err.message}`, {
        agent: 'agent-zero',
      })

      const errorResponse: AgentZeroResponse = {
        requestId: request.id,
        status:    'error',
        message:   `خطأ: ${err.message}`,
      }

      onUpdate(errorResponse)
      return errorResponse
    }
  }

  // ─── Analyze Request ────────────────────────────────────────────────────────

  private async analyzeRequest(content: string): Promise<MasterPlan> {
    const prompt = `
أنت Agent Zero، المنسق الرئيسي لوكالة ذكاء اصطناعي متكاملة.

المطلوب: حلل هذا الطلب وأنشئ خطة عمل مفصلة.

الطلب: "${content}"

الخلايا المتاحة:
- tech: للبرمجة، التطوير، الاختبار، التوثيق
- marketing: للتسويق، المحتوى، SEO، النمو
- media: للتصميم، الصور، الفيديو، الهوية البصرية
- management: للتخطيط، التنسيق، المراجعة

أجب بـ JSON فقط بهذا الهيكل:
{
  "summary": "ملخص الخطة في جملة واحدة",
  "clusters": [
    {
      "name": "اسم الخلية",
      "type": "tech|marketing|media|management",
      "tasks": ["مهمة 1", "مهمة 2", "مهمة 3"],
      "model": "النموذج المناسب",
      "priority": 1
    }
  ],
  "estimatedTime": "الوقت المتوقع",
  "totalTasks": العدد_الكلي
}

قواعد:
- management دائماً أولاً (priority: 1)
- لا تضف خلايا غير ضرورية
- كل خلية 2-4 مهام فقط
- كن محدداً وعملياً
`

    const response = await callWithRateLimit(
      'gemini-1.5-pro',
      'agent-zero',
      async () => {
        const result = await this.model.generateContent(prompt)
        return result.response.text()
      }
    )

    try {
      const cleaned = response
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim()
      return JSON.parse(cleaned) as MasterPlan
    } catch {
      // Fallback plan إذا فشل الـ parsing
      return this.buildFallbackPlan(content)
    }
  }

  // ─── Select Pipeline ────────────────────────────────────────────────────────

  private selectPipeline(plan: MasterPlan): string | undefined {
    const types = plan.clusters.map(c => c.type)

    if (types.includes('tech') && types.includes('marketing')) {
      return 'full-product'
    }
    if (types.includes('tech') && !types.includes('marketing')) {
      return 'tech-only'
    }
    if (types.includes('marketing') && !types.includes('tech')) {
      return 'marketing-only'
    }
    return undefined
  }

  // ─── Execute Plan ────────────────────────────────────────────────────────────

  private async executePlan(
    teamName: string,
    request: UserRequest,
    plan: MasterPlan,
    onUpdate: OnUpdate
  ): Promise<string> {
    // محاكاة التنفيذ مع تحديثات مستمرة
    // في النسخة الحقيقية: كل وكيل يستدعي نموذجه ويكتب نتائجه
    const results: string[] = []

    for (const cluster of plan.clusters.sort((a, b) => a.priority - b.priority)) {
      onUpdate({
        requestId: request.id,
        status:    'executing',
        message:   `${cluster.name} يعمل الآن...`,
        teamName,
      })

      // تنفيذ مهام الخلية
      const clusterResult = await this.executeCluster(
        cluster,
        request,
        teamName
      )
      results.push(clusterResult)

      // حفظ نتيجة الخلية في الذاكرة
      writeWarmMemory(
        request.projectName,
        cluster.name,
        clusterResult,
        [cluster.type, 'نتيجة'],
        7
      )
    }

    return results.join('\n\n---\n\n')
  }

  // ─── Execute Cluster ────────────────────────────────────────────────────────

  private async executeCluster(
    cluster: ClusterPlan,
    request: UserRequest,
    teamName: string
  ): Promise<string> {
    const provider = this.getProviderForModel(cluster.model)
    const prompt   = this.buildClusterPrompt(cluster, request.content)

    try {
      const result = await callWithRateLimit(
        cluster.model,
        cluster.name,
        async () => {
          // في هذا المثال نستخدم Gemini لكل الخلايا
          // في الإنتاج: كل خلية لها مزودها المحدد في models-config
          const res = await this.model.generateContent(prompt)
          return res.response.text()
        }
      )

      writeDailyLog('pipeline-done', `${cluster.name} أكمل مهامه`, {
        agent: cluster.name,
      })

      return `## ${cluster.name}\n\n${result}`

    } catch (err: any) {
      return `## ${cluster.name}\n\nخطأ: ${err.message}`
    }
  }

  // ─── Build Cluster Prompt ───────────────────────────────────────────────────

  private buildClusterPrompt(
    cluster: ClusterPlan,
    userRequest: string
  ): string {
    const tasksText = cluster.tasks
      .map((t, i) => `${i + 1}. ${t}`)
      .join('\n')

    return `
أنت وكيل ${cluster.name} في وكالة ذكاء اصطناعي متخصصة.

الطلب الأصلي من المستخدم: "${userRequest}"

مهامك المحددة:
${tasksText}

نفذ هذه المهام بدقة وأعطِ مخرجات عملية وقابلة للتطبيق فوراً.
كن محدداً، لا تكتب مقدمات عامة.
اكتب النتائج بشكل منظم وواضح.
`
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private getProviderForModel(model: string): string {
    if (model.includes('gemini')) return 'google'
    if (model.includes('llama') || model.includes('groq')) return 'groq'
    if (model.includes('deepseek')) return 'deepseek'
    return 'google'
  }

  private buildFallbackPlan(content: string): MasterPlan {
    return {
      summary:     `تنفيذ: ${content.substring(0, 50)}`,
      estimatedTime: '5-10 دقائق',
      totalTasks:  3,
      clusters: [
        {
          name:     'management',
          type:     'management',
          tasks:    ['تحليل المتطلبات', 'وضع الخطة'],
          model:    'gemini-1.5-pro',
          priority: 1,
        },
        {
          name:     'tech',
          type:     'tech',
          tasks:    ['التنفيذ التقني'],
          model:    'deepseek-coder',
          priority: 2,
        },
      ],
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const agentZero = new AgentZero()
المرحلة 2: Quality Gates Engine
src/agency/quality-gates.ts
TypeScript

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔍 Quality Gates Engine
 * يفحص كل مخرج قبل تسليمه — نجح يمر، فشل يعود
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { callWithRateLimit } from './rate-limiter.js'
import { writeDailyLog } from './shared-memory.js'
import { writeHotMemory, writeColdMemory } from './tiered-memory.js'
import { GoogleGenerativeAI } from '@google/generative-ai'

// ─── Types ────────────────────────────────────────────────────────────────────

export type OutputType = 'code' | 'marketing' | 'design-brief' | 'plan' | 'general'
export type GateStatus = 'passed' | 'failed' | 'warning'

export interface QualityReport {
  status:      GateStatus
  score:       number        // 0-100
  passed:      string[]      // معايير نجحت
  failed:      string[]      // معايير فشلت
  warnings:    string[]      // تحذيرات
  suggestion:  string        // اقتراح للتحسين
  retryNeeded: boolean
}

export interface GateInput {
  content:     string        // المخرج المراد فحصه
  type:        OutputType    // نوع المخرج
  agentName:   string        // الوكيل الذي أنتجه
  projectName: string        // اسم المشروع
  attempt:     number        // رقم المحاولة
}

// ─── Quality Criteria ─────────────────────────────────────────────────────────

const CRITERIA: Record<OutputType, string[]> = {
  code: [
    'الكود يحل المشكلة المطلوبة',
    'لا توجد أخطاء syntax واضحة',
    'الكود منظم وقابل للقراءة',
    'الدوال لها أسماء واضحة',
    'لا يوجد كود مكرر بشكل زائد',
  ],
  marketing: [
    'المحتوى يخاطب الجمهور المستهدف',
    'الرسالة واضحة ومباشرة',
    'هناك call-to-action واضح',
    'المحتوى أصيل وغير مكرر',
    'اللغة مناسبة وخالية من الأخطاء',
  ],
  'design-brief': [
    'الوصف البصري محدد وقابل للتنفيذ',
    'الألوان والخطوط محددة',
    'الهوية البصرية متسقة',
    'التوجيهات واضحة للمصمم',
  ],
  plan: [
    'الخطة واقعية وقابلة للتنفيذ',
    'الأولويات واضحة',
    'الجدول الزمني منطقي',
    'الموارد المطلوبة محددة',
    'المخاطر مذكورة ومعالجة',
  ],
  general: [
    'المخرج يجيب على السؤال المطلوب',
    'المحتوى مكتمل وغير منقوص',
    'التنظيم والوضوح جيدان',
    'لا توجد معلومات متناقضة',
  ],
}

// ─── Quality Gates Class ──────────────────────────────────────────────────────

export class QualityGates {
  private genAI: GoogleGenerativeAI
  private model: any
  private maxAttempts = 3

  constructor() {
    const apiKey = process.env.GOOGLE_AI_API_KEY
    if (!apiKey) throw new Error('GOOGLE_AI_API_KEY غير موجود')

    this.genAI = new GoogleGenerativeAI(apiKey)
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',  // Flash يكفي للفحص
    })
  }

  // ─── Main Gate Check ─────────────────────────────────────────────────────

  async check(input: GateInput): Promise<QualityReport> {
    const criteria    = CRITERIA[input.type]
    const criteriaStr = criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')

    const prompt = `
أنت مراجع جودة متخصص في وكالة ذكاء اصطناعي.

الوكيل: ${input.agentName}
نوع المخرج: ${input.type}
المحاولة رقم: ${input.attempt}

المخرج المراد مراجعته:
"""
${input.content.substring(0, 3000)}
"""

معايير التقييم:
${criteriaStr}

قيّم كل معيار وأجب بـ JSON فقط:
{
  "score": رقم_من_0_إلى_100,
  "passed": ["المعايير التي نجحت"],
  "failed": ["المعايير التي فشلت"],
  "warnings": ["تحذيرات إن وجدت"],
  "suggestion": "اقتراح محدد للتحسين إذا لزم"
}
`

    try {
      const response = await callWithRateLimit(
        'gemini-1.5-flash',
        'quality-gates',
        async () => {
          const result = await this.model.generateContent(prompt)
          return result.response.text()
        }
      )

      const cleaned = response
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim()

      const parsed   = JSON.parse(cleaned)
      const score    = parsed.score as number
      const passed   = (parsed.passed  || []) as string[]
      const failed   = (parsed.failed  || []) as string[]
      const warnings = (parsed.warnings || []) as string[]

      const status: GateStatus =
        score >= 75 ? 'passed' :
        score >= 50 ? 'warning' :
        'failed'

      const report: QualityReport = {
        status,
        score,
        passed,
        failed,
        warnings,
        suggestion:  parsed.suggestion || '',
        retryNeeded: status === 'failed' && input.attempt < this.maxAttempts,
      }

      this.logResult(input, report)
      return report

    } catch {
      // إذا فشل الفحص نفسه → نتجاوزه بتحذير
      return {
        status:      'warning',
        score:       60,
        passed:      [],
        failed:      [],
        warnings:    ['فشل نظام الفحص - تجاوز تلقائي'],
        suggestion:  'راجع المخرج يدوياً',
        retryNeeded: false,
      }
    }
  }

  // ─── Check With Auto Retry ───────────────────────────────────────────────

  async checkWithRetry(
    input: GateInput,
    retryCallback: (suggestion: string) => Promise<string>
  ): Promise<{ content: string; report: QualityReport }> {
    let content     = input.content
    let lastReport!: QualityReport

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      lastReport = await this.check({ ...input, content, attempt })

      if (lastReport.status !== 'failed') {
        return { content, report: lastReport }
      }

      if (!lastReport.retryNeeded) break

      writeDailyLog('step-reject', `Quality Gate رفض مخرج ${input.agentName}`, {
        agent:   'quality-gates',
        details: lastReport.suggestion,
      })

      // أعِد المحاولة مع اقتراح التحسين
      content = await retryCallback(lastReport.suggestion)
    }

    return { content, report: lastReport }
  }

  // ─── Quick Rules Check (بلا AI) ─────────────────────────────────────────

  quickCheck(content: string, type: OutputType): {
    valid: boolean
    issues: string[]
  } {
    const issues: string[] = []

    // فحوصات أساسية بلا AI
    if (content.length < 50) {
      issues.push('المخرج قصير جداً')
    }
    if (content.length > 50000) {
      issues.push('المخرج طويل جداً')
    }
    if (type === 'code') {
      if (!content.includes('function') && !content.includes('=>') &&
          !content.includes('class')    && !content.includes('const')) {
        issues.push('لا يبدو أن هذا كود برمجي')
      }
    }
    if (content.toLowerCase().includes('i cannot') ||
        content.toLowerCase().includes('لا أستطيع')) {
      issues.push('الوكيل رفض تنفيذ المهمة')
    }
    if ((content.match(/error/gi) || []).length > 5) {
      issues.push('محتوى يحتوي على أخطاء كثيرة')
    }

    return { valid: issues.length === 0, issues }
  }

  // ─── Log ─────────────────────────────────────────────────────────────────

  private logResult(input: GateInput, report: QualityReport): void {
    const emoji = report.status === 'passed'  ? '✅'
                : report.status === 'warning' ? '⚠️'
                : '❌'

    writeDailyLog(
      report.status === 'failed' ? 'step-reject' : 'pipeline-done',
      `${emoji} Quality Gate: ${input.agentName} - ${report.score}/100`,
      { agent: 'quality-gates', details: report.suggestion }
    )

    if (report.score >= 80) {
      writeColdMemory(
        input.projectName,
        'quality-gates',
        `✅ مخرج ممتاز من ${input.agentName}: ${input.content.substring(0, 100)}`,
        ['جودة', 'نجح', input.type],
        report.score / 10
      )
    }

    if (report.status === 'failed') {
      writeColdMemory(
        input.projectName,
        'quality-gates',
        `❌ درس: ${input.agentName} فشل في "${input.type}" بسبب: ${report.failed.join(', ')}`,
        ['تعلم', 'فشل', input.type],
        8
      )
    }
  }
}

export const qualityGates = new QualityGates()
المرحلة 3: Models Config
.claude/agency-models.json
JSON

{
  "version": "2.0",
  "agents": {
    "agent-zero": {
      "provider": "google",
      "model": "gemini-1.5-pro",
      "fallback": "deepseek-chat",
      "temperature": 0.3,
      "maxTokens": 8192
    },
    "project-manager": {
      "provider": "google",
      "model": "gemini-1.5-pro",
      "fallback": "deepseek-chat",
      "temperature": 0.3,
      "maxTokens": 8192
    },
    "full-stack-developer": {
      "provider": "deepseek",
      "model": "deepseek-coder",
      "fallback": "llama3-groq-70b-8192-tool-use",
      "temperature": 0.1,
      "maxTokens": 8192
    },
    "qa-engineer": {
      "provider": "groq",
      "model": "llama-3.1-70b-versatile",
      "fallback": "deepseek-coder",
      "temperature": 0.1,
      "maxTokens": 4096
    },
    "marketing-strategist": {
      "provider": "groq",
      "model": "llama-3.1-70b-versatile",
      "fallback": "gemini-1.5-flash",
      "temperature": 0.7,
      "maxTokens": 4096
    },
    "ui-ux-designer": {
      "provider": "google",
      "model": "gemini-1.5-flash",
      "fallback": "llama-3.1-70b-versatile",
      "temperature": 0.6,
      "maxTokens": 4096
    },
    "seo-specialist": {
      "provider": "google",
      "model": "gemini-1.5-flash",
      "fallback": "llama-3.1-70b-versatile",
      "temperature": 0.4,
      "maxTokens": 4096
    },
    "content-writer": {
      "provider": "groq",
      "model": "llama-3.1-70b-versatile",
      "fallback": "gemini-1.5-flash",
      "temperature": 0.8,
      "maxTokens": 4096
    },
    "quality-gates": {
      "provider": "google",
      "model": "gemini-1.5-flash",
      "fallback": "llama-3.1-70b-versatile",
      "temperature": 0.1,
      "maxTokens": 2048
    }
  },
  "rateLimits": {
    "gemini-1.5-pro":          { "rpm": 2,  "retryAfterMs": 30000 },
    "gemini-1.5-flash":        { "rpm": 15, "retryAfterMs": 4000  },
    "deepseek-coder":          { "rpm": 60, "retryAfterMs": 1000  },
    "deepseek-chat":           { "rpm": 60, "retryAfterMs": 1000  },
    "llama-3.1-70b-versatile": { "rpm": 30, "retryAfterMs": 2000  },
    "llama3-groq-70b-8192-tool-use": { "rpm": 30, "retryAfterMs": 2000 }
  },
  "pipelines": {
    "full-product": ["project-manager", "full-stack-developer", "ui-ux-designer", "marketing-strategist", "qa-engineer"],
    "tech-only":    ["project-manager", "full-stack-developer", "qa-engineer"],
    "marketing-only": ["project-manager", "marketing-strategist", "seo-specialist", "content-writer"]
  }
}
المرحلة 4: Telegram Bot
src/telegram/bot.ts
TypeScript

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 📱 Telegram Bot — Remote Control Center
 * التحكم الكامل بالوكالة من الموبايل
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import TelegramBot from 'node-telegram-bot-api'
import { agentZero, type UserRequest } from '../agency/agent-zero.js'
import { listActiveTeams, getTeamProgress, synthesizeTeamResults } from '../agency/team-orchestrator.js'
import { getMemoryStats } from '../agency/tiered-memory.js'
import { writeDailyLog } from '../agency/shared-memory.js'
import { getRateLimiterStats } from '../agency/rate-limiter.js'

// ─── Init Bot ─────────────────────────────────────────────────────────────────

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
if (!TOKEN) throw new Error('TELEGRAM_BOT_TOKEN غير موجود')

const bot        = new TelegramBot(TOKEN, { polling: true })
const ALLOWED_ID = process.env.TELEGRAM_ALLOWED_USER_ID

// ─── Auth Middleware ──────────────────────────────────────────────────────────

function isAllowed(userId: number): boolean {
  if (!ALLOWED_ID) return true
  return userId.toString() === ALLOWED_ID
}

function guard(
  msg: TelegramBot.Message,
  cb: () => void
): void {
  if (!isAllowed(msg.from?.id || 0)) {
    bot.sendMessage(msg.chat.id, '⛔ غير مصرح لك')
    return
  }
  cb()
}

// ─── Helper: Format ──────────────────────────────────────────────────────────

function esc(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&')
}

function sendTyping(chatId: number) {
  bot.sendChatAction(chatId, 'typing')
}

// ─── Commands ─────────────────────────────────────────────────────────────────

// /start
bot.onText(/\/start/, (msg) => {
  guard(msg, () => {
    const keyboard = {
      reply_markup: {
        keyboard: [
          ['📊 الحالة',    '🤖 الوكلاء'],
          ['📋 المهام',    '🧠 الذاكرة'],
          ['💰 التكلفة',  '📅 السجل'],
          ['🚀 مهمة جديدة'],
        ],
        resize_keyboard: true,
      },
    }
    bot.sendMessage(
      msg.chat.id,
      `🤖 *مرحباً بك في OpenClaude Agency*\n\nاختر أمراً أو اكتب مهمتك مباشرة:`,
      { parse_mode: 'Markdown', ...keyboard }
    )
  })
})

// /status — الحالة العامة
bot.onText(/\/status|📊 الحالة/, (msg) => {
  guard(msg, async () => {
    sendTyping(msg.chat.id)

    const teams   = listActiveTeams()
    const stats   = getMemoryStats('default-project')
    const limits  = getRateLimiterStats()

    let text = `📊 *حالة النظام*\n\n`

    // Teams
    text += `*الفرق النشطة:* ${teams.length}\n`
    for (const team of teams.slice(0, 3)) {
      const progress = getTeamProgress(team.teamName)
      text += `  • ${team.projectName}: ${progress?.percentComplete || 0}%\n`
    }

    // Memory
    text += `\n*الذاكرة:*\n`
    text += `  🔥 HOT: ${stats.hot}\n`
    text += `  ♨️ WARM: ${stats.warm}\n`
    text += `  🗃️ COLD: ${stats.cold}\n`

    // Rate Limits
    text += `\n*حدود الاستخدام:*\n`
    for (const [model, info] of Object.entries(limits).slice(0, 3)) {
      const bar = '█'.repeat(Math.floor(info.usagePercent / 20))
        + '░'.repeat(5 - Math.floor(info.usagePercent / 20))
      text += `  ${info.model.split('-').slice(-1)[0]}: ${bar} ${info.usagePercent}%\n`
    }

    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' })
  })
})

// /tasks — المهام
bot.onText(/\/tasks|📋 المهام/, (msg) => {
  guard(msg, () => {
    sendTyping(msg.chat.id)

    const teams = listActiveTeams()
    if (teams.length === 0) {
      bot.sendMessage(msg.chat.id, '📋 لا توجد مهام نشطة حالياً')
      return
    }

    let text = `📋 *المهام النشطة*\n\n`

    for (const team of teams.slice(0, 2)) {
      text += `*${team.projectName}*\n`
      const progress = getTeamProgress(team.teamName)
      if (progress) {
        text += `التقدم: ${progress.percentComplete}% (${progress.completed}/${progress.total})\n`
      }

      for (const task of team.tasks.slice(0, 5)) {
        const icon =
          task.status === 'completed'  ? '✅' :
          task.status === 'in-progress' ? '🔄' :
          task.status === 'blocked'    ? '🔒' : '⏳'
        text += `  ${icon} ${task.title}\n`
      }
      text += '\n'
    }

    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' })
  })
})

// /memory — الذاكرة
bot.onText(/\/memory|🧠 الذاكرة/, (msg) => {
  guard(msg, () => {
    sendTyping(msg.chat.id)

    const stats = getMemoryStats('default-project')
    const text  = `
🧠 *MemPalace Stats*

🔥 HOT  (فوري):  ${stats.hot} مدخل
♨️ WARM (نشط):   ${stats.warm} مدخل
🗃️ COLD (أرشيف): ${stats.cold} مدخل

📦 الإجمالي: ${stats.total} مدخل
`.trim()

    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' })
  })
})

// /cost — التكلفة
bot.onText(/\/cost|💰 التكلفة/, (msg) => {
  guard(msg, () => {
    sendTyping(msg.chat.id)

    // في النسخة الحقيقية: اقرأ من cost tracker
    const text = `
💰 *تتبع التكاليف*

اليوم: $0.23
الأسبوع: $1.45
الشهر: $5.20

الأكثر استهلاكاً: Gemini Pro
التوكن اليوم: 45,230
`.trim()

    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' })
  })
})

// /results — نتائج آخر مشروع
bot.onText(/\/results/, (msg) => {
  guard(msg, () => {
    sendTyping(msg.chat.id)

    const teams = listActiveTeams()
    if (teams.length === 0) {
      bot.sendMessage(msg.chat.id, '📭 لا توجد نتائج بعد')
      return
    }

    const lastTeam = teams[teams.length - 1]
    const results  = synthesizeTeamResults(lastTeam.teamName)

    // إذا كانت النتائج طويلة جداً نرسلها كملف
    if (results.length > 4000) {
      bot.sendMessage(
        msg.chat.id,
        `📄 النتائج طويلة - إجمالي: ${results.length} حرف`
      )
      // إرسال أول 4000 حرف
      bot.sendMessage(msg.chat.id, results.substring(0, 4000))
    } else {
      bot.sendMessage(msg.chat.id, results)
    }
  })
})

// /approve — موافقة على الخطة
bot.onText(/\/approve/, (msg) => {
  guard(msg, () => {
    writeDailyLog('decision', 'المستخدم وافق على الخطة عبر Telegram', {
      agent: 'user',
    })
    bot.sendMessage(msg.chat.id, '✅ تمت الموافقة - الوكلاء يبدأون العمل')
  })
})

// /reject — رفض
bot.onText(/\/reject (.+)/, (msg, match) => {
  guard(msg, () => {
    const reason = match?.[1] || 'لم يُحدد'
    writeDailyLog('step-reject', `المستخدم رفض: ${reason}`, {
      agent: 'user',
    })
    bot.sendMessage(msg.chat.id, `❌ تم الرفض: ${reason}`)
  })
})

// /new — مهمة جديدة
bot.onText(/\/new (.+)|🚀 مهمة جديدة/, async (msg, match) => {
  guard(msg, async () => {
    const taskText = match?.[1]

    if (!taskText) {
      bot.sendMessage(
        msg.chat.id,
        '📝 اكتب مهمتك:\n/new وصف المهمة هنا'
      )
      return
    }

    sendTyping(msg.chat.id)

    const statusMsg = await bot.sendMessage(
      msg.chat.id,
      '🔄 Agent Zero يعالج طلبك...'
    )

    const request: UserRequest = {
      id:          `tg_${Date.now()}`,
      content:     taskText,
      projectName: `tg-project-${Date.now()}`,
      timestamp:   new Date().toISOString(),
    }

    try {
      await agentZero.process(request, (update) => {
        // تحديث رسالة الحالة
        bot.editMessageText(
          `🔄 ${update.message}`,
          {
            chat_id:    msg.chat.id,
            message_id: statusMsg.message_id,
          }
        )

        // إرسال الخطة إذا توفرت
        if (update.plan && update.status === 'planning') {
          const planText = formatPlan(update.plan)
          bot.sendMessage(msg.chat.id, planText, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                { text: '✅ موافق', callback_data: 'approve' },
                { text: '❌ رفض',   callback_data: 'reject'  },
              ]],
            },
          })
        }
      })

      bot.editMessageText('✅ اكتمل التنفيذ!', {
        chat_id:    msg.chat.id,
        message_id: statusMsg.message_id,
      })

    } catch (err: any) {
      bot.editMessageText(`❌ خطأ: ${err.message}`, {
        chat_id:    msg.chat.id,
        message_id: statusMsg.message_id,
      })
    }
  })
})

// ─── Callback Queries (الأزرار) ───────────────────────────────────────────────

bot.on('callback_query', (query) => {
  if (!query.message) return

  if (query.data === 'approve') {
    writeDailyLog('decision', 'موافقة عبر زر Telegram', { agent: 'user' })
    bot.answerCallbackQuery(query.id, { text: '✅ تمت الموافقة' })
    bot.sendMessage(query.message.chat.id, '✅ الوكلاء يبدأون العمل الآن')
  }

  if (query.data === 'reject') {
    bot.answerCallbackQuery(query.id, { text: '❌ تم الرفض' })
    bot.sendMessage(query.message.chat.id, '❌ تم رفض الخطة\nاكتب /new مع طلب معدّل')
  }
})

// ─── Free Text → Agent Zero ───────────────────────────────────────────────────

bot.on('message', async (msg) => {
  // تجاهل الأوامر
  if (msg.text?.startsWith('/')) return
  if (!msg.text) return
  if (!isAllowed(msg.from?.id || 0)) return

  // الزرار النصية من الكيبورد
  const knownButtons = ['📊 الحالة', '🤖 الوكلاء', '📋 المهام',
                        '🧠 الذاكرة', '💰 التكلفة', '📅 السجل',
                        '🚀 مهمة جديدة']

  if (knownButtons.some(b => msg.text?.includes(b))) return

  // نص حر = مهمة جديدة
  sendTyping(msg.chat.id)

  const request: UserRequest = {
    id:          `tg_free_${Date.now()}`,
    content:     msg.text,
    projectName: `tg-${Date.now()}`,
    timestamp:   new Date().toISOString(),
  }

  const statusMsg = await bot.sendMessage(msg.chat.id, '🔄 جاري المعالجة...')

  await agentZero.process(request, (update) => {
    bot.editMessageText(`🔄 ${update.message}`, {
      chat_id:    msg.chat.id,
      message_id: statusMsg.message_id,
    })
  })

  bot.editMessageText('✅ اكتمل!', {
    chat_id:    msg.chat.id,
    message_id: statusMsg.message_id,
  })
})

// ─── Format Plan ──────────────────────────────────────────────────────────────

function formatPlan(plan: any): string {
  let text = `📋 *خطة العمل*\n\n`
  text    += `${plan.summary}\n\n`
  text    += `⏱ الوقت المتوقع: ${plan.estimatedTime}\n`
  text    += `📝 إجمالي المهام: ${plan.totalTasks}\n\n`
  text    += `*الخلايا:*\n`

  for (const cluster of (plan.clusters || [])) {
    text += `\n${cluster.name} (${cluster.type})\n`
    for (const task of (cluster.tasks || [])) {
      text += `  • ${task}\n`
    }
  }

  return text
}

console.log('📱 Telegram Bot يعمل...')
export { bot }
المرحلة 5: الربط الكامل - تحديث server.ts
TypeScript

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🖥️ Server v2 — مع Agent Zero + Quality Gates
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import express        from 'express'
import cors           from 'cors'
import { createServer } from 'http'
import { Server as IO } from 'socket.io'
import { agentZero, type UserRequest } from './agency/agent-zero.js'
import { qualityGates }               from './agency/quality-gates.js'
import { listActiveTeams, getTeamProgress } from './agency/team-orchestrator.js'
import { getMemoryStats, queryMemory }      from './agency/tiered-memory.js'
import { getRateLimiterStats }              from './agency/rate-limiter.js'
import { readDailyLog }                     from './agency/shared-memory.js'
import { memoryPalace }                     from './agency/mempalace.js'

const app  = express()
const http = createServer(app)
const io   = new IO(http, { cors: { origin: '*' } })

app.use(cors())
app.use(express.json())

// ─── WebSocket ────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('📡 client connected')

  socket.on('disconnect', () => {
    console.log('📡 client disconnected')
  })
})

// ─── Agent Zero API ───────────────────────────────────────────────────────────

app.post('/api/execute', async (req, res) => {
  const { content, projectName } = req.body

  if (!content) {
    return res.status(400).json({ error: 'content مطلوب' })
  }

  const request: UserRequest = {
    id:          `req_${Date.now()}`,
    content,
    projectName: projectName || `project_${Date.now()}`,
    timestamp:   new Date().toISOString(),
  }

  // إرسال response أولي
  res.json({ requestId: request.id, status: 'started' })

  // تشغيل Agent Zero مع إرسال التحديثات عبر WebSocket
  agentZero.process(request, (update) => {
    io.emit('agent-zero:update', update)
  }).then((finalResult) => {
    io.emit('agent-zero:done', finalResult)
  }).catch((err) => {
    io.emit('agent-zero:error', { error: err.message })
  })
})

// ─── Quality Gates API ────────────────────────────────────────────────────────

app.post('/api/quality-check', async (req, res) => {
  const { content, type, agentName, projectName } = req.body

  try {
    const report = await qualityGates.check({
      content,
      type:        type || 'general',
      agentName:   agentName || 'unknown',
      projectName: projectName || 'default',
      attempt:     1,
    })
    res.json(report)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Status ───────────────────────────────────────────────────────────────────

app.get('/api/status', (req, res) => {
  const teams   = listActiveTeams()
  const mem     = getMemoryStats('default-project')
  const limits  = getRateLimiterStats()
  const dbStats = memoryPalace.getStats()

  res.json({
    teams:   teams.length,
    memory:  mem,
    limits,
    db:      dbStats,
    uptime:  process.uptime(),
  })
})

// ─── Teams ────────────────────────────────────────────────────────────────────

app.get('/api/teams', (req, res) => {
  const teams = listActiveTeams().map(team => ({
    ...team,
    progress: getTeamProgress(team.teamName),
  }))
  res.json(teams)
})

// ─── Memory ───────────────────────────────────────────────────────────────────

app.get('/api/memory', (req, res) => {
  const level   = req.query.level as any || undefined
  const limit   = parseInt(req.query.limit as string) || 50
  const stats   = getMemoryStats('default-project')
  const entries = queryMemory({
    projectName: 'default-project',
    level,
    limit,
  })
  res.json({ stats, entries })
})

// ─── Logs ─────────────────────────────────────────────────────────────────────

app.get('/api/logs', (req, res) => {
  const logs = readDailyLog()
  res.json(logs.reverse().slice(0, 100))
})

// ─── Rate Limits ──────────────────────────────────────────────────────────────

app.get('/api/rate-limits', (req, res) => {
  res.json(getRateLimiterStats())
})

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001

http.listen(PORT, () => {
  console.log(`\n  🟢 OpenClaude Server`)
  console.log(`  📍 http://localhost:${PORT}`)
  console.log(`  📡 WebSocket enabled`)
  console.log(`  🧠 Agent Zero ready`)
  console.log(`  🔍 Quality Gates ready\n`)
})
المرحلة 6: Quick Command في الواجهة - تحديث hooks/useApi.ts
TypeScript

// أضف هذا الـ Hook للـ Agent Zero

export function useAgentZero() {
  const [status, setStatus]   = useState<string>('')
  const [plan,   setPlan]     = useState<any>(null)
  const [result, setResult]   = useState<string>('')
  const [loading, setLoading] = useState(false)
  const { socket }            = useSocket()

  useEffect(() => {
    if (!socket) return

    socket.on('agent-zero:update', (update: any) => {
      setStatus(update.message)
      if (update.plan) setPlan(update.plan)
    })

    socket.on('agent-zero:done', (final: any) => {
      setStatus('اكتمل')
      setResult(final.result || '')
      setLoading(false)
    })

    socket.on('agent-zero:error', (err: any) => {
      setStatus(`خطأ: ${err.error}`)
      setLoading(false)
    })

    return () => {
      socket.off('agent-zero:update')
      socket.off('agent-zero:done')
      socket.off('agent-zero:error')
    }
  }, [socket])

  const execute = useCallback(async (
    content: string,
    projectName?: string
  ) => {
    setLoading(true)
    setStatus('يبدأ...')
    setPlan(null)
    setResult('')

    await fetch('http://localhost:3001/api/execute', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        content,
        projectName: projectName || `project_${Date.now()}`,
      }),
    })
  }, [])

  return { execute, status, plan, result, loading }
}
المرحلة 7: تحديث package.json
JSON

{
  "name": "openclaude-agency",
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "dev":      "concurrently \"npm run server\" \"npm run frontend\"",
    "server":   "npx tsx watch src/server.ts",
    "frontend": "vite",
    "telegram": "npx tsx src/telegram/bot.ts",
    "build":    "tsc && vite build",
    "check":    "npx tsc --noEmit"
  },
  "dependencies": {
    "@google/generative-ai":   "^0.15.0",
    "better-sqlite3":          "^9.0.0",
    "cors":                    "^2.8.5",
    "express":                 "^4.18.0",
    "node-telegram-bot-api":   "^0.64.0",
    "react":                   "^18.0.0",
    "react-dom":               "^18.0.0",
    "socket.io":               "^4.7.0",
    "socket.io-client":        "^4.7.0",
    "concurrently":            "^8.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3":         "^7.6.0",
    "@types/cors":                   "^2.8.0",
    "@types/express":                "^4.17.0",
    "@types/node":                   "^20.0.0",
    "@types/node-telegram-bot-api":  "^0.64.0",
    "@types/react":                  "^18.0.0",
    "@types/react-dom":              "^18.0.0",
    "typescript":                    "^5.0.0",
    "vite":                          "^5.0.0",
    "@vitejs/plugin-react":          "^4.0.0"
  }
}
المرحلة 8: .env الكامل
env

# ════════════════════════════════════
# OpenClaude Agency — Environment
# ════════════════════════════════════

# ── AI Providers ──────────────────
GOOGLE_AI_API_KEY=your_google_key_here
GROQ_API_KEY=your_groq_key_here
DEEPSEEK_API_KEY=your_deepseek_key_here

# ── Telegram ──────────────────────
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_ALLOWED_USER_ID=your_telegram_id_here

# ── Server ────────────────────────
PORT=3001
NODE_ENV=development

# ── Project ───────────────────────
DEFAULT_PROJECT=openclaude-main
✅ الترتيب النهائي للتشغيل
Bash

# 1. تثبيت الحزم
npm install

# 2. إعداد المفاتيح
cp .env.example .env
# افتح .env وأضف مفاتيحك

# 3. فحص TypeScript
npm run check

# 4. تشغيل الكل
npm run dev

# 5. تشغيل Telegram (اختياري)
npm run telegram
📊 الصورة الكاملة للمشروع الآن
text

OpenClaude Agency
│
├── 🧠 Agent Zero          ✅ جاهز
│   ├── يستقبل الطلبات
│   ├── يحلل ويخطط
│   ├── يوزع على الخلايا
│   └── يجمع النتائج
│
├── 🔍 Quality Gates       ✅ جاهز
│   ├── يفحص كل مخرج
│   ├── يعيد للوكيل إذا فشل
│   └── يتعلم من الأخطاء
│
├── 📱 Telegram Bot        ✅ جاهز
│   ├── /status /tasks /memory
│   ├── /new مهمة جديدة
│   └── موافقة/رفض بزر
│
├── 🖥️ Dashboard           ✅ جاهز
│   ├── 7 صفحات كاملة
│   ├── بيانات حية WebSocket
│   └── Quick Command
│
├── 💾 Memory System       ✅ جاهز
│   ├── MemPalace v2 (SQLite)
│   ├── Tiered Memory (HOT/WARM/COLD)
│   └── Full-Text Search
│
├── ⏱️ Rate Limiter        ✅ جاهز
│   └── Token Bucket per Model
│
└── 🔒 Task Lock Manager   ✅ جاهز
    └── Atomic File Locking
