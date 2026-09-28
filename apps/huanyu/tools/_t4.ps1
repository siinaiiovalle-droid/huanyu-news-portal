$u = "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=t-shirt&gsrlimit=3&prop=imageinfo&iiprop=url&iiurlwidth=1200"
try { $r = Invoke-RestMethod -Uri $u -TimeoutSec 25; Write-Output "OK $($r.query.pages.PSObject.Properties.Count)" } catch { Write-Output "FAIL" }
