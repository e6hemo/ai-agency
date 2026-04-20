/**
 * رئيس الأركان الرقمي — Digital Chief of Staff
 * 
 * نظام ذكي يدير يومك تلقائياً:
 * - تقرير صباحي (Morning Brief)
 * - مراقبة ذكية طوال اليوم
 * - ملخص مسائي (Evening Wrap)
 * - مراجعة أسبوعية (Weekly Review)
 */

import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import { getOriginalCwd } from '../bootstrap/state.js'
import { TelegramNotifier } from '../telegram/TelegramBot.js'

// ═══════════════════════════════════════════════════════════════════════════════
// 📋 الأنواع
// ═══════════════════════════════════════════════════════════════════════════════

export interface BriefSection {
  heading: string
  icon: string
  content: string
  priority: 'low' | 'normal' | 'high' | 'critical'
}

export interface DailyBrief {
  type: 'morning' | 'evening'
  timestamp: string
  greeting: string
  sections: BriefSection[]
  actionItems: string[]
  summary: string
}

export interface WeeklyReport {
  timestamp: string
  weekNumber: number
  sections: BriefSection[]
  stats: WeeklyStats
  improvements: string[]
  nextWeekPlan: string[]
}

export interface WeeklyStats {
  totalCommits: number
  filesChanged: number
  sessionsCount: number
  topFiles: string[]
  productivityScore: number
}

interface ChiefConfig {
  morningBriefTime: string   // "09:00"
  eveningWrapTime: string    // "18:00"
  weeklyReviewDay: number    // 5 = Friday
  timezone: string
  enableTelegram: boolean
  enableTerminal: boolean
  language: 'ar' | 'en'
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🌅 تقرير الصباح
// ═══════════════════════════════════════════════════════════════════════════════

export function generateMorningBrief(): DailyBrief {
  const cwd = getOriginalCwd()
  const now = new Date()
  const hour = now.getHours()
  
  const greeting = hour < 12 
    ? '🌅 صباح الخير! إليك ملخص يومك:' 
    : '👋 مرحباً! إليك آخر المستجدات:'

  const sections: BriefSection[] = []
  const actionItems: string[] = []

  // 1. حالة Git
  try {
    const gitStatus = safeExec('git status --short', cwd)
    const uncommitted = gitStatus.split('\n').filter(l => l.trim()).length
    
    if (uncommitted > 0) {
      sections.push({
        heading: 'تغييرات غير محفوظة',
        icon: '📝',
        content: `${uncommitted} ملف معدّل لم يُحفظ بعد`,
        priority: uncommitted > 10 ? 'high' : 'normal'
      })
      actionItems.push(`💾 احفظ ${uncommitted} ملف معدّل (git commit)`)
    }

    // آخر commit
    const lastCommit = safeExec('git log -1 --format="%ar — %s"', cwd)
    if (lastCommit) {
      sections.push({
        heading: 'آخر عملية حفظ',
        icon: '🔄',
        content: lastCommit.trim(),
        priority: 'low'
      })
    }

    // الفروع النشطة
    const currentBranch = safeExec('git branch --show-current', cwd)
    if (currentBranch.trim()) {
      sections.push({
        heading: 'الفرع الحالي',
        icon: '🌿',
        content: currentBranch.trim(),
        priority: 'low'
      })
    }
  } catch { /* Git غير متوفر */ }

  // 2. المهام المفتوحة من Agency
  const agencyDir = path.join(cwd, '.claude', 'agency', 'projects')
  if (fs.existsSync(agencyDir)) {
    try {
      const projects = fs.readdirSync(agencyDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
      
      let pendingTasks = 0
      let inProgressTasks = 0
      const projectNames: string[] = []

      for (const proj of projects) {
        const statePath = path.join(agencyDir, proj.name, 'state.json')
        if (!fs.existsSync(statePath)) continue
        
        try {
          const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
          if (state.status === 'pending') pendingTasks++
          if (state.status === 'in-progress') {
            inProgressTasks++
            projectNames.push(proj.name)
          }
        } catch { /* تجاهل */ }
      }

      if (pendingTasks + inProgressTasks > 0) {
        sections.push({
          heading: 'مهام الوكالة',
          icon: '🤖',
          content: `🔄 قيد التنفيذ: ${inProgressTasks} | ⏳ بانتظار: ${pendingTasks}`,
          priority: inProgressTasks > 0 ? 'high' : 'normal'
        })

        if (projectNames.length > 0) {
          actionItems.push(`📋 تابع المشاريع النشطة: ${projectNames.join(', ')}`)
        }
      }
    } catch { /* تجاهل */ }
  }

  // 3. ملفات TODO
  try {
    const todoFiles = safeExec('git grep -l "TODO\\|FIXME\\|HACK\\|XXX" -- "*.ts" "*.js" 2>/dev/null || true', cwd)
    const todoCount = todoFiles.split('\n').filter(l => l.trim()).length

    if (todoCount > 0) {
      sections.push({
        heading: 'ملاحظات TODO في الكود',
        icon: '📌',
        content: `${todoCount} ملف يحتوي على TODO/FIXME`,
        priority: todoCount > 20 ? 'high' : 'normal'
      })
    }
  } catch { /* تجاهل */ }

  // 4. حجم المشروع
  try {
    const fileCount = safeExec('git ls-files | wc -l', cwd).trim()
    sections.push({
      heading: 'حجم المشروع',
      icon: '📊',
      content: `${fileCount} ملف مُتتبع`,
      priority: 'low'
    })
  } catch { /* تجاهل */ }

  // 5. اقتراح أولويات اليوم
  if (actionItems.length === 0) {
    actionItems.push('✅ لا توجد مهام عاجلة — يوم ممتاز للتطوير!')
  }

  const summary = buildBriefSummary('morning', sections, actionItems)

  return {
    type: 'morning',
    timestamp: now.toISOString(),
    greeting,
    sections,
    actionItems,
    summary
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🌙 ملخص المساء
// ═══════════════════════════════════════════════════════════════════════════════

export function generateEveningWrap(): DailyBrief {
  const cwd = getOriginalCwd()
  const now = new Date()
  const sections: BriefSection[] = []
  const actionItems: string[] = []

  // 1. ما تم إنجازه اليوم (commits اليوم)
  try {
    const today = now.toISOString().split('T')[0]
    const todayCommits = safeExec(
      `git log --since="${today}" --format="%h %s" --no-merges`,
      cwd
    )
    const commits = todayCommits.split('\n').filter(l => l.trim())

    if (commits.length > 0) {
      sections.push({
        heading: `إنجازات اليوم (${commits.length} commit)`,
        icon: '✅',
        content: commits.slice(0, 5).map(c => `• ${c}`).join('\n'),
        priority: 'normal'
      })
    } else {
      sections.push({
        heading: 'لا توجد commits اليوم',
        icon: '⚠️',
        content: 'لم يتم حفظ أي تغييرات اليوم',
        priority: 'high'
      })
    }
  } catch { /* تجاهل */ }

  // 2. الملفات الأكثر تعديلاً اليوم
  try {
    const today = now.toISOString().split('T')[0]
    const changedFiles = safeExec(
      `git log --since="${today}" --name-only --format="" --no-merges | sort | uniq -c | sort -rn | head -5`,
      cwd
    )
    if (changedFiles.trim()) {
      sections.push({
        heading: 'الملفات الأكثر تعديلاً',
        icon: '📁',
        content: changedFiles.trim(),
        priority: 'low'
      })
    }
  } catch { /* تجاهل */ }

  // 3. التغييرات غير المحفوظة
  try {
    const status = safeExec('git status --short', cwd)
    const unsaved = status.split('\n').filter(l => l.trim()).length
    
    if (unsaved > 0) {
      sections.push({
        heading: 'تغييرات غير محفوظة',
        icon: '💾',
        content: `${unsaved} ملف لم يُحفظ — تأكد من حفظها قبل الانصراف`,
        priority: 'high'
      })
      actionItems.push(`💾 احفظ ${unsaved} ملف قبل الانتهاء`)
    }
  } catch { /* تجاهل */ }

  // 4. اقتراحات للغد
  actionItems.push('📋 راجع أولويات الغد عند البدء')

  const summary = buildBriefSummary('evening', sections, actionItems)

  return {
    type: 'evening',
    timestamp: now.toISOString(),
    greeting: '🌙 ملخص نهاية اليوم:',
    sections,
    actionItems,
    summary
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 📊 المراجعة الأسبوعية
// ═══════════════════════════════════════════════════════════════════════════════

export function generateWeeklyReview(): WeeklyReport {
  const cwd = getOriginalCwd()
  const now = new Date()
  const weekNumber = getWeekNumber(now)
  const sections: BriefSection[] = []

  // إحصائيات الأسبوع
  let totalCommits = 0
  let filesChanged = 0
  const topFiles: string[] = []

  try {
    // عدد commits هذا الأسبوع
    const weekCommits = safeExec(
      'git log --since="7 days ago" --format="%h" --no-merges',
      cwd
    )
    totalCommits = weekCommits.split('\n').filter(l => l.trim()).length

    sections.push({
      heading: `commits هذا الأسبوع`,
      icon: '📈',
      content: `${totalCommits} عملية حفظ`,
      priority: totalCommits > 20 ? 'high' : 'normal'
    })

    // الملفات الأكثر تعديلاً
    const topFilesRaw = safeExec(
      'git log --since="7 days ago" --name-only --format="" --no-merges | sort | uniq -c | sort -rn | head -10',
      cwd
    )
    const lines = topFilesRaw.split('\n').filter(l => l.trim())
    filesChanged = lines.length

    for (const line of lines.slice(0, 5)) {
      topFiles.push(line.trim())
    }

    if (topFiles.length > 0) {
      sections.push({
        heading: 'الملفات الأكثر نشاطاً',
        icon: '🔥',
        content: topFiles.map(f => `• ${f}`).join('\n'),
        priority: 'normal'
      })
    }

    // إحصائيات الأسطر
    const diffStat = safeExec(
      'git diff --stat HEAD~' + Math.min(totalCommits, 50) + ' 2>/dev/null || echo "N/A"',
      cwd
    )
    if (diffStat && !diffStat.includes('N/A')) {
      const lastLine = diffStat.split('\n').pop()?.trim()
      if (lastLine) {
        sections.push({
          heading: 'إحصائيات التغييرات',
          icon: '📊',
          content: lastLine,
          priority: 'low'
        })
      }
    }
  } catch { /* تجاهل */ }

  // حساب درجة الإنتاجية
  const productivityScore = calculateProductivityScore(totalCommits, filesChanged)

  sections.push({
    heading: 'درجة الإنتاجية',
    icon: productivityScore >= 80 ? '🏆' : productivityScore >= 50 ? '✅' : '⚠️',
    content: `${productivityScore}/100 — ${getProductivityLabel(productivityScore)}`,
    priority: productivityScore < 30 ? 'high' : 'normal'
  })

  // اقتراحات تحسين
  const improvements: string[] = []
  if (totalCommits < 5) {
    improvements.push('📝 حاول عمل commits أصغر وأكثر تكراراً')
  }
  if (topFiles.length > 0 && topFiles.length < 3) {
    improvements.push('🎯 التركيز ممتاز! استمر على ملفات محددة')
  }
  improvements.push('🔄 راجع TODO/FIXME المتراكمة في الكود')

  return {
    timestamp: now.toISOString(),
    weekNumber,
    sections,
    stats: {
      totalCommits,
      filesChanged,
      sessionsCount: 0, // سيتم ربطه بسجل الجلسات
      topFiles,
      productivityScore
    },
    improvements,
    nextWeekPlan: [
      '📋 حدد أهداف الأسبوع القادم',
      '🎯 ركز على أولوية واحدة يومياً',
      '📊 راجع هذا التقرير الأسبوع القادم للمقارنة'
    ]
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ⏰ نظام الجدولة
// ═══════════════════════════════════════════════════════════════════════════════

export class ChiefScheduler {
  private config: ChiefConfig
  private timers: NodeJS.Timeout[] = []
  private running = false

  constructor(config?: Partial<ChiefConfig>) {
    this.config = {
      morningBriefTime: '09:00',
      eveningWrapTime: '18:00',
      weeklyReviewDay: 5, // Friday
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      enableTelegram: true,
      enableTerminal: true,
      language: 'ar',
      ...config
    }
  }

  /** بدء الجدولة */
  start(): void {
    if (this.running) return
    this.running = true

    console.log('📅 رئيس الأركان الرقمي — نشط!')
    console.log(`   🌅 تقرير الصباح: ${this.config.morningBriefTime}`)
    console.log(`   🌙 ملخص المساء: ${this.config.eveningWrapTime}`)
    console.log(`   📊 مراجعة أسبوعية: يوم ${['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'][this.config.weeklyReviewDay]}`)

    // فحص كل دقيقة
    const timer = setInterval(() => this.checkSchedule(), 60000)
    this.timers.push(timer)
  }

  /** إيقاف الجدولة */
  stop(): void {
    this.running = false
    this.timers.forEach(t => clearInterval(t))
    this.timers = []
    console.log('⏹️ رئيس الأركان — متوقف')
  }

  private checkSchedule(): void {
    const now = new Date()
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    if (timeStr === this.config.morningBriefTime) {
      this.deliverMorningBrief()
    }

    if (timeStr === this.config.eveningWrapTime) {
      this.deliverEveningWrap()
    }

    if (now.getDay() === this.config.weeklyReviewDay && timeStr === '10:00') {
      this.deliverWeeklyReview()
    }
  }

  /** توليد وإرسال تقرير الصباح */
  async deliverMorningBrief(): Promise<void> {
    const brief = generateMorningBrief()
    
    if (this.config.enableTerminal) {
      console.log('\n' + brief.summary)
    }

    if (this.config.enableTelegram) {
      const notifier = TelegramNotifier.getInstance()
      if (notifier.isConfigured()) {
        await notifier.sendReport('تقرير الصباح 🌅', 
          brief.sections.map(s => ({ heading: `${s.icon} ${s.heading}`, content: s.content }))
        )
      }
    }

    saveBriefToFile(brief)
  }

  /** توليد وإرسال ملخص المساء */
  async deliverEveningWrap(): Promise<void> {
    const brief = generateEveningWrap()

    if (this.config.enableTerminal) {
      console.log('\n' + brief.summary)
    }

    if (this.config.enableTelegram) {
      const notifier = TelegramNotifier.getInstance()
      if (notifier.isConfigured()) {
        await notifier.sendReport('ملخص المساء 🌙',
          brief.sections.map(s => ({ heading: `${s.icon} ${s.heading}`, content: s.content }))
        )
      }
    }

    saveBriefToFile(brief)
  }

  /** توليد وإرسال المراجعة الأسبوعية */
  async deliverWeeklyReview(): Promise<void> {
    const review = generateWeeklyReview()
    const summary = formatWeeklyReview(review)

    if (this.config.enableTerminal) {
      console.log('\n' + summary)
    }

    if (this.config.enableTelegram) {
      const notifier = TelegramNotifier.getInstance()
      if (notifier.isConfigured()) {
        await notifier.sendReport(`المراجعة الأسبوعية 📊 (أسبوع ${review.weekNumber})`,
          review.sections.map(s => ({ heading: `${s.icon} ${s.heading}`, content: s.content }))
        )
      }
    }
  }

  /** تشغيل يدوي للتقرير */
  async runManual(type: 'morning' | 'evening' | 'weekly'): Promise<string> {
    switch (type) {
      case 'morning': {
        const brief = generateMorningBrief()
        return brief.summary
      }
      case 'evening': {
        const brief = generateEveningWrap()
        return brief.summary
      }
      case 'weekly': {
        const review = generateWeeklyReview()
        return formatWeeklyReview(review)
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🛠️ أدوات مساعدة
// ═══════════════════════════════════════════════════════════════════════════════

function safeExec(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] })
  } catch {
    return ''
  }
}

function buildBriefSummary(type: 'morning' | 'evening', sections: BriefSection[], actionItems: string[]): string {
  const title = type === 'morning' ? '🌅 تقرير الصباح' : '🌙 ملخص المساء'
  const line = '─'.repeat(30)
  
  let summary = `\n${title}\n${line}\n\n`

  // الأقسام ذات الأولوية العالية أولاً
  const sorted = [...sections].sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 }
    return priorityOrder[a.priority] - priorityOrder[b.priority]
  })

  for (const section of sorted) {
    summary += `${section.icon} *${section.heading}*\n${section.content}\n\n`
  }

  if (actionItems.length > 0) {
    summary += `🎯 *المطلوب:*\n`
    for (const item of actionItems) {
      summary += `  ${item}\n`
    }
  }

  summary += `\n${line}\n`
  return summary
}

function formatWeeklyReview(review: WeeklyReport): string {
  const line = '═'.repeat(30)
  let output = `\n📊 المراجعة الأسبوعية — أسبوع ${review.weekNumber}\n${line}\n\n`

  for (const section of review.sections) {
    output += `${section.icon} *${section.heading}*\n${section.content}\n\n`
  }

  if (review.improvements.length > 0) {
    output += `💡 *اقتراحات التحسين:*\n`
    for (const imp of review.improvements) {
      output += `  ${imp}\n`
    }
    output += '\n'
  }

  if (review.nextWeekPlan.length > 0) {
    output += `📋 *خطة الأسبوع القادم:*\n`
    for (const plan of review.nextWeekPlan) {
      output += `  ${plan}\n`
    }
  }

  output += `\n${line}\n`
  return output
}

function saveBriefToFile(brief: DailyBrief): void {
  try {
    const cwd = getOriginalCwd()
    const dir = path.join(cwd, '.claude', 'chief-reports')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    const date = new Date().toISOString().split('T')[0]
    const fileName = `${date}-${brief.type}.json`
    fs.writeFileSync(
      path.join(dir, fileName),
      JSON.stringify(brief, null, 2),
      'utf-8'
    )
  } catch { /* تجاهل */ }
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

function calculateProductivityScore(commits: number, filesChanged: number): number {
  // خوارزمية بسيطة — يمكن تحسينها لاحقاً
  let score = 0
  score += Math.min(commits * 5, 50)       // commits حتى 50 نقطة
  score += Math.min(filesChanged * 2, 30)  // ملفات حتى 30 نقطة
  score += 20 // نقاط أساسية للنشاط
  return Math.min(100, score)
}

function getProductivityLabel(score: number): string {
  if (score >= 90) return '🏆 أسبوع استثنائي!'
  if (score >= 70) return '✅ أداء ممتاز'
  if (score >= 50) return '👍 أداء جيد'
  if (score >= 30) return '⚠️ يحتاج تحسين'
  return '🔴 أسبوع هادئ'
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🎯 تصدير — الواجهة الرئيسية
// ═══════════════════════════════════════════════════════════════════════════════

let _chiefInstance: ChiefScheduler | null = null

export function getChiefOfStaff(config?: Partial<ChiefConfig>): ChiefScheduler {
  if (!_chiefInstance) {
    _chiefInstance = new ChiefScheduler(config)
  }
  return _chiefInstance
}
