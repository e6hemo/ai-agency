/**
 * Agency command — manage and interact with the AI Agency.
 * Subcommands:
 *   /agency          — Show agency dashboard overview
 *   /agency team     — Show all departments and agents
 *   /agency pipeline — List available pipelines
 *   /agency report   — Generate a performance report
 *   /agency templates — List available task templates
 *   /agency init     — Initialize a new project and format the plan
 *   /agency status   — Show live project state & step history
 *   /agency train    — Train a specific agent with external context/files
 *   /agency keys     — Manage API keys securely in the local keychain
 */
import type { Command } from '../../commands.js'

const agency = {
  type: 'local',
  name: 'agency',
  description:
    'إدارة وكالة الذكاء الاصطناعي — عرض الفريق، الأقسام، والمهام المنسقة',
  aliases: ['وكالة'],
  argumentHint: '[team|pipeline|report|templates|init|status|train|keys]',
  supportsNonInteractive: true,
  load: () => import('./agency.js'),
} satisfies Command

export default agency
