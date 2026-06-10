const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const sharp = require('sharp');

const { convertImageToTspl } = require('./printService');

async function createSolidImage(filePath, width, height) {
    await sharp({
        create: {
            width,
            height,
            channels: 3,
            background: '#000000',
        },
    }).png().toFile(filePath);
}

test('uses explicit media size without rotation', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'samigen-print-test-'));
    const filePath = path.join(dir, 'direct.png');
    await createSolidImage(filePath, 400, 320);

    const { tspl, metadata } = await convertImageToTspl(filePath, 2, {
        job: {
            printTarget: 'agent_3nstar',
            designWidthMm: 100,
            designHeightMm: 80,
            mediaWidthMm: 100,
            mediaLengthMm: 80,
            mediaGapMm: 3,
        },
    });

    const header = tspl.subarray(0, 240).toString('ascii');
    assert.match(header, /SIZE 100\.0 mm, 80\.0 mm/);
    assert.match(header, /GAP 3\.0 mm, 0 mm/);
    assert.equal(metadata.finalWidthMm, 100);
    assert.equal(metadata.finalHeightMm, 80);
    assert.equal(metadata.dotsWidth, 800);
    assert.equal(metadata.dotsHeight, 640);
    assert.equal(metadata.rotated, 'none');

    fs.rmSync(dir, { recursive: true, force: true });
});

test('rotates when design dimensions are swapped against media', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'samigen-print-test-'));
    const filePath = path.join(dir, 'rotated.png');
    await createSolidImage(filePath, 800, 400);

    const { tspl, metadata } = await convertImageToTspl(filePath, 1, {
        job: {
            printTarget: 'agent_3nstar',
            designWidthMm: 200,
            designHeightMm: 100,
            mediaWidthMm: 100,
            mediaLengthMm: 200,
            mediaGapMm: 2,
        },
    });

    const header = tspl.subarray(0, 240).toString('ascii');
    assert.match(header, /SIZE 100\.0 mm, 200\.0 mm/);
    assert.match(header, /GAP 2\.0 mm, 0 mm/);
    assert.equal(metadata.finalWidthMm, 100);
    assert.equal(metadata.finalHeightMm, 200);
    assert.equal(metadata.dotsWidth, 800);
    assert.equal(metadata.dotsHeight, 1600);
    assert.equal(metadata.rotated, 'rotate_90');

    fs.rmSync(dir, { recursive: true, force: true });
});

test('rejects incompatible explicit media size', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'samigen-print-test-'));
    const filePath = path.join(dir, 'invalid.png');
    await createSolidImage(filePath, 400, 320);

    await assert.rejects(
        () => convertImageToTspl(filePath, 1, {
            job: {
                printTarget: 'agent_3nstar',
                designWidthMm: 100,
                designHeightMm: 80,
                mediaWidthMm: 90,
                mediaLengthMm: 60,
                mediaGapMm: 3,
            },
        }),
        /no encaja/
    );

    fs.rmSync(dir, { recursive: true, force: true });
});
