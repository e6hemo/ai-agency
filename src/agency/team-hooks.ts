/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔒 Team Quality Gate Hooks
 * 
 * Enforces quality standards when teammates finish work or tasks are
 * created/completed. Integrates with the elite-intelligence reputation system.
 * 
 * Hook exit codes:
 *   0 = allow (task proceeds)
 *   2 = reject with feedback (task stays, teammate receives feedback)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { recordReputation, getAgentReputation } from './elite-intelligence.js'
import { writeDailyLog } from './shared-memory.js'
import { loadTeam, completeTask, type TeamTask } from './team-orchestrator.js'
import { evaluateOutput, type RuleContext } from './quality-rules.js'

// ─── Hook: TeammateIdle ──────────────────────────────────────────────────────

export interface TeammateIdleContext {
  teamName: string
  agentName: string
  department: string
  completedTaskIds: string[]
}

/**
 * Runs when a teammate is about to go idle.
 * 
 * Checks:
 * 1. Did the agent complete all assigned tasks?
 * 2. Did the agent record results in shared memory?
 * 3. Are there more unclaimed tasks for this department?
 * 
 * @returns feedback string if agent should keep working, null if OK to idle
 */
export function onTeammateIdle(ctx: TeammateIdleContext): string | null {
  const team = loadTeam(ctx.teamName)
  if (!team) return null

  // Check if there are unclaimed tasks for this department
  const unclaimedTasks = team.tasks.filter(t =>
    t.department === ctx.department &&
    t.status === 'pending' &&
    !t.assignedTo
  )

  if (unclaimedTasks.length > 0) {
    return `لا تزال هناك ${unclaimedTasks.length} مهام غير مطالب بها في قسمك. يرجى المطالبة بالمهمة التالية: "${unclaimedTasks[0].title}"`
  }

  // Check if any assigned tasks are still in-progress
  const inProgressTasks = team.tasks.filter(t =>
    t.assignedTo === ctx.agentName &&
    t.status === 'in-progress'
  )

  if (inProgressTasks.length > 0) {
    return `لديك ${inProgressTasks.length} مهام قيد التنفيذ لم تكتمل بعد. أكمل: "${inProgressTasks[0].title}" أولاً.`
  }

  // Agent is legitimately done
  writeDailyLog('note', `${ctx.agentName} أنهى جميع مهامه وأصبح خاملاً`, {
    agent: ctx.agentName,
  })

  return null
}

// ─── Hook: TaskCreated ───────────────────────────────────────────────────────

export interface TaskCreatedContext {
  teamName: string
  task: TeamTask
  createdBy: string
}

/**
 * Runs when a new task is being created.
 * 
 * Validates:
 * 1. Task has a meaningful title and description
 * 2. Task has a valid department
 * 3. Task dependencies reference existing tasks
 * 
 * @returns feedback string if task creation should be blocked, null if OK
 */
export function onTaskCreated(ctx: TaskCreatedContext): string | null {
  const { task, teamName } = ctx

  // Validate title
  if (!task.title || task.title.trim().length < 5) {
    return 'عنوان المهمة قصير جداً. يجب أن يكون واضحاً ووصفياً (5 أحرف على الأقل).'
  }

  // Validate description
  if (!task.description || task.description.trim().length < 10) {
    return 'وصف المهمة غير كافٍ. أضف تفاصيل كافية ليتمكن الزميل من تنفيذها دون أسئلة.'
  }

  // Validate dependencies
  const team = loadTeam(teamName)
  if (team && task.dependencies.length > 0) {
    for (const depId of task.dependencies) {
      const depTask = team.tasks.find(t => t.id === depId)
      if (!depTask) {
        return `المهمة تعتمد على مهمة غير موجودة: ${depId}. تحقق من معرّفات المهام.`
      }
    }
  }

  writeDailyLog('note', `مهمة جديدة: "${task.title}" بواسطة ${ctx.createdBy}`, {
    agent: ctx.createdBy,
  })

  return null
}

// ─── Hook: TaskCompleted ─────────────────────────────────────────────────────

export interface TaskCompletedContext {
  teamName: string
  taskId: string
  agentName: string
  output: string
}

/**
 * Runs when a task is being marked as complete.
 * 
 * QA Checks:
 * 1. Output is not empty or trivially short
 * 2. Record the reputation entry for the completing agent
 * 3. Check if agent has low trust score (warn the lead)
 * 
 * @returns feedback string if completion should be blocked, null if OK
 */
export function onTaskCompleted(ctx: TaskCompletedContext): string | null {
  const { taskId, agentName, output, teamName } = ctx

  // Validate output quality
  if (!output || output.trim().length < 20) {
    return 'المخرجات فارغة أو قصيرة جداً. يرجى تقديم مخرجات مفصلة قبل وضع علامة الاكتمال.'
  }

  const team = loadTeam(teamName)
  const task = team?.tasks.find(t => t.id === taskId)
  if (!task) {
    return `المهمة "${taskId}" غير موجودة في الفريق.`
  }

  // ─── Quality Rules Evaluation ──────────────────────────────────
  const ruleContext: RuleContext = {
    agentName,
    department: task.department,
    taskTitle: task.title,
    taskDescription: task.description,
  }

  const qualityReport = evaluateOutput(output, ruleContext)

  if (!qualityReport.passed) {
    // Record rejection in reputation
    recordReputation({
      agent: agentName,
      project: team!.projectName,
      task: task.title,
      outcome: 'rejected',
      reviewer: 'quality-rules-engine',
      feedback: `فشل في ${qualityReport.failedRules} قاعدة جودة (النتيجة: ${qualityReport.score}/100)`,
    })

    writeDailyLog('step-reject', `❌ مخرجات ${agentName} رُفضت بواسطة Quality Rules (${qualityReport.score}/100)`, {
      agent: 'quality-rules-engine',
      details: qualityReport.summary.substring(0, 300),
    })

    return qualityReport.summary
  }
  // ─────────────────────────────────────────────────────────────────

  // Record positive reputation
  recordReputation({
    agent: agentName,
    project: team!.projectName,
    task: task.title,
    outcome: 'completed',
    reviewer: 'system-qa',
    feedback: `أكمل المهمة بنجاح (جودة: ${qualityReport.score}/100, تحذيرات: ${qualityReport.warnings}).`,
  })

  // Check reputation warnings
  const rep = getAgentReputation(agentName)
  if (rep.trustScore < 40) {
    writeDailyLog('step-reject', `⚠️ ${agentName} لديه درجة ثقة منخفضة (${rep.trustScore}/100) — يحتاج مراجعة دقيقة.`, {
      agent: 'system-qa',
      details: `مهام مرفوضة: ${rep.rejected}, فشل: ${rep.failed}`,
    })
  }

  return null
}

// ─── Hook: Task Rejection (QA Failed) ────────────────────────────────────────

export interface TaskRejectedContext {
  teamName: string
  taskId: string
  agentName: string
  reason: string
  reviewerName: string
}

/**
 * Called when a task output is rejected during QA review.
 * Records negative reputation and sends feedback to the agent.
 */
export function onTaskRejected(ctx: TaskRejectedContext): void {
  recordReputation({
    agent: ctx.agentName,
    project: '',
    task: ctx.taskId,
    outcome: 'rejected',
    reviewer: ctx.reviewerName,
    feedback: ctx.reason,
  })

  writeDailyLog('step-reject', `مهمة مرفوضة من ${ctx.agentName}: ${ctx.reason}`, {
    agent: ctx.reviewerName,
  })
}
