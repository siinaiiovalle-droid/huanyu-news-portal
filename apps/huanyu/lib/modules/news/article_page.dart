import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/models.dart';
import '../../state/app_state.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common.dart';

/// 稿件详情：标题 + 元信息 + 正文块（图片/段落）
class ArticlePage extends StatefulWidget {
  final Article article;

  const ArticlePage({super.key, required this.article});

  @override
  State<ArticlePage> createState() => _ArticlePageState();
}

class _ArticlePageState extends State<ArticlePage> {
  late Article _article;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _article = widget.article;
    _loadDetail();
  }

  Future<void> _loadDetail() async {
    final full = await ApiClient(apiBaseUrl).article(_article.id);
    if (!mounted) return;
    setState(() {
      if (full != null) _article = full;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final brand = Brand.of(appState.flavor);
    return Scaffold(
      appBar: AppBar(
        title: Text(_article.source.isEmpty ? '详情' : _article.source),
        actions: [
          IconButton(icon: const Icon(Icons.share_outlined), onPressed: () {}),
          IconButton(icon: const Icon(Icons.more_horiz), onPressed: () {}),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
        children: [
          Text(
            _article.title,
            style: TextStyle(
              fontSize: 22,
              height: 1.4,
              fontWeight: FontWeight.w700,
              color: dark ? Colors.white : const Color(0xFF1A1A1A),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: brand.app.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(3),
                ),
                child: Text(
                  ChannelDef.nameOf(_article.channel, appState.flavor.isCn),
                  style: TextStyle(fontSize: 11, color: brand.app),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                _article.source,
                style: TextStyle(fontSize: 12, color: dark ? const Color(0xFF8A9AA9) : const Color(0xFF8A8A8A)),
              ),
              const SizedBox(width: 8),
              Text(
                _article.timeLabel,
                style: TextStyle(fontSize: 12, color: dark ? const Color(0xFF8A9AA9) : const Color(0xFF8A8A8A)),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (_article.summary.isNotEmpty)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: dark ? const Color(0xFF101921) : const Color(0xFFF5F7FA),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                _article.summary,
                style: TextStyle(
                  fontSize: 14,
                  height: 1.6,
                  color: dark ? const Color(0xFFB0BEC5) : const Color(0xFF5A5A5A),
                ),
              ),
            ),
          if (_article.cover.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: NetImage(
                url: _article.coverUrl(apiBaseUrl),
                width: double.infinity,
                height: 210,
                radius: 10,
                fit: BoxFit.cover,
              ),
            ),
          const SizedBox(height: 16),
          if (_loading)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            )
          else
            ..._article.content.map((b) => _BlockView(block: b, dark: dark)),
          if (!_loading && _article.content.isEmpty)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: Text('暂无正文')),
            ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Container(
          height: 52,
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: dark ? const Color(0xFF101921) : const Color(0xFFEBEBEB))),
          ),
          child: Row(
            children: [
              const SizedBox(width: 16),
              Expanded(
                child: TextField(
                  decoration: const InputDecoration(
                    hintText: '说点什么…',
                    isCollapsed: true,
                    prefixIcon: Icon(Icons.edit_outlined, size: 18),
                  ),
                  style: const TextStyle(fontSize: 14),
                ),
              ),
              IconButton(icon: const Icon(Icons.comment_outlined), onPressed: () {}),
              IconButton(icon: const Icon(Icons.star_border), onPressed: () {}),
              IconButton(icon: const Icon(Icons.share_outlined), onPressed: () {}),
            ],
          ),
        ),
      ),
    );
  }
}

class _BlockView extends StatelessWidget {
  final ContentBlock block;
  final bool dark;

  const _BlockView({required this.block, required this.dark});

  @override
  Widget build(BuildContext context) {
    final color = dark ? const Color(0xFFD5DDE5) : const Color(0xFF2B2B2B);
    if (block.type == 'image') {
      return Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: NetImage(
          url: block.url.startsWith('http') ? block.url : '$apiBaseUrl/${block.url.replaceFirst(RegExp(r'^/'), '')}',
          width: double.infinity,
          height: 220,
          radius: 8,
        ),
      );
    }
    final text = block.text.trim();
    if (text.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Text(
        text,
        style: TextStyle(fontSize: 16, height: 1.85, color: color),
      ),
    );
  }
}
