import * as fs from 'fs'
import * as path from 'path'
import { getOriginalCwd } from '../bootstrap/state.js'

export interface PipelineConfig {
  description: string
  steps: string[]
}

export function getPipeline(pipelineName: string): PipelineConfig | null {
  const cwd = getOriginalCwd()
  const configPath = path.join(cwd, '.claude', 'agency-config.json')
  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    const config = JSON.parse(raw)
    return config.agency.pipelines[pipelineName] || null
  } catch {
    return null
  }
}

export function listPipelines(): Record<string, PipelineConfig> {
  const cwd = getOriginalCwd()
  const configPath = path.join(cwd, '.claude', 'agency-config.json')
  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    const config = JSON.parse(raw)
    return config.agency.pipelines || {}
  } catch {
    return {}
  }
}
