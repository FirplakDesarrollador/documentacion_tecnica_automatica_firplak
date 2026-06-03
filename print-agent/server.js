const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { convertImageToTspl } = require('./printService');
const { scanUsbDevices, printViaUsb } = require('./usbService');

const app = express();
const PORT = process.env.PORT || 3344;

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
    const colorMode = req.body.colorMode === 'inverted' ? 'inverted' : 'normal';

    console.log(`[print] Recibido: ${originalName} (${copies} copias, color=${colorMode})`);

    try {
        const ext = path.extname(originalName).toLowerCase();
        if (ext !== '.jpg' && ext !== '.jpeg' && ext !== '.png') {
            return res.status(400).json({ error: `Formato no soportado: ${ext}. Usa JPG o PNG.` });
        }

        console.log(`[print] Convirtiendo imagen a TSPL...`);
        const tspl = await convertImageToTspl(filePath, copies, { colorMode });
        console.log(`[print] Enviando trabajo único TSPL con ${copies} copia(s)...`);
        const result = await printViaUsb(tspl);

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
