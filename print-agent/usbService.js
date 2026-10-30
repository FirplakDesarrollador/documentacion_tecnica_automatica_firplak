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
    const [result, printerQueues] = await Promise.all([
        runPsCapture(POWERSHELL_FIND_DEVICE),
        getPrinterQueues(),
    ]);
    if (!result.ok) {
        if (result.exitCode === 2) {
            // Device present in PnP but no registry path — stale entry
            return { devices: [], printerQueues, details: { present: true, noPort: true } };
        }
        return { devices: [], printerQueues, details: { present: false } };
    }
    const devicePath = result.stdout;
    if (!devicePath) {
        return { devices: [], printerQueues, details: { present: true, noPath: true } };
    }
    return {
        devices: [{
            vid: KNOWN_PRINTERS[0].vid,
            pid: KNOWN_PRINTERS[0].pid,
            class: 7,
            known: KNOWN_PRINTERS[0].name,
            devicePath: devicePath,
        }],
        printerQueues,
        details: { present: true, devicePath },
    };
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

const CSHARP_SPOOLER_WRITER = `
using System;
using System.IO;
using System.Runtime.InteropServices;
public class RawSpoolerWriter {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    public class DOCINFO {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }
    [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
    [DllImport("winspool.drv", SetLastError=true)]
    static extern bool ClosePrinter(IntPtr handle);
    [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern int StartDocPrinter(IntPtr handle, int level, DOCINFO info);
    [DllImport("winspool.drv", SetLastError=true)]
    static extern bool EndDocPrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError=true)]
    static extern bool StartPagePrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError=true)]
    static extern bool EndPagePrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError=true)]
    static extern bool WritePrinter(IntPtr handle, byte[] data, int count, out int written);

    public static string PrintRaw(string printerName, string dataFile) {
        IntPtr printer;
        if (!OpenPrinter(printerName, out printer, IntPtr.Zero))
            return "ERR_OPEN:" + Marshal.GetLastWin32Error();
        try {
            var info = new DOCINFO { pDocName = "SamiGen label", pOutputFile = null, pDataType = "RAW" };
            if (StartDocPrinter(printer, 1, info) == 0)
                return "ERR_START_DOC:" + Marshal.GetLastWin32Error();
            try {
                if (!StartPagePrinter(printer)) return "ERR_START_PAGE:" + Marshal.GetLastWin32Error();
                try {
                    byte[] bytes = File.ReadAllBytes(dataFile);
                    int written;
                    if (!WritePrinter(printer, bytes, bytes.Length, out written))
                        return "ERR_WRITE:" + Marshal.GetLastWin32Error();
                    return "OK:" + written;
                } finally {
                    EndPagePrinter(printer);
                }
            } finally {
                EndDocPrinter(printer);
            }
        } finally {
            ClosePrinter(printer);
        }
    }
}
`;

const PS_GET_PORT_INFO = `
$printers = @(
    Get-CimInstance -ClassName Win32_Printer -Filter "Name LIKE '%4BARCODE%' OR Name LIKE '%4B-2054%' OR Name LIKE '%LTT334%'" -ErrorAction SilentlyContinue |
        ForEach-Object {
            $portName = [string]$_.PortName;
            $portPath = "";
            if ($portName) {
                $portsKey = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Print\\Monitors\\USB Monitor\\Ports\\" + $portName;
                $pp = Get-ItemProperty -Path $portsKey -Name "Device Path" -ErrorAction SilentlyContinue;
                if ($pp) { $portPath = [string]$pp.'Device Path' }
            }
            [PSCustomObject]@{
                name = [string]$_.Name;
                portName = $portName;
                portDevicePath = $portPath;
                driverName = [string]$_.DriverName;
                printerStatus = $_.PrinterStatus;
                workOffline = $_.WorkOffline -eq $true;
            }
        }
);
ConvertTo-Json -InputObject $printers -Compress -Depth 4;
`;

function normalizePrinterQueues(value) {
    const values = Array.isArray(value) ? value : value ? [value] : [];
    return values
        .filter((printer) => printer && typeof printer === 'object')
        .map((printer) => ({
            name: typeof printer.name === 'string' ? printer.name.trim() : '',
            portName: typeof printer.portName === 'string' ? printer.portName.trim() : '',
            portDevicePath: typeof printer.portDevicePath === 'string' ? printer.portDevicePath.trim() : '',
            driverName: typeof printer.driverName === 'string' ? printer.driverName.trim() : '',
            printerStatus: Number.isFinite(printer.printerStatus) ? printer.printerStatus : null,
            workOffline: printer.workOffline === true,
        }))
        .filter((printer) => printer.name || printer.portName || printer.portDevicePath);
}

async function getPrinterQueues() {
    const result = await runPsCapture(PS_GET_PORT_INFO);
    if (!result.ok || !result.stdout) return [];
    try {
        return normalizePrinterQueues(JSON.parse(result.stdout));
    } catch {
        return [];
    }
}

function buildUsbCandidates(devicePath, queues) {
    const candidates = [];
    const seen = new Set();

    function add(pathValue, source) {
        const normalized = typeof pathValue === 'string' ? pathValue.trim() : '';
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        candidates.push({ path: normalized, source });
    }

    add(devicePath, 'PnP device path');
    for (const queue of queues) {
        add(queue.portDevicePath, `cola ${queue.name || 'sin nombre'}`);
    }
    for (const queue of queues) {
        if (queue.portName) add(`\\\\.\\${queue.portName}`, `puerto ${queue.portName}`);
    }
    return candidates;
}

function makeUsbAccessError(lastError, queues, attempts) {
    const error = new Error(
        'No se pudo abrir la impresora USB. ' +
        'Cierra temporalmente 4BarCode u otro programa que esté imprimiendo, espera unos segundos y vuelve a intentar. ' +
        `Último resultado: ${lastError || 'sin respuesta'}.`
    );
    error.code = 'USB_ACCESS_FAILED';
    error.details = {
        lastError: lastError || null,
        attempts,
        queueCount: queues.length,
        queueNames: queues.map((queue) => queue.name).filter(Boolean),
    };
    return error;
}

async function printViaWindowsSpooler(zplFile, queue) {
    const printerName = queue.name;
    const psScript = `
$printerName = "${printerName.replace(/"/g, '""').replace(/\$/g, '`$')}";
$zplFile = "${zplFile.replace(/"/g, '""').replace(/\$/g, '`$')}";
Add-Type -TypeDefinition @"
${CSHARP_SPOOLER_WRITER}
"@;
$r = [RawSpoolerWriter]::PrintRaw($printerName, $zplFile);
Write-Host $r;
`;
    const result = await runPsCapture(psScript);
    if (!result.ok) return `spooler PowerShell: ${result.stderr || result.message}`;
    const output = result.stdout.trim();
    if (output.startsWith('OK:')) return null;
    return output || 'spooler sin respuesta';
}

async function printViaUsb(zplData) {
    ensureTmpDir();
    const zplFile = path.join(TMP_DIR, '.tmp-zpl-' + Date.now() + '.zpl');
    const cleanup = [zplFile];

    try {
        fs.writeFileSync(zplFile, zplData, 'utf-8');

        const firstScan = await scanUsbDevicesDetailed();
        const firstDevicePath = firstScan.devices.length > 0 ? firstScan.devices[0].devicePath : null;
        const firstQueues = firstScan.printerQueues || [];
        let queues = firstQueues;
        let attempts = 0;
        let lastError = '';
        let candidates = buildUsbCandidates(firstDevicePath, firstQueues);

        console.log(`[print] Colas detectadas: ${queues.length}`);
        for (const queue of queues) {
            console.log(`[print] Cola: ${queue.name || '(sin nombre)'} | Puerto: ${queue.portName || '(sin puerto)'}`);
        }
        if (queues.length > 1) {
            console.warn('[print] Hay varias colas para la impresora. Se mantiene USB directo y no se elegirá una cola por nombre.');
        }
        console.log(`[print] DevicePath: ${firstDevicePath || '(no detectado)'}`);
        console.log(`[print] Candidatos USB: ${candidates.length}`);

        for (let scanAttempt = 0; scanAttempt < 2; scanAttempt += 1) {
            for (const candidate of candidates) {
                attempts += 1;
            const psScript = `
$path = "${candidate.path.replace(/"/g, '""').replace(/\$/g, '`$')}";
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
                return {
                    method: 'USB-direct',
                    device: queues.find((queue) => queue.name)?.name || KNOWN_PRINTERS[0].name,
                    queueCount: queues.length,
                };
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

            if (scanAttempt === 0) {
                console.warn(`[print] USB no disponible (${lastError}). Reescaneando antes del último intento...`);
                await new Promise((resolve) => setTimeout(resolve, 250));
                const retryScan = await scanUsbDevicesDetailed();
                queues = retryScan.printerQueues || [];
                const retryDevicePath = retryScan.devices.length > 0 ? retryScan.devices[0].devicePath : null;
                candidates = buildUsbCandidates(retryDevicePath, queues);
            }
        }

        if (queues.length === 1 && queues[0].name) {
            console.warn(`[print] USB no disponible (${lastError}). Probando spooler de Windows con la cola ${queues[0].name}...`);
            const spoolerError = await printViaWindowsSpooler(zplFile, queues[0]);
            if (!spoolerError) {
                return { method: 'Windows-spooler', device: queues[0].name, queueCount: 1 };
            }
            lastError = `${lastError}; spooler: ${spoolerError}`;
        } else if (queues.length > 1) {
            lastError = `${lastError}; fallback de spooler omitido: hay ${queues.length} colas`;
        }

        throw makeUsbAccessError(lastError, queues, attempts);
    } finally {
        for (const f of cleanup) {
            try { fs.unlinkSync(f); } catch {}
        }
    }
}

module.exports = {
    scanUsbDevices,
    scanUsbDevicesDetailed,
    printViaUsb,
    normalizePrinterQueues,
    buildUsbCandidates,
};
