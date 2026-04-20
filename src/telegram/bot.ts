/**
 * ═══════════════════════════════════════════════════════════
 * 📱 Telegram Bot — Fixed Version
 *
 * متوافق مع API الفعلي لـ AgentZero:
 *   - analyzeRequest(text) → RequestAnalysis
 *   - buildExecutionPlan(project, text) → ExecutionPlan
 *   - launchProject(project, text) → { plan, team }
 * ═══════════════════════════════════════════════════════════
 */

import TelegramBotAPI from 'node-telegram-bot-api'
import { agentZero } from '../agency/agent-zero.js'
import { listActiveTeams, getTeamProgress } from '../agency/team-orchestrator.js'
import { getMemoryStats } from '../agency/tiered-memory.js'
import { getRateLimiterStats } from '../agency/rate-limiter.js'
import { writeDailyLog } from '../agency/shared-memory.js'

// ─── تحقق من الـ Token أولاً ─────────────────────────────────────────────────

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const ALLOWED_ID = process.env.TELEGRAM_CHAT_ID

if (!TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN غير موجود في .env')
  process.exit(1)
}

// ─── إنشاء البوت ─────────────────────────────────────────────────────────────

export const bot = new TelegramBotAPI(TOKEN, { polling: true })

console.log('📱 Telegram Bot يعمل...')

// ─── Auth: تحقق من هوية المستخدم ────────────────────────────────────────────

function isAllowed(chatId: number): boolean {
  if (!ALLOWED_ID) return true
  return chatId.toString() === ALLOWED_ID
}

function guard(
  msg: TelegramBotAPI.Message,
  cb: () => Promise<void> | void
): void {
  if (!isAllowed(msg.chat.id)) {
    bot.sendMessage(msg.chat.id, '⛔ غير مصرح لك باستخدام هذا البوت')
    return
  }
  Promise.resolve(cb()).catch(err => {
    console.error('Bot Error:', err)
    bot.sendMessage(msg.chat.id, `❌ حدث خطأ: ${(err as Error).message}`)
  })
}

// ─── /start ───────────────────────────────────────────────────────────────────

bot.onText(/\/start/, (msg) => {
  guard(msg, () => {
    const keyboard: TelegramBotAPI.SendMessageOptions = {
      reply_markup: {
        keyboard: [
          ['📊 الحالة', '🤖 الوكلاء'],
          ['📋 المهام', '🧠 الذاكرة'],
          ['💰 التكلفة', '📅 السجل'],
          ['🚀 مهمة جديدة'],
        ],
        resize_keyboard: true,
      },
    }

    bot.sendMessage(
      msg.chat.id,
      [
        '🤖 <b>مرحباً بك في OpenClaude Agency</b>',
        '',
        'اختر أمراً من القائمة أو اكتب مهمتك مباشرة.',
        '',
        'الأوامر المتاحة:',
        '<b>/status</b> — حالة النظام',
        '<b>/tasks</b>  — المهام النشطة',
        '<b>/memory</b> — إحصائيات الذاكرة',
        '<b>/new [مهمة]</b> — تشغيل مهمة جديدة',
      ].join('\n'),
      { parse_mode: 'HTML', ...keyboard }
    )
  })
})

// ─── /status ──────────────────────────────────────────────────────────────────

bot.onText(/\/status|📊 الحالة/, (msg) => {
  guard(msg, async () => {
    await bot.sendChatAction(msg.chat.id, 'typing')

    const teams = listActiveTeams()
    const stats = getMemoryStats('default-project')
    const limits = getRateLimiterStats()

    const lines = [
      '📊 <b>حالة النظام</b>',
      '',
      `<b>الفرق النشطة:</b> ${teams.length}`,
    ]

    // تفاصيل كل فريق
    for (const team of teams.slice(0, 3)) {
      const progress = getTeamProgress(team.teamName)
      const pct = progress?.percentComplete ?? 0
      const bar = '█'.repeat(Math.floor(pct / 20)) +
        '░'.repeat(5 - Math.floor(pct / 20))
      lines.push(`  • ${team.projectName}: ${bar} ${pct}%`)
    }

    // الذاكرة
    lines.push(
      '',
      '*الذاكرة (MemPalace):*',
      `  🔥 HOT:  ${stats.hot} مدخل`,
      `  ♨️ WARM: ${stats.warm} مدخل`,
      `  🗃️ COLD: ${stats.cold} مدخل`,
    )

    // Rate Limits
    const limitEntries = Object.entries(limits).slice(0, 3)
    if (limitEntries.length > 0) {
      lines.push('', '*حدود الاستخدام:*')
      for (const [, info] of limitEntries) {
        const bar = '█'.repeat(Math.floor(info.usagePercent / 20)) +
          '░'.repeat(5 - Math.floor(info.usagePercent / 20))
        const name = info.model.split('-').slice(-1)[0]
        lines.push(`  ${name}: ${bar} ${info.usagePercent}%`)
      }
    }

    await bot.sendMessage(msg.chat.id, lines.join('\n'), {
      parse_mode: 'HTML',
    })
  })
})

// ─── /tasks ───────────────────────────────────────────────────────────────────

bot.onText(/\/tasks|📋 المهام/, (msg) => {
  guard(msg, async () => {
    await bot.sendChatAction(msg.chat.id, 'typing')

    const teams = listActiveTeams()

    if (teams.length === 0) {
      await bot.sendMessage(msg.chat.id, '📋 لا توجد مهام نشطة حالياً')
      return
    }

    const lines = [
      '📋 <b>المهام النشطة</b>',
      '',
    ]

    for (const team of teams.slice(0, 2)) {
      const progress = getTeamProgress(team.teamName)
      lines.push(`<b>${team.projectName}</b>`)

      if (progress) {
        lines.push(
          `اكتمل: ${progress.percentComplete}%` +
          ` (${progress.completed}/${progress.total})`
        )
      }

      for (const task of team.tasks.slice(0, 5)) {
        const icon =
          task.status === 'completed' ? '✅' :
            task.status === 'in-progress' ? '🔄' :
              task.status === 'blocked' ? '🔒' : '⏳'
        lines.push(`  ${icon} ${task.title}`)
      }

      lines.push('')
    }

    await bot.sendMessage(msg.chat.id, lines.join('\n'), {
      parse_mode: 'HTML',
    })
  })
})

// ─── /memory ──────────────────────────────────────────────────────────────────

bot.onText(/\/memory|🧠 الذاكرة/, (msg) => {
  guard(msg, async () => {
    const stats = getMemoryStats('default-project')

    await bot.sendMessage(msg.chat.id, [
      '🧠 <b>MemPalace Stats</b>',
      '',
      `🔥 HOT  (فوري):  ${stats.hot} مدخل`,
      `♨️ WARM (نشط):   ${stats.warm} مدخل`,
      `🗃️ COLD (أرشيف): ${stats.cold} مدخل`,
      '',
      `📦 الإجمالي: ${stats.total} مدخل`,
    ].join('\n'), { parse_mode: 'HTML' })
  })
})

// ─── /cost ────────────────────────────────────────────────────────────────────

bot.onText(/\/cost|💰 التكلفة/, (msg) => {
  guard(msg, async () => {
    const limits = getRateLimiterStats()
    const models = Object.values(limits)

    await bot.sendMessage(msg.chat.id, [
      '💰 <b>تتبع الاستخدام</b>',
      '',
      '<b>النماذج النشطة:</b>',
      ...models.map(m =>
        `  <code>${m.model}</code>: ${m.tokensAvailable}/${m.maxTokens} slots`
      ),
    ].join('\n'), { parse_mode: 'HTML' })
  })
})

// ─── /new [مهمة] — المهمة الجديدة (الأهم) ────────────────────────────────────

bot.onText(/\/new (.+)/, (msg, match) => {
  guard(msg, async () => {
    const taskText = match?.[1]?.trim()

    if (!taskText) {
      await bot.sendMessage(
        msg.chat.id,
        '📝 اكتب المهمة بعد الأمر:\n<code>/new وصف مهمتك هنا</code>',
        { parse_mode: 'HTML' }
      )
      return
    }

    // رسالة أولية
    await bot.sendChatAction(msg.chat.id, 'typing')
    const statusMsg = await bot.sendMessage(
      msg.chat.id,
      '🔄 Agent Zero يحلل طلبك...'
    )

    const updateStatus = (text: string) => {
      bot.editMessageText(text, {
        chat_id: msg.chat.id,
        message_id: statusMsg.message_id,
      }).catch(() => { })
    }

    const projectName = `tg-project-${Date.now()}`

    writeDailyLog('pipeline-run', `طلب Telegram: ${taskText.substring(0, 50)}`, {
      agent: 'telegram-bot',
    })

    // ─── الخطوة 1: تحليل الطلب ──────────────────────────────────────────────

    updateStatus('🔄 جاري تحليل الطلب...')
    const analysis = agentZero.analyzeRequest(taskText)

    // ─── الخطوة 2: عرض التحليل وطلب الموافقة ────────────────────────────────

    const planLines = [
      '📋 <b>تحليل الطلب</b>',
      '',
      analysis.summary,
      '',
      `⏱ الوقت المقدر: <b>${analysis.estimatedMinutes}</b> دقيقة`,
      `📝 عدد الأقسام: <b>${analysis.requiredDepartments.length}</b>`,
      `🤖 عدد الوكلاء: <b>${analysis.requiredAgents.length}</b>`,
      `📊 التعقيد: <b>${analysis.complexity}</b>`,
      '',
      '<b>الأقسام المطلوبة:</b>',
      ...analysis.requiredDepartments.map(d => `  • ${d}`),
      '',
      '<b>الإجراءات:</b>',
      ...analysis.keyActions.map((a, i) => `  ${i + 1}. ${a}`),
    ]

    if (analysis.needsApproval) {
      planLines.push(
        '',
        '⚠️ <b>هذا المشروع معقد ويحتاج موافقتك</b>',
        'اضغط الزر أدناه للبدء أو الرفض.'
      )
    }

    updateStatus('✅ تم التحليل — تفقد الخطة أدناه')

    await bot.sendMessage(
      msg.chat.id,
      planLines.join('\n'),
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ موافق — ابدأ التنفيذ', callback_data: `ok:${Date.now().toString(36)}` },
            { text: '❌ رفض', callback_data: 'reject' },
          ]],
        },
      }
    )

    writeDailyLog('pipeline-done', `اكتمل تحليل طلب Telegram`, {
      agent: 'telegram-bot',
    })
  })
})

// ─── /approve و /reject ───────────────────────────────────────────────────────

bot.onText(/\/approve/, (msg) => {
  guard(msg, () => {
    writeDailyLog('decision', 'موافقة من Telegram', { agent: 'user' })
    bot.sendMessage(msg.chat.id, '✅ تمت الموافقة - الوكلاء يبدأون العمل')
  })
})

bot.onText(/\/reject/, (msg) => {
  guard(msg, () => {
    writeDailyLog('step-reject', 'رفض من Telegram', { agent: 'user' })
    bot.sendMessage(
      msg.chat.id,
      '❌ تم الرفض\nاكتب /new مع طلب معدّل'
    )
  })
})

// ─── Callback Queries (أزرار inline) ─────────────────────────────────────────

bot.on('callback_query', async (query) => {
  if (!query.message) return

  await bot.answerCallbackQuery(query.id)

  if (query.data?.startsWith('ok:')) {
    const projectName = `tg-project-${Date.now()}`

    writeDailyLog('decision', 'موافقة عبر زر inline', { agent: 'user' })

    await bot.sendMessage(
      query.message.chat.id,
      '🔄 جاري إطلاق الفريق...'
    )

    try {
      // نستخدم الـ API الفعلي: launchProject
      const result = agentZero.launchProject(
        projectName,
        query.message.text || 'مهمة عامة'
      )

      const lines = [
        '✅ <b>تم إطلاق المشروع بنجاح!</b>',
        '',
        `<b>المشروع:</b> ${result.plan.projectName}`,
        `<b>المراحل:</b> ${result.plan.phases.length}`,
        `<b>أعضاء الفريق:</b> ${result.team.teammates.length}`,
        '',
        '<b>الوكلاء المعينون:</b>',
        ...result.team.teammates.map(t =>
          `  🤖 ${t.name} (${t.department})`
        ),
        '',
        '<b>المراحل:</b>',
        ...result.plan.phases.map(p =>
          `  ${p.id}. ${p.name} — ${p.agents.join(', ')}`
        ),
        '',
        'استخدم <b>/tasks</b> للمتابعة أو <b>/status</b> لرؤية الحالة.',
      ]

      await bot.sendMessage(
        query.message.chat.id,
        lines.join('\n'),
        { parse_mode: 'HTML' }
      )
    } catch (err) {
      await bot.sendMessage(
        query.message.chat.id,
        `❌ فشل إطلاق المشروع: ${(err as Error).message}`
      )
    }
  }

  if (query.data === 'reject') {
    await bot.sendMessage(
      query.message.chat.id,
      '❌ تم الرفض\nاكتب /new مع طلب معدّل'
    )
  }
})

// ─── 🤖 الوكلاء ──────────────────────────────────────────────────────────────

bot.onText(/🤖 الوكلاء/, (msg) => {
  guard(msg, async () => {
    const teams = listActiveTeams()

    if (teams.length === 0) {
      await bot.sendMessage(msg.chat.id, '🤖 لا توجد فرق نشطة حالياً.\nاستخدم /new لإطلاق مهمة جديدة.')
      return
    }

    const lines = ['🤖 <b>الوكلاء النشطون</b>', '']
    for (const team of teams.slice(0, 5)) {
      lines.push(`<b>فريق:</b> ${team.projectName}`)
      for (const mate of team.teammates) {
        const icon = mate.status === 'working' ? '🔄' : mate.status === 'done' ? '✅' : '⏳'
        lines.push(`  ${icon} ${mate.name} (${mate.department})`)
      }
      lines.push('')
    }

    await bot.sendMessage(msg.chat.id, lines.join('\n'), { parse_mode: 'HTML' })
  })
})

// ─── 📅 السجل ─────────────────────────────────────────────────────────────────

bot.onText(/📅 السجل/, (msg) => {
  guard(msg, () => {
    bot.sendMessage(msg.chat.id, [
      '📅 <b>سجل الأحداث</b>',
      '',
      'السجل محفوظ في:',
      '<code>/.claude/agency/daily-log.json</code>',
      '',
      'استخدم <b>/status</b> لرؤية الحالة الحالية.',
    ].join('\n'), { parse_mode: 'HTML' })
  })
})

// ─── 🚀 مهمة جديدة ───────────────────────────────────────────────────────────

bot.onText(/🚀 مهمة جديدة/, (msg) => {
  guard(msg, () => {
    bot.sendMessage(msg.chat.id, [
      '🚀 <b>لإنشاء مهمة جديدة:</b>',
      '',
      'اكتب الأمر التالي متبوعاً بوصف المهمة:',
      '',
      '<code>/new ابني موقع ويب لمتجر إلكتروني</code>',
      '<code>/new صمم حملة تسويقية لمنتج جديد</code>',
      '<code>/new حلل بيانات المبيعات الشهرية</code>',
      '',
      'أو اكتب مهمتك مباشرة وسأحللها لك.',
    ].join('\n'), { parse_mode: 'HTML' })
  })
})

// ─── النص الحر → تحليل سريع ──────────────────────────────────────────────────

const KNOWN_BUTTONS = [
  '📊 الحالة', '🤖 الوكلاء', '📋 المهام',
  '🧠 الذاكرة', '💰 التكلفة', '📅 السجل',
  '🚀 مهمة جديدة',
]

bot.on('message', (msg) => {
  if (!msg.text) return
  if (msg.text.startsWith('/')) return
  if (KNOWN_BUTTONS.some(b => msg.text?.includes(b))) return
  if (!isAllowed(msg.chat.id)) return

  guard(msg, async () => {
    await bot.sendChatAction(msg.chat.id, 'typing')

    // تحليل سريع باستخدام الـ API الفعلي
    const analysis = agentZero.analyzeRequest(msg.text!)

    const lines = [
      '🧠 <b>تحليل سريع</b>',
      '',
      analysis.summary,
      '',
      `📊 التعقيد: <b>${analysis.complexity}</b>`,
      `⏱ الوقت المقدر: <b>${analysis.estimatedMinutes}</b> دقيقة`,
      `🤖 الوكلاء المطلوبون: <b>${analysis.requiredAgents.join(', ')}</b>`,
      '',
      '💡 لتنفيذ هذا الطلب، استخدم:',
      `<code>/new ${msg.text!.substring(0, 100)}</code>`,
    ]

    await bot.sendMessage(msg.chat.id, lines.join('\n'), {
      parse_mode: 'HTML',
    })
  })
})

// ─── معالجة أخطاء Polling ────────────────────────────────────────────────────

bot.on('polling_error', (err) => {
  console.error('Telegram polling error:', err.message)
})