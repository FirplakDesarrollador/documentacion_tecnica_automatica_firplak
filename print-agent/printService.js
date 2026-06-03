const sharp = require('sharp');

const DOTS_PER_MM = 8;
const PRINTER_MAX_DOTS = 832;
const GAP_MM = 3;

async function rasterizeImage(imagePath) {
    const meta = await sharp(imagePath).metadata();
    let widthPx = meta.width;
    let heightPx = meta.height;
    console.log(`[tspl] Imagen recibida: ${widthPx}x${heightPx}`);

    let image = sharp(imagePath);
    if (widthPx > PRINTER_MAX_DOTS && widthPx > heightPx) {
        image = image.rotate(90);
        [widthPx, heightPx] = [heightPx, widthPx];
        console.log(`[tspl] Rotada a ${widthPx}x${heightPx}`);
    }

    let imgBuffer = await image.grayscale().raw().toBuffer();
    const printWidthDots = Math.min(widthPx, PRINTER_MAX_DOTS);
    const scale = printWidthDots / widthPx;

    if (scale < 1) {
        const resizedHeight = Math.round(heightPx * scale);
        imgBuffer = await sharp(imgBuffer, { raw: { width: widthPx, height: heightPx, channels: 1 } })
            .resize(printWidthDots, resizedHeight, { fit: 'fill' })
            .raw()
            .toBuffer();
        widthPx = printWidthDots;
        heightPx = resizedHeight;
        console.log(`[tspl] Redimensionada a ${widthPx}x${heightPx}`);
    }

    return { imgBuffer, widthPx, heightPx };
}

function normalizeColorMode(value) {
    return value === 'inverted' ? 'inverted' : 'normal';
}

function packTsplBitmap(imgBuffer, widthPx, heightPx, colorMode = 'normal') {
    const bytesPerRow = Math.ceil(widthPx / 8);
    const packed = Buffer.alloc(bytesPerRow * heightPx, 0);
    const threshold = 128;
    const isInverted = normalizeColorMode(colorMode) === 'inverted';
    let blackPixels = 0;

    for (let y = 0; y < heightPx; y++) {
        for (let x = 0; x < widthPx; x += 8) {
            let byteVal = 0;
            for (let bit = 0; bit < 8; bit++) {
                const pixelX = x + bit;
                if (pixelX >= widthPx) continue;

                const gray = imgBuffer[y * widthPx + pixelX];
                if (gray < threshold) blackPixels++;

                // TSPL BITMAP mode used by this printer interprets 1 bits as white.
                const shouldSetBit = isInverted ? gray < threshold : gray >= threshold;
                if (shouldSetBit) {
                    byteVal |= (1 << (7 - bit));
                }
            }
            packed[y * bytesPerRow + Math.floor(x / 8)] = byteVal;
        }
    }

    return { packed, bytesPerRow, blackPixels };
}

async function convertImageToTspl(imagePath, copies = 1, options = {}) {
    const colorMode = normalizeColorMode(options.colorMode);
    const { imgBuffer, widthPx, heightPx } = await rasterizeImage(imagePath);
    const { packed, bytesPerRow, blackPixels } = packTsplBitmap(imgBuffer, widthPx, heightPx, colorMode);
    const safeCopies = Math.max(1, parseInt(copies, 10) || 1);
    const blackPct = widthPx && heightPx ? (blackPixels / (widthPx * heightPx) * 100) : 0;

    console.log(`[tspl] BITMAP final: ${widthPx}x${heightPx}, bytes/row=${bytesPerRow}, negro=${blackPct.toFixed(2)}%, copias=${safeCopies}, color=${colorMode}`);
    if (blackPct < 0.05) {
        throw new Error('La imagen generada está prácticamente en blanco. Revisa el render /api/print antes de imprimir.');
    }

    const widthMm = (widthPx / DOTS_PER_MM).toFixed(1);
    const heightMm = (heightPx / DOTS_PER_MM).toFixed(1);
    const header = Buffer.from(
        `<xpml><page quantity='0' pitch='${heightMm} mm'></xpml>` +
        `SIZE ${widthMm} mm, ${heightMm} mm\r\n` +
        `GAP ${GAP_MM} mm, 0 mm\r\n` +
        `DIRECTION 0,0\r\n` +
        `REFERENCE 0,0\r\n` +
        `OFFSET 0 mm\r\n` +
        `SET PEEL OFF\r\n` +
        `SET CUTTER OFF\r\n` +
        `<xpml></page></xpml><xpml><page quantity='${safeCopies}' pitch='${heightMm} mm'></xpml>` +
        `SET TEAR ON\r\n` +
        `CLS\r\n` +
        `BITMAP 0,0,${bytesPerRow},${heightPx},1,`,
        'ascii'
    );
    const footer = Buffer.from(`\r\nPRINT 1,${safeCopies}\r\n<xpml></page></xpml>`, 'ascii');

    return Buffer.concat([header, packed, footer]);
}

module.exports = { convertImageToTspl };
