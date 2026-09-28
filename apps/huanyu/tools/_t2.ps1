$u = "https://unsplash.com/s/photos/tshirt"
try { $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 25; Write-Output "OK $($r.StatusCode) $($r.Content.Length)" } catch { Write-Output "FAIL $($_.Exception.Message)" }
