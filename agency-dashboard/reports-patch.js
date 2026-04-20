// ─── REPORT & TEMPLATE PAGE EXTENSION ───
async function loadReportsAndTemplates() {
  try {
    const r1 = fetch('http://localhost:3766/api/templates').then(r => r.json());
    const r2 = fetch('http://localhost:3766/api/reports/daily').then(r => r.json());
    const [tRes, drRes] = await Promise.all([r1, r2].map(r => r.catch(() => null)));
    
    if (tRes?.success && tRes.data) window.agencyTemplates = tRes.data;
    if (drRes?.success && drRes.data) window.dailyReport = drRes.data;
    
    renderTemplatesList();
    renderDailyReport();
  } catch (e) {
    console.log("Could not load reports", e);
  }
}

function renderTemplatesList() {
  const list = document.getElementById('templates-list');
  if (!list) return;
  const tmpls = window.agencyTemplates || {};
  if (Object.keys(tmpls).length === 0) return;
  
  list.innerHTML = Object.entries(tmpls).map(([key, t]) => `
    <div class="template-card" onclick="openNewProjectFromTemplate('${key}')" style="cursor:pointer; background:var(--bg-elevated); border:1px solid var(--border); padding:16px; border-radius:12px; margin-bottom:12px; transition:all 0.2s">
      <div style="font-size:24px; margin-bottom:8px">${t.emoji}</div>
      <h3 style="margin-bottom:8px; font-size:15px">${t.name}</h3>
      <p style="font-size:12px; color:var(--text-secondary); margin-bottom:12px">${t.description}</p>
      <div style="font-size:11px; color:var(--text-muted); display:flex; justify-content:space-between">
        <span>⏱️ ${t.estimatedTime}</span>
        <span>⚙️ ${t.phases.length} مراحل</span>
      </div>
    </div>
  `).join('');
}

function renderDailyReport() {
  const container = document.getElementById('daily-report-container');
  if (!container) return;
  const rep = window.dailyReport;
  if (!rep) return;
  
  let html = `
    <div style="background:var(--bg-surface); border:1px solid var(--border); padding:24px; border-radius:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px">
        <h2 style="font-size:16px;">📊 تقرير اليوم (${rep.date})</h2>
      </div>
      
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:24px">
        <div class="stat-card" style="background:rgba(99,102,241,0.1); padding:16px"><h3 style="font-size:20px; margin-bottom:4px">📁 ${rep.summary.totalProjects}</h3><p style="font-size:11px; color:var(--text-muted)">مشاريع كلية</p></div>
        <div class="stat-card" style="background:rgba(245,158,11,0.1); padding:16px"><h3 style="font-size:20px; margin-bottom:4px">🔄 ${rep.summary.activeProjects}</h3><p style="font-size:11px; color:var(--text-muted)">مشاريع نشطة</p></div>
        <div class="stat-card" style="background:rgba(16,185,129,0.1); padding:16px"><h3 style="font-size:20px; margin-bottom:4px">✅ ${rep.summary.completedProjects}</h3><p style="font-size:11px; color:var(--text-muted)">مكتملة</p></div>
        <div class="stat-card" style="background:rgba(244,63,94,0.1); padding:16px"><h3 style="font-size:20px; margin-bottom:4px">❌ ${rep.summary.failedProjects}</h3><p style="font-size:11px; color:var(--text-muted)">فاشلة</p></div>
      </div>
      
      <h3 style="margin-bottom:16px; font-size:16px">🎖️ أداء الوكلاء الأعلى</h3>
      <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:32px">
        ${rep.agentPerformance.slice(0, 4).map(a => `
          <div style="display:flex; justify-content:space-between; background:var(--bg-elevated); padding:12px; border-radius:8px; align-items:center">
            <div>
              <strong>${(window.AGENTS_META && window.AGENTS_META[a.agent]?.emoji) || '🤖'} ${a.agent}</strong>
              <span style="font-size:12px; color:var(--text-muted); margin-right:8px">(${a.totalTasks} مهام)</span>
            </div>
            <div style="display:flex; gap:8px">
              <span style="background:var(--bg-surface); padding:4px 8px; border-radius:12px; font-size:11px">${a.badge} (${a.trustScore})</span>
              <span style="background:var(--bg-surface); padding:4px 8px; border-radius:12px; font-size:11px">🔥 Streak: ${a.streakCurrent}</span>
            </div>
          </div>
        `).join('')}
      </div>

      <h3 style="margin-bottom:16px; font-size:16px">💡 توصيات رئيسية</h3>
      <ul style="padding-right:20px; color:var(--text-secondary); line-height:1.6; font-size:13px">
        ${rep.recommendations.map(r => `<li style="margin-bottom:8px">${r}</li>`).join('')}
      </ul>
    </div>
  `;
  
  container.innerHTML = html;
}

function openNewProjectFromTemplate(key) {
  const t = window.agencyTemplates[key];
  if(!t) return;
  const nameEl = document.getElementById('proj-name');
  const descEl = document.getElementById('proj-desc');
  if (nameEl) nameEl.value = key + '-' + Math.floor(Math.random()*10000);
  if (descEl) descEl.value = t.description;
  if (typeof updateModalCmd === 'function') updateModalCmd();
  if (typeof showNewProjectModal === 'function') showNewProjectModal();
}

// Attach to global window
window.loadReportsAndTemplates = loadReportsAndTemplates;
