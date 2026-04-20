المشكلة مع الواجهات المولّدة بالذكاء الاصطناعي
text

واجهتك الحالية على الأغلب فيها:

❌ ألوان كثيرة وعشوائية
❌ Gradients مبالغ فيها في كل مكان
❌ أيقونات Emoji بدل أيقونات SVG نظيفة
❌ حدود مستديرة مبالغ فيها (rounded-2xl على كل شيء)
❌ ظلال ثقيلة وتأثيرات بصرية زائدة
❌ مسافات غير متسقة
❌ خطوط كثيرة ومختلفة
❌ كل عنصر يصرخ "انظر لي"
فلسفة Claude Code في التصميم
text

Claude Code يتبع قاعدة واحدة:

"المحتوى هو البطل - كل شيء آخر يختفي"

✅ ألوان محدودة جداً (2-3 فقط)
✅ مسافات واسعة ومريحة
✅ خط واحد فقط بأوزان مختلفة
✅ لا ظلال تقريباً
✅ الحدود رفيعة وهادئة
✅ التفاعل يظهر فقط عند الحاجة
✅ الأولوية للقراءة لا للزينة
🖥️ التصميم الجديد بأسلوب Claude Code
أرسل لي واجهتك الحالية أو أخبرني ما نوعها وسأبني لك الواجهة الجديدة، لكن أعطيك الآن الأساس الكامل:

الملف الأول: globals.css
CSS

/* ═══════════════════════════════════════════════
   OpenClaude UI — Claude Code Style
   القاعدة: بساطة مطلقة، كل بكسل له سبب
   ═══════════════════════════════════════════════ */

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

/* ─── Reset ──────────────────────────────────── */

*,
*::before,
*::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* ─── CSS Variables ──────────────────────────── */

:root {
  /* Claude Code لا يستخدم أكثر من هذا */
  --bg-primary:      #191919;
  --bg-secondary:    #1e1e1e;
  --bg-tertiary:     #252525;
  --bg-hover:        #2a2a2a;
  --bg-active:       #303030;

  --border-primary:  #333333;
  --border-subtle:   #2a2a2a;

  --text-primary:    #e3e3e3;
  --text-secondary:  #999999;
  --text-tertiary:   #666666;
  --text-inverse:    #191919;

  --accent:          #c96442;
  --accent-hover:    #d4764f;
  --accent-subtle:   rgba(201, 100, 66, 0.1);

  --success:         #3d9a5f;
  --warning:         #c9943e;
  --error:           #c94a4a;
  --info:            #4a8ec9;

  /* Claude Code خط واحد فقط */
  --font-sans:       'Inter', -apple-system, sans-serif;
  --font-mono:       'JetBrains Mono', 'Fira Code', monospace;

  /* مسافات متسقة */
  --space-xs:  4px;
  --space-sm:  8px;
  --space-md:  12px;
  --space-lg:  16px;
  --space-xl:  24px;
  --space-2xl: 32px;
  --space-3xl: 48px;

  /* أحجام النص */
  --text-xs:   11px;
  --text-sm:   13px;
  --text-base: 14px;
  --text-lg:   16px;
  --text-xl:   18px;

  /* لا rounded-2xl — حدود رفيعة فقط */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;

  /* انتقالات هادئة */
  --transition: 150ms ease;
}

/* ─── Base ────────────────────────────────────── */

html {
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  font-family: var(--font-sans);
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.5;
  overflow: hidden;
  height: 100vh;
}

/* ─── Selection ───────────────────────────────── */

::selection {
  background: var(--accent-subtle);
  color: var(--text-primary);
}

/* ─── Scrollbar — رفيع وهادئ ────────────────── */

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--border-primary);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}

/* ─── Typography ──────────────────────────────── */

h1, h2, h3 {
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text-primary);
}

code, pre, .mono {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

/* ─── Links ───────────────────────────────────── */

a {
  color: var(--text-secondary);
  text-decoration: none;
  transition: color var(--transition);
}

a:hover {
  color: var(--text-primary);
}
الملف الثاني: layout.tsx
React

/**
 * الهيكل الأساسي — بنفس أسلوب Claude Code
 * Sidebar ضيق + منطقة عمل واسعة
 */

import React, { useState } from 'react'

// أيقونات SVG بسيطة بدلاً من Emoji
const Icons = {
  home:     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1"/></svg>,
  agents:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 00-16 0"/></svg>,
  tasks:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>,
  memory:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7c-2 0-3 1-3 3z"/><path d="M12 4v16M4 12h16"/></svg>,
  cost:     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
  logs:     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>,
  settings: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
  send:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>,
}

type Page = 'home' | 'agents' | 'tasks' | 'memory' | 'cost' | 'logs' | 'settings'

interface NavItem {
  id: Page
  label: string
  icon: React.ReactNode
}

const navItems: NavItem[] = [
  { id: 'home',     label: 'الرئيسية', icon: Icons.home     },
  { id: 'agents',   label: 'الوكلاء',  icon: Icons.agents   },
  { id: 'tasks',    label: 'المهام',   icon: Icons.tasks    },
  { id: 'memory',   label: 'الذاكرة',  icon: Icons.memory   },
  { id: 'cost',     label: 'التكاليف', icon: Icons.cost     },
  { id: 'logs',     label: 'السجلات',  icon: Icons.logs     },
  { id: 'settings', label: 'الإعدادات', icon: Icons.settings },
]

export default function Layout({ children }: { children?: React.ReactNode }) {
  const [active, setActive] = useState<Page>('home')
  const [inputValue, setInputValue] = useState('')

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: 'var(--bg-primary)',
      direction: 'rtl',
    }}>

      {/* ─── Sidebar ──────────────────────────── */}
      <aside style={{
        width: 220,
        borderLeft: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-secondary)',
      }}>

        {/* Logo */}
        <div style={{
          padding: 'var(--space-xl)',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-sm)',
          }}>
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--accent)',
            }} />
            <span style={{
              fontSize: 'var(--text-lg)',
              fontWeight: 600,
              letterSpacing: '-0.02em',
            }}>
              OpenClaude
            </span>
          </div>
          <span style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-tertiary)',
            marginTop: 2,
            display: 'block',
          }}>
            v2.0 — Agency
          </span>
        </div>

        {/* Navigation */}
        <nav style={{
          padding: 'var(--space-sm)',
          flex: 1,
        }}>
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-md)',
                width: '100%',
                padding: '8px 12px',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                background: active === item.id
                  ? 'var(--bg-active)'
                  : 'transparent',
                color: active === item.id
                  ? 'var(--text-primary)'
                  : 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-sans)',
                transition: 'all var(--transition)',
                textAlign: 'right',
                marginBottom: 2,
              }}
              onMouseEnter={e => {
                if (active !== item.id) {
                  ;(e.target as HTMLElement).style.background
                    = 'var(--bg-hover)'
                }
              }}
              onMouseLeave={e => {
                if (active !== item.id) {
                  ;(e.target as HTMLElement).style.background
                    = 'transparent'
                }
              }}
            >
              <span style={{ opacity: active === item.id ? 1 : 0.5 }}>
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Quick Input */}
        <div style={{
          padding: 'var(--space-md)',
          borderTop: '1px solid var(--border-subtle)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            padding: '0 var(--space-sm)',
          }}>
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="مهمة جديدة..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-sans)',
                padding: '10px 8px',
                direction: 'rtl',
              }}
            />
            <button style={{
              background: 'none',
              border: 'none',
              color: inputValue
                ? 'var(--accent)'
                : 'var(--text-tertiary)',
              cursor: inputValue ? 'pointer' : 'default',
              padding: 4,
              display: 'flex',
            }}>
              {Icons.send}
            </button>
          </div>
        </div>
      </aside>

      {/* ─── Main Content ─────────────────────── */}
      <main style={{
        flex: 1,
        overflow: 'auto',
        padding: 'var(--space-3xl)',
      }}>
        {children || <HomePage />}
      </main>
    </div>
  )
}
الملف الثالث: home-page.tsx
React

/**
 * الصفحة الرئيسية — نظيفة مثل Claude Code
 * لا ألوان زائدة، لا gradients، لا ظلال
 */

import React from 'react'

// ─── Status Dot Component ─────────────────────

function StatusDot({
  status
}: {
  status: 'active' | 'idle' | 'done' | 'error'
}) {
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
      background: colors[status],
      animation: status === 'active'
        ? 'pulse 2s infinite'
        : 'none',
    }} />
  )
}

// ─── Metric Card ──────────────────────────────

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <div style={{
      padding: 'var(--space-xl)',
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
        {label}
      </div>
      <div style={{
        fontSize: '28px',
        fontWeight: 600,
        letterSpacing: '-0.02em',
        color: 'var(--text-primary)',
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

// ─── Agent Row ────────────────────────────────

function AgentRow({
  name,
  model,
  status,
  task,
  tokens,
}: {
  name: string
  model: string
  status: 'active' | 'idle' | 'done' | 'error'
  task: string
  tokens: number
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '12px 16px',
      borderBottom: '1px solid var(--border-subtle)',
      transition: 'background var(--transition)',
      cursor: 'pointer',
    }}
    onMouseEnter={e => {
      ;(e.currentTarget as HTMLElement).style.background
        = 'var(--bg-hover)'
    }}
    onMouseLeave={e => {
      ;(e.currentTarget as HTMLElement).style.background
        = 'transparent'
    }}
    >
      {/* Status + Name */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-md)',
        width: 180,
      }}>
        <StatusDot status={status} />
        <span style={{
          fontSize: 'var(--text-sm)',
          fontWeight: 500,
        }}>
          {name}
        </span>
      </div>

      {/* Model */}
      <div style={{
        width: 140,
        fontSize: 'var(--text-xs)',
        color: 'var(--text-tertiary)',
        fontFamily: 'var(--font-mono)',
      }}>
        {model}
      </div>

      {/* Task */}
      <div style={{
        flex: 1,
        fontSize: 'var(--text-sm)',
        color: 'var(--text-secondary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {task}
      </div>

      {/* Tokens */}
      <div style={{
        width: 80,
        fontSize: 'var(--text-xs)',
        color: 'var(--text-tertiary)',
        fontFamily: 'var(--font-mono)',
        textAlign: 'left',
      }}>
        {tokens > 0 ? tokens.toLocaleString() : '—'}
      </div>
    </div>
  )
}

// ─── Activity Item ────────────────────────────

function ActivityItem({
  time,
  agent,
  message,
}: {
  time: string
  agent: string
  message: string
}) {
  return (
    <div style={{
      display: 'flex',
      gap: 'var(--space-md)',
      padding: '8px 0',
      fontSize: 'var(--text-sm)',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      <span style={{
        color: 'var(--text-tertiary)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-xs)',
        minWidth: 50,
      }}>
        {time}
      </span>
      <span style={{
        color: 'var(--accent)',
        fontWeight: 500,
        minWidth: 120,
      }}>
        {agent}
      </span>
      <span style={{ color: 'var(--text-secondary)' }}>
        {message}
      </span>
    </div>
  )
}

// ─── Progress Bar ─────────────────────────────

function ProgressBar({
  percent,
  label,
}: {
  percent: number
  label?: string
}) {
  return (
    <div>
      {label && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-sm)',
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
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${percent}%`,
          background: 'var(--accent)',
          borderRadius: 2,
          transition: 'width 500ms ease',
        }} />
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────

export default function HomePage() {
  return (
    <div style={{ maxWidth: 960 }}>

      {/* Header */}
      <div style={{ marginBottom: 'var(--space-3xl)' }}>
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
          آخر تحديث: منذ 3 دقائق
        </p>
      </div>

      {/* Metrics */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 'var(--space-md)',
        marginBottom: 'var(--space-3xl)',
      }}>
        <MetricCard label="مهام مكتملة" value="23" sub="من أصل 28" />
        <MetricCard label="وكلاء نشطون" value="3"  sub="من أصل 5"  />
        <MetricCard label="التكلفة"     value="$0.23" sub="اليوم"  />
        <MetricCard label="التوكن"      value="45K"   sub="مستهلكة" />
      </div>

      {/* Progress */}
      <div style={{ marginBottom: 'var(--space-3xl)' }}>
        <ProgressBar percent={67} label="تقدم المشروع" />
      </div>

      {/* Agents Table */}
      <div style={{ marginBottom: 'var(--space-3xl)' }}>
        <h2 style={{
          fontSize: 'var(--text-base)',
          fontWeight: 600,
          marginBottom: 'var(--space-lg)',
        }}>
          الوكلاء
        </h2>

        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}>
          {/* Table Header */}
          <div style={{
            display: 'flex',
            padding: '8px 16px',
            borderBottom: '1px solid var(--border-primary)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            <span style={{ width: 180 }}>الوكيل</span>
            <span style={{ width: 140 }}>النموذج</span>
            <span style={{ flex: 1 }}>المهمة</span>
            <span style={{ width: 80, textAlign: 'left' }}>توكن</span>
          </div>

          <AgentRow
            name="project-manager"
            model="gemini-pro"
            status="active"
            task="تحليل متطلبات المشروع وتوزيع المهام"
            tokens={2340}
          />
          <AgentRow
            name="developer"
            model="deepseek-coder"
            status="idle"
            task="بانتظار خطة العمل"
            tokens={0}
          />
          <AgentRow
            name="qa-engineer"
            model="llama-70b"
            status="active"
            task="مراجعة ملف auth.ts"
            tokens={1120}
          />
          <AgentRow
            name="designer"
            model="gemini-flash"
            status="done"
            task="اكتمل: تصميم صفحة الهبوط"
            tokens={890}
          />
        </div>
      </div>

      {/* Activity Feed */}
      <div>
        <h2 style={{
          fontSize: 'var(--text-base)',
          fontWeight: 600,
          marginBottom: 'var(--space-lg)',
        }}>
          النشاط
        </h2>

        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-lg)',
        }}>
          <ActivityItem
            time="12:37"
            agent="project-manager"
            message="انتظار مخرجات فريق التطوير"
          />
          <ActivityItem
            time="12:36"
            agent="qa-engineer"
            message="بدأ مراجعة التعديلات على auth.ts"
          />
          <ActivityItem
            time="12:35"
            agent="developer"
            message="أنشأ ملف auth.ts بنجاح"
          />
          <ActivityItem
            time="12:34"
            agent="project-manager"
            message="بدأ تحليل المتطلبات"
          />
        </div>
      </div>
    </div>
  )
}
الملف الرابع: pulse-animation.css
CSS

/* التأثير الوحيد المسموح: نبضة بسيطة للوكلاء النشطين */

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

/* Hover هادئ للصفوف */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
