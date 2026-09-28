import 'package:flutter/material.dart';

import '../../core/mock.dart';
import '../../core/models.dart';
import '../../state/app_state.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common.dart';
import '../pay/checkout_page.dart';
import '../video/video_feed_page.dart';
import 'shop_page.dart';

/// 订单中心（淘宝式）：
/// 全部 / 待付款 / 待发货 / 待收货 / 待评价 —— 订单来源覆盖商城、短视频、直播间与本地生活
/// 全部操作（付款/发货/收货/评价/退款）都会真实改变订单状态、余额与账单
class OrderListPage extends StatefulWidget {
  const OrderListPage({super.key});

  @override
  State<OrderListPage> createState() => _OrderListPageState();
}

class _OrderListPageState extends State<OrderListPage> with SingleTickerProviderStateMixin {
  int _tab = 0;

  final List<OrderStatus?> _tabs = [null, OrderStatus.pendingPay, OrderStatus.pendingShip, OrderStatus.shipped, OrderStatus.pendingReview];

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    final labels = cn
        ? ['全部', '待付款', '待发货', '待收货', '待评价']
        : ['All', 'Unpaid', 'To ship', 'Shipping', 'To review'];

    return Scaffold(
      appBar: AppBar(
        title: Text(cn ? '我的订单' : 'My orders'),
        leading: const AppBackButton(),
        leadingWidth: 44,
        actions: [
          IconButton(icon: const Icon(Icons.search), onPressed: () {}),
        ],
      ),
      body: Column(
        children: [
          Container(
            height: 44,
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              itemCount: labels.length,
              itemBuilder: (context, i) => Center(
                child: GestureDetector(
                  onTap: () => setState(() => _tab = i),
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 10),
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    decoration: BoxDecoration(
                      border: Border(
                        bottom: BorderSide(
                          color: _tab == i ? Brand.of(appState.flavor).shop : Colors.transparent,
                          width: 2,
                        ),
                      ),
                    ),
                    child: Text(
                      labels[i],
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: _tab == i ? FontWeight.w700 : FontWeight.w400,
                        color: _tab == i ? Brand.of(appState.flavor).shop : const Color(0xFF8A8A8A),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
          Expanded(
            child: ListenableBuilder(
              listenable: appState,
              builder: (context, _) {
                final status = _tabs[_tab];
                final list = status == null ? appState.orders : appState.ordersOf(status);
                if (list.isEmpty) {
                  return EmptyView(
                    icon: Icons.receipt_long_outlined,
                    title: cn ? '这里还没有订单' : 'No orders here',
                    subtitle: cn ? '去商城或直播间看看有什么好物' : 'Check the shop or live deals',
                  );
                }
                return ListView.builder(
                  padding: const EdgeInsets.all(12),
                  itemCount: list.length,
                  itemBuilder: (context, i) => _OrderCard(order: list[i], cn: cn),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// 订单商品缩略图：用商品/团购的真实高清实拍图（assets/shop、assets/life），
/// 取不到（历史数据缺图或文件丢失）时回退到原来的渐变色块，不会出现破图
class _ItemThumb extends StatelessWidget {
  final OrderItem item;
  final double size;

  const _ItemThumb({required this.item, this.size = 72});

  @override
  Widget build(BuildContext context) {
    if (item.image.isEmpty) return _gradient();
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Image.asset(
        item.image,
        width: size,
        height: size,
        fit: BoxFit.cover,
        filterQuality: FilterQuality.medium,
        errorBuilder: (_, _, _) => _gradient(),
      ),
    );
  }

  Widget _gradient() => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          gradient: LinearGradient(colors: [item.seed.a, item.seed.b]),
        ),
      );
}

class _OrderCard extends StatelessWidget {
  final Order order;
  final bool cn;

  const _OrderCard({required this.order, required this.cn});

  Future<void> _pay(BuildContext context) async {
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
    if (ok == true && context.mounted) {
      // 付款成功后模拟商家 2 秒后发货
      await Future<void>.delayed(const Duration(seconds: 2));
      appState.shipOrder(order.id);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final brand = Brand.of(appState.flavor);
    final it = order.items.first;

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      elevation: 0,
      color: Theme.of(context).cardColor,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailPage(orderId: order.id))),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 店铺 + 状态
              Row(
                children: [
                  const Icon(Icons.storefront_outlined, size: 15),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(order.shop, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  ),
                  Text(
                    order.status.label(appState.flavor),
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: brand.shop),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              // 商品行
              Row(
                children: [
                  _ItemThumb(item: it, size: 72),
                  const SizedBox(width: 10),
                  Expanded(
                    child: SizedBox(
                      height: 72,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            it.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 13, height: 1.35),
                          ),
                          const Spacer(),
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                                decoration: BoxDecoration(
                                  color: brand.shop.withValues(alpha: 0.12),
                                  borderRadius: BorderRadius.circular(3),
                                ),
                                child: Text(
                                  order.source.label(appState.flavor),
                                  style: TextStyle(fontSize: 10, color: brand.shop),
                                ),
                              ),
                              const SizedBox(width: 6),
                              if (order.fromVideoTitle != null)
                                Expanded(
                                  child: Text(
                                    order.fromVideoTitle!,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(fontSize: 10, color: dark ? const Color(0xFF7A8A99) : const Color(0xFF9E9E9E)),
                                  ),
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text('¥${it.price.toStringAsFixed(2)}',
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 4),
                      Text('x${it.quantity}', style: const TextStyle(fontSize: 11, color: Color(0xFF9E9E9E))),
                    ],
                  ),
                ],
              ),
              const Divider(height: 20),
              Row(
                children: [
                  Text(
                    cn ? '共 ${order.count} 件 实付 ' : '${order.count} items, paid ',
                    style: const TextStyle(fontSize: 12),
                  ),
                  Text(
                    '¥${order.total.toStringAsFixed(2)}',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: brand.shop),
                  ),
                  const Spacer(),
                  _orderActions(context, order, cn, brand, pay: () => _pay(context)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

Widget _orderActions(
  BuildContext context,
  Order order,
  bool cn,
  Brand brand, {
  required VoidCallback pay,
}) {
  Widget chip(String text, {required VoidCallback onTap, bool primary = false}) => OutlinedButton(
        onPressed: onTap,
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(72, 30),
          padding: const EdgeInsets.symmetric(horizontal: 10),
          side: BorderSide(color: primary ? brand.shop : const Color(0xFFDDDDDD)),
        ),
        child: Text(
          text,
          style: TextStyle(
              fontSize: 12, color: primary ? brand.shop : (cn ? const Color(0xFF333333) : null)),
        ),
      );

  return Builder(
    builder: (ctx) {
      switch (order.status) {
        case OrderStatus.pendingPay:
          return chip(order.status.action(appState.flavor)!, onTap: pay, primary: true);
        case OrderStatus.pendingShip:
          return Row(
            children: [
              chip(cn ? '退款' : 'Refund', onTap: () => _refund(context, order)),
              const SizedBox(width: 8),
              chip(order.status.action(appState.flavor)!, onTap: () => appState.remindShip(order.id)),
            ],
          );
        case OrderStatus.shipped:
          return Row(
            children: [
              chip(cn ? '查看物流' : 'Track',
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailPage(orderId: order.id)))),
              const SizedBox(width: 8),
              chip(order.status.action(appState.flavor)!, onTap: () => appState.receiveOrder(order.id), primary: true),
            ],
          );
        case OrderStatus.pendingReview:
          return Row(
            children: [
              chip(cn ? '申请售后' : 'Return', onTap: () => _refund(context, order)),
              const SizedBox(width: 8),
              chip(order.status.action(appState.flavor)!, onTap: () => _review(context, order), primary: true),
            ],
          );
        case OrderStatus.completed:
          return chip(order.status.action(appState.flavor)!, onTap: () {
            final pid = order.items.first.productId;
            final p = Mock.products.where((e) => e.id == pid).cast<Product?>().firstWhere((e) => e != null, orElse: () => null);
            if (p != null) {
              Navigator.push(ctx, MaterialPageRoute(builder: (_) => ProductPage(product: p)));
            }
          });
        case OrderStatus.refunding:
          return chip(order.status.action(appState.flavor)!, onTap: () {
            ScaffoldMessenger.of(ctx).showSnackBar(
              SnackBar(content: Text(cn ? '撤销需在软件: 联系客服处理' : 'Please contact support to cancel')),
            );
          });
        case OrderStatus.refunded:
          return chip(cn ? '已退款' : 'Refunded', onTap: () {});
      }
    },
  );
}

Future<void> _refund(BuildContext context, Order order) async {
  final cn = appState.flavor.isCn;
  final go = await showDialog<bool>(
    context: context,
    builder: (_) => AlertDialog(
      title: Text(cn ? '申请退款' : 'Request refund'),
      content: Text(
        cn
            ? '退款金额 ¥${order.total.toStringAsFixed(2)}，将退回您的账户余额。'
            : '¥${order.total.toStringAsFixed(2)} will be refunded to your balance.',
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: Text(cn ? '取消' : 'Cancel')),
        TextButton(onPressed: () => Navigator.pop(context, true), child: Text(cn ? '确定' : 'Confirm')),
      ],
    ),
  );
  if (go == true) await appState.refundOrder(order.id);
}

Future<void> _review(BuildContext context, Order order) async {
  await showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _ReviewSheet(order: order),
  );
}

// ============================================================
// 订单详情（物流、金额、操作）
// ============================================================
class OrderDetailPage extends StatelessWidget {
  final String orderId;

  const OrderDetailPage({super.key, required this.orderId});

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    final brand = Brand.of(appState.flavor);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final card = dark ? const Color(0xFF17212B) : Colors.white;

    return ListenableBuilder(
      listenable: appState,
      builder: (context, _) {
        final order = appState.orderById(orderId);
        if (order == null) {
          return Scaffold(
            appBar: AppBar(title: Text(cn ? '订单详情' : 'Order'), leading: const AppBackButton(), leadingWidth: 44),
            body: EmptyView(icon: Icons.error_outline, title: cn ? '订单不存在' : 'Order not found'),
          );
        }
        return Scaffold(
          appBar: AppBar(
            title: Text(cn ? '订单详情' : 'Order detail'),
            leading: const AppBackButton(),
            leadingWidth: 44,
            actions: [
              IconButton(icon: const Icon(Icons.headset_mic_outlined), onPressed: () {}),
            ],
          ),
          body: ListView(
            padding: const EdgeInsets.all(12),
            children: [
              // 状态头
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: [brand.shop, brand.shop.withValues(alpha: 0.65)]),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      order.status.label(appState.flavor),
                      style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      order.status.describe(appState.flavor),
                      style: const TextStyle(color: Colors.white70, fontSize: 12),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              // 物流
              if (order.trail.isNotEmpty)
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: card, borderRadius: BorderRadius.circular(12)),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.local_shipping_outlined, size: 16, color: brand.shop),
                          const SizedBox(width: 6),
                          Text(order.logisticsCompany, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(order.trackingNo, style: const TextStyle(fontSize: 11, color: Color(0xFF9E9E9E))),
                          ),
                          Text(cn ? '复制' : 'Copy', style: TextStyle(fontSize: 12, color: brand.shop)),
                        ],
                      ),
                      const Divider(height: 20),
                      ...order.trail.asMap().entries.map(
                            (e) => Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Container(
                                    margin: const EdgeInsets.only(top: 4),
                                    width: 7,
                                    height: 7,
                                    decoration: BoxDecoration(
                                      color: e.key == 0 ? brand.shop : const Color(0xFFCCCCCC),
                                      shape: BoxShape.circle,
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Text(
                                      e.value,
                                      style: TextStyle(
                                        fontSize: 12,
                                        height: 1.5,
                                        color: e.key == 0 ? null : const Color(0xFF9E9E9E),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                    ],
                  ),
                ),
              if (order.trail.isNotEmpty) const SizedBox(height: 10),
              // 收货地址
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: card, borderRadius: BorderRadius.circular(12)),
                child: Row(
                  children: [
                    const Icon(Icons.location_on_outlined, size: 18),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(order.receiver, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                              const SizedBox(width: 8),
                              Text(order.phone, style: const TextStyle(fontSize: 12)),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            order.address,
                            style: const TextStyle(fontSize: 12, color: Color(0xFF9E9E9E), height: 1.4),
                          ),
                        ],
                      ),
                    ),
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
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                      child: Row(
                        children: [
                          const Icon(Icons.storefront_outlined, size: 15),
                          const SizedBox(width: 6),
                          Text(order.shop, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                    ...order.items.map(
                      (it) => Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        child: Row(
                          children: [
                            _ItemThumb(item: it, size: 64),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    it.title,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(fontSize: 13, height: 1.35),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    it.spec,
                                    style: const TextStyle(fontSize: 11, color: Color(0xFF9E9E9E)),
                                  ),
                                ],
                              ),
                            ),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text('¥${it.price.toStringAsFixed(2)}', style: const TextStyle(fontSize: 14)),
                                const SizedBox(height: 4),
                                Text('x${it.quantity}', style: const TextStyle(fontSize: 11, color: Color(0xFF9E9E9E))),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                    const Divider(height: 8),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              cn ? '共 ${order.count} 件商品' : '${order.count} items',
                              style: const TextStyle(fontSize: 12, color: Color(0xFF9E9E9E)),
                            ),
                          ),
                          Text(cn ? '实付款 ' : 'Paid ', style: const TextStyle(fontSize: 12)),
                          Text(
                            '¥${order.total.toStringAsFixed(2)}',
                            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: brand.shop),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              // 订单信息
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: card, borderRadius: BorderRadius.circular(12)),
                child: Column(
                  children: [
                    _InfoRow(label: cn ? '订单编号' : 'Order ID', value: order.id, copyable: true),
                    _InfoRow(label: cn ? '下单时间' : 'Created', value: _fmt(order.createdAt)),
                    _InfoRow(label: cn ? '订单来源' : 'Source', value: order.source.label(appState.flavor)),
                    if (order.fromVideoTitle != null)
                      InkWell(
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => VideoFeedPage(initialIndex: _videoIndex(order.fromVideoId)),
                            ),
                          );
                        },
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          child: Row(
                            children: [
                              Expanded(
                                child: Row(
                                  children: [
                                    Text(cn ? '来源内容' : 'From', style: const TextStyle(fontSize: 12, color: Color(0xFF9E9E9E))),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Text(
                                        order.fromVideoTitle!,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(fontSize: 12, color: brand.video),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              Icon(Icons.chevron_right, size: 16, color: brand.video),
                            ],
                          ),
                        ),
                      ),
                    if (order.review != null) ...[
                      const Divider(height: 16),
                      Row(
                        children: [
                          Text(cn ? '我的评价' : 'My review', style: const TextStyle(fontSize: 12, color: Color(0xFF9E9E9E))),
                          const SizedBox(width: 10),
                          Text('★${order.rating.toStringAsFixed(1)}', style: const TextStyle(fontSize: 12, color: Color(0xFFFF9800))),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(order.review!, style: const TextStyle(fontSize: 12, height: 1.5)),
                    ],
                  ],
                ),
              ),
              if (order.status == OrderStatus.pendingShip) ...[
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: () => appState.shipOrder(order.id),
                    child: Text(cn ? '（演示）模拟商家发货' : '(Demo) simulate shipping'),
                  ),
                ),
              ],
              const SizedBox(height: 90),
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
                  const Spacer(),
                  _orderActions(context, order, cn, brand, pay: () async {
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
                    if (ok == true) {
                      await Future<void>.delayed(const Duration(seconds: 2));
                      appState.shipOrder(order.id);
                    }
                  }),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  static int _videoIndex(String? id) {
    if (id == null) return 0;
    final i = ['v1', 'v2', 'v3', 'v4', 'v5'].indexOf(id);
    return i < 0 ? 0 : i;
  }

  static String _fmt(DateTime t) =>
      '${t.year}-${t.month.toString().padLeft(2, '0')}-${t.day.toString().padLeft(2, '0')} '
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  final bool copyable;

  const _InfoRow({required this.label, required this.value, this.copyable = false});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            Text(label, style: const TextStyle(fontSize: 12, color: Color(0xFF9E9E9E))),
            const SizedBox(width: 10),
            Expanded(
              child: Text(value, style: const TextStyle(fontSize: 12), textAlign: TextAlign.right),
            ),
            if (copyable) ...[
              const SizedBox(width: 6),
              Text('复制', style: TextStyle(fontSize: 12, color: Brand.of(appState.flavor).shop)),
            ],
          ],
        ),
      );
}

// ============================================================
// 评价
// ============================================================
class _ReviewSheet extends StatefulWidget {
  final Order order;

  const _ReviewSheet({required this.order});

  @override
  State<_ReviewSheet> createState() => _ReviewSheetState();
}

class _ReviewSheetState extends State<_ReviewSheet> {
  double _rating = 5;
  final TextEditingController _ctrl = TextEditingController();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final brand = Brand.of(appState.flavor);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: dark ? const Color(0xFF17212B) : Colors.white,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(width: 36, height: 4, color: Colors.grey.withValues(alpha: 0.3)),
            ),
            const SizedBox(height: 14),
            Text(cn ? '发表评价' : 'Write a review', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            Row(
              children: List.generate(5, (i) {
                return IconButton(
                  icon: Icon(
                    i < _rating.round() ? Icons.star : Icons.star_border,
                    color: const Color(0xFFFF9800),
                    size: 28,
                  ),
                  onPressed: () => setState(() => _rating = (i + 1).toDouble()),
                );
              }),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _ctrl,
              maxLines: 4,
              decoration: InputDecoration(
                hintText: cn ? '说说这件宝贝怎么样…' : 'Share your experience...',
              ),
            ),
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                style: FilledButton.styleFrom(backgroundColor: brand.shop),
                onPressed: () {
                  appState.reviewOrder(widget.order.id, _rating, _ctrl.text.trim());
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(cn ? '评价已发布' : 'Review posted'),
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                },
                child: Text(cn ? '提交评价' : 'Submit'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
