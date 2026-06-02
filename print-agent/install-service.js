// Script para instalar el agente como tarea programada de Windows
// que se inicia automáticamente al iniciar sesión.
// Ejecutar: node install-service.js

const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

const agentDir = __dirname;
const nodePath = process.execPath;
const serverScript = path.join(agentDir, 'server.js');
const taskName = 'SamiGenPrintAgent';

function runPowerShell(script) {
    try {
        return execSync(
            `powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`,
            { encoding: 'utf-8', timeout: 15000 }
        );
    } catch (err) {
        return err.stdout || err.message;
    }
}

console.log('Instalando agente de impresión como tarea programada...');
console.log(`Directorio: ${agentDir}`);
console.log(`Node: ${nodePath}`);
console.log(`Script: ${serverScript}`);
console.log('');

// Crear tarea programada que se ejecuta al iniciar sesión
const result = runPowerShell(`
    $action = New-ScheduledTaskAction -Execute "${nodePath}" -Argument "${serverScript}" -WorkingDirectory "${agentDir}"
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName "${taskName}" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force
`);

if (result.includes('Success') || result.includes('Registered')) {
    console.log('✅ Tarea programada creada exitosamente.');
} else {
    console.log('📋 Resultado:', result.trim());
    console.log('⚠️  Es posible que necesites ejecutar como Administrador.');
}

console.log('');
console.log(`La tarea "${taskName}" se ejecutará automáticamente al iniciar sesión.`);
console.log('Para desinstalar:');
console.log(`  schtasks /delete /tn "${taskName}" /f`);
