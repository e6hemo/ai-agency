import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { getPipeline, listPipelines } from '../../agency/pipeline.js'

export const AGENCY_PIPELINE_TOOL_NAME = 'AgencyPipeline'

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum(['list', 'get']).describe('الإجراء: list لعرض كل الأنابيب، get للحصول على تفاصيل أنبوب معين'),
    pipelineName: z.string().optional().describe('اسم الأنبوب (مطلوب مع إجراء get)'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
export type Input = z.infer<InputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    result: z.string(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
export type Output = z.infer<OutputSchema>

export const AgencyPipelineTool = buildTool({
  name: AGENCY_PIPELINE_TOOL_NAME,
  searchHint: 'list or read agency pipelines for multi-agent workflows',
  maxResultSizeChars: 100000,
  async description() {
    return 'أداة مخصصة لمدير المشاريع لعرض وقراءة خطوط الأنابيب (Pipelines) التي تنظم عمل الوكلاء بالتسلسل.'
  },
  async prompt() {
    return 'استخدم هذه الأداة لطلب قائمة الـ pipelines أو تفاصيل pipeline معين لتعرف من الوكلاء الذين ستحتاج لاستدعائهم لتنفيذ مشروع، وبأي ترتيب.'
  },
  get inputSchema(): InputSchema { return inputSchema() },
  get outputSchema(): OutputSchema { return outputSchema() },
  isConcurrencySafe() { return true },
  isReadOnly() { return true },
  async call({ action, pipelineName }) {
    if (action === 'list') {
      const pipelines = listPipelines()
      if (Object.keys(pipelines).length === 0) return { data: { result: 'لا توجد pipelines متوفرة.' } }
      
      let res = `قائمة الـ Pipelines المتاحة:\n`
      for (const [name, config] of Object.entries(pipelines)) {
        res += `- ${name}: ${config.description}\n`
      }
      return { data: { result: res } }
    } else if (action === 'get') {
      if (!pipelineName) throw new Error('يجب تحديد pipelineName عند استخدام get')
      const pipeline = getPipeline(pipelineName)
      if (!pipeline) return { data: { result: `Pipeline '${pipelineName}' غير موجود.` } }

      let res = `تفاصيل Pipeline: ${pipelineName}\n`
      res += `الوصف: ${pipeline.description}\n\n`

      res += `═══ بروتوكول تنفيذ الأنبوب (إلزامي) ═══\n\n`

      res += `【الإعداد】\n`
      res += `1. استخدم SharedMemory (read-state) لقراءة حالة المشروع قبل البدء.\n`
      res += `   ← إذا كانت هناك خطوات مكتملة (completed) في state.json، تجاوزها وابدأ من حيث توقف المشروع.\n\n`

      res += `【التنفيذ لكل خطوة】\n`
      res += `2. استدعِ الوكيل عبر AgentTool مع إبلاغه بـ:\n`
      res += `   - اسم المشروع ليقرأ السياق من SharedMemory\n`
      res += `   - المهمة المحددة المطلوبة منه في هذه الخطوة\n\n`

      res += `【بروتوكول QA — إلزامي بعد كل خطوة】\n`
      res += `3. بعد انتهاء الوكيل، قيّم المخرجات:\n`
      res += `   ✅ مكتمل  → سجّل الاكتمال: SharedMemory (update-state) بحالة "completed" ثم انتقل للخطوة التالية.\n`
      res += `   ❌ ناقص   → أعد العمل للوكيل بتغذية راجعة محددة. كرر حتى يلتزم بالمعيار المطلوب.\n`
      res += `   ⚠️ خطأ   → سجّل الخطوة بحالة "failed" في state.json وأبلغ المستخدم بوصف المشكلة.\n\n`

      res += `【الإنهاء】\n`
      res += `4. عند اكتمال آخر خطوة: حدّث حالة المشروع إلى "completed" وقدّم للمستخدم ملخصاً شاملاً.\n\n`

      res += `═══ ترتيب الوكلاء في هذا الأنبوب ═══\n`
      pipeline.steps.forEach((step, index) => {
        const isLast = index === pipeline.steps.length - 1
        res += `الخطوة ${index + 1}${isLast ? ' (أخيرة)' : ''}: @${step}\n`
      })

      return { data: { result: res } }
    }
    return { data: { result: 'إجراء غير معروف' } }
  },
  mapToolResultToToolResultBlockParam(data, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: data.result,
    }
  },
  userFacingName() { return 'Agency Pipeline' },
  getToolUseSummary(input) { return input ? `${input.action} pipeline ${input.pipelineName ?? ''}`.trim() : 'pipeline' },
  renderToolUseMessage(input) { return `Reading pipeline information...` },
  renderToolUseTag() { return null },
  renderToolResultMessage() { return null },
  extractSearchText() { return '' },
  renderToolUseErrorMessage(error) { return String(error) },
  async validateInput() { return { result: true } }
} satisfies ToolDef<InputSchema, Output>)
