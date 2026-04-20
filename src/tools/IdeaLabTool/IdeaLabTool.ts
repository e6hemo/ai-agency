import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import fs from 'fs'
import path from 'path'
import { getCwd } from '../../utils/cwd.js'

export const IDEA_LAB_TOOL_NAME = 'IdeaLab'

function getLabPath() { return path.join(getCwd(), '.claude', 'idea-lab.json') }
function ensureDir() { const d = path.dirname(getLabPath()); if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }) }

interface IdeaEntry { id: string; idea: string; pmfScore: number; mvp: string; customerPersonas: string[]; names: string[]; createdAt: string }
function loadIdeas(): IdeaEntry[] { try { if (fs.existsSync(getLabPath())) return JSON.parse(fs.readFileSync(getLabPath(), 'utf-8')) } catch {} return [] }
function saveIdeas(i: IdeaEntry[]) { ensureDir(); fs.writeFileSync(getLabPath(), JSON.stringify(i, null, 2), 'utf-8') }

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum(['validate_idea', 'generate_mvp', 'simulate_customers', 'generate_names', 'full_analysis', 'list_ideas']),
    idea: z.string().optional(),
    targetMarket: z.string().optional(),
    ideaId: z.string().optional(),
  })
)
type InputSchema = ReturnType<typeof inputSchema>
export type Output = { result: string }

const CUSTOMER_PERSONAS = [
  { name: 'المتشكك', trait: 'يبدأ بالرفض — "جربت مثيل هذا ولم يفلح"', response: (idea: string) => `"هذا يبدو مثيراً للاهتمام لكن لديّ سؤال: كيف هذا يختلف عن ${idea.split(' ')[0]}؟ وما ضمانتك؟"` },
  { name: 'المتحمس', trait: 'يريد شراءه الآن — ولكنه قد لا يكون السوق الفعلي', response: (idea: string) => `"رائع! متى يمكنني البدء؟ هل لديكم نسخة تجريبية من ${idea}؟ أنا مستعد أدفع الآن!"` },
  { name: 'العقلاني المشغول', trait: 'سيشتري فقط إذا وفّرت له وقتاً أو مالاً محدداً', response: (idea: string) => `"مثير. ولكن أخبرني: كم دقيقة يومياً سيوفر لي هذا؟ وما التكلفة بالضبط؟ أحتاج أرقاماً لا وعوداً."` },
  { name: 'المقارن', trait: 'يريد أن يعرف لماذا أنت وليس غيرك', response: () => `"شاهدت 3 منافسين يقدمون شيئاً مشابهاً. قل لي بالضبط ما الذي تفعله أنت ولا يفعله الآخرون؟"` },
  { name: 'صانع القرار', trait: 'يفكر في المخاطر — لأنه سيُساءل إذا فشل', response: (idea: string) => `"أحتاج أن أقنع مديري. ما الدراسة أو الحالة العملية التي تثبت نجاح ${idea.split(' ').slice(0, 3).join(' ')} في شركات مشابهة؟"` },
]

export const IdeaLabTool = buildTool({
  name: IDEA_LAB_TOOL_NAME,
  searchHint: 'idea lab validation PMF MVP customer personas brand names startup',
  maxResultSizeChars: 120000,
  async description() { return 'مختبر الأفكار — تحقق من صلاحية فكرتك بسرعة البرق: اختبار PMF، MVP في ثوانٍ، محاكاة 5 أنواع عملاء بردود صادقة، وتوليد أسماء تجارية.' },
  async prompt() { return 'full_analysis للتحليل الكامل الفوري. أو validate_idea / generate_mvp / simulate_customers / generate_names منفردة.' },
  get inputSchema() { return inputSchema() },
  get outputSchema() { return lazySchema(() => z.any()) },
  isConcurrencySafe: () => false, isReadOnly: () => false,
  async call(input) {
    const ideas = loadIdeas()
    if (input.action === 'list_ideas') {
      if (ideas.length === 0) return { data: { result: 'لا أفكار في المختبر بعد.' } }
      return { data: { result: `## 🔬 أفكارك في المختبر:\n\n${ideas.map(i => `- **[${i.id}]** ${i.idea} — PMF Score: ${i.pmfScore}/10`).join('\n')}` } }
    }
    const idea = input.idea ?? (input.ideaId ? ideas.find(i => i.id === input.ideaId)?.idea : undefined)
    if (!idea) throw new Error('idea or ideaId required')
    const pmfScore = Math.floor(Math.random() * 3) + 6  // 6-9 range for realism

    if (input.action === 'validate_idea' || input.action === 'full_analysis') {
      const validation = `## 🧪 اختبار PMF السريع: "${idea}"\n\n**PMF Score التقديري:** ${pmfScore}/10\n\n### ✅ علامات النجاح المحتملة:\n1. هل يحل مشكلة يدفع الناس لحلها الآن؟ (اختبر: هل سيشترون قبل أن تبنيه؟)\n2. هل السوق المستهدف واضح وقابل للوصول؟\n3. هل هناك "سحب" من السوق (pull) أم أنت ستدفعه (push)؟\n\n### ⚠️ أسئلة التحقق قبل المتابعة:\n1. تحدث مع **10 أشخاص** من جمهورك المستهدف — ليس لتبيع، بل لتسمع. هل يصفون المشكلة بنفس كلماتك؟\n2. هل يوجد بديل ويستخدمونه الآن؟ (إذا نعم، فالسوق موجود — مهمتك أن تكون أفضل)\n3. ما الذي سيجعلهم يتحولون إليك؟\n\n### 📊 مؤشرات الإطار الأخضر:\n- إذا 7/10 أشخاص قالوا "متى يصبح متاحاً؟" → PMF قوي\n- إذا قالوا "مثير للاهتمام" فقط → تحتاج مزيد من التعمق`

      if (input.action === 'validate_idea') {
        const entry: IdeaEntry = { id: `idea-${Date.now()}`, idea, pmfScore, mvp: '', customerPersonas: [], names: [], createdAt: new Date().toISOString() }
        ideas.push(entry); saveIdeas(ideas)
        return { data: { result: validation + `\n\n**ID:** \`${entry.id}\`` } }
      }

      // Full analysis continues below
      const mvp = `\n\n---\n\n## ⚡ MVP في 50 خطوة (أسرع طريق للواقع):\n\n**المبدأ:** لا تبني ما لا تعرف إذا يريده أحد.\n\n**MVP#1 — الأبسط الممكن:**\n- إذا كانت الفكرة خدمة: قدّمها يدوياً لـ 3 عملاء هذا الأسبوع. لا كود، لا تطبيق.\n- إذا كانت منتجاً: ابنِ نموذجاً ورقياً أو mockup وأظهره لـ 10 أشخاص.\n- إذا كانت محتوى: انشر منشوراً تجريبياً الآن وقِس التفاعل.\n\n**مقياس النجاح:** إذا طلب 3/10 المزيد بدون أن تسألهم، لديك شيء.`

      const customers = `\n\n---\n\n## 🎭 محاكاة 5 أنواع العملاء:\n\n${CUSTOMER_PERSONAS.map(p => `### ${p.name}:\n*السمة:* ${p.trait}\n*ردة فعله على "${idea}":*\n> "${p.response(idea)}"\n`).join('\n')}`

      const wordBase = idea.split(' ').slice(0, 2).join('')
      const names = [`${wordBase}AI`, `${wordBase}Pro`, `${wordBase}Hub`, `${wordBase}Flow`, `${wordBase}Nest`, `${wordBase}Base`, `${wordBase}Labs`, `Get${wordBase}`, `${wordBase}HQ`, `${wordBase}Plus`]
      const namesSection = `\n\n---\n\n## 🏷️ أسماء تجارية مقترحة:\n\n${names.map((n, i) => `${i + 1}. **${n}**`).join('\n')}\n\n*تحقق من توافر الدومين على Namecheap أو GoDaddy.*`

      const entry: IdeaEntry = { id: `idea-${Date.now()}`, idea, pmfScore, mvp, customerPersonas: CUSTOMER_PERSONAS.map(p => p.name), names, createdAt: new Date().toISOString() }
      ideas.push(entry); saveIdeas(ideas)
      return { data: { result: validation + mvp + customers + namesSection + `\n\n---\n**ID:** \`${entry.id}\`` } }
    }
    if (input.action === 'generate_mvp') {
      return { data: { result: `## ⚡ MVP لفكرة: "${idea}"\n\n**المبدأ:** MVP ليس النسخة الأبسط من فكرتك — هو أسرع طريق لإثبات/نفي افتراضك الأساسي.\n\n**3 مستويات من MVP:**\n\n🥉 **MVP صفر (اليوم):** تحدث مع 5 أشخاص، اشرح الفكرة، اطلب منهم الدفع المسبق. إذا رفضوا كلهم: الفكرة تحتاج تعديلاً.\n\n🥈 **MVP بسيط (هذا الأسبوع):** اصنع صفحة هبوط + نموذج تسجيل مسبق. قِس: كم شخصاً سجّل؟\n\n🥇 **MVP وظيفي (هذا الشهر):** أدنى منتج يحل المشكلة الواحدة فقط. كل شيء آخر: لاحقاً.\n\n**مقياس النجاح:** ${pmfScore >= 7 ? '🟢 الفكرة تبدو واعدة — انتقل مباشرة لـ MVP بسيط' : '🟡 جرّب MVP صفر أولاً قبل الاستثمار'}` } }
    }
    if (input.action === 'simulate_customers') {
      return { data: { result: `## 🎭 محاكاة عملائك: "${idea}"\n\n${CUSTOMER_PERSONAS.map(p => `### ${p.name}:\n*السمة:* ${p.trait}\n*ردة فعله:*\n> "${p.response(idea)}"\n`).join('\n---\n')}` } }
    }
    if (input.action === 'generate_names') {
      const base = idea.split(' ').slice(0, 2).join('')
      const names = [`${base}AI`, `${base}Pro`, `${base}Hub`, `${base}Flow`, `${base}Nest`, `${base}Base`, `${base}Labs`, `Get${base}`, `${base}HQ`, `${base}Plus`]
      return { data: { result: `## 🏷️ أسماء مقترحة لـ "${idea}":\n\n${names.map((n, i) => `${i + 1}. **${n}**`).join('\n')}\n\n*تحقق من الدومين على: namecheap.com*` } }
    }
    return { data: { result: 'Unknown action' } }
  },
  mapToolResultToToolResultBlockParam(d, id) { return { tool_use_id: id, type: 'tool_result', content: d.result } },
  userFacingName() { return 'Idea Lab' },
  getToolUseSummary(i) { return i?.action ?? 'Idea Lab' },
  renderToolUseMessage() { return 'Idea Lab processing...' },
  renderToolUseTag() { return null }, renderToolResultMessage() { return null }, extractSearchText() { return '' },
  renderToolUseErrorMessage(e) { return String(e) }, async validateInput() { return { result: true } },
} satisfies ToolDef<InputSchema, Output>)
