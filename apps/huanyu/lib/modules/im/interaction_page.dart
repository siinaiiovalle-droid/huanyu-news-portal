import 'package:flutter/material.dart';

import '../../core/models.dart';
import '../../state/app_state.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common.dart';
import '../video/video_feed_page.dart';

/// 互动消息：视频评论、点赞、关注、开播提醒、视频/直播带来的订单
/// 每条都能回跳到对应的视频或直播间
class InteractionPage extends StatelessWidget {
  const InteractionPage({super.key});

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final card = dark ? const Color(0xFF17212B) : Colors.white;

    return Scaffold(
      appBar: AppBar(
        title: Text(cn ? '互动消息' : 'Activity'),
        leading: const AppBackButton(),
        leadingWidth: 44,
        actions: [
          TextButton(
            onPressed: () => appState.markInteractionsRead(),
            child: Text(cn ? '全部已读' : 'Mark all read'),
          ),
        ],
      ),
      body: ListenableBuilder(
        listenable: appState,
        builder: (context, _) {
          final list = appState.interactions;
          return ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: list.length,
            itemBuilder: (context, i) {
              final m = list[i];
              return Card(
                margin: const EdgeInsets.only(bottom: 10),
                elevation: 0,
                color: card,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () => _openVideo(context, m.videoId),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Stack(
                          children: [
                            SeedAvatar(text: m.avatarText, seed: m.seed, size: 42, radius: cn ? 4 : 21),
                            Positioned(
                              right: -2,
                              bottom: -2,
                              child: Container(
                                width: 18,
                                height: 18,
                                decoration: BoxDecoration(
                                  color: _colorOf(m.type),
                                  shape: BoxShape.circle,
                                  border: Border.all(color: card, width: 1.5),
                                ),
                                child: Icon(_iconOf(m.type), size: 11, color: Colors.white),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      m.displayUser(cn),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                                    ),
                                  ),
                                  if (!m.read)
                                    Container(
                                      width: 7,
                                      height: 7,
                                      decoration: const BoxDecoration(color: Color(0xFFFA5151), shape: BoxShape.circle),
                                    ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Text(m.text, style: const TextStyle(fontSize: 13, height: 1.45)),
                              const SizedBox(height: 8),
                              Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: dark ? const Color(0xFF101921) : const Color(0xFFF7F8FA),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Row(
                                  children: [
                                    Icon(Icons.play_circle_outline, size: 14, color: Brand.of(appState.flavor).video),
                                    const SizedBox(width: 6),
                                    Expanded(
                                      child: Text(
                                        m.videoTitle,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(fontSize: 11, color: Color(0xFF8A8A8A)),
                                      ),
                                    ),
                                    Icon(Icons.chevron_right, size: 14, color: Theme.of(context).disabledColor),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 6),
                              Row(
                                children: [
                                  Text(_labelOf(m.type, cn), style: TextStyle(fontSize: 11, color: _colorOf(m.type))),
                                  const Spacer(),
                                  Text(
                                    '${m.time.hour.toString().padLeft(2, '0')}:${m.time.minute.toString().padLeft(2, '0')}',
                                    style: const TextStyle(fontSize: 11, color: Color(0xFFB2B2B2)),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }

  void _openVideo(BuildContext context, String videoId) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => VideoFeedPage(initialIndex: _index(videoId))),
    );
  }

  static int _index(String id) {
    const ids = ['v1', 'v2', 'v3', 'v4', 'v5'];
    final i = ids.indexOf(id);
    return i < 0 ? 0 : i;
  }

  static Color _colorOf(InteractType t) => switch (t) {
        InteractType.like => const Color(0xFFFE2C55),
        InteractType.comment => const Color(0xFF07C160),
        InteractType.follow => const Color(0xFF1677FF),
        InteractType.gift => const Color(0xFFFF9800),
        InteractType.live => const Color(0xFF9C27B0),
        InteractType.order => const Color(0xFFFE2C55),
      };

  static IconData _iconOf(InteractType t) => switch (t) {
        InteractType.like => Icons.favorite,
        InteractType.comment => Icons.comment,
        InteractType.follow => Icons.person_add,
        InteractType.gift => Icons.card_giftcard,
        InteractType.live => Icons.live_tv,
        InteractType.order => Icons.shopping_bag,
      };

  static String _labelOf(InteractType t, bool cn) => switch (t) {
        InteractType.like => cn ? '赞了你的作品' : 'Liked your post',
        InteractType.comment => cn ? '评论' : 'Comment',
        InteractType.follow => cn ? '关注' : 'Followed you',
        InteractType.gift => cn ? '送你礼物' : 'Sent a gift',
        InteractType.live => cn ? '开播提醒' : 'Live started',
        InteractType.order => cn ? '订单消息' : 'Order update',
      };
}
