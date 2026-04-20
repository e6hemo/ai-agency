import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import fs from 'fs'
import path from 'path'
import { getCwd } from '../../utils/cwd.js'

export const OBSIDIAN_SYNC_TOOL_NAME = 'ObsidianSync'

/**
 * Returns the configured Obsidian vault path from .claude/obsidian-config.json,
 * or falls back to a local `.obsidian-notes` folder inside the project.
 */
function getVaultPath(customVaultPath?: string): string {
  if (customVaultPath) return customVaultPath

  const configPath = path.join(getCwd(), '.claude', 'obsidian-config.json')
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      if (config.vaultPath) return config.vaultPath
    } catch {}
  }

  // fallback: local notes folder inside project
  return path.join(getCwd(), '.claude', 'obsidian-notes')
}

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true })
}

function todayString() {
  return new Date().toISOString().split('T')[0]!
}

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum(['write_note', 'append_note', 'read_note', 'list_notes', 'set_vault_path']),
    folder: z.string().optional().describe('Subfolder inside vault, e.g. "Daily" or "Experiments"'),
    title: z.string().optional().describe('Note title / filename (without .md)'),
    content: z.string().optional().describe('Markdown content to write or append'),
    vaultPath: z.string().optional().describe('Absolute path to Obsidian vault (used with set_vault_path)')
  })
)

type InputSchema = ReturnType<typeof inputSchema>
export type Output = { result: string }

export const ObsidianSyncTool = buildTool({
  name: OBSIDIAN_SYNC_TOOL_NAME,
  searchHint: 'sync notes and diaries to Obsidian vault in Markdown format',
  maxResultSizeChars: 100000,
  async description() {
    return 'Syncs structured notes, daily diaries, experiments, and Stella briefs to an Obsidian vault. Supports write, append, read, list, and vault configuration.'
  },
  async prompt() {
    return 'Use write_note to create new Obsidian notes. Use append_note to add content to existing ones. Use set_vault_path to configure once.'
  },
  get inputSchema() { return inputSchema() },
  get outputSchema() { return lazySchema(() => z.any()) },
  isConcurrencySafe: () => false,
  isReadOnly: () => false,

  async call(input) {
    const vaultRoot = getVaultPath()

    if (input.action === 'set_vault_path') {
      if (!input.vaultPath) throw new Error('vaultPath is required for set_vault_path')
      const configDir = path.join(getCwd(), '.claude')
      ensureDir(configDir)
      fs.writeFileSync(
        path.join(configDir, 'obsidian-config.json'),
        JSON.stringify({ vaultPath: input.vaultPath }, null, 2),
        'utf-8'
      )
      return { data: { result: `✅ Obsidian vault path saved: ${input.vaultPath}` } }
    }

    const folder = input.folder ?? 'Daily'
    const title = input.title ?? todayString()
    const noteDir = path.join(vaultRoot, folder)
    const notePath = path.join(noteDir, `${title}.md`)

    if (input.action === 'list_notes') {
      ensureDir(vaultRoot)
      const allNotes: string[] = []
      const scanFolder = (dir: string, prefix = '') => {
        if (!fs.existsSync(dir)) return
        for (const entry of fs.readdirSync(dir)) {
          const full = path.join(dir, entry)
          if (fs.statSync(full).isDirectory()) scanFolder(full, prefix + entry + '/')
          else if (entry.endsWith('.md')) allNotes.push(prefix + entry)
        }
      }
      scanFolder(vaultRoot)
      return { data: { result: allNotes.length > 0 ? `📚 Notes:\n${allNotes.join('\n')}` : 'No notes yet.' } }
    }

    if (input.action === 'read_note') {
      if (!fs.existsSync(notePath)) return { data: { result: `Note not found: ${notePath}` } }
      const content = fs.readFileSync(notePath, 'utf-8')
      return { data: { result: `📄 ${title}.md\n\n${content}` } }
    }

    ensureDir(noteDir)

    if (input.action === 'write_note') {
      if (!input.content) throw new Error('content is required for write_note')
      const header = `# ${title}\n> Created: ${new Date().toISOString()}\n\n`
      fs.writeFileSync(notePath, header + input.content, 'utf-8')
      return { data: { result: `✅ Note written: ${notePath}` } }
    }

    if (input.action === 'append_note') {
      if (!input.content) throw new Error('content is required for append_note')
      const separator = `\n\n---\n#### Update: ${new Date().toISOString()}\n`
      if (fs.existsSync(notePath)) {
        fs.appendFileSync(notePath, separator + input.content, 'utf-8')
      } else {
        const header = `# ${title}\n> Created: ${new Date().toISOString()}\n\n`
        fs.writeFileSync(notePath, header + input.content, 'utf-8')
      }
      return { data: { result: `✅ Appended to: ${notePath}` } }
    }

    return { data: { result: 'Unknown action' } }
  },

  mapToolResultToToolResultBlockParam(data, toolUseID) {
    return { tool_use_id: toolUseID, type: 'tool_result', content: data.result }
  },
  userFacingName() { return 'Obsidian Sync' },
  getToolUseSummary(i) { return i ? `${i.action} → ${i.title ?? 'note'}` : 'Obsidian Sync' },
  renderToolUseMessage() { return `Syncing to Obsidian vault...` },
  renderToolUseTag() { return null },
  renderToolResultMessage() { return null },
  extractSearchText() { return '' },
  renderToolUseErrorMessage(e) { return String(e) },
  async validateInput() { return { result: true } }
} satisfies ToolDef<InputSchema, Output>)
