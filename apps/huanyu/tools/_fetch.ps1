$tmp = "assets/shop/_raw"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$h = @{ 'User-Agent' = 'Mozilla/5.0'; 'Accept' = 'application/json' }
$qs = [ordered]@{
  p1 = 'plain t-shirt'; p2 = 'wireless earbuds'; p3 = 'coffee beans'
  p4 = 'fitness band'; p5 = 'hardcover books'; p6 = 'leather bag'
  p7 = 'blender'; p8 = 'snack box'; p9 = 'running shoes'; p10 = 'monitor stand'
}
foreach ($k in $qs.Keys) {
  $u = "https://api.openverse.org/v1/images/?q=" + [uri]::EscapeDataString($qs[$k]) + "&page_size=30&mature=false"
  try {
    Start-Sleep -Seconds 4
    $r = Invoke-RestMethod -Uri $u -TimeoutSec 30 -Headers $h
    $n = 0
    $r.results | Where-Object { $_.url -match '\.jpe?g$' -and $_.width -ge 1000 -and $_.height -ge 1000 } | ForEach-Object {
      if ($n -lt 3) {
        $n = $n + 1
        $out = Join-Path $tmp ($k + "_" + $n + ".jpg")
        try {
          Invoke-WebRequest -Uri $_.url -OutFile $out -TimeoutSec 60
          Write-Output "  saved $out"
        } catch { Write-Output "  dl fail" }
      }
    }
  } catch { Write-Output "$k => FAIL $($_.Exception.Message)" }
}


