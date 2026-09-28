import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/models.dart';
import '../../state/app_state.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common.dart';
import 'shop_page.dart';

/// 商城通用「商品集合」子页
///
/// 首页所有大栏目（金刚区类目 / 活动行 / 秒杀专场 / 店铺 / 搜索结果 / 排行榜）
/// 统一落到这一页，避免"点了没反应"。入参决定标题、说明条、数据源，
/// 以及是否带搜索框、排名角标、秒杀倒计时。
class CollectionPage extends StatefulWidget {
  const CollectionPage({
    super.key,
    required this.title,
    required this.titleEn,
    required this.products,
    this.note,
    this.noteEn,
    this.searchable = false,
    this.ranked = false,
    this.countdownTo,
    this.hint,
    this.hintEn,
  });

  final String title;
  final String titleEn;
  final List<Product> products;

  /// 说明条文案（活动规则 / 会场玩法）
  final String? note;
  final String? noteEn;

  /// 是否显示搜索框（搜索入口进入时 true）
  final bool searchable;

  /// 是否显示排名角标（排行榜）
  final bool ranked;

  /// 非空则在说明条右侧显示真实倒计时（秒杀专场）
  final DateTime? countdownTo;

  /// 搜索框占位文案
  final String? hint;
  final String? hintEn;

  @override
  State<CollectionPage> createState() => _CollectionPageState();
}

class _CollectionPageState extends State<CollectionPage> {
  final TextEditingController _ctrl = TextEditingController();
  Timer? _timer;
  Duration _left = Duration.zero;
  String _sort = 'default';
  String _keyword = '';

  @override
  void initState() {
    super.initState();
    _tick();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
  }

  @override
  void dispose() {
    _timer?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  void _tick() {
    if (!mounted || widget.countdownTo == null) return;
    final left = widget.countdownTo!.difference(DateTime.now());
    setState(() => _left = left.isNegative ? Duration.zero : left);
  }

  List<Product> get _list {
    final cn = appState.flavor.isCn;
    final kw = _keyword.trim().toLowerCase();
    var list = widget.products.where((p) {
      if (kw.isEmpty) return true;
      return p.displayTitle(cn).toLowerCase().contains(kw) ||
          p.displayShop(cn).toLowerCase().contains(kw);
    }).toList();
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

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final brand = Brand.of(appState.flavor);
    final list = _list;

    return Scaffold(
      backgroundColor: dark ? const Color(0xFF0F1418) : const Color(0xFFF5F6F8),
      appBar: AppBar(
        leading: const AppBackButton(),
        titleSpacing: 0,
        title: Text(localized(cn, widget.title, widget.titleEn)),
        actions: [
          IconButton(
            icon: const Icon(Icons.shopping_cart_outlined),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const CartPage()),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          if (widget.searchable) _searchField(cn, dark),
          _sortBar(cn, brand),
          if (widget.note != null) _noteBar(cn, brand),
          Expanded(
            child: list.isEmpty
                ? EmptyView(
                    icon: Icons.shopping_bag_outlined,
                    title: localized(cn, '没有找到相关商品', 'No products found'),
                    subtitle: localized(cn, '换个关键词或类目看看', 'Try another keyword'),
                  )
                : GridView.builder(
                    padding: const EdgeInsets.fromLTRB(10, 10, 10, 24),
                    itemCount: list.length,
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      mainAxisSpacing: 10,
                      crossAxisSpacing: 10,
                      childAspectRatio: 0.58,
                    ),
                    itemBuilder: (context, i) {
                      final card = ProductCard(product: list[i], cn: cn);
                      if (!widget.ranked) return card;
                      return Stack(
                        children: [
                          card,
                          Positioned(left: 0, top: 0, child: _rankBadge(i, brand)),
                        ],
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _searchField(bool cn, bool dark) {
    return Container(
      color: Theme.of(context).cardColor,
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
      child: TextField(
        controller: _ctrl,
        autofocus: true,
        textInputAction: TextInputAction.search,
        onChanged: (v) => setState(() => _keyword = v),
        decoration: InputDecoration(
          hintText: localized(cn, widget.hint ?? '搜索商品 / 店铺', widget.hintEn ?? 'Search products'),
          hintStyle: const TextStyle(fontSize: 13),
          prefixIcon: const Icon(Icons.search, size: 18),
          suffixIcon: _keyword.isEmpty
              ? null
              : IconButton(
                  icon: const Icon(Icons.close, size: 16),
                  onPressed: () {
                    _ctrl.clear();
                    setState(() => _keyword = '');
                  },
                ),
          isDense: true,
          filled: true,
          fillColor: dark ? const Color(0xFF17212B) : const Color(0xFFF2F3F5),
          contentPadding: const EdgeInsets.symmetric(vertical: 8),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(17),
            borderSide: BorderSide.none,
          ),
        ),
      ),
    );
  }

  /// 排序条：与首页筛选栏口径一致
  Widget _sortBar(bool cn, Brand brand) {
    final items = <(String, String)>[
      ('default', localized(cn, '综合', 'All')),
      ('sales', localized(cn, '销量', 'Sales')),
      ('priceAsc', localized(cn, '价格↑', 'Price↑')),
      ('rating', localized(cn, '评分', 'Rating')),
    ];
    return Container(
      color: Theme.of(context).cardColor,
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
      child: Row(
        children: items
            .map(
              (e) => Padding(
                padding: const EdgeInsets.only(right: 8),
                child: _chip(e.$2, e.$1 == _sort, brand, () => setState(() => _sort = e.$1)),
              ),
            )
            .toList(),
      ),
    );
  }

  Widget _chip(String text, bool active, Brand brand, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: active ? brand.shop.withValues(alpha: 0.12) : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: active ? brand.shop : const Color(0xFFDDDDDD)),
        ),
        child: Text(
          text,
          style: TextStyle(fontSize: 12, color: active ? brand.shop : const Color(0xFF757575)),
        ),
      ),
    );
  }

  /// 说明条：活动规则 / 会场玩法 + 可选倒计时
  Widget _noteBar(bool cn, Brand brand) {
    final showTimer = widget.countdownTo != null;
    return Container(
      margin: const EdgeInsets.fromLTRB(10, 10, 10, 0),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          const Icon(Icons.campaign_outlined, size: 16, color: Color(0xFFFF5000)),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              localized(cn, widget.note!, widget.noteEn),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12),
            ),
          ),
          if (showTimer) ...[
            const SizedBox(width: 8),
            Text(
              localized(cn, '本场还剩', 'Ends in'),
              style: const TextStyle(fontSize: 11, color: Color(0xFF9E9E9E)),
            ),
            const SizedBox(width: 4),
            _timeBox(_pad(_left.inHours % 24)),
            const Text(':', style: TextStyle(fontSize: 11, color: Color(0xFF9E9E9E))),
            _timeBox(_pad(_left.inMinutes % 60)),
            const Text(':', style: TextStyle(fontSize: 11, color: Color(0xFF9E9E9E))),
            _timeBox(_pad(_left.inSeconds % 60)),
          ],
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

  Widget _rankBadge(int i, Brand brand) {
    final top = i < 3;
    return Container(
      width: 22,
      height: 22,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: top ? const Color(0xFFFF5000) : brand.shop.withValues(alpha: 0.75),
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(12),
          bottomRight: Radius.circular(8),
        ),
      ),
      child: Text(
        '${i + 1}',
        style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700),
      ),
    );
  }

  static String _pad(int n) => n.toString().padLeft(2, '0');
}
