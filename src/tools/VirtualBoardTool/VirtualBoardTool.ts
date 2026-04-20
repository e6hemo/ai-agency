import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

export const VIRTUAL_BOARD_TOOL_NAME = 'VirtualBoard'

// Famous advisors with their known mental models and thinking styles
const ADVISORS: Record<string, { name: string; style: string; strengths: string[]; keyQuestions: string[]; knownFor: string }> = {
  musk: {
    name: 'Elon Musk',
    style: 'First principles thinking. Challenges every assumption. Obsessed with 10x not 10%.',
    strengths: ['physics-based reasoning', 'vertical integration', 'extreme timelines'],
    keyQuestions: ['What are the fundamental constraints here?', 'What would this cost if we started from raw materials?', 'Why has no one done this before — is it impossible or just assumed impossible?'],
    knownFor: 'First principles, physics-based reasoning, audacious bets'
  },
  bezos: {
    name: 'Jeff Bezos',
    style: 'Customer obsession. Long-term thinking. Day 1 mentality. Works backwards from customer needs.',
    strengths: ['long-term strategy', 'customer obsession', 'platform thinking'],
    keyQuestions: ['What does the customer actually want — not what do they say they want?', 'Will this matter in 10 years?', 'Are we building a platform or a product?'],
    knownFor: 'Working backwards, Day 1 mentality, two-pizza teams'
  },
  thiel: {
    name: 'Peter Thiel',
    style: 'Contrarian. Monopoly thinking. Finds what everyone believes that is false. Secrets.',
    strengths: ['contrarian analysis', 'monopoly strategy', 'network effects'],
    keyQuestions: ['What important truth do very few people agree with you on?', 'Are you building a vitamin or a painkiller?', 'What will look obvious in 20 years that nobody sees now?'],
    knownFor: 'Zero to One thinking, finding secrets, monopoly vs competition'
  },
  buffett: {
    name: 'Warren Buffett',
    style: 'Value investing. Circle of competence. Moat. Simple business models. Long-term compounding.',
    strengths: ['business quality assessment', 'patience', 'capital allocation'],
    keyQuestions: ['What is the moat that protects this from competition?', 'Would you be comfortable holding for 10 years?', 'Is this in your circle of competence?'],
    knownFor: 'Moats, margin of safety, compounding, circle of competence'
  },
  jobs: {
    name: 'Steve Jobs',
    style: 'Simplicity. User experience obsession. Saying no to 1000 things. Intersection of tech and humanities.',
    strengths: ['product design', 'brand building', 'simplification'],
    keyQuestions: ['Can this be made 10x simpler?', 'What is the one thing users will love about this?', 'What are we NOT doing that makes this great?'],
    knownFor: 'Simplicity, design obsession, focus, reality distortion field'
  },
  munger: {
    name: 'Charlie Munger',
    style: 'Multi-disciplinary thinking. Latticework of mental models. Inversion. Avoiding stupidity.',
    strengths: ['mental models', 'inversion', 'cross-domain thinking'],
    keyQuestions: ['How could this fail? (Inversion)', 'What mental model from another field applies here?', 'Are you avoiding stupidity or seeking brilliance?'],
    knownFor: 'Mental models lattice, inversion, multi-disciplinary thinking'
  },
  hormozi: {
    name: 'Alex Hormozi',
    style: 'Value maximization. Grand Slam offers. Constraint removal. Business fundamentals.',
    strengths: ['offer creation', 'scaling', 'sales systems'],
    keyQuestions: ['What is the dream outcome for your customer and what is their perceived likelihood of achievement?', 'What are the time delay and effort barriers you can remove?', 'How do you make an offer so good people feel stupid saying no?'],
    knownFor: 'Grand Slam Offers, business scaling, value equation'
  },
}

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum(['consult', 'board_session', 'list_advisors']),
    advisor: z.string().optional().describe('Advisor name or key: musk, bezos, thiel, buffett, jobs, munger, hormozi'),
    question: z.string().optional().describe('Your question or situation to discuss'),
    advisors: z.array(z.string()).optional().describe('List of advisor keys for a board session'),
  })
)
type InputSchema = ReturnType<typeof inputSchema>
export type Output = { result: string }

export const VirtualBoardTool = buildTool({
  name: VIRTUAL_BOARD_TOOL_NAME,
  searchHint: 'virtual board of advisors mental models consultation Elon Musk Bezos Buffett',
  maxResultSizeChars: 150000,
  async description() { return 'مجلس المستشارين الوهميين — تستشير أعظم العقول في العالم: Elon Musk، Jeff Bezos، Peter Thiel، Warren Buffett، Steve Jobs، Charlie Munger، Alex Hormozi. يحاكي أسلوب تفكير كل منهم ويجيب بناءً على مبادئهم الموثقة.' },
  async prompt() { return 'استخدم consult لاستشارة مستشار واحد. board_session لجمع عدة مستشارين حول نفس القرار. list_advisors لعرض قائمتهم.' },
  get inputSchema() { return inputSchema() },
  get outputSchema() { return lazySchema(() => z.any()) },
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  async call(input) {
    if (input.action === 'list_advisors') {
      let res = `## 🏛️ مجلس المستشارين الوهميين\n\n`
      Object.entries(ADVISORS).forEach(([key, a]) => {
        res += `**${a.name}** (key: \`${key}\`)\n> ${a.knownFor}\n\n`
      })
      return { data: { result: res } }
    }

    if (input.action === 'consult') {
      if (!input.advisor || !input.question) throw new Error('advisor and question required')
      const key = input.advisor.toLowerCase()
      const advisor = ADVISORS[key] ?? Object.values(ADVISORS).find(a => a.name.toLowerCase().includes(key))
      if (!advisor) throw new Error(`Advisor "${input.advisor}" not found. Use list_advisors to see available options.`)

      const res = `## 🎙️ استشارة: ${advisor.name}\n\n**سؤالك:** ${input.question}\n\n---\n\n**أسلوب التفكير:** ${advisor.style}\n\n**الأسئلة التي سيطرحها ${advisor.name} أولاً:**\n${advisor.keyQuestions.map((q, i) => `${i + 1}. "${q}"`).join('\n')}\n\n**منظوره بناءً على مبادئه:**\n\nبناءً على فلسفة **${advisor.name}** المعروفة بـ (${advisor.knownFor})، إليك تحليل موقفك:\n\n🎯 **نقاط القوة في ما تصفه من منظوره:**\n- يحتاج تحليل أعمق من خلال إجابتك على أسئلته أعلاه\n\n⚠️ **النقاط التي سيتحداها:**\n- استناداً لأسلوبه في ${advisor.strengths.join('، ')}\n\n📋 **توصيته المحتملة:**\nقدّم هذا الـprompt للنموذج لمحاكاة ${advisor.name} بدقة:\n\n\`\`\`\nأنت ${advisor.name}. أسلوبك: ${advisor.style}\nنقاط قوتك في التحليل: ${advisor.strengths.join(', ')}\nلديك هذا السؤال: ${input.question}\nأجب كما كان سيجيب ${advisor.name} بالضبط — مباشر، صريح، مبني على مبادئه المعروفة.\n\`\`\`\n\n---\n*"${advisor.keyQuestions[0]}" — ${advisor.name}*`
      return { data: { result: res } }
    }

    if (input.action === 'board_session') {
      if (!input.question) throw new Error('question required')
      const keys = input.advisors ?? ['musk', 'buffett', 'thiel', 'hormozi']
      let res = `## 🏛️ جلسة مجلس الإدارة الوهمي\n\n**القرار المطروح:** ${input.question}\n\n---\n`
      keys.forEach(key => {
        const advisor = ADVISORS[key.toLowerCase()]
        if (!advisor) return
        res += `\n### 🎙️ ${advisor.name}\n**الزاوية:** ${advisor.strengths.join(' | ')}\n**السؤال الجوهري الذي سيطرحه:** "${advisor.keyQuestions[0]}"\n**منظوره باختصار:** استناداً لمبدأ (${advisor.knownFor}) — يحتاج تحليلاً مبنياً على إجاباتك.\n`
      })

      res += `\n---\n\n### 🔑 ملخص نقاط الخلاف المحتملة بين المجلس:\n- ${ADVISORS['musk'] ? '**Musk** سيسأل: هل فكرت بذلك من مبادئ أولى؟' : ''}\n- ${ADVISORS['buffett'] ? '**Buffett** سيسأل: ما الـ Moat الحامي لهذه الفكرة؟' : ''}\n- ${ADVISORS['thiel'] ? '**Thiel** سيسأل: لماذا لم يفعل هذا أحد من قبل؟' : ''}\n\n**للحصول على إجابات محاكاة دقيقة:** استخدم \`consult\` مع كل مستشار على حدة.`
      return { data: { result: res } }
    }

    return { data: { result: 'Unknown action' } }
  },
  mapToolResultToToolResultBlockParam(data, toolUseID) { return { tool_use_id: toolUseID, type: 'tool_result', content: data.result } },
  userFacingName() { return 'Virtual Board of Advisors' },
  getToolUseSummary(i) { return i ? `${i.action} — ${i.advisor ?? 'board'}` : 'Virtual Board' },
  renderToolUseMessage() { return 'Convening virtual board of advisors...' },
  renderToolUseTag() { return null },
  renderToolResultMessage() { return null },
  extractSearchText() { return '' },
  renderToolUseErrorMessage(e) { return String(e) },
  async validateInput() { return { result: true } },
} satisfies ToolDef<InputSchema, Output>)
