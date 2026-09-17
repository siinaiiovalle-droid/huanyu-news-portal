/**
 * 内容流水线 —— 采集 → 待审池 → 自动/人工审核 → 自动发布 → 定时调度
 *
 * 数据落盘（全部是文件，便于迁移与审计）：
 *   data/inbox.json        待审池：采集进来但还没发布的原始内容
 *   data/sources.json      采集源配置（RSS/Atom）
 *   data/collect-runs.json 每轮采集/审核/发布的运行日志
 *   data/pipeline.json     自动化规则与定时配置
 *
 * 状态流转：
 *   pending ──自动审核通过且达自动发布线──▶ published（同时写入稿件库）
 *           ──分值达标需人工确认──────────▶ pending（列表里标"待复核"）
 *           ──命中规则/分值不足──────────▶ rejected
 *           ──人工通过（立即/定时）──────▶ approved → published
 */
const { Store, ConfigStore, genId, nowISO } = require('./store');
const svc = require('./news-service');
const portal = require('./portal');
const feed = require('./feed-parser');
const image = require('./image-service');

const DEFAULT_SOURCES = [
  {
    id: 's_demo',
    name: '示例科技源（演示用，默认关闭）',
    channel: 'tech',
    url: 'https://www.example.com/feed.xml',
    enabled: false,
    status: 'draft',
    limit: 5,
    tags: [],
    weight: 1
  }
];

const DEFAULT_SETTINGS = {
  enabled: true,            // 流水线总开关
  autoReview: true,         // 采集后自动跑审核规则
  autoPublish: true,        // 达到自动发布线直接发布（否则全部留待人工）
  minScore: 55,             // 准入线：低于此分直接驳回（普通新闻约 55-65，热点突发 80+）
  autoPublishScore: 65,     // 自动发布线：达到此分无需人工
  maxPublishPerRun: 8,      // 每轮最多自动发布条数，防止一次灌爆首页
  maxAgeHours: 36,          // 内容时效：超过则判为过期
  minTitleLen: 8,
  minContentLen: 20,        // 正文过短才驳回（RSS 摘要普遍偏短，40 字以内属正常）
  autoFlag: true,           // 自动发布时按分值置头条/焦点
  headlineTopN: 2,          // 每轮最高分前 N 条设为头条
  focusTopN: 3,             // 每轮最高分前 N 条加入焦点专题
  defaultStatus: 'published',
  blockKeywords: ['博彩', '赌博', '色情', '刷单', '代开发票', '境外赌场', '裸聊', '私彩', '办证', '六合彩'],
  boostKeywords: ['突发', '最新', '重磅', '独家', '官宣', '曝光', '首例', '首次', '暴涨', '涨停',
    '预警', '通报', '冠军', '夺冠', '直击', '最新进展', '刷屏', '突发消息', '刚刚', '紧急'],
  schedule: { enabled: true, times: ['07:30', '18:00'], collectLimit: 5 },
  // 配图：自动为发布出去的稿件下载「内容相关且全站唯一」的高清配图
  autoImage: true,
  imagePerRun: 12,          // 每轮最多补图张数（含封面与正文图），避免拖慢采集
  imagePerArticle: 2,       // 每篇稿件最多补几张（1 = 只补封面）
  imagePool: true,          // 采集时就给待审池条目下载封面，后台审核时直接看得到图
  imageRoundMs: 150000,     // 每轮配图的总时间上限，超时的条目留到下一轮或手动补图
  // 采集代理：留空则读取环境变量 HTTPS_PROXY / HTTP_PROXY；国内服务器访问境外源时可填 http://127.0.0.1:7897
  proxy: '',
  lastRunAt: null,
  lastDailyAt: null
};

const inbox = new Store('inbox', []);
const runs = new Store('collect-runs', []);
const sources = new Store('sources', DEFAULT_SOURCES);
const settings = new ConfigStore('pipeline', DEFAULT_SETTINGS);

/**
 * 本轮采集的运行状态：后台点一次「本地采集」要把内容和配图一起跑完，
 * 跑完之前不允许再点第二下，所以这里记着"是否正在跑 + 跑到哪一步"，供前端轮询。
 */
const collectState = {
  running: false,
  startedAt: '',
  stage: 'idle',            // idle | fetch | images | done
  stageText: '',
  images: { total: 0, done: 0, filled: 0, failed: 0 },
  lastRun: null,
  error: ''
};

function setStage(stage, stageText) {
  collectState.stage = stage;
  collectState.stageText = stageText || '';
}

function collectStatus() {
  return {
    running: collectState.running,
    startedAt: collectState.startedAt,
    stage: collectState.stage,
    stageText: collectState.stageText,
    images: { ...collectState.images },
    lastRun: collectState.lastRun,
    error: collectState.error
  };
}

/* ------------------------------ 配置 ------------------------------ */

function getSettings() {
  const raw = settings.all();
  return { ...DEFAULT_SETTINGS, ...raw, schedule: { ...DEFAULT_SETTINGS.schedule, ...(raw.schedule || {}) } };
}

function patchSettings(patch = {}) {
  const next = { ...patch };
  if (patch.schedule) next.schedule = { ...getSettings().schedule, ...patch.schedule };
  return settings.patch(next);
}

/* ------------------------------ 采集源 ------------------------------ */

/** 老数据没有 id 字段，补齐后再做增删改 */
function ensureSourceIds() {
  let dirty = false;
  sources.all().forEach((s) => {
    if (!s.id) { s.id = genId('s_'); dirty = true; }
    if (s.weight == null) { s.weight = 1; dirty = true; }
  });
  if (dirty) sources.flush();
}

function listSources() {
  ensureSourceIds();
  return sources.all();
}

function createSource(payload = {}) {
  ensureSourceIds();
  if (!payload.url) throw new Error('采集源地址不能为空');
  return sources.insert({
    id: genId('s_'),
    name: payload.name || payload.url,
    channel: payload.channel || 'china',
    url: payload.url,
    enabled: payload.enabled !== false,
    status: payload.status || 'draft',
    limit: Number(payload.limit) || 5,
    tags: Array.isArray(payload.tags) ? payload.tags : String(payload.tags || '').split(/[,，\s]+/).filter(Boolean),
    weight: Number(payload.weight) || 1,
    timeout: Number(payload.timeout) || 12000,
    lastStatus: '',
    lastCount: 0,
    lastError: '',
    lastRunAt: null
  });
}

function updateSource(id, patch = {}) {
  const next = { ...patch };
  if (next.tags && !Array.isArray(next.tags)) {
    next.tags = String(next.tags).split(/[,，\s]+/).filter(Boolean);
  }
  delete next.id;
  const row = sources.update(id, next);
  if (!row) return null;
  sources.flush();
  return row;
}

function removeSource(id) {
  const ok = Boolean(sources.findById(id));
  if (ok) { sources.remove(id); sources.flush(); }
  return ok;
}

async function testSourceById(id) {
  const source = sources.findById(id);
  if (!source) throw new Error('采集源不存在');
  const result = await feed.testSource(source.url, { timeout: source.timeout || 12000, proxy: getSettings().proxy || '' });
  sources.update(id, {
    lastStatus: result.ok ? 'ok' : 'error',
    lastCount: result.count,
    lastError: result.ok ? '' : (result.error || '抓取失败'),
    lastRunAt: nowISO()
  });
  sources.flush();
  return result;
}

/* ------------------------------ 评分与审核 ------------------------------ */

function textOf(item) {
  return `${item.title || ''}${item.summary || ''}${(item.paragraphs || []).join('')}`;
}

function titleKey(title = '') {
  return String(title).replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
}

/** 综合评分 0-100：新鲜度 + 热点词 + 内容完整度 + 源权重 + 多媒体 */
function scoreItem(item, source, cfg) {
  const published = item.publishedAt ? Date.parse(item.publishedAt) : NaN;
  const at = Number.isNaN(published) ? Date.now() : published;
  const ageHours = Math.max(0, (Date.now() - at) / 3600000);

  let freshness = 2;
  if (ageHours <= 2) freshness = 25;
  else if (ageHours <= 6) freshness = 22;
  else if (ageHours <= 12) freshness = 18;
  else if (ageHours <= 24) freshness = 12;
  else if (ageHours <= 48) freshness = 6;

  const hits = (cfg.boostKeywords || []).filter((k) => (item.title || '').includes(k) || (item.summary || '').includes(k));
  const keywordScore = Math.min(15, hits.length * 5);

  const quality = Math.min(15, Math.round((item.paragraphs || []).length * 2.5 + textOf(item).length / 100));
  const weightScore = Math.min(10, Math.round((Number(source.weight) || 1) * 5));
  const media = (item.cover ? 3 : 0) + (item.link ? 2 : 0);
  // 基础分：通过基本校验的内容都保留，避免严肃新闻因缺少热词被一律误杀
  const base = 30;

  const score = Math.min(100, base + freshness + keywordScore + quality + weightScore + media);
  return {
    score,
    metrics: {
      ageHours: Number(ageHours.toFixed(1)),
      base,
      freshness,
      keywordHits: hits.length,
      keywordScore,
      quality,
      weightScore,
      media,
      hits
    }
  };
}

/** 重复检测：与稿件库 + 待审池比对标题与原文链接 */
function findDuplicate(item) {
  const key = titleKey(item.title);
  const link = item.link || '';
  const pool = [
    ...svc.news.all().map((a) => ({ title: a.title, sourceUrl: a.sourceUrl, from: '稿件库' })),
    ...inbox.all().map((a) => ({ title: a.title, sourceUrl: a.sourceUrl, from: '待审池' }))
  ];
  for (const row of pool) {
    if (link && row.sourceUrl && row.sourceUrl === link) return { duplicated: true, duplicateOf: `原文链接重复（${row.from}：${row.title}）` };
    const other = titleKey(row.title);
    if (!key || !other) continue;
    if (key === other) return { duplicated: true, duplicateOf: `标题重复（${row.from}：${row.title}）` };
    const short = key.length >= 12 && other.length >= 12;
    if (short && (key.includes(other) || other.includes(key))) {
      return { duplicated: true, duplicateOf: `疑似同一事件（${row.from}：${row.title}）` };
    }
  }
  return { duplicated: false, duplicateOf: '' };
}

/** 自动审核：返回 publish / review / reject 与原因 */
function evaluate(item, source, cfg, dup = { duplicated: false, duplicateOf: '' }) {
  const { score, metrics } = scoreItem(item, source, cfg);
  const reasons = [];

  if (dup.duplicated) {
    return { decision: 'reject', score, metrics, reasons: [dup.duplicateOf || '与已有内容重复'] };
  }
  if (cfg.autoReview === false) {
    return { decision: 'review', score, metrics, reasons: ['自动审核已关闭，等待人工处理'] };
  }

  const text = textOf(item);
  const hard = [];   // 硬性驳回：敏感词、无正文、过期、标题过短
  const soft = [];   // 软提示：正文偏少等，交人工判断而非直接枪毙
  const minLen = Number(cfg.minContentLen) || 20;

  const blockHit = (cfg.blockKeywords || []).find((k) => text.includes(k));
  if (blockHit) hard.push(`命中敏感/低质词：${blockHit}`);
  if (String(item.title || '').length < (cfg.minTitleLen || 8)) hard.push('标题过短');
  if (!String(text).trim()) hard.push('无正文内容');
  else if (text.length < minLen) soft.push(`正文偏少（${text.length} 字），建议人工补充`);
  if (metrics.ageHours > (cfg.maxAgeHours || 36)) hard.push(`内容超过时效（${Math.round(metrics.ageHours)} 小时）`);

  if (hard.length) return { decision: 'reject', score, metrics, reasons: hard.concat(soft) };

  // 软提示（如正文偏少）只作为人工复核时的提醒，不阻止高分内容自动发布
  if (cfg.autoPublish && score >= (cfg.autoPublishScore || 65)) {
    return { decision: 'publish', score, metrics, reasons: [`分值 ${score} 达到自动发布线 ${cfg.autoPublishScore}`].concat(soft) };
  }
  if (score >= (cfg.minScore || 55)) {
    return {
      decision: 'review',
      score,
      metrics,
      reasons: soft.concat([soft.length ? '需人工补充后发布' : `分值 ${score} 达到准入线，待人工复核`])
    };
  }
  return { decision: 'reject', score, metrics, reasons: [`分值 ${score} 低于准入线 ${cfg.minScore}`] };
}

/* ------------------------------ 采集 ------------------------------ */

function normalizeInboxItem(raw, source) {
  return {
    title: String(raw.title || '').trim(),
    summary: raw.summary || '',
    channel: source.channel || 'china',
    tags: feed.tagsFor(raw, source),
    author: source.name || '网络采集',
    sourceName: source.name,
    sourceUrl: raw.link || '',
    cover: '', // 不使用外链图：发布前统一下载到本地，避免破图
    // 采集源提供的原文配图直链：配图时优先本地化这张图，保证图片与内容一致
    sourceImage: raw.image || '',
    content: feed.buildContent(raw),
    publishedAt: raw.publishedAt || nowISO()
  };
}

/**
 * 执行一轮采集：抓源 → 去重 → 评分 → 自动审核 → 入库 →（可选）自动发布
 */
async function runCollect({ trigger = 'manual', limit = 0, sourceIds = null, by = 'system', autoPublish } = {}) {
  // 一次采集要连内容带配图一起跑完，跑完前不允许再来一轮（否则两轮会抢同一批图）
  if (collectState.running) {
    throw new Error('上一轮采集还没跑完（' + (collectState.stageText || '正在下载配图') + '），请等它结束再点');
  }
  collectState.running = true;
  collectState.startedAt = nowISO();
  collectState.error = '';
  collectState.images = { total: 0, done: 0, filled: 0, failed: 0 };
  setStage('fetch', '正在抓取采集源');
  try {
    return await runCollectInner({ trigger, limit, sourceIds, by, autoPublish });
  } finally {
    collectState.running = false;
    setStage('done', '本轮采集结束');
  }
}

async function runCollectInner({ trigger = 'manual', limit = 0, sourceIds = null, by = 'system', autoPublish } = {}) {
  const cfg = getSettings();
  const started = Date.now();
  const list = listSources().filter((s) => s.enabled !== false && (!sourceIds || sourceIds.includes(s.id)));

  const perSource = [];
  let fetched = 0;
  let added = 0;
  let duplicated = 0;
  let rejected = 0;
  let autoPublished = 0;
  let failed = 0;
  const candidates = [];

  for (const source of list) {
    const limitN = Number(limit) || Number(source.limit) || 5;
    try {
      const items = await feed.fetchFeed(source.url, { timeout: source.timeout || 12000, proxy: cfg.proxy || '' });
      fetched += items.length;
      let addedThis = 0;
      for (const raw of items) {
        if (addedThis >= limitN) break;
        const item = normalizeInboxItem(raw, source);
        const dup = findDuplicate(item);
        if (dup.duplicated) { duplicated += 1; continue; }
        const verdict = evaluate(item, source, cfg, dup);
        const doc = inbox.insert({
          ...item,
          sourceId: source.id,
          collectedAt: nowISO(),
          score: verdict.score,
          metrics: verdict.metrics,
          status: 'pending',
          auto: { decision: verdict.decision, reasons: verdict.reasons, checkedAt: nowISO() },
          review: null,
          articleId: ''
        });
        added += 1;
        addedThis += 1;
        if (verdict.decision === 'reject') {
          inbox.update(doc.id, {
            status: 'rejected',
            review: { by: 'system', at: nowISO(), comment: verdict.reasons.join('；') }
          });
          rejected += 1;
        } else {
          candidates.push(doc);
        }
      }
      perSource.push({ name: source.name, fetched: items.length, added: addedThis });
      sources.update(source.id, { lastStatus: 'ok', lastCount: items.length, lastError: '', lastRunAt: nowISO() });
    } catch (e) {
      failed += 1;
      perSource.push({ name: source.name, error: e.message });
      if (source.id) sources.update(source.id, { lastStatus: 'error', lastError: e.message, lastRunAt: nowISO() });
    }
  }

  // 给本轮新进池的条目先下载封面：后台审核时就能看到图，
  // 审核通过发布时这张图直接沿用，不会再下载一次、也不会重复占图。
  let poolStat = null;
  const roundDeadline = Date.now() + Math.max(30000, Number(cfg.imageRoundMs) || 150000);
  if (cfg.autoImage && cfg.imagePool && candidates.length) {
    setStage('images', '正在下载配图');
    try {
      poolStat = await ensureInboxCovers({ ids: candidates.map((d) => d.id), deadlineAt: roundDeadline });
    } catch (e) {
      console.error('[pipeline] 待审池配图失败：', e.message);
    }
  }

  const shouldPublish = autoPublish === undefined ? cfg.autoPublish : autoPublish;
  const publishedIds = [];
  if (shouldPublish && candidates.length) {
    candidates.sort((a, b) => (b.score || 0) - (a.score || 0));
    const quota = Math.max(0, Number(cfg.maxPublishPerRun) || 0);
    const picked = candidates.filter((d) => d.auto.decision === 'publish').slice(0, quota);
    picked.forEach((doc, i) => {
      const article = publishInboxItem(doc.id, {
        by: by || 'system',
        comment: '自动审核通过并发布',
        autoFlags: cfg.autoFlag && i < Number(cfg.headlineTopN || 0),
        autoFocus: cfg.autoFlag && i < Number(cfg.focusTopN || 0)
      });
      if (article) publishedIds.push(article.id);
      autoPublished += 1;
    });
  }

  // 自动配图：发布出去但还没封面的稿件继续补（用本轮剩下的时间，超时留到下一轮）
  let imageStat = null;
  if (cfg.autoImage && publishedIds.length) {
    setStage('images', '正在为已发布稿件配图');
    try {
      imageStat = await ensureImages({ articleIds: publishedIds, deadlineAt: roundDeadline });
    } catch (e) {
      console.error('[pipeline] 自动配图失败：', e.message);
    }
  }

  if (added) portal.refreshRanks();

  const run = runs.insert({
    type: 'collect',
    trigger,
    fetched,
    added,
    duplicated,
    rejected,
    autoPublished,
    failed,
    images: (imageStat || poolStat) ? {
      filled: (poolStat ? poolStat.filled : 0) + (imageStat ? imageStat.filled : 0),
      failed: (poolStat ? poolStat.failed : 0) + (imageStat ? imageStat.failed : 0),
      pool: poolStat ? { checked: poolStat.checked, filled: poolStat.filled, failed: poolStat.failed } : null
    } : null,
    durationMs: Date.now() - started,
    perSource,
    finishedAt: nowISO()
  });
  patchSettings({ lastRunAt: run.finishedAt });
  collectState.lastRun = {
    id: run.id, finishedAt: run.finishedAt, fetched: run.fetched, added: run.added,
    autoPublished: run.autoPublished, durationMs: run.durationMs, images: run.images
  };
  flushAll();
  return run;
}

/**
 * 为稿件补配图（复用图片服务）：
 *   - 优先使用采集源的原文配图（内容一定相关），失败再走关键词图库检索；
 *   - 每张图都会与全站指纹库比对，重复的自动换图，保证"各种新闻不出现重复配图"。
 */
async function ensureImages({ articleIds = [], inboxIds = [], limit = 0, maxSlots = 0, force = false, deadlineAt = 0 } = {}) {
  const cfg = getSettings();
  const budget = Math.max(1, Number(limit) || Number(cfg.imagePerRun) || 10);
  const slots = Math.max(1, Number(maxSlots) || Number(cfg.imagePerArticle) || 2);
  const ids = [...new Set([
    ...articleIds,
    ...inboxIds.map((iid) => (inbox.findById(iid) || {}).articleId).filter(Boolean)
  ])];
  image.beginBatch();

  let pool = svc.news.all().filter((a) => a.status !== 'deleted');
  if (ids.length) pool = pool.filter((a) => ids.includes(a.id));
  else pool = pool.filter((a) => !a.cover || (a.content || []).some((b) => b.type === 'image' && !b.src));
  pool = pool.slice(0, ids.length ? ids.length : budget);

  let filled = 0;
  let failed = 0;
  const articles = [];
  for (const article of pool) {
    if (deadlineAt && Date.now() > deadlineAt) break;
    const source = (inbox.findById(article.inboxId) || {}).sourceImage || '';
    const r = await image.ensureArticleImages(article, {
      proxy: cfg.proxy || '', force, sourceImage: source, maxSlots: slots
    });
    filled += r.filled;
    failed += r.failed;
    articles.push({ id: article.id, title: article.title, filled: r.filled, failed: r.failed, details: r.details });
  }
  return { checked: pool.length, filled, failed, articles };
}

/**
 * 给「待审池」条目下载封面：文件名 i-<待审id>-cover.jpg，写回条目的 cover 字段。
 * 两轮取图、都受本轮时间上限约束、3 路并发：
 *   第一轮走原文直链 / 原文页（几秒一条、内容与原文一致）；
 *   第一轮没配上的再按标题检索图库（十几秒一张，但大部分能配上）。
 * 超出预算或超时的条目保持无图，由后台单条「补图」或发布时再补。
 */
async function ensureInboxCovers({ ids = [], limit = 0, force = false, deadlineAt = 0, concurrency = 3 } = {}) {
  const cfg = getSettings();
  image.beginBatch();
  let pool = inbox.all().filter((d) => d.status !== 'rejected' && !d.articleId && (force || !d.cover));
  if (ids.length) pool = pool.filter((d) => ids.includes(d.id));
  pool.sort((a, b) => (b.score || 0) - (a.score || 0));
  const budget = Math.max(1, Number(limit) || Number(cfg.imagePerRun) || 10);
  pool = pool.slice(0, budget);

  const out = { checked: pool.length, filled: 0, failed: 0, budget: pool.length, items: [] };
  const okIds = new Set();

  const runPass = async (docs, fast) => {
    let cursor = 0;
    let passDone = 0;
    collectState.images = { total: docs.length, done: 0, filled: out.filled, failed: out.failed };
    const worker = async () => {
      while (cursor < docs.length) {
        if (deadlineAt && Date.now() > deadlineAt) return;
        const doc = docs[cursor++];
        const r = await image.ensureInboxImages(doc, {
          proxy: cfg.proxy || '', force, fast, budgetMs: fast ? 8000 : 25000
        });
        passDone += 1;
        collectState.images.done = passDone;
        if (r.ok) {
          inbox.update(doc.id, { cover: r.url });
          okIds.add(doc.id);
          out.filled += 1;
          collectState.images.filled = out.filled;
          out.items.push({ id: doc.id, title: doc.title, ok: true, why: '' });
        } else if (!fast) {
          // 两轮都没配上才计失败
          out.failed += 1;
          collectState.images.failed = out.failed;
          out.items.push({ id: doc.id, title: doc.title, ok: false, why: r.why || '' });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
  };

  await runPass(pool, true);
  // 检索兜底慢得多（十几秒到几十秒一张），每轮只给一半预算，剩下的下一轮或手动补
  const todo = pool.filter((d) => !okIds.has(d.id)).slice(0, Math.max(1, Math.round(budget / 2)));
  if (todo.length) await runPass(todo, false);
  inbox.flush();
  return out;
}

/** 对池中待审条目按当前规则重新判定（规则调整后可一键重跑） */
async function autoReviewPending({ by = 'system', publish = true } = {}) {
  const cfg = getSettings();
  const pending = inbox.all().filter((d) => d.status === 'pending');
  let toReview = 0;
  let rejected = 0;
  let published = 0;
  const candidates = [];

  pending.forEach((doc) => {
    const source = sources.findById(doc.sourceId) || { name: doc.sourceName, weight: 1, tags: [] };
    const item = { title: doc.title, summary: doc.summary, paragraphs: (doc.content || []).filter((b) => b.type === 'p').map((b) => b.text), publishedAt: doc.publishedAt, link: doc.sourceUrl, cover: doc.cover };
    const verdict = evaluate(item, source, cfg, { duplicated: false });
    inbox.update(doc.id, { score: verdict.score, metrics: verdict.metrics, auto: { decision: verdict.decision, reasons: verdict.reasons, checkedAt: nowISO() } });
    if (verdict.decision === 'reject') {
      inbox.update(doc.id, { status: 'rejected', review: { by, at: nowISO(), comment: verdict.reasons.join('；') } });
      rejected += 1;
    } else if (verdict.decision === 'publish') {
      candidates.push(doc);
    } else {
      toReview += 1;
    }
  });

  const publishedIds = [];
  if (publish && cfg.autoPublish && candidates.length) {
    candidates.sort((a, b) => (b.score || 0) - (a.score || 0));
    candidates.slice(0, Math.max(0, Number(cfg.maxPublishPerRun) || 0)).forEach((doc, i) => {
      const article = publishInboxItem(doc.id, {
        by,
        comment: '自动审核通过并发布',
        autoFlags: cfg.autoFlag && i < Number(cfg.headlineTopN || 0),
        autoFocus: cfg.autoFlag && i < Number(cfg.focusTopN || 0)
      });
      if (article) publishedIds.push(article.id);
      published += 1;
    });
  }

  let imageStat = null;
  if (cfg.autoImage && publishedIds.length) {
    imageStat = await ensureImages({ articleIds: publishedIds });
  }

  const run = runs.insert({
    type: 'review',
    trigger: by === 'system' ? 'auto' : 'manual',
    checked: pending.length,
    rejected,
    autoPublished: published,
    pendingReview: toReview,
    images: imageStat ? { filled: imageStat.filled, failed: imageStat.failed } : null,
    durationMs: 0,
    perSource: [],
    finishedAt: nowISO()
  });
  flushAll();
  return run;
}

/* ------------------------------ 审核与发布 ------------------------------ */

/** 把待审条目发布为正式稿件 */
function publishInboxItem(id, { by = 'system', status = null, comment = '', autoFlags = false, autoFocus = false, patch = null } = {}) {
  const item = inbox.findById(id);
  if (!item) return null;
  const cfg = getSettings();
  const merged = patch ? { ...item, ...patch, id: item.id } : item;
  const target = status || cfg.defaultStatus || 'published';

  const article = svc.createArticle({
    title: merged.title,
    summary: merged.summary,
    channel: merged.channel,
    tags: merged.tags,
    author: merged.author || merged.sourceName,
    source: merged.sourceName || merged.author || '网络采集',
    sourceUrl: merged.sourceUrl,
    // 采集时已经给待审条目下好封面就直接用，避免发布时再下载一次、再占一张图
    cover: merged.cover || '',
    content: merged.content,
    status: target,
    publishedAt: merged.publishedAt,
    origin: 'pipeline',
    inboxId: id,
    flags: {
      headline: !!autoFlags,
      headlineOrder: autoFlags ? 1 : 0,
      focus: !!autoFocus,
      hot: (merged.score || 0) >= 85,
      blast: (merged.score || 0) >= 90,
      top: false,
      recommend: Math.min(10, Math.round((merged.score || 0) / 10))
    }
  });

  inbox.update(id, {
    status: target === 'published' ? 'published' : 'approved',
    articleId: article.id,
    publishedInboxAt: nowISO(),
    review: { by, at: nowISO(), comment: comment || '审核通过并发布' }
  });
  flushAll();
  portal.refreshRanks();
  return article;
}

/** 人工通过：可立即发布，也可指定时间定时发布 */
function approve(id, { by = 'editor', publish = true, publishAt = '', patch = null } = {}) {
  const item = inbox.findById(id);
  if (!item) return null;
  // 幂等保护：已发布过的条目再次「通过并发布」不应生成第二篇稿件
  // （前端等待时间一长就容易被重复点击，旧实现每点一次都会多出一篇重复稿）
  if (item.status === 'published' && item.articleId) {
    return { scheduled: false, published: false, already: true, article: svc.news.findById(item.articleId) };
  }
  if (patch) inbox.update(id, patch);
  const at = publishAt ? String(publishAt).replace(' ', 'T') : '';
  if (at && Date.parse(at) > Date.now()) {
    inbox.update(id, {
      status: 'approved',
      scheduledAt: new Date(Date.parse(at)).toISOString(),
      review: { by, at: nowISO(), comment: '审核通过，定时发布' }
    });
    flushAll();
    return { scheduled: true, publishAt: new Date(Date.parse(at)).toISOString() };
  }
  if (!publish) {
    inbox.update(id, { status: 'approved', review: { by, at: nowISO(), comment: '审核通过，待发布' } });
    flushAll();
    return { scheduled: false, published: false };
  }
  const article = publishInboxItem(id, { by, comment: '人工审核通过并发布' });
  return { scheduled: false, published: true, article };
}

function reject(id, { by = 'editor', reason = '' } = {}) {
  const item = inbox.findById(id);
  if (!item) return null;
  inbox.update(id, { status: 'rejected', review: { by, at: nowISO(), comment: reason || '人工驳回' } });
  flushAll();
  return inbox.findById(id);
}

function batch(ids = [], { action = 'approve', by = 'editor', reason = '' } = {}) {
  let done = 0;
  let skipped = 0;
  const articleIds = [];
  const publishedIds = [];   // 本轮真正发布出去的待审 id，用于排后台配图
  ids.forEach((id) => {
    const item = inbox.findById(id);
    if (!item) return;
    // 幂等：已发布的条目直接跳过，避免重复点击生成重复稿件
    if ((action === 'approve' || action === 'approve-draft') && item.status === 'published' && item.articleId) {
      skipped += 1;
      return;
    }
    if (action === 'approve') {
      const r = approve(id, { by, publish: true });
      if (r && r.already) { skipped += 1; return; }
      if (r && r.article) { articleIds.push(r.article.id); publishedIds.push(id); }
      done += 1;
    } else if (action === 'approve-draft') { approve(id, { by, publish: false }); done += 1; }
    else if (action === 'reject') { reject(id, { by, reason }); done += 1; }
    else if (action === 'delete') { inbox.remove(id); done += 1; }
  });
  flushAll();
  return { done, skipped, articleIds, publishedIds };
}

/** 到点发布：待审池中已通过且定时时间已到的条目 + 稿件库中的定时稿件 */
async function publishDue({ by = 'system' } = {}) {
  const now = Date.now();
  let published = 0;
  const articleIds = [];

  inbox.all().forEach((doc) => {
    if (doc.status === 'approved' && doc.scheduledAt && Date.parse(doc.scheduledAt) <= now) {
      const article = publishInboxItem(doc.id, { by, comment: '定时发布' });
      if (article) articleIds.push(article.id);
      published += 1;
    }
  });

  svc.news.all().forEach((a) => {
    if (a.status === 'scheduled' && a.scheduledAt && Date.parse(a.scheduledAt) <= now) {
      svc.news.update(a.id, { status: 'published', publishedAt: a.scheduledAt });
      if (!a.cover) articleIds.push(a.id);
      published += 1;
    }
  });

  let imageStat = null;
  if (getSettings().autoImage && articleIds.length) {
    imageStat = await ensureImages({ articleIds });
  }

  if (published) { portal.refreshRanks(); flushAll(); }
  return { published, images: imageStat ? { filled: imageStat.filled } : null };
}

/* ------------------------------ 查询 ------------------------------ */

function listInbox({ status = '', channel = '', source = '', keyword = '', sort = 'score', page = 1, pageSize = 20 } = {}) {
  let pool = inbox.all();
  if (status) pool = pool.filter((d) => d.status === status);
  if (channel) pool = pool.filter((d) => d.channel === channel);
  if (source) pool = pool.filter((d) => (d.sourceName || '').includes(source) || d.sourceId === source);
  if (keyword) {
    const kw = String(keyword).toLowerCase();
    pool = pool.filter((d) =>
      (d.title || '').toLowerCase().includes(kw) ||
      (d.summary || '').toLowerCase().includes(kw) ||
      (d.tags || []).some((t) => String(t).toLowerCase().includes(kw))
    );
  }
  if (sort === 'time') pool = pool.slice().sort((a, b) => Date.parse(b.collectedAt || b.createdAt) - Date.parse(a.collectedAt || a.createdAt));
  else pool = pool.slice().sort((a, b) => (b.score || 0) - (a.score || 0));

  const p = Math.max(1, Number(page) || 1);
  const size = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const start = (p - 1) * size;
  return {
    list: pool.slice(start, start + size),
    pagination: { page: p, pageSize: size, total: pool.length, totalPages: Math.max(1, Math.ceil(pool.length / size)) }
  };
}

function stats() {
  const all = inbox.all();
  const newsAll = svc.news.all();
  const today = new Date().toISOString().slice(0, 10);
  const isToday = (iso) => String(iso || '').slice(0, 10) === today;
  const src = listSources();
  const cfg = getSettings();

  return {
    inbox: {
      total: all.length,
      pending: all.filter((d) => d.status === 'pending').length,
      approved: all.filter((d) => d.status === 'approved').length,
      rejected: all.filter((d) => d.status === 'rejected').length,
      published: all.filter((d) => d.status === 'published').length,
      todayCollected: all.filter((d) => isToday(d.collectedAt)).length,
      todayPublished: all.filter((d) => d.status === 'published' && isToday(d.publishedInboxAt)).length
    },
    news: {
      total: newsAll.filter((a) => a.status !== 'deleted').length,
      published: newsAll.filter((a) => a.status === 'published').length,
      drafts: newsAll.filter((a) => a.status === 'draft').length,
      scheduled: newsAll.filter((a) => a.status === 'scheduled').length,
      todayPublished: newsAll.filter((a) => a.status === 'published' && isToday(a.publishedAt)).length,
      views: newsAll.reduce((s, a) => s + (a.stats && a.stats.views ? a.stats.views : 0), 0)
    },
    sources: {
      total: src.length,
      enabled: src.filter((s) => s.enabled !== false).length,
      error: src.filter((s) => s.lastStatus === 'error').length,
      neverRun: src.filter((s) => s.enabled !== false && !s.lastRunAt).length
    },
    images: (() => {
      const s = image.stats();
      return {
        total: s.total,
        used: s.used,
        orphan: s.orphan,
        bytes: s.bytes,
        noHash: s.noHash,
        missingArticles: s.missingArticles,
        dupPairs: s.dupPairs
      };
    })(),
    pipeline: {
      enabled: cfg.enabled,
      autoPublish: cfg.autoPublish,
      autoImage: cfg.autoImage,
      minScore: cfg.minScore,
      autoPublishScore: cfg.autoPublishScore,
      scheduleEnabled: cfg.schedule.enabled,
      times: cfg.schedule.times,
      lastRunAt: cfg.lastRunAt,
      lastDailyAt: cfg.lastDailyAt,
      nextRunAt: nextRunAt(cfg)
    },
    latestRun: runs.all()[0] || null
  };
}

function listRuns({ limit = 20 } = {}) {
  return runs.all().slice(0, Math.max(1, Number(limit) || 20));
}

/* ------------------------------ 定时调度 ------------------------------ */

function nextRunAt(cfg) {
  const times = (cfg.schedule && cfg.schedule.times) || [];
  if (!cfg.schedule || !cfg.schedule.enabled || !times.length) return null;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  for (const t of [...times].sort()) {
    const at = new Date(`${today}T${t}:00`);
    if (at.getTime() > now.getTime()) return at.toISOString();
  }
  const first = [...times].sort()[0];
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
  return new Date(`${tomorrow}T${first}:00`).toISOString();
}

/** 每日任务：采集 → 自动审核/发布 → 到点发布 → 自动配图 → 刷榜 */
async function runDailyJob({ trigger = 'schedule', by = 'system' } = {}) {
  const cfg = getSettings();
  if (!cfg.enabled) return { skipped: true, reason: '流水线已关闭' };
  const run = await runCollect({ trigger, limit: Number(cfg.schedule.collectLimit) || 0, by });
  const due = await publishDue({ by });
  // 兜底补图：覆盖人工发布、定时发布等没走采集配图的稿件
  let images = null;
  if (cfg.autoImage) {
    try { images = await ensureImages({ limit: cfg.imagePerRun }); } catch (e) { images = { error: e.message }; }
  }
  patchSettings({ lastDailyAt: nowISO() });
  return { run, due, images };
}

let timer = null;
let lastTickKey = '';

function tick() {
  const cfg = getSettings();
  publishDue().catch((e) => console.error('[pipeline] 定时发布失败：', e.message));
  if (!cfg.enabled || !cfg.schedule || !cfg.schedule.enabled) return;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const key = `${now.toISOString().slice(0, 10)} ${hhmm}`;
  if ((cfg.schedule.times || []).includes(hhmm) && lastTickKey !== key) {
    lastTickKey = key;
    runDailyJob({ trigger: 'schedule' }).catch((e) => console.error('[pipeline] 每日任务失败：', e.message));
  }
}

function startScheduler() {
  if (timer) return timer;
  tick();
  timer = setInterval(tick, 30000);
  if (timer.unref) timer.unref();
  return timer;
}

function stopScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
}

function flushAll() {
  inbox.flush();
  runs.flush();
  sources.flush();
  svc.news.flush();
}

module.exports = {
  inbox, runs, sources, settings,
  getSettings, patchSettings,
  listSources, createSource, updateSource, removeSource, testSourceById,
  scoreItem, evaluate, findDuplicate,
  runCollect, autoReviewPending, publishInboxItem, approve, reject, batch, publishDue, runDailyJob,
  collectStatus, ensureImages, ensureInboxCovers,
  listInbox, stats, listRuns, nextRunAt,
  startScheduler, stopScheduler, flushAll
};
