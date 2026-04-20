/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🧠 Agent Zero — الوكيل المركزي الذكي
 *
 * العقل المدبر للوكالة:
 * 1. يستقبل طلب المستخدم ويحلله
 * 2. يقرر أي أقسام ووكلاء تحتاجها المهمة
 * 3. يُولّد Master Prompt لكل وكيل
 * 4. يجمع النتائج ويقدم ملخصاً نهائياً
 * 5. يصعّد القرارات الغامضة للمستخدم
 *
 * يتكامل مع: team-orchestrator, tiered-memory, rate-limiter, shared-memory, mempalace
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs'
import * as path from 'path'
import { getOriginalCwd } from '../bootstrap/state.js'
import { createAgencyTeam, type TeamConfig, type TeamTask } from './team-orchestrator.js'
import { getProjectContext, writeDailyLog, rememberNow } from './shared-memory.js'
import { buildAgentContext } from './tiered-memory.js'
import { callWithRateLimit } from './rate-limiter.js'
import { memoryPalace, MemPalace } from './mempalace.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export type RequestCategory = 'development' | 'marketing' | 'design' | 'content' | 'research' | 'seo' | 'data' | 'full-project' | 'general'
export type RequestComplexity = 'simple' | 'moderate' | 'complex' | 'enterprise'

export interface RequestAnalysis {
  category: RequestCategory
  subCategories: RequestCategory[]
  complexity: RequestComplexity
  requiredDepartments: string[]
  requiredAgents: string[]
  keyActions: string[]
  needsApproval: boolean
  summary: string
  estimatedMinutes: number
}

export interface MasterPrompt {
  agentName: string
  department: string
  prompt: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  context: string
}

export interface ExecutionPhase {
  id: number
  name: string
  agents: string[]
  description: string
  dependsOn: number[]
  estimatedMinutes: number
}

export interface ExecutionPlan {
  projectName: string
  analysis: RequestAnalysis
  phases: ExecutionPhase[]
  masterPrompts: MasterPrompt[]
  createdAt: string
}

// ─── Class ────────────────────────────────────────────────────────────────────

export class AgentZero {
  
  /** قاموس الكلمات المفتاحية لكل فئة */
  private CATEGORY_KEYWORDS: Record<RequestCategory, string[]> = {
    development: ['برمجة', 'موقع', 'تطبيق', 'كود', 'api', 'واجهة برمجية', 'website', 'app', 'code', 'develop', 'build', 'deploy', 'backend', 'frontend', 'database', 'server', 'قاعدة بيانات', 'typescript', 'javascript', 'react', 'node', 'next', 'bug', 'خطأ', 'إصلاح', 'fix', 'feature', 'ميزة'],
    marketing: ['تسويق', 'حملة', 'إعلان', 'إعلانات', 'نمو', 'marketing', 'campaign', 'ads', 'growth', 'funnel', 'عملاء', 'customers', 'leads', 'conversion', 'تحويل', 'brand', 'علامة تجارية', 'branding', 'social media'],
    design: ['تصميم', 'واجهة', 'هوية', 'شعار', 'لوجو', 'design', 'ui', 'ux', 'brand', 'logo', 'figma', 'wireframe', 'mockup', 'prototype', 'ألوان', 'خطوط'],
    content: ['محتوى', 'مقال', 'كتابة', 'بوست', 'فيديو', 'سكريبت', 'content', 'article', 'blog', 'post', 'video', 'script', 'copywriting', 'newsletter', 'نشرة', 'تغريدة', 'tweet'],
    research: ['بحث', 'تحليل', 'دراسة', 'منافسين', 'سوق', 'research', 'analysis', 'study', 'competitors', 'market', 'trend', 'توجه', 'استكشاف', 'explore', 'benchmark'],
    seo: ['seo', 'محركات البحث', 'قوقل', 'google', 'ترتيب', 'ranking', 'keywords', 'كلمات مفتاحية', 'backlinks', 'sitemap', 'meta', 'schema', 'structured data'],
    data: ['بيانات', 'إحصائيات', 'تقرير', 'أرقام', 'data', 'analytics', 'report', 'metrics', 'dashboard', 'kpi', 'مؤشرات', 'chart', 'graph', 'visualization'],
    'full-project': ['مشروع كامل', 'مشروع جديد', 'بناء كامل', 'من الصفر', 'full project', 'complete', 'from scratch', 'end-to-end', 'launch', 'إطلاق', 'mvp'],
    general: [],
  }

  private CATEGORY_TO_DEPARTMENTS: Record<RequestCategory, string[]> = {
    development: ['development'],
    marketing: ['marketing'],
    design: ['design'],
    content: ['media'],
    research: ['research'],
    seo: ['seo'],
    data: ['data'],
    'full-project': ['management', 'development', 'design', 'marketing'],
    general: ['management'],
  }

  private DEPARTMENT_AGENTS: Record<string, string> = {
    management: 'project-manager',
    development: 'full-stack-developer',
    design: 'ui-ux-designer',
    marketing: 'marketing-strategist',
    media: 'content-creator',
    seo: 'seo-specialist',
    data: 'data-analyst',
    research: 'researcher',
    qa: 'code-reviewer',
  }

  async runTaskWithRateLimit(task: () => Promise<any>): Promise<any> {
    const model = process.env.ORCHESTRATOR_MODEL || 'gemini-1.5-flash'
    return await callWithRateLimit(model, 'agent-zero', task)
  }

  public analyzeRequest(request: string): RequestAnalysis {
    const lower = request.toLowerCase()
    const scores: Record<RequestCategory, number> = {
      development: 0, marketing: 0, design: 0, content: 0,
      research: 0, seo: 0, data: 0, 'full-project': 0, general: 0,
    }

    for (const [cat, keywords] of Object.entries(this.CATEGORY_KEYWORDS)) {
      for (const kw of keywords) {
        if (lower.includes(kw)) {
          scores[cat as RequestCategory] += kw.length > 4 ? 2 : 1
        }
      }
    }

    const sorted = Object.entries(scores)
      .filter(([cat]) => cat !== 'general')
      .sort(([, a], [, b]) => b - a)

    const topScore = sorted[0]?.[1] ?? 0
    const category: RequestCategory = topScore > 0 ? sorted[0]![0] as RequestCategory : 'general'

    const subCategories = sorted
      .filter(([cat, score]) => score > 0 && cat !== category)
      .map(([cat]) => cat as RequestCategory)

    const highScorers = sorted.filter(([, score]) => score >= 2)
    const effectiveCategory = highScorers.length >= 3 ? 'full-project' : category

    const allCategories = [effectiveCategory, ...subCategories]
    const deptSet = new Set<string>()
    deptSet.add('management')
    for (const cat of allCategories) {
      const depts = this.CATEGORY_TO_DEPARTMENTS[cat] || []
      depts.forEach(d => deptSet.add(d))
    }
    const requiredDepartments = [...deptSet]

    const requiredAgents = requiredDepartments
      .map(d => this.DEPARTMENT_AGENTS[d])
      .filter((a): a is string => !!a)

    const complexity = this.estimateComplexity(request, requiredDepartments.length)
    const keyActions = this.extractKeyActions(request)
    const needsApproval = complexity === 'complex' || complexity === 'enterprise'

    const timeMap: Record<RequestComplexity, number> = { simple: 5, moderate: 15, complex: 30, enterprise: 60 }
    const estimatedMinutes = timeMap[complexity] * requiredDepartments.length

    const summary = this.buildAnalysisSummary(effectiveCategory, complexity, requiredDepartments, keyActions)

    return {
      category: effectiveCategory,
      subCategories,
      complexity,
      requiredDepartments,
      requiredAgents,
      keyActions,
      needsApproval,
      summary,
      estimatedMinutes,
    }
  }

  private estimateComplexity(request: string, deptCount: number): RequestComplexity {
    const length = request.length
    const enterpriseWords = ['enterprise', 'production', 'scale', 'ملايين', 'آلاف', 'مليون']
    if (enterpriseWords.some(w => request.toLowerCase().includes(w))) return 'enterprise'
    if (deptCount >= 4 || length > 500) return 'complex'
    if (deptCount >= 2 || length > 200) return 'moderate'
    return 'simple'
  }

  private extractKeyActions(request: string): string[] {
    const actions: string[] = []
    const lines = request.split(/[.\n،,]/g).map(l => l.trim()).filter(l => l.length > 10)
    const actionPatterns = [/(?:أريد|اريد|أحتاج|احتاج|صمم|ابني|اكتب|حلل|ابحث|أنشئ|طوّر|أضف|عدّل)\s+(.+)/i, /(?:build|create|design|develop|write|analyze|research|add|fix|improve)\s+(.+)/i]
    for (const line of lines.slice(0, 8)) {
      for (const pattern of actionPatterns) {
        const match = line.match(pattern)
        if (match && match[1]) {
          actions.push(match[1].substring(0, 100))
          break
        }
      }
      if (actions.length === 0 && line.length > 20) {
        actions.push(line.substring(0, 100))
      }
    }
    return actions.length > 0 ? actions : [request.substring(0, 150)]
  }

  private buildAnalysisSummary(category: RequestCategory, complexity: RequestComplexity, departments: string[], actions: string[]): string {
    const catLabels: Record<RequestCategory, string> = { development: 'تطوير برمجي', marketing: 'تسويق واستراتيجية', design: 'تصميم واجهات', content: 'إنشاء محتوى', research: 'بحث وتحليل', seo: 'تحسين محركات البحث', data: 'تحليل بيانات', 'full-project': 'مشروع متكامل', general: 'طلب عام' }
    const complexLabels: Record<RequestComplexity, string> = { simple: 'بسيط', moderate: 'متوسط', complex: 'معقد', enterprise: 'مؤسسي' }
    return `📋 **تحليل الطلب:** ${catLabels[category]} (${complexLabels[complexity]})\n📂 **الأقسام:** ${departments.join(', ')}\n🎯 **الإجراءات:** ${actions.length} إجراء رئيسي`
  }

  public buildExecutionPlan(projectName: string, request: string, analysis?: RequestAnalysis): ExecutionPlan {
    const finalAnalysis = analysis || this.analyzeRequest(request)
    const phases = this.buildPhases(finalAnalysis)
    const masterPrompts = this.generateMasterPrompts(projectName, request, finalAnalysis, phases)
    const plan: ExecutionPlan = {
      projectName,
      analysis: finalAnalysis,
      phases,
      masterPrompts,
      createdAt: new Date().toISOString(),
    }
    this.savePlan(projectName, plan)
    writeDailyLog('decision', `Agent Zero: خطة لمشروع "${projectName}" — ${phases.length} مراحل`, { agent: 'agent-zero', details: finalAnalysis.summary })
    rememberNow(projectName, 'agent-zero', `خطة التنفيذ: ${finalAnalysis.category} | ${finalAnalysis.complexity} | أقسام: ${finalAnalysis.requiredDepartments.join(',')}`, 8)
    return plan
  }

  private buildPhases(analysis: RequestAnalysis): ExecutionPhase[] {
    const phases: ExecutionPhase[] = []
    let phaseId = 1
    phases.push({ id: phaseId++, name: 'التخطيط والتحليل', agents: ['project-manager'], description: 'تحليل المتطلبات ووضع خطة مفصلة وتوزيع المهام.', dependsOn: [], estimatedMinutes: 5 })
    if (analysis.requiredDepartments.includes('research')) {
      phases.push({ id: phaseId++, name: 'البحث والاستكشاف', agents: ['researcher'], description: 'بحث عن المنافسين والسوق والتقنيات ذات الصلة.', dependsOn: [1], estimatedMinutes: 10 })
    }
    const parallelDepts = analysis.requiredDepartments.filter(d => !['management', 'research', 'qa'].includes(d))
    if (parallelDepts.length > 0) {
      const dependsOnPhases = phases.map(p => p.id)
      for (const dept of parallelDepts) {
        const agent = this.DEPARTMENT_AGENTS[dept]
        if (!agent) continue
        phases.push({ id: phaseId++, name: `تنفيذ — ${dept}`, agents: [agent], description: `تنفيذ الجزء المتعلق بقسم ${dept} من المتطلبات.`, dependsOn: dependsOnPhases, estimatedMinutes: analysis.complexity === 'simple' ? 5 : 15 })
      }
    }
    if (analysis.requiredDepartments.includes('development')) {
      phases.push({ id: phaseId++, name: 'مراجعة الجودة', agents: ['code-reviewer'], description: 'فحص الكود والمخرجات للتأكد من الجودة والأمان.', dependsOn: phases.filter(p => p.agents.some(a => a !== 'project-manager')).map(p => p.id), estimatedMinutes: 10 })
    }
    phases.push({ id: phaseId++, name: 'الدمج والتسليم النهائي', agents: ['project-manager'], description: 'مراجعة جميع المخرجات ودمجها وتقديم التقرير النهائي.', dependsOn: phases.slice(1).map(p => p.id), estimatedMinutes: 5 })
    return phases
  }

  private generateMasterPrompts(projectName: string, request: string, analysis: RequestAnalysis, phases: ExecutionPhase[]): MasterPrompt[] {
    const prompts: MasterPrompt[] = []
    const agentsSeen = new Set<string>()
    for (const phase of phases) {
      for (const agentName of phase.agents) {
        if (agentsSeen.has(agentName)) continue
        agentsSeen.add(agentName)
        const dept = Object.entries(this.DEPARTMENT_AGENTS).find(([, a]) => a === agentName)?.[0] || 'general'
        let memoryContext = ''
        try { memoryContext = buildAgentContext(projectName, agentName, request, [dept]) } catch {}
        const masterPrompt = this.buildMasterPromptText(agentName, projectName, request, analysis, phase, '', memoryContext)
        prompts.push({ agentName, department: dept, prompt: masterPrompt, priority: phase.dependsOn.length === 0 ? 'critical' : 'high', context: memoryContext })
      }
    }
    return prompts
  }

  private buildMasterPromptText(agentName: string, projectName: string, request: string, analysis: RequestAnalysis, phase: ExecutionPhase, personaPrompt: string, memoryContext: string): string {
    let prompt = `# 🎯 مهمة لـ ${agentName}\n\n**المشروع:** ${projectName}\n**المرحلة:** ${phase.name} (المرحلة ${phase.id})\n**الأولوية:** ${phase.dependsOn.length === 0 ? '🔴 حرجة' : '🟡 عالية'}\n\n`
    if (personaPrompt) prompt += `---\n${personaPrompt}\n---\n\n`
    prompt += `## 📋 طلب المستخدم الأصلي\n${request}\n\n## 📊 تحليل الطلب\n${analysis.summary}\n\n## 🎯 مهمتك المحددة\n${phase.description}\n\n`
    if (analysis.keyActions.length > 0) {
      prompt += `### الإجراءات المطلوبة:\n`
      analysis.keyActions.forEach((a, i) => { prompt += `${i + 1}. ${a}\n` })
      prompt += '\n'
    }
    if (memoryContext) prompt += `## 🧠 سياق من الذاكرة\n${memoryContext}\n\n`
    prompt += `## ⚠️ بروتوكول العمل\n1. اقرأ المتطلبات بالكامل قبل البدء.\n2. نفذ مهمتك المحددة فقط — لا تتجاوز نطاقك.\n3. عند الانتهاء، قدم مخرجاتك بشكل مفصل وواضح.\n4. إذا واجهت غموضاً، صعّد للقائد بدلاً من التخمين.\n5. سجّل أي قرار مهم اتخذته في الذاكرة المشتركة.\n`
    return prompt
  }

  public synthesizeResults(projectName: string, plan: ExecutionPlan, taskOutputs: Array<{ agent: string; task: string; output: string }>): string {
    let report = `# 📊 التقرير النهائي: ${projectName}\n\n> **الفئة:** ${plan.analysis.category}\n> **التعقيد:** ${plan.analysis.complexity}\n> **الأقسام المشاركة:** ${plan.analysis.requiredDepartments.length}\n> **الوكلاء:** ${plan.analysis.requiredAgents.length}\n\n## 📝 نتائج المراحل\n\n`
    for (const phase of plan.phases) {
      report += `### المرحلة ${phase.id}: ${phase.name}\n- **الوكلاء:** ${phase.agents.join(', ')}\n`
      const phaseOutputs = taskOutputs.filter(o => phase.agents.includes(o.agent))
      if (phaseOutputs.length > 0) {
        for (const out of phaseOutputs) { report += `\n**${out.agent}** — ${out.task}:\n${out.output}\n` }
      } else {
        report += `- ⏳ لم تُنجز بعد\n`
      }
      report += '\n'
    }
    report += `## 🎯 الخطوات التالية المقترحة\n1. مراجعة المخرجات أعلاه والتأكد من مطابقتها للمتطلبات\n2. تقديم ملاحظات على أي جزء يحتاج تحسين\n3. الموافقة على النتائج للانتقال للخطوة التالية\n`
    rememberNow(projectName, 'agent-zero', `تقرير نهائي مكتمل — ${taskOutputs.length} مخرجات من ${plan.analysis.requiredAgents.length} وكلاء`, 9)
    return report
  }

  public escalateToUser(escalation: any): string {
    return 'Escalation...'
  }

  private savePlan(projectName: string, plan: ExecutionPlan): void {
    try {
      const cwd = getOriginalCwd()
      const dir = path.join(cwd, '.claude', 'agency', 'projects', projectName)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const planPath = path.join(dir, 'execution-plan.json')
      fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf-8')
    } catch {}
  }

  public loadPlan(projectName: string): ExecutionPlan | null {
    try {
      const cwd = getOriginalCwd()
      const planPath = path.join(cwd, '.claude', 'agency', 'projects', projectName, 'execution-plan.json')
      if (!fs.existsSync(planPath)) return null
      return JSON.parse(fs.readFileSync(planPath, 'utf-8'))
    } catch {
      return null
    }
  }

  public launchProject(projectName: string, request: string): { plan: ExecutionPlan; team: TeamConfig } {
    const analysis = this.analyzeRequest(request)
    const plan = this.buildExecutionPlan(projectName, request, analysis)
    const team = createAgencyTeam(projectName, request)
    writeDailyLog('pipeline-run', `🧠 Agent Zero أطلق مشروع "${projectName}"`, { agent: 'agent-zero', details: `${analysis.category} | ${analysis.complexity} | ${plan.phases.length} مراحل | ${analysis.requiredAgents.length} وكلاء` })
    return { plan, team }
  }
}

export const agentZero = new AgentZero()

export const analyzeRequest = (request: string) => agentZero.analyzeRequest(request)
export const buildExecutionPlan = (projectName: string, request: string, analysis?: RequestAnalysis) => agentZero.buildExecutionPlan(projectName, request, analysis)
export const synthesizeResults = (projectName: string, plan: ExecutionPlan, taskOutputs: Array<{ agent: string; task: string; output: string }>) => agentZero.synthesizeResults(projectName, plan, taskOutputs)
export const launchProject = (projectName: string, request: string) => agentZero.launchProject(projectName, request)
