
import { dbQuery } from './web/src/lib/supabase';

async function run() {
    console.log("Iniciando corrección de ENTREGPAÑO...");
    try {
        // Realizamos el reemplazo masivo del caracter de reemplazo por la Ñ
        // Usamos el caracter directamente ya que dbQuery lo maneja en el body JSON
        const res = await dbQuery("UPDATE public.cabinet_products SET sap_description = REPLACE(sap_description, '\ufffd', 'Ñ') WHERE sap_description LIKE '%\ufffd%'");
        console.log("Corrección completada exitosamente.");
        
        // Verificación final
        const leftovers = await dbQuery("SELECT COUNT(*) as count FROM public.cabinet_products WHERE sap_description LIKE '%\ufffd%'");
        console.log(`Registros restantes con error: ${leftovers[0].count}`);

    } catch (e) {
        console.error("Error durante la actualización:", e.message);
    }
}

run();
