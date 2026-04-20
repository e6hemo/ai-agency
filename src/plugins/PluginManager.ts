/**
 * OpenClaude Plugin Manager
 * 
 * ينسق دورة حياة الإضافات الكاملة:
 * اكتشاف → تحميل → تسجيل → تنشيط → hooks → تفريغ
 */

import { loadAllPlugins, loadPlugin, createPluginContext, installPluginFromPath, uninstallPlugin } from './PluginLoader.js'
import { PluginRegistry } from './PluginRegistry.js'
import type { LoadedPlugin, PluginContext, PluginToolResult, PluginHooks } from './PluginSDK.js'

// ═══════════════════════════════════════════════════════════════════════════════
// 🎛️ مدير الإضافات
// ═══════════════════════════════════════════════════════════════════════════════

class PluginManagerImpl {
  private initialized = false
  private contexts: Map<string, PluginContext> = new Map()
  private intervalTimers: Map<string, NodeJS.Timeout> = new Map()
  private projectRoot: string = process.cwd()
  private sessionId: string = 'default'

  /**
   * تهيئة نظام الإضافات — يُستدعى مرة واحدة عند بدء OpenClaude
   */
  async initialize(projectRoot: string, sessionId: string): Promise<void> {
    if (this.initialized) return

    this.projectRoot = projectRoot
    this.sessionId = sessionId

    console.log('📦 جاري تحميل الإضافات...')

    // اكتشاف وتحميل الإضافات
    const loadedPlugins = await loadAllPlugins()

    for (const loaded of loadedPlugins) {
      // تسجيل في السجل
      PluginRegistry.register(loaded)

      if (loaded.status === 'error') {
        console.error(`❌ فشل تحميل إضافة "${loaded.plugin.name}": ${loaded.error}`)
        continue
      }

      // إنشاء سياق التنفيذ
      const context = createPluginContext(loaded, projectRoot, sessionId)
      this.contexts.set(loaded.plugin.name, context)

      // تنفيذ hook التحميل
      try {
        if (loaded.plugin.hooks?.onLoad) {
          await loaded.plugin.hooks.onLoad(context)
        }
        PluginRegistry.setStatus(loaded.plugin.name, 'active')
        console.log(`✅ إضافة "${loaded.plugin.name}" v${loaded.plugin.version} — نشطة`)
      } catch (error: any) {
        PluginRegistry.setStatus(loaded.plugin.name, 'error', error.message)
        console.error(`❌ خطأ في تنشيط "${loaded.plugin.name}": ${error.message}`)
      }

      // إعداد الـ interval إن وجد
      this.setupInterval(loaded)
    }

    this.initialized = true

    const stats = PluginRegistry.getStats()
    if (stats.totalPlugins > 0) {
      console.log(`📦 تم تحميل ${stats.activePlugins}/${stats.totalPlugins} إضافة | ${stats.totalTools} أداة | ${stats.totalCommands} أمر`)
    }
  }

  /**
   * إعداد interval timer لإضافة
   */
  private setupInterval(loaded: LoadedPlugin): void {
    const hooks = loaded.plugin.hooks
    if (!hooks?.onInterval || !hooks.intervalMinutes) return

    const intervalMs = hooks.intervalMinutes * 60 * 1000
    const context = this.contexts.get(loaded.plugin.name)
    if (!context) return

    const timer = setInterval(async () => {
      try {
        await hooks.onInterval!(context)
      } catch (error: any) {
        console.error(`❌ [${loaded.plugin.name}] interval error: ${error.message}`)
      }
    }, intervalMs)

    this.intervalTimers.set(loaded.plugin.name, timer)
  }

  // ─── تنفيذ Hooks ────────────────────────────────────────────────────────

  /** تنفيذ hook على جميع الإضافات النشطة */
  async fireHook<K extends keyof PluginHooks>(
    hookName: K,
    ...args: any[]
  ): Promise<void> {
    const hooks = PluginRegistry.getHooks(hookName)

    for (const { pluginName, hook } of hooks) {
      const context = this.contexts.get(pluginName)
      if (!context) continue

      try {
        await (hook as Function)(...args, context)
      } catch (error: any) {
        console.error(`❌ [${pluginName}] ${hookName} error: ${error.message}`)
      }
    }
  }

  /** إطلاق حدث بدء جلسة */
  async onSessionStart(): Promise<void> {
    await this.fireHook('onSessionStart')
  }

  /** إطلاق حدث رسالة مستخدم */
  async onUserMessage(message: string): Promise<void> {
    const hooks = PluginRegistry.getHooks('onUserMessage')
    for (const { pluginName, hook } of hooks) {
      const context = this.contexts.get(pluginName)
      if (!context) continue
      try {
        await hook(message, context)
      } catch (error: any) {
        console.error(`❌ [${pluginName}] onUserMessage error: ${error.message}`)
      }
    }
  }

  /** إطلاق حدث رد المساعد */
  async onAssistantResponse(response: string): Promise<void> {
    const hooks = PluginRegistry.getHooks('onAssistantResponse')
    for (const { pluginName, hook } of hooks) {
      const context = this.contexts.get(pluginName)
      if (!context) continue
      try {
        await hook(response, context)
      } catch (error: any) {
        console.error(`❌ [${pluginName}] onAssistantResponse error: ${error.message}`)
      }
    }
  }

  /** إطلاق حدث نتيجة أداة */
  async onToolResult(toolName: string, result: any): Promise<void> {
    const hooks = PluginRegistry.getHooks('onToolResult')
    for (const { pluginName, hook } of hooks) {
      const context = this.contexts.get(pluginName)
      if (!context) continue
      try {
        await hook(toolName, result, context)
      } catch (error: any) {
        console.error(`❌ [${pluginName}] onToolResult error: ${error.message}`)
      }
    }
  }

  // ─── تنفيذ أدوات/أوامر الإضافات ───────────────────────────────────────

  /** تنفيذ أداة من إضافة */
  async executeTool(fullToolName: string, params: any): Promise<PluginToolResult> {
    const entry = PluginRegistry.getTool(fullToolName)
    if (!entry) {
      return { success: false, output: '', error: `Tool not found: ${fullToolName}` }
    }

    const context = this.contexts.get(entry.plugin)
    if (!context) {
      return { success: false, output: '', error: `Plugin context not available: ${entry.plugin}` }
    }

    try {
      // التحقق من المدخلات
      if (entry.tool.parameters) {
        const parsed = entry.tool.parameters.safeParse(params)
        if (!parsed.success) {
          return { success: false, output: '', error: `Invalid parameters: ${parsed.error.message}` }
        }
        params = parsed.data
      }

      return await entry.tool.execute(params, context)
    } catch (error: any) {
      return { success: false, output: '', error: `Tool execution error: ${error.message}` }
    }
  }

  /** تنفيذ أمر من إضافة */
  async executeCommand(commandName: string, args: string): Promise<string> {
    const entry = PluginRegistry.getCommand(commandName)
    if (!entry) {
      return `❌ الأمر غير موجود: ${commandName}`
    }

    const context = this.contexts.get(entry.plugin)
    if (!context) {
      return `❌ سياق الإضافة غير متاح: ${entry.plugin}`
    }

    try {
      return await entry.command.execute(args, context)
    } catch (error: any) {
      return `❌ خطأ في تنفيذ الأمر: ${error.message}`
    }
  }

  // ─── إدارة الإضافات ───────────────────────────────────────────────────

  /** تثبيت إضافة جديدة */
  async install(sourcePath: string): Promise<string> {
    const pluginName = installPluginFromPath(sourcePath)
    const loaded = await loadPlugin(pluginName)

    PluginRegistry.register(loaded)

    if (loaded.status !== 'error') {
      const context = createPluginContext(loaded, this.projectRoot, this.sessionId)
      this.contexts.set(pluginName, context)

      if (loaded.plugin.hooks?.onLoad) {
        await loaded.plugin.hooks.onLoad(context)
      }
      PluginRegistry.setStatus(pluginName, 'active')
      this.setupInterval(loaded)
    }

    return pluginName
  }

  /** حذف إضافة */
  async uninstall(pluginName: string): Promise<boolean> {
    // تنفيذ hook التفريغ
    const loaded = PluginRegistry.getPlugin(pluginName)
    if (loaded?.plugin.hooks?.onUnload) {
      const context = this.contexts.get(pluginName)
      if (context) {
        try {
          await loaded.plugin.hooks.onUnload(context)
        } catch { /* تجاهل */ }
      }
    }

    // إيقاف interval
    const timer = this.intervalTimers.get(pluginName)
    if (timer) {
      clearInterval(timer)
      this.intervalTimers.delete(pluginName)
    }

    // إزالة من السجل والسياقات
    PluginRegistry.unregister(pluginName)
    this.contexts.delete(pluginName)

    // حذف الملفات
    return uninstallPlugin(pluginName)
  }

  /** إعادة تحميل إضافة */
  async reload(pluginName: string): Promise<void> {
    await this.uninstall(pluginName)
    // إعادة التحميل ستحدث عند الاستدعاء التالي لـ initialize
    const loaded = await loadPlugin(pluginName)
    PluginRegistry.register(loaded)

    if (loaded.status !== 'error') {
      const context = createPluginContext(loaded, this.projectRoot, this.sessionId)
      this.contexts.set(pluginName, context)
      if (loaded.plugin.hooks?.onLoad) {
        await loaded.plugin.hooks.onLoad(context)
      }
      PluginRegistry.setStatus(pluginName, 'active')
    }
  }

  // ─── إيقاف النظام ──────────────────────────────────────────────────────

  /** إيقاف جميع الإضافات (عند إغلاق OpenClaude) */
  async shutdown(): Promise<void> {
    // إيقاف جميع intervals
    for (const [name, timer] of this.intervalTimers) {
      clearInterval(timer)
    }
    this.intervalTimers.clear()

    // تنفيذ hooks الإيقاف
    await this.fireHook('onSessionEnd')

    for (const [name, loaded] of PluginRegistry.getAllPlugins().map(p => [p.plugin.name, p] as const)) {
      if (loaded.plugin.hooks?.onUnload) {
        const context = this.contexts.get(name)
        if (context) {
          try {
            await loaded.plugin.hooks.onUnload(context)
          } catch { /* تجاهل */ }
        }
      }
    }

    PluginRegistry.clear()
    this.contexts.clear()
    this.initialized = false
  }

  /** ملخص حالة النظام */
  getSummary(): string {
    return PluginRegistry.getSummary()
  }
}

// تصدير instance واحد (Singleton)
export const PluginManager = new PluginManagerImpl()
