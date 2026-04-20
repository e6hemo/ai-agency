import React from 'react'
import { MessageResponse } from '../../components/MessageResponse.js'
import { Box, Text } from '../../ink.js'
import { formatFileSize, truncate } from '../../utils/format.js'
import type { Output } from './BrowserTool.js'

export function getToolUseSummary(input: Partial<{
  action: 'navigate' | 'screenshot' | 'execute_js' | 'get_content'
  url: string
  script: string
  prompt: string
}> | undefined): string | null {
  if (!input?.action) return 'Using Browser Tool'
  const action = input.action
  const url = input.url
  
  if (action === 'navigate' && url) {
    try {
      return `Navigating to ${new URL(url).hostname}`
    } catch {
      return `Navigating to ${url}`
    }
  }
  
  if (action === 'screenshot') return 'Capturing screenshot'
  if (action === 'execute_js') return 'Executing JavaScript'
  if (action === 'get_content') return 'Extracting page content'
  
  return 'Using Browser Tool'
}

export function renderToolUseMessage(
  input: Partial<{
    action: 'navigate' | 'screenshot' | 'execute_js' | 'get_content'
    url: string
    script: string
    prompt: string
  }>,
  { verbose }: { theme?: string; verbose: boolean }
): React.ReactNode {
  if (verbose) {
    return `Browser action: ${input.action}${input.url ? ` url="` + input.url + `"` : ''}`
  }
  return getToolUseSummary(input)
}

export function renderToolUseProgressMessage(): React.ReactNode {
  return (
    <MessageResponse height={1}>
      <Text dimColor>Browser running…</Text>
    </MessageResponse>
  )
}

export function renderToolResultMessage(
  output: Output,
  _progressMessagesForMessage: any[],
  { verbose }: { theme?: string; verbose: boolean }
): React.ReactNode {
  const formattedSize = formatFileSize(output.bytes)
  if (verbose) {
    return (
      <Box flexDirection="column">
        <MessageResponse height={1}>
          <Text>
            Browser action completed. {output.screenshotPath ? 'Saved screenshot.' : `Content: ${formattedSize}`} ({output.code} {output.codeText})
          </Text>
        </MessageResponse>
        <Box flexDirection="column">
          <Text>{truncate(output.result, 500)}</Text>
        </Box>
      </Box>
    )
  }
  return (
    <MessageResponse height={1}>
      <Text>
        Browser completed. {output.screenshotPath ? 'Saved screenshot.' : `Content: ${formattedSize}`} ({output.code} {output.codeText})
      </Text>
    </MessageResponse>
  )
}
