/**
 * OpenClaude Plugin Registry
 * 
 * سجل مركزي لجميع الإضافات المحملة — يوفر واجهة موحدة
 * للبحث عن الأدوات والأوامر والـ hooks
 */

import type {
  OpenClaudePlugin,
  LoadedPlugin,
  PluginToolDefinition,
  PluginCommand,
  PluginHooks,
  PluginStatus
} from './PluginSDK.js'

// ═══════════════════════════════════════════════════════════════════════════════
// 📋 السجل المركزي
// ═══════════════════════════════════════════════════════════════════════════════

class PluginRegistryImpl {
  private plugins: Map<string, LoadedPlugin> = new Map()
  private toolIndex: Map<string, { plugin: string; tool: PluginToolDefinition }> = new Map()
  private commandIndex: Map<string, { plugin: string; command: PluginCommand }> = new Map()

  /**
   * تسجيل إضافة محملة في السجل
   */
  register(loaded: LoadedPlugin): void {
    const name = loaded.plugin.name

    // إزالة التسجيل القديم إن وجد
    if (this.plugins.has(name)) {
      this.unregister(name)
    }

    this.plugins.set(name, loaded)

    // فهرسة الأدوات
    if (loaded.plugin.tools) {
      for (const tool of loaded.plugin.tools) {
        // اسم الأداة يصبح: plugin-name:tool-name
        const fullName = `${name}:${tool.name}`
        this.toolIndex.set(fullName, { plugin: name, tool })
      }
    }

    // فهرسة الأوامر
    if (loaded.plugin.commands) {
      for (const cmd of loaded.plugin.commands) {
        // اسم الأمر يصبح: plugin-name:command-name
        const fullName = `${name}:${cmd.name}`
        this.commandIndex.set(fullName, { plugin: name, command: cmd })

        // أيضاً تسجيل بدون prefix إن لم يتعارض
        if (!this.commandIndex.has(cmd.name)) {
          this.commandIndex.set(cmd.name, { plugin: name, command: cmd })
        }

        // تسجيل الاختصارات
        if (cmd.aliases) {
          for (const alias of cmd.aliases) {
            if (!this.commandIndex.has(alias)) {
              this.commandIndex.set(alias, { plugin: name, command: cmd })
            }
          }
        }
      }
    }
  }

  /**
   * إزالة إضافة من السجل
   */
  unregister(name: string): void {
    const loaded = this.plugins.get(name)
    if (!loaded) return

    // إزالة أدوات الإضافة
    if (loaded.plugin.tools) {
      for (const tool of loaded.plugin.tools) {
        this.toolIndex.delete(`${name}:${tool.name}`)
      }
    }

    // إزالة أوامر الإضافة
    if (loaded.plugin.commands) {
      for (const cmd of loaded.plugin.commands) {
        this.commandIndex.delete(`${name}:${cmd.name}`)
        // إزالة الاسم القصير فقط إذا كان يشير لهذه الإضافة
        const short = this.commandIndex.get(cmd.name)
        if (short && short.plugin === name) {
          this.commandIndex.delete(cmd.name)
        }
      }
    }

    this.plugins.delete(name)
  }

  // ─── استعلامات ──────────────────────────────────────────────────────────

  /** الحصول على إضافة بالاسم */
  getPlugin(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name)
  }

  /** قائمة بجميع الإضافات */
  getAllPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values())
  }

  /** الإضافات النشطة فقط */
  getActivePlugins(): LoadedPlugin[] {
    return this.getAllPlugins().filter(p => p.status === 'active' || p.status === 'loaded')
  }

  /** البحث عن أداة بالاسم */
  getTool(name: string): { plugin: string; tool: PluginToolDefinition } | undefined {
    return this.toolIndex.get(name)
  }

  /** جميع الأدوات من جميع الإضافات */
  getAllTools(): Array<{ pluginName: string; tool: PluginToolDefinition }> {
    return Array.from(this.toolIndex.entries()).map(([_, value]) => ({
      pluginName: value.plugin,
      tool: value.tool
    }))
  }

  /** البحث عن أمر بالاسم */
  getCommand(name: string): { plugin: string; command: PluginCommand } | undefined {
    return this.commandIndex.get(name)
  }

  /** جميع الأوامر */
  getAllCommands(): Array<{ pluginName: string; command: PluginCommand }> {
    const seen = new Set<string>()
    const result: Array<{ pluginName: string; command: PluginCommand }> = []

    for (const [key, value] of this.commandIndex.entries()) {
      // تجنب التكرار (الاسم الكامل والقصير)
      const uniqueKey = `${value.plugin}:${value.command.name}`
      if (seen.has(uniqueKey)) continue
      seen.add(uniqueKey)
      result.push({ pluginName: value.plugin, command: value.command })
    }

    return result
  }

  /** جمع جميع hooks من نوع معين */
  getHooks<K extends keyof PluginHooks>(hookName: K): Array<{
    pluginName: string
    hook: NonNullable<PluginHooks[K]>
  }> {
    const result: Array<{ pluginName: string; hook: NonNullable<PluginHooks[K]> }> = []

    for (const [name, loaded] of this.plugins) {
      if (loaded.status !== 'active' && loaded.status !== 'loaded') continue
      const hook = loaded.plugin.hooks?.[hookName]
      if (hook) {
        result.push({ pluginName: name, hook: hook as NonNullable<PluginHooks[K]> })
      }
    }

    return result
  }

  /** عدد الإضافات */
  get size(): number {
    return this.plugins.size
  }

  /** تحديث حالة إضافة */
  setStatus(name: string, status: PluginStatus, error?: string): void {
    const loaded = this.plugins.get(name)
    if (loaded) {
      loaded.status = status
      if (error) loaded.error = error
    }
  }

  /** مسح الكل */
  clear(): void {
    this.plugins.clear()
    this.toolIndex.clear()
    this.commandIndex.clear()
  }

  // ─── إحصائيات ──────────────────────────────────────────────────────────

  /** إحصائيات السجل */
  getStats(): {
    totalPlugins: number
    activePlugins: number
    errorPlugins: number
    totalTools: number
    totalCommands: number
  } {
    const all = this.getAllPlugins()
    return {
      totalPlugins: all.length,
      activePlugins: all.filter(p => p.status === 'active' || p.status === 'loaded').length,
      errorPlugins: all.filter(p => p.status === 'error').length,
      totalTools: this.toolIndex.size,
      totalCommands: this.getAllCommands().length
    }
  }

  /** ملخص مقروء */
  getSummary(): string {
    const stats = this.getStats()
    let summary = `\n📦 **نظام الإضافات**\n`
    summary += `> إضافات: ${stats.totalPlugins} (${stats.activePlugins} نشطة)`
    if (stats.errorPlugins > 0) {
      summary += ` | ❌ ${stats.errorPlugins} بها أخطاء`
    }
    summary += `\n> أدوات: ${stats.totalTools} | أوامر: ${stats.totalCommands}\n`

    for (const loaded of this.getAllPlugins()) {
      const icon = loaded.status === 'error' ? '❌' :
                   loaded.status === 'disabled' ? '⏸️' :
                   loaded.status === 'active' ? '✅' : '📦'
      summary += `> ${icon} ${loaded.plugin.name} v${loaded.plugin.version}`
      if (loaded.plugin.description) {
        summary += ` — ${loaded.plugin.description}`
      }
      if (loaded.error) {
        summary += ` (خطأ: ${loaded.error})`
      }
      summary += '\n'
    }

    return summary
  }
}

// تصدير instance واحد (Singleton)
export const PluginRegistry = new PluginRegistryImpl()
