import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import fs from 'fs'
import path from 'path'
import { getCwd } from '../../utils/cwd.js'

export const STRATEGIC_VAULT_TOOL_NAME = 'StrategicVault'

function getVaultPath() { return path.join(getCwd(), '.claude', 'strategic-vault.json') }
function ensureDir() { const d = path.dirname(getVaultPath()); if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }) }

type ConfidenceLevel = 'proven' | 'hypothesis' | 'theory'
type ApplicabilityLevel = 'immediate' | 'later' | 'permanent'

interface VaultEntry {
  id: string
  title: string
  content: string
  category: string
  tags: string[]
  confidence: ConfidenceLevel
  applicability: ApplicabilityLevel
  source?: string
  connections: string[]  // IDs of connected entries (compounding intelligence)
  addedAt: string
  accessCount: number
  lastAccessed?: string
}

function loadVault(): VaultEntry[] {
  try { if (fs.existsSync(getVaultPath())) return JSON.parse(fs.readFileSync(getVaultPath(), 'utf-8')) } catch {}
  return []
}
function saveVault(entries: VaultEntry[]) { ensureDir(); fs.writeFileSync(getVaultPath(), JSON.stringify(entries, null, 2), 'utf-8') }

function findConnections(newEntry: Omit<VaultEntry, 'connections'>, allEntries: VaultEntry[]): string[] {
  // Auto-connect based on shared tags and categories
  return allEntries
    .filter(e => e.id !== (newEntry as VaultEntry).id &&
      (e.category === newEntry.category ||
        e.tags.some(tag => newEntry.tags.includes(tag))))
    .slice(0, 5)
    .map(e => e.id)
}

function scoreRelevance(entry: VaultEntry, query: string): number {
  const queryWords = query.toLowerCase().split(' ').filter(w => w.length > 2)
  let score = 0
  const searchable = `${entry.title} ${entry.content} ${entry.category} ${entry.tags.join(' ')}`.toLowerCase()
  queryWords.forEach(word => { if (searchable.includes(word)) score += 1 })
  score += entry.accessCount * 0.1  // Boost frequently accessed items
  return score
}

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum(['store', 'recall', 'get_compounding_map', 'get_category', 'generate_daily_digest', 'get_stats']),
    title: z.string().optional(),
    content: z.string().optional(),
    category: z.string().optional().describe('e.g. investment, relationships, product, negotiation, leadership'),
    tags: z.array(z.string()).optional(),
    confidence: z.enum(['proven', 'hypothesis', 'theory']).optional(),
    applicability: z.enum(['immediate', 'later', 'permanent']).optional(),
    source: z.string().optional(),
    query: z.string().optional().describe('What to recall from the vault'),
    limit: z.number().optional().describe('Max results to return'),
  })
)
type InputSchema = ReturnType<typeof inputSchema>
export type Output = { result: string }

export const StrategicVaultTool = buildTool({
  name: STRATEGIC_VAULT_TOOL_NAME,
  searchHint: 'strategic vault store lessons knowledge compounding intelligence daily digest',
  maxResultSizeChars: 150000,
  async description() { return 'الخزينة الاستراتيجية + محرك الذكاء المتراكم. يخزن كل فكرة قيّمة ودرس مستفاد ومبدأ ناجح، ينظمها حسب الثقة والتطبيق، ويبني شبكة ارتباط بين المعارف (Compounding Intelligence). يولّد أيضاً مجلة يومية مخصصة.' },
  async prompt() { return 'store: خزّن درساً جديداً. recall: استرجع بحسب الموضوع. get_compounding_map: اكتشف كيف تتصل معارفك. generate_daily_digest: مجلتك الصباحية.' },
  get inputSchema() { return inputSchema() },
  get outputSchema() { return lazySchema(() => z.any()) },
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  async call(input) {
    let vault = loadVault()

    if (input.action === 'store') {
      if (!input.title || !input.content) throw new Error('title and content required')
      const partialEntry = {
        id: `vault-${Date.now()}`,
        title: input.title,
        content: input.content,
        category: input.category ?? 'general',
        tags: input.tags ?? [],
        confidence: input.confidence ?? 'hypothesis' as ConfidenceLevel,
        applicability: input.applicability ?? 'later' as ApplicabilityLevel,
        source: input.source,
        addedAt: new Date().toISOString(),
        accessCount: 0,
      }
      const connections = findConnections(partialEntry as VaultEntry, vault)
      const entry: VaultEntry = { ...partialEntry, connections }
      vault.push(entry)
      saveVault(vault)

      let res = `## 🔐 تم التخزين في الخزينة\n\n**"${input.title}"**\n- الفئة: ${entry.category}\n- مستوى الثقة: ${entry.confidence}\n- قابلية التطبيق: ${entry.applicability}\n- ID: \`${entry.id}\`\n`
      if (connections.length > 0) {
        const connected = vault.filter(e => connections.includes(e.id))
        res += `\n🔗 **يرتبط تلقائياً بـ ${connections.length} معرفة في خزينتك:**\n`
        connected.forEach(c => { res += `- "${c.title}" (${c.category})\n` })
        res += `\n💡 *هذه الروابط هي قلب "الذكاء المتراكم" — كل درس يضيء دروساً أخرى.*`
      }
      return { data: { result: res } }
    }

    if (input.action === 'recall') {
      if (!input.query) throw new Error('query required')
      const scored = vault.map(e => ({ entry: e, score: scoreRelevance(e, input.query!) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, input.limit ?? 5)

      // Update access count
      scored.forEach(({ entry }) => {
        const v = vault.find(e => e.id === entry.id)
        if (v) { v.accessCount++; v.lastAccessed = new Date().toISOString() }
      })
      saveVault(vault)

      if (scored.length === 0) return { data: { result: `لم أجد شيئاً ذا صلة بـ "${input.query}" في خزينتك. جرّب كلمات مختلفة.` } }

      let res = `## 🔍 استرجاع من الخزينة: "${input.query}"\n\n`
      scored.forEach(({ entry, score }, i) => {
        const confIcon = entry.confidence === 'proven' ? '✅' : entry.confidence === 'hypothesis' ? '🔬' : '💭'
        res += `### ${i + 1}. ${confIcon} ${entry.title}\n**الفئة:** ${entry.category} | **التطبيق:** ${entry.applicability}\n${entry.content}\n${entry.source ? `*المصدر: ${entry.source}*\n` : ''}${entry.connections.length > 0 ? `🔗 مرتبط بـ ${entry.connections.length} درس آخر\n` : ''}\n---\n`
      })
      return { data: { result: res } }
    }

    if (input.action === 'get_compounding_map') {
      if (vault.length === 0) return { data: { result: 'الخزينة فارغة. أضف دروساً أولاً.' } }
      const categories = [...new Set(vault.map(e => e.category))]
      let res = `## 🧠 خريطة الذكاء المتراكم\n\n**إجمالي المعارف:** ${vault.length} | **الفئات:** ${categories.length}\n\n`
      categories.forEach(cat => {
        const catEntries = vault.filter(e => e.category === cat)
        res += `### 📁 ${cat} (${catEntries.length})\n`
        catEntries.forEach(e => {
          res += `- **${e.title}** [${e.confidence}]`
          if (e.connections.length > 0) {
            const connTitles = e.connections.map(cid => vault.find(v => v.id === cid)?.title ?? '?').slice(0, 2)
            res += ` → *يتصل بـ: ${connTitles.join(', ')}*`
          }
          res += '\n'
        })
        res += '\n'
      })
      const topAccessed = vault.sort((a, b) => b.accessCount - a.accessCount).slice(0, 3)
      res += `### ⭐ الأكثر استحضاراً:\n${topAccessed.map(e => `- "${e.title}" (${e.accessCount}× مرة)`).join('\n')}`
      return { data: { result: res } }
    }

    if (input.action === 'get_category') {
      if (!input.category) throw new Error('category required')
      const catEntries = vault.filter(e => e.category.toLowerCase().includes(input.category!.toLowerCase()))
      if (catEntries.length === 0) return { data: { result: `لا توجد مدخلات في فئة "${input.category}"` } }
      const proven = catEntries.filter(e => e.confidence === 'proven')
      let res = `## 📁 فئة: ${input.category} (${catEntries.length} مدخل)\n\n`
      if (proven.length > 0) { res += `### ✅ مُثبَت (${proven.length}):\n`; proven.forEach(e => { res += `**${e.title}:** ${e.content.slice(0, 150)}...\n\n` }) }
      const rest = catEntries.filter(e => e.confidence !== 'proven')
      if (rest.length > 0) { res += `### 🔬 تحت الاختبار:\n`; rest.forEach(e => { res += `- **${e.title}** [${e.confidence}]\n` }) }
      return { data: { result: res } }
    }

    if (input.action === 'generate_daily_digest') {
      const today = new Date()
      const dayName = today.toLocaleDateString('ar-SA', { weekday: 'long' })
      const dateStr = today.toLocaleDateString('ar-SA')

      // Select diverse entries for the digest
      const proven = vault.filter(e => e.confidence === 'proven').slice(0, 2)
      const recent = vault.sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, 1)
      const random = vault.length > 3 ? [vault[Math.floor(Math.random() * vault.length)]!] : []
      const featured = [...new Set([...proven, ...recent, ...random])].slice(0, 3)

      let res = `## 📰 مجلتك الصباحية — ${dayName}، ${dateStr}\n\n`
      res += `> *"التعلم بدون تطبيق هو ترفيه. التطبيق بدون تعلم هو مراهنة عمياء."*\n\n---\n\n`

      if (featured.length > 0) {
        res += `### 💎 درس اليوم من خزينتك:\n`
        featured.slice(0, 1).forEach(e => {
          res += `**"${e.title}"** [${e.category}]\n\n${e.content}\n\n`
          if (e.source) res += `*— ${e.source}*\n`
        })
      }

      if (featured.length > 1) {
        res += `\n### 🔗 روابط ذكية تستحق تأملها اليوم:\n`
        featured.slice(1).forEach(e => { res += `- **${e.title}:** ${e.content.slice(0, 100)}...\n` })
      }

      res += `\n---\n\n### 🎯 السؤال الذي يصنع يومك:\n*ما الشيء الوحيد الذي إذا أنجزته اليوم سيجعل كل شيء آخر أسهل أو غير ضروري؟*\n\n`
      res += `**خزينتك:** ${vault.length} درس مخزن | استخدم \`recall\` لاستحضار أي معرفة تحتاجها الآن.`
      return { data: { result: res } }
    }

    if (input.action === 'get_stats') {
      if (vault.length === 0) return { data: { result: 'الخزينة فارغة.' } }
      const proven = vault.filter(e => e.confidence === 'proven').length
      const thisMonth = vault.filter(e => e.addedAt > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()).length
      const categories = [...new Set(vault.map(e => e.category))]
      const totalConnections = vault.reduce((s, e) => s + e.connections.length, 0)
      return { data: { result: `## 📊 إحصاءات الخزينة الاستراتيجية\n\n- **إجمالي المدخلات:** ${vault.length}\n- **مُثبَت:** ${proven} | **فرضية:** ${vault.length - proven}\n- **الفئات:** ${categories.join('، ')}\n- **روابط المعرفة:** ${totalConnections} رابط (Compounding Intelligence)\n- **هذا الشهر:** ${thisMonth} درس جديد\n- **الأكثر وصولاً:** ${vault.sort((a, b) => b.accessCount - a.accessCount)[0]?.title ?? '-'}` } }
    }

    return { data: { result: 'Unknown action' } }
  },
  mapToolResultToToolResultBlockParam(data, toolUseID) { return { tool_use_id: toolUseID, type: 'tool_result', content: data.result } },
  userFacingName() { return 'Strategic Vault' },
  getToolUseSummary(i) { return i ? `${i.action}` : 'Strategic Vault' },
  renderToolUseMessage() { return 'Accessing Strategic Vault...' },
  renderToolUseTag() { return null },
  renderToolResultMessage() { return null },
  extractSearchText() { return '' },
  renderToolUseErrorMessage(e) { return String(e) },
  async validateInput() { return { result: true } },
} satisfies ToolDef<InputSchema, Output>)
