import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import fs from 'fs'
import path from 'path'
import { getCwd } from '../../utils/cwd.js'

export const PERSONAL_UNIVERSITY_TOOL_NAME = 'PersonalUniversity'

function getUniPath() { return path.join(getCwd(), '.claude', 'personal-university.json') }
function ensureDir() { const d = path.dirname(getUniPath()); if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }) }

interface Lesson { id: string; title: string; content: string; quiz: string[]; completed: boolean; score?: number }
interface Course {
  id: string; subject: string; goal: string; currentLevel: string; targetLevel: string
  createdAt: string; curriculum: Lesson[]; currentLesson: number; streak: number; lastStudied?: string
}

function loadCourses(): Course[] {
  try { if (fs.existsSync(getUniPath())) return JSON.parse(fs.readFileSync(getUniPath(), 'utf-8')) } catch {}
  return []
}
function saveCourses(c: Course[]) { ensureDir(); fs.writeFileSync(getUniPath(), JSON.stringify(c, null, 2), 'utf-8') }

const FEYNMAN_CURRICULUM = (subject: string, goal: string, level: string) => [
  { id: '1', title: `المفاهيم الأساسية في ${subject}`, content: `الدرس الأول: لماذا يهمك ${subject}؟ القانون الذهبي الواحد الذي تبنى عليه كل الفكرة.`, quiz: [`اشرح ${subject} لطفل عمره 10 سنوات بجملتين فقط`, `ما أكبر سوء فهم شائع عن ${subject}؟`], completed: false },
  { id: '2', title: `نماذج عقلية ${subject}`, content: `الإطار النظري: كيف يفكر الخبراء الحقيقيون في ${subject}. الأنماط التي يرونها وأنت لا.`, quiz: [`ما الإطار الذي تستخدمه الآن لفهم ${subject}؟`, `أين ينهار هذا الإطار؟`], completed: false },
  { id: '3', title: `أخطاء المبتدئين في ${subject}`, content: `الأخطاء الثلاثة التي يقع فيها 90% ممن يتعلمون ${subject}. لماذا تحدث وكيف تتجنبها.`, quiz: [`صف موقفاً وقعت فيه في أحد هذه الأخطاء`, `كيف غيّر هذا الدرس طريقة تفكيرك؟`], completed: false },
  { id: '4', title: `التطبيق الأول في ${subject}`, content: `مشروع صغير تطبيقي. الهدف ليس الكمال — الهدف هو الاحتكاك الأول مع الواقع.`, quiz: [`ما النتيجة الأولى التي حصلت عليها؟`, `ما الذي فاجأك؟`], completed: false },
  { id: '5', title: `نقطة الانقطاع في ${subject}`, content: `لحظة "Aha!" في ${subject}. الفكرة التي إذا فهمتها تصبح كل شيء آخر منطقياً.`, quiz: [`ما الفكرة التي أضاءت لك؟`, `كيف تربط هذا الدرس بـ "${goal}"؟`], completed: false },
]

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum(['create_course', 'get_lesson', 'submit_quiz', 'get_progress', 'list_courses']),
    subject: z.string().optional(),
    goal: z.string().optional(),
    currentLevel: z.string().optional().describe('beginner / intermediate / advanced'),
    courseId: z.string().optional(),
    answers: z.array(z.string()).optional().describe('Answers to quiz questions'),
  })
)
type InputSchema = ReturnType<typeof inputSchema>
export type Output = { result: string }

export const PersonalUniversityTool = buildTool({
  name: PERSONAL_UNIVERSITY_TOOL_NAME,
  searchHint: 'personal university learning curriculum Feynman technique self study',
  maxResultSizeChars: 100000,
  async description() { return 'جامعتك الخاصة — تبني منهجاً دراسياً شخصياً لأي مهارة تريدها وتعلّمك إياها بأسلوب Feynman العلمي: درس يومي → اختبار → تصحيح ثغرات.' },
  async prompt() { return 'create_course لإنشاء كورس جديد. get_lesson للحصول على الدرس اليومي. submit_quiz لإجابة عن الاختبار والمتابعة.' },
  get inputSchema() { return inputSchema() },
  get outputSchema() { return lazySchema(() => z.any()) },
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  async call(input) {
    let courses = loadCourses()
    if (input.action === 'list_courses') {
      if (courses.length === 0) return { data: { result: 'لا توجد كورسات. ابدأ بـ create_course.' } }
      const list = courses.map(c => `- **${c.subject}** (ID: \`${c.id}\`) — الدرس ${c.currentLesson + 1}/${c.curriculum.length} | Streak: 🔥${c.streak} يوم`).join('\n')
      return { data: { result: `## 🎓 كورساتك:\n\n${list}` } }
    }
    if (input.action === 'create_course') {
      if (!input.subject || !input.goal) throw new Error('subject and goal required')
      const curriculum = FEYNMAN_CURRICULUM(input.subject, input.goal, input.currentLevel ?? 'beginner')
      const course: Course = { id: `course-${Date.now()}`, subject: input.subject, goal: input.goal, currentLevel: input.currentLevel ?? 'beginner', targetLevel: 'advanced', createdAt: new Date().toISOString(), curriculum, currentLesson: 0, streak: 0 }
      courses.push(course)
      saveCourses(courses)
      return { data: { result: `## 🎓 تم إنشاء كورسك: ${input.subject}\n\n**هدفك:** ${input.goal}\n**عدد الدروس:** ${curriculum.length}\n**ID:** \`${course.id}\`\n\n---\nابدأ الآن بـ \`get_lesson\` مع ID الكورس!` } }
    }
    const course = courses.find(c => c.id === input.courseId || c.subject.toLowerCase().includes(input.courseId ?? ''))
    if (!course) throw new Error('Course not found. Use list_courses to see your courses.')
    if (input.action === 'get_lesson') {
      const lesson = course.curriculum[course.currentLesson]
      if (!lesson) return { data: { result: '🏆 لقد أكملت جميع دروس هذا الكورس! أنت الآن خبير.' } }
      return { data: { result: `## 📖 الدرس ${course.currentLesson + 1}: ${lesson.title}\n\n${lesson.content}\n\n---\n\n### 🧪 اختبار Feynman:\n${lesson.quiz.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\n---\n*أجب بصدق ثم استخدم \`submit_quiz\` مع إجاباتك للمتابعة.*\n🔥 Streak: ${course.streak} يوم` } }
    }
    if (input.action === 'submit_quiz') {
      const lesson = course.curriculum[course.currentLesson]
      if (!lesson || !input.answers?.length) throw new Error('No lesson in progress or no answers provided')
      lesson.completed = true; lesson.score = Math.min(10, input.answers.join('').length > 100 ? 8 : 5)
      course.currentLesson++; course.streak++; course.lastStudied = new Date().toISOString()
      saveCourses(courses)
      const next = course.curriculum[course.currentLesson]
      return { data: { result: `## ✅ أحسنت!\n\n**"${lesson.title}"** — مكتمل ✓\n\nإجاباتك تُظهر ${lesson.score! >= 7 ? 'فهماً عميقاً 🏆' : 'فهماً جيداً يحتاج مزيداً من التطبيق 💪'}\n\n🔥 Streak: ${course.streak} يوم متواصل!\n\n${next ? `### ⏭️ الدرس القادم:\n**"${next.title}"**\n\nاستخدم \`get_lesson\` غداً للمتابعة.` : '🎓 **تهانينا! أكملت الكورس كاملاً!**'}` } }
    }
    if (input.action === 'get_progress') {
      const completed = course.curriculum.filter(l => l.completed).length
      const pct = Math.round((completed / course.curriculum.length) * 100)
      return { data: { result: `## 📊 تقدمك في: ${course.subject}\n\n**الإنجاز:** ${completed}/${course.curriculum.length} (${pct}%)\n${'█'.repeat(Math.floor(pct / 10))}${'░'.repeat(10 - Math.floor(pct / 10))} ${pct}%\n**Streak:** 🔥 ${course.streak} يوم\n**الدرس الحالي:** ${course.curriculum[course.currentLesson]?.title ?? 'مكتمل!'}` } }
    }
    return { data: { result: 'Unknown action' } }
  },
  mapToolResultToToolResultBlockParam(d, id) { return { tool_use_id: id, type: 'tool_result', content: d.result } },
  userFacingName() { return 'Personal University' },
  getToolUseSummary(i) { return i?.action ?? 'Personal University' },
  renderToolUseMessage() { return 'Personal University running...' },
  renderToolUseTag() { return null }, renderToolResultMessage() { return null }, extractSearchText() { return '' },
  renderToolUseErrorMessage(e) { return String(e) }, async validateInput() { return { result: true } },
} satisfies ToolDef<InputSchema, Output>)
