/**
 * OpenClaude Plugin SDK
 * 
 * واجهة تعريف الإضافات — يستخدمها المطورون لبناء إضافات خارجية
 * 
 * مثال استخدام:
 * ```typescript
 * export default definePlugin({
 *   name: 'my-plugin',
 *   version: '1.0.0',
 *   tools: [...],
 *   hooks: { onLoad: async () => {} }
 * })
 * ```
 */

import { z } from 'zod'

// ═══════════════════════════════════════════════════════════════════════════════
// 📦 أنواع الإضافات الأساسية
// ═══════════════════════════════════════════════════════════════════════════════

/** حالة الإضافة */
export type PluginStatus = 'installed' | 'loaded' | 'active' | 'error' | 'disabled'

/** معلومات وصفية عن الإضافة */
export interface PluginMetadata {
  /** اسم فريد للإضافة (مثل: jira-integration) */
  name: string
  /** إصدار الإضافة (مثل: 1.0.0) */
  version: string
  /** وصف مختصر */
  description?: string
  /** اسم المطور */
  author?: string
  /** رابط المستودع */
  repository?: string
  /** الكلمات المفتاحية */
  tags?: string[]
  /** الحد الأدنى لإصدار OpenClaude المطلوب */
  minOpenClaudeVersion?: string
  /** إضافات مطلوبة كتبعيات */
  dependencies?: string[]
}

/** تعريف أداة داخل إضافة */
export interface PluginToolDefinition {
  /** اسم الأداة */
  name: string
  /** وصف ما تفعله الأداة */
  description: string
  /** مخطط المدخلات باستخدام Zod */
  parameters: z.ZodType<any>
  /** دالة التنفيذ */
  execute: (params: any, context: PluginContext) => Promise<PluginToolResult>
  /** هل تحتاج موافقة المستخدم قبل التنفيذ؟ */
  requiresApproval?: boolean
  /** فئة الأداة */
  category?: string
}

/** نتيجة تنفيذ أداة */
export interface PluginToolResult {
  success: boolean
  output: string
  data?: any
  error?: string
}

/** سياق متاح للإضافة أثناء التنفيذ */
export interface PluginContext {
  /** المسار الحالي للمشروع */
  projectRoot: string
  /** معرف الجلسة الحالية */
  sessionId: string
  /** قراءة إعدادات الإضافة */
  getConfig: <T>(key: string, defaultValue?: T) => T
  /** حفظ إعدادات الإضافة */
  setConfig: (key: string, value: any) => Promise<void>
  /** تسجيل رسالة للمستخدم */
  log: (message: string, level?: 'info' | 'warn' | 'error') => void
  /** الوصول لنظام الملفات (محدود بمجلد المشروع) */
  fs: {
    readFile: (path: string) => Promise<string>
    writeFile: (path: string, content: string) => Promise<void>
    exists: (path: string) => Promise<boolean>
    listDir: (path: string) => Promise<string[]>
  }
  /** إرسال إشعار */
  notify: (message: string, options?: NotifyOptions) => Promise<void>
}

export interface NotifyOptions {
  title?: string
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  channel?: 'terminal' | 'telegram' | 'all'
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🪝 Hooks — نقاط الربط في دورة حياة OpenClaude
// ═══════════════════════════════════════════════════════════════════════════════

export interface PluginHooks {
  /** يُنفذ عند تحميل الإضافة */
  onLoad?: (context: PluginContext) => Promise<void>
  /** يُنفذ عند بدء جلسة جديدة */
  onSessionStart?: (context: PluginContext) => Promise<void>
  /** يُنفذ بعد كل رسالة من المستخدم */
  onUserMessage?: (message: string, context: PluginContext) => Promise<void>
  /** يُنفذ بعد كل رد من النموذج */
  onAssistantResponse?: (response: string, context: PluginContext) => Promise<void>
  /** يُنفذ بعد نتيجة أداة */
  onToolResult?: (toolName: string, result: any, context: PluginContext) => Promise<void>
  /** يُنفذ عند انتهاء الجلسة */
  onSessionEnd?: (context: PluginContext) => Promise<void>
  /** يُنفذ عند تفريغ الإضافة */
  onUnload?: (context: PluginContext) => Promise<void>
  /** يُنفذ على فترات منتظمة (كل N دقيقة) */
  onInterval?: (context: PluginContext) => Promise<void>
  /** فترة الـ interval بالدقائق */
  intervalMinutes?: number
}

/** أمر slash مخصص */
export interface PluginCommand {
  /** اسم الأمر (بدون /) */
  name: string
  /** وصف الأمر */
  description: string
  /** الاختصارات */
  aliases?: string[]
  /** دالة التنفيذ */
  execute: (args: string, context: PluginContext) => Promise<string>
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🏗️ تعريف الإضافة الكامل
// ═══════════════════════════════════════════════════════════════════════════════

export interface OpenClaudePlugin extends PluginMetadata {
  /** الأدوات التي توفرها الإضافة */
  tools?: PluginToolDefinition[]
  /** نقاط الربط */
  hooks?: PluginHooks
  /** أوامر slash مخصصة */
  commands?: PluginCommand[]
  /** إعدادات افتراضية */
  defaultConfig?: Record<string, any>
}

/** حالة إضافة محملة في الذاكرة */
export interface LoadedPlugin {
  plugin: OpenClaudePlugin
  status: PluginStatus
  loadedAt: string
  error?: string
  configPath: string
  pluginDir: string
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🎯 دالة المساعدة — بناء الإضافة
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * دالة مساعدة لإنشاء إضافة مع type-safety كامل
 * 
 * @example
 * ```typescript
 * export default definePlugin({
 *   name: 'github-issues',
 *   version: '1.0.0',
 *   description: 'تحويل TODO إلى GitHub Issues',
 *   tools: [{
 *     name: 'create_issue',
 *     description: 'إنشاء issue على GitHub',
 *     parameters: z.object({ title: z.string(), body: z.string() }),
 *     execute: async (params, ctx) => {
 *       // ... إنشاء Issue عبر GitHub API
 *       return { success: true, output: 'تم إنشاء Issue #42' }
 *     }
 *   }],
 *   hooks: {
 *     onLoad: async (ctx) => {
 *       ctx.log('GitHub Issues plugin loaded!')
 *     }
 *   }
 * })
 * ```
 */
export function definePlugin(plugin: OpenClaudePlugin): OpenClaudePlugin {
  // التحقق من الحقول المطلوبة
  if (!plugin.name || !plugin.version) {
    throw new Error('Plugin must have a name and version')
  }

  // التحقق من صحة اسم الإضافة
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(plugin.name)) {
    throw new Error(
      `Invalid plugin name "${plugin.name}". Must be lowercase alphanumeric with hyphens.`
    )
  }

  // التحقق من عدم تكرار أسماء الأدوات
  if (plugin.tools) {
    const toolNames = new Set<string>()
    for (const tool of plugin.tools) {
      const prefixedName = `${plugin.name}:${tool.name}`
      if (toolNames.has(prefixedName)) {
        throw new Error(`Duplicate tool name: ${tool.name}`)
      }
      toolNames.add(prefixedName)
    }
  }

  // التحقق من عدم تكرار أسماء الأوامر
  if (plugin.commands) {
    const cmdNames = new Set<string>()
    for (const cmd of plugin.commands) {
      if (cmdNames.has(cmd.name)) {
        throw new Error(`Duplicate command name: ${cmd.name}`)
      }
      cmdNames.add(cmd.name)
    }
  }

  return plugin
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🔧 أدوات مساعدة لمطوري الإضافات
// ═══════════════════════════════════════════════════════════════════════════════

/** إنشاء نتيجة ناجحة */
export function success(output: string, data?: any): PluginToolResult {
  return { success: true, output, data }
}

/** إنشاء نتيجة فاشلة */
export function failure(error: string): PluginToolResult {
  return { success: false, output: '', error }
}

/** مخطط Zod شائعة الاستخدام */
export const CommonSchemas = {
  /** مسار ملف */
  filePath: z.string().describe('مسار الملف'),
  /** نص حر */
  freeText: z.string().describe('نص حر'),
  /** نعم/لا */
  boolean: z.boolean().describe('نعم أو لا'),
  /** رقم */
  number: z.number().describe('رقم'),
  /** قائمة نصوص */
  stringList: z.array(z.string()).describe('قائمة'),
  /** أولوية */
  priority: z.enum(['low', 'medium', 'high', 'critical']).describe('الأولوية'),
}
