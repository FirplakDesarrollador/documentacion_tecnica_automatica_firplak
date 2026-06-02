const sharp = require('sharp');

async function convertJpgToZpl(jpgPath) {
    const meta = await sharp(jpgPath).metadata();
    let widthPx = meta.width;
    let heightPx = meta.height;

    // Thermal printer max width: 104mm (4") at 203 DPI = 832 dots
    const PRINTER_MAX_DOTS = 832;

    // If image is wider than printer AND wider than tall, rotate 90°
    let needsRotate = false;
    if (widthPx > PRINTER_MAX_DOTS && widthPx > heightPx) {
        needsRotate = true;
    }

    let imgBuffer;
    if (needsRotate) {
        imgBuffer = await sharp(jpgPath).rotate(90).grayscale().raw().toBuffer();
        [widthPx, heightPx] = [heightPx, widthPx];
        console.log(`[zpl] Rotada a ${widthPx}x${heightPx}`);
    } else {
        imgBuffer = await sharp(jpgPath).grayscale().raw().toBuffer();
    }

    // Scale down if still wider than printer
    const printWidthDots = Math.min(widthPx, PRINTER_MAX_DOTS);
    const scale = printWidthDots / widthPx;

    if (scale < 1) {
        const h = Math.round(heightPx * scale);
        const resized = await sharp(imgBuffer, { raw: { width: widthPx, height: heightPx, channels: 1 } })
            .resize(printWidthDots, h, { fit: 'fill' })
            .raw()
            .toBuffer();
        imgBuffer = resized;
        widthPx = printWidthDots;
        heightPx = h;
        console.log(`[zpl] Redimensionada a ${widthPx}x${heightPx}`);
    }

    // Pack 8 pixels per byte, MSB = leftmost pixel
    const bytesPerRow = Math.ceil(widthPx / 8);
    const threshold = 128;
    let hex = '';

    for (let y = 0; y < heightPx; y++) {
        for (let x = 0; x < widthPx; x += 8) {
            let byteVal = 0;
            for (let b = 0; b < 8; b++) {
                if (x + b < widthPx) {
                    const gray = imgBuffer[y * widthPx + (x + b)];
                    if (gray < threshold) {
                        byteVal |= (1 << (7 - b));
                    }
                }
            }
            hex += byteVal.toString(16).padStart(2, '0').toUpperCase();
        }
    }

    const totalBytes = bytesPerRow * heightPx;
    return `^XA^PW${printWidthDots}^LL${heightPx}^FO0,0^GFA,${totalBytes},${totalBytes},${bytesPerRow},${hex}^FS^XZ`;
}

module.exports = { convertJpgToZpl };
