import 'package:flutter/material.dart';

import '../../state/app_state.dart';
import '../../theme/app_theme.dart';
import '../im/chat_list_page.dart';
import '../life/life_page.dart';
import '../me/profile_page.dart';
import '../news/home_page.dart';
import '../shop/shop_page.dart';
import '../video/video_feed_page.dart';

/// 主框架：六个业务入口（新闻 / 视频 / 商城 / 本地生活 / 消息 / 我的）
/// 用 IndexedStack 保持各 Tab 状态，避免切换时丢失滚动位置
class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;

  final List<Widget> _pages = const [
    NewsHomePage(),
    VideoFeedPage(),
    ShopPage(),
    LifePage(),
    ChatListPage(),
    ProfilePage(),
  ];

  @override
  Widget build(BuildContext context) {
    final brand = Brand.of(appState.flavor);
    final cn = appState.flavor.isCn;

    // 消费跨模块的 Tab 跳转请求（如视频页返回键回到新闻）
    final req = appState.tabRequest;
    if (req != null && req != _index) {
      _index = req;
      WidgetsBinding.instance.addPostFrameCallback((_) => appState.consumeTabRequest());
    }

    return Scaffold(
      body: IndexedStack(index: _index, children: _pages),
      bottomNavigationBar: ListenableBuilder(
        listenable: appState,
        builder: (context, _) => BottomNavigationBar(
          currentIndex: _index,
          type: BottomNavigationBarType.fixed,
          onTap: (i) => setState(() => _index = i),
          items: [
            BottomNavigationBarItem(
              icon: const Icon(Icons.article_outlined),
              activeIcon: Icon(Icons.article, color: brand.news),
              label: cn ? '新闻' : 'News',
            ),
            BottomNavigationBarItem(
              icon: const Icon(Icons.play_circle_outline),
              activeIcon: Icon(Icons.play_circle, color: brand.video),
              label: cn ? '视频' : 'Reels',
            ),
            BottomNavigationBarItem(
              icon: const Icon(Icons.shopping_bag_outlined),
              activeIcon: Icon(Icons.shopping_bag, color: brand.shop),
              label: cn ? '商城' : 'Shop',
            ),
            BottomNavigationBarItem(
              icon: const Icon(Icons.local_offer_outlined),
              activeIcon: Icon(Icons.local_offer, color: brand.life),
              label: cn ? '生活' : 'Deals',
            ),
            BottomNavigationBarItem(
              icon: Badge(
                isLabelVisible: appState.totalUnread > 0,
                label: Text('${appState.totalUnread > 99 ? 99 : appState.totalUnread}'),
                child: const Icon(Icons.chat_bubble_outline),
              ),
              activeIcon: Badge(
                isLabelVisible: appState.totalUnread > 0,
                label: Text('${appState.totalUnread > 99 ? 99 : appState.totalUnread}'),
                child: Icon(Icons.chat_bubble, color: brand.im),
              ),
              label: cn ? '消息' : 'Chats',
            ),
            BottomNavigationBarItem(
              icon: const Icon(Icons.person_outline),
              activeIcon: const Icon(Icons.person),
              label: cn ? '我的' : 'Profile',
            ),
          ],
        ),
      ),
    );
  }
}
