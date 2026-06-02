$instanceIdPattern = "USB\VID_2D84*PID_4CFB*"
$dev = Get-PnpDevice -InstanceId $instanceIdPattern | Where-Object { $_.Present -eq $true -and $_.Status -eq 'OK' }
if (-not $dev) { Write-Host "exit 1 - no dev"; exit 1 }
Write-Host "Dev found: $($dev.FriendlyName)"
exit 0
