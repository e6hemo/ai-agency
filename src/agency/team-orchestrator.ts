/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🏗️ Team Orchestrator — Parallel Agent Teams Engine
 * 
 * Replaces the sequential pipeline model with a parallel multi-agent team
 * architecture where agents work simultaneously, communicate directly,
 * and coordinate through shared task lists.
 * 
 * Architecture:
 *   Team Lead (project-manager)
 *     ├── Teammate A (marketing-strategist)  ──→ owns tasks 1,2,3
 *     ├── Teammate B (full-stack-developer)  ──→ owns tasks 4,5
 *     ├── Teammate C (ui-ux-designer)        ──→ owns tasks 6,7
 *     └── Shared Task List + Mailbox
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs'
import * as path from 'path'
import { getOriginalCwd } from '../bootstrap/state.js'
import { updateProjectContext, getProjectContext, updateProjectState, writeDailyLog } from './shared-memory.js'
import { claimTaskSafe } from './task-lock-manager.js'
import { callWithRateLimit } from './rate-limiter.js'

// ─── Types ───────────────────────────────────────────────────────────────────

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low'
export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'blocked'

export interface TeamTask {
  id: string
  title: string
  description: string
  assignedTo: string | null      // teammate name or null (unassigned)
  status: TaskStatus
  priority: TaskPriority
  department: string
  dependencies: string[]         // task IDs this task depends on
  createdAt: string
  completedAt?: string
  output?: string
}

export interface TeamConfig {
  teamName: string
  projectName: string
  leadAgent: string
  teammates: TeammateEntry[]
  tasks: TeamTask[]
  createdAt: string
  status: 'active' | 'completed' | 'disbanded'
}

export interface TeammateEntry {
  name: string
  agentType: string
  department: string
  assignedTasks: string[]
  status: 'idle' | 'working' | 'done' | 'error'
  joinedAt: string
}

export interface AgencyConfig {
  env?: Record<string, string>
  agency: {
    name: string
    version: string
    language: string
    defaultModel: string
    teamMode?: boolean
    teammateMode?: string
    maxTeamSize?: number
    requirePlanApproval?: boolean
    departments: Record<string, {
      emoji: string
      label: string
      lead: string
      members: string[]
    }>
    pipelines: Record<string, {
      description: string
      steps: string[]
    }>
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTeamsDir(): string {
  const cwd = getOriginalCwd()
  const dir = path.join(cwd, '.claude', 'agency', 'teams')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getTeamPath(teamName: string): string {
  return path.join(getTeamsDir(), `${teamName}.json`)
}

function loadAgencyConfig(): AgencyConfig {
  const cwd = getOriginalCwd()
  const configPath = path.join(cwd, '.claude', 'agency-config.json')
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  } catch {
    throw new Error('Cannot load agency-config.json — ensure the agency is configured.')
  }
}

function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
}

// ─── Team CRUD ───────────────────────────────────────────────────────────────

export function loadTeam(teamName: string): TeamConfig | null {
  const teamPath = getTeamPath(teamName)
  if (!fs.existsSync(teamPath)) return null
  try {
    return JSON.parse(fs.readFileSync(teamPath, 'utf-8'))
  } catch {
    return null
  }
}

export function saveTeam(team: TeamConfig): void {
  const teamPath = getTeamPath(team.teamName)
  fs.writeFileSync(teamPath, JSON.stringify(team, null, 2), 'utf-8')
}

export function listActiveTeams(): TeamConfig[] {
  const dir = getTeamsDir()
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as TeamConfig
        } catch { return null }
      })
      .filter((t): t is TeamConfig => t !== null && t.status === 'active')
  } catch {
    return []
  }
}

// ─── Core: Create Agency Team ────────────────────────────────────────────────

/**
 * Creates a new Agent Team for a project.
 * 
 * @param projectName - Name of the project
 * @param request - User's original request / brief
 * @param pipelineName - Optional pipeline to use for task generation
 * @returns TeamConfig for the newly created team
 */
export function createAgencyTeam(
  projectName: string,
  request: string,
  pipelineName?: string,
): TeamConfig {
  const config = loadAgencyConfig()

  // Determine which departments are needed
  const departments = pipelineName
    ? resolvePipelineDepartments(config, pipelineName)
    : inferDepartmentsFromRequest(config, request)

  const teamName = `team-${projectName}-${Date.now().toString(36)}`

  // Build teammates from department leads
  const teammates: TeammateEntry[] = departments.map(dept => {
    const deptConfig = config.agency.departments[dept]
    if (!deptConfig) throw new Error(`Department "${dept}" not found in agency config`)

    return {
      name: deptConfig.lead,
      agentType: deptConfig.lead,
      department: dept,
      assignedTasks: [],
      status: 'idle' as const,
      joinedAt: new Date().toISOString(),
    }
  })

  // Build task list from pipeline or auto-generate
  const tasks = pipelineName
    ? buildTasksFromPipeline(config, pipelineName, request)
    : buildTasksFromDepartments(departments, config, request)

  // Assign tasks to teammates
  for (const task of tasks) {
    const teammate = teammates.find(t => t.department === task.department)
    if (teammate) {
      task.assignedTo = teammate.name
      teammate.assignedTasks.push(task.id)
    }
  }

  const team: TeamConfig = {
    teamName,
    projectName,
    leadAgent: 'project-manager',
    teammates,
    tasks,
    createdAt: new Date().toISOString(),
    status: 'active',
  }

  saveTeam(team)

  // Also initialize the project in shared-memory
  updateProjectState(projectName, {
    status: 'in-progress',
    currentStep: 'Team Orchestration',
  })

  // Write rich team context for the lead
  const teamContext = buildTeamContextMarkdown(team, request)
  updateProjectContext(projectName, teamContext)

  // Log to daily log
  writeDailyLog('pipeline-run', `فريق جديد "${teamName}" بـ ${teammates.length} أعضاء`, {
    agent: 'project-manager',
    pipeline: pipelineName || 'auto',
    details: `الأقسام: ${departments.join(', ')}`
  })

  return team
}

// ─── Pipeline → Departments Resolution ───────────────────────────────────────

function resolvePipelineDepartments(config: AgencyConfig, pipelineName: string): string[] {
  const pipeline = config.agency.pipelines[pipelineName]
  if (!pipeline) throw new Error(`Pipeline "${pipelineName}" not found`)

  // Map agent names back to their departments
  const departments = new Set<string>()
  for (const step of pipeline.steps) {
    for (const [deptName, deptConfig] of Object.entries(config.agency.departments)) {
      if (deptConfig.lead === step || deptConfig.members.includes(step)) {
        departments.add(deptName)
      }
    }
  }
  return [...departments]
}

function inferDepartmentsFromRequest(config: AgencyConfig, request: string): string[] {
  const lower = request.toLowerCase()
  const departments: string[] = []

  // Always include management
  departments.push('management')

  // Keyword-based detection
  const keywordMap: Record<string, string[]> = {
    marketing: ['تسويق', 'حملة', 'إعلان', 'marketing', 'campaign', 'ads', 'growth', 'نمو'],
    development: ['برمجة', 'موقع', 'تطبيق', 'website', 'app', 'code', 'api', 'develop', 'build'],
    design: ['تصميم', 'واجهة', 'هوية', 'design', 'ui', 'ux', 'brand', 'logo'],
    media: ['فيديو', 'ميديا', 'video', 'media', 'content', 'محتوى'],
    seo: ['seo', 'بحث', 'قوقل', 'google', 'search', 'optimize'],
    data: ['بيانات', 'تحليل', 'data', 'analytics', 'report', 'تقرير'],
    research: ['بحث', 'دراسة', 'research', 'study', 'analyze', 'منافسين'],
  }

  for (const [dept, keywords] of Object.entries(keywordMap)) {
    if (keywords.some(kw => lower.includes(kw))) {
      departments.push(dept)
    }
  }

  // If nothing matched, include dev + design as defaults
  if (departments.length <= 1) {
    departments.push('development', 'design')
  }

  return [...new Set(departments)]
}

// ─── Task Generation ─────────────────────────────────────────────────────────

function buildTasksFromPipeline(
  config: AgencyConfig,
  pipelineName: string,
  request: string,
): TeamTask[] {
  const pipeline = config.agency.pipelines[pipelineName]
  if (!pipeline) return []

  const tasks: TeamTask[] = []
  let prevTaskId: string | null = null

  for (let i = 0; i < pipeline.steps.length; i++) {
    const agentName = pipeline.steps[i]
    const department = findDepartmentForAgent(config, agentName) || 'management'
    const taskId = generateTaskId()

    tasks.push({
      id: taskId,
      title: `خطوة ${i + 1}: ${agentName}`,
      description: `تنفيذ المهمة بواسطة ${agentName} ضمن مسار "${pipelineName}". المطلوب: ${request}`,
      assignedTo: null,
      status: prevTaskId ? 'blocked' : 'pending',
      priority: i === 0 ? 'critical' : 'high',
      department,
      dependencies: prevTaskId ? [prevTaskId] : [],
      createdAt: new Date().toISOString(),
    })

    // For team mode, only first 2 tasks depend on each other
    // The rest can run in parallel after the planning phase
    if (i < 2) {
      prevTaskId = taskId
    }
  }

  return tasks
}

function buildTasksFromDepartments(
  departments: string[],
  config: AgencyConfig,
  request: string,
): TeamTask[] {
  const tasks: TeamTask[] = []

  // Phase 1: Planning (by project-manager) — no dependencies
  const planTaskId = generateTaskId()
  tasks.push({
    id: planTaskId,
    title: 'التخطيط والتحليل',
    description: `تحليل المتطلبات ووضع خطة العمل: ${request}`,
    assignedTo: null,
    status: 'pending',
    priority: 'critical',
    department: 'management',
    dependencies: [],
    createdAt: new Date().toISOString(),
  })

  // Phase 2: Parallel tasks for each department (depend on planning)
  const parallelTaskIds: string[] = []
  for (const dept of departments) {
    if (dept === 'management') continue
    const deptConfig = config.agency.departments[dept]
    if (!deptConfig) continue

    const taskId = generateTaskId()
    parallelTaskIds.push(taskId)
    tasks.push({
      id: taskId,
      title: `${deptConfig.emoji} ${deptConfig.label}: تنفيذ المهام`,
      description: `المطلوب من قسم ${deptConfig.label}: تنفيذ الجزء المتعلق بالمتطلبات التالية:\n${request}`,
      assignedTo: null,
      status: 'blocked',
      priority: 'high',
      department: dept,
      dependencies: [planTaskId],
      createdAt: new Date().toISOString(),
    })
  }

  // Phase 3: Review & Integration (depends on all parallel tasks)
  tasks.push({
    id: generateTaskId(),
    title: 'المراجعة والدمج النهائي',
    description: 'مراجعة جميع المخرجات، دمجها، وتقديم التقرير النهائي للمستخدم.',
    assignedTo: null,
    status: 'blocked',
    priority: 'high',
    department: 'management',
    dependencies: parallelTaskIds,
    createdAt: new Date().toISOString(),
  })

  return tasks
}

function findDepartmentForAgent(config: AgencyConfig, agentName: string): string | null {
  for (const [deptName, deptConfig] of Object.entries(config.agency.departments)) {
    if (deptConfig.lead === agentName || deptConfig.members.includes(agentName)) {
      return deptName
    }
  }
  return null
}

// ─── Task Management ─────────────────────────────────────────────────────────

/**
 * Claim a task by a teammate. Uses pessimistic atomic file locks to prevent race conditions.
 */
export async function claimTask(
  teamName: string,
  taskId: string,
  agentName: string
): Promise<TeamTask | null> {
  const result = await claimTaskSafe(
    teamName,
    taskId,
    agentName,
    loadTeam,
    saveTeam
  )
  
  if (!result.success) {
    console.warn(`⚠️ claimTask فشل: ${result.reason}`)
    return null
  }

  writeDailyLog('note', `${agentName} بدأ المهمة`, {
    agent: agentName
  })

  return result.task
}

/**
 * Complete a task and unblock dependent tasks.
 */
export function completeTask(teamName: string, taskId: string, output: string): TeamTask | null {
  const team = loadTeam(teamName)
  if (!team) return null

  const task = team.tasks.find(t => t.id === taskId)
  if (!task) return null

  task.status = 'completed'
  task.completedAt = new Date().toISOString()
  task.output = output

  // Unblock tasks that depended on this one
  for (const t of team.tasks) {
    if (t.status === 'blocked' && t.dependencies.includes(taskId)) {
      const allDepsCompleted = t.dependencies.every(depId => {
        const dep = team.tasks.find(d => d.id === depId)
        return dep?.status === 'completed'
      })
      if (allDepsCompleted) {
        t.status = 'pending'
      }
    }
  }

  saveTeam(team)

  writeDailyLog('pipeline-done', `مهمة مكتملة: ${task.title}`, {
    agent: task.assignedTo || 'unknown',
    details: output.substring(0, 200),
  })

  // Check if all tasks are completed
  const allDone = team.tasks.every(t => t.status === 'completed')
  if (allDone) {
    team.status = 'completed'
    saveTeam(team)

    updateProjectState(team.projectName, { status: 'completed', currentStep: 'Done' })
    writeDailyLog('pipeline-done', `🎉 الفريق "${teamName}" أكمل جميع المهام!`, {
      agent: 'project-manager',
    })
  }

  return task
}

/**
 * Get the next available (unblocked, unassigned) task for a given department.
 */
export function getNextAvailableTask(teamName: string, department: string): TeamTask | null {
  const team = loadTeam(teamName)
  if (!team) return null

  return team.tasks.find(t =>
    t.department === department &&
    t.status === 'pending' &&
    !t.assignedTo
  ) || null
}

/**
 * Get team progress summary.
 */
export function getTeamProgress(teamName: string): {
  total: number
  completed: number
  inProgress: number
  pending: number
  blocked: number
  percentComplete: number
} | null {
  const team = loadTeam(teamName)
  if (!team) return null

  const total = team.tasks.length
  const completed = team.tasks.filter(t => t.status === 'completed').length
  const inProgress = team.tasks.filter(t => t.status === 'in-progress').length
  const pending = team.tasks.filter(t => t.status === 'pending').length
  const blocked = team.tasks.filter(t => t.status === 'blocked').length

  return {
    total,
    completed,
    inProgress,
    pending,
    blocked,
    percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0,
  }
}

// ─── Context Builder ─────────────────────────────────────────────────────────

function buildTeamContextMarkdown(team: TeamConfig, request: string): string {
  let md = `# 🏗️ فريق عمل: ${team.projectName}\n\n`
  md += `> **النمط:** عمل فريقي متوازي (Agent Teams)\n`
  md += `> **القائد:** ${team.leadAgent}\n`
  md += `> **الأعضاء:** ${team.teammates.length}\n`
  md += `> **الحالة:** ${team.status}\n\n`

  md += `## 📋 متطلبات المستخدم\n${request}\n\n`

  md += `## 👥 أعضاء الفريق\n`
  for (const mate of team.teammates) {
    md += `- **${mate.name}** (${mate.department}) — ${mate.status}\n`
  }
  md += '\n'

  md += `## 📝 قائمة المهام المشتركة\n`
  for (const task of team.tasks) {
    const icon = task.status === 'completed' ? '✅'
               : task.status === 'in-progress' ? '🔄'
               : task.status === 'blocked' ? '🔒'
               : '⏳'
    const assignee = task.assignedTo ? ` → ${task.assignedTo}` : ''
    md += `- ${icon} **${task.title}**${assignee}\n`
    if (task.dependencies.length > 0) {
      md += `  - يعتمد على: ${task.dependencies.join(', ')}\n`
    }
  }
  md += '\n'

  md += `## 📨 بروتوكول التواصل\n`
  md += `- استخدم \`SendMessage\` لإرسال رسالة لزميل محدد بالاسم.\n`
  md += `- استخدم \`SendMessage\` مع \`to: "*"\` للبث لجميع الزملاء.\n`
  md += `- عند إكمال مهمة، حدّث حالتها عبر \`TaskUpdate\`.\n`
  md += `- عند الحاجة لمساعدة، أرسل رسالة للقائد \`team-lead\`.\n\n`

  md += `## ⚠️ قواعد العمل الجماعي\n`
  md += `1. **لا تعدّل ملفات زميلك** — كل عضو يملك ملفاته الخاصة.\n`
  md += `2. **أبلغ عن التقدم** — حدّث المهمة بعد كل خطوة مهمة.\n`
  md += `3. **شارك الاكتشافات** — إذا وجدت معلومة مفيدة لزميل، أرسلها فوراً.\n`
  md += `4. **لا تبدأ مهمة محظورة** — انتظر حتى تكتمل المهام المطلوبة قبلها.\n`

  return md
}

// ─── Disband Team ────────────────────────────────────────────────────────────

export function disbandTeam(teamName: string): boolean {
  const team = loadTeam(teamName)
  if (!team) return false

  team.status = 'disbanded'
  saveTeam(team)

  writeDailyLog('note', `تم حل الفريق "${teamName}"`, { agent: 'project-manager' })
  return true
}

/**
 * Generate a Markdown summary of all team results.
 */
export function synthesizeTeamResults(teamName: string): string {
  const team = loadTeam(teamName)
  if (!team) return 'الفريق غير موجود.'

  let md = `# 📊 نتائج الفريق: ${team.projectName}\n\n`

  const progress = getTeamProgress(teamName)
  if (progress) {
    md += `> اكتمال: ${progress.percentComplete}% (${progress.completed}/${progress.total})\n\n`
  }

  for (const task of team.tasks) {
    const icon = task.status === 'completed' ? '✅' : '⏳'
    md += `## ${icon} ${task.title}\n`
    md += `- **المنفذ:** ${task.assignedTo || 'غير محدد'}\n`
    md += `- **الحالة:** ${task.status}\n`
    if (task.output) {
      md += `- **المخرجات:**\n${task.output}\n`
    }
    md += '\n'
  }

  return md
}
