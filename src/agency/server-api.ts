import * as http from 'http'
import * as fs from 'fs'
import * as path from 'path'
import { exec } from 'child_process'
import { loadApiKey, saveApiKey, listApiKeyIds } from '../utils/secureStorage/apiKeyVault.js'
import { searchMemPalace, saveToMemPalace, writeDailyLog, readDailyLog, generateDailyLogSummary, listDailyLogs, recordExperiment, updateExperiment, getExperimentResults, getExperimentSummary } from './shared-memory.js'
import { qualityGates, type OutputType } from './quality-gates.js'
import { analyzeRequest, buildExecutionPlan, synthesizeResults, launchProject } from './agent-zero.js'
import { listActiveTeams, getTeamProgress, synthesizeTeamResults } from './team-orchestrator.js'
import { getMemoryStats, queryMemory } from './tiered-memory.js'
import { getRateLimiterStats } from './rate-limiter.js'
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
} from './elite-intelligence.js'
import { loadTemplates, generateDailyReport, getReportHistory } from './project-templates.js'

// ─── Utilities ─────────────────────────────────────────────────────────────

/**
 * Heuristic to determine if a model is handled locally by Ollama
 * or remotely via OpenRouter.
 */
function isModelLocal(model: string): boolean {
  // If explicitly specified in common Ollama model names or if it lacks a provider slash
  const localHints = ['llama3', 'qwen', 'mistral', 'phi3', 'gemma:2b', 'gemma:7b'];
  const hasProvider = model.includes('/');
  const isLocalHint = localHints.some(hint => model.toLowerCase().includes(hint));
  
  // Standard heuristic: No slash usually means it's a local Ollama model identifier
  return !hasProvider || (isLocalHint && !model.includes('anthropic/') && !model.includes('google/') && !model.includes('openai/'));
}

function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'OPTIONS, GET, POST',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  }
}

function getSseHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'OPTIONS, GET, POST',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  }
}

function sendSseEvent(res: http.ServerResponse, event: string, data: any) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

// ─── Data Access ────────────────────────────────────────────────────────────

function getAgencyConfig(cwd: string) {
  try {
    const raw = fs.readFileSync(path.join(cwd, '.claude', 'agency-config.json'), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function getAgentsMeta(cwd: string) {
  const agentsDir = path.join(cwd, '.claude', 'agents')
  const agentsMeta: Record<string, any> = {}
  
  if (!fs.existsSync(agentsDir)) return agentsMeta

  const depts = fs.readdirSync(agentsDir, { withFileTypes: true }).filter(d => d.isDirectory())
  
  for (const dept of depts) {
    const files = fs.readdirSync(path.join(agentsDir, dept.name)).filter(f => f.endsWith('.md'))
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(agentsDir, dept.name, file), 'utf-8')
        const name = path.basename(file, '.md')
        const meta: any = { name }
        const match = raw.match(/^---\n([\s\S]*?)\n---/)
        if (match) {
          const yaml = match[1]!
          for (const line of yaml.split('\n')) {
            const m = line.match(/^(\w[\w-]*):\s*(.*)$/)
            if (m) {
              const key = m[1]!
              const value = m[2]!.replace(/^["']|["']$/g, '').trim()
              meta[key] = value
            }
          }
        }
        
        // Extract tools and role manually if missing
        if (!meta.role) meta.role = 'وكيل محترف'
        if (!meta.emoji) meta.emoji = '🤖'
        
        agentsMeta[name] = meta
      } catch {
        // ignore malformed
      }
    }
  }
  return agentsMeta
}

function getKnowledge(cwd: string) {
  const kbDir = path.join(cwd, '.claude', 'agency', 'knowledge')
  const knowledge: Record<string, string[]> = {}
  
  if (!fs.existsSync(kbDir)) return knowledge
  
  const agents = fs.readdirSync(kbDir, { withFileTypes: true }).filter(d => d.isDirectory())
  
  for (const agent of agents) {
    try {
      const files = fs.readdirSync(path.join(kbDir, agent.name))
        .filter(f => f.endsWith('.md') || f.endsWith('.txt'))
      knowledge[agent.name] = files
    } catch {
      knowledge[agent.name] = []
    }
  }
  return knowledge
}

function getProjects(cwd: string) {
  const projDir = path.join(cwd, '.claude', 'agency', 'projects')
  const projects: any[] = []
  
  if (!fs.existsSync(projDir)) return projects
  
  const dirs = fs.readdirSync(projDir, { withFileTypes: true }).filter(d => d.isDirectory())
  
  for (const dir of dirs) {
    try {
      const state = JSON.parse(fs.readFileSync(path.join(projDir, dir.name, 'state.json'), 'utf-8'))
      projects.push({ name: dir.name, ...state })
    } catch {
      projects.push({ name: dir.name, status: 'unknown' })
    }
  }
  return projects
}

// ─── Task Management ───────────────────────────────────────────────────────

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

// ─── Agent System Prompt ─────────────────────────────────────────────────────

function getAgentSystemPrompt(cwd: string, agentName: string): string {
  const agentsDir = path.join(cwd, '.claude', 'agents')
  try {
    const depts = fs.readdirSync(agentsDir, { withFileTypes: true }).filter(d => d.isDirectory())
    for (const dept of depts) {
      const filePath = path.join(agentsDir, dept.name, `${agentName}.md`)
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8')
        // Strip YAML frontmatter, return only the prompt body
        return raw.replace(/^---[\s\S]*?---\n/, '').trim()
      }
    }
  } catch { /* ignore */ }
  return `أنت وكيل ذكاء اصطناعي محترف اسمك ${agentName}. كن مفيداً ودقيقاً.`
}

// ─── OpenRouter / Ollama API Call ─────────────────────────────────────────────────────────

async function callOpenRouterAPI(apiKey: string, systemPrompt: string, messages: {role: string, content: string}[], model: string = 'anthropic/claude-3.5-sonnet:beta'): Promise<string> {
  const openRouterMessages = [
    { role: 'system', content: systemPrompt },
    ...messages
  ]

  const body = JSON.stringify({
    model: model,
    messages: openRouterMessages
  })

  const isLocal = isModelLocal(model);
  const endpoint = isLocal ? 'http://localhost:11434/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
  const headers: any = {
    'Content-Type': 'application/json'
  };
  
  if (!isLocal) {
    headers['Authorization'] = `Bearer ${apiKey}`;
    headers['HTTP-Referer'] = 'https://openclaude.agency';
    headers['X-Title'] = 'OpenClaude Agency';
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body
  })

  if (!response.ok) {
    const err = await response.text()
    const providerName = isLocal ? 'Ollama' : 'OpenRouter'
    throw new Error(`${providerName} API Error ${response.status}: ${err}`)
  }

  const data: any = await response.json()
  return data.choices?.[0]?.message?.content ?? ''
}

// ─── OpenRouter / Ollama Streaming API Call ────────────────────────────────────────────────────────────────────────────

async function streamOpenRouterToSse(
  res: http.ServerResponse,
  apiKey: string,
  systemPrompt: string,
  messages: {role: string, content: string}[],
  model: string = 'anthropic/claude-3.5-sonnet:beta'
): Promise<string> {
  const openRouterMessages = [
    { role: 'system', content: systemPrompt },
    ...messages
  ]

  const body = JSON.stringify({
    model,
    messages: openRouterMessages,
    stream: true
  })

  const isLocal = isModelLocal(model);
  const endpoint = isLocal ? 'http://localhost:11434/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
  const headers: any = {
    'Content-Type': 'application/json'
  };
  
  if (!isLocal) {
    headers['Authorization'] = `Bearer ${apiKey}`;
    headers['HTTP-Referer'] = 'https://openclaude.agency';
    headers['X-Title'] = 'OpenClaude Agency';
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body
  })

  if (!response.ok) {
    const err = await response.text()
    const providerName = isLocal ? 'Ollama' : 'OpenRouter'
    throw new Error(`${providerName} Streaming Error ${response.status}: ${err}`)
  }

  if (!response.body) throw new Error('No response body from OpenRouter')

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let fullReply = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed === 'data: [DONE]') continue
      if (!trimmed.startsWith('data: ')) continue

      try {
        const json = JSON.parse(trimmed.slice(6))
        const delta = json.choices?.[0]?.delta?.content ?? ''
        if (delta) {
          fullReply += delta
          sendSseEvent(res, 'token', { token: delta })
        }
      } catch { /* skip malformed */ }
    }
  }

  sendSseEvent(res, 'done', { reply: fullReply })
  return fullReply
}

// ─── Parse body helper ────────────────────────────────────────────────────────

function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')) }
      catch { resolve({}) }
    })
    req.on('error', reject)
  })
}

// ─── Server logic ──────────────────────────────────────────────────────────

export function startApiServer(cwd: string, port: number = 3766) {
  const server = http.createServer(async (req, res) => {
    // 1. CORS
    if (req.method === 'OPTIONS') {
      res.writeHead(204, getCorsHeaders())
      res.end()
      return
    }

    const headers = getCorsHeaders()
    const url = new URL(req.url || '/', `http://${req.headers.host}`)

    // ─── Static File Serving for Dashboard ──────────────────────────────────
    const staticFiles: Record<string, string> = {
      '/':           'index.html',
      '/index.html': 'index.html',
      '/app.js':     'app.js',
      '/style.css':  'style.css',
      '/reports-patch.js': 'reports-patch.js',
    }

    if (req.method === 'GET' && staticFiles[url.pathname]) {
      const dashboardDir = path.join(cwd, 'agency-dashboard')
      const filePath = path.join(dashboardDir, staticFiles[url.pathname]!)
      if (fs.existsSync(filePath)) {
        const ext = path.extname(filePath)
        const mime = ext === '.html' ? 'text/html; charset=utf-8'
          : ext === '.js'  ? 'application/javascript; charset=utf-8'
          : ext === '.css' ? 'text/css; charset=utf-8'
          : 'text/plain'
        res.writeHead(200, { ...getCorsHeaders(), 'Content-Type': mime })
        res.end(fs.readFileSync(filePath))
        return
      }
    }

    try {
      if (req.method === 'GET' && url.pathname === '/api/config') {
        const data = getAgencyConfig(cwd)
        res.writeHead(200, headers)
        res.end(JSON.stringify({ success: true, data }))
      } 
      else if (req.method === 'GET' && url.pathname === '/api/agents') {
        const data = getAgentsMeta(cwd)
        res.writeHead(200, headers)
        res.end(JSON.stringify({ success: true, data }))
      }
      else if (req.method === 'GET' && url.pathname === '/api/knowledge') {
        const data = getKnowledge(cwd)
        res.writeHead(200, headers)
        res.end(JSON.stringify({ success: true, data }))
      }
      else if (req.method === 'GET' && url.pathname === '/api/projects') {
        const data = getProjects(cwd)
        res.writeHead(200, headers)
        res.end(JSON.stringify({ success: true, data }))
      }
      // ─── GET /api/tasks ── Fetch Tasks ────────────────────────────────────
      else if (req.method === 'GET' && url.pathname === '/api/tasks') {
        const data = loadTasks(cwd)
        res.writeHead(200, headers)
        res.end(JSON.stringify({ success: true, data }))
      }
      // ─── POST /api/tasks ── Create new Task ───────────────────────────────
      else if (req.method === 'POST' && url.pathname === '/api/tasks') {
        const body = await parseBody(req)
        const { title, description, assignedTo, priority, department, dependencies = [] } = body
        
        if (!title) {
          res.writeHead(400, headers)
          res.end(JSON.stringify({ success: false, error: 'عنوان المهمة مطلوب' }))
          return
        }

        const task = {
          id: `task_${Date.now()}`,
          title,
          description: description || '',
          assignedTo: assignedTo || null,
          status: 'pending',
          priority: priority || 'medium',
          department: department || 'development',
          dependencies: dependencies,
          createdAt: new Date().toISOString(),
        }

        const tasks = loadTasks(cwd)
        tasks.push(task)
        saveTasks(cwd, tasks)

        res.writeHead(201, headers)
        res.end(JSON.stringify({ success: true, data: task }))
      }
      // ─── POST /api/tasks/:id/complete ── Complete a Task ─────────────────
      else if (req.method === 'POST' && url.pathname.match(/^\/api\/tasks\/(.+)\/complete$/)) {
        const match = url.pathname.match(/^\/api\/tasks\/(.+)\/complete$/)
        const taskId = match ? match[1] : null
        
        const tasks = loadTasks(cwd)
        const task = tasks.find(t => t.id === taskId)
        
        if (!task) {
          res.writeHead(404, headers)
          res.end(JSON.stringify({ success: false, error: 'Task not found' }))
          return
        }

        task.status = 'completed'
        task.completedAt = new Date().toISOString()
        saveTasks(cwd, tasks)

        res.writeHead(200, headers)
        res.end(JSON.stringify({ success: true, data: task }))
      }
      // ─── GET /api/models ── Fetch OpenRouter Models ─────────────────────
      else if (req.method === 'GET' && url.pathname === '/api/models') {
        const DEFAULT_MODELS = [
          { id: 'meta-llama/llama-3.3-70b-instruct:free', name: '🟢 Llama 3.3 70B (Free)', provider: 'meta-llama' },
          { id: 'meta-llama/llama-3.2-3b-instruct:free', name: '🟢 Llama 3.2 3B (Free)', provider: 'meta-llama' },
          { id: 'google/gemma-3-27b-it:free', name: '🟢 Gemma 3 27B (Free)', provider: 'google' },
          { id: 'qwen/qwen-2.5-72b-instruct:free', name: '🟢 Qwen 2.5 72B (Free)', provider: 'qwen' },
          { id: 'anthropic/claude-3.5-sonnet:beta', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
          { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'openai' },
          { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
          { id: 'google/gemini-flash-1.5', name: 'Gemini Flash 1.5', provider: 'google' }
        ];

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 seconds timeout
          
          const response = await fetch('https://openrouter.ai/api/v1/models', { signal: controller.signal });
          clearTimeout(timeoutId);
          
          if (!response.ok) throw new Error('Failed to fetch from OpenRouter');
          const data: any = await response.json();
          
          const models = data.data.map((m: any) => ({
            id: m.id,
            name: m.name,
            provider: m.id.split('/')[0]
          }));
          
          res.writeHead(200, headers);
          res.end(JSON.stringify({ success: true, data: models }));
        } catch (e: any) {
          console.error('[Models] Fetch failed, using defaults.', e.message);
          res.writeHead(200, headers);
          res.end(JSON.stringify({ success: true, data: DEFAULT_MODELS }));
        }
      }
      // ─── POST /api/chat ── Real AI Chat (non-streaming fallback) ────────
      else if (req.method === 'POST' && url.pathname === '/api/chat') {
        const body = await parseBody(req)
        const { agent, message, history = [], model = 'anthropic/claude-3.5-sonnet:beta' } = body

        if (!agent || !message) {
          res.writeHead(400, headers)
          res.end(JSON.stringify({ success: false, error: 'agent و message مطلوبان' }))
          return
        }

        const apiKey =
          loadApiKey('openrouter') ??
          loadApiKey('OPENROUTER_API_KEY') ??
          process.env['OPENROUTER_API_KEY'] ??
          ''

        const isLocal = isModelLocal(model);

        if (!apiKey && !isLocal) {
          res.writeHead(200, headers)
          res.end(JSON.stringify({
            success: false,
            error: 'لم يتم العثور على مفتاح OpenRouter API. أضفه عبر صفحة الإعدادات.',
            requiresKey: true
          }))
          return
        }

        const basePrompt = getAgentSystemPrompt(cwd, agent)
        const smartContext = getSmartContextForAgent(agent)
        const systemPrompt = smartContext ? `${basePrompt}\n\n---\n${smartContext}` : basePrompt
        const messages = [
          ...history.map((h: any) => ({ role: h.role, content: h.content })),
          { role: 'user', content: message }
        ]

        try {
          const reply = await callOpenRouterAPI(apiKey, systemPrompt, messages, model)
          res.writeHead(200, headers)
          res.end(JSON.stringify({ success: true, reply }))
        } catch (e: any) {
          res.writeHead(200, headers)
          res.end(JSON.stringify({ success: false, error: e.message }))
        }
      }
      // ─── POST /api/chat/stream ── SSE Streaming Chat (Post version for long history) ──
      else if (req.method === 'POST' && url.pathname === '/api/chat/stream') {
        const body = await parseBody(req)
        const { agent, message, history = [], model = 'anthropic/claude-3.5-sonnet:beta' } = body

        if (!agent || !message) {
          res.writeHead(400, getCorsHeaders())
          res.end(JSON.stringify({ success: false, error: 'agent و message مطلوبان' }))
          return
        }

        const apiKey =
          loadApiKey('openrouter') ??
          loadApiKey('OPENROUTER_API_KEY') ??
          process.env['OPENROUTER_API_KEY'] ??
          ''

        const isLocal = isModelLocal(model);

        if (!apiKey && !isLocal) {
          res.writeHead(200, getSseHeaders())
          sendSseEvent(res, 'error', { error: 'مفتاح OpenRouter غير موجود', requiresKey: true })
          res.end()
          return
        }

        res.writeHead(200, getSseHeaders())
        sendSseEvent(res, 'start', { agent, model })

        const basePrompt = getAgentSystemPrompt(cwd, agent)
        const smartContext = getSmartContextForAgent(agent)
        const systemPrompt = smartContext ? `${basePrompt}\n\n---\n${smartContext}` : basePrompt
        const messages = [
          ...history.map((h: any) => ({ role: h.role, content: h.content })),
          { role: 'user', content: message }
        ]

        try {
          await streamOpenRouterToSse(res, apiKey, systemPrompt, messages, model)
        } catch (e: any) {
          sendSseEvent(res, 'error', { error: e.message })
        } finally {
          res.end()
        }
      }
      // ─── GET /api/chat/stream ── SSE Streaming Chat ────────────────────────
      else if (req.method === 'GET' && url.pathname === '/api/chat/stream') {
        const agent   = url.searchParams.get('agent') ?? ''
        const message = url.searchParams.get('message') ?? ''
        const model   = url.searchParams.get('model') ?? 'anthropic/claude-3.5-sonnet:beta'
        const rawHistory = url.searchParams.get('history')
        let history: {role:string,content:string}[] = []
        try { history = rawHistory ? JSON.parse(rawHistory) : [] } catch {}

        if (!agent || !message) {
          res.writeHead(400, getCorsHeaders())
          res.end(JSON.stringify({ success: false, error: 'agent و message مطلوبان' }))
          return
        }

        const apiKey =
          loadApiKey('openrouter') ??
          loadApiKey('OPENROUTER_API_KEY') ??
          process.env['OPENROUTER_API_KEY'] ??
          ''

        const isLocal = isModelLocal(model);

        if (!apiKey && !isLocal) {
          res.writeHead(200, getSseHeaders())
          sendSseEvent(res, 'error', { error: 'مفتاح OpenRouter غير موجود', requiresKey: true })
          res.end()
          return
        }

        res.writeHead(200, getSseHeaders())
        sendSseEvent(res, 'start', { agent, model })

        const basePrompt = getAgentSystemPrompt(cwd, agent)
        const smartContext = getSmartContextForAgent(agent)
        const systemPrompt = smartContext ? `${basePrompt}\n\n---\n${smartContext}` : basePrompt
        const messages = [
          ...history.map((h: any) => ({ role: h.role, content: h.content })),
          { role: 'user', content: message }
        ]

        try {
          await streamOpenRouterToSse(res, apiKey, systemPrompt, messages, model)
        } catch (e: any) {
          sendSseEvent(res, 'error', { error: e.message })
        } finally {
          res.end()
        }
      }
      // ─── POST /api/pipeline/run ── Execute a Pipeline with SSE ────────────
      else if (req.method === 'POST' && url.pathname === '/api/pipeline/run') {
        const body = await parseBody(req)
        const { pipeline, message, model = 'anthropic/claude-3.5-sonnet:beta' } = body

        const config = getAgencyConfig(cwd)
        const pipelineDef = config?.agency?.pipelines?.[pipeline]

        if (!pipelineDef) {
          res.writeHead(404, getCorsHeaders())
          res.end(JSON.stringify({ success: false, error: `Pipeline "${pipeline}" غير موجود` }))
          return
        }

        const apiKey =
          loadApiKey('openrouter') ??
          loadApiKey('OPENROUTER_API_KEY') ??
          process.env['OPENROUTER_API_KEY'] ??
          ''

        const isLocal = isModelLocal(model);

        if (!apiKey && !isLocal) {
          res.writeHead(200, getSseHeaders())
          sendSseEvent(res, 'error', { error: 'مفتاح OpenRouter غير موجود', requiresKey: true })
          res.end()
          return
        }

        res.writeHead(200, getSseHeaders())
        sendSseEvent(res, 'pipeline-start', { pipeline, steps: pipelineDef.steps, total: pipelineDef.steps.length })

        // Log to Daily Log (Layer 1)
        writeDailyLog('pipeline-run', `بدء تشغيل مسار "${pipeline}" (${pipelineDef.steps.length} خطوات)`, { pipeline })

        // MemPalace: Inject Wake-up Context
        let wakeUpContext = ''
        try {
          const pastMems = searchMemPalace(pipeline, message)
          if (pastMems && pastMems.length > 0) {
            wakeUpContext = `\n> 🧠 [ذاكرة الوكالة التراكمية]: وجدنا الملاحظات التالية من أعمال سابقة:\n`
            pastMems.slice(0, 5).forEach(m => {
              wakeUpContext += `- [${m.agent}]: ${m.content.slice(0, 300)}...\n`
            })
          }
        } catch (e) {
          console.error('[MemPalace] Failed to retrieve context:', e)
        }

        let contextSoFar = `# طلب المستخدم\n${message}\n${wakeUpContext}\n\n`
        const results: {agent: string, reply: string}[] = []

        let stepIndex = 0
        let stepRetries = 0
        const MAX_RETRIES = 2
        const RATE_LIMIT_RETRIES = 3

        // Smart delay to avoid rate limits on free models
        const isFreeModel = model.includes(':free')
        const stepDelay = isFreeModel ? 5000 : 1000 // 5s for free, 1s for paid
        const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

        while (stepIndex < pipelineDef.steps.length) {
          const agentName = pipelineDef.steps[stepIndex]
          sendSseEvent(res, 'step-start', { step: stepIndex + 1, agent: agentName, total: pipelineDef.steps.length })

          const basePrompt = getAgentSystemPrompt(cwd, agentName)
          const smartContext = getSmartContextForAgent(agentName)
          const systemPrompt = smartContext ? `${basePrompt}\n\n---\n${smartContext}` : basePrompt
          
          let instructionMsg = `مهمتك الآن: اعمل على المـدخلات وقدّم مخرجاتك بشكل مفصّل واحترافي.`
          if (stepRetries > 0) {
            instructionMsg += `\n\n⚠️ تم رفض عملك السابق في هذه المرحلة بسبب أخطاء. الرجاء مراجعة المخرجات وتصحيحها بناءً على التغذية الراجعة.`
          }

          const agentMessages = [
            { role: 'user', content: `${contextSoFar}\n---\n${instructionMsg}` }
          ]

          try {
            const reply = await callOpenRouterAPI(apiKey, systemPrompt, agentMessages, model)
            
            // Self-Evaluation Analysis parsing
            if (reply.includes('<decision>REJECT</decision>')) {
              // Extract feedback if present
              const feedbackMatch = reply.match(/<feedback>([\s\S]*?)<\/feedback>/)
              const feedback = feedbackMatch ? feedbackMatch[1].trim() : 'لم يتم توضيح السبب.'
              
              sendSseEvent(res, 'step-reject', { 
                step: stepIndex + 1, 
                agent: agentName, 
                feedback,
                total: pipelineDef.steps.length 
              })

              // Reject penalty for previous agent if exists
              if (stepIndex > 0) {
                const prevAgent = pipelineDef.steps[stepIndex - 1]
                recordReputation({
                  agent: prevAgent, project: pipeline, task: `Rejected by ${agentName}`,
                  outcome: 'rejected', reviewer: agentName, feedback
                })
              }

              if (stepRetries < MAX_RETRIES && stepIndex > 0) {
                // Loop back to the previous agent
                stepRetries++
                stepIndex-- 
                contextSoFar += `\n## ❌ رفض من ${agentName}\nالسبب: ${feedback}\n`
                continue
              } else {
                // Max retries reached or first step failed
                sendSseEvent(res, 'step-error', { step: stepIndex + 1, agent: agentName, error: 'تم تجاوز الحد الأقصى للمراجعات أو فشل ذريع.' })
                break // Stop pipeline
              }
            }

            // If APPROVED or no decision tag (Auto-Approve)
            results.push({ agent: agentName, reply })
            contextSoFar += `\n## مخرجات ${agentName}\n${reply}\n`
            
            recordReputation({
              agent: agentName,
              project: pipeline,
              task: `Pipeline step ${stepIndex + 1}`,
              outcome: 'completed',
              reviewer: 'pipeline-engine',
              feedback: ''
            })
            
            sendSseEvent(res, 'step-done', { step: stepIndex + 1, agent: agentName, reply, total: pipelineDef.steps.length })
            stepIndex++ // Move forward
            stepRetries = 0 // Reset retries for next step

            // Rate limit protection: wait between steps
            if (stepIndex < pipelineDef.steps.length) {
              await sleep(stepDelay)
            }
          } catch (e: any) {
            // Handle 429 Rate Limit errors with retry
            if (e.message && e.message.includes('429') && stepRetries < RATE_LIMIT_RETRIES) {
              stepRetries++
              const retryDelay = stepDelay * stepRetries * 2 // Exponential backoff: 10s, 20s, 30s
              console.log(`[Pipeline] Rate limited on step ${stepIndex+1} (${agentName}). Retrying in ${retryDelay/1000}s... (attempt ${stepRetries}/${RATE_LIMIT_RETRIES})`)
              sendSseEvent(res, 'step-retry', { step: stepIndex + 1, agent: agentName, retryIn: retryDelay, attempt: stepRetries })
              await sleep(retryDelay)
              continue // Retry the same step
            }
            console.error(`[Pipeline Error] Step ${stepIndex+1} (${agentName}) failed:`, e.message)
            sendSseEvent(res, 'step-error', { step: stepIndex + 1, agent: agentName, error: e.message })
            break
          }
        }

        sendSseEvent(res, 'pipeline-done', { pipeline, results })

        // Log completion to Daily Log
        writeDailyLog('pipeline-done', `اكتمل مسار "${pipeline}" — ${results.length} خطوة ناجحة`, { pipeline })

        res.end()
      }
      // ─── POST /api/board/consult ── Virtual Board Consultation ────────────
      else if (req.method === 'POST' && url.pathname === '/api/board/consult') {
        const body = await parseBody(req)
        const { mentor, message, model = 'llama3.2:3b' } = body

        if (!mentor || !message) {
          res.writeHead(400, headers)
          res.end(JSON.stringify({ success: false, error: 'mentor و message مطلوبان' }))
          return
        }

        const apiKey =
          loadApiKey('openrouter') ??
          loadApiKey('OPENROUTER_API_KEY') ??
          process.env['OPENROUTER_API_KEY'] ??
          ''

        const isLocal = !model.includes('/');

        if (!apiKey && !isLocal) {
          res.writeHead(200, headers)
          res.end(JSON.stringify({
            success: false,
            error: 'لم يتم العثور على مفتاح OpenRouter API. أضفه عبر صفحة الإعدادات.',
            requiresKey: true
          }))
          return
        }

        // Mentor Personas
        const personas: Record<string, string> = {
          'steve-jobs': 'أنت ستيف جوبز. أنت تؤمن بالبساطة القصوى، التركيز الشديد، وأن التصميم ليس كيف يبدو المنتج بل كيف يعمل. لا تقبل التنازلات، وانتقد الأفكار بحدة لتخرج بأفضل شكل ممكن. أجب باللغة العربية.',
          'elon-musk': 'أنت إيلون ماسك. أنت تفكر بـ "المبادئ الأولى" (First Principles). أنت تدفع نحو ابتكارات جذرية ومخاطر محسوبة وتطمح لإنقاذ البشرية. أنت عملي جداً وتتحدث عن الفيزياء والهندسة والمستقبل. أجب باللغة العربية.',
          'charlie-munger': 'أنت تشارلي منغر (شريك وارن بافيت). أنت خبير في النماذج العقلية، وتؤمن بالمنطق وتجنب الحماقة والبحث عن المزايا التنافسية (Moats). تتحدث بحكمة واختصار. أجب باللغة العربية.',
          'warren-buffett': 'أنت وارن بافيت. أنت تقدم نصائح عن الاستثمار بعيد المدى، وتجنب الديون، والتركيز على القيمة الجوهرية. أنت هادئ وحكيم. أجب باللغة العربية.',
          'david-ogilvy': 'أنت ديفيد أوجيلفي. عبقري الإعلانات والتسويق. تعتمد على الأبحاث لمعرفة المستهلك. تكره الإعلانات التي تضيع وقت الناس وتؤمن بالمحتوى الذي يعطي قيمة فعلية ومعلومات مقنعة. أجب باللغة العربية.',
          'sun-tzu': 'أنت سون تزو، الجنرال العسكري القديم. تطبق استراتيجيات فن الحرب على المواقف الحديثة. تفضل الانتصار بدون خوض المعارك، ومعرفة نفسك ومعرفة عدوك واختيار التكتيك الصحيح للسيطرة. أجب باللغة العربية.',
          'marcus-aurelius': 'أنت ماركوس أوريليوس، الإمبراطور الروماني والفيلسوف الرواقي. نصيحتك تركز على التحكم في ما تقدر عليه وتقبل ما لا تقدر عليه، التركيز على الانضباط الشخصي والفضيلة والهدوء في الأزمات. أجب باللغة العربية.'
        }

        const systemPrompt = personas[mentor] || `أنت مستشار استراتيجي وخبير تنفيذي. قدم مشورتك بحكمة.`
        const messages = [{ role: 'user', content: `مشكلتي أو موقفي الحالي:\n${message}\n\nأحتاج منك نصيحة موجهة وحاسمة بناءً على طريقتك وخبرتك.` }]

        try {
          const reply = await callOpenRouterAPI(apiKey, systemPrompt, messages, model)
          res.writeHead(200, headers)
          res.end(JSON.stringify({ success: true, reply }))
        } catch (e: any) {
          res.writeHead(500, headers)
          res.end(JSON.stringify({ success: false, error: e.message }))
        }
      }
      // ─── POST /api/crawl ── Web Knowledge Crawler ──────────────────────────
      else if (req.method === 'POST' && url.pathname === '/api/crawl') {
        const body = await parseBody(req)
        const { topic, model } = body
        if (!topic) {
          res.writeHead(400, headers)
          res.end(JSON.stringify({ success: false, error: 'موضوع البحث (topic) مطلوب' }))
          return
        }

        const apiKey = loadApiKey('openrouter')
        if (!apiKey) {
          res.writeHead(400, headers)
          res.end(JSON.stringify({ success: false, error: 'مفتاح API غير متوفر' }))
          return
        }

        // Initialize research using Chief Researcher profile
        const agentName = 'chief-researcher'
        const basePrompt = getAgentSystemPrompt(cwd, agentName)
        const targetModel = model || 'anthropic/claude-3.5-sonnet:beta'
        
        const systemMessages = [
          { role: 'user', content: `# مهمة استكشاف للمعرفة\nالموضوع: ${topic}\n\nيرجى استكشاف هذا الموضوع، التفكير بتعمق باستخدام وسم <analysis>، ثم استخراج وتلخيص الفوائد والإجابات العميقة منه بصيغة تصلح للحفظ المباشر.` }
        ]

        try {
          const reply = await callOpenRouterAPI(apiKey, basePrompt, systemMessages, targetModel)
          
          // Save to MemPalace (Agency Memory)
          saveToMemPalace('global-research', agentName, reply, [topic, 'research'])
          
          res.writeHead(200, headers)
          res.end(JSON.stringify({ success: true, agent: agentName, reply }))
        } catch (err: any) {
          res.writeHead(500, headers)
          res.end(JSON.stringify({ success: false, error: err.message }))
        }
      }
      // ─── POST /api/keys ── Save API Key ──────────────────────────────────
      else if (req.method === 'POST' && url.pathname === '/api/keys') {
        const body = await parseBody(req)
        const { provider, key } = body
        if (!provider || !key) {
          res.writeHead(400, headers)
          res.end(JSON.stringify({ success: false, error: 'provider و key مطلوبان' }))
          return
        }
        const saved = saveApiKey(provider, key)
        res.writeHead(200, headers)
        res.end(JSON.stringify({ success: saved, message: saved ? 'تم الحفظ بنجاح' : 'فشل الحفظ' }))
      }
      // ─── GET /api/keys ── List key IDs ───────────────────────────────────
      else if (req.method === 'GET' && url.pathname === '/api/keys') {
        const ids = listApiKeyIds()
        res.writeHead(200, headers)
        res.end(JSON.stringify({ success: true, data: ids }))
      }
      // ─── GET /api/mempalace/stats ── MemPalace Info ──────────────────────
      else if (req.method === 'GET' && url.pathname === '/api/mempalace/stats') {
        try {
          const { memoryPalace } = await import('./mempalace.js')
          const stats = memoryPalace.getStats()
          res.writeHead(200, headers)
          res.end(JSON.stringify({ success: true, data: stats }))
        } catch (e: any) {
           res.writeHead(500, headers)
           res.end(JSON.stringify({ success: false, error: e.message }))
        }
      }
      // ─── GET /api/reputation ── All Agent Reputations ──────────────────
      else if (req.method === 'GET' && url.pathname === '/api/reputation') {
        const agent = url.searchParams.get('agent')
        if (agent) {
          const data = getAgentReputation(agent)
          res.writeHead(200, headers)
          res.end(JSON.stringify({ success: true, data }))
        } else {
          const data = getAllReputations()
          res.writeHead(200, headers)
          res.end(JSON.stringify({ success: true, data }))
        }
      }
      // ─── GET /api/wakeup ── Wake-up Context for Agent ────────────────────
      else if (req.method === 'GET' && url.pathname === '/api/wakeup') {
        const agent = url.searchParams.get('agent') || ''
        if (!agent) {
          res.writeHead(400, headers)
          res.end(JSON.stringify({ success: false, error: 'agent parameter مطلوب' }))
          return
        }
        const data = getWakeUpContext(agent)
        res.writeHead(200, headers)
        res.end(JSON.stringify({ success: true, data }))
      }
      // ─── POST /api/memos ── Send a Memo ──────────────────────────────────
      else if (req.method === 'POST' && url.pathname === '/api/memos') {
        const body = await parseBody(req)
        const { from, to, type, content, project, severity } = body
        if (!from || !to || !content) {
          res.writeHead(400, headers)
          res.end(JSON.stringify({ success: false, error: 'from, to, content مطلوبة' }))
          return
        }
        const memo = sendMemo({
          from, to,
          type: type || 'lesson',
          content,
          project: project || 'general',
          severity: severity || 'medium'
        })
        res.writeHead(200, headers)
        res.end(JSON.stringify({ success: true, data: memo }))
      }
      // ─── GET /api/memos ── Get Memos for Agent ────────────────────────────
      else if (req.method === 'GET' && url.pathname === '/api/memos') {
        const agent = url.searchParams.get('agent')
        if (agent) {
          const data = getMemosForAgent(agent)
          res.writeHead(200, headers)
          res.end(JSON.stringify({ success: true, data }))
        } else {
          const data = getMemoStats()
          res.writeHead(200, headers)
          res.end(JSON.stringify({ success: true, data }))
        }
      }
      // ─── POST /api/memos/acknowledge ── Mark Memo as Read ─────────────────
      else if (req.method === 'POST' && url.pathname === '/api/memos/acknowledge') {
        const body = await parseBody(req)
        const success = acknowledgeMemo(body.memoId)
        res.writeHead(200, headers)
        res.end(JSON.stringify({ success }))
      }
      // ─── POST /api/reputation/record ── Record Performance Entry ──────────
      else if (req.method === 'POST' && url.pathname === '/api/reputation/record') {
        const body = await parseBody(req)
        const { agent, project, task, outcome, reviewer, feedback } = body
        if (!agent || !outcome) {
          res.writeHead(400, headers)
          res.end(JSON.stringify({ success: false, error: 'agent و outcome مطلوبة' }))
          return
        }
        const entry = recordReputation({
          agent, project: project || 'general',
          task: task || '', outcome,
          reviewer: reviewer || 'system',
          feedback: feedback || ''
        })
        res.writeHead(200, headers)
        res.end(JSON.stringify({ success: true, data: entry }))
      }
      // ─── GET /api/templates ── List project templates ─────────────────────
      else if (req.method === 'GET' && url.pathname === '/api/templates') {
        const data = loadTemplates()
        res.writeHead(200, headers)
        res.end(JSON.stringify({ success: true, data }))
      }
      // ─── GET /api/reports/daily ── Generate Daily Standup Report ──────────
      else if (req.method === 'GET' && url.pathname === '/api/reports/daily') {
        const data = generateDailyReport()
        res.writeHead(200, headers)
        res.end(JSON.stringify({ success: true, data }))
      }
      // ─── GET /api/reports/history ── Get Report History ───────────────────
      else if (req.method === 'GET' && url.pathname === '/api/reports/history') {
        const data = getReportHistory()
        res.writeHead(200, headers)
        res.end(JSON.stringify({ success: true, data }))
      }
      // ─── GET /api/daily-log ── Read Daily Log ──────────────────────────
      else if (req.method === 'GET' && url.pathname === '/api/daily-log') {
        const date = url.searchParams.get('date') || undefined
        const format = url.searchParams.get('format') || 'json'
        
        if (format === 'markdown') {
          const md = generateDailyLogSummary(date)
          res.writeHead(200, headers)
          res.end(JSON.stringify({ success: true, data: md }))
        } else {
          const entries = readDailyLog(date)
          res.writeHead(200, headers)
          res.end(JSON.stringify({ success: true, data: entries }))
        }
      }
      // ─── GET /api/daily-log/list ── List Available Logs ─────────────────
      else if (req.method === 'GET' && url.pathname === '/api/daily-log/list') {
        const dates = listDailyLogs()
        res.writeHead(200, headers)
        res.end(JSON.stringify({ success: true, data: dates }))
      }
      // ─── POST /api/daily-log ── Write to Daily Log ─────────────────────
      else if (req.method === 'POST' && url.pathname === '/api/daily-log') {
        const body = await parseBody(req)
        const { type, summary, agent, pipeline, details } = body
        if (!type || !summary) {
          res.writeHead(400, headers)
          res.end(JSON.stringify({ success: false, error: 'type و summary مطلوبة' }))
          return
        }
        const entry = writeDailyLog(type, summary, { agent, pipeline, details })
        res.writeHead(200, headers)
        res.end(JSON.stringify({ success: true, data: entry }))
      }
      // ─── POST /api/experiments ── Record an Experiment ──────────────────
      else if (req.method === 'POST' && url.pathname === '/api/experiments') {
        const body = await parseBody(req)
        const { title, hypothesis, category, agent, project, status } = body
        if (!title || !hypothesis) {
          res.writeHead(400, headers)
          res.end(JSON.stringify({ success: false, error: 'title و hypothesis مطلوبة' }))
          return
        }
        const exp = recordExperiment({
          title,
          hypothesis,
          status: status || 'active',
          category: category || 'general',
          agent: agent || 'system',
          project
        })
        res.writeHead(200, headers)
        res.end(JSON.stringify({ success: true, data: exp }))
      }
      // ─── GET /api/experiments ── Get Experiments ────────────────────────
      else if (req.method === 'GET' && url.pathname === '/api/experiments') {
        const category = url.searchParams.get('category') || undefined
        const summary = url.searchParams.get('summary')
        
        if (summary === 'true') {
          const data = getExperimentSummary()
          res.writeHead(200, headers)
          res.end(JSON.stringify({ success: true, data }))
        } else {
          const data = getExperimentResults(category)
          res.writeHead(200, headers)
          res.end(JSON.stringify({ success: true, data }))
        }
      }
      // ─── PUT /api/experiments ── Update an Experiment ───────────────────
      else if (req.method === 'PUT' && url.pathname === '/api/experiments') {
        const body = await parseBody(req)
        const { id, status, results, metrics } = body
        if (!id) {
          res.writeHead(400, headers)
          res.end(JSON.stringify({ success: false, error: 'id مطلوب' }))
          return
        }
        const updated = updateExperiment(id, { status, results, metrics })
        res.writeHead(200, headers)
        res.end(JSON.stringify({ success: !!updated, data: updated }))
      }
      // ─── GET /api/resources ── External Tools & Links ───────────────────
      else if (req.method === 'GET' && url.pathname === '/api/resources') {
        const resourcesPath = path.join(cwd, '.claude', 'agency', 'resources', 'external-tools.md')
        let content = 'لا توجد موارد خارجية مسجلة.'
        if (fs.existsSync(resourcesPath)) {
          content = fs.readFileSync(resourcesPath, 'utf-8')
        }
        res.writeHead(200, headers)
        res.end(JSON.stringify({ success: true, data: content }))
      }
      // ─── GET /api/dashboard/stats ── Agency Dashboard Overview ──────────
      else if (req.method === 'GET' && url.pathname === '/api/dashboard/stats') {
        try {
          const agents = getAgentsMeta(cwd)
          const knowledge = getKnowledge(cwd)
          const projects = getProjects(cwd)
          const reputations = getAllReputations()
          const memoStats = getMemoStats()
          
          const totalAgents = Object.keys(agents).length
          const totalKnowledge = Object.values(knowledge).reduce((sum: number, files: any) => sum + files.length, 0)
          const totalProjects = projects.length
          const totalReputations = Object.keys(reputations).length
          
          // Check Ollama status
          let ollamaStatus = 'offline'
          let ollamaModels: string[] = []
          try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 2000)
            const ollamaRes = await fetch('http://localhost:11434/api/tags', { signal: controller.signal })
            clearTimeout(timeoutId)
            if (ollamaRes.ok) {
              ollamaStatus = 'online'
              const ollamaData: any = await ollamaRes.json()
              ollamaModels = ollamaData.models?.map((m: any) => m.name) || []
            }
          } catch { /* offline */ }
          
          res.writeHead(200, headers)
          res.end(JSON.stringify({
            success: true,
            data: {
              totalAgents,
              totalKnowledge,
              totalProjects,
              totalReputations,
              memoStats,
              ollamaStatus,
              ollamaModels,
              agentNames: Object.keys(agents),
              knowledgeByAgent: Object.fromEntries(
                Object.entries(knowledge).map(([k, v]: [string, any]) => [k, v.length])
              )
            }
          }))
        } catch (e: any) {
          res.writeHead(500, headers)
          res.end(JSON.stringify({ success: false, error: e.message }))
        }
      }
      // ─── GET /api/identity ── Load Personal Identity ────────────────────
      else if (req.method === 'GET' && url.pathname === '/api/identity') {
        const identityPath = path.join(cwd, '.claude', 'identity.json')
        try {
          if (fs.existsSync(identityPath)) {
            const data = JSON.parse(fs.readFileSync(identityPath, 'utf-8'))
            res.writeHead(200, headers)
            res.end(JSON.stringify({ success: true, data }))
          } else {
            res.writeHead(200, headers)
            res.end(JSON.stringify({ success: true, data: { values: '', vision: '', mission: '', principles: '' } }))
          }
        } catch (e: any) {
          res.writeHead(500, headers)
          res.end(JSON.stringify({ success: false, error: e.message }))
        }
      }
      // ─── POST /api/identity ── Save Personal Identity ──────────────────
      else if (req.method === 'POST' && url.pathname === '/api/identity') {
        const body = await parseBody(req)
        const identityPath = path.join(cwd, '.claude', 'identity.json')
        try {
          const identityDir = path.dirname(identityPath)
          if (!fs.existsSync(identityDir)) fs.mkdirSync(identityDir, { recursive: true })
          fs.writeFileSync(identityPath, JSON.stringify(body, null, 2), 'utf-8')
          writeDailyLog('identity-update', 'تم تحديث الدستور الشخصي (الهوية)', { details: body })
          res.writeHead(200, headers)
          res.end(JSON.stringify({ success: true, message: 'تم حفظ الهوية بنجاح' }))
        } catch (e: any) {
          res.writeHead(500, headers)
          res.end(JSON.stringify({ success: false, error: e.message }))
        }
      }
      // ─── POST /api/quality-check ── Quality Gates ─────────────────────────
      else if (req.method === 'POST' && url.pathname === '/api/quality-check') {
        const body = await parseBody(req)
        const { content, type, agentName, projectName } = body

        if (!content) {
          res.writeHead(400, headers)
          res.end(JSON.stringify({ success: false, error: 'content مطلوب' }))
          return
        }

        try {
          const report = await qualityGates.check({
            content,
            type:        (type || 'general') as OutputType,
            agentName:   agentName || 'unknown',
            projectName: projectName || 'default',
            attempt:     1,
          })
          res.writeHead(200, headers)
          res.end(JSON.stringify({ success: true, data: report }))
        } catch (err: any) {
          res.writeHead(500, headers)
          res.end(JSON.stringify({ success: false, error: err.message }))
        }
      }
      // ─── POST /api/quality-check/quick ── Quick Rules Check (No AI) ──────
      else if (req.method === 'POST' && url.pathname === '/api/quality-check/quick') {
        const body = await parseBody(req)
        const { content, type } = body

        if (!content) {
          res.writeHead(400, headers)
          res.end(JSON.stringify({ success: false, error: 'content مطلوب' }))
          return
        }

        const result = qualityGates.quickCheck(content, (type || 'general') as OutputType)
        res.writeHead(200, headers)
        res.end(JSON.stringify({ success: true, data: result }))
      }
      // ─── POST /api/execute ── Agent Zero Execution ─────────────────────────
      else if (req.method === 'POST' && url.pathname === '/api/execute') {
        const body = await parseBody(req)
        const { content, projectName } = body

        if (!content) {
          res.writeHead(400, headers)
          res.end(JSON.stringify({ success: false, error: 'content مطلوب' }))
          return
        }

        try {
          const name    = projectName || `project_${Date.now()}`
          const analysis = analyzeRequest(content)
          const plan     = buildExecutionPlan(name, content, analysis)

          res.writeHead(200, headers)
          res.end(JSON.stringify({
            success: true,
            data: {
              projectName: name,
              analysis,
              plan,
              message: 'تم بناء خطة التنفيذ بنجاح',
            }
          }))
        } catch (err: any) {
          res.writeHead(500, headers)
          res.end(JSON.stringify({ success: false, error: err.message }))
        }
      }
      // ─── POST /api/execute/launch ── Full Launch with Team ─────────────────
      else if (req.method === 'POST' && url.pathname === '/api/execute/launch') {
        const body = await parseBody(req)
        const { content, projectName } = body

        if (!content) {
          res.writeHead(400, headers)
          res.end(JSON.stringify({ success: false, error: 'content مطلوب' }))
          return
        }

        try {
          const name   = projectName || `project_${Date.now()}`
          const result = launchProject(name, content)

          res.writeHead(200, headers)
          res.end(JSON.stringify({
            success: true,
            data: {
              projectName: name,
              plan:        result.plan,
              team:        result.team,
              message:     `🚀 تم إطلاق المشروع "${name}" بنجاح`,
            },
          }))
        } catch (err: any) {
          res.writeHead(500, headers)
          res.end(JSON.stringify({ success: false, error: err.message }))
        }
      }
      // ─── GET /api/teams ── List Active Teams ───────────────────────────────
      else if (req.method === 'GET' && url.pathname === '/api/teams') {
        try {
          const teams = listActiveTeams().map(team => ({
            ...team,
            progress: getTeamProgress(team.teamName),
          }))
          res.writeHead(200, headers)
          res.end(JSON.stringify({ success: true, data: teams }))
        } catch (err: any) {
          res.writeHead(200, headers)
          res.end(JSON.stringify({ success: true, data: [] }))
        }
      }
      // ─── GET /api/teams/:name/results ── Team Results ──────────────────────
      else if (req.method === 'GET' && url.pathname.startsWith('/api/teams/') && url.pathname.endsWith('/results')) {
        const teamName = url.pathname.replace('/api/teams/', '').replace('/results', '')
        const results = synthesizeTeamResults(teamName)
        res.writeHead(200, headers)
        res.end(JSON.stringify({ success: true, data: results }))
      }
      // ─── GET /api/memory ── Memory Stats & Query ──────────────────────────
      else if (req.method === 'GET' && url.pathname === '/api/memory') {
        const project = url.searchParams.get('project') || 'default-project'
        const level   = url.searchParams.get('level') as any || undefined
        const limit   = parseInt(url.searchParams.get('limit') || '50')

        const stats   = getMemoryStats(project)
        const entries = queryMemory({
          projectName: project,
          level,
          limit,
        })
        res.writeHead(200, headers)
        res.end(JSON.stringify({ success: true, data: { stats, entries } }))
      }
      // ─── GET /api/rate-limits ── Rate Limiter Stats ────────────────────────
      else if (req.method === 'GET' && url.pathname === '/api/rate-limits') {
        const stats = getRateLimiterStats()
        res.writeHead(200, headers)
        res.end(JSON.stringify({ success: true, data: stats }))
      }
      // ─── GET /api/system-status ── Comprehensive System Status ─────────────
      else if (req.method === 'GET' && url.pathname === '/api/system-status') {
        try {
          const teams      = listActiveTeams()
          const mem        = getMemoryStats('default-project')
          const limits     = getRateLimiterStats()
          const { memoryPalace } = await import('./mempalace.js')
          const dbStats    = memoryPalace.getStats()

          res.writeHead(200, headers)
          res.end(JSON.stringify({
            success: true,
            data: {
              teams:        teams.length,
              activeTeams:  teams.map(t => ({
                name:     t.teamName,
                project:  t.projectName,
                progress: getTeamProgress(t.teamName),
              })),
              memory:       mem,
              rateLimits:   limits,
              db:           dbStats,
              uptime:       process.uptime(),
              pid:          process.pid,
              nodeVersion:  process.version,
            },
          }))
        } catch (err: any) {
          res.writeHead(200, headers)
          res.end(JSON.stringify({
            success: true,
            data: {
              teams:      0, activeTeams: [],
              memory:     { hot: 0, warm: 0, cold: 0, total: 0 },
              rateLimits: {},
              db:         { wings: 0, rooms: 0, drawers: 0, dbSizeKB: 0 },
              uptime:     process.uptime(),
            },
          }))
        }
      }
      else {
        res.writeHead(404, headers)
        res.end(JSON.stringify({ success: false, error: 'Not found' }))
      }
    } catch (err: any) {
      res.writeHead(500, headers)
      res.end(JSON.stringify({ success: false, error: err.message }))
    }
  })

  return new Promise<number>((resolve, reject) => {
    server.on('error', (e: any) => {
      if (e.code === 'EADDRINUSE') {
        // Try next port if busy
        resolve(startApiServer(cwd, port + 1))
      } else {
        reject(e)
      }
    })

    server.listen(port, () => {
      resolve(port)
    })
  })
}

export function openBrowser(url: string) {
  let cmd = ''
  switch (process.platform) {
    case 'win32': cmd = `start "" "${url}"`; break;
    case 'darwin': cmd = `open "${url}"`; break;
    default: cmd = `xdg-open "${url}"`; break;
  }
  exec(cmd)
}
