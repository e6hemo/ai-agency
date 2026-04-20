import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

export const CONTENT_EMPIRE_TOOL_NAME = 'ContentEmpire'

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum(['multiply_idea', 'repurpose_podcast', 'repurpose_meeting', 'generate_calendar', 'thread_from_article']),
    input: z.string().optional().describe('The raw idea, article, podcast transcript, or meeting notes'),
    niche: z.string().optional().describe('Your content niche/domain, e.g. AI tools, fitness, investing'),
    tone: z.enum(['educational', 'inspirational', 'controversial', 'storytelling', 'data_driven']).optional().default('educational'),
    platforms: z.array(z.string()).optional().describe('Target platforms: twitter, linkedin, instagram, youtube'),
  })
)
type InputSchema = ReturnType<typeof inputSchema>
export type Output = { result: string }

export const ContentEmpireTool = buildTool({
  name: CONTENT_EMPIRE_TOOL_NAME,
  searchHint: 'content empire social media content repurposing thread LinkedIn Twitter calendar',
  maxResultSizeChars: 150000,
  async description() { return 'امبراطورية المحتوى — تحوّل فكرة واحدة إلى محتوى لأسبوع كامل: Thread تويتر + مقال LinkedIn + سكريبت يوتيوب + منشور Instagram + أسئلة تفاعلية. مصنع المحتوى اللامتناهي.' },
  async prompt() { return 'multiply_idea: من فكرة → كل المنصات. repurpose_podcast: من حلقة → محتوى متعدد. repurpose_meeting: من اجتماع → ملخصات. generate_calendar: أفكار أسبوعية.' },
  get inputSchema() { return inputSchema() },
  get outputSchema() { return lazySchema(() => z.any()) },
  isConcurrencySafe: () => true, isReadOnly: () => true,
  async call(input) {
    const niche = input.niche ?? 'عام'
    const tone = input.tone ?? 'educational'
    const toneLabel: Record<string, string> = { educational: 'تعليمي', inspirational: 'ملهم', controversial: 'جدلي (يحرك النقاش)', storytelling: 'قصصي', data_driven: 'بالأرقام والبيانات' }

    if (input.action === 'multiply_idea') {
      if (!input.input) throw new Error('input required - the idea to multiply')
      const idea = input.input
      return { data: { result: `## 🚀 مصنع المحتوى: "${idea}"\n**المجال:** ${niche} | **الأسلوب:** ${toneLabel[tone]}\n\n---\n\n### 🐦 Twitter Thread (12 تغريدة):\n\n**التغريدة 1 (Hook):** "هذه الفكرة غيّرت طريقة تفكيري في ${idea.split(' ').slice(0, 3).join(' ')} للأبد:"\n\n**التغريدة 2-10:** [الفكرة الجوهرية مقسّمة لنقاط منطقية - كل تغريدة: نقطة واحدة + مثال + رابط للتالية]\n\n**التغريدة 11:** "TL;DR — الخلاصة في جملة واحدة: [لخّص الفكرة]"\n\n**التغريدة 12 (CTA):** "هل جربت هذا من قبل؟ وما نتيجتك؟ اكتب لي في الردود."\n\n---\n\n### 💼 LinkedIn (منشور طويل):\n\n**السطر الأول (يُوقف التمرير):** المُفارقة: معظم الناس يعتقدون أن ${idea.split(' ')[0]} تعني X. الواقع عكس ذلك تماماً.\n\n**الهيكل:**\n- قصة شخصية مرتبطة (3 أسطر)\n- الدرس الجوهري (5 نقاط مرقمة)\n- التطبيق العملي (فوري)\n- سؤال للنقاش\n\n**نصيحة:** استخدم سطراً واحداً لكل فقرة للقراءة السهلة على الموبايل.\n\n---\n\n### 📸 Instagram (Carousel 5 شرائح):\n\n**Slide 1:** صورة بعنوان جريء: "لماذا [فكرتك] تغير اللعبة؟"\n**Slides 2-4:** نقطة واحدة مع أيقونة في كل شريحة\n**Slide 5:** CTA واضح + Save & Share\n\n---\n\n### 🎥 سكريبت يوتيوب (قصير 60-90 ثانية):\n\n**Hook (0-5 ثوانٍ):** "هل تعرف لماذا 90% من الناس [مشكلة مرتبطة بالفكرة]؟"\n**المشكلة (5-20 ثانية):** الواقع الذي يعانيه الجمهور\n**الحل (20-60 ثانية):** الفكرة مشروحة ببساطة + مثال واحد ملموس\n**CTA (آخر 10 ثوانٍ):** "احفظ الفيديو وطبّقه اليوم."\n\n---\n\n### ❓ أسئلة تفاعلية (لاستخدامها في أي منصة):\n1. "ما رأيك في ${idea.split(' ').slice(0, 3).join(' ')}؟ صح أم خطأ؟"\n2. "أيهما تفضل: [خيار أ] أو [خيار ب] — ولماذا؟"\n3. "كيف طبّق أحدكم هذا في حياته؟"\n\n---\n💡 **جدول النشر المقترح:**\n- الاثنين: Thread تويتر (صباحاً)\n- الثلاثاء: LinkedIn (ظهراً)\n- الخميس: Instagram Carousel\n- الجمعة: يوتيوب Shorts\n\n*محتوى أسبوع كامل من فكرة واحدة.* ✅` } }
    }

    if (input.action === 'repurpose_meeting') {
      if (!input.input) throw new Error('input required - meeting notes or description')
      return { data: { result: `## 📋 تحويل الاجتماع إلى محتوى\n\n**مصدر الاجتماع:** ${input.input.slice(0, 100)}...\n\n---\n\n### 1. محضر رسمي (للفريق):\n**ما تمت مناقشته:** [النقاط الرئيسية]\n**القرارات المتخذة:** [الأشياء المتفق عليها]\n**الخطوات التالية:** [Action Items مع أسماء مسؤولين وتواريخ]\n\n### 2. إيميل المتابعة:\nموضوع: "ملخص اجتماع [التاريخ] + الخطوات القادمة"\nجسم الإيميل: قائمة مرقمة بالقرارات + Action Items لكل شخص\n\n### 3. Post LinkedIn (لو المناقشة كانت قيّمة):\n"في اجتماعنا اليوم ناقشنا [موضوع]. الدرس الأقيم الذي خرجنا به: [الدرس]. هل واجهتم نفس التحدي؟"\n\n### 4. درس في الخزينة الاستراتيجية:\nأي رؤية قيّمة خرجت من هذا الاجتماع → استخدم StrategicVault لتخزينها فوراً.` } }
    }

    if (input.action === 'repurpose_podcast') {
      if (!input.input) throw new Error('input required - podcast topic or transcript')
      return { data: { result: `## 🎙️ تحويل البودكاست إلى محتوى\n\n**موضوع الحلقة:** ${input.input.slice(0, 100)}\n\n---\n\n### 30 مقتطف للسوشيال ميديا:\nمن كل حلقة يمكن استخراج:\n- 5 اقتباسات قوية (لـ Twitter/Instagram)\n- 3 Stats أو أرقام مثيرة\n- 2 قصص أو أمثلة ملموسة\n- 1 سؤال جدلي يحرك النقاش\n- 1 نصيحة عملية قابلة للتطبيق فوراً\n\n### مقالة كاملة من الحلقة:\nعنوان: "أهم [5] دروس من حلقة [اسم البودكاست]"\nهيكل: مقدمة (لماذا يهمك) + نقطة لكل درس + خاتمة بسؤال\n\n### Newsletter (إذا كان لديك قائمة بريدية):\n"هذا الأسبوع استمعت إلى [البودكاست]. الفكرة التي لم تتركني: [الفكرة]. وهذا ما فعلته بها: [التطبيق]"` } }
    }

    if (input.action === 'thread_from_article') {
      if (!input.input) throw new Error('input required')
      return { data: { result: `## 🧵 Thread من مقالة: ${niche}\n\n**طريقة بناء Thread من أي مقالة:**\n\n**التغريدة 1 (Hook):** الجملة الأكثر إثارة في المقالة — ضعها كسؤال أو ادعاء جريء.\n\n**التغريدات 2-7:** لكل نقطة رئيسية في المقالة → تغريدة واحدة:\n- الحكم (Claim)\n- الدليل (Evidence)\n- المثال (Example)\n- التطبيق (So what?)\n\n**التغريدة 8:** "الخلاصة بـ 3 نقاط عملية:"\n**التغريدة 9:** "إذا استفدت من هذا الـ Thread، RT ليستفيد غيرك." + رابط المقالة\n\n---\n**قاعدة ذهبية:** Thread ناجح = Hook قوي + قيمة حقيقية + CTA واضح. الترتيب هذا يمكن أن يُنشر على أي منصة بتعديلات بسيطة.` } }
    }

    if (input.action === 'generate_calendar') {
      const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس']
      const formats = ['Thread تويتر', 'منشور LinkedIn', 'Carousel Instagram', 'Short يوتيوب', 'Newsletter']
      return { data: { result: `## 📅 تقويم محتوى أسبوعي — ${niche}\n\n${days.map((d, i) => `**${d}:** ${formats[i]} | الموضوع: [اختر فكرة من مختبر الأفكار]`).join('\n')}\n\n---\n\n### 5 أفكار محتوى جاهزة لـ "${niche}":\n1. "الحقيقة التي لا يخبرك بها أحد عن [موضوع في ${niche}]"\n2. "كيف غيّر [شيء] طريقة تفكيري في ${niche} للأبد"\n3. "أكبر خطأ ارتكبته في ${niche} وما تعلمته"\n4. "دليلي الكامل المبني على التجربة في ${niche}"\n5. "مقارنة: [أسلوب قديم] مقابل [أسلوب جديد] في ${niche}"\n\n---\n*ابدأ بفكرة واحدة، نفّذها بجودة عالية. ثم الثانية. المداومة تبني الجمهور.*` } }
    }

    return { data: { result: 'Unknown action' } }
  },
  mapToolResultToToolResultBlockParam(d, id) { return { tool_use_id: id, type: 'tool_result', content: d.result } },
  userFacingName() { return 'Content Empire' },
  getToolUseSummary(i) { return i?.action ?? 'Content Empire' },
  renderToolUseMessage() { return 'Content Empire generating...' },
  renderToolUseTag() { return null }, renderToolResultMessage() { return null }, extractSearchText() { return '' },
  renderToolUseErrorMessage(e) { return String(e) }, async validateInput() { return { result: true } },
} satisfies ToolDef<InputSchema, Output>)
