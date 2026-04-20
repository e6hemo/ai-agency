import * as fs from 'fs'
import * as path from 'path'
import { getOriginalCwd } from '../bootstrap/state.js'
import { getAllReputations, getMemoStats } from './elite-intelligence.js'

// ═══════════════════════════════════════════════════════════════════════════════
// 📋 نظام القوالب الجاهزة (Project Templates Engine)
// ═══════════════════════════════════════════════════════════════════════════════

export interface TemplatePhase {
  name: string
  agent: string
  tasks: string[]
  acceptanceCriteria: string
  dependsOn?: number[]
}

export interface ProjectTemplate {
  name: string
  emoji: string
  description: string
  estimatedTime: string
  phases: TemplatePhase[]
}

export function loadTemplates(): Record<string, ProjectTemplate> {
  const cwd = getOriginalCwd()
  const templatesPath = path.join(cwd, '.claude', 'agency', 'templates', 'project-templates.json')
  
  try {
    if (fs.existsSync(templatesPath)) {
      const raw = fs.readFileSync(templatesPath, 'utf-8')
      const data = JSON.parse(raw)
      return data.templates || {}
    }
  } catch { /* ignore */ }
  
  return {}
}

export function getTemplate(templateKey: string): ProjectTemplate | null {
  const templates = loadTemplates()
  return templates[templateKey] || null
}

export function listTemplateKeys(): string[] {
  return Object.keys(loadTemplates())
}

export function getTemplateSummaries(): Array<{
  key: string
  name: string
  emoji: string
  description: string
  estimatedTime: string
  phaseCount: number
  agents: string[]
}> {
  const templates = loadTemplates()
  return Object.entries(templates).map(([key, t]) => ({
    key,
    name: t.name,
    emoji: t.emoji,
    description: t.description,
    estimatedTime: t.estimatedTime,
    phaseCount: t.phases.length,
    agents: [...new Set(t.phases.map(p => p.agent))]
  }))
}

// ═══════════════════════════════════════════════════════════════════════════════
// 📰 نظام التقارير اليومية (Daily Standup Report)
// ═══════════════════════════════════════════════════════════════════════════════

export interface DailyReport {
  date: string
  timestamp: string
  summary: {
    totalProjects: number
    activeProjects: number
    completedProjects: number
    failedProjects: number
  }
  agentPerformance: Array<{
    agent: string
    trustScore: number
    totalTasks: number
    streakCurrent: number
    badge: string
  }>
  memoActivity: {
    totalMemos: number
    unreadCount: number
    byType: Record<string, number>
  }
  recentActivity: Array<{
    project: string
    agent: string
    action: string
    timestamp: string
    status: string
  }>
  topPerformer: {
    agent: string
    reason: string
  } | null
  recommendations: string[]
}

export function generateDailyReport(): DailyReport {
  const cwd = getOriginalCwd()
  const now = new Date()
  const today = now.toISOString().split('T')[0]!

  // 1. Projects Summary
  const projectsDir = path.join(cwd, '.claude', 'agency', 'projects')
  let totalProjects = 0, activeProjects = 0, completedProjects = 0, failedProjects = 0
  const recentActivity: DailyReport['recentActivity'] = []

  if (fs.existsSync(projectsDir)) {
    const dirs = fs.readdirSync(projectsDir, { withFileTypes: true }).filter(d => d.isDirectory())
    totalProjects = dirs.length
    
    for (const dir of dirs) {
      try {
        const statePath = path.join(projectsDir, dir.name, 'state.json')
        if (!fs.existsSync(statePath)) continue
        
        const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
        
        switch (state.status) {
          case 'in-progress': activeProjects++; break
          case 'completed': completedProjects++; break
          case 'failed': failedProjects++; break
        }

        // Collect recent history entries (last 24h)
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
        const recentEntries = (state.history || []).filter(
          (h: any) => h.timestamp && h.timestamp > oneDayAgo
        )
        
        for (const entry of recentEntries.slice(-5)) {
          recentActivity.push({
            project: dir.name,
            agent: entry.agentName || entry.agent || 'unknown',
            action: entry.summary || entry.step || 'نشاط',
            timestamp: entry.timestamp,
            status: entry.status
          })
        }
      } catch { /* skip */ }
    }
  }

  // 2. Agent Performance
  const reputations = getAllReputations()
  const agentPerformance = reputations.map(rep => ({
    agent: rep.agent,
    trustScore: rep.trustScore,
    totalTasks: rep.totalTasks,
    streakCurrent: rep.streakCurrent,
    badge: rep.trustScore >= 80 ? '🏆 ممتاز' 
         : rep.trustScore >= 60 ? '✅ جيد' 
         : rep.trustScore >= 40 ? '⚠️ يحتاج تحسين' 
         : '🔴 تحت المراقبة'
  })).sort((a, b) => b.trustScore - a.trustScore)

  // 3. Top Performer
  let topPerformer: DailyReport['topPerformer'] = null
  if (agentPerformance.length > 0) {
    const top = agentPerformance[0]!
    topPerformer = {
      agent: top.agent,
      reason: `أعلى درجة ثقة (${top.trustScore}/100) مع ${top.streakCurrent} مهمة ناجحة متتالية`
    }
  }

  // 4. Memo Activity
  const memoActivity = getMemoStats()

  // 5. Smart Recommendations
  const recommendations: string[] = []
  
  if (activeProjects === 0 && totalProjects > 0) {
    recommendations.push('لا توجد مشاريع نشطة حالياً — حان وقت بدء مشروع جديد!')
  }
  if (failedProjects > 0) {
    recommendations.push(`يوجد ${failedProjects} مشروع فاشل — يُنصح بمراجعتها وإعادة تشغيلها`)
  }
  if (memoActivity.unreadCount > 5) {
    recommendations.push(`${memoActivity.unreadCount} مذكرة غير مقروءة — راجعها لتحسين أداء الوكلاء`)
  }
  const lowPerformers = agentPerformance.filter(a => a.trustScore < 40)
  if (lowPerformers.length > 0) {
    recommendations.push(`الوكلاء التالون تحت المراقبة: ${lowPerformers.map(a => a.agent).join(', ')}`)
  }
  if (recommendations.length === 0) {
    recommendations.push('كل شيء يسير بشكل ممتاز! الوكالة تعمل بكفاءة عالية 🚀')
  }

  // Sort recent activity by timestamp (newest first)
  recentActivity.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))

  const report: DailyReport = {
    date: today,
    timestamp: now.toISOString(),
    summary: { totalProjects, activeProjects, completedProjects, failedProjects },
    agentPerformance,
    memoActivity,
    recentActivity: recentActivity.slice(0, 10),
    topPerformer,
    recommendations
  }

  // Save report to disk
  saveReport(report)

  return report
}

function saveReport(report: DailyReport): void {
  const cwd = getOriginalCwd()
  const reportsDir = path.join(cwd, '.claude', 'agency', 'reports')
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true })
  
  const filePath = path.join(reportsDir, `report-${report.date}.json`)
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8')
}

export function getReportHistory(limit: number = 7): DailyReport[] {
  const cwd = getOriginalCwd()
  const reportsDir = path.join(cwd, '.claude', 'agency', 'reports')
  
  if (!fs.existsSync(reportsDir)) return []
  
  const files = fs.readdirSync(reportsDir)
    .filter(f => f.startsWith('report-') && f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, limit)

  return files.map(f => {
    try {
      return JSON.parse(fs.readFileSync(path.join(reportsDir, f), 'utf-8'))
    } catch {
      return null
    }
  }).filter(Boolean) as DailyReport[]
}
