/* AI 前沿技术瞭望台栏目页逻辑 */
(function () {
  'use strict';

  let page = Number(HY.qs('page', 1)) || 1;

  async function boot() {
    const site = await HY.api('/api/v1/site');
    HY.renderHeader(site, 'ai');
    HY.renderFooter(site);
    const ch = (site.channels || []).find((c) => c.id === 'ai');
    if (ch && ch.fullName) document.getElementById('ai-crumb').textContent = ch.fullName;
    load();
  }

  function link(a) {
    return `/article.html?id=${encodeURIComponent(a.id)}`;
  }

  function renderStats(stats, channel) {
    const s = stats || {};
    document.getElementById('ai-stats').innerHTML = [
      `<span><b>${HY.fmtNum(s.total || 0)}</b> 篇在架</span>`,
      `<span><b>${HY.fmtNum(s.week || 0)}</b> 篇近七日</span>`,
      `<span><b>${HY.fmtNum(s.tracks || 0)}</b> 条赛道</span>`,
      `<span><b>${HY.fmtNum(s.today || 0)}</b> 篇今日更新</span>`
    ].join('');
    if (channel && channel.desc) {
      document.getElementById('ai-updated').textContent = channel.desc;
    }
  }

  function renderTracksMini(tracks) {
    const host = document.getElementById('ai-tracks-mini');
    if (!tracks || !tracks.length) {
      host.innerHTML = '<li class="empty" style="padding:8px 0">暂无赛道数据</li>';
      return;
    }
    host.innerHTML = tracks.map((t) => `
      <li><span>${HY.escapeHtml(t.name)}</span><em>${t.list.length} 条</em></li>`).join('');
  }

  function renderLead(lead) {
    const host = document.getElementById('ai-lead');
    if (!lead) {
      host.innerHTML = '<div class="empty">栏目暂无内容，稍后由采集流水线补充</div>';
      return;
    }
    host.innerHTML = `
      <a class="ai-lead-card" href="${link(lead)}">
        <div class="ai-lead-thumb"><img src="${HY.escapeHtml(HY.imgOf(lead, 640, 360))}" alt="${HY.escapeHtml(lead.title)}"></div>
        <div class="ai-lead-body">
          <div class="ai-lead-tag">瞭望头条</div>
          <h3>${HY.escapeHtml(lead.title)}</h3>
          <p>${HY.escapeHtml(lead.summary || '')}</p>
          <div class="meta">
            ${HY.chanTag(lead.channel, lead.channelName || 'AI瞭望台')}
            ${lead.source ? `<span class="src">${HY.escapeHtml(lead.source)}</span>` : ''}
            <span>${HY.timeAgo(lead.publishedAt)}</span>
            <span>阅读 ${HY.fmtNum(lead.stats && lead.stats.views)}</span>
          </div>
        </div>
      </a>`;
  }

  function renderTracks(tracks) {
    const host = document.getElementById('ai-tracks');
    if (!tracks || !tracks.length) {
      host.innerHTML = '<div class="empty">暂无赛道内容</div>';
      return;
    }
    host.innerHTML = tracks.map((t) => `
      <div class="track-card">
        <div class="track-head">
          <h4>${HY.escapeHtml(t.name)}</h4>
          <p>${HY.escapeHtml(t.desc || '')}</p>
        </div>
        <ul class="track-list">
          ${t.list.map((a) => `<li><a href="${link(a)}">${HY.escapeHtml(a.title)}</a><span>${HY.timeAgo(a.publishedAt)}</span></li>`).join('')}
        </ul>
      </div>`).join('');
  }

  function renderTimeline(timeline) {
    const host = document.getElementById('ai-timeline');
    if (!timeline || !timeline.length) {
      host.innerHTML = '<div class="empty" style="padding:20px 0">暂无更新</div>';
      return;
    }
    host.innerHTML = timeline.map((g) => `
      <div class="tl-group">
        <div class="tl-date">${HY.escapeHtml(g.date)}</div>
        <ul>
          ${g.items.slice(0, 4).map((a) => `<li><a href="${link(a)}">${HY.escapeHtml(a.title)}</a></li>`).join('')}
          ${g.items.length > 4 ? `<li class="tl-more">当日另有 ${g.items.length - 4} 条</li>` : ''}
        </ul>
      </div>`).join('');
  }

  function renderTags(tags) {
    const host = document.getElementById('ai-tags');
    if (!tags || !tags.length) {
      host.innerHTML = '<div class="empty" style="padding:12px 0">暂无热词</div>';
      return;
    }
    host.innerHTML = tags.map((t) =>
      `<a href="/search.html?q=${encodeURIComponent(t.name)}"># ${HY.escapeHtml(t.name)} <em>${t.count}</em></a>`).join('');
  }

  async function load() {
    const list = document.getElementById('ai-list');
    list.innerHTML = '<li class="empty">加载中…</li>';
    try {
      const res = await HY.api(`/api/v1/ai?page=${page}&pageSize=12`);
      renderStats(res.stats, res.channel);
      renderTracksMini(res.tracks);
      renderLead(res.lead);
      renderTracks(res.tracks);

      const items = res.list || [];
      const pg = res.pagination || { page, pageSize: 12, total: items.length, totalPages: 1 };
      document.getElementById('ai-count').textContent = `共 ${pg.total} 篇 · 第 ${pg.page} / ${pg.totalPages} 页`;
      list.innerHTML = items.length ? items.map((it) => HY.newsItem(it)).join('') : '<li class="empty">本栏目还没有稿件，采集流水线会持续补充</li>';
      HY.renderPagination(document.getElementById('ai-pagination'), pg.page, pg.totalPages, (p) => {
        page = p;
        load();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });

      document.getElementById('ai-hot').innerHTML = HY.rankList(res.hot, 'hotScore');
      renderTags(res.tags);
      renderTimeline(res.timeline);
    } catch (e) {
      list.innerHTML = `<li class="empty">加载失败：${HY.escapeHtml(e.message)}</li>`;
      document.getElementById('ai-hot').innerHTML = '<div class="empty">加载失败</div>';
    }
  }

  boot();
})();
