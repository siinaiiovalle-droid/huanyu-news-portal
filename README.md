# 寰宇新闻网 · GitHub Pages 静态版

由 `npm run build:static` 自动生成，请勿手改（下次构建会覆盖）。

- 页面：index / channel / article / video / search / square / admin
- 数据：169 篇稿件、98 条广场动态，预渲染为 api/v1/**.json（591 个文件）
- 图片：9 个素材文件随包发布
- 交互：发帖、点赞、评论、后台登录为本地模拟，存在浏览器 localStorage，不回写服务器

## 发布（需先 gh auth login）

```powershell
powershell -ExecutionPolicy Bypass -File ..\scripts\publish-gh-pages.ps1 -Repo <仓库名>
```

脚本会自动建仓库、推送并在 Settings → Pages 里开启 main / root，
随后访问 `https://<用户名>.github.io/<仓库名>/`（首次构建约 1-3 分钟）。

手动发布也可：在本目录 `git init -b main && git add -A && git commit -m "静态站点"`，
推送后到仓库 Settings → Pages → Source 选 `main` / `/root`。
