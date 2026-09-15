/* 文章详情页逻辑：正文渲染 / 点赞收藏 / 评论 */
(function () {
  'use strict';

  const id = HY.qs('id');
  let article = null;
  let commentPage = 1;
  let commentSort = 'new';

  async function boot() {
    const site = await HY.api('./api/v1/site');
    HY.renderHeader(site, '');
    HY.renderFooter(site);
    if (!id) {
      document.getElementById('a-body').innerHTML = '<div class="empty">缺少文章 ID</div>';
      return;
    }
    document.getElementById('comment-nick').value = HY.nick() === '匿名网友' ? '' : HY.nick();
    try {
      const res = await HY.api(`./api/v1/news/${encodeURIComponent(id)}`);
      article = res.article;
      renderArticle(res.article, res.related);
    } catch (e) {
      document.getElementById('a-body').innerHTML = `<div class="empty">内容加载失败：${HY.escapeHtml(e.message)}</div>`;
      return;
    }
    bindActions();
    loadComments();
    HY.api('./api/v1/rank?type=hot&size=10').then((r) => {
      document.getElementById('article-hot').innerHTML = HY.rankList(r.list);
    }).catch(() => {});
  }

  function renderArticle(a, related) {
    document.title = `${a.title} - 寰宇新闻网`;
    document.getElementById('a-title').textContent = a.title;
    const sub = document.getElementById('a-subtitle');
    if (a.subtitle) sub.textContent = a.subtitle; else sub.remove();
    document.getElementById('crumb').innerHTML =
      `<a href="./">首页</a> › <a href="./channel.html?id=${a.channel}">${HY.escapeHtml(a.channelName || '')}</a> › 正文`;
    const chanCol = HY.chanColor(a.channel);
    document.getElementById('a-channel').innerHTML = `<a class="chan" style="--c:${chanCol.c};--cbg:${chanCol.bg}" href="./channel.html?id=${a.channel}">${HY.escapeHtml(a.channelName || '')}</a>`;
    document.getElementById('a-source').textContent = `来源：${a.source || '本站'}`;
    document.getElementById('a-author').textContent = `作者：${a.author || '本网记者'}`;
    document.getElementById('a-time').textContent = HY.fmtTime(a.publishedAt);
    document.getElementById('a-views').textContent = `阅读 ${HY.fmtNum(a.stats && a.stats.views)}`;
    document.getElementById('like-count').textContent = HY.fmtNum(a.stats && a.stats.likes);
    document.getElementById('fav-count').textContent = HY.fmtNum(a.stats && a.stats.favs);
    document.getElementById('a-tags').innerHTML = (a.tags || []).map((t) => `<span><a href="./search.html?q=${encodeURIComponent(t)}"># ${HY.escapeHtml(t)}</a></span>`).join('');
    document.getElementById('comment-count').textContent = a.stats && a.stats.comments ? `(${a.stats.comments})` : '';

    const body = document.getElementById('a-body');
    body.innerHTML = a.contentHtml || (a.content || []).map((b) => `<p>${HY.escapeHtml(b.text || '')}</p>`).join('');
    // 视频元素懒加载提示
    body.querySelectorAll('video').forEach((v) => { v.setAttribute('controls', ''); v.setAttribute('preload', 'metadata'); });

    const rel = document.getElementById('related-list');
    rel.innerHTML = (related || []).length
      ? related.map((it) => HY.newsItem(it, { showPic: false })).join('')
      : '<li class="empty">暂无相关内容</li>';

    // 记录浏览（服务端在详情接口中已计数，这里保持前端无感）
    if (window.history && a.title) {
      document.querySelectorAll('meta[name="description"]').forEach((m) => {
        m.setAttribute('content', a.summary || a.title);
      });
    }
  }

  function bindActions() {
    document.getElementById('btn-like').addEventListener('click', async (e) => {
      const active = await HY.interact(id, 'like');
      if (active === null) return;
      e.currentTarget.classList.toggle('active', active);
      const el = document.getElementById('like-count');
      el.textContent = HY.fmtNum((Number(article.stats.likes) || 0) + (active ? 1 : -1));
      article.stats.likes += active ? 1 : -1;
    });
    document.getElementById('btn-fav').addEventListener('click', async (e) => {
      const active = await HY.interact(id, 'fav');
      if (active === null) return;
      e.currentTarget.classList.toggle('active', active);
      const el = document.getElementById('fav-count');
      el.textContent = HY.fmtNum((Number(article.stats.favs) || 0) + (active ? 1 : -1));
      article.stats.favs += active ? 1 : -1;
    });
    document.getElementById('btn-share').addEventListener('click', async () => {
      await HY.interact(id, 'share');
      const url = location.href;
      try {
        if (navigator.clipboard) await navigator.clipboard.writeText(url);
        HY.toast('链接已复制，快去分享吧');
      } catch {
        HY.toast(url);
      }
    });
    document.getElementById('btn-comment').addEventListener('click', submitComment);
    document.getElementById('comment-text').addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') submitComment();
    });
    document.getElementById('sort-new').addEventListener('click', () => { commentSort = 'new'; commentPage = 1; loadComments(); });
    document.getElementById('sort-hot').addEventListener('click', () => { commentSort = 'hot'; commentPage = 1; loadComments(); });
  }

  async function submitComment() {
    const text = document.getElementById('comment-text').value.trim();
    if (!text) return HY.toast('请输入评论内容');
    const nickInput = document.getElementById('comment-nick').value.trim();
    if (nickInput) HY.setNick(nickInput);
    try {
      await HY.api('./api/v1/comments', { method: 'POST', body: { articleId: id, content: text, user: nickInput || '匿名网友' } });
      document.getElementById('comment-text').value = '';
      HY.toast('评论发表成功');
      commentPage = 1;
      loadComments();
    } catch (e) {
      HY.toast(e.message);
    }
  }

  async function loadComments() {
    const host = document.getElementById('comment-list');
    try {
      const res = await HY.api(`./api/v1/comments?articleId=${encodeURIComponent(id)}&page=${commentPage}&pageSize=10&sort=${commentSort}`);
      document.getElementById('comment-count').textContent = res.pagination.total ? `(${res.pagination.total})` : '';
      host.innerHTML = res.list.length ? res.list.map((c) => `
        <div class="comment-item">
          <div class="avatar">${HY.escapeHtml(String(c.user || '网').slice(0, 1))}</div>
          <div class="comment-main">
            <div class="who">${HY.escapeHtml(c.user)} <span style="font-weight:400;color:var(--text-3);font-size:12px;">· ${HY.timeAgo(c.createdAt)}</span></div>
            <div class="txt">${HY.escapeHtml(c.content)}</div>
            <div class="ops">
              <button data-like="${c.id}">👍 ${c.likes || 0}</button>
              <button data-reply="${c.id}">回复</button>
            </div>
          </div>
        </div>`).join('') : '<div class="empty">还没有评论，来抢沙发～</div>';

      host.querySelectorAll('button[data-like]').forEach((b) => {
        b.addEventListener('click', async () => {
          try {
            const c = await HY.api(`./api/v1/comments/${b.dataset.like}/like`, { method: 'POST' });
            b.innerHTML = `👍 ${c.likes}`;
          } catch { HY.toast('操作失败'); }
        });
      });
      host.querySelectorAll('button[data-reply]').forEach((b) => {
        b.addEventListener('click', () => {
          const ta = document.getElementById('comment-text');
          ta.focus();
          ta.value = `回复：`;
        });
      });

      HY.renderPagination(document.getElementById('comment-pagination'), res.pagination.page, res.pagination.totalPages, (p) => {
        commentPage = p;
        loadComments();
      });
    } catch (e) {
      host.innerHTML = `<div class="empty">评论加载失败：${HY.escapeHtml(e.message)}</div>`;
    }
  }

  boot();
})();
