import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import fs from 'fs'
import path from 'path'
import { getCwd } from '../../utils/cwd.js'

export const MEETING_PREP_TOOL_NAME = 'MeetingPrep'

function getMeetingsPath() {
  return path.join(getCwd(), '.claude', 'meetings-log.json')
}

interface MeetingEntry {
  id: string
  personName: string
  date: string
  agenda: string
  notes?: string
  actionItems?: string[]
  commitments?: string[]   // What others committed to
}

function loadMeetings(): MeetingEntry[] {
  try {
    const p = getMeetingsPath()
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {}
  return []
}

function saveMeetings(meetings: MeetingEntry[]) {
  const dir = path.dirname(getMeetingsPath())
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(getMeetingsPath(), JSON.stringify(meetings, null, 2), 'utf-8')
}

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum(['generate_brief', 'log_meeting', 'get_history', 'add_action_item']),
    personName: z.string().optional().describe('Name of person you are meeting'),
    agenda: z.string().optional().describe('What you plan to discuss'),
    notes: z.string().optional().describe('Notes from a completed meeting'),
    actionItems: z.array(z.string()).optional().describe('Action items from meeting'),
    commitments: z.array(z.string()).optional().describe('What the other person committed to do'),
    meetingId: z.string().optional().describe('ID of existing meeting to update'),
  })
)

type InputSchema = ReturnType<typeof inputSchema>
export type Output = { result: string }

export const MeetingPrepTool = buildTool({
  name: MEETING_PREP_TOOL_NAME,
  searchHint: 'prepare meeting intelligence briefing, log meetings, track action items',
  maxResultSizeChars: 100000,
  async description() {
    return 'Meeting Intelligence tool. Generates pre-meeting briefings from historical data, logs meeting notes and action items, and tracks commitments made by all parties. Inspired by the Stella military-precision meeting prep system.'
  },
  async prompt() {
    return 'Use generate_brief before any meeting to get a full intelligence report on the person. Use log_meeting after to record notes and extract action items automatically.'
  },
  get inputSchema() { return inputSchema() },
  get outputSchema() { return lazySchema(() => z.any()) },
  isConcurrencySafe: () => false,
  isReadOnly: () => false,

  async call(input) {
    const meetings = loadMeetings()

    if (input.action === 'generate_brief') {
      if (!input.personName) throw new Error('personName is required')

      const history = meetings.filter(m =>
        m.personName.toLowerCase().includes(input.personName!.toLowerCase())
      ).sort((a, b) => b.date.localeCompare(a.date))

      if (history.length === 0) {
        const brief = `# 📋 Meeting Brief: ${input.personName}\n\n` +
          `> Generated: ${new Date().toISOString()}\n\n` +
          `## ⚠️ First Meeting\n` +
          `This is your first recorded meeting with **${input.personName}**.\n\n` +
          `${input.agenda ? `## 📌 Today's Agenda\n${input.agenda}\n\n` : ''}` +
          `## ✅ Recommendation\n` +
          `- Take thorough notes after this meeting using \`log_meeting\` action\n` +
          `- Capture any commitments or promises made`
        return { data: { result: brief } }
      }

      const lastMeeting = history[0]!
      const pendingCommitments = history
        .flatMap(m => (m.commitments ?? []).map(c => `• [${m.date}] ${c}`))
      const openActionItems = history
        .flatMap(m => (m.actionItems ?? []).map(a => `• [${m.date}] ${a}`))

      const brief = `# 📋 Meeting Brief: ${input.personName}\n\n` +
        `> Generated: ${new Date().toISOString()}\n\n` +
        `## 🗓️ Meeting History\n` +
        `Total meetings logged: **${history.length}**\n` +
        `Last met: **${lastMeeting.date}**\n\n` +
        `## 📝 Last Meeting Notes\n` +
        `_Agenda:_ ${lastMeeting.agenda}\n` +
        (lastMeeting.notes ? `_Notes:_ ${lastMeeting.notes}\n` : '') +
        `\n## ⏰ Open Action Items\n` +
        (openActionItems.length > 0 ? openActionItems.join('\n') : '✅ No open action items') +
        `\n\n## 🤝 Their Commitments (pending follow-up)\n` +
        (pendingCommitments.length > 0 ? pendingCommitments.join('\n') : '✅ No pending commitments') +
        (input.agenda ? `\n\n## 📌 Today's Agenda\n${input.agenda}` : '') +
        `\n\n---\n_Full history: ${history.length} meeting(s) on record_`

      return { data: { result: brief } }
    }

    if (input.action === 'log_meeting') {
      if (!input.personName || !input.agenda) throw new Error('personName and agenda required')

      const entry: MeetingEntry = {
        id: `meeting-${Date.now()}`,
        personName: input.personName,
        date: new Date().toISOString().split('T')[0]!,
        agenda: input.agenda,
        notes: input.notes,
        actionItems: input.actionItems ?? [],
        commitments: input.commitments ?? [],
      }

      meetings.push(entry)
      saveMeetings(meetings)

      return { data: { result: `✅ Meeting logged (ID: ${entry.id})\n📌 Action items: ${entry.actionItems?.length ?? 0}\n🤝 Commitments tracked: ${entry.commitments?.length ?? 0}` } }
    }

    if (input.action === 'get_history') {
      if (!input.personName) throw new Error('personName required')
      const history = meetings.filter(m =>
        m.personName.toLowerCase().includes(input.personName!.toLowerCase())
      ).sort((a, b) => b.date.localeCompare(a.date))

      if (history.length === 0) return { data: { result: `No meetings found for "${input.personName}".` } }

      const lines = history.map(m =>
        `[${m.date}] ID: ${m.id}\n  Agenda: ${m.agenda}\n  Action Items: ${m.actionItems?.join(', ') || 'none'}`
      )
      return { data: { result: `📅 Meeting history for ${input.personName}:\n\n${lines.join('\n\n')}` } }
    }

    if (input.action === 'add_action_item') {
      if (!input.meetingId || !input.actionItems?.length) throw new Error('meetingId and actionItems required')
      const meeting = meetings.find(m => m.id === input.meetingId)
      if (!meeting) throw new Error(`Meeting ${input.meetingId} not found`)
      meeting.actionItems = [...(meeting.actionItems ?? []), ...(input.actionItems ?? [])]
      saveMeetings(meetings)
      return { data: { result: `✅ Added ${input.actionItems.length} action item(s) to meeting ${input.meetingId}` } }
    }

    return { data: { result: 'Unknown action' } }
  },

  mapToolResultToToolResultBlockParam(data, toolUseID) {
    return { tool_use_id: toolUseID, type: 'tool_result', content: data.result }
  },
  userFacingName() { return 'Meeting Prep Intelligence' },
  getToolUseSummary(i) { return i ? `${i.action} for ${i.personName ?? 'meeting'}` : 'Meeting Prep' },
  renderToolUseMessage() { return `Generating meeting intelligence brief...` },
  renderToolUseTag() { return null },
  renderToolResultMessage() { return null },
  extractSearchText() { return '' },
  renderToolUseErrorMessage(e) { return String(e) },
  async validateInput() { return { result: true } }
} satisfies ToolDef<InputSchema, Output>)
