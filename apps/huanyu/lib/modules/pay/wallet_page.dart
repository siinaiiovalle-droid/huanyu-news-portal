import 'package:flutter/material.dart';

import '../../core/models.dart';
import '../../state/app_state.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common.dart';
import '../shop/order_page.dart';
import 'qr_page.dart';

/// 支付首页：
/// 中国版 = 支付宝（蓝色头部 + 扫一扫/付款码/收款 + 九宫格 + 账单流水）
/// 国际版 = PayPal（Balance 卡片 + Send/Request/Wallet + Activity）
/// 账单来自 Store：商城/直播/本地生活下的每一笔订单都会在这里出现，点击可跳订单详情
class WalletPage extends StatelessWidget {
  const WalletPage({super.key});

  @override
  Widget build(BuildContext context) => appState.flavor.isCn ? _alipay(context) : _paypal(context);

  // ---------------- 支付宝风格 ----------------
  Widget _alipay(BuildContext context) {
    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [Color(0xFF123A8C), Color(0xFF2E6BF6), Color(0xFF4E8BFF)],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
              padding: EdgeInsets.only(top: MediaQuery.of(context).padding.top + 8),
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(
                      children: [
                        const AppBackButton(color: Colors.white),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(appState.flavor.payName,
                              style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w600)),
                        ),
                        Row(
                          children: [
                            IconButton(
                              icon: const Icon(Icons.qr_code_scanner, color: Colors.white),
                              onPressed: () => _toQr(context),
                            ),
                            const Icon(Icons.notifications_none, color: Colors.white),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _PayAction(icon: Icons.qr_code_scanner, label: '扫一扫', onTap: () => _toQr(context)),
                      _PayAction(icon: Icons.qr_code_2, label: '付款码', onTap: () => _toQr(context, tab: 0)),
                      _PayAction(icon: Icons.account_balance_wallet_outlined, label: '收款', onTap: () => _toQr(context, tab: 1)),
                      _PayAction(icon: Icons.credit_card, label: '卡包', onTap: () {}),
                    ],
                  ),
                  const SizedBox(height: 18),
                  Container(
                    margin: const EdgeInsets.symmetric(horizontal: 16),
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: ListenableBuilder(
                            listenable: appState,
                            builder: (context, _) => Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('账户余额', style: TextStyle(fontSize: 12, color: Color(0xFF8A8A8A))),
                                const SizedBox(height: 4),
                                Text(
                                  '¥ ${appState.balance.toStringAsFixed(2)}',
                                  style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700),
                                ),
                              ],
                            ),
                          ),
                        ),
                        FilledButton(
                          onPressed: () => _recharge(context),
                          style: FilledButton.styleFrom(
                            backgroundColor: const Color(0xFF1677FF),
                            minimumSize: const Size(84, 36),
                          ),
                          child: const Text('充值', style: TextStyle(fontSize: 13)),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
              ),
            ),
          ),
          // 九宫格
          SliverToBoxAdapter(
            child: Container(
              margin: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              padding: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
              ),
              child: GridView.count(
                crossAxisCount: 4,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  _GridAction(icon: Icons.swap_horiz, label: '转账', color: const Color(0xFFFF9800), onTap: () => _transfer(context)),
                  _GridAction(icon: Icons.phone_android_outlined, label: '充值中心', color: const Color(0xFF1677FF), onTap: () => _recharge(context)),
                  _GridAction(icon: Icons.receipt_long_outlined, label: '账单', color: const Color(0xFF4CAF50), onTap: () {}),
                  _GridAction(icon: Icons.credit_score_outlined, label: '花呗', color: const Color(0xFFE91E63), onTap: () {}),
                  _GridAction(icon: Icons.shopping_bag_outlined, label: '我的订单', color: const Color(0xFFFE2C55),
                      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const OrderListPage()))),
                  _GridAction(icon: Icons.local_offer_outlined, label: '本地生活', color: const Color(0xFFFF9800), onTap: () {}),
                  _GridAction(icon: Icons.trending_up, label: '理财', color: const Color(0xFFFF5722), onTap: () {}),
                  _GridAction(icon: Icons.volunteer_activism_outlined, label: '公益', color: const Color(0xFF8BC34A), onTap: () {}),
                ],
              ),
            ),
          ),
          // 账单
          SliverToBoxAdapter(
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 16),
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('账单', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                      InkWell(
                        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const OrderListPage())),
                        child: const Text('我的订单 >', style: TextStyle(fontSize: 12, color: Color(0xFF9E9E9E))),
                      ),
                    ],
                  ),
                  ListenableBuilder(
                    listenable: appState,
                    builder: (context, _) => Column(
                      children: appState.bills.map((b) => _BillRow(bill: b, cn: true)).toList(),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 24)),
        ],
      ),
    );
  }

  // ---------------- PayPal 风格 ----------------
  Widget _paypal(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final card = dark ? const Color(0xFF17212B) : Colors.white;
    return Scaffold(
      appBar: AppBar(
        title: Text(appState.flavor.payName),
        leading: const AppBackButton(),
        leadingWidth: 44,
        actions: [
          IconButton(icon: const Icon(Icons.qr_code_scanner), onPressed: () => _toQr(context)),
          IconButton(icon: const Icon(Icons.settings_outlined), onPressed: () {}),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              gradient: const LinearGradient(colors: [Color(0xFF0070BA), Color(0xFF15457A)]),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${appState.flavor.payName} balance', style: const TextStyle(color: Colors.white70, fontSize: 13)),
                const SizedBox(height: 6),
                ListenableBuilder(
                  listenable: appState,
                  builder: (context, _) => Text(
                    '\$ ${appState.balance.toStringAsFixed(2)}',
                    style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w700),
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: _PillButton(label: 'Send', icon: Icons.send_outlined, onTap: () => _transfer(context)),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _PillButton(label: 'Request', icon: Icons.south_west, onTap: () => _toQr(context, tab: 1)),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _PillButton(label: 'Wallet', icon: Icons.account_balance_wallet_outlined, onTap: () {}),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: card, borderRadius: BorderRadius.circular(16)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Activity', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                    InkWell(
                      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const OrderListPage())),
                      child: Text('Orders >', style: TextStyle(fontSize: 12, color: Brand.of(appState.flavor).pay)),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                ListenableBuilder(
                  listenable: appState,
                  builder: (context, _) => Column(
                    children: appState.bills.map((b) => _ActivityRow(bill: b, dark: dark, cn: false)).toList(),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: card, borderRadius: BorderRadius.circular(16)),
            child: Row(
              children: [
                const Icon(Icons.verified_user_outlined, color: Color(0xFF0070BA)),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'Buyer Protection 覆盖符合条件的交易，纠纷可在 180 天内申诉。',
                    style: TextStyle(fontSize: 12, height: 1.5),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _toQr(BuildContext context, {int tab = 0}) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => QrPage(initialTab: tab)));
  }

  void _recharge(BuildContext context) {
    final cn = appState.flavor.isCn;
    final ctrl = TextEditingController(text: '100');
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(cn ? '账户充值' : 'Top up'),
        content: TextField(
          controller: ctrl,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(prefixText: cn ? '¥ ' : '\$ ', labelText: cn ? '金额' : 'Amount'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: Text(cn ? '取消' : 'Cancel')),
          FilledButton(
            onPressed: () {
              final v = double.tryParse(ctrl.text) ?? 0;
              if (v > 0) {
                appState.income(v, cn ? '账户充值' : 'Top up', icon: Icons.account_balance_wallet_outlined, category: cn ? '充值' : 'Deposit');
              }
              Navigator.pop(context);
            },
            child: Text(cn ? '确认充值' : 'Confirm'),
          ),
        ],
      ),
    );
  }

  void _transfer(BuildContext context) {
    final cn = appState.flavor.isCn;
    final ctrl = TextEditingController(text: '100');
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(cn ? '转账' : 'Send money'),
        content: TextField(
          controller: ctrl,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(prefixText: cn ? '¥ ' : '\$ ', labelText: cn ? '金额' : 'Amount'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: Text(cn ? '取消' : 'Cancel')),
          FilledButton(
            onPressed: () async {
              final v = double.tryParse(ctrl.text) ?? 0;
              Navigator.pop(context);
              if (v <= 0) return;
              final ok = await appState.payDirect(v, cn ? '转账 - 好友' : 'Transfer', icon: Icons.swap_horiz);
              if (ok && context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text(cn ? '转账成功' : 'Money sent'), behavior: SnackBarBehavior.floating),
                );
              }
            },
            child: Text(cn ? '确认转账' : 'Send'),
          ),
        ],
      ),
    );
  }
}

class _PayAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _PayAction({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        child: Column(
          children: [
            Icon(icon, color: Colors.white, size: 26),
            const SizedBox(height: 4),
            Text(label, style: const TextStyle(color: Colors.white, fontSize: 12)),
          ],
        ),
      );
}

class _GridAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _GridAction({required this.icon, required this.label, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(height: 6),
            Text(label, style: const TextStyle(fontSize: 11)),
          ],
        ),
      );
}

class _BillRow extends StatelessWidget {
  final BillItem bill;
  final bool cn;

  const _BillRow({required this.bill, required this.cn});

  @override
  Widget build(BuildContext context) {
    final in_ = bill.amount >= 0;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      onTap: bill.orderId == null
          ? null
          : () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => OrderDetailPage(orderId: bill.orderId!)),
              ),
      leading: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: (in_ ? const Color(0xFF4CAF50) : const Color(0xFF1677FF)).withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Icon(bill.icon, size: 18, color: in_ ? const Color(0xFF4CAF50) : const Color(0xFF1677FF)),
      ),
      title: Text(bill.displayTitle(cn), style: const TextStyle(fontSize: 14)),
      subtitle: Text('${bill.category} · ${bill.time}', style: const TextStyle(fontSize: 11, color: Color(0xFF9E9E9E))),
      trailing: Text(
        '${in_ ? '+' : ''}${bill.amount.toStringAsFixed(2)}',
        style: TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w600,
          color: in_ ? const Color(0xFF4CAF50) : const Color(0xFF333333),
        ),
      ),
    );
  }
}

class _ActivityRow extends StatelessWidget {
  final BillItem bill;
  final bool dark;
  final bool cn;

  const _ActivityRow({required this.bill, required this.dark, required this.cn});

  @override
  Widget build(BuildContext context) {
    final in_ = bill.amount >= 0;
    return InkWell(
      onTap: bill.orderId == null
          ? null
          : () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailPage(orderId: bill.orderId!))),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: const Color(0xFF0070BA).withValues(alpha: 0.12),
              child: Icon(bill.icon, size: 17, color: const Color(0xFF0070BA)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(bill.displayTitle(cn), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                  const SizedBox(height: 2),
                  Text(
                    '${bill.category} · ${bill.time}',
                    style: TextStyle(fontSize: 11, color: dark ? const Color(0xFF7A8A99) : const Color(0xFF9E9E9E)),
                  ),
                ],
              ),
            ),
            Text(
              '${in_ ? '+' : ''}\$${bill.amount.abs().toStringAsFixed(2)}',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: in_ ? const Color(0xFF2E7D32) : (dark ? Colors.white : const Color(0xFF1A1A1A)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PillButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback onTap;

  const _PillButton({required this.label, required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(22),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 9),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.16),
            borderRadius: BorderRadius.circular(22),
          ),
          child: Column(
            children: [
              Icon(icon, color: Colors.white, size: 18),
              const SizedBox(height: 2),
              Text(label, style: const TextStyle(color: Colors.white, fontSize: 11)),
            ],
          ),
        ),
      );
}
