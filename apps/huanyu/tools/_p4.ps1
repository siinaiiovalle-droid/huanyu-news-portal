$uh = @{ 'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' }
$u = "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=filetype:bitmap%20smartwatch&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url&iiurlwidth=1400"
$r = Invoke-RestMethod -Uri $u -TimeoutSec 60 -Headers $uh
foreach ($p in $r.query.pages.PSObject.Properties) {
  $ii = $p.Value.imageinfo
  if ($null -eq $ii) { continue }
  $src = $ii[0].thumburl
  if (-not $src) { $src = $ii[0].url }
  if ($src.Split('?')[0] -notmatch '\.(jpg|jpeg|png)$') { continue }
  Start-Sleep -Seconds 2
  Invoke-WebRequest -Uri $src -OutFile "assets/shop/_raw/p4_3.jpg" -TimeoutSec 60 -Headers $uh
  Write-Output "ok $src"
  break
}
