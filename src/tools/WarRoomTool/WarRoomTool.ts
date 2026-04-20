import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

export const WAR_ROOM_TOOL_NAME = 'WarRoom'

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum(['analyze_situation', 'simulate_opponent', 'generate_strategies', 'find_leverage_point']),
    situation: z.string().optional().describe('Describe the crisis, challenge, or market opportunity'),
    opponent: z.string().optional().describe('Who is the competitor/counterpart to simulate'),
    goal: z.string().optional().describe('What you want to achieve'),
    constraints: z.array(z.string()).optional().describe('Your limitations and constraints'),
  })
)
type InputSchema = ReturnType<typeof inputSchema>
export type Output = { result: string }

export const WarRoomTool = buildTool({
  name: WAR_ROOM_TOOL_NAME,
  searchHint: 'war room crisis analysis strategic offense competitor simulation SWOT',
  maxResultSizeChars: 120000,
  async description() { return 'غرفة العمليات الاستراتيجية — تحليل عسكري الدقة للأزمات والفرص. تحاكي تفكير منافسيك، تبني 3 سيناريوهات هجومية، وتكتشف نقطة الضغط الواحدة التي تغير اللعبة.' },
  async prompt() { return 'analyze_situation لتشخيص الوضع. simulate_opponent لفهم كيف يفكر خصمك. generate_strategies للبدائل الاستراتيجية. find_leverage_point لنقطة الضغط الفارقة.' },
  get inputSchema() { return inputSchema() },
  get outputSchema() { return lazySchema(() => z.any()) },
  isConcurrencySafe: () => true, isReadOnly: () => true,
  async call(input) {
    if (input.action === 'analyze_situation') {
      if (!input.situation) throw new Error('situation required')
      return { data: { result: `## 🎯 غرفة العمليات — تحليل الوضع\n\n**الموقف:** ${input.situation}\n\n---\n\n### 1️⃣ التشخيص السريع (OODA Loop):\n**Observe:** ما الأدلة الاملموسة التي تعرفها بيقين؟ (ليس افتراضات)\n**Orient:** ما إطار مرجعيتك؟ هل هذا تهديد أم فرصة مقنّعة؟\n**Decide:** ما نافذة الوقت المتاحة للقرار؟\n**Act:** ما أصغر خطوة لا رجعة فيها يمكنك اتخاذها اليوم؟\n\n### 2️⃣ القوى الفاعلة:\n- **حلفاؤك:** من سيستفيد إذا نجحت؟ كيف تحوّلهم لأصول؟\n- **محايدون:** من يمكن تحريكه لصفك؟\n- **خصومك:** ما مصدر قوتهم الحقيقي؟ (غير المُعلن)\n\n### 3️⃣ الأصول غير الظاهرة:\nما الذي تملكه في هذا الموقف وتقلّل من قيمته؟\n\n---\n*استخدم \`generate_strategies\` مع goal لبناء الهجوم.*` } }
    }
    if (input.action === 'simulate_opponent') {
      if (!input.opponent) throw new Error('opponent required')
      return { data: { result: `## 🎭 محاكاة عقل: ${input.opponent}\n\n---\n\n### كيف يرى ${input.opponent} الموقف:\n**أولويته الأولى:** ليست ما تعتقد — بل ما وراء ما يقوله علناً.\n**مصدر خوفه:** ما الذي يُبقيه مستيقظاً ليلاً في هذا الموضوع؟\n**نقاط ضعفه الحقيقية:** ما الذي يحاول إخفاءه بثقته الظاهرة؟\n\n### أسئلة لفهمه أعمق:\n1. ما آخر قرار كبير اتخذه ${input.opponent}؟ لماذا؟\n2. ما الأنماط المتكررة في سلوكه تحت الضغط؟\n3. من يؤثر فيه ويحترم رأيه؟ (هذا هو الباب الخلفي)\n4. ما الإهانة التي لن يغفرها؟ (تجنبها تماماً)\n\n### ردود أفعاله المحتملة على استراتيجياتك:\n- إذا هاجمته مباشرة: سيُصعّد — هذا خطأ.\n- إذا تجاهلته: سيتحرك بحرية أكبر.\n- إذا جعلته يشعر أن انتصارك ليس خسارة له: **هذا هو الطريق.**\n\n---\n*التفاوض الحقيقي لا يُكسب بالهجوم — بل بفهم ما يريده الطرف الآخر فعلاً، ثم إعطائه إياه بشكل يخدم أهدافك.*` } }
    }
    if (input.action === 'generate_strategies') {
      if (!input.goal) throw new Error('goal required')
      const constraints = input.constraints?.join(', ') || 'لم تُحدَّد'
      return { data: { result: `## ⚔️ السيناريوهات الهجومية الثلاثة\n\n**الهدف:** ${input.goal}\n**القيود:** ${constraints}\n\n---\n\n### السيناريو A — الحذر (أقل مخاطرة):\n**المنطق:** بناء الأساس بشكل صامت قبل الإعلان. تكتيك: "اسبق بالتنفيذ، تأخر بالإعلان."\n**الأصول المطلوبة:** الحد الأدنى.\n**حد الخروج:** إذا لم تتحقق X في Y أسبوع.\n\n### السيناريو B — الجريء (أعلى عائد):\n**المنطق:** السرعة تبني الميزة. من يتحرك أولاً يكسب الأرض.\n**الخطوة الأولى:** لا تُخطط أكثر — افعل هذه الخطوة الواحدة اليوم.\n**حد الخروج:** إذا لم يتحقق Z في الأسبوعين الأول.\n\n### السيناريو C — الـ Moonshot (الأكثر جرأة):\n**المنطق:** إذا فشلت ستخسر X. إذا نجحت ستكسب 10X. حتى 30% من نجاحه يُغير اللعبة.\n**الشرط:** يحتاج جرأة على الفشل العلني.\n\n---\n### 🔑 التوصية:\nابدأ بـ **A** لمدة 2 أسبوع لاختبار الأرض، ثم انقل ما نجح إلى **B** بسرعة.\n*غرفة العمليات لا توصي بـ C إلا إذا كانت تكلفة الفشل محدودة وعائد النجاح هائل.*` } }
    }
    if (input.action === 'find_leverage_point') {
      if (!input.situation) throw new Error('situation required')
      return { data: { result: `## 🎯 نقطة الضغط الفارقة\n\n**السياق:** ${input.situation}\n\n---\n\n### البحث عن نقطة الضغط:\nفي كل نظام معقد هناك نقطة واحدة — إذا ضغطت عليها تتحرك كل شيء معها.\n\n**السؤال الأول:** ما أصغر تغيير يمكن أن يُنتج أكبر نتيجة هنا؟\n\n**مصفوفة البحث:**\n| النقطة | التأثير | الجهد | الأولوية |\n|---|---|---|---|\n| الشخص الصانع للقرار | عالٍ | متوسط | 🥇 أولاً |\n| السلوك تحت الضغط | عالٍ | منخفض | 🥇 أولاً |\n| مصدر المعلومات | متوسط | منخفض | 🥈 ثانياً |\n| الدوافع الخفية | عالٍ | عالٍ | 🥈 ثانياً |\n\n**المبدأ الذهبي:** لا تحاول تحريك الجبل — ابحث عن النقطة التي ينزلق منها الجبل بنفسه.\n\n---\n*"العقل العسكري الجيد لا يبحث عن النصر — يبحث عن موضع تصبح فيه الهزيمة مستحيلة."*\n— Sun Tzu` } }
    }
    return { data: { result: 'Unknown action' } }
  },
  mapToolResultToToolResultBlockParam(d, id) { return { tool_use_id: id, type: 'tool_result', content: d.result } },
  userFacingName() { return 'War Room' },
  getToolUseSummary(i) { return i?.action ?? 'War Room' },
  renderToolUseMessage() { return 'Entering War Room...' },
  renderToolUseTag() { return null }, renderToolResultMessage() { return null }, extractSearchText() { return '' },
  renderToolUseErrorMessage(e) { return String(e) }, async validateInput() { return { result: true } },
} satisfies ToolDef<InputSchema, Output>)
