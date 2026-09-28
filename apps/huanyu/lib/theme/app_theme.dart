import 'package:flutter/material.dart';

/// 皮肤风格：中国版 / 国际版
/// 每个模块都按这两种风格给出不同的信息架构与视觉语言：
///   IM     -> 微信 / Telegram
///   支付    -> 支付宝 / PayPal
///   短视频  -> 抖音 / TikTok
///   商城    -> 抖音商城 / TikTok Shop
///   本地生活 -> 美团 / Groupon
enum UiFlavor { cn, global }

extension UiFlavorX on UiFlavor {
  bool get isCn => this == UiFlavor.cn;
  String get label => isCn ? '中国版' : '国际版';
  /// 各业务线自有品牌名（不沿用对标产品名）
  String get imName => isCn ? '寰宇畅聊' : 'Huanyu Talk';
  String get payName => isCn ? '寰宇支付' : 'Huanyu Pay';
  String get videoName => isCn ? '寰宇短视频' : 'Huanyu Reels';
  String get shopName => isCn ? '寰宇商城' : 'Huanyu Shop';
  String get lifeName => isCn ? '寰宇本地生活' : 'Huanyu Local';

  String get desc => isCn ? '微信 · 支付宝 · 抖音 · 美团' : 'Telegram · PayPal · TikTok · Groupon';
}

/// 各业务线品牌色（跟对标产品保持一致）
class Brand {
  final Color app;
  final Color news;
  final Color im;
  final Color pay;
  final Color video;
  final Color shop;
  final Color mini;
  final Color life;

  const Brand({
    required this.app,
    required this.news,
    required this.im,
    required this.pay,
    required this.video,
    required this.shop,
    required this.mini,
    required this.life,
  });

  /// 中国版：微信绿 #07C160 / 支付宝蓝 #1677FF / 抖音红 #FE2C55 / 美团黄 #FFD100
  static const cn = Brand(
    app: Color(0xFF1677FF),
    news: Color(0xFFC8161D),
    im: Color(0xFF07C160),
    pay: Color(0xFF2E6BF6),
    video: Color(0xFFFE2C55),
    shop: Color(0xFFFE2C55),
    mini: Color(0xFF07C160),
    life: Color(0xFFFFD100),
  );

  /// 国际版：Telegram 蓝 #229ED9 / PayPal 蓝 #0070BA / TikTok 青 #25F4EE / Groupon 绿 / Yelp 红
  static const global = Brand(
    app: Color(0xFF229ED9),
    news: Color(0xFF229ED9),
    im: Color(0xFF229ED9),
    pay: Color(0xFF0070BA),
    video: Color(0xFF25F4EE),
    shop: Color(0xFFFE2C55),
    mini: Color(0xFF229ED9),
    life: Color(0xFF00A82D),
  );

  static Brand of(UiFlavor f) => f.isCn ? cn : global;
}

class AppTheme {
  static ThemeData light(UiFlavor f) => _build(f, Brightness.light);
  static ThemeData dark(UiFlavor f) => _build(f, Brightness.dark);

  static ThemeData _build(UiFlavor f, Brightness brightness) {
    final brand = Brand.of(f);
    final dark = brightness == Brightness.dark;
    final seed = brand.app;
    final scheme = ColorScheme.fromSeed(
      seedColor: seed,
      brightness: brightness,
      primary: brand.app,
    );

    final base = dark
        ? const Color(0xFF0E1621) // Telegram 深海蓝底
        : const Color(0xFFF5F6F7); // 微信/支付宝浅灰底

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      // 全局使用内置中文字体（assets/fonts/SimHei.ttf），Web 端不依赖在线字体
      fontFamily: 'AppHei',
      scaffoldBackgroundColor: base,
      canvasColor: dark ? const Color(0xFF17212B) : Colors.white,
      cardColor: dark ? const Color(0xFF17212B) : Colors.white,
      appBarTheme: AppBarTheme(
        centerTitle: false,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        backgroundColor: dark ? const Color(0xFF17212B) : Colors.white,
        foregroundColor: dark ? Colors.white : const Color(0xFF1A1A1A),
        titleTextStyle: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w600,
          color: dark ? Colors.white : const Color(0xFF1A1A1A),
        ),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: dark ? const Color(0xFF17212B) : Colors.white,
        selectedItemColor: brand.app,
        unselectedItemColor: dark ? const Color(0xFF7A8A99) : const Color(0xFF9E9E9E),
        selectedLabelStyle: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600),
        unselectedLabelStyle: const TextStyle(fontSize: 10),
        type: BottomNavigationBarType.fixed,
      ),
      dividerTheme: DividerThemeData(
        thickness: 0.5,
        space: 0.5,
        color: dark ? const Color(0xFF101921) : const Color(0xFFEBEBEB),
      ),
      listTileTheme: ListTileThemeData(
        tileColor: dark ? const Color(0xFF17212B) : Colors.white,
        iconColor: dark ? const Color(0xFF7A8A99) : const Color(0xFF8A8A8A),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: dark ? const Color(0xFF101921) : const Color(0xFFF2F3F5),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(f.isCn ? 8 : 22), // 微信方角 / Telegram 圆角
          borderSide: BorderSide.none,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: brand.app,
          foregroundColor: Colors.white,
          elevation: 0,
          minimumSize: const Size.fromHeight(46),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(f.isCn ? 8 : 24),
          ),
        ),
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: brand.app,
        unselectedLabelColor: dark ? const Color(0xFF7A8A99) : const Color(0xFF666666),
        indicatorColor: brand.app,
        indicatorSize: TabBarIndicatorSize.label,
        labelStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        unselectedLabelStyle: const TextStyle(fontSize: 15),
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: brand.im,
        foregroundColor: Colors.white,
        elevation: 2,
      ),
    );
  }
}
