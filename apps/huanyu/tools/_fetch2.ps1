$tmp = "assets/shop/_raw"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$uh = @{ 'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'; 'Referer' = 'https://commons.wikimedia.org/' }
$qs = [ordered]@{
  p1 = 't-shirt clothing'; p2 = 'earbuds headphones'; p3 = 'coffee beans'
  p4 = 'smart wristband'; p5 = 'hardcover books'; p6 = 'leather handbag'
  p7 = 'electric blender'; p8 = 'snack food box'; p9 = 'running shoe'
  p10 = 'computer monitor stand'
}
foreach ($k in $qs.Keys) {
  $s = [uri]::EscapeDataString($qs[$k])
  $u = "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=filetype:bitmap%20$s&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url&iiurlwidth=1400"
  $r = Invoke-RestMethod -Uri $u -TimeoutSec 30
  $n = 0
  foreach ($p in $r.query.pages.PSObject.Properties) {
    if ($n -ge 3) { break }
    $ii = $p.Value.imageinfo
    if ($null -eq $ii) { continue }
    $src = $ii[0].thumburl
    if (-not $src) { $src = $ii[0].url }
    if ($src.Split('?')[0] -notmatch '\.(jpg|jpeg|png)$') { continue }
    $n = $n + 1
    $out = Join-Path $tmp ($k + "_" + $n + ".jpg")
    Start-Sleep -Seconds 2
    Invoke-WebRequest -Uri $src -OutFile $out -TimeoutSec 60 -Headers $uh
    Write-Output "  got $out"
  }
  Write-Output "$k done $n"
}



