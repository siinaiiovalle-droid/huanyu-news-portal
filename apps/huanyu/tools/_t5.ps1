$u = "https://api.openverse.org/v1/images/?q=tshirt&page_size=3"
try { $r = Invoke-RestMethod -Uri $u -TimeoutSec 25; Write-Output "OK $($r.result_count)" } catch { Write-Output "FAIL" }
