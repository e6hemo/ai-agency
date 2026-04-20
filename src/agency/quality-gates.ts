/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔍 Quality Gates Engine
 * يفحص كل مخرج قبل تسليمه — نجح يمر، فشل يعود
 *
 * يتكامل مع:
 * - rate-limiter: لاحترام حدود الاستخدام عند الفحص
 * - shared-memory: لتسجيل نتائج الفحص في السجل اليومي
 * - tiered-memory: لحفظ الدروس المستفادة في الذاكرة الباردة
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { callWithRateLimit } from './rate-limiter.js'
import { writeDailyLog } from './shared-memory.js'
import { writeColdMemory } from './tiered-memory.js'

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
  private maxAttempts = 3

  constructor() {
    // No AI model initialization needed — we use callWithRateLimit
    // which handles the model calls through the existing infrastructure
  }

  // ─── Main Gate Check ─────────────────────────────────────────────────────

  async check(input: GateInput): Promise<QualityReport> {
    // Step 1: Quick rules-based check first (free, no API call)
    const quickResult = this.quickCheck(input.content, input.type)
    if (!quickResult.valid) {
      const report: QualityReport = {
        status:      'failed',
        score:       20,
        passed:      [],
        failed:      quickResult.issues,
        warnings:    [],
        suggestion:  `أصلح المشاكل التالية: ${quickResult.issues.join(', ')}`,
        retryNeeded: input.attempt < this.maxAttempts,
      }
      this.logResult(input, report)
      return report
    }

    // Step 2: AI-powered deep check
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
          // Dynamic import to avoid hard dependency on @google/generative-ai
          // In production, this would use the configured model provider
          const { GoogleGenerativeAI } = await import('@google/generative-ai')
          const apiKey = process.env.GOOGLE_AI_API_KEY
          if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not found')

          const genAI  = new GoogleGenerativeAI(apiKey)
          const model  = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
          const result = await model.generateContent(prompt)
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
      // إذا فشل الفحص نفسه → fallback to rules-based scoring
      return this.buildFallbackReport(input)
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
      issues.push('المخرج قصير جداً (أقل من 50 حرف)')
    }
    if (content.length > 50000) {
      issues.push('المخرج طويل جداً (أكثر من 50,000 حرف)')
    }
    if (type === 'code') {
      if (!content.includes('function') && !content.includes('=>') &&
          !content.includes('class')    && !content.includes('const') &&
          !content.includes('def ')     && !content.includes('import')) {
        issues.push('لا يبدو أن هذا كود برمجي')
      }
    }
    if (content.toLowerCase().includes('i cannot') ||
        content.toLowerCase().includes('i can\'t') ||
        content.toLowerCase().includes('لا أستطيع') ||
        content.toLowerCase().includes('لا يمكنني')) {
      issues.push('الوكيل رفض تنفيذ المهمة')
    }
    if ((content.match(/error/gi) || []).length > 5) {
      issues.push('المحتوى يحتوي على أخطاء كثيرة')
    }

    // Content-specific checks
    if (type === 'marketing' && content.length < 100) {
      issues.push('المحتوى التسويقي قصير جداً')
    }
    if (type === 'plan' && !content.includes('1') && !content.includes('أولاً')) {
      issues.push('الخطة لا تحتوي على خطوات مرقمة')
    }

    return { valid: issues.length === 0, issues }
  }

  // ─── Fallback Report ────────────────────────────────────────────────────

  private buildFallbackReport(input: GateInput): QualityReport {
    const quickResult = this.quickCheck(input.content, input.type)
    const score = quickResult.valid ? 65 : 30

    return {
      status:      quickResult.valid ? 'warning' : 'failed',
      score,
      passed:      quickResult.valid ? ['الفحص الأساسي نجح'] : [],
      failed:      quickResult.issues,
      warnings:    ['فشل نظام الفحص الذكي — تم استخدام الفحص الأساسي'],
      suggestion:  quickResult.valid ? 'راجع المخرج يدوياً' : quickResult.issues.join(', '),
      retryNeeded: !quickResult.valid && input.attempt < this.maxAttempts,
    }
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

    // حفظ المخرجات الممتازة كدروس في الذاكرة الباردة
    if (report.score >= 80) {
      writeColdMemory(
        input.projectName,
        'quality-gates',
        `✅ مخرج ممتاز من ${input.agentName}: ${input.content.substring(0, 100)}`,
        ['جودة', 'نجح', input.type],
        report.score / 10
      )
    }

    // حفظ الإخفاقات كدروس مستفادة
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

// ─── Singleton ────────────────────────────────────────────────────────────────

let _instance: QualityGates | null = null

export function getQualityGates(): QualityGates {
  if (!_instance) {
    _instance = new QualityGates()
  }
  return _instance
}

export const qualityGates = new QualityGates()
