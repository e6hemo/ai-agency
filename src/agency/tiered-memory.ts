/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🧠 Tiered Memory System - الذاكرة الهرمية ثلاثية المستويات
 *
 * HOT  → المهمة الحالية فقط  (تنتهي بعد ساعتين، max 15)
 * WARM → سياق المشروع الكامل (max 50، الأقل أهمية يُرشف للـ COLD)
 * COLD → تاريخ القرارات      (دائم في JSON)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import * as fs   from 'fs'
import * as path from 'path'
import { getOriginalCwd } from '../bootstrap/state.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export type MemoryLevel = 'hot' | 'warm' | 'cold'

export interface MemoryEntry {
  id:           string
  level:        MemoryLevel
  projectName:  string
  agentName:    string
  content:      string
  tags:         string[]
  importance:   number       // 1-10
  createdAt:    string
  expiresAt?:   string       // hot فقط
  accessCount:  number
}

export interface MemoryQuery {
  projectName:   string
  level?:        MemoryLevel
  agentName?:    string
  tags?:         string[]
  minImportance?: number
  limit?:        number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HOT_MAX     = 15
const HOT_TTL_MS  = 2 * 60 * 60 * 1000   // ساعتان
const WARM_MAX    = 50

// ─── Storage ──────────────────────────────────────────────────────────────────

function getMemDir(projectName: string): string {
  const dir = path.join(
    getOriginalCwd(),
    '.claude', 'agency', 'memory', projectName
  )
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getFilePath(projectName: string, level: MemoryLevel): string {
  return path.join(getMemDir(projectName), `${level}.json`)
}

function loadLevel(projectName: string, level: MemoryLevel): MemoryEntry[] {
  const fp = getFilePath(projectName, level)
  if (!fs.existsSync(fp)) return []
  try {
    const data = JSON.parse(fs.readFileSync(fp, 'utf-8'))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function saveLevel(
  projectName: string,
  level:       MemoryLevel,
  entries:     MemoryEntry[]
): void {
  fs.writeFileSync(
    getFilePath(projectName, level),
    JSON.stringify(entries, null, 2),
    'utf-8'
  )
}

function makeId(level: MemoryLevel): string {
  const ts  = Date.now().toString(36)
  const rnd = Math.random().toString(36).slice(2, 6)
  return `${level}_${ts}_${rnd}`
}

// ─── HOT Memory ───────────────────────────────────────────────────────────────

export function writeHotMemory(
  projectName: string,
  agentName:   string,
  content:     string,
  tags:        string[] = [],
  importance:  number   = 5
): MemoryEntry {
  const now  = Date.now()
  let entries = loadLevel(projectName, 'hot')

  // احذف المنتهية
  entries = entries.filter(e =>
    !e.expiresAt || new Date(e.expiresAt).getTime() > now
  )

  const entry: MemoryEntry = {
    id:          makeId('hot'),
    level:       'hot',
    projectName,
    agentName,
    content,
    tags,
    importance:  Math.max(1, Math.min(10, importance)),
    createdAt:   new Date().toISOString(),
    expiresAt:   new Date(now + HOT_TTL_MS).toISOString(),
    accessCount: 0,
  }

  entries.push(entry)

  if (entries.length > HOT_MAX) {
    entries.sort((a, b) => b.importance - a.importance)
    entries = entries.slice(0, HOT_MAX)
  }

  saveLevel(projectName, 'hot', entries)
  return entry
}

export function readHotMemory(
  projectName: string,
  agentName?:  string
): MemoryEntry[] {
  const now  = Date.now()
  let entries = loadLevel(projectName, 'hot')

  entries = entries.filter(e =>
    !e.expiresAt || new Date(e.expiresAt).getTime() > now
  )

  if (agentName) {
    entries = entries.filter(e => e.agentName === agentName)
  }

  entries.forEach(e => e.accessCount++)
  saveLevel(projectName, 'hot', entries)

  return entries.sort((a, b) => b.importance - a.importance)
}

// ─── WARM Memory ──────────────────────────────────────────────────────────────

export function writeWarmMemory(
  projectName: string,
  agentName:   string,
  content:     string,
  tags:        string[] = [],
  importance:  number   = 6
): MemoryEntry {
  let entries = loadLevel(projectName, 'warm')

  const entry: MemoryEntry = {
    id:          makeId('warm'),
    level:       'warm',
    projectName,
    agentName,
    content,
    tags,
    importance:  Math.max(1, Math.min(10, importance)),
    createdAt:   new Date().toISOString(),
    accessCount: 0,
  }

  entries.push(entry)

  if (entries.length > WARM_MAX) {
    entries.sort((a, b) => {
      const sa = a.importance + a.accessCount * 0.5
      const sb = b.importance + b.accessCount * 0.5
      return sb - sa
    })

    // أرشف الأقل أهمية للـ COLD
    const toArchive = entries.slice(WARM_MAX)
    const cold      = loadLevel(projectName, 'cold')
    for (const e of toArchive) {
      cold.push({ ...e, level: 'cold' })
    }
    saveLevel(projectName, 'cold', cold)

    entries = entries.slice(0, WARM_MAX)
  }

  saveLevel(projectName, 'warm', entries)
  return entry
}

export function readWarmMemory(
  projectName: string,
  tags?:       string[]
): MemoryEntry[] {
  let entries = loadLevel(projectName, 'warm')

  if (tags && tags.length > 0) {
    entries = entries.filter(e =>
      tags.some(tag => e.tags.includes(tag))
    )
  }

  entries.forEach(e => e.accessCount++)
  saveLevel(projectName, 'warm', entries)

  return entries.sort((a, b) => b.importance - a.importance)
}

// ─── COLD Memory ──────────────────────────────────────────────────────────────

export function writeColdMemory(
  projectName: string,
  agentName:   string,
  content:     string,
  tags:        string[] = [],
  importance:  number   = 8
): MemoryEntry {
  const entries = loadLevel(projectName, 'cold')

  const entry: MemoryEntry = {
    id:          makeId('cold'),
    level:       'cold',
    projectName,
    agentName,
    content,
    tags,
    importance:  Math.max(1, Math.min(10, importance)),
    createdAt:   new Date().toISOString(),
    accessCount: 0,
  }

  entries.push(entry)

  if (entries.length > 500) {
    entries.sort((a, b) => b.importance - a.importance)
    saveLevel(projectName, 'cold', entries.slice(0, 300))
    return entry
  }

  saveLevel(projectName, 'cold', entries)
  return entry
}

export function searchColdMemory(
  projectName: string,
  keywords:    string[]
): MemoryEntry[] {
  return loadLevel(projectName, 'cold')
    .filter(e => {
      const text = (e.content + ' ' + e.tags.join(' ')).toLowerCase()
      return keywords.some(kw => text.includes(kw.toLowerCase()))
    })
    .sort((a, b) => b.importance - a.importance)
}

// ─── Smart Query ──────────────────────────────────────────────────────────────

export function queryMemory(query: MemoryQuery): MemoryEntry[] {
  const levels = query.level
    ? [query.level]
    : ['hot', 'warm', 'cold'] as MemoryLevel[]

  let results: MemoryEntry[] = []

  for (const level of levels) {
    let entries = loadLevel(query.projectName, level)

    if (query.agentName) {
      entries = entries.filter(e => e.agentName === query.agentName)
    }
    if (query.tags?.length) {
      entries = entries.filter(e =>
        query.tags!.some(tag => e.tags.includes(tag))
      )
    }
    if (query.minImportance) {
      entries = entries.filter(e => e.importance >= query.minImportance!)
    }

    results.push(...entries)
  }

  const order: Record<MemoryLevel, number> = { hot: 3, warm: 2, cold: 1 }

  results.sort((a, b) => {
    const diff = order[b.level] - order[a.level]
    return diff !== 0 ? diff : b.importance - a.importance
  })

  return results.slice(0, query.limit ?? 20)
}

// ─── Agent Context Builder ────────────────────────────────────────────────────

export function buildAgentContext(
  projectName:  string,
  agentName:    string,
  currentTask:  string,
  relevantTags: string[] = []
): string {
  const hot    = readHotMemory(projectName, agentName)
  const warm   = readWarmMemory(projectName, relevantTags)
  const cold   = relevantTags.length > 0
    ? searchColdMemory(projectName, relevantTags)
    : []

  let ctx = `## 🧠 ذاكرة النظام للوكيل: ${agentName}\n\n`
  ctx    += `### المهمة الحالية\n${currentTask}\n\n`

  if (hot.length > 0) {
    ctx += `### 🔥 ذاكرة فورية\n`
    hot.slice(0, 5).forEach(e => {
      ctx += `- [${e.agentName}]: ${e.content}\n`
    })
    ctx += '\\n'
  }

  if (warm.length > 0) {
    ctx += `### ♨️ سياق المشروع\n`
    warm.slice(0, 5).forEach(e => {
      ctx += `- [${e.agentName}] (${e.tags.join(', ')}):\n  ${e.content}\n`
    })
    ctx += '\\n'
  }

  if (cold.length > 0) {
    ctx += `### 🗃️ قرارات ذات صلة\n`
    cold.slice(0, 3).forEach(e => {
      ctx += `- ${e.content}\n`
    })
    ctx += '\\n'
  }

  return ctx
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export function getMemoryStats(projectName: string): {
  hot: number; warm: number; cold: number; total: number
} {
  const hot  = loadLevel(projectName, 'hot').length
  const warm = loadLevel(projectName, 'warm').length
  const cold = loadLevel(projectName, 'cold').length
  return { hot, warm, cold, total: hot + warm + cold }
}
