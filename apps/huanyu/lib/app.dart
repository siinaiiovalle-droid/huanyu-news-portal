import 'package:flutter/material.dart';
import 'state/app_state.dart';
import 'theme/app_theme.dart';
import 'modules/shell/shell.dart';

/// 寰宇超级 App：新闻 + IM + 支付 + 短视频/直播 + 商城 + 小程序
/// 支持两套界面皮肤：中国版（微信/支付宝/抖音风格）与国际版（Telegram/PayPal/TikTok 风格）
class HuanyuApp extends StatelessWidget {
  const HuanyuApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: appState,
      builder: (context, _) {
        final flavor = appState.flavor;
        return MaterialApp(
          title: flavor == UiFlavor.cn ? '寰宇' : 'Huanyu',
          debugShowCheckedModeBanner: false,
          theme: AppTheme.light(flavor),
          darkTheme: AppTheme.dark(flavor),
          themeMode: appState.themeMode,
          home: const AppShell(),
        );
      },
    );
  }
}
