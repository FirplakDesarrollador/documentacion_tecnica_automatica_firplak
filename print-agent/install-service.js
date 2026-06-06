// Installs the local print agent as a Windows auto-start entry.
// Run with the bundled runtime: runtime\node.exe install-service.js

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const agentDir = __dirname;
const nodePath = process.execPath;
const serverScript = path.join(agentDir, 'server.js');
const runAgentScript = path.join(agentDir, 'run-agent.cmd');
const startAgentHiddenScript = path.join(agentDir, 'start-agent-hidden.ps1');
const hasRunner = fs.existsSync(runAgentScript);
const hasHiddenRunner = fs.existsSync(startAgentHiddenScript);
const taskExecutable = hasHiddenRunner ? 'powershell.exe' : hasRunner ? 'cmd.exe' : nodePath;
const taskArguments = hasHiddenRunner
    ? `-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${startAgentHiddenScript}"`
    : hasRunner
      ? `/c "${runAgentScript}"`
      : `"${serverScript}"`;
const startupCommand = hasHiddenRunner
    ? `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${startAgentHiddenScript}"`
    : hasRunner
      ? `cmd.exe /c "${runAgentScript}"`
      : `"${nodePath}" "${serverScript}"`;
const taskName = 'SamiGenPrintAgent';
const runValueName = 'SamiGenPrintAgent';

function runPowerShell(script) {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    return execSync(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`, {
        encoding: 'utf-8',
        timeout: 15000,
    });
}

function psString(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
}

function registerTask(runLevel) {
    return runPowerShell(`
    try { Stop-ScheduledTask -TaskName "${taskName}" -ErrorAction SilentlyContinue | Out-Null } catch {}
    try { Unregister-ScheduledTask -TaskName "${taskName}" -Confirm:$false -ErrorAction SilentlyContinue | Out-Null } catch {}
    $action = New-ScheduledTaskAction -Execute "${taskExecutable}" -Argument "${taskArguments}" -WorkingDirectory "${agentDir}"
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -LogonType Interactive -RunLevel ${runLevel}
    Register-ScheduledTask -TaskName "${taskName}" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force
`);
}

function clearRunKey() {
    return runPowerShell(`
    Remove-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" -Name "${runValueName}" -ErrorAction SilentlyContinue
`);
}

function registerRunKey() {
    return runPowerShell(`
    $runKey = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
    New-Item -Path $runKey -Force | Out-Null
    Set-ItemProperty -Path $runKey -Name "${runValueName}" -Value ${psString(startupCommand)}
`);
}

function stopExistingAgents() {
    runPowerShell(`
    Get-CimInstance Win32_Process |
        Where-Object {
            $_.CommandLine -and
            $_.CommandLine -like "*server.js*" -and
            (
                $_.CommandLine -like "*SamiGenPrintAgent*" -or
                $_.CommandLine -like "*samigen-print-agent*" -or
                $_.CommandLine -like "*print-agent*"
            )
        } |
        ForEach-Object {
            try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
        }
`);
}

console.log('Installing SamiGen Print Agent scheduled task...');
console.log(`Directory: ${agentDir}`);
console.log(`Executable: ${taskExecutable}`);
console.log(`Arguments: ${taskArguments || '(none)'}`);
console.log('');

try {
    stopExistingAgents();
    clearRunKey();
    try {
        registerTask('Highest');
        console.log('Scheduled task created with RunLevel Highest.');
    } catch (err) {
        console.log('Highest failed. Retrying with Limited permissions...');
        console.log((err.stdout || err.message || '').trim());
        try {
            registerTask('Limited');
            console.log('Scheduled task created with RunLevel Limited.');
        } catch (limitedErr) {
            console.log('Limited failed. Registering per-user startup entry...');
            console.log((limitedErr.stdout || limitedErr.message || '').trim());
            registerRunKey();
            console.log('Startup entry created in HKCU Run.');
        }
    }
} catch (err) {
    console.error('Could not create the startup entry.');
    console.error((err.stdout || err.message || '').trim());
    process.exit(1);
}

console.log('');
console.log(`"${taskName}" will start automatically when the user logs in.`);
console.log('To uninstall:');
console.log('  uninstall-agent.cmd');
