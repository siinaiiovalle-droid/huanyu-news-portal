import 'package:flutter/material.dart';
import '../../core/models.dart';
import '../../state/app_state.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common.dart';

/// 视频 / 直播评论区
/// 发布的评论会同步进入「消息」中心的互动消息，并可从那里回跳到本视频
class CommentsSheet extends StatefulWidget {
  final VideoItem video;

  const CommentsSheet({super.key, required this.video});

  static Future<void> show(BuildContext context, VideoItem video) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => CommentsSheet(video: video),
    );
  }

  @override
  State<CommentsSheet> createState() => _CommentsSheetState();
}

class _CommentsSheetState extends State<CommentsSheet> {
  final TextEditingController _ctrl = TextEditingController();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _submit() {
    final text = _ctrl.text.trim();
    if (text.isEmpty) return;
    appState.addComment(widget.video.id, widget.video.displayTitle(appState.flavor.isCn), text);
    _ctrl.clear();
    FocusScope.of(context).unfocus();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(appState.flavor.isCn
            ? '评论已发布，可在「消息」中查看回复'
            : 'Comment posted, see it in Chats'),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final bg = dark ? const Color(0xFF17212B) : Colors.white;
    final brand = Brand.of(appState.flavor);

    return Container(
      height: MediaQuery.of(context).size.height * 0.72,
      decoration: BoxDecoration(
        color: bg,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
      ),
      child: Column(
        children: [
          const SizedBox(height: 8),
          Container(width: 36, height: 4, color: Colors.grey.withValues(alpha: 0.3)),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(
              children: [
                Text(
                  cn ? '${appState.commentCountOf(widget.video.id)} 条评论' : '${appState.commentCountOf(widget.video.id)} comments',
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.close, size: 20),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: ListenableBuilder(
              listenable: appState,
              builder: (context, _) {
                final list = appState.commentsOf(widget.video.id);
                return ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: list.length,
                  itemBuilder: (context, i) {
                    final c = list[i];
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SeedAvatar(text: c.author.characters.first, seed: c.seed, size: 34, radius: cn ? 6 : 17),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Text(
                                      c.author,
                                      style: TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w500,
                                        color: dark ? const Color(0xFF7A8A99) : const Color(0xFF8A8A8A),
                                      ),
                                    ),
                                    if (c.pinned) ...[
                                      const SizedBox(width: 6),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                                        decoration: BoxDecoration(
                                          color: brand.video.withValues(alpha: 0.14),
                                          borderRadius: BorderRadius.circular(3),
                                        ),
                                        child: Text(
                                          cn ? '置顶' : 'Pinned',
                                          style: TextStyle(fontSize: 10, color: brand.video),
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(c.text, style: const TextStyle(fontSize: 14, height: 1.5)),
                                const SizedBox(height: 4),
                                Row(
                                  children: [
                                    Text(
                                      _timeLabel(c.time),
                                      style: TextStyle(fontSize: 11, color: dark ? const Color(0xFF6C7A89) : const Color(0xFFB0B0B0)),
                                    ),
                                    const SizedBox(width: 14),
                                    Text(
                                      cn ? '回复' : 'Reply',
                                      style: TextStyle(fontSize: 11, color: dark ? const Color(0xFF6C7A89) : const Color(0xFF999999)),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          GestureDetector(
                            onTap: () => appState.toggleCommentLike(c.id),
                            child: Column(
                              children: [
                                Icon(
                                  c.liked ? Icons.favorite : Icons.favorite_border,
                                  size: 17,
                                  color: c.liked ? brand.video : (dark ? const Color(0xFF7A8A99) : const Color(0xFF999999)),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  '${c.likes}',
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: dark ? const Color(0xFF7A8A99) : const Color(0xFF999999),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                );
              },
            ),
          ),
          SafeArea(
            top: false,
            child: Container(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              decoration: BoxDecoration(
                border: Border(top: BorderSide(color: dark ? const Color(0xFF101921) : const Color(0xFFEFEFEF))),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _ctrl,
                      decoration: InputDecoration(
                        hintText: cn ? '善语结善缘，恶言伤人心…' : 'Add a comment...',
                        isCollapsed: true,
                      ),
                      style: const TextStyle(fontSize: 14),
                      onSubmitted: (_) => _submit(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    style: FilledButton.styleFrom(
                      backgroundColor: brand.video,
                      minimumSize: const Size(64, 36),
                      padding: EdgeInsets.zero,
                    ),
                    onPressed: _submit,
                    child: Text(cn ? '发送' : 'Post', style: const TextStyle(fontSize: 13)),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  static String _timeLabel(DateTime t) {
    final d = DateTime.now().difference(t);
    if (d.inMinutes < 1) return '刚刚';
    if (d.inMinutes < 60) return '${d.inMinutes}分钟前';
    if (d.inHours < 24) return '${d.inHours}小时前';
    return '${t.month}月${t.day}日';
  }
}
