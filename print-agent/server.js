const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { convertJpgToZpl } = require('./printService');
const { scanUsbDevices, printViaUsb } = require('./usbService');
const { renderElements } = require('./zplRenderer');

const app = express();
const PORT = process.env.PORT || 3344;

const upload = multer({
    dest: path.join(os.tmpdir(), 'samigen-prints'),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.pdf', '.png'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) return cb(null, true);
        cb(new Error(`Formato no soportado: ${ext}. Usa: ${allowed.join(', ')}`));
    },
});

app.use(cors());
app.use(express.json());

app.get('/health', async (_req, res) => {
    try {
        const printers = await scanUsbDevices();
        res.json({
            status: 'ok',
            printerDetected: printers.length > 0,
            printerName: printers.length > 0 ? printers[0].known : null,
            printers: printers.map(p => p.known || `${p.vid}:${p.pid}`),
            usbDevices: printers,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/scan-usb', async (_req, res) => {
    try {
        const printers = await scanUsbDevices();
        res.json({
            printerDetected: printers.length > 0,
            printerName: printers.length > 0 ? printers[0].known : null,
            printers: printers.map(p => p.known || `${p.vid}:${p.pid}`),
            usbDevices: printers,
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

    console.log(`[print] Recibido: ${originalName} (${copies} copias)`);

    try {
        // Convert JPG/ZPL to ZPL and send via USB
        const ext = path.extname(originalName).toLowerCase();
        let zpl;

        if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
            console.log(`[print] Convirtiendo imagen a ZPL...`);
            zpl = await convertJpgToZpl(filePath);
        } else {
            zpl = fs.readFileSync(filePath, 'utf-8');
        }

        console.log(`[print] Enviando ${copies} copia(s)...`);
        let result;
        for (let i = 0; i < copies; i++) {
            console.log(`[print] Enviando copia ${i + 1}/${copies}...`);
            result = await printViaUsb(zpl);
        }

        console.log(`[print] Listo: ${copies} copia(s) enviada(s) via ${result.method}`);
        res.json({
            success: true,
            message: `Impresión enviada: ${originalName} (${copies} copias)`,
            method: result.method,
            device: result.device,
        });
    } catch (err) {
        console.error('[print] Error:', err.message);
        res.status(500).json({ error: `Error al imprimir: ${err.message}` });
    } finally {
        try { fs.unlinkSync(filePath); } catch {}
    }
});

app.post('/test-zpl', async (_req, res) => {
    try {
        const zpl = '^XA^FO50,50^A0N,50,50^FDSamiGen TEST^FS^XZ';
        console.log(`[test-zpl] Enviando ZPL de prueba...`);
        const result = await printViaUsb(zpl);
        console.log(`[test-zpl] OK:`, result);
        res.json({ success: true, method: result.method, device: result.device });
    } catch (err) {
        console.error('[test-zpl] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/print-zpl', express.json({ limit: '50mb' }), async (req, res) => {
    const { elements, width_mm, height_mm, copies = 1 } = req.body;

    if (!elements || !Array.isArray(elements) || elements.length === 0) {
        return res.status(400).json({ error: 'No se recibieron elementos de la plantilla' });
    }

    console.log(`[print-zpl] ${elements.length} elementos, ${width_mm}x${height_mm}mm, ${copies} copia(s)`);

    try {
        const zpl = await renderElements(elements, width_mm || 104, height_mm || 100);

        for (let i = 0; i < copies; i++) {
            console.log(`[print-zpl] Enviando copia ${i + 1}/${copies}...`);
            const result = await printViaUsb(zpl);
            console.log(`[print-zpl] Copia ${i + 1} lista:`, result);
        }

        res.json({
            success: true,
            message: `${copies} copia(s) enviada(s) a la impresora`,
            method: 'ZPL-direct',
            device: '4BARCODE 4B-2054TG',
        });
    } catch (err) {
        console.error('[print-zpl] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.use((err, _req, res, _next) => {
    console.error('[error]', err.message);
    res.status(500).json({ error: err.message });
});

app.listen(PORT, '127.0.0.1', () => {
    console.log(`
  ╔══════════════════════════════════════════════════╗
  ║       SamiGen - Agente de Impresión Local        ║
  ╠══════════════════════════════════════════════════╣
  ║  Puerto:       ${String(PORT).padEnd(35)}║
  ║  Endpoint:     http://127.0.0.1:${PORT}/print     ║
  ║  USB Scan:     http://127.0.0.1:${PORT}/scan-usb   ║
  ║  Estado:       Activo                            ║
  ╚══════════════════════════════════════════════════╝
    `);
});
