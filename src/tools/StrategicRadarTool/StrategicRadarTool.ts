import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import fs from 'fs'
import path from 'path'
import { getCwd } from '../../utils/cwd.js'

export const STRATEGIC_RADAR_TOOL_NAME = 'StrategicRadar'

function getRadarPath() { return path.join(getCwd(), '.claude', 'strategic-radar.json') }
function ensureDir() { const d = path.dirname(getRadarPath()); if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }) }

interface RadarItem {
  id: string
  category: 'project' | 'relationship' | 'market' | 'goal' | 'risk'
  name: string
  status: 'green' | 'yellow' | 'red'
  lastUpdate: string
  notes: string
  nextAction?: string
  dueDate?: string
  warningThreshold?: number  // days without update before turning yellow
}

function loadRadar(): RadarItem[] {
  try { if (fs.existsSync(getRadarPath())) return JSON.parse(fs.readFileSync(getRadarPath(), 'utf-8')) } catch {}
  return []
}
function saveRadar(items: RadarItem[]) { ensureDir(); fs.writeFileSync(getRadarPath(), JSON.stringify(items, null, 2), 'utf-8') }

function autoUpdateStatuses(items: RadarItem[]): RadarItem[] {
  const now = new Date()
  return items.map(item => {
    const daysSinceUpdate = Math.floor((now.getTime() - new Date(item.lastUpdate).getTime()) / (1000 * 60 * 60 * 24))
    const threshold = item.warningThreshold ?? 7
    if (item.status === 'green' && daysSinceUpdate > threshold) {
      return { ...item, status: 'yellow' as const }
    }
    if (item.dueDate && new Date(item.dueDate) < now && item.status !== 'red') {
      return { ...item, status: 'red' as const }
    }
    return item
  })
}

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum(['add_item', 'update_item', 'get_dashboard', 'get_warnings', 'remove_item']),
    id: z.string().optional(),
    name: z.string().optional(),
    category: z.enum(['project', 'relationship', 'market', 'goal', 'risk']).optional(),
    status: z.enum(['green', 'yellow', 'red']).optional(),
    notes: z.string().optional(),
    nextAction: z.string().optional(),
    dueDate: z.string().optional(),
    warningThreshold: z.number().optional().describe('Days without update before yellow warning'),
  })
)
type InputSchema = ReturnType<typeof inputSchema>
export type Output = { result: string }

export const StrategicRadarTool = buildTool({
  name: STRATEGIC_RADAR_TOOL_NAME,
  searchHint: 'strategic radar dashboard early warning system projects relationships',
  maxResultSizeChars: 100000,
  async description() { return 'الرادار الاستراتيجي — يراقب إمبراطوريتك الرقمية: المشاريع، العلاقات المهنية، أهداف السوق، والمخاطر. يضرب جرس الإنذار المبكر قبل أن تتحول المشكلة إلى أزمة.' },
  async prompt() { return 'استخدم add_item لإضافة مراقبة على مشروع/علاقة/هدف. get_dashboard للوحة الرئيسية. get_warnings للتحذيرات الحمراء.' },
  get inputSchema() { return inputSchema() },
  get outputSchema() { return lazySchema(() => z.any()) },
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  async call(input) {
    let items = autoUpdateStatuses(loadRadar())

    if (input.action === 'add_item') {
      if (!input.name || !input.category) throw new Error('name and category required')
      const newItem: RadarItem = {
        id: `radar-${Date.now()}`,
        category: input.category,
        name: input.name,
        status: input.status ?? 'green',
        lastUpdate: new Date().toISOString(),
        notes: input.notes ?? '',
        nextAction: input.nextAction,
        dueDate: input.dueDate,
        warningThreshold: input.warningThreshold,
      }
      items.push(newItem)
      saveRadar(items)
      return { data: { result: `✅ تم إضافة "${input.name}" إلى الرادار [ID: ${newItem.id}]` } }
    }

    if (input.action === 'update_item') {
      if (!input.id) throw new Error('id required')
      const item = items.find(i => i.id === input.id || i.name.toLowerCase().includes(input.id!.toLowerCase()))
      if (!item) throw new Error(`Item "${input.id}" not found`)
      if (input.status) item.status = input.status
      if (input.notes) item.notes = input.notes
      if (input.nextAction) item.nextAction = input.nextAction
      if (input.dueDate) item.dueDate = input.dueDate
      item.lastUpdate = new Date().toISOString()
      saveRadar(items)
      return { data: { result: `✅ تم تحديث "${item.name}" → Status: ${item.status}` } }
    }

    if (input.action === 'remove_item') {
      if (!input.id) throw new Error('id required')
      const before = items.length
      items = items.filter(i => i.id !== input.id && !i.name.toLowerCase().includes(input.id!.toLowerCase()))
      saveRadar(items)
      return { data: { result: before > items.length ? `✅ تم حذف العنصر` : `⚠️ لم يتم العثور على العنصر` } }
    }

    if (input.action === 'get_warnings') {
      const reds = items.filter(i => i.status === 'red')
      const yellows = items.filter(i => i.status === 'yellow')
      let res = `## 🚨 تحذيرات الرادار الاستراتيجي\n\n`
      if (reds.length === 0 && yellows.length === 0) return { data: { result: `## ✅ لا توجد تحذيرات\n\nجميع عناصر الرادار في حالة سليمة.` } }
      if (reds.length > 0) {
        res += `### 🔴 تحتاج تدخل فوري (${reds.length}):\n`
        reds.forEach(i => { res += `- **${i.name}** [${i.category}]: ${i.notes}\n  → الخطوة التالية: ${i.nextAction ?? 'غير محددة'}\n` })
      }
      if (yellows.length > 0) {
        res += `\n### 🟡 تحتاج انتباه (${yellows.length}):\n`
        yellows.forEach(i => { res += `- **${i.name}** [${i.category}]: آخر تحديث ${i.lastUpdate.split('T')[0]}\n` })
      }
      return { data: { result: res } }
    }

    if (input.action === 'get_dashboard') {
      if (items.length === 0) return { data: { result: `## 📡 الرادار الاستراتيجي\n\nفارغ. أضف مشاريعك وعلاقاتك وأهدافك عبر \`add_item\`.` } }
      const categories = ['project', 'relationship', 'market', 'goal', 'risk'] as const
      const statusIcons = { green: '🟢', yellow: '🟡', red: '🔴' }
      let res = `## 📡 الرادار الاستراتيجي — ${new Date().toLocaleDateString('ar-SA')}\n\n`
      const greens = items.filter(i => i.status === 'green').length
      const yellows = items.filter(i => i.status === 'yellow').length
      const reds = items.filter(i => i.status === 'red').length
      res += `**ملخص:** 🟢 ${greens} سليم | 🟡 ${yellows} بانتظار | 🔴 ${reds} عاجل\n\n`
      categories.forEach(cat => {
        const catItems = items.filter(i => i.category === cat)
        if (catItems.length === 0) return
        const labels: Record<string, string> = { project: '🚀 المشاريع', relationship: '🤝 العلاقات', market: '📊 السوق', goal: '🎯 الأهداف', risk: '⚠️ المخاطر' }
        res += `### ${labels[cat]}\n`
        catItems.forEach(i => { res += `${statusIcons[i.status]} **${i.name}** — ${i.notes || 'لا ملاحظات'}\n${i.nextAction ? `   → ${i.nextAction}\n` : ''}` })
        res += '\n'
      })
      if (reds > 0 || yellows > 0) res += `\n⚠️ **${reds + yellows} عنصر يحتاج انتباهك الآن.** استخدم \`get_warnings\` للتفاصيل.\n`
      return { data: { result: res } }
    }

    return { data: { result: 'Unknown action' } }
  },
  mapToolResultToToolResultBlockParam(data, toolUseID) { return { tool_use_id: toolUseID, type: 'tool_result', content: data.result } },
  userFacingName() { return 'Strategic Radar' },
  getToolUseSummary(i) { return i ? `${i.action}` : 'Strategic Radar' },
  renderToolUseMessage() { return 'Scanning strategic radar...' },
  renderToolUseTag() { return null },
  renderToolResultMessage() { return null },
  extractSearchText() { return '' },
  renderToolUseErrorMessage(e) { return String(e) },
  async validateInput() { return { result: true } },
} satisfies ToolDef<InputSchema, Output>)
