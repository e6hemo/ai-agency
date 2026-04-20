import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { agentZero, analyzeRequest, buildExecutionPlan, launchProject } from './agency/agent-zero.js'
import { qualityGates } from './agency/quality-gates.js'
import { createAgencyTeam, listActiveTeams, getTeamProgress, synthesizeTeamResults } from './agency/team-orchestrator.js'
import { readHotMemory, getMemoryStats, queryMemory } from './agency/tiered-memory.js'
import { getRateLimiterStats } from './agency/rate-limiter.js'
import { 
  getProjectState, 
  readDailyLog, 
  listDailyLogs, 
  writeDailyLog, 
  searchMemPalace, 
  saveToMemPalace,
  generateDailyLogSummary
} from './agency/shared-memory.js'
import { memoryPalace } from './agency/mempalace.js'
import { chatService } from './agency/chat-service.js'
import { getGlobalConfig, saveGlobalConfig } from './utils/config.js'
import { loadApiKey, saveApiKey, listApiKeyIds } from './utils/secureStorage/apiKeyVault.js'
import {
  getSmartContextForAgent,
  getAgentReputation,
  getAllReputations,
  recordReputation,
  sendMemo,
  getMemosForAgent,
  getMemoStats,
  acknowledgeMemo,
  getWakeUpContext
} from './agency/elite-intelligence.js'
import { loadTemplates, generateDailyReport, getReportHistory } from './agency/project-templates.js'
import { getOriginalCwd } from './bootstrap/state.js'
import fs from 'fs'

import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(cors())
app.use(express.json())

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getTasksPath(cwd: string) {
  const dir = path.join(cwd, '.claude', 'agency')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'tasks.json')
}

function loadTasks(cwd: string): any[] {
  try {
    const raw = fs.readFileSync(getTasksPath(cwd), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function saveTasks(cwd: string, tasks: any[]) {
  try {
    fs.writeFileSync(getTasksPath(cwd), JSON.stringify(tasks, null, 2))
  } catch(e) {
    console.error('Failed to save tasks', e)
  }
}

// خدمة ملفات لوحة التحكم (Website)
const originalCwd = getOriginalCwd()
const dashboardPath = path.join(originalCwd, 'agency-dashboard')
app.use(express.static(dashboardPath))

app.get('/', (req, res) => {
  const indexPath = path.join(dashboardPath, 'index.html')
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath)
  } else {
    res.send('<h1>OpenClaude Agency Dashboard</h1><p>Dashboard files not found in agency-dashboard folder.</p>')
  }
})

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*' }
})

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id)
})

app.get('/api/status', (req, res) => {
  try {
    const teams = listActiveTeams()
    res.json({
      success: true,
      data: {
        status: 'online',
        uptime: process.uptime(),
        pid: process.pid,
        nodeVersion: process.version,
        rateLimits: getRateLimiterStats(),
        memory: memoryPalace.getStats(),
        teams: teams.length,
        activeTeams: teams.map(t => ({
          name: t.teamName,
          project: t.projectName,
          progress: getTeamProgress(t.teamName),
        })),
        memos: getMemoStats()
      }
    })
  } catch (err: any) {
    res.json({ success: false, error: err.message })
  }
})

// ─── AI Chat (Non-streaming fallback) ────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { agent, message, model, history, projectName } = req.body
  try {
    const result = await chatService.simpleChat({ agent, message, model, history, projectName })
    res.json({ success: true, reply: result })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/api/daily-log', (req, res) => {
  const date = req.query.date as string
  res.json({
    success: true,
    data: readDailyLog(date),
    availableDays: listDailyLogs()
  })
})

app.post('/api/chat/stream', async (req, res) => {
  const { agent, message, model, history, projectName } = req.body
  
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  try {
    for await (const chunk of chatService.streamChat({ agent, message, model, history, projectName })) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`)
    }
    res.write('event: end\ndata: {}\n\n')
    res.end()
  } catch (err: any) {
    console.error('Streaming error:', err)
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`)
    res.end()
  }
})

app.post('/api/execute', async (req, res) => {
  try {
    const { request, projectName } = req.body
    if (!request || !projectName) {
      return res.status(400).json({ error: 'Missing request or projectName' })
    }
    const result = agentZero.launchProject(projectName, request)
    res.json(result)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/pipeline', async (req, res) => {
  try {
    const { request, projectName } = req.body
    if (!request || !projectName) {
      return res.status(400).json({ error: 'Missing request or projectName' })
    }
    const result = agentZero.launchProject(projectName, request)
    res.json({ success: true, data: result })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/keys', (req, res) => {
  const ids = listApiKeyIds()
  res.json({
    success: true,
    data: ids
  })
})

app.post('/api/keys', async (req, res) => {
  const { provider, key } = req.body
  if (!provider || !key) return res.status(400).json({ error: 'Missing provider or key' })
  
  try {
    saveGlobalConfig(prev => {
      const updated = { ...prev }
      if (provider === 'anthropic') updated.anthropicKey = key
      if (provider === 'openrouter') updated.openrouterKey = key
      if (provider === 'gemini') updated.geminiKey = key
      if (provider === 'openai') updated.openaiKey = key
      return updated
    })
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/quality-check', async (req, res) => {
  try {
    const { content, type, agentName, projectName, attempt } = req.body
    const report = await qualityGates.check({ content, type, agentName, projectName, attempt })
    res.json(report)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/config', (req, res) => {
  const configPath = path.join(originalCwd, '.claude/agency-config.json')
  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    res.json({ success: true, data: JSON.parse(raw) })
  } catch {
    res.json({ success: false, error: 'Config not found' })
  }
})

// ─── Task Management ──────────────────────────────────────────────────────────
app.get('/api/tasks', (req, res) => {
  res.json({ success: true, data: loadTasks(originalCwd) })
})

app.post('/api/tasks', (req, res) => {
  const { title, description, assignedTo, priority, department, dependencies = [] } = req.body
  if (!title) return res.status(400).json({ error: 'Title required' })

  const task = {
    id: `task_${Date.now()}`,
    title,
    description: description || '',
    assignedTo: assignedTo || null,
    status: 'pending',
    priority: priority || 'medium',
    department: department || 'development',
    dependencies,
    createdAt: new Date().toISOString(),
  }

  const tasks = loadTasks(originalCwd)
  tasks.push(task)
  saveTasks(originalCwd, tasks)
  res.status(201).json({ success: true, data: task })
})

app.post('/api/tasks/:id/complete', (req, res) => {
  const { id } = req.params
  const tasks = loadTasks(originalCwd)
  const task = tasks.find(t => t.id === id)
  if (!task) return res.status(404).json({ error: 'Task not found' })

  task.status = 'completed'
  task.completedAt = new Date().toISOString()
  saveTasks(originalCwd, tasks)
  res.json({ success: true, data: task })
})

// ─── Project & Knowledge Discovery ───────────────────────────────────────────
app.get('/api/projects', (req, res) => {
  const projDir = path.join(originalCwd, '.claude', 'agency', 'projects')
  const projects: any[] = []
  if (fs.existsSync(projDir)) {
    const dirs = fs.readdirSync(projDir, { withFileTypes: true }).filter(d => d.isDirectory())
    for (const dir of dirs) {
      try {
        const state = JSON.parse(fs.readFileSync(path.join(projDir, dir.name, 'state.json'), 'utf-8'))
        projects.push({ name: dir.name, ...state })
      } catch {
        projects.push({ name: dir.name, status: 'unknown' })
      }
    }
  }
  res.json({ success: true, data: projects })
})

app.get('/api/knowledge', (req, res) => {
  const kbDir = path.join(originalCwd, '.claude', 'agency', 'knowledge')
  const knowledge: Record<string, string[]> = {}
  if (fs.existsSync(kbDir)) {
    const agents = fs.readdirSync(kbDir, { withFileTypes: true }).filter(d => d.isDirectory())
    for (const agent of agents) {
      try {
        const files = fs.readdirSync(path.join(kbDir, agent.name)).filter(f => f.endsWith('.md') || f.endsWith('.txt'))
        knowledge[agent.name] = files
      } catch {
        knowledge[agent.name] = []
      }
    }
  }
  res.json({ success: true, data: knowledge })
})

// ─── Virtual Board of Directors ──────────────────────────────────────────────
app.post('/api/board/consult', async (req, res) => {
  const { mentor, message, model = 'llama3.2:3b' } = req.body
  if (!mentor || !message) return res.status(400).json({ error: 'Mentor and message required' })

  const personas: Record<string, string> = {
    'steve-jobs': 'أنت ستيف جوبز. أنت تؤمن بالبساطة القصوى، التركيز الشديد، وأن التصميم ليس كيف يبدو المنتج بل كيف يعمل. لا تقبل التنازلات، وانتقد الأفكار بحدة لتخرج بأفضل شكل ممكن. أجب باللغة العربية.',
    'elon-musk': 'أنت إيلون ماسك. أنت تفكر بـ "المبادئ الأولى". أنت تدفع نحو ابتكارات جذرية ومخاطر محسوبة وتطمح لإنقاذ البشرية. أنت عملي جداً وتتحدث عن الفيزياء والهندسة والمستقبل. أجب باللغة العربية.',
    'charlie-munger': 'أنت تشارلي منغر. أنت خبير في النماذج العقلية، وتؤمن بالمنطق وتجنب الحماقة والبحث عن المزايا التنافسية. تتحدث بحكمة واختصار. أجب باللغة العربية.',
    'sun-tzu': 'أنت سون تزو، الجنرال العسكري القديم. تطبق استراتيجيات فن الحرب على المواقف الحديثة. أجب باللغة العربية.',
    'marcus-aurelius': 'أنت ماركوس أوريليوس، الإمبراطور الروماني والفيلسوف الرواقي. نصيحتك تركز على التحكم في ما تقدر عليه وتقبل ما لا تقدر عليه. أجب باللغة العربية.'
  }

  const systemPrompt = personas[mentor] || `أنت مستشار استراتيجي وخبير تنفيذي. قدم مشورتك بحكمة.`
  try {
    const reply = await chatService.simpleChat({ 
      agent: mentor, 
      message: `مشكلتي أو موقفي الحالي:\n${message}\n\nأحتاج منك نصيحة موجهة وحاسمة بناءً على طريقتك وخبرتك.`,
      model,
      overrideSystemPrompt: systemPrompt
    })
    res.json({ success: true, reply })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ─── Memos & Communication ───────────────────────────────────────────────────
app.get('/api/memos', (req, res) => {
  const agent = req.query.agent as string
  if (agent) {
    res.json({ success: true, data: getMemosForAgent(agent) })
  } else {
    res.json({ success: true, data: getMemoStats() })
  }
})

app.post('/api/memos', (req, res) => {
  const { from, to, type, content, project, severity } = req.body
  const memo = sendMemo({ from, to, type, content, project, severity })
  res.json({ success: true, data: memo })
})

app.post('/api/memos/acknowledge', (req, res) => {
  const { memoId } = req.body
  const success = acknowledgeMemo(memoId)
  res.json({ success })
})

// ─── Reputation & Performance ────────────────────────────────────────────────
app.get('/api/reputation', (req, res) => {
  const agent = req.query.agent as string
  if (agent) {
    res.json({ success: true, data: getAgentReputation(agent) })
  } else {
    res.json({ success: true, data: getAllReputations() })
  }
})

app.post('/api/reputation/record', (req, res) => {
  const { agent, project, task, outcome, reviewer, feedback } = req.body
  const entry = recordReputation({ agent, project, task, outcome, reviewer, feedback })
  res.json({ success: true, data: entry })
})

// ─── Memory Stats ────────────────────────────────────────────────────────────
app.get('/api/memory', (req, res) => {
  const project = (req.query.project as string) || 'default-project'
  const level = req.query.level as any
  const limit = parseInt(req.query.limit as string || '50')
  res.json({
    success: true,
    data: {
      stats: getMemoryStats(project),
      entries: queryMemory({ projectName: project, level, limit })
    }
  })
})

// ─── Identity & Vision ───────────────────────────────────────────────────────
app.get('/api/identity', (req, res) => {
  const identityPath = path.join(originalCwd, '.claude', 'identity.json')
  try {
    if (fs.existsSync(identityPath)) {
      res.json({ success: true, data: JSON.parse(fs.readFileSync(identityPath, 'utf-8')) })
    } else {
      res.json({ success: true, data: { values: '', vision: '', mission: '', principles: '' } })
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/identity', (req, res) => {
  const identityPath = path.join(originalCwd, '.claude', 'identity.json')
  try {
    fs.mkdirSync(path.dirname(identityPath), { recursive: true })
    fs.writeFileSync(identityPath, JSON.stringify(req.body, null, 2))
    writeDailyLog('note', 'تم تحديث الدستور الشخصي (الهوية)', { details: JSON.stringify(req.body) })
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ─── Reports & Analytics ─────────────────────────────────────────────────────
app.get('/api/reports/daily', (req, res) => {
  res.json({ success: true, data: generateDailyReport() })
})

app.get('/api/reports/history', (req, res) => {
  res.json({ success: true, data: getReportHistory() })
})

app.get('/api/agents', (req, res) => {
  const agents: Record<string, any> = {
    'project-manager': { emoji: '👔', role: 'مدير المشاريع', color: '#6366f1', dept: 'management' },
    'full-stack-developer': { emoji: '💻', role: 'مطور شامل', color: '#10b981', dept: 'development' },
    'ui-ux-designer': { emoji: '🎨', role: 'مصمم واجهات', color: '#ec4899', dept: 'design' },
    'marketing-strategist': { emoji: '📈', role: 'خبير تسويق', color: '#f59e0b', dept: 'marketing' },
    'content-creator': { emoji: '✍️', role: 'صانع محتوى', color: '#8b5cf6', dept: 'media' },
    'seo-specialist': { emoji: '🔍', role: 'خبير SEO', color: '#06b6d4', dept: 'seo' },
    'data-analyst': { emoji: '📊', role: 'محلل بيانات', color: '#3b82f6', dept: 'data' },
    'researcher': { emoji: '🧪', role: 'باحث', color: '#64748b', dept: 'research' },
    'code-reviewer': { emoji: '🛡️', role: 'مراجعة الجودة', color: '#f43f5e', dept: 'qa' }
  }
  res.json({ success: true, data: agents })
})

app.get('/api/models', (req, res) => {
  res.json({
    success: true,
    data: [
      { id: 'anthropic/claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
      { id: 'google/gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google' },
      { id: 'google/gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'google' },
      { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'openai' },
      { id: 'openrouter/anthropic/claude-3.5-sonnet', name: 'Claude 3.5 (OpenRouter)', provider: 'openrouter' }
    ]
  })
})

export function startServer(port: number = 3766) {
  return new Promise<number>((resolve, reject) => {
    httpServer.on('error', (e: any) => {
      if (e.code === 'EADDRINUSE') {
        resolve(startServer(port + 1))
      } else {
        reject(e)
      }
    })

    httpServer.listen(port, () => {
      console.log(`🚀 Agency Server is running on http://localhost:${port}`)
      resolve(port)
    })
  })
}

// Optional: Start automatically if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer()
}
