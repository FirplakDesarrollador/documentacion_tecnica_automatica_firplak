const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const DOTS_PER_MM = 8;

function mmToDots(mm) {
    return Math.round(mm * DOTS_PER_MM);
}

async function main() {
    // Test 1: Simple SVG with text (no font embedding)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="60mm" viewBox="0 0 100 60">
<rect width="100%" height="100%" fill="white"/>
<text x="50" y="25" font-family="Arial" font-size="20pt" font-weight="bold" text-anchor="middle" dominant-baseline="central" fill="black">TEST LABEL</text>
<rect x="2" y="2" width="96" height="56" stroke="black" stroke-width="1" fill="none"/>
<text x="50" y="37" font-family="Arial" font-size="12pt" text-anchor="middle" dominant-baseline="central" fill="black">Linea 1 - Producto</text>
<text x="50" y="50" font-family="Arial" font-size="10pt" text-anchor="middle" dominant-baseline="central" fill="black">Codigo: ABC-123</text>
</svg>`;

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, 'test-01-svg.svg'), svg, 'utf-8');
    console.log('Test 1: Simple SVG saved');

    // Render at 203 DPI
    let png = await sharp(Buffer.from(svg), { density: 203 }).png().toFile(path.join(outDir, 'test-01-203dpi.png'));
    console.log('Test 1: 203 DPI PNG:', png.width, 'x', png.height);

    // Render at 96 DPI (default)
    png = await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, 'test-01-96dpi.png'));
    console.log('Test 1: 96 DPI PNG:', png.width, 'x', png.height);

    // Render at 600 DPI
    png = await sharp(Buffer.from(svg), { density: 600 }).png().toFile(path.join(outDir, 'test-01-600dpi.png'));
    console.log('Test 1: 600 DPI PNG:', png.width, 'x', png.height);

    // Test 2: SVG with embedded font via @font-face
    const fontPath = 'C:\\Windows\\Fonts\\arial.ttf';
    if (fs.existsSync(fontPath)) {
        const fontB64 = fs.readFileSync(fontPath).toString('base64');
        const svg2 = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="60mm" viewBox="0 0 100 60">
<defs><style>
@font-face { font-family:'ArialEmbedded'; src:url(data:font/truetype;base64,${fontB64}) format('truetype'); }
</style></defs>
<rect width="100%" height="100%" fill="white"/>
<text x="50" y="25" font-family="ArialEmbedded" font-size="20pt" font-weight="bold" text-anchor="middle" dominant-baseline="central" fill="black">TEST EMBEDDED FONT</text>
<text x="50" y="40" font-family="Arial" font-size="14pt" text-anchor="middle" dominant-baseline="central" fill="black">Regular Arial reference</text>
</svg>`;

        fs.writeFileSync(path.join(outDir, 'test-02-embedded.svg'), svg2, 'utf-8');
        console.log('Test 2: Embedded font SVG saved');

        png = await sharp(Buffer.from(svg2), { density: 203 }).png().toFile(path.join(outDir, 'test-02-embedded.png'));
        console.log('Test 2: Embedded font PNG:', png.width, 'x', png.height);
    } else {
        console.log('Test 2: Arial font not found at', fontPath);
    }

    // Test 3: Rect-only to verify GFA
    const svg3 = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="60mm" viewBox="0 0 100 60">
<rect width="100%" height="100%" fill="white"/>
<rect x="10" y="10" width="30" height="20" fill="black"/>
<rect x="50" y="10" width="10" height="40" fill="black"/>
</svg>`;

    fs.writeFileSync(path.join(outDir, 'test-03-rects.svg'), svg3, 'utf-8');
    console.log('Test 3: Rects SVG saved');

    png = await sharp(Buffer.from(svg3), { density: 203 }).png().toFile(path.join(outDir, 'test-03-rects.png'));
    console.log('Test 3: Rects PNG:', png.width, 'x', png.height);

    // Check raw pixel data of test 3
    const { data, info } = await sharp(Buffer.from(svg3), { density: 203 })
        .resize(mmToDots(100), mmToDots(60), { fit: 'fill' })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

    console.log('Test 3 raw:', info.width, 'x', info.height);

    // Count black pixels (<128)
    let blackCount = 0;
    let whiteCount = 0;
    for (let i = 0; i < data.length; i++) {
        if (data[i] < 128) blackCount++;
        else whiteCount++;
    }
    console.log('Test 3 pixels: black=', blackCount, 'white=', whiteCount, 'total=', data.length);

    // Check first few bytes of the first row
    const bytesPerRow = Math.ceil(info.width / 8);
    let firstRowHex = '';
    for (let col = 0; col < 16; col++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
            const pixel = data[0 * info.width + col * 8 + bit];
            if (pixel < 128) byte |= (1 << (7 - bit));
        }
        firstRowHex += byte.toString(16).toUpperCase().padStart(2, '0');
    }
    console.log('Test 3 first row hex (32 bytes):', firstRowHex);
}

main().catch(e => console.error('ERROR:', e.message, e.stack));
