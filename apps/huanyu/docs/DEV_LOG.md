# 寰宇一体化 App · 开发日志与对话记录

> 记录范围：2026-09-18 这一轮「把 App 跑起来 → 现场验收 → 修 bug」的完整过程。
> 最近更新（2026-09-18 末轮）：新增 §3.6「订单商品图改真实高清实拍」，并补齐三份架构/内容/日志文档的**两侧同源同步**约定（见 §3.7）。
> 2026-09-19：新增 §3.8 / §4.4「商城大栏目接子页」——通用商品集合页 `collection_page.dart`，10 处入口全部落到具体页面。
> 2026-09-20：新增 §3.9 / §4.5「网站的严选商城打不开」——本地站点正常，静态导出漏了 mall 页面与商城接口快照。
> 架构细节见 `docs/ARCHITECTURE.md`，内容架构见 `docs/CONTENT_ARCHITECTURE.md`，本文件只记**做了什么、为什么、怎么复现**。
> 同源文件：门户仓库 `docs/DEV_LOG.md`（两边需同步）。

---

## 0. 环境基线（复现前提）

| 项 | 值 |
| --- | --- |
| Flutter | 3.47.4（路径 `D:\dev\flutter`，**不在系统 PATH**，需手动前置） |
| Android SDK | `D:\dev\android\sdk`（注意不是 `D:\dev\android` 根） |
| 已装组件 | `platform-tools 37.0.1`、`platforms;android-36`、`build-tools;36`、`emulator 37.1.11` |
| 系统镜像 | `system-images;android-36;google_apis;x86_64`（r07，**手动安装**，见 §3） |
| JDK | `D:\dev\jdk\jdk-17.0.20.1+1` |
| AVD | `huanyu_phone`（Pixel 6，API 36，google_apis/x86_64） |
| 设备 | `emulator-5554` |
| 备用预览 | `flutter run -d chrome --web-port=8135`（Web 版，同一套 Dart 代码） |
| 门户新闻服务 | 门户仓库 `npm start` → `http://127.0.0.1:3000`；**模拟器内访问宿主机要用 `http://10.0.2.2:3000`** |

PowerShell 每次开新会话必须先设（**`cd /d` 不可用，用 `Set-Location`**）：

```powershell
$env:PATH = "D:\dev\flutter\bin;" + $env:PATH
$env:ANDROID_HOME = "D:\dev\android\sdk"
$env:ANDROID_SDK_ROOT = "D:\dev\android\sdk"
$env:ANDROID_USER_HOME = "D:\dev\android\.android"
$env:JAVA_HOME = "D:\dev\jdk\jdk-17.0.20.1+1"
$env:PUB_CACHE = "D:\dev\pub-cache"
Set-Location D:\dev\apps\huanyu
```

---

## 1. 开发架构速览（详见 ARCHITECTURE.md）

```
main.dart → app.dart（MaterialApp + 皮肤/双语）
  └─ state/app_state.dart    全局单例 AppState(ChangeNotifier)：flavor（国内/国际）、
     │                       收藏、购物车、订单、钱包、消息、皮肤、语言
  ├─ core/models.dart        数据模型（Article/Video/Product/Order/Session…）
  ├─ core/mock.dart          全量 Mock 数据（原型阶段无后端）
  ├─ core/api.dart           接口封装（预留，未接后端）
  ├─ theme/                  app_theme.dart（品牌色/明暗）、flavor_switch.dart（国内↔国际皮肤）
  ├─ widgets/common.dart     通用件（SeedAvatar、AppBackButton、空态、加载…）
  └─ modules/                shell（六 Tab 骨架）
                             news / video / shop / life / im / pay / me / mini
```

关键点：
- **六 Tab**：新闻、视频（含直播）、商城、生活、消息、我的；支付/小程序由各 Tab 二级跳入。
- **双形态**：`flavor.isCn` 决定国内版（微信/支付宝/淘宝形态）与国际版（Telegram/Stripe 形态）的同构异皮。
- **无后端**：数据全部来自 `core/mock.dart`，`core/api.dart` 是未来对接门户 `/api/v1` 的落点（契约见门户 ARCHITECTURE.md 8.10）。
- **资产**：`assets/` 下 68 张 jpg + 3 个 mp4，由 `tools/fetch_assets.js` 抓取。

---

## 2. 内容架构速览（详见 CONTENT_ARCHITECTURE.md）

| 板块 | 内容域 | 主要形态 |
| --- | --- | --- |
| 新闻 | 要闻/财经/科技/国际/体育/文化/健康 | 信息流、专题、图集、视频稿、离线包 |
| 视频 | 短视频、直播、长视频 | 沉浸流、弹幕、评论、打赏、带货 |
| 商城 | 商品、店铺、优惠券、订单、售后 | 首页楼层、瀑布流、商详、购物车、结算 |
| 生活 | 外卖/到店/酒旅/出行/便民 | 金刚区、榜单、门店、券包 |
| 消息 | 私聊、群聊、互动通知（评论/点赞/关注/开播/订单） | 会话列表、聊天页、互动中心 |
| 我的 | 账号、资产、内容足迹、设置、小程序 | 个人主页、资产卡、设置 |
| 支付 | 钱包、收付款、账单、银行卡 | 收银台、二维码、账单流 |

---

## 3. 对话与工作记录（时间线）

### 3.1 文档同步（承接上一轮）
- 诉求：把 App 六大板块的内容架构补进门户文档。
- 落地：门户 `docs/ARCHITECTURE.md` 新增**第八节「寰宇一体化 App（Flutter 端）架构与内容架构」8.1–8.12**；`2.0 内容资产总览`加 App 六 Tab 说明；`六、升级扩展点`加「App 板块升级」行。
- App 仓库侧同步：商城首页改版写入 `ARCHITECTURE.md` 4.4 与 `CONTENT_ARCHITECTURE.md` 3.3。
- 约定：**门户第八节 ↔ App 两份文档，任何一端改动都要双向同步**。

### 3.2 商城首页改版（上一轮）
- 楼层顺序：品牌色吸顶搜索栏（扫一扫 + 购物车 Badge）→ 轮播 → 金刚区 → 活动行 → 限时秒杀 → 领券 → 吸顶类目+排序 → 瀑布流。
- 视觉基线：底色 `#F5F6F8` / 暗色 `#0F1418`，白卡圆角，栅格间距 10，`childAspectRatio` 0.56 → 0.66（**本轮回调为 0.58**，见 §4）。

### 3.3 「把 App 在模拟器里跑起来」
- 排查：Windows 桌面端不可用（未装 VS「Desktop development with C++」），先给 Chrome Web 版（`localhost:8135`）顶上。
- 卡点：`system-images;android-36;google_apis;x86_64` 缺失 → `avdmanager` 报 `Package path is not valid`。
- 网络：dl.google.com 直连/代理（127.0.0.1:7897）都只有 ~0.29MB/s 且 zip 损坏；**腾讯云镜像 `mirrors.cloud.tencent.com/AndroidSDK`** 峰值 ~4MB/s，1.8GB 镜像下完。
- 手动安装镜像套路（可复用）：
  1. curl 从腾讯镜像下 `x86_64-36_r07.zip`；
  2. Windows `tar.exe -xf` 解压；
  3. 把包内顶层 `x86_64/` **平铺**到 `sdk\system-images\android-36\google_apis\x86_64\`（不要多套一层目录）；
  4. 手写/生成 `package.xml`（`localPackage` + `sysImgDetailsType`，revision 7），使 `sdkmanager --list_installed` 能识别；
  5. `flutter doctor --android-licenses` 全部接受。
- 启动链路：`avdmanager create avd -n huanyu_phone -k "system-images;android-36;google_apis;x86_64" -d pixel_6 -f` → `emulator.exe -avd huanyu_phone -no-snapshot-load -gpu host` → 等 `adb devices` 出 `emulator-5554` → `flutter run -d emulator-5554`。

### 3.4 用户在模拟器上验收，提出 4 个问题
> 「1、新闻没有图片，2、商城很多链接点不开，3、商城首页上面滑动部分含有黑黄斜条纹，4、支付板块没有返回键」

处理情况：

| # | 问题 | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 新闻无图 | 已处理 | 用 `tools/fetch_assets.js` 重抓；本轮又替换掉失效素材 `p9_2`（黑黄警示条纹图）、`p9_3`（全黑）、`life/d5`、`life/d7` |
| 2 | 商城链接点不开 | 部分 | 主链路（商品→商详→购物车→下单→支付）可用；**二级/辅助入口仍是空壳**（见 §5 遗留） |
| 3 | 黑黄斜纹条 | 已修 | 见 §4，本轮定位并消除全部溢出 |
| 4 | 支付无返回键 | 已具备 | `checkout_page / qr_page / wallet_page` 均有 `leading: const AppBackButton()` |

### 3.5 本轮：黄黑斜纹条（溢出调试条）
> 「商城首页上方的滑动板块，和聊天中每个好友图标旁都有一个黄黑斜纹条上面还写着 bottom overflowed by 1.5 pixels，是什么原因，把这个去掉吧」

**原因**：那不是图片，是 Flutter 在 debug 模式下画出的 **RenderFlex 溢出指示条**（黄黑斜纹 + `BOTTOM OVERFLOWED BY x PIXELS`），含义是「Flex/Column 的实际内容比给定高度高 x 像素」。release 构建不显示，但布局问题客观存在，必须修布局本身。

**定位方法（可复用）**：Flutter 的 Dart 侧异常**不进 logcat**，必须挂 `flutter run`/`attach` 的输出：

```powershell
# 后台跑，日志落盘（flutter run 编译约 30-60s，别在前台等）
Start-Process cmd -ArgumentList "/c","cd /d D:\dev\apps\huanyu && flutter run -d emulator-5554 > D:\dev\apps\huanyu\run.log 2>&1" -WindowStyle Hidden
# 逐个 Tab 点过去（6 Tab 均分：90/270/450/630/810/990，y≈2320），并在商城页上下滑
adb -s emulator-5554 shell input tap 450 2320
# 提取出错 widget 的位置
Get-Content run.log | Select-String -Pattern "lib/modules/[\w/]+\.dart:\d+"
```

日志样例（`The relevant error-causing widget was:` 后面就是精确的 `文件:行`）：

```
A RenderFlex overflowed by 1.5 pixels on the bottom.
The relevant error-causing widget was:
  Column Column:file:///D:/dev/apps/huanyu/lib/modules/im/chat_list_page.dart:301:24
constraints: BoxConstraints(0.0<=w<=302.7, 0.0<=h<=43.5)
```

> 坑：只有**首次**抛出的异常带 widget 位置，后续同类是 `Another exception was thrown:` 不带位置；所以要**重启 App 后逐页复现**，才能拿到每一处的文件行号。

### 3.6 本轮：订单里的照片要真实的高清
> 「订单里的照片要真实的高清的」

**排查链路**（可复用）：
1. `grep` 订单页图片渲染点 → 命中两处 `LinearGradient(colors: [it.seed.a, it.seed.b])`，说明画的是**渐变色块**；
2. 查模型 `OrderItem` → 只有 `productId / title / spec / price / quantity / seed`，**没有 image 字段**；
3. 结论：不是"图不清晰"，而是订单压根没用图，`seed` 只是离线兜底配色。

**处理**：`OrderItem` 加 `image` → 下单三处（购物车 / 立即购买 / 本地生活团购）与种子订单 `imageOf(id)` 全部写入真实图路径 → UI 换成 `_ItemThumb`（`Image.asset` + `BoxFit.cover` + `FilterQuality.medium`，缺图/失败回退渐变块）。

**素材体检**（一次性脚本 `tools/_img_scan.py`，用完即删）：38 张（商品 30 + 团单 8）**最小 1200×900**，灰度标准差 20.6 ~ 89.3，无纯色 / 黑图 / 低清；历史上漏检混入的 `p9_2`（黑黄警示条纹）、`p9_3`（全黑）、`life/d5`、`d7` 均已重抓替换。

**验证**：`我的 → 我的订单` 截图 `screenshots/orders_real.png`；用「灰度矩阵 + 高频能量」判定商品位是真实照片纹理（渐变块会平滑单调且方差极低）；`flutter run` 日志无 `Unable to load asset`、无溢出。

### 3.7 本轮：补齐开发架构 / 开发内容 / 对话记录
> 「修改和补充所有开发架构、开发内容、对话」

| 文档 | 补充内容 |
| --- | --- |
| App `docs/ARCHITECTURE.md` | §2 数据模型 `OrderItem.image`、§4.4 订单商品图渲染与来源、§7 边界表「商品图片」现状更新 |
| 门户 `docs/ARCHITECTURE.md` | §8.12 边界表同步、新增 **§8.14 订单商品图**、新增 **§8.15 文档同源与同步约定** |
| `docs/CONTENT_ARCHITECTURE.md`（两侧同源，门户侧此前缺失、已补拷） | §3.6 订单行项带图、新增 **§3.8 交易内容配图策略**（快照 / 兜底 / 素材体检三条规则） |
| `docs/DEV_LOG.md`（两侧同源） | 本节 + §3.6 + §5 遗留 + §7 对话索引 |

### 3.8 本轮：商城大栏目点击没有子页（2026-09-19）
> 「为什么 app 的商城板块大栏目没有链接子页」

**原因**（三件事叠在一起）：
1. 商城模块**只有两个页面文件**（`shop_page.dart` / `order_page.dart`），分类、活动、秒杀专场、券包、店铺、搜索结果这些二级页**从来没写过**；
2. 首页大栏目的点击被写成"占位反馈"：轮播 `onTap: (b) => _toast(...)`、活动行 `onTap: (t) => _toast(context, t)`、金刚区除直播间外只 `setState(() => _category = id)`（改的是首页筛选，不是进页）；
3. 商详底部「客服」「店铺」「分享」与店铺卡「进店逛逛」是 `onTap: () {}` 纯空壳（与 §5 遗留 1 同源）。

**处理**：新增通用商品集合页 `modules/shop/collection_page.dart`，所有大栏目统一落到它。详见 §4.4。

### 3.9 本轮：网站的严选商城打不开（2026-09-20）
> 「网站的严选商城打不开」

先分清**哪个"网站"**：本地 `npm start`（3000 端口）一切正常 —— `/mall.html` 200、`/api/v1/mall/home` / `products` / `{id}` 全部有数据，用 headless 浏览器实点也是 12 张商品卡 + 24 件选品 + 7 类目 + 4 秒杀 + 8 榜单，console **0 报错**。所以问题在**静态打包出来的 GitHub Pages 版本**。

**根因**（`scripts/build-static.js` 两处遗漏，商城页从上线起就没进过静态包）：
1. `const PAGES = [...]` 里**没有 `'mall'`** —— `toRelative()` 靠这份清单把 `/xxx.html` 改写成 `./xxx.html`，漏登记就保持绝对路径，在子路径部署（`*.github.io/仓库名/`）时导航点过去直接落到站点根的 404；
2. `collectUrls()` **没收集任何 `/api/v1/mall/**` 接口** —— 静态包里一个商城数据快照都没有，shim 取不到数据就 `emptyData()` 兜个空壳回去了，页面看着就是"空的/打不开"。

配套还修了三处：`fileFor` / shim 的查询值文件名算法原本把中文直接塌缩成短横（「新品」「热销」都变成 `--`，共用一份快照），改成先 `encodeURIComponent` 再落盘；首页 banner 背景图写死 `/api/v1/placeholder`（CSS background 请求 shim 拦不住），改走 `HY.ph()` 让 shim 换成内联 SVG；shim 补上商城下单的本地模拟，否则静态版「我的订单」永远空白。

改动清单见 §4.5。

---

## 4. 本轮修复清单

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `lib/modules/shop/shop_page.dart` | `_BannerSlider` 容器 `height: 134` → `140` | 轮播内 Column（标签+标题19px+副标题）实际 135.5px，容器写死 134 → 溢出 1.5px |
| `lib/modules/im/chat_list_page.dart` | 会话行文本区 `height: 44` → `constraints: BoxConstraints(minHeight: 44)` | 中文行高实际 45.5px（昵称16 +3 +消息13），写死 44 → 每个好友行都溢出 1.5px |
| `lib/modules/shop/shop_page.dart` | 瀑布流 `childAspectRatio: 0.66` → `0.58` | 卡片文字区（标题2行+券+价格+店铺+评分）超出网格单元约 40px，滚动进视口时才渲染报错 |

**验证**：重启 App → 六个 Tab 逐个点击 → 商城页上下滚动两次 → `run.log` 中 `overflowed by` **命中 0 条**（修复前有 1.5px×2、2.0px、16px、23px、40px 多处）。截图：`screenshots/shop_fixed.png`、`screenshots/im_fixed.png`。

### 4.2 新闻与门户同步 + 高清配图（2026-09-18）

**现象**：新闻板块一直是内置离线稿件（顶部提示「本机新闻服务未连通」），列表也没有配图。

**根因**（两个叠在一起）：
1. Android 9+ 默认拦截明文 HTTP，`http://…:3000` 的 feed 与图片请求被系统直接拒绝；
2. 非 Web 端 `apiBaseUrl` 写死 `127.0.0.1:3000`，而在**模拟器里 127.0.0.1 是模拟器自己**，根本到不了宿主机的门户服务。

**改动**：

| 文件 | 改动 |
| --- | --- |
| `android/app/src/main/AndroidManifest.xml` | `application` 增加 `android:usesCleartextTraffic="true"`（上 HTTPS 后应移除） |
| `lib/state/app_state_io.dart` | 新增 `defaultApiBase()`：Android → `http://10.0.2.2:3000`，其它端 → `http://127.0.0.1:3000` |
| `lib/state/app_state_web.dart` | 新增同名 `defaultApiBase()` 返回空串（Web 同源直连） |
| `lib/state/app_state.dart` | `apiBaseUrl` 优先级：`--dart-define=API_BASE` > 端上默认 > Web 同源 |
| `lib/core/models.dart` | `ChannelDef` 补 `video` 频道，与门户 `server/lib/config.js` 的 `CHANNELS` 对齐 |
| `lib/widgets/common.dart` | `NetImage` 加 `filterQuality: FilterQuality.medium`（门户原图 1600×900，默认 low 缩放发虚） |
| `lib/modules/news/article_page.dart` | 详情页正文前补**封面大图**（通栏、高 210、圆角 10） |

**同步链路**：`/api/v1/feed`（cursor 分页 + channel 过滤）→ `/api/v1/news/:id`（正文块）→ `/api/v1/sync`（增量）；任一环失败则回退 `offline_articles.dart` 并顶部提示，保证新闻板块永不空白。

**验证**：`uiautomator dump` 抓新闻页文本 → 命中门户真实标题「国产大模型推理成本再降一半…」，离线提示条消失；首页截图 `243KB → 982KB`（图片真实加载，此前是无图占位）。截图：`screenshots/news_synced.png`、`screenshots/news_detail.png`。

**真机联调**：`flutter run --dart-define=API_BASE=http://192.168.x.x:3000`（手机与电脑同一局域网）。

### 4.3 订单里的商品图改成真实高清实拍（2026-09-18）

**现象**：订单卡片/详情里的商品位置是一块**渐变色块**，不是商品照片。

**根因**：`OrderItem` 只带了 `productId / title / spec / price / quantity / seed`，**没有图片字段**，UI 只能拿 `seed` 画渐变兜底（`order_page.dart` 两处：`_OrderCard` 72px、订单详情 64px）。

**改动**：

| 文件 | 改动 |
| --- | --- |
| `lib/core/models.dart` | `OrderItem` 新增 `image`（商品首图 / 团购图 asset 路径，默认空） |
| `lib/state/app_state.dart` | 下单三处全部带图：购物车 → `p.images.first`、立即购买 → `p.images.first`、本地生活团购 → `deal.image`；种子订单的 `item()` 增加 `imageOf(id)`，按 id 从 `Mock.products` / `Mock.deals` 反查，历史种子订单自动补齐 |
| `lib/modules/shop/order_page.dart` | 新增 `_ItemThumb`：`Image.asset` + `BoxFit.cover` + `FilterQuality.medium`，缺图或加载失败回退原渐变色块（不会出现破图）；替换卡片 72px、详情 64px 两处色块 |

**素材体检**（`tools/_img_scan.py` 一次性脚本，已删）：`assets/shop` 30 张 + `assets/life` 8 张共 38 张，**最小 1200×900**，灰度标准差 20.6 ~ 89.3，无纯色图 / 黑图 / 低清图（此前已重抓的 `p9_2` 黑黄警示条、`p9_3` 全黑、`life/d5`、`d7` 均在其中）。

**验证**：`我的 → 我的订单` 截图 `screenshots/orders_real.png`，商品位高频能量与灰度矩阵呈现真实照片纹理（渐变块会是平滑单调且方差极低）；`flutter run` 日志无 `Unable to load asset`、无溢出。

### 4.4 商城大栏目接子页（2026-09-19）

新增 `lib/modules/shop/collection_page.dart`（通用商品集合页）：标题 + 说明条 + 排序条（综合/销量/价格/评分）+ 两列瀑布流，可选搜索框、排名角标、秒杀倒计时；空结果走 `EmptyView`。

| 入口 | 改动前 | 改动后 |
| --- | --- | --- |
| 搜索栏 | toast「搜索（演示）」 | 进搜索集合页（全量商品 + 实时关键字过滤） |
| 轮播 3 条 | toast | 会员日 → 领券中心；品牌日 → 数码会场；源头直供 → 食品会场 |
| 金刚区类目 | 只改首页筛选 | 进类目集合页（带类目内搜索） |
| 金刚区排行榜 | 改首页排序 + toast | 进排行榜子页（销量排序 + 前三名角标） |
| 金刚区领券 / 直播间 | 券弹层 / 视频页 | 保持不变（已有明确落点） |
| 活动行 3 项 | toast | 百亿补贴 → 补贴专场（折扣 ≤8.5）；直播间 → 视频页；会员日 → 领券中心 |
| 秒杀楼层 | 无出口 | 底部新增「查看全部秒杀商品 ›」→ 秒杀专场（带本场倒计时） |
| 商详「客服」 | 空壳 | 进 `ChatPage`（会话 `s4` 寰宇商城客服） |
| 商详「店铺」/「进店逛逛」 | 空壳 | 进店铺集合页（同店铺商品 + 店铺评分） |
| 商详「分享」 | 空壳 | 提示「商品链接已复制」 |

配套改动：`_ProductCard` 提为公开 `ProductCard`（首页瀑布流与集合页共用，补 `super.key`）；`_BannerData` 增 `titleEn / subtitleEn / category / coupon`；`_ActivityRow.onTap` 由 `ValueChanged<String>` 改为 `ValueChanged<int>`（按下标分发）。

**验证**：`flutter analyze` 0 error / 0 warning（18 条均为历史 `unnecessary_underscores` info）；`flutter build web --release` 通过；模拟器实点 —— 金刚区「数码」→ 集合页显示「共 2 件商品 · 支持销量 / 价格 / 评分排序」，商详「店铺」→「声海数码专营店 · 共 1 件在售」。

### 4.5 静态导出补上严选商城（2026-09-20）

| 文件 | 改动 |
| --- | --- |
| `scripts/build-static.js` | `PAGES` 补 `'mall'`（否则导航链接保持绝对路径；同时给这行加注释说明用途）；`collectUrls()` 新增**商城段**：`mall/home`（漏 push 就是空壳的直接原因）、`mall/orders`、`mall/products` 无参兜底、逐类目 × 3 页列表、逐标签 × 3 页列表、24 条商品详情；快照 README 的页面清单同步 |
| `scripts/build-static.js` + `scripts/static-shim.js` | 新增 `sanitize()`：**查询值先 `encodeURIComponent` 再把 `%` 换成 `_`**，两侧算法保持一致，消灭中文参数塌缩冲突（纯 ASCII 值文件名不变，所以历史快照不受影响） |
| `scripts/static-shim.js` | 新增商城写操作：`POST /api/v1/mall/orders` 从预渲染的 `products.json` 取真实标题/价格/封面拼出订单（含 `amount / freight / saved / payable / receiver`），存 `localStorage` 键 `hy_static_mall_orders`；`withLocalOrders()` 把本地订单并在 GET 列表前面（`listOrders` 返回的是**数组**，不是 `{list}`，一开始按对象写会被 `JSON.stringify` 丢字段） |
| `public/js/common.js` | `HY.ph(text, theme, w, h)` 增加可选尺寸参数，默认仍是 800×450，向后兼容 |
| `public/js/mall.js` | banner 背景图由手写 `/api/v1/placeholder?...` 改为 `HY.ph(b.tag, b.theme, 1200, 520)` —— 只有走 `HY.ph` 才会被 shim 的 `patchHy` 接管成内联 SVG |

**验证**（`npm run build:static` 后 `python -m http.server --directory gh-pages`）：`api/v1/mall/` 下 59 个快照（24 商品详情 + home/orders/products + 类目/标签分页）；headless 打开 `mall.html` → 24 件选品 / 12 张商品卡 / 7 类目 / 4 秒杀 / 8 榜单 / 3 banner 全部有数据，console 仅剩 1 条 shim「精确快照未命中 → 放宽到兜底」的 404（设计内的降级尝试）；加购 → 徽标变 1；`POST` 下单返回 `M91180754`，`GET ?uid=` 能看到该订单（待发货）。本地 3000 站点回归同样 0 报错。

---

## 5. 遗留待办（下一次继续）

1. **剩余空壳入口**（商城侧已全部接线，见 §4.4）：订单页搜索/客服、订单 chip 回调、钱包九宫格（卡包/账单/花呗/理财/公益）、消息页搜索与「+」、我的页扫码与设置、视频页若干按钮。建议接 `widgets/common.dart` 的通用空态或跳对应占位页，而不是静默无响应。
2. **图片治理**：新闻图仍依赖本地 `assets/` 打底，接后端后应走 `core/api.dart` 的 CDN 图；**商城 / 生活 / 订单已切真实实拍图**，但 `fetch_assets.js` 仍需加「下载后校验尺寸与灰度标准差（≥1200×900、stddev ≥12）」的入库体检，避免再次混入 `p9_2`、`p9_3` 那类失效图（当前靠一次性 Python 脚本抽查，未纳入流程）。
3. **后端接入**：`core/mock.dart` → 门户 `/api/v1`（契约见门户 ARCHITECTURE.md 8.10）。
4. **发布构建**：当前一直是 debug（所以才看得见溢出条）；出包前用 `flutter build apk --release` 复验布局。
5. **静态导出对新页面不免疫**：`scripts/build-static.js` 的 `PAGES` 与 `collectUrls()` 需要手工登记，本次就是漏了 `mall` 导致线上商城空壳。**建议加自检**：构建时遍历 `public/*.html` 与 `PAGES` 比对，缺一个就报警；同理定期比对API路由与预渲染清单。另注意 gh-pages 包约 525MB（近千张图），本机磁盘吃紧可直接删目录，`npm run build:static` 能完全重建。

---

## 6. 常用命令速查

```powershell
# 起模拟器
& "D:\dev\android\sdk\emulator\emulator.exe" -avd huanyu_phone -no-snapshot-load -gpu host
adb devices                       # 等到 emulator-5554  device

# 跑 App（前台，可 r 热重载 / R 热重启 / q 退出）
flutter run -d emulator-5554
# 真机 / 指定后端地址
flutter run --dart-define=API_BASE=http://192.168.1.20:3000

# 验证新闻是否真的同步到门户（抓 UI 文本，不靠眼睛看截图）
adb -s emulator-5554 shell uiautomator dump /sdcard/ui.xml
adb -s emulator-5554 pull /sdcard/ui.xml ui.xml
# 检查是否含门户真实标题、是否还有「未连通」离线提示

# 跑 Web 版（快速看效果）
flutter run -d chrome --web-port=8135

# 截图
adb -s emulator-5554 shell screencap -p /sdcard/s.png
adb -s emulator-5554 pull /sdcard/s.png screenshots\s.png

# 抓布局溢出（Dart 侧异常不进 logcat，必须读 flutter run 的输出）
Get-Content run.log | Select-String -Pattern "overflowed by|error-causing widget"

# 停掉后台 flutter run
Get-Process dart -ErrorAction SilentlyContinue | Stop-Process -Force
adb -s emulator-5554 reverse --remove-all
```

---

## 7. 对话要点索引

| 用户诉求 | 结论 |
| --- | --- |
| 「把 app 本身在模拟器里运行起来我看看」 | 选定官方 Android 模拟器（不换第三方、不用真机），API 36 + Pixel 6 AVD，跑通 `flutter run -d emulator-5554` |
| 「模拟器用的是什么，安装好了吗」 | Android SDK 自带 `emulator 37.1.11`，SDK 在 `D:\dev\android\sdk`，系统镜像手动补齐 |
| 「继续等官方镜像下完，下完自动创建 AVD 并 flutter run」 | 腾讯镜像下完 1.8GB → 平铺 + 注册 `package.xml` → 建 AVD → 起 App |
| 「新闻没图/商城链接点不开/黑黄斜纹/支付没返回键」 | 见 §3.4，图片与返回键已好，斜纹已修，商城辅助入口待接线 |
| 「黄黑斜纹条 + bottom overflowed by 1.5 pixels 是什么，去掉」 | 是 Flutter 溢出调试条，非图片；按日志定位三处并修完，见 §4 |
| 「把开发的架构和内容，以及我们的对话记录一下」 | 本文件；架构/内容分别指向 `ARCHITECTURE.md` 与 `CONTENT_ARCHITECTURE.md` |
| 「订单里的照片要真实的高清的」 | 见 §3.6：不是图不清晰，是 `OrderItem` 无 `image` 字段；已加字段 + 三处下单带图 + `_ItemThumb` 渲染真实图（失败回退渐变块） |
| 「修改和补充所有开发架构、开发内容、对话」 | 见 §3.7：三份文档补齐并两侧同步（App §2/§4.4/§7、门户 §8.12/8.14/8.15、内容架构 §3.8） |
| 「为什么 app 的商城板块大栏目没有链接子页」 | 见 §3.8 / §4.4：商城只有两个页面文件 + 入口写成了 toast/空壳；已新增通用集合页 `collection_page.dart` 并把 10 处入口全部接线 |
| 「网站的严选商城打不开」 | 见 §3.9 / §4.5：本地站点正常，是静态导出漏登记；已把 `mall` 加入 `PAGES`、补齐商城接口快照、修正中文查询值塌缩与 banner 占位图，静态站下单链路也已打通 |
