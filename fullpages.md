

# 🔄 تحديث كل الصفحات للبيانات الحقيقية

الآن سنحوّل كل صفحة من Mock Data إلى بيانات حقيقية من الـ Backend

---

## تحديث الصفحة الرئيسية: `home-page.tsx`

```tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🏠 Home Page — Live Data Version
 * كل البيانات تأتي من الـ Backend عبر Hooks
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useState } from 'react'
import {
  useStatus,
  useAgents,
  useActivity,
  useTasks,
  useSocket,
  type Agent,
  type Activity,
} from './hooks/useApi'

// ─── Status Dot ───────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'var(--success)',
    idle:   'var(--text-tertiary)',
    done:   'var(--info)',
    error:  'var(--error)',
  }
  return (
    <span style={{
      display: 'inline-block',
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: colors[status] || 'var(--text-tertiary)',
      animation: status === 'active' ? 'pulse 2s infinite' : 'none',
    }} />
  )
}

// ─── Metric Card ──────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  trend,
}: {
  label: string
  value: string | number
  sub?: string
  trend?: 'up' | 'down' | 'flat'
}) {
  const trendColors = {
    up:   'var(--success)',
    down: 'var(--error)',
    flat: 'var(--text-tertiary)',
  }

  return (
    <div style={{
      padding: 'var(--space-xl)',
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      transition: 'border-color var(--transition)',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 'var(--space-sm)',
      }}>
        <span style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {label}
        </span>
        {trend && (
          <span style={{
            fontSize: 'var(--text-xs)',
            color: trendColors[trend],
          }}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '—'}
          </span>
        )}
      </div>
      <div style={{
        fontSize: '28px',
        fontWeight: 600,
        letterSpacing: '-0.02em',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-mono)',
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--text-tertiary)',
          marginTop: 'var(--space-xs)',
        }}>
          {sub}
        </div>
      )}
    </div>
  )
}

// ─── Connection Badge ─────────────────────────────────────────────────────────

function ConnectionBadge({ connected }: { connected: boolean }) {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 10px',
      borderRadius: 'var(--radius-sm)',
      background: connected
        ? 'rgba(61,154,95,0.08)'
        : 'rgba(201,74,74,0.08)',
      border: `1px solid ${connected
        ? 'rgba(61,154,95,0.15)'
        : 'rgba(201,74,74,0.15)'}`,
    }}>
      <span style={{
        width: 5,
        height: 5,
        borderRadius: '50%',
        background: connected ? 'var(--success)' : 'var(--error)',
        animation: connected ? 'pulse 2s infinite' : 'none',
      }} />
      <span style={{
        fontSize: 'var(--text-xs)',
        color: connected ? 'var(--success)' : 'var(--error)',
      }}>
        {connected ? 'متصل' : 'غير متصل'}
      </span>
    </div>
  )
}

// ─── Agent Row (Live) ─────────────────────────────────────────────────────────

function AgentRow({ agent }: { agent: Agent }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '180px 140px 1fr 80px',
        alignItems: 'center',
        padding: '10px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        transition: 'background var(--transition)',
        cursor: 'pointer',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--bg-hover)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-md)',
      }}>
        <StatusDot status={agent.status} />
        <span style={{
          fontSize: 'var(--text-sm)',
          fontWeight: 500,
          fontFamily: 'var(--font-mono)',
        }}>
          {agent.name}
        </span>
      </div>

      <span style={{
        fontSize: 'var(--text-xs)',
        color: 'var(--text-tertiary)',
        fontFamily: 'var(--font-mono)',
      }}>
        {agent.model}
      </span>

      <span style={{
        fontSize: 'var(--text-sm)',
        color: 'var(--text-secondary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {agent.task}
      </span>

      <span style={{
        fontSize: 'var(--text-xs)',
        color: 'var(--text-tertiary)',
        fontFamily: 'var(--font-mono)',
        textAlign: 'left',
      }}>
        {agent.tokens > 0 ? `${agent.tokens.toLocaleString()}` : '—'}
      </span>
    </div>
  )
}

// ─── Activity Item (Live) ─────────────────────────────────────────────────────

function ActivityItem({ activity }: { activity: Activity }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '50px 130px 1fr',
      gap: 'var(--space-sm)',
      padding: '7px 0',
      fontSize: 'var(--text-sm)',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      <span style={{
        color: 'var(--text-tertiary)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-xs)',
      }}>
        {activity.time}
      </span>
      <span style={{
        color: 'var(--accent)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-xs)',
        fontWeight: 500,
      }}>
        {activity.agent}
      </span>
      <span style={{ color: 'var(--text-secondary)' }}>
        {activity.message}
      </span>
    </div>
  )
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  return (
    <div>
      {label && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}>
          <span style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-tertiary)',
          }}>
            {label}
          </span>
          <span style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
          }}>
            {percent}%
          </span>
        </div>
      )}
      <div style={{
        height: 3,
        background: 'var(--border-subtle)',
        borderRadius: 2,
      }}>
        <div style={{
          height: '100%',
          width: `${percent}%`,
          background: percent >= 100
            ? 'var(--success)'
            : 'var(--accent)',
          borderRadius: 2,
          transition: 'width 800ms ease',
        }} />
      </div>
    </div>
  )
}

// ─── Quick Command ────────────────────────────────────────────────────────────

function QuickCommand() {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)

  const handleSubmit = () => {
    if (!value.trim()) return
    // سيتم ربطه بـ Agent Zero لاحقاً
    console.log('Command:', value)
    setValue('')
  }

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: `1px solid ${focused
        ? 'var(--border-primary)'
        : 'var(--border-subtle)'}`,
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-lg)',
      transition: 'border-color var(--transition)',
    }}>
      <div style={{
        fontSize: 'var(--text-xs)',
        color: 'var(--text-tertiary)',
        marginBottom: 'var(--space-sm)',
      }}>
        أمر سريع
      </div>
      <div style={{
        display: 'flex',
        gap: 'var(--space-sm)',
      }}>
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder='مثال: "أنشئ صفحة هبوط لمنتج SaaS"'
          style={{
            flex: 1,
            padding: '10px 14px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-sans)',
            outline: 'none',
            direction: 'rtl',
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={!value.trim()}
          style={{
            padding: '10px 20px',
            background: value.trim()
              ? 'var(--accent)'
              : 'var(--bg-tertiary)',
            color: value.trim()
              ? '#fff'
              : 'var(--text-tertiary)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            cursor: value.trim() ? 'pointer' : 'default',
            transition: 'all var(--transition)',
          }}
        >
          تنفيذ
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const status              = useStatus()
  const { agents, loading } = useAgents()
  const activities          = useActivity()
  const { tasks }           = useTasks()
  const { connected }       = useSocket()

  const tasksDone  = tasks.filter(t => t.status === 'completed').length
  const tasksPct   = tasks.length > 0
    ? Math.round((tasksDone / tasks.length) * 100)
    : 0

  const formatTokens = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return n.toString()
  }

  return (
    <div style={{ maxWidth: 960 }}>

      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 'var(--space-3xl)',
      }}>
        <div>
          <h1 style={{
            fontSize: 'var(--text-xl)',
            fontWeight: 600,
            marginBottom: 'var(--space-xs)',
          }}>
            نظرة عامة
          </h1>
          <p style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--text-tertiary)',
          }}>
            {new Date().toLocaleDateString('ar-SA', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <ConnectionBadge connected={connected} />
      </div>

      {/* Quick Command */}
      <div style={{ marginBottom: 'var(--space-2xl)' }}>
        <QuickCommand />
      </div>

      {/* Metrics */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 'var(--space-md)',
        marginBottom: 'var(--space-2xl)',
      }}>
        <MetricCard
          label="المهام"
          value={`${tasksDone}/${tasks.length}`}
          sub={`${tasksPct}% مكتملة`}
          trend={tasksPct > 50 ? 'up' : 'flat'}
        />
        <MetricCard
          label="الوكلاء"
          value={`${status.activeAgents}/${status.totalAgents}`}
          sub="نشط الآن"
          trend={status.activeAgents > 0 ? 'up' : 'flat'}
        />
        <MetricCard
          label="التكلفة"
          value={`$${status.totalCost.toFixed(2)}`}
          sub="اليوم"
        />
        <MetricCard
          label="التوكن"
          value={formatTokens(status.totalTokens)}
          sub="مستهلكة"
        />
      </div>

      {/* Progress */}
      {tasks.length > 0 && (
        <div style={{ marginBottom: 'var(--space-2xl)' }}>
          <ProgressBar percent={tasksPct} label="تقدم المشروع" />
        </div>
      )}

      {/* Two Column Layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 340px',
        gap: 'var(--space-lg)',
        marginBottom: 'var(--space-2xl)',
      }}>

        {/* Agents Table */}
        <div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--space-md)',
          }}>
            <h2 style={{
              fontSize: 'var(--text-base)',
              fontWeight: 600,
            }}>
              الوكلاء
            </h2>
            <span style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-tertiary)',
            }}>
              {agents.filter(a => a.status === 'active').length} نشط
            </span>
          </div>

          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '180px 140px 1fr 80px',
              padding: '8px 16px',
              borderBottom: '1px solid var(--border-primary)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              <span>الوكيل</span>
              <span>النموذج</span>
              <span>المهمة</span>
              <span style={{ textAlign: 'left' }}>توكن</span>
            </div>

            {loading ? (
              <div style={{
                padding: 20,
                textAlign: 'center',
                color: 'var(--text-tertiary)',
                fontSize: 'var(--text-sm)',
              }}>
                جاري التحميل...
              </div>
            ) : agents.length === 0 ? (
              <div style={{
                padding: 20,
                textAlign: 'center',
                color: 'var(--text-tertiary)',
                fontSize: 'var(--text-sm)',
              }}>
                لا يوجد وكلاء
              </div>
            ) : (
              agents.map(agent => (
                <AgentRow key={agent.id} agent={agent} />
              ))
            )}
          </div>
        </div>

        {/* Activity Feed */}
        <div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--space-md)',
          }}>
            <h2 style={{
              fontSize: 'var(--text-base)',
              fontWeight: 600,
            }}>
              النشاط
            </h2>
            <span style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-tertiary)',
            }}>
              آخر {Math.min(activities.length, 20)}
            </span>
          </div>

          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-md)',
            maxHeight: 400,
            overflow: 'auto',
          }}>
            {activities.length === 0 ? (
              <div style={{
                padding: 20,
                textAlign: 'center',
                color: 'var(--text-tertiary)',
                fontSize: 'var(--text-sm)',
              }}>
                لا توجد نشاطات بعد
              </div>
            ) : (
              activities.slice(0, 20).map((act, i) => (
                <ActivityItem key={i} activity={act} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Rate Limits Preview */}
      <RateLimitsWidget />
    </div>
  )
}

// ─── Rate Limits Widget ───────────────────────────────────────────────────────

function RateLimitsWidget() {
  const [data, setData] = React.useState<Record<string, {
    model: string
    tokensAvailable: number
    maxTokens: number
    usagePercent: number
  }>>({})

  React.useEffect(() => {
    const fetchLimits = () => {
      fetch('http://localhost:3001/api/rate-limits')
        .then(res => res.json())
        .then(setData)
        .catch(() => {})
    }
    fetchLimits()
    const interval = setInterval(fetchLimits, 3000)
    return () => clearInterval(interval)
  }, [])

  const models = Object.entries(data)
  if (models.length === 0) return null

  return (
    <div>
      <h2 style={{
        fontSize: 'var(--text-base)',
        fontWeight: 600,
        marginBottom: 'var(--space-md)',
      }}>
        حدود الاستخدام
      </h2>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 'var(--space-sm)',
      }}>
        {models.map(([id, info]) => {
          const isWarning = info.usagePercent > 70
          const isDanger  = info.usagePercent > 90
          const color     = isDanger
            ? 'var(--error)'
            : isWarning
              ? 'var(--warning)'
              : 'var(--accent)'

          return (
            <div key={id} style={{
              padding: 'var(--space-md)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 'var(--space-sm)',
              }}>
                <span style={{
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-secondary)',
                }}>
                  {info.model.replace('gemini-1.5-', 'gem-').replace('llama-3.1-', 'llama-')}
                </span>
                <span style={{
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-mono)',
                  color,
                }}>
                  {info.tokensAvailable}/{info.maxTokens}
                </span>
              </div>
              <div style={{
                height: 3,
                background: 'var(--border-subtle)',
                borderRadius: 2,
              }}>
                <div style={{
                  height: '100%',
                  width: `${info.usagePercent}%`,
                  background: color,
                  borderRadius: 2,
                  transition: 'width 500ms ease',
                }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

---

## تحديث صفحة الوكلاء: `agents-page.tsx` (Live Version)

```tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🤖 Agents Page — Live Data Version
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react'
import {
  useAgents,
  useActivity,
  type Agent,
} from './hooks/useApi'

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; bg: string }> = {
    active: { label: 'يعمل',  color: 'var(--success)', bg: 'rgba(61,154,95,0.1)' },
    idle:   { label: 'ينتظر', color: 'var(--text-tertiary)', bg: 'var(--bg-tertiary)' },
    done:   { label: 'انتهى', color: 'var(--info)',    bg: 'rgba(74,142,201,0.1)' },
    error:  { label: 'خطأ',   color: 'var(--error)',   bg: 'rgba(201,74,74,0.1)' },
  }
  const c = config[status] || config.idle

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '2px 8px',
      borderRadius: 'var(--radius-sm)',
      background: c.bg,
      color: c.color,
      fontSize: 'var(--text-xs)',
      fontWeight: 500,
    }}>
      <span style={{
        width: 5,
        height: 5,
        borderRadius: '50%',
        background: c.color,
        animation: status === 'active' ? 'pulse 2s infinite' : 'none',
      }} />
      {c.label}
    </span>
  )
}

// ─── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  selected,
  onClick,
}: {
  agent: Agent
  selected: boolean
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: 'var(--space-lg)',
        background: selected ? 'var(--bg-active)' : 'var(--bg-secondary)',
        border: `1px solid ${selected ? 'var(--border-primary)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        transition: 'all var(--transition)',
        marginBottom: 'var(--space-sm)',
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 'var(--space-md)',
      }}>
        <div>
          <div style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            fontFamily: 'var(--font-mono)',
            marginBottom: 2,
          }}>
            {agent.name}
          </div>
        </div>
        <StatusBadge status={agent.status} />
      </div>

      <div style={{
        fontSize: 'var(--text-xs)',
        color: 'var(--text-secondary)',
        marginBottom: 'var(--space-md)',
        lineHeight: 1.6,
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical' as any,
      }}>
        {agent.task}
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 'var(--text-xs)',
        color: 'var(--text-tertiary)',
        fontFamily: 'var(--font-mono)',
      }}>
        <span>{agent.model}</span>
        <span>{agent.tokens > 0 ? `${agent.tokens.toLocaleString()} tok` : '—'}</span>
      </div>
    </div>
  )
}

// ─── Agent Detail ─────────────────────────────────────────────────────────────

function AgentDetail({
  agent,
  onStart,
  onStop,
}: {
  agent: Agent
  onStart: (id: string) => void
  onStop: (id: string) => void
}) {
  const activities = useActivity()
  const agentActivities = activities.filter(a => a.agent === agent.name).slice(0, 10)

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
      height: 'calc(100vh - 180px)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: 'var(--space-xl)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--space-lg)',
        }}>
          <div>
            <h2 style={{
              fontSize: 'var(--text-lg)',
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
              marginBottom: 4,
            }}>
              {agent.name}
            </h2>
          </div>
          <StatusBadge status={agent.status} />
        </div>

        {/* Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'var(--space-md)',
        }}>
          {[
            { label: 'التوكن',  value: agent.tokens > 0 ? agent.tokens.toLocaleString() : '—' },
            { label: 'التكلفة', value: `$${agent.cost.toFixed(3)}` },
            { label: 'النموذج', value: agent.model.replace('gemini-1.5-', 'gem-') },
          ].map(s => (
            <div key={s.label} style={{
              padding: 'var(--space-md)',
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-sm)',
              textAlign: 'center',
            }}>
              <div style={{
                fontSize: '16px',
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                marginBottom: 2,
              }}>
                {s.value}
              </div>
              <div style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-tertiary)',
              }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scrollable Content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: 'var(--space-xl)',
      }}>

        {/* Actions */}
        <div style={{ marginBottom: 'var(--space-2xl)' }}>
          <h3 style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: 'var(--space-md)',
          }}>
            الإجراءات
          </h3>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            {agent.status === 'active' ? (
              <button
                onClick={() => onStop(agent.id)}
                style={{
                  padding: '6px 14px',
                  background: 'rgba(201,74,74,0.1)',
                  color: 'var(--error)',
                  border: '1px solid rgba(201,74,74,0.2)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--text-xs)',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontFamily: 'var(--font-sans)',
                }}
              >
                إيقاف
              </button>
            ) : (
              <button
                onClick={() => onStart(agent.id)}
                style={{
                  padding: '6px 14px',
                  background: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--text-xs)',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontFamily: 'var(--font-sans)',
                }}
              >
                تشغيل
              </button>
            )}
          </div>
        </div>

        {/* Activity */}
        <div>
          <h3 style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: 'var(--space-md)',
          }}>
            النشاط الأخير
          </h3>
          {agentActivities.length === 0 ? (
            <div style={{
              padding: 'var(--space-lg)',
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-sm)',
              textAlign: 'center',
              color: 'var(--text-tertiary)',
              fontSize: 'var(--text-xs)',
            }}>
              لا يوجد نشاط بعد
            </div>
          ) : (
            agentActivities.map((act, i) => (
              <div key={i} style={{
                padding: 'var(--space-sm) var(--space-md)',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 'var(--space-xs)',
                fontSize: 'var(--text-xs)',
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono)',
                  marginBottom: 2,
                }}>
                  <span>{act.time}</span>
                </div>
                <div style={{ color: 'var(--text-secondary)' }}>
                  {act.message}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const { agents, loading, startAgent, stopAgent } = useAgents()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedId && agents.length > 0) {
      setSelectedId(agents[0].id)
    }
  }, [agents, selectedId])

  const selected = agents.find(a => a.id === selectedId) || agents[0]

  if (loading) {
    return (
      <div style={{
        color: 'var(--text-tertiary)',
        padding: 40,
        textAlign: 'center',
      }}>
        جاري التحميل...
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 'var(--space-3xl)',
      }}>
        <div>
          <h1 style={{
            fontSize: 'var(--text-xl)',
            fontWeight: 600,
            marginBottom: 'var(--space-xs)',
          }}>
            الوكلاء
          </h1>
          <p style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--text-tertiary)',
          }}>
            {agents.filter(a => a.status === 'active').length} نشط من أصل {agents.length}
          </p>
        </div>
      </div>

      {/* Split Layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '300px 1fr',
        gap: 'var(--space-lg)',
        alignItems: 'start',
      }}>
        {/* List */}
        <div>
          {agents.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              selected={selectedId === agent.id}
              onClick={() => setSelectedId(agent.id)}
            />
          ))}
        </div>

        {/* Detail */}
        {selected && (
          <AgentDetail
            agent={selected}
            onStart={startAgent}
            onStop={stopAgent}
          />
        )}
      </div>
    </div>
  )
}
```

---

## تحديث صفحة الذاكرة: `memory-page.tsx` (Live Version)

```tsx
import React, { useState } from 'react'
import { useMemory, type MemoryEntry } from './hooks/useApi'

type Level = 'all' | 'hot' | 'warm' | 'cold'

function LevelTag({ level }: { level: string }) {
  const config: Record<string, { label: string; color: string; bg: string }> = {
    hot:  { label: 'HOT',  color: 'var(--error)',   bg: 'rgba(201,74,74,0.08)' },
    warm: { label: 'WARM', color: 'var(--warning)', bg: 'rgba(201,148,62,0.08)' },
    cold: { label: 'COLD', color: 'var(--info)',    bg: 'rgba(74,142,201,0.08)' },
  }
  const c = config[level] || config.cold
  return (
    <span style={{
      padding: '2px 7px',
      borderRadius: 'var(--radius-sm)',
      background: c.bg,
      color: c.color,
      fontSize: '11px',
      fontFamily: 'var(--font-mono)',
      fontWeight: 500,
    }}>
      {c.label}
    </span>
  )
}

function ImportanceDots({ value }: { value: number }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} style={{
          width: 4,
          height: 4,
          borderRadius: '50%',
          background: i < value
            ? value >= 8 ? 'var(--error)'
              : value >= 5 ? 'var(--warning)'
              : 'var(--info)'
            : 'var(--border-primary)',
        }} />
      ))}
    </div>
  )
}

function MemoryCard({ entry }: { entry: MemoryEntry }) {
  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1)  return 'الآن'
    if (mins < 60) return `منذ ${mins} دقيقة`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `منذ ${hours} ساعة`
    return `منذ ${Math.floor(hours / 24)} يوم`
  }

  return (
    <div style={{
      padding: 'var(--space-lg)',
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      marginBottom: 'var(--space-sm)',
      transition: 'border-color var(--transition)',
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-primary)'}
    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 'var(--space-md)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <LevelTag level={entry.level} />
          <span style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--accent)',
            fontFamily: 'var(--font-mono)',
          }}>
            {entry.agentName}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)' }}>
          <ImportanceDots value={entry.importance} />
          <span style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-tertiary)',
          }}>
            {timeAgo(entry.createdAt)}
          </span>
        </div>
      </div>

      <p style={{
        fontSize: 'var(--text-sm)',
        color: 'var(--text-primary)',
        lineHeight: 1.6,
        marginBottom: 'var(--space-md)',
      }}>
        {entry.content}
      </p>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
          {entry.tags.map(tag => (
            <span key={tag} style={{
              padding: '1px 8px',
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '11px',
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-mono)',
            }}>
              {tag}
            </span>
          ))}
        </div>
        <span style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--text-tertiary)',
        }}>
          وُصل إليه {entry.accessCount}×
        </span>
      </div>
    </div>
  )
}

export default function MemoryPage() {
  const [activeLevel, setActiveLevel] = useState<Level>('all')
  const [search, setSearch] = useState('')
  const { entries, stats, loading, addMemory, refresh } = useMemory(activeLevel)

  const filtered = search
    ? entries.filter(e =>
        e.content.toLowerCase().includes(search.toLowerCase())
        || e.tags.some(t => t.includes(search.toLowerCase()))
      )
    : entries

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ marginBottom: 'var(--space-3xl)' }}>
        <h1 style={{
          fontSize: 'var(--text-xl)',
          fontWeight: 600,
          marginBottom: 'var(--space-xs)',
        }}>
          الذاكرة
        </h1>
        <p style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--text-tertiary)',
        }}>
          {stats.total} مدخل في MemPalace
        </p>
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 'var(--space-md)',
        marginBottom: 'var(--space-xl)',
      }}>
        {[
          { level: 'hot' as const,  label: 'HOT',  color: 'var(--error)',   count: stats.hot,  sub: 'فوري' },
          { level: 'warm' as const, label: 'WARM', color: 'var(--warning)', count: stats.warm, sub: 'نشط' },
          { level: 'cold' as const, label: 'COLD', color: 'var(--info)',    count: stats.cold, sub: 'أرشيف' },
        ].map(s => (
          <div
            key={s.level}
            onClick={() => setActiveLevel(activeLevel === s.level ? 'all' : s.level)}
            style={{
              padding: 'var(--space-lg)',
              background: activeLevel === s.level ? 'var(--bg-active)' : 'var(--bg-secondary)',
              border: `1px solid ${activeLevel === s.level ? 'var(--border-primary)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              transition: 'all var(--transition)',
            }}
          >
            <div style={{
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-mono)',
              color: s.color,
              marginBottom: 'var(--space-sm)',
            }}>
              {s.label} — {s.sub}
            </div>
            <div style={{
              fontSize: '28px',
              fontWeight: 600,
              letterSpacing: '-0.02em',
            }}>
              {s.count}
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="ابحث في الذاكرة..."
        style={{
          width: '100%',
          padding: '10px 16px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-primary)',
          fontSize: 'var(--text-sm)',
          fontFamily: 'var(--font-sans)',
          outline: 'none',
          direction: 'rtl',
          marginBottom: 'var(--space-xl)',
        }}
      />

      {/* Entries */}
      {loading ? (
        <div style={{
          textAlign: 'center',
          padding: 40,
          color: 'var(--text-tertiary)',
        }}>
          جاري التحميل...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: 40,
          color: 'var(--text-tertiary)',
          fontSize: 'var(--text-sm)',
        }}>
          لا توجد نتائج
        </div>
      ) : (
        filtered.map(entry => (
          <MemoryCard key={entry.id} entry={entry} />
        ))
      )}
    </div>
  )
}
```

---

## تحديث صفحة التكاليف: `cost-page.tsx` (Live Version)

```tsx
import React, { useState } from 'react'
import { useCosts } from './hooks/useApi'

export default function CostPage() {
  const { costs, loading } = useCosts()
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today')

  if (loading) {
    return (
      <div style={{
        color: 'var(--text-tertiary)',
        padding: 40,
        textAlign: 'center',
      }}>
        جاري التحميل...
      </div>
    )
  }

  const totalTokens  = costs.byModel.reduce((s, m) => s + m.tokens, 0)
  const totalReqs    = costs.byModel.reduce((s, m) => s + m.requests, 0)

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 'var(--space-3xl)',
      }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 600 }}>
            التكاليف
          </h1>
        </div>
        <div style={{
          display: 'flex',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: 3,
        }}>
          {(['today', 'week', 'month'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: '5px 14px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: period === p ? 'var(--bg-active)' : 'transparent',
                color: period === p ? 'var(--text-primary)' : 'var(--text-tertiary)',
                fontSize: 'var(--text-xs)',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {{ today: 'اليوم', week: 'الأسبوع', month: 'الشهر' }[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 'var(--space-md)',
        marginBottom: 'var(--space-3xl)',
      }}>
        {[
          { label: 'الإجمالي', value: `$${costs.total.toFixed(3)}` },
          { label: 'التوكن', value: `${(totalTokens / 1000).toFixed(1)}K` },
          { label: 'الطلبات', value: totalReqs.toString() },
          { label: 'متوسط/طلب', value: totalReqs > 0 ? `$${(costs.total / totalReqs).toFixed(4)}` : '$0' },
        ].map(s => (
          <div key={s.label} style={{
            padding: 'var(--space-lg)',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
          }}>
            <div style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: 'var(--space-sm)',
            }}>
              {s.label}
            </div>
            <div style={{
              fontSize: '22px',
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
            }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* By Model */}
      <div style={{ marginBottom: 'var(--space-3xl)' }}>
        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 'var(--space-lg)' }}>
          حسب النموذج
        </h2>
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}>
          {costs.byModel.map((m, i) => {
            const pct = costs.total > 0 ? Math.round((m.cost / costs.total) * 100) : 0
            return (
              <div key={m.model} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 80px 80px 100px',
                padding: '12px 16px',
                borderBottom: i < costs.byModel.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                alignItems: 'center',
              }}>
                <div>
                  <div style={{
                    fontSize: 'var(--text-sm)',
                    fontFamily: 'var(--font-mono)',
                    marginBottom: 4,
                  }}>
                    {m.model}
                  </div>
                  <div style={{
                    height: 3,
                    maxWidth: 160,
                    background: 'var(--border-subtle)',
                    borderRadius: 2,
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: 'var(--accent)',
                      borderRadius: 2,
                    }} />
                  </div>
                </div>
                <span style={{
                  textAlign: 'center',
                  fontSize: 'var(--text-sm)',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-secondary)',
                }}>
                  {m.requests}
                </span>
                <span style={{
                  textAlign: 'center',
                  fontSize: 'var(--text-sm)',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-secondary)',
                }}>
                  {(m.tokens / 1000).toFixed(1)}K
                </span>
                <span style={{
                  textAlign: 'left',
                  fontSize: 'var(--text-sm)',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 500,
                }}>
                  ${m.cost.toFixed(3)} ({pct}%)
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* By Agent */}
      <div>
        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 'var(--space-lg)' }}>
          حسب الوكيل
        </h2>
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}>
          {costs.byAgent.map((a, i) => {
            const pct = costs.total > 0 ? Math.round((a.cost / costs.total) * 100) : 0
            return (
              <div key={a.name} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 100px 80px',
                padding: '12px 16px',
                borderBottom: i < costs.byAgent.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                alignItems: 'center',
              }}>
                <div>
                  <div style={{
                    fontSize: 'var(--text-sm)',
                    fontFamily: 'var(--font-mono)',
                    marginBottom: 4,
                  }}>
                    {a.name}
                  </div>
                  <div style={{
                    height: 3,
                    maxWidth: 140,
                    background: 'var(--border-subtle)',
                    borderRadius: 2,
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: 'var(--accent)',
                      borderRadius: 2,
                    }} />
                  </div>
                </div>
                <span style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {(a.tokens / 1000).toFixed(1)}K tok
                </span>
                <span style={{
                  fontSize: 'var(--text-sm)',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 500,
                  textAlign: 'left',
                }}>
                  ${a.cost.toFixed(3)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

---

## صفحة السجلات الجديدة: `logs-page.tsx`

```tsx
import React, { useState, useEffect } from 'react'
import { useActivity, type Activity } from './hooks/useApi'

export default function LogsPage() {
  const activities = useActivity()
  const [filter, setFilter] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)

  const filtered = filter
    ? activities.filter(a =>
        a.agent.toLowerCase().includes(filter.toLowerCase()) ||
        a.message.toLowerCase().includes(filter.toLowerCase())
      )
    : activities

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 'var(--space-3xl)',
      }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 600, marginBottom: 'var(--space-xs)' }}>
            السجلات
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
            {activities.length} حدث
          </p>
        </div>

        <button
          onClick={() => setAutoScroll(!autoScroll)}
          style={{
            padding: '6px 12px',
            background: autoScroll ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
            border: `1px solid ${autoScroll ? 'rgba(201,100,66,0.2)' : 'var(--border-subtle)'}`,
            borderRadius: 'var(--radius-sm)',
            color: autoScroll ? 'var(--accent)' : 'var(--text-secondary)',
            fontSize: 'var(--text-xs)',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {autoScroll ? '● تتبع حي' : '○ تتبع متوقف'}
        </button>
      </div>

      {/* Filter */}
      <input
        type="text"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        placeholder="فلتر بالوكيل أو المحتوى..."
        style={{
          width: '100%',
          padding: '10px 16px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-primary)',
          fontSize: 'var(--text-sm)',
          fontFamily: 'var(--font-sans)',
          outline: 'none',
          direction: 'rtl',
          marginBottom: 'var(--space-lg)',
        }}
      />

      {/* Log Entries */}
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-xs)',
      }}>
        {/* Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '60px 150px 1fr',
          padding: '8px 16px',
          borderBottom: '1px solid var(--border-primary)',
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          <span>الوقت</span>
          <span>الوكيل</span>
          <span>الحدث</span>
        </div>

        {/* Entries */}
        <div style={{
          maxHeight: 'calc(100vh - 320px)',
          overflow: 'auto',
        }}>
          {filtered.length === 0 ? (
            <div style={{
              padding: 40,
              textAlign: 'center',
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-sm)',
            }}>
              لا توجد سجلات
            </div>
          ) : (
            filtered.map((log, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '60px 150px 1fr',
                  padding: '7px 16px',
                  borderBottom: '1px solid var(--border-subtle)',
                  transition: 'background var(--transition)',
                  animation: i === 0 && autoScroll ? 'fadeIn 300ms ease' : 'none',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ color: 'var(--text-tertiary)' }}>
                  {log.time}
                </span>
                <span style={{ color: 'var(--accent)', fontWeight: 500 }}>
                  {log.agent}
                </span>
                <span style={{
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-sans)',
                }}>
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
```

---

## تحديث `app.tsx` النهائي

```tsx
import React, { useState } from 'react'
import './globals.css'

import HomePage     from './home-page'
import AgentsPage   from './agents-page'
import TasksPage    from './tasks-page'
import MemoryPage   from './memory-page'
import CostPage     from './cost-page'
import LogsPage     from './logs-page'
import SettingsPage from './settings-page'

import { useStatus, useSocket } from './hooks/useApi'

type Page = 'home' | 'agents' | 'tasks' | 'memory' | 'cost' | 'logs' | 'settings'

export default function App() {
  const [active, setActive] = useState<Page>('home')
  const status = useStatus()
  const { connected } = useSocket()

  const nav: { id: Page; label: string }[] = [
    { id: 'home',     label: 'الرئيسية' },
    { id: 'agents',   label: 'الوكلاء' },
    { id: 'tasks',    label: 'المهام' },
    { id: 'memory',   label: 'الذاكرة' },
    { id: 'cost',     label: 'التكاليف' },
    { id: 'logs',     label: 'السجلات' },
    { id: 'settings', label: 'الإعدادات' },
  ]

  const pages: Record<Page, React.ReactNode> = {
    home:     <HomePage />,
    agents:   <AgentsPage />,
    tasks:    <TasksPage />,
    memory:   <MemoryPage />,
    cost:     <CostPage />,
    logs:     <LogsPage />,
    settings: <SettingsPage />,
  }

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: 'var(--bg-primary)',
      direction: 'rtl',
      fontFamily: 'var(--font-sans)',
    }}>

      {/* ─── Sidebar ─────────────────────────── */}
      <aside style={{
        width: 200,
        borderLeft: '1px solid var(--border-subtle)',
        background: 'var(--bg-secondary)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 16px 24px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: connected ? 'var(--success)' : 'var(--error)',
              animation: connected ? 'pulse 2s infinite' : 'none',
            }} />
            <span style={{
              fontWeight: 600,
              fontSize: 16,
              letterSpacing: '-0.02em',
            }}>
              OpenClaude
            </span>
          </div>
          <div style={{
            fontSize: 11,
            color: 'var(--text-tertiary)',
            marginTop: 4,
            paddingRight: 16,
          }}>
            {connected ? 'متصل' : 'غير متصل'} · ${status.totalCost.toFixed(2)}
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '0 8px', flex: 1 }}>
          {nav.map(item => (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 12px',
                textAlign: 'right',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                background: active === item.id
                  ? 'var(--bg-active)'
                  : 'transparent',
                color: active === item.id
                  ? 'var(--text-primary)'
                  : 'var(--text-secondary)',
                fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
                marginBottom: 2,
                transition: 'all var(--transition)',
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-tertiary)',
        }}>
          v2.0 · {status.activeAgents} وكيل نشط
        </div>
      </aside>

      {/* ─── Main ────────────────────────────── */}
      <main style={{
        flex: 1,
        overflow: 'auto',
        padding: '40px 48px',
      }}>
        {pages[active]}
      </main>
    </div>
  )
}
```

---

## ✅ ملخص ما أصبح جاهزاً

```
الواجهة الكاملة (7 صفحات):
├── 🏠 home-page.tsx      ← بيانات حية + Quick Command
├── 🤖 agents-page.tsx    ← تشغيل/إيقاف حقيقي
├── 📋 tasks-page.tsx     ← شجرة مهام تفاعلية
├── 🧠 memory-page.tsx    ← بيانات حية من MemPalace
├── 💰 cost-page.tsx      ← تتبع تكاليف حقيقي
├── 📅 logs-page.tsx      ← سجلات حية
├── ⚙️ settings-page.tsx  ← إعدادات
│
Backend:
├── 🖥️ server.ts          ← Express + Socket.IO
│
Hooks:
├── 🔌 useApi.ts          ← كل التواصل مع الـ Backend
│
Styles:
├── 🎨 globals.css        ← Claude Code Style
└── ✨ pulse animation    ← تأثير بسيط
```