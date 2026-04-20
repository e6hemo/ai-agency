import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import fs from 'fs'
import path from 'path'
import { getCwd } from '../../utils/cwd.js'

export const DIGITAL_CLONE_TOOL_NAME = 'DigitalClone'

function getProfilePath() { return path.join(getCwd(), '.claude', 'digital-clone.json') }
function ensureDir() { const d = path.dirname(getProfilePath()); if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }) }

interface CloneProfile {
  name: string
  writingStyle: string[]
  values: string[]
  decisionPatterns: string[]
  communicationTone: string
  vocabulary: string[]
  avoidances: string[]
  signature: string
  sampleTexts: string[]
  updatedAt: string
}

function loadProfile(): CloneProfile | null {
  try { if (fs.existsSync(getProfilePath())) return JSON.parse(fs.readFileSync(getProfilePath(), 'utf-8')) } catch {}
  return null
}
function saveProfile(p: CloneProfile) { ensureDir(); fs.writeFileSync(getProfilePath(), JSON.stringify(p, null, 2), 'utf-8') }

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum(['build_profile', 'add_sample', 'generate_reply', 'generate_email', 'get_profile']),
    name: z.string().optional(),
    writingStyle: z.string().optional().describe('Describe your writing style in detail'),
    values: z.array(z.string()).optional().describe('Your core values and principles'),
    communicationTone: z.string().optional().describe('e.g. direct and confident, warm yet professional'),
    avoidances: z.array(z.string()).optional().describe('Things you never say or do in communication'),
    signature: z.string().optional().describe('Your email signature'),
    sampleText: z.string().optional().describe('A sample of your writing to learn from'),
    context: z.string().optional().describe('What to reply to or write about'),
    recipient: z.string().optional().describe('Who you are writing to'),
    purpose: z.string().optional().describe('The goal of the message'),
  })
)
type InputSchema = ReturnType<typeof inputSchema>
export type Output = { result: string }

export const DigitalCloneTool = buildTool({
  name: DIGITAL_CLONE_TOOL_NAME,
  searchHint: 'digital clone personality profile writing style email generation',
  maxResultSizeChars: 100000,
  async description() { return 'يبني نسخة رقمية من شخصيتك وأسلوب كتابتك. يمكنه كتابة الردود والإيميلات بالأسلوب الذي لا يستطيع أحد التمييز بينه وبينك.' },
  async prompt() { return 'استخدم build_profile لبناء شخصيتك الرقمية، ثم generate_reply أو generate_email ليكتب بأسلوبك.' },
  get inputSchema() { return inputSchema() },
  get outputSchema() { return lazySchema(() => z.any()) },
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  async call(input) {
    if (input.action === 'build_profile') {
      const profile: CloneProfile = {
        name: input.name ?? 'My Digital Clone',
        writingStyle: input.writingStyle ? [input.writingStyle] : [],
        values: input.values ?? [],
        decisionPatterns: [],
        communicationTone: input.communicationTone ?? 'professional and clear',
        vocabulary: [],
        avoidances: input.avoidances ?? [],
        signature: input.signature ?? '',
        sampleTexts: [],
        updatedAt: new Date().toISOString(),
      }
      saveProfile(profile)
      return { data: { result: `✅ تم بناء شخصيتك الرقمية: "${profile.name}"\n\nالخطوة التالية: استخدم \`add_sample\` لإضافة نماذج من كتابتك الفعلية لأتعلم أسلوبك بدقة أعلى.` } }
    }

    if (input.action === 'add_sample') {
      const profile = loadProfile()
      if (!profile) throw new Error('ابنِ الملف الشخصي أولاً عبر build_profile')
      if (!input.sampleText) throw new Error('sampleText required')
      profile.sampleTexts.push(input.sampleText)
      // Extract vocabulary patterns
      const words = input.sampleText.split(/\s+/).filter(w => w.length > 5)
      const uniqueWords = [...new Set(words)].slice(0, 20)
      profile.vocabulary = [...new Set([...profile.vocabulary, ...uniqueWords])].slice(0, 100)
      profile.updatedAt = new Date().toISOString()
      saveProfile(profile)
      return { data: { result: `✅ تم إضافة نموذج كتابة (${input.sampleText.length} حرف)\nإجمالي النماذج: ${profile.sampleTexts.length}\n\nكلما أضفت أكثر، كلما أصبح الكلون أدق وأشبه بك.` } }
    }

    if (input.action === 'get_profile') {
      const profile = loadProfile()
      if (!profile) return { data: { result: 'لا يوجد ملف شخصي بعد. استخدم build_profile.' } }
      return { data: { result: `## 🧬 ملفك الرقمي: ${profile.name}\n\n**نبرة التواصل:** ${profile.communicationTone}\n**القيم الجوهرية:** ${profile.values.join('، ')}\n**ما تتجنبه:** ${profile.avoidances.join('، ')}\n**نماذج مسجلة:** ${profile.sampleTexts.length}\n**آخر تحديث:** ${profile.updatedAt.split('T')[0]}` } }
    }

    const profile = loadProfile()
    const cloneContext = profile
      ? `أنت تكتب بدلاً من شخص اسمه ${profile.name}. 
نبرته: ${profile.communicationTone}.
قيمه: ${profile.values.join(', ')}.
يتجنب: ${profile.avoidances.join(', ')}.
${profile.sampleTexts.length > 0 ? `نماذج من أسلوبه: "${profile.sampleTexts.slice(-2).join('" | "')}"` : ''}
توقيعه: ${profile.signature}`
      : 'كلون رقمي احترافي'

    if (input.action === 'generate_reply') {
      if (!input.context) throw new Error('context required - what are you replying to?')
      return { data: { result: `## ✍️ الرد المقترح (بأسلوبك)\n\n---\n\n[بناءً على ملفك الرقمي، هذا الرد يعكس أسلوبك وقيمك. قدّمه للنموذج لتوليده:]\n\n**التعليمات للنموذج:**\n${cloneContext}\n\n**اكتب رداً على:** ${input.context}\n**المرسل إليه:** ${input.recipient ?? 'غير محدد'}\n**الهدف:** ${input.purpose ?? 'التواصل الطبيعي'}\n\n---\n*ملاحظة: قدّم هذه التعليمات للنموذج ليكتب الرد المحاكي لأسلوبك.*` } }
    }

    if (input.action === 'generate_email') {
      if (!input.context || !input.purpose) throw new Error('context and purpose required')
      return { data: { result: `## 📧 إيميل بأسلوبك\n\n**التعليمات للنموذج:**\n${cloneContext}\n\n**اكتب إيميلاً احترافياً:**\n- الموضوع: ${input.context}\n- المرسَل إليه: ${input.recipient ?? 'غير محدد'}\n- الهدف: ${input.purpose}\n- الطول: متوسط، مباشر\n- أنهِه بالتوقيع: ${profile?.signature ?? ''}\n\n---\n*قدّم هذه التعليمات لنموذج الذكاء الاصطناعي ليكتب الإيميل بأسلوبك الشخصي.*` } }
    }

    return { data: { result: 'Unknown action' } }
  },
  mapToolResultToToolResultBlockParam(data, toolUseID) { return { tool_use_id: toolUseID, type: 'tool_result', content: data.result } },
  userFacingName() { return 'Digital Clone' },
  getToolUseSummary(i) { return i ? `${i.action}` : 'Digital Clone' },
  renderToolUseMessage() { return 'Running Digital Clone...' },
  renderToolUseTag() { return null },
  renderToolResultMessage() { return null },
  extractSearchText() { return '' },
  renderToolUseErrorMessage(e) { return String(e) },
  async validateInput() { return { result: true } },
} satisfies ToolDef<InputSchema, Output>)
