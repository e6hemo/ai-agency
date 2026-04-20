import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import fs from 'fs'
import path from 'path'
import { getCwd } from '../../utils/cwd.js'

export const NOTEBOOK_KNOWLEDGE_TOOL_NAME = 'NotebookKnowledge'

function getDbPath() {
  return path.join(getCwd(), '.claude', 'knowledge-base.json')
}

interface KnowledgeEntry {
  id: string
  source: string
  content: string
  tags: string[]
  addedAt: string
}

function loadDb(): KnowledgeEntry[] {
  try {
    const p = getDbPath()
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'))
    }
  } catch (e) {}
  return []
}

function saveDb(db: KnowledgeEntry[]) {
  const p = getDbPath()
  const dir = path.dirname(p)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(p, JSON.stringify(db, null, 2), 'utf-8')
}

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum(['ingest', 'search', 'list_sources']),
    content: z.string().optional().describe('Text to ingest'),
    source: z.string().optional().describe('Source name e.g. "Huberman Pod #12"'),
    tags: z.array(z.string()).optional(),
    query: z.string().optional().describe('Search query for RAG retrieval')
  })
)

type InputSchema = ReturnType<typeof inputSchema>
export type Output = { result: string }

export const NotebookKnowledgeTool = buildTool({
  name: NOTEBOOK_KNOWLEDGE_TOOL_NAME,
  searchHint: 'ingest or search long-term expert knowledge base (NotebookLM style)',
  maxResultSizeChars: 100000,
  async description() {
    return 'Maintains a long-term NotebookLM-style knowledge base. You can ingest text with sources, and perform searches to extract expert context for personal protocols.'
  },
  async prompt() {
    return 'Use this tool to store expert advice, protocols, and large text chunks to remember them forever. Use search to retrieve exact citations.'
  },
  get inputSchema() { return inputSchema() },
  get outputSchema() { return lazySchema(() => z.any()) },
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  async call(input) {
    const db = loadDb()

    if (input.action === 'ingest') {
      if (!input.content || !input.source) throw new Error('content and source required for ingest')
      db.push({
        id: `entry-${Date.now()}`,
        source: input.source,
        content: input.content,
        tags: input.tags || [],
        addedAt: new Date().toISOString()
      })
      saveDb(db)
      return { data: { result: `✅ Ingested ${input.content.length} chars from ${input.source}` } }
    }

    if (input.action === 'list_sources') {
      const sources = new Set(db.map(entry => entry.source))
      return { data: { result: `📚 Indexed Sources:\n${Array.from(sources).join('\n')}` } }
    }

    if (input.action === 'search') {
      if (!input.query) throw new Error('query required for search')
      
      const terms = input.query.toLowerCase().split(' ').filter(t => t.length > 3)
      const scored = db.map(entry => {
        let score = 0
        const contentLower = entry.content.toLowerCase()
        terms.forEach(term => {
          if (contentLower.includes(term)) score += 1
          if (entry.tags.some(tag => tag.toLowerCase() === term)) score += 2
        })
        return { entry, score }
      }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 5)

      if (scored.length === 0) return { data: { result: 'No relevant knowledge found.' } }

      const res = scored.map(s => `[Source: ${s.entry.source} | Score: ${s.score}]\n${s.entry.content.substring(0, 1000)}...`).join('\n\n---\n\n')
      return { data: { result: `🔍 Search Results:\n\n${res}` } }
    }

    return { data: { result: 'Unknown action' } }
  },
  mapToolResultToToolResultBlockParam(data, toolUseID) {
    return { tool_use_id: toolUseID, type: 'tool_result', content: data.result }
  },
  userFacingName() { return 'Notebook Knowledge' },
  getToolUseSummary(i) { return i ? `${i.action} knowledge base` : 'Knowledge Base' },
  renderToolUseMessage() { return `Accessing NotebookLM knowledge base...` },
  renderToolUseTag() { return null },
  renderToolResultMessage() { return null },
  extractSearchText() { return '' },
  renderToolUseErrorMessage(e) { return String(e) },
  async validateInput() { return { result: true } }
} satisfies ToolDef<InputSchema, Output>)
