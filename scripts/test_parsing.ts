import { parseProductCode } from '../src/app/products/naming-actions';

(async () => {
    const code = 'VCOC01-0115-000-0442';
    const sap = 'MBLE SUP COCINA ZAFIRO 180X60 PARA MICROONDAS GRACIA/SIKUANI';
    const parsed = await parseProductCode(code, sap, false);
    console.log('Parsed:', JSON.stringify(parsed, null, 2));
})();
