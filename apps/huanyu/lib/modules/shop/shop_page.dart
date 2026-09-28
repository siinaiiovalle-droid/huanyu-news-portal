import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/mock.dart';
import '../../core/models.dart';
import '../../state/app_state.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common.dart';
import '../im/chat_page.dart';
import '../pay/checkout_page.dart';
import '../video/video_feed_page.dart';
import 'collection_page.dart';
import 'order_page.dart';

/// 在线商城（对标抖音商城 / TikTok Shop / 淘宝）：
/// 首页 → 详情（SKU）→ 购物车 → 确认订单 → 收银台 → 订单中心（发货/收货/评价/退款）
/// 商品可由短视频详情页与直播间购物袋直接带入（OrderSource.video / live）
class ShopPage extends StatefulWidget {
  const ShopPage({super.key});

  @override
  State<ShopPage> createState() => _ShopPageState();
}

class _ShopPageState extends State<ShopPage> {
  /// 首屏轮播运营位（纯本地渲染，离线可用）
  static const _banners = [
    _BannerData('9 月会员日', '全场最高减 200 · 限量放送',
        Color(0xFFFF3C4B), Color(0xFFFFB199), Icons.card_giftcard_outlined, '进入会场',
        titleEn: 'Member Day', subtitleEn: 'Up to ¥200 off · limited', coupon: true),
    _BannerData('超级品牌日', '数码好物 12 期免息',
        Color(0xFF2B5876), Color(0xFF6A82FB), Icons.devices_outlined, '立即抢购',
        titleEn: 'Brand Day', subtitleEn: 'Interest-free on digital', category: 'digital'),
    _BannerData('源头直供', '产地直发 · 坏果包赔',
        Color(0xFF0B8A6F), Color(0xFF6BE3A1), Icons.agriculture_outlined, '去看看',
        titleEn: 'Direct Supply', subtitleEn: 'Shipped from origin', category: 'food'),
  ];

  final PageController _bannerController = PageController(viewportFraction: 0.92);
  Timer? _bannerTimer;
  int _bannerIndex = 0;
  String _category = 'recommend';
  String _sort = 'default';
  final Set<String> _claimedCoupons = {};

  @override
  void initState() {
    super.initState();
    _bannerTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (!_bannerController.hasClients) return;
      final next = (_bannerIndex + 1) % _banners.length;
      _bannerController.animateToPage(
        next,
        duration: const Duration(milliseconds: 400),
        curve: Curves.easeInOut,
      );
    });
  }

  @override
  void dispose() {
    _bannerTimer?.cancel();
    _bannerController.dispose();
    super.dispose();
  }

  /// 当前类目 + 排序下的商品列表
  List<Product> get _products {
    final list = Mock.products
        .where((p) => _category == 'recommend' || p.category == _category)
        .toList();
    switch (_sort) {
      case 'sales':
        list.sort((a, b) => b.salesMonthly.compareTo(a.salesMonthly));
        break;
      case 'priceAsc':
        list.sort((a, b) => a.price.compareTo(b.price));
        break;
      case 'priceDesc':
        list.sort((a, b) => b.price.compareTo(a.price));
        break;
      case 'rating':
        list.sort((a, b) => b.rating.compareTo(a.rating));
        break;
      default:
        list.sort((a, b) => b.sold.compareTo(a.sold));
    }
    return list;
  }

  String get _sortLabel {
    final cn = appState.flavor.isCn;
    return switch (_sort) {
      'sales' => localized(cn, '销量优先', 'Top sales'),
      'priceAsc' => localized(cn, '价格从低到高', 'Price low to high'),
      'priceDesc' => localized(cn, '价格从高到低', 'Price high to low'),
      'rating' => localized(cn, '评分最高', 'Best rated'),
      _ => localized(cn, '综合排序', 'Recommended'),
    };
  }

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    final brand = Brand.of(appState.flavor);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final products = _products;

    return Scaffold(
      backgroundColor: dark ? const Color(0xFF0F1418) : const Color(0xFFF5F6F8),
      body: CustomScrollView(
        slivers: [
          // 品牌色搜索栏（滚动时吸顶）
          SliverAppBar(
            pinned: true,
            elevation: 0,
            scrolledUnderElevation: 0,
            toolbarHeight: 54,
            backgroundColor: brand.shop,
            leadingWidth: 36,
            leading: Padding(
              padding: const EdgeInsets.only(left: 12),
              child: IconButton(
                icon: const Icon(Icons.qr_code_scanner, color: Colors.white, size: 20),
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(),
                onPressed: () => _toast(context, cn ? '扫一扫（演示）' : 'Scan (demo)'),
              ),
            ),
            titleSpacing: 8,
            title: _SearchBar(
              hint: cn ? '搜索 商品 / 店铺 / 直播间' : 'Search products, shops',
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => CollectionPage(
                    title: '搜索',
                    titleEn: 'Search',
                    products: Mock.products,
                    searchable: true,
                    hint: '搜索 商品 / 店铺',
                    hintEn: 'Search products or shops',
                  ),
                ),
              ),
            ),
            actions: [
              ListenableBuilder(
                listenable: appState,
                builder: (context, _) => IconButton(
                  constraints: const BoxConstraints.tightFor(width: 44, height: 44),
                  padding: EdgeInsets.zero,
                  icon: Badge(
                    isLabelVisible: appState.cartCount > 0,
                    label: Text('${appState.cartCount}'),
                    backgroundColor: dark ? Colors.white : const Color(0xFFFFE500),
                    textColor: dark ? const Color(0xFF17212B) : brand.shop,
                    child: const Icon(Icons.shopping_cart_outlined, color: Colors.white),
                  ),
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const CartPage()),
                  ),
                ),
              ),
              const SizedBox(width: 4),
            ],
          ),
          // 运营楼层：轮播 → 金刚区 → 活动 → 秒杀 → 领券
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Column(
                children: [
                  _BannerSlider(
                    controller: _bannerController,
                    banners: _banners,
                    index: _bannerIndex,
                    onPageChanged: (i) => setState(() => _bannerIndex = i),
                    onTap: (b) => _onBanner(context, b),
                  ),
                  _QuickEntries(
                    activeId: _category,
                    onPick: (id) => _onQuickEntry(context, id),
                  ),
                  _ActivityRow(onTap: (i) => _onActivity(context, i)),
                  const _FlashSaleFloor(),
                  _CouponFloor(
                    claimed: _claimedCoupons,
                    onClaim: (c) => setState(() => _claimedCoupons.add(c)),
                  ),
                ],
              ),
            ),
          ),
          // 吸顶：类目 + 排序
          SliverPersistentHeader(
            pinned: true,
            delegate: _FilterBarDelegate(
              cn: cn,
              category: _category,
              sortLabel: _sortLabel,
              sort: _sort,
              onCategory: (id) => setState(() => _category = id),
              onSort: (s) => setState(() => _sort = s),
            ),
          ),
          if (products.isEmpty)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.only(top: 60),
                child: EmptyView(
                  icon: Icons.shopping_bag_outlined,
                  title: localized(cn, '该分类暂无商品', 'No products in this category'),
                  subtitle: localized(cn, '换个类目看看吧', 'Try another category'),
                ),
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(10, 10, 10, 24),
              sliver: SliverGrid(
                delegate: SliverChildBuilderDelegate(
                  (context, i) => ProductCard(product: products[i], cn: cn),
                  childCount: products.length,
                ),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  mainAxisSpacing: 10,
                  crossAxisSpacing: 10,
                  childAspectRatio: 0.58,
                ),
              ),
            ),
        ],
      ),
      bottomNavigationBar: ListenableBuilder(
        listenable: appState,
        builder: (context, _) {
          if (appState.cartCount == 0) return const SizedBox.shrink();
          return SafeArea(
            child: Container(
              height: 56,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(
                color: Theme.of(context).cardColor,
                boxShadow: [
                  BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, -2)),
                ],
              ),
              child: Row(
                children: [
                  Badge(
                    label: Text('${appState.cartCount}'),
                    child: Icon(Icons.shopping_cart, color: brand.shop),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    '¥${appState.cartTotal.toStringAsFixed(2)}',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: brand.shop),
                  ),
                  if (appState.cartSaved > 0) ...[
                    const SizedBox(width: 6),
                    Text(
                      localized(
                        cn,
                        '已省 ¥${appState.cartSaved.toStringAsFixed(0)}',
                        'Saved ¥${appState.cartSaved.toStringAsFixed(0)}',
                      ),
                      style: TextStyle(
                        fontSize: 11,
                        color: dark ? const Color(0xFF7A8A99) : const Color(0xFF9E9E9E),
                      ),
                    ),
                  ],
                  const Spacer(),
                  FilledButton(
                    onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const CartPage()),
                    ),
                    style: FilledButton.styleFrom(
                      backgroundColor: brand.shop,
                      minimumSize: const Size(102, 38),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(19)),
                    ),
                    child: Text(localized(cn, '去结算', 'Checkout')),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  /// 金刚区点击：类目 / 直播间 / 领券中心 / 排行榜 —— 每个入口都有明确落点
  void _onQuickEntry(BuildContext context, String id) {
    if (id == 'live') {
      final idx = Mock.videos.indexWhere((v) => v.live);
      Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => VideoFeedPage(initialIndex: idx < 0 ? 0 : idx)),
      );
      return;
    }
    if (id == 'coupon') {
      _showCouponSheet(context);
      return;
    }
    if (id == 'rank') {
      final list = [...Mock.products]..sort((a, b) => b.salesMonthly.compareTo(a.salesMonthly));
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => CollectionPage(
            title: '销量排行榜',
            titleEn: 'Top Rank',
            products: list,
            ranked: true,
            note: '按近 30 天销量排序，每小时更新一次',
            noteEn: 'Sorted by 30-day sales, refreshed hourly',
          ),
        ),
      );
      return;
    }
    final cat = ShopCategory.of(id);
    final list = Mock.products.where((p) => id == 'recommend' || p.category == id).toList();
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CollectionPage(
          title: id == 'recommend' ? '今日推荐' : cat.name,
          titleEn: id == 'recommend' ? 'For You' : cat.nameEn,
          products: list,
          searchable: true,
          hint: '在当前类目内搜索',
          hintEn: 'Search in this category',
          note: '共 ${list.length} 件商品 · 支持销量 / 价格 / 评分排序',
          noteEn: '${list.length} items · sort by sales / price / rating',
        ),
      ),
    );
  }

  /// 轮播点击：进入对应会场（会员日走领券中心）
  void _onBanner(BuildContext context, _BannerData b) {
    if (b.coupon) {
      _showCouponSheet(context);
      return;
    }
    final list = Mock.products.where((p) => b.category == 'recommend' || p.category == b.category).toList();
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CollectionPage(
          title: b.title,
          titleEn: b.titleEn ?? b.title,
          products: list,
          searchable: true,
          note: '${b.subtitle} · 共 ${list.length} 件',
          noteEn: '${b.subtitleEn ?? b.subtitle} · ${list.length} items',
        ),
      ),
    );
  }

  /// 活动行：百亿补贴 → 补贴专场；直播间 → 视频页；会员日 → 领券中心
  void _onActivity(BuildContext context, int index) {
    if (index == 1) {
      final idx = Mock.videos.indexWhere((v) => v.live);
      Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => VideoFeedPage(initialIndex: idx < 0 ? 0 : idx)),
      );
      return;
    }
    if (index == 2) {
      _showCouponSheet(context);
      return;
    }
    final list = Mock.products.where((p) => p.origin > p.price && p.price / p.origin <= 0.85).toList();
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CollectionPage(
          title: '百亿补贴',
          titleEn: 'Subsidy',
          products: list,
          searchable: true,
          note: '平台补贴价，可与优惠券叠加使用',
          noteEn: 'Subsidized price, stackable with coupons',
        ),
      ),
    );
  }

  Future<void> _showCouponSheet(BuildContext context) {
    final cn = appState.flavor.isCn;
    final coupons = _CouponInfo.platform();
    return showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(localized(cn, '领券中心', 'Coupon center'),
                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
              const SizedBox(height: 6),
              Text(
                localized(cn, '下单时自动抵扣最优惠的一张', 'Best coupon applies automatically'),
                style: TextStyle(fontSize: 12, color: Theme.of(ctx).disabledColor),
              ),
              const SizedBox(height: 12),
              ...coupons.map(
                (c) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _CouponTile(
                    coupon: c,
                    claimed: _claimedCoupons.contains(c.raw),
                    onClaim: () {
                      setState(() => _claimedCoupons.add(c.raw));
                      setSheet(() {});
                    },
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _toast(BuildContext context, String text) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(text), duration: const Duration(seconds: 1), behavior: SnackBarBehavior.floating),
    );
  }
}

/// 运营位数据（纯本地渲染，离线可用）
class _BannerData {
  final String title;
  final String subtitle;
  final String? titleEn;
  final String? subtitleEn;
  final Color from;
  final Color to;
  final IconData icon;
  final String action;
  /// 点击后进入的商品集合类目（coupon=true 时改为弹领券中心）
  final String category;
  final bool coupon;

  const _BannerData(this.title, this.subtitle, this.from, this.to, this.icon, this.action,
      {this.titleEn, this.subtitleEn, this.category = 'recommend', this.coupon = false});
}

/// 首屏轮播运营位：自动轮播 + 指示条
class _BannerSlider extends StatelessWidget {
  final PageController controller;
  final List<_BannerData> banners;
  final int index;
  final ValueChanged<int> onPageChanged;
  final ValueChanged<_BannerData> onTap;

  const _BannerSlider({
    required this.controller,
    required this.banners,
    required this.index,
    required this.onPageChanged,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SizedBox(
          height: 140,
          child: PageView.builder(
            controller: controller,
            onPageChanged: onPageChanged,
            itemCount: banners.length,
            itemBuilder: (context, i) {
              final b = banners[i];
              return GestureDetector(
                onTap: () => onTap(b),
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 5),
                  padding: const EdgeInsets.fromLTRB(18, 14, 12, 14),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    gradient: LinearGradient(
                      colors: [b.from, b.to],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: b.from.withValues(alpha: 0.24),
                        blurRadius: 14,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.22),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: const Text(
                                '限时活动',
                                style: TextStyle(color: Colors.white, fontSize: 10),
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              b.title,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 19,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.5,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              b.subtitle,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 12),
                            ),
                            const SizedBox(height: 10),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(13),
                              ),
                              child: Text(
                                b.action,
                                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: b.from),
                              ),
                            ),
                          ],
                        ),
                      ),
                      Icon(b.icon, size: 62, color: Colors.white.withValues(alpha: 0.28)),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(banners.length, (i) {
            final active = i == index;
            return AnimatedContainer(
              duration: const Duration(milliseconds: 220),
              margin: const EdgeInsets.symmetric(horizontal: 3),
              width: active ? 14 : 5,
              height: 5,
              decoration: BoxDecoration(
                color: active
                    ? Brand.of(appState.flavor).shop
                    : (Theme.of(context).brightness == Brightness.dark
                        ? const Color(0xFF3A4756)
                        : const Color(0xFFD9DDE3)),
                borderRadius: BorderRadius.circular(3),
              ),
            );
          }),
        ),
      ],
    );
  }
}

/// 吸顶搜索栏内的只读搜索框
class _SearchBar extends StatelessWidget {
  final String hint;
  final VoidCallback onTap;

  const _SearchBar({required this.hint, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 34,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.22),
          borderRadius: BorderRadius.circular(17),
          border: Border.all(color: Colors.white.withValues(alpha: 0.32)),
        ),
        child: Row(
          children: [
            const Icon(Icons.search, size: 16, color: Colors.white),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                hint,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 13, color: Colors.white.withValues(alpha: 0.92)),
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.9),
                borderRadius: BorderRadius.circular(11),
              ),
              child: Text(
                cn ? '搜索' : 'Search',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Brand.of(appState.flavor).shop),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 分类金刚区：2 行 × 5 宫格，点击切换商品列表类目
class _QuickEntries extends StatelessWidget {
  final String activeId;
  final ValueChanged<String> onPick;

  const _QuickEntries({required this.activeId, required this.onPick});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      margin: const EdgeInsets.fromLTRB(10, 12, 10, 0),
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 6),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: dark ? 0.2 : 0.04), blurRadius: 10),
        ],
      ),
      child: GridView.count(
        crossAxisCount: 5,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        childAspectRatio: 0.78,
        children: ShopCategory.all.map((c) {
          final cn = appState.flavor.isCn;
          final active = c.id == activeId;
          return InkWell(
            onTap: () => onPick(c.id),
            borderRadius: BorderRadius.circular(10),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [c.seed.a, c.seed.b],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(16),
                    border: active ? Border.all(color: Brand.of(appState.flavor).shop, width: 2) : null,
                  ),
                  child: Icon(c.icon, color: Colors.white, size: 22),
                ),
                const SizedBox(height: 6),
                Text(
                  c.displayName(cn),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: active ? FontWeight.w700 : FontWeight.w400,
                    color: active ? Brand.of(appState.flavor).shop : (dark ? Colors.white70 : const Color(0xFF3C3C3C)),
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }
}

/// 活动楼层：三宫格运营入口
class _ActivityRow extends StatelessWidget {
  final ValueChanged<int> onTap;

  const _ActivityRow({required this.onTap});

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    final items = [
      _ActivityData(localized(cn, '百亿补贴', 'Subsidy'), localized(cn, '大牌直降', 'Big brands cut'),
          const Color(0xFFFF6A00), const Color(0xFFFFCC33), Icons.local_fire_department_outlined),
      _ActivityData(localized(cn, '直播间', 'Live'), localized(cn, '边看边买', 'Shop while watching'),
          const Color(0xFFFE2C55), const Color(0xFFFF8A5B), Icons.live_tv_outlined),
      _ActivityData(localized(cn, '会员日', 'Member Day'), localized(cn, '领 ¥200 券包', '¥200 coupon pack'),
          const Color(0xFF6A11CB), const Color(0xFFB388FF), Icons.workspace_premium_outlined),
    ];
    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 0),
      child: Row(
        children: items
            .map(
              (d) => Expanded(
                child: GestureDetector(
                  onTap: () => onTap(items.indexOf(d)),
                  child: Container(
                    height: 60,
                    margin: EdgeInsets.only(right: d == items.last ? 0 : 8),
                    padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(10),
                      gradient: LinearGradient(colors: [d.from, d.to]),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(d.title,
                                  style: const TextStyle(
                                      color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700)),
                              const SizedBox(height: 2),
                              Text(d.subtitle,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 10)),
                            ],
                          ),
                        ),
                        Icon(d.icon, color: Colors.white.withValues(alpha: 0.9), size: 22),
                      ],
                    ),
                  ),
                ),
              ),
            )
            .toList(),
      ),
    );
  }
}

class _ActivityData {
  final String title;
  final String subtitle;
  final Color from;
  final Color to;
  final IconData icon;

  const _ActivityData(this.title, this.subtitle, this.from, this.to, this.icon);
}

/// 限时秒杀楼层：整点场次轮换 + 真实倒计时 + 抢购进度条
class _FlashSaleFloor extends StatefulWidget {
  const _FlashSaleFloor();

  @override
  State<_FlashSaleFloor> createState() => _FlashSaleFloorState();
}

class _FlashSaleFloorState extends State<_FlashSaleFloor> {
  Timer? _timer;
  Duration _left = Duration.zero;

  @override
  void initState() {
    super.initState();
    _tick();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  /// 下一场次结束时间：每 2 小时一场（10:00 / 12:00 / …）
  DateTime get _sessionEnd {
    final now = DateTime.now();
    final hour = now.hour + (2 - now.hour % 2);
    return DateTime(now.year, now.month, now.day).add(Duration(hours: hour));
  }

  void _tick() {
    if (!mounted) return;
    final left = _sessionEnd.difference(DateTime.now());
    setState(() => _left = left.isNegative ? Duration.zero : left);
  }

  static String _pad(int n) => n.toString().padLeft(2, '0');

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    final brand = Brand.of(appState.flavor);
    final picks = [...Mock.products]..sort((a, b) => b.salesMonthly.compareTo(a.salesMonthly));
    final list = picks.take(6).toList();
    final now = DateTime.now();
    final sessionHour = now.hour - now.hour % 2;

    return Container(
      margin: const EdgeInsets.fromLTRB(10, 10, 10, 0),
      padding: const EdgeInsets.fromLTRB(12, 12, 0, 12),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.bolt, size: 18, color: Color(0xFFFFB300)),
              const SizedBox(width: 4),
              Text(
                localized(cn, '限时秒杀', 'Flash sale'),
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
              ),
              const SizedBox(width: 6),
              Text(
                '${_pad(sessionHour)}:00 ${localized(cn, '场', 'session')}',
                style: TextStyle(fontSize: 11, color: brand.shop, fontWeight: FontWeight.w600),
              ),
              const Spacer(),
              Text(
                localized(cn, '本场还剩', 'Ends in'),
                style: const TextStyle(fontSize: 11, color: Color(0xFF9E9E9E)),
              ),
              const SizedBox(width: 4),
              Row(
                children: [
                  _timeBox(_pad(_left.inHours % 24)),
                  const Text(':', style: TextStyle(fontSize: 11, color: Color(0xFF9E9E9E))),
                  _timeBox(_pad(_left.inMinutes % 60)),
                  const Text(':', style: TextStyle(fontSize: 11, color: Color(0xFF9E9E9E))),
                  _timeBox(_pad(_left.inSeconds % 60)),
                ],
              ),
              const SizedBox(width: 6),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 148,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.only(right: 12),
              itemCount: list.length,
              separatorBuilder: (_, _) => const SizedBox(width: 10),
              itemBuilder: (context, i) => _seckillCard(context, list[i], cn, brand),
            ),
          ),
          GestureDetector(
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => CollectionPage(
                  title: '限时秒杀专场',
                  titleEn: 'Flash sale',
                  products: picks,
                  countdownTo: _sessionEnd,
                  note: '每 2 小时一场，本场商品 8 折，售完即止',
                  noteEn: 'New session every 2 hours, 20% off until sold out',
                ),
              ),
            ),
            child: Container(
              margin: const EdgeInsets.only(right: 12),
              padding: const EdgeInsets.symmetric(vertical: 8),
              decoration: BoxDecoration(
                border: Border(top: BorderSide(color: Theme.of(context).dividerColor)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    localized(cn, '查看全部秒杀商品', 'View all flash deals'),
                    style: TextStyle(fontSize: 12, color: brand.shop, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(width: 2),
                  Icon(Icons.chevron_right, size: 14, color: brand.shop),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _timeBox(String text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
        decoration: BoxDecoration(
          color: const Color(0xFF2C2C2C),
          borderRadius: BorderRadius.circular(3),
        ),
        child: Text(
          text,
          style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
        ),
      );

  Widget _seckillCard(BuildContext context, Product p, bool cn, Brand brand) {
    final ratio = (p.sold / 30000).clamp(0.42, 0.96);
    final seckill = (p.price * 0.8);
    return GestureDetector(
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => ProductPage(product: p)),
      ),
      child: SizedBox(
        width: 92,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 92,
              height: 92,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(10),
                gradient: LinearGradient(colors: [p.seed.a, p.seed.b]),
              ),
              clipBehavior: Clip.antiAlias,
              child: Stack(
                children: [
                  Positioned.fill(
                    child: p.cover.isEmpty
                        ? const SizedBox()
                        : Image.asset(
                            p.cover,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => const SizedBox(),
                          ),
                  ),
                  Positioned(
                    left: 0,
                    top: 0,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                      decoration: BoxDecoration(
                        color: brand.shop,
                        borderRadius: const BorderRadius.only(
                          topLeft: Radius.circular(10),
                          bottomRight: Radius.circular(6),
                        ),
                      ),
                      child: Text(
                        localized(cn, '秒杀', 'Flash'),
                        style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '¥${seckill.toStringAsFixed(0)}',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: brand.shop),
            ),
            Text(
              '¥${p.price.toStringAsFixed(0)}',
              style: const TextStyle(
                fontSize: 10,
                color: Color(0xFF9E9E9E),
                decoration: TextDecoration.lineThrough,
              ),
            ),
            const SizedBox(height: 3),
            Stack(
              children: [
                Container(
                  height: 12,
                  decoration: BoxDecoration(
                    color: brand.shop.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(6),
                  ),
                ),
                FractionallySizedBox(
                  widthFactor: ratio,
                  child: Container(
                    height: 12,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(colors: [brand.shop, Color.lerp(brand.shop, Colors.white, 0.35)!]),
                      borderRadius: BorderRadius.circular(6),
                    ),
                  ),
                ),
                Positioned.fill(
                  child: Center(
                    child: Text(
                      localized(cn, '已抢${(ratio * 100).toInt()}%', '${(ratio * 100).toInt()}% claimed'),
                      style: const TextStyle(fontSize: 8, color: Colors.white, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// 平台券：从商品券包聚合去重，用于领券中心楼层
class _CouponInfo {
  final String raw;
  final String value; // '¥10' / '5折'
  final String rule;

  const _CouponInfo({required this.raw, required this.value, required this.rule});

  static List<_CouponInfo> platform() {
    final seen = <String>{};
    final out = <_CouponInfo>[];
    for (final p in Mock.products) {
      for (final c in p.coupons) {
        if (c.isEmpty || !seen.add(c)) continue;
        out.add(_parse(c));
        if (out.length >= 6) return out;
      }
    }
    return out;
  }

  static _CouponInfo _parse(String raw) {
    final off = RegExp(r'减\s?(\d+(?:\.\d+)?)').firstMatch(raw);
    final full = RegExp(r'满\s?(\d+(?:\.\d+)?)').firstMatch(raw);
    final rule = full != null ? localized(true, '满${full.group(1)}元可用', 'Over ¥${full.group(1)}') : '';
    if (off != null) {
      return _CouponInfo(
        raw: raw,
        value: '¥${off.group(1)}',
        rule: rule.isEmpty ? localized(true, '无门槛券', 'No threshold') : rule,
      );
    }
    if (raw.contains('半价')) {
      return _CouponInfo(raw: raw, value: localized(true, '5折', '50% off'), rule: rule);
    }
    if (raw.contains('送一') || raw.contains('买二')) {
      return _CouponInfo(raw: raw, value: localized(true, '买二送一', 'Buy 2 get 1'), rule: rule);
    }
    return _CouponInfo(raw: raw, value: raw, rule: rule);
  }
}

/// 单张券卡
class _CouponTile extends StatelessWidget {
  final _CouponInfo coupon;
  final bool claimed;
  final VoidCallback onClaim;

  const _CouponTile({required this.coupon, required this.claimed, required this.onClaim});

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    return Container(
      width: 146,
      height: 64,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        gradient: const LinearGradient(colors: [Color(0xFFFF5F6D), Color(0xFFFF9966)]),
        boxShadow: [
          BoxShadow(color: const Color(0xFFFF5F6D).withValues(alpha: 0.25), blurRadius: 8, offset: const Offset(0, 3)),
        ],
      ),
      child: Row(
        children: [
          SizedBox(
            width: 84,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                coupon.value.startsWith('¥')
                    ? Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          const Text('¥',
                              style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
                          Text(
                            coupon.value.substring(1),
                            style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800),
                          ),
                        ],
                      )
                    : Text(
                        coupon.value,
                        style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w800),
                      ),
                const SizedBox(height: 2),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Text(
                    coupon.rule,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 9),
                  ),
                ),
              ],
            ),
          ),
          Container(width: 1, height: 40, color: Colors.white.withValues(alpha: 0.45)),
          Expanded(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: claimed ? null : onClaim,
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                  decoration: BoxDecoration(
                    color: claimed ? Colors.white.withValues(alpha: 0.25) : Colors.white,
                    borderRadius: BorderRadius.circular(11),
                  ),
                  child: Text(
                    claimed
                        ? localized(cn, '去使用', 'Use')
                        : localized(cn, '领取', 'Get'),
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: claimed ? Colors.white : const Color(0xFFFF5F6D),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// 领券中心楼层
class _CouponFloor extends StatelessWidget {
  final Set<String> claimed;
  final ValueChanged<String> onClaim;

  const _CouponFloor({required this.claimed, required this.onClaim});

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    final brand = Brand.of(appState.flavor);
    final coupons = _CouponInfo.platform();
    if (coupons.isEmpty) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.fromLTRB(10, 10, 10, 0),
      padding: const EdgeInsets.fromLTRB(12, 12, 0, 12),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.confirmation_num_outlined, size: 17, color: brand.shop),
              const SizedBox(width: 5),
              Text(
                localized(cn, '领券中心', 'Coupon center'),
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
              ),
              const SizedBox(width: 6),
              Text(
                localized(cn, '每日 0 点更新', 'Refreshed daily'),
                style: const TextStyle(fontSize: 10, color: Color(0xFF9E9E9E)),
              ),
              const Spacer(),
              Text(localized(cn, '我的券 >', 'My coupons >'),
                  style: const TextStyle(fontSize: 11, color: Color(0xFF9E9E9E))),
              const SizedBox(width: 12),
            ],
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 64,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.only(right: 12),
              itemCount: coupons.length,
              separatorBuilder: (_, _) => const SizedBox(width: 10),
              itemBuilder: (context, i) => _CouponTile(
                coupon: coupons[i],
                claimed: claimed.contains(coupons[i].raw),
                onClaim: () => onClaim(coupons[i].raw),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// 吸顶筛选栏：类目 + 排序
class _FilterBarDelegate extends SliverPersistentHeaderDelegate {
  final bool cn;
  final String category;
  final String sort;
  final String sortLabel;
  final ValueChanged<String> onCategory;
  final ValueChanged<String> onSort;

  const _FilterBarDelegate({
    required this.cn,
    required this.category,
    required this.sort,
    required this.sortLabel,
    required this.onCategory,
    required this.onSort,
  });

  @override
  double get minExtent => 46;

  @override
  double get maxExtent => 46;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final brand = Brand.of(appState.flavor);
    return Material(
      color: dark ? const Color(0xFF17212B) : const Color(0xFFF7F8FA),
      elevation: shrinkOffset > 4 ? 1 : 0,
      child: SizedBox(
        height: 46,
        child: Row(
          children: [
            Expanded(
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                children: ShopCategory.goods.map((id) {
                  final c = ShopCategory.of(id);
                  final active = c.id == category;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: GestureDetector(
                      onTap: () => onCategory(c.id),
                      child: Container(
                        height: 30,
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: active ? brand.shop.withValues(alpha: 0.1) : (dark ? const Color(0xFF101921) : Colors.white),
                          borderRadius: BorderRadius.circular(15),
                          border: Border.all(color: active ? brand.shop : (dark ? const Color(0xFF243040) : const Color(0xFFE6E9EF))),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (active) ...[
                              Icon(Icons.check, size: 12, color: brand.shop),
                              const SizedBox(width: 3),
                            ],
                            Text(
                              c.displayName(cn),
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: active ? FontWeight.w700 : FontWeight.w400,
                                color: active ? brand.shop : (dark ? Colors.white70 : const Color(0xFF4A4A4A)),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
            PopupMenuButton<String>(
              onSelected: onSort,
              padding: const EdgeInsets.only(right: 10),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(sortLabel, style: const TextStyle(fontSize: 12)),
                  const Icon(Icons.swap_vert, size: 15),
                ],
              ),
              itemBuilder: (_) => [
                PopupMenuItem(value: 'default', child: Text(localized(cn, '综合排序', 'Recommended'))),
                PopupMenuItem(value: 'sales', child: Text(localized(cn, '销量优先', 'Top sales'))),
                PopupMenuItem(value: 'priceAsc', child: Text(localized(cn, '价格从低到高', 'Price low to high'))),
                PopupMenuItem(value: 'priceDesc', child: Text(localized(cn, '价格从高到低', 'Price high to low'))),
                PopupMenuItem(value: 'rating', child: Text(localized(cn, '评分最高', 'Best rated'))),
              ],
            ),
          ],
        ),
      ),
    );
  }

  @override
  bool shouldRebuild(covariant _FilterBarDelegate oldDelegate) =>
      oldDelegate.category != category ||
      oldDelegate.sort != sort ||
      oldDelegate.sortLabel != sortLabel ||
      oldDelegate.cn != cn;
}

/// 瀑布流商品卡：图 1:1 + 卖点 + 券 + 价格 + 店铺 + 评分，右下角快捷加购
/// 商品卡（首页瀑布流与所有集合子页共用）
class ProductCard extends StatelessWidget {
  final Product product;
  final bool cn;

  const ProductCard({super.key, required this.product, required this.cn});

  /// 折扣标签：原价存在时计算折扣，如 8.9 折
  String get _discount {
    if (product.origin <= product.price) return '';
    final d = product.price / product.origin * 10;
    return '${d.toStringAsFixed(1)}折';
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final brand = Brand.of(appState.flavor);
    final discount = _discount;
    return InkWell(
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ProductPage(product: product))),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        decoration: BoxDecoration(
          color: Theme.of(context).cardColor,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(color: Colors.black.withValues(alpha: dark ? 0.2 : 0.04), blurRadius: 8),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Stack(
              children: [
                AspectRatio(
                  aspectRatio: 1,
                  child: Container(
                    decoration: BoxDecoration(gradient: LinearGradient(colors: [product.seed.a, product.seed.b])),
                    child: product.cover.isEmpty
                        ? null
                        : Image.asset(
                            product.cover,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => const SizedBox(),
                          ),
                  ),
                ),
                if (product.tag.isNotEmpty)
                  Positioned(
                    left: 6,
                    top: 6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(colors: [brand.shop, Color.lerp(brand.shop, Colors.white, 0.3)!]),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(product.tag, style: const TextStyle(color: Colors.white, fontSize: 10)),
                    ),
                  ),
                if (product.videoId.isNotEmpty)
                  Positioned(
                    right: 6,
                    top: 6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.35),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.play_arrow_rounded, color: Colors.white, size: 11),
                          Text('视频', style: TextStyle(color: Colors.white, fontSize: 9)),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(8, 7, 8, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      product.displayTitle(cn),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13,
                        height: 1.32,
                        color: dark ? Colors.white : const Color(0xFF1A1A1A),
                      ),
                    ),
                    if (product.coupons.isNotEmpty) ...[
                      const SizedBox(height: 5),
                      Wrap(
                        spacing: 4,
                        children: product.coupons
                            .take(2)
                            .map(
                              (c) => Container(
                                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                                decoration: BoxDecoration(
                                  color: brand.shop.withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(3),
                                  border: Border.all(color: brand.shop.withValues(alpha: 0.35)),
                                ),
                                child: Text(
                                  c,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(fontSize: 9, color: brand.shop),
                                ),
                              ),
                            )
                            .toList(),
                      ),
                    ],
                    const Spacer(),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          '¥${product.price.toStringAsFixed(2)}',
                          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: brand.shop),
                        ),
                        if (product.origin > 0) ...[
                          const SizedBox(width: 4),
                          Text(
                            '¥${product.origin.toStringAsFixed(0)}',
                            style: const TextStyle(
                              fontSize: 10,
                              color: Color(0xFF9E9E9E),
                              decoration: TextDecoration.lineThrough,
                            ),
                          ),
                        ],
                        if (discount.isNotEmpty) ...[
                          const SizedBox(width: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 1),
                            decoration: BoxDecoration(
                              color: const Color(0xFFFFF1EC),
                              borderRadius: BorderRadius.circular(3),
                            ),
                            child: Text(
                              discount,
                              style: const TextStyle(fontSize: 9, color: Color(0xFFFF5000), fontWeight: FontWeight.w600),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            product.displayShop(cn),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 10, color: dark ? const Color(0xFF7A8A99) : const Color(0xFF9E9E9E)),
                          ),
                        ),
                        const Icon(Icons.star_rounded, size: 11, color: Color(0xFFFF9800)),
                        const SizedBox(width: 1),
                        Text(
                          product.rating.toStringAsFixed(1),
                          style: const TextStyle(fontSize: 10, color: Color(0xFFFF9800)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            localized(cn, '${product.salesMonthly} 人已买', '${product.salesMonthly} sold'),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 10, color: dark ? const Color(0xFF7A8A99) : const Color(0xFF9E9E9E)),
                          ),
                        ),
                        GestureDetector(
                          onTap: () {
                            appState.addToCart(product);
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(localized(cn, '已加入购物车', 'Added to cart')),
                                duration: const Duration(seconds: 1),
                                behavior: SnackBarBehavior.floating,
                              ),
                            );
                          },
                          child: Container(
                            width: 22,
                            height: 22,
                            decoration: BoxDecoration(
                              color: brand.shop,
                              borderRadius: BorderRadius.circular(11),
                            ),
                            child: const Icon(Icons.add_shopping_cart, size: 13, color: Colors.white),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ============================================================
// 商品详情（淘宝式：价格区 / SKU / 评价 / 店铺 / 服务）
// ============================================================
class ProductPage extends StatefulWidget {
  final Product product;
  final OrderSource source;
  final String? videoId;
  final String? videoTitle;

  const ProductPage({
    super.key,
    required this.product,
    this.source = OrderSource.mall,
    this.videoId,
    this.videoTitle,
  });

  @override
  State<ProductPage> createState() => _ProductPageState();
}

class _ProductPageState extends State<ProductPage> {
  String _spec = '';
  int _quantity = 1;

  @override
  void initState() {
    super.initState();
    _spec = widget.product.specOptions.isEmpty ? (appState.flavor.isCn ? '默认规格' : 'Default') : widget.product.specOptions.first;
  }

  Future<void> _buyNow() async {
    final order = await appState.createOrderFromProduct(
      widget.product,
      source: widget.source,
      videoId: widget.videoId,
      videoTitle: widget.videoTitle,
      quantity: _quantity,
    );
    if (!mounted) return;
    final ok = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => CheckoutPage(
          orderId: order.id,
          amount: order.total,
          title: '${widget.product.shop} · ${widget.product.title}',
        ),
      ),
    );
    if (ok == true && mounted) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => OrderDetailPage(orderId: order.id)),
      );
    }
  }

  void _addCart() {
    appState.addToCart(widget.product);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(appState.flavor.isCn ? '已加入购物车' : 'Added to cart'),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  /// 联系商城客服（会话 s4「寰宇商城客服」）
  void _openService(BuildContext context) {
    final s = Mock.sessions.firstWhere((x) => x.id == 's4', orElse: () => Mock.sessions.first);
    Navigator.push(context, MaterialPageRoute(builder: (_) => ChatPage(session: s)));
  }

  /// 进店逛逛：同店铺商品集合页
  void _openShop(BuildContext context, Product p) {
    final list = Mock.products.where((x) => x.shop == p.shop).toList();
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CollectionPage(
          title: p.displayShop(true),
          titleEn: p.displayShop(false),
          products: list,
          searchable: true,
          hint: '店内搜索',
          hintEn: 'Search in store',
          note: '共 ${list.length} 件在售 · 描述 ${p.rating.toStringAsFixed(1)} · 服务 4.9 · 物流 4.8',
          noteEn: '${list.length} on sale · rating ${p.rating.toStringAsFixed(1)}',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final brand = Brand.of(appState.flavor);
    final p = widget.product;

    return Scaffold(
      appBar: AppBar(
        title: Text(cn ? '商品详情' : 'Product'),
        leading: const AppBackButton(),
        leadingWidth: 44,
        actions: [
          IconButton(
            icon: const Icon(Icons.share_outlined),
            onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(cn ? '商品链接已复制' : 'Link copied'),
                duration: const Duration(seconds: 1),
                behavior: SnackBarBehavior.floating,
              ),
            ),
          ),
        ],
      ),
      body: Stack(
        children: [
          ListView(
            padding: const EdgeInsets.only(bottom: 80),
            children: [
              // 主图
              Container(
                height: 300,
                decoration: BoxDecoration(gradient: LinearGradient(colors: [p.seed.a, p.seed.b])),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Positioned.fill(
                      child: p.cover.isEmpty
                          ? const SizedBox()
                          : Image.asset(p.cover, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox()),
                    ),
                    if (widget.source != OrderSource.mall)
                      Positioned(
                        left: 12,
                        top: 12,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.4),
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: Text(
                            widget.source == OrderSource.live
                                ? (cn ? '来自直播间' : 'From live')
                                : (cn ? '来自短视频' : 'From video'),
                            style: const TextStyle(color: Colors.white, fontSize: 11),
                          ),
                        ),
                      ),
                    Positioned(
                      right: 12,
                      bottom: 12,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.4),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: const Text('1/5', style: TextStyle(color: Colors.white, fontSize: 11)),
                      ),
                    ),
                  ],
                ),
              ),
              // 价格区
              Container(
                color: Theme.of(context).cardColor,
                padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text('¥${p.price.toStringAsFixed(2)}',
                            style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: brand.shop)),
                        const SizedBox(width: 8),
                        if (p.origin > 0)
                          Text('¥${p.origin.toStringAsFixed(0)}',
                              style: const TextStyle(
                                  fontSize: 13, color: Color(0xFF9E9E9E), decoration: TextDecoration.lineThrough)),
                        const Spacer(),
                        Column(
                          children: [
                            const Icon(Icons.favorite_border, size: 18),
                            Text(cn ? '收藏' : 'Save', style: const TextStyle(fontSize: 10)),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    if (p.coupons.isNotEmpty)
                      Wrap(
                        spacing: 6,
                        children: p.coupons
                            .map((c) => Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    border: Border.all(color: brand.shop.withValues(alpha: 0.5)),
                                    borderRadius: BorderRadius.circular(3),
                                  ),
                                  child: Text(c, style: TextStyle(fontSize: 10, color: brand.shop)),
                                ))
                            .toList(),
                      ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Text('★★★★★ ${p.rating}', style: const TextStyle(fontSize: 12, color: Color(0xFFFF9800))),
                        const SizedBox(width: 6),
                        Text(cn ? '${p.reviewCount} 条评价' : '${p.reviewCount} reviews',
                            style: const TextStyle(fontSize: 12, color: Color(0xFF9E9E9E))),
                        const SizedBox(width: 12),
                        Text(cn ? '月销 ${p.salesMonthly}' : '${p.salesMonthly}/mo',
                            style: const TextStyle(fontSize: 12, color: Color(0xFF9E9E9E))),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Text(
                      p.displayTitle(cn),
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, height: 1.45),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      cn
                          ? '发货地 ${p.address} | ${p.freight == 0 ? '包邮' : '运费 ¥${p.freight.toStringAsFixed(0)}'}'
                          : 'Ships from ${p.address} | ${p.freight == 0 ? 'free shipping' : 'shipping ¥${p.freight.toStringAsFixed(0)}'}',
                      style: TextStyle(fontSize: 11, color: dark ? const Color(0xFF7A8A99) : const Color(0xFF9E9E9E)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              // 服务 + 规格
              Container(
                color: Theme.of(context).cardColor,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Text(cn ? '选择' : 'Select', style: const TextStyle(fontSize: 13, color: Color(0xFF9E9E9E))),
                        const SizedBox(width: 14),
                        Expanded(child: Text(_spec, style: const TextStyle(fontSize: 13))),
                        InkWell(
                          onTap: () => _openSku(context),
                          child: Row(
                            children: [
                              const Icon(Icons.tune, size: 16, color: Color(0xFF9E9E9E)),
                              const SizedBox(width: 4),
                              Text(cn ? '选规格' : 'Options', style: const TextStyle(fontSize: 13)),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const Divider(height: 20),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(cn ? '服务' : 'Service', style: const TextStyle(fontSize: 13, color: Color(0xFF9E9E9E))),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Text(
                            cn ? '七天无理由退货 · 正品保障 · 极速退款 · 运费险' : '7-day return · authentic · fast refund',
                            style: const TextStyle(fontSize: 12, height: 1.5),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              // 宝贝亮点
              Container(
                color: Theme.of(context).cardColor,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(cn ? '宝贝亮点' : 'Highlights', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    ...p.highlights.map(
                      (h) => Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          children: [
                            Icon(Icons.check_circle, size: 14, color: brand.shop),
                            const SizedBox(width: 6),
                            Expanded(child: Text(h, style: const TextStyle(fontSize: 12))),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              // 店铺
              Container(
                color: Theme.of(context).cardColor,
                padding: const EdgeInsets.all(14),
                child: Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(6),
                        gradient: LinearGradient(colors: [p.seed.a, p.seed.b]),
                      ),
                      child: p.cover.isEmpty
                          ? null
                          : Image.asset(p.cover, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox()),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(p.displayShop(cn), style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                          const SizedBox(height: 3),
                          Text(
                            cn
                                ? '描述 ${p.rating} · 服务 4.9 · 物流 4.8 · 粉丝 ${p.sold}'
                                : 'Rating ${p.rating} · Service 4.9 · Shipping 4.8',
                            style: const TextStyle(fontSize: 11, color: Color(0xFF9E9E9E)),
                          ),
                        ],
                      ),
                    ),
                    OutlinedButton(
                      onPressed: () => _openShop(context, p),
                      style: OutlinedButton.styleFrom(minimumSize: const Size(72, 30), padding: EdgeInsets.zero),
                      child: Text(cn ? '进店逛逛' : 'Visit', style: const TextStyle(fontSize: 12)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              // 评价
              Container(
                color: Theme.of(context).cardColor,
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (p.desc.isNotEmpty) ...[
                      Text(cn ? '商品描述' : 'Description',
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 8),
                      Text(p.displayDesc(cn), style: const TextStyle(fontSize: 13, height: 1.6)),
                      if (p.detail.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        ...p.detail.map((d) => Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text('- $d', style: const TextStyle(fontSize: 12, height: 1.5)),
                            )),
                      ],
                      const SizedBox(height: 14),
                    ],
                    Row(
                      children: [
                        Text(
                          cn ? '宝贝评价 (${p.reviewCount})' : 'Reviews (${p.reviewCount})',

                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                        ),
                        const Spacer(),
                        Text(cn ? '好评率 98% >' : '98% positive >',
                            style: const TextStyle(fontSize: 12, color: Color(0xFF9E9E9E))),
                      ],
                    ),
                    const SizedBox(height: 10),
                    ...Mock.reviews.map((r) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Text('${r['user']}', style: const TextStyle(fontSize: 12)),
                                  const SizedBox(width: 6),
                                  Text('★${(r['rating'] as double).toStringAsFixed(1)}',
                                      style: const TextStyle(fontSize: 11, color: Color(0xFFFF9800))),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Text('${r['text']}', style: const TextStyle(fontSize: 13, height: 1.45)),
                              if ((r['replies'] as List).isNotEmpty) ...[
                                const SizedBox(height: 6),
                                Container(
                                  padding: const EdgeInsets.all(8),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFF5F6F7).withValues(alpha: dark ? 0.1 : 1),
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    cn ? '店小二回复：${(r['replies'] as List).first}' : 'Shop replied: ${(r['replies'] as List).first}',
                                    style: const TextStyle(fontSize: 11, color: Color(0xFF8A8A8A), height: 1.45),
                                  ),
                                ),
                              ],
                            ],
                          ),
                        )),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              // 推荐
              Container(
                color: Theme.of(context).cardColor,
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(cn ? '为你推荐' : 'You may also like',
                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 10),
                    SizedBox(
                      height: 150,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: Mock.products.where((e) => e.id != p.id).toList().length,
                        separatorBuilder: (_, _) => const SizedBox(width: 10),
                        itemBuilder: (context, i) {
                          final rp = Mock.products.where((e) => e.id != p.id).toList()[i];
                          return GestureDetector(
                            onTap: () => Navigator.push(
                              context,
                              MaterialPageRoute(builder: (_) => ProductPage(product: rp)),
                            ),
                            child: SizedBox(
                              width: 100,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Container(
                                    height: 96,
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(8),
                                      gradient: LinearGradient(colors: [rp.seed.a, rp.seed.b]),
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    rp.displayTitle(cn),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(fontSize: 11),
                                  ),
                                  Text('¥${rp.price.toStringAsFixed(0)}',
                                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: brand.shop)),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          // 底部操作栏
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              height: 56,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                color: Theme.of(context).cardColor,
                border: Border(top: BorderSide(color: Theme.of(context).dividerColor)),
              ),
              child: Row(
                children: [
                  _BarIcon(icon: Icons.headset_mic_outlined, label: cn ? '客服' : 'Chat', onTap: () => _openService(context)),
                  _BarIcon(icon: Icons.storefront_outlined, label: cn ? '店铺' : 'Shop', onTap: () => _openShop(context, p)),
                  ListenableBuilder(
                    listenable: appState,
                    builder: (context, _) => Badge(
                      isLabelVisible: appState.cartCount > 0,
                      label: Text('${appState.cartCount}'),
                      child: _BarIcon(
                        icon: Icons.shopping_cart_outlined,
                        label: cn ? '购物车' : 'Cart',
                        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CartPage())),
                      ),
                    ),
                  ),
                  const Spacer(),
                  Expanded(
                    flex: 4,
                    child: FilledButton.tonal(
                      onPressed: _addCart,
                      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(40)),
                      child: Text(cn ? '加入购物车' : 'Add to cart', style: const TextStyle(fontSize: 13)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    flex: 4,
                    child: FilledButton(
                      onPressed: _buyNow,
                      style: FilledButton.styleFrom(
                        backgroundColor: brand.shop,
                        minimumSize: const Size.fromHeight(40),
                      ),
                      child: Text(cn ? '立即购买' : 'Buy now', style: const TextStyle(fontSize: 13)),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _openSku(BuildContext context) {
    final cn = appState.flavor.isCn;
    final p = widget.product;
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => StatefulBuilder(
        builder: (ctx, setSheet) {
          String spec = _spec;
          int qty = _quantity;
          return Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Theme.of(ctx).cardColor,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(8),
                        gradient: LinearGradient(colors: [p.seed.a, p.seed.b]),
                      ),
                      child: p.cover.isEmpty
                          ? null
                          : Image.asset(p.cover, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox()),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('¥${p.price.toStringAsFixed(2)}',
                              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: Brand.of(appState.flavor).shop)),
                          const SizedBox(height: 4),
                          Text(cn ? '库存充足' : 'In stock', style: const TextStyle(fontSize: 12, color: Color(0xFF9E9E9E))),
                          const SizedBox(height: 4),
                          Text('${cn ? '已选' : 'Selected'}: $spec',
                              style: const TextStyle(fontSize: 12)),
                        ],
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.pop(ctx),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                if (p.specOptions.isNotEmpty) ...[
                  Text(p.specs.isNotEmpty ? p.specs.first : (cn ? '规格' : 'Option'),
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    children: p.specOptions
                        .map((s) => ChoiceChip(
                              label: Text(s, style: const TextStyle(fontSize: 12)),
                              selected: s == spec,
                              onSelected: (_) => setSheet(() => spec = s),
                            ))
                        .toList(),
                  ),
                  const SizedBox(height: 16),
                ],
                Row(
                  children: [
                    Text(cn ? '数量' : 'Qty', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    const Spacer(),
                    _Stepper(
                      value: qty,
                      onChanged: (v) => setSheet(() => qty = v),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    style: FilledButton.styleFrom(backgroundColor: Brand.of(appState.flavor).shop),
                    onPressed: () {
                      setState(() {
                        _spec = spec;
                        _quantity = qty;
                      });
                      for (int i = 0; i < qty; i++) {
                        appState.addToCart(p);
                      }
                      Navigator.pop(ctx);
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(cn ? '已加入购物车' : 'Added to cart'),
                          behavior: SnackBarBehavior.floating,
                        ),
                      );
                    },
                    child: Text(cn ? '确定' : 'Confirm'),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _BarIcon extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _BarIcon({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        child: SizedBox(
          width: 52,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 20),
              Text(label, style: const TextStyle(fontSize: 10)),
            ],
          ),
        ),
      );
}

class _Stepper extends StatelessWidget {
  final int value;
  final ValueChanged<int> onChanged;

  const _Stepper({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) => Row(
        children: [
          IconButton(
            icon: const Icon(Icons.remove_circle_outline, size: 22),
            onPressed: value > 1 ? () => onChanged(value - 1) : null,
          ),
          Text('$value', style: const TextStyle(fontSize: 15)),
          IconButton(
            icon: const Icon(Icons.add_circle_outline, size: 22),
            onPressed: () => onChanged(value + 1),
          ),
        ],
      );
}

// ============================================================
// 购物车
// ============================================================
class CartPage extends StatelessWidget {
  const CartPage({super.key});

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    final brand = Brand.of(appState.flavor);
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      appBar: AppBar(
        title: Text(cn ? '购物车' : 'Cart'),
        leading: const AppBackButton(),
        leadingWidth: 44,
        actions: [
          TextButton(
            onPressed: () => appState.clearCart(),
            child: Text(cn ? '清空' : 'Clear'),
          ),
        ],
      ),
      body: ListenableBuilder(
        listenable: appState,
        builder: (context, _) {
          if (appState.cart.isEmpty) {
            return EmptyView(
              icon: Icons.shopping_cart_outlined,
              title: cn ? '购物车还是空的' : 'Your cart is empty',
              subtitle: cn ? '去逛逛直播间同款好物' : 'Check our live shopping deals',
              action: FilledButton(
                onPressed: () => Navigator.pop(context),
                child: Text(cn ? '去逛逛' : 'Browse'),
              ),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(12),
            itemCount: appState.cart.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (context, i) {
              final p = appState.cart[i];
              return Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Theme.of(context).cardColor,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 76,
                      height: 76,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(8),
                        gradient: LinearGradient(colors: [p.seed.a, p.seed.b]),
                      ),
                      child: p.cover.isEmpty
                          ? null
                          : Image.asset(p.cover, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox()),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: SizedBox(
                        height: 76,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    p.displayTitle(cn),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(fontSize: 13, height: 1.35),
                                  ),
                                ),
                                IconButton(
                                  icon: const Icon(Icons.delete_outline, size: 18),
                                  onPressed: () => appState.removeFromCart(p.id),
                                ),
                              ],
                            ),
                            Row(
                              children: [
                                Text(
                                  '¥${p.price.toStringAsFixed(2)}',
                                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: brand.shop),
                                ),
                                const Spacer(),
                                _Stepper(
                                  value: p.quantity,
                                  onChanged: (v) => appState.setQuantity(p.id, v),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          );
        },
      ),
      bottomNavigationBar: SafeArea(
        child: Container(
          height: 56,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(
            color: dark ? const Color(0xFF17212B) : Colors.white,
            border: Border(top: BorderSide(color: dark ? const Color(0xFF101921) : const Color(0xFFEBEBEB))),
          ),
          child: ListenableBuilder(
            listenable: appState,
            builder: (context, _) => Row(
              children: [
                Text(
                  cn ? '合计 ' : 'Total ',
                  style: const TextStyle(fontSize: 13),
                ),
                Text(
                  '¥${appState.cartTotal.toStringAsFixed(2)}',
                  style: TextStyle(fontSize: 19, fontWeight: FontWeight.w700, color: brand.shop),
                ),
                const Spacer(),
                FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: brand.shop, minimumSize: const Size(112, 40)),
                  onPressed: appState.cartCount == 0
                      ? null
                      : () => Navigator.push(
                            context,
                            MaterialPageRoute(builder: (_) => const ConfirmOrderPage()),
                          ),
                  child: Text(cn ? '结算(${appState.cartCount})' : 'Checkout(${appState.cartCount})'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ============================================================
// 确认订单
// ============================================================
class ConfirmOrderPage extends StatefulWidget {
  const ConfirmOrderPage({super.key});

  @override
  State<ConfirmOrderPage> createState() => _ConfirmOrderPageState();
}

class _ConfirmOrderPageState extends State<ConfirmOrderPage> {
  bool _submitting = false;

  Future<void> _submit() async {
    setState(() => _submitting = true);
    final order = await appState.createOrderFromCart();
    if (!mounted) return;
    setState(() => _submitting = false);
    final ok = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => CheckoutPage(
          orderId: order.id,
          amount: order.total,
          title: '${order.shop} · ${order.items.first.title}',
        ),
      ),
    );
    if (ok == true && mounted) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => OrderDetailPage(orderId: order.id)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    final brand = Brand.of(appState.flavor);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final card = dark ? const Color(0xFF17212B) : Colors.white;

    return Scaffold(
      appBar: AppBar(
        title: Text(cn ? '确认订单' : 'Confirm order'),
        leading: const AppBackButton(),
        leadingWidth: 44,
      ),
      body: ListenableBuilder(
        listenable: appState,
        builder: (context, _) {
          final total = appState.cartTotal;
          return ListView(
            padding: const EdgeInsets.all(12),
            children: [
              // 地址
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: card, borderRadius: BorderRadius.circular(12)),
                child: Row(
                  children: [
                    Icon(Icons.location_on_outlined, color: brand.shop),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(appState.userName, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                              const SizedBox(width: 8),
                              Text('138****${appState.phoneTail}', style: const TextStyle(fontSize: 13)),
                            ],
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            '浙江省杭州市余杭区文一西路 969 号 3 号楼',
                            style: TextStyle(fontSize: 12, color: Color(0xFF9E9E9E), height: 1.4),
                          ),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right, size: 18, color: Color(0xFFCCCCCC)),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              // 商品清单
              Container(
                padding: const EdgeInsets.symmetric(vertical: 8),
                decoration: BoxDecoration(color: card, borderRadius: BorderRadius.circular(12)),
                child: Column(
                  children: [
                    for (final p in appState.cart)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        child: Row(
                          children: [
                            Container(
                              width: 64,
                              height: 64,
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(8),
                                gradient: LinearGradient(colors: [p.seed.a, p.seed.b]),
                              ),
                              child: p.cover.isEmpty
                                  ? null
                                  : Image.asset(p.cover, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox()),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    p.displayTitle(cn),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(fontSize: 13, height: 1.35),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '${p.displayShop(cn)} · x${p.quantity}',
                                    style: const TextStyle(fontSize: 11, color: Color(0xFF9E9E9E)),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '¥${(p.price * p.quantity).toStringAsFixed(2)}',
                                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: brand.shop),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              // 价格明细
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: card, borderRadius: BorderRadius.circular(12)),
                child: Column(
                  children: [
                    _PriceRow(label: cn ? '商品金额' : 'Subtotal', value: '¥${total.toStringAsFixed(2)}'),
                    _PriceRow(label: cn ? '运费' : 'Shipping', value: cn ? '包邮' : 'Free'),
                    _PriceRow(label: cn ? '优惠券' : 'Coupon', value: cn ? '-¥10.00' : '-¥10.00', highlight: true),
                    const Divider(height: 20),
                    Row(
                      children: [
                        const Spacer(),
                        Text(cn ? '实付款 ' : 'Total due ', style: const TextStyle(fontSize: 13)),
                        Text(
                          '¥${(total > 0 ? total - 10 : 0).toStringAsFixed(2)}',
                          style: TextStyle(fontSize: 19, fontWeight: FontWeight.w700, color: brand.shop),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 80),
            ],
          );
        },
      ),
      bottomNavigationBar: SafeArea(
        child: Container(
          height: 56,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(
            color: dark ? const Color(0xFF17212B) : Colors.white,
            border: Border(top: BorderSide(color: dark ? const Color(0xFF101921) : const Color(0xFFEBEBEB))),
          ),
          child: Row(
            children: [
              ListenableBuilder(
                listenable: appState,
                builder: (context, _) => Text(
                  '¥${appState.cartTotal.toStringAsFixed(2)}',
                  style: TextStyle(fontSize: 19, fontWeight: FontWeight.w700, color: brand.shop),
                ),
              ),
              const Spacer(),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: brand.shop, minimumSize: const Size(120, 40)),
                onPressed: _submitting ? null : _submit,
                child: _submitting
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : Text(cn ? '提交订单' : 'Place order'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PriceRow extends StatelessWidget {
  final String label;
  final String value;
  final bool highlight;

  const _PriceRow({required this.label, required this.value, this.highlight = false});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          children: [
            Text(label, style: const TextStyle(fontSize: 13)),
            const Spacer(),
            Text(
              value,
              style: TextStyle(
                fontSize: 13,
                color: highlight ? Brand.of(appState.flavor).shop : const Color(0xFF333333),
              ),
            ),
          ],
        ),
      );
}
