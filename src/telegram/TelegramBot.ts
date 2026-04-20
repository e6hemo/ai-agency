/**
 * OpenClaude Telegram Bot
 * 
 * بوت تيليجرام يربط OpenClaude بجوالك
 * يتيح إرسال الأوامر واستقبال الردود والإشعارات عن بعد
 * 
 * الإعداد:
 * 1. أنشئ بوت عبر @BotFather على تيليجرام
 * 2. أضف TELEGRAM_BOT_TOKEN في .env
 * 3. أضف TELEGRAM_CHAT_ID (اختياري، للأمان)
 * 4. شغّل: openclaude --telegram
 */

import * as https from 'https'
import * as fs from 'fs'
import * as path from 'path'
import { getOriginalCwd } from '../bootstrap/state.js'
import { TelegramAIBridge } from './TelegramAIBridge.js'

// ═══════════════════════════════════════════════════════════════════════════════
// 📋 الأنواع
// ═══════════════════════════════════════════════════════════════════════════════

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: any
}

interface TelegramMessage {
  message_id: number
  from: TelegramUser
  chat: TelegramChat
  date: number
  text?: string
  voice?: { file_id: string; duration: number }
  document?: { file_id: string; file_name: string }
  photo?: Array<{ file_id: string; width: number; height: number }>
}

interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
}

interface TelegramChat {
  id: number
  type: 'private' | 'group' | 'supergroup'
}

interface BotConfig {
  token: string
  allowedChatIds: number[]
  pollingInterval: number
  maxMessageLength: number
}

type MessageHandler = (message: string, chatId: number) => Promise<string>

// ═══════════════════════════════════════════════════════════════════════════════
// 🤖 المحرك الرئيسي للبوت
// ═══════════════════════════════════════════════════════════════════════════════

export class TelegramBot {
  private config: BotConfig
  private lastUpdateId: number = 0
  private running: boolean = false
  private messageHandler: MessageHandler | null = null
  private commandHandlers: Map<string, (args: string, chatId: number) => Promise<string>> = new Map()
  private bridge: TelegramAIBridge

  constructor(token?: string, cwd?: string) {
    this.config = {
      token: token || process.env.TELEGRAM_BOT_TOKEN || '',
      allowedChatIds: this.parseAllowedChats(),
      pollingInterval: 1000,
      maxMessageLength: 4096
    }

    if (!this.config.token) {
      throw new Error(
        '❌ TELEGRAM_BOT_TOKEN غير موجود!\n' +
        '1. أنشئ بوت عبر @BotFather\n' +
        '2. أضف التوكن في .env:\n' +
        '   TELEGRAM_BOT_TOKEN=your_token_here'
      )
    }

    // Initialize AI Bridge
    const workingDir = cwd || process.cwd()
    this.bridge = new TelegramAIBridge(workingDir)

    this.registerDefaultCommands()
    this.registerAICommands()
    this.wireAIMessageHandler()
  }

  private parseAllowedChats(): number[] {
    const raw = process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_ALLOWED_CHATS || ''
    if (!raw) return [] // فارغ = قبول الكل (تحذير في اللوج)
    return raw.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
  }

  // ─── أوامر افتراضية ─────────────────────────────────────────────────────

  private registerDefaultCommands(): void {
    this.commandHandlers.set('start', async (_, chatId) => {
      return (
        '🚀 *مرحباً بك في OpenClaude Bot!*\n\n' +
        '🧠 أنا مربوط بمحرك الذكاء الاصطناعي — أرسل أي رسالة وسأرد عليك!\n\n' +
        '*الأوامر المتاحة:*\n' +
        '/ask — اسأل سؤال\n' +
        '/exec — تنفيذ أمر shell\n' +
        '/brief — تقرير سريع\n' +
        '/status — حالة النظام\n' +
        '/model — تغيير الموديل\n' +
        '/agent — تغيير الوكيل\n' +
        '/session — معلومات الجلسة\n' +
        '/clear — مسح المحادثة\n' +
        '/help — المساعدة\n\n' +
        `🆔 Chat ID: \`${chatId}\``
      )
    })

    this.commandHandlers.set('help', async () => {
      return (
        '📖 *دليل الاستخدام*\n\n' +
        '💬 *محادثة ذكية:* أرسل أي نص وسأرد عليك بذكاء\n' +
        '🔧 *تنفيذ أوامر:* `/exec git status`\n' +
        '📊 *تقرير:* `/brief`\n' +
        '🤖 *تغيير الموديل:* `/model anthropic/claude-3.5-sonnet:beta`\n' +
        '🧑‍💼 *تغيير الوكيل:* `/agent chief-of-staff`\n' +
        '🗑 *مسح التاريخ:* `/clear`\n\n' +
        '_أرسل أي رسالة عادية للتحدث مع الذكاء الاصطناعي مباشرة!_'
      )
    })

    this.commandHandlers.set('status', async () => {
      let cwd: string
      try { cwd = getOriginalCwd() } catch { cwd = process.cwd() }
      const uptime = process.uptime()
      const hours = Math.floor(uptime / 3600)
      const mins = Math.floor((uptime % 3600) / 60)
      const memUsage = process.memoryUsage()
      const memMB = Math.round(memUsage.heapUsed / 1024 / 1024)

      return (
        '📊 *حالة النظام*\n\n' +
        `📂 المشروع: \`${path.basename(cwd)}\`\n` +
        `⏱ وقت التشغيل: ${hours}h ${mins}m\n` +
        `💾 الذاكرة: ${memMB} MB\n` +
        `🖥 المنصة: ${process.platform}\n` +
        `🤖 AI: ✅ متصل`
      )
    })

    this.commandHandlers.set('cost', async () => {
      return '💰 *تكلفة الجلسة*\n\n🔄 جاري الحساب... (سيتم ربطه بنظام التتبع)'
    })

    // /teams — الفرق النشطة
    this.commandHandlers.set('teams', async () => {
      try {
        const { listActiveTeams, getTeamProgress } = await import('../agency/team-orchestrator.js')
        const teams = listActiveTeams()
        if (teams.length === 0) return '👥 لا توجد فرق نشطة حالياً'

        let text = '👥 *الفرق النشطة*\n\n'
        for (const team of teams.slice(0, 5)) {
          const progress = getTeamProgress(team.teamName)
          text += `*${team.projectName}*\n`
          text += `  التقدم: ${progress?.percentComplete || 0}% (${progress?.completed || 0}/${progress?.total || 0})\n`
          text += `  الأعضاء: ${team.teammates.length}\n\n`
        }
        return text
      } catch {
        return '⚠️ تعذر تحميل بيانات الفرق'
      }
    })

    // /memory — حالة الذاكرة
    this.commandHandlers.set('memory', async () => {
      try {
        const { getMemoryStats } = await import('../agency/tiered-memory.js')
        const stats = getMemoryStats('default-project')
        return (
          '🧠 *MemPalace Stats*\n\n' +
          `🔥 HOT (فوري): ${stats.hot} مدخل\n` +
          `♨️ WARM (نشط): ${stats.warm} مدخل\n` +
          `🗃️ COLD (أرشيف): ${stats.cold} مدخل\n\n` +
          `📦 الإجمالي: ${stats.total} مدخل`
        )
      } catch {
        return '⚠️ تعذر تحميل بيانات الذاكرة'
      }
    })

    // /tasks — المهام النشطة
    this.commandHandlers.set('tasks', async () => {
      try {
        const { listActiveTeams, getTeamProgress } = await import('../agency/team-orchestrator.js')
        const teams = listActiveTeams()
        if (teams.length === 0) return '📋 لا توجد مهام نشطة حالياً'

        let text = '📋 *المهام النشطة*\n\n'
        for (const team of teams.slice(0, 2)) {
          text += `*${team.projectName}*\n`
          for (const task of team.tasks.slice(0, 5)) {
            const icon =
              task.status === 'completed'   ? '✅' :
              task.status === 'in-progress' ? '🔄' :
              task.status === 'blocked'     ? '🔒' : '⏳'
            text += `  ${icon} ${task.title}\n`
          }
          text += '\n'
        }
        return text
      } catch {
        return '⚠️ تعذر تحميل بيانات المهام'
      }
    })
  }

  // ─── Telegram API ──────────────────────────────────────────────────────

  private async apiCall(method: string, body?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const postData = body ? JSON.stringify(body) : ''
      const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${this.config.token}/${method}`,
        method: body ? 'POST' : 'GET',
        headers: body ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        } : {}
      }

      const req = https.request(options, (res) => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data)
            if (parsed.ok) {
              resolve(parsed.result)
            } else {
              reject(new Error(`Telegram API error: ${parsed.description}`))
            }
          } catch (e) {
            reject(new Error(`Failed to parse response: ${data}`))
          }
        })
      })

      req.on('error', reject)
      if (postData) req.write(postData)
      req.end()
    })
  }

  /** إرسال رسالة */
  async sendMessage(chatId: number, text: string, options?: {
    parseMode?: 'Markdown' | 'HTML'
    replyToMessageId?: number
  }): Promise<any> {
    // تقسيم الرسائل الطويلة
    const chunks = this.splitMessage(text)

    let lastResult: any
    for (const chunk of chunks) {
      lastResult = await this.apiCall('sendMessage', {
        chat_id: chatId,
        text: chunk,
        parse_mode: options?.parseMode || 'Markdown',
        reply_to_message_id: options?.replyToMessageId,
        disable_web_page_preview: true
      })
    }
    return lastResult
  }

  /** تعديل رسالة موجودة (للـ streaming) */
  async editMessage(chatId: number, messageId: number, text: string, parseMode: string = 'Markdown'): Promise<any> {
    try {
      return await this.apiCall('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: text.slice(0, this.config.maxMessageLength) || '...',
        parse_mode: parseMode,
        disable_web_page_preview: true
      })
    } catch (error: any) {
      // تجاهل خطأ "message is not modified" — يحدث عند تحديث بنفس النص
      if (error.message?.includes('message is not modified')) return null
      // تجاهل خطأ Markdown — أعد إرسال بدون تنسيق
      if (error.message?.includes('parse') || error.message?.includes('can\'t parse')) {
        return await this.apiCall('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: text.slice(0, this.config.maxMessageLength) || '...',
          disable_web_page_preview: true
        })
      }
      throw error
    }
  }

  /** إرسال حالة "يكتب..." */
  async sendTyping(chatId: number): Promise<void> {
    await this.apiCall('sendChatAction', {
      chat_id: chatId,
      action: 'typing'
    })
  }

  private splitMessage(text: string): string[] {
    const max = this.config.maxMessageLength
    if (text.length <= max) return [text]

    const chunks: string[] = []
    let remaining = text

    while (remaining.length > 0) {
      if (remaining.length <= max) {
        chunks.push(remaining)
        break
      }

      // البحث عن نقطة قطع مناسبة
      let splitAt = remaining.lastIndexOf('\n', max)
      if (splitAt < max * 0.5) splitAt = remaining.lastIndexOf(' ', max)
      if (splitAt < max * 0.5) splitAt = max

      chunks.push(remaining.slice(0, splitAt))
      remaining = remaining.slice(splitAt).trimStart()
    }

    return chunks
  }

  // ─── معالجة الرسائل ────────────────────────────────────────────────────

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message
    if (!message) return

    const chatId = message.chat.id
    const userId = message.from.id

    // التحقق من الصلاحية
    if (this.config.allowedChatIds.length > 0 && !this.config.allowedChatIds.includes(chatId)) {
      await this.sendMessage(chatId, '🔒 غير مصرح لك باستخدام هذا البوت.')
      console.warn(`⚠️ محاولة وصول غير مصرحة من Chat ID: ${chatId}`)
      return
    }

    const text = message.text || ''

    // معالجة الأوامر (تبدأ بـ /)
    if (text.startsWith('/')) {
      const [cmd, ...argParts] = text.slice(1).split(' ')
      const args = argParts.join(' ')
      const command = cmd!.split('@')[0]!.toLowerCase() // إزالة @botname

      const handler = this.commandHandlers.get(command)
      if (handler) {
        await this.sendTyping(chatId)
        try {
          const response = await handler(args, chatId)
          await this.sendMessage(chatId, response)
        } catch (error: any) {
          await this.sendMessage(chatId, `❌ خطأ: ${error.message}`)
        }
        return
      }
    }

    // معالجة الرسائل العادية عبر AI Bridge
    if (text && this.messageHandler) {
      await this.handleAIMessage(chatId, text)
      return
    }

    // إذا لم يكن هناك messageHandler، استخدم AI مباشرة
    if (text) {
      await this.handleAIMessage(chatId, text)
      return
    }

    // صور
    if (message.photo && message.photo.length > 0) {
      await this.sendMessage(chatId, '📸 تم استقبال الصورة. جاري التحليل...')
    }

    // صوت
    if (message.voice) {
      await this.sendMessage(chatId, '🎤 تم استقبال الرسالة الصوتية. جاري التحويل...')
    }

    // ملفات
    if (message.document) {
      await this.sendMessage(chatId, `📁 تم استقبال: ${message.document.file_name}`)
    }
  }

  // ─── AI Message Handler ─────────────────────────────────────────────

  /** معالجة رسالة عبر AI مع streaming */
  private async handleAIMessage(chatId: number, text: string): Promise<void> {
    // إرسال رسالة "يفكر..." الأولية
    await this.sendTyping(chatId)
    const thinkingMsg = await this.sendMessage(chatId, '🧠 _يفكر..._')
    const messageId = thinkingMsg?.message_id

    if (!messageId) {
      // fallback: إرسال بدون streaming
      try {
        const reply = await this.bridge.handleMessage(chatId, text)
        await this.sendMessage(chatId, reply)
      } catch (error: any) {
        await this.sendMessage(chatId, `❌ ${error.message}`)
      }
      return
    }

    try {
      let lastText = ''
      await this.bridge.handleMessage(chatId, text, async (streamedText, done) => {
        // تحديث الرسالة فقط إذا تغير النص
        const displayText = done ? streamedText : streamedText + ' ⏳'
        if (displayText !== lastText) {
          lastText = displayText
          await this.editMessage(chatId, messageId, displayText)
        }
      })
    } catch (error: any) {
      await this.editMessage(chatId, messageId, `❌ خطأ: ${error.message}`)
    }
  }

  // ─── أوامر AI ─────────────────────────────────────────────────────────

  /** تسجيل أوامر الذكاء الاصطناعي */
  private registerAICommands(): void {
    // /ask — سؤال مباشر
    this.commandHandlers.set('ask', async (args, chatId) => {
      if (!args.trim()) return '💡 استخدم: `/ask سؤالك هنا`'
      // معالجة عبر AI — نرسل فارغ ونعالج في handleUpdate
      await this.handleAIMessage(chatId, args)
      return '' // تم الرد مباشرة
    })

    // /exec — تنفيذ أمر
    this.commandHandlers.set('exec', async (args, chatId) => {
      if (!args.trim()) return '💡 استخدم: `/exec git status`'
      return await this.bridge.executeCommand(args)
    })

    // /brief — تقرير سريع
    this.commandHandlers.set('brief', async (_, chatId) => {
      return await this.bridge.getBriefReport()
    })

    // /clear — مسح تاريخ المحادثة
    this.commandHandlers.set('clear', async (_, chatId) => {
      this.bridge.clearSession(chatId)
      return '🗑 تم مسح تاريخ المحادثة. ابدأ محادثة جديدة!'
    })

    // /model — تغيير الموديل
    this.commandHandlers.set('model', async (args, chatId) => {
      if (!args.trim()) {
        const info = this.bridge.getSessionInfo(chatId)
        return `🤖 الموديل الحالي: \`${info?.model || 'default'}\`\n\n💡 للتغيير: \`/model anthropic/claude-3.5-sonnet:beta\``
      }
      this.bridge.setModel(chatId, args.trim())
      return `✅ تم تغيير الموديل إلى: \`${args.trim()}\``
    })

    // /agent — تغيير الوكيل
    this.commandHandlers.set('agent', async (args, chatId) => {
      if (!args.trim()) {
        const info = this.bridge.getSessionInfo(chatId)
        return `🧑‍💼 الوكيل الحالي: \`${info?.agent || 'default'}\`\n\n💡 للتغيير: \`/agent chief-of-staff\``
      }
      this.bridge.setAgent(chatId, args.trim())
      return `✅ تم تغيير الوكيل إلى: \`${args.trim()}\``
    })

    // /session — معلومات الجلسة
    this.commandHandlers.set('session', async (_, chatId) => {
      const info = this.bridge.getSessionInfo(chatId)
      if (!info) return '📭 لا توجد جلسة نشطة.'
      return (
        '📋 *معلومات الجلسة*\n\n' +
        `🤖 الموديل: \`${info.model}\`\n` +
        `🧑‍💼 الوكيل: \`${info.agent}\`\n` +
        `💬 الرسائل: ${info.history}\n`
      )
    })
  }

  /** ربط معالج الرسائل العادية بالـ AI */
  private wireAIMessageHandler(): void {
    // الرسائل العادية (بدون /) تُمرر للـ AI مباشرة
    this.messageHandler = async (text: string, chatId: number): Promise<string> => {
      return await this.bridge.handleMessage(chatId, text)
    }
  }

  // ─── Polling Loop ──────────────────────────────────────────────────────

  /** بدء Long Polling */
  async start(): Promise<void> {
    if (this.running) return
    this.running = true

    // التحقق من صلاحية التوكن
    try {
      const me = await this.apiCall('getMe')
      console.log(`🤖 Telegram Bot: @${me.username} (${me.first_name}) — متصل!`)

      if (this.config.allowedChatIds.length === 0) {
        console.warn('⚠️ TELEGRAM_CHAT_ID غير محدد — البوت يقبل رسائل من الجميع!')
      }
    } catch (error: any) {
      console.error(`❌ فشل الاتصال بـ Telegram: ${error.message}`)
      this.running = false
      return
    }

    // حلقة الاستماع
    while (this.running) {
      try {
        const updates: TelegramUpdate[] = await this.apiCall('getUpdates', {
          offset: this.lastUpdateId + 1,
          timeout: 30,
          allowed_updates: ['message', 'callback_query']
        })

        for (const update of updates) {
          this.lastUpdateId = update.update_id
          await this.handleUpdate(update)
        }
      } catch (error: any) {
        if (this.running) {
          console.error(`❌ Telegram polling error: ${error.message}`)
          // انتظار قبل إعادة المحاولة
          await new Promise(resolve => setTimeout(resolve, 5000))
        }
      }
    }
  }

  /** إيقاف البوت */
  stop(): void {
    this.running = false
    console.log('🛑 Telegram Bot stopped')
  }

  // ─── واجهات خارجية ─────────────────────────────────────────────────────

  /** تسجيل معالج للرسائل العادية */
  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler
  }

  /** تسجيل أمر مخصص */
  onCommand(name: string, handler: (args: string, chatId: number) => Promise<string>): void {
    this.commandHandlers.set(name.toLowerCase(), handler)
  }

  /** إرسال إشعار لجميع المستخدمين المسموحين */
  async broadcast(text: string): Promise<void> {
    for (const chatId of this.config.allowedChatIds) {
      try {
        await this.sendMessage(chatId, text)
      } catch (error: any) {
        console.error(`❌ فشل إرسال لـ ${chatId}: ${error.message}`)
      }
    }
  }

  /** هل البوت يعمل؟ */
  isRunning(): boolean {
    return this.running
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 📤 مرسل الإشعارات (يُستخدم من أنظمة أخرى)
// ═══════════════════════════════════════════════════════════════════════════════

let _notifierInstance: TelegramNotifier | null = null

export class TelegramNotifier {
  private bot: TelegramBot | null = null
  private defaultChatId: number | null = null

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_CHAT_ID

    if (token) {
      try {
        this.bot = new TelegramBot(token)
        this.defaultChatId = chatId ? parseInt(chatId) : null
      } catch {
        // تيليجرام غير مُعد
      }
    }
  }

  /** إرسال إشعار */
  async send(message: string, options?: {
    chatId?: number
    priority?: 'low' | 'normal' | 'high' | 'urgent'
  }): Promise<boolean> {
    if (!this.bot || !this.defaultChatId) return false

    const chatId = options?.chatId || this.defaultChatId
    const priorityIcon = {
      low: 'ℹ️',
      normal: '📋',
      high: '⚠️',
      urgent: '🚨'
    }[options?.priority || 'normal']

    try {
      await this.bot.sendMessage(chatId, `${priorityIcon} ${message}`)
      return true
    } catch {
      return false
    }
  }

  /** إرسال تقرير مُنسق */
  async sendReport(title: string, sections: Array<{ heading: string; content: string }>): Promise<boolean> {
    if (!this.bot || !this.defaultChatId) return false

    let report = `📊 *${title}*\n${'─'.repeat(20)}\n\n`
    for (const section of sections) {
      report += `*${section.heading}*\n${section.content}\n\n`
    }

    try {
      await this.bot.sendMessage(this.defaultChatId, report)
      return true
    } catch {
      return false
    }
  }

  /** هل التيليجرام مُعد؟ */
  isConfigured(): boolean {
    return this.bot !== null && this.defaultChatId !== null
  }

  /** الحصول على instance واحد */
  static getInstance(): TelegramNotifier {
    if (!_notifierInstance) {
      _notifierInstance = new TelegramNotifier()
    }
    return _notifierInstance
  }
}
