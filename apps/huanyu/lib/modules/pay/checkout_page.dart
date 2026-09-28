import 'package:flutter/material.dart';

import '../../state/app_state.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common.dart';

/// 收银台：
/// 中国版 = 支付宝收银台（商户信息 + 支付方式 + 立即付款 + 免密提示）
/// 国际版 = PayPal Checkout（PayPal 余额 / 银行卡 + Buyer Protection + Pay now）
/// 传入 orderId 时，支付成功会真实推进订单状态、扣减余额并生成账单
class CheckoutPage extends StatefulWidget {
  final double amount;
  final String title;
  final String? orderId;

  const CheckoutPage({
    super.key,
    required this.amount,
    required this.title,
    this.orderId,
  });

  @override
  State<CheckoutPage> createState() => _CheckoutPageState();
}

class _CheckoutPageState extends State<CheckoutPage> {
  int _method = 0;
  bool _paying = false;

  Future<void> _confirm() async {
    setState(() => _paying = true);
    await Future<void>.delayed(const Duration(milliseconds: 700));

    bool ok;
    if (widget.orderId != null) {
      ok = await appState.payOrder(widget.orderId!, useHuabei: _method == 1);
    } else {
      ok = await appState.payDirect(widget.amount, widget.title);
    }
    if (!mounted) return;
    setState(() => _paying = false);

    if (!ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(appState.flavor.isCn ? '余额不足，请更换支付方式' : 'Insufficient balance'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    final paid = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => AlertDialog(
        title: Row(
          children: [
            Icon(Icons.check_circle, color: Brand.of(appState.flavor).pay),
            const SizedBox(width: 8),
            Text(appState.flavor.isCn ? '支付成功' : 'Payment sent'),
          ],
        ),
        content: Text(
          '${widget.title}\n${appState.flavor.isCn ? '¥' : '\$'}${widget.amount.toStringAsFixed(2)}',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(appState.flavor.isCn ? '完成' : 'Done'),
          ),
        ],
      ),
    );
    if (paid == true && mounted) {
      Navigator.pop(context, true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    return Scaffold(
      appBar: AppBar(
        title: Text(cn ? '收银台' : 'Checkout'),
        leading: const AppBackButton(),
        leadingWidth: 44,
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Center(
                  child: Column(
                    children: [
                      const SizedBox(height: 12),
                      Text(
                        '${cn ? '¥' : '\$'}${widget.amount.toStringAsFixed(2)}',
                        style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 6),
                      Text(widget.title, style: const TextStyle(fontSize: 13, color: Color(0xFF9E9E9E))),
                      const SizedBox(height: 4),
                      Text(
                        cn ? '收款方：寰宇传媒信息技术股份有限公司' : 'To: Huanyu Media Co., Ltd.',
                        style: const TextStyle(fontSize: 12, color: Color(0xFF9E9E9E)),
                      ),
                      const SizedBox(height: 10),
                      ListenableBuilder(
                        listenable: appState,
                        builder: (context, _) => Text(
                          cn
                              ? '账户余额 ¥${appState.balance.toStringAsFixed(2)}'
                              : 'Balance \$${appState.balance.toStringAsFixed(2)}',
                          style: const TextStyle(fontSize: 12, color: Color(0xFF8A8A8A)),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                if (cn) ..._alipayMethods() else ..._paypalMethods(),
              ],
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _paying ? null : _confirm,
                  child: _paying
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : Text(cn ? '立即付款' : 'Pay now'),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _alipayMethods() => [
        _MethodTile(
          selected: _method == 0,
          icon: Icons.account_balance_wallet_outlined,
          title: '账户余额',
          subtitle: '可用余额 ¥${appState.balance.toStringAsFixed(2)}',
          color: const Color(0xFF1677FF),
          onTap: () => setState(() => _method = 0),
        ),
        _MethodTile(
          selected: _method == 1,
          icon: Icons.credit_card,
          title: '花呗',
          subtitle: '可用额度 ¥${appState.huabeiQuota.toStringAsFixed(0)}',
          color: const Color(0xFFFF9800),
          onTap: () => setState(() => _method = 1),
        ),
        _MethodTile(
          selected: _method == 2,
          icon: Icons.account_balance_outlined,
          title: '招商银行储蓄卡 (**** 8888)',
          subtitle: '单笔限额 ¥50,000.00',
          color: const Color(0xFFE91E63),
          onTap: () => setState(() => _method = 2),
        ),
        const SizedBox(height: 12),
        const Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.fingerprint, size: 16, color: Color(0xFF9E9E9E)),
            SizedBox(width: 4),
            Text('已开启指纹免密支付', style: TextStyle(fontSize: 11, color: Color(0xFF9E9E9E))),
          ],
        ),
      ];

  List<Widget> _paypalMethods() => [
        _MethodTile(
          selected: _method == 0,
          icon: Icons.account_balance_wallet_outlined,
          title: '${appState.flavor.payName} balance',
          subtitle: 'Available \$${appState.balance.toStringAsFixed(2)}',
          color: const Color(0xFF0070BA),
          onTap: () => setState(() => _method = 0),
        ),
        _MethodTile(
          selected: _method == 1,
          icon: Icons.credit_card,
          title: 'Visa •••• 4242',
          subtitle: 'Expires 08/2029',
          color: const Color(0xFF15457A),
          onTap: () => setState(() => _method = 1),
        ),
        _MethodTile(
          selected: _method == 2,
          icon: Icons.add_card_outlined,
          title: 'Add a debit or credit card',
          subtitle: 'Securely link a new card',
          color: const Color(0xFF9E9E9E),
          onTap: () => setState(() => _method = 2),
        ),
        const SizedBox(height: 16),
        const Row(
          children: [
            Icon(Icons.verified_user_outlined, size: 16, color: Color(0xFF0070BA)),
            SizedBox(width: 6),
            Expanded(
              child: Text(
                'Buyer Protection: 符合条件的交易可全额退款。',
                style: TextStyle(fontSize: 11, height: 1.5, color: Color(0xFF9E9E9E)),
              ),
            ),
          ],
        ),
      ];
}

class _MethodTile extends StatelessWidget {
  final bool selected;
  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;

  const _MethodTile({
    required this.selected,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: selected ? Brand.of(appState.flavor).pay : (dark ? const Color(0xFF101921) : const Color(0xFFEBEBEB)),
          width: selected ? 1.4 : 1,
        ),
      ),
      child: ListTile(
        onTap: onTap,
        leading: Container(
          width: 38,
          height: 26,
          decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(5)),
          alignment: Alignment.center,
          child: Icon(icon, size: 18, color: color),
        ),
        title: Text(title, style: const TextStyle(fontSize: 14)),
        subtitle: Text(subtitle, style: const TextStyle(fontSize: 11, color: Color(0xFF9E9E9E))),
        trailing: selected
            ? Icon(Icons.check_circle, color: Brand.of(appState.flavor).pay)
            : const Icon(Icons.radio_button_unchecked, size: 20, color: Color(0xFFCCCCCC)),
      ),
    );
  }
}
