import 'package:flutter/material.dart';
import '../core/models.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';

/// 统一返回键：所有二级页面都用它，中国版用 iOS 风格箭头，国际版用 Material 箭头
class AppBackButton extends StatelessWidget {
  final Color? color;

  const AppBackButton({super.key, this.color});

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    return IconButton(
      icon: Icon(cn ? Icons.arrow_back_ios_new : Icons.arrow_back, size: cn ? 18 : 22, color: color),
      padding: EdgeInsets.zero,
      constraints: const BoxConstraints(),
      onPressed: () {
        if (Navigator.canPop(context)) {
          Navigator.pop(context);
        }
      },
    );
  }
}

/// 全屏内容页左上角悬浮返回键：优先出栈，无栈可出时执行 fallback
class OverlayBackButton extends StatelessWidget {
  final VoidCallback? fallback;

  const OverlayBackButton({super.key, this.fallback});

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    return InkWell(
      onTap: () {
        if (Navigator.canPop(context)) {
          Navigator.pop(context);
        } else {
          fallback?.call();
        }
      },
      child: Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.35),
          borderRadius: BorderRadius.circular(cn ? 16 : 10),
        ),
        child: Icon(cn ? Icons.arrow_back_ios_new : Icons.arrow_back,
            size: cn ? 16 : 20, color: Colors.white),
      ),
    );
  }
}

  /// 渐变头像（离线可用，不依赖外部图片）
class SeedAvatar extends StatelessWidget {
  final String text;
  final ColorSeed seed;
  final double size;
  final double radius;

  const SeedAvatar({
    super.key,
    required this.text,
    required this.seed,
    this.size = 44,
    this.radius = 8,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        gradient: LinearGradient(colors: [seed.a, seed.b]),
      ),
      child: Text(
        text.isEmpty ? '寰' : text,
        style: TextStyle(
          color: Colors.white,
          fontSize: size * 0.42,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

/// 网络图片 + 占位兜底（新闻配图走本机服务，失败时降级为渐变块）
class NetImage extends StatelessWidget {
  final String url;
  final double? width;
  final double? height;
  final BoxFit fit;
  final double radius;

  const NetImage({
    super.key,
    required this.url,
    this.width,
    this.height,
    this.fit = BoxFit.cover,
    this.radius = 0,
  });

  @override
  Widget build(BuildContext context) {
    if (url.isEmpty) return _placeholder();
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: Image.network(
        url,
        width: width,
        height: height,
        fit: fit,
        // 门户原图 1600x900，缩放到卡片尺寸时默认 low 会发虚，medium 更接近原生观感
        filterQuality: FilterQuality.medium,
        errorBuilder: (_, _, _) => _placeholder(),
        loadingBuilder: (_, child, progress) {
          if (progress == null) return child;
          return Container(
            width: width,
            height: height,
            color: Colors.black12,
            alignment: Alignment.center,
            child: const SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          );
        },
      ),
    );
  }

  Widget _placeholder() => Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(radius),
          gradient: const LinearGradient(
            colors: [Color(0xFFCFD9DF), Color(0xFFE2EBF0)],
          ),
        ),
        alignment: Alignment.center,
        child: const Icon(Icons.image_outlined, color: Colors.white70),
      );
}

/// 空状态
class EmptyView extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? action;

  const EmptyView({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 56, color: Theme.of(context).disabledColor),
            const SizedBox(height: 12),
            Text(title, style: const TextStyle(fontSize: 15)),
            if (subtitle != null) ...[
              const SizedBox(height: 6),
              Text(
                subtitle!,
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: Theme.of(context).disabledColor),
              ),
            ],
            if (action != null) ...[const SizedBox(height: 16), action!],
          ],
        ),
      ),
    );
  }
}

/// 分区标题
class SectionTitle extends StatelessWidget {
  final String title;
  final String? more;
  final VoidCallback? onMore;

  const SectionTitle({super.key, required this.title, this.more, this.onMore});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 12, 8),
      child: Row(
        children: [
          Container(
            width: 3,
            height: 14,
            decoration: BoxDecoration(
              color: Brand.of(appState.flavor).app,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              title,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
          ),
          if (more != null)
            TextButton(
              onPressed: onMore,
              child: Text(more!, style: const TextStyle(fontSize: 12)),
            ),
        ],
      ),
    );
  }
}
