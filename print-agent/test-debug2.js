const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const DOTS_PER_MM = 8;

function mmToDots(mm) {
    return Math.round(mm * DOTS_PER_MM);
}

async function main() {
    // Build the EXACT SVG that zplRenderer would build for a simple test
    const elements = [
        { type: 'text', x: 5, y: 5, width: 90, height: 20, content: 'TEST LABEL', fontFamily: 'Arial', fontSize: 20, fontWeight: 'bold', textAlign: 'center', verticalAlign: 'middle' },
        { type: 'box', x: 2, y: 2, width: 96, height: 56, borderWidth: 1 },
        { type: 'text', x: 5, y: 30, width: 90, height: 15, content: 'Linea 1 - Producto', fontFamily: 'Arial', fontSize: 12, textAlign: 'center' },
        { type: 'text', x: 5, y: 45, width: 90, height: 15, content: 'Codigo: ABC-123', fontFamily: 'Arial', fontSize: 10, textAlign: 'center' },
    ];

    // Manually build the SVG (same as buildSvg does but with fonts from Windows)
    const fontFile = 'C:\\Windows\\Fonts\\arial.ttf';
    let fontDef = '';
    if (fs.existsSync(fontFile)) {
        const b64 = fs.readFileSync(fontFile).toString('base64');
        fontDef = `<defs><style>
@font-face { font-family:'ef-1'; src:url(data:font/truetype;base64,${b64}) format('truetype'); }
</style></defs>`;
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="60mm" viewBox="0 0 100 60">
${fontDef}
<rect width="100%" height="100%" fill="white"/>
<text x="50" y="15" font-family="ef-1" font-size="20pt" font-weight="bold" text-anchor="middle" dominant-baseline="central">TEST LABEL</text>
<rect x="2" y="2" width="96" height="56" stroke="black" stroke-width="1" fill="none"/>
<text x="50" y="37" font-family="ef-1" font-size="12pt" text-anchor="middle" dominant-baseline="central">Linea 1 - Producto</text>
<text x="50" y="52" font-family="ef-1" font-size="10pt" text-anchor="middle" dominant-baseline="central">Codigo: ABC-123</text>
</svg>`;

    const outDir = __dirname;
    fs.writeFileSync(path.join(outDir, 'test-full.svg'), svg, 'utf-8');
    
    // Test different density values to understand the mapping
    for (const density of [72, 96, 150, 203, 300, 400, 600]) {
        const info = await sharp(Buffer.from(svg), { density }).png().toFile(path.join(outDir, `test-d${density}.png`));
        
        // Analyze the rendered image
        const { data } = await sharp(Buffer.from(svg), { density })
            .resize(mmToDots(100), mmToDots(60), { fit: 'fill' })
            .flatten({ background: { r: 255, g: 255, b: 255 } })
            .grayscale()
            .raw()
            .toBuffer({ resolveWithObject: true });
        
        // We need to check the data AFTER resize
        // Actually, let's NOT resize and check directly at rendered size
        const { data: rawData, info: rawInfo } = await sharp(Buffer.from(svg), { density })
            .flatten({ background: { r: 255, g: 255, b: 255 } })
            .grayscale()
            .raw()
            .toBuffer({ resolveWithObject: true });
        
        let blackCount = 0;
        for (let i = 0; i < rawData.length; i++) {
            if (rawData[i] < 128) blackCount++;
        }
        
        console.log(`density=${density}: rendered=${info.width}x${info.height}, blackPixels=${blackCount}/${rawData.length} (${(blackCount/rawData.length*100).toFixed(2)}%)`);
    }

    // Now test what happens when we: render at high density → resize to target → GFA
    console.log('\n--- Full pipeline simulation ---');
    
    const targetW = mmToDots(100); // 800 dots
    const targetH = mmToDots(60);  // 480 dots
    
    for (const density of [72, 203, 400, 600, 800]) {
        // Render SVG at this density
        const pngBuffer = await sharp(Buffer.from(svg), { density }).png().toBuffer();
        
        // Resize to target + GFA
        const { data } = await sharp(pngBuffer)
            .resize(targetW, targetH, { fit: 'fill' })
            .flatten({ background: { r: 255, g: 255, b: 255 } })
            .grayscale()
            .raw()
            .toBuffer({ resolveWithObject: true });
        
        let blackCount = 0;
        for (let i = 0; i < data.length; i++) {
            if (data[i] < 128) blackCount++;
        }
        
        // Check first row pixels center area for text
        const centerCol = Math.floor(targetW / 2);
        const midRow = Math.floor(targetH / 4);
        let centerPixels = '';
        for (let col = centerCol - 5; col < centerCol + 5; col++) {
            centerPixels += data[midRow * targetW + col] + ' ';
        }
        
        console.log(`density=${density}: after resize -> ${targetW}x${targetH}, black=${blackCount}/${data.length} (${(blackCount/data.length*100).toFixed(2)}%)`);
        console.log(`  center row ${midRow} pixels: ${centerPixels}`);
    }

    // Test WITHOUT font embedding - just use Arial directly
    console.log('\n--- Without font embedding (plain Arial) ---');
    const svgPlain = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="60mm" viewBox="0 0 100 60">
<rect width="100%" height="100%" fill="white"/>
<text x="50" y="15" font-family="Arial" font-size="20pt" font-weight="bold" text-anchor="middle" dominant-baseline="central" fill="black">TEST LABEL PLAIN</text>
<rect x="2" y="2" width="96" height="56" stroke="black" stroke-width="1" fill="none"/>
<text x="50" y="37" font-family="Arial" font-size="12pt" text-anchor="middle" dominant-baseline="central" fill="black">Linea 1 - Producto</text>
<text x="50" y="52" font-family="Arial" font-size="10pt" text-anchor="middle" dominant-baseline="central" fill="black">Codigo: ABC-123</text>
</svg>`;

    fs.writeFileSync(path.join(outDir, 'test-plain.svg'), svgPlain, 'utf-8');

    const { data: plainData } = await sharp(Buffer.from(svgPlain), { density: 800 })
        .resize(targetW, targetH, { fit: 'fill' })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

    let blackCount = 0;
    for (let i = 0; i < plainData.length; i++) {
        if (plainData[i] < 128) blackCount++;
    }
    console.log(`Plain Arial at density=800: black=${blackCount}/${plainData.length} (${(blackCount/plainData.length*100).toFixed(2)}%)`);
}

main().catch(e => console.error('ERROR:', e.message, e.stack));
