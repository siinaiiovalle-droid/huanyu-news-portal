/**
 * 静态版运行时补丁（只随 GitHub Pages 静态包一起发布，动态站点不加载本文件）
 *
 * 作用：把原本打给 Node 服务的请求改道到预渲染好的静态 JSON，
 *      写操作（发帖 / 点赞 / 评论 / 后台）在本地模拟，页面照样能点能看。
 */
(function () {
  'use strict';

  var DROP = { uid: 1, token: 1, _: 1, t: 1, ts: 1 };
  var LOCAL_KEY = 'hy_static_local_posts';
  var LIKE_KEY = 'hy_static_liked';

  /* ------------------------------ 请求 → 静态文件 ------------------------------ */

  function parts(input) {
    var u = new URL(input, location.href);
    var p = u.pathname;
    var i = p.indexOf('api/v1/');
    if (i < 0) return null;
    var rest = p.slice(i + 7).replace(/\/+$/, '');
    var q = {};
    u.searchParams.forEach(function (v, k) { if (!DROP[k] && v !== '' && v != null) q[k] = v; });
    var keys = Object.keys(q).sort();
    var suffix = keys.length
      ? '__' + keys.map(function (k) { return k + '-' + q[k]; }).join('_').replace(/[^A-Za-z0-9_\-]/g, '-')
      : '';
    return { rest: rest, suffix: suffix, q: q };
  }

  function relFor(input, withSuffix) {
    var p = parts(input);
    if (!p) return null;
    return './api/v1/' + p.rest + (withSuffix ? p.suffix : '') + '.json';
  }

  /* 页面带了没预渲染的参数时，逐级放宽再找快照。
     只放宽「排序 / 关键词 / 频道」这类纯展示型筛选（拿到的还是同一批数据）；
     状态、分页不能放宽，否则会把已发布的内容混进"待审核"里，或者串页。 */
  var SOFT_DROP = ['sort', 'keyword', 'channel'];

  function candidatesFor(input) {
    var p = parts(input);
    if (!p) return [];
    var keys = Object.keys(p.q).sort();
    var out = [];
    var seen = {};
    var add = function (arr) {
      var suffix = arr.length
        ? '__' + arr.map(function (k) { return k + '-' + p.q[k]; }).join('_').replace(/[^A-Za-z0-9_\-]/g, '-')
        : '';
      var rel = './api/v1/' + p.rest + suffix + '.json';
      if (!seen[rel]) { seen[rel] = 1; out.push(rel); }
    };
    add(keys);
    var remain = keys.slice();
    SOFT_DROP.forEach(function (k) {
      remain = remain.filter(function (x) { return x !== k; });
      add(remain);
    });
    add([]);
    return out;
  }

  /** 依次尝试候选文件，返回第一个 200 的响应；全都没有则返回 null */
  function tryFiles(list, i) {
    i = i || 0;
    if (i >= list.length) return Promise.resolve(null);
    return origFetch(list[i]).then(function (r) {
      return r && r.ok ? r : tryFiles(list, i + 1);
    }, function () { return tryFiles(list, i + 1); });
  }

  /** 快照确实不存在时的兜底：给个结构合理的空结果，页面显示空态而不是"服务响应异常" */
  function emptyData(url) {
    console.warn('[static] 该请求没有预渲染快照，已返回空结果：' + url);
    return {
      keyword: '',
      list: [],
      items: [],
      total: 0,
      hasMore: false,
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 }
    };
  }

  function jsonResponse(obj) {
    return new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  /* ------------------------------ 本地数据（演示态写入） ------------------------------ */

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || '') || fallback; } catch (e) { return fallback; }
  }
  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 隐私模式下忽略 */ }
  }
  function localPosts() { return readJson(LOCAL_KEY, []); }
  function toggleLiked(id) {
    var set = readJson(LIKE_KEY, {});
    set[id] = !set[id];
    writeJson(LIKE_KEY, set);
    return set[id];
  }

  var indexPromise = null;
  function postIndex() {
    if (!indexPromise) {
      indexPromise = fetch('./posts-index.json')
        .then(function (r) { return r.ok ? r.json() : {}; })
        .catch(function () { return {}; });
    }
    return indexPromise;
  }

  function statsOf(id, delta) {
    return postIndex().then(function (idx) {
      var base = (idx[id] && idx[id].stats) || { likes: 0, reposts: 0, replies: 0, views: 0, comments: 0 };
      var out = { likes: base.likes, reposts: base.reposts, replies: base.replies, views: base.views, comments: base.comments };
      Object.keys(delta || {}).forEach(function (k) { out[k] = Math.max(0, (out[k] || 0) + delta[k]); });
      return out;
    });
  }

  /* ------------------------------ 写操作模拟 ------------------------------ */

  function simulate(url, init) {
    var body = {};
    try { body = JSON.parse((init && init.body) || '{}') || {}; } catch (e) { body = {}; }
    var path = url.replace(/^.*api\/v1\//, '');

    if (path.indexOf('admin/login') === 0) {
      return Promise.resolve({ code: 0, message: 'ok', data: { token: 'static-demo', name: '演示管理员', role: 'admin', username: 'admin' } });
    }
    if (path.indexOf('admin/') === 0) {
      return Promise.resolve({ code: 0, message: 'ok', data: { ok: true } });
    }

    // 广场：点赞 / 转发 / 收藏
    var act = path.match(/^square\/([^/?]+)\/(like|repost|bookmark)$/);
    if (act) {
      var id = act[1];
      var key = act[2] === 'like' ? 'likes' : 'reposts';
      var on = toggleLiked(id + ':' + act[2]);
      var d = {};
      if (act[2] !== 'bookmark') d[key] = on ? 1 : -1;
      return statsOf(id, d).then(function (stats) {
        return { code: 0, message: 'ok', data: { active: on, stats: stats } };
      });
    }

    // 广场：回复
    var reply = path.match(/^square\/([^/?]+)\/replies$/);
    if (reply && (init && init.method)) {
      var rid = reply[1];
      return statsOf(rid, { replies: 1 }).then(function (stats) {
        return { code: 0, message: 'ok', data: { stats: stats, id: 'r_local_' + Date.now() } };
      });
    }

    // 广场：关注
    if (path.indexOf('square/follow') === 0) {
      return Promise.resolve({ code: 0, message: 'ok', data: { following: [body.handle].filter(Boolean), active: true } });
    }

    // 广场：回复点赞
    if (/^square\/replies\/[^/]+\/like$/.test(path)) {
      return Promise.resolve({ code: 0, message: 'ok', data: { likes: 1 } });
    }

    // 广场：发布新动态（存本地，随后刷新会出现在最前）
    if (path.indexOf('square') === 0 && (init && init.method) === 'POST') {
      var post = {
        id: 'p_local_' + Date.now(),
        content: body.content || '',
        images: body.images || [],
        topic: '',
        quote: null,
        author: { uid: body.uid || 'me', name: body.name || '我', handle: 'me', verified: false, color: '#0b4f9e' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stats: { views: 0, likes: 0, reposts: 0, replies: 0, comments: 0 }
      };
      var list = localPosts();
      list.unshift(post);
      writeJson(LOCAL_KEY, list.slice(0, 50));
      return Promise.resolve({ code: 0, message: 'ok', data: { id: post.id } });
    }

    // 稿件互动 / 评论
    if (path.indexOf('interact') === 0) {
      return Promise.resolve({ code: 0, message: 'ok', data: { active: true, likes: 1, favorites: 1 } });
    }
    if (/^comments\/[^/]+\/like$/.test(path)) {
      return Promise.resolve({ code: 0, message: 'ok', data: { likes: 1 } });
    }
    if (path.indexOf('comments') === 0) {
      return Promise.resolve({ code: 0, message: 'ok', data: { id: 'c_local_' + Date.now(), content: body.content || '' } });
    }

    return Promise.resolve({ code: 0, message: 'ok', data: { ok: true } });
  }

  /* ------------------------------ 本地动态并入时间线 ------------------------------ */

  function withLocalPosts(url, res) {
    if (!/api\/v1\/square(\?|$)/.test(url)) return res;
    var mine = localPosts();
    if (!mine.length) return res;
    var data = res && res.data ? res.data : res;
    if (!data || !Array.isArray(data.list)) return res;
    data.list = mine.concat(data.list);
    data.total = (data.total || 0) + mine.length;
    return res;
  }

  function localPostDetail(id) {
    var p = localPosts().filter(function (x) { return x.id === id; })[0];
    if (!p) return null;
    return { code: 0, message: 'ok', data: { post: p, replies: [], interactions: {} } };
  }

  /* ------------------------------ 站内搜索 ------------------------------ */

  var searchIndex = null;
  var searchTpl = null;

  function doSearch(url) {
    var u = new URL(url, location.href);
    var q = (u.searchParams.get('q') || '').trim();
    var page = Number(u.searchParams.get('page') || 1);
    var pageSize = Number(u.searchParams.get('pageSize') || 20);

    var loadIdx = searchIndex
      ? Promise.resolve(searchIndex)
      : fetch('./search-index.json').then(function (r) { return r.ok ? r.json() : { list: [] }; })
        .then(function (j) { searchIndex = j && j.list ? j.list : []; return searchIndex; }).catch(function () { searchIndex = []; return searchIndex; });

    var loadTpl = searchTpl
      ? Promise.resolve(searchTpl)
      : fetch(relFor(url, false)).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { searchTpl = j; return j; }).catch(function () { searchTpl = null; return null; });

    return Promise.all([loadIdx, loadTpl]).then(function (r) {
      var idx = r[0];
      var tpl = r[1];
      var hit = q
        ? idx.filter(function (a) {
            return (a.title + ' ' + a.summary + ' ' + (a.tags || []).join(' ') + ' ' + (a.text || '')).toLowerCase().indexOf(q.toLowerCase()) >= 0;
          })
        : [];
      var start = (page - 1) * pageSize;
      var pageList = hit.slice(start, start + pageSize);
      var data = {
        keyword: q,
        q: q,
        list: pageList,
        items: pageList,
        total: hit.length,
        page: page,
        pageSize: pageSize,
        hasMore: start + pageSize < hit.length
      };
      if (tpl && tpl.data && typeof tpl.data === 'object') {
        Object.keys(tpl.data).forEach(function (k) {
          if (!(k in data) || ['tags', 'related', 'hot'].indexOf(k) >= 0) data[k] = tpl.data[k];
        });
      }
      return jsonResponse({ code: 0, message: 'ok', data: data });
    });
  }

  /* ------------------------------ 占位图（服务端生成的 SVG） ------------------------------ */

  function svgPlaceholder(w, h, text) {
    var W = Math.max(1, Number(w) || 800);
    var H = Math.max(1, Number(h) || 450);
    var label = (text || '寰宇新闻网').slice(0, 24);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#e8eef6"/><stop offset="1" stop-color="#cfd9e6"/></linearGradient></defs>' +
      '<rect width="100%" height="100%" fill="url(#g)"/>' +
      '<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" ' +
      'font-family="Microsoft YaHei,PingFang SC,sans-serif" font-size="' + Math.round(Math.min(W, H) / 12) + '" fill="#7b8794">' +
      label.replace(/[<>&]/g, '') + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function fixPlaceholder(url) {
    if (!url || url.indexOf('api/v1/placeholder') < 0) return url;
    var u = new URL(url, location.href);
    return svgPlaceholder(u.searchParams.get('w'), u.searchParams.get('h'), u.searchParams.get('text'));
  }

  /* ------------------------------ fetch 改道 ------------------------------ */

  var origFetch = window.fetch ? window.fetch.bind(window) : null;
  if (origFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var method = ((init && init.method) || (typeof input !== 'string' && input && input.method) || 'GET').toUpperCase();
      if (url.indexOf('api/v1/') < 0) return origFetch(input, init);

      if (method !== 'GET') return simulate(url, init).then(jsonResponse);

      var localId = url.match(/api\/v1\/square\/(p_local_[^/?#]+)/);
      if (localId) {
        var d = localPostDetail(localId[1]);
        if (d) return Promise.resolve(jsonResponse(d));
      }

      if (/api\/v1\/search(\?|$)/.test(url)) return doSearch(url);

      return tryFiles(candidatesFor(url)).then(function (r) {
        if (!r) return jsonResponse({ code: 0, message: 'ok', data: emptyData(url) });
        return r.text().then(function (text) {
          var json = null;
          try { json = JSON.parse(text); } catch (e) { json = null; }
          if (json) json = withLocalPosts(url, json);
          return new Response(json ? JSON.stringify(json) : text, {
            status: 200,
            headers: { 'Content-Type': r.headers.get('Content-Type') || 'application/json' }
          });
        });
      });
    };
  }

  /* ------------------------------ 图片兜底：占位图坏图自动修复 ------------------------------ */

  document.addEventListener('error', function (e) {
    var t = e.target;
    if (!t || t.tagName !== 'IMG') return;
    if (t.src.indexOf('api/v1/placeholder') < 0) return;
    var fixed = fixPlaceholder(t.src);
    if (fixed !== t.src) t.src = fixed;
  }, true);

  /* ------------------------------ 占位图提前替换 ------------------------------ */
  /* img 的 src 不走 fetch，改道拦不住，只能拿到 URL 后直接换成内联 SVG，
     否则每张占位图都会先 404 一次、闪一下破图。 */
  function patchPlaceholders() {
    var imgs = document.querySelectorAll('img[src*="api/v1/placeholder"]');
    for (var i = 0; i < imgs.length; i++) {
      var fixed = svgPlaceholder.apply(null, (function (u) {
        var p = new URL(u, location.href).searchParams;
        return [p.get('w'), p.get('h'), p.get('text')];
      })(imgs[i].getAttribute('src')));
      if (fixed && fixed !== imgs[i].getAttribute('src')) imgs[i].src = fixed;
    }
  }
  document.addEventListener('DOMContentLoaded', patchPlaceholders);
  if (window.MutationObserver) {
    new MutationObserver(patchPlaceholders).observe(document.documentElement, { childList: true, subtree: true });
  }

  // 从源头拦住 img.src / setAttribute，避免浏览器先发出一次注定 404 的请求
  var srcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (srcDesc && srcDesc.set) {
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      get: srcDesc.get,
      set: function (v) { srcDesc.set.call(this, fixPlaceholder(v)); },
      configurable: true
    });
  }
  var setAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (String(name).toLowerCase() === 'src' && typeof value === 'string') value = fixPlaceholder(value);
    return setAttr.call(this, name, value);
  };

  /* ------------------------------ 覆盖占位图生成函数 ------------------------------ */

  function patchHy() {
    if (!window.HY) return;
    if (window.HY.ph) {
      var ph = window.HY.ph;
      window.HY.ph = function () { return fixPlaceholder(ph.apply(null, arguments)); };
    }
    if (window.HY.imgOf) {
      var imgOf = window.HY.imgOf;
      window.HY.imgOf = function () { return fixPlaceholder(imgOf.apply(null, arguments)); };
    }
  }
  if (window.HY) patchHy();
  else document.addEventListener('DOMContentLoaded', patchHy);
})();
