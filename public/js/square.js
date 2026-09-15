/**
 * 广场前端 —— 社交媒体式信息流（推特式版式）
 *   发帖（文字 / 配图 / 话题 / 引用新闻）、时间线四档排序、点赞 · 转发 · 收藏 · 回复、
 *   动态详情弹层、话题过滤、推荐关注、趋势榜。
 * 所有互动都落库到 /api/v1/square/*，刷新页面状态不丢。
 */
(function () {
  'use strict';

  const el = (id) => document.getElementById(id);
  const me = { uid: HY.uid(), name: HY.nick() };

  const ICON = {
    reply: '<svg viewBox="0 0 24 24"><path d="M11.3 4.3 4.6 11a1 1 0 0 0 0 1.4l6.7 6.7 1.4-1.4L7.4 12H14c4.4 0 6.6 2.3 6.6 6.6v1.4h-2v-1.4c0-3.3-1.3-4.6-4.6-4.6H7.4l5.3-5.7-1.4-1.4z"/></svg>',
    repost: '<svg viewBox="0 0 24 24"><path d="M7 4h9a3 3 0 0 1 3 3v6h-2V7a1 1 0 0 0-1-1H7V8.5L2.5 5.5 7 2.5V4zm10 16H8a3 3 0 0 1-3-3v-6h2v6a1 1 0 0 0 1 1h9v-1.5l4.5 3-4.5 3V20z"/></svg>',
    like: '<svg viewBox="0 0 24 24"><path d="M12 21s-7.6-4.6-9.6-9.2C1 8.4 3 5 6.4 5c1.9 0 3.3 1 4.1 2.2l1.5 2.1 1.5-2.1C14.3 6 15.7 5 17.6 5 21 5 23 8.4 21.6 11.8 19.6 16.4 12 21 12 21z"/></svg>',
    views: '<svg viewBox="0 0 24 24"><path d="M4 20V10h3v10H4zm6.5 0V4h3v16h-3zM17 20v-7h3v7h-3z"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.2L5 21V4a1 1 0 0 1 1-1z"/></svg>',
    verified: '<svg class="sq-verified" viewBox="0 0 24 24"><path d="M12 1.6l2.6 1.9 3.2-.2.9 3.1L21.3 8.3l-1.1 3 1.1 3-2.6 1.9-.9 3.1-3.2-.2L12 22.4l-2.6-1.9-3.2.2-.9-3.1L2.7 15.3l1.1-3-1.1-3 2.6-1.9.9-3.1 3.2.2L12 1.6z" fill="#1d9bf0"/><path fill="#fff" d="M10.7 15.4l-3-3 1.3-1.3 1.7 1.7 3.5-3.5 1.3 1.3-4.8 4.8z"/></svg>',
    search: '<svg viewBox="0 0 24 24"><path d="M10.5 3a7.5 7.5 0 1 1 4.72 13.36l4.21 4.21-1.42 1.42-4.21-4.21A7.5 7.5 0 0 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z"/></svg>'
  };

  const state = {
    site: null,
    sort: 'recommend',
    topic: '',
    handle: '',
    cursor: 0,
    pageSize: 10,
    hasMore: false,
    loading: false,
    items: [],
    following: [],
    assets: [],
    picked: [],
    quote: null,
    panel: ''
  };

  /* ------------------------------ 小工具 ------------------------------ */

  /** 请求时统一带上访客标识，服务端据此返回"我是否点过赞/转过/收藏过" */
  function api(path, params) {
    const url = new URL(path, location.origin);
    Object.entries(params || {}).forEach(([k, v]) => { if (v !== '' && v != null) url.searchParams.set(k, v); });
    url.searchParams.set('uid', me.uid);
    return HY.api(url.pathname + url.search);
  }

  /** 正文转义后把 #话题#、@账号、链接变成可点击元素 */
  function renderText(raw) {
    let html = HY.escapeHtml(raw || '');
    html = html.replace(/#([^#\s<]{1,20})#?/g, (m, t) => `<a href="javascript:void(0)" data-topic="${HY.escapeHtml(t)}">#${HY.escapeHtml(t)}#</a>`);
    html = html.replace(/@([A-Za-z0-9_]{2,32})/g, (m, h) => `<a href="javascript:void(0)" data-handle="${HY.escapeHtml(h)}">@${HY.escapeHtml(h)}</a>`);
    html = html.replace(/(https?:\/\/[^\s<]+)/g, (m) => `<a href="${m}" target="_blank" rel="noopener">${m}</a>`);
    return html;
  }

  function avatar(author, size) {
    const a = HY.avatarOf(author || {});
    return `<span class="sq-avatar${size ? ' ' + size : ''}" style="--av:${a.bg}" aria-hidden="true">${HY.escapeHtml(a.initial)}</span>`;
  }

  function postCard(p, fromModal) {
    const it = p.__it || {};
    const imgs = p.images || [];
    const media = imgs.length
      ? `<div class="sq-media n${imgs.length}">${imgs.map((u) => `<img src="${HY.escapeHtml(u)}" alt="" loading="lazy" data-zoom="${HY.escapeHtml(u)}">`).join('')}</div>`
      : '';
    const quote = p.quote
      ? `<a class="sq-quote" href="/article.html?id=${encodeURIComponent(p.quote.id)}">
           <img src="${HY.escapeHtml(p.quote.cover || '')}" alt="" loading="lazy">
           <div class="sq-quote-body">
             <h5>${HY.escapeHtml(p.quote.title)}</h5>
             <p>${HY.escapeHtml(p.quote.channelName || '')}${p.quote.source ? ' · ' + HY.escapeHtml(p.quote.source) : ''}</p>
           </div>
         </a>`
      : '';
    const banner = p.repostedBy
      ? `<div class="sq-repostline">${ICON.repost.replace('<svg', '<svg style="width:15px;height:15px;fill:currentColor"')} ${HY.escapeHtml(p.repostedBy.name)}${p.repostCount > 1 ? ` 等 ${p.repostCount} 人` : ''} 转发了</div>`
      : '';

    return `${banner}
      <article class="sq-post${p.repostedBy ? ' sq-post-repost' : ''}" data-id="${HY.escapeHtml(p.id)}">
        ${avatar(p.author)}
        <div class="sq-post-main">
          <div class="sq-post-head">
            <span class="sq-name">${HY.escapeHtml(p.author.name)}</span>
            ${p.author.verified ? ICON.verified : ''}
            ${p.author.handle ? `<span class="sq-handle">@${HY.escapeHtml(p.author.handle)}</span>` : ''}
            <span class="sq-time">· ${HY.timeAgo(p.feedAt || p.createdAt)}</span>
            ${p.pinned ? '<span class="sq-pin">📌 置顶</span>' : ''}
          </div>
          <div class="sq-text">${renderText(p.content)}</div>
          ${media}
          ${quote}
          <div class="sq-actions">
            <button class="sq-act reply" data-act="reply" data-id="${HY.escapeHtml(p.id)}" title="回复">${ICON.reply}<span>${HY.fmtNum(p.stats.replies)}</span></button>
            <button class="sq-act repost${it.repost ? ' on' : ''}" data-act="repost" data-id="${HY.escapeHtml(p.id)}" title="转发">${ICON.repost}<span>${HY.fmtNum(p.stats.reposts)}</span></button>
            <button class="sq-act like${it.like ? ' on' : ''}" data-act="like" data-id="${HY.escapeHtml(p.id)}" title="点赞">${ICON.like}<span>${HY.fmtNum(p.stats.likes)}</span></button>
            <button class="sq-act views" title="阅读量">${ICON.views}<span>${HY.fmtNum(p.stats.views)}</span></button>
            <button class="sq-act bookmark${it.bookmark ? ' on' : ''}" data-act="bookmark" data-id="${HY.escapeHtml(p.id)}" title="收藏">${ICON.bookmark}</button>
          </div>
        </div>
      </article>`;
  }

  /* ------------------------------ 时间线 ------------------------------ */

  async function loadFeed(reset) {
    if (state.loading) return;
    state.loading = true;
    if (reset) { state.cursor = 0; state.items = []; }
    try {
      const res = await api('/api/v1/square', {
        sort: state.sort, cursor: state.cursor, pageSize: state.pageSize,
        topic: state.topic, handle: state.handle
      });
      const list = res.list || [];
      const its = res.interactions || {};
      list.forEach((p) => { p.__it = its[p.id] || {}; });
      state.items = reset ? list : state.items.concat(list);
      state.cursor = res.nextCursor;
      state.hasMore = res.hasMore;
      renderFeed(res);
    } catch (e) {
      HY.toast('加载失败：' + e.message);
    } finally {
      state.loading = false;
    }
  }

  function renderFeed(res) {
    const host = el('sq-feed');
    if (!state.items.length) {
      host.innerHTML = res && res.needFollow
        ? `<div class="sq-empty"><b>还没关注任何账号</b>关注几个编辑部和创作者，这里就会热闹起来。
             <br><button class="btn ghost" id="empty-goto-who" type="button">去看推荐关注</button></div>`
        : `<div class="sq-empty"><b>这里还没有动态</b>成为第一个说话的人吧。</div>`;
      const goto = el('empty-goto-who');
      if (goto) goto.onclick = () => { state.sort = 'latest'; syncTabs(); loadFeed(true); };
      el('btn-more').hidden = true;
      return;
    }
    host.innerHTML = state.items.map((p) => postCard(p)).join('');
    el('btn-more').hidden = !state.hasMore;
  }

  async function loadMore() {
    if (!state.hasMore || state.loading) return;
    const btn = el('btn-more');
    btn.textContent = '加载中…';
    await loadFeed(false);
    btn.textContent = '加载更多';
    btn.hidden = !state.hasMore;
  }

  /* ------------------------------ 互动 ------------------------------ */

  function updateActions(postId) {
    const item = state.items.find((p) => p.id === postId);
    if (!item) return;
    document.querySelectorAll(`.sq-post[data-id="${postId}"]`).forEach((node) => {
      const s = item.stats;
      const set = (act, val) => { const t = node.querySelector(`.sq-act.${act} span`); if (t) t.textContent = HY.fmtNum(val); };
      set('reply', s.replies);
      set('repost', s.reposts);
      set('like', s.likes);
      set('views', s.views);
      ['repost', 'like', 'bookmark'].forEach((k) => {
        const btn = node.querySelector(`.sq-act.${k}`);
        if (btn) btn.classList.toggle('on', Boolean(item.__it[k]));
      });
    });
  }

  async function act(id, type, btn) {
    try {
      const res = await HY.api(`/api/v1/square/${id}/${type}`, {
        method: 'POST',
        body: { uid: me.uid, name: me.name }
      });
      const item = state.items.find((p) => p.id === id);
      if (item) {
        item.stats = res.stats;
        item.__it[type] = res.active;
        updateActions(id);
      }
      if (btn) { btn.classList.add('pop'); setTimeout(() => btn.classList.remove('pop'), 340); }
      if (type === 'repost') {
        HY.toast(res.active ? '已转发到你的关注者时间线' : '已取消转发');
        if (res.active) await loadFeed(true);
      }
      loadMe();
    } catch (e) {
      HY.toast(e.message);
    }
  }

  /* ------------------------------ 动态详情与回复 ------------------------------ */

  async function openDetail(id) {
    const modal = el('sq-modal');
    el('sq-modal-card').innerHTML = `<div class="sq-modal-head"><h4>动态详情</h4><button type="button" data-close="1">✕</button></div>
      <div class="sq-modal-body"><div class="skeleton" style="height:120px;margin:16px"></div></div>`;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    try {
      const res = await api(`/api/v1/square/${id}`);
      const p = res.post;
      p.__it = res.interactions || {};
      const replies = res.replies || [];
      el('sq-modal-card').innerHTML = `
        <div class="sq-modal-head"><h4>动态详情</h4><button type="button" data-close="1">✕</button></div>
        <div class="sq-modal-body">
          ${postCard(p, true)}
          <div class="sq-reply-form">
            ${avatar({ name: me.name })}
            <textarea id="reply-text" placeholder="发布你的回复" maxlength="500"></textarea>
            <button class="btn" id="reply-send" type="button">回复</button>
          </div>
          <div id="reply-list">
            ${replies.length
              ? replies.map((r) => `
                  <div class="sq-reply-item">
                    ${avatar({ name: r.user, handle: r.handle }, 'sq-avatar-sm')}
                    <div class="sq-reply-main">
                      <div class="who">${HY.escapeHtml(r.user)}<span>${r.handle ? '@' + HY.escapeHtml(r.handle) + ' · ' : ''}${HY.timeAgo(r.createdAt)}</span></div>
                      <div class="txt">${renderText(r.content)}</div>
                      <div class="ops"><button type="button" data-likereply="${HY.escapeHtml(r.id)}">♡ 赞 <span>${HY.fmtNum(r.likes || 0)}</span></button></div>
                    </div>
                  </div>`).join('')
              : '<div class="sq-empty" style="padding:26px">还没有回复，来说第一句。</div>'}
          </div>
        </div>`;

      el('reply-send').onclick = async () => {
        const text = el('reply-text').value.trim();
        if (!text) return HY.toast('回复内容不能为空');
        try {
          const out = await HY.api(`/api/v1/square/${id}/replies`, {
            method: 'POST', body: { uid: me.uid, name: me.name, content: text }
          });
          const item = state.items.find((x) => x.id === id);
          if (item) { item.stats = out.stats; updateActions(id); }
          HY.toast('回复成功');
          openDetail(id);
          loadMe();
        } catch (e) { HY.toast(e.message); }
      };
    } catch (e) {
      el('sq-modal-card').innerHTML = `<div class="sq-modal-head"><h4>动态详情</h4><button type="button" data-close="1">✕</button></div>
        <div class="sq-empty">${HY.escapeHtml(e.message)}</div>`;
    }
  }

  function closeModal() {
    el('sq-modal').hidden = true;
    document.body.style.overflow = '';
  }

  /* ------------------------------ 发帖框 ------------------------------ */

  function syncComposer() {
    const text = el('composer-text').value;
    const n = text.length;
    const counter = el('composer-counter');
    counter.textContent = `${n} / 280`;
    counter.className = 'sq-counter' + (n > 280 ? ' over' : n > 250 ? ' warn' : '');
    el('composer-submit').disabled = !(text.trim() || state.picked.length || state.quote) || n > 280;
    const ta = el('composer-text');
    ta.style.height = 'auto';
    ta.style.height = Math.min(260, Math.max(52, ta.scrollHeight)) + 'px';
  }

  function renderPicked() {
    const host = el('composer-picked');
    host.hidden = !state.picked.length;
    host.innerHTML = state.picked.map((u, i) => `
      <div class="thumb"><img src="${HY.escapeHtml(u)}" alt=""><button type="button" data-del="${i}">✕</button></div>`).join('');
    host.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = () => { state.picked.splice(Number(b.dataset.del), 1); renderPicked(); syncComposer(); syncPanel(); };
    });
  }

  function renderQuoteChip() {
    const host = el('composer-quote');
    host.hidden = !state.quote;
    const img = el('composer-quote-img');
    // 没有封面时移除 src，避免 img 退化成"请求当前页面"的裂图
    if (!state.quote || !state.quote.cover) img.removeAttribute('src');
    else img.src = state.quote.cover;
    if (!state.quote) return;
    el('composer-quote-title').textContent = state.quote.title;
  }

  async function openPanel(kind) {
    const host = el('composer-panel');
    if (state.panel === kind) { state.panel = ''; host.hidden = true; return; }
    state.panel = kind;
    host.hidden = false;
    host.innerHTML = '<div class="skeleton" style="height:90px"></div>';
    document.querySelectorAll('.sq-mini').forEach((b) => b.classList.toggle('active', b.dataset.tool === kind));

    if (kind === 'image') {
      if (!state.assets.length) state.assets = await HY.api('/api/v1/square/assets?size=21');
      host.innerHTML = `<h6>从站内高清素材库选图（最多 4 张）</h6>
        <div class="sq-asset-grid">${state.assets.map((u) => `<button type="button" data-img="${HY.escapeHtml(u)}" class="${state.picked.includes(u) ? 'on' : ''}"><img src="${HY.escapeHtml(u)}" alt="" loading="lazy"></button>`).join('')}</div>`;
      host.querySelectorAll('[data-img]').forEach((b) => {
        b.onclick = () => {
          const u = b.dataset.img;
          const i = state.picked.indexOf(u);
          if (i > -1) state.picked.splice(i, 1);
          else if (state.picked.length >= 4) return HY.toast('最多选择 4 张配图');
          else state.picked.push(u);
          b.classList.toggle('on', state.picked.includes(u));
          renderPicked();
          syncComposer();
        };
      });
      return;
    }

    if (kind === 'topic') {
      const topics = await api('/api/v1/square/topics', { size: 12 });
      host.innerHTML = `<h6>插入话题（也可以直接输入 #你的话题#）</h6>
        <div class="sq-asset-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
          ${topics.map((t) => `<button type="button" data-tp="${HY.escapeHtml(t.name)}" style="padding:8px;border:1px solid var(--line);border-radius:8px;background:#fff;font-size:13px">#${HY.escapeHtml(t.name)}#<br><small style="color:var(--text-4)">${t.posts} 条动态</small></button>`).join('')}
        </div>`;
      host.querySelectorAll('[data-tp]').forEach((b) => {
        b.onclick = () => {
          const ta = el('composer-text');
          ta.value = `${ta.value.trim()} #${b.dataset.tp}# `.trim() + ' ';
          ta.focus(); syncComposer();
        };
      });
      return;
    }

    if (kind === 'quote') {
      const res = await HY.api('/api/v1/news?pageSize=12&sort=hot');
      const list = (res && (res.list || res.items)) || [];
      host.innerHTML = `<h6>引用一条新闻（会在动态下方显示新闻卡片）</h6>
        <div class="sq-article-list">${list.map((a) => `
          <button type="button" data-quote="${HY.escapeHtml(a.id)}" class="${state.quote && state.quote.id === a.id ? 'on' : ''}">
            <img src="${HY.escapeHtml(a.cover || HY.imgOf(a, 160, 100))}" alt="" loading="lazy">
            <span>${HY.escapeHtml(a.title)}</span>
          </button>`).join('')}</div>`;
      const picked = list;
      host.querySelectorAll('[data-quote]').forEach((b) => {
        b.onclick = () => {
          const a = picked.find((x) => x.id === b.dataset.quote);
          state.quote = state.quote && state.quote.id === a.id ? null : { id: a.id, title: a.title, cover: a.cover };
          host.querySelectorAll('[data-quote]').forEach((x) => x.classList.toggle('on', Boolean(state.quote) && x.dataset.quote === state.quote.id));
          renderQuoteChip();
          syncComposer();
        };
      });
    }
  }

  /** 图片增删后只同步选图面板的选中态，不重新拉素材，避免闪动 */
  function syncPanel() {
    if (state.panel !== 'image') return;
    document.querySelectorAll('#composer-panel [data-img]').forEach((b) => {
      b.classList.toggle('on', state.picked.includes(b.dataset.img));
    });
  }

  async function submitPost(e) {
    e.preventDefault();
    const ta = el('composer-text');
    const text = ta.value.trim();
    if (!text && !state.picked.length && !state.quote) return HY.toast('写点什么，或者配一张图再发布');
    const btn = el('composer-submit');
    btn.disabled = true;
    btn.textContent = '发布中…';
    try {
      await HY.api('/api/v1/square', {
        method: 'POST',
        body: {
          uid: me.uid, name: me.name, content: text,
          images: state.picked, quoteId: state.quote ? state.quote.id : ''
        }
      });
      ta.value = '';
      state.picked = [];
      state.quote = null;
      state.panel = '';
      el('composer-panel').hidden = true;
      renderPicked(); renderQuoteChip(); syncComposer();
      document.querySelectorAll('.sq-mini').forEach((b) => b.classList.remove('active'));
      state.sort = 'latest'; syncTabs();
      await loadFeed(true);
      loadMe();
      HY.toast('发布成功');
    } catch (err) {
      HY.toast(err.message);
    } finally {
      btn.textContent = '发布';
      syncComposer();
    }
  }

  /* ------------------------------ 侧栏 ------------------------------ */

  async function loadMe() {
    el('me-name').textContent = me.name;
    el('me-handle').textContent = me.name === '匿名网友' ? '@未设置昵称' : '@' + me.uid;
    const a = HY.avatarOf({ name: me.name });
    el('me-avatar').style.setProperty('--av', a.bg);
    el('me-avatar').textContent = a.initial;
    const ca = HY.avatarOf({ name: me.name });
    el('composer-avatar').style.setProperty('--av', ca.bg);
    el('composer-avatar').textContent = ca.initial;
    try {
      const m = await api('/api/v1/square/mine');
      state.following = m.followingList || [];
      const items = [['动态', m.posts], ['获赞', HY.fmtNum(m.likes)], ['关注', m.following]];
      el('me-stats').innerHTML = items.map(([k, v]) => `<li><b>${v}</b><span>${k}</span></li>`).join('');
    } catch { /* 概览失败不影响主流程 */ }
  }

  async function loadSide() {
    try {
      const t = await api('/api/v1/square/trends');
      el('sq-trends').innerHTML = t.topics.length
        ? t.topics.map((x, i) => `<button type="button" data-topic="${HY.escapeHtml(x.name)}">
            <span class="no">${i + 1}</span>
            <span class="tp">#${HY.escapeHtml(x.name)}#<small>${x.posts} 条动态 · 热度 ${x.heat}</small></span>
          </button>`).join('')
        : '<div class="sq-empty" style="padding:20px">暂无话题</div>';

      const followed = new Set(state.following);
      el('sq-who').innerHTML = t.authors.map((a) => `
        <div class="sq-who-row">
          ${avatar({ name: a.name, handle: a.handle }, 'sq-avatar-sm')}
          <div class="sq-who-id"><b>${HY.escapeHtml(a.name)}${a.verified ? ' ✓' : ''}</b><span>@${HY.escapeHtml(a.handle)} · ${a.posts} 条动态</span></div>
          <button class="sq-follow${followed.has(a.handle) ? ' on' : ''}" type="button" data-follow="${HY.escapeHtml(a.handle)}">${followed.has(a.handle) ? '已关注' : '关注'}</button>
        </div>`).join('');

      el('sq-news').innerHTML = t.news.map((a) => `
        <a class="sq-news-item" href="/article.html?id=${encodeURIComponent(a.id)}">
          <b>${HY.escapeHtml(a.title)}</b>
          <img src="${HY.escapeHtml(a.cover || HY.imgOf(a, 160, 110))}" alt="" loading="lazy">
        </a>`).join('');
    } catch (e) {
      HY.toast('侧栏加载失败：' + e.message);
    }
  }

  function syncTabs() {
    document.querySelectorAll('#sq-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.sort === state.sort));
  }

  function showFilter() {
    const host = el('sq-filter');
    const label = state.topic ? `#${state.topic}#` : state.handle ? `@${state.handle}` : '';
    host.hidden = !label;
    if (!label) return;
    host.innerHTML = `<span>正在查看</span><b>${HY.escapeHtml(label)}</b>
      <button type="button" id="filter-clear">返回全部动态</button>`;
    el('filter-clear').onclick = () => {
      state.topic = ''; state.handle = '';
      el('sq-title').textContent = '广场';
      showFilter(); loadFeed(true);
    };
  }

  /* ------------------------------ 事件绑定 ------------------------------ */

  function bind() {
    el('sq-tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-sort]');
      if (!btn) return;
      state.sort = btn.dataset.sort;
      state.topic = ''; state.handle = '';
      el('sq-title').textContent = '广场';
      syncTabs(); showFilter(); loadFeed(true);
    });

    el('btn-more').onclick = loadMore;

    el('sq-feed').addEventListener('click', (e) => {
      const actBtn = e.target.closest('.sq-act');
      if (actBtn) {
        e.stopPropagation();
        const id = actBtn.dataset.id;
        const type = actBtn.dataset.act;
        if (type === 'reply') return openDetail(id);
        if (type === 'views') return;
        return act(id, type, actBtn);
      }
      const zoom = e.target.closest('[data-zoom]');
      if (zoom) {
        e.stopPropagation();
        el('sq-modal-card').innerHTML = `<div class="sq-modal-head"><h4>查看大图</h4><button type="button" data-close="1">✕</button></div>
          <img src="${zoom.dataset.zoom}" alt="" style="width:100%;display:block">`;
        el('sq-modal').hidden = false;
        document.body.style.overflow = 'hidden';
        return;
      }
      const topic = e.target.closest('[data-topic]');
      if (topic) {
        e.stopPropagation();
        state.topic = topic.dataset.topic; state.handle = ''; state.sort = 'latest';
        el('sq-title').textContent = `#${state.topic}#`;
        syncTabs(); showFilter(); loadFeed(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const handle = e.target.closest('[data-handle]');
      if (handle) {
        e.stopPropagation();
        state.handle = handle.dataset.handle; state.topic = ''; state.sort = 'latest';
        el('sq-title').textContent = `@${state.handle}`;
        syncTabs(); showFilter(); loadFeed(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const post = e.target.closest('.sq-post');
      if (post) openDetail(post.dataset.id);
    });

    document.querySelector('.sq-right').addEventListener('click', async (e) => {
      const topic = e.target.closest('[data-topic]');
      if (topic) {
        state.topic = topic.dataset.topic; state.handle = ''; state.sort = 'latest';
        el('sq-title').textContent = `#${state.topic}#`;
        syncTabs(); showFilter(); loadFeed(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const fb = e.target.closest('[data-follow]');
      if (!fb) return;
      try {
        const res = await HY.api('/api/v1/square/follow', { method: 'POST', body: { uid: me.uid, handle: fb.dataset.follow } });
        state.following = res.following || [];
        fb.classList.toggle('on', res.active);
        fb.textContent = res.active ? '已关注' : '关注';
        HY.toast(res.active ? '已关注，可在「关注」页看 TA 的动态' : '已取消关注');
        loadMe();
        if (state.sort === 'following') loadFeed(true);
      } catch (err) { HY.toast(err.message); }
    });

    el('sq-search').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = el('sq-search-input').value.trim();
      if (q) location.href = `/search.html?q=${encodeURIComponent(q)}`;
    });

    el('btn-edit-me').onclick = () => {
      const v = prompt('设置你的昵称（会显示在你的动态上）', me.name === '匿名网友' ? '' : me.name);
      if (v === null) return;
      me.name = v.trim() || '匿名网友';
      HY.setNick(me.name);
      loadMe();
      window.dispatchEvent(new Event('hy-nick-changed'));
    };

    el('btn-focus-composer').onclick = () => {
      el('composer-text').focus();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    el('composer').addEventListener('submit', submitPost);
    el('composer-text').addEventListener('input', syncComposer);
    el('composer-text').addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submitPost(e);
    });
    el('composer-quote-del').onclick = () => {
      state.quote = null; renderQuoteChip(); syncComposer();
      if (state.panel === 'quote') openPanel('quote');
    };
    document.querySelectorAll('.sq-mini').forEach((b) => { b.onclick = () => openPanel(b.dataset.tool); });

    // 弹层事件统一在这里委托，避免每次打开详情都重复绑定
    el('sq-modal').addEventListener('click', async (e) => {
      const lr = e.target.closest('[data-likereply]');
      if (lr) {
        e.stopPropagation();
        lr.disabled = true;
        try {
          const out = await HY.api(`/api/v1/square/replies/${lr.dataset.likereply}/like`, { method: 'POST', body: {} });
          lr.querySelector('span').textContent = HY.fmtNum(out.likes || 0);
        } catch (err) { HY.toast(err.message); }
        return;
      }
      if (e.target.closest('[data-close]') || e.target === el('sq-modal')) closeModal();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

    // 滚动到底自动加载下一页
    const sentinel = document.querySelector('.sq-more');
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && state.hasMore) loadMore();
      }, { rootMargin: '300px' }).observe(sentinel);
    }
  }

  /* ------------------------------ 启动 ------------------------------ */

  async function boot() {
    const tpl = document.getElementById('sq-tabs');
    if (tpl) syncTabs();
    try {
      state.site = await HY.api('/api/v1/site');
      HY.renderHeader(state.site, 'square');
      HY.renderFooter(state.site);
    } catch (e) {
      HY.toast('站点配置加载失败');
    }
    bind();
    syncComposer();
    // 先拿到"我的关注列表"，侧栏的关注按钮才能显示正确状态
    await loadMe();
    await Promise.all([loadSide(), loadFeed(true)]);
  }

  boot();
})();
