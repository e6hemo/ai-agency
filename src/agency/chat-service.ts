import { QueryEngine } from '../QueryEngine.js'
import { getAllBaseTools } from '../tools.js'
import { getOriginalCwd, getSessionId } from '../bootstrap/state.js'
import { getDefaultAppState } from '../state/AppStateStore.js'
import { FileStateCache } from '../utils/fileStateCache.js'
import { agentZero } from './agent-zero.js'

/**
 * Chat Service: Bridges the Agency Dashboard with the core QueryEngine.
 */
export class ChatService {
  private engines: Map<string, QueryEngine> = new Map()

  async *streamChat(params: {
    agent: string
    message: string
    model?: string
    history?: any[]
    projectName?: string
  }) {
    const { agent, message, model, history = [], projectName = 'default' } = params
    
    const sessionKey = `${projectName}-${agent}`
    let engine = this.engines.get(sessionKey)

    if (!engine) {
      // Build system prompt for this specific agent
      const systemPrompt = this.getAgentSystemPrompt(agent, projectName, message)
      
      engine = new QueryEngine({
        cwd: getOriginalCwd(),
        tools: getAllBaseTools(),
        commands: [], // Dash chat usually doesn't need CLI commands
        mcpClients: [],
        agents: [],
        canUseTool: async () => ({ behavior: 'allow' }), // Simple allow for now
        getAppState: () => getDefaultAppState(),
        setAppState: () => {},
        initialMessages: history,
        readFileCache: new FileStateCache(),
        customSystemPrompt: systemPrompt,
        userSpecifiedModel: model,
      })
      this.engines.set(sessionKey, engine)
    }

    // Submit message and yield results
    for await (const sdkMsg of engine.submitMessage(message)) {
      yield sdkMsg
    }
  }

  async simpleChat(params: {
    agent: string
    message: string
    model?: string
    history?: any[]
    projectName?: string
    overrideSystemPrompt?: string
  }): Promise<string> {
    const { agent, message, model, history = [], projectName = 'default', overrideSystemPrompt } = params
    
    const sessionKey = `simple-${projectName}-${agent}`
    let engine = this.engines.get(sessionKey)

    if (!engine) {
      const systemPrompt = overrideSystemPrompt || this.getAgentSystemPrompt(agent, projectName, message)
      
      engine = new QueryEngine({
        cwd: getOriginalCwd(),
        tools: getAllBaseTools(),
        commands: [],
        mcpClients: [],
        agents: [],
        canUseTool: async () => ({ behavior: 'allow' }),
        getAppState: () => getDefaultAppState(),
        setAppState: () => {},
        initialMessages: history,
        readFileCache: new FileStateCache(),
        customSystemPrompt: systemPrompt,
        userSpecifiedModel: model,
      })
      this.engines.set(sessionKey, engine)
    }

    let fullReply = ''
    for await (const sdkMsg of engine.submitMessage(message)) {
      if (sdkMsg.type === 'token' && sdkMsg.token) {
        fullReply += sdkMsg.token
      }
    }
    return fullReply
  }

  private getAgentSystemPrompt(agent: string, projectName: string, request: string): string {
    // In a real agency, we'd use AgentZero to build a rich Master Prompt.
    // For now, we'll provide a solid base based on the agent's identity.
    
    const roleMap: Record<string, string> = {
      'project-manager': 'مدير مشاريع محترف. مهمتك التخطيط، التنسيق بين الوكلاء، وضمان جودة المخرجات النهائية.',
      'full-stack-developer': 'مطور برمجيات خبير (Full Stack). تجيد TypeScript, React, Next.js, Node.js وتهتم بجودة الكود والأمان.',
      'ui-ux-designer': 'مصمم واجهات وتجربة مستخدم (UI/UX). تهتم بالجمالية، البساطة، وسهولة الاستخدام.',
      'marketing-strategist': 'خبير استراتيجيات تسويق. تحلل السوق، وتضع خطط النمو والحملات الإعلانية الفعالة.',
      'content-creator': 'صانع محتوى إبداعي. تكتب المقالات، السيناريوهات، والمحتوى الترويجي الجذاب.',
      'seo-specialist': 'خبير تحسين محركات البحث (SEO). تضمن ظهور المواقع في النتائج الأولى وتهتم بالكلمات المفتاحية والروابط.',
      'data-analyst': 'محلل بيانات بارع. تحول الأرقام إلى تقارير ورؤى مفيدة لاتخاذ القرارات.',
      'researcher': 'باحث دقيق. تستكشف التقنيات الجديدة، تحلل المنافسين، وتجمع المعلومات الموثوقة.',
      'code-reviewer': 'مراجع كود دقيق. تكتشف الأخطاء، تقترح التحسينات، وتضمن الالتزام بأفضل الممارسات البرمجية.'
    }

    const baseIdentity = roleMap[agent] || 'وكيل ذكاء اصطناعي متخصص في وكالة OpenClaude.'
    
    return `# الهوية والسمات
أنت **${agent}**، ضمن فريق عمل مشروع **"${projectName}"**.

# دورك
${baseIdentity}

# القواعد العامة
1. تواصل باللغة العربية بذكاء واحترافية.
2. استخدم الأدوات المتاحة لك عند الحاجة (ملفات، بحث، تطوير).
3. كن دقيقاً وعملياً في ردودك.
4. إذا كنت بحاجة للمزيد من المعلومات، لا تتردد في السؤال.

# السياق الحالي
هذا المشروع يهدف إلى: ${request}
`
  }
}

export const chatService = new ChatService()
