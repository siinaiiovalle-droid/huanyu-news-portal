import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../state/app_state.dart';
import '../theme/app_theme.dart';

/// 皮肤切换过场：一圈品牌色圆形从中心扩散覆盖全屏（切换完成后揭幕），
/// 配合 AppTheme 的整体重建，让「中国版 ⇄ 国际版」的切换真正像换了一个 App
class FlavorSwitch {
  static Future<void> toggle(BuildContext context) async {
    final target = appState.flavor.isCn ? UiFlavor.global : UiFlavor.cn;
    await switchTo(context, target);
  }

  static Future<void> switchTo(BuildContext context, UiFlavor target) async {
    if (appState.flavor == target) return;
    final overlay = Overlay.of(context);
    late OverlayEntry entry;
    entry = OverlayEntry(
      builder: (_) => _Curtain(
        target: target,
        onDismissed: () {
          if (entry.mounted) entry.remove();
        },
      ),
    );
    overlay.insert(entry);
  }
}

class _Curtain extends StatefulWidget {
  final UiFlavor target;
  final VoidCallback onDismissed;

  const _Curtain({required this.target, required this.onDismissed});

  @override
  State<_Curtain> createState() => _CurtainState();
}

class _CurtainState extends State<_Curtain> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1150),
  );
  late final Animation<double> _expand = CurvedAnimation(
    parent: _c,
    curve: const Interval(0.0, 0.38, curve: Curves.easeOutCubic),
  );
  late final Animation<double> _textOpacity = CurvedAnimation(
    parent: _c,
    curve: const Interval(0.22, 0.6, curve: Curves.easeIn),
  );
  late final Animation<double> _fade = CurvedAnimation(
    parent: _c,
    curve: const Interval(0.72, 1.0, curve: Curves.easeInOut),
  );

  @override
  void initState() {
    super.initState();
    _c.forward();
    // 遮住屏幕的瞬间完成皮肤切换
    Future<void>.delayed(const Duration(milliseconds: 420), () {
      appState.setFlavor(widget.target);
    });
    Future<void>.delayed(const Duration(milliseconds: 1180), () {
      widget.onDismissed();
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final brand = Brand.of(widget.target);
    final max = math.sqrt(size.width * size.width + size.height * size.height) * 1.05;
    final cn = widget.target.isCn;

    return Positioned.fill(
      child: IgnorePointer(
        child: AnimatedBuilder(
          animation: _c,
          builder: (context, _) {
            return Opacity(
              opacity: 1 - _fade.value,
              child: Stack(
                children: [
                  Center(
                    child: Container(
                      width: max * _expand.value,
                      height: max * _expand.value,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: LinearGradient(
                          colors: [brand.app, brand.video, brand.life],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                      ),
                    ),
                  ),
                  if (_textOpacity.value > 0.01)
                    Opacity(
                      opacity: _textOpacity.value,
                      child: Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(cn ? Icons.auto_awesome : Icons.public, size: 46, color: Colors.white),
                            const SizedBox(height: 12),
                            Text(
                              cn ? '已切换到中国版' : 'Switching to Global',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 20,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 1,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              widget.target.desc,
                              style: const TextStyle(color: Colors.white70, fontSize: 12),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}
