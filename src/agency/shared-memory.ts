import * as fs from 'fs'
import * as path from 'path'
import { getOriginalCwd } from '../bootstrap/state.js'
import {
  writeHotMemory,
  writeWarmMemory,
  writeColdMemory,
  buildAgentContext
} from './tiered-memory.js'

// ─── Context (Markdown narrative memory) ─────────────────────────────────────

export interface ProjectContext {
  projectName: string
  contextPath: string
  content: string
}

function ensureProjectDir(projectName: string): string {
  const cwd = getOriginalCwd()
  const projectsDir = path.join(cwd, '.claude', 'agency', 'projects')
  if (!fs.existsSync(projectsDir)) {
    fs.mkdirSync(projectsDir, { recursive: true })
  }
  const projectDir = path.join(projectsDir, projectName)
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true })
  }
  return projectDir
}

export function getProjectContext(projectName: string): ProjectContext {
  const projectDir = ensureProjectDir(projectName)
  const contextPath = path.join(projectDir, 'context.md')
  let content = ''

  if (fs.existsSync(contextPath)) {
    content = fs.readFileSync(contextPath, 'utf-8')
  } else {
    content = `# مشروع: ${projectName}\n\n## الهدف الأساسي\n[أضف الهدف هنا]\n\n## الذاكرة المشتركة للوكلاء\n[هنا يتم حفظ القرارات، الروابط، والمخرجات المهمة لتكون مرجعاً للوكلاء الآخرين]\n`
    fs.writeFileSync(contextPath, content, 'utf-8')
  }

  return { projectName, contextPath, content }
}

export function updateProjectContext(projectName: string, newContent: string): ProjectContext {
  const ctx = getProjectContext(projectName)
  fs.writeFileSync(ctx.contextPath, newContent, 'utf-8')
  return { ...ctx, content: newContent }
}

export function appendToProjectContext(projectName: string, appendedText: string): ProjectContext {
  const ctx = getProjectContext(projectName)
  const newContent = ctx.content + '\n' + appendedText + '\n'
  fs.writeFileSync(ctx.contextPath, newContent, 'utf-8')
  return { ...ctx, content: newContent }
}

// ─── State (Structured JSON for tracking progress) ────────────────────────────

export type StepStatus = 'pending' | 'in-progress' | 'qa-review' | 'completed' | 'failed'
export type ProjectStatus = 'pending' | 'in-progress' | 'completed' | 'failed'

export interface StepHistoryEntry {
  step: string
  agentName: string
  status: StepStatus
  summary: string
  timestamp: string
}

export interface ProjectState {
  projectName: string
  status: ProjectStatus
  currentStep: string
  startedAt: string
  updatedAt: string
  history: StepHistoryEntry[]
}

export function getProjectState(projectName: string): ProjectState {
  const projectDir = ensureProjectDir(projectName)
  const statePath = path.join(projectDir, 'state.json')

  if (fs.existsSync(statePath)) {
    try {
      return JSON.parse(fs.readFileSync(statePath, 'utf-8')) as ProjectState
    } catch {
      // corrupted state file - rebuild
    }
  }

  // Default initial state
  const defaultState: ProjectState = {
    projectName,
    status: 'pending',
    currentStep: 'Planning',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    history: [],
  }
  fs.writeFileSync(statePath, JSON.stringify(defaultState, null, 2), 'utf-8')
  return defaultState
}

export function updateProjectState(
  projectName: string,
  patch: Partial<Omit<ProjectState, 'projectName' | 'startedAt' | 'history'>>,
  historyEntry?: Omit<StepHistoryEntry, 'timestamp'>,
): ProjectState {
  const projectDir = ensureProjectDir(projectName)
  const statePath = path.join(projectDir, 'state.json')
  const current = getProjectState(projectName)

  const newHistory = historyEntry
    ? [...current.history, { ...historyEntry, timestamp: new Date().toISOString() }]
    : current.history

  const updated: ProjectState = {
    ...current,
    ...patch,
    projectName,
    updatedAt: new Date().toISOString(),
    history: newHistory,
  }
  fs.writeFileSync(statePath, JSON.stringify(updated, null, 2), 'utf-8')
  return updated
}

// ─── MemPalace Integration ──────────────────────────────────────────────────
import { memoryPalace, type Drawer } from './mempalace.js'

export function writeAgentDiary(projectName: string, agentName: string, content: string): Drawer {
  // Agent writes to a room named after their role, e.g., "ReviewerDiary"
  const roomName = `${agentName}Diary`.replace(/\s+/g, '')
  return memoryPalace.addDrawer(projectName, roomName, content, agentName)
}

export function readAgentDiary(projectName: string, agentName: string, limit: number = 10): Drawer[] {
  const roomName = `${agentName}Diary`.replace(/\s+/g, '')
  const allDrawers = memoryPalace.getDrawersByRoom(projectName, roomName)
  return allDrawers.slice(-limit) // return last N
}

export function searchMemPalace(projectName: string, query: string): Drawer[] {
  const keywords = query.split(' ').filter(k => k.length > 2)
  if (keywords.length === 0) keywords.push(query)
  return memoryPalace.searchAllDrawers(projectName, keywords)
}

export function saveToMemPalace(wingName: string, agent: string, content: string, tags: string[] = []): Drawer {
  const roomName = tags.length > 0 ? tags[0] : 'general'
  return memoryPalace.addDrawer(wingName, roomName, content, agent)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 📅 الطبقة الأولى: السجل اليومي (Daily Log — Layer 1)
// يُسجل تلقائياً كل حدث يحصل خلال اليوم: تشغيل pipeline, رفض, بحث, قرار
// ═══════════════════════════════════════════════════════════════════════════════

export type DailyLogEventType = 
  | 'pipeline-run' 
  | 'pipeline-done' 
  | 'step-reject' 
  | 'step-error' 
  | 'research-crawl' 
  | 'memo-sent' 
  | 'decision' 
  | 'experiment' 
  | 'note'

export interface DailyLogEntry {
  time: string
  type: DailyLogEventType
  agent?: string
  pipeline?: string
  summary: string
  details?: string
}

function getDailyLogDir(): string {
  const cwd = getOriginalCwd()
  const dir = path.join(cwd, '.claude', 'agency', 'daily-logs')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getTodayDateString(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function getDailyLogPath(date?: string): string {
  const d = date || getTodayDateString()
  return path.join(getDailyLogDir(), `daily-log-${d}.json`)
}

function loadDailyLogEntries(date?: string): DailyLogEntry[] {
  const logPath = getDailyLogPath(date)
  if (!fs.existsSync(logPath)) return []
  try {
    return JSON.parse(fs.readFileSync(logPath, 'utf-8'))
  } catch {
    return []
  }
}

function saveDailyLogEntries(entries: DailyLogEntry[], date?: string): void {
  const logPath = getDailyLogPath(date)
  fs.writeFileSync(logPath, JSON.stringify(entries, null, 2), 'utf-8')
}

/**
 * كتابة حدث في السجل اليومي
 * هذه هي الدالة الرئيسية التي تُستدعى من كل مكان
 */
export function writeDailyLog(
  type: DailyLogEventType,
  summary: string,
  options: { agent?: string; pipeline?: string; details?: string } = {}
): DailyLogEntry {
  const entries = loadDailyLogEntries()
  const entry: DailyLogEntry = {
    time: new Date().toISOString(),
    type,
    summary,
    ...options
  }
  entries.push(entry)
  
  // Keep max 200 entries per day
  if (entries.length > 200) entries.splice(0, entries.length - 200)
  
  saveDailyLogEntries(entries)
  return entry
}

/**
 * قراءة سجل يوم محدد
 */
export function readDailyLog(date?: string): DailyLogEntry[] {
  return loadDailyLogEntries(date)
}

/**
 * إنتاج ملخص يومي بتنسيق Markdown (للعرض في الـ Dashboard)
 */
export function generateDailyLogSummary(date?: string): string {
  const entries = loadDailyLogEntries(date)
  const d = date || getTodayDateString()
  
  if (entries.length === 0) {
    return `# 📅 سجل يوم ${d}\n\nلا توجد أحداث مسجلة لهذا اليوم.`
  }

  let md = `# 📅 سجل يوم ${d}\n\n`
  md += `> **إجمالي الأحداث:** ${entries.length}\n\n`

  // Group by type
  const byType: Record<string, DailyLogEntry[]> = {}
  for (const e of entries) {
    if (!byType[e.type]) byType[e.type] = []
    byType[e.type].push(e)
  }

  const typeLabels: Record<string, string> = {
    'pipeline-run': '🔗 تشغيل مسارات',
    'pipeline-done': '✅ مسارات مكتملة',
    'step-reject': '❌ رفض ومراجعة',
    'step-error': '⚠️ أخطاء',
    'research-crawl': '🔍 أبحاث',
    'memo-sent': '📝 مذكرات',
    'decision': '⚖️ قرارات',
    'experiment': '🧪 تجارب',
    'note': '📌 ملاحظات'
  }

  for (const [type, items] of Object.entries(byType)) {
    md += `## ${typeLabels[type] || type} (${items.length})\n`
    for (const item of items) {
      const time = new Date(item.time).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })
      md += `- **${time}** ${item.agent ? `[${item.agent}]` : ''} ${item.summary}\n`
    }
    md += '\n'
  }

  return md
}

/**
 * الحصول على قائمة بجميع أيام السجلات المتاحة
 */
export function listDailyLogs(): string[] {
  const dir = getDailyLogDir()
  try {
    return fs.readdirSync(dir)
      .filter(f => f.startsWith('daily-log-') && f.endsWith('.json'))
      .map(f => f.replace('daily-log-', '').replace('.json', ''))
      .sort()
      .reverse()
  } catch {
    return []
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🧪 نظام التجارب (Experiments Tracker)
// يسجل كل تجربة (مثلاً: "جربنا TikTok Ads") ويتتبع النتائج
// ═══════════════════════════════════════════════════════════════════════════════

export interface Experiment {
  id: string
  title: string
  hypothesis: string
  status: 'active' | 'completed' | 'failed' | 'paused'
  category: string         // marketing, development, seo, etc.
  startedAt: string
  completedAt?: string
  results?: string
  metrics?: Record<string, number>
  agent: string            // الوكيل الذي أنشأ التجربة
  project?: string
}

function getExperimentsFilePath(): string {
  const cwd = getOriginalCwd()
  const dir = path.join(cwd, '.claude', 'agency')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'experiments.json')
}

function loadExperiments(): Experiment[] {
  const filePath = getExperimentsFilePath()
  if (!fs.existsSync(filePath)) return []
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return []
  }
}

function saveExperiments(data: Experiment[]): void {
  fs.writeFileSync(getExperimentsFilePath(), JSON.stringify(data, null, 2), 'utf-8')
}

export function recordExperiment(experiment: Omit<Experiment, 'id' | 'startedAt'>): Experiment {
  const data = loadExperiments()
  const full: Experiment = {
    ...experiment,
    id: `exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    startedAt: new Date().toISOString()
  }
  data.push(full)
  
  // Keep max 100 experiments
  if (data.length > 100) data.splice(0, data.length - 100)
  
  saveExperiments(data)
  
  // Also log to daily log
  writeDailyLog('experiment', `تجربة جديدة: ${experiment.title}`, { 
    agent: experiment.agent, 
    details: experiment.hypothesis 
  })
  
  return full
}

export function updateExperiment(
  experimentId: string, 
  patch: Partial<Pick<Experiment, 'status' | 'results' | 'metrics' | 'completedAt'>>
): Experiment | null {
  const data = loadExperiments()
  const idx = data.findIndex(e => e.id === experimentId)
  if (idx === -1) return null
  
  data[idx] = { ...data[idx], ...patch }
  if (patch.status === 'completed' || patch.status === 'failed') {
    data[idx].completedAt = new Date().toISOString()
  }
  
  saveExperiments(data)
  return data[idx]
}

export function getExperimentResults(category?: string): Experiment[] {
  const data = loadExperiments()
  if (category) return data.filter(e => e.category === category)
  return data
}

export function getExperimentSummary(): {
  total: number
  active: number
  completed: number
  failed: number
  byCategory: Record<string, number>
} {
  const data = loadExperiments()
  const byCategory: Record<string, number> = {}
  
  for (const e of data) {
    byCategory[e.category] = (byCategory[e.category] || 0) + 1
  }
  
  return {
    total: data.length,
    active: data.filter(e => e.status === 'active').length,
    completed: data.filter(e => e.status === 'completed').length,
    failed: data.filter(e => e.status === 'failed').length,
    byCategory
  }
}

// ─── Tiered Memory Bridge ──────────────────────────────

export function rememberNow(
  projectName: string,
  agentName: string,
  content: string,
  importance: number = 5
): void {
  // أقل من 6 = hot فقط
  // 6 إلى 8 = hot + warm
  // أكثر من 8 = كل المستويات
  writeHotMemory(projectName, agentName, content, [], importance)

  if (importance >= 6) {
    writeWarmMemory(projectName, agentName, content, [], importance)
  }

  if (importance >= 9) {
    writeColdMemory(projectName, agentName, content, [], importance)
  }
}

export function getAgentBriefing(
  projectName: string,
  agentName: string,
  task: string
): string {
  return buildAgentContext(projectName, agentName, task)
}
