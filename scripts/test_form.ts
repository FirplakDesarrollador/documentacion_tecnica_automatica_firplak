const cases = [
    '44,5',
    '44,5X43,5',
    '1.200,54',
    '1,200.54',
    '1.200.54',
    '44.5',
    '44.5X43.5',
    '63X48',
    '150X55',
    '180X60'
];

cases.forEach(val => {
    val = val.toUpperCase();
    const hasComma = val.includes(',');
    const parts = val.split('X').map(p => p.trim());
    const hasMultipleDotsInNumber = parts.some(p => (p.match(/\./g) || []).length > 1);

    const isBlocked = hasComma || hasMultipleDotsInNumber;
    console.log(`${val.padEnd(12)} -> ${isBlocked ? 'BLOCKED' : 'ALLOWED'}`);
});
