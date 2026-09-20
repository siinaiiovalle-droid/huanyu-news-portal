/* ==========================================================================
   公共前端工具与组件（供各页面复用）
   ========================================================================== */
(function (global) {
  'use strict';

  const API_BASE = '';

  /* ------------------------------ 工具函数 ------------------------------ */

  async function api(path, options = {}) {
    const res = await fetch(API_BASE + path, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
      body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (!res.ok) {
      const msg = (json && (json.message || json.error)) || `请求失败(${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return json && 'data' in json ? json.data : json;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function qs(name, def = '') {
    const v = new URLSearchParams(location.search).get(name);
    return v === null ? def : v;
  }

  /* ------------------------------ 频道配色（每个栏目一个专属色，保证正文与底色对比度） ------------------------------ */
  const CHANNEL_COLORS = {
    top: { c: '#b3261e', bg: '#fdeceb' },
    china: { c: '#b3261e', bg: '#fdeceb' },
    world: { c: '#0b4f9e', bg: '#e8f1fb' },
    finance: { c: '#8a4b07', bg: '#fdf2e3' },
    tech: { c: '#4338ca', bg: '#ecebfd' },
    sports: { c: '#07734a', bg: '#e5f6ee' },
    ent: { c: '#b3165a', bg: '#fdeaf2' },
    auto: { c: '#0b6f68', bg: '#e3f5f3' },
    culture: { c: '#7c4a03', bg: '#fbf1dd' },
    health: { c: '#0a6b8a', bg: '#e4f4fa' },
    video: { c: '#6d28d9', bg: '#f2ebfd' }
  };
  const FALLBACK_COLOR = { c: '#0b4f9e', bg: '#e8f1fb' };

  function chanColor(id) {
    return CHANNEL_COLORS[id] || FALLBACK_COLOR;
  }

  /** 频道彩色标签：让读者一眼看清"这条属于哪个栏目" */
  function chanTag(id, name, extraClass = '') {
    if (!name) return '';
    const col = chanColor(id);
    return `<span class="chan ${extraClass}" style="--c:${col.c};--cbg:${col.bg}">${escapeHtml(name)}</span>`;
  }

  /** 生成式头像：按 handle/昵称稳定取色并取首字，无需上传头像也不会出现破图 */
  const AVATAR_THEMES = [
    ['#0b4f9e', '#1467c6'], ['#4338ca', '#6d28d9'], ['#07734a', '#12a86c'],
    ['#b3261e', '#e0523c'], ['#8a4b07', '#c2760c'], ['#0a6b8a', '#0e93b8'],
    ['#b3165a', '#d94389'], ['#0b6f68', '#12a09a']
  ];

  function avatarOf(who) {
    const key = String((who && (who.handle || who.name)) || '匿名网友');
    let h = 0;
    for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    const [c1, c2] = AVATAR_THEMES[h % AVATAR_THEMES.length];
    const ch = key.replace(/^u_/i, '').trim();
    const initial = /^[a-z0-9]/i.test(ch) ? ch.slice(0, 1).toUpperCase() : (ch.slice(0, 1) || '网');
    return { initial, bg: `linear-gradient(140deg, ${c2}, ${c1})` };
  }

  /** 占位图 URL：w/h 可选，默认 800×450（静态版由 static-shim 换成内联 SVG，走 ph 才能被接管） */
  function ph(text, theme, w, h) {
    return `./api/v1/placeholder?w=${w || 800}&h=${h || 450}&text=${encodeURIComponent(text || '寰宇新闻网')}${theme ? `&theme=${theme}` : ''}`;
  }

  function imgOf(item, w, h) {
    if (!item) return ph('', 'slate');
    if (item.cover) return item.cover;
    const block = (item.content || []).find((b) => b.type === 'image');
    if (block) return block.src;
    if (item.video && item.video.poster) return item.video.poster;
    return `./api/v1/placeholder?w=${w || 800}&h=${h || 450}&text=${encodeURIComponent((item.title || '').slice(0, 14))}`;
  }

  function timeAgo(iso) {
    const t = Date.parse(iso);
    if (!Number.isNaN(t) && Date.now() - t < 0) return fmtTime(iso);
    const diff = Date.now() - t;
    if (Number.isNaN(t)) return '';
    const m = Math.floor(diff / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return `${m} 分钟前`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} 小时前`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d} 天前`;
    return fmtTime(iso, false);
  }

  function fmtTime(iso, withTime = true) {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    const date = `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
    return withTime ? `${date} ${p(dt.getHours())}:${p(dt.getMinutes())}` : date;
  }

  function fmtNum(n) {
    n = Number(n) || 0;
    if (n >= 100000000) return (n / 100000000).toFixed(1) + ' 亿';
    if (n >= 10000) return (n / 10000).toFixed(1) + ' 万';
    return String(n);
  }

  function toast(msg, ms = 2000) {
    let el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), ms);
  }

  function uid() {
    let id = localStorage.getItem('hy_uid');
    if (!id) {
      id = 'u_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('hy_uid', id);
    }
    return id;
  }

  function nick() {
    return localStorage.getItem('hy_nick') || '匿名网友';
  }

  function setNick(v) {
    localStorage.setItem('hy_nick', v || '匿名网友');
  }

  function nowText() {
    const d = new Date();
    const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${week}`;
  }

  /* ------------------------------ 组件 ------------------------------ */

  function renderHeader(site, active) {
    const host = document.getElementById('site-header');
    if (!host) return;
    const navIds = (site.nav && site.nav.length ? site.nav : ['china', 'world', 'finance', 'tech', 'sports', 'ent', 'auto', 'culture', 'health', 'video']);
    const channels = (site.channels || []).filter((c) => navIds.includes(c.id));
    const order = navIds.map((id) => channels.find((c) => c.id === id)).filter(Boolean);
    host.innerHTML = `
      <div class="topbar">
        <div class="container">
          <div class="topbar-left">
            <span>${nowText()}</span>
            <span class="dot"></span>
            <a href="./">首页</a>
            <a href="./video.html">视频</a>
            <a href="./mall.html">严选商城</a>
            <span class="dot"></span>
            <a href="./admin.html">内容后台</a>
          </div>
          <div class="topbar-right">
            <span class="hide-sm">${escapeHtml(site.slogan || '')}</span>
            <a href="./api/v1/home" target="_blank">开放API</a>
          </div>
        </div>
      </div>
      <div class="header-main container">
        <a class="logo" href="./">
          <span class="logo-mark">${escapeHtml((site.logoText || '寰宇').slice(0, 2))}</span>
          <span>
            <span class="logo-text">${escapeHtml(site.siteName || '寰宇新闻网')}</span>
            <div class="logo-sub">HUANYU NEWS</div>
          </span>
        </a>
        <form class="search-box" id="search-form">
          <input type="search" name="q" placeholder="搜索新闻、话题、关键词…" value="${escapeHtml(qs('q'))}">
          <button type="submit" aria-label="搜索">🔍</button>
        </form>
        <div class="header-actions">
          <button class="btn-app" id="btn-subscribe">App / 小程序</button>
        </div>
      </div>
      <nav class="nav container">
        <a href="./" class="${!active ? 'active' : ''}">要闻</a>
        <a href="./mall.html" class="${active === 'mall' ? 'active' : ''}">严选商城</a>
        ${order.map((c) => `<a href="${c.isSocial ? './square.html' : `./channel.html?id=${encodeURIComponent(c.id)}`}" class="${active === c.id ? 'active' : ''}">${escapeHtml(c.name)}</a>`).join('')}
      </nav>`;
    const form = document.getElementById('search-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = form.q.value.trim();
      if (q) location.href = `./search.html?q=${encodeURIComponent(q)}`;
    });
    document.getElementById('btn-subscribe').addEventListener('click', () => {
      toast('App 与小程序端正在开发中，敬请期待，届时新闻内容将同步互通');
    });
  }

  function renderFooter(site) {
    const host = document.getElementById('site-footer');
    if (!host) return;
    const year = new Date().getFullYear();
    host.innerHTML = `
      <div class="footer-top container">
        <div class="footer-col">
          <h5>${escapeHtml(site.company || '')}</h5>
          <p style="margin:0;max-width:420px;line-height:1.9;">${escapeHtml(site.slogan || '')}</p>
        </div>
        <div class="footer-col">
          <h5>内容频道</h5>
          <ul>
            <li><a href="./channel.html?id=china">国内</a> · <a href="./channel.html?id=world">国际</a> · <a href="./channel.html?id=finance">财经</a></li>
            <li><a href="./channel.html?id=tech">科技</a> · <a href="./channel.html?id=sports">体育</a> · <a href="./channel.html?id=ent">娱乐</a></li>
            <li><a href="./channel.html?id=auto">汽车</a> · <a href="./channel.html?id=culture">文化</a> · <a href="./channel.html?id=health">健康</a></li>
            <li><a href="./square.html">广场</a> · <a href="./video.html">视频频道</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h5>开放平台</h5>
          <ul>
            <li><a href="./api/v1/home" target="_blank">门户数据接口</a></li>
            <li><a href="./api/v1/feed" target="_blank">App 信息流接口</a></li>
            <li><a href="./api/v1/sync" target="_blank">增量同步接口</a></li>
            <li><a href="./api/v1/square" target="_blank">广场信息流接口</a></li>
            <li><a href="./admin.html">内容运营后台</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h5>关于我们</h5>
          <ul>
            <li><a href="./mall.html">寰宇严选 · 买手好物</a></li>
            <li>新闻热线：400-000-0000</li>
            <li>商务合作：bd@huanyu.example</li>
            <li>内容纠错：editor@huanyu.example</li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom container">
        <div>Copyright © 2015-${year} ${escapeHtml(site.copyright || '')} 版权所有</div>
        <div>${escapeHtml(site.icp || '')} · 互联网新闻信息服务许可：（示例）00000000 号 · 本站为演示站点，内容均为示例稿件</div>
      </div>`;
  }

  /** 新闻列表项 */
  function newsItem(item, opts = {}) {
    const showDesc = opts.showDesc !== false;
    const showPic = opts.showPic !== false;
    const badges = [];
    if (item.flags && item.flags.headline) badges.push('<span class="badge focus">头条</span>');
    if (item.flags && item.flags.hot) badges.push('<span class="badge hot">热点</span>');
    if (item.flags && item.flags.blast) badges.push('<span class="badge hot">爆款</span>');
    if (item.hasVideo) badges.push('<span class="badge video">视频</span>');
    if (Date.now() - Date.parse(item.publishedAt) < 3600000 * 6) badges.push('<span class="badge new">最新</span>');
    const tags = (item.tags || []).slice(0, 3).map((t) => `<span># ${escapeHtml(t)}</span>`).join('');
    const src = item.source && item.source !== item.channelName ? `<span class="src">${escapeHtml(item.source)}</span>` : '';
    return `
      <li>
        <div class="news-item${showPic ? '' : ' no-pic'}">
          <div>
            <h3><span class="badges">${badges.join('')}</span><a href="./article.html?id=${encodeURIComponent(item.id)}">${escapeHtml(item.title)}</a></h3>
            ${showDesc && item.summary ? `<p class="desc">${escapeHtml(item.summary)}</p>` : ''}
            <div class="meta">
              ${chanTag(item.channel, item.channelName)}
              ${src}
              <span>${timeAgo(item.publishedAt)}</span>
              <span>阅读 ${fmtNum(item.stats && item.stats.views)}</span>
              <span>评论 ${fmtNum(item.stats && item.stats.comments)}</span>
            </div>
            ${tags ? `<div class="tagline">${tags}</div>` : ''}
          </div>
          ${showPic ? `<a href="./article.html?id=${encodeURIComponent(item.id)}"><img src="${escapeHtml(imgOf(item))}" alt="${escapeHtml(item.title)}" loading="lazy"></a>` : ''}
        </div>
      </li>`;
  }

  /** 榜单列表 */
  function rankList(items, heatKey = 'hotScore') {
    if (!items || !items.length) return '<div class="empty">暂无数据</div>';
    return `<ul class="rank-list">${items.map((it, i) => {
      const cls = i === 0 ? 'n1' : i === 1 ? 'n2' : i === 2 ? 'n3' : '';
      const heat = it[heatKey] != null ? fmtNum(Math.round(it[heatKey])) : '';
      return `<li>
        <span class="rank-no ${cls}">${i + 1}</span>
        <a class="rank-title" href="./article.html?id=${encodeURIComponent(it.id)}">${escapeHtml(it.title)}</a>
        ${heat ? `<span class="rank-heat">${heat}</span>` : ''}
      </li>`;
    }).join('')}</ul>`;
  }

  /** 视频卡片 */
  function videoCard(item) {
    const poster = (item.video && item.video.poster) || item.cover || imgOf(item);
    const duration = (item.video && item.video.duration) || '';
    return `
      <a class="video-card" href="./article.html?id=${encodeURIComponent(item.id)}">
        <div class="video-thumb">
          <img src="${escapeHtml(poster)}" alt="${escapeHtml(item.title)}" loading="lazy">
          <span class="play">▶</span>
          ${duration ? `<span class="video-duration">${escapeHtml(duration)}</span>` : ''}
        </div>
        <div class="video-card-body">
          <h4>${escapeHtml(item.title)}</h4>
          <div class="meta">${chanTag(item.channel, item.channelName || '视频')}<span>${fmtNum(item.stats && item.stats.views)} 次播放</span></div>
        </div>
      </a>`;
  }

  /** 分页组件 */
  function renderPagination(host, current, total, onGo) {
    if (!host) return;
    if (total <= 1) { host.innerHTML = ''; return; }
    const pages = [];
    const push = (p) => { if (p >= 1 && p <= total && !pages.includes(p)) pages.push(p); };
    [1, current - 2, current - 1, current, current + 1, current + 2, total].forEach(push);
    pages.sort((a, b) => a - b);
    let html = `<button ${current === 1 ? 'disabled' : ''} data-go="${current - 1}">上一页</button>`;
    let prev = 0;
    pages.forEach((p) => {
      if (prev && p - prev > 1) html += '<button disabled>…</button>';
      html += `<button class="${p === current ? 'active' : ''}" data-go="${p}">${p}</button>`;
      prev = p;
    });
    html += `<button ${current === total ? 'disabled' : ''} data-go="${current + 1}">下一页</button>`;
    host.innerHTML = html;
    host.querySelectorAll('button[data-go]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = Number(btn.dataset.go);
        if (p >= 1 && p <= total && p !== current) onGo(p);
      });
    });
  }

  /** 文章互动（点赞 / 收藏 / 分享） */
  async function interact(articleId, type) {
    try {
      const r = await api('./api/v1/interact', { method: 'POST', body: { articleId, type, uid: uid() } });
      if (type === 'share') return true;
      toast(r.active ? (type === 'like' ? '点赞成功' : '已加入收藏') : (type === 'like' ? '已取消点赞' : '已取消收藏'));
      return r.active;
    } catch (e) {
      toast(e.message);
      return null;
    }
  }

  function trackView(articleId) {
    try { api(`./api/v1/news/${encodeURIComponent(articleId)}`); } catch { /* ignore */ }
  }

  global.HY = {
    api, escapeHtml, qs, ph, imgOf, timeAgo, fmtTime, fmtNum, toast, uid, nick, setNick,
    chanTag, chanColor, avatarOf,
    renderHeader, renderFooter, newsItem, rankList, videoCard, renderPagination, interact, trackView
  };
})(window);
