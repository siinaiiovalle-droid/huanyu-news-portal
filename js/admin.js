/**
 * 内容运营后台 —— 采集 / 审核 / 发布 / 运营一体化
 * 依赖：common.js 的 HY.toast / HY.escapeHtml / HY.fmtNum
 */
(function () {
  'use strict';

  const tokenKey = 'hy_admin_token';
  let token = localStorage.getItem(tokenKey) || '';
  let profile = null;
  let channels = [];
  let currentView = 'dashboard';
  let inboxPage = 1;
  let newsPage = 1;
  let postsPage = 1;
  let commentsPage = 1;
  let imagesPage = 1;
  let editingId = '';
  let blocks = [];

  const $ = (id) => document.getElementById(id);
  const esc = (s) => (window.HY && HY.escapeHtml ? HY.escapeHtml(s) : String(s == null ? '' : s));
  const num = (n) => (window.HY && HY.fmtNum ? HY.fmtNum(n) : String(n || 0));
  const toast = (msg, type) => (window.HY && HY.toast ? HY.toast(msg, type) : alert(msg));

  /* ------------------------------ 请求 ------------------------------ */

  async function req(path, options = {}) {
    const res = await fetch(path, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    // 令牌失效（服务重启、换了浏览器配置）必须显式回到登录页：
    // 否则页面一直停在已登录的样子，按钮点了全是 401，看起来就像"功能坏了"
    if (res.status === 401) {
      const err = new Error('登录已过期，请重新登录');
      err.status = 401;
      showLoginView(err.message);
      throw err;
    }
    let json = null;
    try { json = await res.json(); } catch (e) { throw new Error('服务响应异常'); }
    if (!json || json.code !== 0) {
      const err = new Error((json && json.message) || '请求失败');
      err.status = res.status;
      throw err;
    }
    return json.data;
  }

  /** 回到登录页：顺手解锁采集按钮、停掉进度轮询，避免卡在"采集中…" */
  function showLoginView(msg) {
    if (collectTimer) { clearInterval(collectTimer); collectTimer = null; }
    lockCollectButtons(false);
    token = '';
    localStorage.removeItem(tokenKey);
    $('login-view').style.display = '';
    $('shell').style.display = 'none';
    if (msg) $('login-err').textContent = msg;
  }

  function fmt(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function ago(iso) {
    if (!iso) return '-';
    const diff = Date.now() - new Date(iso).getTime();
    if (Number.isNaN(diff)) return '-';
    const h = Math.floor(diff / 3600000);
    if (h < 1) return `${Math.max(1, Math.floor(diff / 60000))} 分钟前`;
    if (h < 24) return `${h} 小时前`;
    return `${Math.floor(h / 24)} 天前`;
  }

  function renderPager(el, pg, onGo) {
    if (!el || !pg) return;
    if (pg.totalPages <= 1) { el.innerHTML = ''; return; }
    let html = `<button class="page-btn" data-page="${pg.page - 1}" ${pg.page <= 1 ? 'disabled' : ''}>上一页</button>`;
    const start = Math.max(1, pg.page - 2);
    const end = Math.min(pg.totalPages, start + 4);
    for (let i = start; i <= end; i++) {
      html += `<button class="page-btn${i === pg.page ? ' active' : ''}" data-page="${i}">${i}</button>`;
    }
    html += `<button class="page-btn" data-page="${pg.page + 1}" ${pg.page >= pg.totalPages ? 'disabled' : ''}>下一页</button>`;
    html += `<span class="page-info">共 ${pg.total} 条 / ${pg.totalPages} 页</span>`;
    el.innerHTML = html;
    el.querySelectorAll('button[data-page]').forEach((b) => {
      b.onclick = () => onGo(Number(b.dataset.page));
    });
  }

  /* ------------------------------ 弹窗 ------------------------------ */

  function openModal(title, bodyHtml, buttons = []) {
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = bodyHtml;
    const foot = $('modal-foot');
    foot.innerHTML = '';
    (buttons || []).forEach((b) => {
      const btn = document.createElement('button');
      btn.className = `btn sm ${b.className || 'ghost'}`;
      btn.textContent = b.text;
      btn.onclick = b.onClick;
      foot.appendChild(btn);
    });
    $('modal-mask').style.display = 'flex';
  }

  function closeModal() { $('modal-mask').style.display = 'none'; }

  /* ------------------------------ 登录 ------------------------------ */

  async function boot() {
    try {
      channels = await req('./api/v1/channels');
    } catch (e) {
      channels = [];
    }
    fillChannelSelects();
    // 若定时任务/别人正在采集，一进后台就把按钮锁住并跟进度
    syncCollectState();

    if (token) {
      try {
        profile = await req('./api/v1/admin/me');
        enterShell();
        return;
      } catch (e) {
        token = '';
        localStorage.removeItem(tokenKey);
      }
    }
    $('login-view').style.display = '';
    $('shell').style.display = 'none';
    $('login-err').textContent = '';
  }

  async function login() {
    const username = $('login-user').value.trim();
    const password = $('login-pass').value;
    if (!username || !password) { $('login-err').textContent = '请输入账号和密码'; return; }
    try {
      const data = await req('./api/v1/admin/login', { method: 'POST', body: { username, password } });
      token = data.token;
      profile = data.account;
      localStorage.setItem(tokenKey, token);
      $('login-err').textContent = '';
      enterShell();
    } catch (e) {
      $('login-err').textContent = e.message;
    }
  }

  function enterShell() {
    $('login-view').style.display = 'none';
    $('shell').style.display = '';
    $('who-name').textContent = `${profile.name || profile.username}（${profile.role === 'admin' ? '管理员' : '编辑'}）`;
    const hash = (location.hash || '').replace('#/', '');
    go(hash || 'dashboard');
    setInterval(refreshBadge, 60000);
  }

  function logout() {
    token = '';
    localStorage.removeItem(tokenKey);
    location.reload();
  }

  /* ------------------------------ 视图切换 ------------------------------ */

  const TITLES = {
    dashboard: '运营概览', inbox: '采集审核池', sources: '采集源管理', automation: '自动化规则',
    news: '稿件管理', images: '图库管理', editor: '撰写稿件', ranks: '榜单运营', social: '广场与评论',
    logs: '任务日志', accounts: '账号管理', settings: '站点设置'
  };

  function go(view) {
    currentView = view;
    document.querySelectorAll('#menu a').forEach((a) => {
      a.classList.toggle('active', a.dataset.view === view);
    });
    document.querySelectorAll('section[id^="view-"]').forEach((s) => { s.style.display = 'none'; });
    const sec = $(`view-${view}`);
    if (sec) sec.style.display = '';
    $('view-title').textContent = TITLES[view] || '运营概览';
    location.hash = `#/${view}`;

    if (view === 'dashboard') loadDashboard();
    if (view === 'inbox') loadInbox(1);
    if (view === 'sources') loadSources();
    if (view === 'automation') loadAutomation();
    if (view === 'news') loadNews(1);
    if (view === 'images') loadImages(1);
    if (view === 'ranks') loadRanks();
    if (view === 'social') { loadPosts(1); loadComments(1); }
    if (view === 'logs') loadLogs();
    if (view === 'accounts') loadAccounts();
    if (view === 'settings') loadSettings();
  }

  async function refreshBadge() {
    try {
      const s = await req('./api/v1/admin/pipeline');
      const badge = $('badge-pending');
      if (!badge) return;
      if (s.inbox.pending > 0) {
        badge.style.display = '';
        badge.textContent = s.inbox.pending;
      } else {
        badge.style.display = 'none';
      }
    } catch (e) { /* 静默 */ }
  }

  /* ------------------------------ 概览 ------------------------------ */

  async function loadDashboard() {
    let stats = null;
    let site = null;
    try { stats = await req('./api/v1/admin/pipeline'); } catch (e) { toast(e.message); }
    try { site = await req('./api/v1/admin/stats'); } catch (e) { /* 可缺省 */ }

    if (stats) {
      const cards = [
        ['待审核内容', stats.inbox.pending, '待人工或自动处理'],
        ['今日采集', stats.inbox.todayCollected, '含自动驳回'],
        ['今日已发布', stats.inbox.todayPublished + stats.news.todayPublished, '自动 + 人工'],
        ['稿件总数', stats.news.total, `已发布 ${stats.news.published}`],
        ['草稿 / 定时', `${stats.news.drafts} / ${stats.news.scheduled}`, '未上线内容'],
        ['全站阅读量', num(stats.news.views), '累计'],
        ['采集源', stats.sources.enabled, `共 ${stats.sources.total} 个`],
        ['异常源', stats.sources.error, '最近采集失败']
      ];
      $('stat-grid').innerHTML = cards.map((c) => `
        <div class="stat-box">
          <b>${esc(c[1])}</b>
          <span>${esc(c[0])}</span>
          <small>${esc(c[2])}</small>
        </div>`).join('');

      const p = stats.pipeline;
      $('pipeline-state').innerHTML = `
        <div class="pipeline-meta">
          <span class="tag ${p.enabled ? 'tag-publish' : 'tag-mute'}">${p.enabled ? '流水线运行中' : '流水线已关闭'}</span>
          <span>准入线 ${p.minScore} 分</span>
          <span>自动发布线 ${p.autoPublishScore} 分</span>
          <span>${p.scheduleEnabled ? `每日 ${(p.times || []).join(' / ')} 自动执行` : '每日定时未开启'}</span>
          <span>下次运行：${p.nextRunAt ? fmt(p.nextRunAt) : '—'}</span>
          <span>上次运行：${p.lastRunAt ? ago(p.lastRunAt) : '从未'}</span>
        </div>`;

      const btn = $('btn-run-collect');
      if (btn) btn.textContent = '立即采集';
    }

    // 频道分布
    try {
      const counts = await Promise.all(channels.filter((c) => !c.isSocial && !c.isVideo).map(async (c) => {
        const r = await req(`./api/v1/admin/news?channel=${encodeURIComponent(c.id)}&status=published&pageSize=1`);
        return { name: c.name, total: (r && r.pagination ? r.pagination.total : 0) };
      }));
      const max = Math.max(1, ...counts.map((c) => c.total));
      $('channel-stats').innerHTML = counts.map((c) => `
        <div class="bar-row">
          <span class="bar-label">${esc(c.name)}</span>
          <span class="bar-track"><i style="width:${Math.round((c.total / max) * 100)}%"></i></span>
          <span class="bar-value">${c.total}</span>
        </div>`).join('');
    } catch (e) { /* 忽略 */ }

    try {
      const hot = await req('./api/v1/rank?type=hot&size=10');
      $('dash-hot').innerHTML = rankHtml(hot, 'views');
      const blast = await req('./api/v1/rank?type=blast&size=10');
      $('dash-blast').innerHTML = rankHtml(blast, 'deltaViews');
    } catch (e) { /* 忽略 */ }

    try {
      const runs = await req('./api/v1/admin/runs?limit=5');
      $('dash-runs').innerHTML = runs.length ? runs.map(runRow).join('') : '<p class="preview-note">暂无任务记录。</p>';
    } catch (e) { /* 忽略 */ }

    refreshBadge();
  }

  function rankHtml(list, key) {
    if (!list || !list.length) return '<p class="preview-note">暂无数据。</p>';
    return `<ol class="rank-list">${list.slice(0, 10).map((a, i) => `
      <li>
        <span class="no ${i < 3 ? 'top' : ''}">${i + 1}</span>
        <a href="./article.html?id=${encodeURIComponent(a.id)}" target="_blank">${esc(a.title)}</a>
        <em>${esc(a.channelName || '')} · ${num((a.stats && a.stats[key]) || 0)}</em>
      </li>`).join('')}</ol>`;
  }

  function runRow(r) {
    const typeName = r.type === 'collect' ? '采集' : (r.type === 'review' ? '审核' : '任务');
    const triggerName = { manual: '手动', schedule: '定时', auto: '自动' }[r.trigger] || r.trigger || '-';
    return `<div class="log-row">
      <span class="tag ${r.failed ? 'tag-reject' : 'tag-publish'}">${typeName}</span>
      <span>${triggerName}</span>
      <span>抓取 ${r.fetched || 0} · 入库 ${r.added || 0} · 重复 ${r.duplicated || 0} · 驳回 ${r.rejected || 0} · 自动发布 ${r.autoPublished || 0}</span>
      <span class="muted">${fmt(r.finishedAt || r.createdAt)}（${r.durationMs || 0}ms）</span>
    </div>`;
  }

  /* ------------------------------ 采集审核池 ------------------------------ */

  async function loadInbox(page = 1) {
    inboxPage = page;
    const params = new URLSearchParams({
      status: $('ib-status').value || '',
      channel: $('ib-channel').value || '',
      keyword: $('ib-keyword').value || '',
      sort: $('ib-sort').value || 'score',
      page: String(page),
      pageSize: '20'
    });
    try {
      const data = await req(`./api/v1/admin/inbox?${params.toString()}`);
      const tbody = $('inbox-tbody');
      if (!data.list.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty">当前筛选条件下没有内容，可点击"立即采集"拉取最新资讯。</td></tr>';
      } else {
        tbody.innerHTML = data.list.map(inboxRow).join('');
        tbody.querySelectorAll('[data-act]').forEach((btn) => {
          btn.onclick = () => inboxAction(btn.dataset.act, btn.dataset.id);
        });
      }
      $('ib-count').textContent = `共 ${data.pagination.total} 条`;
      renderPager($('inbox-pagination'), data.pagination, (p) => loadInbox(p));
      const all = $('ib-check-all');
      if (all) all.checked = false;
      refreshBadge();
    } catch (e) {
      toast(e.message);
    }
  }

  function inboxRow(d) {
    const decision = (d.auto && d.auto.decision) || 'review';
    const decisionMap = {
      publish: ['tag-publish', '建议自动发布'],
      review: ['tag-review', '待人工复核'],
      reject: ['tag-reject', '建议驳回']
    };
    const dm = decisionMap[decision] || decisionMap.review;
    const score = d.score || 0;
    const scoreClass = score >= 75 ? 'high' : (score >= 55 ? 'mid' : 'low');
    const statusMap = { pending: '待审核', approved: '已通过', published: '已发布', rejected: '已驳回' };
    const reasons = ((d.auto && d.auto.reasons) || []).join('；') || '';
    const channelName = (channels.find((c) => c.id === d.channel) || {}).name || d.channel;

    return `<tr>
      <td><input type="checkbox" class="ib-check" value="${esc(d.id)}"></td>
      <td>
        ${d.cover
          ? `<img class="ib-thumb" src="${esc(d.cover)}" alt="配图" loading="lazy">`
          : `<span class="ib-thumb ib-thumb-empty">待配图</span>`}
        <div class="row-title">${esc(d.title)}</div>
        <div class="row-meta">${esc(d.sourceName || '未知来源')} · ${esc(d.author || '')} · ${statusMap[d.status] || d.status}</div>
        <div class="row-meta">${esc((d.summary || '').slice(0, 70))}</div>
        <div class="row-tags">${(d.tags || []).slice(0, 4).map((t) => `<span class="mini-tag">${esc(t)}</span>`).join('')}</div>
      </td>
      <td>
        <span class="score ${scoreClass}">${score}</span>
        <span class="score-bar"><i style="width:${score}%"></i></span>
      </td>
      <td>${esc(channelName)}</td>
      <td>
        <span class="tag ${dm[0]}">${dm[1]}</span>
        <div class="row-meta">${esc(reasons.slice(0, 40))}</div>
      </td>
      <td>${ago(d.collectedAt || d.createdAt)}</td>
      <td class="ops-cell">
        <button class="icon-btn" data-act="preview" data-id="${esc(d.id)}">预览</button>
        ${d.status !== 'published'
          ? `<button class="icon-btn" data-act="image" data-id="${esc(d.id)}">${d.cover ? '换图' : '补图'}</button>
             <button class="icon-btn" data-act="publish" data-id="${esc(d.id)}">通过发布</button>
             <button class="icon-btn" data-act="draft" data-id="${esc(d.id)}">仅通过</button>
             <button class="icon-btn" data-act="schedule" data-id="${esc(d.id)}">定时</button>
             <button class="icon-btn danger" data-act="reject" data-id="${esc(d.id)}">驳回</button>`
          : `<a class="icon-btn" href="./article.html?id=${encodeURIComponent(d.articleId)}" target="_blank">查看</a>`}
        <button class="icon-btn danger" data-act="del" data-id="${esc(d.id)}">删除</button>
      </td>
    </tr>`;
  }

  async function inboxAction(act, id) {
    try {
      if (act === 'preview') return previewInbox(id);
      if (act === 'image') {
        toast('正在检索并下载配图，约需十几秒到一分钟…', 8000);
        const r = await req(`./api/v1/admin/inbox/${id}/image`, { method: 'POST', body: {} });
        toast(`配图已下载：${r.cover}${r.size ? `（${r.size}）` : ''}`, 5000);
      } else if (act === 'publish') {
        await req(`./api/v1/admin/inbox/${id}/approve`, { method: 'POST', body: { publish: true } });
        toast('已审核通过并发布到前台');
      } else if (act === 'draft') {
        await req(`./api/v1/admin/inbox/${id}/approve`, { method: 'POST', body: { publish: false } });
        toast('已标记为通过（待发布）');
      } else if (act === 'reject') {
        const reason = prompt('驳回原因（可留空）：', '内容质量不达标');
        if (reason === null) return;
        await req(`./api/v1/admin/inbox/${id}/reject`, { method: 'POST', body: { reason } });
        toast('已驳回');
      } else if (act === 'del') {
        if (!confirm('确认删除该条采集内容？')) return;
        await req(`./api/v1/admin/inbox/${id}`, { method: 'DELETE' });
        toast('已删除');
      } else if (act === 'schedule') {
        return scheduleInbox(id);
      }
      loadInbox(inboxPage);
    } catch (e) {
      toast(e.message);
    }
  }

  async function previewInbox(id) {
    let item = null;
    try { item = await req(`./api/v1/admin/inbox/${id}`); } catch (e) { toast(e.message); return; }
    const m = item.metrics || {};
    const paras = (item.content || []).filter((b) => b.type === 'p').map((b) => b.text);
    const body = `
      <div class="preview-block">
        <h4>${esc(item.title)}</h4>
        <p class="preview-note">${esc(item.sourceName || '')} · ${fmt(item.publishedAt)} · 原文：
          ${item.sourceUrl ? `<a href="${esc(item.sourceUrl)}" target="_blank">${esc(item.sourceUrl)}</a>` : '—'}</p>
        ${item.cover
          ? `<img src="${esc(item.cover)}" alt="配图" style="width:100%;max-width:520px;border-radius:8px;margin:8px 0;">`
          : '<p class="preview-note">（这条还没配到图，可在列表里点「补图」）</p>'}
        <div class="score-detail">
          <span>综合分 <b>${item.score || 0}</b></span>
          <span>基础分 ${m.base == null ? 30 : m.base}</span>
          <span>新鲜度 ${m.freshness || 0}/25（发布 ${m.ageHours || 0} 小时前）</span>
          <span>热点词 ${m.keywordScore || 0}/15${(m.hits || []).length ? `（命中：${esc((m.hits || []).join('、'))}）` : ''}</span>
          <span>内容完整度 ${m.quality || 0}/15</span>
          <span>源权重 ${m.weightScore || 0}/10</span>
          <span>配图与原文 ${m.media || 0}/5</span>
        </div>
        <div class="preview-text">${paras.length ? paras.map((p) => `<p>${esc(p)}</p>`).join('') : '<p>（源站未提供正文摘要）</p>'}</div>
        <div class="preview-note">自动审核结论：${esc(((item.auto && item.auto.reasons) || []).join('；') || '—')}</div>
      </div>
      <div class="edit-grid">
        <div class="field"><label>标题</label><input id="pv-title" value="${esc(item.title)}"></div>
        <div class="field"><label>频道</label><select id="pv-channel">${channels.filter((c) => !c.isSocial).map((c) => `<option value="${esc(c.id)}" ${c.id === item.channel ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>摘要</label><textarea id="pv-summary">${esc(item.summary || '')}</textarea></div>
      <div class="field"><label>定时发布（留空立即发布，格式 2026-09-16 20:00）</label><input id="pv-schedule" placeholder="2026-09-16 20:00"></div>`;

    openModal('内容预览与审核', body, [
      {
        text: '通过并发布', className: '', onClick: async () => {
          await req(`./api/v1/admin/inbox/${id}/approve`, {
            method: 'POST',
            body: { publish: true, patch: patchFromPreview() }
          });
          closeModal(); toast('已发布'); loadInbox(inboxPage);
        }
      },
      {
        text: '定时发布', className: '', onClick: async () => {
          const at = ($('pv-schedule').value || '').trim();
          if (!at) { toast('请填写定时发布时间'); return; }
          await req(`./api/v1/admin/inbox/${id}/approve`, {
            method: 'POST', body: { publish: true, publishAt: at, patch: patchFromPreview() }
          });
          closeModal(); toast('已加入定时发布队列'); loadInbox(inboxPage);
        }
      },
      {
        text: '驳回', className: 'danger', onClick: async () => {
          const reason = prompt('驳回原因：', '');
          await req(`./api/v1/admin/inbox/${id}/reject`, { method: 'POST', body: { reason: reason || '' } });
          closeModal(); toast('已驳回'); loadInbox(inboxPage);
        }
      },
      { text: '关闭', className: 'ghost', onClick: closeModal }
    ]);
  }

  function patchFromPreview() {
    const patch = {};
    const t = $('pv-title');
    const c = $('pv-channel');
    const s = $('pv-summary');
    if (t && t.value.trim()) patch.title = t.value.trim();
    if (c && c.value) patch.channel = c.value;
    if (s) patch.summary = s.value;
    return patch;
  }

  function scheduleInbox(id) {
    const at = prompt('定时发布时间（格式 2026-09-16 20:00）：', '');
    if (!at) return;
    req(`./api/v1/admin/inbox/${id}/approve`, { method: 'POST', body: { publish: true, publishAt: at } })
      .then(() => { toast('已加入定时发布队列'); loadInbox(inboxPage); })
      .catch((e) => toast(e.message));
  }

  function selectedInboxIds() {
    return Array.from(document.querySelectorAll('.ib-check:checked')).map((c) => c.value);
  }

  async function runBatch(action) {
    const ids = selectedInboxIds();
    if (!ids.length) { toast('请先勾选内容'); return; }
    if (action === 'delete' && !confirm(`确认删除 ${ids.length} 条内容？`)) return;
    let reason = '';
    if (action === 'reject') {
      reason = prompt('批量驳回原因（可留空）：', '') || '';
      if (reason === null) return;
    }
    const btns = Array.from(document.querySelectorAll('[data-batch]'));
    btns.forEach((b) => { b.disabled = true; });
    toast(`正在处理 ${ids.length} 条…`, 8000);
    try {
      const r = await req('./api/v1/admin/inbox/batch', { method: 'POST', body: { ids, action, reason } });
      let msg = `已处理 ${r.done} 条`;
      if (r.skipped) msg += `，跳过 ${r.skipped} 条（已发布过）`;
      if (r.imagesQueued && r.imagesQueued.queued) msg += `；${r.imagesQueued.queued} 篇的配图正在后台补齐`;
      toast(msg, 6000);
      loadInbox(inboxPage);
    } catch (e) {
      toast(e.message, 4000);
    } finally {
      btns.forEach((b) => { b.disabled = false; });
    }
  }

  /** 审核池当前的筛选条件，按条件批量时原样带上，保证"筛什么就处理什么" */
  function currentInboxFilter() {
    return {
      status: $('ib-status').value || '',
      channel: $('ib-channel').value || '',
      keyword: $('ib-keyword').value || '',
      sort: $('ib-sort').value || 'score'
    };
  }

  async function runBatchByFilter({ action, limit, minScore = 0, maxScore = 0, reason = '' }) {
    try {
      const r = await req('./api/v1/admin/inbox/batch-by-filter', {
        method: 'POST',
        body: { ...currentInboxFilter(), action, limit, minScore, maxScore, reason }
      });
      let msg = `命中 ${r.matched} 条，已处理 ${r.done} 条`;
      if (r.skipped) msg += `，跳过 ${r.skipped} 条`;
      if (r.imagesQueued && r.imagesQueued.queued) msg += `；${r.imagesQueued.queued} 篇的配图正在后台补齐`;
      toast(msg, 6000);
      loadInbox(1);
      loadDashboard();
    } catch (e) {
      toast(e.message, 4000);
    }
  }

  /** 一键发掉当前筛选里分值最高的若干条 */
  async function batchTop() {
    const n = Number(prompt('按当前筛选条件，通过并发布分值最高的多少条？', '20'));
    if (!Number.isFinite(n) || n <= 0) return;
    if (!confirm(`确认发布分值最高的 ${n} 条？发布后配图会在后台自动补齐。`)) return;
    await runBatchByFilter({ action: 'approve', limit: n });
  }

  /** 一键清掉当前筛选里低于分值线的条目，避免池子越堆越大 */
  async function batchLow() {
    const line = Number(prompt('驳回分值不高于多少的内容？（默认取准入线 55）', '55'));
    if (!Number.isFinite(line)) return;
    if (!confirm(`确认驳回当前筛选下分值 ≤ ${line} 的全部内容？`)) return;
    await runBatchByFilter({ action: 'reject', limit: 500, maxScore: line, reason: `低于 ${line} 分批量清理` });
  }

  /* ------------------------------ 采集（含同步下载配图） ------------------------------ */

  /**
   * 一次采集要把内容和配图一起跑完，跑完前不允许再点第二下：
   * 两个「立即采集」按钮同时锁住，并按服务端返回的进度刷新文案（下载配图 3/12）。
   */
  let collectTimer = null;
  let collectWasRunning = false;

  function lockCollectButtons(locked, text) {
    ['btn-run-collect', 'ib-collect'].forEach((id) => {
      const b = $(id);
      if (!b) return;
      b.disabled = !!locked;
      b.textContent = locked ? (text || '采集中…') : '立即采集';
      b.style.opacity = locked ? '0.55' : '';
      b.style.cursor = locked ? 'not-allowed' : '';
    });
  }

  let collectPollFail = 0;

  async function syncCollectState() {
    let s = null;
    try {
      s = await req('./api/v1/admin/pipeline/status');
      collectPollFail = 0;
    } catch (e) {
      // 服务重启或断网时轮询会一直失败；不设上限的话按钮将永远锁在"采集中…"
      collectPollFail += 1;
      if (collectPollFail >= 5) {
        collectPollFail = 0;
        if (collectTimer) { clearInterval(collectTimer); collectTimer = null; }
        lockCollectButtons(false);
        toast('采集进度获取失败，已解除锁定，可重新点击「立即采集」', 5000);
      }
      return;
    }
    const img = s.images || {};
    const text = img.total ? `下载配图 ${img.done}/${img.total}…` : (s.stageText || '采集中…');
    lockCollectButtons(!!s.running, text);
    if (s.running && !collectTimer) collectTimer = setInterval(syncCollectState, 3000);
    if (!s.running && collectTimer) {
      clearInterval(collectTimer);
      collectTimer = null;
    }
    // 跑完的那一刻刷新列表，让新内容和刚下好的配图直接显示出来
    if (collectWasRunning && !s.running) {
      loadInbox(inboxPage);
      loadDashboard();
    }
    collectWasRunning = !!s.running;
  }

  async function triggerCollect() {
    if (!confirm('将按已启用的采集源拉取最新内容、自动审核，并同步下载配图（配图下载完成前不能再次采集），是否继续？')) return;
    lockCollectButtons(true, '采集中…');
    collectWasRunning = true;
    try {
      const r = await req('./api/v1/admin/pipeline/collect', { method: 'POST', body: {} });
      const im = r.images || {};
      const imgText = (im.filled || im.failed)
        ? `，下载配图 ${im.filled} 张${im.failed ? `（${im.failed} 条没配上，可在列表里单独点「补图」）` : ''}`
        : '';
      toast(`采集完成：抓取 ${r.fetched} 条，入库 ${r.added} 条，自动发布 ${r.autoPublished} 条${imgText}`, 8000);
      lockCollectButtons(false);
      loadInbox(1);
      loadDashboard();
    } catch (e) {
      // 上一轮还没跑完（409）：按钮保持锁定，继续跟进度
      if (e.status === 409 || /还没跑完/.test(e.message)) {
        toast(e.message, 4000);
        if (!collectTimer) collectTimer = setInterval(syncCollectState, 3000);
        return;
      }
      lockCollectButtons(false);
      toast(e.message, 5000);
    }
  }

  /* ------------------------------ 采集源 ------------------------------ */

  async function loadSources() {
    try {
      const list = await req('./api/v1/admin/sources');
      const tbody = $('sources-tbody');
      if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty">还没有采集源，点击"新增采集源"开始。</td></tr>';
        return;
      }
      tbody.innerHTML = list.map((s) => {
        const channelName = (channels.find((c) => c.id === s.channel) || {}).name || s.channel;
        const st = s.lastStatus === 'ok'
          ? `<span class="tag tag-publish">正常（${s.lastCount || 0} 条）</span>`
          : (s.lastStatus === 'error' ? '<span class="tag tag-reject">失败</span>' : '<span class="tag tag-mute">未运行</span>');
        return `<tr>
          <td>
            <div class="row-title">${esc(s.name)}</div>
            <div class="row-meta">${(s.tags || []).map((t) => esc(t)).join(' / ') || '无标签'}</div>
            ${s.lastError ? `<div class="row-meta err">${esc(s.lastError)}</div>` : ''}
          </td>
          <td>${esc(channelName)}</td>
          <td><div class="row-url">${esc(s.url)}</div></td>
          <td>${esc(s.weight || 1)}</td>
          <td>${esc(s.limit || 5)}</td>
          <td>
            ${st}
            <div class="row-meta">${s.lastRunAt ? ago(s.lastRunAt) : '—'}</div>
            <div class="row-meta">${s.enabled === false ? '已停用' : '已启用'}</div>
          </td>
          <td class="ops-cell">
            <button class="icon-btn" data-src="test" data-id="${esc(s.id)}">测试</button>
            <button class="icon-btn" data-src="collect" data-id="${esc(s.id)}">采集</button>
            <button class="icon-btn" data-src="edit" data-id="${esc(s.id)}">编辑</button>
            <button class="icon-btn" data-src="toggle" data-id="${esc(s.id)}">${s.enabled === false ? '启用' : '停用'}</button>
            <button class="icon-btn danger" data-src="del" data-id="${esc(s.id)}">删除</button>
          </td>
        </tr>`;
      }).join('');
      tbody.querySelectorAll('[data-src]').forEach((btn) => {
        btn.onclick = () => sourceAction(btn.dataset.src, btn.dataset.id);
      });
    } catch (e) {
      toast(e.message);
    }
  }

  async function sourceAction(act, id) {
    try {
      if (act === 'test') {
        toast('正在测试采集源…');
        const r = await req(`./api/v1/admin/sources/${id}/test`, { method: 'POST', body: {} });
        toast(r.ok ? `采集正常，抓到 ${r.count} 条内容` : `采集失败：${r.error || '未知错误'}`);
      } else if (act === 'collect') {
        toast('正在采集…');
        const r = await req(`./api/v1/admin/sources/${id}/collect`, { method: 'POST', body: {} });
        toast(`完成：入库 ${r.added} 条，自动发布 ${r.autoPublished} 条`);
      } else if (act === 'edit') {
        const s = (await req('./api/v1/admin/sources')).find((x) => x.id === id);
        openSourceModal(s);
      } else if (act === 'toggle') {
        const s = (await req('./api/v1/admin/sources')).find((x) => x.id === id);
        await req(`./api/v1/admin/sources/${id}`, { method: 'PUT', body: { enabled: s.enabled === false } });
        toast(s.enabled === false ? '已启用' : '已停用');
      } else if (act === 'del') {
        if (!confirm('确认删除该采集源？')) return;
        await req(`./api/v1/admin/sources/${id}`, { method: 'DELETE' });
        toast('已删除');
      }
      loadSources();
    } catch (e) {
      toast(e.message);
    }
  }

  function openSourceModal(source) {
    const s = source || { name: '', channel: 'china', url: '', tags: [], weight: 1, limit: 5, status: 'draft', enabled: true };
    const body = `
      <div class="field"><label>源名称</label><input id="sf-name" value="${esc(s.name)}" placeholder="如：新华网 国内要闻"></div>
      <div class="field"><label>采集地址（RSS / Atom）</label><input id="sf-url" value="${esc(s.url)}" placeholder="https://.../rss"></div>
      <div class="edit-grid">
        <div class="field"><label>归属频道</label><select id="sf-channel">${channels.filter((c) => !c.isSocial && !c.isVideo).map((c) => `<option value="${esc(c.id)}" ${c.id === s.channel ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>权重（1-2，影响热度评分）</label><input type="number" id="sf-weight" min="1" max="2" step="0.5" value="${esc(s.weight || 1)}"></div>
      </div>
      <div class="edit-grid">
        <div class="field"><label>单轮采集条数</label><input type="number" id="sf-limit" min="1" max="30" value="${esc(s.limit || 5)}"></div>
        <div class="field"><label>入库状态</label><select id="sf-status">
          <option value="draft" ${s.status === 'draft' ? 'selected' : ''}>草稿（需人工复核）</option>
          <option value="published" ${s.status === 'published' ? 'selected' : ''}>直接进入待审池</option>
        </select></div>
      </div>
      <div class="field"><label>标签（逗号分隔）</label><input id="sf-tags" value="${esc((s.tags || []).join(','))}" placeholder="时政,民生"></div>
      <div class="switch-row"><span>启用该源</span><label class="switch"><input type="checkbox" id="sf-enabled" ${s.enabled === false ? '' : 'checked'}><span></span></label></div>`;

    openModal(source ? '编辑采集源' : '新增采集源', body, [
      {
        text: '保存', onClick: async () => {
          const payload = {
            name: $('sf-name').value.trim(),
            url: $('sf-url').value.trim(),
            channel: $('sf-channel').value,
            weight: Number($('sf-weight').value) || 1,
            limit: Number($('sf-limit').value) || 5,
            status: $('sf-status').value,
            tags: $('sf-tags').value.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
            enabled: $('sf-enabled').checked
          };
          try {
            if (source) await req(`./api/v1/admin/sources/${source.id}`, { method: 'PUT', body: payload });
            else await req('./api/v1/admin/sources', { method: 'POST', body: payload });
            closeModal(); toast('已保存'); loadSources();
          } catch (e) { toast(e.message); }
        }
      },
      { text: '取消', className: 'ghost', onClick: closeModal }
    ]);
  }

  /* ------------------------------ 自动化规则 ------------------------------ */

  async function loadAutomation() {
    try {
      const s = await req('./api/v1/admin/pipeline/settings');
      $('p-enabled').checked = !!s.enabled;
      $('p-autoReview').checked = !!s.autoReview;
      $('p-autoPublish').checked = !!s.autoPublish;
      $('p-autoFlag').checked = !!s.autoFlag;
      $('p-scheduleEnabled').checked = !!(s.schedule && s.schedule.enabled);
      $('p-times').value = (s.schedule && s.schedule.times || []).join(',');
      $('p-collectLimit').value = (s.schedule && s.schedule.collectLimit) || 0;
      $('p-proxy').value = s.proxy || '';
      $('p-minScore').value = s.minScore;
      $('p-autoPublishScore').value = s.autoPublishScore;
      $('p-maxPublishPerRun').value = s.maxPublishPerRun;
      $('p-maxAgeHours').value = s.maxAgeHours;
      $('p-minTitleLen').value = s.minTitleLen;
      $('p-minContentLen').value = s.minContentLen;
      $('p-headlineTopN').value = s.headlineTopN;
      $('p-focusTopN').value = s.focusTopN;
      $('p-imagePool').checked = s.imagePool !== false;
      $('p-imagePerRun').value = s.imagePerRun || 12;
      $('p-imageRoundSec').value = Math.round((s.imageRoundMs || 150000) / 1000);
      $('p-blockKeywords').value = (s.blockKeywords || []).join(',');
      $('p-boostKeywords').value = (s.boostKeywords || []).join(',');
    } catch (e) {
      toast(e.message);
    }
  }

  async function saveAutomation() {
    const payload = {
      enabled: $('p-enabled').checked,
      autoReview: $('p-autoReview').checked,
      autoPublish: $('p-autoPublish').checked,
      autoFlag: $('p-autoFlag').checked,
      minScore: Number($('p-minScore').value),
      autoPublishScore: Number($('p-autoPublishScore').value),
      maxPublishPerRun: Number($('p-maxPublishPerRun').value),
      maxAgeHours: Number($('p-maxAgeHours').value),
      minTitleLen: Number($('p-minTitleLen').value),
      minContentLen: Number($('p-minContentLen').value),
      headlineTopN: Number($('p-headlineTopN').value),
      focusTopN: Number($('p-focusTopN').value),
      imagePool: $('p-imagePool').checked,
      imagePerRun: Number($('p-imagePerRun').value) || 12,
      imageRoundMs: (Number($('p-imageRoundSec').value) || 150) * 1000,
      proxy: $('p-proxy').value.trim(),
      blockKeywords: $('p-blockKeywords').value.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean),
      boostKeywords: $('p-boostKeywords').value.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean),
      schedule: {
        enabled: $('p-scheduleEnabled').checked,
        times: $('p-times').value.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
        collectLimit: Number($('p-collectLimit').value) || 0
      }
    };
    try {
      await req('./api/v1/admin/pipeline/settings', { method: 'PUT', body: payload });
      toast('规则已保存，下次采集生效');
    } catch (e) {
      toast(e.message);
    }
  }

  /* ------------------------------ 稿件管理 ------------------------------ */

  async function loadNews(page = 1) {
    newsPage = page;
    const params = new URLSearchParams({
      keyword: $('filter-keyword').value || '',
      channel: $('filter-channel').value || '',
      status: $('filter-status').value || '',
      origin: $('filter-origin').value || '',
      page: String(page),
      pageSize: '20'
    });
    try {
      const data = await req(`./api/v1/admin/news?${params.toString()}`);
      const tbody = $('news-tbody');
      if (!data.list.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty">暂无稿件。</td></tr>';
      } else {
        tbody.innerHTML = data.list.map(newsRow).join('');
        tbody.querySelectorAll('[data-news]').forEach((btn) => {
          btn.onclick = () => newsAction(btn.dataset.news, btn.dataset.id);
        });
      }
      renderPager($('news-pagination'), data.pagination, (p) => loadNews(p));
    } catch (e) {
      toast(e.message);
    }
  }

  function newsRow(a) {
    const f = a.flags || {};
    const flagTags = [
      f.headline ? '<span class="mini-tag hot">头条</span>' : '',
      f.focus ? '<span class="mini-tag">焦点</span>' : '',
      f.top ? '<span class="mini-tag">置顶</span>' : '',
      (a.origin === 'pipeline') ? '<span class="mini-tag">采集</span>' : ''
    ].join('');
    const statusMap = { published: ['tag-publish', '已发布'], draft: ['tag-mute', '草稿'], scheduled: ['tag-review', '定时待发布'], deleted: ['tag-reject', '已下线'] };
    const sm = statusMap[a.status] || statusMap.draft;
    return `<tr>
      <td>
        <div class="row-title">${esc(a.title)}</div>
        <div class="row-meta">${esc(a.author || '')} · ${esc(a.source || '')} · ${esc((a.tags || []).slice(0, 3).join(' / '))}</div>
        <div class="row-tags">${flagTags}</div>
      </td>
      <td>${esc(a.channelName || '')}</td>
      <td><span class="tag ${sm[0]}">${sm[1]}</span></td>
      <td>阅读 ${num((a.stats && a.stats.views) || 0)}<br>评论 ${num((a.stats && a.stats.comments) || 0)}</td>
      <td>${a.status === 'scheduled' ? `定时 ${fmt(a.scheduledAt)}` : fmt(a.publishedAt)}</td>
      <td class="ops-cell">
        <button class="icon-btn" data-news="edit" data-id="${esc(a.id)}">编辑</button>
        <a class="icon-btn" href="./article.html?id=${encodeURIComponent(a.id)}" target="_blank">查看</a>
        ${a.status !== 'published'
          ? `<button class="icon-btn" data-news="publish" data-id="${esc(a.id)}">发布</button>`
          : `<button class="icon-btn" data-news="offline" data-id="${esc(a.id)}">下线</button>`}
        <button class="icon-btn" data-news="headline" data-id="${esc(a.id)}">${f.headline ? '取消头条' : '设为头条'}</button>
        <button class="icon-btn" data-news="focus" data-id="${esc(a.id)}">${f.focus ? '取消焦点' : '加入焦点'}</button>
        <button class="icon-btn danger" data-news="del" data-id="${esc(a.id)}">删除</button>
      </td>
    </tr>`;
  }

  async function newsAction(act, id) {
    try {
      if (act === 'edit') return openEditor(id);
      if (act === 'del') {
        if (!confirm('确认删除该稿件？删除后前台不可访问。')) return;
        await req(`./api/v1/admin/news/${id}`, { method: 'DELETE' });
        toast('已删除');
      } else if (act === 'publish') {
        await req(`./api/v1/admin/news/${id}/publish`, { method: 'POST', body: {} });
        toast('已发布');
      } else if (act === 'offline') {
        await req(`./api/v1/admin/news/${id}`, { method: 'PUT', body: { status: 'draft' } });
        toast('已下线（转为草稿）');
      } else if (act === 'headline' || act === 'focus') {
        const a = await req(`./api/v1/admin/news/${id}`);
        const f = a.flags || {};
        const patch = { flags: { ...f } };
        if (act === 'headline') { patch.flags.headline = !f.headline; patch.flags.headlineOrder = patch.flags.headline ? 1 : 0; }
        if (act === 'focus') patch.flags.focus = !f.focus;
        await req(`./api/v1/admin/news/${id}`, { method: 'PUT', body: patch });
        toast('运营位已更新');
      }
      loadNews(newsPage);
    } catch (e) {
      toast(e.message);
    }
  }

  /* ------------------------------ 编辑器 ------------------------------ */

  function fillChannelSelects() {
    const options = channels.filter((c) => !c.isSocial && !c.isVideo)
      .map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    ['filter-channel', 'ib-channel', 'f-channel'].forEach((id) => {
      const el = $(id);
      if (!el) return;
      const first = el.querySelector('option');
      el.innerHTML = (first && first.value === '' ? first.outerHTML : '<option value="">全部频道</option>') + options;
    });
  }

  function renderBlocks() {
    const box = $('block-editor');
    if (!box) return;
    box.innerHTML = blocks.map((b, i) => {
      const head = `<div class="block-head">
        <span class="block-type">${blockName(b.type)}</span>
        <button class="icon-btn" data-move="-1" data-i="${i}">↑</button>
        <button class="icon-btn" data-move="1" data-i="${i}">↓</button>
        <button class="icon-btn danger" data-del="${i}">删除</button>
      </div>`;
      let body = '';
      if (b.type === 'image') {
        body = `<input class="block-input" data-f="src" data-i="${i}" placeholder="图片地址 URL" value="${esc(b.src || '')}">
                <input class="block-input" data-f="caption" data-i="${i}" placeholder="图注（可选）" value="${esc(b.caption || '')}">`;
      } else if (b.type === 'video') {
        body = `<input class="block-input" data-f="src" data-i="${i}" placeholder="视频地址 URL" value="${esc(b.src || '')}">
                <input class="block-input" data-f="poster" data-i="${i}" placeholder="视频封面 URL" value="${esc(b.poster || '')}">
                <input class="block-input" data-f="caption" data-i="${i}" placeholder="视频说明" value="${esc(b.caption || '')}">`;
      } else if (b.type === 'list') {
        body = `<textarea class="block-text" data-f="items" data-i="${i}" placeholder="每行一条">${esc((b.items || []).join('\n'))}</textarea>`;
      } else {
        body = `<textarea class="block-text" data-f="text" data-i="${i}" placeholder="请输入内容">${esc(b.text || '')}</textarea>`;
      }
      return `<div class="block-item">${head}${body}</div>`;
    }).join('');

    box.querySelectorAll('[data-f]').forEach((el) => {
      el.oninput = () => {
        const i = Number(el.dataset.i);
        const f = el.dataset.f;
        if (f === 'items') blocks[i].items = el.value.split('\n').map((s) => s.trim()).filter(Boolean);
        else blocks[i][f] = el.value;
      };
    });
    box.querySelectorAll('[data-del]').forEach((el) => {
      el.onclick = () => { blocks.splice(Number(el.dataset.del), 1); renderBlocks(); };
    });
    box.querySelectorAll('[data-move]').forEach((el) => {
      el.onclick = () => {
        const i = Number(el.dataset.i);
        const dir = Number(el.dataset.move);
        const j = i + dir;
        if (j < 0 || j >= blocks.length) return;
        const tmp = blocks[i]; blocks[i] = blocks[j]; blocks[j] = tmp;
        renderBlocks();
      };
    });
  }

  function blockName(type) {
    return { p: '段落', h2: '小标题', image: '图片', video: '视频', quote: '引用', list: '列表' }[type] || type;
  }

  function addBlock(type) {
    const base = { type };
    if (type === 'image' || type === 'video') { base.src = ''; base.caption = ''; }
    else if (type === 'list') base.items = [];
    else base.text = '';
    blocks.push(base);
    renderBlocks();
  }

  async function openEditor(id) {
    editingId = id || '';
    go('editor');
    $('editor-title').textContent = id ? '编辑稿件' : '撰写稿件';
    if (!id) {
      blocks = [{ type: 'p', text: '' }];
      ['f-title', 'f-subtitle', 'f-summary', 'f-author', 'f-source', 'f-tags', 'f-cover', 'f-published', 'f-scheduled',
        'f-video-src', 'f-video-poster', 'f-video-duration'].forEach((k) => { $(k).value = ''; });
      $('f-channel').value = 'china';
      $('f-headline').checked = false;
      $('f-focus').checked = false;
      $('f-top').checked = false;
      $('f-headline-order').value = 0;
      $('f-recommend').value = 0;
      renderBlocks();
      return;
    }
    try {
      const a = await req(`./api/v1/admin/news/${id}`);
      $('f-title').value = a.title || '';
      $('f-subtitle').value = a.subtitle || '';
      $('f-summary').value = a.summary || '';
      $('f-channel').value = a.channel || 'china';
      $('f-author').value = a.author || '';
      $('f-source').value = a.source || '';
      $('f-tags').value = (a.tags || []).join(',');
      $('f-cover').value = a.cover || '';
      $('f-published').value = a.publishedAt || '';
      $('f-scheduled').value = a.scheduledAt || '';
      blocks = (a.content && a.content.length) ? JSON.parse(JSON.stringify(a.content)) : [{ type: 'p', text: '' }];
      const f = a.flags || {};
      $('f-headline').checked = !!f.headline;
      $('f-focus').checked = !!f.focus;
      $('f-top').checked = !!f.top;
      $('f-headline-order').value = f.headlineOrder || 0;
      $('f-recommend').value = f.recommend || 0;
      const v = a.video || {};
      $('f-video-src').value = v.src || '';
      $('f-video-poster').value = v.poster || '';
      $('f-video-duration').value = v.duration || '';
      renderBlocks();
    } catch (e) {
      toast(e.message);
    }
  }

  function collectPayload(status) {
    return {
      title: $('f-title').value.trim(),
      subtitle: $('f-subtitle').value.trim(),
      summary: $('f-summary').value.trim(),
      channel: $('f-channel').value,
      author: $('f-author').value.trim(),
      source: $('f-source').value.trim(),
      tags: $('f-tags').value.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
      cover: $('f-cover').value.trim(),
      content: blocks.filter((b) => b.type !== 'p' || (b.text || '').trim()),
      video: $('f-video-src').value.trim()
        ? { src: $('f-video-src').value.trim(), poster: $('f-video-poster').value.trim(), duration: $('f-video-duration').value.trim() }
        : null,
      flags: {
        headline: $('f-headline').checked,
        headlineOrder: Number($('f-headline-order').value) || 0,
        focus: $('f-focus').checked,
        top: $('f-top').checked,
        recommend: Number($('f-recommend').value) || 0
      },
      publishedAt: $('f-published').value.trim(),
      scheduledAt: $('f-scheduled').value.trim(),
      status
    };
  }

  async function saveArticle(status) {
    const payload = collectPayload(status);
    if (!payload.title) { toast('请填写标题'); return; }
    try {
      if (editingId) await req(`./api/v1/admin/news/${editingId}`, { method: 'PUT', body: payload });
      else await req('./api/v1/admin/news', { method: 'POST', body: payload });
      toast(status === 'published' ? '已保存并发布' : '已保存为草稿');
      go('news');
    } catch (e) {
      toast(e.message);
    }
  }

  /* ------------------------------ 榜单运营 ------------------------------ */

  async function loadRanks() {
    try {
      const home = await req('./api/v1/home');
      $('ops-headline').innerHTML = rankHtml(home.headline, 'views');
      const focus = await req('./api/v1/rank?type=focus&size=10');
      $('ops-focus').innerHTML = rankHtml(focus, 'views');
      const hot = await req('./api/v1/rank?type=hot&size=10');
      $('ops-hot').innerHTML = rankHtml(hot, 'views');
      const blast = await req('./api/v1/rank?type=blast&size=10');
      $('ops-blast').innerHTML = rankHtml(blast, 'deltaViews');
    } catch (e) {
      toast(e.message);
    }
  }

  async function refreshRanks() {
    try {
      await req('./api/v1/admin/refresh-ranks', { method: 'POST', body: {} });
      toast('榜单已按最新数据重排');
      if (currentView === 'ranks') loadRanks();
    } catch (e) {
      toast(e.message);
    }
  }

  /* ------------------------------ 广场与评论 ------------------------------ */

  async function loadPosts(page = 1) {
    postsPage = page;
    const params = new URLSearchParams({ keyword: $('post-keyword').value || '', page: String(page), pageSize: '20' });
    try {
      const data = await req(`./api/v1/admin/posts?${params.toString()}`);
      const tbody = $('posts-tbody');
      tbody.innerHTML = data.list.length ? data.list.map((p) => `
        <tr>
          <td>
            <div class="row-title">${esc((p.content || '').slice(0, 90))}${(p.content || '').length > 90 ? '…' : ''}</div>
            ${p.pinned ? '<span class="mini-tag hot">置顶</span>' : ''}
            <div class="row-meta">${(p.topics || []).map((t) => '#' + esc(t)).join(' ')}</div>
          </td>
          <td>${esc((p.author && p.author.name) || '匿名')}</td>
          <td>赞 ${num((p.stats && p.stats.likes) || 0)}<br>评 ${num((p.stats && p.stats.replies) || 0)}</td>
          <td>${ago(p.createdAt)}</td>
          <td class="ops-cell">
            <button class="icon-btn" data-post="pin" data-id="${esc(p.id)}">${p.pinned ? '取消置顶' : '置顶'}</button>
            <button class="icon-btn danger" data-post="del" data-id="${esc(p.id)}">删除</button>
          </td>
        </tr>`).join('') : '<tr><td colspan="5" class="empty">暂无动态。</td></tr>';
      tbody.querySelectorAll('[data-post]').forEach((btn) => {
        btn.onclick = async () => {
          try {
            if (btn.dataset.post === 'del') {
              if (!confirm('确认删除该动态？')) return;
              await req(`./api/v1/admin/posts/${btn.dataset.id}`, { method: 'DELETE' });
              toast('已删除');
            } else {
              await req(`./api/v1/admin/posts/${btn.dataset.id}/pin`, { method: 'POST', body: {} });
              toast('已更新置顶状态');
            }
            loadPosts(postsPage);
          } catch (e) { toast(e.message); }
        };
      });
      renderPager($('posts-pagination'), data.pagination, (p) => loadPosts(p));
    } catch (e) {
      toast(e.message);
    }
  }

  async function loadComments(page = 1) {
    commentsPage = page;
    const params = new URLSearchParams({ keyword: $('comment-keyword').value || '', page: String(page), pageSize: '20' });
    try {
      const data = await req(`./api/v1/admin/comments?${params.toString()}`);
      const tbody = $('comments-tbody');
      tbody.innerHTML = data.list.length ? data.list.map((c) => `
        <tr>
          <td><div class="row-title">${esc(c.content || '')}</div></td>
          <td>${esc(c.articleTitle || '')}</td>
          <td>${esc(c.user || '网友')}<br><span class="row-meta">${ago(c.createdAt)}</span></td>
          <td class="ops-cell"><button class="icon-btn danger" data-comment="${esc(c.id)}">删除</button></td>
        </tr>`).join('') : '<tr><td colspan="4" class="empty">暂无评论。</td></tr>';
      tbody.querySelectorAll('[data-comment]').forEach((btn) => {
        btn.onclick = async () => {
          if (!confirm('确认删除该评论？')) return;
          try {
            await req(`./api/v1/admin/comments/${encodeURIComponent(btn.dataset.comment)}`, { method: 'DELETE' });
            toast('已删除');
            loadComments(commentsPage);
          } catch (e) { toast(e.message); }
        };
      });
      renderPager($('comments-pagination'), data.pagination, (p) => loadComments(p));
    } catch (e) {
      toast(e.message);
    }
  }

  /* ------------------------------ 任务日志 ------------------------------ */

  async function loadLogs() {
    try {
      const runs = await req('./api/v1/admin/runs?limit=50');
      $('runs-tbody').innerHTML = runs.length ? runs.map((r) => {
        const typeName = r.type === 'collect' ? '采集' : (r.type === 'review' ? '审核' : '任务');
        const triggerName = { manual: '手动', schedule: '定时', auto: '自动' }[r.trigger] || r.trigger || '-';
        const detail = (r.perSource || []).map((p) => `${esc(p.name)}：${p.error ? '失败 ' + esc(p.error) : `抓取 ${p.fetched || 0} / 入库 ${p.added || 0}`}`).join('；');
        return `<tr>
          <td><span class="tag ${r.failed ? 'tag-reject' : 'tag-publish'}">${typeName}</span></td>
          <td>${esc(triggerName)}</td>
          <td>${r.fetched || 0}</td>
          <td>${r.added || 0}</td>
          <td>${r.duplicated || 0}</td>
          <td>${r.rejected || 0}</td>
          <td>${r.autoPublished || 0}</td>
          <td>${r.durationMs || 0}ms</td>
          <td>${fmt(r.finishedAt || r.createdAt)}${detail ? `<div class="row-meta">${detail}</div>` : ''}</td>
        </tr>`;
      }).join('') : '<tr><td colspan="9" class="empty">暂无任务记录。</td></tr>';
    } catch (e) {
      toast(e.message);
    }
  }

  /* ------------------------------ 账号 ------------------------------ */

  async function loadAccounts() {
    try {
      const list = await req('./api/v1/admin/accounts');
      $('accounts-tbody').innerHTML = list.map((a) => `
        <tr>
          <td>${esc(a.username)}</td>
          <td>${esc(a.name || '')}</td>
          <td>${a.role === 'admin' ? '管理员' : '编辑'}</td>
          <td><span class="tag ${a.status === 'disabled' ? 'tag-reject' : 'tag-publish'}">${a.status === 'disabled' ? '已停用' : '正常'}</span></td>
          <td>${a.lastLoginAt ? fmt(a.lastLoginAt) : '从未登录'}</td>
          <td class="ops-cell">
            <button class="icon-btn" data-acc="role" data-id="${esc(a.id)}">切角色</button>
            <button class="icon-btn" data-acc="status" data-id="${esc(a.id)}">${a.status === 'disabled' ? '启用' : '停用'}</button>
            <button class="icon-btn danger" data-acc="del" data-id="${esc(a.id)}">删除</button>
          </td>
        </tr>`).join('');
      $('accounts-tbody').querySelectorAll('[data-acc]').forEach((btn) => {
        btn.onclick = async () => {
          try {
            const list2 = await req('./api/v1/admin/accounts');
            const acc = list2.find((x) => x.id === btn.dataset.id);
            if (btn.dataset.acc === 'role') {
              await req(`./api/v1/admin/accounts/${acc.id}`, { method: 'PUT', body: { role: acc.role === 'admin' ? 'editor' : 'admin' } });
              toast('角色已更新');
            } else if (btn.dataset.acc === 'status') {
              await req(`./api/v1/admin/accounts/${acc.id}`, { method: 'PUT', body: { status: acc.status === 'disabled' ? 'active' : 'disabled' } });
              toast('状态已更新');
            } else if (btn.dataset.acc === 'del') {
              if (!confirm('确认删除该账号？')) return;
              await req(`./api/v1/admin/accounts/${acc.id}`, { method: 'DELETE' });
              toast('已删除');
            }
            loadAccounts();
          } catch (e) { toast(e.message); }
        };
      });
    } catch (e) {
      toast(e.message);
    }
  }

  function openAccountModal() {
    const body = `
      <div class="field"><label>账号</label><input id="ac-username" placeholder="登录账号"></div>
      <div class="field"><label>姓名</label><input id="ac-name" placeholder="显示姓名"></div>
      <div class="field"><label>初始密码</label><input type="password" id="ac-password"></div>
      <div class="field"><label>角色</label><select id="ac-role"><option value="editor">编辑</option><option value="admin">管理员</option></select></div>`;
    openModal('新增后台账号', body, [
      {
        text: '创建', onClick: async () => {
          try {
            await req('./api/v1/admin/accounts', {
              method: 'POST',
              body: {
                username: $('ac-username').value.trim(),
                name: $('ac-name').value.trim(),
                password: $('ac-password').value,
                role: $('ac-role').value
              }
            });
            closeModal(); toast('账号已创建'); loadAccounts();
          } catch (e) { toast(e.message); }
        }
      },
      { text: '取消', className: 'ghost', onClick: closeModal }
    ]);
  }

  async function changePassword() {
    const oldPassword = $('pw-old').value;
    const newPassword = $('pw-new').value;
    if (!oldPassword || !newPassword) { toast('请填写原密码与新密码'); return; }
    try {
      await req('./api/v1/admin/password', { method: 'POST', body: { oldPassword, newPassword } });
      $('pw-old').value = '';
      $('pw-new').value = '';
      toast('密码已修改');
    } catch (e) {
      toast(e.message);
    }
  }

  /* ------------------------------ 站点设置 ------------------------------ */

  async function loadSettings() {
    try {
      const s = await req('./api/v1/site');
      $('s-company').value = s.company || '';
      $('s-siteName').value = s.siteName || '';
      $('s-shortName').value = s.shortName || '';
      $('s-domain').value = s.domain || '';
      $('s-slogan').value = s.slogan || '';
      $('s-icp').value = s.icp || '';
      $('s-hotSize').value = s.hotSize || 10;
      $('s-blastSize').value = s.blastSize || 10;
      $('s-focusSize').value = s.focusSize || 6;
      $('s-homeChannelSize').value = s.homeChannelSize || 6;
      $('s-pageSize').value = s.pageSize || 20;
    } catch (e) {
      toast(e.message);
    }
  }

  async function saveSettings() {
    const payload = {
      company: $('s-company').value.trim(),
      siteName: $('s-siteName').value.trim(),
      shortName: $('s-shortName').value.trim(),
      domain: $('s-domain').value.trim(),
      slogan: $('s-slogan').value.trim(),
      icp: $('s-icp').value.trim(),
      hotSize: Number($('s-hotSize').value),
      blastSize: Number($('s-blastSize').value),
      focusSize: Number($('s-focusSize').value),
      homeChannelSize: Number($('s-homeChannelSize').value),
      pageSize: Number($('s-pageSize').value)
    };
    try {
      await req('./api/v1/admin/site', { method: 'PUT', body: payload });
      toast('站点设置已保存');
    } catch (e) {
      toast(e.message);
    }
  }

  /* ------------------------------ 图库管理 ------------------------------ */

  const KIND_LABEL = { origin: '原文配图', search: '图库检索', card: '品牌配图卡' };

  function fmtSize(b) {
    const n = Number(b) || 0;
    if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(n / 1024))} KB`;
  }

  async function loadImages(page = 1) {
    imagesPage = page;
    const kw = ($('img-keyword').value || '').trim();
    const usage = $('img-usage').value || 'all';
    let data = null;
    try {
      data = await req(`./api/v1/admin/images?keyword=${encodeURIComponent(kw)}&usage=${usage}&page=${page}&pageSize=24`);
    } catch (e) {
      toast(e.message);
      return;
    }

    const s = data.stats || {};
    const cards = [
      ['配图总数', s.total, `占用 ${fmtSize(s.bytes)}`],
      ['已被引用', s.used, '正被稿件使用'],
      ['闲置未用', s.orphan, '可安全清理'],
      ['重复配对', s.dupPairs, s.dupPairs ? '需要处理' : '全站无重复'],
      ['缺图稿件', s.missingArticles, '待补封面 / 正文图'],
      ['待补指纹', s.noHash, '影响去重判定']
    ];
    $('img-stats').innerHTML = cards.map((c) => `
      <div class="stat-box"><b>${esc(c[1])}</b><span>${esc(c[0])}</span><small>${esc(c[2])}</small></div>`).join('');

    const badge = $('badge-images');
    if (badge) {
      const alert = (s.dupPairs || 0) + (s.missingArticles || 0);
      badge.style.display = alert > 0 ? '' : 'none';
      badge.textContent = alert;
    }

    const list = data.list || [];
    $('img-grid').innerHTML = list.length
      ? list.map(imgCard).join('')
      : '<p class="preview-note">没有符合条件的图片。</p>';
    bindImageCards();
    renderPager($('img-pagination'), data.pagination, (p) => loadImages(p));
    renderMissing(data.missing || [], s.missingArticles || 0);
  }

  function imgCard(row) {
    const used = row.usedBy || [];
    const owner = used[0] || {};
    const ownerId = row.articleId || owner.id || '';
    const usedHtml = used.length
      ? used.slice(0, 3).map((u) => `<div class="row-meta">${esc(u.slot || '引用')}：${esc(u.title || '（未命名）')}</div>`).join('')
      : '<div class="row-meta">闲置 · 未被任何稿件引用</div>';
    const more = used.length > 3 ? `<div class="row-meta">等共 ${used.length} 处引用</div>` : '';
    return `
      <div class="img-card" data-file="${esc(row.file)}" data-article="${esc(ownerId)}">
        <a class="thumb" href="${esc(row.url)}" target="_blank" rel="noopener">
          <img src="${esc(row.url)}" alt="${esc(row.query || row.file)}" loading="lazy">
        </a>
        <div class="img-body">
          <div class="row-title">${esc(row.query || row.file)}</div>
          <div class="row-meta">${esc(row.file)} · ${fmtSize(row.bytes)}${row.size ? ` · 原图 ${esc(row.size)}` : ''}</div>
          <div class="row-meta">来源：${esc(KIND_LABEL[row.kind] || '站内素材')}${row.hash ? ` · 指纹 ${esc(String(row.hash).slice(0, 8))}` : ' · 无指纹'}</div>
          ${usedHtml}${more}
          <div class="ops-cell" style="margin-top:8px;">
            <button class="icon-btn" data-act="copy">复制路径</button>
            ${ownerId ? '<button class="icon-btn" data-act="refetch">换一张</button>' : ''}
            <button class="icon-btn danger" data-act="remove" ${row.used ? 'disabled title="仍被稿件引用，不能删除"' : ''}>删除</button>
          </div>
        </div>
      </div>`;
  }

  function bindImageCards() {
    document.querySelectorAll('#img-grid .img-card').forEach((card) => {
      const file = card.dataset.file;
      const article = card.dataset.article;
      card.querySelectorAll('button[data-act]').forEach((btn) => {
        btn.onclick = async () => {
          const act = btn.dataset.act;

          if (act === 'copy') {
            const url = `./img/news/${file}`;
            try {
              await navigator.clipboard.writeText(url);
              toast(`已复制 ${url}`);
            } catch (e) { toast(url); }
            return;
          }

          if (act === 'remove') {
            if (!confirm(`确认删除 ${file}？删除后不可恢复。`)) return;
            try {
              await req(`./api/v1/admin/images/${encodeURIComponent(file)}`, { method: 'DELETE' });
              toast('已删除');
              loadImages(imagesPage);
            } catch (e) { toast(e.message); }
            return;
          }

          if (act === 'refetch') {
            if (!article) return;
            const query = prompt('这张配图的检索词（留空则由标题 + 标签 + 频道自动生成）', '');
            if (query === null) return;
            btn.disabled = true;
            btn.textContent = '下载中…';
            try {
              const r = await req('./api/v1/admin/images/fetch', {
                method: 'POST', body: { articleId: article, query: query || '', maxSlots: 1 }
              });
              toast(r.filled ? `配图已更新（成功 ${r.filled} 张）` : '未找到合格新图，已保留原图');
              loadImages(imagesPage);
            } catch (e) {
              toast(e.message);
              btn.disabled = false;
              btn.textContent = '换一张';
            }
          }
        };
      });
    });
  }

  function renderMissing(rows, total) {
    const tbody = $('img-missing-tbody');
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty">所有稿件都已配图。</td></tr>';
      return;
    }
    const chName = (id) => {
      const c = channels.find((x) => x.id === id);
      return (c && c.name) || id || '-';
    };
    const show = rows.slice(0, 30);
    tbody.innerHTML = show.map((r) => `
      <tr data-id="${esc(r.id)}">
        <td><div class="row-title">${esc(r.title || '（无标题）')}</div><div class="row-meta">${esc(r.id)}</div></td>
        <td>${esc(chName(r.channel))}</td>
        <td>${esc(r.status === 'published' ? '已发布' : r.status === 'draft' ? '草稿' : (r.status || '-'))}</td>
        <td>${esc((r.missing || []).join('、'))}</td>
        <td><button class="icon-btn" data-act="fill-one">立即补图</button></td>
      </tr>`).join('')
      + (total > show.length ? `<tr><td colspan="5" class="preview-note">仅列出前 ${show.length} 篇，全站共 ${total} 篇缺图。</td></tr>` : '');

    tbody.querySelectorAll('button[data-act="fill-one"]').forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.closest('tr').dataset.id;
        btn.disabled = true;
        btn.textContent = '下载中…';
        try {
          const r = await req('./api/v1/admin/images/fill', { method: 'POST', body: { ids: [id], limit: 1, maxSlots: 2 } });
          toast(`补齐完成：成功 ${r.filled || 0} 张，失败 ${r.failed || 0} 张`);
          loadImages(imagesPage);
        } catch (e) {
          toast(e.message);
          btn.disabled = false;
          btn.textContent = '立即补图';
        }
      };
    });
  }

  async function fillImages(limit) {
    if (!confirm(`将为最多 ${limit} 个缺图图位下载配图（内容相关 + 全站去重），耗时约 1-3 分钟，继续？`)) return;
    const btn = $('img-fill');
    if (btn) btn.disabled = true;
    try {
      toast('正在下载配图…');
      const r = await req('./api/v1/admin/images/fill', { method: 'POST', body: { limit, maxSlots: 2 } });
      toast(`补图完成：处理 ${r.checked || 0} 篇，成功 ${r.filled || 0} 张，失败 ${r.failed || 0} 张`);
      loadImages(1);
    } catch (e) {
      toast(e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function checkDuplicates() {
    const box = $('img-dup-result');
    box.innerHTML = '<p class="preview-note">正在对全站配图做感知哈希两两比对…</p>';
    try {
      const r = await req('./api/v1/admin/images/duplicates');
      const pairs = r.pairs || [];
      if (!pairs.length) {
        box.innerHTML = '<div class="dup-list ok">全站配图两两比对完毕，未发现重复画面。</div>';
      } else {
        box.innerHTML = `<div class="dup-list"><b>发现 ${pairs.length} 组重复配图</b>`
          + pairs.slice(0, 20).map((p) => `<div class="row-meta">${esc(p.a)} ↔ ${esc(p.b)}（哈希差 ${p.distance}）</div>`).join('')
          + '</div>';
      }
      toast(pairs.length ? `发现 ${pairs.length} 组重复` : '未发现重复配图');
    } catch (e) {
      box.innerHTML = '';
      toast(e.message);
    }
  }

  async function rebuildFingerprints() {
    if (!confirm('重建指纹库会重新计算全站配图的感知哈希，用于去重判定。继续？')) return;
    try {
      const r = await req('./api/v1/admin/images/rebuild', { method: 'POST', body: {} });
      toast(`指纹库已重建：共 ${r.total} 张，新计算 ${r.computed} 张`);
      loadImages(imagesPage);
    } catch (e) { toast(e.message); }
  }

  /* ------------------------------ 事件绑定 ------------------------------ */

  function bind() {
    $('btn-login').onclick = login;
    $('login-pass').onkeydown = (e) => { if (e.key === 'Enter') login(); };
    $('btn-logout').onclick = logout;

    document.querySelectorAll('#menu a').forEach((a) => {
      a.onclick = (e) => { e.preventDefault(); go(a.dataset.view); };
    });

    // 概览
    $('btn-run-collect').onclick = triggerCollect;
    $('btn-run-review').onclick = async () => {
      try {
        const r = await req('./api/v1/admin/pipeline/auto-review', { method: 'POST', body: {} });
        toast(`审核完成：驳回 ${r.rejected || 0} 条，自动发布 ${r.autoPublished || 0} 条，待人工 ${r.pendingReview || 0} 条`);
        loadDashboard();
      } catch (e) { toast(e.message); }
    };
    $('btn-run-daily').onclick = async () => {
      try {
        toast('正在执行每日任务…');
        const r = await req('./api/v1/admin/pipeline/daily', { method: 'POST', body: {} });
        toast(`完成：入库 ${(r.run && r.run.added) || 0} 条，自动发布 ${(r.run && r.run.autoPublished) || 0} 条`);
        loadDashboard();
      } catch (e) { toast(e.message); }
    };
    ['btn-refresh-ranks', 'btn-refresh-ranks2'].forEach((id) => { const el = $(id); if (el) el.onclick = refreshRanks; });

    // 采集池
    $('ib-filter').onclick = () => loadInbox(1);
    $('ib-refresh').onclick = () => loadInbox(inboxPage);
    $('ib-collect').onclick = triggerCollect;
    $('ib-keyword').onkeydown = (e) => { if (e.key === 'Enter') loadInbox(1); };
    $('ib-check-all').onchange = (e) => {
      document.querySelectorAll('.ib-check').forEach((c) => { c.checked = e.target.checked; });
    };
    document.querySelectorAll('[data-batch]').forEach((btn) => {
      btn.onclick = () => runBatch(btn.dataset.batch);
    });
    const bind = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
    bind('ib-batch-top', batchTop);
    bind('ib-batch-low', batchLow);

    // 采集源
    $('src-new').onclick = () => openSourceModal(null);
    $('src-refresh').onclick = loadSources;

    // 自动化
    $('btn-save-pipeline').onclick = saveAutomation;

    // 稿件
    $('btn-filter').onclick = () => loadNews(1);
    $('btn-new').onclick = () => openEditor('');
    $('filter-keyword').onkeydown = (e) => { if (e.key === 'Enter') loadNews(1); };

    // 编辑器
    $('btn-save-draft').onclick = () => saveArticle('draft');
    // 图库
    $('img-filter').onclick = () => loadImages(1);
    $('img-keyword').onkeydown = (e) => { if (e.key === 'Enter') loadImages(1); };
    $('img-usage').onchange = () => loadImages(1);
    $('img-missing-refresh').onclick = () => loadImages(imagesPage);
    $('img-fill').onclick = () => fillImages(8);
    $('img-fill-all').onclick = () => fillImages(24);
    $('img-dup').onclick = checkDuplicates;
    $('img-rebuild').onclick = rebuildFingerprints;
    $('btn-save-publish').onclick = () => saveArticle('published');
    $('btn-editor-cancel').onclick = () => go('news');
    document.querySelectorAll('[data-add]').forEach((btn) => {
      btn.onclick = () => addBlock(btn.dataset.add);
    });

    // 广场与评论
    $('post-search').onclick = () => loadPosts(1);
    $('comment-search').onclick = () => loadComments(1);

    // 日志
    $('logs-refresh').onclick = loadLogs;

    // 账号与设置
    $('acc-new').onclick = openAccountModal;
    $('btn-change-pw').onclick = changePassword;
    $('btn-save-site').onclick = saveSettings;

    // 弹窗
    $('modal-close').onclick = closeModal;
    $('modal-mask').onclick = (e) => { if (e.target.id === 'modal-mask') closeModal(); };
  }

  document.addEventListener('DOMContentLoaded', () => {
    bind();
    boot();
  });
})();
