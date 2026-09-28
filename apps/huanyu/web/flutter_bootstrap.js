{{flutter_js}}
{{flutter_build_config}}

// CanvasKit（渲染引擎 wasm）默认从 www.gstatic.com 下载，内网/受限网络下会卡死白屏。
// 这里强制使用构建产物里自带的 canvaskit/，字体则由 App 内置 SimHei 提供，全站不再依赖 Google CDN。
_flutter.loader.load({
  config: {
    canvasKitBaseUrl: "/canvaskit/",
  },
});
