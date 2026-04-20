import * as fs from 'fs'
import * as path from 'path'
import { getOriginalCwd } from '../bootstrap/state.js'
import { buildPersonaPrompt } from './agent-personas.js'

// ═══════════════════════════════════════════════════════════════════════════════
// 🌅 الصحوة الذاتية (Wake-up Context Engine)
// عند تشغيل الوكالة، يقرأ كل وكيل آخر 5 مهام أنجزها ويبني ملخص صحوة
// ═══════════════════════════════════════════════════════════════════════════════

export interface WakeUpContext {
  agent: string
  recentTasks: string[]
  activeProjects: string[]
  lessonsLearned: string[]
  lastActivity: string | null
  summary: string
}

export function getWakeUpContext(agentName: string): WakeUpContext {
  const cwd = getOriginalCwd()
  const projectsDir = path.join(cwd, '.claude', 'agency', 'projects')
  const recentTasks: string[] = []
  const activeProjects: string[] = []
  let lastActivity: string | null = null

  // Scan all projects for this agent's activity
  if (fs.existsSync(projectsDir)) {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true }).filter(d => d.isDirectory())
    
    for (const dir of dirs) {
      try {
        const statePath = path.join(projectsDir, dir.name, 'state.json')
        if (!fs.existsSync(statePath)) continue
        
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
        
        // Check if this agent participated in this project
        const agentHistory = (state.history || []).filter(
          (h: any) => h.agentName === agentName || h.agent === agentName
        )
        
        if (agentHistory.length > 0) {
          // Collect recent tasks from this agent
          for (const entry of agentHistory.slice(-3)) {
            recentTasks.push(`[${dir.name}] ${entry.summary || entry.step || 'مهمة مكتملة'} (${entry.status})`)
            if (!lastActivity || entry.timestamp > lastActivity) {
              lastActivity = entry.timestamp
            }
          }
          
          // Track active projects
          if (state.status === 'in-progress' || state.status === 'pending') {
            activeProjects.push(dir.name)
          }
        }
      } catch { /* skip corrupted project */ }
    }
  }

  // Load lessons learned for this agent
  const lessonsLearned = getLessonsForAgent(agentName)

  // Build the summary
  const summary = buildWakeUpSummary(agentName, recentTasks, activeProjects, lessonsLearned, lastActivity)

  return {
    agent: agentName,
    recentTasks: recentTasks.slice(-5),
    activeProjects,
    lessonsLearned: lessonsLearned.slice(-5),
    lastActivity,
    summary
  }
}

function buildWakeUpSummary(
  agent: string,
  tasks: string[],
  activeProjects: string[],
  lessons: string[],
  lastActivity: string | null
): string {
  let summary = `\n> 🌅 **ملخص الصحوة لـ ${agent}**\n`

  if (lastActivity) {
    const lastDate = new Date(lastActivity)
    const now = new Date()
    const diffHours = Math.round((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60))
    summary += `> آخر نشاط: منذ ${diffHours} ساعة\n`
  } else {
    summary += `> هذه أول جلسة لك. مرحباً!\n`
  }

  if (activeProjects.length > 0) {
    summary += `> 📂 مشاريع نشطة: ${activeProjects.join(', ')}\n`
  }

  if (tasks.length > 0) {
    summary += `> 📝 آخر المهام:\n`
    tasks.slice(-3).forEach(t => { summary += `>   • ${t}\n` })
  }

  if (lessons.length > 0) {
    summary += `> ⚠️ دروس مستفادة (لا تكرر هذه الأخطاء):\n`
    lessons.slice(-3).forEach(l => { summary += `>   • ${l}\n` })
  }

  return summary
}

// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ نظام السمعة الداخلية (Agent Reputation & Trust Score)
// كل وكيل يحصل على درجة ثقة بناءً على أدائه
// ═══════════════════════════════════════════════════════════════════════════════

export interface ReputationEntry {
  agent: string
  project: string
  task: string
  outcome: 'approved' | 'rejected' | 'completed' | 'failed'
  reviewer: string
  feedback: string
  timestamp: string
}

export interface AgentReputation {
  agent: string
  totalTasks: number
  approvedFirstTry: number
  rejected: number
  failed: number
  trustScore: number        // 0—100
  streakCurrent: number     // consecutive successes
  streakBest: number
  recentFeedback: string[]
}

function getReputationFilePath(): string {
  const cwd = getOriginalCwd()
  const dir = path.join(cwd, '.claude', 'agency')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'reputation.json')
}

function loadReputationData(): ReputationEntry[] {
  const filePath = getReputationFilePath()
  if (!fs.existsSync(filePath)) return []
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return []
  }
}

function saveReputationData(data: ReputationEntry[]): void {
  fs.writeFileSync(getReputationFilePath(), JSON.stringify(data, null, 2), 'utf-8')
}

export function recordReputation(entry: Omit<ReputationEntry, 'timestamp'>): ReputationEntry {
  const data = loadReputationData()
  const fullEntry: ReputationEntry = {
    ...entry,
    timestamp: new Date().toISOString()
  }
  data.push(fullEntry)
  
  // Keep only last 500 entries to keep file size small
  if (data.length > 500) data.splice(0, data.length - 500)
  
  saveReputationData(data)
  return fullEntry
}

export function getAgentReputation(agentName: string): AgentReputation {
  const data = loadReputationData()
  const agentData = data.filter(d => d.agent === agentName)

  const totalTasks = agentData.length
  const approvedFirstTry = agentData.filter(d => d.outcome === 'approved' || d.outcome === 'completed').length
  const rejected = agentData.filter(d => d.outcome === 'rejected').length
  const failed = agentData.filter(d => d.outcome === 'failed').length

  // Trust Score = weighted success rate (0-100)
  // approved = +2 points, completed = +1, rejected = -1, failed = -3
  let rawScore = 50  // start neutral
  for (const entry of agentData) {
    switch (entry.outcome) {
      case 'approved': rawScore += 2; break
      case 'completed': rawScore += 1; break
      case 'rejected': rawScore -= 1; break
      case 'failed': rawScore -= 3; break
    }
  }
  const trustScore = Math.max(0, Math.min(100, rawScore))

  // Streak calculation
  let streakCurrent = 0
  let streakBest = 0
  let tempStreak = 0
  for (const entry of agentData) {
    if (entry.outcome === 'approved' || entry.outcome === 'completed') {
      tempStreak++
      if (tempStreak > streakBest) streakBest = tempStreak
    } else {
      tempStreak = 0
    }
  }
  streakCurrent = tempStreak

  // Recent feedback
  const recentFeedback = agentData
    .filter(d => d.feedback && d.feedback.trim().length > 0)
    .slice(-5)
    .map(d => `[${d.outcome === 'approved' ? '✅' : '❌'}] ${d.feedback}`)

  return {
    agent: agentName,
    totalTasks,
    approvedFirstTry,
    rejected,
    failed,
    trustScore,
    streakCurrent,
    streakBest,
    recentFeedback
  }
}

export function getAllReputations(): AgentReputation[] {
  const data = loadReputationData()
  const agents = [...new Set(data.map(d => d.agent))]
  return agents.map(a => getAgentReputation(a))
}

// ═══════════════════════════════════════════════════════════════════════════════
// 📝 المذكرات السرية (Inter-Agent Memos / Lessons Learned)
// عندما يرفض مراجع الكود كوداً، تُحفظ الملاحظة ليتعلم منها المطور
// ═══════════════════════════════════════════════════════════════════════════════

export interface AgentMemo {
  id: string
  from: string        // الوكيل المُرسل (مثل: code-reviewer)
  to: string          // الوكيل المستلم (مثل: full-stack-developer)
  type: 'lesson' | 'warning' | 'tip' | 'praise'
  content: string     // الملاحظة / الدرس
  project: string     // المشروع المرتبط
  severity: 'low' | 'medium' | 'high' | 'critical'
  timestamp: string
  acknowledged: boolean
}

function getMemosFilePath(): string {
  const cwd = getOriginalCwd()
  const dir = path.join(cwd, '.claude', 'agency')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'agent-memos.json')
}

function loadMemos(): AgentMemo[] {
  const filePath = getMemosFilePath()
  if (!fs.existsSync(filePath)) return []
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return []
  }
}

function saveMemos(memos: AgentMemo[]): void {
  fs.writeFileSync(getMemosFilePath(), JSON.stringify(memos, null, 2), 'utf-8')
}

function generateMemoId(): string {
  return `memo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
}

export function sendMemo(memo: Omit<AgentMemo, 'id' | 'timestamp' | 'acknowledged'>): AgentMemo {
  const memos = loadMemos()
  const fullMemo: AgentMemo = {
    ...memo,
    id: generateMemoId(),
    timestamp: new Date().toISOString(),
    acknowledged: false
  }
  memos.push(fullMemo)
  
  // Keep only last 200 memos
  if (memos.length > 200) memos.splice(0, memos.length - 200)
  
  saveMemos(memos)
  return fullMemo
}

export function getMemosForAgent(agentName: string, unreadOnly: boolean = false): AgentMemo[] {
  const memos = loadMemos()
  let filtered = memos.filter(m => m.to === agentName || m.to === '*')
  if (unreadOnly) {
    filtered = filtered.filter(m => !m.acknowledged)
  }
  return filtered.slice(-20) // last 20 memos
}

export function getLessonsForAgent(agentName: string): string[] {
  const memos = getMemosForAgent(agentName)
  return memos
    .filter(m => m.type === 'lesson' || m.type === 'warning')
    .map(m => `[${m.severity.toUpperCase()}] من ${m.from}: ${m.content}`)
}

export function acknowledgeMemo(memoId: string): boolean {
  const memos = loadMemos()
  const memo = memos.find(m => m.id === memoId)
  if (!memo) return false
  memo.acknowledged = true
  saveMemos(memos)
  return true
}

export function getMemosFromAgent(agentName: string): AgentMemo[] {
  const memos = loadMemos()
  return memos.filter(m => m.from === agentName).slice(-20)
}

export function getMemoStats(): {
  totalMemos: number
  unreadCount: number
  byType: Record<string, number>
  bySeverity: Record<string, number>
} {
  const memos = loadMemos()
  const unreadCount = memos.filter(m => !m.acknowledged).length
  const byType: Record<string, number> = {}
  const bySeverity: Record<string, number> = {}
  
  for (const m of memos) {
    byType[m.type] = (byType[m.type] || 0) + 1
    bySeverity[m.severity] = (bySeverity[m.severity] || 0) + 1
  }

  return { totalMemos: memos.length, unreadCount, byType, bySeverity }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🔗 دمج الأنظمة الثلاثة: وظيفة "التسليح الذكي" (Smart Context Injection)
// تُحقن في System Prompt كل وكيل قبل العمل
// ═══════════════════════════════════════════════════════════════════════════════

export function getSmartContextForAgent(agentName: string): string {
  let context = ''

  // 1. Wake-up Context
  const wakeUp = getWakeUpContext(agentName)
  if (wakeUp.summary) {
    context += wakeUp.summary + '\n'
  }

  // 2. Reputation Badge
  const rep = getAgentReputation(agentName)
  if (rep.totalTasks > 0) {
    const badge = rep.trustScore >= 80 ? '🏆 ممتاز' 
                : rep.trustScore >= 60 ? '✅ جيد' 
                : rep.trustScore >= 40 ? '⚠️ يحتاج تحسين' 
                : '🔴 تحت المراقبة'
    context += `> ⭐ **سمعتك الداخلية:** ${badge} (${rep.trustScore}/100) | مهام: ${rep.totalTasks} | سلسلة نجاح: ${rep.streakCurrent}\n`
  }

  // 3. Unread Memos (Lessons)
  const unreadMemos = getMemosForAgent(agentName, true)
  if (unreadMemos.length > 0) {
    context += `> 📝 **مذكرات جديدة لك (${unreadMemos.length}):**\n`
    unreadMemos.slice(-3).forEach(m => {
      const icon = m.type === 'warning' ? '⚠️' : m.type === 'lesson' ? '📚' : m.type === 'praise' ? '🌟' : '💡'
      context += `>   ${icon} من ${m.from}: ${m.content}\n`
    })
  }

  // 4. Agent Persona (شخصية الوكيل المتخصصة)
  const personaPrompt = buildPersonaPrompt(agentName)
  if (personaPrompt) {
    context += '\n' + personaPrompt
  }

  return context
}
