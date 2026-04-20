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
    // ─── Migration ──────────────────────────────────────────────────────────
    const tableInfo = this.db.prepare("PRAGMA table_info(drawers)").all() as any[]
    if (tableInfo.length > 0) {
      const hasColumn = (name: string) => tableInfo.some(c => c.name === name)
      if (!hasColumn('importance')) {
        this.db.exec("ALTER TABLE drawers ADD COLUMN importance INTEGER NOT NULL DEFAULT 5")
      }
      if (!hasColumn('tags')) {
        this.db.exec("ALTER TABLE drawers ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'")
      }
      if (!hasColumn('access_count')) {
        this.db.exec("ALTER TABLE drawers ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0")
      }
    }

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
      context += '\\n'
    }

    if (results.length > 0) {
      context += `### 🔍 ذكريات ذات صلة بمهمتك\n`
      results.forEach(d => {
        context += `- **[${d.agent}]** (أهمية: ${d.importance}/10):\n`
        context += `  ${d.content.substring(0, 300)}\n`
      })
      context += '\\n'
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
