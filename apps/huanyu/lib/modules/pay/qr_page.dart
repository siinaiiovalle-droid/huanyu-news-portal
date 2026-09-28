import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/models.dart';
import '../../state/app_state.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common.dart';

/// 付款码 / 收款码
/// 付款码：个人付款二维码 + 数字 codes；收款码：设置金额生成二维码，可模拟对方付款入账
class QrPage extends StatefulWidget {
  final int initialTab;

  const QrPage({super.key, this.initialTab = 0});

  @override
  State<QrPage> createState() => _QrPageState();
}

class _QrPageState extends State<QrPage> with SingleTickerProviderStateMixin {
  late TabController _tab;
  final TextEditingController _amountCtrl = TextEditingController(text: '50.00');
  String _amount = '50.00';
  int _tick = 0; // 刷新码值用，模拟动态刷新

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 2, vsync: this, initialIndex: widget.initialTab);
  }

  @override
  void dispose() {
    _tab.dispose();
    _amountCtrl.dispose();
    super.dispose();
  }

  String get _payPayload =>
      'huanyu://pay?uid=${appState.userId}&t=${DateTime.now().millisecondsSinceEpoch ~/ 1000}&ref=$_tick';

  String get _receivePayload => 'huanyu://receive?uid=${appState.userId}&amt=$_amount';

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    final brand = Brand.of(appState.flavor);
    final dark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: Text(cn ? '收付款' : 'Scan & pay'),
        leading: const AppBackButton(),
        leadingWidth: 44,
        actions: [
          IconButton(
            icon: const Icon(Icons.more_horiz),
            onPressed: () {},
          ),
        ],
      ),
      body: Column(
        children: [
          TabBar(
            controller: _tab,
            tabs: [Tab(text: cn ? '付款码' : 'Pay'), Tab(text: cn ? '收款码' : 'Receive')],
          ),
          Expanded(
            child: TabBarView(
              controller: _tab,
              children: [
                // 付款码
                Column(
                  children: [
                    const SizedBox(height: 20),
                    Container(
                      margin: const EdgeInsets.symmetric(horizontal: 24),
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        boxShadow: [
                          BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, 4)),
                        ],
                      ),
                      child: Column(
                        children: [
                          Row(
                            children: [
                              const SeedAvatar(text: '寰', seed: ColorSeed(Color(0xFF1677FF), Color(0xFF6EA8FF)), size: 32, radius: 16),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(appState.userName, style: const TextStyle(fontSize: 14, color: Colors.black87)),
                                    const SizedBox(height: 2),
                                    ListenableBuilder(
                                      listenable: appState,
                                      builder: (context, _) => Text(
                                        cn
                                            ? '余额 ¥${appState.balance.toStringAsFixed(2)}'
                                            : 'Balance \$${appState.balance.toStringAsFixed(2)}',
                                        style: const TextStyle(fontSize: 11, color: Color(0xFF9E9E9E)),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 18),
                          QrImageView(
                            data: _payPayload,
                            version: QrVersions.auto,
                            size: 200.0,
                            backgroundColor: Colors.white,
                            eyeStyle: const QrEyeStyle(color: Color(0xFF1677FF), eyeShape: QrEyeShape.square),
                            dataModuleStyle: const QrDataModuleStyle(color: Color(0xFF111111), dataModuleShape: QrDataModuleShape.square),
                          ),
                          const SizedBox(height: 12),
                          _FakeBarcode(),
                          const SizedBox(height: 6),
                          Text(
                            '${appState.userId}${(_tick + 1) * 37}'.toUpperCase(),
                            style: const TextStyle(fontSize: 16, letterSpacing: 2, color: Colors.black87),
                          ),
                          const SizedBox(height: 10),
                          Text(
                            cn ? '每分钟自动更新，向商家出示即可付款' : 'Refreshes automatically, show it to the merchant',
                            style: const TextStyle(fontSize: 11, color: Color(0xFF9E9E9E)),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 18),
                    TextButton.icon(
                      onPressed: () => setState(() => _tick++),
                      icon: const Icon(Icons.refresh, size: 18),
                      label: Text(cn ? '刷新付款码' : 'Refresh'),
                    ),
                    const SizedBox(height: 6),
                    TextButton(
                      onPressed: () {},
                      child: Text(cn ? '设置付款码免密额度' : 'Set password-free limit',
                          style: const TextStyle(fontSize: 12, color: Color(0xFF9E9E9E))),
                    ),
                  ],
                ),
                // 收款码
                Column(
                  children: [
                    const SizedBox(height: 20),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(cn ? '收款金额' : 'Amount', style: const TextStyle(fontSize: 13, color: Color(0xFF9E9E9E))),
                        const Icon(Icons.keyboard_arrow_down, size: 18, color: Color(0xFF9E9E9E)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(cn ? '¥' : '\$', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600)),
                        const SizedBox(width: 4),
                        GestureDetector(
                          onTap: () async {
                            final v = await showDialog<double>(
                              context: context,
                              builder: (_) => _AmountDialog(initial: _amount),
                            );
                            if (v != null) setState(() => _amount = v.toStringAsFixed(2));
                          },
                          child: Text(
                            _amount,
                            style: TextStyle(fontSize: 34, fontWeight: FontWeight.w700, color: brand.pay),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    Container(
                      margin: const EdgeInsets.symmetric(horizontal: 24),
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        boxShadow: [
                          BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, 4)),
                        ],
                      ),
                      child: Column(
                        children: [
                          QrImageView(
                            data: _receivePayload,
                            version: QrVersions.auto,
                            size: 220.0,
                            backgroundColor: Colors.white,
                            eyeStyle: const QrEyeStyle(color: Color(0xFF1677FF), eyeShape: QrEyeShape.square),
                            dataModuleStyle: const QrDataModuleStyle(color: Color(0xFF111111), dataModuleShape: QrDataModuleShape.square),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            cn ? '让对方扫码付款给你' : 'Let the other party scan to pay you',
                            style: const TextStyle(fontSize: 12, color: Color(0xFF9E9E9E)),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
                    FilledButton.icon(
                      onPressed: () {
                        final v = double.tryParse(_amount) ?? 0;
                        if (v <= 0) return;
                        appState.income(
                          v,
                          cn ? '扫码收款' : 'QR payment received',
                          icon: Icons.qr_code_2,
                          category: cn ? '收款' : 'Received',
                        );
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(cn ? '已收款 ¥${v.toStringAsFixed(2)}' : 'Received \$${v.toStringAsFixed(2)}'),
                            behavior: SnackBarBehavior.floating,
                          ),
                        );
                      },
                      icon: const Icon(Icons.check, color: Colors.white),
                      style: FilledButton.styleFrom(backgroundColor: brand.pay, minimumSize: const Size(160, 42)),
                      label: Text(cn ? '模拟对方付款' : 'Simulate payment'),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      cn
                          ? '演示用：模拟对方扫码并成功付款'
                          : 'Demo: simulate the other party paying this QR',
                      style: TextStyle(fontSize: 11, color: dark ? const Color(0xFF7A8A99) : const Color(0xFF9E9E9E)),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// 模拟条形码外观（避免额外依赖）
class _FakeBarcode extends StatelessWidget {
  final List<int> widths = const [
    2, 1, 3, 1, 1, 2, 4, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 2, 1, 4, 1, 1, 3, 2, 1, 2, 2, 1, 3,
  ];

  const _FakeBarcode();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 44,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: widths.map((w) => Container(width: w.toDouble(), height: 40, color: const Color(0xFF111111))).toList(),
      ),
    );
  }
}

class _AmountDialog extends StatefulWidget {
  final String initial;

  const _AmountDialog({required this.initial});

  @override
  State<_AmountDialog> createState() => _AmountDialogState();
}

class _AmountDialogState extends State<_AmountDialog> {
  late final TextEditingController _c = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    return AlertDialog(
      title: Text(cn ? '设置金额' : 'Set amount'),
      content: TextField(
        controller: _c,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: InputDecoration(prefixText: cn ? '¥ ' : '\$ '),
        autofocus: true,
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(cn ? '取消' : 'Cancel')),
        FilledButton(
          onPressed: () => Navigator.pop(context, double.tryParse(_c.text) ?? 0),
          child: Text(cn ? '确定' : 'OK'),
        ),
      ],
    );
  }
}
