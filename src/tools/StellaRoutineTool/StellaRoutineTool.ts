import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import fs from 'fs'
import path from 'path'
import { getCwd } from '../../utils/cwd.js'

export const STELLA_ROUTINE_TOOL_NAME = 'StellaRoutine'

function getBriefPath() {
  return path.join(getCwd(), '.claude', 'stella-briefs.json')
}

interface RoutineLog {
  date: string
  type: 'morning_brief' | 'evening_wrap'
  content: string
}

function loadBriefs(): RoutineLog[] {
  try {
    const p = getBriefPath()
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch (e) {}
  return []
}

function saveBriefs(briefs: RoutineLog[]) {
  const p = getBriefPath()
  const dir = path.dirname(p)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(p, JSON.stringify(briefs, null, 2), 'utf-8')
}

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum(['generate_morning_brief', 'generate_evening_wrap', 'get_latest_brief']),
    content: z.string().optional().describe('The content of the brief or wrap')
  })
)

type InputSchema = ReturnType<typeof inputSchema>
export type Output = { result: string }

export const StellaRoutineTool = buildTool({
  name: STELLA_ROUTINE_TOOL_NAME,
  searchHint: 'manage Stella AI Chief of Staff morning briefs and evening wraps',
  maxResultSizeChars: 100000,
  async description() {
    return 'Manages the daily rhythms (Morning Brief and Evening Wrap) for the Stella Chief of Staff persona.'
  },
  async prompt() {
    return 'Use generate_morning_brief to set up priorities. Use generate_evening_wrap to summarize the day.'
  },
  get inputSchema() { return inputSchema() },
  get outputSchema() { return lazySchema(() => z.any()) },
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  async call(input) {
    const briefs = loadBriefs()
    const today = new Date().toISOString().split('T')[0]

    if (input.action === 'generate_morning_brief') {
      if (!input.content) throw new Error('content is required')
      briefs.push({ date: today, type: 'morning_brief', content: input.content })
      saveBriefs(briefs)
      return { data: { result: `✅ Morning brief saved for ${today}` } }
    }

    if (input.action === 'generate_evening_wrap') {
      if (!input.content) throw new Error('content is required')
      briefs.push({ date: today, type: 'evening_wrap', content: input.content })
      saveBriefs(briefs)
      return { data: { result: `✅ Evening wrap saved for ${today}` } }
    }

    if (input.action === 'get_latest_brief') {
      if (briefs.length === 0) return { data: { result: 'No briefs available.' } }
      const last = briefs[briefs.length - 1]
      return { data: { result: `[${last.date} - ${last.type}]\n${last.content}` } }
    }

    return { data: { result: 'Unknown action' } }
  },
  mapToolResultToToolResultBlockParam(data, toolUseID) {
    return { tool_use_id: toolUseID, type: 'tool_result', content: data.result }
  },
  userFacingName() { return 'Stella Routine' },
  getToolUseSummary(i) { return i ? `${i.action}` : 'Stella Routine' },
  renderToolUseMessage() { return `Running Stella Routine...` },
  renderToolUseTag() { return null },
  renderToolResultMessage() { return null },
  extractSearchText() { return '' },
  renderToolUseErrorMessage(e) { return String(e) },
  async validateInput() { return { result: true } }
} satisfies ToolDef<InputSchema, Output>)
