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
