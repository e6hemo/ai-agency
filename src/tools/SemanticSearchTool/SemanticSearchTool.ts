import { z } from 'zod/v4'
import Fuse from 'fuse.js'
import fs from 'fs'
import path from 'path'
import { buildTool, type ToolDef, type ValidationResult } from '../../Tool.js'
import { getCwd } from '../../utils/cwd.js'
import { glob } from '../../utils/glob.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { toRelativePath } from '../../utils/path.js'
import { checkReadPermissionForTool } from '../../utils/permissions/filesystem.js'
import {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseErrorMessage,
  renderToolUseMessage,
} from './UI.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'
import { DESCRIPTION, SEMANTIC_SEARCH_TOOL_NAME } from './prompt.js'

let fuseIndex: Fuse<FileChunk> | null = null
let indexedCwd: string | null = null

interface FileChunk {
  filepath: string
  content: string
}

const inputSchema = lazySchema(() =>
  z.strictObject({
    query: z
      .string()
      .describe('The natural language semantic query to search for'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    durationMs: z.number().describe('Time taken to search'),
    results: z.array(
      z.object({
        filepath: z.string(),
        snippet: z.string(),
        score: z.number().optional(),
      })
    ),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
export type Output = z.infer<OutputSchema>

export const SemanticSearchTool = buildTool({
  name: SEMANTIC_SEARCH_TOOL_NAME,
  searchHint: 'hybrid conceptual codebase search',
  maxResultSizeChars: 100_000,
  async description() {
    return DESCRIPTION
  },
  userFacingName: () => 'Semantic Search',
  getToolUseSummary,
  renderToolUseMessage,
  renderToolUseErrorMessage,
  renderToolResultMessage,
  getActivityDescription(input) {
    return `Conceptual search for: ${input?.query ?? 'files'}`
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
    return true
  },
  toAutoClassifierInput(input) {
    return input?.query ?? ''
  },
  isSearchOrReadCommand() {
    return { isSearch: true, isRead: false }
  },
  getPath(): string {
    return getCwd()
  },
  async preparePermissionMatcher() {
    return () => true
  },
  async validateInput(): Promise<ValidationResult> {
    return { result: true }
  },
  async checkPermissions(input, context): Promise<PermissionDecision> {
    const appState = context.getAppState()
    return checkReadPermissionForTool(
      SemanticSearchTool,
      input,
      appState.toolPermissionContext,
    )
  },
  async prompt() {
    return DESCRIPTION
  },
  extractSearchText({ results }) {
    return results.map(r => r.filepath + '\n' + r.snippet).join('\n---\n')
  },
  async call(input, { abortController, getAppState }) {
    const start = Date.now()
    const cwd = getCwd()

    const appState = getAppState()
    // Use glob to find all text-like source files
    const { files } = await glob(
      '**/*.{ts,tsx,js,jsx,md,json,jsonc,yaml,yml,py,go,rs,cpp,h}',
      cwd,
      { limit: 2000, offset: 0 },
      abortController.signal,
      appState.toolPermissionContext,
    )

    const { getSemanticMatches } = await import('./RAGIndexer.js')
    const results = await getSemanticMatches(input.query, files, cwd, 5)

    const output: Output = {
      durationMs: Date.now() - start,
      results,
    }
    
    return { data: output }
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    if (output.results.length === 0) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: 'No semantic matches found in the project. Try rephrasing the query or using different terminology.',
      }
    }

    const report = output.results.map((r, i) => 
      `Result ${i+1}: ${r.filepath} (Score: ${r.score?.toFixed(2) ?? '?'})\n\`\`\`\n${r.snippet}\n\`\`\``
    ).join('\n\n')

    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `Found the following relevant snippets:\n\n${report}`,
    }
  },
} satisfies ToolDef<InputSchema, Output>)
