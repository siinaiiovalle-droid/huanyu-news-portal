/* 首页渲染逻辑 */
(function () {
  'use strict';

  async function boot() {
    let site = {};
    try {
      site = await HY.api('/api/v1/site');
    } catch (e) {
      HY.toast('站点信息加载失败');
    }
    HY.renderHeader(site, '');
    HY.renderFooter(site);

    let data;
    try {
      data = await HY.api('/api/v1/home');
    } catch (e) {
      document.getElementById('hero').innerHTML = `<div class="empty">内容加载失败：${HY.escapeHtml(e.message)}</div>`;
      return;
    }

    renderHero(data.headlines);
    renderFlash(data.latest, data.generatedAt);
    renderLatest(data.latest);
    renderChannelBlocks(data.channels.filter((c) => c.id !== 'video'), data);
    renderFocus(data.focus);
    renderHot(data.hot);
    renderBlast(data.blast);
    renderVideos(data.videos);
    renderTags(data.tags);
    renderPictures(data.pictures);
  }

  function renderHero(h) {
    const host = document.getElementById('hero');
    if (!h || !h.lead) {
      host.innerHTML = '<div class="empty">暂无头条内容</div>';
      return;
    }
    const lead = h.lead;
    host.innerHTML = `
      <a class="hero-lead" href="/article.html?id=${encodeURIComponent(lead.id)}">
        <img src="${HY.escapeHtml(HY.imgOf(lead))}" alt="${HY.escapeHtml(lead.title)}">
        <div class="hero-lead-body">
          <span class="tag-hot">头条</span>
          <h2>${HY.escapeHtml(lead.title)}</h2>
          <p>${HY.escapeHtml(lead.summary || '')}</p>
          <div class="meta" style="color:rgba(255,255,255,.95);margin-top:8px;">
            ${HY.chanTag(lead.channel, lead.channelName, 'on-dark')}
            <span>${HY.timeAgo(lead.publishedAt)}</span>
            <span>阅读 ${HY.fmtNum(lead.stats && lead.stats.views)}</span>
          </div>
        </div>
      </a>
      <div class="hero-list">
        ${(h.list || []).map((it) => `
          <div class="hero-item">
            <div>
              <h3><a href="/article.html?id=${encodeURIComponent(it.id)}">${HY.escapeHtml(it.title)}</a></h3>
              <p>${HY.escapeHtml(it.summary || '')}</p>
              <div class="meta">${HY.chanTag(it.channel, it.channelName)}<span>${HY.timeAgo(it.publishedAt)}</span></div>
            </div>
            <a href="/article.html?id=${encodeURIComponent(it.id)}"><img src="${HY.escapeHtml(HY.imgOf(it))}" alt="${HY.escapeHtml(it.title)}" loading="lazy"></a>
          </div>`).join('')}
      </div>`;
  }

  /** 快讯条：每 4 秒向上滚动一条，鼠标悬停暂停；末尾追加首条实现无缝循环 */
  function renderFlash(list, generatedAt) {
    const host = document.getElementById('flash');
    if (!host) return;
    const items = (list || []).slice(0, 8);
    if (!items.length) return;
    host.hidden = false;

    const line = (it) => `<li>
      <span class="t">${HY.escapeHtml((HY.fmtTime(it.publishedAt) || '').slice(11) || '刚刚')}</span>
      <a href="/article.html?id=${encodeURIComponent(it.id)}">${HY.escapeHtml(it.title)}</a>
    </li>`;
    const ul = document.getElementById('flash-list');
    ul.innerHTML = items.map(line).join('') + line(items[0]);

    if (generatedAt) {
      const t = HY.fmtTime(generatedAt);
      document.getElementById('flash-updated').textContent = t ? `更新于 ${t.slice(11)}` : '';
    }

    let i = 0;
    let paused = false;
    host.addEventListener('mouseenter', () => { paused = true; });
    host.addEventListener('mouseleave', () => { paused = false; });
    setInterval(() => {
      if (paused || document.hidden) return;
      i += 1;
      ul.style.transition = 'transform .5s ease';
      ul.style.transform = `translateY(-${i * 24}px)`;
      if (i >= items.length) {
        setTimeout(() => {
          ul.style.transition = 'none';
          ul.style.transform = 'translateY(0)';
          i = 0;
        }, 520);
      }
    }, 4000);
  }

  function renderLatest(list) {
    const host = document.getElementById('latest-list');
    host.innerHTML = list && list.length ? list.map((it) => HY.newsItem(it)).join('') : '<li class="empty">暂无内容</li>';
  }

  function renderChannelBlocks(channels, data) {
    const host = document.getElementById('channel-blocks');
    // 首页按频道拉取各频道前 6 条，保证多频道信息流
    const wanted = channels.filter((c) => !['video'].includes(c.id)).slice(0, 9);
    host.innerHTML = wanted.map((c) => {
      const col = HY.chanColor(c.id);
      return `
      <div class="card" data-channel="${c.id}" style="--c:${col.c}">
        <div class="card-head">
          <div class="card-title">${HY.escapeHtml(c.name)}</div>
          <a class="card-more" href="/channel.html?id=${c.id}">更多${HY.escapeHtml(c.name)} ›</a>
        </div>
        <ul class="news-list" data-list="${c.id}"><li class="empty">加载中…</li></ul>
      </div>`;
    }).join('');

    wanted.forEach(async (c) => {
      try {
        const res = await HY.api(`/api/v1/news?channel=${c.id}&pageSize=6`);
        const ul = host.querySelector(`ul[data-list="${c.id}"]`);
        if (!ul) return;
        ul.innerHTML = res.list.length
          ? res.list.map((it, i) => HY.newsItem(it, { showDesc: i === 0, showPic: i < 2 })).join('')
          : '<li class="empty">该频道暂无内容</li>';
      } catch { /* ignore */ }
    });
  }

  function renderFocus(list) {
    const host = document.getElementById('focus-grid');
    host.innerHTML = list && list.length ? list.map((it) => `
      <a class="focus-card" href="/article.html?id=${encodeURIComponent(it.id)}">
        <img src="${HY.escapeHtml(HY.imgOf(it))}" alt="${HY.escapeHtml(it.title)}" loading="lazy">
        <div class="focus-card-body">
          <h4>${HY.escapeHtml(it.title)}</h4>
          <div class="meta">${HY.chanTag(it.channel, it.channelName)}<span>${HY.timeAgo(it.publishedAt)}</span></div>
        </div>
      </a>`).join('') : '<div class="empty">暂无专题</div>';
  }

  function renderHot(list) {
    document.getElementById('hot-rank').innerHTML = HY.rankList(list, 'hotScore');
    document.getElementById('hot-updated').textContent = '刚刚更新';
  }

  function renderBlast(list) {
    document.getElementById('blast-rank').innerHTML = HY.rankList(list, 'blastScore');
  }

  function renderVideos(list) {
    const host = document.getElementById('video-mini');
    if (!list || !list.length) { host.innerHTML = '<div class="empty">暂无视频</div>'; return; }
    host.innerHTML = list.slice(0, 4).map((it) => `
      <a class="hero-item" style="grid-template-columns:132px minmax(0,1fr);border-bottom:1px dashed var(--line);padding-bottom:10px;" href="/article.html?id=${encodeURIComponent(it.id)}">
        <span style="position:relative;display:block;">
          <img src="${HY.escapeHtml((it.video && it.video.poster) || HY.imgOf(it))}" alt="${HY.escapeHtml(it.title)}" style="width:132px;height:78px;object-fit:cover;border-radius:6px;" loading="lazy">
          <span style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:30px;height:30px;border-radius:50%;background:rgba(0,0,0,.5);color:#fff;display:grid;place-items:center;font-size:12px;">▶</span>
        </span>
        <span>
          <h3 style="font-size:14.5px;margin:0 0 6px;">${HY.escapeHtml(it.title)}</h3>
          <span class="meta"><span>${HY.fmtNum(it.stats && it.stats.views)} 次播放</span></span>
        </span>
      </a>`).join('');
  }

  function renderTags(tags) {
    const host = document.getElementById('tag-cloud');
    host.innerHTML = (tags || []).map((t) => `<a href="/search.html?q=${encodeURIComponent(t.name)}"># ${HY.escapeHtml(t.name)}</a>`).join('') || '<div class="empty">暂无话题</div>';
  }

  function renderPictures(list) {
    const host = document.getElementById('picture-grid');
    host.innerHTML = (list || []).map((it) => `
      <a class="focus-card" href="/article.html?id=${encodeURIComponent(it.id)}">
        <img src="${HY.escapeHtml(HY.imgOf(it))}" alt="${HY.escapeHtml(it.title)}" loading="lazy">
        <div class="focus-card-body">
          <h4>${HY.escapeHtml(it.title)}</h4>
          <div class="meta"><span>图集</span>${HY.chanTag(it.channel, it.channelName)}</div>
        </div>
      </a>`).join('') || '<div class="empty">暂无图集</div>';
  }

  boot();
})();
