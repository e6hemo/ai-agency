/**
 * نقطة الدخول الموحدة — تصدير جميع الأنظمة الجديدة
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 📦 نظام الإضافات
// ═══════════════════════════════════════════════════════════════════════════════
export {
  definePlugin,
  success,
  failure,
  CommonSchemas,
  type OpenClaudePlugin,
  type PluginToolDefinition,
  type PluginToolResult,
  type PluginContext,
  type PluginCommand,
  type PluginHooks,
  type PluginMetadata,
  type LoadedPlugin
} from './plugins/PluginSDK.js'

export { PluginRegistry } from './plugins/PluginRegistry.js'
export { PluginManager } from './plugins/PluginManager.js'
export {
  discoverPlugins,
  loadPlugin,
  loadAllPlugins,
  createPluginContext,
  installPluginFromPath,
  uninstallPlugin
} from './plugins/PluginLoader.js'

// ═══════════════════════════════════════════════════════════════════════════════
// 🤖 بوت تيليجرام
// ═══════════════════════════════════════════════════════════════════════════════
export { TelegramBot, TelegramNotifier } from './telegram/TelegramBot.js'

// ═══════════════════════════════════════════════════════════════════════════════
// 📅 رئيس الأركان الرقمي
// ═══════════════════════════════════════════════════════════════════════════════
export {
  generateMorningBrief,
  generateEveningWrap,
  generateWeeklyReview,
  ChiefScheduler,
  getChiefOfStaff,
  type DailyBrief,
  type WeeklyReport,
  type BriefSection
} from './chief-of-staff/ChiefOfStaff.js'

export { SmartMonitor, type MonitorAlert } from './chief-of-staff/SmartMonitor.js'
