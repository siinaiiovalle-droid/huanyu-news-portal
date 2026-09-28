import 'dart:io';

/// 移动端 / 桌面端实现（dart:io 可用）
String webBaseUrl() => 'http://127.0.0.1:3000';

/// 端上默认的门户服务地址：
/// - Android 模拟器访问宿主机要用 `10.0.2.2`（127.0.0.1 是模拟器自己）
/// - 桌面端/其它端用 127.0.0.1
/// - 真机请用 `flutter run --dart-define=API_BASE=http://<局域网IP>:3000` 覆盖
String defaultApiBase() => Platform.isAndroid ? 'http://10.0.2.2:3000' : 'http://127.0.0.1:3000';
