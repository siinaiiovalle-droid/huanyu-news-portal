import 'package:flutter/material.dart';
import '../../core/mock.dart';
import '../../core/models.dart';
import '../../state/app_state.dart';
import '../../theme/app_theme.dart';

/// 小程序中心（对标微信小程序）：搜索 + 最近使用 + 我的小程序 + 分类
/// 说明：微信小程序的完整形态需要「双线程运行时 + JS 引擎 + 原生能力桥接 + 分包/热更新」，
/// 本页提供宿主入口与管理界面，运行时层见 MiniAppRunner 的占位实现。
class MiniAppsPage extends StatelessWidget {
  const MiniAppsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final brand = Brand.of(appState.flavor);
    return Scaffold(
      appBar: AppBar(
        title: const Text('小程序'),
        actions: [
          IconButton(icon: const Icon(Icons.search_outlined), onPressed: () {}),
          IconButton(icon: const Icon(Icons.more_horiz), onPressed: () {}),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(14),
        children: [
          TextField(
            decoration: InputDecoration(
              hintText: '搜索小程序',
              prefixIcon: const Icon(Icons.search, size: 18),
              isCollapsed: true,
            ),
            style: const TextStyle(fontSize: 14),
          ),
          const SizedBox(height: 16),
          const Text('最近使用', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          const SizedBox(height: 10),
          SizedBox(
            height: 92,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: Mock.miniApps.length,
              separatorBuilder: (_, _) => const SizedBox(width: 12),
              itemBuilder: (context, i) => _MiniIcon(app: Mock.miniApps[i]),
            ),
          ),
          const SizedBox(height: 18),
          const Text('我的小程序', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          const SizedBox(height: 10),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 4,
              mainAxisSpacing: 12,
              crossAxisSpacing: 8,
            ),
            itemCount: Mock.miniApps.length,
            itemBuilder: (context, i) => _MiniIcon(app: Mock.miniApps[i], showName: true),
          ),
          const SizedBox(height: 18),
          const Text('分类', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: Mock.miniApps
                .map((a) => a.category)
                .toSet()
                .map((c) => Chip(
                      label: Text(c, style: const TextStyle(fontSize: 12)),
                      backgroundColor: brand.mini.withValues(alpha: 0.1),
                    ))
                .toList(),
          ),
        ],
      ),
    );
  }
}

class _MiniIcon extends StatelessWidget {
  final MiniApp app;
  final bool showName;

  const _MiniIcon({required this.app, this.showName = false});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => MiniAppRunner(app: app)),
      ),
      child: SizedBox(
        width: 76,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                gradient: LinearGradient(colors: [app.seed.a, app.seed.b]),
              ),
              child: Icon(app.icon, color: Colors.white, size: 26),
            ),
            if (showName) ...[
              const SizedBox(height: 6),
              Text(
                app.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 11),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// 小程序运行时容器（占位）
/// 生产实现路径：
///   1) 渲染层：WebView（现已跨端可用）+ 逻辑层：独立 JS 引擎（QuickJS / JavaScriptCore）
///   2) 双线程通信：JSBridge + NativeApi（setData 走批量合并）
///   3) 权限与鉴权：小程序 appId + 用户授权态，统一走宿主 App 的登录态
///   4) 分包与热更新：小程序包 CDN 分发 + 版本号灰度
class MiniAppRunner extends StatelessWidget {
  final MiniApp app;

  const MiniAppRunner({super.key, required this.app});

  @override
  Widget build(BuildContext context) {
    final brand = Brand.of(appState.flavor);
    return Scaffold(
      appBar: AppBar(
        title: Text(app.name),
        actions: [
          IconButton(icon: const Icon(Icons.more_horiz), onPressed: () {}),
        ],
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 76,
                height: 76,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  gradient: LinearGradient(colors: [app.seed.a, app.seed.b]),
                ),
                child: Icon(app.icon, color: Colors.white, size: 36),
              ),
              const SizedBox(height: 14),
              Text(app.name, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
              const SizedBox(height: 6),
              Text(app.desc, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, color: Color(0xFF9E9E9E))),
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: brand.mini.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('运行时状态', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    SizedBox(height: 8),
                    Text('· 渲染层：WebView（跨端可用）', style: TextStyle(fontSize: 12, height: 1.6)),
                    Text('· 逻辑层：JS 引擎待接入（QuickJS）', style: TextStyle(fontSize: 12, height: 1.6)),
                    Text('· 通信层：JSBridge 待接入', style: TextStyle(fontSize: 12, height: 1.6)),
                    Text('· 鉴权：复用宿主登录态', style: TextStyle(fontSize: 12, height: 1.6)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
