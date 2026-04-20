import type { BuiltinPluginDefinition } from '../../types/plugin.js'

export const chromeDevToolsPlugin: BuiltinPluginDefinition = {
  name: 'chrome-devtools',
  description: 'Chrome DevTools MCP Server (Native DOM inspection, tracing, and browser debugging)',
  defaultEnabled: true, // Easy integration by default
  mcpServers: {
    'chrome-devtools': {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-chrome-devtools'],
    },
  },
}
