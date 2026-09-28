import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'app_state_io.dart' if (dart.library.html) 'app_state_web.dart' as platform;
import '../core/mock.dart';
import '../core/models.dart';
import '../theme/app_theme.dart';

/// 全局状态 + 业务数据中心
/// 设计要点：所有板块（视频/直播 → 商城 → 支付 → 订单 → 消息）共用一份数据，
/// 任一侧下单、评论、退款，另一侧立刻可见，不是各自独立的假数据。
class AppState extends ChangeNotifier {
  UiFlavor _flavor = UiFlavor.cn;
  ThemeMode _themeMode = ThemeMode.system;

  String userName = '寰宇用户';
  String userId = 'u_10086';
  String phoneTail = '8888';

  /// 账户余额（所有支付/退款都会真实变动）
  double balance = 12860.42;
  double huabeiQuota = 20000.0;

  final Random _rand = Random();

  /// 主框架 Tab 跳转请求（值即目标 Tab 下标），Shell 消费后自动清空
  int? tabRequest;

  void jumpToTab(int index) {
    tabRequest = index;
    notifyListeners();
  }

  void consumeTabRequest() {
    tabRequest = null;
  }

  // ---------------- 购物车 ----------------
  final List<Product> cart = [];

  // ---------------- 订单 ----------------
  final List<Order> orders = [];

  // ---------------- 视频评论 / 互动 ----------------
  final List<VideoComment> comments = List.of(Mock.comments);
  final List<InteractionMsg> interactions = List.of(Mock.interactions);
  final Set<String> likedVideos = <String>{};

  // ---------------- 账单 ----------------
  final List<BillItem> bills = Mock.initialBills();

  // ---------------- 会话消息（按 sessionId 存储）----------------
  final Map<String, List<ChatMessage>> _messages = Mock.initialMessages();

  AppState() {
    orders.addAll(_seedOrders());
  }

  // ============================================================
  // 皮肤 / 主题
  // ============================================================
  UiFlavor get flavor => _flavor;
  ThemeMode get themeMode => _themeMode;

  void setFlavor(UiFlavor f) {
    if (_flavor == f) return;
    _flavor = f;
    // 国际版默认跟随深色，中国版默认浅色，切换时给一个更贴近原产品的观感
    _themeMode = f.isCn ? ThemeMode.light : ThemeMode.dark;
    notifyListeners();
  }

  void toggleTheme() {
    _themeMode = _themeMode == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
    notifyListeners();
  }

  // ============================================================
  // 购物车
  // ============================================================
  double get cartTotal => cart.fold(0.0, (s, p) => s + p.price * p.quantity);
  int get cartCount => cart.fold(0, (s, p) => s + p.quantity);
  /// 购物车已省金额（原价 - 现价），用于商城底部结算条与确认订单页
  double get cartSaved => cart.fold(0.0, (s, p) {
        final off = p.origin > p.price ? p.origin - p.price : 0.0;
        return s + off * p.quantity;
      });

  void addToCart(Product p) {
    final idx = cart.indexWhere((e) => e.id == p.id);
    if (idx >= 0) {
      cart[idx].quantity += 1;
    } else {
      cart.add(p.copyWith(quantity: 1));
    }
    notifyListeners();
  }

  void removeFromCart(String id) {
    cart.removeWhere((e) => e.id == id);
    notifyListeners();
  }

  void setQuantity(String id, int q) {
    final idx = cart.indexWhere((e) => e.id == id);
    if (idx < 0) return;
    if (q <= 0) {
      cart.removeAt(idx);
    } else {
      cart[idx].quantity = q;
    }
    notifyListeners();
  }

  void clearCart() {
    cart.clear();
    notifyListeners();
  }

  // ============================================================
  // 下单
  // ============================================================
  String _orderId() => 'HY${DateTime.now().millisecondsSinceEpoch.toString().substring(5)}';

  Future<Order> createOrderFromCart({
    OrderSource source = OrderSource.mall,
    String? videoId,
    String? videoTitle,
  }) async {
    final items = cart
        .map((p) => OrderItem(
              productId: p.id,
              title: p.title,
              spec: p.specOptions.isEmpty ? '默认规格' : p.specOptions.first,
              price: p.price,
              quantity: p.quantity,
              seed: p.seed,
              image: p.images.isEmpty ? '' : p.images.first,
            ))
        .toList();
    final shop = cart.isNotEmpty ? cart.first.shop : '寰宇商城';
    return createOrderFromItems(
      items: items,
      shop: shop,
      source: source,
      videoId: videoId,
      videoTitle: videoTitle,
      clearCartAfter: true,
    );
  }

  Future<Order> createOrderFromProduct(
    Product p, {
    OrderSource source = OrderSource.video,
    String? videoId,
    String? videoTitle,
    int quantity = 1,
  }) {
    return createOrderFromItems(
      items: [
        OrderItem(
          productId: p.id,
          title: p.title,
          spec: p.specOptions.isEmpty ? '默认规格' : p.specOptions.first,
          price: p.price,
          quantity: quantity,
          seed: p.seed,
          image: p.images.isEmpty ? '' : p.images.first,
        ),
      ],
      shop: p.shop,
      freight: p.freight,
      source: source,
      videoId: videoId ?? (p.videoId.isEmpty ? null : p.videoId),
      videoTitle: videoTitle,
    );
  }

  Future<Order> createOrderFromItems({
    required List<OrderItem> items,
    required String shop,
    double freight = 0,
    OrderSource source = OrderSource.mall,
    String? videoId,
    String? videoTitle,
    bool clearCartAfter = false,
  }) async {
    final order = Order(
      id: _orderId(),
      shop: shop,
      items: items,
      goodsTotal: items.fold(0.0, (s, e) => s + e.price * e.quantity),
      freight: freight,
      status: OrderStatus.pendingPay,
      source: source,
      createdAt: DateTime.now(),
      fromVideoId: videoId,
      fromVideoTitle: videoTitle,
    );
    orders.insert(0, order);
    if (clearCartAfter) clearCart();
    notifyListeners();
    return order;
  }

  Future<Order> createOrderFromDeal(LocalDeal deal) => createOrderFromItems(
        items: [
          OrderItem(
            productId: deal.id,
            title: deal.title,
            spec: deal.shop,
            price: deal.price,
            quantity: 1,
            seed: deal.seed,
            image: deal.image,
          ),
        ],
        shop: deal.shop,
        source: OrderSource.local,
      );

  Order? orderById(String id) => orders.cast<Order?>().firstWhere((o) => o?.id == id, orElse: () => null);

  List<Order> ordersOf(OrderStatus s) => orders.where((o) => o.status == s).toList();

  List<Order> get ordersOngoing => orders
      .where((o) => o.status != OrderStatus.completed && o.status != OrderStatus.refunded)
      .toList();

  // ============================================================
  // 支付 / 退款
  // ============================================================
  /// 支付订单：扣余额 → 生成账单 → 推订单到待发货 → 客服发消息
  Future<bool> payOrder(String orderId, {bool useHuabei = false}) async {
    final idx = orders.indexWhere((o) => o.id == orderId);
    if (idx < 0) return false;
    final order = orders[idx];
    if (order.status != OrderStatus.pendingPay) return false;

    if (!useHuabei) {
      if (balance < order.total) return false;
      balance -= order.total;
    }
    orders[idx] = _copy(order, status: OrderStatus.pendingShip);
    bills.insert(
      0,
      BillItem(
        title: '${order.source.label(_flavor)} · ${order.items.first.title}',
        time: _nowLabel(),
        amount: -order.total,
        type: 'out',
        icon: order.source == OrderSource.local ? Icons.local_offer_outlined : Icons.shopping_bag_outlined,
        category: order.source.label(_flavor),
        orderId: order.id,
      ),
    );
    await Future<void>.delayed(const Duration(milliseconds: 400));
    _pushSystemMessage(
      's4',
      '您的订单 ${order.id} 已支付成功 ¥${order.total.toStringAsFixed(2)}，商家将在 24 小时内发货。',
    );
    if (order.fromVideoId != null) {
      addInteraction(
        type: InteractType.order,
        videoId: order.fromVideoId!,
        videoTitle: order.fromVideoTitle ?? order.shop,
        user: '寰宇商城',
        userEn: 'Huanyu Shop',
        avatarText: '商',
        seed: const ColorSeed(Color(0xFFFE2C55), Color(0xFFFF6B8B)),
        text: '来自该${order.source == OrderSource.live ? '直播间' : '视频'}的订单 ${order.id} 已支付成功',
      );
    }
    notifyListeners();
    return true;
  }

  /// 独立付款（充值以外的直接付款，如转账）
  Future<bool> payDirect(double amount, String title, {IconData icon = Icons.receipt_long_outlined}) async {
    if (balance < amount) return false;
    balance -= amount;
    bills.insert(
      0,
      BillItem(title: title, time: _nowLabel(), amount: -amount, type: 'out', icon: icon, category: '付款'),
    );
    notifyListeners();
    return true;
  }

  /// 充值 / 收款入账
  void income(double amount, String title, {IconData icon = Icons.arrow_downward, String category = '转账'}) {
    balance += amount;
    bills.insert(
      0,
      BillItem(title: title, time: _nowLabel(), amount: amount, type: 'in', icon: icon, category: category),
    );
    notifyListeners();
  }

  /// 退款：状态流转 + 退回余额 + 账单
  Future<void> refundOrder(String orderId) async {
    final idx = orders.indexWhere((o) => o.id == orderId);
    if (idx < 0) return;
    final order = orders[idx];
    orders[idx] = _copy(order, status: OrderStatus.refunding);
    notifyListeners();

    await Future<void>.delayed(const Duration(seconds: 2));
    final i2 = orders.indexWhere((o) => o.id == orderId);
    if (i2 < 0) return;
    orders[i2] = _copy(order, status: OrderStatus.refunded);
    balance += order.total;
    bills.insert(
      0,
      BillItem(
        title: '退款到账 · ${order.items.first.title}',
        time: _nowLabel(),
        amount: order.total,
        type: 'in',
        icon: Icons.assignment_return_outlined,
        category: '退款',
        orderId: order.id,
      ),
    );
    _pushSystemMessage('s4', '订单 ${order.id} 的退款 ¥${order.total.toStringAsFixed(2)} 已退回您的账户余额。');
    notifyListeners();
  }

  /// 淘宝式正向流转：发货 → 收货 → 评价
  void remindShip(String orderId) {
    _pushSystemMessage('s4', '已为您催促发货，商家会优先处理订单 $orderId。');
  }

  void receiveOrder(String orderId) {
    final idx = orders.indexWhere((o) => o.id == orderId);
    if (idx < 0) return;
    orders[idx] = _copy(orders[idx], status: OrderStatus.pendingReview);
    notifyListeners();
  }

  void reviewOrder(String orderId, double rating, String text) {
    final idx = orders.indexWhere((o) => o.id == orderId);
    if (idx < 0) return;
    final order = orders[idx];
    orders[idx] = Order(
      id: order.id,
      shop: order.shop,
      items: order.items,
      goodsTotal: order.goodsTotal,
      freight: order.freight,
      status: OrderStatus.completed,
      source: order.source,
      createdAt: order.createdAt,
      fromVideoId: order.fromVideoId,
      fromVideoTitle: order.fromVideoTitle,
      trail: order.trail,
      rating: rating,
      review: text,
    );
    notifyListeners();
  }

  /// 模拟商家发货
  void shipOrder(String orderId) {
    final idx = orders.indexWhere((o) => o.id == orderId);
    if (idx < 0) return;
    final order = orders[idx];
    orders[idx] = Order(
      id: order.id,
      shop: order.shop,
      items: order.items,
      goodsTotal: order.goodsTotal,
      freight: order.freight,
      status: OrderStatus.shipped,
      source: order.source,
      createdAt: order.createdAt,
      fromVideoId: order.fromVideoId,
      fromVideoTitle: order.fromVideoTitle,
      trail: [
        '【${_area(order)}】商家已发货，等待揽收',
        '【${_area(order)}】快递已揽收，运输中',
        '【杭州转运中心】包裹已到达',
      ],
    );
    notifyListeners();
  }

  String _area(Order o) => o.shop.length > 6 ? o.shop.substring(0, 6) : o.shop;

  Order _copy(Order o, {required OrderStatus status}) => Order(
        id: o.id,
        shop: o.shop,
        items: o.items,
        goodsTotal: o.goodsTotal,
        freight: o.freight,
        status: status,
        source: o.source,
        createdAt: o.createdAt,
        fromVideoId: o.fromVideoId,
        fromVideoTitle: o.fromVideoTitle,
        trail: o.trail,
        rating: o.rating,
        review: o.review,
      );

  // ============================================================
  // 视频：评论 / 点赞 / 互动
  // ============================================================
  List<VideoComment> commentsOf(String videoId) =>
      comments.where((c) => c.videoId == videoId).toList()
        ..sort((a, b) => b.time.compareTo(a.time));

  int commentCountOf(String videoId) => comments.where((c) => c.videoId == videoId).length;

  void addComment(String videoId, String videoTitle, String text) {
    final c = VideoComment(
      id: 'local_${DateTime.now().millisecondsSinceEpoch}',
      videoId: videoId,
      author: userName,
      seed: const ColorSeed(Color(0xFF1677FF), Color(0xFF6EA8FF)),
      text: text,
      time: DateTime.now(),
    );
    comments.add(c);
    // 评论同步到消息中心（可回跳到视频）
    interactions.insert(
      0,
      InteractionMsg(
        id: 'it_${DateTime.now().millisecondsSinceEpoch}',
        type: InteractType.comment,
        videoId: videoId,
        videoTitle: videoTitle,
        user: userName,
        avatarText: '我',
        seed: const ColorSeed(Color(0xFF1677FF), Color(0xFF6EA8FF)),
        text: '我评论：$text',
        time: DateTime.now(),
      ),
    );
    notifyListeners();
  }

  void toggleCommentLike(String commentId) {
    final idx = comments.indexWhere((c) => c.id == commentId);
    if (idx < 0) return;
    final c = comments[idx];
    comments[idx] = VideoComment(
      id: c.id,
      videoId: c.videoId,
      author: c.author,
      seed: c.seed,
      text: c.text,
      time: c.time,
      likes: c.likes + (c.liked ? -1 : 1),
      liked: !c.liked,
      isAuthor: c.isAuthor,
      pinned: c.pinned,
    );
    notifyListeners();
  }

  bool isVideoLiked(String id) => likedVideos.contains(id);

  void toggleLike(String videoId, String videoTitle) {
    final liked = likedVideos.contains(videoId);
    liked ? likedVideos.remove(videoId) : likedVideos.add(videoId);
    notifyListeners();
  }

  void addInteraction({
    required InteractType type,
    required String videoId,
    required String videoTitle,
    required String user,
    String? userEn,
    required String avatarText,
    required ColorSeed seed,
    required String text,
  }) {
    interactions.insert(
      0,
      InteractionMsg(
        id: 'it_${DateTime.now().millisecondsSinceEpoch}_${_rand.nextInt(9999)}',
        type: type,
        videoId: videoId,
        videoTitle: videoTitle,
        user: user,
        userEn: userEn,
        avatarText: avatarText,
        seed: seed,
        text: text,
        time: DateTime.now(),
      ),
    );
    notifyListeners();
  }

  int get unreadInteractions => interactions.where((e) => !e.read).length;

  void markInteractionsRead() {
    for (final e in interactions) {
      e.read = true;
    }
    notifyListeners();
  }

  // ============================================================
  // 聊天
  // ============================================================
  List<ChatMessage> messagesOf(String sessionId) => _messages[sessionId] ?? const [];

  int get unreadSessions => Mock.sessions.fold(0, (s, e) => s + e.unread);

  int get totalUnread => unreadSessions + unreadInteractions;

  int unread = 12; // 兼容旧引用：Tab 徽标统一改用 totalUnread

  void clearUnread() {
    unread = 0;
    markInteractionsRead();
  }

  /// 发送聊天消息，对方会模拟回复（关键词命中优先）
  Future<void> sendMessage(String sessionId, String text) async {
    final list = _messages.putIfAbsent(sessionId, () => <ChatMessage>[]);
    list.add(ChatMessage(
      id: 'me_${DateTime.now().millisecondsSinceEpoch}',
      from: 'me',
      text: text,
      time: DateTime.now(),
    ));
    notifyListeners();

    await Future<void>.delayed(Duration(milliseconds: 600 + _rand.nextInt(700)));
    final session = Mock.sessions.cast<ChatSession?>().firstWhere((s) => s?.id == sessionId, orElse: () => null);
    if (session == null) return;
    list.add(ChatMessage(
      id: 'reply_${DateTime.now().millisecondsSinceEpoch}',
      from: sessionId,
      text: _pickReply(session, text),
      time: DateTime.now(),
    ));
    notifyListeners();
  }

  Future<void> _pushSystemMessage(String sessionId, String text) async {
    final list = _messages.putIfAbsent(sessionId, () => <ChatMessage>[]);
    list.add(ChatMessage(
      id: 'sys_${DateTime.now().millisecondsSinceEpoch}',
      from: sessionId,
      text: text,
      time: DateTime.now(),
    ));
    notifyListeners();
  }

  String _pickReply(ChatSession session, String text) {
    final t = text.toLowerCase();
    final Map<List<String>, String> rules = {
      ['多少钱', '价格', '优惠', '便宜', '折扣', 'price', 'discount']: '已经在活动价了，现在下单还附赠优惠券哦~',
      ['发货', '物流', '快递', '几天到', 'shipping']: '付 款后 48 小时内发货，一般 2-3 天到达。（付款后 48 小时内）',
      ['退货', '退款', '退', 'refund']: '未发货订单支持秒退款，这边可以直接帮您操作。',
      ['发票', '开票', 'invoice']: '把发票抬头和税号发我，开好后推送到您的邮箱。',
      ['库存', '现货', '有货']: '有现货的，现在拍下今天就能安排打包。',
      ['几点', '营业', '开门', 'hours']: '门店营业时间是 10:00-22:00，随时可以到店核销。',
      ['你好', 'hi', 'hello', '在吗']: '在的，请问有什么可以帮您？',
    };
    for (final entry in rules.entries) {
      if (entry.key.any((k) => t.contains(k))) return entry.value.replaceAll('付 款后', '付款后');
    }
    final pool = session.replies.isNotEmpty ? session.replies : Mock.defaultReplies;
    return pool[_rand.nextInt(pool.length)];
  }

  // ============================================================
  // 初始订单（覆盖各种状态，含来自直播间/短视频/本地生活的订单）
  // ============================================================
  List<Order> _seedOrders() {
    final now = DateTime.now();
    /// 按商品/团购 id 取真实图片，订单里就不用再画渐变色块
    String imageOf(String id) {
      for (final p in Mock.products) {
        if (p.id == id && p.images.isNotEmpty) return p.images.first;
      }
      for (final d in Mock.deals) {
        if (d.id == id && d.image.isNotEmpty) return d.image;
      }
      return '';
    }

    OrderItem item({
      required String id,
      required String title,
      required double price,
      int qty = 1,
      ColorSeed? seed,
      String spec = '默认规格',
    }) =>
        OrderItem(
          productId: id,
          title: title,
          spec: spec,
          price: price,
          quantity: qty,
          seed: seed ?? const ColorSeed(Color(0xFF6A11CB), Color(0xFF2575FC)),
          image: imageOf(id),
        );

    return [
      Order(
        id: 'HY20260917001',
        shop: '寰宇官方旗舰店',
        items: [
          item(
            id: 'p1',
            title: '寰宇定制 纯棉圆领短袖T恤 多色可选',
            price: 89.0,
            seed: const ColorSeed(Color(0xFF6A11CB), Color(0xFF2575FC)),
            spec: '曜石黑 / XL',
          ),
        ],
        goodsTotal: 89.0,
        status: OrderStatus.pendingPay,
        source: OrderSource.mall,
        createdAt: now.subtract(const Duration(hours: 2)),
      ),
      Order(
        id: 'HY20260916012',
        shop: '声海数码专营店',
        items: [
          item(
            id: 'p2',
            title: '无线蓝牙耳机 主动降噪 超长续航',
            price: 299.0,
            qty: 1,
            seed: const ColorSeed(Color(0xFF0F2027), Color(0xFF203A43)),
            spec: '石墨黑',
          ),
        ],
        goodsTotal: 299.0,
        status: OrderStatus.pendingShip,
        source: OrderSource.mall,
        createdAt: now.subtract(const Duration(days: 1)),
      ),
      Order(
        id: 'HY20260915538',
        shop: '智行运动',
        items: [
          item(
            id: 'p9',
            title: '轻量减震跑鞋 全掌碳板',
            price: 399.0,
            seed: const ColorSeed(Color(0xFF43A047), Color(0xFF66BB6A)),
            spec: '荧光绿 / 42',
          ),
        ],
        goodsTotal: 399.0,
        status: OrderStatus.shipped,
        source: OrderSource.video,
        createdAt: now.subtract(const Duration(days: 3)),
        fromVideoId: 'v1',
        fromVideoTitle: '现场：城市地铁新线开通首日实拍',
        trail: [
          '【杭州余杭】商家已发货，等待揽收',
          '【杭州转运中心】包裹已到达',
          '【余杭区】快递员正在派送中',
        ],
      ),
      Order(
        id: 'HY20260914777',
        shop: '寰宇文创',
        items: [
          item(
            id: 'p5',
            title: '寰宇新闻 2026 年度精选合订本',
            price: 128.0,
            seed: const ColorSeed(Color(0xFFFC4A1A), Color(0xFFF7B733)),
            spec: '精装版',
          ),
        ],
        goodsTotal: 128.0,
        status: OrderStatus.pendingReview,
        source: OrderSource.live,
        createdAt: now.subtract(const Duration(days: 6)),
        fromVideoId: 'v2',
        fromVideoTitle: '直播：财经早班车 · 今日开盘解读',
        trail: [
          '【杭州】商家已发货',
          '【杭州转运中心】已到达',
          '【余杭区】已签收，感谢使用顺丰',
        ],
      ),
      Order(
        id: 'HY20260913055',
        shop: '老碗村（文一西路店）',
        items: [
          item(
            id: 'd1',
            title: '老碗村 · 双人套餐',
            price: 98.0,
            seed: const ColorSeed(Color(0xFFFF9800), Color(0xFFFFB74D)),
            spec: '到店团购券',
          ),
        ],
        goodsTotal: 98.0,
        status: OrderStatus.completed,
        source: OrderSource.local,
        createdAt: now.subtract(const Duration(days: 10)),
        rating: 5.0,
        review: '分量足，牛肉面很地道，服务也很热情，下次还来。',
      ),
      Order(
        id: 'HY20260911188',
        shop: '云谷食品',
        items: [
          item(
            id: 'p3',
            title: '云南小粒咖啡 挂耳咖啡 30 片装',
            price: 59.9,
            qty: 2,
            seed: const ColorSeed(Color(0xFF8E2DE2), Color(0xFF4A00E0)),
            spec: '醇香款',
          ),
        ],
        goodsTotal: 119.8,
        status: OrderStatus.refunding,
        source: OrderSource.video,
        createdAt: now.subtract(const Duration(days: 12)),
        fromVideoId: 'v4',
        fromVideoTitle: '深夜食堂：城市里的烟火气',
      ),
    ];
  }

  static String _nowLabel() {
    final n = DateTime.now();
    return '${n.hour}:${n.minute.toString().padLeft(2, '0')}';
  }
}

/// 全局单例
final AppState appState = AppState();

/// 当前 API 基址（门户新闻服务，默认 3000 端口）
/// 优先级：`--dart-define=API_BASE=...` > 端上默认 > Web 同源
/// - Android 模拟器：宿主机 10.0.2.2（不依赖 adb reverse）
/// - 真机：`flutter run --dart-define=API_BASE=http://192.168.x.x:3000`
/// - Web：同源直连（后端已开启 CORS）
String get apiBaseUrl {
  const fromDefine = String.fromEnvironment('API_BASE');
  if (fromDefine.isNotEmpty) return fromDefine;
  if (kIsWeb) return platform.webBaseUrl();
  return platform.defaultApiBase();
}
