/* 频道页渲染逻辑 */
(function () {
  'use strict';

  const channelId = HY.qs('id', 'china');
  let currentPage = Number(HY.qs('page', 1)) || 1;
  let sort = HY.qs('sort', 'new');

  async function boot() {
    const site = await HY.api('./api/v1/site');
    // 广场等社交型栏目由独立页面承载，误入 /channel.html 时自动跳转
    const social = (site.channels || []).find((c) => c.id === channelId && c.isSocial);
    if (social) { location.replace('./square.html'); return; }
    HY.renderHeader(site, channelId);
    HY.renderFooter(site);
    document.getElementById('sort-select').value = sort;
    document.getElementById('sort-select').addEventListener('change', (e) => {
      sort = e.target.value;
      currentPage = 1;
      load();
    });
    load();
  }

  async function load() {
    const host = document.getElementById('channel-list');
    host.innerHTML = '<li class="empty">加载中…</li>';
    history.replaceState(null, '', `?id=${channelId}&page=${currentPage}&sort=${sort}`);
    try {
      const res = await HY.api(`./api/v1/channel/${channelId}?page=${currentPage}&pageSize=20&sort=${sort}`);
      const c = res.channel;
      document.title = `${c.name} - 寰宇新闻网`;
      const titleEl = document.getElementById('channel-title');
      titleEl.textContent = `${c.name}频道`;
      titleEl.style.setProperty('--c', HY.chanColor(c.id).c);
      document.getElementById('channel-desc').textContent = c.desc || '';
      document.getElementById('crumb').innerHTML = `<a href="./">首页</a> › ${HY.escapeHtml(c.name)}`;

      host.innerHTML = res.list.length
        ? res.list.map((it, i) => HY.newsItem(it, { showDesc: true, showPic: i < 8 })).join('')
        : '<li class="empty">该频道暂无内容</li>';

      HY.renderPagination(document.getElementById('channel-pagination'), res.pagination.page, res.pagination.totalPages, (p) => {
        currentPage = p;
        load();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });

      document.getElementById('channel-hot').innerHTML = HY.rankList(res.hot);
      document.getElementById('channel-recommend').innerHTML = HY.rankList(res.recommend, 'hotScore');
    } catch (e) {
      host.innerHTML = `<li class="empty">加载失败：${HY.escapeHtml(e.message)}</li>`;
    }
  }

  boot();
})();
