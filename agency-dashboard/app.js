/* ═══════════════════════════════════════════
   OpenClaude Agency Dashboard — ChatGPT Style v2
═══════════════════════════════════════════ */

/* ── Agency Data ── */
let AGENCY = {
  name: "OpenClaude AI Agency",
  version: "1.0.0",
  departments: {
    marketing:  { emoji: "🟠", label: "قسم التسويق", lead: "marketing-strategist", members: ["content-writer","social-media-manager","email-marketer","copywriter-ar"] },
    development:{ emoji: "🔵", label: "قسم البرمجة", lead: "full-stack-developer", members: ["code-reviewer","mobile-developer"] },
    design:     { emoji: "🟢", label: "قسم التصميم", lead: "ui-ux-designer", members: ["brand-designer"] },
    seo:        { emoji: "🟡", label: "قسم SEO", lead: "seo-specialist", members: [] },
    data:       { emoji: "📊", label: "قسم البيانات", lead: "data-analyst", members: [] },
    media:      { emoji: "🟣", label: "قسم الميديا", lead: "video-scripter", members: [] },
    support:    { emoji: "💬", label: "قسم الدعم", lead: "customer-support", members: [] },
    management: { emoji: "⚪", label: "قسم الإدارة", lead: "project-manager", members: [] },
    research:   { emoji: "🔬", label: "قسم الأبحاث", lead: "chief-researcher", members: [] }
  },
  pipelines: {
    "launch-campaign": { description: "إطلاق حملة تسويقية كاملة", steps: ["marketing-strategist","content-writer","ui-ux-designer","social-media-manager","email-marketer"] },
    "build-website":   { description: "بناء موقع ويب كامل", steps: ["ui-ux-designer","full-stack-developer","seo-specialist","code-reviewer"] },
    "build-mobile-app":{ description: "بناء تطبيق جوال", steps: ["ui-ux-designer","mobile-developer","code-reviewer"] },
    "create-brand":    { description: "بناء هوية بصرية كاملة", steps: ["marketing-strategist","brand-designer","content-writer","copywriter-ar"] },
    "content-calendar":{ description: "تقويم محتوى شهري", steps: ["marketing-strategist","content-writer","social-media-manager","seo-specialist"] },
    "seo-audit":       { description: "تحليل SEO شامل", steps: ["seo-specialist","data-analyst","content-writer"] },
    "competitor-analysis":{ description: "تحليل منافسين شامل", steps: ["marketing-strategist","data-analyst","seo-specialist"] },
    "daily-brief":     { description: "ملخص يومي ذكي", steps: ["project-manager","data-analyst"] },
    "weekly-review":   { description: "مراجعة أسبوعية ذاتية", steps: ["data-analyst","project-manager","chief-researcher"] }
  }
};

let AGENTS_META = {
  "project-manager":      { emoji: "👔", role: "مدير المشاريع", color: "#6366f1" },
  "marketing-strategist": { emoji: "📈", role: "خبير تسويق", color: "#f59e0b" },
  "content-writer":       { emoji: "✍️", role: "كاتب محتوى", color: "#ef4444" },
  "social-media-manager": { emoji: "📱", role: "مدير سوشيال", color: "#ec4899" },
  "email-marketer":       { emoji: "📧", role: "تسويق إيميل", color: "#f97316" },
  "copywriter-ar":        { emoji: "🖊️", role: "كوبي رايتر", color: "#14b8a6" },
  "full-stack-developer": { emoji: "💻", role: "مطور متكامل", color: "#3b82f6" },
  "code-reviewer":        { emoji: "🔍", role: "مراجع أكواد", color: "#8b5cf6" },
  "mobile-developer":     { emoji: "📲", role: "مطور جوال", color: "#06b6d4" },
  "ui-ux-designer":       { emoji: "🎨", role: "مصمم UI/UX", color: "#10b981" },
  "brand-designer":       { emoji: "🏷️", role: "مصمم هوية", color: "#84cc16" },
  "seo-specialist":       { emoji: "🔎", role: "خبير SEO", color: "#eab308" },
  "data-analyst":         { emoji: "📊", role: "محلل بيانات", color: "#06b6d4" },
  "video-scripter":       { emoji: "🎬", role: "كاتب سيناريو", color: "#a855f7" },
  "customer-support":     { emoji: "💬", role: "دعم العملاء", color: "#22c55e" },
  "chief-researcher":     { emoji: "🔬", role: "كبير الباحثين", color: "#8b5cf6" }
};

/* ── State ── */
const state = {
  currentPage: 'overview',
  currentDept: null,
  currentDeptTab: 'chat',
  selectedAgent: null,
  selectedModel: 'qwen2.5-coder:7b',
  chatHistory: [],
  sidebarCollapsed: false,
};

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  // Fetch data from API
  try {
    const [configRes, agentsRes, modelsRes] = await Promise.all([
      fetch('http://localhost:3766/api/config').then(r => r.json()).catch(() => null),
      fetch('http://localhost:3766/api/agents').then(r => r.json()).catch(() => null),
      fetch('http://localhost:3766/api/models').then(r => r.json()).catch(() => null)
    ]);
    if (configRes?.success && configRes.data?.agency) {
      AGENCY = configRes.data.agency;
    }
    if (agentsRes?.success && agentsRes.data) {
      for (const name in agentsRes.data) {
        if (!AGENTS_META[name]) AGENTS_META[name] = {};
        AGENTS_META[name] = { ...AGENTS_META[name], ...agentsRes.data[name] };
      }
    }
    if (modelsRes?.success && modelsRes.data) {
      populateModels(modelsRes.data);
    }
  } catch (e) {
    console.warn('[Init] Could not fetch live data, using defaults.');
  }

  buildSidebar();
  buildLandingPage();
  showPage('overview');
  checkApiKey();

  // Auto-resize textarea
  document.getElementById('chat-input')?.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 150) + 'px';
  });

  // Enter to send
  document.getElementById('chat-input')?.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
});

/* ═══════════════════════════════════════════
   SIDEBAR
═══════════════════════════════════════════ */
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.toggle('collapsed');
  state.sidebarCollapsed = sidebar.classList.contains('collapsed');
  if (window.innerWidth <= 768) {
    overlay.classList.toggle('hidden', state.sidebarCollapsed);
  }
}

function populateModels(models) {
  const chatSelect = document.getElementById('chat-model-select');
  const pipeSelect = document.getElementById('pipeline-model');
  if (!chatSelect || !pipeSelect) return;

  const priority = [
    'meta-llama/llama-3.3-70b-instruct:free',
    'meta-llama/llama-3.2-3b-instruct:free',
    'google/gemma-3-27b-it:free',
    'qwen/qwen-2.5-72b-instruct:free',
    'anthropic/claude-3.5-sonnet:beta',
    'openai/gpt-4o'
  ];

  models.sort((a, b) => {
    const aPri = priority.indexOf(a.id);
    const bPri = priority.indexOf(b.id);
    if (aPri !== -1 && bPri !== -1) return aPri - bPri;
    if (aPri !== -1) return -1;
    if (bPri !== -1) return 1;
    const aFree = a.id.includes(':free') ? -1 : 1;
    const bFree = b.id.includes(':free') ? -1 : 1;
    if (aFree !== bFree) return aFree - bFree;
    return a.name.localeCompare(b.name);
  });

  const optionsHTML = models.map(m => {
    const isFree = m.id.includes(':free');
    const label = `${isFree ? '🟢 ' : ''}${m.name} (${m.provider})`;
    return `<option value="${m.id}">${label}</option>`;
  }).join('');

  chatSelect.innerHTML = optionsHTML;
  pipeSelect.innerHTML = optionsHTML;
  
  if (state.selectedModel) {
    chatSelect.value = state.selectedModel;
    pipeSelect.value = state.selectedModel;
  }
}

function buildSidebar() {
  const nav = document.getElementById('departments-nav');
  if (!nav) return;
  nav.innerHTML = '';
  for (const [key, dept] of Object.entries(AGENCY.departments || {})) {
    const count = 1 + (dept.members?.length || 0);
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.id = `nav-dept-${key}`;
    btn.innerHTML = `<span class="nav-icon">${dept.emoji || '📂'}</span><span class="sidebar-label">${dept.label || key}</span>`;
    btn.onclick = () => openDepartment(key);
    nav.appendChild(btn);
  }
}

/* ═══════════════════════════════════════════
   PAGE NAVIGATION
═══════════════════════════════════════════ */
function showPage(id) {
  // Hide all pages
  document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const page = document.getElementById(`page-${id}`);
  if (page) page.classList.remove('hidden');

  const navBtn = document.getElementById(`nav-${id}`);
  if (navBtn) navBtn.classList.add('active');

  state.currentPage = id;

  if (id === 'pipelines') buildPipelinesPage();
  if (id === 'train') buildTrainPage();
  if (id === 'daily-log') loadDailyLog();
  
  if (id === 'radar') buildRadarPage();
  if (id === 'board') buildBoardPage();
  if (id === 'vault') buildVaultPage();
  if (id === 'university') buildUniversityPage();
  if (id === 'identity') buildIdentityPage();
}

/* ═══════════════════════════════════════════
   LANDING PAGE (ChatGPT Style)
═══════════════════════════════════════════ */
function buildLandingPage() {
  const cardsEl = document.getElementById('landing-cards');
  const statsEl = document.getElementById('landing-stats');
  if (!cardsEl) return;

  cardsEl.innerHTML = '';
  for (const [key, dept] of Object.entries(AGENCY.departments || {})) {
    const count = 1 + (dept.members?.length || 0);
    const card = document.createElement('div');
    card.className = 'landing-card';
    card.onclick = () => openDepartment(key);
    card.innerHTML = `
      <div class="landing-card-emoji">${dept.emoji || '📂'}</div>
      <div class="landing-card-name">${dept.label || key}</div>
      <div class="landing-card-desc">${count} وكيل • ${dept.lead || ''}</div>
    `;
    cardsEl.appendChild(card);
  }

  // Stats
  if (statsEl) {
    const totalAgents = Object.keys(AGENTS_META).length;
    const totalPipelines = Object.keys(AGENCY.pipelines || {}).length;
    const totalDepts = Object.keys(AGENCY.departments || {}).length;
    statsEl.innerHTML = `
      <div class="stat-item"><div class="stat-value">${totalAgents}</div><div class="stat-label">وكيل</div></div>
      <div class="stat-item"><div class="stat-value">${totalDepts}</div><div class="stat-label">قسم</div></div>
      <div class="stat-item"><div class="stat-value">${totalPipelines}</div><div class="stat-label">مسار عمل</div></div>
    `;
  }
}

/* ═══════════════════════════════════════════
   DEPARTMENT PAGE
═══════════════════════════════════════════ */
function openDepartment(deptKey) {
  const dept = AGENCY.departments?.[deptKey];
  if (!dept) return;

  state.currentDept = deptKey;
  const agents = [dept.lead, ...(dept.members || [])].filter(Boolean);
  state.selectedAgent = dept.lead || agents[0] || null; // Auto-select lead
  state.chatHistory = [];

  // Update header
  document.getElementById('dept-emoji').textContent = dept.emoji || '📂';
  document.getElementById('dept-name').textContent = dept.label || deptKey;
  document.getElementById('dept-badge').textContent = `${agents.length} وكيل`;

  // Populate agent selector
  const agentSelect = document.getElementById('chat-agent-select');
  if (agentSelect) {
    agentSelect.innerHTML = '<option value="">اختر وكيلاً...</option>';
    agents.forEach(a => {
      const meta = AGENTS_META[a] || {};
      const opt = document.createElement('option');
      opt.value = a;
      opt.textContent = `${meta.emoji || '🤖'} ${a} — ${meta.role || ''}`;
      // Check if this is the lead
      if (a === state.selectedAgent) {
        opt.selected = true;
      }
      agentSelect.appendChild(opt);
    });
  }

  // Reset chat
  const chatEl = document.getElementById('chat-messages');
  if (chatEl) chatEl.innerHTML = `<div class="chat-empty"><div class="chat-empty-icon">${dept.emoji}</div><p>مرحباً بك في ${dept.label}</p><p style="font-size:13px;color:var(--text-muted)">اختر وكيلاً من الأعلى لبدء المحادثة</p></div>`;

  // Nav highlight
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navBtn = document.getElementById(`nav-dept-${deptKey}`);
  if (navBtn) navBtn.classList.add('active');

  // Switch tab to chat
  switchDeptTab('chat');
  showPage('department');

  // Load department log
  loadDeptLog(deptKey);
}

function selectAgentFromDropdown() {
  const sel = document.getElementById('chat-agent-select');
  if (!sel || !sel.value) return;
  state.selectedAgent = sel.value;
  const meta = AGENTS_META[sel.value] || {};

  // Clear chat and show welcome
  const chatEl = document.getElementById('chat-messages');
  if (chatEl) {
    chatEl.innerHTML = '';
    addChatMessage('agent', `مرحباً! أنا **${meta.emoji || '🤖'} ${sel.value}** — ${meta.role || 'وكيلك الذكي'}.\n\nكيف أساعدك اليوم؟`, sel.value);
  }
}

/* ═══════════════════════════════════════════
   DEPARTMENT TABS
═══════════════════════════════════════════ */
function switchDeptTab(tabName) {
  state.currentDeptTab = tabName;
  document.querySelectorAll('.dept-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.dept-tab-content').forEach(t => t.classList.add('hidden'));

  const tab = document.querySelector(`.dept-tab[data-tab="${tabName}"]`);
  const content = document.getElementById(`tab-${tabName}`);
  if (tab) tab.classList.add('active');
  if (content) content.classList.remove('hidden');
}

/* ═══════════════════════════════════════════
   CHAT (ChatGPT Style)
═══════════════════════════════════════════ */
function addChatMessage(role, content, agentName) {
  const chatEl = document.getElementById('chat-messages');
  if (!chatEl) return;

  // Remove empty state
  const emptyEl = chatEl.querySelector('.chat-empty');
  if (emptyEl) emptyEl.remove();

  const meta = AGENTS_META[agentName] || {};
  const row = document.createElement('div');
  row.className = `chat-row ${role === 'user' ? 'user-row' : 'agent-row'}`;

  if (role === 'user') {
    row.innerHTML = `
      <div class="chat-avatar">أنت</div>
      <div class="chat-bubble">${renderMarkdown(content)}</div>
    `;
  } else {
    row.innerHTML = `
      <div class="chat-avatar" style="background:${meta.color || '#555'}">${meta.emoji || '🤖'}</div>
      <div class="chat-bubble">
        <div class="chat-agent-label">${meta.emoji || ''} ${agentName || 'الوكيل'}</div>
        ${renderMarkdown(content)}
      </div>
    `;
  }

  chatEl.appendChild(row);
  chatEl.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' });
}

function showTyping(agentName) {
  const chatEl = document.getElementById('chat-messages');
  if (!chatEl) return;
  const meta = AGENTS_META[agentName] || {};
  const row = document.createElement('div');
  row.className = 'chat-row agent-row';
  row.id = 'typing-indicator';
  row.innerHTML = `
    <div class="chat-avatar" style="background:${meta.color || '#555'}">${meta.emoji || '🤖'}</div>
    <div class="chat-bubble">
      <div class="chat-agent-label">${agentName || ''}</div>
      <div class="typing-indicator"><span></span><span></span><span></span></div>
    </div>
  `;
  chatEl.appendChild(row);
  chatEl.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' });
}

function removeTyping() {
  document.getElementById('typing-indicator')?.remove();
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const msg = input?.value?.trim();
  
  if (!msg) return;
  if (!state.selectedAgent) {
    alert("الرجاء اختيار وكيل من القائمة العلوية أولاً للبدء بالمحادثة.");
    return;
  }

  input.value = '';
  input.style.height = 'auto';

  addChatMessage('user', msg);
  state.chatHistory.push({ role: 'user', content: msg });

  const modelSelect = document.getElementById('chat-model-select');
  const model = modelSelect?.value || state.selectedModel;

  showTyping(state.selectedAgent);
  document.getElementById('send-btn').disabled = true;

  // 1. Setup Streaming Bubble
  const chatEl = document.getElementById('chat-messages');
  const meta = AGENTS_META[state.selectedAgent] || {};
  const row = document.createElement('div');
  row.className = 'chat-row agent-row streaming-row';
  row.innerHTML = `
    <div class="chat-avatar" style="background:${meta.color || '#555'}">${meta.emoji || '🤖'}</div>
    <div class="chat-bubble">
      <div class="chat-agent-label">${meta.emoji || ''} ${state.selectedAgent}</div>
      <div class="chat-content"></div>
    </div>
  `;
  
  let fullReply = '';
  
  try {
    const response = await fetch('http://localhost:3766/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: state.selectedAgent,
        message: msg,
        model: model,
        history: state.chatHistory.slice(-10) // Send up to 10 messages for context
      })
    });

    removeTyping();
    chatEl.appendChild(row);
    const contentEl = row.querySelector('.chat-content');

    if (!response.ok) {
      const errText = await response.text();
      contentEl.innerHTML = `<div style="color:var(--danger)">❌ خطأ في النظام: ${errText}</div>`;
      document.getElementById('send-btn').disabled = false;
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        
        try {
          const json = JSON.parse(trimmed.slice(6));
          if (json.token) {
            fullReply += json.token;
            contentEl.innerHTML = renderMarkdown(fullReply);
            chatEl.scrollTo({ top: chatEl.scrollHeight, behavior: 'auto' });
          } else if (json.error) {
            contentEl.innerHTML += `<div style="color:var(--danger); margin-top:10px;">❌ خطأ: ${json.error}</div>`;
          } else if (json.reply) {
            // Final full reply if needed (SSE 'done' event)
            fullReply = json.reply;
            contentEl.innerHTML = renderMarkdown(fullReply);
          }
        } catch (e) { console.warn("SSE Parse Error:", e); }
      }
    }

    state.chatHistory.push({ role: 'assistant', content: fullReply });

  } catch (e) {
    removeTyping();
    addChatMessage('agent', `❌ فشل الاتصال: ${e.message}`, state.selectedAgent);
  }
  
  document.getElementById('send-btn').disabled = false;
}

/* ═══════════════════════════════════════════
   DEPARTMENT LOG
═══════════════════════════════════════════ */
async function loadDeptLog(deptKey) {
  const container = document.getElementById('dept-log-container');
  if (!container) return;
  try {
    const res = await fetch('http://localhost:3766/api/daily-log').then(r => r.json());
    if (res.success && res.data?.length > 0) {
      container.innerHTML = '';
      const deptAgents = getDeptAgents(deptKey);
      const filtered = res.data.filter(e => !e.agent || deptAgents.includes(e.agent));
      if (filtered.length === 0) {
        container.innerHTML = '<div class="log-empty">📋 لا توجد سجلات لهذا القسم اليوم.</div>';
        return;
      }
      filtered.reverse().forEach(entry => {
        const el = document.createElement('div');
        el.className = 'log-entry';
        const dotClass = entry.type?.includes('pipeline') ? 'pipeline' : entry.type?.includes('error') ? 'error' : entry.type?.includes('research') ? 'research' : 'note';
        const time = entry.time ? new Date(entry.time).toLocaleTimeString('ar-SA', {hour:'2-digit',minute:'2-digit'}) : '';
        el.innerHTML = `
          <div class="log-dot ${dotClass}"></div>
          <div class="log-body">
            <div class="log-summary">${entry.summary || ''}</div>
            <div class="log-meta">${time} ${entry.agent ? '• ' + entry.agent : ''} ${entry.type ? '• ' + entry.type : ''}</div>
          </div>
        `;
        container.appendChild(el);
      });
    } else {
      container.innerHTML = '<div class="log-empty">📋 لا توجد سجلات لهذا القسم بعد.</div>';
    }
  } catch {
    container.innerHTML = '<div class="log-empty">⚠️ تعذر تحميل السجلات.</div>';
  }
}

function getDeptAgents(deptKey) {
  const dept = AGENCY.departments?.[deptKey];
  if (!dept) return [];
  return [dept.lead, ...(dept.members || [])].filter(Boolean);
}

/* ═══════════════════════════════════════════
   DAILY LOG PAGE
═══════════════════════════════════════════ */
async function loadDailyLog() {
  const container = document.getElementById('daily-log-content');
  if (!container) return;
  try {
    const res = await fetch('http://localhost:3766/api/daily-log?format=markdown').then(r => r.json());
    if (res.success && res.data) {
      container.innerHTML = `<div style="line-height:1.8;">${renderMarkdown(res.data)}</div>`;
    } else {
      container.innerHTML = '<div class="log-empty">📅 لا توجد سجلات اليوم.</div>';
    }
  } catch {
    container.innerHTML = '<div class="log-empty">⚠️ تعذر تحميل السجل اليومي.</div>';
  }
}

/* ═══════════════════════════════════════════
   PIPELINES
═══════════════════════════════════════════ */
function buildPipelinesPage() {
  const sel = document.getElementById('pipeline-select');
  if (!sel) return;
  const pipelines = AGENCY.pipelines || {};
  sel.innerHTML = '<option value="">-- اختر --</option>';
  Object.entries(pipelines).forEach(([key, p]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = `🔗 ${key} — ${p.description}`;
    sel.appendChild(opt);
  });
}

function previewPipelineSteps() {
  const sel = document.getElementById('pipeline-select');
  const preview = document.getElementById('pipeline-steps-preview');
  const list = document.getElementById('pipeline-steps-list');
  if (!sel?.value || !AGENCY.pipelines?.[sel.value]) {
    if (preview) preview.style.display = 'none';
    return;
  }
  const steps = AGENCY.pipelines[sel.value].steps;
  if (preview) preview.style.display = 'block';
  if (list) {
    list.innerHTML = steps.map((s, i) => {
      const m = AGENTS_META[s] || {};
      return `<div class="step-chip">${i+1}. ${m.emoji||'🤖'} ${s}</div>`;
    }).join('');
  }
}

async function runPipeline() {
  const pipeline = document.getElementById('pipeline-select')?.value;
  const message = document.getElementById('pipeline-message')?.value?.trim();
  const model = document.getElementById('pipeline-model')?.value;
  if (!pipeline || !message) { alert('اختر Pipeline واكتب وصف المشروع'); return; }

  const progressEl = document.getElementById('pipeline-progress');
  const trackerEl = document.getElementById('pipeline-step-tracker');
  const resultsEl = document.getElementById('pipeline-results');
  const titleEl = document.getElementById('pipeline-progress-title');
  if (progressEl) progressEl.style.display = 'block';
  if (trackerEl) trackerEl.innerHTML = '';
  if (resultsEl) resultsEl.innerHTML = '';
  document.getElementById('pipeline-run-btn').disabled = true;

  const steps = AGENCY.pipelines[pipeline]?.steps || [];
  steps.forEach((s, i) => {
    const m = AGENTS_META[s] || {};
    const el = document.createElement('div');
    el.className = 'pipeline-step';
    el.id = `step-${i}`;
    el.innerHTML = `<span>${m.emoji||'🤖'}</span><strong>${s}</strong><span id="step-status-${i}" style="margin-right:auto;font-size:12px;color:var(--text-muted)">⏳ في الانتظار</span>`;
    trackerEl.appendChild(el);
  });

  try {
    const res = await fetch(`http://localhost:3766/api/pipeline?pipeline=${pipeline}&message=${encodeURIComponent(message)}&model=${encodeURIComponent(model)}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('event: ')) { currentEvent = trimmed.slice(7); continue; }
        if (!trimmed.startsWith('data: ')) continue;
        let json;
        try { json = JSON.parse(trimmed.slice(6)); } catch { continue; }

        if (currentEvent === 'pipeline-start' && titleEl) {
          titleEl.textContent = `📡 جارِي تنفيذ… (${model})`;
        }
        if (currentEvent === 'step-start') {
          const idx = json.step - 1;
          const el = document.getElementById(`step-status-${idx}`);
          const step = document.getElementById(`step-${idx}`);
          if (el) el.innerHTML = '<span style="color:#10a37f">🔄 جارِي...</span>';
          if (step) step.style.borderColor = '#10a37f';
        }
        if (currentEvent === 'step-done') {
          const idx = json.step - 1;
          const el = document.getElementById(`step-status-${idx}`);
          const step = document.getElementById(`step-${idx}`);
          if (el) el.innerHTML = '<span style="color:#10b981">✅ منتهى</span>';
          if (step) step.style.borderColor = '#10b981';

          const m = AGENTS_META[json.agent] || {};
          const card = document.createElement('div');
          card.className = 'pipeline-result-card';
          card.innerHTML = `
            <div class="pipeline-result-header"><span style="font-size:18px">${m.emoji||'🤖'}</span><strong>${json.agent}</strong><span style="color:var(--text-muted);margin-right:auto">${m.role||''}</span></div>
            <div class="pipeline-result-body">${renderMarkdown(json.reply)}</div>
          `;
          resultsEl.appendChild(card);
        }
        if (currentEvent === 'step-retry') {
          const idx = json.step - 1;
          const el = document.getElementById(`step-status-${idx}`);
          const waitSec = Math.round((json.retryIn || 5000) / 1000);
          if (el) el.innerHTML = `<span style="color:#f59e0b">⏳ إعادة بعد ${waitSec}ث</span>`;
        }
        if (currentEvent === 'step-reject') {
          const idx = json.step - 1;
          const el = document.getElementById(`step-status-${idx}`);
          if (el) el.innerHTML = '<span style="color:#f59e0b">🔙 رفض</span>';
        }
        if (currentEvent === 'step-error') {
          const idx = json.step - 1;
          const el = document.getElementById(`step-status-${idx}`);
          const step = document.getElementById(`step-${idx}`);
          if (el) el.innerHTML = `<span style="color:#f43f5e">❌ ${(json.error||'').slice(0,60)}</span>`;
          if (step) step.style.borderColor = '#f43f5e';
        }
        if (currentEvent === 'pipeline-done') {
          if (titleEl) titleEl.textContent = '✅ اكتمل التنفيذ!';
          const retryBtn = document.createElement('button');
          retryBtn.className = 'btn-primary';
          retryBtn.style.marginTop = '16px';
          retryBtn.textContent = '🔄 تشغيل مرة أخرى';
          retryBtn.onclick = () => { progressEl.style.display = 'none'; document.getElementById('pipeline-run-btn').disabled = false; };
          resultsEl.appendChild(retryBtn);
        }
      }
    }
  } catch (e) {
    if (titleEl) titleEl.textContent = `❌ خطأ: ${e.message}`;
  }
  document.getElementById('pipeline-run-btn').disabled = false;
}

/* ═══════════════════════════════════════════
   TRAINING
═══════════════════════════════════════════ */
function buildTrainPage() {
  const sel = document.getElementById('train-agent');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- اختر --</option>';
  Object.keys(AGENTS_META).forEach(a => {
    const m = AGENTS_META[a];
    const opt = document.createElement('option');
    opt.value = a;
    opt.textContent = `${m.emoji||'🤖'} ${a}`;
    sel.appendChild(opt);
  });
}

function copyTrainCommand() {
  const agent = document.getElementById('train-agent')?.value;
  const source = document.getElementById('train-source')?.value;
  if (!agent || !source) return;
  const cmd = `/agency train ${agent} "${source}"`;
  navigator.clipboard.writeText(cmd);
  alert('✅ تم نسخ الأمر!');
}

/* ═══════════════════════════════════════════
   SETTINGS
═══════════════════════════════════════════ */
async function checkApiKey() {
  try {
    const res = await fetch('http://localhost:3766/api/keys').then(r => r.json());
    const status = document.getElementById('api-key-status');
    if (res.success && res.data?.includes('openrouter')) {
      if (status) status.textContent = '✅ مفعّل';
    } else {
      if (status) status.textContent = '❌ غير مُعد';
    }
  } catch {}
}

async function saveApiKeyFromForm() {
  const key = document.getElementById('api-key-input')?.value?.trim();
  if (!key) return;
  try {
    const res = await fetch('http://localhost:3766/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'openrouter', key })
    });
    const data = await res.json();
    if (data.success) {
      alert('✅ تم حفظ المفتاح!');
      checkApiKey();
    }
  } catch (e) {
    alert('❌ فشل الحفظ: ' + e.message);
  }
}

/* ═══════════════════════════════════════════
   MODALS
═══════════════════════════════════════════ */
function showNewProjectModal() {
  document.getElementById('modal-overlay')?.classList.remove('hidden');
  document.getElementById('modal-new-project')?.classList.remove('hidden');
}

function hideModal() {
  document.getElementById('modal-overlay')?.classList.add('hidden');
  document.getElementById('modal-new-project')?.classList.add('hidden');
}

function copyInitCommand() {
  const name = document.getElementById('proj-name')?.value?.trim() || 'my-project';
  const desc = document.getElementById('proj-desc')?.value?.trim() || '';
  navigator.clipboard.writeText(`/agency init ${name} "${desc}"`);
  alert('✅ تم نسخ الأمر!');
  hideModal();
}

/* ═══════════════════════════════════════════
   MARKDOWN RENDERER
═══════════════════════════════════════════ */
function renderMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>')
    .replace(/<p><\/p>/g, '');
}

/* ═══════════════════════════════════════════
   PHASE 5: STRATEGIC TOOLS LOGIC
═══════════════════════════════════════════ */
async function buildRadarPage() {
  const blipsContainer = document.getElementById('radar-blips');
  const warningsContainer = document.getElementById('radar-warnings');
  if (!blipsContainer || !warningsContainer) return;

  blipsContainer.innerHTML = '';
  warningsContainer.innerHTML = '<div class="log-empty">جارٍ تحميل بيانات الرادار...</div>';

  try {
    // Fetch real data
    const [repRes, statsRes] = await Promise.all([
      fetch('/api/reputation').then(r => r.json()),
      fetch('/api/dashboard/stats').then(r => r.json())
    ]);

    const reputations = repRes.success ? repRes.data : {};
    const stats = statsRes.success ? statsRes.data : {};
    
    blipsContainer.innerHTML = '';
    warningsContainer.innerHTML = '';
    let hasWarnings = false;

    // Display Ollama status
    const ollamaIndicator = document.createElement('div');
    ollamaIndicator.className = 'warning-item';
    if (stats.ollamaStatus === 'online') {
      ollamaIndicator.innerHTML = `<strong>🟢 Ollama متصل</strong><br><span style="color:var(--text-muted)">الموديلات المتاحة: ${(stats.ollamaModels || []).join(', ') || 'لا يوجد'}</span>`;
    } else {
      ollamaIndicator.innerHTML = `<strong>🔴 Ollama غير متصل</strong><br><span style="color:var(--text-muted)">تأكد من تشغيل Ollama على جهازك.</span>`;
      hasWarnings = true;
    }
    warningsContainer.appendChild(ollamaIndicator);

    // Create blips from agents
    const agentNames = stats.agentNames || Object.keys(reputations);
    if (agentNames.length === 0) {
      // Show default data if no agents
      const defaultBlips = [
        { name: "النظام", status: "safe", x: 0, y: 0 },
      ];
      defaultBlips.forEach(proj => {
        const blip = document.createElement('div');
        blip.className = `radar-blip ${proj.status}`;
        blip.style.top = '50%';
        blip.style.left = '50%';
        blip.title = proj.name;
        blipsContainer.appendChild(blip);
      });
    } else {
      agentNames.forEach((name, idx) => {
        const rep = reputations[name];
        const angle = (idx / agentNames.length) * 2 * Math.PI;
        const radius = 25 + Math.random() * 25;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        
        let status = 'safe';
        if (rep && rep.history) {
          const recentFails = rep.history.filter(h => h.outcome === 'rejected').length;
          if (recentFails > 2) status = 'danger';
          else if (recentFails > 0) status = 'warning';
        }
        
        const blip = document.createElement('div');
        blip.className = `radar-blip ${status}`;
        const top = ((y + 100) / 2) * 0.8 + 10;
        const left = ((x + 100) / 2) * 0.8 + 10;
        blip.style.top = `${top}%`;
        blip.style.left = `${left}%`;
        blip.title = name;
        blipsContainer.appendChild(blip);

        if (status === 'danger') {
          hasWarnings = true;
          const warn = document.createElement('div');
          warn.className = 'warning-item';
          warn.innerHTML = `<strong>⚠️ ${name}</strong><br><span style="color:var(--text-muted)">هذا الوكيل لديه عدة مهام مرفوضة مؤخراً.</span>`;
          warningsContainer.appendChild(warn);
        }
      });
    }

    // Stats summary
    const statsSummary = document.createElement('div');
    statsSummary.className = 'warning-item';
    statsSummary.style.borderLeft = '3px solid var(--primary)';
    statsSummary.innerHTML = `
      <strong>📊 إحصائيات الوكالة</strong><br>
      <span style="color:var(--text-muted)">
        🤖 ${stats.totalAgents || 0} وكيل | 📚 ${stats.totalKnowledge || 0} ملف معرفي | 📁 ${stats.totalProjects || 0} مشروع
      </span>
    `;
    warningsContainer.appendChild(statsSummary);

    if (!hasWarnings) {
      const safeMsg = document.createElement('div');
      safeMsg.style.cssText = 'color:#10b981; font-size:13px; padding:10px;';
      safeMsg.textContent = '✅ جميع الوكلاء في الوضع الآمن.';
      warningsContainer.appendChild(safeMsg);
    }
  } catch (e) {
    warningsContainer.innerHTML = `<div class="log-empty" style="color:#ff6b6b">خطأ في جلب بيانات الرادار: ${e.message}</div>`;
  }
}

function buildBoardPage() {
  const grid = document.getElementById('board-grid');
  if (!grid || grid.children.length > 0) return; // already built

  const advisors = [
    { name: "ستيف جوبز", role: "فلسفة المنتج & التصميم", icon: "🍏" },
    { name: "إيلون ماسك", role: "المبادئ الأولى & هندسة", icon: "🚀" },
    { name: "وارن بافيت", role: "استراتيجيات المال والنمو", icon: "📈" },
    { name: "تشارلي منغر", role: "النماذج الذهنية", icon: "🧠" },
    { name: "سون تزو", role: "استراتيجية الحروب ", icon: "⚔️" },
    { name: "ديفيد أوجيلفي", role: "التسويق والإقناع", icon: "📢" },
    { name: "ماركوس أوريليوس", role: "الصلابة النفسية", icon: "🏛️" }
  ];

  advisors.forEach(adv => {
    const card = document.createElement('div');
    card.className = 'board-card';
    card.innerHTML = `
      <div class="board-avatar">${adv.icon}</div>
      <h4>${adv.name}</h4>
      <p>${adv.role}</p>
    `;
    card.onclick = () => selectAdvisor(adv, card);
    grid.appendChild(card);
  });
}

function selectAdvisor(adv, cardEl) {
  document.querySelectorAll('.board-card').forEach(c => c.classList.remove('active'));
  cardEl.classList.add('active');
  const msgContainer = document.getElementById('board-messages');
  if (msgContainer) {
    msgContainer.innerHTML = `<div class="log-empty">مرحباً، أنا <strong>${adv.name}</strong>.<br>اطرح مشكلتك.. وسأعطيك إجابة خالية من العواطف بناءً على نماذجي الذهنية.</div>`;
  }
}

async function sendBoardMessage() {
   const input = document.getElementById('board-input');
   const text = input.value.trim();
   if(!text) return;
   
   // find the selected mentor
   const activeCard = document.querySelector('.board-card.active');
   if(!activeCard) {
     alert('الرجاء اختيار مستشار من القائمة أولاً');
     return;
   }
   // extract id from e.g. "board-steve-jobs" -> "steve-jobs"
   const mentorId = activeCard.id.replace('board-', ''); 
   const mentorName = activeCard.querySelector('h4').textContent;
   const mentorEmoji = activeCard.querySelector('.emoji-icon').textContent;
   
   const msgContainer = document.getElementById('board-messages');
   
   // Add user message
   if(msgContainer.querySelector('.log-empty')) {
     msgContainer.innerHTML = '';
   }
   msgContainer.innerHTML += `
      <div style="margin-bottom:15px; text-align:right; width: 100%;">
        <div style="display:inline-block; background:rgba(255,255,255,0.05); padding:10px 15px; border-radius:12px; max-width:80%; text-align:right; border:1px solid rgba(255,255,255,0.1);">
          <span style="font-size:12px; color:var(--text-secondary); margin-bottom:5px; display:block;">أنت</span>
          ${text.replace(/\\n/g, '<br>')}
        </div>
      </div>
   `;
   
   // Add loading state
   const loadingId = 'loading-' + Date.now();
   msgContainer.innerHTML += `
      <div id="${loadingId}" style="margin-bottom:15px; text-align:right; width: 100%;">
        <div style="display:inline-block; padding:10px 15px; max-width:80%; text-align:right;">
          <span style="font-size:12px; color:var(--text-secondary); margin-bottom:10px; display:block;">${mentorEmoji} ${mentorName} يحلل الموقف...</span>
          <div class="radar-dot" style="position:relative; width:10px; height:10px; background:var(--primary); box-shadow:0 0 10px var(--primary); display:inline-block;"></div>
        </div>
      </div>
   `;
   input.value = '';
   msgContainer.scrollTop = msgContainer.scrollHeight;
   
   try {
     const res = await fetch('/api/board/consult', {
       method: 'POST',
       headers: {'Content-Type': 'application/json'},
       body: JSON.stringify({ mentor: mentorId, message: text, model: state.selectedModel })
     });
     
     document.getElementById(loadingId)?.remove();
     const data = await res.json();
     
     if(data.success) {
       msgContainer.innerHTML += `
          <div style="margin-bottom:15px; text-align:right; width: 100%;">
            <div style="display:inline-block; background:rgba(0,192,255,0.05); border:1px solid rgba(0,192,255,0.15); padding:15px; border-radius:12px; max-width:90%; text-align:right;">
              <span style="font-size:13px; color:var(--primary); margin-bottom:8px; display:block; font-weight:bold;">${mentorEmoji} ${mentorName}</span>
              <div class="md-content" style="line-height:1.6; color: var(--text-primary); font-size: 14px;">${marked.parse(data.reply)}</div>
            </div>
          </div>
       `;
     } else {
       msgContainer.innerHTML += `
          <div style="margin-bottom:15px; text-align:right; width:100%;">
            <div style="display:inline-block; background:rgba(255,0,0,0.1); border:1px solid rgba(255,0,0,0.2); padding:10px 15px; border-radius:12px; max-width:80%; text-align:right;">
              <span style="color:#ff6b6b">خطأ: ${data.error || 'فشل الاتصال الخادم'}</span>
            </div>
          </div>
       `;
     }
   } catch (e) {
     document.getElementById(loadingId)?.remove();
     msgContainer.innerHTML += `
        <div style="margin-bottom:15px; text-align:right; width:100%;">
          <div style="display:inline-block; background:rgba(255,0,0,0.1); border:1px solid rgba(255,0,0,0.2); padding:10px 15px; border-radius:12px; max-width:80%; text-align:right;">
            <span style="color:#ff6b6b">خطأ في الشبكة: ${e.message}</span>
          </div>
        </div>
     `;
   }
   msgContainer.scrollTop = msgContainer.scrollHeight;
}

async function buildVaultPage() {
  const grid = document.getElementById('vault-grid');
  if (!grid) return;
  grid.innerHTML = '<div class="log-empty">جارٍ تحميل خزينة المعرفة...</div>';

  try {
    const [knowledgeRes, memRes] = await Promise.all([
      fetch('/api/knowledge').then(r => r.json()),
      fetch('/api/mempalace/stats').then(r => r.json()).catch(() => ({ success: false }))
    ]);

    grid.innerHTML = '';
    let totalCards = 0;

    // Knowledge files from agents
    if (knowledgeRes.success && Object.keys(knowledgeRes.data).length > 0) {
      for (const [agent, files] of Object.entries(knowledgeRes.data)) {
        files.forEach(file => {
          totalCards++;
          const card = document.createElement('div');
          card.className = 'vault-card';
          card.innerHTML = `
            <h4>📄 ${file}</h4>
            <p>ملف معرفي محفوظ بواسطة وكيل: <strong>${agent}</strong></p>
            <div class="vault-tags">
              <span class="vault-tag">#${agent}</span>
              <span class="vault-tag">#معرفة</span>
            </div>
          `;
          grid.appendChild(card);
        });
      }
    }

    // MemPalace stats
    if (memRes.success && memRes.data) {
      const mStats = memRes.data;
      const card = document.createElement('div');
      card.className = 'vault-card';
      card.style.borderLeft = '3px solid var(--primary)';
      card.innerHTML = `
        <h4>🧠 ذاكرة الوكالة (MemPalace)</h4>
        <p>إجمالي الذكريات المحفوظة: <strong>${mStats.totalMemories || 0}</strong><br>
        عدد المشاريع: <strong>${mStats.totalProjects || 0}</strong></p>
        <div class="vault-tags">
          <span class="vault-tag">#ذاكرة_تراكمية</span>
        </div>
      `;
      grid.appendChild(card);
      totalCards++;
    }

    if (totalCards === 0) {
      grid.innerHTML = `
        <div class="log-empty" style="grid-column: 1/-1;">
          📭 لا يوجد بيانات محفوظة في الخزينة حالياً.<br><br>
          <span style="font-size:12px; color:var(--text-muted)">ابدأ بالتحدث مع الوكلاء أو تشغيل المسارات لتجميع المعرفة تلقائياً.</span>
        </div>
      `;
    }
  } catch (e) {
    grid.innerHTML = `<div class="log-empty" style="color:#ff6b6b">خطأ في جلب البيانات: ${e.message}</div>`;
  }
}

async function buildUniversityPage() {
  const tracks = document.getElementById('univ-tracks');
  if (!tracks) return;
  tracks.innerHTML = '<div class="log-empty">جارٍ تحميل سجل التعلم...</div>';

  try {
    const [logRes, expRes] = await Promise.all([
      fetch('/api/daily-log?format=json').then(r => r.json()),
      fetch('/api/experiments?summary=true').then(r => r.json()).catch(() => ({ success: false }))
    ]);

    tracks.innerHTML = '';
    let hasContent = false;

    // Daily log entries as learning activities
    if (logRes.success && logRes.data && logRes.data.length > 0) {
      hasContent = true;
      const recentLogs = logRes.data.slice(-10).reverse();
      
      const logsCard = document.createElement('div');
      logsCard.className = 'univ-track-card';
      logsCard.innerHTML = `
        <div class="univ-track-header">
          <span class="univ-track-title">📋 سجل النشاط اليومي</span>
          <span class="univ-track-level">${logRes.data.length} سجل</span>
        </div>
      `;
      
      recentLogs.forEach(entry => {
        const row = document.createElement('div');
        row.style.cssText = 'padding:8px 12px; border-bottom:1px solid rgba(255,255,255,0.05); font-size:13px; color:var(--text-secondary);';
        const time = new Date(entry.timestamp).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
        row.innerHTML = `<span style="color:var(--primary)">[${time}]</span> ${entry.summary || entry.type}`;
        logsCard.appendChild(row);
      });
      tracks.appendChild(logsCard);
    }

    // Experiments summary
    if (expRes.success && expRes.data) {
      hasContent = true;
      const expCard = document.createElement('div');
      expCard.className = 'univ-track-card';
      const total = (expRes.data.active || 0) + (expRes.data.completed || 0) + (expRes.data.failed || 0);
      const completedPct = total > 0 ? Math.round(((expRes.data.completed || 0) / total) * 100) : 0;
      expCard.innerHTML = `
        <div class="univ-track-header">
          <span class="univ-track-title">🧪 التجارب والاختبارات</span>
          <span class="univ-track-level">${total} تجربة</span>
        </div>
        <div class="progress-bg">
          <div class="progress-fill" style="width: 0%;"></div>
        </div>
        <div style="font-size:11px; margin-top:6px; color:var(--text-muted); text-align:left;">
          ✅ ${expRes.data.completed || 0} مكتمل | 🔄 ${expRes.data.active || 0} نشط | ❌ ${expRes.data.failed || 0} فاشل — ${completedPct}% نجاح
        </div>
      `;
      tracks.appendChild(expCard);
      setTimeout(() => {
        const fill = expCard.querySelector('.progress-fill');
        if (fill) fill.style.width = `${completedPct}%`;
      }, 200);
    }

    if (!hasContent) {
      tracks.innerHTML = `
        <div class="log-empty">
          🎓 لا يوجد سجلات تعلم حتى الآن.<br><br>
          <span style="font-size:12px; color:var(--text-muted)">ابدأ بتشغيل المسارات والتحدث مع الوكلاء لتتراكم سجلاتك هنا تلقائياً.</span>
        </div>
      `;
    }
  } catch (e) {
    tracks.innerHTML = `<div class="log-empty" style="color:#ff6b6b">خطأ: ${e.message}</div>`;
  }
}

async function buildIdentityPage() {
  // Load saved identity data
  try {
    const res = await fetch('/api/identity');
    const data = await res.json();
    if (data.success && data.data) {
      const d = data.data;
      const valuesEl = document.getElementById('identity-values');
      const visionEl = document.getElementById('identity-vision');
      const missionEl = document.getElementById('identity-mission');
      const principlesEl = document.getElementById('identity-principles');
      if (valuesEl && d.values) valuesEl.value = d.values;
      if (visionEl && d.vision) visionEl.value = d.vision;
      if (missionEl && d.mission) missionEl.value = d.mission;
      if (principlesEl && d.principles) principlesEl.value = d.principles;
    }
  } catch { /* first time, no data */ }
}

// Save identity from the Identity Lab page
async function saveIdentity() {
  const values = document.getElementById('identity-values')?.value || '';
  const vision = document.getElementById('identity-vision')?.value || '';
  const mission = document.getElementById('identity-mission')?.value || '';
  const principles = document.getElementById('identity-principles')?.value || '';

  try {
    const res = await fetch('/api/identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values, vision, mission, principles, updatedAt: new Date().toISOString() })
    });
    const data = await res.json();
    if (data.success) {
      alert('✅ تم حفظ دستورك الشخصي بنجاح!');
    } else {
      alert('❌ فشل الحفظ: ' + (data.error || ''));
    }
  } catch (e) {
    alert('❌ خطأ في الشبكة: ' + e.message);
  }
}
