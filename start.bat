@echo off
chcp 65001 >nul
title 寰宇新闻网 - 本地服务
cd /d %~dp0

if not exist "data\news.json" (
  echo [1/2] 首次运行，正在初始化演示数据...
  node scripts\seed.js
)

echo [2/2] 正在启动服务...
echo.
echo   门户首页 : http://localhost:3000/
echo   视频频道 : http://localhost:3000/video.html
echo   内容后台 : http://localhost:3000/admin.html  (admin / admin888)
echo   开放 API : http://localhost:3000/api/v1/home
echo.
echo 按 Ctrl+C 可停止服务。
echo.

node server\index.js
pause
