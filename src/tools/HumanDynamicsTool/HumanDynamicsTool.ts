import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

export const HUMAN_DYNAMICS_TOOL_NAME = 'HumanDynamics'

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum(['analyze_person', 'communication_guide', 'predict_behavior', 'influence_map']),
    description: z.string().optional().describe('Describe the person: behavior, speech patterns, reactions'),
    context: z.string().optional().describe('What situation or goal you need to navigate with this person'),
    personName: z.string().optional(),
  })
)
type InputSchema = ReturnType<typeof inputSchema>
export type Output = { result: string }

export const HumanDynamicsTool = buildTool({
  name: HUMAN_DYNAMICS_TOOL_NAME,
  searchHint: 'human dynamics personality analysis communication influence behavior prediction DISC',
  maxResultSizeChars: 100000,
  async description() { return 'محلل الديناميكيات البشرية — يحدد نموذج شخصية أي شخص من وصفك له، يقترح أسلوب التواصل الأمثل معه، ويتوقع سلوكه تحت الضغط. مبني على DISC وBig 5.' },
  async prompt() { return 'analyze_person لتحليل الشخصية. communication_guide للتواصل الأمثل. predict_behavior للتنبؤ بردود الأفعال. influence_map لخريطة التأثير.' },
  get inputSchema() { return inputSchema() },
  get outputSchema() { return lazySchema(() => z.any()) },
  isConcurrencySafe: () => true, isReadOnly: () => true,
  async call(input) {
    const person = input.personName ?? 'الشخص'
    const desc = input.description ?? ''
    if (input.action === 'analyze_person') {
      if (!input.description) throw new Error('description required')
      // Simple DISC inference based on keywords
      const isDominant = /مباشر|سريع|يقود|يطلب|قرار|يُلح|واثق|مسيطر/i.test(desc)
      const isInfluencer = /اجتماعي|متحمس|يحب الناس|مرح|يتحدث كثيراً|يقنع/i.test(desc)
      const isSteady = /هادئ|صبور|مخلص|يتجنب التغيير|دعم|يستمع/i.test(desc)
      const isConscientious = /دقيق|يسأل كثيراً|تفاصيل|يحلل|منهجي|يحتاج وقت/i.test(desc)

      let profile = isDominant ? 'D (Dominant)' : isInfluencer ? 'I (Influential)' : isSteady ? 'S (Steady)' : isConscientious ? 'C (Conscientious)' : 'غير محدد — أضف المزيد من التفاصيل'
      const profiles: Record<string, { strength: string; fear: string; motivation: string; avoid: string }> = {
        'D (Dominant)': { strength: 'يتخذ قرارات سريعة، يحب التحكم', fear: 'أن يُفقد السيطرة أو يُنظر إليه كضعيف', motivation: 'النتائج والنصر والسرعة', avoid: 'التردد، التفاصيل الزائدة، المجاملات الفارغة' },
        'I (Influential)': { strength: 'يُلهم ويُحرّك الآخرين', fear: 'الرفض الاجتماعي وأن يُهمل', motivation: 'التقدير العلني والانتماء', avoid: 'الانتقاد المباشر، العمل المنعزل' },
        'S (Steady)': { strength: 'موثوق، مستمع ممتاز', fear: 'التغيير المفاجئ والصراع', motivation: 'الأمان والاستقرار والانتماء', avoid: 'الضغط الشديد، التغيير بدون تمهيد' },
        'C (Conscientious)': { strength: 'دقيق جداً، تحليلي', fear: 'الخطأ والانتقاد لعمله', motivation: 'الجودة واليقين والمنطق', avoid: 'القرارات العاطفية، الغموض، المفاجآت' },
      }

      const p = profiles[profile] ?? profiles['D (Dominant)']!
      return { data: { result: `## 🧠 تحليل شخصية: ${person}\n\n**نموذج DISC:** ${profile}\n\n### 💪 نقاط قوته:\n${p.strength}\n\n### 😰 أكبر خوفه:\n${p.fear}\n\n### 🔥 ما يحركه:\n${p.motivation}\n\n### 🚫 ما يجب تجنبه معه:\n${p.avoid}\n\n---\n*استخدم \`communication_guide\` للحصول على خطة التواصل الكاملة.*` } }
    }
    if (input.action === 'communication_guide') {
      if (!input.description) throw new Error('description required')
      const ctx = input.context ?? 'تواصل عام'
      return { data: { result: `## 💬 دليل التواصل مع ${person}\n\n**السياق:** ${ctx}\n\n### ✅ افعل:\n1. **البدء الصحيح:** ابدأ بما يهمه، وليس بما يهمك.\n2. **اللغة المناسبة:** استخدم كلمات تتردد في دنياه (نتائج / علاقات / أمان / دقة — بحسب شخصيته).\n3. **الإيقاع:** لا تتسرع ولا تُبطئ — اقرأ إيقاعه وتزامن معه.\n4. **المكان والوقت:** اختر لحظة يكون فيها مرتاحاً وغير مضغوطاً.\n\n### ❌ تجنب:\n1. الحديث عن نفسك أكثر منه.\n2. تقديم حلول قبل أن يشعر أنك فهمت مشكلته.\n3. المجاملات التي تبدو غير صادقة.\n\n### 🎯 الجملة الافتتاحية الأمثل:\n*"أريد فهم وجهة نظرك في [موضوع] — رأيك مهم لي في هذا."*\n\n### 🏁 كيف تنهي المحادثة بانتصار للطرفين:\nلخّص ما اتفقتم عليه، اجعله يشعر أن الاتفاق كان فكرته، وحدد خطوة واحدة واضحة تالية.` } }
    }
    if (input.action === 'predict_behavior') {
      if (!input.description) throw new Error('description required')
      return { data: { result: `## 🔮 التنبؤ بسلوك ${person}\n\n**تحت الضغط:**\nمعظم الناس يتراجعون إلى أقوى دفاعاتهم الطبيعية تحت الضغط. بناءً على وصفك:\n\n- إذا تحدّيته أمام آخرين → ${desc.includes('يقود') || desc.includes('واثق') ? 'سيقاوم بعدوانية — لا تفعل هذا أبداً. ناقشه على انفراد' : 'سيصمت أو ينسحب — اعطِه مساحة مفتوحة للتعبير'}\n- إذا فاجأته بتغيير مفاجئ → ${desc.includes('هادئ') || desc.includes('صبور') ? 'سيقاوم بصمت لأسابيع — مهّد دائماً قبل التغيير' : 'سيسأل كثيراً — أعطِه معلومات ووقتاً'}\n- إذا شعر بالتهديد → ${desc.includes('اجتماعي') ? 'سيتحالف مع الآخرين ضدك — كن شفافاً' : 'سيتحول إلى نمط التحليل المفرط أو الهجوم المضاد'}\n\n**في مواقف النجاح:**\nعندما ينجح، يريد ${desc.includes('يحب الناس') ? 'التقدير العلني من المجموعة' : 'الاعتراف بجودة عمله تحديداً'}\n\n---\n*التنبؤ لا يكون مؤكداً أبداً — لكنه يرفع احتمالك لاتخاذ القرار الصحيح.*` } }
    }
    if (input.action === 'influence_map') {
      if (!input.description || !input.context) throw new Error('description and context required')
      return { data: { result: `## 🗺️ خريطة التأثير: ${person}\n\n**الهدف:** ${input.context}\n\n### 🔑 مفتاح الوصول:\n1. **ما الذي يريده هو/هي فعلاً في هذا الموضوع؟** (ليس ما يقوله — ما وراء الكلام)\n2. **من يؤثر عليه؟** (الشخص الذي يحترمه والذي لو قال كذا سيتحرك هو)\n3. **ما الخوف الذي يمنعه من الموافقة؟** (أزل الخوف أولاً)\n\n### 🎯 مسار التأثير الأمثل:\n**خطوة 1:** اجعله يشعر أنك تفهم موقفه قبل أي شيء. (2 دقائق)\n**خطوة 2:** اربط مقترحك بما يهمه هو — ليس ما يهمك أنت. (3 دقائق)\n**خطوة 3:** أعطه خياراً — الناس يقاومون الإملاء ويقبلون الاختيار. (1 دقيقة)\n**خطوة 4:** اجعل الخطوة التالية واضحة وصغيرة ويسهل قولها بنعم. (30 ثانية)\n\n---\n*"التأثير الحقيقي لا يشعر فيه الطرف الآخر أنه تأثّر — بل يشعر أنه توصّل إلى القرار بنفسه."*` } }
    }
    return { data: { result: 'Unknown action' } }
  },
  mapToolResultToToolResultBlockParam(d, id) { return { tool_use_id: id, type: 'tool_result', content: d.result } },
  userFacingName() { return 'Human Dynamics' },
  getToolUseSummary(i) { return i?.action ?? 'Human Dynamics' },
  renderToolUseMessage() { return 'Analyzing human dynamics...' },
  renderToolUseTag() { return null }, renderToolResultMessage() { return null }, extractSearchText() { return '' },
  renderToolUseErrorMessage(e) { return String(e) }, async validateInput() { return { result: true } },
} satisfies ToolDef<InputSchema, Output>)
