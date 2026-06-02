const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const DOTS_PER_MM = 8;
let callCount = 0;

async function main() {
    const { renderElements, buildSvg } = require('./zplRenderer');

    // Use actual elements similar to what the app sends
    const elements = [
        { type: 'text', x: 5, y: 5, width: 90, height: 20, content: 'TEST LABEL', fontFamily: 'Arial', fontSize: 20, fontWeight: 'bold', textAlign: 'center', verticalAlign: 'middle' },
        { type: 'box', x: 2, y: 2, width: 96, height: 56, borderWidth: 1 },
        { type: 'text', x: 5, y: 30, width: 90, height: 15, content: 'Linea 1 - Producto', fontFamily: 'Arial', fontSize: 12, textAlign: 'center' },
        { type: 'text', x: 5, y: 45, width: 90, height: 15, content: 'Codigo: ABC-123', fontFamily: 'Arial', fontSize: 10, textAlign: 'center' },
    ];

    // Step 1: Build SVG
    const svg = await buildSvg(elements, 100, 60);
    fs.writeFileSync(path.join(__dirname, 'pipeline-test.svg'), svg, 'utf-8');
    console.log('SVG built, length:', svg.length);

    // Check if SVG includes @font-face
    if (svg.includes('@font-face')) {
        console.log('SVG has @font-face definitions');
        // Extract the data URI length
        const match = svg.match(/src:url\(data:font\/truetype;base64,([^)]+)\)/);
        if (match) console.log('Font data URI length:', match[1].length, 'chars (~', Math.round(match[1].length * 0.75 / 1024), 'KB)');
    } else {
        console.log('SVG has NO @font-face!');
    }

    // Step 2: Render at different densities
    for (const density of [72, 203]) {
        const pngBuffer = await sharp(Buffer.from(svg), { density }).png().toBuffer();
        const pngPath = path.join(__dirname, `pipeline-d${density}.png`);
        fs.writeFileSync(pngPath, pngBuffer);
        console.log(`\nDensity ${density}: PNG saved, ${pngBuffer.length} bytes`);

        // Step 3: imageToGfa logic
        const widthDots = Math.min(Math.round(100 * DOTS_PER_MM), 832);
        const heightDots = Math.round(60 * DOTS_PER_MM);

        const { data, info } = await sharp(pngBuffer)
            .resize(widthDots, heightDots, { fit: 'fill' })
            .flatten({ background: { r: 255, g: 255, b: 255 } })
            .grayscale()
            .raw()
            .toBuffer({ resolveWithObject: true });

        // Analyze
        let blackCount = 0, whiteCount = 0;
        const hist = new Array(256).fill(0);
        for (let i = 0; i < data.length; i++) {
            hist[data[i]]++;
            if (data[i] < 128) blackCount++;
            else whiteCount++;
        }

        console.log(`Resized to ${info.width}x${info.height}`);
        console.log(`Black pixels: ${blackCount}/${data.length} (${(blackCount/data.length*100).toFixed(1)}%)`);
        console.log(`White pixels: ${whiteCount}/${data.length} (${(whiteCount/data.length*100).toFixed(1)}%)`);

        // Show histogram peaks
        const peaks = [];
        for (let i = 0; i < 256; i++) {
            if (hist[i] > data.length * 0.01) peaks.push(`${i}:${hist[i]}`);
        }
        console.log('Major histogram bins (>1%):', peaks.join(', '));

        // Sample rows at various positions
        for (const testRow of [60, 120, 180, 240, 300, 360, 420]) {
            if (testRow >= info.height) continue;
            let min = 255, max = 0, non255 = 0;
            for (let c = 0; c < info.width; c++) {
                const v = data[testRow * info.width + c];
                if (v < min) min = v;
                if (v > max) max = v;
                if (v < 255) non255++;
            }
            if (non255 > 0) {
                console.log(`Row ${testRow}: min=${min}, max=${max}, non255=${non255}/${info.width}`);
            }
        }
    }

    // Step 4: Test renderElements with actual function
    console.log('\n--- Actual renderElements call ---');
    try {
        const zpl = await renderElements(elements, 100, 60);
        console.log('ZPL length:', zpl.length, 'chars');
        // Check if GFA data has any non-zero content
        const gfaMatch = zpl.match(/\^GFA,\d+,\d+,\d+,([A-F0-9]+)\^FS/);
        if (gfaMatch) {
            const hexData = gfaMatch[1];
            // Check if all zeros or all Fs
            if (/^0+$/.test(hexData)) console.log('WARNING: GFA hex is all ZEROS (all white)!');
            else if (/^F+$/.test(hexData)) console.log('WARNING: GFA hex is all Fs (all black)!');
            else {
                // Check the ratio of F/0
                let fCount = 0, zeroCount = 0;
                for (const ch of hexData) {
                    if (ch === 'F') fCount++;
                    else if (ch === '0') zeroCount++;
                }
                const total = hexData.length;
                console.log(`GFA hex: F=${fCount}/${total} (${(fCount/total*100).toFixed(1)}%), 0=${zeroCount}/${total} (${(zeroCount/total*100).toFixed(1)}%)`);
            }
        }
    } catch (e) {
        console.error('renderElements error:', e.message, e.stack);
    }
}

main().catch(e => console.error('ERROR:', e.message, e.stack));
