import 'package:flutter/material.dart';

import '../../core/mock.dart';
import '../../core/models.dart';
import '../../state/app_state.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common.dart';
import 'chat_page.dart';
import 'interaction_page.dart';

/// 会话列表：
/// 中国版 = 微信（搜索框 + 会话条目 + 底部 4 Tab 气泡整合在本页顶部）
/// 国际版 = Telegram（抽屉 + 圆形头像 + 悬浮写信按钮）
/// 顶部统一提供「互动消息」入口：视频评论、点赞、关注、开播、订单都会汇聚到这里
class ChatListPage extends StatelessWidget {
  const ChatListPage({super.key});

  @override
  Widget build(BuildContext context) => appState.flavor.isCn ? _weixin(context) : _telegram(context);

  // ---------------- 微信风格 ----------------
  Widget _weixin(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(appState.flavor.imName),
        actions: [
          IconButton(icon: const Icon(Icons.search), onPressed: () {}),
          IconButton(icon: const Icon(Icons.add_circle_outline), onPressed: () {}),
        ],
      ),
      drawer: _buildDrawer(context),
      body: ListView(
        children: [
          // 搜索框
          Container(
            color: const Color(0xFFEDEDED),
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
            child: Container(
              height: 34,
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(6)),
              alignment: Alignment.center,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.search, size: 15, color: Theme.of(context).hintColor),
                  const SizedBox(width: 4),
                  Text('搜索', style: TextStyle(fontSize: 13, color: Theme.of(context).hintColor)),
                ],
              ),
            ),
          ),
          _InteractEntryCard(),
          ...Mock.sessions.map((s) => _WeixinRow(session: s)),
        ],
      ),
    );
  }

  // ---------------- Telegram 风格 ----------------
  Widget _telegram(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final cardColor = dark ? const Color(0xFF17212B) : Colors.white;
    final muted = dark ? const Color(0xFF7A8A99) : const Color(0xFF8A8A8A);

    return Scaffold(
      appBar: AppBar(
        title: Text(appState.flavor.imName),
        leading: Builder(
          builder: (ctx) => IconButton(
            icon: const Icon(Icons.menu),
            onPressed: () => Scaffold.of(ctx).openDrawer(),
          ),
        ),
        actions: [
          IconButton(icon: const Icon(Icons.search), onPressed: () {}),
        ],
      ),
      drawer: _buildDrawer(context),
      floatingActionButton: FloatingActionButton(
        onPressed: () {},
        backgroundColor: Brand.of(appState.flavor).app,
        child: const Icon(Icons.edit, color: Colors.white),
      ),
      body: ListView(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
            child: Container(
              height: 38,
              decoration: BoxDecoration(
                color: dark ? const Color(0xFF0F1A24) : const Color(0xFFF0F2F5),
                borderRadius: BorderRadius.circular(18),
              ),
              alignment: Alignment.centerLeft,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: Row(
                children: [
                  Icon(Icons.search, size: 17, color: muted),
                  const SizedBox(width: 8),
                  Text('Search', style: TextStyle(fontSize: 14, color: muted)),
                ],
              ),
            ),
          ),
          _InteractEntryCard(),
          Container(color: cardColor, child: Column(children: Mock.sessions.map((s) => _TelegramRow(session: s)).toList())),
          const SizedBox(height: 80),
        ],
      ),
    );
  }

  Widget _buildDrawer(BuildContext context) {
    final cn = appState.flavor.isCn;
    return Drawer(
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          DrawerHeader(
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: [Brand.of(appState.flavor).app, Brand.of(appState.flavor).app.withValues(alpha: 0.7)]),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                const SeedAvatar(text: '寰', seed: ColorSeed(Color(0xFFFFFFFF), Color(0xFFBDBDBD)), size: 52, radius: 26),
                const SizedBox(height: 8),
                Text(appState.userName, style: const TextStyle(color: Colors.white, fontSize: 16)),
                Text(
                  cn ? '寰宇号：${appState.userId}' : 'Huanyu ID: ${appState.userId}',
                  style: const TextStyle(color: Colors.white70, fontSize: 12),
                ),
              ],
            ),
          ),
          ListTile(leading: const Icon(Icons.person_outline), title: Text(cn ? '个人资料' : 'Profile'), onTap: () => Navigator.pop(context)),
          ListTile(leading: const Icon(Icons.settings_outlined), title: Text(cn ? '设置' : 'Settings'), onTap: () => Navigator.pop(context)),
          ListTile(leading: const Icon(Icons.nightlight_outlined), title: Text(cn ? '夜间模式' : 'Night mode'), onTap: () => Navigator.pop(context)),
        ],
      ),
    );
  }
}

/// 互动消息入口（评论/点赞/关注/开播/订单）
class _InteractEntryCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final brand = Brand.of(appState.flavor);
    return ListenableBuilder(
      listenable: appState,
      builder: (context, _) {
        final unread = appState.unreadInteractions;
        final preview = appState.interactions.first;
        return InkWell(
          onTap: () {
            appState.markInteractionsRead();
            Navigator.push(context, MaterialPageRoute(builder: (_) => const InteractionPage()));
          },
          child: Container(
            margin: const EdgeInsets.only(bottom: 6),
            color: Theme.of(context).cardColor,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              children: [
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    SeedAvatar(
                      text: cn ? '互' : 'AT',
                      seed: ColorSeed(brand.video, brand.video.withValues(alpha: 0.6)),
                      size: 40,
                      radius: cn ? 4 : 20,
                    ),
                    if (unread > 0)
                      Positioned(
                        right: -4,
                        top: -2,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                          constraints: const BoxConstraints(minWidth: 16),
                          decoration: const BoxDecoration(
                            color: Color(0xFFFA5151),
                            borderRadius: BorderRadius.all(Radius.circular(9)),
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            unread > 99 ? '99+' : '$unread',
                            style: const TextStyle(color: Colors.white, fontSize: 9),
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        cn ? '互动消息' : 'Activity',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w400, letterSpacing: 0),
                      ),
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              '${preview.displayUser(cn)}: ${preview.text}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 13,
                                color: dark ? const Color(0xFF7A8A99) : const Color(0xFFB2B2B2),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            _when(preview.time),
                            style: TextStyle(fontSize: 11, color: dark ? const Color(0xFF6C7A89) : const Color(0xFFB2B2B2)),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  static String _when(DateTime time) {
    final now = DateTime.now();
    if (time.year != now.year) {
      return '${time.year}/${time.month.toString().padLeft(2, '0')}';
    }
    if (time.month != now.month || time.day != now.day) {
      return '${time.month}/${time.day}';
    }
    return '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';
  }
}

class _WeixinRow extends StatelessWidget {
  final ChatSession session;

  const _WeixinRow({required this.session});

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    return InkWell(
      onTap: () => _open(context, session),
      child: Container(
        color: Theme.of(context).cardColor,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                SeedAvatar(text: session.avatarText, seed: session.seed, size: 40, radius: 4),
                if (session.unread > 0)
                  Positioned(
                    right: -5,
                    top: -5,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                      constraints: const BoxConstraints(minWidth: 16),
                      decoration: const BoxDecoration(
                        color: Color(0xFFFA5151),
                        borderRadius: BorderRadius.all(Radius.circular(9)),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        session.unread > 99 ? '99+' : '${session.unread}',
                        style: const TextStyle(color: Colors.white, fontSize: 9),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Container(
                constraints: const BoxConstraints(minHeight: 44),
                alignment: Alignment.centerLeft,
                decoration: const BoxDecoration(
                  border: Border(bottom: BorderSide(color: Color(0xFFF0F0F0), width: 0.5)),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(session.displayName(cn), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 16)),
                    const SizedBox(height: 3),
                    Text(
                      session.displayLast(cn),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 13, color: Color(0xFFB2B2B2)),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(left: 4),
              child: Text(
                '${session.time.hour.toString().padLeft(2, '0')}:${session.time.minute.toString().padLeft(2, '0')}',
                style: const TextStyle(fontSize: 11, color: Color(0xFFB2B2B2)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _open(BuildContext context, ChatSession s) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => ChatPage(session: s)));
  }
}

class _TelegramRow extends StatelessWidget {
  final ChatSession session;

  const _TelegramRow({required this.session});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final muted = dark ? const Color(0xFF7A8A99) : const Color(0xFF8A8A8A);
    final cn = appState.flavor.isCn;

    return InkWell(
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ChatPage(session: session))),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        child: Row(
          children: [
            SeedAvatar(text: session.avatarText, seed: session.seed, size: 52, radius: 26),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          session.displayName(cn),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
                        ),
                      ),
                      if (session.pinned) Icon(Icons.push_pin, size: 13, color: muted),
                      const SizedBox(width: 6),
                      Text(
                        '${session.time.hour.toString().padLeft(2, '0')}:${session.time.minute.toString().padLeft(2, '0')}',
                        style: TextStyle(fontSize: 11, color: muted),
                      ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          session.displayLast(cn),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 14, color: muted),
                        ),
                      ),
                      if (session.unread > 0)
                        Container(
                          margin: const EdgeInsets.only(left: 8),
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                          constraints: const BoxConstraints(minWidth: 20),
                          decoration: const BoxDecoration(
                            color: Color(0xFF3390EC),
                            borderRadius: BorderRadius.all(Radius.circular(11)),
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            '${session.unread}',
                            style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w500),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
