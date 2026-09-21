/* ==========================================================================
   寰宇严选 —— 商城交互
   依赖 common.js 暴露的 HY.api / HY.toast / HY.renderHeader / HY.renderFooter
   ========================================================================== */
(function (global) {
  'use strict';

  const { api, escapeHtml, fmtNum, toast, uid } = global.HY;

  const state = {
    home: null,
    category: 'all',
    tag: '',
    keyword: '',
    sort: 'recommend',
    page: 1,
    cart: loadCart(),
    detailQty: 1
  };

  const CART_KEY = 'hy_mall_cart';
  const RECEIVER_KEY = 'hy_mall_receiver';
  const TAGS = ['编辑推荐', '新品', '热销', '回购王', '产地直发', '编辑部同款', '礼盒装'];

  /** 默认收货信息：结算页直接带出来，看完就能下单，需要改再改 */
  const DEFAULT_RECEIVER = {
    name: '张明',
    phone: '13800138000',
    address: '北京市朝阳区建国路 88 号 寰宇传媒大厦 18 层',
    remark: '工作日 9:00–18:00 送达，到楼下电话联系'
  };

  /** 收货信息本地记忆：上次填过就用上次的，没填过用默认值 */
  function loadReceiver() {
    try {
      const saved = JSON.parse(localStorage.getItem(RECEIVER_KEY) || 'null');
      if (saved && saved.name && saved.phone && saved.address) return saved;
    } catch { /* 数据坏了就用默认 */ }
    return Object.assign({}, DEFAULT_RECEIVER);
  }
  function saveReceiver(r) {
    try { localStorage.setItem(RECEIVER_KEY, JSON.stringify(r)); } catch { /* 隐私模式下忽略 */ }
  }

  /* ------------------------------ 购物车本地持久化 ------------------------------ */

  function loadCart() {
    try {
      const raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      return Array.isArray(raw) ? raw.filter((i) => i && i.id) : [];
    } catch {
      return [];
    }
  }
  function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
    syncCartBadge();
  }
  function syncCartBadge() {
    const badge = document.getElementById('cart-badge');
    const n = state.cart.reduce((s, i) => s + i.qty, 0);
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.hidden = n === 0;
  }
  function addToCart(item, qty) {
    const exist = state.cart.find((i) => i.id === item.id);
    if (exist) exist.qty = Math.min(99, exist.qty + qty);
    else {
      state.cart.push({
        id: item.id, title: item.title, cover: item.cover,
        price: Number(item.price) || Number(item.seckillPrice) || 0, qty
      });
    }
    saveCart();
    toast(`已加入购物车：${item.title}`);
  }
  function cartSum() {
    const amount = state.cart.reduce((s, i) => s + i.price * i.qty, 0);
    return { amount, count: state.cart.reduce((s, i) => s + i.qty, 0), freight: amount >= 199 || !amount ? 0 : 12 };
  }

  /* ------------------------------ 通用小工具 ------------------------------ */

  function money(n) {
    const v = Number(n) || 0;
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }
  function $(sel) { return document.querySelector(sel); }
  /** 站内楼层跳转：锚点统一走平滑滚动，静态版（相对路径）也不会跳丢 */
  function goSection(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  /** 中文折扣口径：7.3 折 = 现价 / 原价 × 10 */
  function offText(p) {
    if (!p.originalPrice) return 10;
    return Math.round((p.price / p.originalPrice) * 100) / 10;
  }

  /* ------------------------------ 楼层渲染 ------------------------------ */

  function renderBanners(list) {
    const host = $('#banner-slides');
    const dots = $('#banner-dots');
    host.innerHTML = list.map((b, i) => `
      <div class="mall-banner-item${i === 0 ? ' active' : ''}" data-idx="${i}"
        style="background-image:linear-gradient(120deg, rgba(8,26,50,.72), rgba(8,26,50,.35)), url('${escapeHtml(b.image || global.HY.ph(b.tag, b.theme, 1200, 520))}')">
        <span class="mall-banner-tag">${escapeHtml(b.tag)}</span>
        <h3>${escapeHtml(b.title)}</h3>
        <p>${escapeHtml(b.desc)}</p>
        <a class="mall-banner-cta" href="${escapeHtml(b.link)}">${escapeHtml(b.cta)} →</a>
      </div>`).join('');
    dots.innerHTML = list.map((b, i) => `<span class="${i === 0 ? 'active' : ''}" data-idx="${i}"></span>`).join('');

    let cur = 0;
    const timer = setInterval(() => {
      cur = (cur + 1) % list.length;
      switchTo(cur);
    }, 5000);
    $('#banner').addEventListener('mouseenter', () => clearInterval(timer));

    dots.querySelectorAll('span').forEach((d) => {
      d.addEventListener('click', () => switchTo(Number(d.dataset.idx)));
    });
    // 轮播里的 CTA 指向站内楼层，接过来做平滑滚动（锚点在静态版会带着查询串跳丢）
    host.querySelectorAll('.mall-banner-cta').forEach((a) => {
      a.addEventListener('click', (e) => {
        const href = a.getAttribute('href') || '';
        if (href.charAt(0) !== '#') return;
        e.preventDefault();
        goSection(href.slice(1));
      });
    });
    function switchTo(idx) {
      host.querySelectorAll('.mall-banner-item').forEach((el, i) => el.classList.toggle('active', i === idx));
      dots.querySelectorAll('span').forEach((el, i) => el.classList.toggle('active', i === idx));
    }
  }

  function renderCategories(list) {
    $('#cat-nav').innerHTML = list.map((c) => `
      <div class="mall-cat${c.id === state.category ? ' active' : ''}" data-cat="${escapeHtml(c.id)}">
        <div class="mall-cat-icon">${escapeHtml(c.icon)}</div>
        <b>${escapeHtml(c.name)}</b>
        <span>${escapeHtml(c.desc)}</span>
        <i>${c.count} 件在售</i>
      </div>`).join('');
    $('#side-cats').innerHTML = list.map((c) => `
      <li class="${c.id === state.category ? 'active' : ''}" data-cat="${escapeHtml(c.id)}">
        <span style="display:inline-flex;gap:6px;align-items:center;"><em style="font-style:normal">${escapeHtml(c.icon)}</em>${escapeHtml(c.name)}</span>
        <span>${c.count}</span>
      </li>`).join('');
    $('#cat-nav').querySelectorAll('[data-cat]').forEach((el) => el.addEventListener('click', () => pickCategory(el.dataset.cat)));
    $('#side-cats').querySelectorAll('[data-cat]').forEach((el) => el.addEventListener('click', () => pickCategory(el.dataset.cat)));
  }

  function renderTags() {
    $('#side-tags').innerHTML = TAGS.map((t) => `<button data-tag="${escapeHtml(t)}" class="${state.tag === t ? 'active' : ''}">${escapeHtml(t)}</button>`).join('')
      + `<button data-tag="" class="${!state.tag ? 'active' : ''}">全部</button>`;
    $('#side-tags').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      state.tag = b.dataset.tag;
      state.page = 1;
      renderTags();
      loadGoods();
    }));
  }

  function renderPick(list) {
    $('#mall-total').textContent = '共 24 件选品在售';
    $('#pick-list').innerHTML = list.map((p, i) => `
      <li>
        <div class="mall-pick-item" data-id="${escapeHtml(p.id)}">
          <span class="mall-pick-no">${i + 1}</span>
          <img src="${escapeHtml(p.cover)}" alt="${escapeHtml(p.title)}" loading="lazy">
          <div class="mall-pick-info">
            <h5>${escapeHtml(p.title)}</h5>
            <p>已售 ${fmtNum(p.sales)} · 评分 ${p.rating}</p>
          </div>
          <span class="mall-pick-price">¥${money(p.price)}</span>
        </div>
      </li>`).join('');
    $('#pick-list').querySelectorAll('.mall-pick-item').forEach((el) => el.addEventListener('click', () => openDetail(el.dataset.id)));
    const all = $('#pick-all');
    if (all) all.addEventListener('click', () => {
      state.category = 'all';
      state.tag = '';
      state.keyword = '';
      state.page = 1;
      if (state.home) renderCategories(state.home.categories);
      renderTags();
      loadGoods();
      goSection('goods');
    });
  }

  function renderPromise(list) {
    $('#promise-row').innerHTML = list.map((p) => `
      <div class="promise-item">
        <em>${escapeHtml(p.icon)}</em>
        <b>${escapeHtml(p.title)}</b>
        <span>${escapeHtml(p.desc)}</span>
      </div>`).join('');
  }

  function renderSeckill(data) {
    $('#seckill-grid').innerHTML = data.list.map((p) => {
      const sold = p.quota - 40;
      const rate = Math.round((sold / p.quota) * 100);
      return `
      <div class="goods-card seckill-card" data-id="${escapeHtml(p.id)}" data-price="${Number(p.seckillPrice) || 0}">
        <div class="goods-media">
          <img src="${escapeHtml(p.cover)}" alt="${escapeHtml(p.title)}" loading="lazy">
          <span class="goods-flag">秒杀 ${Math.round(p.seckillPrice / p.originalPrice * 100) / 10} 折</span>
          <span class="goods-off">立省 ¥${money(p.price - p.seckillPrice)}</span>
        </div>
        <div class="goods-info">
          <h4 class="goods-name">${escapeHtml(p.title)}</h4>
          <p class="goods-sub">${escapeHtml(p.subtitle)}</p>
          <div class="goods-price">
            <b><i>¥</i>${money(p.seckillPrice)}</b><del>¥${money(p.originalPrice)}</del>
          </div>
          <div class="seckill-progress"><i style="width:${Math.min(96, rate)}%"></i></div>
          <div class="seckill-left">已抢 <b>${Math.min(96, rate)}%</b> · 仅剩 ${p.quota - sold} 件</div>
        </div>
        <button class="goods-add" data-add="${escapeHtml(p.id)}">加入购物车</button>
      </div>`;
    }).join('');
    // 秒杀价只在秒杀楼层生效：先按秒杀价登记，加购才不会按日常价结算
    data.list.forEach((p) => {
      goodsCache[p.id] = { id: p.id, title: p.title, cover: p.cover, price: Number(p.seckillPrice) || p.price };
    });
    // 不绑事件的话秒杀卡片是"死的"：点卡片开详情、点按钮加购都靠它
    bindCards($('#seckill-grid'));
    startCountdown(new Date(data.endsAt).getTime());
  }

  function startCountdown(endAt) {
    const box = $('#countdown');
    const cells = box.querySelectorAll('span');
    function tick() {
      let left = Math.max(0, endAt - Date.now());
      const h = Math.floor(left / 3600000);
      const m = Math.floor((left % 3600000) / 60000);
      const s = Math.floor((left % 60000) / 1000);
      const pad = (n) => String(n).padStart(2, '0');
      cells[0].textContent = pad(h);
      cells[1].textContent = pad(m);
      cells[2].textContent = pad(s);
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ------------------------------ 商品列表 ------------------------------ */

  function goodsCard(p) {
    return `
      <div class="goods-card" data-id="${escapeHtml(p.id)}">
        <div class="goods-media">
          <img src="${escapeHtml(p.cover)}" alt="${escapeHtml(p.title)}" loading="lazy">
          ${p.tag ? `<span class="goods-flag">${escapeHtml(p.tag)}</span>` : ''}
          ${p.discount ? `<span class="goods-off">省 ¥${money(p.saved)}</span>` : ''}
        </div>
        <div class="goods-info">
          <h4 class="goods-name">${escapeHtml(p.title)}</h4>
          <p class="goods-sub">${escapeHtml(p.subtitle)}</p>
          <div class="goods-price">
            <b><i>¥</i>${money(p.price)}</b>
            ${p.discount ? `<del>¥${money(p.originalPrice)}</del>` : ''}
          </div>
          <div class="goods-meta">
            <span class="star">★ ${p.rating}</span>
            <span>已售 ${fmtNum(p.sales)}</span>
          </div>
        </div>
        <button class="goods-add" data-add="${escapeHtml(p.id)}">加入购物车</button>
      </div>`;
  }

  async function loadGoods() {
    const grid = $('#goods-grid');
    grid.innerHTML = '<div class="skeleton" style="height:320px"></div>'.repeat(4);
    try {
      const res = await api(`/api/v1/mall/products?category=${encodeURIComponent(state.category)}&tag=${encodeURIComponent(state.tag)}&keyword=${encodeURIComponent(state.keyword)}&sort=${encodeURIComponent(state.sort)}&page=${state.page}&pageSize=12`);
      const { list, pagination } = res;
      grid.innerHTML = list.length
        ? list.map(goodsCard).join('')
        : '<div class="empty" style="grid-column:1/-1">没有找到符合条件的商品，换个关键词试试</div>';
      $('#goods-count').innerHTML = `共 <b style="color:var(--m-brand)">${pagination.total}</b> 件商品 · 第 ${pagination.page}/${pagination.totalPages} 页`;
      renderPager(pagination.totalPages, pagination.page);
      bindCards(grid);
    } catch (e) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1">商品加载失败：${escapeHtml(e.message)}</div>`;
    }
  }

  function renderPager(totalPages, current) {
    const host = $('#pager');
    if (totalPages <= 1) { host.innerHTML = ''; return; }
    const pages = [];
    [1, current - 1, current, current + 1, totalPages].forEach((p) => {
      if (p >= 1 && p <= totalPages && !pages.includes(p)) pages.push(p);
    });
    pages.sort((a, b) => a - b);
    let html = `<button ${current === 1 ? 'disabled' : ''} data-page="${current - 1}">上一页</button>`;
    let prev = 0;
    pages.forEach((p) => {
      if (prev && p - prev > 1) html += '<button disabled>…</button>';
      html += `<button class="${p === current ? 'active' : ''}" data-page="${p}">${p}</button>`;
      prev = p;
    });
    html += `<button ${current === totalPages ? 'disabled' : ''} data-page="${current + 1}">下一页</button>`;
    host.innerHTML = html;
    host.querySelectorAll('button[data-page]').forEach((b) => {
      b.addEventListener('click', () => {
        const p = Number(b.dataset.page);
        if (p !== current && p >= 1 && p <= totalPages) {
          state.page = p;
          loadGoods();
          $('#goods').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  function bindCards(scope) {
    scope.querySelectorAll('.goods-card').forEach((card) => {
      card.addEventListener('click', () => openDetail(card.dataset.id, Number(card.dataset.price) || 0));
    });
    scope.querySelectorAll('[data-add]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.add;
        try {
          const item = findLocalGoods(id);
          addToCart(item || await fetchGoods(id), 1);
        } catch (err) {
          toast(err.message);
        }
      });
    });
  }

  const goodsCache = {};
  function findLocalGoods(id) {
    return goodsCache[id] || null;
  }
  async function fetchGoods(id) {
    if (goodsCache[id]) return goodsCache[id];
    const { product } = await api(`/api/v1/mall/${encodeURIComponent(id)}`);
    goodsCache[id] = { id: product.id, title: product.title, cover: product.cover, price: product.price };
    return goodsCache[id];
  }

  function pickCategory(id) {
    state.category = id;
    state.page = 1;
    renderCategories(state.home.categories);
    loadGoods();
  }

  /* ------------------------------ 商品详情 ------------------------------ */

  /** 从秒杀楼层点进来会带 seckillPrice：详情里的价格与加购都按秒杀价走 */
  async function openDetail(id, seckillPrice) {
    const modal = $('#detail-modal');
    const body = $('#detail-body');
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    body.innerHTML = '<div class="skeleton" style="height:420px"></div>';
    try {
      const { product, related } = await api(`/api/v1/mall/${encodeURIComponent(id)}`);
      const unitPrice = Number(seckillPrice) > 0 ? Number(seckillPrice) : product.price;
      state.detailQty = 1;
      body.innerHTML = `
        <div>
          <div class="detail-media">
            <img id="detail-main" src="${escapeHtml(product.gallery[0])}" alt="${escapeHtml(product.title)}">
            <div class="detail-thumbs">
              ${product.gallery.map((g, i) => `<img src="${escapeHtml(g)}" class="${i === 0 ? 'active' : ''}" data-src="${escapeHtml(g)}" alt="图 ${i + 1}">`).join('')}
            </div>
          </div>
        </div>
        <div class="detail-info">
          <h2>${escapeHtml(product.title)}</h2>
          <p class="detail-sub">${escapeHtml(product.subtitle)}</p>
          <div class="detail-tags">
            <span>${escapeHtml(product.categoryIcon)} ${escapeHtml(product.categoryName)}</span>
            ${product.tag ? `<span>${escapeHtml(product.tag)}</span>` : ''}
            <span>★ ${product.rating} 分</span>
            <span>月售 ${fmtNum(product.sales)}</span>
            <span>库存 ${product.stock} 件</span>
          </div>
          <div class="detail-price-box">
            <b><i>¥</i>${money(unitPrice)}</b>
            <del>¥${money(product.originalPrice)}</del>
            ${Number(seckillPrice) > 0 ? '<span class="saved">限时秒杀价</span>' : (product.discount ? `<span class="saved">已为你省 ¥${money(product.saved)}（${offText(product)} 折）</span>` : '')}
          </div>
          <div class="detail-highlights">${(product.highlights || []).map((h) => `<span>${escapeHtml(h)}</span>`).join('')}</div>
          <div class="detail-buy">
            <div class="stepper">
              <button type="button" data-step="-1">−</button>
              <input id="detail-qty" value="1" readonly>
              <button type="button" data-step="1">+</button>
            </div>
            <div class="btn-buy-group">
              <button class="btn-cart" type="button" id="detail-add">加入购物车</button>
              <button class="btn-now" type="button" id="detail-now">立即购买</button>
            </div>
          </div>
          <div class="detail-tabs">
            <button class="active" data-tab="desc">商品介绍</button>
            <button data-tab="spec">规格参数</button>
          </div>
          <div id="detail-tab-body">
            <p class="detail-text">${escapeHtml(product.desc || '编辑部试用中，详细介绍随后补上。')}</p>
          </div>
          <div class="detail-related">
            <h5>同类好物</h5>
            <div class="related-row">
              ${related.map((r) => `
                <div data-id="${escapeHtml(r.id)}">
                  <img src="${escapeHtml(r.cover)}" alt="${escapeHtml(r.title)}" loading="lazy">
                  <p>${escapeHtml(r.title)}</p>
                  <b>¥${money(r.price)}</b>
                </div>`).join('')}
            </div>
          </div>
        </div>`;

      body.querySelectorAll('.detail-thumbs img').forEach((t) => {
        t.addEventListener('click', () => {
          body.querySelectorAll('.detail-thumbs img').forEach((x) => x.classList.remove('active'));
          t.classList.add('active');
          $('#detail-main').src = t.dataset.src;
        });
      });
      body.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
        state.detailQty = Math.max(1, Math.min(99, state.detailQty + Number(b.dataset.step)));
        $('#detail-qty').value = state.detailQty;
      }));
      body.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
        body.querySelectorAll('[data-tab]').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        $('#detail-tab-body').innerHTML = b.dataset.tab === 'spec'
          ? `<table class="detail-specs">${(product.specs || []).map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('')}</table>`
          : `<p class="detail-text">${escapeHtml(product.desc || '编辑部试用中，详细介绍随后补上。')}</p>`;
      }));
      $('#detail-add').addEventListener('click', () => {
        addToCart({ id: product.id, title: product.title, cover: product.cover, price: unitPrice }, state.detailQty);
      });
      $('#detail-now').addEventListener('click', () => {
        addToCart({ id: product.id, title: product.title, cover: product.cover, price: unitPrice }, state.detailQty);
        closeAll();
        openCart();
      });
      body.querySelectorAll('.related-row > div').forEach((el) => el.addEventListener('click', () => openDetail(el.dataset.id)));
    } catch (e) {
      body.innerHTML = `<div class="empty">商品加载失败：${escapeHtml(e.message)}</div>`;
    }
  }

  /* ------------------------------ 购物车 ------------------------------ */

  function openCart() {
    const drawer = $('#cart-drawer');
    drawer.hidden = false;
    document.body.style.overflow = 'hidden';
    renderCart();
  }

  function renderCart() {
    const body = $('#cart-body');
    const foot = $('#cart-foot');
    if (!state.cart.length) {
      body.innerHTML = '<div class="empty">购物车还是空的<br><button class="mall-link-btn" type="button" id="cart-empty-go">去挑几件好物 →</button></div>';
      foot.innerHTML = '<button class="cart-checkout" type="button" id="cart-empty-close">去逛街</button>';
      ['#cart-empty-go', '#cart-empty-close'].forEach((sel) => {
        const btn = $(sel);
        if (btn) btn.addEventListener('click', () => { closeAll(); goSection('goods'); });
      });
      return;
    }
    body.innerHTML = state.cart.map((i) => `
      <div class="cart-item">
        <img src="${escapeHtml(i.cover)}" alt="${escapeHtml(i.title)}">
        <div class="cart-item-info">
          <h5>${escapeHtml(i.title)}</h5>
          <p>¥${money(i.price * i.qty)}</p>
          <div class="cart-item-ops">
            <div class="stepper">
              <button type="button" data-cart="minus" data-id="${escapeHtml(i.id)}">−</button>
              <input value="${i.qty}" readonly>
              <button type="button" data-cart="plus" data-id="${escapeHtml(i.id)}">+</button>
            </div>
            <button class="cart-del" data-cart="del" data-id="${escapeHtml(i.id)}">删除</button>
          </div>
        </div>
      </div>`).join('');
    const { amount, count, freight } = cartSum();
    foot.innerHTML = `
      <div class="cart-sum"><span>合计（${count} 件）</span><b><i>¥</i>${money(amount)}</b></div>
      <div class="cart-saved">运费 ¥${money(freight)}${freight ? '（满 ¥199 免运费）' : ' · 已免运费'}</div>
      <button class="cart-checkout" id="cart-checkout">去结算 · ¥${money(amount + freight)}</button>`;
    $('#cart-checkout').addEventListener('click', openOrder);

    body.querySelectorAll('[data-cart]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.id;
        const row = state.cart.find((i) => i.id === id);
        if (!row) return;
        if (b.dataset.cart === 'plus') row.qty = Math.min(99, row.qty + 1);
        if (b.dataset.cart === 'minus') row.qty = Math.max(1, row.qty - 1);
        if (b.dataset.cart === 'del') state.cart = state.cart.filter((i) => i.id !== id);
        saveCart();
        renderCart();
      });
    });
  }

  /* ------------------------------ 结算与订单 ------------------------------ */

  function openOrder() {
    const modal = $('#order-modal');
    $('#cart-drawer').hidden = true;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    const { amount, freight } = cartSum();
    const r = loadReceiver();
    $('#order-body').innerHTML = `
      <h3>确认订单</h3>
      <div class="order-lines">
        ${state.cart.map((i) => `<div class="order-line"><span>${escapeHtml(i.title)} × ${i.qty}</span><b>¥${money(i.price * i.qty)}</b></div>`).join('')}
        <div class="order-line" style="border-top:1px dashed var(--m-line);margin-top:8px;padding-top:8px;"><span>运费</span><b>¥${money(freight)}</b></div>
      </div>
      <div class="order-total"><span style="color:var(--m-text-3)">应付金额</span><b>¥${money(amount + freight)}</b></div>
      <form class="order-form" id="order-form">
        <div class="order-form-head">
          <span>收货信息（已为你预填，可自行修改）</span>
          <button class="mall-link-btn" type="button" id="o-reset">恢复默认</button>
        </div>
        <div>
          <label for="o-name">收货人姓名</label>
          <input id="o-name" name="name" placeholder="请输入收货人" value="${escapeHtml(r.name)}">
        </div>
        <div>
          <label for="o-phone">联系电话</label>
          <input id="o-phone" name="phone" placeholder="11 位手机号" value="${escapeHtml(r.phone)}">
        </div>
        <div>
          <label for="o-addr">收货地址</label>
          <input id="o-addr" name="address" placeholder="省 / 市 / 区 + 详细地址" value="${escapeHtml(r.address)}">
        </div>
        <div>
          <label for="o-remark">订单备注（选填）</label>
          <textarea id="o-remark" name="remark" rows="2" placeholder="配送时间、开票信息等">${escapeHtml(r.remark || '')}</textarea>
        </div>
        <button class="btn-submit" type="submit">提交订单并支付 ¥${money(amount + freight)}</button>
      </form>`;
    $('#o-reset').addEventListener('click', () => {
      $('#o-name').value = DEFAULT_RECEIVER.name;
      $('#o-phone').value = DEFAULT_RECEIVER.phone;
      $('#o-addr').value = DEFAULT_RECEIVER.address;
      $('#o-remark').value = DEFAULT_RECEIVER.remark;
      toast('已恢复默认收货信息');
    });
    $('#order-form').addEventListener('submit', submitOrder);
  }

  async function submitOrder(e) {
    e.preventDefault();
    const name = $('#o-name').value.trim();
    const phone = $('#o-phone').value.trim();
    const address = $('#o-addr').value.trim();
    const remark = $('#o-remark').value.trim();
    if (!name || !phone || !address) return toast('请填写收货人、联系电话与收货地址');
    if (!/^1[3-9]\d{9}$/.test(phone)) return toast('手机号格式不正确');
    try {
      const receiver = { name, phone, address };
      const order = await api('/api/v1/mall/orders', {
        method: 'POST',
        body: { uid: uid(), items: state.cart.map(({ id, qty }) => ({ id, qty })), receiver, remark }
      });
      saveReceiver(Object.assign({}, receiver, { remark }));
      state.cart = [];
      saveCart();
      renderOrderSuccess(order);
    } catch (err) {
      toast(err.message);
    }
  }

  function renderOrderSuccess(order) {
    $('#order-body').innerHTML = `
      <div class="order-success">
        <div class="tick">✓</div>
        <h3>下单成功，我们会尽快发货</h3>
        <p>订单已提交至寰宇严选履约中心，可在「我的订单」查看进度</p>
        <div class="order-detail">
          订单编号 <b>${escapeHtml(order.id)}</b><br>
          商品金额 <b>¥${money(order.amount)}</b><br>
          运费 <b>¥${money(order.freight)}</b><br>
          已为你省 <b style="color:var(--m-sale)">¥${money(order.saved)}</b><br>
          应付金额 <b style="color:var(--m-sale)">¥${money(order.payable)}</b><br>
          收货人 <b>${escapeHtml(order.receiver.name)} ${escapeHtml(order.receiver.phone)}</b><br>
          收货地址 <b style="max-width:60%;text-align:right">${escapeHtml(order.receiver.address)}</b>
        </div>
        <div class="order-actions">
          <button class="ghost" type="button" id="o-back">继续逛逛</button>
          <button class="primary" type="button" id="o-orders">查看我的订单</button>
        </div>
      </div>`;
    $('#o-back').addEventListener('click', closeAll);
    $('#o-orders').addEventListener('click', openOrders);
  }

  async function openOrders() {
    const modal = $('#order-modal');
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    $('#order-body').innerHTML = '<div class="skeleton" style="height:220px"></div>';
    try {
      const list = await api(`/api/v1/mall/orders?uid=${encodeURIComponent(uid())}`);
      if (!list.length) {
        $('#order-body').innerHTML = '<h3>我的订单</h3><div class="empty">当前账号还没有订单<br><button class="mall-link-btn" type="button" id="order-empty-go">去严挑选几件 →</button></div>';
        const go = $('#order-empty-go');
        if (go) go.addEventListener('click', () => { closeAll(); goSection('goods'); });
        return;
      }
      $('#order-body').innerHTML = `
        <h3>我的订单（${list.length}）</h3>
        ${list.map((o) => `
          <div class="order-lines">
            <div class="order-line"><span>订单 ${escapeHtml(o.id)}</span><b style="color:var(--m-sale)">${escapeHtml(o.status)}</b></div>
            ${o.lines.map((l) => `<div class="order-line"><span>${escapeHtml(l.title)} × ${l.qty}</span><b>¥${money(l.price * l.qty)}</b></div>`).join('')}
            <div class="order-line" style="border-top:1px dashed var(--m-line);margin-top:8px;padding-top:8px;">
              <span>${escapeHtml(String(o.createdAt).slice(0, 10))} · 共 ${o.lines.length} 件商品</span><b style="color:var(--m-sale)">¥${money(o.payable)}</b>
            </div>
          </div>`).join('')}`;
    } catch (e) {
      $('#order-body').innerHTML = `<div class="empty">订单加载失败：${escapeHtml(e.message)}</div>`;
    }
  }

  /* ------------------------------ 弹层控制 ------------------------------ */

  function closeAll() {
    ['#detail-modal', '#cart-drawer', '#order-modal'].forEach((sel) => { $(sel).hidden = true; });
    document.body.style.overflow = '';
  }

  function bindLayers() {
    document.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeAll));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
  }

  /* ------------------------------ 初始化 ------------------------------ */

  async function init() {
    try {
      const site = await api('/api/v1/site');
      global.HY.renderHeader(site, 'mall');
      global.HY.renderFooter(site);
    } catch (e) {
      /* 头部加载失败不影响商城主体 */
    }
    bindLayers();
    $('#btn-cart').addEventListener('click', openCart);
    $('#btn-orders').addEventListener('click', openOrders);
    $('#mall-search').addEventListener('submit', (e) => {
      e.preventDefault();
      state.keyword = e.target.q.value.trim();
      state.page = 1;
      const tip = $('#goods-keyword');
      if (state.keyword) {
        tip.hidden = false;
        tip.innerHTML = `关键词「<b>${escapeHtml(state.keyword)}</b>」的搜索结果`;
      } else {
        tip.hidden = true;
      }
      loadGoods();
      $('#goods').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('#sort-tabs').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      $('#sort-tabs').querySelectorAll('button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      state.sort = b.dataset.sort;
      state.page = 1;
      loadGoods();
    }));

    renderTags();
    syncCartBadge();
    try {
      const home = await api('/api/v1/mall/home');
      state.home = home;
      renderBanners(home.banners);
      renderCategories(home.categories);
      renderPick(home.top.length ? home.top : home.featured);
      renderPromise(home.promises);
      renderSeckill(home.seckill);
      $('#mall-total').textContent = `${home.total} 件选品在售`;
      // 秒杀价优先：已登记过的价格（秒杀价）不被日常价覆盖
      home.top.forEach((p) => {
        if (!goodsCache[p.id]) goodsCache[p.id] = { id: p.id, title: p.title, cover: p.cover, price: p.price };
      });
    } catch (e) {
      toast('商城数据加载失败：' + e.message);
    }
    await loadGoods();
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
