/**
 * Smart Monitor — مراقبة ذكية مستمرة
 * 
 * يراقب المشروع باستمرار ويرسل إشعارات عند حدوث أحداث مهمة:
 * - تغييرات في الملفات المهمة
 * - أخطاء في البناء
 * - PR جديد يحتاج مراجعة
 * - ملفات كبيرة غير عادية
 */

import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import { getOriginalCwd } from '../bootstrap/state.js'
import { TelegramNotifier } from '../telegram/TelegramBot.js'

// ═══════════════════════════════════════════════════════════════════════════════
// 📋 الأنواع
// ═══════════════════════════════════════════════════════════════════════════════

export interface MonitorAlert {
  id: string
  type: 'file_change' | 'build_error' | 'large_file' | 'security' | 'performance' | 'custom'
  severity: 'info' | 'warning' | 'critical'
  title: string
  message: string
  timestamp: string
  acknowledged: boolean
}

interface MonitorConfig {
  /** فترة الفحص بالدقائق */
  intervalMinutes: number
  /** أقصى حجم ملف (بالكيلوبايت) قبل التنبيه */
  maxFileSizeKB: number
  /** أنماط الملفات الحساسة */
  sensitivePatterns: string[]
  /** تفعيل إشعارات تيليجرام */
  enableTelegram: boolean
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🔍 المراقب الذكي
// ═══════════════════════════════════════════════════════════════════════════════

export class SmartMonitor {
  private config: MonitorConfig
  private alerts: MonitorAlert[] = []
  private timer: NodeJS.Timeout | null = null
  private lastCheckSnapshot: Map<string, number> = new Map() // file → mtime
  private running = false

  constructor(config?: Partial<MonitorConfig>) {
    this.config = {
      intervalMinutes: 5,
      maxFileSizeKB: 500,
      sensitivePatterns: ['.env', 'secret', 'password', 'token', 'key', 'credential'],
      enableTelegram: true,
      ...config
    }
  }

  /** بدء المراقبة */
  start(): void {
    if (this.running) return
    this.running = true

    console.log(`🔍 Smart Monitor — نشط (كل ${this.config.intervalMinutes} دقائق)`)

    // فحص أولي
    this.runChecks()

    // فحص دوري
    this.timer = setInterval(
      () => this.runChecks(),
      this.config.intervalMinutes * 60 * 1000
    )
  }

  /** إيقاف المراقبة */
  stop(): void {
    this.running = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    console.log('⏹️ Smart Monitor — متوقف')
  }

  /** تشغيل جميع الفحوصات */
  async runChecks(): Promise<MonitorAlert[]> {
    const newAlerts: MonitorAlert[] = []
    const cwd = getOriginalCwd()

    // 1. فحص ملفات حساسة في Git
    const securityAlerts = this.checkSensitiveFiles(cwd)
    newAlerts.push(...securityAlerts)

    // 2. فحص ملفات كبيرة
    const sizeAlerts = this.checkLargeFiles(cwd)
    newAlerts.push(...sizeAlerts)

    // 3. فحص تغييرات غير محفوظة طويلة
    const staleAlerts = this.checkStaleChanges(cwd)
    newAlerts.push(...staleAlerts)

    // 4. فحص فروع قديمة
    const branchAlerts = this.checkStaleBranches(cwd)
    newAlerts.push(...branchAlerts)

    // تخزين وإرسال التنبيهات الجديدة
    for (const alert of newAlerts) {
      // تجنب التكرار
      if (!this.alerts.find(a => a.title === alert.title && !a.acknowledged)) {
        this.alerts.push(alert)
        await this.deliverAlert(alert)
      }
    }

    // تنظيف التنبيهات القديمة (أكثر من 24 ساعة)
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000
    this.alerts = this.alerts.filter(a => 
      new Date(a.timestamp).getTime() > dayAgo || !a.acknowledged
    )

    return newAlerts
  }

  // ─── فحوصات محددة ────────────────────────────────────────────────────

  private checkSensitiveFiles(cwd: string): MonitorAlert[] {
    const alerts: MonitorAlert[] = []

    try {
      // فحص إذا كانت ملفات .env مُتتبعة في Git
      const tracked = safeExec('git ls-files', cwd)
      for (const pattern of this.config.sensitivePatterns) {
        const matches = tracked.split('\n').filter(f => 
          f.toLowerCase().includes(pattern) && !f.includes('.example') && !f.includes('.sample')
        )

        for (const file of matches) {
          if (file.trim()) {
            alerts.push({
              id: `security-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: 'security',
              severity: 'critical',
              title: `⚠️ ملف حساس مُتتبع في Git`,
              message: `الملف "${file.trim()}" قد يحتوي على بيانات حساسة وهو مُتتبع في Git.\nأضفه لـ .gitignore فوراً!`,
              timestamp: new Date().toISOString(),
              acknowledged: false
            })
          }
        }
      }
    } catch { /* Git غير متاح */ }

    return alerts
  }

  private checkLargeFiles(cwd: string): MonitorAlert[] {
    const alerts: MonitorAlert[] = []

    try {
      const tracked = safeExec('git ls-files', cwd)
      const files = tracked.split('\n').filter(f => f.trim())

      for (const file of files.slice(0, 500)) { // حد 500 ملف
        try {
          const fullPath = path.join(cwd, file.trim())
          const stat = fs.statSync(fullPath)
          const sizeKB = stat.size / 1024

          if (sizeKB > this.config.maxFileSizeKB) {
            alerts.push({
              id: `large-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: 'large_file',
              severity: sizeKB > 5000 ? 'warning' : 'info',
              title: `📦 ملف كبير: ${file.trim()}`,
              message: `حجم الملف ${Math.round(sizeKB)} KB — تأكد أنه ضروري في المستودع`,
              timestamp: new Date().toISOString(),
              acknowledged: false
            })
          }
        } catch { /* تجاهل */ }
      }
    } catch { /* تجاهل */ }

    return alerts
  }

  private checkStaleChanges(cwd: string): MonitorAlert[] {
    const alerts: MonitorAlert[] = []

    try {
      const status = safeExec('git status --short', cwd)
      const changes = status.split('\n').filter(l => l.trim())

      if (changes.length > 20) {
        alerts.push({
          id: `stale-${Date.now()}`,
          type: 'file_change',
          severity: 'warning',
          title: '📝 تغييرات كثيرة غير محفوظة',
          message: `${changes.length} ملف معدّل بدون commit.\nاحفظ تقدمك لتجنب فقدان العمل!`,
          timestamp: new Date().toISOString(),
          acknowledged: false
        })
      }
    } catch { /* تجاهل */ }

    return alerts
  }

  private checkStaleBranches(cwd: string): MonitorAlert[] {
    const alerts: MonitorAlert[] = []

    try {
      const branches = safeExec(
        'git for-each-ref --sort=-committerdate --format="%(refname:short) %(committerdate:relative)" refs/heads/ 2>/dev/null',
        cwd
      )
      
      const stale = branches.split('\n').filter(l => {
        return l.includes('months ago') || l.includes('year')
      })

      if (stale.length > 3) {
        alerts.push({
          id: `branches-${Date.now()}`,
          type: 'performance',
          severity: 'info',
          title: '🌿 فروع قديمة',
          message: `${stale.length} فرع لم يُستخدم منذ أشهر.\nاحذف الفروع غير المستخدمة لتنظيف المستودع.`,
          timestamp: new Date().toISOString(),
          acknowledged: false
        })
      }
    } catch { /* تجاهل */ }

    return alerts
  }

  // ─── إرسال التنبيهات ──────────────────────────────────────────────────

  private async deliverAlert(alert: MonitorAlert): Promise<void> {
    const icon = alert.severity === 'critical' ? '🚨' : 
                 alert.severity === 'warning' ? '⚠️' : 'ℹ️'

    // طباعة في Terminal
    console.log(`\n${icon} [SmartMonitor] ${alert.title}`)
    console.log(`   ${alert.message}\n`)

    // إرسال عبر Telegram
    if (this.config.enableTelegram) {
      const notifier = TelegramNotifier.getInstance()
      if (notifier.isConfigured()) {
        await notifier.send(
          `${alert.title}\n\n${alert.message}`,
          { priority: alert.severity === 'critical' ? 'urgent' : 'normal' }
        )
      }
    }
  }

  // ─── واجهة الاستعلام ──────────────────────────────────────────────────

  /** جميع التنبيهات النشطة */
  getAlerts(unacknowledgedOnly = false): MonitorAlert[] {
    if (unacknowledgedOnly) {
      return this.alerts.filter(a => !a.acknowledged)
    }
    return [...this.alerts]
  }

  /** الاعتراف بتنبيه */
  acknowledge(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId)
    if (alert) {
      alert.acknowledged = true
      return true
    }
    return false
  }

  /** ملخص سريع */
  getSummary(): string {
    const unack = this.alerts.filter(a => !a.acknowledged)
    const critical = unack.filter(a => a.severity === 'critical').length
    const warnings = unack.filter(a => a.severity === 'warning').length
    const info = unack.filter(a => a.severity === 'info').length

    if (unack.length === 0) {
      return '✅ لا توجد تنبيهات — كل شيء على ما يرام!'
    }

    return `🔍 تنبيهات: ${critical > 0 ? `🚨 ${critical} حرجة` : ''} ${warnings > 0 ? `⚠️ ${warnings} تحذيرات` : ''} ${info > 0 ? `ℹ️ ${info} معلومات` : ''}`.trim()
  }
}

// أداة مساعدة
function safeExec(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] })
  } catch {
    return ''
  }
}
