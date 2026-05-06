
[Reflection.Assembly]::LoadWithPartialName("System.Drawing") | Out-Null
$files = @("shark1.png", "shark2.png", "sharkjumbo.png")
foreach ($f in $files) {
    $path = "d:\Test\tembak_ikan\public\assets\coolfish\$f"
    if (Test-Path $path) {
        $img = [System.Drawing.Image]::FromFile($path)
        Write-Host "$f - Width: $($img.Width), Height: $($img.Height)"
        $img.Dispose()
    }
}
