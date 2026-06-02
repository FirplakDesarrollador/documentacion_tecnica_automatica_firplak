
$instanceIdPattern = "USB\VID_2D84*PID_4CFB*"
$dev = Get-PnpDevice -InstanceId $instanceIdPattern | Where-Object { $_.Present -eq $true -and $_.Status -eq 'OK' }
if (-not $dev) { exit 1 }

$key = "HKLM:\SYSTEM\CurrentControlSet\Control\Print\Monitors\USB Monitor\Ports"
try {
    $ports = Get-ChildItem $key -ErrorAction Stop
    foreach ($p in $ports) {
        $props = Get-ItemProperty $p.PSPath
        if ($props.'Device Id' -like "*VID_2D84*PID_4CFB*") {
            Write-Host $props.'Device Path'
            exit 0
        }
    }
} catch {}

exit 2
