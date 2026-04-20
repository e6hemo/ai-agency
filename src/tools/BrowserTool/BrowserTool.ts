import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseProgressMessage,
} from './UI.js'
import { BROWSER_TOOL_NAME, DESCRIPTION } from './prompt.js'
import { getWebFetchUserAgent } from '../../utils/http.js'
import { type PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { getRuleByContentsForTool } from '../../utils/permissions/permissions.js'
import { applyPromptToMarkdown } from '../WebFetchTool/utils.js'

let browser: any = null
let context: any = null
let page: any = null

async function getBrowserPage() {
  if (!page) {
    const { chromium } = await import('playwright-chromium')
    browser = await chromium.launch({ headless: true })
    context = await browser.newContext({
      userAgent: getWebFetchUserAgent(),
      bypassCSP: true,
      ignoreHTTPSErrors: true,
    })
    page = await context.newPage()
  }
  return page
}

export async function browserFetchTextFallback(url: string): Promise<string> {
  const p = await getBrowserPage()
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  const text = await p.evaluate(() => document.body.innerText)
  return text || ''
}

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum(['navigate', 'screenshot', 'execute_js', 'get_content']).describe('Browser action to perform'),
    url: z.string().url().optional().describe('URL to navigate to (required for "navigate" action)'),
    script: z.string().optional().describe('JavaScript code to execute (required for "execute_js" action)'),
    prompt: z.string().optional().describe('Optional prompt to extract specific information from the content'),
  }),
)

type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    code: z.number(),
    codeText: z.string(),
    result: z.string(),
    bytes: z.number(),
    screenshotPath: z.string().optional(),
  }),
)

type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const BrowserTool = buildTool({
  name: BROWSER_TOOL_NAME,
  searchHint: 'navigate websites, execute javascript, or take screenshots',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  async description() {
    return DESCRIPTION
  },
  async prompt(_options) {
    return DESCRIPTION
  },
  userFacingName() {
    return 'Browser'
  },
  getToolUseSummary,
  getActivityDescription(input) {
    return getToolUseSummary(input) || 'Using browser'
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  isConcurrencySafe() {
    return false
  },
  isReadOnly() {
    return false
  },
  toAutoClassifierInput(input) {
    return `${input.action}: ${input.url || input.script || ''}`
  },
  async checkPermissions(input, context): Promise<PermissionDecision> {
    const appState = context.getAppState()
    const permissionContext = appState.toolPermissionContext
    
    const action = input.action
    const url = input.url
    
    let ruleContentStr = `action:${action}`
    if (url) {
      try { ruleContentStr = `domain:${new URL(url).hostname}` } catch {}
    }
    
    const askRule = getRuleByContentsForTool(permissionContext, BrowserTool, 'ask').get(ruleContentStr)
    const denyRule = getRuleByContentsForTool(permissionContext, BrowserTool, 'deny').get(ruleContentStr)
    const allowRule = getRuleByContentsForTool(permissionContext, BrowserTool, 'allow').get(ruleContentStr)

    if (denyRule) return { behavior: 'deny', message: 'Access denied by rule.', decisionReason: { type: 'rule', rule: denyRule } }
    if (allowRule) return { behavior: 'allow', updatedInput: input, decisionReason: { type: 'rule', rule: allowRule } }
    
    return {
      behavior: 'ask',
      message: `Claude requested permission to run BrowserTool (${action}).`,
      suggestions: [
        {
          type: 'addRules',
          destination: 'localSettings',
          rules: [{ toolName: BROWSER_TOOL_NAME, ruleContent: ruleContentStr }],
          behavior: 'allow'
        }
      ]
    }
  },
  renderToolUseMessage,
  renderToolUseProgressMessage,
  renderToolResultMessage,
  async call(input, { abortController, options: { isNonInteractiveSession } }) {
    const { action, url, script, prompt } = input
    const p = await getBrowserPage()
    
    let rawContent = ''
    let screenshotPath = undefined
    
    try {
      if (action === 'navigate' && url) {
        await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        const TurndownService = (await import('turndown')).default;
        const turndownService = new TurndownService();
        const html = await p.evaluate(() => document.body.innerHTML);
        rawContent = turndownService.turndown(html);
      } else if (action === 'execute_js' && script) {
        const result = await p.evaluate(script)
        rawContent = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      } else if (action === 'get_content') {
        const TurndownService = (await import('turndown')).default;
        const turndownService = new TurndownService();
        const html = await p.evaluate(() => document.body.innerHTML);
        rawContent = turndownService.turndown(html);
      } else if (action === 'screenshot') {
        const os = await import('os')
        const path = await import('path')
        const tmpFile = path.join(os.tmpdir(), `browser-screenshot-${Date.now()}.png`)
        await p.screenshot({ path: tmpFile, fullPage: true })
        screenshotPath = tmpFile
        rawContent = `Screenshot saved to ${tmpFile}`
      } else {
        throw new Error(`Invalid action ${action} or missing parameters.`)
      }
      
      let finalResult = rawContent
      if (prompt && action !== 'screenshot') {
        finalResult = await applyPromptToMarkdown(prompt, rawContent, abortController.signal, isNonInteractiveSession, false)
      }
      
      const bytes = Buffer.byteLength(finalResult)
      
      return {
        data: {
          code: 200,
          codeText: 'OK',
          bytes,
          result: finalResult,
          screenshotPath,
        } satisfies Output
      }
    } catch (e: any) {
      return {
        data: {
          code: 500,
          codeText: 'Error',
          bytes: Buffer.byteLength(e.message),
          result: `Error executing browser action: ${e.message}`,
        }
      }
    }
  },
  mapToolResultToToolResultBlockParam({ result }, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: result,
    }
  },
} satisfies ToolDef<InputSchema, Output>)
