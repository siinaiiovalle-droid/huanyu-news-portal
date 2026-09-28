$u = "https://pixabay.com/images/search/t-shirt/"
try { $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 25; Write-Output "OK $($r.StatusCode) $($r.Content.Length)" } catch { Write-Output "FAIL" }
