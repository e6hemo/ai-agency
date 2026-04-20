/**
 * TelegramAIBridge — الجسر بين تيليجرام ومحرك الذكاء الاصطناعي
 * 
 * يدير جلسات محادثة مستقلة لكل chatId
 * يستخدم OpenRouter/Ollama API مع سياق المشروع الكامل
 * يدعم التدفق (streaming) عبر تحديث الرسائل تدريجياً
 */

import * as fs from 'fs'
import * as path from 'path'
import { loadApiKey } from '../utils/secureStorage/apiKeyVault.js'
import {
  getSmartContextForAgent,
  getWakeUpContext
} from '../agency/elite-intelligence.js'
import { searchMemPalace, saveToMemPalace } from '../agency/shared-memory.js'
import { QueryEngine } from '../QueryEngine.js'
import { getTools } from '../tools.js'
import { getEmptyToolPermissionContext } from '../Tool.js'
import { getDefaultAppState } from '../state/AppStateStore.js'
import { createFileStateCacheWithSizeLimit } from '../utils/fileStateCache.js'
import { createAbortController } from '../utils/abortController.js'
import { getMainLoopModel } from '../utils/model/model.js'
import type { Message } from '../types/message.js'
import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import { hasPermissionsToUseTool } from '../utils/permissions/permissions.js'

// ═══════════════════════════════════════════════════════════════════════════════
// 📋 الأنواع
// ═══════════════════════════════════════════════════════════════════════════════

interface ChatSession {
  chatId: number
  history: Message[]
  createdAt: number
  lastActivity: number
  model: string
  agent: string
  engine?: QueryEngine
}

interface BridgeConfig {
  cwd: string
  defaultModel: string
  defaultAgent: string
  maxHistoryLength: number
  streamingInterval: number
}

type StreamCallback = (text: string, done: boolean) => Promise<void>

// ═══════════════════════════════════════════════════════════════════════════════
// 🧠 المحرك
// ═══════════════════════════════════════════════════════════════════════════════

export class TelegramAIBridge {
  private sessions: Map<number, ChatSession> = new Map()
  private config: BridgeConfig

  constructor(cwd: string) {
    this.config = {
      cwd,
      defaultModel: process.env.TELEGRAM_AI_MODEL || 'anthropic/claude-sonnet-4-20250514',
      defaultAgent: process.env.TELEGRAM_AI_AGENT || 'chief-of-staff',
      maxHistoryLength: 20,
      streamingInterval: 800
    }
  }

  // ─── إدارة الجلسات ──────────────────────────────────────────────────

  private getOrCreateSession(chatId: number): ChatSession {
    let session = this.sessions.get(chatId)
    if (!session) {
      session = {
        chatId,
        history: [],
        createdAt: Date.now(),
        lastActivity: Date.now(),
        model: this.config.defaultModel,
        agent: this.config.defaultAgent
      }
      this.sessions.set(chatId, session)
    }
    session.lastActivity = Date.now()
    return session
  }

  clearSession(chatId: number): void {
    this.sessions.delete(chatId)
  }

  setModel(chatId: number, model: string): void {
    const session = this.getOrCreateSession(chatId)
    session.model = model
  }

  setAgent(chatId: number, agent: string): void {
    const session = this.getOrCreateSession(chatId)
    session.agent = agent
  }

  getSessionInfo(chatId: number): { history: number; model: string; agent: string } | null {
    const session = this.sessions.get(chatId)
    if (!session) return null
    return {
      history: session.history.length,
      model: session.model,
      agent: session.agent
    }
  }

  // ─── System Prompt Builder ──────────────────────────────────────────

  private buildSystemPrompt(agent: string): string {
    const cwd = this.config.cwd
    
    // 1. محاولة تحميل ملف الوكيل
    let basePrompt = this.loadAgentPrompt(agent)
    
    // 2. إضافة سياق المشروع
    const projectContext = this.getProjectContext()
    
    // 3. إضافة سياق ذكي من elite-intelligence
    let smartContext = ''
    try {
      smartContext = getSmartContextForAgent(agent) || ''
    } catch { /* ignore */ }

    // 4. إضافة سياق الاستيقاظ (Wake-up Context)
    let wakeUpContext = ''
    try {
      const wakeUp = getWakeUpContext()
      if (wakeUp) {
        wakeUpContext = `\n\n## سياق الحالة الراهنة\n${typeof wakeUp === 'string' ? wakeUp : JSON.stringify(wakeUp, null, 2)}`
      }
    } catch { /* ignore */ }

    // 5. ذاكرة المشروع
    let memoryContext = ''
    try {
      const memories = searchMemPalace('telegram', agent)
      if (memories && memories.length > 0) {
        memoryContext = '\n\n## ملاحظات سابقة من الذاكرة\n'
        memories.slice(0, 3).forEach(m => {
          memoryContext += `- [${m.agent}]: ${m.content.slice(0, 200)}\n`
        })
      }
    } catch { /* ignore */ }

    return [
      basePrompt,
      projectContext ? `\n\n## سياق المشروع\n${projectContext}` : '',
      smartContext ? `\n\n## معلومات إضافية\n${smartContext}` : '',
      wakeUpContext,
      memoryContext,
      '\n\n## تعليمات التواصل عبر تيليجرام',
      '- أجب بإيجاز واحترافية — الرسائل على الهاتف يجب أن تكون مختصرة',
      '- استخدم Markdown المدعوم في تيليجرام: *عريض* و _مائل_ و `كود`',
      '- استخدم الإيموجي بذكاء لتحسين القراءة 📱',
      '- إذا كان الجواب طويلاً، قسّمه لنقاط مختصرة',
      '- أنت تتواصل مع المالك (أحمد) عبر تيليجرام — كن مباشراً ومفيداً'
    ].join('')
  }

  private loadAgentPrompt(agentName: string): string {
    const agentsDir = path.join(this.config.cwd, '.claude', 'agents')
    try {
      const depts = fs.readdirSync(agentsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
      for (const dept of depts) {
        const filePath = path.join(agentsDir, dept.name, `${agentName}.md`)
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, 'utf-8')
          return raw.replace(/^---[\s\S]*?---\n/, '').trim()
        }
      }
    } catch { /* ignore */ }

    return (
      `أنت رئيس الأركان (Chief of Staff) لوكالة OpenClaude AI Agency.\n` +
      `أنت مساعد ذكي وفعّال تدير المشروع وتنسق الأعمال.\n` +
      `تتحدث العربية بطلاقة وتفهم الإنجليزية أيضاً.\n` +
      `أنت تعمل في مشروع: ${path.basename(this.config.cwd)}`
    )
  }

  private getProjectContext(): string {
    const cwd = this.config.cwd
    const parts: string[] = []

    // قراءة CLAUDE.md
    const claudeMd = path.join(cwd, '.claude', 'CLAUDE.md')
    if (fs.existsSync(claudeMd)) {
      try {
        const content = fs.readFileSync(claudeMd, 'utf-8')
        parts.push(`### CLAUDE.md\n${content.slice(0, 500)}`)
      } catch { /* ignore */ }
    }

    // قراءة AGENCY.md
    const agencyMd = path.join(cwd, '.claude', 'AGENCY.md')
    if (fs.existsSync(agencyMd)) {
      try {
        const content = fs.readFileSync(agencyMd, 'utf-8')
        parts.push(`### AGENCY.md\n${content.slice(0, 500)}`)
      } catch { /* ignore */ }
    }

    // قراءة package.json
    const pkgJson = path.join(cwd, 'package.json')
    if (fs.existsSync(pkgJson)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf-8'))
        parts.push(`### المشروع: ${pkg.name || 'unknown'} v${pkg.version || '0.0.0'}`)
      } catch { /* ignore */ }
    }

    return parts.join('\n\n')
  }

  /**
   * استدعاء محرك الذكاء الاصطناعي (QueryEngine) لتنفيذ مهام مستقلة مع دعم الأدوات.
   */
  async handleMessage(
    chatId: number,
    userMessage: string,
    onStream?: StreamCallback
  ): Promise<string> {
    const session = this.getOrCreateSession(chatId)
    session.lastActivity = Date.now()

    if (!session.engine) {
      const toolPermissionContext = getEmptyToolPermissionContext()
      session.engine = new QueryEngine({
        cwd: this.config.cwd,
        tools: getTools(toolPermissionContext),
        commands: [], // Add custom agency commands here if needed
        mcpClients: [],
        agents: [],
        canUseTool: async () => ({ behavior: 'allow', updatedInput: {} }),
        getAppState: () => getDefaultAppState(),
        setAppState: () => {},
        initialMessages: session.history,
        readFileCache: createFileStateCacheWithSizeLimit(100),
        customSystemPrompt: this.buildSystemPrompt(session.agent),
        userSpecifiedModel: session.model,
        verbose: false,
      })
    }

    let fullReply = ''
    let lastUpdateTime = Date.now()
    let isThinking = false

    try {
      const generator = session.engine.submitMessage(userMessage)

      for await (const message of generator) {
        if (message.type === 'assistant') {
          // Process text content
          const textBlocks = message.content.filter(c => c.type === 'text') as { text: string }[]
          if (textBlocks.length > 0) {
            fullReply += textBlocks.map(c => c.text).join('')
            
            if (onStream) {
              const now = Date.now()
              if (now - lastUpdateTime >= this.config.streamingInterval) {
                lastUpdateTime = now
                await onStream(fullReply + (isThinking ? '\n\n⏳ _انتظر، أقوم بتنفيذ أداة..._' : ''), false)
              }
            }
          }

          // Process tool uses
          const toolBlocks = message.content.filter(c => c.type === 'tool_use') as { name: string, input: any }[]
          if (toolBlocks.length > 0) {
            isThinking = true
            for (const tool of toolBlocks) {
               fullReply += `\n\n🔧 _يستخدم الأداة: \`${tool.name}\`..._\n`
               if (onStream) await onStream(fullReply, false)
            }
          }
        } else if (message.type === 'user_replay') {
          // The engine executed a tool and replayed the result as user back into the loop
          isThinking = false
        }
      }

      // تحديث نهائي بالنص الكامل
      if (onStream) await onStream(fullReply, true)

      // حفظ رد المساعد في التاريخ للحفاظ على السياق (مدمج في محرك QueryEngine تلقائياً عبر mutableMessages)
      this.saveToMemory(session.agent, fullReply, session.chatId)
      return fullReply

    } catch (error: any) {
      console.error(error)
      const errMsg = `❌ خطأ داخلي في الوكالة: ${error.message}`
      return errMsg
    }
  }

  // ─── أوامر خاصة ─────────────────────────────────────────────────────

  /**
   * تنفيذ أمر shell وإرجاع النتيجة
   */
  async executeCommand(command: string): Promise<string> {
    return new Promise((resolve) => {
      const { exec } = require('child_process')
      exec(command, { cwd: this.config.cwd, timeout: 30000 }, (error: any, stdout: string, stderr: string) => {
        if (error) {
          resolve(`❌ خطأ:\n\`\`\`\n${error.message}\n\`\`\``)
          return
        }
        const output = (stdout || stderr || '(لا يوجد مخرجات)').trim()
        resolve(`✅ النتيجة:\n\`\`\`\n${output.slice(0, 3000)}\n\`\`\``)
      })
    })
  }

  /**
   * الحصول على تقرير سريع عن حالة المشروع
   */
  async getBriefReport(): Promise<string> {
    const cwd = this.config.cwd
    const parts: string[] = ['📊 *تقرير سريع — OpenClaude Agency*\n']

    // Git status
    try {
      const gitStatus = await this.executeCommand('git status --short')
      parts.push(`📂 *Git Status:*\n${gitStatus}`)
    } catch { /* ignore */ }

    // Memory stats
    try {
      const agencyDir = path.join(cwd, '.claude', 'agency')
      if (fs.existsSync(agencyDir)) {
        const memFiles = this.countFiles(path.join(agencyDir, 'memory'))
        const knFiles = this.countFiles(path.join(agencyDir, 'knowledge'))
        parts.push(`🧠 ذاكرة: ${memFiles} | 📚 معرفة: ${knFiles}`)
      }
    } catch { /* ignore */ }

    // Sessions
    parts.push(`\n💬 *الجلسات النشطة:* ${this.sessions.size}`)

    return parts.join('\n')
  }

  private countFiles(dir: string): number {
    try {
      if (!fs.existsSync(dir)) return 0
      return fs.readdirSync(dir, { recursive: true }).length
    } catch { return 0 }
  }

  private saveToMemory(agent: string, content: string, chatId: number): void {
    try {
      if (content.length > 100) { // فقط الردود المهمة
        saveToMemPalace('telegram-chat', agent, content.slice(0, 500), ['telegram', `chat-${chatId}`])
      }
    } catch { /* ignore - memory is optional */ }
  }
}
