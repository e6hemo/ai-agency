import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import fs from 'fs'
import path from 'path'
import { getCwd } from '../../utils/cwd.js'

export const NOTIFY_DISPATCHER_TOOL_NAME = 'NotifyDispatcher'

function getConfigPath() {
  return path.join(getCwd(), '.claude', 'notify-config.json')
}

interface NotifyConfig {
  telegram?: {
    botToken: string
    chatId: string
  }
  discord?: {
    webhookUrl: string
  }
}

function loadConfig(): NotifyConfig {
  try {
    const p = getConfigPath()
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {}
  return {}
}

function saveConfig(config: NotifyConfig) {
  const dir = path.dirname(getConfigPath())
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8')
}

async function sendTelegram(botToken: string, chatId: string, message: string): Promise<boolean> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    })
    const data = await res.json() as { ok: boolean }
    return data.ok === true
  } catch {
    return false
  }
}

async function sendDiscord(webhookUrl: string, message: string): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    })
    return res.ok
  } catch {
    return false
  }
}

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum(['send', 'configure_telegram', 'configure_discord', 'test']),
    message: z.string().optional().describe('Message to send'),
    channel: z.enum(['telegram', 'discord', 'all']).optional().default('all'),
    botToken: z.string().optional().describe('Telegram Bot Token (for configure_telegram)'),
    chatId: z.string().optional().describe('Telegram Chat ID (for configure_telegram)'),
    discordWebhookUrl: z.string().optional().describe('Discord Webhook URL (for configure_discord)'),
  })
)

type InputSchema = ReturnType<typeof inputSchema>
export type Output = { result: string }

export const NotifyDispatcherTool = buildTool({
  name: NOTIFY_DISPATCHER_TOOL_NAME,
  searchHint: 'send notifications via Telegram or Discord',
  maxResultSizeChars: 50000,
  async description() {
    return 'Sends Stella morning briefs, evening wraps, alerts, and meeting preps directly to your phone via Telegram or Discord. Configure once, use forever.'
  },
  async prompt() {
    return 'Use configure_telegram or configure_discord once to set up. Then use send to dispatch any message to your phone. Perfect for morning/evening Stella briefs.'
  },
  get inputSchema() { return inputSchema() },
  get outputSchema() { return lazySchema(() => z.any()) },
  isConcurrencySafe: () => false,
  isReadOnly: () => false,

  async call(input) {
    const config = loadConfig()

    if (input.action === 'configure_telegram') {
      if (!input.botToken || !input.chatId) throw new Error('botToken and chatId required')
      config.telegram = { botToken: input.botToken, chatId: input.chatId }
      saveConfig(config)
      return { data: { result: `✅ Telegram configured! Bot token and chat ID saved securely.` } }
    }

    if (input.action === 'configure_discord') {
      if (!input.discordWebhookUrl) throw new Error('discordWebhookUrl required')
      config.discord = { webhookUrl: input.discordWebhookUrl }
      saveConfig(config)
      return { data: { result: `✅ Discord webhook configured!` } }
    }

    if (input.action === 'test') {
      const testMsg = `🤖 *OpenClaude Agency*\n\nTest notification from your AI Chief of Staff!\n\n_Time: ${new Date().toLocaleString()}_`
      const results: string[] = []

      if (config.telegram) {
        const ok = await sendTelegram(config.telegram.botToken, config.telegram.chatId, testMsg)
        results.push(`Telegram: ${ok ? '✅ Delivered' : '❌ Failed'}`)
      }
      if (config.discord) {
        const ok = await sendDiscord(config.discord.webhookUrl, testMsg)
        results.push(`Discord: ${ok ? '✅ Delivered' : '❌ Failed'}`)
      }
      if (results.length === 0) {
        return { data: { result: `⚠️ No channels configured yet. Run configure_telegram or configure_discord first.` } }
      }
      return { data: { result: results.join('\n') } }
    }

    if (input.action === 'send') {
      if (!input.message) throw new Error('message is required for send')
      const channel = input.channel ?? 'all'
      const results: string[] = []

      const formattedMsg = `🤖 *OpenClaude Agency*\n\n${input.message}\n\n_${new Date().toLocaleString()}_`

      if ((channel === 'all' || channel === 'telegram') && config.telegram) {
        const ok = await sendTelegram(config.telegram.botToken, config.telegram.chatId, formattedMsg)
        results.push(`Telegram: ${ok ? '✅ Sent' : '❌ Failed'}`)
      }

      if ((channel === 'all' || channel === 'discord') && config.discord) {
        const ok = await sendDiscord(config.discord.webhookUrl, formattedMsg)
        results.push(`Discord: ${ok ? '✅ Sent' : '❌ Failed'}`)
      }

      if (results.length === 0) {
        return { data: { result: `⚠️ No channels configured. Run configure_telegram or configure_discord first.` } }
      }

      return { data: { result: results.join('\n') } }
    }

    return { data: { result: 'Unknown action' } }
  },

  mapToolResultToToolResultBlockParam(data, toolUseID) {
    return { tool_use_id: toolUseID, type: 'tool_result', content: data.result }
  },
  userFacingName() { return 'Notify Dispatcher' },
  getToolUseSummary(i) { return i ? `${i.action} via ${i.channel ?? 'all'}` : 'Notify' },
  renderToolUseMessage() { return `Dispatching notification...` },
  renderToolUseTag() { return null },
  renderToolResultMessage() { return null },
  extractSearchText() { return '' },
  renderToolUseErrorMessage(e) { return String(e) },
  async validateInput() { return { result: true } }
} satisfies ToolDef<InputSchema, Output>)
