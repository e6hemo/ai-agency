import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import React from 'react'
import { MessageResponse } from '../../components/MessageResponse.js'
import { FallbackToolUseErrorMessage } from '../../components/FallbackToolUseErrorMessage.js'
import { Box, Text } from '../../ink.js'
import type { Output } from './SemanticSearchTool.js'

export function getToolUseSummary(input: Partial<{ query: string }> | undefined): string | null {
  if (!input?.query) return null
  return `Semantic search: "${input.query.slice(0, 40)}${input.query.length > 40 ? '...' : ''}"`
}

export function renderToolUseMessage(input: Partial<{ query: string }>): React.ReactNode {
  return input?.query ? `Semantic search: "${input.query}"` : null
}

export function renderToolUseErrorMessage(
  result: ToolResultBlockParam['content'],
  { verbose }: { verbose: boolean }
): React.ReactNode {
  return <FallbackToolUseErrorMessage result={result} verbose={verbose} />
}

export function renderToolResultMessage(output: Output): React.ReactNode {
  return (
    <Box justifyContent="space-between" width="100%">
      <MessageResponse height={1}>
        <Text>
          Found {output.results.length} semantic matches in {output.durationMs}ms
        </Text>
      </MessageResponse>
    </Box>
  )
}
