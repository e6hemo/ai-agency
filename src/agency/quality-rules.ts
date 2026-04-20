/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🛡️ Quality Rules Engine
 *
 * محرك قواعد قابل للتخصيص يفحص مخرجات الوكلاء قبل اعتبارها مكتملة.
 * كل قاعدة لها: نوع، شدة، شرط فحص، ورسالة خطأ.
 *
 * يتكامل مع team-hooks.ts لتطبيق الفحوصات تلقائياً.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type RuleCategory = 'code' | 'content' | 'plan' | 'general'
export type RuleSeverity = 'error' | 'warning' | 'suggestion'

export interface QualityRule {
  id: string
  name: string
  category: RuleCategory
  severity: RuleSeverity
  /** وصف مختصر للقاعدة */
  description: string
  /** الأقسام التي تنطبق عليها هذه القاعدة (فارغة = الكل) */
  appliesTo: string[]
  /** دالة الفحص — ترجع true إذا نجح الفحص */
  check: (output: string, context: RuleContext) => boolean
  /** رسالة الخطأ عند الفشل */
  failMessage: string
  /** اقتراح للإصلاح */
  fixSuggestion: string
}

export interface RuleContext {
  agentName: string
  department: string
  taskTitle: string
  taskDescription: string
}

export interface QualityReport {
  passed: boolean
  score: number          // 0-100
  totalRules: number
  passedRules: number
  failedRules: number
  warnings: number
  results: RuleResult[]
  summary: string
}

export interface RuleResult {
  ruleId: string
  ruleName: string
  passed: boolean
  severity: RuleSeverity
  message: string
  suggestion?: string
}

// ─── Built-in Rules ──────────────────────────────────────────────────────────

const QUALITY_RULES: QualityRule[] = [
  // ─── General Rules (apply to all) ──────────────────────────────
  {
    id: 'gen-001',
    name: 'المخرج غير فارغ',
    category: 'general',
    severity: 'error',
    description: 'المخرج يجب أن يحتوي على محتوى ذي معنى',
    appliesTo: [],
    check: (output) => output.trim().length >= 50,
    failMessage: 'المخرج فارغ أو قصير جداً (أقل من 50 حرف)',
    fixSuggestion: 'قدّم مخرجات مفصلة تشرح العمل المنجز والنتائج.',
  },
  {
    id: 'gen-002',
    name: 'لا نسخ ولصق من الطلب',
    category: 'general',
    severity: 'warning',
    description: 'المخرج لا يجب أن يكون مجرد إعادة صياغة للطلب',
    appliesTo: [],
    check: (output, ctx) => {
      const taskWords = ctx.taskDescription.toLowerCase().split(/\s+/).filter(w => w.length > 4)
      if (taskWords.length === 0) return true
      const outputLower = output.toLowerCase()
      const matchCount = taskWords.filter(word => outputLower.includes(word)).length
      const matchRatio = matchCount / taskWords.length
      return matchRatio < 0.8 // أقل من 80% تطابق
    },
    failMessage: 'المخرج يبدو كنسخة من الطلب الأصلي — لم يتم إنجاز عمل فعلي',
    fixSuggestion: 'أضف تحليلاً أو تنفيذاً أو نتائج جديدة بدلاً من إعادة صياغة المطلوب.',
  },
  {
    id: 'gen-003',
    name: 'وجود هيكلة',
    category: 'general',
    severity: 'suggestion',
    description: 'المخرج يجب أن يكون منظماً بعناوين أو قوائم',
    appliesTo: [],
    check: (output) => {
      // Check for headers, bullets, or numbered lists
      const hasStructure = /^#{1,3}\s/m.test(output) ||
                          /^[-*]\s/m.test(output) ||
                          /^\d+[.)]\s/m.test(output)
      // Short outputs don't need structure
      return output.length < 200 || hasStructure
    },
    failMessage: 'المخرج طويل لكنه غير منظم — لا عناوين ولا قوائم',
    fixSuggestion: 'نظّم المخرجات باستخدام عناوين (##) وقوائم (-) لسهولة القراءة.',
  },

  // ─── Code Rules ────────────────────────────────────────────────
  {
    id: 'code-001',
    name: 'Error Handling',
    category: 'code',
    severity: 'error',
    description: 'الكود يجب أن يتضمن معالجة أخطاء',
    appliesTo: ['development'],
    check: (output) => {
      const hasCode = /```[\s\S]*?```/.test(output)
      if (!hasCode) return true // No code block = not applicable
      const hasAsync = /async\s/.test(output)
      if (!hasAsync) return true // No async = not required
      return /try\s*{/.test(output) || /\.catch\(/.test(output) || /catch\s*\(/.test(output)
    },
    failMessage: 'الكود يحتوي على async functions بدون error handling',
    fixSuggestion: 'أضف try/catch لكل async function أو استخدم .catch() للـ Promises.',
  },
  {
    id: 'code-002',
    name: 'لا any بدون تبرير',
    category: 'code',
    severity: 'warning',
    description: 'تجنب استخدام any في TypeScript',
    appliesTo: ['development'],
    check: (output) => {
      const hasCode = /```(?:typescript|ts)[\s\S]*?```/.test(output)
      if (!hasCode) return true
      const anyCount = (output.match(/:\s*any\b/g) || []).length
      return anyCount <= 2 // Allow max 2 any usages
    },
    failMessage: 'الكود يستخدم any كثيراً — يجب استخدام أنواع محددة',
    fixSuggestion: 'استبدل any بأنواع محددة (interfaces, generics, unknown).',
  },
  {
    id: 'code-003',
    name: 'لا أسرار في الكود',
    category: 'code',
    severity: 'error',
    description: 'لا تخزين مباشر لكلمات السر أو API keys',
    appliesTo: ['development'],
    check: (output) => {
      const secretPatterns = [
        /(?:password|secret|api_key|apikey|token)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
        /sk-[a-zA-Z0-9]{20,}/g,        // OpenAI-style keys
        /AIza[a-zA-Z0-9_-]{35}/g,      // Google API keys
      ]
      return !secretPatterns.some(p => p.test(output))
    },
    failMessage: '⚠️ تم اكتشاف ما يبدو أنه مفتاح API أو كلمة سر في الكود!',
    fixSuggestion: 'استخدم متغيرات البيئة (process.env.API_KEY) بدلاً من التخزين المباشر.',
  },
  {
    id: 'code-004',
    name: 'توثيق الدوال',
    category: 'code',
    severity: 'suggestion',
    description: 'الدوال العامة يجب أن تكون موثقة',
    appliesTo: ['development'],
    check: (output) => {
      const exportFunctions = (output.match(/export\s+(?:async\s+)?function\s+\w+/g) || []).length
      if (exportFunctions === 0) return true
      const jsdocComments = (output.match(/\/\*\*[\s\S]*?\*\//g) || []).length
      return jsdocComments >= exportFunctions * 0.5 // At least 50% documented
    },
    failMessage: 'أقل من نصف الدوال العامة موثقة بتعليقات JSDoc',
    fixSuggestion: 'أضف /** ... */ قبل كل export function لشرح الغرض والمدخلات.',
  },

  // ─── Content Rules ─────────────────────────────────────────────
  {
    id: 'content-001',
    name: 'عنوان جذاب',
    category: 'content',
    severity: 'warning',
    description: 'المحتوى يحتاج عنوان رئيسي',
    appliesTo: ['media', 'marketing'],
    check: (output) => {
      return /^#\s/m.test(output) || output.split('\n')[0]!.length <= 100
    },
    failMessage: 'لا يوجد عنوان رئيسي واضح في المحتوى',
    fixSuggestion: 'ابدأ بعنوان جذاب يلخص الرسالة الأساسية.',
  },
  {
    id: 'content-002',
    name: 'CTA واضح',
    category: 'content',
    severity: 'suggestion',
    description: 'المحتوى التسويقي يحتاج دعوة للعمل',
    appliesTo: ['marketing', 'media'],
    check: (output) => {
      const ctaPatterns = [
        /(?:اشترك|سجل|تواصل|ابدأ|جرب|حمّل|اطلب|تعرف|زُر|انضم)/i,
        /(?:sign up|subscribe|try|start|download|contact|learn more|get started|join)/i,
        /(?:cta|call to action)/i,
      ]
      return ctaPatterns.some(p => p.test(output))
    },
    failMessage: 'لا يوجد CTA (دعوة للعمل) في المحتوى',
    fixSuggestion: 'أضف CTA واضحة: "ابدأ الآن"، "سجل مجاناً"، "تواصل معنا".',
  },

  // ─── Plan Rules ────────────────────────────────────────────────
  {
    id: 'plan-001',
    name: 'مؤشرات نجاح',
    category: 'plan',
    severity: 'warning',
    description: 'الخطط يجب أن تتضمن مؤشرات نجاح قابلة للقياس',
    appliesTo: ['management', 'marketing'],
    check: (output) => {
      const metricPatterns = [
        /\d+%/,                       // percentages
        /\$[\d,.]+/,                  // dollar amounts
        /(?:kpi|مؤشر|هدف|target|metric|قياس|نسبة)/i,
        /(?:زيادة|تقليل|تحسين|رفع|خفض)\s+.*\d/i,
      ]
      return metricPatterns.some(p => p.test(output))
    },
    failMessage: 'الخطة لا تحتوي على مؤشرات نجاح قابلة للقياس',
    fixSuggestion: 'أضف KPIs واضحة: "زيادة الزيارات 30%"، "خفض التكلفة بـ $50".',
  },
  {
    id: 'plan-002',
    name: 'جدول زمني',
    category: 'plan',
    severity: 'suggestion',
    description: 'الخطط يجب أن تتضمن تقدير زمني',
    appliesTo: ['management'],
    check: (output) => {
      const timePatterns = [
        /(?:يوم|أسبوع|شهر|ساعة|دقيقة)/i,
        /(?:day|week|month|hour|sprint)/i,
        /(?:deadline|موعد|تاريخ|timeline)/i,
        /\d+\s*(?:d|w|h|m)\b/i,
      ]
      return timePatterns.some(p => p.test(output))
    },
    failMessage: 'الخطة لا تحتوي على تقدير زمني',
    fixSuggestion: 'أضف جدول زمني: "المرحلة 1: أسبوع واحد"، "الموعد النهائي: ...".',
  },
]

// ─── Rule Engine ──────────────────────────────────────────────────────────────

/**
 * يُشغّل جميع القواعد المناسبة على مخرج وكيل معين.
 */
export function evaluateOutput(
  output: string,
  context: RuleContext,
): QualityReport {
  const applicableRules = QUALITY_RULES.filter(rule => {
    if (rule.appliesTo.length === 0) return true
    return rule.appliesTo.includes(context.department)
  })

  const results: RuleResult[] = []
  let passedCount = 0
  let failedCount = 0
  let warningCount = 0

  for (const rule of applicableRules) {
    const passed = rule.check(output, context)

    results.push({
      ruleId: rule.id,
      ruleName: rule.name,
      passed,
      severity: rule.severity,
      message: passed ? '✅ نجح' : rule.failMessage,
      suggestion: passed ? undefined : rule.fixSuggestion,
    })

    if (passed) {
      passedCount++
    } else {
      if (rule.severity === 'error') failedCount++
      else if (rule.severity === 'warning') warningCount++
    }
  }

  const totalRules = applicableRules.length
  const score = totalRules > 0
    ? Math.round((passedCount / totalRules) * 100)
    : 100

  // Report passes only if no errors (warnings are OK)
  const passed = failedCount === 0

  const summary = buildReportSummary(passed, score, passedCount, failedCount, warningCount, results)

  return {
    passed,
    score,
    totalRules,
    passedRules: passedCount,
    failedRules: failedCount,
    warnings: warningCount,
    results,
    summary,
  }
}

function buildReportSummary(
  passed: boolean,
  score: number,
  passedCount: number,
  failedCount: number,
  warningCount: number,
  results: RuleResult[],
): string {
  let summary = ''

  if (passed && warningCount === 0) {
    summary = `✅ **الجودة ممتازة** (${score}/100) — جميع الفحوصات نجحت.`
  } else if (passed) {
    summary = `⚠️ **مقبول مع ملاحظات** (${score}/100) — نجح مع ${warningCount} تحذير.`
  } else {
    summary = `❌ **مرفوض** (${score}/100) — ${failedCount} خطأ يجب إصلاحه.`
  }

  // List failures
  const failures = results.filter(r => !r.passed && r.severity === 'error')
  if (failures.length > 0) {
    summary += '\n\n### أخطاء يجب إصلاحها:\n'
    failures.forEach(f => {
      summary += `- ❌ **${f.ruleName}**: ${f.message}\n`
      if (f.suggestion) summary += `  → ${f.suggestion}\n`
    })
  }

  // List warnings
  const warnings = results.filter(r => !r.passed && r.severity === 'warning')
  if (warnings.length > 0) {
    summary += '\n### تحذيرات:\n'
    warnings.forEach(w => {
      summary += `- ⚠️ **${w.ruleName}**: ${w.message}\n`
      if (w.suggestion) summary += `  → ${w.suggestion}\n`
    })
  }

  return summary
}

// ─── Custom Rules ─────────────────────────────────────────────────────────────

const customRules: QualityRule[] = []

/**
 * يُسجل قاعدة جودة مخصصة (من الـ config أو البرنامج الإضافي)
 */
export function registerRule(rule: QualityRule): void {
  // Avoid duplicates
  const idx = customRules.findIndex(r => r.id === rule.id)
  if (idx >= 0) {
    customRules[idx] = rule
  } else {
    customRules.push(rule)
  }
  // Also add to the main list
  const mainIdx = QUALITY_RULES.findIndex(r => r.id === rule.id)
  if (mainIdx >= 0) {
    QUALITY_RULES[mainIdx] = rule
  } else {
    QUALITY_RULES.push(rule)
  }
}

/**
 * يُرجع عدد القواعد المسجلة (مبنية + مخصصة)
 */
export function getRuleCount(): { builtin: number; custom: number; total: number } {
  return {
    builtin: QUALITY_RULES.length - customRules.length,
    custom: customRules.length,
    total: QUALITY_RULES.length,
  }
}
