const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const KNOWN_PRINTERS = [
    { vid: '0x2D84', pid: '0x4CFB', name: '4BARCODE 4B-2054TG' },
];

const TMP_DIR = path.join(os.tmpdir(), 'samigen-agent');
const POWERSHELL_TIMEOUT_MS = 15000;

function ensureTmpDir() {
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

const POWERSHELL_FIND_DEVICE = `
$vidPid = "VID_2D84*PID_4CFB"
$insPat = "USB\\" + $vidPid + "*"

$dev = Get-PnpDevice -InstanceId $insPat -ErrorAction SilentlyContinue | Where-Object { $_.Present -eq $true -and $_.Status -eq 'OK' }
if (-not $dev) { exit 1 }

$instId = $dev.InstanceId
$enumRoot = "HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\" + $instId

# --- Method 1: Device Parameters in Enum ---
$dpKey = $enumRoot + "\\Device Parameters"
$dp = (Get-ItemProperty -Path $dpKey -Name "DevicePath" -ErrorAction SilentlyContinue).DevicePath
if ($dp) { Write-Host $dp; exit 0 }

# --- Method 2: USB Monitor Ports (legacy) ---
$portsKey = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Print\\Monitors\\USB Monitor\\Ports"
if (Test-Path $portsKey) {
    try {
        $ports = Get-ChildItem $portsKey -ErrorAction Stop
        foreach ($p in $ports) {
            $props = Get-ItemProperty $p.PSPath
            if ($props.'Device Id' -like "*" + $vidPid + "*" -and $props.'Device Path') {
                Write-Host $props.'Device Path'; exit 0
            }
        }
    } catch {}
}

# --- Method 3: Search DeviceClasses for any path with our VID/PID ---
$classRoot = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceClasses"
if (Test-Path $classRoot) {
    Get-ChildItem $classRoot -ErrorAction SilentlyContinue | ForEach-Object {
        $guid = $_.PSChildName
        $guidPath = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\DeviceClasses\\" + $guid
        Get-ChildItem $guidPath -ErrorAction SilentlyContinue | ForEach-Object {
            $entry = $_.PSChildName
            $dpPath = $guidPath + "\\" + $entry + "\\#\\Device Parameters"
            $val = (Get-ItemProperty -Path $dpPath -Name "DevicePath" -ErrorAction SilentlyContinue).DevicePath
            if ($val -and $val -match $vidPid) {
                Write-Host $val; exit 0
            }
        }
    }
}

exit 2
`;

async function runPsCapture(script) {
    ensureTmpDir();
    const tmpFile = path.join(TMP_DIR, '.tmp-ps-' + Date.now() + '.ps1');
    fs.writeFileSync(tmpFile, script, 'utf-8');
    try {
        const { stdout } = await new Promise((resolve, reject) => {
            exec(
                `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tmpFile}"`,
                { timeout: POWERSHELL_TIMEOUT_MS, maxBuffer: 50 * 1024 * 1024 },
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

const PS_GET_PORT_INFO = `
$printer = Get-CimInstance -ClassName Win32_Printer -Filter "Name LIKE '%4BARCODE%' OR Name LIKE '%4B-2054%' OR Name LIKE '%LTT334%'" -ErrorAction SilentlyContinue;
if (-not $printer) { exit 1 }
$portName = $printer.PortName;
$printerName = $printer.Name;
# Look up USB port path in registry
$portPath = "";
$portsKey = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Print\\Monitors\\USB Monitor\\Ports\\" + $portName;
$pp = Get-ItemProperty -Path $portsKey -Name "Device Path" -ErrorAction SilentlyContinue;
if ($pp) { $portPath = $pp.'Device Path' }
Write-Host ($printerName + "|" + $portName + "|" + $portPath);
`;

async function printViaUsb(zplData) {
    ensureTmpDir();
    const zplFile = path.join(TMP_DIR, '.tmp-zpl-' + Date.now() + '.zpl');
    const cleanup = [zplFile];

    try {
        fs.writeFileSync(zplFile, zplData, 'utf-8');

        // Step 1: get printer port info
        const portInfoResult = await runPsCapture(PS_GET_PORT_INFO);
        let printerName = KNOWN_PRINTERS[0].name;
        let portName = '';
        let portDevicePath = '';
        let devicePath = await findDevicePath();

        if (portInfoResult.ok) {
            const parts = portInfoResult.stdout.split('|');
            if (parts.length >= 2) {
                printerName = parts[0] || printerName;
                portName = parts[1] || '';
                portDevicePath = parts[2] || '';
                console.log(`[print] Puerto: ${portName}, printer: ${printerName}`);
            }
        }

        console.log(`[print] DevicePath: ${devicePath}`);
        console.log(`[print] PortDevicePath: ${portDevicePath}`);

        // Step 2: collect candidate paths to try
        const candidates = [];
        if (devicePath) candidates.push(devicePath);
        if (portDevicePath) candidates.push(portDevicePath);
        if (portName) candidates.push('\\\\.\\' + portName);

        // Step 3: try each path with CreateFile
        let lastError = '';
        for (const candidate of candidates) {
            const psScript = `
$path = "${candidate.replace(/"/g, '""').replace(/\$/g, '`$')}";
$zplFile = "${zplFile.replace(/"/g, '""').replace(/\$/g, '`$')}";
Add-Type -TypeDefinition @"
${CSHARP_WRITER}
"@;
$r = [USBWriter]::WriteToPort($path, $zplFile);
Write-Host $r;
`;
            const psResult = await runPsCapture(psScript);
            if (!psResult.ok) {
                lastError = psResult.stderr || psResult.message;
                continue;
            }
            const output = psResult.stdout.trim();
            if (output.startsWith('OK:')) {
                return { method: 'USB-direct (' + candidate.slice(0, 40) + ')', device: printerName };
            }
            if (output.startsWith('ERR_CREATE:')) {
                lastError = `CreateFile code ${output.split(':')[1]}`;
                continue;
            }
            if (output.startsWith('ERR_WRITE:')) {
                throw new Error(
                    output.split(':')[1] === '995'
                        ? 'La impresora está en estado de error (rojo titilando). Apágala, espera 5s y enciéndela.'
                        : `Error de escritura USB (código ${output.split(':')[1]}).`
                );
            }
            lastError = output;
        }

        // Step 4: fallback — Copy-Item to printer UNC
        console.log(`[print] CreateFile no funcionó (${lastError}), probando Copy-Item a ${printerName}...`);
        const copyResult = await runPsCapture(`
$src = "${zplFile.replace(/"/g, '""').replace(/\$/g, '`$')}";
$dst = "\\\\localhost\\${printerName.replace(/"/g, '""').replace(/\$/g, '`$')}";
try {
    [System.IO.File]::Copy($src, $dst, $true);
    Write-Host "OK";
} catch {
    Write-Host ("ERR_COPY:" + $_.Exception.Message);
}
`);
        if (copyResult.ok && copyResult.stdout.trim() === 'OK') {
            return { method: 'Copy-Item (UNC)', device: printerName };
        }

        // Step 5: fallback — Write-Printer cmdlet
        console.log(`[print] Copy-Item falló, probando Write-Printer...`);
        const wpResult = await runPsCapture(`
$file = "${zplFile.replace(/"/g, '""').replace(/\$/g, '`$')}";
$name = "${printerName.replace(/"/g, '""').replace(/\$/g, '`$')}";
try {
    $bytes = [System.IO.File]::ReadAllBytes($file);
    Write-Printer -Name $name -Data $bytes -ErrorAction Stop;
    Write-Host "OK";
} catch {
    Write-Host "ERR_PRINTER:" + $_.Exception.Message;
}
`);
        if (wpResult.ok && wpResult.stdout.trim() === 'OK') {
            return { method: 'Write-Printer (spooler)', device: printerName };
        }

        throw new Error(
            `No se pudo enviar datos a la impresora.\n` +
            `USB: ${lastError}\n` +
            `Copy-Item: ${copyResult.ok && !copyResult.stdout.startsWith('OK') ? copyResult.stdout.slice(0, 100) : 'no'}\n` +
            `Write-Printer: ${wpResult.ok && !wpResult.stdout.startsWith('OK') ? wpResult.stdout.slice(0, 100) : 'no'}\n` +
            `Verifica que la impresora esté encendida, conectada y correctamente instalada.`
        );
    } finally {
        for (const f of cleanup) {
            try { fs.unlinkSync(f); } catch {}
        }
    }
}

async function printViaWritePrinter(zplData, printerName) {
    ensureTmpDir();
    const zplFile = path.join(TMP_DIR, '.tmp-zpl-' + Date.now() + '.zpl');
    try {
        fs.writeFileSync(zplFile, zplData, 'utf-8');
        const psScript = `
$file = "${zplFile.replace(/"/g, '""').replace(/\$/g, '`$')}";
$name = "${(printerName || '4BARCODE 4B-2054TG').replace(/"/g, '""').replace(/\$/g, '`$')}";
try {
    $bytes = [System.IO.File]::ReadAllBytes($file);
    Write-Printer -Name $name -Data $bytes -ErrorAction Stop;
    Write-Host "OK";
} catch {
    Write-Host "ERR_PRINTER:" + $_.Exception.Message;
}
`;
        const psResult = await runPsCapture(psScript);
        if (!psResult.ok) {
            throw new Error(`Write-Printer falló: ${(psResult.stderr || psResult.stdout || psResult.message).slice(0, 300)}`);
        }
        const output = psResult.stdout.trim();
        if (output.startsWith('ERR_PRINTER:')) {
            throw new Error(`Write-Printer: ${output.slice(12).trim()}`);
        }
        if (output !== 'OK') {
            throw new Error(`Write-Printer: respuesta inesperada: ${output.slice(0, 200)}`);
        }
        return { method: 'Write-Printer (spooler)', device: printerName || KNOWN_PRINTERS[0].name };
    } finally {
        try { fs.unlinkSync(zplFile); } catch {}
    }
}

module.exports = { scanUsbDevices, scanUsbDevicesDetailed, printViaUsb, printViaWritePrinter };
