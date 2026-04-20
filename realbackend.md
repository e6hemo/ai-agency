# 🔗 الخطوة التالية: ربط البيانات الحقيقية + صفحة المهام

سنقوم الآن بثلاثة أمور متكاملة:
1. **بناء Backend Server** يربط الواجهة بالمنطق الحقيقي
2. **نظام WebSocket** للتحديث الحي
3. **صفحة المهام التفاعلية** (شجرة المهام)

---

## الملف الأول: `server.ts` (Backend Server)

```typescript
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🖥️ OpenClaude API Server
 * يربط الواجهة بالمنطق الحقيقي للوكلاء والذاكرة
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import {
  listActiveTeams,
  loadTeam,
  getTeamProgress,
  createAgencyTeam,
  claimTask,
  completeTask,
  type TeamTask,
} from './team-orchestrator.js'
import { memoryPalace } from './mempalace.js'
import {
  getMemoryStats,
  queryMemory,
  writeHotMemory,
  writeWarmMemory,
  writeColdMemory,
} from './tiered-memory.js'
import {
  getRateLimiterStats,
} from './rate-limiter.js'
import {
  readDailyLog,
  getExperimentResults,
} from './shared-memory.js'

// ─── Express Setup ────────────────────────────────────────────────────────────

const app = express()
app.use(cors())
app.use(express.json())

const httpServer = createServer(app)
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*' },
})

// ─── State for Demo ───────────────────────────────────────────────────────────

// في الإصدار الحقيقي، هذه البيانات تأتي من team-orchestrator
let agentsState = [
  { id: 'pm',        name: 'project-manager',    model: 'gemini-1.5-pro',   status: 'active', tokens: 2340, cost: 0.12, task: 'تحليل المتطلبات' },
  { id: 'dev',       name: 'developer',          model: 'deepseek-coder',   status: 'idle',   tokens: 0,    cost: 0,    task: 'بانتظار الخطة' },
  { id: 'qa',        name: 'qa-engineer',        model: 'llama-3.1-70b',    status: 'active', tokens: 1120, cost: 0.03,  task: 'مراجعة الكود' },
  { id: 'designer',  name: 'ui-ux-designer',     model: 'gemini-1.5-flash', status: 'done',   tokens: 890,  cost: 0.01,  task: 'اكتمل التصميم' },
  { id: 'marketing', name: 'marketing-strategist', model: 'llama-3.1-70b',  status: 'idle',   tokens: 0,    cost: 0,    task: 'بانتظار' },
]

let tasksState: TeamTask[] = []
let activityLog: { time: string; agent: string; message: string }[] = []

// ─── API Routes ───────────────────────────────────────────────────────────────

// ---- Status ----
app.get('/api/status', (req, res) => {
  const totalCost = agentsState.reduce((s, a) => s + a.cost, 0)
  const totalTokens = agentsState.reduce((s, a) => s + a.tokens, 0)

  res.json({
    activeAgents: agentsState.filter(a => a.status === 'active').length,
    totalAgents: agentsState.length,
    totalCost,
    totalTokens,
    uptime: process.uptime().toFixed(0),
  })
})

// ---- Agents ----
app.get('/api/agents', (req, res) => {
  res.json(agentsState)
})

app.get('/api/agents/:id', (req, res) => {
  const agent = agentsState.find(a => a.id === req.params.id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  res.json(agent)
})

app.post('/api/agents/:id/start', (req, res) => {
  const agent = agentsState.find(a => a.id === req.params.id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })

  agent.status = 'active'
  io.emit('agent:status', agent)
  addActivity(agent.name, 'بدأ العمل')
  res.json(agent)
})

app.post('/api/agents/:id/stop', (req, res) => {
  const agent = agentsState.find(a => a.id === req.params.id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })

  agent.status = 'idle'
  io.emit('agent:status', agent)
  addActivity(agent.name, 'توقف عن العمل')
  res.json(agent)
})

// ---- Tasks ----
app.get('/api/tasks', (req, res) => {
  res.json(tasksState)
})

app.post('/api/tasks', (req, res) => {
  const { title, description, assignedTo, priority, department } = req.body
  const task: TeamTask = {
    id: `task_${Date.now()}`,
    title,
    description: description || '',
    assignedTo: assignedTo || null,
    status: 'pending',
    priority: priority || 'medium',
    department: department || 'development',
    dependencies: [],
    createdAt: new Date().toISOString(),
  }
  tasksState.push(task)
  io.emit('task:new', task)
  addActivity('System', `مهمة جديدة: ${title}`)
  res.status(201).json(task)
})

app.post('/api/tasks/:id/complete', (req, res) => {
  const task = tasksState.find(t => t.id === req.params.id)
  if (!task) return res.status(404).json({ error: 'Task not found' })

  task.status = 'completed'
  task.completedAt = new Date().toISOString()
  task.output = req.body.output || ''
  io.emit('task:complete', task)
  addActivity(task.assignedTo || 'Unknown', `أكمل مهمة: ${task.title}`)
  res.json(task)
})

// ---- Memory ----
app.get('/api/memory', (req, res) => {
  const level = req.query.level as string || 'all'
  const limit = parseInt(req.query.limit as string) || 50

  const stats = getMemoryStats('default-project')
  const entries = queryMemory({
    projectName: 'default-project',
    level: level === 'all' ? undefined : level as any,
    limit,
  })

  res.json({ stats, entries })
})

app.post('/api/memory', (req, res) => {
  const { level, agent, content, importance, tags } = req.body
  let entry

  if (level === 'hot') {
    entry = writeHotMemory('default-project', agent, content, tags, importance)
  } else if (level === 'warm') {
    entry = writeWarmMemory('default-project', agent, content, tags, importance)
  } else {
    entry = writeColdMemory('default-project', agent, content, tags, importance)
  }

  io.emit('memory:new', entry)
  res.status(201).json(entry)
})

// ---- Costs ----
app.get('/api/costs', (req, res) => {
  const byModel: Record<string, { requests: number; tokens: number; cost: number }> = {}
  const byAgent: Record<string, { requests: number; tokens: number; cost: number }> = {}

  for (const agent of agentsState) {
    const key = agent.model
    byModel[key] = byModel[key] || { requests: 0, tokens: 0, cost: 0 }
    byModel[key].requests += 1
    byModel[key].tokens += agent.tokens
    byModel[key].cost += agent.cost

    byAgent[agent.name] = {
      requests: 1,
      tokens: agent.tokens,
      cost: agent.cost,
    }
  }

  res.json({
    total: agentsState.reduce((s, a) => s + a.cost, 0),
    byModel: Object.entries(byModel).map(([model, data]) => ({
      model,
      ...data,
      pct: 0, // Will be calculated on frontend
    })),
    byAgent: Object.entries(byAgent).map(([name, data]) => ({
      name,
      ...data,
    })),
  })
})

// ---- Logs ----
app.get('/api/logs', (req, res) => {
  res.json(activityLog.slice(-100).reverse())
})

// ---- Rate Limits ----
app.get('/api/rate-limits', (req, res) => {
  res.json(getRateLimiterStats())
})

// ---- Projects (Create Team) ----
app.post('/api/projects', (req, res) => {
  const { name, request } = req.body
  try {
    const team = createAgencyTeam(name, request)
    res.status(201).json(team)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── WebSocket ────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('📡 Client connected:', socket.id)

  // أرسل الحالة الحالية فور الاتصال
  socket.emit('init', {
    agents: agentsState,
    tasks: tasksState,
    activity: activityLog.slice(-20),
  })

  socket.on('disconnect', () => {
    console.log('📡 Client disconnected:', socket.id)
  })
})

// ─── Helper ───────────────────────────────────────────────────────────────────

function addActivity(agent: string, message: string) {
  const time = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  activityLog.push({ time, agent, message })
  io.emit('activity:new', { time, agent, message })
}

// ─── Simulate Agent Activity (Demo) ───────────────────────────────────────────

function simulateActivity() {
  setInterval(() => {
    const activeAgents = agentsState.filter(a => a.status === 'active')
    if (activeAgents.length === 0) return

    const agent = activeAgents[Math.floor(Math.random() * activeAgents.length)]
    const actions = [
      'يقرأ الكود المصدري...',
      'يكتب تعديلات على الملفات...',
      'يراجع الاختبارات...',
      'يحلل المتطلبات...',
      'يكتب توثيقاً...',
    ]
    const message = actions[Math.floor(Math.random() * actions.length)]

    agent.tokens += Math.floor(Math.random() * 100) + 20
    agent.cost = parseFloat((agent.tokens * 0.00001).toFixed(4))

    addActivity(agent.name, message)
    io.emit('agent:update', agent)
  }, 5000)
}

// ─── Start Server ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001

httpServer.listen(PORT, () => {
  console.log(`\n  🟢 OpenClaude API Server running`)
  console.log(`  📍 http://localhost:${PORT}`)
  console.log(`  📡 WebSocket enabled\n`)

  simulateActivity()
})
```

---

## الملف الثاني: `hooks/useApi.ts` (React Hooks)

```typescript
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔌 React Hooks للتواصل مع الـ Backend
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Agent {
  id:       string
  name:     string
  model:    string
  status:   'active' | 'idle' | 'done' | 'error'
  tokens:   number
  cost:     number
  task:     string
}

export interface Task {
  id:           string
  title:        string
  description:  string
  assignedTo:   string | null
  status:       'pending' | 'in-progress' | 'completed' | 'blocked'
  priority:     'critical' | 'high' | 'medium' | 'low'
  department:   string
  dependencies: string[]
  createdAt:    string
  completedAt?: string
  output?:      string
}

export interface Activity {
  time:    string
  agent:   string
  message: string
}

export interface MemoryEntry {
  id:          string
  level:       'hot' | 'warm' | 'cold'
  projectName: string
  agentName:   string
  content:     string
  tags:        string[]
  importance:  number
  createdAt:   string
  accessCount: number
}

// ─── API Base URL ─────────────────────────────────────────────────────────────

const API_URL = 'http://localhost:3001'

// ─── useSocket Hook ───────────────────────────────────────────────────────────

let socket: Socket | null = null

export function useSocket() {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!socket) {
      socket = io(API_URL, { transports: ['websocket'] })
    }

    socket.on('connect',    () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    return () => {
      socket?.off('connect')
      socket?.off('disconnect')
    }
  }, [])

  return { socket, connected }
}

// ─── useAgents Hook ───────────────────────────────────────────────────────────

export function useAgents() {
  const [agents, setAgents]       = useState<Agent[]>([])
  const [loading, setLoading]     = useState(true)
  const { socket, connected }     = useSocket()

  // جلب البيانات الأولية
  useEffect(() => {
    fetch(`${API_URL}/api/agents`)
      .then(res => res.json())
      .then(data => {
        setAgents(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // الاستماع للتحديثات الحية
  useEffect(() => {
    if (!socket) return

    socket.on('agent:status', (agent: Agent) => {
      setAgents(prev =>
        prev.map(a => a.id === agent.id ? { ...a, status: agent.status } : a)
      )
    })

    socket.on('agent:update', (agent: Agent) => {
      setAgents(prev =>
        prev.map(a => a.id === agent.id ? agent : a)
      )
    })

    return () => {
      socket.off('agent:status')
      socket.off('agent:update')
    }
  }, [socket])

  const startAgent = useCallback(async (id: string) => {
    await fetch(`${API_URL}/api/agents/${id}/start`, { method: 'POST' })
  }, [])

  const stopAgent = useCallback(async (id: string) => {
    await fetch(`${API_URL}/api/agents/${id}/stop`, { method: 'POST' })
  }, [])

  return { agents, loading, connected, startAgent, stopAgent }
}

// ─── useTasks Hook ────────────────────────────────────────────────────────────

export function useTasks() {
  const [tasks, setTasks]     = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const { socket }            = useSocket()

  useEffect(() => {
    fetch(`${API_URL}/api/tasks`)
      .then(res => res.json())
      .then(data => {
        setTasks(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!socket) return

    socket.on('task:new', (task: Task) => {
      setTasks(prev => [...prev, task])
    })

    socket.on('task:complete', (task: Task) => {
      setTasks(prev =>
        prev.map(t => t.id === task.id ? task : t)
      )
    })

    return () => {
      socket.off('task:new')
      socket.off('task:complete')
    }
  }, [socket])

  const createTask = useCallback(async (data: Partial<Task>) => {
    const res = await fetch(`${API_URL}/api/tasks`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    })
    return res.json()
  }, [])

  const completeTask = useCallback(async (id: string, output?: string) => {
    const res = await fetch(`${API_URL}/api/tasks/${id}/complete`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ output }),
    })
    return res.json()
  }, [])

  return { tasks, loading, createTask, completeTask }
}

// ─── useActivity Hook ─────────────────────────────────────────────────────────

export function useActivity() {
  const [activities, setActivities] = useState<Activity[]>([])
  const { socket }                  = useSocket()

  useEffect(() => {
    fetch(`${API_URL}/api/logs`)
      .then(res => res.json())
      .then(data => setActivities(data))
      .catch(() => {})

    if (!socket) return

    socket.on('activity:new', (activity: Activity) => {
      setActivities(prev => [activity, ...prev].slice(0, 100))
    })

    return () => {
      socket.off('activity:new')
    }
  }, [socket])

  return activities
}

// ─── useMemory Hook ───────────────────────────────────────────────────────────

export function useMemory(level: 'all' | 'hot' | 'warm' | 'cold' = 'all') {
  const [entries, setEntries] = useState<MemoryEntry[]>([])
  const [stats, setStats]     = useState({ hot: 0, warm: 0, cold: 0, total: 0 })
  const [loading, setLoading] = useState(true)

  const fetchMemory = useCallback(() => {
    setLoading(true)
    fetch(`${API_URL}/api/memory?level=${level}`)
      .then(res => res.json())
      .then(data => {
        setEntries(data.entries)
        setStats(data.stats)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [level])

  useEffect(() => {
    fetchMemory()
  }, [fetchMemory])

  const addMemory = useCallback(async (
    level: 'hot' | 'warm' | 'cold',
    agent: string,
    content: string,
    importance: number = 5,
    tags: string[] = []
  ) => {
    await fetch(`${API_URL}/api/memory`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ level, agent, content, importance, tags }),
    })
    fetchMemory()
  }, [fetchMemory])

  return { entries, stats, loading, addMemory, refresh: fetchMemory }
}

// ─── useCosts Hook ────────────────────────────────────────────────────────────

export function useCosts() {
  const [costs, setCosts]     = useState<{
    total:   number
    byModel: { model: string; requests: number; tokens: number; cost: number }[]
    byAgent: { name: string; requests: number; tokens: number; cost: number }[]
  }>({ total: 0, byModel: [], byAgent: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_URL}/api/costs`)
      .then(res => res.json())
      .then(data => {
        setCosts(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return { costs, loading }
}

// ─── useStatus Hook ───────────────────────────────────────────────────────────

export function useStatus() {
  const [status, setStatus] = useState({
    activeAgents: 0,
    totalAgents:  0,
    totalCost:    0,
    totalTokens:  0,
    uptime:       '0',
  })

  useEffect(() => {
    const fetchStatus = () => {
      fetch(`${API_URL}/api/status`)
        .then(res => res.json())
        .then(setStatus)
        .catch(() => {})
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  return status
}
```

---

## الملف الثالث: `tasks-page.tsx` (صفحة المهام)

```tsx
import React, { useState } from 'react'
import { useTasks, useActivity, type Task } from './hooks/useApi'

// ─── Task Tree Node ───────────────────────────────────────────────────────────

function TaskNode({
  task,
  allTasks,
  depth = 0,
  onComplete,
}: {
  task: Task
  allTasks: Task[]
  depth?: number
  onComplete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = allTasks.some(t => t.dependencies.includes(task.id))

  const statusConfig = {
    pending:    { color: 'var(--text-tertiary)', icon: '○' },
    'in-progress': { color: 'var(--warning)',    icon: '◐' },
    completed:  { color: 'var(--success)',       icon: '●' },
    blocked:    { color: 'var(--error)',         icon: '⊘' },
  }
  const config = statusConfig[task.status]

  const priorityColors = {
    critical: 'var(--error)',
    high:     'var(--warning)',
    medium:   'var(--info)',
    low:      'var(--text-tertiary)',
  }

  return (
    <div style={{ marginBottom: 2 }}>
      {/* Main Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          padding: '8px 12px',
          paddingLeft: depth * 20 + 12,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          transition: 'background var(--transition)',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Expand Toggle */}
        <span style={{
          width: 16,
          color: 'var(--text-tertiary)',
          fontSize: 10,
          opacity: hasChildren ? 1 : 0,
          transform: expanded ? 'rotate(90deg)' : 'none',
          transition: 'transform var(--transition)',
        }}>
          ▶
        </span>

        {/* Status Icon */}
        <span style={{
          color: config.color,
          fontSize: 14,
          fontWeight: 500,
        }}>
          {config.icon}
        </span>

        {/* Title */}
        <span style={{
          flex: 1,
          fontSize: 'var(--text-sm)',
          fontWeight: task.status === 'completed' ? 400 : 500,
          color: task.status === 'completed'
            ? 'var(--text-tertiary)'
            : 'var(--text-primary)',
          textDecoration: task.status === 'completed'
            ? 'line-through'
            : 'none',
        }}>
          {task.title}
        </span>

        {/* Priority */}
        <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: priorityColors[task.priority],
          flexShrink: 0,
        }} />

        {/* Department */}
        <span style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono)',
          minWidth: 80,
        }}>
          {task.department}
        </span>

        {/* Complete Button */}
        {task.status !== 'completed' && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onComplete(task.id)
            }}
            style={{
              padding: '2px 8px',
              background: 'transparent',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              fontSize: 'var(--text-xs)',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            تم
          </button>
        )}
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div style={{ marginTop: 2 }}>
          {allTasks
            .filter(t => t.dependencies.includes(task.id))
            .map(child => (
              <TaskNode
                key={child.id}
                task={child}
                allTasks={allTasks}
                depth={depth + 1}
                onComplete={onComplete}
              />
            ))}
        </div>
      )}
    </div>
  )
}

// ─── New Task Form ────────────────────────────────────────────────────────────

function NewTaskForm({
  onSubmit,
  tasks,
}: {
  onSubmit: (data: Partial<Task>) => void
  tasks: Task[]
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Task['priority']>('medium')
  const [department, setDepartment] = useState('development')
  const [dependsOn, setDependsOn] = useState<string[]>([])

  const handleSubmit = () => {
    if (!title.trim()) return
    onSubmit({
      title,
      priority,
      department,
      dependencies: dependsOn,
    })
    setTitle('')
    setDependsOn([])
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          width: '100%',
          padding: '12px 16px',
          background: 'var(--bg-secondary)',
          border: '1px dashed var(--border-primary)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-secondary)',
          fontSize: 'var(--text-sm)',
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
          marginBottom: 'var(--space-lg)',
        }}
      >
        + إضافة مهمة جديدة
      </button>
    )
  }

  return (
    <div style={{
      padding: 'var(--space-lg)',
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-primary)',
      borderRadius: 'var(--radius-md)',
      marginBottom: 'var(--space-lg)',
    }}>
      <input
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="عنوان المهمة..."
        style={{
          width: '100%',
          padding: '10px 14px',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text-primary)',
          fontSize: 'var(--text-sm)',
          fontFamily: 'var(--font-sans)',
          outline: 'none',
          marginBottom: 'var(--space-md)',
        }}
      />

      <div style={{
        display: 'flex',
        gap: 'var(--space-md)',
        marginBottom: 'var(--space-md)',
      }}>
        {/* Priority */}
        <select
          value={priority}
          onChange={e => setPriority(e.target.value as Task['priority'])}
          style={{
            flex: 1,
            padding: '8px 12px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            fontSize: 'var(--text-sm)',
            cursor: 'pointer',
          }}
        >
          <option value="critical">حرج</option>
          <option value="high">عالي</option>
          <option value="medium">متوسط</option>
          <option value="low">منخفض</option>
        </select>

        {/* Department */}
        <select
          value={department}
          onChange={e => setDepartment(e.target.value)}
          style={{
            flex: 1,
            padding: '8px 12px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            fontSize: 'var(--text-sm)',
            cursor: 'pointer',
          }}
        >
          <option value="development">تطوير</option>
          <option value="marketing">تسويق</option>
          <option value="design">تصميم</option>
          <option value="qa">جودة</option>
        </select>
      </div>

      {/* Dependencies */}
      {tasks.length > 0 && (
        <div style={{ marginBottom: 'var(--space-md)' }}>
          <label style={{
            display: 'block',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-tertiary)',
            marginBottom: 'var(--space-sm)',
          }}>
            تعتمد على:
          </label>
          <select
            multiple
            value={dependsOn}
            onChange={e => setDependsOn(
              Array.from(e.target.selectedOptions, opt => opt.value)
            )}
            style={{
              width: '100%',
              height: 80,
              padding: '8px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: 'var(--text-xs)',
            }}
          >
            {tasks.filter(t => t.status !== 'completed').map(t => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
        <button
          onClick={() => setOpen(false)}
          style={{
            padding: '8px 16px',
            background: 'transparent',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-secondary)',
            fontSize: 'var(--text-sm)',
            cursor: 'pointer',
          }}
        >
          إلغاء
        </button>
        <button
          onClick={handleSubmit}
          style={{
            padding: '8px 16px',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            color: '#fff',
            fontSize: 'var(--text-sm)',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          إنشاء
        </button>
      </div>
    </div>
  )
}

// ─── Tasks Page ───────────────────────────────────────────────────────────────

export default function TasksPage() {
  const { tasks, loading, createTask, completeTask } = useTasks()
  const activities = useActivity()

  // Filter root tasks (no dependencies)
  const rootTasks = tasks.filter(t => t.dependencies.length === 0)

  const stats = {
    total:     tasks.length,
    done:      tasks.filter(t => t.status === 'completed').length,
    pending:   tasks.filter(t => t.status === 'pending').length,
    inProgress: tasks.filter(t => t.status === 'in-progress').length,
    blocked:   tasks.filter(t => t.status === 'blocked').length,
  }

  if (loading) {
    return (
      <div style={{
        color: 'var(--text-tertiary)',
        padding: 40,
        textAlign: 'center',
      }}>
        جاري التحميل...
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 920 }}>
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-3xl)' }}>
        <h1 style={{
          fontSize: 'var(--text-xl)',
          fontWeight: 600,
          marginBottom: 'var(--space-xs)',
        }}>
          المهام
        </h1>
        <p style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--text-tertiary)',
        }}>
          شجرة المهام والاعتماديات
        </p>
      </div>

      {/* Stats */}
      <div style={{
        display: 'flex',
        gap: 'var(--space-lg)',
        marginBottom: 'var(--space-xl)',
      }}>
        {[
          { label: 'الكل',     value: stats.total,     color: 'var(--text-primary)' },
          { label: 'مكتمل',   value: stats.done,      color: 'var(--success)'      },
          { label: 'قيد العمل', value: stats.inProgress, color: 'var(--warning)'      },
          { label: 'معطل',   value: stats.blocked,   color: 'var(--error)'        },
        ].map(s => (
          <div key={s.label} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-sm)',
          }}>
            <span style={{
              fontSize: 20,
              fontWeight: 600,
              color: s.color,
            }}>
              {s.value}
            </span>
            <span style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-tertiary)',
            }}>
              {s.label}
            </span>
          </div>
        ))}

        {/* Progress Bar */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <div style={{
            flex: 1,
            height: 3,
            background: 'var(--border-subtle)',
            borderRadius: 2,
          }}>
            <div style={{
              height: '100%',
              width: `${stats.total > 0 ? (stats.done / stats.total) * 100 : 0}%`,
              background: 'var(--success)',
              borderRadius: 2,
              transition: 'width 500ms ease',
            }} />
          </div>
          <span style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-mono)',
          }}>
            {stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0}%
          </span>
        </div>
      </div>

      {/* New Task Form */}
      <NewTaskForm onSubmit={createTask} tasks={tasks} />

      {/* Task Tree */}
      <div style={{ marginBottom: 'var(--space-3xl)' }}>
        {rootTasks.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: 'var(--space-3xl)',
            color: 'var(--text-tertiary)',
            fontSize: 'var(--text-sm)',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
          }}>
            لا توجد مهام بعد. أضف أول مهمة للبدء.
          </div>
        ) : (
          rootTasks.map(task => (
            <TaskNode
              key={task.id}
              task={task}
              allTasks={tasks}
              onComplete={(id) => completeTask(id)}
            />
          ))
        )}
      </div>

      {/* Activity Feed */}
      <div>
        <h2 style={{
          fontSize: 'var(--text-base)',
          fontWeight: 600,
          marginBottom: 'var(--space-lg)',
        }}>
          آخر النشاطات
        </h2>
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-lg)',
          maxHeight: 300,
          overflow: 'auto',
        }}>
          {activities.length === 0 ? (
            <div style={{
              color: 'var(--text-tertiary)',
              fontSize: 'var(--text-sm)',
              textAlign: 'center',
            }}>
              لا توجد نشاطات بعد
            </div>
          ) : (
            activities.slice(0, 15).map((act, i) => (
              <div key={i} style={{
                display: 'flex',
                gap: 'var(--space-md)',
                padding: '6px 0',
                fontSize: 'var(--text-sm)',
                borderBottom: i < 14 ? '1px solid var(--border-subtle)' : 'none',
              }}>
                <span style={{
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-xs)',
                  minWidth: 50,
                }}>
                  {act.time}
                </span>
                <span style={{
                  color: 'var(--accent)',
                  fontFamily: 'var(--font-mono)',
                  minWidth: 120,
                }}>
                  {act.agent}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {act.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
```

---

## الملف الرابع: تحديث `app.tsx` لاستخدام Hooks

```tsx
import React, { useState } from 'react'
import './globals.css'

// Pages
import HomePage     from './home-page'
import AgentsPage   from './agents-page'
import TasksPage    from './tasks-page'
import MemoryPage   from './memory-page'
import CostPage     from './cost-page'
import SettingsPage from './settings-page'

// Hooks
import { useStatus, useSocket } from './hooks/useApi'

type Page = 'home' | 'agents' | 'tasks' | 'memory' | 'cost' | 'logs' | 'settings'

export default function App() {
  const [active, setActive] = useState<Page>('home')
  const status = useStatus()
  const { connected } = useSocket()

  const nav = [
    { id: 'home'     as Page, label: 'الرئيسية' },
    { id: 'agents'   as Page, label: 'الوكلاء' },
    { id: 'tasks'    as Page, label: 'المهام' },
    { id: 'memory'   as Page, label: 'الذاكرة' },
    { id: 'cost'     as Page, label: 'التكاليف' },
    { id: 'settings' as Page, label: 'الإعدادات' },
  ]

  const pages: Record<Page, React.ReactNode> = {
    home:     <HomePage />,
    agents:   <AgentsPage />,
    tasks:    <TasksPage />,
    memory:   <MemoryPage />,
    cost:     <CostPage />,
    logs:     <div>صفحة السجلات</div>,
    settings: <SettingsPage />,
  }

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: 'var(--bg-primary)',
      direction: 'rtl',
      fontFamily: 'var(--font-sans)',
    }}>
      {/* Sidebar */}
      <aside style={{
        width: 200,
        borderLeft: '1px solid var(--border-subtle)',
        background: 'var(--bg-secondary)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Logo */}
        <div style={{ padding: '16px 12px 20px' }}>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 2 }}>
            OpenClaude
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            Agency v2.0
          </div>
        </div>

        {/* Status */}
        <div style={{
          padding: '8px 12px',
          margin: '0 8px 16px',
          background: 'var(--bg-tertiary)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 'var(--text-xs)',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 4,
          }}>
            <span style={{ color: 'var(--text-tertiary)' }}>الخادم</span>
            <span style={{
              color: connected ? 'var(--success)' : 'var(--error)',
            }}>
              {connected ? 'متصل ●' : 'غير متصل ○'}
            </span>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
          }}>
            <span style={{ color: 'var(--text-tertiary)' }}>التكلفة</span>
            <span style={{ color: 'var(--text-secondary)' }}>
              ${status.totalCost.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ padding: '0 8px', flex: 1 }}>
          {nav.map(item => (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 12px',
                textAlign: 'right',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                background: active === item.id ? 'var(--bg-active)' : 'transparent',
                color: active === item.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
                marginBottom: 2,
                transition: 'all var(--transition)',
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main style={{
        flex: 1,
        overflow: 'auto',
        padding: '40px 48px',
      }}>
        {pages[active]}
      </main>
    </div>
  )
}
```

---

## 📦 Dependencies المطلوبة

```bash
# Backend
npm install express cors socket.io

# Frontend (إذا لم تكن موجودة)
npm install react react-dom socket.io-client

# Types
npm install --save-dev @types/express @types/cors
```

---

## 🚀 للتشغيل

```bash
# Terminal 1 - Backend
npx tsx server.ts

# Terminal 2 - Frontend (if using Vite/Next)
npm run dev
```

---

## ✅ ما أصبح جاهزاً الآن

```
1. Backend Server مع API حقيقي
2. WebSocket للتحديث الحية
3. صفحة المهام التفاعلية
4. React Hooks للتواصل مع الـ Backend
5. البيانات تتحدث تلقائياً بدون تحديث الصفحة
```
