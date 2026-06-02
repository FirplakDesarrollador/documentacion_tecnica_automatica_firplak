const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const DOTS_PER_MM = 8;
const PRINTER_MAX_DOTS = 832;
const FONTS_DIR = 'C:\\Windows\\Fonts';

const FONT_MAP = {
    'arial': {
        regular: 'arial.ttf',
        bold: 'arialbd.ttf',
        italic: 'ariali.ttf',
        bolditalic: 'arialbi.ttf',
    },
    'times new roman': {
        regular: 'times.ttf',
        bold: 'timesbd.ttf',
        italic: 'timesi.ttf',
        bolditalic: 'timesbi.ttf',
    },
    'courier new': {
        regular: 'cour.ttf',
        bold: 'courbd.ttf',
        italic: 'couri.ttf',
        bolditalic: 'courbi.ttf',
    },
    'calibri': {
        regular: 'calibri.ttf',
        bold: 'calibrib.ttf',
        italic: 'calibrii.ttf',
        bolditalic: 'calibriz.ttf',
    },
    'segoe ui': {
        regular: 'segoeui.ttf',
        bold: 'segoeuib.ttf',
        italic: 'segoeuii.ttf',
        bolditalic: 'segoeuiz.ttf',
    },
    'tahoma': {
        regular: 'tahoma.ttf',
        bold: 'tahomabd.ttf',
        italic: 'tahoma.ttf',
        bolditalic: 'tahomabd.ttf',
    },
    'verdana': {
        regular: 'verdana.ttf',
        bold: 'verdanab.ttf',
        italic: 'verdanai.ttf',
        bolditalic: 'verdanaz.ttf',
    },
    'trebuchet ms': {
        regular: 'trebuc.ttf',
        bold: 'trebucbd.ttf',
        italic: 'trebucit.ttf',
        bolditalic: 'trebucbi.ttf',
    },
    'impact': {
        regular: 'impact.ttf',
        bold: 'impact.ttf',
        italic: 'impact.ttf',
        bolditalic: 'impact.ttf',
    },
    'comic sans ms': {
        regular: 'comic.ttf',
        bold: 'comicbd.ttf',
        italic: 'comici.ttf',
        bolditalic: 'comicz.ttf',
    },
    'georgia': {
        regular: 'georgia.ttf',
        bold: 'georgiab.ttf',
        italic: 'georgiai.ttf',
        bolditalic: 'georgiaz.ttf',
    },
};

function mmToDots(mm) {
    return Math.round(mm * DOTS_PER_MM);
}

function fetchImage(url, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
    });
}

function stripHtml(html) {
    if (!html) return '';
    return String(html)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function escapeXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getFontFilePath(family, fontWeight, fontStyle) {
    const key = family.toLowerCase().trim();
    const map = FONT_MAP[key];
    if (!map) return null;

    const isBold = fontWeight === 'bold' || fontWeight === 'medium' || fontWeight === '600' || fontWeight === '700';
    const isItalic = fontStyle === 'italic';

    let variant = 'regular';
    if (isBold && isItalic) variant = 'bolditalic';
    else if (isBold) variant = 'bold';
    else if (isItalic) variant = 'italic';

    const filename = map[variant] || map.regular;
    const fullPath = path.join(FONTS_DIR, filename);
    return fs.existsSync(fullPath) ? fullPath : null;
}

const _fontCache = new Map();

function embedFont(uniqueName, fontFamily, fontWeight, fontStyle) {
    const cacheKey = `${fontFamily}|${fontWeight}|${fontStyle}`;
    if (_fontCache.has(cacheKey)) return _fontCache.get(cacheKey);

    const fontPath = getFontFilePath(fontFamily, fontWeight, fontStyle);
    if (!fontPath) {
        _fontCache.set(cacheKey, null);
        return null;
    }

    try {
        const buf = fs.readFileSync(fontPath);
        const b64 = buf.toString('base64');
        _fontCache.set(cacheKey, {
            uniqueName,
            family: fontFamily,
            fontWeight,
            fontStyle,
            dataUri: `data:font/truetype;base64,${b64}`,
        });
        return _fontCache.get(cacheKey);
    } catch {
        _fontCache.set(cacheKey, null);
        return null;
    }
}

function buildFontDefs(elements) {
    const seen = new Set();
    const defs = [];

    for (const el of elements) {
        if (el.type !== 'text' && el.type !== 'dynamic_text') continue;
        const family = el.fontFamily || 'Arial';
        const weight = el.fontWeight || 'normal';
        const style = el.fontStyle || 'normal';
        const key = `${family}|${weight}|${style}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const uniqueName = `ef-${seen.size}`;
        const result = embedFont(uniqueName, family, weight, style);
        if (result) {
            defs.push(result);
        }
    }

    return defs;
}

function svgFontAlias(fontFamily, fontWeight, fontStyle, fontDefs) {
    const key = `${fontFamily}|${fontWeight || 'normal'}|${fontStyle || 'normal'}`;
    for (const def of fontDefs) {
        if (`${def.family}|${def.fontWeight}|${def.fontStyle}` === key) {
            return def.uniqueName;
        }
    }
    return fontFamily;
}

function svgText(el, fontDefs) {
    let content = stripHtml(el.content || '');
    if (!content) return '';

    switch (el.textTransform) {
        case 'uppercase': content = content.toUpperCase(); break;
        case 'lowercase': content = content.toLowerCase(); break;
    }

    const x = el.x;
    const y = el.y + (el.height / 2);
    const w = el.width;
    const fontSizePt = Math.min(el.fontSize || 10, 72);
    const lineHeightMm = fontSizePt * 1.2 * 25.4 / 72;
    const fontFamily = el.fontFamily || 'Arial';
    const fontWeight = el.fontWeight || 'normal';
    const fontStyle = el.fontStyle || 'normal';
    const alias = svgFontAlias(fontFamily, fontWeight, fontStyle, fontDefs);

    let textAnchor = 'start';
    if (el.textAlign === 'center') textAnchor = 'middle';
    else if (el.textAlign === 'right') textAnchor = 'end';

    let dominantBaseline = 'central';
    switch (el.verticalAlign || 'middle') {
        case 'top': dominantBaseline = 'hanging'; break;
        case 'middle': dominantBaseline = 'central'; break;
        case 'bottom': dominantBaseline = 'auto'; break;
    }

    const xOffset = el.textAlign === 'center' ? w / 2 : el.textAlign === 'right' ? w : 0;
    const lines = content.split('\n');

    if (lines.length === 1) {
        const safe = escapeXml(content);
        return `<text x="${x + xOffset}" y="${y}" font-family="${alias}" font-size="${fontSizePt}pt" font-weight="${fontWeight}" font-style="${fontStyle}" text-anchor="${textAnchor}" dominant-baseline="${dominantBaseline}">${safe}</text>`;
    }

    let result = `<text font-family="${alias}" font-size="${fontSizePt}pt" font-weight="${fontWeight}" font-style="${fontStyle}" text-anchor="${textAnchor}">`;
    const blockHeight = lines.length * lineHeightMm;
    let lineY = y - (blockHeight / 2) + (lineHeightMm * 0.15);
    for (let i = 0; i < lines.length; i++) {
        const safe = escapeXml(lines[i]);
        result += `<tspan x="${x + xOffset}" y="${lineY.toFixed(3)}" dominant-baseline="auto">${safe}</tspan>`;
        lineY += lineHeightMm;
    }
    result += '</text>';
    return result;
}

function svgBarcode(el) {
    const barcodeSvg = el.barcodeSvg;
    if (!barcodeSvg) return '';

    const x = el.x;
    const y = el.y;

    let inner = barcodeSvg;
    const svgMatch = barcodeSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
    if (svgMatch) inner = svgMatch[1];

    return `<g transform="translate(${x},${y})">${inner}</g>`;
}

function svgBox(el) {
    const t = Math.max(0.1, el.borderWidth || 1);
    return `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" stroke="black" stroke-width="${t}" fill="none"/>`;
}

function svgDashedLine(el) {
    const t = Math.max(0.1, el.borderWidth || 1);
    if (el.lineOrientation === 'vertical') {
        return `<line x1="${el.x}" y1="${el.y}" x2="${el.x}" y2="${el.y + el.height}" stroke="black" stroke-width="${t}" stroke-dasharray="3,3"/>`;
    }
    return `<line x1="${el.x}" y1="${el.y + el.height / 2}" x2="${el.x + el.width}" y2="${el.y + el.height / 2}" stroke="black" stroke-width="${t}" stroke-dasharray="3,3"/>`;
}

async function svgImage(el) {
    const src = el.resolvedSrc || el.content;
    if (!src) return '';

    try {
        let imgBuffer;
        if (String(src).startsWith('data:')) {
            imgBuffer = Buffer.from(src.split(',')[1], 'base64');
        } else {
            imgBuffer = await fetchImage(src);
        }
        const b64 = imgBuffer.toString('base64');
        const ext = String(src).toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
        return `<image href="data:image/${ext};base64,${b64}" x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}"/>`;
    } catch (err) {
        console.error(`[zpl] image fetch error:`, err.message);
        return '';
    }
}

async function elementToSvg(el, fontDefs) {
    switch (el.type) {
        case 'text':
        case 'dynamic_text':
            return svgText(el, fontDefs);
        case 'barcode':
            return svgBarcode(el);
        case 'image':
            return await svgImage(el);
        case 'dynamic_image':
            return await svgDynamicImage(el, fontDefs);
        case 'box':
            return svgBox(el);
        case 'dashed_line':
            return svgDashedLine(el);
        default:
            return '';
    }
}

async function svgDynamicImage(el, fontDefs) {
    let parts = '';
    if (el.resolvedSrc || el.content) {
        parts += await svgImage(el);
    }
    if (el.caption) {
        const captionEl = {
            ...el,
            type: 'text',
            content: el.caption,
            fontSize: el.captionFontSize || 6.5,
            textAlign: el.captionTextAlign || 'center',
            verticalAlign: 'top',
            y: el.y + el.height + (el.captionGapMM || 0),
        };
        parts += svgText(captionEl, fontDefs);
    }
    return parts;
}

function layoutIconGroupChildren(groupEl, allElements) {
    const children = allElements
        .filter(el => el.groupId === groupEl.id)
        .sort((a, b) => a.x - b.x);

    if (children.length === 0) return [];

    const gap = groupEl.groupGapMM ?? 2;
    const padding = 1;
    const totalWidth = children.reduce((s, c) => s + c.width, 0) + (children.length - 1) * gap;
    const containerWidth = groupEl.width - 2 * padding;

    let startX = groupEl.x + padding;
    if (groupEl.groupAlign === 'center' || groupEl.groupAlign === 'middle') {
        startX = groupEl.x + (groupEl.width - totalWidth) / 2;
    } else if (groupEl.groupAlign === 'flex-end' || groupEl.groupAlign === 'end' || groupEl.groupAlign === 'right') {
        startX = groupEl.x + groupEl.width - padding - totalWidth;
    }

    let offsetX = startX;
    return children.map(child => {
        const laid = { ...child, x: offsetX, y: groupEl.y + padding };
        offsetX += child.width + gap;
        return laid;
    });
}

async function buildSvg(elements, widthMm, heightMm) {
    const fontDefs = buildFontDefs(elements);

    let styleDefs = '';
    if (fontDefs.length > 0) {
        styleDefs = '<defs><style>\n';
        for (const def of fontDefs) {
            styleDefs += `@font-face { font-family:'${def.uniqueName}'; src:url(${def.dataUri}) format('truetype'); }\n`;
        }
        styleDefs += '</style></defs>\n';
    }

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}">
${styleDefs}<rect width="100%" height="100%" fill="white"/>`;

    for (const el of elements) {
        if (el.type === 'icon_group') {
            const laid = layoutIconGroupChildren(el, elements);
            for (const child of laid) {
                svg += '\n' + await elementToSvg(child, fontDefs);
            }
            continue;
        }
        if (el.groupId) continue;
        svg += '\n' + await elementToSvg(el, fontDefs);
    }

    svg += '\n</svg>';
    return svg;
}

async function imageToGfa(imgBuffer, targetW, targetH) {
    const { data, info } = await sharp(imgBuffer)
        .resize(targetW, targetH, { fit: 'fill' })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const bytesPerRow = Math.ceil(info.width / 8);
    const totalBytes = bytesPerRow * info.height;
    let hex = '';

    for (let row = 0; row < info.height; row++) {
        for (let col = 0; col < info.width; col += 8) {
            let byte = 0;
            for (let bit = 0; bit < 8; bit++) {
                if (col + bit < info.width) {
                    const pixel = data[row * info.width + col + bit];
                    if (pixel < 128) byte |= (1 << (7 - bit));
                }
            }
            hex += byte.toString(16).toUpperCase().padStart(2, '0');
        }
    }

    return { hex, totalBytes, bytesPerRow, widthDots: info.width, heightDots: info.height };
}

async function renderElements(elements, widthMm, heightMm) {
    const widthDots = mmToDots(Math.min(widthMm, 104));
    const heightDots = mmToDots(heightMm);

    const svg = await buildSvg(elements, widthMm, heightMm);
    const pngBuffer = await sharp(Buffer.from(svg), { density: 203 }).png().toBuffer();
    const { hex, totalBytes, bytesPerRow } = await imageToGfa(pngBuffer, widthDots, heightDots);

    let zpl = `^XA^PW${widthDots}^LL${heightDots}^LH0,0\r\n`;
    zpl += `^FO0,0^GFA,${totalBytes},${totalBytes},${bytesPerRow},${hex}^FS\r\n`;
    zpl += `^XZ\r\n`;

    return zpl;
}

module.exports = { renderElements };
