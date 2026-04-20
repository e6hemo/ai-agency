import { TelegramBot } from './src/telegram/TelegramBot.js'

console.log('🤖 جاري تشغيل بوت تيليجرام التجريبي...')

const bot = new TelegramBot()

// معالجة الرسائل البسيطة
bot.onMessage(async (message, chatId) => {
  return `لقد قلت: "${message}"\n\n معرف المحادثة الخاص بك (Chat ID) هو: ${chatId}`
})

// البدء
bot.start().catch(console.error)

console.log('✅ البوت يعمل الآن! اذهب إلى تيليجرام وارسل /start إلى @ahmed_agencybot')
