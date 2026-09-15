/* 视频频道页逻辑 */
(function () {
  'use strict';

  let page = Number(HY.qs('page', 1)) || 1;

  async function boot() {
    const site = await HY.api('./api/v1/site');
    HY.renderHeader(site, 'video');
    HY.renderFooter(site);
    load();
  }

  async function load() {
    const grid = document.getElementById('video-grid');
    grid.innerHTML = '<div class="skeleton" style="height:180px"></div><div class="skeleton" style="height:180px"></div><div class="skeleton" style="height:180px"></div>';
    try {
      const res = await HY.api(`./api/v1/video?page=${page}&pageSize=12`);
      document.getElementById('video-count').textContent = `共 ${res.list.length} 条 · 第 ${page} 页`;
      grid.innerHTML = res.list.length ? res.list.map(HY.videoCard).join('') : '<div class="empty">暂无视频内容</div>';
      const totalPages = res.list.length < 12 ? page : page + 1;
      HY.renderPagination(document.getElementById('video-pagination'), page, totalPages, (p) => {
        page = p;
        load();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      document.getElementById('video-hot').innerHTML = HY.rankList(res.hot, 'hotScore');
    } catch (e) {
      grid.innerHTML = `<div class="empty">加载失败：${HY.escapeHtml(e.message)}</div>`;
    }

    try {
      const news = await HY.api('./api/v1/news?pageSize=6&sort=new');
      document.getElementById('video-news').innerHTML = news.list.map((it) => HY.newsItem(it, { showPic: false })).join('');
    } catch { /* ignore */ }
  }

  boot();
})();
