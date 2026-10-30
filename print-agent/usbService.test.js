const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizePrinterQueues, buildUsbCandidates } = require('./usbService');

test('mantiene separadas las colas de Windows cuando PowerShell devuelve varias impresoras', () => {
    const queues = normalizePrinterQueues([
        { name: '4BARCODE 4B-2054TG (Copiar 1)', portName: 'USB002' },
        { name: '4BARCODE 4B-2054TG', portName: 'USB003' },
    ]);

    assert.deepEqual(queues.map((queue) => queue.name), [
        '4BARCODE 4B-2054TG (Copiar 1)',
        '4BARCODE 4B-2054TG',
    ]);
    assert.deepEqual(queues.map((queue) => queue.portName), ['USB002', 'USB003']);
});

test('descarta entradas de cola vacias sin perder una cola valida', () => {
    const queues = normalizePrinterQueues([
        null,
        { name: '', portName: '' },
        { name: '4BARCODE 4B-2054TG', portName: 'USB003' },
    ]);

    assert.equal(queues.length, 1);
    assert.equal(queues[0].name, '4BARCODE 4B-2054TG');
});

test('construye candidatos USB unicos y no concatena puertos', () => {
    const candidates = buildUsbCandidates(
        '\\\\?\\usb#vid_2d84&pid_4cfb#123',
        [
            { name: '4BARCODE 4B-2054TG (Copiar 1)', portName: 'USB002', portDevicePath: '\\\\?\\usb#port-2' },
            { name: '4BARCODE 4B-2054TG', portName: 'USB003', portDevicePath: '\\\\?\\usb#port-3' },
        ],
    );

    assert.deepEqual(candidates.map((candidate) => candidate.path), [
        '\\\\?\\usb#vid_2d84&pid_4cfb#123',
        '\\\\?\\usb#port-2',
        '\\\\?\\usb#port-3',
        '\\\\.\\USB002',
        '\\\\.\\USB003',
    ]);
    assert.equal(candidates.some((candidate) => candidate.path.includes('USB002 USB003')), false);
});
