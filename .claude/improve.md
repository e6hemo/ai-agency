الملف الأول: mempalace.ts (v2)
TypeScript

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🏛️ MemPalace v2 - Enhanced SQLite Memory System
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import Database from 'better-sqlite3'
import * as path from 'path'
import * as fs from 'fs'
import { getOriginalCwd } from '../bootstrap/state.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Wing {
  id: string
  name: string
  created_at: string
}

export interface Room {
  id: string
  wing_id: string
  name: string
  created_at: string
}

export interface Drawer {
  id: string
  room_id: string
  content: string
  agent: string
  importance: number
  tags: string
  access_count: number
  timestamp: string
}

export interface DrawerInput {
  content: string
  agent?: string
  importance?: number
  tags?: string[]
}

export interface SearchOptions {
  limit?: number
  minImportance?: number
  agent?: string
  useOR?: boolean
}

// ─── MemPalace Class ──────────────────────────────────────────────────────────

export class MemPalace {
  private db: Database.Database
  private stmts!: {
    getWing:         Database.Statement
    insertWing:      Database.Statement
    getRoom:         Database.Statement
    insertRoom:      Database.Statement
    insertDrawer:    Database.Statement
    getDrawer:       Database.Statement
    getByRoom:       Database.Statement
    countByRoom:     Database.Statement
    deleteOldest:    Database.Statement
    incrementAccess: Database.Statement
    getStats:        Database.Statement
  }

  private static readonly MAX_DRAWERS_PER_ROOM = 200
  private static readonly ARCHIVE_KEEP         = 150

  constructor() {
    const cwd    = getOriginalCwd()
    const dbDir  = path.join(cwd, '.claude', 'agency')
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })

    const dbPath = path.join(dbDir, 'mempalace.db')
    this.db      = new Database(dbPath)

    this.initPragmas()
    this.initSchema()
    this.initStatements()
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  private initPragmas(): void {
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('cache_size = -64000')
    this.db.pragma('temp_store = MEMORY')
    this.db.pragma('mmap_size = 268435456')
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS wings (
        id         TEXT PRIMARY KEY,
        name       TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS rooms (
        id         TEXT PRIMARY KEY,
        wing_id    TEXT NOT NULL,
        name       TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (wing_id) REFERENCES wings(id),
        UNIQUE(wing_id, name)
      );

      CREATE TABLE IF NOT EXISTS drawers (
        id           TEXT PRIMARY KEY,
        room_id      TEXT NOT NULL,
        content      TEXT NOT NULL,
        agent        TEXT NOT NULL DEFAULT 'System',
        importance   INTEGER NOT NULL DEFAULT 5,
        tags         TEXT NOT NULL DEFAULT '[]',
        access_count INTEGER NOT NULL DEFAULT 0,
        timestamp    DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES rooms(id)
      );

      CREATE INDEX IF NOT EXISTS idx_drawers_room
        ON drawers(room_id);

      CREATE INDEX IF NOT EXISTS idx_drawers_importance
        ON drawers(room_id, importance DESC);

      CREATE INDEX IF NOT EXISTS idx_drawers_agent
        ON drawers(agent);

      CREATE INDEX IF NOT EXISTS idx_drawers_timestamp
        ON drawers(room_id, timestamp DESC);

      CREATE VIRTUAL TABLE IF NOT EXISTS drawers_fts
      USING fts5(
        content,
        tags,
        agent,
        drawer_id UNINDEXED,
        tokenize = 'unicode61'
      );

      CREATE TRIGGER IF NOT EXISTS drawers_fts_insert
      AFTER INSERT ON drawers BEGIN
        INSERT INTO drawers_fts(content, tags, agent, drawer_id)
        VALUES (NEW.content, NEW.tags, NEW.agent, NEW.id);
      END;

      CREATE TRIGGER IF NOT EXISTS drawers_fts_delete
      AFTER DELETE ON drawers BEGIN
        DELETE FROM drawers_fts WHERE drawer_id = OLD.id;
      END;
    `)
  }

  private initStatements(): void {
    this.stmts = {
      getWing: this.db.prepare(
        'SELECT * FROM wings WHERE name = ?'
      ),
      insertWing: this.db.prepare(
        'INSERT INTO wings (id, name) VALUES (?, ?)'
      ),
      getRoom: this.db.prepare(
        'SELECT * FROM rooms WHERE wing_id = ? AND name = ?'
      ),
      insertRoom: this.db.prepare(
        'INSERT INTO rooms (id, wing_id, name) VALUES (?, ?, ?)'
      ),
      insertDrawer: this.db.prepare(
        `INSERT INTO drawers (id, room_id, content, agent, importance, tags)
         VALUES (?, ?, ?, ?, ?, ?)`
      ),
      getDrawer: this.db.prepare(
        'SELECT * FROM drawers WHERE id = ?'
      ),
      getByRoom: this.db.prepare(
        `SELECT * FROM drawers
         WHERE room_id = ?
         ORDER BY importance DESC, timestamp DESC
         LIMIT ?`
      ),
      countByRoom: this.db.prepare(
        'SELECT COUNT(*) as c FROM drawers WHERE room_id = ?'
      ),
      deleteOldest: this.db.prepare(
        `DELETE FROM drawers
         WHERE room_id = ?
         AND id IN (
           SELECT id FROM drawers
           WHERE room_id = ?
           ORDER BY importance ASC, access_count ASC, timestamp ASC
           LIMIT ?
         )`
      ),
      incrementAccess: this.db.prepare(
        'UPDATE drawers SET access_count = access_count + 1 WHERE id = ?'
      ),
      getStats: this.db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM wings)   AS wings,
          (SELECT COUNT(*) FROM rooms)   AS rooms,
          (SELECT COUNT(*) FROM drawers) AS drawers
      `),
    }
  }

  // ─── ID Generator ──────────────────────────────────────────────────────────

  private generateId(): string {
    const ts  = Date.now().toString(36)
    const rnd = Math.random().toString(36).substring(2, 8)
    const pid = (process.pid % 1000).toString(36).padStart(2, '0')
    return `${ts}-${pid}-${rnd}`
  }

  // ─── Wings ─────────────────────────────────────────────────────────────────

  public ensureWing(wingName: string): Wing {
    const existing = this.stmts.getWing.get(wingName) as Wing | undefined
    if (existing) return existing
    const id = this.generateId()
    this.stmts.insertWing.run(id, wingName)
    return this.stmts.getWing.get(wingName) as Wing
  }

  // ─── Rooms ─────────────────────────────────────────────────────────────────

  public ensureRoom(wingName: string, roomName: string): Room {
    const wing     = this.ensureWing(wingName)
    const existing = this.stmts.getRoom.get(wing.id, roomName) as Room | undefined
    if (existing) return existing
    const id = this.generateId()
    this.stmts.insertRoom.run(id, wing.id, roomName)
    return this.stmts.getRoom.get(wing.id, roomName) as Room
  }

  public getRooms(wingName: string): Room[] {
    const wing = this.ensureWing(wingName)
    return this.db
      .prepare('SELECT * FROM rooms WHERE wing_id = ? ORDER BY name')
      .all(wing.id) as Room[]
  }

  // ─── Drawers ───────────────────────────────────────────────────────────────

  public addDrawer(
    wingName:   string,
    roomName:   string,
    content:    string,
    agent:      string   = 'System',
    importance: number   = 5,
    tags:       string[] = []
  ): Drawer {
    const room  = this.ensureRoom(wingName, roomName)
    const id    = this.generateId()
    const count = (this.stmts.countByRoom.get(room.id) as { c: number }).c

    if (count >= MemPalace.MAX_DRAWERS_PER_ROOM) {
      const toDelete = count - MemPalace.ARCHIVE_KEEP
      this.stmts.deleteOldest.run(room.id, room.id, toDelete)
    }

    const clamped  = Math.max(1, Math.min(10, importance))
    const tagsJson = JSON.stringify(tags)
    this.stmts.insertDrawer.run(id, room.id, content, agent, clamped, tagsJson)
    return this.stmts.getDrawer.get(id) as Drawer
  }

  public addDrawerEx(
    wingName: string,
    roomName: string,
    input:    DrawerInput
  ): Drawer {
    return this.addDrawer(
      wingName,
      roomName,
      input.content,
      input.agent      ?? 'System',
      input.importance ?? 5,
      input.tags       ?? []
    )
  }

  // ─── Read ──────────────────────────────────────────────────────────────────

  public getDrawersByRoom(
    wingName: string,
    roomName: string,
    limit:    number = 50
  ): Drawer[] {
    const wing = this.db
      .prepare('SELECT * FROM wings WHERE name = ?')
      .get(wingName) as Wing | undefined
    if (!wing) return []

    const room = this.db
      .prepare('SELECT * FROM rooms WHERE wing_id = ? AND name = ?')
      .get(wing.id, roomName) as Room | undefined
    if (!room) return []

    const drawers = this.stmts.getByRoom.all(room.id, limit) as Drawer[]

    const updateMany = this.db.transaction((ids: string[]) => {
      for (const id of ids) this.stmts.incrementAccess.run(id)
    })
    updateMany(drawers.map(d => d.id))

    return drawers
  }

  // ─── Search (FTS5) ─────────────────────────────────────────────────────────

  public searchAllDrawers(
    wingName: string,
    keywords: string[],
    options:  SearchOptions = {}
  ): Drawer[] {
    const wing = this.db
      .prepare('SELECT * FROM wings WHERE name = ?')
      .get(wingName) as Wing | undefined
    if (!wing) return []

    const {
      limit         = 30,
      minImportance = 1,
      agent,
      useOR         = true,
    } = options

    const sanitized = keywords
      .map(k => k.replace(/['"*]/g, '').trim())
      .filter(k => k.length > 1)
    if (sanitized.length === 0) return []

    const ftsQuery = useOR
      ? sanitized.join(' OR ')
      : sanitized.join(' AND ')

    let sql = `
      SELECT d.*
      FROM drawers d
      JOIN rooms r        ON d.room_id   = r.id
      JOIN drawers_fts fts ON fts.drawer_id = d.id
      WHERE r.wing_id     = ?
        AND drawers_fts   MATCH ?
        AND d.importance  >= ?
    `
    const params: any[] = [wing.id, ftsQuery, minImportance]

    if (agent) {
      sql += ` AND d.agent = ?`
      params.push(agent)
    }

    sql += ` ORDER BY rank, d.importance DESC LIMIT ?`
    params.push(limit)

    try {
      const results = this.db.prepare(sql).all(...params) as Drawer[]
      const updateMany = this.db.transaction((ids: string[]) => {
        for (const id of ids) this.stmts.incrementAccess.run(id)
      })
      updateMany(results.map(d => d.id))
      return results
    } catch {
      return this.searchFallback(wing.id, sanitized, limit, minImportance)
    }
  }

  private searchFallback(
    wingId:       string,
    keywords:     string[],
    limit:        number,
    minImportance: number
  ): Drawer[] {
    const conditions = keywords.map(() => `d.content LIKE ?`).join(' OR ')
    const params     = keywords.map(k => `%${k}%`)
    const sql = `
      SELECT d.*
      FROM drawers d
      JOIN rooms r ON d.room_id = r.id
      WHERE r.wing_id    = ?
        AND (${conditions})
        AND d.importance >= ?
      ORDER BY d.importance DESC, d.timestamp DESC
      LIMIT ?
    `
    return this.db
      .prepare(sql)
      .all(wingId, ...params, minImportance, limit) as Drawer[]
  }

  // ─── Agent Context Builder ─────────────────────────────────────────────────

  public buildAgentContext(
    wingName:     string,
    agentName:    string,
    taskDescription: string,
    relevantTags: string[] = []
  ): string {
    const taskKeywords = taskDescription
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 8)

    const allKeywords = [...taskKeywords, ...relevantTags]

    const results = this.searchAllDrawers(wingName, allKeywords, {
      limit: 10,
      minImportance: 4,
      useOR: true,
    })

    const agentMemory = this.getDrawersByRoom(
      wingName,
      `${agentName}Diary`,
      5
    )

    if (results.length === 0 && agentMemory.length === 0) {
      return `## 🧠 ذاكرة النظام\nلا توجد ذاكرة سابقة ذات صلة.\n`
    }

    let context = `## 🧠 ذاكرة النظام للوكيل: ${agentName}\n\n`

    if (agentMemory.length > 0) {
      context += `### 📔 يومياتك السابقة\n`
      agentMemory.forEach(d => {
        const time = new Date(d.timestamp).toLocaleDateString('ar-SA')
        context += `- **${time}**: ${d.content.substring(0, 200)}\n`
      })
      context += '\n'
    }

    if (results.length > 0) {
      context += `### 🔍 ذكريات ذات صلة بمهمتك\n`
      results.forEach(d => {
        context += `- **[${d.agent}]** (أهمية: ${d.importance}/10):\n`
        context += `  ${d.content.substring(0, 300)}\n`
      })
      context += '\n'
    }

    return context
  }

  // ─── Stats & Maintenance ───────────────────────────────────────────────────

  public getStats(): {
    wings: number; rooms: number; drawers: number; dbSizeKB: number
  } {
    try {
      const counts  = this.stmts.getStats.get() as {
        wings: number; rooms: number; drawers: number
      }
      const cwd     = getOriginalCwd()
      const dbPath  = path.join(cwd, '.claude', 'agency', 'mempalace.db')
      const dbSizeKB = fs.existsSync(dbPath)
        ? Math.round(fs.statSync(dbPath).size / 1024)
        : 0
      return { ...counts, dbSizeKB }
    } catch {
      return { wings: 0, rooms: 0, drawers: 0, dbSizeKB: 0 }
    }
  }

  public vacuum(): void {
    this.db.exec('VACUUM')
    this.db.exec('ANALYZE')
  }

  public clearWing(wingName: string): boolean {
    const wing = this.stmts.getWing.get(wingName) as Wing | undefined
    if (!wing) return false
    this.db.transaction(() => {
      this.db.prepare(`
        DELETE FROM drawers
        WHERE room_id IN (SELECT id FROM rooms WHERE wing_id = ?)
      `).run(wing.id)
      this.db.prepare('DELETE FROM rooms WHERE wing_id = ?').run(wing.id)
      this.db.prepare('DELETE FROM wings WHERE id = ?').run(wing.id)
    })()
    return true
  }

  public close(): void {
    this.db.close()
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const memoryPalace = new MemPalace()

process.on('exit',   () => memoryPalace.close())
process.on('SIGINT', () => { memoryPalace.close(); process.exit(0) })
process.on('SIGTERM',() => { memoryPalace.close(); process.exit(0) })
الملف الثاني: task-lock-manager.ts
TypeScript

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔒 Task Lock Manager
 * حل مشكلة Race Condition عند المطالبة بالمهام في البيئة المتوازية
 * يستخدم File-based Atomic Locking
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import * as fs   from 'fs'
import * as path from 'path'
import { getOriginalCwd } from '../bootstrap/state.js'

// ─── Constants ────────────────────────────────────────────────────────────────

const LOCK_TIMEOUT_MS = 5000   // القفل ينتهي بعد 5 ثوان
const LOCK_RETRY_MS   = 50     // إعادة المحاولة كل 50ms

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLockDir(): string {
  const dir = path.join(getOriginalCwd(), '.claude', 'agency', 'locks')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getLockPath(teamName: string, taskId: string): string {
  return path.join(getLockDir(), `${teamName}__${taskId}.lock`)
}

function isLockExpired(lockPath: string): boolean {
  try {
    const stat = fs.statSync(lockPath)
    return Date.now() - stat.mtimeMs > LOCK_TIMEOUT_MS
  } catch {
    return true
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── Core: Atomic Lock ────────────────────────────────────────────────────────

async function acquireLock(
  teamName:  string,
  taskId:    string,
  agentName: string,
  timeoutMs: number = 3000
): Promise<boolean> {
  const lockPath = getLockPath(teamName, taskId)
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (fs.existsSync(lockPath)) {
      if (isLockExpired(lockPath)) {
        try { fs.unlinkSync(lockPath) } catch { /* تجاهل */ }
      } else {
        await sleep(LOCK_RETRY_MS)
        continue
      }
    }

    try {
      fs.writeFileSync(
        lockPath,
        JSON.stringify({
          agent:    agentName,
          taskId,
          teamName,
          lockedAt: new Date().toISOString(),
        }),
        { flag: 'wx' }   // wx = يفشل إذا الملف موجود (atomic)
      )
      return true
    } catch (err: any) {
      if (err.code === 'EEXIST') {
        await sleep(LOCK_RETRY_MS)
        continue
      }
      throw err
    }
  }

  return false
}

function releaseLock(teamName: string, taskId: string): void {
  try {
    const lockPath = getLockPath(teamName, taskId)
    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath)
  } catch { /* تجاهل */ }
}

// ─── Main Export: claimTaskSafe ───────────────────────────────────────────────

export interface ClaimResult {
  success: boolean
  task:    any | null
  reason?: string
}

export async function claimTaskSafe(
  teamName:  string,
  taskId:    string,
  agentName: string,
  loadTeam:  (name: string) => any,
  saveTeam:  (team: any)    => void
): Promise<ClaimResult> {

  const locked = await acquireLock(teamName, taskId, agentName)
  if (!locked) {
    return {
      success: false,
      task:    null,
      reason:  'انتهى وقت الانتظار - وكيل آخر يشغل هذه المهمة',
    }
  }

  try {
    const team = loadTeam(teamName)
    if (!team) {
      return { success: false, task: null, reason: 'الفريق غير موجود' }
    }

    const task = team.tasks.find((t: any) => t.id === taskId)

    if (!task) {
      return { success: false, task: null, reason: 'المهمة غير موجودة' }
    }

    if (task.status !== 'pending') {
      return {
        success: false,
        task:    null,
        reason:  `المهمة في حالة "${task.status}" وليست "pending"`,
      }
    }

    const allDepsCompleted = task.dependencies.every((depId: string) => {
      const dep = team.tasks.find((t: any) => t.id === depId)
      return dep?.status === 'completed'
    })

    if (!allDepsCompleted) {
      return {
        success: false,
        task:    null,
        reason:  'الاعتماديات لم تكتمل بعد',
      }
    }

    task.status     = 'in-progress'
    task.assignedTo = agentName
    task.claimedAt  = new Date().toISOString()
    saveTeam(team)

    return { success: true, task }

  } finally {
    releaseLock(teamName, taskId)
  }
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

export function cleanupExpiredLocks(): number {
  const dir = getLockDir()
  let cleaned = 0
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.lock'))
    for (const file of files) {
      const lockPath = path.join(dir, file)
      if (isLockExpired(lockPath)) {
        fs.unlinkSync(lockPath)
        cleaned++
      }
    }
  } catch { /* تجاهل */ }
  return cleaned
}

export function getLockStatus(): {
  activeLocks: number
  expiredLocks: number
  lockFiles: string[]
} {
  const dir = getLockDir()
  try {
    const files   = fs.readdirSync(dir).filter(f => f.endsWith('.lock'))
    const active  = files.filter(f => !isLockExpired(path.join(dir, f)))
    const expired = files.filter(f =>  isLockExpired(path.join(dir, f)))
    return {
      activeLocks:  active.length,
      expiredLocks: expired.length,
      lockFiles:    files,
    }
  } catch {
    return { activeLocks: 0, expiredLocks: 0, lockFiles: [] }
  }
}
الملف الثالث: tiered-memory.ts
TypeScript

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
    ctx += '\n'
  }

  if (warm.length > 0) {
    ctx += `### ♨️ سياق المشروع\n`
    warm.slice(0, 5).forEach(e => {
      ctx += `- [${e.agentName}] (${e.tags.join(', ')}):\n  ${e.content}\n`
    })
    ctx += '\n'
  }

  if (cold.length > 0) {
    ctx += `### 🗃️ قرارات ذات صلة\n`
    cold.slice(0, 3).forEach(e => {
      ctx += `- ${e.content}\n`
    })
    ctx += '\n'
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
الملف الرابع: rate-limiter.ts
TypeScript

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⏱️ API Rate Limiter - Token Bucket Algorithm
 * يمنع تجاوز حدود كل نموذج ذكاء اصطناعي
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Model Limits ─────────────────────────────────────────────────────────────

export interface ModelLimits {
  rpm:           number
  tpm?:          number
  retryAfterMs?: number
}

export const MODEL_LIMITS: Record<string, ModelLimits> = {
  'gemini-1.5-pro':            { rpm: 2,  tpm: 32000,    retryAfterMs: 30000 },
  'gemini-1.5-flash':          { rpm: 15, tpm: 1000000,  retryAfterMs: 4000  },
  'gemini-1.5-flash-8b':       { rpm: 15, tpm: 1000000,  retryAfterMs: 4000  },
  'gpt-4o':                    { rpm: 10, tpm: 30000,    retryAfterMs: 6000  },
  'deepseek-coder':            { rpm: 60,                retryAfterMs: 1000  },
  'deepseek-chat':             { rpm: 60,                retryAfterMs: 1000  },
  'llama-3.1-70b-versatile':   { rpm: 30, tpm: 6000,    retryAfterMs: 2000  },
  'llama-3.1-8b-instant':      { rpm: 30, tpm: 6000,    retryAfterMs: 2000  },
  'llama3-groq-70b-8192-tool-use': { rpm: 30,           retryAfterMs: 2000  },
}

// ─── Token Bucket ─────────────────────────────────────────────────────────────

interface Bucket {
  tokens:       number
  lastRefill:   number
  maxTokens:    number
  refillRateMs: number
}

const buckets = new Map<string, Bucket>()

function getBucket(modelId: string): Bucket {
  if (!buckets.has(modelId)) {
    const limits     = MODEL_LIMITS[modelId] ?? { rpm: 10 }
    const maxTokens  = limits.rpm
    const refillRate = (60 * 1000) / maxTokens

    buckets.set(modelId, {
      tokens:       maxTokens,
      lastRefill:   Date.now(),
      maxTokens,
      refillRateMs: refillRate,
    })
  }
  return buckets.get(modelId)!
}

function refill(bucket: Bucket): void {
  const now      = Date.now()
  const elapsed  = now - bucket.lastRefill
  const toAdd    = Math.floor(elapsed / bucket.refillRateMs)

  if (toAdd > 0) {
    bucket.tokens    = Math.min(bucket.maxTokens, bucket.tokens + toAdd)
    bucket.lastRefill = now
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// ─── Core: waitForSlot ────────────────────────────────────────────────────────

export async function waitForSlot(
  modelId:   string,
  agentName: string = 'unknown'
): Promise<void> {
  const bucket = getBucket(modelId)

  return new Promise(resolve => {
    const tryAcquire = () => {
      refill(bucket)
      if (bucket.tokens >= 1) {
        bucket.tokens -= 1
        resolve()
        return
      }
      setTimeout(tryAcquire, bucket.refillRateMs)
    }
    tryAcquire()
  })
}

// ─── Wrapper: callWithRateLimit ───────────────────────────────────────────────

export async function callWithRateLimit<T>(
  modelId:    string,
  agentName:  string,
  apiCall:    () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await waitForSlot(modelId, agentName)

    try {
      return await apiCall()

    } catch (err: any) {
      lastError = err

      const is429 = err?.status === 429 || err?.code === 429
      if (is429) {
        const limits       = MODEL_LIMITS[modelId]
        const base         = limits?.retryAfterMs ?? 10000
        const waitWithJitter = base + Math.random() * 1000

        console.warn(
          `⏳ [${agentName}] Rate limit على "${modelId}". ` +
          `المحاولة ${attempt}/${maxRetries}. ` +
          `انتظر ${Math.round(waitWithJitter / 1000)}s...`
        )
        await sleep(waitWithJitter)
        continue
      }

      if (attempt < maxRetries) {
        await sleep(1000 * attempt)
      }
    }
  }

  throw lastError ?? new Error(`فشل بعد ${maxRetries} محاولات`)
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export function getRateLimiterStats(): Record<string, {
  model:          string
  tokensAvailable: number
  maxTokens:      number
  usagePercent:   number
}> {
  const stats: Record<string, any> = {}

  for (const [modelId, bucket] of buckets.entries()) {
    refill(bucket)
    stats[modelId] = {
      model:           modelId,
      tokensAvailable: Math.round(bucket.tokens),
      maxTokens:       bucket.maxTokens,
      usagePercent:    Math.round(
        ((bucket.maxTokens - bucket.tokens) / bucket.maxTokens) * 100
      ),
    }
  }

  return stats
}

export function resetBucket(modelId: string): void {
  buckets.delete(modelId)
}

export function resetAllBuckets(): void {
  buckets.clear()
}
✅ ملخص ما تفعله الآن
text

1. src/agency/mempalace.ts        ← استبدل المحتوى كاملاً
2. src/agency/task-lock-manager.ts ← ملف جديد، انسخ الكود
3. src/agency/tiered-memory.ts    ← ملف جديد، انسخ الكود
4. src/agency/rate-limiter.ts     ← ملف جديد، انسخ الكود
بعد النسخ نفّذ:

Bash

npx tsc --noEmit



[ الخطوة 1 ] استبدال mempalace.ts بالنسخة المحسّنة




افتح الملف:

text

src/agency/mempalace.ts
احذف كل محتواه واستبدله بالكود الذي أعطيتك إياه في الرد السابق
(النسخة التي تبدأ بـ MemPalace v2)

تحقق أن هذا السطر موجود في package.json:

JSON

"better-sqlite3": "^9.0.0"
إذا لم يكن موجوداً نفّذ:

Bash

npm install better-sqlite3
npm install --save-dev @types/better-sqlite3
[ الخطوة 2 ] إضافة الملفات الجديدة
أنشئ هذه الملفات الثلاثة في نفس المجلد:

text

src/agency/task-lock-manager.ts   ← الكود الذي أعطيتك إياه
src/agency/tiered-memory.ts       ← الكود الذي أعطيتك إياه
src/agency/rate-limiter.ts        ← الكود الذي أعطيتك إياه
[ الخطوة 3 ] تعديل team-orchestrator.ts
أضف هذا الاستيراد في أعلى الملف:

TypeScript

import { claimTaskSafe } from './task-lock-manager.js'
import { callWithRateLimit } from './rate-limiter.js'
ابحث عن دالة claimTask الأصلية واستبدلها بهذا:

TypeScript

export async function claimTask(
  teamName: string,
  taskId: string,
  agentName: string
): Promise<TeamTask | null> {
  const result = await claimTaskSafe(
    teamName,
    taskId,
    agentName,
    loadTeam,
    saveTeam
  )
  
  if (!result.success) {
    console.warn(`⚠️ claimTask فشل: ${result.reason}`)
    return null
  }

  writeDailyLog('note', `${agentName} بدأ المهمة`, {
    agent: agentName
  })

  return result.task
}
[ الخطوة 4 ] تعديل shared-memory.ts
أضف هذا الاستيراد في أعلى الملف:

TypeScript

import {
  writeHotMemory,
  writeWarmMemory,
  writeColdMemory,
  buildAgentContext
} from './tiered-memory.js'
أضف هذه الدوال في نهاية الملف:

TypeScript

// ─── Tiered Memory Bridge ──────────────────────────────

export function rememberNow(
  projectName: string,
  agentName: string,
  content: string,
  importance: number = 5
): void {
  // أقل من 6 = hot فقط
  // 6 إلى 8 = hot + warm
  // أكثر من 8 = كل المستويات
  writeHotMemory(projectName, agentName, content, [], importance)

  if (importance >= 6) {
    writeWarmMemory(projectName, agentName, content, [], importance)
  }

  if (importance >= 9) {
    writeColdMemory(projectName, agentName, content, [], importance)
  }
}

export function getAgentBriefing(
  projectName: string,
  agentName: string,
  task: string
): string {
  return buildAgentContext(projectName, agentName, task)
}
[ الخطوة 5 ] أنشئ ملف الإعدادات
أنشئ هذا الملف:

text

.claude/agency-models.json
محتواه:

JSON

{
  "version": "2.0",
  "description": "توزيع النماذج على وكلاء OpenClaude",
  
  "agents": {
    "project-manager": {
      "provider": "google",
      "model": "gemini-1.5-pro",
      "fallback": "deepseek-chat",
      "temperature": 0.3,
      "reason": "يحتاج تفكيراً استراتيجياً عميقاً"
    },
    "full-stack-developer": {
      "provider": "deepseek",
      "model": "deepseek-coder",
      "fallback": "llama3-groq-70b-8192-tool-use",
      "temperature": 0.1,
      "reason": "متخصص في الكود بدقة عالية"
    },
    "qa-engineer": {
      "provider": "groq",
      "model": "llama-3.1-70b-versatile",
      "fallback": "deepseek-coder",
      "temperature": 0.1,
      "reason": "سريع ودقيق في اكتشاف الأخطاء"
    },
    "marketing-strategist": {
      "provider": "groq",
      "model": "llama-3.1-70b-versatile",
      "fallback": "gemini-1.5-flash",
      "temperature": 0.7,
      "reason": "إبداعي وسريع للمحتوى التسويقي"
    },
    "ui-ux-designer": {
      "provider": "google",
      "model": "gemini-1.5-flash",
      "fallback": "llama-3.1-70b-versatile",
      "temperature": 0.6,
      "reason": "يفهم الأنماط البصرية جيداً"
    },
    "seo-specialist": {
      "provider": "google",
      "model": "gemini-1.5-flash",
      "fallback": "llama-3.1-70b-versatile",
      "temperature": 0.4,
      "reason": "مهمة متوسطة لا تحتاج نموذجاً ثقيلاً"
    },
    "content-writer": {
      "provider": "groq",
      "model": "llama-3.1-70b-versatile",
      "fallback": "gemini-1.5-flash",
      "temperature": 0.8,
      "reason": "الكتابة الإبداعية تحتاج درجة حرارة أعلى"
    },
    "data-analyst": {
      "provider": "google",
      "model": "gemini-1.5-pro",
      "fallback": "deepseek-chat",
      "temperature": 0.2,
      "reason": "التحليل يحتاج دقة عالية"
    }
  },

  "rateLimits": {
    "gemini-1.5-pro":          { "rpm": 2,  "retryAfterMs": 30000 },
    "gemini-1.5-flash":        { "rpm": 15, "retryAfterMs": 4000  },
    "deepseek-coder":          { "rpm": 60, "retryAfterMs": 1000  },
    "deepseek-chat":           { "rpm": 60, "retryAfterMs": 1000  },
    "llama-3.1-70b-versatile": { "rpm": 30, "retryAfterMs": 2000  },
    "llama-3.1-8b-instant":    { "rpm": 30, "retryAfterMs": 2000  }
  }
}
[ الخطوة 6 ] تحديث ملف .env
تأكد أن هذه المفاتيح موجودة في .env:

env

# Google AI Studio
GOOGLE_AI_API_KEY=your_key_here

# Groq
GROQ_API_KEY=your_key_here

# DeepSeek
DEEPSEEK_API_KEY=your_key_here

# إعدادات النظام
NODE_ENV=development
LOG_LEVEL=info
[ الخطوة 7 ] اختبار أن كل شيء يعمل
نفّذ هذا الأمر:

Bash

npx tsc --noEmit
إذا ظهرت أخطاء أرسلها لي فوراً

إذا نجح التحويل نفّذ:

Bash

npm run dev
📋 ترتيب الأولويات الذي نتبعه
text

الآن          → الخطوات 1 إلى 7 (التجهيز)
بعدها         → بناء agent-zero.ts
بعدها         → بناء quality-gates.ts
بعدها         → ربط كل شيء ببعض
بعدها         → الاختبار الكامل
