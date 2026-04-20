/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 📬 Team Mailbox Bridge
 * 
 * Bridges the agency's internal memo system (elite-intelligence.ts) with
 * the native Agent Teams mailbox infrastructure. Ensures that:
 * 
 * 1. Memos sent via sendMemo() are also routed through the team mailbox
 * 2. Task completions auto-record reputation entries
 * 3. Daily log entries are created for all team communications
 * 4. The lead receives aggregated status updates from all departments
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
  sendMemo,
  getMemosForAgent,
  acknowledgeMemo,
  recordReputation,
  getSmartContextForAgent,
  type AgentMemo,
} from './elite-intelligence.js'
import {
  writeDailyLog,
  appendToProjectContext,
} from './shared-memory.js'
import {
  loadTeam,
  getTeamProgress,
  type TeamConfig,
} from './team-orchestrator.js'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TeamMessage {
  from: string
  to: string          // teammate name or '*' for broadcast
  content: string
  type: 'chat' | 'status-update' | 'finding' | 'question' | 'handoff'
  timestamp: string
  teamName: string
}

export interface TeamStatusReport {
  teamName: string
  timestamp: string
  departments: DepartmentStatus[]
  overallProgress: number
  activeAgents: number
  blockedTasks: number
}

export interface DepartmentStatus {
  name: string
  agent: string
  status: 'working' | 'idle' | 'done' | 'blocked'
  currentTask: string | null
  completedTasks: number
  totalTasks: number
}

// ─── Message Routing ─────────────────────────────────────────────────────────

/**
 * Send a message between team members.
 * Routes through both the native mailbox and the agency memo system.
 */
export function sendTeamMessage(msg: TeamMessage): void {
  // 1. Log to daily log
  writeDailyLog('memo-sent', `${msg.from} → ${msg.to}: ${msg.content.substring(0, 100)}`, {
    agent: msg.from,
    details: msg.content,
  })

  // 2. Also create a memo in the agency system for persistence
  if (msg.to !== '*') {
    sendMemo({
      from: msg.from,
      to: msg.to,
      type: msg.type === 'finding' ? 'tip' : msg.type === 'question' ? 'lesson' : 'tip',
      content: msg.content,
      project: msg.teamName,
      severity: 'medium',
    })
  }
}

/**
 * Broadcast a finding to all team members.
 * Used when an agent discovers something useful for the whole team.
 */
export function broadcastFinding(
  teamName: string,
  fromAgent: string,
  finding: string,
): void {
  const team = loadTeam(teamName)
  if (!team) return

  // Send as memo to all teammates
  for (const mate of team.teammates) {
    if (mate.name === fromAgent) continue
    sendMemo({
      from: fromAgent,
      to: mate.name,
      type: 'tip',
      content: finding,
      project: team.projectName,
      severity: 'medium',
    })
  }

  // Also append to shared project context
  appendToProjectContext(
    team.projectName,
    `\n---\n**📢 اكتشاف من ${fromAgent}:**\n${finding}\n`
  )

  writeDailyLog('research-crawl', `${fromAgent} شارك اكتشافاً مع الفريق`, {
    agent: fromAgent,
    details: finding.substring(0, 200),
  })
}

// ─── Status Reporting ────────────────────────────────────────────────────────

/**
 * Generate a comprehensive team status report.
 * Called by the team lead to check on all departments.
 */
export function generateTeamStatusReport(teamName: string): TeamStatusReport | null {
  const team = loadTeam(teamName)
  if (!team) return null

  const progress = getTeamProgress(teamName)
  if (!progress) return null

  const departments: DepartmentStatus[] = team.teammates.map(mate => {
    const mateTasks = team.tasks.filter(t => t.assignedTo === mate.name)
    const currentTask = mateTasks.find(t => t.status === 'in-progress')
    const completedCount = mateTasks.filter(t => t.status === 'completed').length

    return {
      name: mate.department,
      agent: mate.name,
      status: currentTask ? 'working'
             : completedCount === mateTasks.length && mateTasks.length > 0 ? 'done'
             : mateTasks.some(t => t.status === 'blocked') ? 'blocked'
             : 'idle',
      currentTask: currentTask?.title || null,
      completedTasks: completedCount,
      totalTasks: mateTasks.length,
    }
  })

  return {
    teamName,
    timestamp: new Date().toISOString(),
    departments,
    overallProgress: progress.percentComplete,
    activeAgents: departments.filter(d => d.status === 'working').length,
    blockedTasks: progress.blocked,
  }
}

/**
 * Format the status report as a readable Markdown string.
 */
export function formatTeamStatusReport(report: TeamStatusReport): string {
  let md = `# 📊 تقرير حالة الفريق: ${report.teamName}\n\n`
  md += `> ⏱️ ${new Date(report.timestamp).toLocaleString('ar-SA')}\n`
  md += `> 📈 الاكتمال: **${report.overallProgress}%**\n`
  md += `> 👷 عاملون: ${report.activeAgents} | 🔒 محظور: ${report.blockedTasks}\n\n`

  md += `## الأقسام\n\n`
  md += `| القسم | الوكيل | الحالة | المهمة الحالية | الاكتمال |\n`
  md += `|-------|--------|--------|---------------|----------|\n`

  for (const dept of report.departments) {
    const statusIcon = dept.status === 'working' ? '🔄'
                     : dept.status === 'done' ? '✅'
                     : dept.status === 'blocked' ? '🔒'
                     : '⏸️'
    md += `| ${dept.name} | ${dept.agent} | ${statusIcon} ${dept.status} | ${dept.currentTask || '—'} | ${dept.completedTasks}/${dept.totalTasks} |\n`
  }

  return md
}

// ─── Context Injection ───────────────────────────────────────────────────────

/**
 * Build the full context that a teammate receives when spawned.
 * Combines: wake-up context + unread memos + team task assignments.
 */
export function buildTeammateSpawnContext(
  teamName: string,
  agentName: string,
): string {
  const team = loadTeam(teamName)
  if (!team) return ''

  let context = ''

  // 1. Smart context from elite-intelligence (wake-up + reputation + memos)
  const smartCtx = getSmartContextForAgent(agentName)
  if (smartCtx) {
    context += smartCtx + '\n'
  }

  // 2. Team-specific context
  const mate = team.teammates.find(m => m.name === agentName)
  if (mate) {
    context += `\n> 🏗️ **أنت عضو في فريق "${team.teamName}"** — مشروع: ${team.projectName}\n`
    context += `> 📂 قسمك: ${mate.department}\n`
    context += `> 👥 زملاؤك: ${team.teammates.filter(m => m.name !== agentName).map(m => m.name).join(', ')}\n\n`

    // List assigned tasks
    const myTasks = team.tasks.filter(t => t.assignedTo === agentName)
    if (myTasks.length > 0) {
      context += `## مهامك المحددة:\n`
      for (const task of myTasks) {
        const icon = task.status === 'completed' ? '✅'
                   : task.status === 'in-progress' ? '🔄'
                   : task.status === 'blocked' ? '🔒'
                   : '⏳'
        context += `- ${icon} **${task.title}**: ${task.description.substring(0, 150)}\n`
      }
      context += '\n'
    }
  }

  // 3. Unread memos
  const unread = getMemosForAgent(agentName, true)
  if (unread.length > 0) {
    context += `## 📨 رسائل غير مقروءة (${unread.length}):\n`
    for (const memo of unread.slice(-5)) {
      context += `- من **${memo.from}**: ${memo.content}\n`
      acknowledgeMemo(memo.id)
    }
    context += '\n'
  }

  return context
}
