صفحة الوكلاء: agents-page.tsx
React

import React, { useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentStatus = 'active' | 'idle' | 'done' | 'error'
type MemoryLevel = 'hot' | 'warm' | 'cold'

interface Agent {
  id: string
  name: string
  role: string
  model: string
  provider: string
  status: AgentStatus
  currentTask: string
  tokens: number
  cost: number
  uptime: string
  temperature: number
  memory: {
    hot: number
    warm: number
    cold: number
  }
  lastMessages: {
    from: string
    to: string
    content: string
    time: string
  }[]
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const agents: Agent[] = [
  {
    id: 'pm',
    name: 'project-manager',
    role: 'منسق الفريق',
    model: 'gemini-1.5-pro',
    provider: 'Google',
    status: 'active',
    currentTask: 'تحليل المتطلبات وتوزيع المهام على الفريق',
    tokens: 2340,
    cost: 0.12,
    uptime: '00:12:34',
    temperature: 0.3,
    memory: { hot: 8, warm: 23, cold: 45 },
    lastMessages: [
      { from: 'project-manager', to: 'developer',    content: 'جهز بيئة React', time: '12:34' },
      { from: 'qa-engineer',     to: 'project-manager', content: 'وجدت خطأ في auth', time: '12:36' },
    ],
  },
  {
    id: 'dev',
    name: 'developer',
    role: 'مطور البرمجيات',
    model: 'deepseek-coder',
    provider: 'DeepSeek',
    status: 'idle',
    currentTask: 'بانتظار خطة العمل من المدير',
    tokens: 0,
    cost: 0,
    uptime: '—',
    temperature: 0.1,
    memory: { hot: 2, warm: 10, cold: 30 },
    lastMessages: [],
  },
  {
    id: 'qa',
    name: 'qa-engineer',
    role: 'مهندس الجودة',
    model: 'llama-3.1-70b',
    provider: 'Groq',
    status: 'active',
    currentTask: 'مراجعة ملف auth.ts والبحث عن ثغرات أمنية',
    tokens: 1120,
    cost: 0.03,
    uptime: '00:04:21',
    temperature: 0.1,
    memory: { hot: 5, warm: 15, cold: 60 },
    lastMessages: [
      { from: 'qa-engineer', to: 'project-manager', content: 'وجدت 2 أخطاء', time: '12:36' },
    ],
  },
  {
    id: 'designer',
    name: 'ui-ux-designer',
    role: 'مصمم الواجهات',
    model: 'gemini-1.5-flash',
    provider: 'Google',
    status: 'done',
    currentTask: 'اكتمل: تصميم صفحة الهبوط بالكامل',
    tokens: 890,
    cost: 0.01,
    uptime: '00:01:03',
    temperature: 0.6,
    memory: { hot: 0, warm: 8, cold: 20 },
    lastMessages: [],
  },
  {
    id: 'mkt',
    name: 'marketing-strategist',
    role: 'استراتيجي التسويق',
    model: 'llama-3.1-70b',
    provider: 'Groq',
    status: 'error',
    currentTask: 'فشل: Rate limit تجاوز الحد المسموح',
    tokens: 450,
    cost: 0.01,
    uptime: '—',
    temperature: 0.7,
    memory: { hot: 1, warm: 5, cold: 12 },
    lastMessages: [],
  },
]

// ─── Components ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AgentStatus }) {
  const config: Record<AgentStatus, { label: string; color: string; bg: string }> = {
    active: { label: 'يعمل',   color: 'var(--success)', bg: 'rgba(61,154,95,0.1)'  },
    idle:   { label: 'ينتظر',  color: 'var(--text-tertiary)', bg: 'var(--bg-tertiary)' },
    done:   { label: 'انتهى',  color: 'var(--info)',    bg: 'rgba(74,142,201,0.1)' },
    error:  { label: 'خطأ',    color: 'var(--error)',   bg: 'rgba(201,74,74,0.1)'  },
  }
  const c = config[status]
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

function MemoryBar({
  level,
  value,
  max,
}: {
  level: MemoryLevel
  value: number
  max: number
}) {
  const colors: Record<MemoryLevel, string> = {
    hot:  'var(--error)',
    warm: 'var(--warning)',
    cold: 'var(--info)',
  }
  const labels: Record<MemoryLevel, string> = {
    hot: 'HOT', warm: 'WARM', cold: 'COLD',
  }
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: 3,
      }}>
        <span style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono)',
        }}>
          {labels[level]}
        </span>
        <span style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono)',
        }}>
          {value}
        </span>
      </div>
      <div style={{
        height: 2,
        background: 'var(--border-subtle)',
        borderRadius: 1,
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: colors[level],
          borderRadius: 1,
          transition: 'width 500ms ease',
        }} />
      </div>
    </div>
  )
}

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
        background: selected
          ? 'var(--bg-active)'
          : 'var(--bg-secondary)',
        border: `1px solid ${selected
          ? 'var(--border-primary)'
          : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        transition: 'all var(--transition)',
        marginBottom: 'var(--space-sm)',
      }}
    >
      {/* Header */}
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
          <div style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-tertiary)',
          }}>
            {agent.role}
          </div>
        </div>
        <StatusBadge status={agent.status} />
      </div>

      {/* Task */}
      <div style={{
        fontSize: 'var(--text-xs)',
        color: 'var(--text-secondary)',
        marginBottom: 'var(--space-md)',
        lineHeight: 1.6,
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
      }}>
        {agent.currentTask}
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 'var(--text-xs)',
        color: 'var(--text-tertiary)',
        fontFamily: 'var(--font-mono)',
      }}>
        <span>{agent.model}</span>
        <span>
          {agent.tokens > 0 ? `${agent.tokens.toLocaleString()} tok` : '—'}
        </span>
      </div>
    </div>
  )
}

function AgentDetail({ agent }: { agent: Agent }) {
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
      {/* Detail Header */}
      <div style={{
        padding: 'var(--space-xl)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--space-md)',
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
            <span style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-tertiary)',
            }}>
              {agent.role}
            </span>
          </div>
          <StatusBadge status={agent.status} />
        </div>

        {/* Stats Row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'var(--space-md)',
        }}>
          {[
            { label: 'التوكن',   value: agent.tokens > 0 ? agent.tokens.toLocaleString() : '—' },
            { label: 'التكلفة',  value: `$${agent.cost.toFixed(3)}`                           },
            { label: 'الوقت',    value: agent.uptime                                           },
          ].map(stat => (
            <div key={stat.label} style={{
              padding: 'var(--space-md)',
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-sm)',
              textAlign: 'center',
            }}>
              <div style={{
                fontSize: '18px',
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                marginBottom: 2,
              }}>
                {stat.value}
              </div>
              <div style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-tertiary)',
              }}>
                {stat.label}
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

        {/* Model Info */}
        <Section title="النموذج">
          <Row label="المزود"       value={agent.provider}                    />
          <Row label="النموذج"      value={agent.model} mono                  />
          <Row label="Temperature"  value={agent.temperature.toString()} mono  />
        </Section>

        {/* Memory */}
        <Section title="الذاكرة">
          <MemoryBar level="hot"  value={agent.memory.hot}  max={15} />
          <MemoryBar level="warm" value={agent.memory.warm} max={50} />
          <MemoryBar level="cold" value={agent.memory.cold} max={500} />
        </Section>

        {/* Messages */}
        {agent.lastMessages.length > 0 && (
          <Section title="آخر الرسائل">
            {agent.lastMessages.map((msg, i) => (
              <div key={i} style={{
                padding: 'var(--space-md)',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 'var(--space-sm)',
                fontSize: 'var(--text-xs)',
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 4,
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  <span>{msg.from} → {msg.to}</span>
                  <span>{msg.time}</span>
                </div>
                <div style={{ color: 'var(--text-secondary)' }}>
                  {msg.content}
                </div>
              </div>
            ))}
          </Section>
        )}

        {/* Actions */}
        <Section title="الإجراءات">
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            {agent.status === 'active' && (
              <ActionBtn label="إيقاف" variant="danger" />
            )}
            {agent.status === 'idle' && (
              <ActionBtn label="تشغيل" variant="primary" />
            )}
            {agent.status === 'error' && (
              <ActionBtn label="إعادة تشغيل" variant="primary" />
            )}
            <ActionBtn label="مسح الذاكرة" variant="ghost" />
            <ActionBtn label="عرض السجل"   variant="ghost" />
          </div>
        </Section>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 'var(--space-2xl)' }}>
      <h3 style={{
        fontSize: 'var(--text-xs)',
        color: 'var(--text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 'var(--space-md)',
      }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function Row({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      padding: '6px 0',
      borderBottom: '1px solid var(--border-subtle)',
      fontSize: 'var(--text-sm)',
    }}>
      <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{
        fontFamily: mono ? 'var(--font-mono)' : 'inherit',
        fontSize: mono ? 'var(--text-xs)' : 'inherit',
      }}>
        {value}
      </span>
    </div>
  )
}

function ActionBtn({
  label,
  variant,
}: {
  label: string
  variant: 'primary' | 'danger' | 'ghost'
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: {
      background: 'var(--accent)',
      color: '#fff',
      border: 'none',
    },
    danger: {
      background: 'rgba(201,74,74,0.1)',
      color: 'var(--error)',
      border: '1px solid rgba(201,74,74,0.2)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-secondary)',
      border: '1px solid var(--border-subtle)',
    },
  }
  return (
    <button style={{
      ...styles[variant],
      padding: '6px 14px',
      borderRadius: 'var(--radius-sm)',
      fontSize: 'var(--text-xs)',
      fontFamily: 'var(--font-sans)',
      cursor: 'pointer',
      fontWeight: 500,
      transition: 'opacity var(--transition)',
    }}
    onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
    >
      {label}
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const [selectedId, setSelectedId] = useState<string>(agents[0].id)
  const selected = agents.find(a => a.id === selectedId)!

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
            {agents.filter(a => a.status === 'active').length} نشط
            من أصل {agents.length}
          </p>
        </div>

        <button style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm)',
          padding: '8px 16px',
          background: 'var(--accent)',
          color: '#fff',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--text-sm)',
          fontFamily: 'var(--font-sans)',
          cursor: 'pointer',
          fontWeight: 500,
        }}>
          + وكيل جديد
        </button>
      </div>

      {/* Split Layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '320px 1fr',
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
        <AgentDetail agent={selected} />
      </div>
    </div>
  )
}
صفحة الذاكرة: memory-page.tsx
React

import React, { useState } from 'react'

type Level = 'all' | 'hot' | 'warm' | 'cold'

interface MemEntry {
  id: string
  level: 'hot' | 'warm' | 'cold'
  agent: string
  content: string
  tags: string[]
  importance: number
  time: string
  accessCount: number
}

const entries: MemEntry[] = [
  {
    id: '1', level: 'hot', agent: 'project-manager',
    content: 'قررنا استخدام PostgreSQL لدعمه المتقدم لـ JSON وأداءه العالي مع البيانات العلائقية',
    tags: ['قرار', 'قاعدة-بيانات', 'تقني'],
    importance: 9, time: 'منذ 2 دقيقة', accessCount: 3,
  },
  {
    id: '2', level: 'hot', agent: 'developer',
    content: 'الـ Auth system يستخدم JWT مع refresh tokens بصلاحية 7 أيام',
    tags: ['auth', 'security', 'jwt'],
    importance: 8, time: 'منذ 5 دقائق', accessCount: 5,
  },
  {
    id: '3', level: 'warm', agent: 'qa-engineer',
    content: 'وجدنا ثغرة SQL injection في دالة getUserById - تم الإبلاغ للمطور',
    tags: ['security', 'bug', 'sql'],
    importance: 9, time: 'منذ 15 دقيقة', accessCount: 2,
  },
  {
    id: '4', level: 'warm', agent: 'project-manager',
    content: 'المشروع يستخدم TypeScript strict mode مع ESLint للحفاظ على جودة الكود',
    tags: ['typescript', 'code-quality', 'tools'],
    importance: 6, time: 'منذ 30 دقيقة', accessCount: 8,
  },
  {
    id: '5', level: 'cold', agent: 'qa-engineer',
    content: 'تعلم: دائماً أضف rate limiting لجميع API endpoints حتى الداخلية منها',
    tags: ['تعلم', 'security', 'api', 'best-practice'],
    importance: 9, time: 'منذ ساعة', accessCount: 12,
  },
  {
    id: '6', level: 'cold', agent: 'developer',
    content: 'قرار معماري: استخدام Repository Pattern لفصل منطق قاعدة البيانات',
    tags: ['architecture', 'pattern', 'قرار'],
    importance: 8, time: 'منذ 2 ساعة', accessCount: 6,
  },
]

function LevelTag({ level }: { level: 'hot' | 'warm' | 'cold' }) {
  const config = {
    hot:  { label: 'HOT',  color: 'var(--error)',   bg: 'rgba(201,74,74,0.08)'  },
    warm: { label: 'WARM', color: 'var(--warning)', bg: 'rgba(201,148,62,0.08)' },
    cold: { label: 'COLD', color: 'var(--info)',    bg: 'rgba(74,142,201,0.08)' },
  }
  const c = config[level]
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
            ? value >= 8
              ? 'var(--error)'
              : value >= 5
                ? 'var(--warning)'
                : 'var(--info)'
            : 'var(--border-primary)',
        }} />
      ))}
    </div>
  )
}

function MemoryCard({ entry }: { entry: MemEntry }) {
  return (
    <div style={{
      padding: 'var(--space-lg)',
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      marginBottom: 'var(--space-sm)',
      transition: 'border-color var(--transition)',
    }}
    onMouseEnter={e => {
      e.currentTarget.style.borderColor = 'var(--border-primary)'
    }}
    onMouseLeave={e => {
      e.currentTarget.style.borderColor = 'var(--border-subtle)'
    }}
    >
      {/* Header */}
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
            {entry.agent}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)' }}>
          <ImportanceDots value={entry.importance} />
          <span style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-tertiary)',
          }}>
            {entry.time}
          </span>
        </div>
      </div>

      {/* Content */}
      <p style={{
        fontSize: 'var(--text-sm)',
        color: 'var(--text-primary)',
        lineHeight: 1.6,
        marginBottom: 'var(--space-md)',
      }}>
        {entry.content}
      </p>

      {/* Footer */}
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

  const filtered = entries.filter(e => {
    const matchLevel = activeLevel === 'all' || e.level === activeLevel
    const matchSearch = search === ''
      || e.content.toLowerCase().includes(search.toLowerCase())
      || e.tags.some(t => t.includes(search.toLowerCase()))
    return matchLevel && matchSearch
  })

  const counts = {
    hot:  entries.filter(e => e.level === 'hot').length,
    warm: entries.filter(e => e.level === 'warm').length,
    cold: entries.filter(e => e.level === 'cold').length,
  }

  return (
    <div style={{ maxWidth: 820 }}>

      {/* Header */}
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
          {entries.length} مدخل في MemPalace
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
          { level: 'hot' as const,  label: 'HOT — فوري',  color: 'var(--error)',   count: counts.hot,  sub: 'تنتهي خلال ساعتين' },
          { level: 'warm' as const, label: 'WARM — نشط',  color: 'var(--warning)', count: counts.warm, sub: 'سياق المشروع'       },
          { level: 'cold' as const, label: 'COLD — أرشيف',color: 'var(--info)',    count: counts.cold, sub: 'قرارات وتعلّم'      },
        ].map(s => (
          <div
            key={s.level}
            onClick={() => setActiveLevel(
              activeLevel === s.level ? 'all' : s.level
            )}
            style={{
              padding: 'var(--space-lg)',
              background: activeLevel === s.level
                ? 'var(--bg-active)'
                : 'var(--bg-secondary)',
              border: `1px solid ${activeLevel === s.level
                ? 'var(--border-primary)'
                : 'var(--border-subtle)'}`,
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
              {s.label}
            </div>
            <div style={{
              fontSize: '28px',
              fontWeight: 600,
              letterSpacing: '-0.02em',
              marginBottom: 2,
            }}>
              {s.count}
            </div>
            <div style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-tertiary)',
            }}>
              {s.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{
        marginBottom: 'var(--space-xl)',
      }}>
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
            transition: 'border-color var(--transition)',
          }}
          onFocus={e => {
            e.target.style.borderColor = 'var(--border-primary)'
          }}
          onBlur={e => {
            e.target.style.borderColor = 'var(--border-subtle)'
          }}
        />
      </div>

      {/* Entries */}
      <div>
        {filtered.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: 'var(--space-3xl)',
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
    </div>
  )
}
صفحة التكاليف: cost-page.tsx
React

import React, { useState } from 'react'

interface ModelCost {
  model:    string
  provider: string
  requests: number
  tokens:   number
  cost:     number
  pct:      number
}

interface AgentCost {
  name:     string
  model:    string
  requests: number
  tokens:   number
  cost:     number
}

const modelCosts: ModelCost[] = [
  { model: 'gemini-1.5-pro',   provider: 'Google',  requests: 8,  tokens: 18000, cost: 0.14, pct: 61 },
  { model: 'deepseek-coder',   provider: 'DeepSeek', requests: 15, tokens: 12000, cost: 0.05, pct: 22 },
  { model: 'llama-3.1-70b',    provider: 'Groq',    requests: 12, tokens: 9000,  cost: 0.03, pct: 13 },
  { model: 'gemini-1.5-flash', provider: 'Google',  requests: 3,  tokens: 6230,  cost: 0.01, pct: 4  },
]

const agentCosts: AgentCost[] = [
  { name: 'project-manager',    model: 'gemini-1.5-pro',   requests: 8,  tokens: 18000, cost: 0.12 },
  { name: 'developer',          model: 'deepseek-coder',   requests: 15, tokens: 12000, cost: 0.07 },
  { name: 'qa-engineer',        model: 'llama-3.1-70b',    requests: 12, tokens: 9000,  cost: 0.03 },
  { name: 'ui-ux-designer',     model: 'gemini-1.5-flash', requests: 3,  tokens: 6230,  cost: 0.01 },
]

function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{
      height: 3,
      background: 'var(--border-subtle)',
      borderRadius: 2,
      overflow: 'hidden',
      width: 80,
    }}>
      <div style={{
        height: '100%',
        width: `${pct}%`,
        background: color,
        borderRadius: 2,
      }} />
    </div>
  )
}

export default function CostPage() {
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today')

  const total    = modelCosts.reduce((s, m) => s + m.cost, 0)
  const tokens   = modelCosts.reduce((s, m) => s + m.tokens, 0)
  const requests = modelCosts.reduce((s, m) => s + m.requests, 0)

  return (
    <div style={{ maxWidth: 820 }}>

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
            التكاليف
          </h1>
          <p style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--text-tertiary)',
          }}>
            استهلاك الـ API وتتبع الإنفاق
          </p>
        </div>

        {/* Period Toggle */}
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
                background: period === p
                  ? 'var(--bg-active)'
                  : 'transparent',
                color: period === p
                  ? 'var(--text-primary)'
                  : 'var(--text-tertiary)',
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-sans)',
                cursor: 'pointer',
                transition: 'all var(--transition)',
              }}
            >
              {{ today: 'اليوم', week: 'الأسبوع', month: 'الشهر' }[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Top Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 'var(--space-md)',
        marginBottom: 'var(--space-3xl)',
      }}>
        {[
          { label: 'الإجمالي',    value: `$${total.toFixed(3)}` },
          { label: 'التوكن',      value: `${(tokens / 1000).toFixed(1)}K` },
          { label: 'الطلبات',     value: requests.toString()    },
          { label: 'متوسط/طلب',   value: `$${(total / requests).toFixed(4)}` },
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
              letterSpacing: '-0.02em',
            }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* By Model */}
      <div style={{ marginBottom: 'var(--space-3xl)' }}>
        <h2 style={{
          fontSize: 'var(--text-base)',
          fontWeight: 600,
          marginBottom: 'var(--space-lg)',
        }}>
          حسب النموذج
        </h2>
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 80px 80px 80px 100px',
            padding: '8px 16px',
            borderBottom: '1px solid var(--border-primary)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            <span>النموذج</span>
            <span style={{ textAlign: 'center' }}>طلبات</span>
            <span style={{ textAlign: 'center' }}>توكن</span>
            <span style={{ textAlign: 'center' }}>الحصة</span>
            <span style={{ textAlign: 'left'  }}>التكلفة</span>
          </div>

          {modelCosts.map((m, i) => (
            <div key={m.model} style={{
              display: 'grid',
              gridTemplateColumns: '1fr 80px 80px 80px 100px',
              padding: '12px 16px',
              borderBottom: i < modelCosts.length - 1
                ? '1px solid var(--border-subtle)'
                : 'none',
              alignItems: 'center',
              transition: 'background var(--transition)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--bg-hover)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
            }}
            >
              <div>
                <div style={{
                  fontSize: 'var(--text-sm)',
                  fontFamily: 'var(--font-mono)',
                  marginBottom: 2,
                }}>
                  {m.model}
                </div>
                <div style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-tertiary)',
                }}>
                  {m.provider}
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
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
              }}>
                <MiniBar pct={m.pct} color="var(--accent)" />
                <span style={{
                  fontSize: '11px',
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {m.pct}%
                </span>
              </div>
              <span style={{
                textAlign: 'left',
                fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 500,
              }}>
                ${m.cost.toFixed(3)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* By Agent */}
      <div style={{ marginBottom: 'var(--space-3xl)' }}>
        <h2 style={{
          fontSize: 'var(--text-base)',
          fontWeight: 600,
          marginBottom: 'var(--space-lg)',
        }}>
          حسب الوكيل
        </h2>
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}>
          {agentCosts.map((a, i) => {
            const pct = Math.round((a.cost / total) * 100)
            return (
              <div key={a.name} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 120px 80px',
                padding: '12px 16px',
                borderBottom: i < agentCosts.length - 1
                  ? '1px solid var(--border-subtle)'
                  : 'none',
                alignItems: 'center',
                transition: 'background var(--transition)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--bg-hover)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
              }}
              >
                <div>
                  <div style={{
                    fontSize: 'var(--text-sm)',
                    fontFamily: 'var(--font-mono)',
                    marginBottom: 6,
                  }}>
                    {a.name}
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-sm)',
                  }}>
                    <div style={{
                      flex: 1,
                      maxWidth: 200,
                      height: 3,
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
                    <span style={{
                      fontSize: '11px',
                      color: 'var(--text-tertiary)',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {pct}%
                    </span>
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

      {/* Tip */}
      <div style={{
        padding: 'var(--space-lg)',
        background: 'var(--accent-subtle)',
        border: '1px solid rgba(201,100,66,0.2)',
        borderRadius: 'var(--radius-md)',
        fontSize: 'var(--text-sm)',
        color: 'var(--text-secondary)',
      }}>
        💡 استبدل <span style={{
          fontFamily: 'var(--font-mono)',
          color: 'var(--accent)',
        }}>gemini-1.5-pro</span> بـ <span style={{
          fontFamily: 'var(--font-mono)',
          color: 'var(--accent)',
        }}>gemini-1.5-flash</span> للمهام البسيطة — ستوفر تقريباً{' '}
        <strong>$0.08/يوم</strong>
      </div>
    </div>
  )
}
صفحة الإعدادات: settings-page.tsx
React

import React, { useState } from 'react'

function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '16px 0',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      <div>
        <div style={{
          fontSize: 'var(--text-sm)',
          fontWeight: 500,
          marginBottom: description ? 3 : 0,
        }}>
          {label}
        </div>
        {description && (
          <div style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-tertiary)',
          }}>
            {description}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

function Toggle({
  value,
  onChange,
}: {
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        background: value ? 'var(--accent)' : 'var(--bg-tertiary)',
        border: '1px solid var(--border-primary)',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background var(--transition)',
        flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute',
        top: 2,
        right: value ? 2 : 16,
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: '#fff',
        transition: 'right var(--transition)',
      }} />
    </button>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        padding: '6px 12px',
        background: 'var(--bg-tertiary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--text-primary)',
        fontSize: 'var(--text-sm)',
        fontFamily: type === 'text' ? 'var(--font-sans)' : 'var(--font-mono)',
        outline: 'none',
        width: 260,
        direction: 'ltr',
        textAlign: 'left',
        transition: 'border-color var(--transition)',
      }}
      onFocus={e => e.target.style.borderColor = 'var(--border-primary)'}
      onBlur={e  => e.target.style.borderColor = 'var(--border-subtle)'}
    />
  )
}

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    googleKey:   '',
    groqKey:     '',
    deepseekKey: '',
    telegramToken: '',
    autoApprove: false,
    saveLocally: true,
    rateLimitWarn: true,
    dailyLog: true,
    language: 'ar',
    maxTeamSize: '5',
  })

  const set = (key: keyof typeof settings) =>
    (value: string | boolean) =>
      setSettings(prev => ({ ...prev, [key]: value }))

  return (
    <div style={{ maxWidth: 680 }}>

      {/* Header */}
      <div style={{ marginBottom: 'var(--space-3xl)' }}>
        <h1 style={{
          fontSize: 'var(--text-xl)',
          fontWeight: 600,
          marginBottom: 'var(--space-xs)',
        }}>
          الإعدادات
        </h1>
      </div>

      {/* API Keys */}
      <section style={{ marginBottom: 'var(--space-3xl)' }}>
        <h2 style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 'var(--space-lg)',
        }}>
          مفاتيح الـ API
        </h2>

        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '0 var(--space-xl)',
        }}>
          <SettingRow label="Google AI Studio" description="Gemini Pro & Flash">
            <TextInput
              type="password"
              value={settings.googleKey}
              onChange={set('googleKey')}
              placeholder="AIza..."
            />
          </SettingRow>
          <SettingRow label="Groq" description="Llama 3.1 70B">
            <TextInput
              type="password"
              value={settings.groqKey}
              onChange={set('groqKey')}
              placeholder="gsk_..."
            />
          </SettingRow>
          <SettingRow label="DeepSeek" description="DeepSeek Coder">
            <TextInput
              type="password"
              value={settings.deepseekKey}
              onChange={set('deepseekKey')}
              placeholder="sk-..."
            />
          </SettingRow>
          <SettingRow label="Telegram Bot Token" description="للتحكم عن بُعد">
            <TextInput
              type="password"
              value={settings.telegramToken}
              onChange={set('telegramToken')}
              placeholder="1234567890:ABC..."
            />
          </SettingRow>
        </div>
      </section>

      {/* Behavior */}
      <section style={{ marginBottom: 'var(--space-3xl)' }}>
        <h2 style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 'var(--space-lg)',
        }}>
          السلوك
        </h2>

        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '0 var(--space-xl)',
        }}>
          <SettingRow
            label="موافقة تلقائية"
            description="تخطي المراجعة البشرية للخطط البسيطة"
          >
            <Toggle
              value={settings.autoApprove}
              onChange={set('autoApprove')}
            />
          </SettingRow>
          <SettingRow
            label="حفظ محلي فقط"
            description="لا تخرج البيانات خارج جهازك"
          >
            <Toggle
              value={settings.saveLocally}
              onChange={set('saveLocally')}
            />
          </SettingRow>
          <SettingRow
            label="تحذير Rate Limit"
            description="أشعرني قبل بلوغ حد الـ API"
          >
            <Toggle
              value={settings.rateLimitWarn}
              onChange={set('rateLimitWarn')}
            />
          </SettingRow>
          <SettingRow
            label="السجل اليومي"
            description="حفظ كل الأحداث في ملف يومي"
          >
            <Toggle
              value={settings.dailyLog}
              onChange={set('dailyLog')}
            />
          </SettingRow>
        </div>
      </section>

      {/* Save */}
      <button style={{
        padding: '10px 24px',
        background: 'var(--accent)',
        color: '#fff',
        border: 'none',
        borderRadius: 'var(--radius-md)',
        fontSize: 'var(--text-sm)',
        fontFamily: 'var(--font-sans)',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'opacity var(--transition)',
      }}
      onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        حفظ الإعدادات
      </button>
    </div>
  )
}
ملف التجميع: app.tsx
React

import React, { useState } from 'react'
import './globals.css'
import HomePage     from './home-page'
import AgentsPage   from './agents-page'
import MemoryPage   from './memory-page'
import CostPage     from './cost-page'
import SettingsPage from './settings-page'

type Page = 'home' | 'agents' | 'tasks' | 'memory' | 'cost' | 'logs' | 'settings'

const pages: Record<Page, React.ReactNode> = {
  home:     <HomePage     />,
  agents:   <AgentsPage   />,
  tasks:    <div style={{ color: 'var(--text-tertiary)', padding: 20 }}>صفحة المهام — قريباً</div>,
  memory:   <MemoryPage   />,
  cost:     <CostPage     />,
  logs:     <div style={{ color: 'var(--text-tertiary)', padding: 20 }}>صفحة السجلات — قريباً</div>,
  settings: <SettingsPage />,
}

export default function App() {
  const [active, setActive] = useState<Page>('home')

  const nav = [
    { id: 'home'    as Page, label: 'الرئيسية'  },
    { id: 'agents'  as Page, label: 'الوكلاء'   },
    { id: 'tasks'   as Page, label: 'المهام'    },
    { id: 'memory'  as Page, label: 'الذاكرة'   },
    { id: 'cost'    as Page, label: 'التكاليف'  },
    { id: 'logs'    as Page, label: 'السجلات'   },
    { id: 'settings'as Page, label: 'الإعدادات' },
  ]

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: 'var(--bg-primary)',
      direction: 'rtl',
      fontFamily: 'var(--font-sans)',
    }}>
      {/* Sidebar */}
      <aside style={{
        width: 200,
        borderLeft: '1px solid var(--border-subtle)',
        background: 'var(--bg-secondary)',
        display: 'flex',
        flexDirection: 'column',
        padding: 'var(--space-sm)',
      }}>
        <div style={{ padding: '16px 12px 20px' }}>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 2 }}>
            OpenClaude
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            Agency v2.0
          </div>
        </div>

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
              background: active === item.id ? 'var(--bg-active)' : 'transparent',
              color: active === item.id ? 'var(--text-primary)' : 'var(--text-secondary)',
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
      </aside>

      {/* Main */}
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
✅ ملخص ما لديك الآن
text

globals.css      ← نظام الألوان والخطوط
layout.tsx       ← الهيكل الأساسي
home-page.tsx    ← الصفحة الرئيسية
agents-page.tsx  ← صفحة الوكلاء
memory-page.tsx  ← صفحة الذاكرة
cost-page.tsx    ← صفحة التكاليف
settings-page.tsx ← صفحة الإعدادات
app.tsx          ← التجميع الكامل
