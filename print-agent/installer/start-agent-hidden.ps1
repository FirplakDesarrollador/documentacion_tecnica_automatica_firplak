$ErrorActionPreference = "Stop"

$AgentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Runner = Join-Path $AgentDir "run-agent.cmd"

Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c `"$Runner`"" `
    -WorkingDirectory $AgentDir `
    -WindowStyle Hidden `
    -Wait
