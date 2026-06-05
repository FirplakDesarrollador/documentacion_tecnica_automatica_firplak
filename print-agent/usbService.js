const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const KNOWN_PRINTERS = [
    { vid: '0x2D84', pid: '0x4CFB', name: '4BARCODE 4B-2054TG' },
];

const POWERSHELL_FIND_DEVICE = `
$instanceIdPattern = "USB\\VID_2D84*PID_4CFB*"
$dev = Get-PnpDevice -InstanceId $instanceIdPattern | Where-Object { $_.Present -eq $true -and $_.Status -eq 'OK' }
if (-not $dev) { exit 1 }

$key = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Print\\Monitors\\USB Monitor\\Ports"
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
`;

async function runPsCapture(script) {
    const tmpFile = path.join(__dirname, '.tmp-ps-' + Date.now() + '.ps1');
    fs.writeFileSync(tmpFile, script, 'utf-8');
    try {
        const { stdout } = await new Promise((resolve, reject) => {
            exec(
                `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tmpFile}"`,
                { timeout: 60000, maxBuffer: 50 * 1024 * 1024 },
                (err, stdout, stderr) => {
                    if (err) reject(Object.assign(err, { stdout, stderr }));
                    else resolve({ stdout, stderr });
                }
            );
        });
        return { ok: true, stdout: stdout.trim() };
    } catch (err) {
        const stderr = err.stderr ? err.stderr.trim() : '';
        const stdout = err.stdout ? err.stdout.trim() : '';
        const exitCode = err.status || err.code;
        return { ok: false, stdout, stderr, exitCode, message: err.message };
    } finally {
        try { fs.unlinkSync(tmpFile); } catch {}
    }
}

async function scanUsbDevices() {
    const result = await scanUsbDevicesDetailed();
    return result.devices;
}

async function scanUsbDevicesDetailed() {
    const result = await runPsCapture(POWERSHELL_FIND_DEVICE);
    if (!result.ok) {
        if (result.exitCode === 2) {
            // Device present in PnP but no registry path — stale entry
            return { devices: [], details: { present: true, noPort: true } };
        }
        return { devices: [], details: { present: false } };
    }
    const devicePath = result.stdout;
    if (!devicePath) {
        return { devices: [], details: { present: true, noPath: true } };
    }
    return {
        devices: [{
            vid: KNOWN_PRINTERS[0].vid,
            pid: KNOWN_PRINTERS[0].pid,
            class: 7,
            known: KNOWN_PRINTERS[0].name,
            devicePath: devicePath,
        }],
        details: { present: true, devicePath },
    };
}

async function findDevicePath() {
    const result = await scanUsbDevicesDetailed();
    return result.devices.length > 0 ? result.devices[0].devicePath : null;
}

const CSHARP_WRITER = `
using System;
using System.IO;
using System.Runtime.InteropServices;
public class USBWriter {
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Auto)]
    public static extern IntPtr CreateFile(string name, uint access, uint share, IntPtr sec, uint create, uint flags, IntPtr tmpl);
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern bool WriteFile(IntPtr h, byte[] d, uint n, out uint w, IntPtr ov);
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern bool CloseHandle(IntPtr h);

    public static string WriteToPort(string port, string dataFile) {
        IntPtr h = CreateFile(port, 0x40000000, 0, IntPtr.Zero, 3, 0, IntPtr.Zero);
        if (h.ToInt64() == -1) return "ERR_CREATE:" + Marshal.GetLastWin32Error();
        try {
            byte[] bytes = File.ReadAllBytes(dataFile);
            uint written;
            if (!WriteFile(h, bytes, (uint)bytes.Length, out written, IntPtr.Zero))
                return "ERR_WRITE:" + Marshal.GetLastWin32Error();
            return "OK:" + written;
        } finally {
            CloseHandle(h);
        }
    }
}
`;

async function printViaUsb(zplData) {
    const devicePath = await findDevicePath();
    if (!devicePath) {
        throw new Error(
            'No se detectó la impresora USB. ' +
            'Verifica que la 4BARCODE 4B-2054TG esté conectada y encendida.'
        );
    }

    const zplFile = path.join(__dirname, '.tmp-zpl-' + Date.now() + '.zpl');
    const cleanup = [zplFile];

    try {
        fs.writeFileSync(zplFile, zplData, 'utf-8');
        const psScript = `
$path = "${devicePath.replace(/"/g, '""').replace(/\$/g, '`$')}";
$zplFile = "${zplFile.replace(/"/g, '""').replace(/\$/g, '`$')}";
Add-Type -TypeDefinition @"
${CSHARP_WRITER}
"@;
$r = [USBWriter]::WriteToPort($path, $zplFile);
Write-Host $r;
`;

        const psResult = await runPsCapture(psScript);
        if (!psResult.ok) {
            const detail = psResult.stderr || psResult.stdout || psResult.message || 'Error desconocido';
            throw new Error(`PowerShell falló: ${detail.slice(0, 500)}`);
        }
        const output = psResult.stdout.trim();

        if (output.startsWith('ERR_CREATE:')) {
            const code = output.split(':')[1];
            throw new Error(
                `No se pudo abrir el puerto USB (código ${code}). ` +
                'Desconecta y vuelve a conectar la impresora.'
            );
        }
        if (output.startsWith('ERR_WRITE:')) {
            const code = parseInt(output.split(':')[1], 10);
            if (code === 995) {
                throw new Error('La impresora está en estado de error (rojo titilando). Apágala, espera 5s y enciéndela.');
            }
            throw new Error(`Error de escritura USB (código ${code}).`);
        }
        if (output.startsWith('ERR_TIMEOUT')) {
            throw new Error('La impresora no respondió. Apágala, espera 5s y enciéndela.');
        }
        if (output.startsWith('ERR_')) {
            throw new Error(`Error USB: ${output}`);
        }
        if (!output.startsWith('OK:')) {
            throw new Error(`Respuesta inesperada: ${output.slice(0, 200)}`);
        }

        return { method: 'USB-direct (CreateFile+WriteFile)', device: KNOWN_PRINTERS[0].name };
    } finally {
        for (const f of cleanup) {
            try { fs.unlinkSync(f); } catch {}
        }
    }
}

module.exports = { scanUsbDevices, printViaUsb };
