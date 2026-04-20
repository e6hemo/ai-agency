import * as fs from 'fs'
import * as path from 'path'
import { getOriginalCwd } from '../../bootstrap/state.js'
import { getProjectState } from '../../agency/shared-memory.js'
import type { LocalCommandCall } from '../../types/command.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface AgentMeta {
  name: string
  description?: string
  color?: string
  model?: string
  maxTurns?: number
}

interface Department {
  emoji: string
  label: string
  lead: string
  members: string[]
}

interface Pipeline {
  description: string
  steps: string[]
}

interface AgencyConfig {
  agency: {
    name: string
    version?: string
    language?: string
    defaultModel?: string
    departments: Record<string, Department>
    pipelines: Record<string, Pipeline>
  }
}

function loadAgencyConfig(cwd: string): AgencyConfig | null {
  const configPath = path.join(cwd, '.claude', 'agency-config.json')
  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(raw) as AgencyConfig
  } catch {
    return null
  }
}

function loadAgentMeta(filePath: string): AgentMeta | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    // Extract YAML front-matter
    const match = raw.match(/^---\n([\s\S]*?)\n---/)
    if (!match) return null
    const yaml = match[1]!
    const meta: Record<string, string> = {}
    for (const line of yaml.split('\n')) {
      const m = line.match(/^(\w[\w-]*):\s*(.*)$/)
      if (m) meta[m[1]!] = m[2]!.replace(/^["']|["']$/g, '')
    }
    return {
      name: meta['name'] ?? path.basename(filePath, '.md'),
      description: meta['description'],
      color: meta['color'],
      model: meta['model'],
      maxTurns: meta['maxTurns'] ? parseInt(meta['maxTurns'], 10) : undefined,
    }
  } catch {
    return null
  }
}

function discoverAgents(cwd: string): Map<string, AgentMeta[]> {
  const agentsDir = path.join(cwd, '.claude', 'agents')
  const departments = new Map<string, AgentMeta[]>()
  try {
    const dirs = fs.readdirSync(agentsDir, { withFileTypes: true })
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue
      const deptPath = path.join(agentsDir, dir.name)
      const files = fs.readdirSync(deptPath).filter(f => f.endsWith('.md'))
      const agents: AgentMeta[] = []
      for (const file of files) {
        const meta = loadAgentMeta(path.join(deptPath, file))
        if (meta) agents.push(meta)
      }
      if (agents.length > 0) departments.set(dir.name, agents)
    }
  } catch {
    // agents dir doesn't exist
  }
  return departments
}

function listTemplates(cwd: string): string[] {
  const templatesDir = path.join(cwd, '.claude', 'agency', 'templates')
  try {
    return fs
      .readdirSync(templatesDir)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''))
  } catch {
    return []
  }
}

// ─── Color badges ─────────────────────────────────────────────────────────────

const COLOR_EMOJI: Record<string, string> = {
  orange: '🟠',
  yellow: '🟡',
  pink: '🩷',
  blue: '🔵',
  cyan: '🩵',
  green: '🟢',
  purple: '🟣',
  magenta: '🟣',
  white: '⚪',
  red: '🔴',
}

function badge(color?: string): string {
  return COLOR_EMOJI[color ?? ''] ?? '⬜'
}

// ─── Subcommand renderers ─────────────────────────────────────────────────────

function renderDashboard(config: AgencyConfig, agentsByDept: Map<string, AgentMeta[]>): string {
  const { agency } = config
  let totalAgents = 0
  for (const agents of agentsByDept.values()) totalAgents += agents.length
  const totalDepts = Object.keys(agency.departments).length
  const totalPipelines = Object.keys(agency.pipelines).length

  const lines: string[] = []
  lines.push(`╔══════════════════════════════════════════════════╗`)
  lines.push(`║  🏢  ${agency.name}`)
  lines.push(`║  v${agency.version ?? '1.0.0'} — لغة: ${agency.language === 'ar' ? 'العربية' : agency.language ?? 'en'}`)
  lines.push(`╠══════════════════════════════════════════════════╣`)
  lines.push(`║`)
  lines.push(`║  📊 نظرة عامة`)
  lines.push(`║  ┌──────────┐ ┌──────────┐ ┌──────────────┐`)
  lines.push(`║  │  👥 ${String(totalAgents).padStart(2)}    │ │  🏛️ ${String(totalDepts).padStart(2)}    │ │  🔗 ${String(totalPipelines).padStart(2)} خط أنابيب │`)
  lines.push(`║  │  وكلاء   │ │  أقسام   │ │              │`)
  lines.push(`║  └──────────┘ └──────────┘ └──────────────┘`)
  lines.push(`║`)

  // Departments summary
  lines.push(`║  🏗️  الأقسام`)
  for (const [key, dept] of Object.entries(agency.departments)) {
    const agents = agentsByDept.get(key) ?? []
    lines.push(`║  ${dept.emoji} ${dept.label.padEnd(16)} — ${agents.length} وكيل (قائد: ${dept.lead})`)
  }

  lines.push(`║`)
  lines.push(`║  💡 الأوامر المتاحة:`)
  lines.push(`║     /agency team       — عرض الفريق الكامل`)
  lines.push(`║     /agency pipeline   — عرض خطوط الأنابيب`)
  lines.push(`║     /agency templates  — عرض القوالب الجاهزة`)
  lines.push(`║     /agency projects   — عرض المشاريع المحفوظة`)
  lines.push(`║     /agency status <project> — حالة مشروع محدد`)
  lines.push(`║     /agency report     — تقرير الأداء`)
  lines.push(`║     /agency keys       — إدارة مفاتيح API بأمان`)
  lines.push(`║     /agency serve      — تشغيل لوحة التحكم الويب`)
  lines.push(`║`)
  lines.push(`║  🚀 للبدء السريع:`)
  lines.push(`║     /agency init campaign-1 "وصف مشروعك"`)
  lines.push(`║     @project-manager "أدر لي مشروع إطلاق حملة تسويقية"`)
  lines.push(`╚══════════════════════════════════════════════════╝`)

  return lines.join('\n')
}

function renderTeam(config: AgencyConfig, agentsByDept: Map<string, AgentMeta[]>): string {
  const { agency } = config
  const lines: string[] = []

  lines.push(`👥 فريق ${agency.name}`)
  lines.push(`${'═'.repeat(50)}`)

  for (const [key, dept] of Object.entries(agency.departments)) {
    const agents = agentsByDept.get(key) ?? []
    lines.push('')
    lines.push(`${dept.emoji} ${dept.label} (${agents.length} وكيل)`)
    lines.push(`${'─'.repeat(45)}`)

    for (const agent of agents) {
      const isLead = agent.name === dept.lead
      const star = isLead ? ' ⭐ قائد' : ''
      const desc = agent.description
        ? agent.description.length > 60
          ? agent.description.slice(0, 57) + '...'
          : agent.description
        : ''
      lines.push(`  ${badge(agent.color)} ${agent.name}${star}`)
      if (desc) lines.push(`     ${desc}`)
      lines.push(`     📎 model: ${agent.model ?? 'inherit'} | maxTurns: ${agent.maxTurns ?? '?'}`)
    }
  }

  lines.push('')
  lines.push(`💡 استدعِ أي وكيل: @agent-name "المهمة"`)

  return lines.join('\n')
}

function renderPipelines(config: AgencyConfig): string {
  const { agency } = config
  const lines: string[] = []

  lines.push(`🔗 خطوط الأنابيب — ${agency.name}`)
  lines.push(`${'═'.repeat(50)}`)

  for (const [name, pipeline] of Object.entries(agency.pipelines)) {
    lines.push('')
    lines.push(`  📋 ${name}`)
    lines.push(`     ${pipeline.description}`)
    lines.push(`     الخطوات:`)
    pipeline.steps.forEach((step, i) => {
      const isLast = i === pipeline.steps.length - 1
      const prefix = isLast ? '└─' : '├─'
      lines.push(`       ${prefix} ${i + 1}. @${step}`)
    })
  }

  lines.push('')
  lines.push(`💡 لتشغيل pipeline:`)
  lines.push(`   @project-manager "نفذ pipeline: launch-campaign لمنتج X"`)

  return lines.join('\n')
}

function renderTemplates(templates: string[], cwd: string): string {
  if (templates.length === 0) {
    return `📂 لا توجد قوالب محفوظة بعد.\n\n💡 القوالب ستكون في: .claude/agency/templates/\nكل قالب هو ملف .md يحتوي تعليمات المهمة.`
  }

  const lines: string[] = []
  lines.push(`📋 القوالب الجاهزة (${templates.length})`)
  lines.push(`${'═'.repeat(40)}`)

  for (const tmpl of templates) {
    // Try to read description from frontmatter
    let desc = ''
    try {
      const raw = fs.readFileSync(
        path.join(cwd, '.claude', 'agency', 'templates', `${tmpl}.md`),
        'utf-8',
      )
      const m = raw.match(/^---\n[\s\S]*?description:\s*["']?(.+?)["']?\n[\s\S]*?---/)
      if (m) desc = m[1]!
    } catch {
      // ignore
    }
    lines.push(`  📄 ${tmpl}${desc ? ` — ${desc}` : ''}`)
  }

  lines.push('')
  lines.push(`💡 لاستخدام قالب:`)
  lines.push(`   @project-manager "نفذ قالب launch-campaign لمنتج X"`)

  return lines.join('\n')
}


function renderProjects(cwd: string): string {
  const projectsDir = path.join(cwd, '.claude', 'agency', 'projects')

  let projectDirs: string[] = []
  try {
    projectDirs = fs
      .readdirSync(projectsDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
  } catch {
    return (
      `📂 لا توجد مشاريع محفوظة بعد.\n\n` +
      `💡 لبدء مشروع جديد:\n` +
      `   /agency init my-project "وصف المشروع"`
    )
  }

  if (projectDirs.length === 0) {
    return (
      `📂 لا توجد مشاريع محفوظة بعد.\n\n` +
      `💡 لبدء مشروع جديد:\n` +
      `   /agency init my-project "وصف المشروع"`
    )
  }

  const statusEmoji: Record<string, string> = {
    pending: '⏳',
    'in-progress': '🔄',
    completed: '✅',
    failed: '❌',
  }

  const lines: string[] = []
  lines.push(`📁 المشاريع المحفوظة (${projectDirs.length})`)
  lines.push(`${'═'.repeat(50)}`)
  lines.push('')

  for (const name of projectDirs) {
    const statePath = path.join(projectsDir, name, 'state.json')
    let status = 'unknown'
    let step = '—'
    try {
      const s = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
      status = s.status ?? 'unknown'
      step = s.currentStep ?? '—'
    } catch {
      // no state file
    }
    const emoji = statusEmoji[status] ?? '❓'
    lines.push(`  ${emoji} ${name}`)
    lines.push(`     الحالة: ${status}  |  الخطوة: ${step}`)
    lines.push(`     💡 /agency status ${name}`)
    lines.push('')
  }

  return lines.join('\n')
}


function renderReport(config: AgencyConfig, agentsByDept: Map<string, AgentMeta[]>): string {
  let totalAgents = 0
  for (const agents of agentsByDept.values()) totalAgents += agents.length
  const totalPipelines = Object.keys(config.agency.pipelines).length
  const totalDepts = Object.keys(config.agency.departments).length

  const now = new Date()
  const dateStr = now.toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const lines: string[] = []
  lines.push(`📊 تقرير وكالة ${config.agency.name}`)
  lines.push(`📅 ${dateStr}`)
  lines.push(`${'═'.repeat(50)}`)
  lines.push('')
  lines.push(`🏛️  الأقسام: ${totalDepts}`)
  lines.push(`👥 إجمالي الوكلاء: ${totalAgents}`)
  lines.push(`🔗 خطوط الأنابيب: ${totalPipelines}`)
  lines.push('')
  lines.push(`📋 توزيع الوكلاء حسب القسم:`)

  for (const [key, dept] of Object.entries(config.agency.departments)) {
    const agents = agentsByDept.get(key) ?? []
    const bar = '█'.repeat(agents.length) + '░'.repeat(Math.max(0, 5 - agents.length))
    lines.push(`  ${dept.emoji} ${dept.label.padEnd(16)} ${bar} ${agents.length}`)
  }

  lines.push('')
  lines.push(`🔧 النموذج الافتراضي: ${config.agency.defaultModel ?? 'inherit'}`)
  lines.push(`🌐 اللغة: ${config.agency.language === 'ar' ? 'العربية' : config.agency.language ?? 'en'}`)
  lines.push('')
  lines.push(`✅ الوكالة جاهزة للعمل!`)
  lines.push(`💡 ابدأ بـ: @project-manager "مهمتك هنا"`)

  return lines.join('\n')
}

function renderStatus(projectName: string): string {
  const cwd = getOriginalCwd()
  const statePath = path.join(cwd, '.claude', 'agency', 'projects', projectName, 'state.json')
  const contextPath = path.join(cwd, '.claude', 'agency', 'projects', projectName, 'context.md')

  if (!fs.existsSync(statePath)) {
    return (
      `❌ لم يتم العثور على بيانات مشروع "${projectName}".\n\n` +
      `💡 لتهيئة مشروع جديد:\n` +
      `   /agency init ${projectName} "وصف متطلباتك هنا"`
    )
  }

  let state: ReturnType<typeof getProjectState>
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
  } catch {
    return `❌ ملف الحالة لمشروع "${projectName}" تالف. يرجى إعادة التهيئة.`
  }

  const STATUS_ICON: Record<string, string> = {
    pending: '⏳',
    'in-progress': '🔄',
    completed: '✅',
    failed: '❌',
  }

  const STEP_STATUS_ICON: Record<string, string> = {
    pending: '⬜',
    'in-progress': '🔵',
    'qa-review': '🔍',
    completed: '✅',
    failed: '❌',
  }

  const lines: string[] = []
  lines.push(`╔══════════════════════════════════════════════════╗`)
  lines.push(`║  📋 حالة المشروع — ${projectName}`)
  lines.push(`╠══════════════════════════════════════════════════╣`)
  lines.push(`║`)
  lines.push(`║  ${STATUS_ICON[state.status] ?? '❓'} الحالة الحالية : ${state.status.toUpperCase()}`)
  lines.push(`║  📌 الخطوة الحالية: ${state.currentStep}`)
  lines.push(`║  🕐 بدأ في        : ${new Date(state.startedAt).toLocaleString('ar-SA')}`)
  lines.push(`║  🔄 آخر تحديث    : ${new Date(state.updatedAt).toLocaleString('ar-SA')}`)
  lines.push(`║`)

  if (state.history.length > 0) {
    lines.push(`║  📜 سجل الخطوات (آخر ${Math.min(state.history.length, 5)}):`)
    lines.push(`║  ${'─'.repeat(44)}`)
    const recent = state.history.slice(-5)
    for (const entry of recent) {
      const icon = STEP_STATUS_ICON[entry.status] ?? '❓'
      lines.push(`║  ${icon} [${entry.agentName}] ${entry.step}`)
      if (entry.summary) {
        const summary = entry.summary.length > 42 ? entry.summary.slice(0, 39) + '...' : entry.summary
        lines.push(`║     ↳ ${summary}`)
      }
    }
    lines.push(`║`)
  } else {
    lines.push(`║  📜 لم تبدأ أي خطوات تنفيذية بعد.`)
    lines.push(`║`)
  }

  lines.push(`║  📂 الذاكرة: ${fs.existsSync(contextPath) ? '✅ context.md موجود' : '❌ context.md غير موجود'}`)
  lines.push(`║  📍 المسار : .claude/agency/projects/${projectName}/`)
  lines.push(`║`)
  lines.push(`║  💡 الأوامر المتاحة:`)
  if (state.status !== 'completed') {
    lines.push(`║     @project-manager "استكمل مشروع ${projectName}"`)
  }
  lines.push(`║     /agency status ${projectName}  — تحديث هذا التقرير`)
  lines.push(`╚══════════════════════════════════════════════════╝`)

  return lines.join('\n')
}




export const call: LocalCommandCall = async (args) => {
  const cwd = getOriginalCwd()
  const config = loadAgencyConfig(cwd)

  if (!config) {
    return {
      type: 'text',
      value:
        '❌ لم يتم العثور على ملف تكوين الوكالة.\n' +
        '   تأكد من وجود `.claude/agency-config.json`\n' +
        '   أو أنشئه باستخدام الأمر: @project-manager "أنشئ وكالة جديدة"',
    }
  }

  const agentsByDept = discoverAgents(cwd)
  const argsParts = args.trim().match(/(?:[^\s"]+|"[^"]*")+/g) || []
  const subcommand = (argsParts[0] || '').toLowerCase()

  let value: string

  switch (subcommand) {
    case 'init':
    case 'تهيئة': {
      const projectName = argsParts[1]?.replace(/^"|"$/g, '') || 'default-project'
      const request = argsParts.slice(2).join(' ').replace(/^"|"$/g, '') || 'لايوجد متطلبات'
      const { initializeProjectAndPlan } = await import('../../agency/orchestrator.js')
      const res = initializeProjectAndPlan(projectName, request)
      value =
        `✅ ${res.status}\n\n` +
        `📄 السياق: ${res.contextPath}\n` +
        `📊 الحالة: ${res.statePath}\n\n` +
        `💡 الخطوة التالية:\n   @project-manager "ابدأ تنفيذ مشروع ${projectName}"`
      break
    }
    case 'status':
    case 'حالة': {
      const projectName = argsParts[1]?.replace(/^"|"$/g, '') || ''
      if (!projectName) {
        value = '❌ يجب تحديد اسم المشروع.\n   مثال: /agency status my-project'
      } else {
        value = renderStatus(projectName)
      }
      break
    }
    case 'team':
    case 'فريق':
      value = renderTeam(config, agentsByDept)
      break
    case 'pipeline':
    case 'pipelines':
    case 'أنابيب':
      value = renderPipelines(config)
      break
    case 'templates':
    case 'template':
    case 'قوالب': {
      const templates = listTemplates(cwd)
      value = renderTemplates(templates, cwd)
      break
    }
    case 'report':
    case 'تقرير':
      value = renderReport(config, agentsByDept)
      break
    case 'projects':
    case 'مشاريع':
      value = renderProjects(cwd)
      break
    case 'keys':
    case 'مفاتيح': {
      const { listApiKeyIds, saveApiKey, deleteApiKey } = await import('../../utils/secureStorage/apiKeyVault.js')
      const action = argsParts[1]?.toLowerCase()
      const provider = argsParts[2]?.replace(/^"|"$/g, '')
      const key = argsParts[3]?.replace(/^"|"$/g, '')

      if (action === 'list' || action === 'عرض') {
        const ids = listApiKeyIds()
        value = 
          `🔑 المفاتيح المشفّرة المحفوظة بأمان (${ids.length}):\n` + 
          (ids.length > 0 ? ids.map(id => `  ✅ ${id}`).join('\n') : `  لا يوجد أي مفاتيح محفوظة.`)
      } else if ((action === 'set' || action === 'حفظ') && provider && key) {
        const saved = saveApiKey(provider, key)
        value = saved 
          ? `✅ تم حفظ مفتاح "${provider}" بنجاح في الـ (Keychain Vault) بشكل مشفّر.`
          : `❌ حدث خطأ أثناء حفظ المفتاح.`
      } else if ((action === 'delete' || action === 'حذف') && provider) {
        const deleted = deleteApiKey(provider)
        value = deleted
          ? `🗑️ تم حذف مفتاح "${provider}" بنجاح.`
          : `❌ لم يتم العثور على المفتاح أو حدث خطأ.`
      } else {
        value = 
          `🔰 إدارة مفاتيح API بأمان (OS Keychain Vault)\n\n` +
          `  /agency keys list                 — عرض أسماء المفاتيح المحفوظة\n` +
          `  /agency keys set <name> <key>     — حفظ مفتاح جديد (مشفّر بالكامل)\n` +
          `  /agency keys delete <name>        — حذف مفتاح\n\n` +
          `💡 نصيحة: لن يتم حفظ الخصائص هنا كملفات نصية صريحة (Plaintext) لحماية بيانات وكالتك.`
      }
      break
    }
    case 'train':
    case 'تدريب': {
      const agentName = argsParts[1]?.replace(/^"|"$/g, '')
      const source = argsParts[2]?.replace(/^"|"$/g, '')
      
      if (!agentName || !source) {
        value = '❌ يجب تحديد اسم الوكيل والمصدر.\n   مثال: /agency train marketing-strategist https://example.com/guide'
        break
      }
      
      const knowledgeDir = path.join(cwd, '.claude', 'agency', 'knowledge', agentName)
      fs.mkdirSync(knowledgeDir, { recursive: true })
      
      let contentToSave = ''
      let sourceName = ''
      
      if (source.startsWith('http://') || source.startsWith('https://')) {
        try {
          const res = await fetch(source)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          contentToSave = await res.text()
          sourceName = source.replace(/[^a-zA-Z0-9]/g, '_').slice(-30) + '.md'
        } catch (e) {
          value = `❌ فشل جلب الرابط: ${e instanceof Error ? e.message : String(e)}`
          break
        }
      } else {
        try {
          const filePath = path.resolve(cwd, source)
          contentToSave = fs.readFileSync(filePath, 'utf-8')
          sourceName = path.basename(filePath)
          if (!sourceName.endsWith('.md')) sourceName += '.md'
        } catch (e) {
          value = `❌ فشل قراءة الملف المحلي: ${e instanceof Error ? e.message : String(e)}`
          break
        }
      }
      
      const savePath = path.join(knowledgeDir, sourceName)
      const header = `---\nsource: ${source}\ningestedAt: ${new Date().toISOString()}\n---\n\n`
      fs.writeFileSync(savePath, header + contentToSave)
      
      value = `✅ تم تدريب الوكيل "${agentName}" بنجاح!\n` +
              `📁 حفظت المعرفة في: .claude/agency/knowledge/${agentName}/${sourceName}\n` +
              `💡 سيقوم الوكيل الآن باستخدام أداة SemanticSearch لقراءة هذا الملف متى ما احتاجه.`
      break
    }
    case 'serve':
    case 'تشغيل': {
      const { startServer } = await import('../../server.js')
      try {
        const port = await startServer(3766)
        const dashboardUrl = `http://localhost:${port}/`
        
        // Browser Auto-open logic
        const { exec } = await import('child_process')
        let openCmd = ''
        switch (process.platform) {
          case 'win32': openCmd = `start "" "${dashboardUrl}"`; break;
          case 'darwin': openCmd = `open "${dashboardUrl}"`; break;
          default: openCmd = `xdg-open "${dashboardUrl}"`; break;
        }
        exec(openCmd)
        
        value = `🌐 خادم الـ API المطور يعمل الآن!\n` +
                `🔗 المنفذ: ${port}\n\n` +
                `تم فتح لوحة التحكم (Dashboard) المحدثة في متصفحك.\n` +
                `اللوحة تتصل الآن ببيانات الوكالة في مسار: ${cwd}`
      } catch (e) {
        value = `❌ فشل تشغيل الخادم المطور: ${e instanceof Error ? e.message : String(e)}`
      }
      break
    }
    default:
      value = renderDashboard(config, agentsByDept)
      break
  }

  return { type: 'text', value }
}
