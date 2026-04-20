/**
 * إضافة تجريبية — Hello World Plugin
 * 
 * هذه إضافة نموذجية لتوضيح كيفية بناء إضافات OpenClaude
 * ضعها في: ~/.claude/plugins/hello-world/index.js
 */

import { definePlugin, success, failure, CommonSchemas } from '../../plugins/PluginSDK.js'
import { z } from 'zod'

export default definePlugin({
  name: 'hello-world',
  version: '1.0.0',
  description: 'إضافة تجريبية لتوضيح نظام الإضافات',
  author: 'OpenClaude Team',
  tags: ['demo', 'example'],

  // ─── الأدوات ─────────────────────────────────────────────────────────
  tools: [
    {
      name: 'greet',
      description: 'يُلقي تحية مخصصة',
      parameters: z.object({
        name: z.string().describe('الاسم'),
        language: z.enum(['ar', 'en', 'fr']).optional().describe('اللغة')
      }),
      execute: async (params) => {
        const greetings: Record<string, string> = {
          ar: `مرحباً ${params.name}! 👋`,
          en: `Hello ${params.name}! 👋`,
          fr: `Bonjour ${params.name}! 👋`
        }
        const lang = params.language || 'ar'
        return success(greetings[lang] || greetings.ar!)
      }
    },
    {
      name: 'count_files',
      description: 'يعد الملفات في مجلد معين',
      parameters: z.object({
        directory: z.string().optional().describe('المجلد (الافتراضي: المجلد الحالي)')
      }),
      execute: async (params, context) => {
        try {
          const dir = params.directory || '.'
          const files = await context.fs.listDir(dir)
          return success(`📁 عدد الملفات في "${dir}": ${files.length}\n\n${files.slice(0, 10).map(f => `  • ${f}`).join('\n')}${files.length > 10 ? `\n  ... و ${files.length - 10} ملفات أخرى` : ''}`)
        } catch (error: any) {
          return failure(`فشل قراءة المجلد: ${error.message}`)
        }
      }
    },
    {
      name: 'save_note',
      description: 'يحفظ ملاحظة سريعة',
      parameters: z.object({
        content: z.string().describe('محتوى الملاحظة'),
        tag: z.string().optional().describe('وسم للتصنيف')
      }),
      execute: async (params, context) => {
        const timestamp = new Date().toISOString()
        const note = `[${timestamp}] ${params.tag ? `#${params.tag} ` : ''}${params.content}\n`
        
        // إضافة للملف
        let existing = ''
        try {
          existing = await context.fs.readFile('.claude/notes.txt')
        } catch { /* ملف جديد */ }
        
        await context.fs.writeFile('.claude/notes.txt', existing + note)
        return success(`📝 تم حفظ الملاحظة${params.tag ? ` [#${params.tag}]` : ''}`)
      }
    }
  ],

  // ─── الأوامر ─────────────────────────────────────────────────────────
  commands: [
    {
      name: 'hello',
      description: 'يطبع تحية سريعة',
      aliases: ['hi', 'مرحبا'],
      execute: async (args, context) => {
        const name = args.trim() || 'صديقي'
        return `👋 مرحباً ${name}! أنا إضافة Hello World.\n📂 المشروع: ${context.projectRoot}`
      }
    },
    {
      name: 'notes',
      description: 'يعرض الملاحظات المحفوظة',
      execute: async (_, context) => {
        try {
          const notes = await context.fs.readFile('.claude/notes.txt')
          return `📝 *ملاحظاتك:*\n${notes}`
        } catch {
          return '📝 لا توجد ملاحظات بعد. استخدم أداة save_note لإضافة ملاحظة.'
        }
      }
    }
  ],

  // ─── Hooks ──────────────────────────────────────────────────────────
  hooks: {
    onLoad: async (context) => {
      context.log('إضافة Hello World محملة! 🎉')
    },

    onSessionStart: async (context) => {
      const count = context.getConfig<number>('sessionCount', 0)
      await context.setConfig('sessionCount', count + 1)
      context.log(`هذه الجلسة رقم ${count + 1}`)
    },

    onSessionEnd: async (context) => {
      context.log('الجلسة انتهت. إلى اللقاء! 👋')
    }
  },

  // ─── إعدادات افتراضية ──────────────────────────────────────────────
  defaultConfig: {
    sessionCount: 0,
    greeting: 'مرحباً'
  }
})
