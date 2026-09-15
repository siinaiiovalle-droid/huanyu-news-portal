/**
 * 接口自检脚本 —— npm run test:api（需先启动服务）
 * 覆盖：站点/首页/频道/详情/搜索/榜单/评论/互动/广场信息流/App 同步/后台登录/静态页面
 */
const BASE = process.env.SMOKE_BASE || 'http://localhost:3000';

let pass = 0;
let fail = 0;

async function check(name, path, options = {}, assert) {
  try {
    const res = await fetch(BASE + path, options);
    let body = null;
    const text = await res.text();
    try { body = JSON.parse(text); } catch { body = text; }
    const expect = options._expect || 200;
    if (res.status !== expect) throw new Error(`期望状态 ${expect}，实际 ${res.status}`);
    if (assert) {
      const msg = assert(body, res);
      if (msg) throw new Error(msg);
    }
    pass += 1;
    console.log(`  ✓ ${name}`);
    return body;
  } catch (e) {
    fail += 1;
    console.log(`  ✗ ${name}  →  ${e.message}`);
    return null;
  }
}

(async () => {
  console.log(`\n开始自检：${BASE}\n`);

  console.log('[页面]');
  await check('首页 HTML', '/', {}, (b) => (String(b).includes('寰宇新闻网') ? '' : 'HTML 内容异常'));
  await check('频道页 HTML', '/channel.html?id=tech');
  await check('视频页 HTML', '/video.html');
  await check('搜索页 HTML', '/search.html?q=%E7%AE%97%E5%8A%9B');
  await check('后台页 HTML', '/admin.html');
  await check('本地图片资源', '/img/tech-ai.png');
  await check('占位图服务', '/api/v1/placeholder?w=400&h=200&text=demo');

  console.log('\n[内容接口]');
  const site = await check('站点配置', '/api/v1/site', {}, (b) => (b.data.channels.length ? '' : '缺少频道'));
  await check('频道列表', '/api/v1/channels');
  const home = await check('首页聚合', '/api/v1/home', {}, (b) => (b.data.headlines.lead ? '' : '缺少头条'));
  const list = await check('稿件列表', '/api/v1/news?pageSize=5', {}, (b) => (b.data.list.length ? '' : '列表为空'));
  const id = list && list.data.list[0] && list.data.list[0].id;
  await check('稿件详情', `/api/v1/news/${id}`, {}, (b) => (b.data.article.contentHtml ? '' : '缺少正文'));
  await check('相关阅读', `/api/v1/news/${id}/related`);
  await check('频道页数据', '/api/v1/channel/tech?page=1');
  await check('视频频道数据', '/api/v1/video');
  await check('搜索接口', '/api/v1/search?q=%E7%AE%97%E5%8A%9B');
  await check('热点榜', '/api/v1/rank?type=hot&size=5', {}, (b) => (b.data.list.length ? '' : '榜单为空'));
  await check('爆款榜', '/api/v1/rank?type=blast&size=5');
  await check('焦点榜', '/api/v1/rank?type=focus&size=5');
  await check('头条榜', '/api/v1/rank?type=headline&size=5');
  await check('热门标签', '/api/v1/tags?size=8');

  console.log('\n[互动接口]');
  await check('评论列表', `/api/v1/comments?articleId=${id}`);
  await check('发表评论', '/api/v1/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ articleId: id, user: '自检机器人', content: '这是一条接口自检评论' })
  });
  await check('点赞互动', '/api/v1/interact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ articleId: id, type: 'like', uid: 'smoke-test' })
  });

  console.log('\n[App 联动接口]');
  await check('统一信息流', '/api/v1/feed?pageSize=5', {}, (b) => (b.data.list.length ? '' : '信息流为空'));
  await check('增量同步', '/api/v1/sync?limit=10', {}, (b) => (b.data.upserts ? '' : '缺少 upserts 字段'));

  /* 广场：写操作成对调用（点赞后取消、关注后取关），保证自检不污染线上数据 */
  console.log('\n[广场 · 社交媒体信息流]');
  const P = (body, extra = {}) => ({
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...extra
  });
  const sqUid = 'u_smoke_square';

  await check('广场页 HTML', '/square.html', {}, (b) => (String(b).includes('sq-shell') ? '' : '页面结构异常'));
  const sqFeed = await check('广场信息流', '/api/v1/square?pageSize=5', {}, (b) => (b.data.list.length ? '' : '信息流为空'));
  await check('广场趋势', '/api/v1/square/trends', {}, (b) => (b.data.topics && b.data.news ? '' : '缺少趋势数据'));
  await check('广场话题榜', '/api/v1/square/topics?size=5');
  const sqAsset = await check('广场配图素材', '/api/v1/square/assets?size=6', {}, (b) => (Array.isArray(b.data) && b.data.length ? '' : '素材为空'));
  await check('素材库不出现已占用图', '/api/v1/square?pageSize=100', {}, (b) => {
    const used = new Set();
    (b.data.list || []).forEach((p) => (p.images || []).forEach((u) => used.add(u)));
    const clash = ((sqAsset && sqAsset.data) || []).filter((u) => used.has(u));
    return clash.length ? `素材库混入了 ${clash.length} 张已被使用的图` : '';
  });
  await check('广场配图互不重复', '/api/v1/square?pageSize=100', {}, (b) => {
    const cnt = {};
    // 转发已按原帖折叠，同一画面在信息流里只允许出现一次
    (b.data.list || []).forEach((p) => (p.images || []).forEach((u) => { cnt[u] = (cnt[u] || 0) + 1; }));
    const dup = Object.keys(cnt).filter((k) => cnt[k] > 1);
    return dup.length ? `${dup.length} 张图被多条动态复用` : '';
  });
  await check('我的广场概览', `/api/v1/square/mine?uid=${sqUid}`);
  await check('最新排序', '/api/v1/square?sort=latest&pageSize=3');
  await check('热门排序', '/api/v1/square?sort=hot&pageSize=3');
  await check('未关注时给出提示', `/api/v1/square?sort=following&uid=${sqUid}_nobody`, {}, (b) => (b.data.needFollow === true ? '' : '应返回 needFollow'));
  await check('空内容发帖被拦截', '/api/v1/square', P({ uid: sqUid, content: '' }, { _expect: 400 }));

  const sqFirst = sqFeed && sqFeed.data.list[0] && sqFeed.data.list[0].id;
  if (sqFirst) {
    await check('点赞动态', `/api/v1/square/${sqFirst}/like`, P({ uid: sqUid }), (b) => (b.data.stats ? '' : '缺少统计'));
    await check('取消点赞', `/api/v1/square/${sqFirst}/like`, P({ uid: sqUid }));
    await check('收藏动态', `/api/v1/square/${sqFirst}/bookmark`, P({ uid: sqUid }));
    await check('取消收藏', `/api/v1/square/${sqFirst}/bookmark`, P({ uid: sqUid }));
    await check('动态详情', `/api/v1/square/${sqFirst}?uid=${sqUid}`, {}, (b) => (b.data.post && b.data.replies ? '' : '缺少详情字段'));
  }
  await check('关注账号', '/api/v1/square/follow', P({ uid: sqUid, handle: 'tech_lab' }), (b) => (b.data.following ? '' : '缺少关注列表'));
  await check('取消关注', '/api/v1/square/follow', P({ uid: sqUid, handle: 'tech_lab' }));

  console.log('\n[后台接口]');
  const login = await check('后台登录', '/api/v1/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin888' })
  });
  const token = login && login.data && login.data.token;
  if (token) {
    const auth = { Authorization: `Bearer ${token}` };
    await check('后台概览', '/api/v1/admin/stats', { headers: auth });
    await check('后台稿件列表', '/api/v1/admin/news?pageSize=5', { headers: auth });
    await check('站点设置读取', '/api/v1/admin/site', { headers: auth });
  } else {
    console.log('  ! 未取得令牌，跳过需要鉴权的接口（请先执行 npm run seed 初始化账号）');
  }
  await check('未授权访问返回 401', '/api/v1/admin/stats', { _expect: 401 });

  console.log(`\n自检结果：通过 ${pass} 项，失败 ${fail} 项`);
  console.log(fail === 0 ? '全部通过 ✔\n' : '存在失败项，请根据上方提示排查 ✘\n');
  process.exit(fail === 0 ? 0 : 1);
})();
