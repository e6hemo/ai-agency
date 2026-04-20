#!/usr/bin/env bun
/**
 * Telegram Bot Entrypoint
 * 
 * نقطة الدخول المستقلة لتشغيل بوت تيليجرام.
 * تقوم بتهيئة البيئة أولاً ثم بدء تشغيل البوت للتأكد من وصوله لجميع الإعدادات والاعتماديات.
 */

import { resolve } from 'path'
// محاولة تحميل البوت
try {
  const { TelegramBot } = await import('./TelegramBot.js')
  
  console.log('🤖 جاري تهيئة بيئة OpenClaude Telegram Bot...')
  
  // تهيئة البوت
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    console.error('❌ خطأ: لم يتم العثور على TELEGRAM_BOT_TOKEN في ملف .env')
    process.exit(1)
  }

  const bot = new TelegramBot(token, process.cwd())
  
  console.log('🚀 بيئة العمل جاهزة. أطلق البوت الآن!')
  
  // بدء الاستماع
  bot.start()

  // معالجة إيقاف التشغيل بأمان
  process.on('SIGINT', () => {
    console.log('\n🛑 جاري إيقاف البوت أمان...')
    bot.stop()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    bot.stop()
    process.exit(0)
  })

} catch (error: any) {
  console.error('❌ حدث خطأ فادح أثناء تشغيل البوت:')
  console.error(error)
  process.exit(1)
}
