import 'package:flutter/material.dart';

import '../../core/models.dart';
import '../../state/app_state.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common.dart';

/// 聊天详情：
/// 中国版 = 微信（浅灰底 + 方形头像 + 绿色气泡）
/// 国际版 = Telegram（深色渐变底 + 圆形头像 + 深蓝气泡）
/// 消息存在 Store 里，发送后对方会模拟回复，订单/退款等业务动作也会往这里推消息
class ChatPage extends StatefulWidget {
  final ChatSession session;

  const ChatPage({super.key, required this.session});

  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> {
  final TextEditingController _ctrl = TextEditingController();
  final ScrollController _scroll = ScrollController();
  final FocusNode _fieldFocus = FocusNode();

  bool _pinned = false;
  bool _muted = false;

  @override
  void initState() {
    super.initState();
    _pinned = widget.session.pinned;
  }

  @override
  void dispose() {
    _fieldFocus.dispose();
    _ctrl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent + 80,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    });
  }

  Future<void> _send() async {
    final text = _ctrl.text.trim();
    if (text.isEmpty) return;
    _ctrl.clear();
    await appState.sendMessage(widget.session.id, text);
    _scrollToEnd();
  }

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    final session = widget.session;
    final name = session.displayName(cn);
    final brand = Brand.of(appState.flavor);

    final dark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        leading: const AppBackButton(),
        leadingWidth: 40,
        title: _headerTitle(cn, brand, name, dark),
        actions: _headerActions(cn, dark),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(46),
          child: _quickBar(cn, brand, dark),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListenableBuilder(
              listenable: appState,
              builder: (context, _) {
                final list = appState.messagesOf(session.id);
                _scrollToEnd();
                return cn ? _bubbleList(list, cn) : _telegramList(list, cn);
              },
            ),
          ),
          _inputBar(cn),
        ],
      ),
    );
  }

  String _hhmm(DateTime t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  // ---------------- 顶部：会话头部 ----------------

  /// 主标题区：头像 + 在线状态点 + 名称 + 身份标签 + 状态副标题
  Widget _headerTitle(bool cn, Brand brand, String name, bool dark) {
    final s = widget.session;
    final sub = dark ? const Color(0xFF8A98A6) : const Color(0xFF9A9A9A);
    final barColor = dark ? const Color(0xFF17212B) : Colors.white;

    return Row(
      children: [
        Stack(
          clipBehavior: Clip.none,
          children: [
            SeedAvatar(text: s.avatarText, seed: s.seed, size: 36, radius: cn ? 4 : 18),
            Positioned(
              right: -2,
              bottom: -2,
              child: Container(
                width: 11,
                height: 11,
                decoration: BoxDecoration(
                  color: const Color(0xFF31C759),
                  shape: BoxShape.circle,
                  border: Border.all(color: barColor, width: 2),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Row(
                children: [
                  Flexible(
                    child: Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 16.5, fontWeight: FontWeight.w600),
                    ),
                  ),
                  if (s.isGroup)
                    Padding(
                      padding: const EdgeInsets.only(left: 5),
                      child: Text('(7)', style: TextStyle(fontSize: 12.5, color: sub)),
                    ),
                  if (s.official)
                    Container(
                      margin: const EdgeInsets.only(left: 6),
                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                      decoration: BoxDecoration(
                        color: brand.im.withValues(alpha: 0.14),
                        borderRadius: BorderRadius.circular(3),
                      ),
                      child: Text(
                        cn ? '官方' : 'Official',
                        style: TextStyle(fontSize: 10, color: brand.im, fontWeight: FontWeight.w600),
                      ),
                    ),
                  if (_pinned)
                    Padding(
                      padding: const EdgeInsets.only(left: 5),
                      child: Icon(Icons.push_pin, size: 13, color: brand.app),
                    ),
                  if (_muted)
                    Padding(
                      padding: const EdgeInsets.only(left: 4),
                      child: Icon(Icons.notifications_off_outlined, size: 13, color: sub),
                    ),
                ],
              ),
              const SizedBox(height: 2),
              Text(
                _statusText(cn),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 12, color: sub),
              ),
            ],
          ),
        ),
      ],
    );
  }

  String _statusText(bool cn) {
    final s = widget.session;
    if (s.official) return cn ? '官方服务号 · 9:00-21:00 在线' : 'Official · online 9:00-21:00';
    if (s.isGroup) return cn ? '群聊 · 7 位成员' : 'Group · 7 members';
    return cn ? '在线 · 通常几分钟内回复' : 'online · usually replies in minutes';
  }

  /// 右上角动作：语音 / 视频通话 / 更多菜单
  List<Widget> _headerActions(bool cn, bool dark) {
    final color = dark ? Colors.white70 : const Color(0xFF4A4A4A);
    return [
      IconButton(
        icon: Icon(cn ? Icons.call_outlined : Icons.call, size: 21, color: color),
        onPressed: () => _toast(cn ? '已发起语音通话' : 'Voice call started'),
      ),
      if (cn)
        IconButton(
          icon: Icon(Icons.videocam_outlined, size: 22, color: color),
          onPressed: () => _toast('已发起视频通话'),
        ),
      PopupMenuButton<String>(
        icon: Icon(Icons.more_horiz, color: color),
        onSelected: (v) => _onMenu(v, cn),
        itemBuilder: (_) => [
          CheckedPopupMenuItem<String>(
            value: 'pin',
            checked: _pinned,
            child: Text(cn ? '置顶聊天' : 'Pin chat'),
          ),
          CheckedPopupMenuItem<String>(
            value: 'mute',
            checked: _muted,
            child: Text(cn ? '消息免打扰' : 'Mute'),
          ),
          PopupMenuItem<String>(
            value: 'search',
            child: Text(cn ? '查找聊天记录' : 'Search in chat'),
          ),
          PopupMenuItem<String>(
            value: 'clear',
            child: Text(cn ? '清空聊天记录' : 'Clear history'),
          ),
        ],
      ),
    ];
  }

  void _onMenu(String v, bool cn) {
    String? tip;
    setState(() {
      switch (v) {
        case 'pin':
          _pinned = !_pinned;
          tip = _pinned ? (cn ? '已置顶该会话' : 'Chat pinned') : (cn ? '已取消置顶' : 'Unpinned');
          break;
        case 'mute':
          _muted = !_muted;
          tip = _muted ? (cn ? '已开启消息免打扰' : 'Muted') : (cn ? '已关闭免打扰' : 'Unmuted');
          break;
        case 'search':
          tip = cn ? '聊天记录搜索（演示）' : 'Search in chat (demo)';
          break;
        case 'clear':
          tip = cn ? '聊天记录已清空（演示）' : 'History cleared (demo)';
          break;
      }
    });
    if (tip != null) _toast(tip!);
  }

  /// 标题栏下方的会话快捷条（官方号 = 快捷问题，群聊/单聊 = 常用入口）
  Widget _quickBar(bool cn, Brand brand, bool dark) {
    final items = _quickItems(cn);
    final bg = dark ? const Color(0xFF14202B) : const Color(0xFFF7F8FA);
    final chipBg = dark ? const Color(0xFF1E2C3A) : Colors.white;
    final chipFg = dark ? const Color(0xFFB7C3CF) : const Color(0xFF4A5560);
    final line = dark ? const Color(0xFF0F1922) : const Color(0xFFE4E8ED);

    return Container(
      height: 46,
      decoration: BoxDecoration(
        color: bg,
        border: Border(bottom: BorderSide(color: line, width: 0.5)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: items.length,
        separatorBuilder: (context, _) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final it = items[i];
          return Center(
            child: GestureDetector(
              onTap: () {
                if (it.draft != null) {
                  _sendQuick(it.draft!);
                } else {
                  _toast(cn ? '${it.label}（演示）' : '${it.label} (demo)');
                }
              },
              child: Container(
                height: 28,
                padding: const EdgeInsets.symmetric(horizontal: 11),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: chipBg,
                  borderRadius: BorderRadius.circular(cn ? 14 : 8),
                  border: Border.all(color: line),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(it.icon, size: 14, color: brand.app),
                    const SizedBox(width: 4),
                    Text(it.label, style: TextStyle(fontSize: 12.5, color: chipFg)),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  List<_QuickItem> _quickItems(bool cn) {
    final s = widget.session;
    if (s.official) {
      return cn
          ? const [
              _QuickItem(Icons.receipt_long_outlined, '查订单', '我想查一下订单'),
              _QuickItem(Icons.assignment_return_outlined, '退换货', '我要申请退货'),
              _QuickItem(Icons.request_quote_outlined, '开发票', '麻烦开一张发票'),
              _QuickItem(Icons.support_agent_outlined, '转人工', '转人工客服'),
            ]
          : const [
              _QuickItem(Icons.receipt_long_outlined, 'Order', 'Where is my order?'),
              _QuickItem(Icons.assignment_return_outlined, 'Refund', 'I need a refund'),
              _QuickItem(Icons.request_quote_outlined, 'Invoice', 'Invoice please'),
              _QuickItem(Icons.support_agent_outlined, 'Agent', 'Talk to an agent'),
            ];
    }
    if (s.isGroup) {
      return cn
          ? const [
              _QuickItem(Icons.campaign_outlined, '群公告', null),
              _QuickItem(Icons.group_outlined, '群成员', null),
              _QuickItem(Icons.photo_library_outlined, '群相册', null),
            ]
          : const [
              _QuickItem(Icons.campaign_outlined, 'Announcement', null),
              _QuickItem(Icons.group_outlined, 'Members', null),
              _QuickItem(Icons.photo_library_outlined, 'Media', null),
            ];
    }
    return cn
        ? const [
            _QuickItem(Icons.image_outlined, '图片', null),
            _QuickItem(Icons.place_outlined, '位置', null),
            _QuickItem(Icons.mic_none_outlined, '语音', null),
          ]
        : const [
            _QuickItem(Icons.image_outlined, 'Media', null),
            _QuickItem(Icons.place_outlined, 'Location', null),
            _QuickItem(Icons.mic_none_outlined, 'Voice', null),
          ];
  }

  void _sendQuick(String text) {
    _ctrl.text = text;
    _send();
  }

  void _toast(String text) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(text),
        duration: const Duration(seconds: 2),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  // ---------------- 微信气泡 ----------------
  Widget _bubbleList(List<ChatMessage> messages, bool cn) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFFF6F8FB), Color(0xFFEBEFF5)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: ListView.builder(
        controller: _scroll,
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 16),
        itemCount: messages.length,
        itemBuilder: (context, i) {
          final m = messages[i];
          return Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: m.isMe ? MainAxisAlignment.end : MainAxisAlignment.start,
              children: [
                if (!m.isMe)
                  SeedAvatar(text: widget.session.avatarText, seed: widget.session.seed, size: 38, radius: 4),
                if (m.isMe) const Spacer(flex: 1),
                Flexible(
                  flex: 6,
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                    decoration: BoxDecoration(
                      gradient: m.isMe ? const LinearGradient(colors: [Color(0xFF2E6BF6), Color(0xFF5B8CFF)]) : null,
                      color: m.isMe ? null : Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 6, offset: Offset(0, 2))],
                    ),
                    child: Column(
                      crossAxisAlignment: m.isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                      children: [
                        Text(
                          m.displayText(cn),
                          style: TextStyle(fontSize: 15, height: 1.45, color: m.isMe ? Colors.white : Colors.black87),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          _hhmm(m.time),
                          style: TextStyle(fontSize: 10, color: m.isMe ? Colors.white70 : const Color(0xFF9E9E9E)),
                        ),
                      ],
                    ),
                  ),
                ),
                if (!m.isMe) const Spacer(flex: 1),
                if (m.isMe)
                  const SeedAvatar(text: '我', seed: ColorSeed(Color(0xFF6EA8FF), Color(0xFF1677FF)), size: 38, radius: 4),
              ],
            ),
          );
        },
      ),
    );
  }

  // ---------------- Telegram 气泡 ----------------
  Widget _telegramList(List<ChatMessage> messages, bool cn) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF0E1621), Color(0xFF17212B)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: ListView.builder(
        controller: _scroll,
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 16),
        itemCount: messages.length,
        itemBuilder: (context, i) {
          final m = messages[i];
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              mainAxisAlignment: m.isMe ? MainAxisAlignment.end : MainAxisAlignment.start,
              children: [
                if (!m.isMe)
                  SeedAvatar(text: widget.session.avatarText, seed: widget.session.seed, size: 32, radius: 16),
                Flexible(
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 8),
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
                    decoration: BoxDecoration(
                      color: m.isMe ? const Color(0xFF2B5278) : const Color(0xFF182533),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (!m.isMe && !m.isMe)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 2),
                            child: Text(
                              widget.session.displayName(cn),
                              style: const TextStyle(fontSize: 12, color: Color(0xFF6EA8FF), fontWeight: FontWeight.w600),
                            ),
                          ),
                        Flexible(
                          child: Text(
                            m.displayText(cn),
                            softWrap: true,
                            style: const TextStyle(fontSize: 15, height: 1.4, color: Colors.white),
                          ),
                        ),
                        const SizedBox(height: 2),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              '${m.time.hour.toString().padLeft(2, '0')}:${m.time.minute.toString().padLeft(2, '0')}',
                              style: TextStyle(fontSize: 11, color: Colors.white.withValues(alpha: 0.55)),
                            ),
                            if (m.isMe) ...[
                              const SizedBox(width: 4),
                              const Icon(Icons.done_all, size: 13, color: Color(0xFF6EA8FF)),
                            ],
                          ],
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
    );
  }

  // ---------------- 输入栏 ----------------
  Widget _inputBar(bool cn) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final brand = Brand.of(appState.flavor);
    final sub = dark ? const Color(0xFF6B7A89) : const Color(0xFF6E7A87);
    final fieldColor = dark ? const Color(0xFF1E2B38) : Colors.white;
    final fieldBorder = dark ? const Color(0xFF27343F) : const Color(0xFFE1E7EE);
    // 底栏与会话背景同色，视觉上不再出现突兀的"白条"
    final barColor = dark ? const Color(0xFF15202A) : const Color(0xFFE9EDF2);
    return Container(
      color: barColor,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(6, 8, 8, 8),
          child: Row(
            children: [
              IconButton(
                onPressed: () => _fieldFocus.requestFocus(),
                visualDensity: VisualDensity.compact,
                icon: Icon(cn ? Icons.keyboard_voice_outlined : Icons.attach_file, size: 24, color: sub),
              ),
              Expanded(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => _fieldFocus.requestFocus(),
                  child: Container(
                    padding: const EdgeInsets.only(left: 14),
                    decoration: BoxDecoration(
                      color: fieldColor,
                      borderRadius: BorderRadius.circular(22),
                      border: Border.all(color: fieldBorder),
                    ),
                    child: TextField(
                      controller: _ctrl,
                      focusNode: _fieldFocus,
                      minLines: 1,
                      maxLines: 4,
                      cursorColor: brand.app,
                      style: TextStyle(fontSize: 15, color: dark ? Colors.white : Colors.black87),
                      decoration: InputDecoration(
                        hintText: cn ? '发消息…' : 'Write a message...',
                        hintStyle: TextStyle(fontSize: 15, color: dark ? const Color(0xFF5C6B7A) : const Color(0xFFA3ABB6)),
                        border: InputBorder.none,
                        isCollapsed: true,
                        contentPadding: const EdgeInsets.symmetric(vertical: 12),
                        suffixIcon: Icon(Icons.emoji_emotions_outlined, size: 22, color: sub),
                        suffixIconConstraints: const BoxConstraints(minWidth: 40, minHeight: 40),
                      ),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                ),
              ),
              ValueListenableBuilder<TextEditingValue>(
                valueListenable: _ctrl,
                builder: (context, v, _) {
                  final hasText = v.text.trim().isNotEmpty;
                  final Widget child;
                  if (hasText && cn) {
                    child = Container(
                      padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 9),
                      decoration: BoxDecoration(color: brand.app, borderRadius: BorderRadius.circular(19)),
                      child: const Text('发送', style: TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500)),
                    );
                  } else if (hasText) {
                    child = Container(
                      width: 36,
                      height: 36,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(color: brand.app, shape: BoxShape.circle),
                      child: const Icon(Icons.arrow_upward, size: 20, color: Colors.white),
                    );
                  } else {
                    child = Container(
                      width: 36,
                      height: 36,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: fieldColor,
                        shape: BoxShape.circle,
                        border: Border.all(color: fieldBorder),
                      ),
                      child: Icon(Icons.add_circle_outline, size: 24, color: sub),
                    );
                  }
                  return Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: GestureDetector(onTap: _send, child: child),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 顶部快捷条里的入口项；draft 非空时点击直接当作消息发送
class _QuickItem {
  final IconData icon;
  final String label;
  final String? draft;

  const _QuickItem(this.icon, this.label, this.draft);
}
