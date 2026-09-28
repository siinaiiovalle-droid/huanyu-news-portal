import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../../core/mock.dart';
import '../../core/models.dart';
import '../../state/app_state.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common.dart';
import '../shop/shop_page.dart';
import 'comments_sheet.dart';

/// 短视频 / 直播：
/// 中国版 = 抖音（顶部 关注/推荐/同城）
/// 国际版 = TikTok（顶部 Following/For You/Live）
/// 播放：走 video_player 真实解码（assets/videos/*.mp4，720p）
class VideoFeedPage extends StatefulWidget {
  /// 从订单/消息跳转进来时定位到指定视频
  final int initialIndex;

  const VideoFeedPage({super.key, this.initialIndex = 0});

  @override
  State<VideoFeedPage> createState() => _VideoFeedPageState();
}

class _VideoFeedPageState extends State<VideoFeedPage> {
  int _tab = 1;
  int _current = 0;
  late final PageController _controller;

  @override
  void initState() {
    super.initState();
    _current = widget.initialIndex;
    _controller = PageController(initialPage: widget.initialIndex);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    return Scaffold(
      extendBodyBehindAppBar: true,
      body: Stack(
        children: [
          PageView.builder(
            controller: _controller,
            scrollDirection: Axis.vertical,
            itemCount: Mock.videos.length,
            onPageChanged: (i) => setState(() => _current = i),
            itemBuilder: (context, i) => _VideoCard(
              video: Mock.videos[i],
              active: i == _current,
            ),
          ),
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            left: 0,
            right: 0,
            child: cn ? _douyinTabs() : _tiktokTabs(),
          ),
          Positioned(
            top: MediaQuery.of(context).padding.top + 4,
            left: 4,
            child: OverlayBackButton(fallback: () => appState.jumpToTab(0)),
          ),
        ],
      ),
    );
  }

  Widget _douyinTabs() => Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          _tabText('关注', 0),
          const SizedBox(width: 18),
          _tabText('推荐', 1),
          const SizedBox(width: 18),
          _tabText('同城', 2),
          const SizedBox(width: 18),
          const Icon(Icons.search, color: Colors.white70, size: 20),
        ],
      );

  Widget _tiktokTabs() => Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          _tabText('Following', 0),
          const SizedBox(width: 16),
          _tabText('For You', 1),
          const SizedBox(width: 16),
          _tabText('Live', 2),
          const SizedBox(width: 16),
          const Icon(Icons.search, color: Colors.white70, size: 20),
        ],
      );

  Widget _tabText(String text, int index) {
    final active = _tab == index;
    return GestureDetector(
      onTap: () => setState(() => _tab = index),
      child: Column(
        children: [
          Text(
            text,
            style: TextStyle(
              color: active ? Colors.white : Colors.white60,
              fontSize: active ? 17 : 15,
              fontWeight: active ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
          if (active)
            Container(
              margin: const EdgeInsets.only(top: 3),
              width: 18,
              height: 2,
              color: Colors.white,
            ),
        ],
      ),
    );
  }
}

class _VideoCard extends StatefulWidget {
  final VideoItem video;
  final bool active;

  const _VideoCard({required this.video, required this.active});

  @override
  State<_VideoCard> createState() => _VideoCardState();
}

class _VideoCardState extends State<_VideoCard> {
  VideoPlayerController? _ctl;
  bool _ready = false;
  bool _failed = false;
  bool _paused = false;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    if (widget.video.asset.isEmpty) {
      setState(() => _failed = true);
      return;
    }
    final c = VideoPlayerController.asset(widget.video.asset);
    _ctl = c;
    try {
      await c.initialize();
      await c.setLooping(true);
      if (!mounted) return;
      setState(() => _ready = true);
      if (widget.active) await c.play();
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  void didUpdateWidget(covariant _VideoCard old) {
    super.didUpdateWidget(old);
    if (old.active != widget.active && _ready) {
      widget.active && !_paused ? _ctl?.play() : _ctl?.pause();
    }
  }

  @override
  void dispose() {
    _ctl?.dispose();
    super.dispose();
  }

  void _togglePlay() {
    if (!_ready) return;
    setState(() => _paused = !_paused);
    _paused ? _ctl?.pause() : _ctl?.play();
  }

  @override
  Widget build(BuildContext context) {
    final cn = appState.flavor.isCn;
    final brand = Brand.of(appState.flavor);
    final goods = Mock.products.where((p) => widget.video.productIds.contains(p.id)).toList();
    final hasVideo = _ready && !_failed;

    return Stack(
      fit: StackFit.expand,
      children: [
        // ---- 播放层 / 兜底层 ----
        Positioned.fill(
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: _togglePlay,
            child: hasVideo
                ? Container(
                    color: Colors.black,
                    child: FittedBox(
                      fit: BoxFit.cover,
                      child: SizedBox(
                        width: _ctl!.value.size.width,
                        height: _ctl!.value.size.height,
                        child: VideoPlayer(_ctl!),
                      ),
                    ),
                  )
                : Container(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [widget.video.seed.a, widget.video.seed.b],
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                      ),
                    ),
                    child: Center(
                      child: _failed
                          ? Icon(Icons.play_circle_outline, size: 64, color: Colors.white.withValues(alpha: 0.5))
                          : const CircularProgressIndicator(color: Colors.white70, strokeWidth: 2),
                    ),
                  ),
          ),
        ),

        // ---- 播放/暂停指示 ----
        if (_paused && hasVideo)
          const Center(
            child: Icon(Icons.play_arrow, size: 72, color: Colors.white70),
          ),

        // ---- 底部渐隐 ----
        Positioned.fill(
          child: IgnorePointer(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [Colors.transparent, Colors.transparent, Colors.black.withValues(alpha: 0.55)],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  stops: const [0.0, 0.5, 1.0],
                ),
              ),
            ),
          ),
        ),

        // ---- 右侧操作栏 ----
        Positioned(
          right: 10,
          bottom: 96,
          child: ListenableBuilder(
            listenable: appState,
            builder: (context, _) {
              final liked = appState.isVideoLiked(widget.video.id);
              final likeCount = widget.video.likes + (liked ? 1 : 0);
              final commentCount = widget.video.comments + appState.commentCountOf(widget.video.id);
              return Column(
                children: [
                  Stack(
                    clipBehavior: Clip.none,
                    children: [
                      SeedAvatar(
                        text: widget.video.displayAuthor(cn).characters.first,
                        seed: widget.video.seed,
                        size: 46,
                        radius: cn ? 23 : 14,
                      ),
                      Positioned(
                        bottom: -8,
                        left: 12,
                        child: Container(
                          width: 22,
                          height: 22,
                          decoration: BoxDecoration(color: brand.video, shape: BoxShape.circle),
                          child: const Icon(Icons.add, size: 14, color: Colors.white),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  InkWell(
                    onTap: () => appState.toggleLike(widget.video.id, widget.video.displayTitle(cn)),
                    child: _Action(
                      icon: liked ? Icons.favorite : Icons.favorite_border,
                      label: _fmt(likeCount),
                      color: liked ? brand.video : Colors.white,
                    ),
                  ),
                  const SizedBox(height: 16),
                  InkWell(
                    onTap: () => CommentsSheet.show(context, widget.video),
                    child: _Action(icon: Icons.comment_outlined, label: _fmt(commentCount)),
                  ),
                  const SizedBox(height: 16),
                  InkWell(
                    onTap: () {},
                    child: _Action(icon: Icons.star_outlined, label: widget.video.shares.toString()),
                  ),
                  const SizedBox(height: 16),
                  InkWell(
                    onTap: () {},
                    child: const _Action(icon: Icons.share_outlined, label: '分享'),
                  ),
                  if (goods.isNotEmpty) ...[
                    const SizedBox(height: 20),
                    InkWell(
                      onTap: () => _openGoods(context, goods, cn),
                      child: Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.16),
                          borderRadius: BorderRadius.circular(cn ? 8 : 22),
                        ),
                        alignment: Alignment.center,
                        child: const Icon(Icons.shopping_bag_outlined, color: Colors.white, size: 22),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      cn ? '购物车' : 'Bag',
                      style: const TextStyle(color: Colors.white70, fontSize: 11),
                    ),
                  ],
                  const SizedBox(height: 14),
                  const _SpinningDisc(),
                ],
              );
            },
          ),
        ),

        // ---- 左下信息区 ----
        Positioned(
          left: 14,
          right: 80,
          bottom: 30,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(
                    '@${widget.video.displayAuthor(cn)}',
                    style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w700),
                  ),
                  if (widget.video.live) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: brand.video,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        cn ? 'LIVE · ${_fmt(widget.video.viewers)}人在看' : 'LIVE · ${_fmt(widget.video.viewers)}',
                        style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ] else ...[
                    const SizedBox(width: 8),
                    OutlinedButton(
                      onPressed: () {},
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: Colors.white70),
                        minimumSize: const Size(52, 24),
                        padding: EdgeInsets.zero,
                      ),
                      child: Text(cn ? '+ 关注' : 'Follow', style: const TextStyle(color: Colors.white, fontSize: 11)),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 8),
              Text(
                widget.video.displayTitle(cn),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Colors.white, fontSize: 14, height: 1.4),
              ),
              const SizedBox(height: 6),
              Text(
                '${widget.video.displayDesc(cn)} ${widget.video.tags.map((t) => '#$t').join(' ')}',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Colors.white70, fontSize: 12, height: 1.4),
              ),
              if (goods.isNotEmpty) ...[
                const SizedBox(height: 10),
                GestureDetector(
                  onTap: () => _openGoods(context, goods, cn),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.45),
                      borderRadius: BorderRadius.circular(cn ? 6 : 20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          widget.video.live ? Icons.shopping_bag : Icons.shopping_cart_outlined,
                          size: 14,
                          color: Colors.white,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          cn
                              ? '${widget.video.live ? '购物袋' : '购物车'} · ${goods.length} 件宝贝'
                              : '${goods.length} items',
                          style: const TextStyle(color: Colors.white, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),

        // ---- 进度条 ----
        if (hasVideo)
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: VideoProgressIndicator(
              _ctl!,
              allowScrubbing: true,
              colors: VideoProgressColors(
                playedColor: brand.video,
                bufferedColor: Colors.white.withValues(alpha: 0.4),
                backgroundColor: Colors.white.withValues(alpha: 0.15),
              ),
              padding: EdgeInsets.zero,
            ),
          ),
      ],
    );
  }

  void _openGoods(BuildContext context, List<Product> goods, bool cn) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => _GoodsSheet(
        video: widget.video,
        goods: goods,
        cn: cn,
      ),
    );
  }

  static String _fmt(int n) =>
      n >= 10000 ? '${(n / 10000).toStringAsFixed(1)}w' : (n >= 1000 ? '${(n / 1000).toStringAsFixed(1)}k' : '$n');
}

/// 视频购物车 / 直播间购物袋
class _GoodsSheet extends StatelessWidget {
  final VideoItem video;
  final List<Product> goods;
  final bool cn;

  const _GoodsSheet({required this.video, required this.goods, required this.cn});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final brand = Brand.of(appState.flavor);
    return Container(
      height: MediaQuery.of(context).size.height * 0.6,
      decoration: BoxDecoration(
        color: dark ? const Color(0xFF17212B) : Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
      ),
      child: Column(
        children: [
          const SizedBox(height: 8),
          Container(width: 36, height: 4, color: Colors.grey.withValues(alpha: 0.3)),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 8, 10),
            child: Row(
              children: [
                Icon(video.live ? Icons.shopping_bag_outlined : Icons.shopping_cart_outlined,
                    size: 18, color: brand.video),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    cn
                        ? (video.live ? '直播购物袋 · ${goods.length} 件' : '视频同款 · ${goods.length} 件')
                        : 'Products · ${goods.length}',
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close, size: 20),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: goods.length,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (context, i) {
                final p = goods[i];
                return Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: dark ? const Color(0xFF101921) : const Color(0xFFF7F8FA),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 62,
                        height: 62,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(8),
                          gradient: LinearGradient(colors: [p.seed.a, p.seed.b]),
                        ),
                        alignment: Alignment.center,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                          decoration: BoxDecoration(
                            color: brand.video,
                            borderRadius: BorderRadius.circular(3),
                          ),
                          child: Text(
                            video.live ? (cn ? '直播价' : 'Live') : (cn ? '同款' : 'Same'),
                            style: const TextStyle(color: Colors.white, fontSize: 9),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              p.displayTitle(cn),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 13, height: 1.35),
                            ),
                            const SizedBox(height: 6),
                            Row(
                              children: [
                                Text(
                                  '¥${p.price.toStringAsFixed(2)}',
                                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: brand.video),
                                ),
                                if (p.origin > 0) ...[
                                  const SizedBox(width: 6),
                                  Text(
                                    '¥${p.origin.toStringAsFixed(0)}',
                                    style: const TextStyle(
                                      fontSize: 11,
                                      color: Color(0xFF9E9E9E),
                                      decoration: TextDecoration.lineThrough,
                                    ),
                                  ),
                                ],
                              ],
                            ),
                            const SizedBox(height: 2),
                            Text(
                              cn ? '${p.displayShop(cn)} · 已售 ${p.sold}' : '${p.sold} sold',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 10, color: dark ? const Color(0xFF7A8A99) : const Color(0xFF9E9E9E)),
                            ),
                          ],
                        ),
                      ),
                      FilledButton(
                        style: FilledButton.styleFrom(
                          backgroundColor: brand.video,
                          minimumSize: const Size(62, 32),
                          padding: EdgeInsets.zero,
                        ),
                        onPressed: () {
                          Navigator.pop(context);
                          Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => ProductPage(
                                product: p,
                                source: video.live ? OrderSource.live : OrderSource.video,
                                videoId: video.id,
                                videoTitle: video.displayTitle(cn),
                              ),
                            ),
                          );
                        },
                        child: Text(cn ? '去购买' : 'Buy', style: const TextStyle(fontSize: 12)),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _Action extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;

  const _Action({required this.icon, required this.label, this.color = Colors.white});

  @override
  Widget build(BuildContext context) => Column(
        children: [
          Icon(icon, color: color, size: 32),
          const SizedBox(height: 3),
          Text(label, style: const TextStyle(color: Colors.white, fontSize: 11)),
        ],
      );
}

class _SpinningDisc extends StatefulWidget {
  const _SpinningDisc();

  @override
  State<_SpinningDisc> createState() => _SpinningDiscState();
}

class _SpinningDiscState extends State<_SpinningDisc> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 6),
  )..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => RotationTransition(
        turns: _c,
        child: Container(
          width: 40,
          height: 40,
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            gradient: LinearGradient(colors: [Color(0xFF2B2B2B), Color(0xFF555555)]),
          ),
          alignment: Alignment.center,
          child: const Icon(Icons.music_note, color: Colors.white, size: 18),
        ),
      );
}
