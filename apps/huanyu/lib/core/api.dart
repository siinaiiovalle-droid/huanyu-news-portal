import 'dart:convert';
import 'package:http/http.dart' as http;
import 'models.dart';

/// 新闻中台 API 客户端（复用现有一期接口）
/// 真机联调：adb reverse tcp:3000 tcp:3000 后，App 侧 127.0.0.1:3000 即宿主机服务
class ApiClient {
  final String baseUrl;

  ApiClient(this.baseUrl);

  Uri _u(String path, [Map<String, String>? q]) {
    final p = path.startsWith('/') ? path : '/$path';
    if (baseUrl.isEmpty) {
      // Web 同源
      return Uri(path: p, queryParameters: q);
    }
    return Uri.parse('$baseUrl$p').replace(queryParameters: q);
  }

  Future<dynamic> _get(String path, [Map<String, String>? q]) async {
    final res = await http.get(_u(path, q)).timeout(const Duration(seconds: 12));
    if (res.statusCode != 200) throw Exception('HTTP ${res.statusCode}');
    final body = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
    if (body['ok'] == false) throw Exception('${body['error'] ?? '接口错误'}');
    return body['data'];
  }

  /// 首页聚合（头条 / 频道块 / 热榜）
  Future<Map<String, dynamic>?> home() async {
    try {
      final d = await _get('/api/v1/home');
      return d is Map ? d.map((k, v) => MapEntry(k.toString(), v)) : null;
    } catch (_) {
      return null;
    }
  }

  /// 信息流（cursor 分页）
  Future<List<Article>> feed({String channel = '', int cursor = 0, int pageSize = 20}) async {
    try {
      final d = await _get('/api/v1/feed', {
        if (channel.isNotEmpty) 'channel': channel,
        'cursor': '$cursor',
        'pageSize': '$pageSize',
      });
      final list = (d is Map ? d['list'] : null) as List? ?? const [];
      return list.map((e) => Article.fromJson((e as Map).cast<String, dynamic>())).toList();
    } catch (_) {
      return const [];
    }
  }

  /// 稿件详情（含正文块）
  Future<Article?> article(String id) async {
    try {
      final d = await _get('/api/v1/news/$id');
      if (d is! Map) return null;
      final raw = (d['article'] as Map?)?.cast<String, dynamic>();
      if (raw == null) return null;
      return Article.fromJson(raw);
    } catch (_) {
      return null;
    }
  }

  /// 增量同步（App 端离线缓存用）
  Future<List<Article>> sync({String since = ''}) async {
    try {
      final d = await _get('/api/v1/sync', {'since': since, 'limit': '50'});
      final list = (d is Map ? (d['changed'] ?? d['list']) : null) as List? ?? const [];
      return list.map((e) => Article.fromJson((e as Map).cast<String, dynamic>())).toList();
    } catch (_) {
      return const [];
    }
  }
}
