import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import fs from 'fs'
import path from 'path'
import { getCwd } from '../../utils/cwd.js'

export const MAESTRO_TOOL_NAME = 'MaestroOrchestrator'

interface MaestroTask {
  id: string
  title: string
  description: string
  status: 'pending' | 'in-progress' | 'completed' | 'failed'
  subtasks: string[] // Array of subtask IDs
  parent?: string
  result?: string
}

interface MaestroTree {
  tasks: Record<string, MaestroTask>
  rootId: string
}

function getTreePath() {
  return path.join(getCwd(), '.claude', '.maestro-tree.json')
}

function loadTree(): MaestroTree | null {
  try {
    const p = getTreePath()
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'))
    }
  } catch (e) { }
  return null
}

function saveTree(tree: MaestroTree) {
  const p = getTreePath()
  const dir = path.dirname(p)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(p, JSON.stringify(tree, null, 2), 'utf-8')
}

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum(['init_plan', 'add_subtask', 'update_status', 'get_tree']),
    title: z.string().optional().describe('Main goal or task title'),
    description: z.string().optional(),
    taskId: z.string().optional(),
    parentTaskId: z.string().optional(),
    status: z.enum(['pending', 'in-progress', 'completed', 'failed']).optional(),
    result: z.string().optional()
  })
)

type InputSchema = ReturnType<typeof inputSchema>
export type Output = { result: string }

export const MaestroOrchestratorTool = buildTool({
  name: MAESTRO_TOOL_NAME,
  searchHint: 'Maestro-style task tree orchestrator',
  maxResultSizeChars: 100000,
  async description() {
    return 'Maestro-styled task breakdown and orchestration. Breaks massive goals into a tree of tasks, tracks execution, and manages delegation.'
  },
  async prompt() {
    return 'Use init_plan for new massive goals. Use add_subtask to break down tasks. Use update_status to mark progress.'
  },
  get inputSchema() { return inputSchema() },
  get outputSchema() { return lazySchema(() => z.any()) },
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  async call(input) {
    let tree = loadTree()

    if (input.action === 'init_plan') {
      if (!input.title) throw new Error('title is required for init_plan')
      const rootId = 'task-0'
      tree = {
        rootId,
        tasks: {
          [rootId]: {
            id: rootId,
            title: input.title,
            description: input.description || '',
            status: 'pending',
            subtasks: []
          }
        }
      }
      saveTree(tree)
      return { data: { result: `✅ Maestro Orchestrator initialized with root task: ${rootId}` } }
    }

    if (!tree) throw new Error('No active Maestro tree. Call init_plan first.')

    if (input.action === 'get_tree') {
      let res = `🌳 Maestro Task Tree:\n`
      const printTask = (id: string, indent: string) => {
        const t = tree!.tasks[id]
        if (!t) return
        const statusIcon = t.status === 'completed' ? '✅' : t.status === 'in-progress' ? '⏳' : t.status === 'failed' ? '❌' : '⏳'
        res += `${indent}${statusIcon} [${t.id}] ${t.title} - ${t.status}\n`
        t.subtasks.forEach(subId => printTask(subId, indent + '  '))
      }
      printTask(tree.rootId, '')
      return { data: { result: res } }
    }

    if (input.action === 'add_subtask') {
      if (!input.parentTaskId || !input.title) throw new Error('parentTaskId and title required')
      if (!tree.tasks[input.parentTaskId]) throw new Error('Parent task not found')
      
      const newId = `task-${Object.keys(tree.tasks).length}`
      tree.tasks[newId] = {
        id: newId,
        title: input.title,
        description: input.description || '',
        status: 'pending',
        subtasks: [],
        parent: input.parentTaskId
      }
      tree.tasks[input.parentTaskId].subtasks.push(newId)
      saveTree(tree)
      return { data: { result: `✅ Added subtask ${newId} to ${input.parentTaskId}` } }
    }

    if (input.action === 'update_status') {
      if (!input.taskId || !input.status) throw new Error('taskId and status required')
      if (!tree.tasks[input.taskId]) throw new Error('Task not found')
      
      tree.tasks[input.taskId].status = input.status
      if (input.result) tree.tasks[input.taskId].result = input.result
      
      saveTree(tree)
      return { data: { result: `✅ Updated ${input.taskId} status to ${input.status}` } }
    }

    return { data: { result: 'Unknown action' } }
  },
  mapToolResultToToolResultBlockParam(data, toolUseID) {
    return { tool_use_id: toolUseID, type: 'tool_result', content: data.result }
  },
  userFacingName() { return 'Maestro Orchestrator' },
  getToolUseSummary(i) { return i ? `${i.action} for Maestro` : 'Maestro' },
  renderToolUseMessage() { return `Managing Maestro task tree...` },
  renderToolUseTag() { return null },
  renderToolResultMessage() { return null },
  extractSearchText() { return '' },
  renderToolUseErrorMessage(e) { return String(e) },
  async validateInput() { return { result: true } }
} satisfies ToolDef<InputSchema, Output>)
