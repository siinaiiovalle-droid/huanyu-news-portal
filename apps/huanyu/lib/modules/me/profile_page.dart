import 'package:flutter/material.dart';

import '../../core/models.dart';
import '../../state/app_state.dart';
import '../../theme/app_theme.dart';
import '../../theme/flavor_switch.dart';
import '../../widgets/common.dart';
import '../life/life_page.dart';
import '../mini/mini_page.dart';
import '../pay/wallet_page.dart';
import '../shop/order_page.dart';
import '../video/video_feed_page.dart';

/// 【我的】页里展示的订单状态入口
const List<OrderStatus> _orderStatusTabs = [
  OrderStatus.pendingPay,
  OrderStatus.pendingShip,
  OrderStatus.shipped,
  OrderStatus.pendingReview,
  OrderStatus.refunding,
];

/// 我的：账户信息 + 订单状态 + 业务入口（钱包 / 小程序 / 本地生活 / 作品）+ 外观（皮肤 / 深浅色）
class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    final brand = Brand.of(appState.flavor);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final cn = appState.flavor.isCn;

    return Scaffold(
      appBar: AppBar(
        title: Text(cn ? '我的' : 'Profile'),
        actions: [
          IconButton(icon: const Icon(Icons.qr_code_2), onPressed: () {}),
          IconButton(icon: const Icon(Icons.settings_outlined), onPressed: () {}),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 24),
        children: [
          // 账户
          Container(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: Row(
              children: [
                const SeedAvatar(
                  text: '寰',
                  seed: ColorSeed(Color(0xFF1677FF), Color(0xFF6EA8FF)),
                  size: 62,
                  radius: 12,
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(appState.userName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text(
                        cn ? '寰宇号：${appState.userId}' : 'Huanyu ID: ${appState.userId}',
                        style: TextStyle(fontSize: 12, color: dark ? const Color(0xFF7A8A99) : const Color(0xFF9E9E9E)),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right, color: Color(0xFFCCCCCC)),
              ],
            ),
          ),
          // 数据条
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            padding: const EdgeInsets.symmetric(vertical: 14),
            decoration: BoxDecoration(
              color: Theme.of(context).cardColor,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                const _StatItem(value: '128', label: '关注', labelEn: 'Following'),
                const _StatItem(value: '3.2w', label: '粉丝', labelEn: 'Followers'),
                const _StatItem(value: '862', label: '获赞', labelEn: 'Likes'),
                ListenableBuilder(
                  listenable: appState,
                  builder: (context, _) => _StatItem(
                    value: '${appState.orders.length}',
                    label: '订单',
                    labelEn: 'Orders',
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          // 订单状态
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Theme.of(context).cardColor,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                InkWell(
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const OrderListPage())),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(cn ? '我的订单' : 'My orders', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                      Row(
                        children: [
                          Text(cn ? '全部 >' : 'All >', style: const TextStyle(fontSize: 12, color: Color(0xFF9E9E9E))),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                ListenableBuilder(
                  listenable: appState,
                  builder: (context, _) => Row(
                    children: [
                      for (final s in _orderStatusTabs)
                        Expanded(
                          child: _OrderStatusItem(
                            status: s,
                            count: appState.ordersOf(s).length,
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          // 业务入口
          Card(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            elevation: 0,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            child: Column(
              children: [
                ListTile(
                  leading: Icon(Icons.account_balance_wallet_outlined, color: brand.pay),
                  title: Text(cn ? '钱包' : 'Wallet', style: const TextStyle(fontSize: 14)),
                  subtitle: Text(
                    cn
                        ? '余额 ¥${appState.balance.toStringAsFixed(2)} · 账单 · 收付款码'
                        : 'Balance \$${appState.balance.toStringAsFixed(2)} · QR payments',
                    style: const TextStyle(fontSize: 11),
                  ),
                  trailing: const Icon(Icons.chevron_right, size: 18, color: Color(0xFFCCCCCC)),
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const WalletPage())),
                ),
                const Divider(height: 1, indent: 56),
                ListTile(
                  leading: Icon(Icons.receipt_long_outlined, color: brand.shop),
                  title: Text(cn ? '我的订单' : 'Orders', style: const TextStyle(fontSize: 14)),
                  subtitle: Text(
                    cn ? '来自商城 / 短视频 / 直播间 / 本地生活' : 'From shop, videos, live and local deals',
                    style: const TextStyle(fontSize: 11),
                  ),
                  trailing: const Icon(Icons.chevron_right, size: 18, color: Color(0xFFCCCCCC)),
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const OrderListPage())),
                ),
                const Divider(height: 1, indent: 56),
                ListTile(
                  leading: Icon(Icons.local_offer_outlined, color: brand.life),
                  title: Text(cn ? '本地生活' : 'Local deals', style: const TextStyle(fontSize: 14)),
                  subtitle: Text(cn ? '外卖 · 团购 · 酒店 · 电影' : 'Delivery · Deals · Hotels · Movies',
                      style: const TextStyle(fontSize: 11)),
                  trailing: const Icon(Icons.chevron_right, size: 18, color: Color(0xFFCCCCCC)),
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LifePage())),
                ),
                const Divider(height: 1, indent: 56),
                ListTile(
                  leading: Icon(Icons.apps_outlined, color: brand.mini),
                  title: Text(cn ? '小程序' : 'Mini apps', style: const TextStyle(fontSize: 14)),
                  subtitle: Text(cn ? '最近使用与收藏' : 'Recent and favourites', style: const TextStyle(fontSize: 11)),
                  trailing: const Icon(Icons.chevron_right, size: 18, color: Color(0xFFCCCCCC)),
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const MiniAppsPage())),
                ),
                const Divider(height: 1, indent: 56),
                ListTile(
                  leading: Icon(Icons.play_circle_outline, color: brand.video),
                  title: Text(cn ? '我的作品' : 'My posts', style: const TextStyle(fontSize: 14)),
                  subtitle: Text(cn ? '短视频与直播回放' : 'Videos and live replays', style: const TextStyle(fontSize: 11)),
                  trailing: const Icon(Icons.chevron_right, size: 18, color: Color(0xFFCCCCCC)),
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const VideoFeedPage())),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          // 外观 / 皮肤切换
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Theme.of(context).cardColor,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(cn ? '界面风格' : 'Interface style', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                    const Spacer(),
                    TextButton.icon(
                      onPressed: () => FlavorSwitch.toggle(context),
                      icon: Icon(cn ? Icons.public : Icons.home_outlined, size: 16),
                      label: Text(cn ? '切换到国际版' : 'Switch to China'),
                      style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 8)),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: _FlavorCard(
                        flavor: UiFlavor.cn,
                        active: cn,
                        onTap: () => FlavorSwitch.switchTo(context, UiFlavor.cn),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _FlavorCard(
                        flavor: UiFlavor.global,
                        active: !cn,
                        onTap: () => FlavorSwitch.switchTo(context, UiFlavor.global),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Text(cn ? '深色模式' : 'Dark mode', style: const TextStyle(fontSize: 13)),
                    const Spacer(),
                    IconButton(
                      icon: Icon(dark ? Icons.dark_mode : Icons.light_mode, size: 20),
                      onPressed: () => appState.toggleTheme(),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Center(
            child: Text(
              cn ? '寰宇 Huanyu 1.0.0 · Flutter 3.47.4' : 'Huanyu 1.0.0 · Flutter 3.47.4',
              style: const TextStyle(fontSize: 11, color: Color(0xFFBDBDBD)),
            ),
          ),
        ],
      ),
    );
  }
}

class _FlavorCard extends StatelessWidget {
  final UiFlavor flavor;
  final bool active;
  final VoidCallback onTap;

  const _FlavorCard({required this.flavor, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final brand = Brand.of(flavor);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final isCn = flavor.isCn;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: active ? null : onTap,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: active ? brand.app.withValues(alpha: 0.08) : (dark ? const Color(0xFF101921) : const Color(0xFFF7F8FA)),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: active ? brand.app : Colors.transparent,
            width: 1.4,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 26,
                  height: 26,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(colors: [brand.im, brand.video]),
                    borderRadius: BorderRadius.circular(isCn ? 6 : 13),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  isCn ? '中国版' : 'Global',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(flavor.desc, style: const TextStyle(fontSize: 11, height: 1.5, color: Color(0xFF9E9E9E))),
          ],
        ),
      ),
    );
  }
}

class _StatItem extends StatelessWidget {
  final String value;
  final String label;
  final String labelEn;

  const _StatItem({required this.value, required this.label, required this.labelEn});

  @override
  Widget build(BuildContext context) => Expanded(
        child: Column(
          children: [
            Text(value, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 2),
            Text(
              localized(appState.flavor.isCn, label, labelEn),
              style: const TextStyle(fontSize: 11, color: Color(0xFF9E9E9E)),
            ),
          ],
        ),
      );
}

class _OrderStatusItem extends StatelessWidget {
  final OrderStatus status;
  final int count;

  const _OrderStatusItem({required this.status, required this.count});

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    final icon = switch (status) {
      OrderStatus.pendingPay => Icons.payment_outlined,
      OrderStatus.pendingShip => Icons.inventory_outlined,
      OrderStatus.shipped => Icons.local_shipping_outlined,
      OrderStatus.pendingReview => Icons.rate_review_outlined,
      OrderStatus.refunding => Icons.assignment_return_outlined,
      OrderStatus.completed => Icons.check_circle_outline,
      OrderStatus.refunded => Icons.assignment_return,
    };
    return InkWell(
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const OrderListPage())),
      child: Column(
        children: [
          Badge(
            isLabelVisible: count > 0,
            label: Text('$count'),
            child: Icon(icon, size: 24),
          ),
          const SizedBox(height: 6),
          Text(status.label(appState.flavor), style: const TextStyle(fontSize: 11)),
          if (!cn) const SizedBox(height: 2),
        ],
      ),
    );
  }
}
