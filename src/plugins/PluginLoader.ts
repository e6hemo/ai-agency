/**
 * OpenClaude Plugin Loader
 * 
 * يحمل الإضافات من مجلد ~/.openclaude/plugins/
 * يتحقق من صحتها ويعزلها في بيئة آمنة
 */

import * as fs from 'fs'
import * as path from 'path'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import type { 
  OpenClaudePlugin, 
  LoadedPlugin, 
  PluginContext,
  PluginToolResult,
  PluginStatus
} from './PluginSDK.js'

// ═══════════════════════════════════════════════════════════════════════════════
// 📂 مسارات الإضافات
// ═══════════════════════════════════════════════════════════════════════════════

function getPluginsDir(): string {
  const configDir = getClaudeConfigHomeDir()
  const pluginsDir = path.join(configDir, 'plugins')
  if (!fs.existsSync(pluginsDir)) {
    fs.mkdirSync(pluginsDir, { recursive: true })
  }
  return pluginsDir
}

function getPluginConfigDir(pluginName: string): string {
  const configDir = getClaudeConfigHomeDir()
  const dir = path.join(configDir, 'plugin-data', pluginName)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🔍 اكتشاف وتحميل الإضافات
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * يبحث عن جميع الإضافات المثبتة في مجلد الإضافات
 */
export function discoverPlugins(): string[] {
  const pluginsDir = getPluginsDir()
  
  try {
    const entries = fs.readdirSync(pluginsDir, { withFileTypes: true })
    return entries
      .filter(entry => entry.isDirectory())
      .filter(entry => {
        // تحقق من وجود ملف index.ts أو index.js أو plugin.json
        const indexTs = path.join(pluginsDir, entry.name, 'index.ts')
        const indexJs = path.join(pluginsDir, entry.name, 'index.js')
        const pluginJson = path.join(pluginsDir, entry.name, 'plugin.json')
        return fs.existsSync(indexTs) || fs.existsSync(indexJs) || fs.existsSync(pluginJson)
      })
      .map(entry => entry.name)
  } catch {
    return []
  }
}

/**
 * يحمل إضافة واحدة من مسارها
 */
export async function loadPlugin(pluginName: string): Promise<LoadedPlugin> {
  const pluginsDir = getPluginsDir()
  const pluginDir = path.join(pluginsDir, pluginName)
  const configPath = path.join(getPluginConfigDir(pluginName), 'config.json')

  try {
    // البحث عن ملف الإدخال
    let entryFile: string | null = null
    const candidates = ['index.js', 'index.ts', 'plugin.json']
    
    for (const candidate of candidates) {
      const fullPath = path.join(pluginDir, candidate)
      if (fs.existsSync(fullPath)) {
        entryFile = fullPath
        break
      }
    }

    if (!entryFile) {
      throw new Error(`No entry file found in plugin directory: ${pluginDir}`)
    }

    let plugin: OpenClaudePlugin

    if (entryFile.endsWith('.json')) {
      // تحميل من ملف JSON (إضافات بسيطة بدون كود)
      const raw = fs.readFileSync(entryFile, 'utf-8')
      plugin = JSON.parse(raw) as OpenClaudePlugin
    } else {
      // تحميل من ملف JS/TS (إضافات ديناميكية)
      const module = await import(`file://${entryFile}`)
      plugin = module.default || module
    }

    // التحقق من صحة الإضافة
    validatePlugin(plugin)

    return {
      plugin,
      status: 'loaded',
      loadedAt: new Date().toISOString(),
      configPath,
      pluginDir
    }
  } catch (error: any) {
    return {
      plugin: {
        name: pluginName,
        version: '0.0.0',
        description: `Failed to load: ${error.message}`
      },
      status: 'error',
      loadedAt: new Date().toISOString(),
      error: error.message,
      configPath,
      pluginDir
    }
  }
}

/**
 * يحمل جميع الإضافات المكتشفة
 */
export async function loadAllPlugins(): Promise<LoadedPlugin[]> {
  const pluginNames = discoverPlugins()
  const loaded: LoadedPlugin[] = []

  for (const name of pluginNames) {
    const plugin = await loadPlugin(name)
    loaded.push(plugin)
  }

  return loaded
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✅ التحقق من صحة الإضافة
// ═══════════════════════════════════════════════════════════════════════════════

function validatePlugin(plugin: any): plugin is OpenClaudePlugin {
  if (!plugin || typeof plugin !== 'object') {
    throw new Error('Plugin must be an object')
  }

  if (!plugin.name || typeof plugin.name !== 'string') {
    throw new Error('Plugin must have a valid name (string)')
  }

  if (!plugin.version || typeof plugin.version !== 'string') {
    throw new Error('Plugin must have a valid version (string)')
  }

  // التحقق من أسماء الأدوات
  if (plugin.tools && Array.isArray(plugin.tools)) {
    for (const tool of plugin.tools) {
      if (!tool.name || !tool.description || !tool.execute) {
        throw new Error(
          `Tool "${tool.name || 'unnamed'}" must have name, description, and execute function`
        )
      }
    }
  }

  // التحقق من الأوامر
  if (plugin.commands && Array.isArray(plugin.commands)) {
    for (const cmd of plugin.commands) {
      if (!cmd.name || !cmd.execute) {
        throw new Error(
          `Command "${cmd.name || 'unnamed'}" must have name and execute function`
        )
      }
    }
  }

  return true
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🏗️ بناء سياق التنفيذ للإضافة
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ينشئ سياق تنفيذ محدود الصلاحيات لإضافة
 */
export function createPluginContext(
  loadedPlugin: LoadedPlugin,
  projectRoot: string,
  sessionId: string
): PluginContext {
  const configPath = loadedPlugin.configPath

  // تحميل الإعدادات
  let config: Record<string, any> = {}
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    }
  } catch { /* تجاهل أخطاء التحميل */ }

  return {
    projectRoot,
    sessionId,

    getConfig: <T>(key: string, defaultValue?: T): T => {
      return (config[key] ?? defaultValue) as T
    },

    setConfig: async (key: string, value: any): Promise<void> => {
      config[key] = value
      const dir = path.dirname(configPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    },

    log: (message: string, level: 'info' | 'warn' | 'error' = 'info'): void => {
      const prefix = `[plugin:${loadedPlugin.plugin.name}]`
      switch (level) {
        case 'warn':
          console.warn(`⚠️ ${prefix} ${message}`)
          break
        case 'error':
          console.error(`❌ ${prefix} ${message}`)
          break
        default:
          console.log(`📦 ${prefix} ${message}`)
      }
    },

    fs: {
      readFile: async (filePath: string): Promise<string> => {
        const resolved = path.resolve(projectRoot, filePath)
        // أمان: تأكد أن المسار داخل المشروع
        if (!resolved.startsWith(projectRoot)) {
          throw new Error('Access denied: path outside project root')
        }
        return fs.readFileSync(resolved, 'utf-8')
      },

      writeFile: async (filePath: string, content: string): Promise<void> => {
        const resolved = path.resolve(projectRoot, filePath)
        if (!resolved.startsWith(projectRoot)) {
          throw new Error('Access denied: path outside project root')
        }
        const dir = path.dirname(resolved)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(resolved, content, 'utf-8')
      },

      exists: async (filePath: string): Promise<boolean> => {
        const resolved = path.resolve(projectRoot, filePath)
        if (!resolved.startsWith(projectRoot)) return false
        return fs.existsSync(resolved)
      },

      listDir: async (dirPath: string): Promise<string[]> => {
        const resolved = path.resolve(projectRoot, dirPath)
        if (!resolved.startsWith(projectRoot)) {
          throw new Error('Access denied: path outside project root')
        }
        return fs.readdirSync(resolved)
      }
    },

    notify: async (message: string, options?: any): Promise<void> => {
      // سيتم ربطه بنظام الإشعارات (Telegram, Terminal, etc)
      console.log(`🔔 [${loadedPlugin.plugin.name}] ${options?.title || 'Notification'}: ${message}`)
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 📦 تثبيت إضافة جديدة (من ملف أو مجلد)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * تثبيت إضافة من مسار محلي (نسخ المجلد)
 */
export function installPluginFromPath(sourcePath: string): string {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Plugin source not found: ${sourcePath}`)
  }

  // قراءة اسم الإضافة
  let pluginName: string

  const indexJs = path.join(sourcePath, 'index.js')
  const pluginJson = path.join(sourcePath, 'plugin.json')

  if (fs.existsSync(pluginJson)) {
    const data = JSON.parse(fs.readFileSync(pluginJson, 'utf-8'))
    pluginName = data.name
  } else if (fs.existsSync(indexJs)) {
    pluginName = path.basename(sourcePath)
  } else {
    throw new Error('Invalid plugin: no index.js or plugin.json found')
  }

  // نسخ المجلد
  const targetDir = path.join(getPluginsDir(), pluginName)
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true })
  }

  copyDirSync(sourcePath, targetDir)
  return pluginName
}

/**
 * حذف إضافة مثبتة
 */
export function uninstallPlugin(pluginName: string): boolean {
  const pluginDir = path.join(getPluginsDir(), pluginName)
  if (!fs.existsSync(pluginDir)) return false

  fs.rmSync(pluginDir, { recursive: true })

  // حذف بيانات الإعدادات أيضاً
  const configDir = path.join(getClaudeConfigHomeDir(), 'plugin-data', pluginName)
  if (fs.existsSync(configDir)) {
    fs.rmSync(configDir, { recursive: true })
  }

  return true
}

// أداة مساعدة لنسخ المجلدات
function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isDirectory()) {
      // تجنب نسخ node_modules
      if (entry.name === 'node_modules') continue
      copyDirSync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}
