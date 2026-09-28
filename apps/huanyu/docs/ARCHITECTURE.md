# 寰宇一体化平台 App · 开发架构与内容细节

> 版本：v1.0.0+1　文档日期：2026-09-17
> 定位：以"资讯为入口"的一体化超级 App 原型 —— 新闻 · 短视频直播 · 即时聊天 · 支付钱包 · 商城 · 本地生活 · 小程序容器。
> 目标：**所有板块共用一份数据**、**国内版 / 国际版一套代码双皮肤**，后续可在本文档基础上逐步升级为生产级应用。

---

## 1. 总体架构

### 1.1 分层

```
┌────────────────────────────────────────────────────────────────┐
│ 表现层  modules/        新闻 视频 商城 生活 IM 支付 我的 小程序      │
│         每个模块 = 若干 Page + 私有子组件，只做 UI 与交互          │
├────────────────────────────────────────────────────────────────┤
│ 通用 UI  widgets/       common.dart（返回键/头像/空态/金额等）     │
│          theme/         app_theme.dart（主题）flavor_switch.dart  │
│                         （皮肤切换过场动画）                       │
├────────────────────────────────────────────────────────────────┤
│ 状态层  state/          app_state.dart = 全局业务中心（ChangeNotifier）│
│          app_state_io/web.dart = 平台差异化入口（条件导入）          │
├────────────────────────────────────────────────────────────────┤
│ 数据层  core/           models.dart（实体与枚举）mock.dart（演示数据）│
│                         api.dart（HTTP 客户端，接门户 /api/v1）     │
└────────────────────────────────────────────────────────────────┘
```

**依赖方向严格单向**：`modules → widgets/theme → state → core`。core 不反向引用上层，widgets 不引用具体模块的业务页面。

### 1.2 核心设计原则

| 原则 | 落地方式 |
| --- | --- |
| 单一数据源 | 订单、评论、互动消息、账单、会话消息全部存在 `AppState`，任何页面只是渲染它 |
| 跨板块联动 | 业务动作（下单 / 支付 / 退款 / 评论 / 发货）在状态层统一触发副作用：写账单 + 推系统消息 + 记互动 |
| 视图无关存储 | 页面通过 `ListenableBuilder` 监听 `appState`，模型不持有 BuildContext，未来换 Riverpod / Bloc 只需替换监听方式 |
| 双版本一套 UI | 所有文案走 `localized(isCn, cn, en)`，主题走 `appTheme(appState)`，切换皮肤触发全站重建 |
| 离线可演示 | 演示数据在 `Mock` 里一次性生成；视频使用本地 asset；新闻走本机 HTTP 服务且带兜底数据 |

### 1.3 目录与体量

| 路径 | 行数 | 说明 |
| --- | --- | --- |
| `lib/main.dart` | 4 | 入口 |
| `lib/app.dart` | 28 | MaterialApp + 主题 + 皮肤切换包裹 |
| `lib/core/api.dart` | 77 | HTTP 客户端：`/api/v1/home`、`/api/v1/feed`、`/api/v1/news/:id`、`/api/v1/sync` |
| `lib/core/models.dart` | 648 | 全部实体 / 枚举 / 扩展 |
| `lib/core/mock.dart` | 1032 | 演示数据工厂（商品、视频、评论、团购、会话、自动回复语料） |
| `lib/state/app_state.dart` | 717 | 全局业务中心 |
| `lib/modules/**` | 约 5100 | 8 个模块共 16 个页面文件 |
| `lib/theme/**` | 300 | 主题与皮肤切换动画 |
| `lib/widgets/common.dart` | 205 | 通用组件 |

资源：`assets/videos/` 内置 `clip1.mp4 / clip2.mp4 / clip3.mp4`（720p，共约 3MB），已在 `pubspec.yaml` 注册。

### 1.4 技术栈

| 项 | 选型 | 备注 |
| --- | --- | --- |
| 语言 / SDK | Flutter，Dart SDK `^3.13.3` | 支持 Web 与 Android（仓库已含 `web/`、`android/`） |
| 依赖 | `http`、`video_player`、`qr_flutter`、`cupertino_icons` | 依赖极少，刻意保持轻量以便后期接入真实 SDK |
| 状态管理 | `ChangeNotifier` + `ListenableBuilder`（自建） | 零第三方成本，易迁移 |
| 后端 | 新闻部分接本机门户 Node 服务 `/api/v1`；其余为本地演示数据 | 升级时替换 api.dart / app_state 的数据来源即可 |
| 构建 | `flutter analyze`、`flutter build web --release`、`flutter build apk` | 当前 `analyze` 零 error 零 warning |

---

## 2. 数据模型（`core/models.dart`）

| 实体 | 关键字段 | 作用 |
| --- | --- | --- |
| `Article` / `ContentBlock` | id、title、summary、channel、imageUrl、blocks | 新闻稿件；`server/lib/news-service.renderContent` 同构渲染概念延续到 App |
| `ChannelDef` | id、name、`nameOf(id, cn)` | 频道定义，`ChannelDef.all` 驱动首页 Tab |
| `MessageKind` / `ChatMessage` | from（`me` / 对方 id）、text/textEn、kind、amount、orderId | 聊天气泡，支持转账、订单卡片、语音、系统消息 |
| `ChatSession` | id、name、lastMessage、unread、kind | 会话列表，区分好友 / 客服 / 群 / 官方号 |
| `InteractType` / `InteractionMsg` | type（like/comment/follow/gift/live/order）、targetId、read | 互动消息中心的数据源 |
| `VideoComment` | videoId、user、text、likes、liked、time | 视频评论，同一份数据同时驱动评论区与互动消息 |
| `VideoItem` | id、title、author、**asset**（本地视频路径）、cover、likes、comments、productIds、`live` | 视频 / 直播统一模型，`live=true` 即直播间 |
| `Product` | id、title、price、originPrice、specs/specOptions、**skus**（SKU 矩阵）、shop、images、reviews、sales | 商品，SKU 决定可选组合与库存价 |
| `OrderStatus` | pendingPay → pendingShip → shipped → pendingReview → completed；refunding → refunded | 状态机，每个状态带 `action()` 文案（双语） |
| `OrderSource` | mall / live / video / local | 记录订单来源，支撑回跳视频 / 直播间 |
| `OrderItem` / `Order` | productId、title、spec、price、quantity、seed、**image**、goodsTotal、freight、status、source、trail（时间轴）、fromVideoId、rating、review、`trackingNo` | 订单主干；`image` 存**真实商品图 asset 路径**（为空时 UI 回退 `ColorSeed` 渐变块），`trail` 渲染物流时间轴 |
| `DealCategory` / `LocalDeal` | category、price、originPrice、distance、rating、store、package、notes | 本地生活团单（对标美团） |
| `BillItem` | title、time、amount、type（in/out）、icon、category | 账单，所有支付动作自动追加 |
| `MiniApp` | name、icon、desc、category | 小程序卡片数据 |
| `ColorSeed` | 渐变色种子 | 离线头像/配图生成，避免外链失效 |

---

## 3. 全局业务中心（`state/app_state.dart`）

对外 API 按业务域划分（均为公开方法，`notifyListeners()` 驱动全站刷新）：

**外观**：`flavor`、`themeMode`、`setFlavor`、`toggleTheme`
**账户**：`userName`、`userId`、`phoneTail`、`balance`、`huabeiQuota`
**购物车**：`cart`、`addToCart`、`removeFromCart`、`setQuantity`、`clearCart`
**下单**：`createOrderFromCart`、`createOrderFromProduct`、`createOrderFromItems`、`createOrderFromDeal`
**订单流转**：`orders`、`ordersOf(status)`、`payOrder(useHuabei:)`、`remindShip`、`shipOrder`、`receiveOrder`、`reviewOrder`、`refundOrder`
**支付**：`payDirect`、`income`、`bills`
**视频互动**：`toggleLike`、`isVideoLiked`、`addComment`、`commentsOf`、`commentCountOf`、`toggleCommentLike`
**消息**：`interactions`、`unreadInteractions`、`markInteractionsRead`、`addInteraction`
**聊天**：`messagesOf(sessionId)`、`sendMessage`（含延时模拟回复）、私有 `_pickReply`（关键词规则）、`unreadSessions`、`totalUnread`、`clearUnread`

### 关键联动链路

```
视频/直播间/商城/本地生活
        │ createOrderFrom*
        ▼
   Order(status=pendingPay)
        │ payOrder(useHuabei)
        ├──► balance -= amount（花呗走额度）
        ├──► bills.add(BillItem)                 ← 支付宝账单
        ├──► orders[idx] = pendingShip + trail   ← 订单时间轴
        ├──► addInteraction(type: order)         ← 互动消息
        └──► _pushSystemMessage(sessionId)       ← 客服会话里的系统提示

视频评论 addComment
        ├──► comments.add(VideoComment)          ← 评论区（同一份数据）
        └──► addInteraction(type: comment)       ← 消息中心「互动消息」

退款 refundOrder → 金额原路退回 → 账单负收入记录 → 订单转 refunded → 会话推送
```

---

## 4. 模块内容细节

### 4.1 主框架 `modules/shell/shell.dart`

六个 Tab：**新闻 / 视频 / 商城 / 生活 / 消息 / 我的**，消息 Tab 带 `appState.totalUnread` 徽标。整个 Shell 由 `appState` 驱动重建，切换皮肤后 Tab 文案与配色同步变化。

### 4.2 新闻 `modules/news/`

- `home_page.dart`：频道 Tab（头条/国内/国际/财经/科技/体育/娱乐/汽车/文化/健康/视频）+ 下拉刷新 + 分频道缓存；右上"界面风格"弹出 sheet 切换国内/国际皮肤
- `article_page.dart`：标题、来源、时间、**封面大图**、正文块（图片/段落）渲染
- 数据来源 `Api.feed()` / `Api.article()`；失败时回退 `offline_articles.dart` 并在顶部提示（不影响其他板块演示）
- 同步要点（2026-09-18）：`apiBaseUrl` = `--dart-define=API_BASE` > 端上默认（Android `http://10.0.2.2:3000`、其它 `127.0.0.1:3000`）> Web 同源；Android 清单需 `usesCleartextTraffic="true"`，否则明文 HTTP 被系统拦截，feed 与配图全部取不到（详见 `docs/DEV_LOG.md` §4.2）

### 4.3 视频 `modules/video/`

- `video_feed_page.dart`（667 行）：顶部 Tab（关注 / 推荐 / 直播），竖向 `PageView` 全屏翻页，`video_player` 播放本地 asset，右侧作者头像/点赞/评论/转发/购物袋，左下标题与商品卡
  - 支持外部定位：`VideoFeedPage(initialIndex:)` —— 订单详情回跳视频/直播间就靠它
  - 直播间（`VideoItem.live == true`）显示在线人数、飘屏留言、购物袋
  - 视频同款商品条 → 点商品直接进商详
- `comments_sheet.dart`：底部半屏评论区，支持点赞评论、发评论（同时进入互动消息中心）

### 4.4 商城 `modules/shop/`

- `shop_page.dart`（1380 行）— **2026-09-18 首页视觉重做**
  - 首页（重做后）：品牌色吸顶搜索栏（扫一扫 + 购物车 Badge）→ 轮播 → 金刚区分类 → 活动行 → 限时秒杀倒计时横滑 → 领券楼层 → 吸顶类目+排序筛选栏 → 商品瀑布流
  - 视觉基线：页面底色 `#F5F6F8`（暗色 `#0F1418`），商品卡白底圆角+轻阴影，瀑布流 `childAspectRatio` **0.56 → 0.66 → 0.58**（0.66 时卡片文字区溢出约 40px，已回调），栅格间距 10
  - 商品详情：图片轮播 + 指示器、价格/原价/折扣、SKU 选择器（多规格联动）、保障标签、店铺卡、用户评价单、详情图
  - 底部操作栏：店铺 / 客服 / 购物车 + 加入购物车 / 立即购买
  - 购物车：勾选、增减数量、删除、合计结算
  - 确认订单：收货地址、商品清单、配送方式、优惠券、金额明细 → 收银台
  - 直播间入口 → 跳转视频页并定位到直播那一帧
- `order_page.dart`（814 行）
  - 订单列表按状态 Tab 分组（`ordersOf`），卡片带来源标签（商城/视频/直播/本地生活）
  - 详情：商品清单、金额明细、物流时间轴、来源内容一键回跳、收货/评价/退款/删除等操作
  - 底部操作按钮随状态变化：去支付 / 提醒发货 / 确认收货 / 评价 / 再次购买 / 申请退款
  - **订单商品图（2026-09-18）**：`_ItemThumb` 统一渲染 —— `Image.asset(item.image)` + `BoxFit.cover` + `FilterQuality.medium`，`image` 为空或加载失败时回退 `ColorSeed` 渐变块，**永不破图**；订单卡片 72px 与订单详情 64px 两处共用
  - 图片来源：购物车下单 / 立即购买取 `Product.images.first`，本地生活团购取 `LocalDeal.image`，历史与种子订单由 `item()` 内的 `imageOf(id)` 反查 `Mock.products` / `Mock.deals` 补齐
- `collection_page.dart`（2026-09-19 新增，通用商品集合页）
  - 结构：标题 + 说明条（活动规则 / 会场玩法，可选倒计时）+ 排序条（综合 / 销量 / 价格 / 评分）+ 两列瀑布流；空结果走 `EmptyView`
  - 开关：`searchable`（类目内/全站关键字搜索）、`ranked`（排行榜前三名角标）、`countdownTo`（秒杀本场倒计时）
  - 承接入口：搜索栏、轮播三条、金刚区类目与排行榜、活动行、秒杀「查看全部」、商详「店铺 / 进店逛逛」——**首页大栏目不再有"点了没反应"的入口**

### 4.5 本地生活 `modules/life/life_page.dart`（580 行）

八个金刚区（外卖/团购/酒店/电影/丽人/家政/跑腿/旅游）、距离与评分筛选、团单列表（销量、评分、折扣）、团单详情（套餐内容、购买须知、门店信息、用户评价）、立即抢购走同一套下单支付体系（订单 `source = local`）。

### 4.6 即时通讯 `modules/im/`

- `chat_list_page.dart`：会话列表 + 顶部"互动消息"入口（视频评论/点赞/直播留言/订单动态汇聚）
- `chat_page.dart`：气泡聊天，`sendMessage` 后对方延时 0.6~1.3 秒模拟回复；关键词命中规则（价格/物流/退款/发票/库存/营业时间/问候）；支持订单卡片、转账、语音消息样式
- `interaction_page.dart`：互动消息聚合页，按类型分组，点击可回跳到对应视频或订单

### 4.7 支付钱包 `modules/pay/`

- `wallet_page.dart`（503 行）：余额与总额、**账单流水**（由真实交易生成）、花呗额度、账户安全、我的订单入口（跳订单列表并有未处理数量角标）、账单点击直达订单详情
- `checkout_page.dart`（276 行）：收银台 —— 支付方式选择（余额/花呗/银行卡<提示>）、金额明细、付款密码盘、支付成功后结果页 → 跳订单详情
- `qr_page.dart`（311 行）：付款码（二维码 + 条形码，动态刷新型样式）、收款码（可设金额，模拟对方付款后自动入账）、扫码/相册入口

### 4.8 我的 `modules/me/`、`小程序` `modules/mini/`

- `profile_page.dart`：头像与会员信息、**五宫格订单状态**（每个宫格带该状态订单数）、钱包/小程序/本地生活/作品入口，外观区（皮肤对比卡片 + 深浅色开关）
- `mini_page.dart`：小程序列表（分类筛选、最近使用、我的小程序）

### 4.9 通用组件 `widgets/common.dart`

`AppBackButton`（统一返回键，国内 iOS 箭头 / 国际 Material 箭头）、`SeedAvatar`（离线渐变头像）、金额格式化、空态、标签、分割线、BottomSheet 容器等。

---

## 5. 皮肤与双语机制

| 机制 | 实现 |
| --- | --- |
| UI Flavor | `UiFlavor.cn / UiFlavor.global`，决定主题色、圆角风格、图标风格、第三方服务名（微信/支付宝/抖音 ↔ Telegram/PayPal/TikTok） |
| 文案 | 模型层统一提供双字段（如 `text` / `textEn`），调用 `localized(isCn, cn, en)` 取值；`ChannelDef.nameOf`、`OrderStatus.action`、`DealCategory.label` 都接受 flavor 参数 |
| 主题 | `appTheme(appState)` 生成 ThemeData（seed color、AppBar、卡片、圆角、字重随 flavor 变化） |
| 切换动效 | `theme/flavor_switch.dart`：`FlavorSwitch.switchTo(context, target)` 触发全屏圆形扩散（`ClipPath` + 半径动画 + 模糊），扩散中完成 MatterialApp 重建，落点从点击位置开始 → **切换有肉眼可见的视觉过场**，比直接 setState 专业得多 |

---

## 6. 开发者命令

```powershell
$env:PUB_HOSTED_URL='https://pub.flutter-io.cn'   # 国内镜像
$env:JAVA_HOME='D:\dev\jdk\jdk-17.0.20.1+1'       # Android 构建用
Set-Location 'D:\dev\apps\huanyu'

flutter pub get
flutter analyze                  # 静态检查（当前 0 error / 0 warning）
flutter build web --release      # 产出 build/web
flutter build apk --debug        # Android 包
flutter run -d chrome            # 本地热重载调试
python -m http.server 8080 --directory D:\dev\apps\huanyu\build\web   # 浏览器预览
```

新增页面模板（遵守依赖方向）：

```dart
// lib/modules/<模块>/xxx_page.dart
import 'package:flutter/material.dart';
import '../../core/models.dart';
import '../../state/app_state.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common.dart';

class XxxPage extends StatefulWidget { ... }

class _XxxPageState extends State<XxxPage> {
  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;            // 文案分支
    final cs = Theme.of(context).colorScheme;   // 颜色一律取主题
    return Scaffold(
      appBar: AppBar(leading: const AppBackButton(), title: Text(cn ? '标题' : 'Title')),
      body: ListenableBuilder(
        listenable: appState,                   // 数据联动
        builder: (context, _) => ListView(/* ... */),
      ),
    );
  }
}
```

---

## 7. 当前原型边界（升级时必须处理）

| 边界 | 现状 | 升级方向 |
| --- | --- | --- |
| 数据持久化 | 全内存，重启即恢复初始 Mock | 引入 `shared_preferences` / `isar` / 后端 API，AppState 增加 `load()` / `save()` |
| 支付 | 本地记账模拟 | 保留 `payOrder` 接口签名，内部替换为支付宝/微信/PayPal SDK 调用 |
| 聊天 | 本地延时模拟回复 | `sendMessage` 内部换成 WebSocket / 长连接推送 |
| 视频 | 3 个本地 asset 片段 | 换成 HLS/RTMP 拉流（`better_player` 或自研），直播改为真实房间协议 |
| 商品图片 | 商城 / 生活 / **订单**已用真实 asset 实拍图（最小 1200×900，见 §4.4），新闻仍走门户 CDN | 统一收敛到 `Product.images` / `OrderItem.image` 字段；接图床/CDN 时注意内存缓存与列表复用，素材入库前做纯色/黑图体检 |
| 新闻 | 依赖本机 Node 服务 | 抽出 `Api` 接口层，支持多环境与鉴权、离线草稿同步（复用 `/api/v1/sync`） |
| 国际化 | 代码内 `localized()` | 抽到 arb / i18n 资源文件，支持多语种与运行时切换 |
| 路由 | 主要用 `MaterialPageRoute` | 引入 go_router，处理深链（订单卡片 → 订单详情）、页面栈管理 |
| 状态管理 | ChangeNotifier 单实例 | 业务量上涨后按域拆分 Store 或迁移 Riverpod/Bloc，`modules` 层改动可控 |
| 安全 | 无 | 支付密码/生物识别、敏感信息加密存储、证书绑定 |

---

## 8. 演进路线（在本文档基础上逐步推进）

**v1.1 稳定性**：数据持久化（购物车/订单/账单/会话本地落盘）、路由统一、加载与错误态组件化、骨架屏。
**v1.2 后端化**：抽取 `Repository` 层，接口契约与门户保持一致（`/api/v1/feed`、`/api/v1/sync`），支持鉴权与分页、增量同步。
**v1.3 支付真实化**：对接沙箱支付渠道，订单状态由服务端回调驱动，增加退款单与售后模块。
**v1.4 IM 实时化**：WebSocket 网关、消息已读回执、会话持久化、音视频通话占位。
**v1.5 直播/视频升级**：真实流媒体、礼物打赏、连麦、弹幕；并把购物袋数据改为服务端商品池。
**v2.0 商业闭环**：小程序容器（现有 `MiniApp` 卡片升级为可运行容器）、会员体系、优惠券/秒杀营销工具、数据看板。

> 每次迭代请同步更新本文件的第 7 节「边界」与第 8 节「路线」，保持架构文档与代码一致。
>
> 开发过程、环境搭建、验收问题与修复清单、常用命令见 **`docs/DEV_LOG.md`**（与门户 `docs/DEV_LOG.md` 同源同步）。
