@echo off
rem ============================================================
rem  每日同步入口（Windows 任务计划调用这个文件）
rem  把本地数据库 data\*.json 与本地图片 public\img\ 推到 GitHub，
rem  并重建静态站发布到 gh-pages，线上站点随即显示当天内容。
rem  详细说明见 scripts\sync-github.js
rem ============================================================
chcp 65001 >nul
setlocal
cd /d "%~dp0"

if not exist logs mkdir logs

rem 日志超过 5MB 就轮转一次，避免无限增长
for %%F in (logs\sync.log) do if %%~zF GTR 5242880 move /y "logs\sync.log" "logs\sync.log.1" >nul

echo. >> logs\sync.log
echo ===== %date% %time% 开始同步 ===== >> logs\sync.log
node scripts\sync-github.js >> logs\sync.log 2>&1
echo ----- %date% %time% 结束，退出码 %errorlevel% ----- >> logs\sync.log

endlocal
