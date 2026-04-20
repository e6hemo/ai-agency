import * as fs from 'fs'
import * as path from 'path'
import { getOriginalCwd } from '../bootstrap/state.js'
import { updateProjectContext, getProjectContext, updateProjectState } from './shared-memory.js'
import { createAgencyTeam } from './team-orchestrator.js'
import { launchProject, analyzeRequest, buildExecutionPlan, type RequestAnalysis, type ExecutionPlan } from './agent-zero.js'

export interface OrchestratorInitResult {
  projectName: string
  contextPath: string
  statePath: string
  status: string
  /** تحليل Agent Zero للطلب (إن كان متاحاً) */
  analysis?: RequestAnalysis
  /** خطة التنفيذ (إن كان متاحاً) */
  executionPlan?: ExecutionPlan
}

function loadAgencyConfig(): any {
  const cwd = getOriginalCwd()
  const configPath = path.join(cwd, '.claude', 'agency-config.json')
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  } catch {
    return {}
  }
}

/**
 * Initializes a project's shared memory AND state file based on a general user request.
 * Sets up context.md (narrative) and state.json (structured tracking) so the
 * project manager can resume from a known checkpoint at any time.
 *
 * في وضع Team Mode: يستخدم Agent Zero لتحليل الطلب وبناء خطة ذكية.
 */
export function initializeProjectAndPlan(projectName: string, request: string): OrchestratorInitResult {
  const config = loadAgencyConfig()
  
  if (config?.agency?.teamMode) {
    // ─── Agent Zero Mode (Smart Analysis + Team) ───
    const analysis = analyzeRequest(request)
    const plan = buildExecutionPlan(projectName, request, analysis)
    const team = createAgencyTeam(projectName, request)
    const ctx = getProjectContext(projectName)
    const statePath = ctx.contextPath.replace('context.md', 'state.json')

    // Build enriched context with Agent Zero analysis
    const enrichedContext = buildAgentZeroContext(projectName, request, analysis, plan)
    updateProjectContext(projectName, enrichedContext)

    return {
      projectName,
      contextPath: ctx.contextPath,
      statePath,
      status: `🧠 Agent Zero حلّل الطلب → ${analysis.category} (${analysis.complexity})\n` +
              `📋 خطة بـ ${plan.phases.length} مراحل → فريق "${team.teamName}" بـ ${team.teammates.length} أعضاء.\n` +
              `⏱️ الوقت المقدر: ${analysis.estimatedMinutes} دقيقة`,
      analysis,
      executionPlan: plan,
    }
  } else {
    // ─── Sequential Pipeline Mode (Legacy) ───
    const initialState = updateProjectState(projectName, {
      status: 'pending',
      currentStep: 'Planning',
    })

    const initialPlan = `
# مشروع: ${projectName}

## متطلبات المستخدم الأساسية
${request}

## التوجيهات لمدير المشاريع (Project Manager)

**قبل البدء:**
اقرأ ملف state.json عبر أداة SharedMemory (read-state) لمعرفة الخطوة الحالية وإن كان المشروع له تاريخ سابق.

**أثناء التنفيذ:**
1. استخدم AgencyPipelineTool لتحديد الوكلاء والترتيب (إن كان هناك pipeline مناسب).
2. استدعِ كل وكيل بالترتيب المحدد عبر AgentTool مع تمرير سياق المشروع.
3. **بروتوكول ضبط الجودة (QA) — إلزامي:**
   - بعد انتهاء كل وكيل من خطوته، قيّم المخرجات مقارنةً بمتطلبات المستخدم.
   - إذا كانت المخرجات مكتملة وكافية: سجّل اكتمال الخطوة بـ SharedMemory (update-state) ثم انتقل للتالي.
   - إذا كانت المخرجات ناقصة أو خاطئة: أعد العمل للوكيل ذاته مع تغذية راجعة محددة. لا تنتقل قبل الموافقة.
4. عند اكتمال جميع الخطوات: حدّث حالة المشروع إلى completed وأبلغ المستخدم بملخص شامل.

---
**حالة المشروع الحالية:** ${initialState.status} (خطوة: ${initialState.currentStep})
`.trim()

    const ctx = getProjectContext(projectName)
    updateProjectContext(projectName, initialPlan)
    const statePath = ctx.contextPath.replace('context.md', 'state.json')

    return {
      projectName,
      contextPath: ctx.contextPath,
      statePath,
      status: 'تم تهيئة المشروع بنجاح — context.md و state.json جاهزان (وضع Pipeline).',
    }
  }
}

/**
 * يبني سياقاً غنياً يعتمد على تحليل Agent Zero.
 */
function buildAgentZeroContext(
  projectName: string,
  request: string,
  analysis: RequestAnalysis,
  plan: ExecutionPlan,
): string {
  let md = `# 🧠 مشروع: ${projectName}\n\n`
  md += `> **تحليل Agent Zero:** ${analysis.category} | ${analysis.complexity}\n`
  md += `> **الأقسام:** ${analysis.requiredDepartments.join(', ')}\n`
  md += `> **الوكلاء:** ${analysis.requiredAgents.join(', ')}\n\n`

  md += `## 📋 متطلبات المستخدم\n${request}\n\n`

  md += `## 🎯 الإجراءات المستخلصة\n`
  analysis.keyActions.forEach((a, i) => {
    md += `${i + 1}. ${a}\n`
  })
  md += '\n'

  md += `## 📊 خطة التنفيذ (${plan.phases.length} مراحل)\n\n`
  for (const phase of plan.phases) {
    const deps = phase.dependsOn.length > 0 ? ` (يعتمد على: ${phase.dependsOn.join(', ')})` : ' (بدون اعتماديات)'
    md += `### المرحلة ${phase.id}: ${phase.name}\n`
    md += `- **الوكلاء:** ${phase.agents.join(', ')}\n`
    md += `- **الوصف:** ${phase.description}\n`
    md += `- **الوقت المقدر:** ${phase.estimatedMinutes} دقيقة${deps}\n\n`
  }

  md += `## ⚠️ بروتوكول العمل\n`
  md += `1. كل وكيل يتلقى Master Prompt مخصص مع شخصيته وقواعده.\n`
  md += `2. مخرجات كل وكيل تمر عبر Quality Gates Engine قبل اعتبارها مكتملة.\n`
  md += `3. إذا رُفضت المخرجات: يعود الوكيل مع تغذية راجعة محددة.\n`
  md += `4. عند اكتمال جميع المراحل: Agent Zero يدمج النتائج ويقدم تقريراً شاملاً.\n`

  if (analysis.needsApproval) {
    md += `\n> ⚠️ **هذا المشروع معقد ويحتاج موافقة المستخدم قبل التنفيذ.**\n`
  }

  return md
}
