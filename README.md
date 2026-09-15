# 寰宇新闻网 · 门户站点（一期工程）

> 寰宇传媒信息技术股份有限公司 —— 以新闻网站为入口，逐步构建"资讯 + 短视频/直播 + 聊天 + 支付 + 在线购物 + 小程序"的一体化平台。

一期目标：建成一个专业级综合新闻门户（对标新浪、腾讯新闻的 PC 门户形态），具备完整的**采编发流程、每日自动更新机制与开放内容 API**，为后续 App / 小程序直接复用内容中台做好接口准备。

---

## 一、快速开始

```bash
# 1. 初始化演示数据（45 篇图文/视频稿件 + 后台账号）
npm run seed

# 2. 启动服务
npm start
```

启动后访问：

| 入口 | 地址 | 说明 |
| --- | --- | --- |
| 门户首页 | http://localhost:3000/ | 头条区 + 多频道信息流 + 热点/爆款/焦点榜 |
| 视频频道 | http://localhost:3000/video.html | 短视频与直播回放聚合 |
| 搜索 | http://localhost:3000/search.html?q=算力 | 全站检索 + 相关话题 |
| 内容后台 | http://localhost:3000/admin.html | 账号 `admin` / `admin888`（请立即修改） |
| 开放 API | http://localhost:3000/api/v1/home | 见下文接口清单 |

接口自检（服务需先启动）：

```bash
npm run test:api
```

> 服务零第三方依赖，仅需 Node.js 18+，无需 `npm install`，适合在内网/受限网络环境部署。

---

## 二、目录结构

```
├─ server/
│  ├─ index.js              # 服务入口 + 全部路由（门户、互动、后台、App 联动）
│  └─ lib/
│     ├─ http.js            # 极简 HTTP 框架：路由、静态资源、CORS、请求体解析
│     ├─ store.js           # JSON 数据仓库（可平滑替换为 MySQL / MongoDB）
│     ├─ config.js          # 站点品牌与频道配置（改这里即可改名/增删频道）
│     ├─ news-service.js    # 稿件 CRUD、搜索、热度计算、评论与互动
│     ├─ portal.js          # 首页/频道聚合、榜单、App 信息流与增量同步
│     └─ auth.js            # 后台账号与令牌鉴权
├─ public/                  # 前端（原生 HTML/CSS/JS，无构建步骤）
│  ├─ index.html / channel.html / article.html / video.html / search.html / admin.html
│  ├─ css/main.css · css/admin.css
│  ├─ js/common.js · home.js · channel.js · article.js · video.js · search.js · admin.js
│  └─ img/                  # 新闻配图
├─ scripts/
│  ├─ seed.js               # 初始化/重置演示数据
│  ├─ refresh-ranks.js      # 榜单刷新（热点/爆款自动重排）
│  ├─ collect.js            # RSS 内容采集（对接外部源，默认存草稿待审）
│  ├─ scheduler.js          # 常驻定时任务（单机部署可用）
│  └─ smoke-test.js         # 全站接口自检
└─ data/                    # 运行时数据（JSON 文件，首次运行自动生成）
```

---

## 三、内容生产与"每天更新"机制

新闻网站的核心是**更新节奏**。本项目提供三条并行的更新通道：

### 1. 编辑部手动编排（主力）
后台 `admin.html` → 撰写稿件：
- 正文支持**段落 / 小标题 / 图片 / 视频 / 引用 / 列表**六种区块自由混排，可上下调整顺序；
- 支持封面、标签、来源、作者、定时发布时间；
- 运营位开关：**设为头条**（含排序）、**加入焦点专题**、**置顶推荐**、**推荐权重**。

### 2. 榜单自动重排（每日两次）
```bash
npm run rank
```
- **热点榜**：阅读、点赞×6、评论×12、分享×10 加权后，按时间衰减计算综合热度；
- **爆款榜**：近 48 小时内的增量（增速）排名，自动标记"爆款"标；
- 同时清零增速窗口，为下一个统计周期做准备。

首页头条在人工编排不足时会自动按热度补齐，保证任何时刻都有可用的头条区。

### 3. 外部源采集（可选）
编辑 `data/sources.json` 后执行：
```bash
npm run collect
```
支持 RSS 2.0 / Atom 源，按标题去重，默认入库为**草稿**，必须经编辑人工审核后才能发布（符合内容合规要求）。

### 4. 定时执行
- Linux 服务器推荐 crontab：
  ```cron
  */30 * * * * cd /srv/huanyu-news && node scripts/refresh-ranks.js >> logs/rank.log 2>&1
  0 */2 * * * cd /srv/huanyu-news && node scripts/collect.js >> logs/collect.log 2>&1
  ```
- Windows / 单机：`npm run schedule` 常驻执行（每 30 分钟刷榜、每 2 小时采集）。

---

## 四、开放 API（App / 小程序复用）

统一前缀 `/api/v1`，返回结构 `{ code, message, data }`，已开启 CORS，可直接被 App、小程序、合作方调用。

### 内容接口
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/site` | 站点信息 + 频道列表 |
| GET | `/channels` | 频道列表（含各频道稿件数） |
| GET | `/home` | 首页聚合数据（头条/最新/热点/爆款/焦点/视频/话题） |
| GET | `/news?channel=&tag=&keyword=&sort=&page=&pageSize=` | 稿件列表，`sort` 支持 `new/hot/blast/recommend` |
| GET | `/news/:id` | 稿件详情（含 `contentHtml` 与结构化 `content`），同时计入阅读量 |
| GET | `/news/:id/related` | 相关阅读 |
| GET | `/channel/:id?page=&sort=` | 频道页数据 |
| GET | `/video` | 视频频道数据 |
| GET | `/rank?type=hot\|blast\|focus\|headline\|tag&size=` | 各类榜单 |
| GET | `/tags` | 热门话题标签 |
| GET | `/search?q=` | 全站搜索 |

### 互动接口
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/comments?articleId=&sort=new\|hot` | 评论列表 |
| POST | `/comments` | 发表评论 `{ articleId, user, content }` |
| POST | `/comments/:id/like` | 评论点赞 |
| POST | `/interact` | 点赞/收藏/分享 `{ articleId, type: like\|fav\|share, uid }` |

### 广场接口（社交媒体信息流）

对应 PC 端 `/square.html`，移动端可直接复用这套接口做社区信息流。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/square?sort=recommend\|latest\|hot\|following&topic=&handle=&cursor=&pageSize=&uid=` | 信息流，返回 `list / nextCursor / hasMore / interactions`；`following` 且未关注任何人时返回 `needFollow: true` |
| POST | `/square` | 发布动态 `{ uid, name, content, images[], quoteId }`（正文 ≤ 280 字，配图最多 4 张且必须是站内 `/img/` 路径；同一张图只会归一条动态所有） |
| GET | `/square/mine?uid=` | 我的数据概览（发帖/获赞/关注）与关注列表 |
| GET | `/square/trends` | 侧栏数据：热门话题 + 推荐关注 + 今日要闻 |
| GET | `/square/topics?size=` | 话题榜（含每个话题的动态数） |
| GET | `/square/assets?size=` | 发帖可用的站内高清配图（只返回**尚未被任何动态使用**的图，从源头上选不到重复图） |
| POST | `/square/follow` | 关注/取关 `{ uid, handle }` |
| GET | `/square/:id?uid=` | 动态详情 + 回复列表 + 我的互动状态（同时计入阅读量） |
| POST | `/square/:id/like` | 点赞/取消点赞（幂等切换） |
| POST | `/square/:id/repost` | 转发/取消转发（在信息流里生成"某某转发了"记录，与推特一致） |
| POST | `/square/:id/bookmark` | 收藏/取消收藏 |
| POST | `/square/:id/replies` | 回复动态 `{ uid, name, content }` |
| POST | `/square/replies/:id/like` | 回复点赞 |

**配图去重**：同一张高清图在广场里只允许归一条动态所有，连刷几屏不会撞图。三重保障：

1. 素材库 `/square/assets` 只发还没被任何动态占用的图，用户选不到重复图；
2. 发布时同一条动态内自动去重；若某张图刚被别人用掉（并发场景），服务端自动改派一张空闲图；
3. 种子数据生成时逐张登记，天然不复用。

历史数据用一次性命令修复（保留首个使用者，其余改派空闲图）：

```bash
npm run square:dedupe
```

> 信息流里"某某转发了"展开的是原帖本身，同一画面出现两次是正常的转发展示，不计入重复。

### App 联动（重点）
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/feed?channel=&cursor=&pageSize=&uid=&sort=` | 统一信息流，游标分页，返回用户互动状态 |
| GET | `/sync?since=&channel=&limit=` | **增量同步**：返回 `since` 之后新增/更新/删除的稿件 |

同步示例（App 端首次全量 + 之后每 5 分钟增量）：

```bash
# 首次全量拉取
curl "http://localhost:3000/api/v1/feed?pageSize=20&cursor=0"

# 之后只需同步变更
curl "http://localhost:3000/api/v1/sync?since=2026-09-14T08:00:00.000Z"
```

### 后台接口（需 `Authorization: Bearer <token>`）
`POST /admin/login`、`GET /admin/me`、`GET /admin/stats`、
`GET/POST /admin/news`、`GET/PUT/DELETE /admin/news/:id`、`POST /admin/news/:id/publish`、
`POST /admin/refresh-ranks`、`GET/PUT /admin/site`。

---

## 五、内容合规与安全基线（必须落实）

1. **三审三校**：采集稿默认草稿态，需编辑审核后发布；后台操作留痕（`admins.json` 记录登录时间）。
2. **资质与备案**：互联网新闻信息服务许可、ICP 备案、公安备案，页脚已预留占位。
3. **版权与来源**：稿件含 `source` 与 `sourceUrl` 字段，转载须标注来源并获授权。
4. **账号安全**：上线前务必修改默认口令，建议后续接入短信/扫码登录与操作审计日志。
5. **内容风控**：评论区接入敏感词与人工审核机制（当前为 MVP 版，仅做长度与空值校验）。

---

## 六、从新闻网站到 App 平台的演进路线

| 阶段 | 目标 | 说明 |
| --- | --- | --- |
| 一期（已完成） | 专业新闻门户 + 内容中台 | 本站：多频道、图文视频、榜单运营、后台采编、开放 API |
| 二期 | 内容中台强化 | 数据库替换（MySQL + Redis）、图片/视频对象存储、稿件版本与审签流、数据看板与推荐算法 |
| 三期 | App 客户端（新闻同步） | 复用 `/api/v1/feed`、`/api/v1/sync`，实现资讯、短视频、直播、Push 推送 |
| 四期 | 社交与即时通讯 | 聊天/群组/动态，"像推特那样的信息流"；需建设内容审核与举报处置体系 |
| 五期 | 商业闭环 | 支付、在线购物、小程序开放平台；需支付牌照合作与风控体系建设 |

**基础设施演进建议**：JSON 文件 → MySQL（主从）+ Redis 缓存；本地磁盘 → 对象存储 + CDN；
单机 → 容器化 + 负载均衡；日志与监控 → 结构化日志 + 埋点分析。

---

## 七、常见问题

**改了网站名称/口号？**
后台 → 站点设置 修改后刷新前台即可；频道增删改 `server/lib/config.js` 中的 `CHANNELS`。

**图片不显示？**
配图放在 `public/img/`，或使用站内占位图服务 `/api/v1/placeholder?w=800&h=450&text=说明&theme=blue`（支持 `blue/teal/green/amber/rose/purple/slate/sky/indigo/gold/orange/violet/cyan` 主题）。

**视频怎么放？**
正文中插入"视频"区块，直接填 `.mp4` 地址；第三方平台分享链接会以 `iframe` 方式嵌入。演示数据中使用的是公开测试视频源，正式运营请替换为自有 CDN 地址。

**端口被占用？**
`set PORT=8080 && npm start`（Windows）或 `PORT=8080 npm start`（Linux/macOS）。

**想清空数据重来？**
`npm run seed`（会重置稿件、评论与后台账号）。

---

## 八、静态导出与 GitHub Pages

本站是 Node 服务端应用，GitHub Pages 只托管静态文件，因此提供一键静态导出：

```bash
npm run build:static      # 输出 gh-pages/：页面 + 383 个接口快照 + 图片
```

导出包做了三件事：

1. 临时启动本地服务，把页面会用到的每个 GET 请求跑一遍，响应落成 `api/v1/**.json`；
2. 把 `/css`、`/js`、`/img`、`/api/v1` 等绝对路径改写为相对路径，放在仓库子目录下也能打开；
3. 注入 `scripts/static-shim.js`：运行时把接口请求改道到静态 JSON，发帖/点赞/评论/后台登录在本地模拟（存 localStorage，不回写服务器）。

> 静态版没有服务端，**写操作不会持久化**；需要真实读写请用 `npm start` 部署到 Node 服务器。

发布（需先 `gh auth login`）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/publish-gh-pages.ps1 -Repo huanyu-news-portal
```

脚本会自动生成静态包、创建仓库、推送并开启 Pages，最后打印 `https://<用户名>.github.io/<仓库名>/`。
