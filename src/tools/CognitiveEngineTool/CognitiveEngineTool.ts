import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import fs from 'fs'
import path from 'path'
import { getCwd } from '../../utils/cwd.js'

export const COGNITIVE_ENGINE_TOOL_NAME = 'CognitiveEngine'

// ─── Storage paths ────────────────────────────────────────────────────────────
function getDataDir() { return path.join(getCwd(), '.claude', 'cognitive') }
function getDecisionsPath() { return path.join(getDataDir(), 'decisions.json') }
function getDiaryPath() { return path.join(getDataDir(), 'growth-diary.json') }
function getPatternPath() { return path.join(getDataDir(), 'thinking-patterns.json') }
function ensureDir() {
  const d = getDataDir()
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface DecisionEntry {
  id: string
  date: string
  decision: string
  reasoning: string
  expectedOutcome: string
  context: string
  reviewDate: string   // 30-90 days later
  actualOutcome?: string
  accuracyScore?: number  // 1-10 how accurate was your thinking
  biasesFound?: string[]
}

interface GrowthEntry {
  week: string    // "2024-W15"
  learned: string
  challenge: string
  experiment: string
  score?: number
  coachFeedback?: string
}

interface ThinkingPattern {
  bias: string
  occurrences: number
  lastSeen: string
  examples: string[]
}

// ─── Known cognitive biases ───────────────────────────────────────────────────
const COGNITIVE_BIASES = [
  { name: 'Confirmation Bias', keywords: ['أنا أعرف', 'كنت أعلم', 'متأكد', 'واضح'], description: 'البحث عن الأدلة التي تؤكد معتقداتك الحالية فقط' },
  { name: 'Sunk Cost Fallacy', keywords: ['أنفقت', 'صرفت وقتاً', 'لا أستطيع التوقف', 'already invested'], description: 'الاستمرار في شيء خاطئ بسبب ما أنفقته مسبقاً' },
  { name: 'Loss Aversion', keywords: ['خسارة', 'أفقد', 'مخاطرة', 'خطر'], description: 'الخوف من الخسارة أقوى من الرغبة في الكسب بنفس القدر' },
  { name: 'Availability Heuristic', keywords: ['سمعت', 'شاهدت', 'حدث مؤخراً', 'أعرف شخصاً'], description: 'الحكم على احتمالية شيء بناءً على مدى سهولة تذكره' },
  { name: 'Dunning-Kruger', keywords: ['سهل', 'بسيط', 'أي شخص يستطيع', 'لا يحتاج خبرة'], description: 'المبالغة في تقدير قدراتك في مجالات تعرفها قليلاً' },
  { name: 'Anchoring Bias', keywords: ['السعر الأول', 'العرض الأول', 'مقارنة بـ'], description: 'الاعتماد كثيراً على أول معلومة تلقيتها' },
  { name: 'Survivorship Bias', keywords: ['فلان نجح', 'أمازون فعلت كذا', 'الناجحون'], description: 'التركيز على القصص الناجحة وتجاهل الفاشلة' },
  { name: 'Planning Fallacy', keywords: ['سيستغرق أسبوع', 'سأنتهي في', 'سريع', 'خطوات بسيطة'], description: 'التقليل من تقدير الوقت والتكلفة اللازمين لإنجاز مهمة' },
]

// ─── Storage helpers ──────────────────────────────────────────────────────────
function loadDecisions(): DecisionEntry[] {
  try { if (fs.existsSync(getDecisionsPath())) return JSON.parse(fs.readFileSync(getDecisionsPath(), 'utf-8')) } catch {}
  return []
}
function saveDecisions(d: DecisionEntry[]) { ensureDir(); fs.writeFileSync(getDecisionsPath(), JSON.stringify(d, null, 2), 'utf-8') }

function loadDiary(): GrowthEntry[] {
  try { if (fs.existsSync(getDiaryPath())) return JSON.parse(fs.readFileSync(getDiaryPath(), 'utf-8')) } catch {}
  return []
}
function saveDiary(d: GrowthEntry[]) { ensureDir(); fs.writeFileSync(getDiaryPath(), JSON.stringify(d, null, 2), 'utf-8') }

function loadPatterns(): ThinkingPattern[] {
  try { if (fs.existsSync(getPatternPath())) return JSON.parse(fs.readFileSync(getPatternPath(), 'utf-8')) } catch {}
  return []
}
function savePatterns(p: ThinkingPattern[]) { ensureDir(); fs.writeFileSync(getPatternPath(), JSON.stringify(p, null, 2), 'utf-8') }

function currentWeek(): string {
  const now = new Date()
  const startOfYear = new Date(now.getFullYear(), 0, 1)
  const week = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7)
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`
}

function reviewDate(days = 30): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]!
}

// ─── Bias detector ────────────────────────────────────────────────────────────
function detectBiases(text: string): typeof COGNITIVE_BIASES {
  const lower = text.toLowerCase()
  return COGNITIVE_BIASES.filter(bias =>
    bias.keywords.some(kw => lower.includes(kw.toLowerCase()))
  )
}

// ─── Input schema ─────────────────────────────────────────────────────────────
const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum([
      'analyze_thinking',      // Detect cognitive biases in text
      'devils_advocate',       // Challenge an idea with tough questions
      'log_decision',          // Record a decision for future review
      'review_decisions',      // Show decisions pending review
      'close_decision',        // Record actual outcome of past decision
      'weekly_growth_log',     // Log weekly growth diary
      'get_growth_report',     // Summary of growth over time
      'socratic_dialogue',     // Socratic questioning on a topic
      'build_mental_map',      // Build a mental model map for a topic
      'get_pattern_report',    // Show your recurring thinking patterns
    ]),
    text: z.string().optional().describe('Text to analyze, idea to challenge, or topic to explore'),
    decision: z.string().optional().describe('The decision you are making'),
    reasoning: z.string().optional().describe('Why you are making this decision'),
    expectedOutcome: z.string().optional().describe('What you expect to happen'),
    context: z.string().optional().describe('Background context'),
    decisionId: z.string().optional().describe('ID of decision to close/review'),
    actualOutcome: z.string().optional().describe('What actually happened (for closing a decision)'),
    accuracyScore: z.number().min(1).max(10).optional().describe('How accurate was your original thinking? 1-10'),
    learned: z.string().optional().describe('What you learned this week'),
    challenge: z.string().optional().describe('A challenge you faced this week'),
    experiment: z.string().optional().describe('What you want to experiment with next week'),
  })
)

type InputSchema = ReturnType<typeof inputSchema>
export type Output = { result: string }

// ─── Tool definition ──────────────────────────────────────────────────────────
export const CognitiveEngineTool = buildTool({
  name: COGNITIVE_ENGINE_TOOL_NAME,
  searchHint: 'cognitive development, thinking patterns, decision journal, devil\'s advocate, mental models',
  maxResultSizeChars: 150000,
  async description() {
    return `الصالة الذهنية الشخصية — محرك تطوير التفكير. يكتشف أخطاءك المعرفية، يحدّيك كمحاور شيطاني، يبني خريطة ذهنية لأفكارك، يحتفظ بيومية قراراتك ويراجعها بعد 30-90 يوماً ليقيس دقة تفكيرك، ويدير حلقة نمو أسبوعية شخصية.`
  },
  async prompt() {
    return `استخدم هذه الأداة كصالة لياقة عقلية:
- analyze_thinking: اكتشف التحيزات المعرفية في نص أو قرار
- devils_advocate: ناقش فكرتك مع معارض شرس منطقياً
- log_decision: سجل قراراً مهماً لمراجعته لاحقاً
- review_decisions: راجع القرارات التي حان وقت تقييمها
- close_decision: سجل النتيجة الفعلية وقيّم دقة تفكيرك
- weekly_growth_log: يومية النمو الأسبوعية
- get_growth_report: تقرير نموك عبر الزمن
- socratic_dialogue: حوار سقراطي يجعلك تصل للحقيقة بنفسك
- build_mental_map: خريطة ذهنية لموضوع معقد
- get_pattern_report: أنماط تفكيرك المتكررة`
  },
  get inputSchema() { return inputSchema() },
  get outputSchema() { return lazySchema(() => z.any()) },
  isConcurrencySafe: () => false,
  isReadOnly: () => false,

  async call(input) {
    // ── 1. Analyze Thinking ──────────────────────────────────────────────────
    if (input.action === 'analyze_thinking') {
      if (!input.text) throw new Error('text required')
      const detected = detectBiases(input.text)

      // Update patterns log
      const patterns = loadPatterns()
      for (const bias of detected) {
        const existing = patterns.find(p => p.bias === bias.name)
        if (existing) {
          existing.occurrences++
          existing.lastSeen = new Date().toISOString()
          if (existing.examples.length < 5) existing.examples.push(input.text.slice(0, 100))
        } else {
          patterns.push({ bias: bias.name, occurrences: 1, lastSeen: new Date().toISOString(), examples: [input.text.slice(0, 100)] })
        }
      }
      savePatterns(patterns)

      if (detected.length === 0) {
        return { data: { result: `## ✅ تحليل التفكير\n\nلم أكتشف تحيزات معرفية واضحة في هذا النص. تفكيرك يبدو متوازناً.\n\n> ⚠️ ملاحظة: هذا لا يعني أنه خالٍ من الأخطاء — بعض التحيزات خفية جداً. جرّب أداة \`devils_advocate\` للتحقق أعمق.` } }
      }

      let res = `## 🔬 تحليل التفكير\n\nاكتشفت **${detected.length}** تحيز(ات) معرفية محتملة:\n\n`
      detected.forEach((b, i) => {
        res += `### ${i + 1}. ⚠️ ${b.name}\n**ما هو:** ${b.description}\n**كيف ظهر في كلامك:** الكلمات المشغّلة كانت في سياق يشير إليه.\n**السؤال الذي عليك أن تسأله:** هل أنت تبحث عن الأدلة التي تدعم فكرتك أم تختبر كلا الاتجاهين بالتساوي؟\n\n`
      })
      res += `---\n💡 **التوصية:** قبل المضي قدماً، استخدم \`devils_advocate\` على هذه الفكرة لاختبارها من الزاوية المعاكسة.`
      return { data: { result: res } }
    }

    // ── 2. Devil's Advocate ──────────────────────────────────────────────────
    if (input.action === 'devils_advocate') {
      if (!input.text) throw new Error('text required - describe your idea or decision')

      const questions = [
        `**السؤال الأساسي:** ما الذي يجعلك متأكداً أن هذا هو الوقت المناسب؟ وليس قبل 6 أشهر أو بعدها؟`,
        `**اختبار الدليل المعاكس:** ما الأدلة التي تثبت أن هذه الفكرة *لن* تنجح؟ هل بحثت عنها بنفس الحماس الذي بحثت به عن أدلة النجاح؟`,
        `**اختبار الشخص الذكي المعارض:** تخيّل أذكى شخص تعرفه يرفض فكرتك تماماً — ما الحجة التي سيستخدمها؟ هل أنت قادر على دحضها؟`,
        `**اختبار الفشل المسبق:** تصوّر أن هذه الفكرة فشلت بعد سنة من اليوم — ما الأسباب الأكثر احتمالاً للفشل؟ هل خططت للتعامل معها؟`,
        `**اختبار البديل:** ما هو أفضل استخدام بديل لنفس الوقت والمال والطاقة التي ستصرفها على هذا؟ لماذا ترجّح هذا على البديل؟`,
        `**اختبار النطاق:** هل قيّمتَ هذا على 10 أشخاص حقيقيين من جمهورك المستهدف؟ أم أنك لا تزال في مرحلة "أعتقد أن الناس سيحبون ذلك"؟`,
        `**اختبار التكلفة الحقيقية:** ما الذي ستضطر لـ *التوقف عنه* إذا واصلت في هذا الاتجاه؟ هل أنت مرتاح لهذه التضحية؟`,
      ]

      let res = `## ⚔️ المحاور الشيطاني\n\n**الفكرة التي أتحداها:** ${input.text}\n\n---\n\nأنا لستُ هنا لأدمر فكرتك — بل لأجعلها قاتلة المقاومة. إذا استطعت الإجابة على هذه الأسئلة بوضوح، فكرتك قوية:\n\n`
      questions.forEach((q, i) => { res += `${i + 1}. ${q}\n\n` })
      res += `---\n\n### 🎯 التحدي النهائي:\nاكتب لي **جملة واحدة** تشرح لماذا ستنجح هذه الفكرة بالذات. إذا أمكنك ذلك بوضوح ودون تردد — أنت جاهز للمضي.\n\n*استخدم \`log_decision\` لتسجيل قرارك الآن وسنراجعه بعد 30 يوماً.*`
      return { data: { result: res } }
    }

    // ── 3. Log Decision ──────────────────────────────────────────────────────
    if (input.action === 'log_decision') {
      if (!input.decision || !input.reasoning || !input.expectedOutcome) {
        throw new Error('decision, reasoning, and expectedOutcome are required')
      }
      const decisions = loadDecisions()
      const biases = detectBiases(`${input.decision} ${input.reasoning}`)
      const id = `dec-${Date.now()}`
      const entry: DecisionEntry = {
        id,
        date: new Date().toISOString().split('T')[0]!,
        decision: input.decision,
        reasoning: input.reasoning,
        expectedOutcome: input.expectedOutcome,
        context: input.context ?? '',
        reviewDate: reviewDate(30),
        biasesFound: biases.map(b => b.name),
      }
      decisions.push(entry)
      saveDecisions(decisions)

      let res = `## 📔 تم تسجيل قرارك\n\n**ID:** \`${id}\`\n**القرار:** ${input.decision}\n**التوقع:** ${input.expectedOutcome}\n**تاريخ المراجعة:** ${entry.reviewDate}\n`
      if (biases.length > 0) {
        res += `\n⚠️ **تنبيه — تم اكتشاف تحيزات محتملة في تفكيرك:**\n${biases.map(b => `- ${b.name}: ${b.description}`).join('\n')}\n`
      }
      res += `\n---\n*سأذكّرك بمراجعة هذا القرار في ${entry.reviewDate}. استخدم \`close_decision\` مع ID: ${id} لتسجيل ما حدث فعلاً.*`
      return { data: { result: res } }
    }

    // ── 4. Review Decisions ──────────────────────────────────────────────────
    if (input.action === 'review_decisions') {
      const decisions = loadDecisions()
      const today = new Date().toISOString().split('T')[0]!
      const pending = decisions.filter(d => !d.actualOutcome && d.reviewDate <= today)
      const upcoming = decisions.filter(d => !d.actualOutcome && d.reviewDate > today)

      let res = `## 📊 لوحة مراجعة القرارات\n\n`
      if (pending.length > 0) {
        res += `### 🔔 بانتظار المراجعة (${pending.length} قرار):\n`
        pending.forEach(d => {
          res += `\n**[${d.id}]** ${d.date}: ${d.decision}\n> كنت تتوقع: ${d.expectedOutcome}\n> استخدم \`close_decision\` مع id: \`${d.id}\` لتسجيل ما حدث فعلاً.\n`
        })
      }
      if (upcoming.length > 0) {
        res += `\n### ⏰ قرارات قادمة (${upcoming.length}):\n`
        upcoming.forEach(d => {
          res += `- **[${d.id}]** مراجعة في ${d.reviewDate}: ${d.decision.slice(0, 60)}...\n`
        })
      }
      const closed = decisions.filter(d => d.actualOutcome)
      if (closed.length > 0) {
        const avgScore = closed.reduce((s, d) => s + (d.accuracyScore ?? 0), 0) / closed.length
        res += `\n### 📈 إحصاءاتك:\n- قرارات مراجعة مكتملة: **${closed.length}**\n- متوسط دقة تفكيرك: **${avgScore.toFixed(1)}/10**\n`
      }
      if (decisions.length === 0) res = `## 📔 يومية القرارات فارغة\n\nابدأ بتسجيل أول قرار مهم باستخدام \`log_decision\`.`
      return { data: { result: res } }
    }

    // ── 5. Close Decision ────────────────────────────────────────────────────
    if (input.action === 'close_decision') {
      if (!input.decisionId || !input.actualOutcome || !input.accuracyScore) {
        throw new Error('decisionId, actualOutcome, and accuracyScore (1-10) required')
      }
      const decisions = loadDecisions()
      const d = decisions.find(x => x.id === input.decisionId)
      if (!d) throw new Error(`Decision ${input.decisionId} not found`)

      d.actualOutcome = input.actualOutcome
      d.accuracyScore = input.accuracyScore
      saveDecisions(decisions)

      const scoreLabel = input.accuracyScore >= 8 ? '🏆 ممتاز' : input.accuracyScore >= 6 ? '✅ جيد' : input.accuracyScore >= 4 ? '⚠️ وسط' : '❌ تحتاج تطوير'
      return { data: { result: `## ✅ تم إغلاق القرار\n\n**القرار:** ${d.decision}\n**كنت تتوقع:** ${d.expectedOutcome}\n**ما حدث فعلاً:** ${input.actualOutcome}\n**دقة تفكيرك:** ${input.accuracyScore}/10 ${scoreLabel}\n\n---\n💡 **الدرس:** قارن توقعاتك بما حدث. هل كانت التحيزات المكتشفة (${d.biasesFound?.join(', ') || 'لا شيء'}) قد أثّرت على قرارك؟` } }
    }

    // ── 6. Weekly Growth Log ─────────────────────────────────────────────────
    if (input.action === 'weekly_growth_log') {
      if (!input.learned || !input.challenge || !input.experiment) {
        throw new Error('learned, challenge, and experiment are required')
      }
      const diary = loadDiary()
      const week = currentWeek()
      const existing = diary.find(e => e.week === week)

      // Simple growth scoring based on depth of reflection
      const totalWords = `${input.learned} ${input.challenge} ${input.experiment}`.split(' ').length
      const score = Math.min(10, Math.floor(totalWords / 15) + 3)

      const coachFeedback = score >= 8
        ? '🏆 تأمل عميق جداً. الاستمرار على هذا المستوى سيغير طريقة تفكيرك بشكل ملموس خلال 90 يوم.'
        : score >= 6
          ? '✅ تأمل جيد. حاول أن تكون أكثر تحديداً في جزء "التجربة" — ما المقياس الذي ستعرف به هل نجحت أم لا؟'
          : '⚠️ الإجابات مختصرة جداً. التأمل العميق يحتاج تفاصيل. ما الذي شعرت به وليس فقط ما فعلته؟'

      const entry: GrowthEntry = { week, learned: input.learned, challenge: input.challenge, experiment: input.experiment, score, coachFeedback }
      if (existing) {
        const idx = diary.indexOf(existing)
        diary[idx] = entry
      } else {
        diary.push(entry)
      }
      saveDiary(diary)

      return { data: { result: `## 📔 يومية النمو — ${week}\n\n✅ تم التسجيل بنجاح!\n\n**درجة عمق التأمل هذا الأسبوع:** ${score}/10\n\n**ملاحظة المدرب:** ${coachFeedback}\n\n---\n📅 **الأسبوع القادم:** لا تنسَ تسجيل نتيجة تجربتك: "${input.experiment}"` } }
    }

    // ── 7. Growth Report ─────────────────────────────────────────────────────
    if (input.action === 'get_growth_report') {
      const diary = loadDiary()
      const decisions = loadDecisions()
      const patterns = loadPatterns()

      if (diary.length === 0 && decisions.length === 0) {
        return { data: { result: `## 📊 تقرير النمو\n\nلا توجد بيانات كافية بعد. ابدأ بـ:\n1. \`weekly_growth_log\` لتسجيل أسبوعك\n2. \`log_decision\` لتسجيل قراراتك` } }
      }

      const avgGrowthScore = diary.length > 0 ? (diary.reduce((s, e) => s + (e.score ?? 0), 0) / diary.length).toFixed(1) : 'لا يوجد'
      const closedDecisions = decisions.filter(d => d.accuracyScore)
      const avgDecisionAccuracy = closedDecisions.length > 0 ? (closedDecisions.reduce((s, d) => s + (d.accuracyScore ?? 0), 0) / closedDecisions.length).toFixed(1) : 'لا يوجد'
      const topPattern = patterns.sort((a, b) => b.occurrences - a.occurrences)[0]

      let res = `## 📊 تقرير نمو التفكير الشامل\n\n`
      res += `### 🎯 الأرقام الرئيسية\n`
      res += `- أسابيع تأمل مسجلة: **${diary.length}**\n`
      res += `- متوسط عمق التأمل: **${avgGrowthScore}/10**\n`
      res += `- قرارات مسجلة: **${decisions.length}**\n`
      res += `- متوسط دقة القرارات: **${avgDecisionAccuracy}/10**\n`
      if (topPattern) {
        res += `\n### ⚠️ أكثر تحيز معرفي تكراراً عندك:\n**${topPattern.bias}** — ظهر **${topPattern.occurrences}** مرة\nهذا هو أولويتك في تطوير التفكير.\n`
      }
      if (diary.length >= 2) {
        const last = diary[diary.length - 1]!
        const prev = diary[diary.length - 2]!
        const trend = (last.score ?? 0) > (prev.score ?? 0) ? '📈 في تحسن' : (last.score ?? 0) < (prev.score ?? 0) ? '📉 انتبه' : '➡️ مستقر'
        res += `\n### 📈 اتجاه النمو\n${trend} (${prev.score} → ${last.score})\n`
      }
      res += `\n---\n*"التفكير في التفكير هو أعلى أشكال الذكاء." — أرسطو*`
      return { data: { result: res } }
    }

    // ── 8. Socratic Dialogue ─────────────────────────────────────────────────
    if (input.action === 'socratic_dialogue') {
      if (!input.text) throw new Error('text required - describe the topic or decision')

      const res = `## 💭 الحوار السقراطي\n\n**الموضوع:** ${input.text}\n\n---\n\nأنا لن أعطيك إجابة. دوري هو أن أطرح عليك الأسئلة الصحيحة حتى تصل أنت إلى الحقيقة:\n\n**السؤال الأول — تعريف الهدف:**\nفي جملة واحدة فقط، ما الذي تريده *فعلاً* من هذا؟ ليس ما تعتقد أنك يجب أن تريده، بل ما تريده أنت في أعماقك؟\n\n**السؤال الثاني — اختبار الحقيقة:**\nإذا كنت تعرف أن لا أحد سيعلم بقرارك أو يحكم عليه — هل ستتخذ نفس القرار؟\n\n**السؤال الثالث — اختبار الاتساق:**\nهل قراراتك في حياتك الأخرى تتسق مع ما تقول إنك تؤمن به هنا؟\n\n**السؤال الرابع — اختبار الوضوح:**\nاشرح هذا القرار لطفل عمره 10 سنوات. هل يبدو منطقياً؟\n\n**السؤال الخامس — اختبار الندم:**\nعندما تكون في الثمانين من عمرك وتنظر للخلف — ما الذي ستندم عليه أكثر: أن تجرب وتفشل، أم أن لا تجرب أصلاً؟\n\n---\n*خذ وقتك للإجابة على هذه الأسئلة بصدق. الإجابات الحقيقية ستجدها في الداخل.*`
      return { data: { result: res } }
    }

    // ── 9. Build Mental Map ──────────────────────────────────────────────────
    if (input.action === 'build_mental_map') {
      if (!input.text) throw new Error('text required - the topic to map')

      const res = `## 🗺️ الخريطة الذهنية: ${input.text}\n\n### 🎯 المحور الرئيسي\n**${input.text}**\n\n### 🔗 المفاهيم المرتبطة (ابدأ بالبحث عنها)\n- ما هي المصطلحات الأساسية في هذا المجال؟\n- من هم أبرز الخبراء والمراجع في هذا الموضوع؟\n- ما هي المجالات المجاورة التي تؤثر وتتأثر؟\n\n### ❓ الأسئلة التي لم تسألها بعد\n1. ما الذي أعرفه *بالتأكيد* مقابل ما أفترضه؟\n2. من المستفيد ومن يتضرر من هذا الموضوع؟\n3. كيف كان الناس يتعاملون مع هذا قبل 10 سنوات؟ وما الذي تغيّر؟\n4. ما الأدلة التي ستغيّر رأيي إذا وجدتها؟\n\n### 🔄 الديناميكيات والروابط\n- **السبب والنتيجة:** ماذا يحدث إذا تغيّر x؟\n- **التوترات:** ما هي الاتجاهات المتعارضة في هذا الموضوع؟\n- **الاستثناءات:** متى لا تنطبق القاعدة العامة؟\n\n### 📚 المصادر المقترحة لتعميق الفهم\n- استخدم \`NotebookKnowledge\` لاسترجاع ما خزّنته من مراجع ذات صلة\n- اسأل: *"من أفضل شخص في العالم يفهم هذا؟ ما الذي يعرفه أنا لا أعرفه؟"*\n\n### ⚡ الخطوة التالية الواحدة\nما هي الشيء *الوحيد* الذي لو عرفته ستصبح فهمك للموضوع أوضح بكثير؟ ابدأ به.`
      return { data: { result: res } }
    }

    // ── 10. Pattern Report ───────────────────────────────────────────────────
    if (input.action === 'get_pattern_report') {
      const patterns = loadPatterns()
      if (patterns.length === 0) {
        return { data: { result: `## 🔬 تقرير أنماط التفكير\n\nلا توجد بيانات بعد. استخدم \`analyze_thinking\` على أفكارك وقراراتك لبناء صورة عن أنماط تفكيرك.` } }
      }
      const sorted = patterns.sort((a, b) => b.occurrences - a.occurrences)
      let res = `## 🔬 أنماط تفكيرك المتكررة\n\n`
      sorted.forEach((p, i) => {
        const severity = p.occurrences >= 5 ? '🔴 مرتفع' : p.occurrences >= 3 ? '🟡 متوسط' : '🟢 منخفض'
        res += `### ${i + 1}. ${p.bias} — ${severity}\n- تكرار: **${p.occurrences}** مرة\n- آخر ظهور: ${p.lastSeen.split('T')[0]}\n\n`
      })
      res += `---\n### 🎯 توصية:\nركّز على معالجة **${sorted[0]?.bias}** — فهو أكثر تحيزاتك تكراراً. ابدأ بقراءة عنه واستخدم \`devils_advocate\` في المرة القادمة التي تشعر فيه ينشط.`
      return { data: { result: res } }
    }

    return { data: { result: 'Unknown action' } }
  },

  mapToolResultToToolResultBlockParam(data, toolUseID) {
    return { tool_use_id: toolUseID, type: 'tool_result', content: data.result }
  },
  userFacingName() { return 'Cognitive Engine' },
  getToolUseSummary(i) { return i ? `${i.action}` : 'Cognitive Engine' },
  renderToolUseMessage(i) { return `Running Cognitive Engine: ${i?.action ?? ''}...` },
  renderToolUseTag() { return null },
  renderToolResultMessage() { return null },
  extractSearchText() { return '' },
  renderToolUseErrorMessage(e) { return String(e) },
  async validateInput() { return { result: true } }
} satisfies ToolDef<InputSchema, Output>)
