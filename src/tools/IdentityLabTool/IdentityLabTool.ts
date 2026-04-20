import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import fs from 'fs'
import path from 'path'
import { getCwd } from '../../utils/cwd.js'

export const IDENTITY_LAB_TOOL_NAME = 'IdentityLab'

function getIdentityPath() { return path.join(getCwd(), '.claude', 'identity-constitution.json') }
function ensureDir() { const d = path.dirname(getIdentityPath()); if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }) }

interface IdentityConstitution {
  coreValues: string[]; visionStatement: string; missionStatement: string
  nonNegotiables: string[]; antiPatterns: string[]; dailyPrinciples: string[]
  identityStatement: string; updatedAt: string
}
function loadIdentity(): IdentityConstitution | null { try { if (fs.existsSync(getIdentityPath())) return JSON.parse(fs.readFileSync(getIdentityPath(), 'utf-8')) } catch {} return null }
function saveIdentity(i: IdentityConstitution) { ensureDir(); fs.writeFileSync(getIdentityPath(), JSON.stringify(i, null, 2), 'utf-8') }

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum(['build_constitution', 'daily_alignment_check', 'get_constitution', 'update_values', 'identity_audit']),
    coreValues: z.array(z.string()).optional(),
    vision: z.string().optional().describe('What does your life look like in 10 years?'),
    mission: z.string().optional().describe('Why do you do what you do?'),
    nonNegotiables: z.array(z.string()).optional().describe('Things you will never compromise on'),
    todayBehaviors: z.string().optional().describe('Describe what you did today for alignment check'),
  })
)
type InputSchema = ReturnType<typeof inputSchema>
export type Output = { result: string }

export const IdentityLabTool = buildTool({
  name: IDENTITY_LAB_TOOL_NAME,
  searchHint: 'identity lab constitution values vision mission personal design self',
  maxResultSizeChars: 100000,
  async description() { return 'مختبر الهوية — يساعدك على تصميم هويتك الشخصية والمهنية بشكل مقصود. يبني "دستور الهوية" الشخصي: قيمك، رسالتك، حدودك الثابتة، والمبادئ اليومية.' },
  async prompt() { return 'build_constitution ببناء هويتك. daily_alignment_check لفحص انسجام يومك مع هويتك. get_constitution لعرض دستورك.' },
  get inputSchema() { return inputSchema() },
  get outputSchema() { return lazySchema(() => z.any()) },
  isConcurrencySafe: () => false, isReadOnly: () => false,
  async call(input) {
    if (input.action === 'build_constitution') {
      if (!input.coreValues?.length || !input.vision || !input.mission) throw new Error('coreValues, vision, and mission required')
      const constitution: IdentityConstitution = {
        coreValues: input.coreValues,
        visionStatement: input.vision,
        missionStatement: input.mission,
        nonNegotiables: input.nonNegotiables ?? [],
        antiPatterns: [],
        dailyPrinciples: input.coreValues.map(v => `كل يوم أؤكد قيمة "${v}" بفعل واحد ملموس.`),
        identityStatement: `أنا شخص يقود بـ [${input.coreValues.slice(0, 2).join(' و')}]، ويخدم رسالة: ${input.mission.slice(0, 80)}.`,
        updatedAt: new Date().toISOString(),
      }
      saveIdentity(constitution)
      return { data: { result: `## 📜 دستور هويتك — مبني!\n\n**جملة هويتك:**\n> *"${constitution.identityStatement}"*\n\n**رؤيتك:** ${input.vision}\n**رسالتك:** ${input.mission}\n**قيمك الجوهرية:** ${input.coreValues.join(' | ')}\n${input.nonNegotiables?.length ? `**الخطوط الحمراء:** ${input.nonNegotiables.join(', ')}` : ''}\n\n---\n💡 *هذا الدستور هو مرجعك عند كل قرار صعب. استخدم \`daily_alignment_check\` يومياً للبقاء على المسار.*` } }
    }
    if (input.action === 'get_constitution') {
      const identity = loadIdentity()
      if (!identity) return { data: { result: 'لم يُبنَ دستور الهوية بعد. استخدم build_constitution.' } }
      return { data: { result: `## 📜 دستور هويتك\n\n**جملة هويتك:**\n> *"${identity.identityStatement}"*\n\n**الرؤية:** ${identity.visionStatement}\n**الرسالة:** ${identity.missionStatement}\n**القيم:** ${identity.coreValues.join(' | ')}\n**الخطوط الحمراء:** ${identity.nonNegotiables.join(', ') || 'لم تُحدَّد'}\n\n**المبادئ اليومية:**\n${identity.dailyPrinciples.join('\n')}\n\n*آخر تحديث: ${identity.updatedAt.split('T')[0]}*` } }
    }
    if (input.action === 'daily_alignment_check') {
      const identity = loadIdentity()
      if (!identity) return { data: { result: 'ابنِ دستور هويتك أولاً.' } }
      const behaviors = input.todayBehaviors ?? 'لم يُحدَّد'
      return { data: { result: `## 🔍 فحص الانسجام اليومي\n\n**ما فعلته اليوم:** ${behaviors}\n\n---\n\n### الأسئلة الثلاثة:\n\n1. **قيمك (${identity.coreValues.join('، ')}):**\n   هل أي سلوك فعلته اليوم كان متعارضاً مع إحدى هذه القيم؟\n   → إذا نعم: لا حكم، فقط ملاحظة. ما الذي كنت ستفعله بدلاً من ذلك؟\n\n2. **رسالتك:** "${identity.missionStatement}"\n   → هل ما فعلته اليوم اقتربك من رسالتك أم ابتعد بك؟\n\n3. **الخطوط الحمراء:** ${identity.nonNegotiables.join('، ') || 'لم تُحدَّد'}\n   → هل كسرت أياً منها اليوم؟ (إذا نعم، هذا يستحق تأملاً عميقاً)\n\n---\n**جملة اليوم الختامية:**\n*"أنا لست مجموع ما فعلته اليوم — بل اتجاهي العام عبر الأيام."*\n\nنَمْ بسلام. غداً فرصة جديدة.` } }
    }
    if (input.action === 'identity_audit') {
      const identity = loadIdentity()
      return { data: { result: `## 🔬 مراجعة الهوية الشاملة\n\n**الأسئلة الكبيرة:**\n\n1. **من أنت الآن؟** (ليس المسمى الوظيفي — بل كيف يصفك من يعرفك جيداً؟)\n\n2. **من تريد أن تكون؟** في أكثر لحظاتك وضوحاً وصدقاً مع نفسك — ماذا ترى؟\n\n3. **الفجوة:** ما المسافة الحقيقية بين الاثنين؟ (لا مجاملة لنفسك هنا)\n\n4. **السلوكيات المقرّبة:** ما الـ 3 عادات التي لو فعلتها يومياً تقلصت الفجوة أسرع من أي شيء آخر؟\n\n5. **السلوكيات المبعدة:** ما الذي تفعله حالياً يبتعد بك عن من تريد أن تكون؟ (الإجابة الصادقة مؤلمة وضرورية)\n\n---\n${identity ? `**دستورك الحالي يقول:**\n> "${identity.identityStatement}"\n\nهل لا تزال تؤمن بهذه الجملة؟ إذا لا — حان وقت التحديث.` : '*لم تبنِ دستور هويتك بعد. هذا الوقت المثالي لفعل ذلك.*'}` } }
    }
    if (input.action === 'update_values') {
      const identity = loadIdentity()
      if (!identity) throw new Error('Build constitution first')
      if (input.coreValues) identity.coreValues = input.coreValues
      if (input.vision) identity.visionStatement = input.vision
      if (input.mission) identity.missionStatement = input.mission
      if (input.nonNegotiables) identity.nonNegotiables = input.nonNegotiables
      identity.updatedAt = new Date().toISOString()
      saveIdentity(identity)
      return { data: { result: '✅ تم تحديث دستور هويتك.' } }
    }
    return { data: { result: 'Unknown action' } }
  },
  mapToolResultToToolResultBlockParam(d, id) { return { tool_use_id: id, type: 'tool_result', content: d.result } },
  userFacingName() { return 'Identity Lab' },
  getToolUseSummary(i) { return i?.action ?? 'Identity Lab' },
  renderToolUseMessage() { return 'Identity Lab processing...' },
  renderToolUseTag() { return null }, renderToolResultMessage() { return null }, extractSearchText() { return '' },
  renderToolUseErrorMessage(e) { return String(e) }, async validateInput() { return { result: true } },
} satisfies ToolDef<InputSchema, Output>)
