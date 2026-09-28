import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/mock.dart';
import '../../core/models.dart';
import '../../state/app_state.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common.dart';
import '../pay/checkout_page.dart';
import '../shop/order_page.dart';

/// 本地生活（对标美团）：外卖 / 到店团购 / 酒店 / 电影 / 丽人 / 家政 / 跑腿 / 门票
/// 下单后走同一套支付与订单体系（OrderSource.local），在「我的订单」和支付宝账单里都能看到
class LifePage extends StatefulWidget {
  const LifePage({super.key});

  @override
  State<LifePage> createState() => _LifePageState();
}

class _LifePageState extends State<LifePage> {
  DealCategory? _filter;
  final List<String> _sortTabs = ['推荐', '好评优先', '离我最近', '低价优先'];

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    final brand = Brand.of(appState.flavor);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final deals = _filter == null ? Mock.deals : Mock.deals.where((d) => d.category == _filter).toList();

    return Scaffold(
      appBar: AppBar(
        backgroundColor: _filter == null ? null : Theme.of(context).cardColor,
        title: Row(
          children: [
            Icon(Icons.location_on_outlined, size: 16, color: brand.life),
            const SizedBox(width: 4),
            Text(
              cn ? '杭州·未来科技城' : 'Hangzhou · Future City',
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            ),
            const Icon(Icons.keyboard_arrow_down, size: 18),
          ],
        ),
        actions: [
          IconButton(icon: const Icon(Icons.notifications_none), onPressed: () {}),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 20),
        children: [
          // 搜索
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 6, 12, 10),
            child: TextField(
              decoration: InputDecoration(
                hintText: cn ? '搜索附近的美食、酒店、休闲' : 'Search food, hotels, fun nearby',
                prefixIcon: const Icon(Icons.search, size: 18),
                isCollapsed: true,
              ),
              style: const TextStyle(fontSize: 14),
            ),
          ),
          // 金刚区
          Container(
            padding: const EdgeInsets.symmetric(vertical: 10),
            color: Theme.of(context).cardColor,
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _KindIcon(category: DealCategory.takeaway, onTap: () => _pick(DealCategory.takeaway)),
                    _KindIcon(category: DealCategory.group, onTap: () => _pick(DealCategory.group)),
                    _KindIcon(category: DealCategory.hotel, onTap: () => _pick(DealCategory.hotel)),
                    _KindIcon(category: DealCategory.movie, onTap: () => _pick(DealCategory.movie)),
                  ],
                ),
                const SizedBox(height: 14),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _KindIcon(category: DealCategory.beauty, onTap: () => _pick(DealCategory.beauty)),
                    _KindIcon(category: DealCategory.repair, onTap: () => _pick(DealCategory.repair)),
                    _KindIcon(category: DealCategory.errand, onTap: () => _pick(DealCategory.errand)),
                    _KindIcon(category: DealCategory.travel, onTap: () => _pick(DealCategory.travel)),
                  ],
                ),
              ],
            ),
          ),
          // 优惠 banner
          Container(
            margin: const EdgeInsets.all(12),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              gradient: LinearGradient(colors: [brand.life, brand.life.withValues(alpha: 0.7)]),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        cn ? '周末狂欢 · 5 折起' : 'Weekend deals · up to 50% off',
                        style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        cn ? '限时红包今天 24 点失效' : 'coupons expire at midnight',
                        style: const TextStyle(color: Colors.white70, fontSize: 11),
                      ),
                    ],
                  ),
                ),
                FilledButton(
                  onPressed: () {},
                  style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: brand.life),
                  child: Text(cn ? '去抢' : 'Grab', style: const TextStyle(fontSize: 13)),
                ),
              ],
            ),
          ),
          // 筛选条
          Container(
            height: 40,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              itemCount: _sortTabs.length + 1,
              itemBuilder: (context, i) {
                if (i == _sortTabs.length) {
                  return Center(
                    child: GestureDetector(
                      onTap: () => setState(() => _filter = null),
                      child: Container(
                        margin: const EdgeInsets.only(left: 8),
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: _filter == null ? brand.life.withValues(alpha: 0.12) : Colors.transparent,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          cn ? '全部' : 'All',
                          style: TextStyle(fontSize: 12, color: _filter == null ? brand.life : null),
                        ),
                      ),
                    ),
                  );
                }
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    child: Text(_sortTabs[i], style: const TextStyle(fontSize: 12)),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 8),
          // 团购列表
          ...deals.map((d) => _DealCard(deal: d, cn: cn)),
          if (deals.isEmpty)
            Padding(
              padding: const EdgeInsets.all(32),
              child: Center(
                child: Text(
                  cn ? '该分类暂无团购' : 'No deals in this category',
                  style: TextStyle(fontSize: 13, color: dark ? const Color(0xFF7A8A99) : const Color(0xFF9E9E9E)),
                ),
              ),
            ),
        ],
      ),
    );
  }

  /// 金刚区点大类 → 进入该栏目的子内容（栏目页，按销量排序 + 猜你喜欢）
  void _pick(DealCategory c) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => LifeCategoryPage(category: c)));
  }
}

// ============================================================
// 栏目页：某个大栏目下的全部团单（"栏目的子内容"）
// ============================================================
class LifeCategoryPage extends StatelessWidget {
  final DealCategory category;

  const LifeCategoryPage({super.key, required this.category});

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    final brand = Brand.of(appState.flavor);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final sub = dark ? const Color(0xFF7A8A99) : const Color(0xFF9E9E9E);

    final mine = Mock.deals.where((d) => d.category == category).toList()
      ..sort((a, b) => b.sold.compareTo(a.sold));
    final others = Mock.deals.where((d) => d.category != category).toList()
      ..sort((a, b) => b.sold.compareTo(a.sold));
    final minPrice = mine.isEmpty ? 0.0 : mine.map((d) => d.price).reduce(math.min);

    return Scaffold(
      appBar: AppBar(
        leading: const AppBackButton(),
        leadingWidth: 44,
        titleSpacing: 0,
        title: Row(
          children: [
            Icon(category.icon, size: 18, color: brand.life),
            const SizedBox(width: 6),
            Text(category.label(appState.flavor), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          ],
        ),
        actions: [
          IconButton(icon: const Icon(Icons.search, size: 20), onPressed: () {}),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 20),
        children: [
          // 栏目概览
          Container(
            margin: const EdgeInsets.fromLTRB(12, 12, 12, 4),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Theme.of(context).cardColor,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: brand.life.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(category.icon, color: brand.life, size: 24),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        category.label(appState.flavor),
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        mine.isEmpty
                            ? (cn ? '该栏目暂无在售团单' : 'No deals yet')
                            : (cn
                                ? '${mine.length} 个在售团单 · 最低 ¥${minPrice.toStringAsFixed(0)}'
                                : '${mine.length} deals · from ¥${minPrice.toStringAsFixed(0)}'),
                        style: TextStyle(fontSize: 11, color: sub),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          _SectionTitle(
            text: cn ? '${category.label(appState.flavor)} · 全部团单' : '${category.label(appState.flavor)} deals',
          ),
          if (mine.isEmpty)
            Padding(
              padding: const EdgeInsets.all(32),
              child: Center(child: Text(cn ? '该栏目暂无在售团单' : 'No deals in this category', style: TextStyle(fontSize: 13, color: sub))),
            ),
          ...mine.map((d) => _DealCard(deal: d, cn: cn)),
          _SectionTitle(text: cn ? '猜你喜欢' : 'You may also like'),
          ...others.map((d) => _DealCard(deal: d, cn: cn)),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String text;

  const _SectionTitle({required this.text});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 14, 12, 8),
      child: Row(
        children: [
          Container(width: 3, height: 13, color: Brand.of(appState.flavor).life),
          const SizedBox(width: 6),
          Text(
            text,
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: dark ? Colors.white : Colors.black87),
          ),
        ],
      ),
    );
  }
}

class _KindIcon extends StatelessWidget {
  final DealCategory category;
  final VoidCallback onTap;

  const _KindIcon({required this.category, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    final brand = Brand.of(appState.flavor);
    return InkWell(
      onTap: onTap,
      child: SizedBox(
        width: 76,
        child: Column(
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: brand.life.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(category.icon, color: brand.life, size: 24),
            ),
            const SizedBox(height: 6),
            Text(category.label(appState.flavor), style: const TextStyle(fontSize: 12)),
            Builder(builder: (context) {
              final list = Mock.deals.where((d) => d.category == category).toList();
              if (list.isEmpty) {
                return Text(
                  cn ? '敬请期待' : 'Coming soon',
                  style: const TextStyle(fontSize: 10, color: Color(0xFF9E9E9E)),
                );
              }
              final min = list.map((d) => d.price).reduce(math.min);
              return Text(
                cn ? '¥${min.toStringAsFixed(0)}起' : 'from ¥${min.toStringAsFixed(0)}',
                style: const TextStyle(fontSize: 10, color: Color(0xFF9E9E9E)),
              );
            }),
          ],
        ),
      ),
    );
  }
}

class _DealCard extends StatelessWidget {
  final LocalDeal deal;
  final bool cn;

  const _DealCard({required this.deal, required this.cn});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final brand = Brand.of(appState.flavor);
    return InkWell(
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => DealDetailPage(deal: deal))),
      child: Container(
        margin: const EdgeInsets.fromLTRB(12, 0, 12, 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Theme.of(context).cardColor,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 86,
              height: 86,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(8),
                gradient: LinearGradient(colors: [deal.seed.a, deal.seed.b]),
              ),
              clipBehavior: Clip.antiAlias,
              child: Stack(
                children: [
                  Positioned.fill(
                    child: deal.image.isEmpty
                        ? const SizedBox()
                        : Image.asset(deal.image, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox()),
                  ),
                  Positioned(
                    left: 4,
                    bottom: 4,
                    child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.4),
                  borderRadius: BorderRadius.circular(3),
                ),
                child: Text(
                  deal.category.label(appState.flavor),
                  style: const TextStyle(color: Colors.white, fontSize: 9),
                ),
                  ),
                ),
              ],
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: SizedBox(
                height: 86,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      deal.displayTitle(cn),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 14, height: 1.35),
                    ),
                    Row(
                      children: [
                        Text('★${deal.rating}', style: const TextStyle(fontSize: 11, color: Color(0xFFFF9800))),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            cn ? '已售 ${deal.sold}' : '${deal.sold} sold',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 11, color: dark ? const Color(0xFF7A8A99) : const Color(0xFF9E9E9E)),
                          ),
                        ),
                        if (deal.distanceKm > 0)
                          Text(
                            deal.distanceKm < 1
                                ? '${(deal.distanceKm * 1000).toInt()}m'
                                : '${deal.distanceKm.toStringAsFixed(1)}km',
                            style: const TextStyle(fontSize: 11, color: Color(0xFF9E9E9E)),
                          ),
                      ],
                    ),
                    Row(
                      children: [
                        Text(
                          '¥${deal.price.toStringAsFixed(2)}',
                          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: brand.life),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          '¥${deal.origin.toStringAsFixed(0)}',
                          style: const TextStyle(
                            fontSize: 11,
                            color: Color(0xFF9E9E9E),
                            decoration: TextDecoration.lineThrough,
                          ),
                        ),
                        const Spacer(),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: brand.life.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(cn ? '抢购' : 'Buy', style: TextStyle(fontSize: 11, color: brand.life)),
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
// 团单详情
// ============================================================
class DealDetailPage extends StatelessWidget {
  final LocalDeal deal;

  const DealDetailPage({super.key, required this.deal});

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final brand = Brand.of(appState.flavor);
    final card = dark ? const Color(0xFF17212B) : Colors.white;

    return Scaffold(
      appBar: AppBar(
        title: Text(deal.displayTitle(cn)),
        leading: const AppBackButton(),
        leadingWidth: 44,
        actions: [
          IconButton(icon: const Icon(Icons.share_outlined), onPressed: () {}),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 80),
        children: [
          Container(
            height: 200,
            decoration: BoxDecoration(gradient: LinearGradient(colors: [deal.seed.a, deal.seed.b])),
            child: deal.image.isEmpty
                ? null
                : Image.asset(deal.image, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox()),
          ),
          Container(
            color: card,
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(deal.displayTitle(cn), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Text(
                      '¥${deal.price.toStringAsFixed(2)}',
                      style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: brand.life),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '¥${deal.origin.toStringAsFixed(0)}',
                      style: const TextStyle(
                        fontSize: 13,
                        color: Color(0xFF9E9E9E),
                        decoration: TextDecoration.lineThrough,
                      ),
                    ),
                    const Spacer(),
                    Text(cn ? '已售 ${deal.sold}' : '${deal.sold} sold',
                        style: const TextStyle(fontSize: 12, color: Color(0xFF9E9E9E))),
                  ],
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  children: deal.tags
                      .map((t) => Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: brand.life.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(3),
                            ),
                            child: Text(t, style: TextStyle(fontSize: 11, color: brand.life)),
                          ))
                      .toList(),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          // 商家
          Container(
            color: card,
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(6),
                    gradient: LinearGradient(colors: [deal.seed.a, deal.seed.b]),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(deal.shop, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 3),
                      Row(
                        children: [
                          const Icon(Icons.location_on_outlined, size: 12, color: Color(0xFF9E9E9E)),
                          const SizedBox(width: 3),
                          Expanded(
                            child: Text(
                              deal.address,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 11, color: Color(0xFF9E9E9E)),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                Column(
                  children: [
                    Text('★${deal.rating}', style: const TextStyle(fontSize: 13, color: Color(0xFFFF9800))),
                    Text(cn ? '营业中' : 'Open', style: const TextStyle(fontSize: 11, color: Color(0xFF4CAF50))),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          // 套餐内容
          Container(
            color: card,
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(cn ? '套餐内容' : 'Package', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                if (deal.desc.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(deal.displayDesc(cn), style: const TextStyle(fontSize: 13, height: 1.6)),
                ],
                const SizedBox(height: 8),
                ...deal.packageItems.map(
                  (it) => Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Row(
                      children: [
                        Icon(Icons.check_circle, size: 14, color: brand.life),
                        const SizedBox(width: 6),
                        Expanded(child: Text(it, style: const TextStyle(fontSize: 13))),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          // 购买须知
          Container(
            color: card,
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(cn ? '购买须知' : 'Terms', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                _RuleLine(text: cn ? '有效期：购买后 30 天内有效' : 'Valid 30 days after purchase'),
                _RuleLine(text: cn ? '使用时间：${deal.openHours}' : 'Hours: ${deal.openHours}'),
                _RuleLine(text: cn ? '规则：支持随时退、过期自动退' : 'Refund: anytime, auto-expire'),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Container(
          height: 56,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(
            color: card,
            border: Border(top: BorderSide(color: dark ? const Color(0xFF101921) : const Color(0xFFEBEBEB))),
          ),
          child: Row(
            children: [
              Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('¥${deal.price.toStringAsFixed(2)}',
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: brand.life)),
                ],
              ),
              const SizedBox(width: 10),
              Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(cn ? '到手价' : 'Final price', style: const TextStyle(fontSize: 11, color: Color(0xFF9E9E9E))),
                ],
              ),
              const Spacer(),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: brand.life, minimumSize: const Size(132, 40)),
                onPressed: () async {
                  final order = await appState.createOrderFromDeal(deal);
                  if (!context.mounted) return;
                  final ok = await Navigator.push<bool>(
                    context,
                    MaterialPageRoute(
                      builder: (_) => CheckoutPage(
                        orderId: order.id,
                        amount: order.total,
                        title: '${deal.shop} · ${deal.title}',
                      ),
                    ),
                  );
                  if (ok == true && context.mounted) {
                    Navigator.pushReplacement(
                      context,
                      MaterialPageRoute(builder: (_) => OrderDetailPage(orderId: order.id)),
                    );
                  }
                },
                child: Text(cn ? '立即抢购' : 'Buy now'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RuleLine extends StatelessWidget {
  final String text;

  const _RuleLine({required this.text});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('· ', style: TextStyle(fontSize: 12, color: Color(0xFF9E9E9E))),
            Expanded(child: Text(text, style: const TextStyle(fontSize: 12, height: 1.5))),
          ],
        ),
      );
}
