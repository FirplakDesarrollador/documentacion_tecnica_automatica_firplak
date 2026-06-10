const sharp = require('sharp');

const DOTS_PER_MM = 8;
const PRINTER_MAX_DOTS = 832;
const PRINTER_MAX_WIDTH_MM = 104;
const DEFAULT_GAP_MM = 3;
const MATCH_TOLERANCE_MM = 0.5;

function normalizeColorMode(value) {
    return value === 'inverted' ? 'inverted' : 'normal';
}

function toPositiveNumber(value) {
    const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function closeEnough(a, b) {
    return Math.abs(a - b) <= MATCH_TOLERANCE_MM;
}

function resolveExplicitLayout(job) {
    if (!job || job.printTarget !== 'agent_3nstar') return null;

    const designWidthMm = toPositiveNumber(job.designWidthMm);
    const designHeightMm = toPositiveNumber(job.designHeightMm);
    const mediaWidthMm = toPositiveNumber(job.mediaWidthMm);
    const mediaLengthMm = toPositiveNumber(job.mediaLengthMm);
    const mediaGapMm = toPositiveNumber(job.mediaGapMm) || DEFAULT_GAP_MM;

    if (!designWidthMm || !designHeightMm || !mediaWidthMm || !mediaLengthMm) {
        throw new Error('Job de impresion incompleto: faltan dimensiones de diseno o etiqueta fisica.');
    }
    if (mediaWidthMm > PRINTER_MAX_WIDTH_MM) {
        throw new Error(`El ancho fisico ${mediaWidthMm} mm supera el maximo ${PRINTER_MAX_WIDTH_MM} mm de la 3nStar.`);
    }

    const direct = closeEnough(designWidthMm, mediaWidthMm) && closeEnough(designHeightMm, mediaLengthMm);
    if (direct) {
        return { rotation: 'none', mediaWidthMm, mediaLengthMm, mediaGapMm };
    }

    const rotated = closeEnough(designWidthMm, mediaLengthMm) && closeEnough(designHeightMm, mediaWidthMm);
    if (rotated) {
        return { rotation: 'rotate_90', mediaWidthMm, mediaLengthMm, mediaGapMm };
    }

    throw new Error(`El diseno ${designWidthMm}x${designHeightMm} mm no encaja con la etiqueta ${mediaWidthMm}x${mediaLengthMm} mm.`);
}

async function rasterizeImage(imagePath, job) {
    const meta = await sharp(imagePath).metadata();
    let widthPx = meta.width;
    let heightPx = meta.height;
    console.log(`[tspl] Imagen recibida: ${widthPx}x${heightPx}`);

    const explicitLayout = resolveExplicitLayout(job);
    if (explicitLayout) {
        let image = sharp(imagePath);
        if (explicitLayout.rotation === 'rotate_90') {
            image = image.rotate(90);
            console.log('[tspl] Rotacion aplicada por metadata: 90 grados');
        }

        widthPx = Math.round(explicitLayout.mediaWidthMm * DOTS_PER_MM);
        heightPx = Math.round(explicitLayout.mediaLengthMm * DOTS_PER_MM);
        if (widthPx > PRINTER_MAX_DOTS) {
            throw new Error(`El ancho final ${widthPx} dots supera el maximo ${PRINTER_MAX_DOTS} dots.`);
        }

        const imgBuffer = await image
            .resize(widthPx, heightPx, { fit: 'fill' })
            .grayscale()
            .raw()
            .toBuffer();

        console.log(`[tspl] Redimensionada por metadata a ${widthPx}x${heightPx}`);
        return {
            imgBuffer,
            widthPx,
            heightPx,
            widthMm: explicitLayout.mediaWidthMm,
            heightMm: explicitLayout.mediaLengthMm,
            gapMm: explicitLayout.mediaGapMm,
            rotationApplied: explicitLayout.rotation,
        };
    }

    let image = sharp(imagePath);
    if (widthPx > PRINTER_MAX_DOTS && widthPx > heightPx) {
        image = image.rotate(90);
        [widthPx, heightPx] = [heightPx, widthPx];
        console.log(`[tspl] Rotada por fallback legacy a ${widthPx}x${heightPx}`);
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
        console.log(`[tspl] Redimensionada por fallback legacy a ${widthPx}x${heightPx}`);
    }

    return {
        imgBuffer,
        widthPx,
        heightPx,
        widthMm: widthPx / DOTS_PER_MM,
        heightMm: heightPx / DOTS_PER_MM,
        gapMm: DEFAULT_GAP_MM,
        rotationApplied: 'legacy',
    };
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
    const raster = await rasterizeImage(imagePath, options.job);
    const { imgBuffer, widthPx, heightPx, widthMm, heightMm, gapMm, rotationApplied } = raster;
    const { packed, bytesPerRow, blackPixels } = packTsplBitmap(imgBuffer, widthPx, heightPx, colorMode);
    const safeCopies = Math.max(1, parseInt(copies, 10) || 1);
    const blackPct = widthPx && heightPx ? (blackPixels / (widthPx * heightPx) * 100) : 0;

    console.log(`[tspl] BITMAP final: ${widthPx}x${heightPx}, bytes/row=${bytesPerRow}, negro=${blackPct.toFixed(2)}%, copias=${safeCopies}, color=${colorMode}, rotacion=${rotationApplied}`);
    if (blackPct < 0.05) {
        throw new Error('La imagen generada esta practicamente en blanco. Revisa el render /api/print antes de imprimir.');
    }

    const header = Buffer.from(
        `<xpml><page quantity='0' pitch='${heightMm.toFixed(1)} mm'></xpml>` +
        `SIZE ${widthMm.toFixed(1)} mm, ${heightMm.toFixed(1)} mm\r\n` +
        `GAP ${gapMm.toFixed(1)} mm, 0 mm\r\n` +
        `DIRECTION 0,0\r\n` +
        `REFERENCE 0,0\r\n` +
        `OFFSET 0 mm\r\n` +
        `SET PEEL OFF\r\n` +
        `SET CUTTER OFF\r\n` +
        `<xpml></page></xpml><xpml><page quantity='${safeCopies}' pitch='${heightMm.toFixed(1)} mm'></xpml>` +
        `SET TEAR ON\r\n` +
        `CLS\r\n` +
        `BITMAP 0,0,${bytesPerRow},${heightPx},1,`,
        'ascii'
    );
    const footer = Buffer.from(`\r\nPRINT 1,${safeCopies}\r\n<xpml></page></xpml>`, 'ascii');

    const tspl = Buffer.concat([header, packed, footer]);

    const metadata = {
        finalWidthMm: Number(widthMm.toFixed(1)),
        finalHeightMm: Number(heightMm.toFixed(1)),
        dotsWidth: widthPx,
        dotsHeight: heightPx,
        gapMm: Number(gapMm.toFixed(1)),
        rotated: rotationApplied,
    };

    return { tspl, metadata };
}

module.exports = { convertImageToTspl };
