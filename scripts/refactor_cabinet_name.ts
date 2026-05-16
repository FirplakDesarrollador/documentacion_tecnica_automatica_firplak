import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';

const srcDir = path.join(process.cwd(), 'src');
const files = globSync('**/*.{ts,tsx}', { cwd: srcDir, absolute: true });

let totalReplaced = 0;

for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    
    // Perform replacements
    let newContent = content
        .replace(/cabinet_name/g, 'product_name')
        .replace(/cabinetNames/g, 'productNames')
        .replace(/cabinetName/g, 'productName')
        .replace(/Cabinet Name/g, 'Product Name')
        .replace(/CabinetName/g, 'ProductName');

    if (newContent !== content) {
        fs.writeFileSync(file, newContent, 'utf8');
        console.log(`Updated ${path.relative(process.cwd(), file)}`);
        totalReplaced++;
    }
}

console.log(`Total files updated: ${totalReplaced}`);
