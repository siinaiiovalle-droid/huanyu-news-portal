import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/models.dart';
import '../../state/app_state.dart';
import '../../theme/app_theme.dart';
import '../../theme/flavor_switch.dart';
import '../../widgets/common.dart';
import 'article_page.dart';
import 'offline_articles.dart';

/// 新闻首页：频道 Tab + 信息流（接本机 /api/v1/feed）
class NewsHomePage extends StatefulWidget {
  const NewsHomePage({super.key});

  @override
  State<NewsHomePage> createState() => _NewsHomePageState();
}

class _NewsHomePageState extends State<NewsHomePage> with SingleTickerProviderStateMixin {
  late final TabController _tab;
  late final ApiClient _api;
  final Map<String, List<Article>> _cache = {};
  final Map<String, bool> _loading = {};
  /// true = 本机新闻服务不可达，当前展示内置离线稿件
  bool _offline = false;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: ChannelDef.all.length, vsync: this);
    _api = ApiClient(apiBaseUrl);
    _load('');
    _tab.addListener(() {
      if (!_tab.indexIsChanging) _load(ChannelDef.all[_tab.index].id);
    });
  }

  Future<void> _load(String channel) async {
    if (_loading[channel] == true) return;
    setState(() => _loading[channel] = true);
    var list = await _api.feed(channel: channel, pageSize: 20);
    if (!mounted) return;
    final offline = list.isEmpty;
    if (offline) {
      // 服务不可达 / 无数据：回退到内置离线稿件，保证新闻板块永远有内容
      final all = offlineArticles();
      list = channel.isEmpty ? all : all.where((a) => a.channel == channel).toList();
    }
    setState(() {
      _cache[channel] = list;
      _loading[channel] = false;
      if (channel.isEmpty || _offline) _offline = offline;
    });
  }

  @override
  Widget build(BuildContext context) {
    final brand = Brand.of(appState.flavor);
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: Row(
          children: [
            Container(
              width: 26,
              height: 26,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(6),
                gradient: LinearGradient(colors: [brand.app, brand.app.withValues(alpha: 0.6)]),
              ),
              alignment: Alignment.center,
              child: const Text('寰', style: TextStyle(color: Colors.white, fontSize: 15)),
            ),
            const SizedBox(width: 8),
            const Text('寰宇新闻'),
          ],
        ),
        actions: [
          IconButton(
            tooltip: '切换界面风格',
            icon: const Icon(Icons.style_outlined),
            onPressed: () => _showFlavorSheet(context),
          ),
          IconButton(
            tooltip: '搜索',
            icon: const Icon(Icons.search_outlined),
            onPressed: () {},
          ),
        ],
        bottom: TabBar(
          controller: _tab,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          padding: const EdgeInsets.symmetric(horizontal: 8),
          tabs: ChannelDef.all.map((c) => Tab(text: c.name)).toList(),
        ),
      ),
      body: Column(
        children: [
          if (_offline) const _OfflineTip(),
          Expanded(
            child: TabBarView(
        controller: _tab,
        children: ChannelDef.all.map((c) => _FeedList(
              channel: c.id,
              articles: _cache[c.id] ?? const [],
              loading: _loading[c.id] == true,
              onRefresh: () => _load(c.id),
              onOpen: (a) => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => ArticlePage(article: a)),
              ),
            )).toList(),
            ),
          ),
        ],
      ),
    );
  }

  void _showFlavorSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text('界面风格', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
            ),
            ListTile(
              leading: const Icon(Icons.flag_circle_outlined),
              title: const Text('中国版'),
              subtitle: const Text('寰宇畅聊 · 寰宇支付 · 寰宇短视频'),
              trailing: appState.flavor.isCn ? const Icon(Icons.check) : null,
              onTap: () {
                FlavorSwitch.switchTo(context, UiFlavor.cn);
                Navigator.pop(context);
              },
            ),
            ListTile(
              leading: const Icon(Icons.public),
              title: const Text('国际版'),
              subtitle: const Text('Huanyu Talk · Huanyu Pay · Huanyu Reels'),
              trailing: !appState.flavor.isCn ? const Icon(Icons.check) : null,
              onTap: () {
                FlavorSwitch.switchTo(context, UiFlavor.global);
                Navigator.pop(context);
              },
            ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }
}

class _FeedList extends StatelessWidget {
  final String channel;
  final List<Article> articles;
  final bool loading;
  final Future<void> Function() onRefresh;
  final void Function(Article) onOpen;

  const _FeedList({
    required this.channel,
    required this.articles,
    required this.loading,
    required this.onRefresh,
    required this.onOpen,
  });

  @override
  Widget build(BuildContext context) {
    if (loading && articles.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (articles.isEmpty) {
      return EmptyView(
        icon: Icons.wifi_off_outlined,
        title: '暂时没有内容',
        subtitle: '请确认本机服务已启动：npm start（端口 3000）\n真机调试需先执行 adb reverse tcp:3000 tcp:3000',
        action: FilledButton.tonal(onPressed: onRefresh, child: const Text('重新加载')),
      );
    }
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView.separated(
        padding: const EdgeInsets.only(bottom: 24),
        itemCount: articles.length,
        separatorBuilder: (_, _) => const Divider(height: 1),
        itemBuilder: (context, i) => _NewsCard(article: articles[i], onTap: () => onOpen(articles[i])),
      ),
    );
  }
}

class _NewsCard extends StatelessWidget {
  final Article article;
  final VoidCallback onTap;

  const _NewsCard({required this.article, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final hasCover = article.cover.isNotEmpty;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    article.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 16,
                      height: 1.35,
                      fontWeight: FontWeight.w500,
                      color: dark ? Colors.white : const Color(0xFF1A1A1A),
                    ),
                  ),
                  if (article.summary.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(
                      article.summary,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13,
                        height: 1.4,
                        color: dark ? const Color(0xFF8A9AA9) : const Color(0xFF8A8A8A),
                      ),
                    ),
                  ],
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      if (article.channel.isNotEmpty)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                          decoration: BoxDecoration(
                            color: Brand.of(appState.flavor).app.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(3),
                          ),
                          child: Text(
                            ChannelDef.nameOf(article.channel, appState.flavor.isCn),
                            style: TextStyle(
                              fontSize: 10,
                              color: Brand.of(appState.flavor).app,
                            ),
                          ),
                        ),
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text(
                          article.source,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 11, color: dark ? const Color(0xFF7A8A99) : const Color(0xFF9E9E9E)),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        article.timeLabel,
                        style: TextStyle(fontSize: 11, color: dark ? const Color(0xFF7A8A99) : const Color(0xFF9E9E9E)),
                      ),
                      const Spacer(),
                      Text(
                        '${article.views} 阅读',
                        style: TextStyle(fontSize: 11, color: dark ? const Color(0xFF7A8A99) : const Color(0xFF9E9E9E)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            if (hasCover) ...[
              const SizedBox(width: 12),
              NetImage(
                url: article.coverUrl(apiBaseUrl),
                width: 116,
                height: 76,
                radius: 6,
              ),
              // keep
            ],
          ],
        ),
      ),
    );
  }
}

class _OfflineTip extends StatelessWidget {
  const _OfflineTip();

  @override
  Widget build(BuildContext context) {
    final c = Brand.of(appState.flavor).app;
    return Container(
      width: double.infinity,
      color: c.withValues(alpha: 0.12),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
      child: Row(
        children: [
          Icon(Icons.info_outline, size: 14, color: c),
          const SizedBox(width: 6),
          Expanded(child: Text(_tip, style: TextStyle(fontSize: 11, color: c))),
        ],
      ),
    );
  }
}

const _tip = '本机新闻服务未连通，当前为内置示例内容；启动 npm start 后下拉刷新即可同步。';
