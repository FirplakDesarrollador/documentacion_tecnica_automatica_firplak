const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { convertImageToTspl } = require('./printService');
const { scanUsbDevices, scanUsbDevicesDetailed, printViaUsb } = require('./usbService');
const packageJson = require('./package.json');

const app = express();
const PORT = process.env.PORT || 3344;
const AGENT_CAPABILITIES = { jobMetadata: true, fastPing: true };
const USB_HEALTH_CACHE_MS = 15000;

let cachedUsbHealth = null;
let pendingUsbHealth = null;

const upload = multer({
    dest: path.join(os.tmpdir(), 'samigen-prints'),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) return cb(null, true);
        cb(new Error(`Formato no soportado: ${ext}. Usa: ${allowed.join(', ')}`));
    },
});

app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    next();
});
app.use(cors());
app.use(express.json());

function getAgentStatus() {
    return {
        status: 'ok',
        name: packageJson.name,
        version: packageJson.version,
        capabilities: AGENT_CAPABILITIES,
        endpoint: `http://127.0.0.1:${PORT}`,
    };
}

function mapUsbHealth(printers, scanCached) {
    return {
        printerDetected: printers.length > 0,
        printerName: printers.length > 0 ? printers[0].known : null,
        printers: printers.map(p => p.known || `${p.vid}:${p.pid}`),
        usbDevices: printers,
        scanCached,
        scannedAt: new Date().toISOString(),
    };
}

async function getUsbHealth(forceRefresh = false) {
    const now = Date.now();
    if (
        !forceRefresh &&
        cachedUsbHealth &&
        now - cachedUsbHealth.scannedAtMs < USB_HEALTH_CACHE_MS
    ) {
        return { ...cachedUsbHealth.payload, scanCached: true };
    }

    if (!pendingUsbHealth) {
        pendingUsbHealth = scanUsbDevices()
            .then((printers) => {
                const payload = mapUsbHealth(printers, false);
                cachedUsbHealth = { payload, scannedAtMs: Date.now() };
                return payload;
            })
            .finally(() => {
                pendingUsbHealth = null;
            });
    }

    return pendingUsbHealth;
}

app.get('/ping', (_req, res) => {
    res.json(getAgentStatus());
});

app.get('/health', async (_req, res) => {
    try {
        res.json({
            ...getAgentStatus(),
            ...await getUsbHealth(false),
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/debug-usb', async (_req, res) => {
    try {
        const result = await scanUsbDevicesDetailed();
        res.json({
            printerDetected: result.devices.length > 0,
            printerName: result.devices.length > 0 ? result.devices[0].known : null,
            devicePath: result.devices.length > 0 ? result.devices[0].devicePath : null,
            details: result.details,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/scan-usb', async (_req, res) => {
    try {
        res.json({
            ...await getUsbHealth(true),
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/print', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se recibió ningún archivo' });
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname;
    const copies = parseInt(req.body.copies, 10) || 1;
    const colorMode = req.body.colorMode === 'inverted' ? 'inverted' : 'normal';
    let job = null;
    if (req.body.job) {
        try {
            job = JSON.parse(req.body.job);
        } catch {
            try { fs.unlinkSync(filePath); } catch {}
            return res.status(400).json({ error: 'Job de impresion invalido' });
        }
    }

    console.log(`[print] Recibido: ${originalName} (${copies} copias, color=${colorMode}, job=${job ? 'si' : 'no'})`);

    let responded = false;
    const AGENT_PRINT_TIMEOUT_MS = 45000;
    const timeout = setTimeout(() => {
        if (!responded) {
            responded = true;
            console.error(`[print] Timeout: la impresion de ${originalName} tardo mas de ${AGENT_PRINT_TIMEOUT_MS / 1000}s`);
            try { fs.unlinkSync(filePath); } catch {}
            res.status(504).json({ error: `Timeout: la impresora no respondio en ${AGENT_PRINT_TIMEOUT_MS / 1000} segundos. Revisa que este encendida y conectada.` });
        }
    }, AGENT_PRINT_TIMEOUT_MS);

    try {
        const ext = path.extname(originalName).toLowerCase();
        if (ext !== '.jpg' && ext !== '.jpeg' && ext !== '.png') {
            clearTimeout(timeout);
            responded = true;
            return res.status(400).json({ error: `Formato no soportado: ${ext}. Usa JPG o PNG.` });
        }

        console.log(`[print] Convirtiendo imagen a TSPL...`);
        const { tspl, metadata } = await convertImageToTspl(filePath, copies, { colorMode, job });
        console.log(`[print] Enviando trabajo unico TSPL con ${copies} copia(s)...`);
        const result = await printViaUsb(tspl);

        clearTimeout(timeout);
        if (responded) return;

        responded = true;
        console.log(`[print] Listo: ${copies} copia(s) enviada(s) via ${result.method}`);
        res.json({
            success: true,
            message: `Impresion enviada: ${originalName} (${copies} copias)`,
            method: result.method,
            device: result.device,
            metadata,
        });
    } catch (err) {
        clearTimeout(timeout);
        if (responded) return;

        responded = true;
        console.error('[print] Error:', err.message);
        res.status(500).json({ error: `Error al imprimir: ${err.message}` });
    } finally {
        try { fs.unlinkSync(filePath); } catch {}
    }
});

app.use((err, _req, res, next) => {
    void next;
    console.error('[error]', err.message);
    res.status(500).json({ error: err.message });
});

let retryCount = 0;
const MAX_RETRIES = 10;

function startServer(port) {
    const server = app.listen(port, '127.0.0.1', () => {
        retryCount = 0;
        console.log(`
  ╔══════════════════════════════════════════════════╗
  ║       SamiGen - Agente de Impresión Local        ║
  ╠══════════════════════════════════════════════════╣
  ║  Puerto:       ${String(port).padEnd(35)}║
  ║  Endpoint:     http://127.0.0.1:${port}/print     ║
  ║  USB Scan:     http://127.0.0.1:${port}/scan-usb   ║
  ║  Estado:       Activo                            ║
  ╚══════════════════════════════════════════════════╝
        `);
    });
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && retryCount < MAX_RETRIES) {
            retryCount++;
            console.log(`[server] Puerto ${port} ocupado, reintento ${retryCount}/${MAX_RETRIES} en 5s...`);
            setTimeout(() => {
                server.close();
                startServer(port);
            }, 5000);
        } else if (err.code === 'EADDRINUSE') {
            console.error(`[server] No se pudo iniciar en puerto ${port} tras ${MAX_RETRIES} intentos.`);
        } else {
            console.error('[server] Error:', err.message);
        }
    });
}

startServer(PORT);

process.on('uncaughtException', (err) => {
    console.error('[crash] Excepción no capturada:', err.message);
});
process.on('unhandledRejection', (err) => {
    console.error('[crash] Promesa rechazada:', err.message);
});
