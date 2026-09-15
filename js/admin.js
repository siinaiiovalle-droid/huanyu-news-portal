/* 内容运营后台逻辑 */
(function () {
  'use strict';

  const TOKEN_KEY = 'hy_admin_token';
  let site = {};
  let channels = [];
  let editingId = null;
  let blocks = [];
  let newsPage = 1;
  let newsFilters = { keyword: '', channel: '', status: '' };

  /* ------------------------------ 基础 ------------------------------ */

  function token() { return localStorage.getItem(TOKEN_KEY) || ''; }

  async function adminApi(path, options = {}) {
    return HY.api(path, {
      ...options,
      headers: { Authorization: `Bearer ${token()}`, ...(options.headers || {}) }
    });
  }

  function $(id) { return document.getElementById(id); }

  /* ------------------------------ 登录 ------------------------------ */

  async function boot() {
    site = await HY.api('./api/v1/site');
    channels = site.channels || [];
    fillChannelSelects();
    if (token()) {
      try {
        const me = await adminApi('./api/v1/admin/me');
        enter(me);
        return;
      } catch {
        localStorage.removeItem(TOKEN_KEY);
      }
    }
    $('login-view').style.display = 'grid';
  }

  function enter(me) {
    $('login-view').style.display = 'none';
    $('shell').style.display = 'grid';
    $('who-name').textContent = `${me.name}（${me.role === 'admin' ? '管理员' : '编辑'}）`;
    location.hash = location.hash || '#/dashboard';
    route();
  }

  function bindLogin() {
    $('btn-login').addEventListener('click', doLogin);
    $('login-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  }

  async function doLogin() {
    const username = $('login-user').value.trim();
    const password = $('login-pass').value;
    $('login-err').textContent = '';
    try {
      const res = await HY.api('./api/v1/admin/login', { method: 'POST', body: { username, password } });
      localStorage.setItem(TOKEN_KEY, res.token);
      enter(res.user);
    } catch (e) {
      $('login-err').textContent = e.message;
    }
  }

  async function logout() {
    try { await adminApi('./api/v1/admin/logout', { method: 'POST' }); } catch { /* ignore */ }
    localStorage.removeItem(TOKEN_KEY);
    location.reload();
  }

  /* ------------------------------ 路由 ------------------------------ */

  const VIEWS = {
    dashboard: { title: '运营概览', render: renderDashboard },
    news: { title: '稿件管理', render: renderNewsList },
    editor: { title: '撰写稿件', render: () => renderEditor(editingId) },
    ranks: { title: '榜单运营', render: renderRanks },
    settings: { title: '站点设置', render: renderSettings }
  };

  function route() {
    const hash = location.hash.replace('#/', '') || 'dashboard';
    const [name, param] = hash.split('/');
    const view = VIEWS[name] || VIEWS.dashboard;
    Object.keys(VIEWS).forEach((k) => { $('view-' + k).style.display = k === name ? '' : 'none'; });
    $('view-title').textContent = view.title;
    document.querySelectorAll('.admin-menu a').forEach((a) => {
      a.classList.toggle('active', a.dataset.view === name);
    });
    if (name === 'editor') editingId = param || null;
    view.render();
  }

  window.addEventListener('hashchange', route);

  /* ------------------------------ 概览 ------------------------------ */

  async function renderDashboard() {
    try {
      const s = await adminApi('./api/v1/admin/stats');
      $('stat-grid').innerHTML = [
        { k: '稿件总数', v: s.total, s: `已发布 ${s.published} · 草稿 ${s.drafts}` },
        { k: '今日新增', v: s.todayNew, s: '含草稿与已发布' },
        { k: '全站阅读量', v: HY.fmtNum(s.views), s: '累计阅读' },
        { k: '评论总数', v: s.comments, s: '全站累计' }
      ].map((c) => `<div class="stat-card"><div class="k">${c.k}</div><div class="v">${c.v}</div><div class="s">${c.s}</div></div>`).join('');

      const max = Math.max(1, ...s.channels.map((c) => c.count));
      $('channel-stats').innerHTML = s.channels.map((c) => `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
          <span style="width:70px;font-size:13.5px;color:#4a4a4a;">${HY.escapeHtml(c.name)}</span>
          <span style="flex:1;height:12px;background:#eef1f6;border-radius:999px;overflow:hidden;">
            <span style="display:block;height:100%;width:${Math.round(c.count / max * 100)}%;background:linear-gradient(90deg,#0b4f9e,#1467c6);"></span>
          </span>
          <span style="width:48px;text-align:right;font-size:13px;color:#8a8f99;">${c.count} 篇</span>
        </div>`).join('');

      $('dash-hot').innerHTML = HY.rankList(s.hot, 'hotScore');
      $('dash-blast').innerHTML = HY.rankList(s.blast, 'blastScore');
    } catch (e) {
      HY.toast(e.message);
    }
  }

  /* ------------------------------ 稿件管理 ------------------------------ */

  function fillChannelSelects() {
    const opts = channels.map((c) => `<option value="${c.id}">${HY.escapeHtml(c.name)}</option>`).join('');
    $('f-channel').innerHTML = opts;
    $('filter-channel').innerHTML = '<option value="">全部频道</option>' + opts;
  }

  async function renderNewsList() {
    const tbody = $('news-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="empty">加载中…</td></tr>';
    try {
      const params = new URLSearchParams({ page: newsPage, pageSize: 15 });
      if (newsFilters.keyword) params.set('keyword', newsFilters.keyword);
      if (newsFilters.channel) params.set('channel', newsFilters.channel);
      const res = await adminApi('./api/v1/admin/news?' + params.toString());
      let list = res.list;
      if (newsFilters.status) list = list.filter((a) => a.status === newsFilters.status);

      tbody.innerHTML = list.length ? list.map((a) => `
        <tr>
          <td>
            <div class="t-title"><a href="./article.html?id=${encodeURIComponent(a.id)}" target="_blank">${HY.escapeHtml(a.title)}</a></div>
            <div class="t-sub">${HY.escapeHtml(a.summary || '').slice(0, 60)}</div>
          </td>
          <td>${HY.chanTag(a.channel, a.channelName || a.channel)}</td>
          <td>
            ${a.status !== 'published' ? '<span class="pill draft">草稿</span>' : '<span class="pill ok">已发布</span>'}
            ${a.flags && a.flags.headline ? '<span class="pill hot">头条</span>' : ''}
            ${a.flags && a.flags.focus ? '<span class="pill blue">焦点</span>' : ''}
            ${a.flags && a.flags.hot ? '<span class="pill hot">热点</span>' : ''}
            ${a.flags && a.flags.blast ? '<span class="pill hot">爆款</span>' : ''}
          </td>
          <td style="font-size:12.5px;color:#8a8f99;">
            阅读 ${HY.fmtNum(a.stats && a.stats.views)}<br>
            赞 ${HY.fmtNum(a.stats && a.stats.likes)} · 评 ${HY.fmtNum(a.stats && a.stats.comments)}
          </td>
          <td style="font-size:12.5px;color:#8a8f99;">${HY.fmtTime(a.publishedAt)}</td>
          <td>
            <div class="ops">
              <button class="icon-btn" data-edit="${a.id}">编辑</button>
              <button class="icon-btn" data-toggle="headline" data-id="${a.id}">${a.flags && a.flags.headline ? '取消头条' : '设头条'}</button>
              <button class="icon-btn" data-toggle="focus" data-id="${a.id}">${a.flags && a.flags.focus ? '取消焦点' : '设焦点'}</button>
              ${a.status !== 'published' ? `<button class="icon-btn" data-publish="${a.id}">发布</button>` : ''}
              <button class="icon-btn danger" data-del="${a.id}">删除</button>
            </div>
          </td>
        </tr>`).join('') : '<tr><td colspan="6" class="empty">没有符合条件的稿件</td></tr>';

      bindRowActions(list);
      HY.renderPagination($('news-pagination'), res.pagination.page, res.pagination.totalPages, (p) => {
        newsPage = p;
        renderNewsList();
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty">加载失败：${HY.escapeHtml(e.message)}</td></tr>`;
    }
  }

  function bindRowActions(list) {
    const tbody = $('news-tbody');
    tbody.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      editingId = b.dataset.edit;
      location.hash = `#/editor/${editingId}`;
    }));
    tbody.querySelectorAll('[data-publish]').forEach((b) => b.addEventListener('click', async () => {
      try {
        await adminApi(`./api/v1/admin/news/${b.dataset.publish}/publish`, { method: 'POST' });
        HY.toast('已发布');
        renderNewsList();
      } catch (e) { HY.toast(e.message); }
    }));
    tbody.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('确认删除这篇稿件？')) return;
      try {
        await adminApi(`./api/v1/admin/news/${b.dataset.del}`, { method: 'DELETE' });
        HY.toast('已删除');
        renderNewsList();
      } catch (e) { HY.toast(e.message); }
    }));
    tbody.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
      const a = list.find((x) => x.id === b.dataset.id);
      if (!a) return;
      const flags = { ...(a.flags || {}) };
      flags[b.dataset.toggle] = !flags[b.dataset.toggle];
      try {
        await adminApi(`./api/v1/admin/news/${a.id}`, { method: 'PUT', body: { flags } });
        HY.toast('已更新运营位');
        renderNewsList();
      } catch (e) { HY.toast(e.message); }
    }));
  }

  function bindNewsToolbar() {
    $('btn-filter').addEventListener('click', () => {
      newsFilters = {
        keyword: $('filter-keyword').value.trim(),
        channel: $('filter-channel').value,
        status: $('filter-status').value
      };
      newsPage = 1;
      renderNewsList();
    });
    $('filter-keyword').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-filter').click(); });
    $('btn-new').addEventListener('click', () => {
      editingId = null;
      location.hash = '#/editor';
    });
  }

  /* ------------------------------ 编辑器 ------------------------------ */

  const BLOCK_LABEL = { p: '段落', h2: '小标题', image: '图片', video: '视频', quote: '引用', list: '列表' };

  function newBlock(type) {
    switch (type) {
      case 'h2': return { type, text: '' };
      case 'quote': return { type, text: '' };
      case 'image': return { type, src: '', caption: '' };
      case 'video': return { type, src: '', kind: 'mp4', poster: '', caption: '', duration: '' };
      case 'list': return { type, items: [''] };
      default: return { type: 'p', text: '' };
    }
  }

  function fillEditor(article) {
    $('f-title').value = article ? article.title || '' : '';
    $('f-subtitle').value = article ? article.subtitle || '' : '';
    $('f-summary').value = article ? article.summary || '' : '';
    $('f-channel').value = article ? article.channel : (channels[0] ? channels[0].id : 'china');
    $('f-author').value = article ? article.author || '' : '本网记者';
    $('f-source').value = article ? article.source || site.siteName : site.siteName;
    $('f-tags').value = article ? (article.tags || []).join(',') : '';
    $('f-cover').value = article ? article.cover || '' : '';
    $('f-published').value = article ? HY.fmtTime(article.publishedAt) : '';
    const flags = (article && article.flags) || {};
    $('f-headline').checked = !!flags.headline;
    $('f-headline-order').value = flags.headlineOrder || 0;
    $('f-focus').checked = !!flags.focus;
    $('f-top').checked = !!flags.top;
    $('f-recommend').value = flags.recommend || 0;
    const video = (article && article.video) || {};
    $('f-video-src').value = video.src || '';
    $('f-video-poster').value = video.poster || '';
    $('f-video-duration').value = video.duration || '';
    blocks = article && Array.isArray(article.content) && article.content.length
      ? JSON.parse(JSON.stringify(article.content))
      : [newBlock('p')];
    renderBlocks();
  }

  function renderBlocks() {
    const host = $('block-editor');
    host.innerHTML = blocks.map((b, i) => `
      <div class="block" data-i="${i}">
        <div class="block-head">
          <span class="type">${BLOCK_LABEL[b.type] || b.type}</span>
          <span class="sp"></span>
          <button class="icon-btn" data-up="${i}">↑</button>
          <button class="icon-btn" data-down="${i}">↓</button>
          <button class="icon-btn danger" data-remove="${i}">删除</button>
        </div>
        ${b.type === 'p' || b.type === 'h2' || b.type === 'quote'
          ? `<textarea data-field="text" data-i="${i}" placeholder="${BLOCK_LABEL[b.type]}内容">${HY.escapeHtml(b.text || '')}</textarea>`
          : ''}
        ${b.type === 'image'
          ? `<input data-field="src" data-i="${i}" placeholder="图片地址，如 /img/tech-ai.png" value="${HY.escapeHtml(b.src || '')}">
             <input data-field="caption" data-i="${i}" placeholder="图片说明（可选）" value="${HY.escapeHtml(b.caption || '')}">`
          : ''}
        ${b.type === 'video'
          ? `<input data-field="src" data-i="${i}" placeholder="视频地址 .mp4 或 iframe 链接" value="${HY.escapeHtml(b.src || '')}">
             <select data-field="kind" data-i="${i}">
               <option value="mp4" ${b.kind !== 'iframe' ? 'selected' : ''}>MP4 文件</option>
               <option value="iframe" ${b.kind === 'iframe' ? 'selected' : ''}>iframe 嵌入</option>
             </select>
             <input data-field="poster" data-i="${i}" placeholder="视频封面（可选）" value="${HY.escapeHtml(b.poster || '')}">
             <input data-field="caption" data-i="${i}" placeholder="视频说明（可选）" value="${HY.escapeHtml(b.caption || '')}">`
          : ''}
        ${b.type === 'list'
          ? `<textarea data-field="items" data-i="${i}" placeholder="每行一条">${HY.escapeHtml((b.items || []).join('\n'))}</textarea>`
          : ''}
      </div>`).join('');

    host.querySelectorAll('[data-field]').forEach((el) => {
      el.addEventListener('input', () => {
        const i = Number(el.dataset.i);
        const f = el.dataset.field;
        if (f === 'items') blocks[i].items = el.value.split('\n').map((s) => s.trim()).filter(Boolean);
        else if (f === 'kind') blocks[i].kind = el.value;
        else blocks[i][f] = el.value;
      });
    });
    host.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.up);
      if (i > 0) { [blocks[i - 1], blocks[i]] = [blocks[i], blocks[i - 1]]; renderBlocks(); }
    }));
    host.querySelectorAll('[data-down]').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.down);
      if (i < blocks.length - 1) { [blocks[i + 1], blocks[i]] = [blocks[i], blocks[i + 1]]; renderBlocks(); }
    }));
    host.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => {
      blocks.splice(Number(b.dataset.remove), 1);
      if (!blocks.length) blocks.push(newBlock('p'));
      renderBlocks();
    }));
  }

  function bindEditorToolbar() {
    document.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => {
      blocks.push(newBlock(b.dataset.add));
      renderBlocks();
    }));
    $('btn-editor-cancel').addEventListener('click', () => {
      editingId = null;
      location.hash = '#/news';
    });
    $('btn-save-draft').addEventListener('click', () => saveArticle('draft'));
    $('btn-save-publish').addEventListener('click', () => saveArticle('published'));
  }

  async function saveArticle(status) {
    const title = $('f-title').value.trim();
    if (!title) { HY.toast('请填写标题'); $('f-title').focus(); return; }
    const videoSrc = $('f-video-src').value.trim();
    const payload = {
      title,
      subtitle: $('f-subtitle').value.trim(),
      summary: $('f-summary').value.trim(),
      channel: $('f-channel').value,
      author: $('f-author').value.trim(),
      source: $('f-source').value.trim(),
      tags: $('f-tags').value,
      cover: $('f-cover').value.trim(),
      content: blocks.filter((b) => {
        if (b.type === 'p' || b.type === 'h2' || b.type === 'quote') return String(b.text || '').trim();
        if (b.type === 'image') return String(b.src || '').trim();
        if (b.type === 'video') return String(b.src || '').trim();
        if (b.type === 'list') return (b.items || []).length;
        return false;
      }),
      status,
      flags: {
        headline: $('f-headline').checked,
        headlineOrder: Number($('f-headline-order').value) || 0,
        focus: $('f-focus').checked,
        top: $('f-top').checked,
        recommend: Number($('f-recommend').value) || 0
      },
      video: videoSrc ? {
        src: videoSrc,
        kind: /^https?:.*(youtube|bilibili|v\.qq|youku)/i.test(videoSrc) ? 'iframe' : 'mp4',
        poster: $('f-video-poster').value.trim(),
        duration: $('f-video-duration').value.trim()
      } : null
    };
    const published = $('f-published').value.trim();
    if (published) payload.publishedAt = published.replace(' ', 'T') + ':00';

    try {
      if (editingId) {
        await adminApi(`./api/v1/admin/news/${editingId}`, { method: 'PUT', body: payload });
      } else {
        const created = await adminApi('./api/v1/admin/news', { method: 'POST', body: payload });
        editingId = created.id;
      }
      HY.toast(status === 'published' ? '已保存并发布' : '已存为草稿');
      editingId = null;
      location.hash = '#/news';
      renderNewsList();
    } catch (e) {
      HY.toast(e.message);
    }
  }

  function renderEditor(id) {
    const host = $('view-editor');
    if (host.dataset.ready !== '1') {
      bindEditorToolbar();
      host.dataset.ready = '1';
    }
    if (id) {
      $('editor-title').textContent = '编辑稿件';
      adminApi(`./api/v1/admin/news/${id}`).then((a) => fillEditor(a)).catch((e) => HY.toast(e.message));
    } else {
      $('editor-title').textContent = '撰写稿件';
      fillEditor(null);
    }
  }

  /* ------------------------------ 榜单运营 ------------------------------ */

  async function renderRanks() {
    try {
      const [hot, blast, focus, headline] = await Promise.all([
        adminApi('./api/v1/rank?type=hot&size=10'),
        adminApi('./api/v1/rank?type=blast&size=10'),
        adminApi('./api/v1/rank?type=focus&size=10'),
        adminApi('./api/v1/rank?type=headline&size=10')
      ]);
      $('ops-headline').innerHTML = HY.rankList(headline.list, 'hotScore');
      $('ops-focus').innerHTML = HY.rankList(focus.list, 'hotScore');
      $('ops-hot').innerHTML = HY.rankList(hot.list, 'hotScore');
      $('ops-blast').innerHTML = HY.rankList(blast.list, 'blastScore');
    } catch (e) {
      HY.toast(e.message);
    }
  }

  async function refreshRanks() {
    try {
      const r = await adminApi('./api/v1/admin/refresh-ranks', { method: 'POST' });
      HY.toast(`榜单已刷新：更新 ${r.changed} 篇稿件运营位`);
      if (location.hash.includes('ranks')) renderRanks();
      if (location.hash.includes('dashboard')) renderDashboard();
    } catch (e) {
      HY.toast(e.message);
    }
  }

  /* ------------------------------ 站点设置 ------------------------------ */

  async function renderSettings() {
    try {
      const s = await adminApi('./api/v1/admin/site');
      ['company', 'siteName', 'shortName', 'domain', 'slogan', 'icp', 'hotSize', 'blastSize', 'focusSize', 'homeChannelSize', 'pageSize']
        .forEach((k) => { const el = $('s-' + k); if (el) el.value = s[k] != null ? s[k] : ''; });
    } catch (e) {
      HY.toast(e.message);
    }
  }

  async function saveSite() {
    const payload = {
      company: $('s-company').value,
      siteName: $('s-siteName').value,
      shortName: $('s-shortName').value,
      domain: $('s-domain').value,
      slogan: $('s-slogan').value,
      icp: $('s-icp').value,
      hotSize: Number($('s-hotSize').value) || 10,
      blastSize: Number($('s-blastSize').value) || 10,
      focusSize: Number($('s-focusSize').value) || 6,
      homeChannelSize: Number($('s-homeChannelSize').value) || 5,
      pageSize: Number($('s-pageSize').value) || 20
    };
    try {
      await adminApi('./api/v1/admin/site', { method: 'PUT', body: payload });
      HY.toast('站点设置已保存');
      site = await HY.api('./api/v1/site');
    } catch (e) {
      HY.toast(e.message);
    }
  }

  /* ------------------------------ 初始化 ------------------------------ */

  bindLogin();
  $('btn-logout').addEventListener('click', logout);
  $('btn-refresh-ranks').addEventListener('click', refreshRanks);
  $('btn-refresh-ranks2').addEventListener('click', refreshRanks);
  $('btn-save-site').addEventListener('click', saveSite);
  bindNewsToolbar();
  boot();
})();
