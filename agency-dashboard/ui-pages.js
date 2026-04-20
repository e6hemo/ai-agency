/* ═══════════════════════════════════════════
   ui-pages.js -> Ported from React (complitepages.md)
   Contains logic for Agents, Memory, Cost, and Settings UI
═══════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  renderAgentsPage();
  renderMemoryPage();
  renderCostPage();
  renderTasksPage();
  // Settings is partially in app.js, but let's override its UI logic if 'page-settings' is missing content
  // We'll replace the existing #page-settings content with our shiny new SettingsPage mockup.
  overrideSettingsPage(); 

  // Since we also changed the sidebar to strictly use these standard nav items,
  // we may need to make 'overview' default. We've done this in app.js already.
});


/* ─── 1. Agents Page ───────────────────────────────────────────────────────── */
const mockAgents = [
  { id: 'pm', name: 'project-manager', role: 'منسق الفريق', model: 'gemini-1.5-pro', provider: 'Google', status: 'active', currentTask: 'تحليل المتطلبات وتوزيع المهام على الفريق', tokens: 2340, cost: 0.12, uptime: '00:12:34', temperature: 0.3, memory: { hot: 8, warm: 23, cold: 45 }, lastMessages: [ { from: 'project-manager', to: 'developer', content: 'جهز بيئة React', time: '12:34' }, { from: 'qa-engineer', to: 'project-manager', content: 'وجدت خطأ في auth', time: '12:36' } ] },
  { id: 'dev', name: 'developer', role: 'مطور البرمجيات', model: 'deepseek-coder', provider: 'DeepSeek', status: 'idle', currentTask: 'بانتظار خطة العمل من المدير', tokens: 0, cost: 0, uptime: '—', temperature: 0.1, memory: { hot: 2, warm: 10, cold: 30 }, lastMessages: [] },
  { id: 'qa', name: 'qa-engineer', role: 'مهندس الجودة', model: 'llama-3.1-70b', provider: 'Groq', status: 'active', currentTask: 'مراجعة ملف auth.ts والبحث عن ثغرات أمنية', tokens: 1120, cost: 0.03, uptime: '00:04:21', temperature: 0.1, memory: { hot: 5, warm: 15, cold: 60 }, lastMessages: [ { from: 'qa-engineer', to: 'project-manager', content: 'وجدت 2 أخطاء', time: '12:36' } ] },
  { id: 'designer', name: 'ui-ux-designer', role: 'مصمم الواجهات', model: 'gemini-1.5-flash', provider: 'Google', status: 'done', currentTask: 'اكتمل: تصميم صفحة الهبوط بالكامل', tokens: 890, cost: 0.01, uptime: '00:01:03', temperature: 0.6, memory: { hot: 0, warm: 8, cold: 20 }, lastMessages: [] },
  { id: 'mkt', name: 'marketing-strategist', role: 'استراتيجي التسويق', model: 'llama-3.1-70b', provider: 'Groq', status: 'error', currentTask: 'فشل: Rate limit تجاوز الحد المسموح', tokens: 450, cost: 0.01, uptime: '—', temperature: 0.7, memory: { hot: 1, warm: 5, cold: 12 }, lastMessages: [] }
];

let selectedAgentId = mockAgents[0].id;

function getStatusConfig(status) {
  const configs = {
    active: { label: 'يعمل', color: 'var(--success, #10b981)', bg: 'rgba(61,154,95,0.1)' },
    idle: { label: 'ينتظر', color: 'var(--text-tertiary, #9ca3af)', bg: 'var(--bg-tertiary, #2c2c2c)' },
    done: { label: 'انتهى', color: 'var(--info, #3b82f6)', bg: 'rgba(74,142,201,0.1)' },
    error: { label: 'خطأ', color: 'var(--error, #ef4444)', bg: 'rgba(201,74,74,0.1)' },
  };
  return configs[status] || configs.idle;
}

function renderAgentsPage() {
  const root = document.getElementById('react-agents-root');
  if (!root) return;

  const activeCount = mockAgents.filter(a => a.status === 'active').length;
  const selectedAgent = mockAgents.find(a => a.id === selectedAgentId) || mockAgents[0];

  let html = `
    <div style="max-width: 1100px;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <div>
          <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 4px;">الوكلاء</h1>
          <p style="font-size: 14px; color: var(--text-tertiary, #9ca3af);">${activeCount} نشط من أصل ${mockAgents.length}</p>
        </div>
        <button style="display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: var(--accent, #ea580c); color: #fff; border: none; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer;">
          + وكيل جديد
        </button>
      </div>

      <!-- Split Layout -->
      <div style="display: grid; grid-template-columns: 320px 1fr; gap: 24px; align-items: start;">
        <!-- List -->
        <div id="agents-list-container">
          ${mockAgents.map(ag => renderAgentCardHTML(ag, ag.id === selectedAgentId)).join('')}
        </div>

        <!-- Detail -->
        <div id="agent-detail-container">
          ${renderAgentDetailHTML(selectedAgent)}
        </div>
      </div>
    </div>
  `;
  root.innerHTML = html;
}

window.selectAgentUI = function(id) {
  selectedAgentId = id;
  renderAgentsPage(); // re-render entirely (vanilla cheap vdom)
}

function renderAgentCardHTML(agent, isSelected) {
  const c = getStatusConfig(agent.status);
  const pulse = agent.status === 'active' ? 'animation: pulse 2s infinite;' : '';
  const bgColor = isSelected ? 'var(--bg-active, rgba(255,255,255,0.05))' : 'var(--bg-secondary, #1e1e1e)';
  const bdColor = isSelected ? 'var(--border-primary, #333)' : 'var(--border-subtle, #2a2a2a)';

  return `
    <div onclick="selectAgentUI('${agent.id}')" style="padding: 16px; background: ${bgColor}; border: 1px solid ${bdColor}; border-radius: 8px; cursor: pointer; transition: all 0.2s; margin-bottom: 8px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
        <div>
          <div style="font-size: 14px; font-weight: 600; font-family: monospace; margin-bottom: 2px;">${agent.name}</div>
          <div style="font-size: 12px; color: var(--text-tertiary, #9ca3af);">${agent.role}</div>
        </div>
        <span style="display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 4px; background: ${c.bg}; color: ${c.color}; font-size: 12px; font-weight: 500;">
          <span style="width: 5px; height: 5px; border-radius: 50%; background: ${c.color}; ${pulse}"></span>
          ${c.label}
        </span>
      </div>
      <div style="font-size: 12px; color: var(--text-secondary, #d1d5db); margin-bottom: 12px; line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
        ${agent.currentTask}
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-tertiary, #9ca3af); font-family: monospace;">
        <span>${agent.model}</span>
        <span>${agent.tokens > 0 ? agent.tokens.toLocaleString() + ' tok' : '—'}</span>
      </div>
    </div>
  `;
}

function renderAgentDetailHTML(agent) {
  const c = getStatusConfig(agent.status);
  const pulse = agent.status === 'active' ? 'animation: pulse 2s infinite;' : '';

  const statItem = (lbl, val) => `
    <div style="padding: 12px; background: var(--bg-tertiary, #2c2c2c); border-radius: 6px; text-align: center;">
      <div style="font-size: 18px; font-weight: 600; font-family: monospace; margin-bottom: 2px;">${val}</div>
      <div style="font-size: 12px; color: var(--text-tertiary, #9ca3af);">${lbl}</div>
    </div>
  `;

  const memoryColors = { hot: '#ef4444', warm: '#f59e0b', cold: '#3b82f6' };
  const getMemoryBar = (lvl, val, max) => {
    const pct = Math.min(100, Math.round((val/max)*100));
    return `
      <div style="margin-bottom: 6px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span style="font-size: 12px; color: var(--text-tertiary); font-family: monospace;">${lvl.toUpperCase()}</span>
          <span style="font-size: 12px; color: var(--text-tertiary); font-family: monospace;">${val}</span>
        </div>
        <div style="height: 2px; background: var(--border-subtle, #2a2a2a); border-radius: 1px;">
          <div style="height: 100%; width: ${pct}%; background: ${memoryColors[lvl]}; border-radius: 1px;"></div>
        </div>
      </div>
    `;
  };

  const msgs = agent.lastMessages.map(m => `
    <div style="padding: 12px; background: var(--bg-tertiary, #2c2c2c); border-radius: 6px; margin-bottom: 8px; font-size: 12px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: var(--text-tertiary); font-family: monospace;">
        <span>${m.from} → ${m.to}</span><span>${m.time}</span>
      </div>
      <div style="color: var(--text-secondary);">${m.content}</div>
    </div>
  `).join('');

  return `
    <div style="background: var(--bg-secondary, #1e1e1e); border: 1px solid var(--border-subtle); border-radius: 8px; overflow: hidden; height: calc(100vh - 120px); display: flex; flex-direction: column;">
      <!-- Header -->
      <div style="padding: 24px; border-bottom: 1px solid var(--border-subtle);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div>
            <h2 style="font-size: 20px; font-weight: 600; font-family: monospace; margin-bottom: 4px;">${agent.name}</h2>
            <span style="font-size: 12px; color: var(--text-tertiary);">${agent.role}</span>
          </div>
          <span style="display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 4px; background: ${c.bg}; color: ${c.color}; font-size: 12px; font-weight: 500;">
            <span style="width: 5px; height: 5px; border-radius: 50%; background: ${c.color}; ${pulse}"></span>${c.label}
          </span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
          ${statItem('التوكن', agent.tokens > 0 ? agent.tokens.toLocaleString() : '—')}
          ${statItem('التكلفة', '$' + agent.cost.toFixed(3))}
          ${statItem('الوقت', agent.uptime)}
        </div>
      </div>

      <!-- Content -->
      <div style="flex: 1; overflow: auto; padding: 24px;">
        <div style="margin-bottom: 32px;">
          <h3 style="font-size: 12px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">النموذج</h3>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border-subtle); font-size: 14px;">
            <span style="color: var(--text-tertiary);">المزود</span><span>${agent.provider}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border-subtle); font-size: 14px;">
            <span style="color: var(--text-tertiary);">النموذج</span><span style="font-family: monospace; font-size: 12px;">${agent.model}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border-subtle); font-size: 14px;">
            <span style="color: var(--text-tertiary);">Temperature</span><span style="font-family: monospace; font-size: 12px;">${agent.temperature}</span>
          </div>
        </div>

        <div style="margin-bottom: 32px;">
          <h3 style="font-size: 12px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">الذاكرة</h3>
          ${getMemoryBar('hot', agent.memory.hot, 15)}
          ${getMemoryBar('warm', agent.memory.warm, 50)}
          ${getMemoryBar('cold', agent.memory.cold, 500)}
        </div>

        ${msgs ? `
        <div style="margin-bottom: 32px;">
          <h3 style="font-size: 12px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">آخر الرسائل</h3>
          ${msgs}
        </div>
        ` : ''}

        <div style="margin-bottom: 32px;">
          <h3 style="font-size: 12px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">الإجراءات</h3>
          <div style="display: flex; gap: 8px;">
            ${agent.status === 'active' ? `<button style="padding: 6px 14px; border-radius: 6px; font-size: 12px; cursor: pointer; background: rgba(201,74,74,0.1); color: var(--error); border: 1px solid rgba(201,74,74,0.2);">إيقاف</button>` : ''}
            ${agent.status === 'idle' ? `<button style="padding: 6px 14px; border-radius: 6px; font-size: 12px; cursor: pointer; background: var(--accent); color: #fff; border: none;">تشغيل</button>` : ''}
            ${agent.status === 'error' ? `<button style="padding: 6px 14px; border-radius: 6px; font-size: 12px; cursor: pointer; background: var(--accent); color: #fff; border: none;">إعادة تشغيل</button>` : ''}
            <button style="padding: 6px 14px; border-radius: 6px; font-size: 12px; cursor: pointer; background: transparent; color: var(--text-secondary); border: 1px solid var(--border-subtle);">مسح الذاكرة</button>
          </div>
        </div>
      </div>
    </div>
  `;
}


/* ─── 2. Memory Page ──────────────────────────────────────────────────────── */

const mockMemEntries = [
  { id: '1', level: 'hot', agent: 'project-manager', content: 'قررنا استخدام PostgreSQL لدعمه المتقدم لـ JSON وأداءه العالي مع البيانات العلائقية', tags: ['قرار', 'قاعدة-بيانات', 'تقني'], importance: 9, time: 'منذ 2 دقيقة', accessCount: 3 },
  { id: '2', level: 'hot', agent: 'developer', content: 'الـ Auth system يستخدم JWT مع refresh tokens بصلاحية 7 أيام', tags: ['auth', 'security', 'jwt'], importance: 8, time: 'منذ 5 دقائق', accessCount: 5 },
  { id: '3', level: 'warm', agent: 'qa-engineer', content: 'وجدنا ثغرة SQL injection في دالة getUserById - تم الإبلاغ للمطور', tags: ['security', 'bug', 'sql'], importance: 9, time: 'منذ 15 دقيقة', accessCount: 2 },
  { id: '4', level: 'warm', agent: 'project-manager', content: 'المشروع يستخدم TypeScript strict mode مع ESLint للحفاظ على جودة الكود', tags: ['typescript', 'code-quality', 'tools'], importance: 6, time: 'منذ 30 دقيقة', accessCount: 8 },
  { id: '5', level: 'cold', agent: 'qa-engineer', content: 'تعلم: دائماً أضف rate limiting لجميع API endpoints حتى الداخلية منها', tags: ['تعلم', 'security', 'api', 'best-practice'], importance: 9, time: 'منذ ساعة', accessCount: 12 },
  { id: '6', level: 'cold', agent: 'developer', content: 'قرار معماري: استخدام Repository Pattern لفصل منطق قاعدة البيانات', tags: ['architecture', 'pattern', 'قرار'], importance: 8, time: 'منذ 2 ساعة', accessCount: 6 },
];

let memActiveLevel = 'all';
let memSearchQuery = '';

window.setMemLevelUI = function(lvl) {
  memActiveLevel = (memActiveLevel === lvl) ? 'all' : lvl;
  renderMemoryPage();
}

window.setMemSearchUI = function(val) {
  memSearchQuery = val;
  renderMemoryPage();
}

function renderMemoryPage() {
  const root = document.getElementById('react-memory-root');
  if (!root) return;

  const filtered = mockMemEntries.filter(e => {
    const matchLvl = memActiveLevel === 'all' || e.level === memActiveLevel;
    const matchSearch = memSearchQuery === '' || e.content.includes(memSearchQuery) || e.tags.some(t => t.includes(memSearchQuery));
    return matchLvl && matchSearch;
  });

  const cHot = mockMemEntries.filter(e => e.level === 'hot').length;
  const cWarm = mockMemEntries.filter(e => e.level === 'warm').length;
  const cCold = mockMemEntries.filter(e => e.level === 'cold').length;

  const statCard = (lvl, label, color, count, sub) => {
    const activeStr = (memActiveLevel === lvl) ? `background: var(--bg-active, rgba(255,255,255,0.05)); border: 1px solid var(--border-primary, #333);` : `background: var(--bg-secondary); border: 1px solid var(--border-subtle);`;
    return `
      <div onclick="setMemLevelUI('${lvl}')" style="padding: 24px; border-radius: 8px; cursor: pointer; transition: all 0.2s; ${activeStr}">
        <div style="font-size: 12px; font-family: monospace; color: ${color}; margin-bottom: 8px;">${label}</div>
        <div style="font-size: 28px; font-weight: 600; letter-spacing: -0.02em; margin-bottom: 2px;">${count}</div>
        <div style="font-size: 12px; color: var(--text-tertiary);">${sub}</div>
      </div>
    `;
  };

  const getDots = (imp) => {
    let html = '<div style="display: flex; gap: 2px;">';
    for(let i=0; i<10; i++) {
      let bg = 'var(--border-primary)';
      if(i < imp) {
        if(imp >= 8) bg = 'var(--error)';
        else if(imp >= 5) bg = 'var(--warning)';
        else bg = 'var(--info)';
      }
      html += `<div style="width: 4px; height: 4px; border-radius: 50%; background: ${bg};"></div>`;
    }
    html += '</div>';
    return html;
  };

  const getLvlTag = (lvl) => {
    const specs = {
      hot: { label: 'HOT', color: 'var(--error)', bg: 'rgba(201,74,74,0.08)' },
      warm: { label: 'WARM', color: 'var(--warning)', bg: 'rgba(201,148,62,0.08)' },
      cold: { label: 'COLD', color: 'var(--info)', bg: 'rgba(74,142,201,0.08)' },
    }[lvl];
    return `<span style="padding: 2px 7px; border-radius: 4px; background: ${specs.bg}; color: ${specs.color}; font-size: 11px; font-family: monospace; font-weight: 500;">${specs.label}</span>`;
  };

  const cardsHtml = filtered.map(e => `
    <div style="padding: 24px; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 8px; margin-bottom: 8px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          ${getLvlTag(e.level)}
          <span style="font-size: 12px; color: var(--accent); font-family: monospace;">${e.agent}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 24px;">
          ${getDots(e.importance)}
          <span style="font-size: 12px; color: var(--text-tertiary);">${e.time}</span>
        </div>
      </div>
      <p style="font-size: 14px; color: var(--text-primary); line-height: 1.6; margin-bottom: 16px;">${e.content}</p>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; gap: 4px; flex-wrap: wrap;">
          ${e.tags.map(t => `<span style="padding: 1px 8px; background: var(--bg-tertiary); border-radius: 4px; font-size: 11px; color: var(--text-tertiary); font-family: monospace;">${t}</span>`).join('')}
        </div>
        <span style="font-size: 12px; color: var(--text-tertiary);">وُصل إليه ${e.accessCount}×</span>
      </div>
    </div>
  `).join('');

  root.innerHTML = `
    <div style="max-width: 820px;">
      <div style="margin-bottom: 32px;">
        <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 4px;">الذاكرة</h1>
        <p style="font-size: 14px; color: var(--text-tertiary);">${mockMemEntries.length} مدخل في MemPalace</p>
      </div>

      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px;">
        ${statCard('hot', 'HOT — فوري', 'var(--error, #ef4444)', cHot, 'تنتهي خلال ساعتين')}
        ${statCard('warm', 'WARM — نشط', 'var(--warning, #f59e0b)', cWarm, 'سياق المشروع')}
        ${statCard('cold', 'COLD — أرشيف', 'var(--info, #3b82f6)', cCold, 'قرارات وتعلّم')}
      </div>

      <div style="margin-bottom: 24px;">
        <input type="text" value="${memSearchQuery}" onkeyup="setMemSearchUI(this.value)" placeholder="ابحث في الذاكرة..."
          style="width: 100%; padding: 10px 16px; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 8px; color: var(--text-primary); font-size: 14px; outline: none; border-color: transparent; border: 1px solid var(--border-subtle);" />
      </div>

      <div>
        ${filtered.length === 0 ? `<div style="text-align: center; padding: 48px; color: var(--text-tertiary); font-size: 14px;">لا توجد نتائج</div>` : cardsHtml}
      </div>
    </div>
  `;
}

/* ─── 3. Cost Page ─────────────────────────────────────────────────────────── */

const mockModelCosts = [
  { model: 'gemini-1.5-pro', provider: 'Google', requests: 8, tokens: 18000, cost: 0.14, pct: 61 },
  { model: 'deepseek-coder', provider: 'DeepSeek', requests: 15, tokens: 12000, cost: 0.05, pct: 22 },
  { model: 'llama-3.1-70b', provider: 'Groq', requests: 12, tokens: 9000, cost: 0.03, pct: 13 },
  { model: 'gemini-1.5-flash', provider: 'Google', requests: 3, tokens: 6230, cost: 0.01, pct: 4 },
];

const mockAgentCosts = [
  { name: 'project-manager', model: 'gemini-1.5-pro', requests: 8, tokens: 18000, cost: 0.12 },
  { name: 'developer', model: 'deepseek-coder', requests: 15, tokens: 12000, cost: 0.07 },
  { name: 'qa-engineer', model: 'llama-3.1-70b', requests: 12, tokens: 9000, cost: 0.03 },
  { name: 'ui-ux-designer', model: 'gemini-1.5-flash', requests: 3, tokens: 6230, cost: 0.01 },
];

let costPeriod = 'today';

window.setCostPeriodUI = function(p) {
  costPeriod = p;
  renderCostPage();
};

function renderCostPage() {
  const root = document.getElementById('react-cost-root');
  if (!root) return;

  const total = mockModelCosts.reduce((s, m) => s + m.cost, 0);
  const tokens = mockModelCosts.reduce((s, m) => s + m.tokens, 0);
  const requests = mockModelCosts.reduce((s, m) => s + m.requests, 0);

  const miniBar = (pct, color) => `
    <div style="height: 3px; background: var(--border-subtle); border-radius: 2px; overflow: hidden; width: 80px;">
      <div style="height: 100%; width: ${pct}%; background: ${color}; border-radius: 2px;"></div>
    </div>
  `;

  root.innerHTML = `
    <div style="max-width: 820px;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px;">
        <div>
          <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 4px;">التكاليف</h1>
          <p style="font-size: 14px; color: var(--text-tertiary);">استهلاك الـ API وتتبع الإنفاق</p>
        </div>
        <div style="display: flex; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 3px;">
          ${['today', 'week', 'month'].map(p => `
            <button onclick="setCostPeriodUI('${p}')" style="padding: 5px 14px; border-radius: 6px; border: none; background: ${costPeriod === p ? 'var(--bg-active, rgba(255,255,255,0.05))' : 'transparent'}; color: ${costPeriod === p ? 'var(--text-primary)' : 'var(--text-tertiary)'}; font-size: 12px; cursor: pointer;">
              ${{today:'اليوم', week:'الأسبوع', month:'الشهر'}[p]}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Top Stats -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px;">
        ${[
          { label: 'الإجمالي', value: '$' + total.toFixed(3) },
          { label: 'التوكن', value: (tokens / 1000).toFixed(1) + 'K' },
          { label: 'الطلبات', value: requests.toString() },
          { label: 'متوسط/طلب', value: '$' + (total / requests).toFixed(4) }
        ].map(s => `
          <div style="padding: 24px; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 8px;">
            <div style="font-size: 12px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">${s.label}</div>
            <div style="font-size: 22px; font-weight: 600; font-family: monospace; letter-spacing: -0.02em;">${s.value}</div>
          </div>
        `).join('')}
      </div>

      <!-- By Model -->
      <div style="margin-bottom: 32px;">
        <h2 style="font-size: 16px; font-weight: 600; margin-bottom: 16px;">حسب النموذج</h2>
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 8px; overflow: hidden;">
          <div style="display: grid; grid-template-columns: 1fr 80px 80px 80px 100px; padding: 8px 16px; border-bottom: 1px solid var(--border-primary); font-size: 12px; color: var(--text-tertiary); text-transform: uppercase;">
            <span>النموذج</span><span style="text-align: center;">طلبات</span><span style="text-align: center;">توكن</span><span style="text-align: center;">الحصة</span><span style="text-align: left;">التكلفة</span>
          </div>
          ${mockModelCosts.map((m, i) => `
            <div style="display: grid; grid-template-columns: 1fr 80px 80px 80px 100px; padding: 12px 16px; border-bottom: ${i < mockModelCosts.length - 1 ? '1px solid var(--border-subtle)' : 'none'}; align-items: center;">
              <div>
                <div style="font-size: 14px; font-family: monospace; margin-bottom: 2px;">${m.model}</div>
                <div style="font-size: 12px; color: var(--text-tertiary);">${m.provider}</div>
              </div>
              <span style="text-align: center; font-size: 14px; font-family: monospace; color: var(--text-secondary);">${m.requests}</span>
              <span style="text-align: center; font-size: 14px; font-family: monospace; color: var(--text-secondary);">${(m.tokens/1000).toFixed(1)}K</span>
              <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                ${miniBar(m.pct, 'var(--accent)')}
                <span style="font-size: 11px; color: var(--text-tertiary); font-family: monospace;">${m.pct}%</span>
              </div>
              <span style="text-align: left; font-size: 14px; font-family: monospace; font-weight: 500;">$${m.cost.toFixed(3)}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- By Agent -->
      <div style="margin-bottom: 32px;">
        <h2 style="font-size: 16px; font-weight: 600; margin-bottom: 16px;">حسب الوكيل</h2>
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 8px; overflow: hidden;">
          ${mockAgentCosts.map((a, i) => {
            const pct = Math.round((a.cost / total)*100);
            return `
              <div style="display: grid; grid-template-columns: 1fr 120px 80px; padding: 12px 16px; border-bottom: ${i < mockAgentCosts.length - 1 ? '1px solid var(--border-subtle)' : 'none'}; align-items: center;">
                <div>
                  <div style="font-size: 14px; font-family: monospace; margin-bottom: 6px;">${a.name}</div>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="flex: 1; max-width: 200px; height: 3px; background: var(--border-subtle); border-radius: 2px;">
                      <div style="height: 100%; width: ${pct}%; background: var(--accent); border-radius: 2px;"></div>
                    </div>
                    <span style="font-size: 11px; color: var(--text-tertiary); font-family: monospace;">${pct}%</span>
                  </div>
                </div>
                <span style="font-size: 12px; color: var(--text-tertiary); font-family: monospace;">${(a.tokens/1000).toFixed(1)}K tok</span>
                <span style="font-size: 14px; font-family: monospace; font-weight: 500; text-align: left;">$${a.cost.toFixed(3)}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Tip -->
      <div style="padding: 24px; background: rgba(201,100,66,0.05); border: 1px solid rgba(201,100,66,0.2); border-radius: 8px; font-size: 14px; color: var(--text-secondary);">
        💡 استبدل <span style="font-family: monospace; color: var(--accent);">gemini-1.5-pro</span> بـ <span style="font-family: monospace; color: var(--accent);">gemini-1.5-flash</span> للمهام البسيطة — ستوفر تقريباً <strong>$0.08/يوم</strong>
      </div>
    </div>
  `;
}

/* ─── 4. Settings Page Overrider ───────────────────────────────────────────── */

let uiSettings = {
  googleKey: '', groqKey: '', deepseekKey: '', telegramToken: '',
  autoApprove: false, saveLocally: true, rateLimitWarn: true, dailyLog: true,
};

window.toggleUISetting = function(key) {
  uiSettings[key] = !uiSettings[key];
  overrideSettingsPage();
};
window.updateUIInput = function(key, val) {
  uiSettings[key] = val;
};

// We will overwrite whatever is inside '#page-settings'
function overrideSettingsPage() {
  const root = document.getElementById('page-settings');
  if (!root) return;

  const row = (label, desc, comp) => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 0; border-bottom: 1px solid var(--border-subtle);">
      <div>
        <div style="font-size: 14px; font-weight: 500; margin-bottom: ${desc ? '3px' : '0'};">${label}</div>
        ${desc ? `<div style="font-size: 12px; color: var(--text-tertiary);">${desc}</div>` : ''}
      </div>
      ${comp}
    </div>
  `;

  const toggle = (key) => `
    <button onclick="toggleUISetting('${key}')" style="width: 36px; height: 20px; border-radius: 10px; background: ${uiSettings[key] ? 'var(--accent)' : 'var(--bg-tertiary)'}; border: 1px solid var(--border-primary); cursor: pointer; position: relative; flex-shrink: 0;">
      <div style="position: absolute; top: 1px; ${uiSettings[key] ? 'right: 2px;' : 'right: 17px;'} width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: right 0.2s;"></div>
    </button>
  `;

  const txtInp = (key, type, placeholder) => `
    <input type="${type}" value="${uiSettings[key]}" onkeyup="updateUIInput('${key}', this.value)" placeholder="${placeholder}" style="padding: 6px 12px; background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: 6px; color: var(--text-primary); font-size: 14px; width: 260px; direction: ltr; outline: none;" />
  `;

  root.innerHTML = `
    <div style="max-width: 680px; margin: 0 auto; padding-top: 20px;">
      <div style="margin-bottom: 32px;">
        <h1 style="font-size: 24px; font-weight: 600;">الإعدادات</h1>
      </div>

      <section style="margin-bottom: 32px;">
        <h2 style="font-size: 12px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px;">مفاتيح الـ API</h2>
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 0 24px;">
          ${row('Google AI Studio', 'Gemini Pro & Flash', txtInp('googleKey', 'password', 'AIza...'))}
          ${row('Groq', 'Llama 3.1 70B', txtInp('groqKey', 'password', 'gsk_...'))}
          ${row('DeepSeek', 'DeepSeek Coder', txtInp('deepseekKey', 'password', 'sk-...'))}
          ${row('Telegram Bot Token', 'للتحكم عن بُعد', txtInp('telegramToken', 'password', '1234567890:ABC...'))}
        </div>
      </section>

      <section style="margin-bottom: 32px;">
        <h2 style="font-size: 12px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px;">السلوك</h2>
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 0 24px;">
          ${row('موافقة تلقائية', 'تخطي المراجعة البشرية للخطط البسيطة', toggle('autoApprove'))}
          ${row('حفظ محلي فقط', 'لا تخرج البيانات خارج جهازك', toggle('saveLocally'))}
          ${row('تحذير Rate Limit', 'أشعرني قبل بلوغ حد الـ API', toggle('rateLimitWarn'))}
          ${row('السجل اليومي', 'حفظ كل الأحداث في ملف يومي', toggle('dailyLog'))}
        </div>
      </section>

      <button style="padding: 10px 24px; background: var(--accent); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer;">
        حفظ الإعدادات
      </button>
    </div>
  `;
}

/* ─── 5. Tasks Page ────────────────────────────────────────────────────────── */

let tasksData = [];
let isTasksLoading = true;
let isNewTaskModalOpen = false;

// We fetch Tasks from real API
async function loadTasksFromAPI() {
  try {
    const res = await fetch('/api/tasks');
    const json = await res.json();
    if (json.success) tasksData = json.data;
  } catch (e) {
    console.error('Failed to parse tasks', e);
  } finally {
    isTasksLoading = false;
    renderTasksPage();
  }
}

// Complete Task API Call
window.completeTaskUI = async function(id) {
  try {
    // Show Optimistic UI update
    const tIndex = tasksData.findIndex(t => t.id === id);
    if(tIndex > -1) {
      tasksData[tIndex].status = 'completed';
      renderTasksPage();
    }
    await fetch(`/api/tasks/${id}/complete`, { method: 'POST' });
    await loadTasksFromAPI();
  } catch(e) {
    console.error('Error completing task', e);
  }
}

// Open / Close Form Modal (we'll just toggle UI visibility by re-rendering)
window.toggleNewTaskFormUI = function(open) {
  isNewTaskModalOpen = open;
  renderTasksPage();
}

window.submitNewTaskUI = async function(e) {
  e.preventDefault();
  const title = document.getElementById('new-task-title').value;
  const desc = document.getElementById('new-task-desc').value;
  const prio = document.getElementById('new-task-prio').value;
  const dept = document.getElementById('new-task-dept').value;
  
  // Dependency collection
  const depsSelect = document.getElementById('new-task-deps');
  const deps = [];
  if (depsSelect) {
    for (const option of depsSelect.selectedOptions) {
      deps.push(option.value);
    }
  }

  isNewTaskModalOpen = false;
  // Fallback to loading
  isTasksLoading = true;
  renderTasksPage();

  await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: title,
      description: desc,
      priority: prio,
      department: dept,
      dependencies: deps
    })
  });
  await loadTasksFromAPI();
}

function renderTasksPage() {
  const root = document.getElementById('page-tasks');
  if (!root) return;
  // If the container is 'page-tasks' in HTML, but we didn't add it in index.html specifically as 'react-tasks-root'. 
  // Wait, let's just write to 'page-tasks' directly. In index.html the ID is probably `page-tasks`.

  if (isTasksLoading && tasksData.length === 0) {
    // Fire the initial fetch
    loadTasksFromAPI();
  }

  const getPriorityColor = (p) => {
    if (p === 'low') return 'var(--info)';
    if (p === 'medium') return 'var(--warning)';
    if (p === 'high') return 'var(--error)';
    return 'var(--text-secondary)';
  };

  const getPriorityIcon = (p) => {
    if (p === 'high') return '🔴';
    if (p === 'medium') return '🟡';
    return '🟢';
  };

  // Build the Task Tree HTML
  const buildTaskNodeHTML = (task) => {
    const isCompleted = task.status === 'completed';
    const cColor = isCompleted ? 'var(--text-tertiary)' : 'var(--text-primary)';
    
    // Dependencies text
    let depsHtml = '';
    if (task.dependencies && task.dependencies.length > 0) {
      const parentTask = tasksData.find(t => task.dependencies.includes(t.id));
      if (parentTask) {
        depsHtml = `<div style="font-size: 11px; color: var(--text-tertiary); margin-top: 4px;">يعتمد على: ${parentTask.title}</div>`;
      }
    }

    return `
      <div style="border: 1px solid var(--border-subtle); background: var(--bg-secondary); border-radius: 8px; padding: 16px; margin-bottom: 12px; transition: all 0.2s;">
        <div style="display: flex; gap: 16px; align-items: flex-start;">
          <div style="margin-top: 2px; color: ${getPriorityColor(task.priority)};">
            ${getPriorityIcon(task.priority)}
          </div>
          <div style="flex: 1;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <h3 style="margin: 0; font-size: 15px; font-weight: 500; color: ${cColor}; text-decoration: ${isCompleted?'line-through':'none'};">${task.title}</h3>
              <div style="font-size: 11px; font-family: monospace; color: var(--text-tertiary); background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px;">${task.department}</div>
            </div>
            ${task.description ? `<p style="margin: 0; font-size: 13px; color: var(--text-secondary); line-height: 1.5;">${task.description}</p>` : ''}
            ${depsHtml}
            <div style="display: flex; gap: 8px; margin-top: 12px; align-items: center;">
              <span style="font-size: 11px; color: var(--text-tertiary);">${new Date(task.createdAt).toLocaleString('ar')}</span>
              ${!isCompleted ? `<button onclick="completeTaskUI('${task.id}')" style="margin-right: auto; padding: 4px 10px; font-size: 11px; background: transparent; border: 1px solid var(--success); color: var(--success); border-radius: 4px; cursor: pointer;">إنجاز ✓</button>` : `<span style="margin-right: auto; font-size: 11px; color: var(--success);">تم الإنجاز ✓</span>`}
            </div>
          </div>
        </div>
      </div>
    `;
  };

  // The modal overlay logic for creating a new task
  const newFormHTML = isNewTaskModalOpen ? `
    <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; backdrop-filter: blur(2px);">
      <div style="background: var(--bg-primary); border: 1px solid var(--border-subtle); padding: 32px; border-radius: 12px; width: 100%; max-width: 500px;">
        <h2 style="margin: 0 0 24px 0; font-size: 20px; font-weight: 500;">تكليف الوكالة بمهمة جديدة</h2>
        <form onsubmit="submitNewTaskUI(event)">
          <div style="margin-bottom: 16px;">
            <label style="display: block; font-size: 12px; color: var(--text-tertiary); margin-bottom: 6px;">عنوان المهمة</label>
            <input id="new-task-title" required type="text" style="width: 100%; padding: 8px 12px; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 6px; color: var(--text-primary);" />
          </div>
          <div style="margin-bottom: 16px;">
            <label style="display: block; font-size: 12px; color: var(--text-tertiary); margin-bottom: 6px;">بطاقة وصف (اختياري)</label>
            <textarea id="new-task-desc" rows="3" style="width: 100%; padding: 8px 12px; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 6px; color: var(--text-primary); resize: none;"></textarea>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
            <div>
              <label style="display: block; font-size: 12px; color: var(--text-tertiary); margin-bottom: 6px;">الأولوية</label>
              <select id="new-task-prio" style="width: 100%; padding: 8px; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 6px; color: var(--text-primary);">
                <option value="low">منخفضة</option>
                <option value="medium" selected>متوسطة</option>
                <option value="high">مرتفعة</option>
              </select>
            </div>
            <div>
              <label style="display: block; font-size: 12px; color: var(--text-tertiary); margin-bottom: 6px;">القسم المختص</label>
              <select id="new-task-dept" style="width: 100%; padding: 8px; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 6px; color: var(--text-primary);">
                <option value="planning">التخطيط والإدارة</option>
                <option value="development">البرمجة</option>
                <option value="design">التصميم</option>
                <option value="marketing">التسويق</option>
              </select>
            </div>
          </div>
          <div style="margin-bottom: 24px;">
            <label style="display: block; font-size: 12px; color: var(--text-tertiary); margin-bottom: 6px;">الاعتماديات (اختياري - المهام المطلوبة قبل هذه)</label>
            <select id="new-task-deps" multiple style="width: 100%; padding: 8px; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 6px; color: var(--text-primary); height: 80px;">
              ${tasksData.filter(t => t.status !== 'completed').map(t => `<option value="${t.id}">${t.title}</option>`).join('')}
            </select>
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 12px;">
            <button type="button" onclick="toggleNewTaskFormUI(false)" style="padding: 8px 16px; background: transparent; border: 1px solid var(--border-subtle); border-radius: 6px; color: var(--text-secondary); cursor: pointer;">إلغاء</button>
            <button type="submit" style="padding: 8px 16px; background: var(--accent); border: none; border-radius: 6px; color: #fff; cursor: pointer; font-weight: 500;">تكليف الوكالة</button>
          </div>
        </form>
      </div>
    </div>
  ` : '';

  root.innerHTML = `
    <div style="max-width: 800px; margin: 0 auto; padding-top: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px;">
        <div>
          <h1 style="font-size: 24px; font-weight: 600; margin: 0 0 4px 0;">المهام المركزية</h1>
          <p style="font-size: 14px; color: var(--text-tertiary); margin: 0;">شجرة تكليف الوكلاء بأعمال المشروع</p>
        </div>
        <button onclick="toggleNewTaskFormUI(true)" style="display: flex; align-items: center; gap: 8px; padding: 10px 18px; background: var(--accent); color: #fff; border: none; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer;">
          + تكليف جديد
        </button>
      </div>

      ${isTasksLoading ? `<div style="text-align: center; color: var(--text-tertiary); padding: 40px; font-size: 14px;">جاري تحميل المهام...</div>` : ''}

      ${!isTasksLoading && tasksData.length === 0 ? `
        <div style="text-align: center; color: var(--text-tertiary); padding: 60px; background: var(--bg-secondary); border: 1px dashed var(--border-primary); border-radius: 8px;">
          لا توجد مهام حالياً. قم بإضافة أول تكليف!
        </div>
      ` : ''}

      <div style="display: flex; flex-direction: column; gap: 4px;">
        ${tasksData.map(node => buildTaskNodeHTML(node)).join('')}
      </div>
    </div>
    ${newFormHTML}
  `;
}
