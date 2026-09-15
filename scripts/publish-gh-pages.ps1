<#
.SYNOPSIS
把静态包 gh-pages/ 发布成一个 GitHub 仓库并开启 GitHub Pages。

.PREREQUISITE
1. 安装 GitHub CLI：winget install --id GitHub.cli
2. 登录：gh auth login（或设置环境变量 GH_TOKEN）

.EXAMPLE
powershell -ExecutionPolicy Bypass -File scripts/publish-gh-pages.ps1 -Repo huanyu-news-portal
#>
param(
    [string]$Repo = 'huanyu-news-portal',
    [switch]$Private
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$site = Join-Path $root 'gh-pages'

# 1. 确保静态包已生成
if (-not (Test-Path (Join-Path $site 'index.html'))) {
    Write-Host '未找到静态包，先执行 npm run build:static …'
    & npm --prefix $root run build:static
    if ($LASTEXITCODE -ne 0) { throw '静态包构建失败' }
}

# 2. 确认 GitHub 身份
gh auth status *> $null
if ($LASTEXITCODE -ne 0) { throw 'gh 未登录，请先执行 gh auth login' }
$owner = (gh api user --jq '.login').Trim()
Write-Host "GitHub 账号：$owner"

# 3. 静态包作为独立仓库提交
Push-Location $site
if (-not (Test-Path '.git')) { git init -b main | Out-Null }
git add -A
git commit -m "静态站点 $(Get-Date -Format 'yyyy-MM-dd HH:mm')" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host '没有新的改动，直接推送' }

# 4. 建仓库并推送
$visibility = if ($Private) { '--private' } else { '--public' }
$exists = $true
gh repo view "$owner/$Repo" *> $null
if ($LASTEXITCODE -ne 0) { $exists = $false }

if ($exists) {
    git remote remove origin 2>&1 | Out-Null
    git remote add origin "https://github.com/$owner/$Repo.git"
    git push -u origin main
} else {
    gh repo create $Repo $visibility --source=. --remote=origin --push
}
if ($LASTEXITCODE -ne 0) { Pop-Location; throw '推送失败' }
Pop-Location

# 5. 开启 GitHub Pages（已开启则改为更新配置）
gh api --method POST "repos/$owner/$Repo/pages" -f 'source[branch]=main' -f 'source[path]=/' *> $null
if ($LASTEXITCODE -ne 0) {
    gh api --method PUT "repos/$owner/$Repo/pages" -f 'source[branch]=main' -f 'source[path]=/' *> $null
}

$url = "https://$owner.github.io/$Repo/"
Write-Host ''
Write-Host "仓库：https://github.com/$owner/$Repo" -ForegroundColor Cyan
Write-Host "站点：$url" -ForegroundColor Cyan
Write-Host 'Pages 首次构建约需 1-3 分钟，期间访问可能 404，稍等再刷新。' -ForegroundColor Yellow
