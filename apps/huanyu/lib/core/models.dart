import 'dart:convert';
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// 双语文案：中国版取中文，国际版优先取英文
String localized(bool cn, String zh, String? en) => (cn || en == null || en.isEmpty) ? zh : en;

// ============================================================
// 新闻
// ============================================================

/// 新闻稿件（对齐后端 /api/v1/feed 与 /api/v1/news/:id 字段）
class Article {
  final String id;
  final String title;
  final String summary;
  final String cover;
  final String channel;
  final String source;
  final String publishedAt;
  final List<String> tags;
  final int views;
  final int comments;
  final List<ContentBlock> content;

  const Article({
    required this.id,
    required this.title,
    this.summary = '',
    this.cover = '',
    this.channel = '',
    this.source = '',
    this.publishedAt = '',
    this.tags = const [],
    this.views = 0,
    this.comments = 0,
    this.content = const [],
  });

  factory Article.fromJson(Map<String, dynamic> j) {
    final stats = (j['stats'] is Map) ? j['stats'] as Map<String, dynamic> : const {};
    return Article(
      id: (j['id'] ?? '').toString(),
      title: (j['title'] ?? '').toString(),
      summary: (j['summary'] ?? j['subtitle'] ?? '').toString(),
      cover: (j['cover'] ?? j['image'] ?? '').toString(),
      channel: (j['channel'] ?? '').toString(),
      source: (j['source'] ?? '').toString(),
      publishedAt: (j['publishedAt'] ?? '').toString(),
      tags: (j['tags'] is List) ? (j['tags'] as List).map((e) => e.toString()).toList() : const [],
      views: _int(stats['views']),
      comments: _int(stats['comments']),
      content: ContentBlock.parseList(j['content']),
    );
  }

  static int _int(dynamic v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;

  String coverUrl(String base) {
    if (cover.isEmpty) return '';
    if (cover.startsWith('http')) return cover;
    return '$base/${cover.replaceFirst(RegExp(r'^/'), '')}';
  }

  String get timeLabel {
    if (publishedAt.isEmpty) return '';
    final t = DateTime.tryParse(publishedAt);
    if (t == null) return '';
    final d = DateTime.now().difference(t);
    if (d.inMinutes < 1) return '刚刚';
    if (d.inMinutes < 60) return '${d.inMinutes}分钟前';
    if (d.inHours < 24) return '${d.inHours}小时前';
    if (d.inDays < 30) return '${d.inDays}天前';
    return '${t.year}-${_p(t.month)}-${_p(t.day)}';
  }

  static String _p(int n) => n.toString().padLeft(2, '0');
}

/// 正文块（后端 content 是块数组，App 端做通用降级解析）
class ContentBlock {
  final String type; // paragraph / image
  final String text;
  final String url;

  const ContentBlock({required this.type, this.text = '', this.url = ''});

  static List<ContentBlock> parseList(dynamic raw) {
    if (raw is String) {
      return [ContentBlock(type: 'paragraph', text: raw)];
    }
    if (raw is! List) return const [];
    return raw.map((e) {
      if (e is String) return ContentBlock(type: 'paragraph', text: e);
      if (e is Map) {
        final m = e.map((k, v) => MapEntry(k.toString(), v));
        final type = (m['type'] ?? 'paragraph').toString();
        final url = (m['url'] ?? m['src'] ?? '').toString();
        final text = (m['text'] ?? m['value'] ?? m['content'] ?? '').toString();
        if (url.isNotEmpty && text.isEmpty) {
          return ContentBlock(type: 'image', url: url);
        }
        return ContentBlock(type: type, text: text, url: url);
      }
      return const ContentBlock(type: 'paragraph');
    }).toList();
  }
}

/// 频道定义（与后端 CHANNELS 对齐）
class ChannelDef {
  final String id;
  final String name;
  final String nameEn;

  const ChannelDef(this.id, this.name, {this.nameEn = ''});

  static const all = [
    ChannelDef('', '推荐', nameEn: 'For You'),
    ChannelDef('china', '国内', nameEn: 'China'),
    ChannelDef('world', '国际', nameEn: 'World'),
    ChannelDef('finance', '财经', nameEn: 'Finance'),
    ChannelDef('tech', '科技', nameEn: 'Tech'),
    ChannelDef('sports', '体育', nameEn: 'Sports'),
    ChannelDef('ent', '娱乐', nameEn: 'Ent'),
    ChannelDef('auto', '汽车', nameEn: 'Auto'),
    ChannelDef('culture', '文化', nameEn: 'Culture'),
    ChannelDef('health', '健康', nameEn: 'Health'),
    ChannelDef('video', '视频', nameEn: 'Video'),
  ];

  static String nameOf(String id, bool cn) {
    final c = all.firstWhere((e) => e.id == id, orElse: () => all.first);
    return localized(cn, c.name, c.nameEn);
  }
}

// ============================================================
// 即时通讯
// ============================================================

enum MessageKind { text, image, voice, transfer, system, order, video }

class ChatMessage {
  final String id;
  final String from; // 'me' 或对方 id
  final String text;
  final String? textEn;
  final MessageKind kind;
  final DateTime time;
  final double? amount; // 转账金额
  final String? orderId; // 关联订单（聊窗内发订单卡片）

  const ChatMessage({
    required this.id,
    required this.from,
    required this.text,
    this.textEn,
    this.kind = MessageKind.text,
    required this.time,
    this.amount,
    this.orderId,
  });

  bool get isMe => from == 'me';

  String displayText(bool cn) => localized(cn, text, textEn);
}

class ChatSession {
  final String id;
  final String name;
  final String? nameEn;
  final String avatarText;
  final ColorSeed seed;
  final String lastMessage;
  final String? lastMessageEn;
  final DateTime time;
  final int unread;
  final bool isGroup;
  final bool pinned;
  final bool official; // 官方号（商城客服 / 支付助手 / 本地生活）
  final List<ChatMessage> messages;
  final List<String> replies; // 模拟自动回复语料

  const ChatSession({
    required this.id,
    required this.name,
    this.nameEn,
    required this.avatarText,
    required this.seed,
    required this.lastMessage,
    this.lastMessageEn,
    required this.time,
    this.unread = 0,
    this.isGroup = false,
    this.pinned = false,
    this.official = false,
    this.messages = const [],
    this.replies = const [],
  });

  String displayName(bool cn) => localized(cn, name, nameEn);
  String displayLast(bool cn) => localized(cn, lastMessage, lastMessageEn);
}

/// 视频/直播互动消息（点赞、评论、关注、下单）——统一进入消息中心
enum InteractType { like, comment, follow, gift, live, order }

class InteractionMsg {
  final String id;
  final InteractType type;
  final String videoId;
  final String videoTitle;
  final String user;
  final String? userEn;
  final String avatarText;
  final ColorSeed seed;
  final String text;
  final DateTime time;
  bool read;

  InteractionMsg({
    required this.id,
    required this.type,
    required this.videoId,
    required this.videoTitle,
    required this.user,
    this.userEn,
    required this.avatarText,
    required this.seed,
    required this.text,
    required this.time,
    this.read = false,
  });

  String displayUser(bool cn) => localized(cn, user, userEn);
}

/// 视频评论
class VideoComment {
  final String id;
  final String videoId;
  final String author;
  final ColorSeed seed;
  final String text;
  final DateTime time;
  final int likes;
  bool liked;
  final bool isAuthor; // 作者本人
  final bool pinned;

  VideoComment({
    required this.id,
    required this.videoId,
    required this.author,
    required this.seed,
    required this.text,
    required this.time,
    this.likes = 0,
    this.liked = false,
    this.isAuthor = false,
    this.pinned = false,
  });
}

// ============================================================
// 短视频 / 直播
// ============================================================

class VideoItem {
  final String id;
  final String title;
  final String? titleEn;
  final String author;
  final String? authorEn;
  final String desc;
  final String? descEn;
  final int likes;
  final int comments;
  final int shares;
  final bool live;
  final int viewers;
  final ColorSeed seed;
  final List<String> tags;
  /// 本地资源视频（assets/videos/），为空时降级为渐变封面
  final String asset;
  /// 关联商品（视频购物车 / 直播间小黄车）
  final List<String> productIds;
  final String shop;

  const VideoItem({
    required this.id,
    required this.title,
    this.titleEn,
    required this.author,
    this.authorEn,
    required this.desc,
    this.descEn,
    required this.likes,
    required this.comments,
    required this.shares,
    this.live = false,
    this.viewers = 0,
    required this.seed,
    this.tags = const [],
    this.asset = '',
    this.productIds = const [],
    this.shop = '',
  });

  String displayTitle(bool cn) => localized(cn, title, titleEn);
  String displayAuthor(bool cn) => localized(cn, author, authorEn);
  String displayDesc(bool cn) => localized(cn, desc, descEn);

  String get likeLabel => _fmt(likes);
  String get commentLabel => _fmt(comments);

  static String _fmt(int n) =>
      n >= 10000 ? '${(n / 10000).toStringAsFixed(1)}w' : (n >= 1000 ? '${(n / 1000).toStringAsFixed(1)}k' : '$n');
}

// ============================================================
// 商城
// ============================================================

/// 商城一级类目：首页金刚区、分类筛选、商品列表共用同一份定义
class ShopCategory {
  final String id;
  final String name;
  final String nameEn;
  final IconData icon;
  final ColorSeed seed;

  const ShopCategory(this.id, this.name,
      {required this.nameEn, required this.icon, required this.seed});

  /// 首页金刚区展示顺序（含“推荐”全量入口）
  static const all = [
    ShopCategory('recommend', '推荐',
        nameEn: 'For You', icon: Icons.auto_awesome, seed: ColorSeed(Color(0xFFFF6A88), Color(0xFFFF9A8B))),
    ShopCategory('digital', '数码',
        nameEn: 'Digital', icon: Icons.devices_outlined, seed: ColorSeed(Color(0xFF2B5876), Color(0xFF4E4376))),
    ShopCategory('fashion', '服饰',
        nameEn: 'Fashion', icon: Icons.dry_cleaning_outlined, seed: ColorSeed(Color(0xFFF857A6), Color(0xFFFF5858))),
    ShopCategory('food', '食品',
        nameEn: 'Food', icon: Icons.lunch_dining_outlined, seed: ColorSeed(Color(0xFFF79D00), Color(0xFF64F38C))),
    ShopCategory('home', '家居',
        nameEn: 'Home', icon: Icons.chair_outlined, seed: ColorSeed(Color(0xFF43C6AC), Color(0xFF191654))),
    ShopCategory('sports', '运动',
        nameEn: 'Sports', icon: Icons.directions_run, seed: ColorSeed(Color(0xFF0082C8), Color(0xFF00C6A9))),
    ShopCategory('books', '图书文创',
        nameEn: 'Books', icon: Icons.auto_stories_outlined, seed: ColorSeed(Color(0xFF8E2DE2), Color(0xFF4A00E0))),
    ShopCategory('live', '直播间',
        nameEn: 'Live', icon: Icons.live_tv_outlined, seed: ColorSeed(Color(0xFFFE2C55), Color(0xFFFF8A5B))),
    ShopCategory('coupon', '领券中心',
        nameEn: 'Coupons', icon: Icons.confirmation_num_outlined, seed: ColorSeed(Color(0xFFF5515F), Color(0xFF9F041B))),
    ShopCategory('rank', '排行榜',
        nameEn: 'Top Rank', icon: Icons.leaderboard_outlined, seed: ColorSeed(Color(0xFFFFB75E), Color(0xFFED8F03))),
  ];

  /// 参与商品归类的一级类目（不含推荐位等非商品类目）
  static const goods = ['recommend', 'digital', 'fashion', 'food', 'home', 'sports', 'books'];

  static ShopCategory of(String id) =>
      all.firstWhere((c) => c.id == id, orElse: () => all.first);

  String displayName(bool cn) => localized(cn, name, nameEn);
}

class Product {
  final String id;
  final String title;
  final String? titleEn;
  final String shop;
  final String? shopEn;
  final double price;
  final double origin;
  final int sold;
  final ColorSeed seed;
  final String tag;
  int quantity;
  // 淘宝级字段
  final double rating;
  final int reviewCount;
  final int salesMonthly;
  final double freight;
  final List<String> coupons;
  final List<String> specs; // 规格维度，如 ['颜色','尺码']
  final List<String> specOptions; // 第一维度可选值
  final List<String> highlights; // 宝贝亮点
  final String address;
  final String videoId; // 关联推广视频（可空）
  final List<String> images; // 本地商品图（assets/shop/p#_1.jpg ...）
  final String desc; // 商品描述
  final String? descEn;
  final List<String> detail; // 图文详情段落
  /// 一级类目（ShopCategory.id），为空时按推荐处理
  final String category;

  Product({
    required this.id,
    required this.title,
    this.titleEn,
    required this.shop,
    this.shopEn,
    required this.price,
    this.origin = 0,
    this.sold = 0,
    required this.seed,
    this.tag = '',
    this.quantity = 0,
    this.rating = 4.8,
    this.reviewCount = 0,
    this.salesMonthly = 0,
    this.freight = 0,
    this.coupons = const [],
    this.specs = const [],
    this.specOptions = const [],
    this.highlights = const [],
    this.address = '浙江杭州',
    this.videoId = '',
    this.images = const [],
    this.desc = '',
    this.descEn,
    this.detail = const [],
    this.category = 'recommend',
  });

  String displayTitle(bool cn) => localized(cn, title, titleEn);
  String displayShop(bool cn) => localized(cn, shop, shopEn);
  String displayDesc(bool cn) => localized(cn, desc, descEn ?? desc);

  /// 主图 asset，没有配图时返回空串（调用方走渐变兜底）
  String get cover => images.isNotEmpty ? images.first : '';

  Product copyWith({int? quantity}) => Product(
        id: id,
        title: title,
        titleEn: titleEn,
        shop: shop,
        shopEn: shopEn,
        price: price,
        origin: origin,
        sold: sold,
        seed: seed,
        tag: tag,
        quantity: quantity ?? this.quantity,
        rating: rating,
        reviewCount: reviewCount,
        salesMonthly: salesMonthly,
        freight: freight,
        coupons: coupons,
        specs: specs,
        specOptions: specOptions,
        highlights: highlights,
        address: address,
        videoId: videoId,
        images: images,
        desc: desc,
        descEn: descEn,
        detail: detail,
        category: category,
      );
}

// ============================================================
// 订单（淘宝式正向 / 逆向流程）
// ============================================================

enum OrderStatus { pendingPay, pendingShip, shipped, pendingReview, completed, refunding, refunded }

extension OrderStatusX on OrderStatus {
  String label(UiFlavor f) => switch (this) {
        OrderStatus.pendingPay => localized(f.isCn, '待付款', 'Unpaid'),
        OrderStatus.pendingShip => localized(f.isCn, '待发货', 'To ship'),
        OrderStatus.shipped => localized(f.isCn, '待收货', 'Shipping'),
        OrderStatus.pendingReview => localized(f.isCn, '待评价', 'To review'),
        OrderStatus.completed => localized(f.isCn, '已完成', 'Completed'),
        OrderStatus.refunding => localized(f.isCn, '退款中', 'Refunding'),
        OrderStatus.refunded => localized(f.isCn, '已退款', 'Refunded'),
      };

  String describe(UiFlavor f) => switch (this) {
        OrderStatus.pendingPay => localized(f.isCn, '订单已提交，请尽快完成付款', 'Order placed, awaiting payment'),
        OrderStatus.pendingShip => localized(f.isCn, '商家正在打包，等待发货', 'Seller is packing your order'),
        OrderStatus.shipped => localized(f.isCn, '包裹已在运输途中', 'Package on the way'),
        OrderStatus.pendingReview => localized(f.isCn, '已收货，快去评价吧', 'Received, write a review'),
        OrderStatus.completed => localized(f.isCn, '交易成功', 'Transaction completed'),
        OrderStatus.refunding => localized(f.isCn, '退款申请已提交，等待处理', 'Refund requested'),
        OrderStatus.refunded => localized(f.isCn, '退款已到账', 'Refunded'),
      };

  /// 主操作按钮（淘宝订单按钮区的行为来源）
  String? action(UiFlavor f) => switch (this) {
        OrderStatus.pendingPay => localized(f.isCn, '去付款', 'Pay now'),
        OrderStatus.pendingShip => localized(f.isCn, '催发货', 'Remind'),
        OrderStatus.shipped => localized(f.isCn, '确认收货', 'Confirm receipt'),
        OrderStatus.pendingReview => localized(f.isCn, '评价', 'Review'),
        OrderStatus.completed => localized(f.isCn, '再次购买', 'Buy again'),
        OrderStatus.refunding => localized(f.isCn, '撤销申请', 'Cancel request'),
        OrderStatus.refunded => null,
      };
}

/// 订单来源：商城 / 直播间 / 短视频 / 本地生活 —— 打通各板块
enum OrderSource { mall, live, video, local }

extension OrderSourceX on OrderSource {
  String label(UiFlavor f) => switch (this) {
        OrderSource.mall => localized(f.isCn, '商城', 'Shop'),
        OrderSource.live => localized(f.isCn, '直播间下单', 'Live order'),
        OrderSource.video => localized(f.isCn, '短视频下单', 'Video order'),
        OrderSource.local => localized(f.isCn, '本地生活', 'Local'),
      };
}

class OrderItem {
  final String productId;
  final String title;
  final String spec;
  final double price;
  final int quantity;
  final ColorSeed seed;
  /// 真实商品图（assets 高清实拍，商品首图 / 团购图）；为空时 UI 回退到渐变色块
  final String image;

  const OrderItem({
    required this.productId,
    required this.title,
    required this.spec,
    required this.price,
    required this.quantity,
    required this.seed,
    this.image = '',
  });
}

class Order {
  final String id;
  final String shop;
  final List<OrderItem> items;
  final double goodsTotal;
  final double freight;
  final OrderStatus status;
  final OrderSource source;
  final DateTime createdAt;
  final String receiver;
  final String phone;
  final String address;
  final String logisticsCompany;
  final String logisticsNo;
  final List<String> trail; // 物流轨迹
  final String? fromVideoId; // 来源视频/直播间
  final String? fromVideoTitle;
  final double rating; // 已评价星级
  final String? review;

  Order({
    required this.id,
    required this.shop,
    required this.items,
    required this.goodsTotal,
    this.freight = 0,
    required this.status,
    required this.source,
    required this.createdAt,
    this.receiver = '寰宇用户',
    this.phone = '138****8888',
    this.address = '浙江省杭州市余杭区文一西路 969 号 3 号楼',
    this.logisticsCompany = '顺丰速运',
    this.logisticsNo = '',
    this.trail = const [],
    this.fromVideoId,
    this.fromVideoTitle,
    this.rating = 0,
    this.review,
  });

  double get total => goodsTotal + freight;
  int get count => items.fold(0, (s, e) => s + e.quantity);

  /// 未手动指定时按创建时间生成稳定的运单号
  String get trackingNo =>
      logisticsNo.isEmpty ? 'SF${createdAt.millisecondsSinceEpoch % 10000000000}' : logisticsNo;
}

// ============================================================
// 本地生活（对标美团）
// ============================================================

enum DealCategory { takeaway, group, hotel, movie, beauty, repair, errand, travel }

extension DealCategoryX on DealCategory {
  String label(UiFlavor f) => switch (this) {
        DealCategory.takeaway => localized(f.isCn, '外卖', 'Delivery'),
        DealCategory.group => localized(f.isCn, '到店团购', 'Deals'),
        DealCategory.hotel => localized(f.isCn, '酒店民宿', 'Hotels'),
        DealCategory.movie => localized(f.isCn, '电影演出', 'Movies'),
        DealCategory.beauty => localized(f.isCn, '丽人美发', 'Beauty'),
        DealCategory.repair => localized(f.isCn, '家政维修', 'Repair'),
        DealCategory.errand => localized(f.isCn, '跑腿代购', 'Errands'),
        DealCategory.travel => localized(f.isCn, '景点门票', 'Travel'),
      };

  IconData get icon => switch (this) {
        DealCategory.takeaway => Icons.delivery_dining_outlined,
        DealCategory.group => Icons.local_offer_outlined,
        DealCategory.hotel => Icons.bed_outlined,
        DealCategory.movie => Icons.local_movies_outlined,
        DealCategory.beauty => Icons.content_cut_outlined,
        DealCategory.repair => Icons.handyman_outlined,
        DealCategory.errand => Icons.directions_run_outlined,
        DealCategory.travel => Icons.park_outlined,
      };
}

class LocalDeal {
  final String id;
  final String title;
  final String? titleEn;
  final String shop;
  final DealCategory category;
  final double price;
  final double origin;
  final int sold;
  final double rating;
  final double distanceKm;
  final String address;
  final ColorSeed seed;
  final List<String> tags;
  final List<String> packageItems; // 团购套餐内容
  final bool deliveryNow;
  final String openHours;
  final String image; // 团单配图 assets/life/d#.jpg
  final String desc; // 团单描述
  final String? descEn;

  const LocalDeal({
    required this.id,
    required this.title,
    this.titleEn,
    required this.shop,
    required this.category,
    required this.price,
    this.origin = 0,
    this.sold = 0,
    this.rating = 4.6,
    this.distanceKm = 1.2,
    this.address = '杭州市余杭区',
    required this.seed,
    this.tags = const [],
    this.packageItems = const [],
    this.deliveryNow = false,
    this.openHours = '10:00-22:00',
    this.image = '',
    this.desc = '',
    this.descEn,
  });

  String displayTitle(bool cn) => localized(cn, title, titleEn);
  String displayDesc(bool cn) => localized(cn, desc, descEn ?? desc);
}

// ============================================================
// 支付
// ============================================================

class BillItem {
  final String title;
  final String? titleEn;
  final String time;
  final double amount;
  final String type; // in / out
  final IconData icon;
  final String category; // 团购 / 商城 / 转账 / 充值
  final String? orderId;

  const BillItem({
    required this.title,
    this.titleEn,
    required this.time,
    required this.amount,
    required this.type,
    required this.icon,
    this.category = '其他',
    this.orderId,
  });

  String displayTitle(bool cn) => localized(cn, title, titleEn);
}

// ============================================================
// 小程序
// ============================================================

class MiniApp {
  final String id;
  final String name;
  final String desc;
  final IconData icon;
  final ColorSeed seed;
  final String category;

  const MiniApp({
    required this.id,
    required this.name,
    required this.desc,
    required this.icon,
    required this.seed,
    required this.category,
  });
}

/// 头像用固定的渐变种子，避免引用外部图片导致离线不可用
class ColorSeed {
  final Color a;
  final Color b;

  const ColorSeed(this.a, this.b);
}

String prettyJson(Object? o) => const JsonEncoder.withIndent('  ').convert(o);
