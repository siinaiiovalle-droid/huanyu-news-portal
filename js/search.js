/* 搜索页逻辑 */
(function () {
  'use strict';

  const keyword = HY.qs('q');
  let page = Number(HY.qs('page', 1)) || 1;

  async function boot() {
    const site = await HY.api('./api/v1/site');
    HY.renderHeader(site, '');
    HY.renderFooter(site);
    if (!keyword) {
      document.getElementById('search-title').textContent = '请输入关键词';
      document.getElementById('search-list').innerHTML = '<li class="empty">在上方搜索框输入关键词，检索全站新闻、话题与视频</li>';
    } else {
      load();
    }
    HY.api('./api/v1/rank?type=hot&size=10').then((r) => {
      document.getElementById('search-hot').innerHTML = HY.rankList(r.list);
    }).catch(() => {});
  }

  async function load() {
    const host = document.getElementById('search-list');
    host.innerHTML = '<li class="empty">搜索中…</li>';
    document.title = `“${keyword}” 搜索结果 - 寰宇新闻网`;
    try {
      const res = await HY.api(`./api/v1/search?q=${encodeURIComponent(keyword)}&page=${page}&pageSize=20`);
      document.getElementById('search-title').textContent = `“${keyword}” 的搜索结果`;
      document.getElementById('search-count').textContent = `共 ${res.pagination.total} 条`;
      document.getElementById('search-tags').innerHTML = (res.relatedTags || [])
        .map((t) => `<a href="./search.html?q=${encodeURIComponent(t.name)}"># ${HY.escapeHtml(t.name)} (${t.count})</a>`).join('');
      host.innerHTML = res.list.length
        ? res.list.map((it, i) => HY.newsItem(it, { showDesc: true, showPic: i < 8 })).join('')
        : `<li class="empty">没有找到与“${HY.escapeHtml(keyword)}”相关的内容，试试其他关键词</li>`;
      HY.renderPagination(document.getElementById('search-pagination'), res.pagination.page, res.pagination.totalPages, (p) => {
        page = p;
        load();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    } catch (e) {
      host.innerHTML = `<li class="empty">搜索失败：${HY.escapeHtml(e.message)}</li>`;
    }
  }

  boot();
})();
