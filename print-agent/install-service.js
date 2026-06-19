// Installs the local print agent as a Windows auto-start entry.
// Run with the bundled runtime: runtime\node.exe install-service.js

const { execFileSync } = require('child_process');
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
const startupFolder = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
    : null;
const startupBatchPath = startupFolder ? path.join(startupFolder, `${taskName}.cmd`) : null;
const startupBatchCommand = hasHiddenRunner
    ? `start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${startAgentHiddenScript}"`
    : hasRunner
      ? `start "" /min cmd.exe /c "${runAgentScript}"`
      : `start "" /min "${nodePath}" "${serverScript}"`;

function runPowerShell(script) {
    const wrappedScript = `
    $ProgressPreference = 'SilentlyContinue'
    ${script}
`;
    const encoded = Buffer.from(wrappedScript, 'utf16le').toString('base64');
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
        encoding: 'utf-8',
        timeout: 15000,
        windowsHide: true,
    });
}

function psString(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
}

function getErrorText(err) {
    return String(err.stdout || err.stderr || err.message || '')
        .replace(/#< CLIXML[\s\S]*$/g, '')
        .trim();
}

function runBestEffort(label, action) {
    try {
        action();
    } catch (err) {
        const detail = getErrorText(err);
        console.log(`${label} no se pudo completar; continuo con la instalacion.`);
        if (detail) console.log(detail);
    }
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
    $runKey = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
    if (Test-Path $runKey) {
        Remove-ItemProperty -Path $runKey -Name "${runValueName}" -ErrorAction SilentlyContinue
    }
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

function registerStartupFolder() {
    if (!startupFolder || !startupBatchPath) {
        throw new Error('APPDATA no esta disponible para registrar la carpeta Startup.');
    }

    fs.mkdirSync(startupFolder, { recursive: true });
    fs.writeFileSync(
        startupBatchPath,
        `@echo off\r\ncd /d "${agentDir}"\r\n${startupBatchCommand}\r\n`,
        'utf8'
    );
}

console.log('Installing SamiGen Print Agent scheduled task...');
console.log(`Directory: ${agentDir}`);
console.log(`Executable: ${taskExecutable}`);
console.log(`Arguments: ${taskArguments || '(none)'}`);
console.log('');

try {
    runBestEffort('Detener agentes anteriores', stopExistingAgents);
    runBestEffort('Limpiar inicio automatico anterior', clearRunKey);
    let startupMethod = null;

    try {
        registerTask('Highest');
        console.log('Scheduled task created with RunLevel Highest.');
        startupMethod = `scheduled task ${taskName} (Highest)`;
    } catch (err) {
        console.log('Highest failed. Retrying with Limited permissions...');
        console.log(getErrorText(err));
        try {
            registerTask('Limited');
            console.log('Scheduled task created with RunLevel Limited.');
            startupMethod = `scheduled task ${taskName} (Limited)`;
        } catch (limitedErr) {
            console.log('Limited failed. Registering per-user startup entry...');
            console.log(getErrorText(limitedErr));
            try {
                registerRunKey();
                console.log('Startup entry created in HKCU Run.');
                startupMethod = 'HKCU Run';
            } catch (runKeyErr) {
                console.log('HKCU Run failed. Registering Startup folder fallback...');
                console.log(getErrorText(runKeyErr));
                registerStartupFolder();
                console.log(`Startup folder entry created: ${startupBatchPath}`);
                startupMethod = 'Startup folder';
            }
        }
    }
    console.log(`Startup method: ${startupMethod}`);
} catch (err) {
    console.error('Could not create the startup entry.');
    console.error(getErrorText(err));
    process.exit(1);
}

console.log('');
console.log(`"${taskName}" will start automatically when the user logs in.`);
console.log('To uninstall:');
console.log('  uninstall-agent.cmd');
