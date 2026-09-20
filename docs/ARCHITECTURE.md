# 寰宇新闻网 · 架构说明（升级维护用）

> 本文记录**技术架构**与**内容架构**，供后续二期/三期升级时对照。
> 范围：第一~七节为**门户 Web 端**（新闻 / 广场 / 商城 / 后台）；第八节为**寰宇一体化 App（Flutter，`D:\dev\apps\huanyu`）**的六板块内容架构镜像，两处需同步更新。
> 数据规模为文档编写时的快照（2026-09-18）：稿件 364 篇、广场动态 98 条、评论 92 条、待审池 1105 条、采集源 17 个、采集运行日志 19 轮、互动流水 3 条、用户档案 9 份、后台账号 1 个、商城商品 24 件 / 订单 0 笔。

---

## 一、技术架构

### 1.1 技术选型

| 层面 | 选型 | 说明 |
| --- | --- | --- |
| 运行时 | Node.js ≥ 18 | 无第三方框架依赖（自研极简 HTTP 层） |
| 服务端 | `server/index.js` + `server/lib/*` | 纯 Node 标准库，零 npm 生产依赖 |
| 存储 | `data/*.json` 文件仓库（14 个集合） | `Store`/`ConfigStore` 封装，可平滑替换为 MySQL/MongoDB；商城（`mall`/`orders`）复用同一套持久层 |
| 前端 | 原生 HTML + CSS + JS | 无构建、无框架，8 个页面 + 9 个脚本 + 4 个样式表（含商城 `mall.*`） |
| 静态导出 | `scripts/build-static.js` + `scripts/static-shim.js` | 预渲染成纯静态包托管 GitHub Pages（商城页暂未纳入，见 1.6） |

### 1.2 分层与模块职责

```
server/index.js          路由注册与启动，统一响应信封 { code, message, data }
├── lib/http.js          极简 HTTP 服务、路由匹配、静态文件、readBody
├── lib/config.js        CHANNELS 频道定义 + site 站点配置（ConfigStore）
├── lib/store.js         Store（集合型 JSON，内存索引 + 120ms 防抖落盘）
│                        ConfigStore（键值型 JSON）；文件损坏自动备份并恢复默认值
├── lib/news-service.js  稿件领域服务：列表/分页/排序/热度/评论/互动/统计
├── lib/portal.js        门户聚合层：首页、频道视图、榜单、视频、搜索、App Feed、增量同步
├── lib/social-service.js 广场（社交信息流）：动态、话题、回复、点赞/收藏/转发、关注
├── lib/mall-service.js  商城（寰宇严选）：类目、商品、秒杀、首页楼层编排、下单与订单
└── lib/auth.js          后台登录、Token 签发与校验
```

- **统一信封**：所有接口返回 `{ code, message, data }`，`code=0` 成功；分页数据由 `svc.paginate` 统一产出。
- **落盘策略**：写操作先改内存再防抖落盘；**跑完 `scripts/*.js` 后需重启服务**，否则内存缓存与文件不一致。
- **占位图**：`/api/v1/placeholder` 动态生成 SVG（13 套配色），离线环境也不会破图。

### 1.3 前端页面与脚本

| 页面 | 脚本 | 职责 |
| --- | --- | --- |
| `index.html` | `home.js` | 门户首页：快讯条、头条、焦点、频道区块、热点榜 |
| `channel.html` | `channel.js` | 频道页（按 `?id=` 区分频道） |
| `article.html` | `article.js` | 稿件详情 + 相关阅读 + 评论 |
| `video.html` | `video.js` | 视频频道（含侧栏榜单） |
| `search.html` | `search.js` | 全站搜索 |
| `square.html` | `square.js` | 广场：信息流、话题、趋势、发帖互动 |
| `admin.html` | `admin.js` | 运营后台：登录、稿件 CRUD、发布、刷榜、站点配置 |
| `mall.html` | `mall.js` + `css/mall.css` | 寰宇严选商城：品牌条、轮播、类目、秒杀、商品网格、详情/购物车/下单 |
| — | `common.js` | 公共：请求封装、导航/页脚渲染（含"严选商城"入口）、格式化、登录态 |

### 1.4 目录结构

```
data/          14 个数据集合（见第二节）
public/        前端静态资源：8 页面（含 mall.html）、4 css、9 js、img/
scripts/       运维脚本：种子数据、采集、配图、刷榜、静态导出、发布、冒烟测试
server/        服务端（见 1.2）
gh-pages/      静态导出产物（已被 .gitignore 忽略，同时作为 gh-pages 分支独立仓库）
```

### 1.5 商城（寰宇严选）开发架构

商城是**挂在门户主站下的独立业务模块**，与新闻主业共用持久层、HTTP 层和前端公共库，不引入任何新依赖。

```
server/lib/mall-service.js      领域层（唯一业务真源）
├── data/mall.json               商品集合（Store，种子 24 件，首次启动自动落盘）
├── data/orders.json             订单集合（Store）
├── server/index.js              路由层 /api/v1/mall/*（含 /mall → /mall.html 重定向）
└── public/mall.html + js/mall.js + css/mall.css
                                 前端：IIFE 单模块，无框架、无构建
```

**服务端分层约定**

| 层 | 位置 | 职责 |
| --- | --- | --- |
| 数据 | `mall-service.js` 内 `products`/`orders` 两个 `Store` | 与新闻共用 `store.js`：内存索引 + 120ms 防抖落盘 |
| 领域 | `listCategories` / `listProducts` / `getProduct` / `getSeckill` / `getHome` / `createOrder` / `listOrders` | 筛选、排序、折扣计算（`discountOf`）、装饰（`decorate` 现算 discount/saved/categoryName）、下单扣库存 |
| 路由 | `server/index.js` § 寰宇严选 | 只做参数透传与错误信封；**固定路径必须注册在 `/api/v1/mall/:id` 之前** |
| 前端 | `public/js/mall.js` | 渲染楼层、购物车、详情/下单弹层；依赖 `common.js` 的 `HY.api/escapeHtml/fmtNum/toast/uid` |

**前端模块设计（`mall.js`）**

- 单 IIFE + 单一 `state` 对象：`{ home, category, tag, keyword, sort, page, cart, detailQty }`，所有渲染从 state 派生，改筛选即改 state 后 `loadGoods()`。
- 渲染函数按楼层拆分：`renderBanners` / `renderCategories` / `renderTags` / `renderPick` / `renderSeckill` / `renderPromise` / `goodsCard` + `loadGoods` + `renderPager`。
- 交互层：`openDetail`（详情弹窗）、`openCart` / `renderCart`（购物车抽屉）、`openOrder` / `submitOrder` / `renderOrderSuccess`（结算）、`openOrders`（我的订单）、`startCountdown`（秒杀倒计时，按服务端 `endsAt` + `serverNow` 校准）。
- 购物车**只存浏览器**：`localStorage['hy_mall_cart']` 存 `{ id, title, cover, price, qty }`，`cartSum()` 复算金额与运费（满 199 包邮，否则 12 元），与服务端 `createOrder` 的运费口径保持一致。
- 配图零外链：商品 `cover`/`gallery` 全部走 `/api/v1/placeholder` 主题渐变 SVG，离线不破图。
- 视觉令牌集中在 `css/mall.css` 的 `:root`（`--m-brand` 主蓝、`--m-sale` 促销橙红、`--m-radius`/`--m-shadow`），改风格只动变量。

**接口清单（前缀 `/api/v1/mall`）**

`GET /mall/home`（一次拿全首页楼层）、`/mall/categories`、`/mall/seckill?size=`、`/mall/products?category&keyword|q&tag&sort&page&pageSize`、`/mall/:id`（详情 + 同类推荐）、`GET /mall/orders`、`POST /mall/orders`。

**已知缺口（待补）**

- `scripts/build-static.js` 的 `PAGES` 与接口清单**尚未包含商城**，静态导出后商城页读不到快照（见第五节）。
- 后台 `admin.html` 暂无商品/订单管理界面，商品目前由 `mall-service.js` 的种子常量维护。

### 1.6 App / 小程序与商城复用关系

- 内容侧仍走 `/api/v1/feed`（首屏全量）+ `/api/v1/sync`（增量），无需新增接口。
- 商城对外开放同一组 `/api/v1/mall/*`，**读接口可直接给 App/小程序复用**；下单依赖 `clientId(req)` 作为匿名 `uid`，接真实用户体系时把 `uid` 换成登录后用户即可。

---

## 二、内容架构

### 2.0 内容资产总览（升级前先读这一节）

**站点地图：页面 → 内容模块 → 数据来源**

| 页面 | 入口参数 | 内容模块 | 聚合函数 |
| --- | --- | --- | --- |
| `index.html` | — | 快讯条、头条区（lead / list / slider）、最新、热点榜、爆款榜、焦点、视频、图集、热门标签、各频道区块（lead + list）、站点统计 | `portal.getHome()` |
| `channel.html` | `?id=` | 频道头条 5 条、频道列表（分页/排序）、热点榜、频道推荐 | `portal.getChannelView()` |
| `article.html` | `?id=` | 正文块（p/image/video）、相关阅读、评论与点赞 | `news-service` |
| `video.html` | `?page=` | 视频列表（分页 12）+ 热点榜 | `portal.getVideoView()` |
| `search.html` | `?q=` | 搜索结果（按热度排序）、相关标签、热点榜 | `portal.search()` |
| `square.html` | `?sort=` `?topic=` | 信息流（recommend/latest/hot/following，cursor 分页）、趋势、话题、推荐作者、我的主页 | `social-service` |
| `mall.html` | `?category` `?q` | 品牌条、轮播、今日必买、类目、秒杀、全部好物、服务保障 + 详情弹窗 / 购物车抽屉 / 下单 | `mall-service` |
| `admin.html` | 需登录 | 运营概览、采集审核池、采集源、自动化规则、稿件管理、广场与评论、任务日志、账号管理 | 见 7.4 |

> 上表为**门户 Web 端**站点地图。App 端（Flutter）是另一套六 Tab 结构：新闻 / 视频（含直播）/ 商城 / 生活 / 消息 / 我的，见第八节。

**数据集合清单（`data/*.json`，14 个）**

| 文件 | 条数 | 内容域 | 读写方 |
| --- | --- | --- | --- |
| `news.json` | 364 | 稿件主库（含草稿/定时/已下线） | 后台 CRUD、流水线发布、前台只读 |
| `posts.json` | 98 | 广场动态 | 前台发帖/互动、后台置顶删除 |
| `comments.json` | 92 | 稿件评论 | 前台、后台检索删除 |
| `inbox.json` | 1105 | 采集待审池 | 流水线写入、后台审核 |
| `sources.json` | 17 | 采集源 | 后台维护、采集器读取 |
| `collect-runs.json` | 19 | 采集/审核运行日志 | 流水线写、后台任务日志读 |
| `pipeline.json` | 键值 | 自动化规则与阈值 | 后台改、流水线读 |
| `site.json` | 键值 | 品牌、导航、分页与各榜单条数 | 后台改、全站读 |
| `profiles.json` | 9 | 广场用户档案与关注关系 | 广场互动 |
| `interactions.json` | 3 | 稿件互动流水 | `POST /interact` |
| `admins.json` | 1 | 后台账号（加盐哈希） | `lib/auth.js` |
| `daily-stats.json` | 0 | 运营日报（预留） | `npm run daily` |
| `mall.json` | 24 | 商城商品 | `mall-service` |
| `orders.json` | 0 | 商城订单 | `POST /api/v1/mall/orders` |

**内容流转全图**

```
sources.json ──采集──▶ inbox.json ──自动评分/审核──┬─▶ news.json（自动发布）
                                                  ├─▶ 待人工复核（后台）
                                                  └─▶ 驳回留痕
news.json ──▶ 榜单/首页/频道/视频/搜索/App Feed  ──▶ comments.json、interactions.json
用户发帖 ──▶ posts.json ──▶ 广场信息流、话题、趋势
mall.json ──▶ 商城楼层 ──▶ orders.json
每一轮抓取/审核 ──▶ collect-runs.json；每天汇总 ──▶ daily-stats.json
```

### 2.1 频道体系（`server/lib/config.js`）

`CHANNELS` 是**唯一频道定义源**，App 端共用同一套 id，**勿随意变更**：

| id | 名称 | 特性 |
| --- | --- | --- |
| `headline` | 头条 | `show: false`，不进导航，仅作运营位 |
| `square` | 广场 | `isSocial: true`，数据来自 posts 而非稿件，指向独立页面 |
| `china` / `world` / `finance` / `tech` / `sports` / `ent` / `auto` / `culture` / `health` | 国内/国际/财经/科技/体育/娱乐/汽车/文化/健康 | 内容频道 |
| `video` | 视频 | `isVideo: true`，聚合含视频块或 `video` 字段的稿件 |

导航顺序由 `data/site.json` 的 `nav` 数组控制；新增频道 = 改 `CHANNELS` + 把 id 加进 `nav`。

### 2.2 内容模型

**稿件 `data/news.json`**（数组）

```
id, createdAt, updatedAt
title, subtitle, summary
channel, tags[], author, source, sourceUrl
cover, video, gallery
content[]            正文块：{ type: 'p' | 'image' | 'video', text/src/... }
status               published | draft | deleted
flags                { headline, hot, blast, focus, top, headlineOrder, recommend }
stats                { views, likes, comments, shares, favs, deltaViews, deltaLikes }
publishedAt
scheduledAt          定时发布时间（到点由调度器自动发布）
origin               manual 编辑部 | pipeline 采集流水线
inboxId              来源待审池条目 id，可回溯
```

- 状态机：`draft`（草稿）→ `published`（已发布）/ `scheduled`（定时待发，由 `scheduledAt` 判定）→ 下线仍保留在库，`listArticles` 只输出 `published`。
- 正文块 `content[]` 现支持 `p`（段落）/ `image`（配图）/ `video`（视频）；新增块类型需改 `news-service` 输出 + 前端渲染两端。
- `flags` 是运营编排的唯一开关：`headline` 头条、`focus` 焦点、`top` 置顶、`hot`/`blast` 榜单加权、`headlineOrder` 头条排序、`recommend` 推荐权重。

- 头条/焦点为**人工编排优先、热度兜底**：先取 `flags.headline` / `flag=focus`，不足时按热度补齐。
- 热度由 `news-service.js` 的 `hotScore`（综合）与 `blastScore`（增速）计算，榜单每 30 分钟可自动重排。

**广场动态 `data/posts.json`**

```
id, createdAt, updatedAt
author                { uid, name, handle, verified, bio, color }
content, images[], quote, topics[], repostOf, pinned
status, stats         { likes, reposts, replies, views, bookmarks }
```

- `topics[]` 由 `parseTopics()` 从正文 `#话题#` 自动解析，不必手工维护话题表；`getTopics()` 再按出现次数与热度聚合。
- 信息流排序：`recommend`（`feedScore`：互动加权 + 时间衰减）/ `latest` / `hot` / `following`（依赖 `profiles.following`），cursor 分页，`listFeed` 返回 `hasMore` + `nextCursor`。
- 配图由 `freeAssets()` / `assignImages()` 统一分配，**全站不重复**；`npm run square:dedupe` 可事后去重。
- 互动落 `stats` 与回复表，`interactionsOf()` 用于回填当前用户的点赞/收藏/转发态。

**采集待审池 `data/inbox.json`**（1105 条，内容流水线的中间态）

```
id, createdAt, updatedAt
title, summary, channel, tags[], author
sourceName, sourceUrl, sourceId, cover, sourceImage
content, publishedAt, rssPublishedAt, publishedAtAdjusted
score, metrics{}, auto{ decision, reason }, review{ by, at, note }
status               pending | approved | rejected | published
```

**互动流水 `data/interactions.json`**：`id, createdAt, updatedAt, articleId, userId, type`（`like`/`fav`/`share`），由 `POST /interact` 追加，用于后续做去重与反作弊。

**评论 `data/comments.json`**：`id, createdAt, updatedAt, articleId, user, avatar, content, likes, status`

**其余集合**

| 文件 | 内容 | 备注 |
| --- | --- | --- |
| `profiles.json` | `uid, following[]` | 广场关注关系 |
| `sources.json` | `name, channel, url, enabled, status, limit, tags` | RSS 采集源（17 个） |
| `admins.json` | `username, name, role, salt, password, status, lastLoginAt` | 后台账号（口令加盐哈希） |
| `interactions.json` | 稿件互动流水 | 当前为空 |
| `daily-stats.json` | 运营日报 | 当前为空 |
| `site.json` | 品牌名、导航、ICP、`hotSize/blastSize/focusSize/homeChannelSize/pageSize` | 后台可改 |
| `mall.json` | 商城商品（24 件） | 由 `mall-service.js` 的种子常量首次启动落盘；**改种子常量后需删文件重启才会生效** |
| `orders.json` | 商城订单 | 当前为空；下单由 `/api/v1/mall/orders` 写入 |

### 2.3 榜单与运营位

| 运营位 | 来源 | 数量配置 |
| --- | --- | --- |
| 头条 | `flags.headline` + 热度兜底 | 8（接口可传 size） |
| 热点榜 | `hotScore` 排序 | `hotSize`（10） |
| 爆款榜 | `blastScore` 排序 | `blastSize`（10） |
| 焦点 | `flag=focus` + 推荐权重 | `focusSize`（6） |
| 热门话题 | 标签计数 + 热度累加 | 12 |

### 2.4 商城内容架构（`server/lib/mall-service.js`）

商城把"商品"当内容运营：**买手选品 → 编辑部试用 → 上架留样**，配图与文案口径由编辑部统一，故不接外部商家的脏数据。

**类目体系（`CATEGORIES`，唯一定义源）**

| id | 名称 | 选品范围 |
| --- | --- | --- |
| `all` | 全部好物 | 聚合视图，不参与筛选 |
| `digital` | 数码影音 | 耳机 · 影像 · 智能穿戴 |
| `culture` | 图书文创 | 出版读物 · 新闻周边 |
| `home` | 家居生活 | 收纳 · 厨房 · 香氛 |
| `food` | 健康食品 | 茶饮 · 谷物 · 轻食 |
| `sports` | 运动户外 | 露营 · 健身 · 通勤 |
| `beauty` | 美妆个护 | 护肤 · 清洁 · 护理 |

新增类目 = 在 `CATEGORIES` 加一项（含 `icon` / `desc`），前端类目导航、侧栏筛选、商品详情的 `categoryName` 会自动带上；`listCategories()` 现算每个类目的商品数。

**商品模型 `data/mall.json`**

```
id (g001…), createdAt
title, subtitle, category
price, originalPrice        现价 / 划线价；折扣与"已省"在 decorate() 里现算，不入库
tag                         运营角标：编辑推荐 / 新品 / 热销 / 回购王 / 产地直发 / 编辑部同款 / 礼盒装
theme                       占位图配色（indigo/slate/cyan/violet/gold/amber/orange/purple/teal/green/sky/rose）
cover, gallery[]            均为 /api/v1/placeholder 生成的主题渐变 SVG
sales, rating, stock        销量 / 评分 / 库存（种子库存 50–249）
highlights[]                卖点三条
specs[]                     [[规格名, 值], …]
desc                        编辑部试用结论（内容口径，非商家话术）
```

- 折扣口径：前端 `offText()` 输出"X.X 折"（现价/原价×10），服务端 `discountOf()` 输出折扣率小数，两者同源，勿在库里存折扣字段。
- 排序：`recommend`（评分→销量）/ `sales` / `new` / `priceAsc` / `priceDesc` / `discount`，六种映射在 `listProducts` 的 `sorters`。

**楼层编排（`getHome()` 一次返回，避免前端多次往返）**

| 楼层 | 内容 | 规则 |
| --- | --- | --- |
| 轮播 `banners` | 3 条品牌位（开业季 / 秒杀 / 会员权益） | 常量 `BANNERS`，锚点分别指向 `#goods` `#seckill` `#promise` |
| 今日必买 `pick` | 侧栏榜单 | 复用 `top`（综合推荐前 8） |
| 类目 `categories` | 6 类目 + 全部 | `listCategories()` 带 count |
| 秒杀 `seckill` | 4 件 | 取折扣最深且销量高者；`seckillPrice` 在日常价上再让一档；`endsAt` 为次日 10:00，返回 `serverNow` 供前端校准倒计时 |
| 精选 `featured` | 带 `tag` 的商品前 6 | 运营角标即精选池 |
| 保障 `promises` | 正品 / 7 天无理由 / 极速发货 / 媒体监督 | 常量 `PROMISES`，把"媒体监督"做成信任背书 |
| 全部好物 `goods` | 分页网格 | `listProducts` 分页，默认 `pageSize=12` |

**订单模型 `data/orders.json`**

```
id (HY 前缀), uid, createdAt
lines[]                      { id, title, cover, price, qty, theme } 下单时快照，商品改价不影响历史单
amount, freight, payable, saved
receiver                     { name, phone, address }, remark
status                       '待付款'（MVP 仅此一档，无支付回调）
```

下单流程：`createOrder` 校验购物车非空与收货三项 → 逐行校验库存并扣减、累加销量 → 满 199 包邮否则运费 12 → 落单并 `flush()` 强制落盘。库存不足/商品下架直接抛错，由路由转成 `fail` 信封。

**运营位与内容审核**

- 商品内容属电商合规范围：标题、卖点、`desc` 由编辑部撰写，禁止直接搬运商家宣传语与绝对化用语。
- 秒杀价与划线价必须可追溯（有真实原价记录），`originalPrice` 不得虚高。

### 2.5 编排层契约（升级时最易踩的地方）

改前端或加端（App/小程序/静态版）前，先看这一节：每个页面的内容来自哪个聚合接口、返回哪些字段、条数由谁决定。

**`GET /api/v1/home` — `portal.getHome()`**

| 字段 | 内容 | 条数/来源 |
| --- | --- | --- |
| `site` | 品牌、导航、榜单条数 | `data/site.json` |
| `headlines` | `{ lead, list[5], slider[5] }` | `getHeadlines(9)` 切分：第 1 条做大头条，2–6 进列表，前 5 进轮播 |
| `latest` | 全站最新 | 8 |
| `hot` / `blast` | 热点榜 / 爆款榜 | `hotSize`(10) / `blastSize`(10) |
| `focus` | 焦点 | `focusSize`(6) |
| `videos` | 视频稿件 | 6 |
| `pictures` | 有 `gallery` 或正文图片块的稿件 | 6 |
| `tags` | 热门标签 | 12 |
| `channels` | 频道列表（含 `count`） | `CHANNELS` 中 `show !== false` |
| `exclude.usedIds` | 已用稿件 id（前 12） | 供"换一批"去重 |
| `stats` | `{ total, today, channels }` | 已发布总数 / 24h 内新增 / 频道数 |

> ⚠️ 首页**频道区块不是服务端一次返回的**：`home.js` 拿 `channels` 后逐个请求 `/api/v1/news?channel=<id>&pageSize=6`（最多 9 个频道）。`portal.js` 里的 `channelBlocks` 变量是历史遗留的弃用代码，别照着它改。

**其余聚合接口**

| 接口 | 返回字段 | 备注 |
| --- | --- | --- |
| `/channel/:id` | `channel`、`list` + `pagination`、`headline[5]`、`hot[10]`、`recommend[6]` | 排序 `new` / `hot` |
| `/video?page&pageSize` | `channel`、`list`、`hot` | 默认 pageSize 12 |
| `/search?q&page&pageSize` | `keyword`、`list` + `pagination`、`hot`、`relatedTags[8]` | 结果按 `hotScore` 排 |
| `/news/:id/related` | 同频道优先 + 标签加权 | `getRelated(size=6)` |
| `/rank?type=` | `hot` / `blast` / `focus` / `headline` / `tag` | 扩展榜单改 `index.js` 的 type 映射 |
| `/feed` | App 首屏全量，`channel/cursor/pageSize/sort` | 增量走 `/sync?since` |
| `/square?sort&cursor` | `list` + `hasMore` + `nextCursor` | 四种排序，cursor 分页 |
| `/square/trends` | 话题 + 推荐作者 + 关联新闻 | `topicsSize/authorsSize/newsSize` |
| `/mall/home` | 商城首页全部楼层（见 2.4） | 一次拿全，避免多次往返 |

**列表统一约定**：分页字段一律 `{ page, pageSize, total, totalPages }`（`svc.paginate` 产出）；广场用 cursor 分页，字段为 `hasMore` + `nextCursor`。加端时不要自造分页结构。

---

## 三、开放 API 全景（前缀 `/api/v1`）

**内容**：`GET /site`、`/channels`、`/home`、`/news`（channel/tag/keyword/page/pageSize/sort）、`/news/:id`、`/news/:id/related`、`/channel/:id`、`/video`、`/rank?type=hot|blast|focus|headline|tag`、`/tags`、`/search`

**广场**：`GET /square/trends`、`/square/topics`、`/square/assets`、`/square/mine`、`/square`（sort=recommend|latest|hot|following，cursor 分页）、`GET /square/:id`；`POST /square`（发帖）、`/square/follow`、`/square/:id/replies`、`/square/replies/:id/like`、`/square/:id/like|bookmark|repost`

> ⚠️ 路由顺序：`/square/trends|topics|assets|mine` 必须注册在 `/square/:id` 之前，否则会被当作动态 id 匹配。

**互动**：`GET/POST /comments`、`POST /comments/:id/like`、`POST /interact`（like/fav/share）

**商城（寰宇严选）**：`GET /mall/home`（首页楼层一次拿全）、`/mall/categories`、`/mall/seckill?size=`、`/mall/products?category&keyword|q&tag&sort&page&pageSize`、`/mall/:id`（详情 + 同类推荐）、`GET /mall/orders`、`POST /mall/orders`

> ⚠️ 路由顺序同广场：`/mall/home|categories|seckill|orders` 必须注册在 `/mall/:id` 之前，否则会被动态 id 抢匹配。

**App / 小程序联动**：`GET /feed`（全量分页，支持 channel/cursor/sort）、`GET /sync`（`since` 增量同步）、`GET /placeholder`（SVG 配图）；商城读接口 `/api/v1/mall/*` 同样可直接复用

**后台**（除 login 外需 `Authorization: Bearer <token>`）：`POST /admin/login`、`/admin/logout`、`GET /admin/me`、`/admin/stats`、`GET/POST /admin/news`、`GET/PUT/DELETE /admin/news/:id`、`POST /admin/news/:id/publish`、`POST /admin/refresh-ranks`、`GET/PUT /admin/site`

---

## 四、内容生产与每日更新

| 命令 | 作用 |
| --- | --- |
| `npm start` / `npm run dev` | 启动服务（默认 3000，`PORT` 可覆盖） |
| `npm run seed` / `seed:posts` | 初始化稿件 / 广场种子数据 |
| `npm run collect` | 按 RSS 源采集新稿（标题去重，默认存草稿） |
| `npm run fetch:images` | 为缺失图位下载不重复配图并回写数据 |
| `npm run rank` | 刷新热点榜 / 爆款榜 |
| `npm run daily` | **一键日更**：采集 → 配图 → 刷榜 → 输出简报 |
| `npm run schedule` | 常驻定时：30 分钟刷榜、2 小时采集、07:30 日报 |
| `npm run square:dedupe` | 广场图片去重 |
| `npm run test:api` | 接口冒烟测试 |

> 脚本直接改 `data/*.json`，**改完必须重启服务**；生产环境用 `crontab` 或 `npm run schedule` 二选一，不要同时跑。

---

## 五、静态导出与部署

**构建**：`npm run build:static`
临时起本地服务（端口 4799）→ 遍历页面用到的 GET 请求 → 响应落盘为 `api/v1/**.json`（当前 395 个快照）→ 拷贝 `public/` 并把绝对路径改写成相对路径 → 注入 `static-shim.js`（运行时把接口请求改道到静态 JSON，写操作用 localStorage 模拟）→ 写入 `.nojekyll`。

> 坑位记录：接口 URL 的 `.json` 后缀**只能由 `static-shim.js` 在运行时补**；构建期若再补一次会拼成 `api/v1/site.json.json` 而 404（带参数的接口不受影响，表现为"只有一半接口可用"）。

**商城尚未纳入静态导出（待补）**：`build-static.js` 的 `PAGES` 数组仍为 `index/channel/article/video/search/square/admin`，预渲染清单里也没有 `/api/v1/mall/*`。要上线静态版商城，需两步：把 `mall` 加入 `PAGES`、把 `/api/v1/mall/home|categories|seckill` 与常用 `/api/v1/mall/products?…` 组合加入 `push` 清单（注意 `mall.html` 里的 `/mall.html` 路径替换也依赖 `PAGES`）。

**两种部署形态**

| 形态 | 方式 | 特点 |
| --- | --- | --- |
| 动态服务 | `npm start` 部署到 Node 服务器 | 完整读写，生产推荐 |
| 纯静态 | `gh-pages/` 推到 `gh-pages` 分支 | 只读快照，写操作不持久化 |

**当前线上**：仓库 `siinaiiovalle-droid/huanyu-news-portal`
- `main`：源码（本次提交 19 个文件）
- `gh-pages`：静态产物（559 文件 / 54.7MB，孤儿分支，独立 `.git`）
- Pages 源已设为 `gh-pages` 分支：https://siinaiiovalle-droid.github.io/huanyu-news-portal/
- 更新静态站流程：重新 `npm run build:static` → 在 `gh-pages/` 内 commit → push 到 `gh-pages` 分支（无需 force，构建产物分支；若要保持单提交可用 orphan + force）

---

## 六、升级扩展点

| 目标 | 改动位置 | 说明 |
| --- | --- | --- |
| 换数据库 | `server/lib/store.js` | 保持 `Store`(all/findById/find/insert/update/remove/count) 与 `ConfigStore`(get/set/all/patch) 接口不变，业务层零改动 |
| 加/改频道 | `server/lib/config.js` 的 `CHANNELS` + `data/site.json` 的 `nav` | id 与 App 共用，改名需两端同步 |
| 加正文块类型 | `news-service.js` 输出 + 前端渲染 | `content[].type` 现支持 `p` / `image` / `video` |
| 加榜单 | `portal.js` 新增聚合函数 + `index.js` 的 `/rank` type 映射 | 复用 `hotScore`/`blastScore` |
| 接真实用户体系 | `lib/auth.js` + `admins.json` / `profiles.json` | 现为文件账号 + Token |
| 图片体系 | `public/img/news/`、`scripts/fetch-images.js`、占位图 `/api/v1/placeholder` | 引用前确认文件存在，避免破图与 404 |
| App/小程序 | `/api/v1/feed`（首屏全量）+ `/api/v1/sync`（增量） | 已预留，无需新增接口 |
| 商城换数据库 | `server/lib/mall-service.js` 的 `products`/`orders` 两个 `Store` | 与新闻共用 `store.js` 接口，替换存储时业务层零改动 |
| 商城加类目/加商品 | `mall-service.js` 的 `CATEGORIES` / `SEED_PRODUCTS` | 长期应把商品迁到后台可维护（见下条） |
| 商城后台与支付 | 新增 admin 商品/订单模块 + `createOrder` 后接支付回调 | 现为匿名下单（uid = `clientId`）、`status` 只有"待付款" |
| App 板块升级 | `D:\dev\apps\huanyu`（Flutter）六 Tab | 扩展手册见 8.9，边界与路线见 8.12 |

**已知约束**
- 数据是文件存储 + 内存缓存，**多实例部署会不一致**，正式上量前必须先换共享存储。
- `interactions.json`、`daily-stats.json`、`orders.json` 目前为空，互动仅落到稿件 `stats` 与 `comments`。
- 静态版写操作只存浏览器 localStorage，不能作为真实数据。
- 商城购物车**只在浏览器本地**（`hy_mall_cart`），换设备/清缓存即丢失；订单无支付回调，`status` 恒为"待付款"。
- 商城商品数量与类目写在代码常量里，暂无后台增删界面；多实例部署时库存扣减同样会不一致（与新闻同一约束）。

---

## 七、内容流水线（采集 → 审核 → 发布）

### 7.1 数据流

```
data/sources.json       采集源（RSS/Atom，可后台维护）
        │  定时（默认每日 07:30 / 18:00）或手动触发
        ▼
server/lib/feed-parser.js   抓取与解析（支持 HTTP 代理隧道，见 7.5）
        ▼
data/inbox.json         待审池：原始内容 + 分值 + 自动审核结论
        │  自动审核（评分 / 敏感词 / 时效 / 去重）
        ├── 达自动发布线 → 直接写入 data/news.json（前台可见）
        ├── 达准入线     → 留待人工在后台复核（可编辑、定时发布）
        └── 命中规则     → 自动驳回并记录原因
        ▼
data/collect-runs.json  每轮运行日志（抓取/入库/重复/驳回/发布 全量留痕）
```

### 7.2 数据文件

| 文件 | 内容 | 说明 |
| --- | --- | --- |
| `inbox.json` | 待审池 | `status`: pending / approved / rejected / published；含 `score`、`metrics`、`auto.decision`、`review` 留痕 |
| `sources.json` | 采集源 | 17 个源，字段：name/channel/url/enabled/limit/tags/weight/timeout/lastStatus |
| `collect-runs.json` | 运行日志 | 每轮采集或审核的统计与分源明细 |
| `pipeline.json` | 自动化规则 | 阈值、敏感词、热点词、定时时间、代理 |

### 7.3 评分模型（0-100）

| 维度 | 分值 | 说明 |
| --- | --- | --- |
| 基础分 | 30 | 通过基本校验的内容都保留，避免严肃新闻被误杀 |
| 新鲜度 | 25 | ≤2h 满分，24h 后快速衰减，>48h 仅 2 分 |
| 热点词 | 15 | 命中 `boostKeywords`（突发/独家/暴涨…）每个 +5 |
| 内容完整度 | 15 | 段落数 ×2.5 + 字数/100 |
| 源权重 | 10 | `weight × 5`，重点源更高 |
| 配图与原文 | 5 | 有封面 +3、有原文链接 +2 |

审核判定：**硬驳回**（敏感词 / 无正文 / 超时效 / 标题过短）→ 直接拒绝；
达自动发布线（默认 65）→ 无人值守发布；达准入线（默认 55）→ 待人工复核；低于准入线 → 驳回。
重复内容（标题或原文链接命中稿件库/待审池）一律不入库。

### 7.4 后台功能地图

| 模块 | 能力 |
| --- | --- |
| 运营概览 | 待审/今日采集/今日发布/稿件与阅读量统计、频道分布、流水线状态与下次运行时间、一键采集/审核/每日任务 |
| 采集审核池 | 按分值/时间排序、状态与频道筛选、批量通过/驳回/删除、单条预览（评分明细 + 正文 + 原文链接）、编辑后发布、定时发布 |
| 采集源管理 | 增删改查、启用停用、连通性测试、单源立即采集、权重与每轮条数 |
| 自动化规则 | 开关、阈值、每轮上限、时效、敏感词与热点词、自动置头条/焦点、每日执行时间、代理 |
| 稿件管理 | 关键词/频道/状态/来源（编辑部 or 流水线）筛选、编辑、发布下线、头条与焦点编排、定时发布 |
| 广场与评论 | 动态置顶/删除、评论检索与删除 |
| 任务日志 | 每轮采集审核的抓取、入库、重复、驳回、发布与耗时 |
| 账号管理 | 账号增删改、角色与状态、改自己密码 |

### 7.5 代理与网络

Node 内置 `fetch` **不读取** `HTTPS_PROXY` 环境变量，因此 `feed-parser.js` 自行实现了：
无代理时直接请求；有代理时 HTTPS 走 CONNECT 隧道 + TLS、HTTP 走绝对地址。
优先级：后台 `pipeline.proxy` 配置 > 环境变量 `HTTPS_PROXY` / `HTTP_PROXY`。

### 7.6 定时与命令

- 服务启动时自动拉起调度（`pipeline.startScheduler()`，每 30 秒检查一次到点任务与定时发布）
- 若以脚本方式运行，用 `npm run schedule`（**与内置调度二选一，不要同时开**）
- 手动：`npm run collect`（采集+自动审核）、`npm run pipeline`（采集+审核+发布+定时）、`npm run daily`（采集→配图→刷榜→简报）

### 7.7 新增稿件字段

`news.json` 每条稿件增加：`scheduledAt`（定时发布时间）、`origin`（`manual` 编辑部 / `pipeline` 采集）、`inboxId`（可回溯到待审池条目）。

---

## 八、寰宇一体化 App（Flutter 端）架构与内容架构

> 代码仓库：`D:\dev\apps\huanyu`；配套文档：`docs/ARCHITECTURE.md` + `docs/CONTENT_ARCHITECTURE.md`（本节为门户架构文件对该 App 的**镜像索引**，两处需保持一致）。
> 定位：以"资讯为入口"的一体化超级 App —— 新闻 · 短视频直播 · 即时聊天 · 支付钱包 · 商城 · 本地生活 · 小程序容器。
> 一句话内容观：**一条内容（新闻 / 视频 / 直播 / 团单 / 商品）既是内容，也是交易入口；用户产生的一切又反过来变成新内容沉淀到消息与账单里。**
> 本次变更范围：**仅商城板块**（视觉与楼层重做），新闻 / 视频直播 / 本地生活 / 消息 / 我的 等板块内容未变。

### 8.1 技术栈与分层（开发架构）

```
表现层  lib/modules/    news · video · shop · life · im · pay · me · mini · shell
通用层  lib/widgets/     common.dart（返回键/头像/空态/金额）
        lib/theme/       app_theme.dart、flavor_switch.dart（皮肤切换过场动画）
状态层  lib/state/       app_state.dart = 全局业务中心（ChangeNotifier + ListenableBuilder）
数据层  lib/core/        models.dart（实体/枚举）· mock.dart（演示数据）· api.dart（HTTP）
```

- 依赖方向严格单向：`modules → widgets/theme → state → core`。
- 技术选型：Flutter / Dart `^3.13.3`；依赖仅 `http`、`video_player`、`qr_flutter`、`cupertino_icons`；状态管理用 `ChangeNotifier` + `ListenableBuilder`（零第三方成本，易迁移 Riverpod/Bloc）。
- 体量：`models.dart` 648 行、`mock.dart` 1032 行、`app_state.dart` 717 行、`modules/**` 约 5100 行（8 模块 16 页）。
- 资源：`assets/videos/clip1-3.mp4`（720p，约 3MB）+ 商城/生活真实图片（由 `tools/fetch_assets.js` 抓取）。

### 8.2 内容全景图

```
                    ┌──────── 内容中台（AppState 单一数据源）────────┐
                    │ 稿件 · 视频 · 商品 · 团单 · 订单 · 账单 · 评论 · 会话 │
                    └──────────────────────┬───────────────────────┘
                                           │ 分发
   ┌────────┬────────┬────────┬────────┬────────┬────────┐
   │ 新闻   │ 视频   │ 商城   │ 生活   │ 消息   │ 我的   │
   │ 资讯   │视频/直播│ 电商   │本地生活│ 社交   │ 账户   │
   └───┬────┴───┬────┴───┬────┴───┬────┴───┬────┴───┬───┘
       │        └─ 视频同款 / 直播购物袋 ─┐   │       │
       │                                 ▼   ▼       │
       │                          订单 → 支付 → 账单  │
       └──── 评论/点赞/直播留言 ──► 互动消息 ◄────────┘
```

### 8.3 站点地图（页面树）

| Tab | 一级页面 | 二级 / 浮层 | 内容入口 |
| --- | --- | --- | --- |
| **新闻** | `NewsHomePage` 频道信息流 | `ArticlePage` 稿件详情 | 10 个频道 Tab、搜索、风格切换 |
| **视频** | `VideoFeedPage`（关注 / 推荐 / 直播） | `CommentsSheet` 评论抽屉、视频购物卡、直播购物袋 | 竖向全屏 `PageView` 翻页 |
| **商城** | `ShopPage` 首页（本次重做） | `ProductPage` 商详、`CartPage` 购物车、`ConfirmOrderPage` 确认订单、`CheckoutPage` 收银台、`OrderListPage` / `OrderDetailPage` | 搜索、6 个分类金刚区、限时秒杀、领券、推荐瀑布流、直播入口 |
| **生活** | `LifePage` | `DealDetailPage` 团单详情 → 下单 → 收银台 | 8 个品类金刚区、筛选、团单列表 |
| **消息** | `ChatListPage` 会话列表 | `ChatPage` 聊天窗、`InteractionPage` 互动消息 | 8 个会话、互动消息入口 |
| **我的** | `ProfilePage` | `WalletPage` 钱包、`QrPage` 收付款码、`MiniAppsPage` 小程序、订单状态宫格 → `OrdersPage` | 账户、订单、钱包、小程序、外观 |

> 二级页统一用 `AppBackButton`（国内版 iOS 箭头 / 国际版 Material 箭头），保证处处可回退；消息 Tab 带 `totalUnread` 徽标。

### 8.4 各板块内容模型

**8.4.1 新闻（与本门户同源）**

| 项 | 内容 |
| --- | --- |
| 频道 | 推荐、国内、国际、财经、科技、体育、娱乐、汽车、文化、健康（`ChannelDef.all`，10 个） |
| 内容单元 | `Article`：标题 / 摘要 / 来源 / 发布时间 / 频道 / 配图 / 正文块（段落、图片） |
| 数据来源 | 门户 `GET /api/v1/feed`、`/api/v1/news/:id`，增量预留 `/api/v1/sync`；失败静默兜底 |
| 组织方式 | 分频道缓存 + 下拉刷新，双语频道名 `ChannelDef.nameOf(id, cn)` |
| 扩展动作 | 加频道 = 改 `models.dart` 的 `ChannelDef.all`，Tab 与请求参数自动跟随 |

**8.4.2 视频 / 直播**

| 项 | 内容 |
| --- | --- |
| 载体 | `assets/videos/clip1-3.mp4`（720p，约 3MB），`video_player` 真实解码 |
| 内容单元 | `VideoItem`：标题 / 作者 / 话题标签 / 点赞·评论·分享数 / 封面渐变 `ColorSeed` / asset 路径 / 关联商品 `productIds` / `live` 标志 / `viewers` |
| 现有内容 | 5 条：**2 条直播**（财经早班车、国际局势一周盘点）+ 3 条短视频（地铁新线实拍、AI 科普、深夜食堂） |
| 流栏目 | 顶部三栏：关注 / 推荐 / 直播；竖向全屏 `PageView` |
| 互动内容 | 评论抽屉（点赞评论、发评论）、直播飘屏留言 |
| 交易挂载 | 视频同款商品条 / 直播间购物袋 → `productIds` → 商详 → 下单（订单 `source=video/live`） |
| 扩展动作 | 加视频 = `Mock.videos` 追加一条；直播只需 `live: true` |

**8.4.3 商城（本次改动，2026-09-18）**

| 项 | 内容 |
| --- | --- |
| 分类 | 推荐、数码、服饰、食品、家居、运动、图书文创（6 个金刚区入口） |
| 商品 | 10 个（`p1`–`p10`）：T 恤、无线耳机、挂耳咖啡、智能手环、年度合订本、真皮手提包、榨汁杯、零食礼盒、碳板跑鞋、显示器支架 |
| 商品内容 | 多图轮播、价格/原价/折扣、SKU 规格矩阵（`specs` × `specOptions` → `skus`）、销量、评价列表、店铺卡、保障标签、详情图 |
| 首页楼层（改动后） | 品牌色吸顶搜索栏（扫一扫 + 购物车 Badge）→ 轮播 → 金刚区 → 活动行 → 限时秒杀（横滑倒计时）→ 领券 → 吸顶类目 + 排序筛选栏 → 商品瀑布流（2 列） |
| 视觉基线（改动后） | 页面底色 `#F5F6F8` / 暗色 `#0F1418`；商品卡白底圆角 + 轻阴影；瀑布流 `childAspectRatio` **0.56 → 0.66 → 0.58**（0.66 时卡片文字区溢出约 40px，已回调）；间距 10，列表左右 10、底部 24 |
| 交易内容 | 购物车 → 确认订单（地址/配送/优惠）→ 收银台（余额 / 花呗 / 银行卡）→ 订单与物流时间轴 → 评价 |
| 订单现状 | 6 条种子订单（`HY20260917001`…）覆盖 待发货 / 待收货 / 待评价 / 退款中 / 已完成 |
| 扩展动作 | 加商品 = `Mock.products` 追加，含 `specs/specOptions/skus` 三件套即可被详情页与购物车识别 |

**8.4.4 本地生活（对标美团）**

| 项 | 内容 |
| --- | --- |
| 品类 | 外卖、到店团购、酒店民宿、电影演出、丽人美发、家政维修、跑腿、旅游（8 个金刚区，`DealCategory`） |
| 团单 | 8 个（`d1`–`d8`）：老碗村双人餐、云谷咖啡手冲券、30 分钟闪送、亚朵大床房、星光影城通兑券、木源造型洗剪吹、空调深度拆洗、西溪湿地门票+观光车 |
| 团单内容 | 价格/原价/折扣、销量、评分、距离、门店、套餐内容、购买须知、用户评价 |
| 交易 | 抢购 → `createOrderFromDeal` → 同一套收银台与订单体系（订单 `source=local`） |

**8.4.5 社交 / 消息**

| 项 | 内容 |
| --- | --- |
| 会话 | 8 个（`s1`–`s8`）：编辑部群、林记者、家庭群、商城客服、张主编、寰宇支付、云谷食品旗舰店、本地生活客服 —— 覆盖同事 / 好友 / 商家客服 / 官方号 / 群聊 |
| 初始内容 | 每个会话预置 1–3 条带时间的历史消息（双语），进入即有上下文 |
| 自动回复 | 关键词规则：价格 / 物流 / 退款 / 发票 / 库存 / 营业时间 / 问候 + `defaultReplies` 兜底，延时 0.6–1.3 秒 |
| 消息形态 | 文本（双语）、图片、语音、转账、订单卡片、系统提示 |
| 互动消息 | `InteractionMsg` 5 类：点赞、评论、关注、礼物、订单动态；由视频评论/点赞、下单支付自动写入，读后清未读 |
| 业务系统消息 | 发货 / 退款 / 付款成功会自动往对应客服会话推送 |

**8.4.6 交易、支付与账户**

| 项 | 内容 |
| --- | --- |
| 订单 | 状态机：待付款 → 待发货 → 待收货 → 待评价 → 已完成；退款中 → 已退款；带 `source`（商城/视频/直播/本地生活）、`trail` 物流时间轴、`fromVideoId` 回跳锚点、评分与评价 |
| 账单 | 初始 12 条（`initialBills()`）：工资代发、广告分成、稿费、直播打赏分成、退款、话费充值、商城订单、本地生活团购、会员订阅、转账；之后每笔收支自动追加（`type` in/out） |
| 钱包 | 余额 12860.42、花呗额度 20000、账户安全、账单流水、我的订单入口 |
| 二维码 | 付款码（二维码 + 条形码，动态刷新）、收款码（可设金额，模拟对方付款入账） |

**8.4.7 小程序容器**

8 个入口（`m1`–`m8`）：寰宇新闻、寰宇商城、寰宇出行、生活缴费、寰宇健康、寰宇课堂、本地生活、寰宇支付 —— 覆盖资讯 / 电商 / 出行 / 缴费 / 健康 / 教育 / 生活 / 金融八条业务线，为后期容器化预留载体。

### 8.5 内容 × 形态 × 栏目 映射矩阵

| 内容类型 | 主栏目 | 复用出现的位置 | 用户可产生的内容 | 可否变现 |
| --- | --- | --- | --- | --- |
| 新闻稿件 | 新闻 | 首页推荐、频道流 | 阅读 / 分享（占位） | 会员订阅、信息流广告 |
| 短视频 | 视频 | 商城直播入口、互动消息、订单回跳 | 点赞、评论、转发 | 视频同款带货 |
| 直播间 | 视频 | 商城首页直播入口、订单回跳 | 留言、点赞、下单 | 直播购物袋 |
| 商品 | 商城 | 视频同款、直播购物袋、订单、聊天订单卡片 | 评价、晒图（占位） | 直接交易 |
| 团单 | 生活 | 订单、客服会话 | 评价、核销 | 团购交易 |
| 会话消息 | 消息 | 订单详情"联系客服" | 发消息、发订单卡片 | 客服转化 |
| 互动消息 | 消息 | 视频评论、直播提醒 | 评论/点赞自动生成 | 回流视频 |
| 账单 | 我的 → 钱包 | 订单详情、支付结果页 | 无（系统生成） | 支付通道 |
| 订单 | 我的 → 订单 | 视频/直播回跳、客服会话、账单 | 评价、退款、物流 | 交易履约 |

### 8.6 内容流转链路

```
① 生产：RSS 采集 / 编辑后台（门户） ──► 稿件池 ──► /api/v1/feed ──► 新闻频道流
② 二创：稿件 → 短视频 / 直播选题 ──► VideoItem（挂载 productIds）
③ 分发：视频 ←→ 商城（同款）←→ 生活（到店券）←→ 小程序
④ 互动：点赞 / 评论 / 直播留言 ──► InteractionMsg（消息中心）──► 回跳原内容
⑤ 转化：视频/直播/商城/生活 ──► 订单（带 source）──► 收银台 ──► 账单
⑥ 沉淀：发货 / 收货 / 评价 / 退款 ──► 订单时间轴 + 客服系统消息 + 互动消息
⑦ 复购：订单 → 再次购买 / 评价 → 商品页 → 新一轮 ⑤
```

**核心约定**：任何用户行为都要"落内容" —— 下单必须产生账单，评论必须进入互动消息，退款必须进会话与订单时间轴。这是本架构与"各自独立的静态假数据"最大的区别。

状态层联动（都在 `app_state.dart` 内完成，页面只渲染）：

```
createOrderFrom* → Order(pendingPay)
  payOrder(useHuabei) ├─► balance -= amount（花呗走额度）
                      ├─► bills.add(BillItem)          ← 账单
                      ├─► order.status = pendingShip + trail
                      ├─► addInteraction(type: order)  ← 互动消息
                      └─► _pushSystemMessage()         ← 客服会话系统提示
addComment           ├─► comments.add(VideoComment)
                      └─► addInteraction(type: comment)
refundOrder          → 原路退回 → 账单负收入 → status=refunded → 会话推送
```

### 8.7 双语与皮肤机制

| 层级 | 做法 | 示例 |
| --- | --- | --- |
| 模型 | 双字段并存（`title`/`titleEn`、`text`/`textEn`、`name`/`nameEn`），读取用 `localized(isCn, ...)` | 视频标题「现场：城市地铁新线开通首日实拍」↔「Live: Metro new line opens」 |
| 枚举 | 扩展方法接受 flavor：`ChannelDef.nameOf(id, cn)`、`OrderStatus.action(flavor)`、`DealCategory.label(flavor)` | 「待发货」↔「To Ship」；「到店团购」↔「Deals」 |
| 品牌 | 第三方服务名随皮肤切换（`Brand.of(flavor)`） | 微信 · 支付宝 · 抖音 ↔ Telegram · PayPal · TikTok |
| 视觉 | 主题色、圆角、图标风格随 flavor 变化，切换走 `FlavorSwitch` 圆形扩散动画 | — |

### 8.8 运营位清单（可用于投放/替换）

| 位置 | 所在页面 | 当前内容 | 运营价值 |
| --- | --- | --- | --- |
| 开屏 / 首页首屏 | 新闻首页 | 频道 Tab + 推荐流 | 最强曝光 |
| 视频首帧 | 视频 Tab | 推荐首条视频 | 内容冷启动 |
| 直播卡 | 视频 Tab / 商城首页入口 | 2 个直播间 | 高转化 |
| 商城金刚区 | 商城首页 | 6 个分类 | 类目分发 |
| 限时秒杀 / 领券 | 商城首页 | 横滑秒杀卡 + 券楼层 | 促销 |
| 生活金刚区 | 生活首页 | 8 个品类 | 本地流量入口 |
| 互动消息 | 消息页顶部 | 未读互动 | 回流 |
| 小程序宫格 | 我的 → 小程序 | 8 条业务线 | 业务矩阵入口 |
| 订单状态宫格 | 我的 | 5 个状态 + 数量角标 | 履约提醒 |

### 8.9 内容扩展操作手册

| 想加什么 | 改哪里 | 需要什么字段 |
| --- | --- | --- |
| 新闻频道 | `core/models.dart` → `ChannelDef.all` | id（对应后端频道）、name、nameEn |
| 一条视频 / 直播 | `core/mock.dart` → `Mock.videos` | id、title(+En)、author、asset（或 url）、seed、tags、productIds、`live` |
| 一个商品 | `core/mock.dart` → `Mock.products` | id、title、price、originPrice、specs/specOptions/skus、shop、reviews、sales |
| 一个团单 | `core/mock.dart` → `Mock.deals` | id、category、price、originPrice、rating、distance、store、package、notes |
| 一个会话 | `core/mock.dart` → `Mock.sessions` + `initialMessages()` | id、name(+En)、avatarText、unread + 初始消息 |
| 一个小程序 | `core/mock.dart` → `Mock.miniApps` | id、name、desc、icon、category |
| 一条初始账单 | `core/mock.dart` → `initialBills()` | title、time、amount、type、icon、category |
| 一单初始订单 | `state/app_state.dart` → `_seedOrders()` | 见 `Order` 字段（`logisticsNo` 留空会自动生成 `trackingNo`） |

**命名规范**：视频 `v#`、商品 `p#`、团单 `d#`、会话 `s#`、小程序 `m#`、订单 `HY<yyyyMMdd>###`。
**注意**：商品 id 一旦被 `Mock.videos` 的 `productIds` 引用，就构成"视频同款"关系；订单 `fromVideoId` 与视频 id 对齐才能回跳（依赖 `VideoFeedPage(initialIndex:)`）。

**配图抓取**：`tools/fetch_assets.js`（零依赖，Node 18+）负责商城 10×3 张与本地生活 8 张真实照片 —— Bing 搜原图直链 → 尺寸门槛逐级放宽 → dHash 去重 → Pillow 居中裁切 → 渐进式 JPEG（商品 1200×1200、团单 1200×900），失败保留原图绝不留破图。常用：`node tools/fetch_assets.js --only=shop | --only=life | --files=p2_2,p10_1`。

### 8.10 App 与门户后端的接口契约

| 用途 | 接口 | 状态 |
| --- | --- | --- |
| 新闻首屏全量 | `GET /api/v1/feed?channel&cursor&pageSize&sort` | 已接（本机门户服务） |
| 稿件详情 | `GET /api/v1/news/:id` | 已接 |
| 增量同步 | `GET /api/v1/sync?since` | 预留，v1.2 后端化时启用 |
| 门户首页聚合 | `GET /api/v1/home` | 可选（App 新闻流走 feed） |
| 商城读接口 | `GET /api/v1/mall/home`、`/mall/products`、`/mall/:id` | Web 版已实现，App 仍用 `Mock`；v1.2 后可切换 |
| 下单 | `POST /api/v1/mall/orders` | Web 版已实现（匿名 uid），App 侧待接真实用户 |

> 现阶段 App 除新闻外均为本地 `Mock` 数据；接后端时替换 `api.dart` 与 `app_state` 的数据来源即可，UI 层零改动。

**App 侧寻址规则（2026-09-18 打通）**：`apiBaseUrl` 优先级为 `--dart-define=API_BASE` > 端上默认 > Web 同源；端上默认 Android 用 `http://10.0.2.2:3000`（模拟器访问宿主机）、其它端 `http://127.0.0.1:3000`；真机用 `flutter run --dart-define=API_BASE=http://<局域网IP>:3000`。Android 清单已开启 `usesCleartextTraffic="true"`，否则 HTTP 明文会被系统拦截导致 feed 与图片全部失败。门户封面规格 1600×900，App 列表缩略图与详情头图均直取原图。

### 8.11 本次商城改动清单（2026-09-18）

| 改动点 | 改动前 | 改动后 | 位置 |
| --- | --- | --- | --- |
| 页面底色 | 默认白 | 浅灰 `#F5F6F8`（暗色 `#0F1418`） | `shop_page.dart` `Scaffold.backgroundColor` |
| 商品卡比例 | `childAspectRatio` 0.56 | **0.66**（卡片不再又高又窄） | `SliverGridDelegateWithFixedCrossAxisCount` |
| 楼层组织 | — | 轮播 → 金刚区 → 活动行 → 秒杀 → 领券 → 吸顶筛选 → 瀑布流 | `CustomScrollView` slivers |
| 搜索栏 | — | 品牌色吸顶（`brand.shop`）、扫一扫 + 购物车 Badge | `SliverAppBar(pinned: true)` |
| 筛选栏 | — | 吸顶 `SliverPersistentHeader`，类目 + 排序 | `_FilterBarDelegate` |

校验：`flutter analyze` 0 error / 0 warning，`flutter build web --release` 通过。

**未完（下一步可做）**：楼层视觉细化（统一白卡 + 大圆角 + 分区标题、吸顶筛选改 pill 选中态）；商详 / 购物车 / 订单页沿用同一套视觉语言。

### 8.12 原型边界与演进路线

| 边界 | 现状 | 升级方向 |
| --- | --- | --- |
| 数据持久化 | 全内存，重启恢复初始 Mock | `shared_preferences` / `isar` / 后端 API，`AppState` 加 `load()` / `save()` |
| 支付 | 本地记账模拟 | 保留 `payOrder` 签名，内部替换为支付宝/微信/PayPal SDK |
| 聊天 | 本地延时模拟回复 | `sendMessage` 换成 WebSocket 长连接 |
| 视频 | 3 个本地 asset | HLS/RTMP 拉流（`better_player`），直播改真实房间协议 |
| 商品图 | 商城 / 生活 / **订单**已用真实 asset 实拍图（最小 1200×900），新闻走门户 CDN | 接图床/CDN 时统一收敛到 `Product.images` / `OrderItem.image`，注意内存缓存与列表复用；素材入库做纯色/黑图体检 |
| 新闻 | 依赖本机 Node 服务 | 抽 `Api` 接口层，多环境与鉴权、离线草稿同步（复用 `/api/v1/sync`） |
| 国际化 | 代码内 `localized()` | 抽 arb / i18n 资源，支持多语种运行时切换 |
| 路由 | `MaterialPageRoute` | 引入 go_router，处理深链（订单卡片 → 订单详情） |
| 状态管理 | ChangeNotifier 单实例 | 按域拆分 Store 或迁移 Riverpod/Bloc |
| 安全 | 无 | 支付密码 / 生物识别、敏感信息加密、证书绑定 |

**路线**：v1.1 数据持久化 → v1.2 接 CMS（稿件/商品/团单/小程序全部走后端，`Mock` 退化为离线兜底）→ v1.3 审核与合规（评论/直播留言/评价进审签流）→ v1.4 UGC（投稿视频、晒单、弹幕上云）→ v1.5 推荐引擎（曝光/点击/停留回流）→ v2.0 内容中台统一（一份内容多形态，跨端复用 `/api/v1/sync`）。

**内容红线**：所有对外内容必须双语齐备；所有图片/视频必须有本地兜底；所有交易内容必须能在"我的 → 订单 / 账单"中被追溯。

### 8.13 开发日志与对话记录

完整过程（环境搭建、手动装系统镜像、模拟器跑通、验收问题与修复清单、常用命令）见 **`docs/DEV_LOG.md`**，与 App 仓库 `D:\dev\apps\huanyu\docs\DEV_LOG.md` 同源同步。

最近的布局修复（2026-09-18）：

| 位置 | 改动 | 原因 |
| --- | --- | --- |
| 商城轮播（App `shop_page.dart` `_BannerSlider`） | 容器高度 134 → 140 | 内容实际 135.5px，溢出 1.5px（黄黑斜纹条） |
| 聊天会话行（App `chat_list_page.dart`） | `height: 44` → `BoxConstraints(minHeight: 44)` | 中文行高实际 45.5px，每个好友行都溢出 1.5px |
| 商城瀑布流（App `shop_page.dart`） | `childAspectRatio` 0.66 → **0.58** | 卡片文字区超出网格单元约 40px |

### 8.14 订单商品图改真实高清实拍（2026-09-18）

**现象**：订单卡片 / 订单详情里的商品位是一块渐变色块，不是商品照片。

**根因**：App 的 `OrderItem` 只带 `productId / title / spec / price / quantity / seed`，**没有图片字段**，UI 只能拿 `seed` 画渐变兜底（`order_page.dart` 两处：卡片 72px、详情 64px）。

**改动**：

| 文件 | 改动 |
| --- | --- |
| `lib/core/models.dart` | `OrderItem` 新增 `image`（商品首图 / 团购图 asset 路径，默认空） |
| `lib/state/app_state.dart` | 下单三处全部带图：购物车 → `p.images.first`、立即购买 → `p.images.first`、本地生活团购 → `deal.image`；种子订单的 `item()` 增 `imageOf(id)`，按 id 反查 `Mock.products` / `Mock.deals` |
| `lib/modules/shop/order_page.dart` | 新增 `_ItemThumb`：`Image.asset` + `BoxFit.cover` + `FilterQuality.medium`，缺图/加载失败回退原渐变块（不破图） |

**配图策略（写进内容架构）**：下单即快照图片路径（与价格快照同一原则，商品后续换图不影响历史单）；素材入库体检「尺寸 ≥1200×900、灰度标准差 ≥12、非纯色非全黑」。当前 38 张素材（30 商品 + 8 团单）全部达标。

### 8.15 文档同源与同步约定

| 文档 | 位置 | 职责 |
| --- | --- | --- |
| `docs/ARCHITECTURE.md` | 门户仓库 | 门户主架构（含 §8 App 摘要） |
| `docs/ARCHITECTURE.md` | App 仓库 `D:\dev\apps\huanyu` | App 专属架构细节（数据模型 / 模块 / 边界 / 演进） |
| `docs/CONTENT_ARCHITECTURE.md` | 两侧**同源同步** | 六 Tab 内容架构、内容流转、配图策略 |
| `docs/DEV_LOG.md` | 两侧**同源同步** | 开发过程、环境搭建、验收问题与修复清单、对话记录 |

规则：**App 细节以 App 仓库为准，门户 §8 只做摘要**；`CONTENT_ARCHITECTURE.md` 与 `DEV_LOG.md` 两边必须逐字同步，任一改动当日内互拷一次。

### 8.16 商城大栏目子页接线（2026-09-19）

**现象**：App 商城首页的轮播、金刚区、活动行、秒杀楼层点下去只有 toast 或"首页筛选变了"，商详「客服 / 店铺 / 分享」更是 `onTap: () {}` 空壳，用户感知就是"大栏目没有链接子页"。

**根因**：商城模块只有 `shop_page.dart` / `order_page.dart` 两个页面文件，分类、活动、秒杀专场、券包、店铺、搜索结果这些二级页从未实现；改版时重心在首页楼层视觉，入口先用了占位反馈。

**修法**：新增通用集合页 `lib/modules/shop/collection_page.dart`（标题 + 说明条 + 排序条 + 两列瀑布流，可选搜索框 / 排名角标 / 秒杀倒计时），10 处入口全部落到具体页面；`_ProductCard` 提为公开 `ProductCard`，首页瀑布流与集合页共用。清单见 `docs/DEV_LOG.md` §4.4。

**校验**：`flutter analyze` 0 error / 0 warning；`flutter build web --release` 通过；模拟器实点金刚区「数码」与商详「店铺」均正常进页。

## 9. 静态导出与 GitHub Pages（2026-09-20 补齐）

静态包由 `npm run build:static`（`scripts/build-static.js`）生成到 `gh-pages/`（已在 `.gitignore` 里，约 525MB，可随时删了重建），再推 `gh-pages` 分支；运行时由 `scripts/static-shim.js` 把 `fetch('/api/v1/...')` 重定向到预渲染好的 `.json` 快照。

### 9.1 新增页面必须登记两处，否则线上就是"打不开"

| 位置 | 作用 | 漏登记的后果 |
| --- | --- | --- |
| `const PAGES = [...]` | `toRelative()` 靠它把 `/xxx.html` 改写为 `./xxx.html` | 仓库子路径部署（`*.github.io/仓库名/`）时，导航点过去落到站点根 → 404 |
| `collectUrls()` | 枚举需要预渲染的 `/api/v1/**` 接口 | 静态包里没有对应快照，shim 取不到数据 → `emptyData()` 兜成空壳页面 |

当前登记：页面 `index / channel / article / video / search / square / admin / mall`；接口覆盖新闻 / 视频 / 搜索 / 广场 / 后台 / **商城**（`mall/home`、`mall/products` 逐类目与逐标签分页、24 条商品详情、`mall/orders`）。

### 9.2 快照文件名规则（两侧必须一致）

`scripts/build-static.js` 的 `fileFor()` 与 `scripts/static-shim.js` 的 `parts()` / `candidatesFor()` 是同一套算法：

1. 丢掉 `uid / token / _ / t / ts` 这类易变参数；
2. 其余按 key 排序拼成 `k-v`，用 `_` 连接，整体前缀 `__`；
3. 查询值先 `encodeURIComponent` 再把 `%` 换成 `_` —— **不能把非 ASCII 直接塌缩成 `-`**，否则「新品」「热销」这类同长度中文会共用同一份快照；
4. 例：`/api/v1/mall/products?category=all&page=1&pageSize=12` → `api/v1/mall/products__category-all_page-1_pageSize-12.json`。

运行时先找精确快照，找不到按 `SOFT_DROP`（`sort / keyword / channel`）逐级放宽，最后退到无参数快照 —— 所以控制台偶发一次 404 是设计内的降级尝试，不是故障。

### 9.3 静态版的"写操作"

`simulate()` 有界地模拟：`POST /api/v1/mall/orders` 会从预渲染的 `products.json` 取真实标题/价格/封面拼出订单，写进 `localStorage` 的 `hy_static_mall_orders`，再由 `withLocalOrders()` 并回 GET 列表（注意 `listOrders` 返回的是**数组**，不是 `{list}`）；广场发帖/点赞同理走 `hy_static_local_posts`、`hy_static_liked`。`/admin/**` 一律返回演示态失败，避免让人误以为改动已持久化。

### 9.4 占位图

只有 `global.HY.ph(text, theme, w, h)` 生成的 `/api/v1/placeholder?...` 才会被 shim 的 `patchHy()` 换成内联 SVG。**直接写在 CSS `background-image` 里的 `/api/v1/placeholder` 拦不住**（背景请求不经过 fetch/XHR），线上就是 404 破图 —— 商城 banner 正是这么踩的坑，已改走 `HY.ph`。
