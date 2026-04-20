import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { projectAnalyzer } from '../../agency/project-analyzer.js'
import * as path from 'path'
import * as fs from 'fs'
import { getOriginalCwd } from '../../bootstrap/state.js'

export const KNOWLEDGE_GRAPH_TOOL_NAME = 'KnowledgeGraph'

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z
      .enum(['scan', 'read-report'])
      .describe(
        'الإجراء المطلوب:\n' +
          '• scan         — إجراء فحص فوري للمشروع وبناء شجرة المعرفة واستخراج العلاقات.\n' +
          '• read-report  — قراءة التقرير المعماري المولد لمعرفة الكلاسات وارتباطاتها بدون تغييرها.\n'
      ),
    projectName: z.string().describe('اسم المشروع الحالي')
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

export const KnowledgeGraphTool = buildTool({
  name: KNOWLEDGE_GRAPH_TOOL_NAME,
  searchHint: 'scan and read project architecture knowledge graph',
  maxResultSizeChars: 500000,
  async description() {
    return (
      'أداة تحليل للمبرمج. توفر مخططاً بيانياً تفصيلياً (Knowledge Graph) للمشروع يوضح ' +
      'الملفات، الكلاسات، الدوال، واعتمادية كل ملف على الآخر (Imports) للمساعدة على اتخاذ ' +
      'قرارات معمارية دقيقة والحد من الأعطال وتجنب البحث العشوائي المتكرر.'
    )
  },
  async prompt() {
    return (
      'استخدم scan مرة واحدة في بداية المشروع لتوليد خارطة كاملة للمشروع، ' +
      'ثم اقرأها باستخدام read-report لتعرف مسارات الملفات التي تريد تعديلها وعلاقاتها قبل كتابة الكود.'
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
  async call({ action, projectName }) {
    if (action === 'scan') {
      const graph = projectAnalyzer.analyze(projectName)
      return { 
        data: { 
          result: `✅ تم توليد وتحديث شجرة العمليات المعرفية بنجاح! تم تحليل ${graph.nodes.length} ملف برمجي. يرجى استخدام read-report لقراءة التقرير المعماري الشامل.` 
        } 
      }
    } 
    else if (action === 'read-report') {
      const cwd = getOriginalCwd()
      const reportPath = path.join(cwd, '.claude', 'agency', 'projects', projectName, 'GRAPH_REPORT.md')
      
      if (fs.existsSync(reportPath)) {
        return { data: { result: fs.readFileSync(reportPath, 'utf-8') } }
      } else {
        return { data: { result: 'التقرير المعماري غير متوفر. الرجاء استخدام (scan) أولاً لتوليد التقرير المعرفي للمشروع.' } }
      }
    }
    
    return { data: { result: 'إجراء غير معروف.' } }
  },
  mapToolResultToToolResultBlockParam(data, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: data.result,
    }
  },
  userFacingName() {
    return 'Knowledge Graph Analyzer'
  },
  getToolUseSummary(input) {
    if (!input) return 'Knowledge Graph Tool'
    return `${input.action} knowledge graph for ${input.projectName}`
  },
  renderToolUseMessage(input) {
    if (!input) return 'Analyzing project architecture...'
    return `${input.action === 'scan' ? 'Scanning and building' : 'Reading'} knowledge graph for ${input.projectName}...`
  },
  renderToolUseTag() { return null },
  renderToolResultMessage() { return null },
  extractSearchText() { return '' },
  renderToolUseErrorMessage(error) { return String(error) },
  async validateInput() { return { result: true } }
} satisfies ToolDef<InputSchema, Output>)
