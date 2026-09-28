$u = "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=filetype:bitmap%20coffee%20beans&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url&iiurlwidth=1400"
$r = Invoke-RestMethod -Uri $u -TimeoutSec 30
foreach ($p in $r.query.pages.PSObject.Properties) {
  Write-Output $p.Name
  Write-Output $p.Value.title
  Write-Output $p.Value.imageinfo[0].thumburl
}
