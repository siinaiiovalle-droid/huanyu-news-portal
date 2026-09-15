# 寰宇新闻网 · 架构说明（升级维护用）

> 本文记录**技术架构**与**内容架构**，供后续二期/三期升级时对照。
> 数据规模为文档编写时的快照：稿件 76 篇、广场动态 98 条、评论 89 条、RSS 源 17 个、后台账号 1 个。

---

## 一、技术架构

### 1.1 技术选型

| 层面 | 选型 | 说明 |
| --- | --- | --- |
| 运行时 | Node.js ≥ 18 | 无第三方框架依赖（自研极简 HTTP 层） |
| 服务端 | `server/index.js` + `server/lib/*` | 纯 Node 标准库，零 npm 生产依赖 |
| 存储 | `data/*.json` 文件仓库 | `Store`/`ConfigStore` 封装，可平滑替换为 MySQL/MongoDB |
| 前端 | 原生 HTML + CSS + JS | 无构建、无框架，7 个页面 + 8 个脚本 |
| 静态导出 | `scripts/build-static.js` + `scripts/static-shim.js` | 预渲染成纯静态包托管 GitHub Pages |

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
| — | `common.js` | 公共：请求封装、导航/页脚渲染、格式化、登录态 |

### 1.4 目录结构

```
data/          9 个数据集合（见第二节）
public/        前端静态资源：7 页面、3 css、8 js、img/（133 jpg + 8 png）
scripts/       运维脚本：种子数据、采集、配图、刷榜、静态导出、发布、冒烟测试
server/        服务端（见 1.2）
gh-pages/      静态导出产物（已被 .gitignore 忽略，同时作为 gh-pages 分支独立仓库）
```

---

## 二、内容架构

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
```

- 头条/焦点为**人工编排优先、热度兜底**：先取 `flags.headline` / `flag=focus`，不足时按热度补齐。
- 热度由 `news-service.js` 的 `hotScore`（综合）与 `blastScore`（增速）计算，榜单每 30 分钟可自动重排。

**广场动态 `data/posts.json`**

```
id, createdAt, updatedAt
author                { uid, name, handle, verified, bio, color }
content, images[], quote, topics[], repostOf, pinned
status, stats         { likes, reposts, replies, views, bookmarks }
```

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

### 2.3 榜单与运营位

| 运营位 | 来源 | 数量配置 |
| --- | --- | --- |
| 头条 | `flags.headline` + 热度兜底 | 8（接口可传 size） |
| 热点榜 | `hotScore` 排序 | `hotSize`（10） |
| 爆款榜 | `blastScore` 排序 | `blastSize`（10） |
| 焦点 | `flag=focus` + 推荐权重 | `focusSize`（6） |
| 热门话题 | 标签计数 + 热度累加 | 12 |

---

## 三、开放 API 全景（前缀 `/api/v1`）

**内容**：`GET /site`、`/channels`、`/home`、`/news`（channel/tag/keyword/page/pageSize/sort）、`/news/:id`、`/news/:id/related`、`/channel/:id`、`/video`、`/rank?type=hot|blast|focus|headline|tag`、`/tags`、`/search`

**广场**：`GET /square/trends`、`/square/topics`、`/square/assets`、`/square/mine`、`/square`（sort=recommend|latest|hot|following，cursor 分页）、`GET /square/:id`；`POST /square`（发帖）、`/square/follow`、`/square/:id/replies`、`/square/replies/:id/like`、`/square/:id/like|bookmark|repost`

> ⚠️ 路由顺序：`/square/trends|topics|assets|mine` 必须注册在 `/square/:id` 之前，否则会被当作动态 id 匹配。

**互动**：`GET/POST /comments`、`POST /comments/:id/like`、`POST /interact`（like/fav/share）

**App / 小程序联动**：`GET /feed`（全量分页，支持 channel/cursor/sort）、`GET /sync`（`since` 增量同步）、`GET /placeholder`（SVG 配图）

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
临时起本地服务（端口 4799）→ 遍历 7 个页面用到的 GET 请求 → 响应落盘为 `api/v1/**.json`（当前 395 个快照）→ 拷贝 `public/` 并把绝对路径改写成相对路径 → 注入 `static-shim.js`（运行时把接口请求改道到静态 JSON，写操作用 localStorage 模拟）→ 写入 `.nojekyll`。

> 坑位记录：接口 URL 的 `.json` 后缀**只能由 `static-shim.js` 在运行时补**；构建期若再补一次会拼成 `api/v1/site.json.json` 而 404（带参数的接口不受影响，表现为"只有一半接口可用"）。

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
| 图片体系 | `public/img/news/`（133 jpg + 8 png）、`scripts/fetch-images.js`、占位图 `/api/v1/placeholder` | 引用前确认文件存在，避免破图与 404 |
| App/小程序 | `/api/v1/feed`（首屏全量）+ `/api/v1/sync`（增量） | 已预留，无需新增接口 |

**已知约束**
- 数据是文件存储 + 内存缓存，**多实例部署会不一致**，正式上量前必须先换共享存储。
- `interactions.json`、`daily-stats.json` 目前为空，互动仅落到稿件 `stats` 与 `comments`。
- 静态版写操作只存浏览器 localStorage，不能作为真实数据。
