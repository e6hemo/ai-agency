import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import {
  getProjectContext,
  updateProjectContext,
  appendToProjectContext,
  getProjectState,
  updateProjectState,
  type StepStatus,
  type ProjectStatus,
  writeAgentDiary,
  readAgentDiary,
  searchMemPalace
} from '../../agency/shared-memory.js'

export const SHARED_MEMORY_TOOL_NAME = 'SharedMemory'

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z
      .enum(['read', 'update', 'append', 'read-state', 'update-state', 'write-diary', 'read-diary', 'search-memory'])
      .describe(
        'الإجراء المطلوب:\n' +
          '• read         — قراءة سياق المشروع (context.md)\n' +
          '• update       — استبدال سياق المشروع بالكامل\n' +
          '• append       — إضافة محتوى لنهاية سياق المشروع\n' +
          '• read-state   — قراءة حالة المشروع الهيكلية (state.json)\n' +
          '• update-state — تحديث حالة المشروع (مثل تسجيل اكتمال خطوة)\n' +
          '• write-diary  — كتابة مذكراتك كوكيل في غرفتك الخاصة (MemPalace)\n' +
          '• read-diary   — قراءة مذكراتك السابقة المتراكمة (MemPalace)\n' +
          '• search-memory— البحث في كل الذواكر والغرف باستخدام كلمات مفتاحية (MemPalace)',
      ),
    project: z
      .string()
      .describe('اسم المشروع (قصير وبدون مسافات، مثلاً: launch-campaign)'),
    content: z
      .string()
      .optional()
      .describe('المحتوى النصي للإضافة/التحديث أو كتابة المذكرات'),
    agentName: z
      .string()
      .optional()
      .describe('اسم الوكيل الخاص بك لكتابة/قراءة المذكرات (مطلوب مع إجراءات diary)'),
    searchQuery: z
      .string()
      .optional()
      .describe('كلمات مفتاحية للبحث (مطلوب مع search-memory)'),
    stateUpdate: z
      .object({
        status: z.enum(['pending', 'in-progress', 'completed', 'failed']).optional(),
        currentStep: z.string().optional(),
        historyEntry: z
          .object({
            step: z.string(),
            agentName: z.string(),
            status: z.enum(['pending', 'in-progress', 'qa-review', 'completed', 'failed']),
            summary: z.string(),
          })
          .optional(),
      })
      .optional()
      .describe('بيانات تحديث الحالة (مطلوبة في update-state)'),
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

export const SharedMemoryTool = buildTool({
  name: SHARED_MEMORY_TOOL_NAME,
  searchHint: 'read/write agency shared memory context and state for a project',
  maxResultSizeChars: 500000,
  async description() {
    return (
      'أداة لقراءة وكتابة الذاكرة المشتركة لمشروع معين في الوكالة.\n' +
      'تدعم نوعين من الذاكرة:\n' +
      '1. السياق السردي (context.md): للتواصل النصي الحر بين الوكلاء.\n' +
      '2. حالة المشروع الهيكلية (state.json): لتتبع مراحل العمل والتعافي من الأخطاء.'
    )
  },
  async prompt() {
    return (
      'قبل البدء في أي خطوة، اقرأ حالة المشروع (read-state) لتعرف أين توقف العمل.\n' +
      'بعد اكتمال كل خطوة، سجّل ذلك (update-state) حتى يتمكن المنسق من المتابعة أو الاستئناف عند الحاجة.'
    )
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  isConcurrencySafe() {
    return false
  },
  isReadOnly() {
    return false
  },
  async call({ action, project, content, stateUpdate, agentName, searchQuery }) {
    switch (action) {
      case 'read': {
        const ctx = getProjectContext(project)
        return { data: { result: ctx.content } }
      }
      case 'update': {
        if (!content) throw new Error('محتوى التحديث (content) مطلوب')
        const ctx = updateProjectContext(project, content)
        return { data: { result: `✅ تم تحديث سياق المشروع: ${ctx.contextPath}` } }
      }
      case 'append': {
        if (!content) throw new Error('محتوى الإضافة (content) مطلوب')
        const ctx = appendToProjectContext(project, content)
        return { data: { result: `✅ تم إضافة المحتوى لسياق المشروع: ${ctx.contextPath}` } }
      }
      case 'read-state': {
        const state = getProjectState(project)
        const historyLines = state.history
          .slice(-5) // Last 5 entries to avoid overflow
          .map(
            (h, i) =>
              `  ${i + 1}. [${h.status}] ${h.step} (${h.agentName}) — ${h.summary}`,
          )
          .join('\n')
        const result =
          `📊 حالة مشروع "${project}":\n` +
          `   الحالة: ${state.status}\n` +
          `   الخطوة الحالية: ${state.currentStep}\n` +
          `   بدأ في: ${new Date(state.startedAt).toLocaleString('ar-SA')}\n` +
          `   آخر تحديث: ${new Date(state.updatedAt).toLocaleString('ar-SA')}\n` +
          (historyLines ? `\n📋 آخر الخطوات:\n${historyLines}` : '\n(لا يوجد تاريخ بعد)')
        return { data: { result } }
      }
      case 'update-state': {
        if (!stateUpdate) throw new Error('بيانات (stateUpdate) مطلوبة')
        const updated = updateProjectState(
          project,
          {
            status: stateUpdate.status as ProjectStatus | undefined,
            currentStep: stateUpdate.currentStep,
          },
          stateUpdate.historyEntry
            ? {
                step: stateUpdate.historyEntry.step,
                agentName: stateUpdate.historyEntry.agentName,
                status: stateUpdate.historyEntry.status as StepStatus,
                summary: stateUpdate.historyEntry.summary,
              }
            : undefined,
        )
        return {
          data: {
            result:
              `✅ تم تحديث حالة المشروع "${project}":\n` +
              `   الحالة: ${updated.status}\n` +
              `   الخطوة الحالية: ${updated.currentStep}`,
          },
        }
      }
      case 'write-diary': {
        if (!agentName || !content) throw new Error('اسم الوكيل (agentName) والمحتوى (content) مطلوبان')
        const drawer = writeAgentDiary(project, agentName, content)
        return { data: { result: `✅ تمت إضافة مذكرتك في غرفة ${agentName}Diary بنجاح. معرف: ${drawer.id}` } }
      }
      case 'read-diary': {
        if (!agentName) throw new Error('اسم الوكيل (agentName) مطلوب')
        const diaries = readAgentDiary(project, agentName, 10)
        return { 
          data: { 
            result: diaries.length > 0
              ? diaries.map(d => `[${d.timestamp}] ${d.content}`).join('\n\n---\n\n')
              : '📝 لا توجد مذكرات سابقة.'
          } 
        }
      }
      case 'search-memory': {
        if (!searchQuery) throw new Error('كلمات البحث (searchQuery) مطلوبة')
        const results = searchMemPalace(project, searchQuery)
        return {
          data: {
            result: results.length > 0
              ? `🔍 نتائج البحث:\n\n` + results.map(d => `غرفة: ${d.room_id} | وكيل: ${d.agent}\n${d.content}`).join('\n\n---\n\n')
              : '📭 لم يتم العثور على نتائج تطابق البحث في الذاكرة.'
          }
        }
      }
      default:
        return { data: { result: 'إجراء غير معروف' } }
    }
  },
  mapToolResultToToolResultBlockParam(data, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: data.result,
    }
  },
  userFacingName() {
    return 'Shared Memory'
  },
  getToolUseSummary(input) {
    if (!input) return 'Shared Memory'
    return `${input.action} shared memory for ${input.project}`
  },
  renderToolUseMessage(input) {
    if (!input) return 'Accessing shared memory...'
    const actionLabels: Record<string, string> = {
      read: 'Reading context',
      update: 'Updating context',
      append: 'Appending to context',
      'read-state': 'Reading project state',
      'update-state': 'Updating project state',
      'write-diary': 'Writing agent diary',
      'read-diary': 'Reading agent diary',
      'search-memory': 'Searching Memory Palace',
    }
    return `${actionLabels[input.action as string] ?? input.action} for ${input.project}...`
  },
  renderToolUseTag() { return null },
  renderToolResultMessage() { return null },
  extractSearchText() { return '' },
  renderToolUseErrorMessage(error) { return String(error) },
  async validateInput() { return { result: true } }
} satisfies ToolDef<InputSchema, Output>)

