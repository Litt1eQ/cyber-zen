import type { CustomStatisticsTemplateUpsert } from '@/types/customStatisticsTemplates'

export type CustomTemplateExampleId = 'simple_today_total' | 'dashboard_v1'

export type CustomTemplateExample = {
  id: CustomTemplateExampleId
  titleKey: string
  descriptionKey: string
  template: Pick<CustomStatisticsTemplateUpsert, 'html' | 'css' | 'js' | 'params' | 'height_px'>
}

const SIMPLE_HTML = `<div style="padding: 12px;">
  <div style="font-size: 12px; color: #64748b;">今日功德</div>
  <div id="value" style="margin-top: 6px; font-size: 24px; font-weight: 700;"></div>
</div>
`

const SIMPLE_JS = `// 你可以定义 window.render(ctx) 来渲染/更新组件
// ctx.data: { stats, settings, allDays, aggregates, range }
// ctx.params: 自定义参数（JSON）
// ctx.helpers: 内置工具函数
// ctx.root: HTML 根元素（#root）
window.render = (ctx) => {
  const el = ctx.root?.querySelector('#value')
  if (!el) return
  const total = ctx.data?.stats?.today?.total ?? 0
  el.textContent = ctx.helpers.formatNumber(total)
}
`

const DASHBOARD_HTML = `<div class="cz-root" data-template="dashboard_v1">
  <div class="cz-header">
    <div class="cz-title">
      <div class="cz-title-main" id="czTitle"></div>
      <div class="cz-title-sub" id="czSubtitle"></div>
    </div>
    <div class="cz-controls" role="group" aria-label="Dashboard views">
      <button class="cz-chip is-active" type="button" data-view="hourly">Hourly</button>
      <button class="cz-chip" type="button" data-view="apps">Apps</button>
      <button class="cz-chip" type="button" data-view="keys">Keys</button>
    </div>
  </div>

  <div class="cz-kpis" id="czKpis"></div>

  <div class="cz-grid">
    <div class="cz-card cz-main" id="czMain"></div>
    <div class="cz-card cz-side" id="czSide"></div>
  </div>

  <div class="cz-footer" id="czFooter"></div>
</div>
`

const DASHBOARD_CSS = `:root{
  --cz-bg0:#ffffff;
  --cz-bg1:#f8fafc;
  --cz-card:#ffffff;
  --cz-border: rgba(15, 23, 42, .10);
  --cz-muted:#64748b;
  --cz-text:#0f172a;
  --cz-accent:#2563eb;
  --cz-accent2:#7c3aed;
  --cz-shadow: 0 8px 30px rgba(2,6,23,.06);
}

#root{ padding: 12px; box-sizing: border-box; }

.cz-root{
  color: var(--cz-text);
  background:
    radial-gradient(900px 400px at 0% 0%, rgba(37,99,235,.10), transparent 55%),
    radial-gradient(900px 420px at 100% 20%, rgba(124,58,237,.08), transparent 60%),
    linear-gradient(180deg, var(--cz-bg0), var(--cz-bg1));
  border: 1px solid var(--cz-border);
  border-radius: 16px;
  padding: 14px;
  box-shadow: var(--cz-shadow);
}

.cz-header{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
.cz-title{ min-width:0; }
.cz-title-main{ font-size:14px; font-weight:800; letter-spacing: .2px; }
.cz-title-sub{ margin-top:2px; font-size:11px; color: var(--cz-muted); }

.cz-controls{ display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
.cz-chip{
  appearance:none;
  border:1px solid rgba(15,23,42,.12);
  background: rgba(255,255,255,.7);
  color: rgba(15,23,42,.75);
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  user-select: none;
  transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
}
.cz-chip:hover{ transform: translateY(-1px); border-color: rgba(37,99,235,.35); }
.cz-chip:focus-visible{ outline: 2px solid rgba(37,99,235,.45); outline-offset: 2px; }
.cz-chip.is-active{
  background: rgba(37,99,235,.10);
  border-color: rgba(37,99,235,.35);
  color: rgba(37,99,235,.95);
}

.cz-kpis{
  margin-top: 12px;
  display:grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 10px;
}
.cz-kpi{
  grid-column: span 6;
  background: var(--cz-card);
  border: 1px solid var(--cz-border);
  border-radius: 14px;
  padding: 10px 12px;
}
@media (min-width: 560px){
  .cz-kpi{ grid-column: span 3; }
}
.cz-kpi-label{ font-size: 11px; color: var(--cz-muted); }
.cz-kpi-value{ margin-top: 4px; font-size: 20px; font-weight: 800; letter-spacing: -.2px; }
.cz-kpi-sub{ margin-top: 3px; font-size: 11px; color: rgba(15,23,42,.6); }

.cz-grid{
  margin-top: 10px;
  display:grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 10px;
}
.cz-card{
  background: var(--cz-card);
  border: 1px solid var(--cz-border);
  border-radius: 14px;
  padding: 12px;
  overflow: hidden;
}
.cz-main{ grid-column: span 12; }
.cz-side{ grid-column: span 12; }
@media (min-width: 740px){
  .cz-main{ grid-column: span 8; }
  .cz-side{ grid-column: span 4; }
}

.cz-card-title{ display:flex; align-items:baseline; justify-content:space-between; gap: 10px; }
.cz-card-title h3{ margin:0; font-size: 12px; font-weight: 800; letter-spacing: .2px; }
.cz-card-title .cz-hint{ font-size: 11px; color: var(--cz-muted); white-space: nowrap; }

.cz-hourly{
  margin-top: 10px;
  display:grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  align-items: end;
  gap: 2px;
  height: 76px;
}
.cz-bar{
  height: calc(var(--h, 0) * 1%);
  min-height: 2px;
  border-radius: 6px;
  background: rgba(37,99,235,.15);
}
.cz-bar.is-peak{ background: linear-gradient(180deg, rgba(37,99,235,.85), rgba(124,58,237,.75)); }

.cz-legend{
  margin-top: 8px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  font-size: 11px;
  color: var(--cz-muted);
}

.cz-spark{
  margin-top: 10px;
  width: 100%;
  height: 80px;
  display:block;
}

.cz-list{
  margin-top: 10px;
  display:flex;
  flex-direction: column;
  gap: 8px;
}
.cz-row{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap: 10px;
}
.cz-row-name{
  min-width: 0;
  flex: 1 1 auto;
  font-size: 12px;
  font-weight: 650;
  overflow:hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cz-row-meta{
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--cz-muted);
  font-variant-numeric: tabular-nums;
}
.cz-meter{
  margin-top: 4px;
  height: 8px;
  border-radius: 999px;
  background: rgba(15,23,42,.06);
  overflow:hidden;
}
.cz-meter > span{
  display:block;
  height: 100%;
  width: calc(var(--p, 0) * 1%);
  background: linear-gradient(90deg, rgba(37,99,235,.85), rgba(124,58,237,.85));
}

.cz-chips{ margin-top: 10px; display:flex; flex-wrap:wrap; gap: 6px; }
.cz-key{
  border: 1px solid rgba(15,23,42,.10);
  background: rgba(255,255,255,.75);
  color: rgba(15,23,42,.78);
  border-radius: 999px;
  padding: 6px 9px;
  font-size: 11px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.cz-key b{ font-weight: 800; color: rgba(15,23,42,.88); }

.cz-footer{
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed rgba(15,23,42,.12);
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap: 10px;
  font-size: 11px;
  color: var(--cz-muted);
}

@media (prefers-reduced-motion: reduce){
  .cz-chip{ transition: none; }
  .cz-chip:hover{ transform:none; }
}
`

const DASHBOARD_JS = `// 综合仪表盘（示例）
// - 展示范围：ctx.data.range ('today' | 'all')
// - 数据来源：ctx.data.stats / ctx.data.allDays / ctx.data.aggregates
// - 可配置：ctx.params（见下方默认 params）
(() => {
  const getState = () => {
    const w = window;
    if (!w.__cz_dashboard_state) {
      w.__cz_dashboard_state = { mounted: false, view: 'hourly', lastCtx: null, boundRoot: null, onClick: null };
    }
    return w.__cz_dashboard_state;
  };

  const ensureViewSwitchListener = (root, state) => {
    if (!root) return;
    if (state.boundRoot === root && typeof state.onClick === 'function') return;
    try {
      if (state.boundRoot && typeof state.onClick === 'function') {
        state.boundRoot.removeEventListener('click', state.onClick);
      }
    } catch {}

    state.boundRoot = root;
    state.onClick = (e) => {
      const target = e && e.target;
      const btn = target && target.closest ? target.closest('button[data-view]') : null;
      const view = btn && btn.getAttribute ? btn.getAttribute('data-view') : '';
      if (!view) return;
      state.view = view;
      const latest = state.lastCtx;
      if (!latest) return;
      try { window.render(latest); } catch {}
    };
    try { root.addEventListener('click', state.onClick); } catch {}
  };

  const fmt = (ctx, v) => (ctx && ctx.helpers && typeof ctx.helpers.formatNumber === 'function')
    ? ctx.helpers.formatNumber(v)
    : String(Number(v) || 0);

  const clamp01 = (ctx, v) => (ctx && ctx.helpers && typeof ctx.helpers.clamp === 'function')
    ? ctx.helpers.clamp(v, 0, 1)
    : Math.max(0, Math.min(1, Number(v) || 0));

  const pct = (ctx, part, total) => (total > 0 ? clamp01(ctx, part / total) : 0);

  const byValueDesc = (a, b) => (b[1] || 0) - (a[1] || 0);

  const safeString = (v, fallback) => {
    const s = String(v == null ? '' : v).trim();
    return s ? s : fallback;
  };

  const keyLabel = (code) => {
    const c = String(code || '');
    if (/^Key[A-Z]$/.test(c)) return c.slice(3);
    if (/^Digit\\d$/.test(c)) return c.slice(5);
    if (c === 'Space') return 'Space';
    if (c === 'Enter') return 'Enter';
    if (c === 'Backspace') return '⌫';
    if (c === 'Tab') return 'Tab';
    if (c === 'Escape') return 'Esc';
    if (c === 'ArrowUp') return '↑';
    if (c === 'ArrowDown') return '↓';
    if (c === 'ArrowLeft') return '←';
    if (c === 'ArrowRight') return '→';
    if (c === 'ShiftLeft' || c === 'ShiftRight') return 'Shift';
    if (c === 'ControlLeft' || c === 'ControlRight') return 'Ctrl';
    if (c === 'AltLeft' || c === 'AltRight') return 'Alt';
    if (c === 'MetaLeft' || c === 'MetaRight') return 'Meta';
    return c.length > 10 ? (c.slice(0, 10) + '…') : c;
  };

  const pickDays = (data) => {
    const range = data && data.range;
    const stats = data && data.stats;
    const allDays = (data && Array.isArray(data.allDays)) ? data.allDays : [];
    if (!stats || !stats.today) return [];
    return range === 'all' ? allDays : [stats.today];
  };

  const sortDaysAsc = (days) => {
    return (Array.isArray(days) ? days.slice(0) : []).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  };

  const buildSparkSvg = (values, accent) => {
    const w = 320;
    const h = 80;
    const pad = 6;
    const max = Math.max(1, ...values.map((x) => Number(x) || 0));
    const pts = values.map((v, i) => {
      const x = pad + (values.length <= 1 ? 0 : (i * (w - pad * 2) / (values.length - 1)));
      const y = h - pad - ((Number(v) || 0) * (h - pad * 2) / max);
      return [x, y];
    });
    const line = pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const area = (line ? (pad + ',' + (h - pad) + ' ' + line + ' ' + (w - pad) + ',' + (h - pad)) : '');
    const id = 'g' + Math.random().toString(16).slice(2);
    const stroke = accent || '#2563eb';
    return '<svg class="cz-spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<defs>' +
        '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="' + stroke + '" stop-opacity="0.22"/>' +
          '<stop offset="1" stop-color="' + stroke + '" stop-opacity="0"/>' +
        '</linearGradient>' +
      '</defs>' +
      (area ? '<polygon points="' + area + '" fill="url(#' + id + ')"/>' : '') +
      (line ? '<polyline points="' + line + '" fill="none" stroke="' + stroke + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' : '') +
    '</svg>';
  };

  window.render = (ctx) => {
    const data = ctx && ctx.data ? ctx.data : {};
    const params = ctx && ctx.params ? ctx.params : {};
    const state = getState();
    state.lastCtx = ctx;
    const root = ctx && ctx.root ? ctx.root : document.getElementById('root');
    if (!root) return;

    const title = safeString(params.title, 'Dashboard');
    const accent = safeString(params.accent, '#2563eb');
    const topApps = Math.max(3, Math.min(12, Number(params.topApps) || 6));
    const topKeys = Math.max(6, Math.min(20, Number(params.topKeys) || 10));
    const sparkDays = Math.max(7, Math.min(30, Number(params.sparkDays) || 14));

    if (!state.mounted) {
      state.mounted = true;
      ensureViewSwitchListener(root, state);
    }
    ensureViewSwitchListener(root, state);

    const stats = data.stats || null;
    const days = pickDays(data);
    const total = days.reduce((acc, d) => acc + (Number(d && d.total) || 0), 0);
    const keyboard = days.reduce((acc, d) => acc + (Number(d && d.keyboard) || 0), 0);
    const mouse = days.reduce((acc, d) => acc + (Number(d && d.mouse_single) || 0), 0);
    const activeHours = Array.isArray(data.aggregates && data.aggregates.hourly)
      ? data.aggregates.hourly.filter((b) => (b && (b.total || 0)) > 0).length
      : 0;

    const subtitleParts = [];
    if (stats && stats.today && stats.today.date) subtitleParts.push(String(stats.today.date));
    subtitleParts.push((data.range === 'all') ? 'Cumulative' : 'Today');
    subtitleParts.push('Active hours ' + activeHours);

    const titleEl = root.querySelector('#czTitle');
    const subEl = root.querySelector('#czSubtitle');
    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = subtitleParts.join(' · ');

    // KPIs
    const kpisEl = root.querySelector('#czKpis');
    if (kpisEl) {
      const kbShare = pct(ctx, keyboard, total);
      const msShare = pct(ctx, mouse, total);
      const modeTotal = (data.range === 'all' && stats && typeof stats.total_merit === 'number') ? stats.total_merit : total;
      kpisEl.innerHTML = '' +
        '<div class="cz-kpi">' +
          '<div class="cz-kpi-label">Merit</div>' +
          '<div class="cz-kpi-value">' + fmt(ctx, modeTotal) + '</div>' +
          '<div class="cz-kpi-sub">' + ((data.range === 'all') ? 'Lifetime total' : 'Today total') + '</div>' +
        '</div>' +
        '<div class="cz-kpi">' +
          '<div class="cz-kpi-label">Keyboard</div>' +
          '<div class="cz-kpi-value">' + fmt(ctx, keyboard) + '</div>' +
          '<div class="cz-kpi-sub">' + Math.round(kbShare * 100) + '% share</div>' +
        '</div>' +
        '<div class="cz-kpi">' +
          '<div class="cz-kpi-label">Click</div>' +
          '<div class="cz-kpi-value">' + fmt(ctx, mouse) + '</div>' +
          '<div class="cz-kpi-sub">' + Math.round(msShare * 100) + '% share</div>' +
        '</div>' +
        '<div class="cz-kpi">' +
          '<div class="cz-kpi-label">Active Hours</div>' +
          '<div class="cz-kpi-value">' + fmt(ctx, activeHours) + '</div>' +
          '<div class="cz-kpi-sub">Hours with activity</div>' +
        '</div>';
    }

    // Controls active state
    try {
      const chips = root.querySelectorAll('button[data-view]');
      for (const c of chips) {
        const v = c.getAttribute('data-view');
        if (v === state.view) c.classList.add('is-active');
        else c.classList.remove('is-active');
      }
    } catch {}

    const mainEl = root.querySelector('#czMain');
    const sideEl = root.querySelector('#czSide');
    const footerEl = root.querySelector('#czFooter');

    // Side: sparkline (uses all days to better demonstrate the API)
    const allAsc = sortDaysAsc(data.allDays || []);
    const last = allAsc.slice(Math.max(0, allAsc.length - sparkDays));
    const sparkValues = last.map((d) => Number(d && d.total) || 0);
    const sparkTitle = (sparkValues.length > 1) ? ('Last ' + sparkValues.length + ' days') : 'Trend';
    const sparkSvg = buildSparkSvg(sparkValues, accent);
    if (sideEl) {
      const sumLast = sparkValues.reduce((a, b) => a + (Number(b) || 0), 0);
      sideEl.innerHTML = '' +
        '<div class="cz-card-title">' +
          '<h3>' + sparkTitle + '</h3>' +
          '<div class="cz-hint">' + fmt(ctx, sumLast) + '</div>' +
        '</div>' +
        sparkSvg +
        '<div class="cz-legend"><span>Tip: edit params to customize</span><span style="color:' + accent + '">accent</span></div>';
    }

    // Main: switch by view
    if (mainEl) {
      if (state.view === 'apps') {
        const counts = data.aggregates && data.aggregates.appInputCounts ? data.aggregates.appInputCounts : {};
        const entries = Object.entries(counts).map(([id, v]) => {
          const name = (v && v.name) ? String(v.name) : id;
          const total = Number(v && v.total) || 0;
          return { id, name, total };
        }).filter((x) => x.total > 0).sort((a, b) => b.total - a.total).slice(0, topApps);
        const max = Math.max(1, ...entries.map((x) => x.total));
        const rows = entries.map((x) => {
          const p = pct(ctx, x.total, max);
          return '' +
            '<div>' +
              '<div class="cz-row">' +
                '<div class="cz-row-name" title="' + x.name.replace(/"/g, '&quot;') + '">' + x.name + '</div>' +
                '<div class="cz-row-meta">' + fmt(ctx, x.total) + '</div>' +
              '</div>' +
              '<div class="cz-meter" style="--p:' + (p * 100).toFixed(2) + '"><span></span></div>' +
            '</div>';
        }).join('');
        mainEl.innerHTML = '' +
          '<div class="cz-card-title"><h3>Top Apps</h3><div class="cz-hint">Top ' + topApps + '</div></div>' +
          '<div class="cz-list">' + (rows || '<div class="cz-legend">No app attribution data yet.</div>') + '</div>';
      } else if (state.view === 'keys') {
        const keyCounts = (data.aggregates && data.aggregates.keyCountsAll) ? data.aggregates.keyCountsAll : {};
        const keys = Object.entries(keyCounts).sort(byValueDesc).slice(0, topKeys);
        const totalKeys = keys.reduce((a, [, v]) => a + (Number(v) || 0), 0);
        const chips = keys.map(([k, v]) => {
          return '<span class="cz-key"><b>' + keyLabel(k) + '</b> ' + fmt(ctx, v) + '</span>';
        }).join('');
        mainEl.innerHTML = '' +
          '<div class="cz-card-title"><h3>Top Keys</h3><div class="cz-hint">' + fmt(ctx, totalKeys) + ' in Top</div></div>' +
          '<div class="cz-chips">' + (chips || '<span class="cz-legend">No key data yet.</span>') + '</div>' +
          '<div class="cz-legend"><span>Source: aggregates.keyCountsAll</span><span>Top ' + topKeys + '</span></div>';
      } else {
        const hourly = Array.isArray(data.aggregates && data.aggregates.hourly) ? data.aggregates.hourly : [];
        const max = Math.max(1, ...hourly.map((b) => Number(b && b.total) || 0));
        let peak = { hour: 0, v: 0 };
        for (let i = 0; i < hourly.length; i++) {
          const v = Number(hourly[i] && hourly[i].total) || 0;
          if (v >= peak.v) peak = { hour: i, v };
        }
        const bars = [];
        for (let i = 0; i < 24; i++) {
          const v = Number(hourly[i] && hourly[i].total) || 0;
          const h = pct(ctx, v, max) * 100;
          const cls = (i === peak.hour && peak.v > 0) ? 'cz-bar is-peak' : 'cz-bar';
          const tip = String(i).padStart(2, '0') + ':00 · ' + fmt(ctx, v);
          bars.push('<div class="' + cls + '" style="--h:' + h.toFixed(2) + '" title="' + tip.replace(/"/g, '&quot;') + '"></div>');
        }
        mainEl.innerHTML = '' +
          '<div class="cz-card-title"><h3>Hourly Rhythm</h3><div class="cz-hint">Peak ' + String(peak.hour).padStart(2, '0') + ':00</div></div>' +
          '<div class="cz-hourly">' + bars.join('') + '</div>' +
          '<div class="cz-legend"><span>Hover bars for details</span><span>Max ' + fmt(ctx, max) + '</span></div>';
      }
    }

    if (footerEl) {
      const date = (stats && stats.today && stats.today.date) ? String(stats.today.date) : '';
      footerEl.innerHTML = '' +
        '<span>Data: ' + safeString(date, '—') + '</span>' +
        '<span>Range: ' + ((data.range === 'all') ? 'all' : 'today') + ' · Accent: <span style="color:' + accent + '">' + accent + '</span></span>';
    }
  };
})();
`

export const CUSTOM_TEMPLATE_EXAMPLES: CustomTemplateExample[] = [
  {
    id: 'simple_today_total',
    titleKey: 'customStatistics.customTemplates.examples.simple.title',
    descriptionKey: 'customStatistics.customTemplates.examples.simple.description',
    template: {
      height_px: null,
      html: SIMPLE_HTML,
      css: '',
      js: SIMPLE_JS,
      params: {},
    },
  },
  {
    id: 'dashboard_v1',
    titleKey: 'customStatistics.customTemplates.examples.dashboard.title',
    descriptionKey: 'customStatistics.customTemplates.examples.dashboard.description',
    template: {
      height_px: null,
      html: DASHBOARD_HTML,
      css: DASHBOARD_CSS,
      js: DASHBOARD_JS,
      params: {
        title: 'CyberZen · Dashboard',
        topApps: 6,
        topKeys: 10,
        sparkDays: 14,
        accent: '#2563eb',
      },
    },
  },
]

export const DEFAULT_CUSTOM_TEMPLATE_EXAMPLE_ID: CustomTemplateExampleId = 'simple_today_total'

export function getCustomTemplateExample(id: string | null | undefined): CustomTemplateExample | null {
  if (!id) return null
  return CUSTOM_TEMPLATE_EXAMPLES.find((e) => e.id === id) ?? null
}
