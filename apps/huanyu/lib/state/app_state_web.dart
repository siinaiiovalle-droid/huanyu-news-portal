/// Web 端实现：浏览器直连本机服务（后端已开启 CORS，见 server/lib/http.js）
/// 真机上则是 App 进程直连，配合 adb reverse 使用 127.0.0.1
String webBaseUrl() => 'http://127.0.0.1:3000';

/// Web 端同源即可，无需基址
String defaultApiBase() => '';
