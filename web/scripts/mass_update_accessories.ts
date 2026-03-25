import * as fs from 'fs';

async function main() {
  console.log('🔄 Generando script SQL para actualización de accesorios...');
  
  // We cannot read DB directly without key? Actually let's just run it via sql MCP
  const sqlCommands: string[] = [];
    const furnitureName = furnitureNameRaw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    const sapDesc = (p.sap_description || '').toUpperCase().trim();
    const sapName = (p.sap_name || '').toUpperCase().trim();
    
    // Full string for contains check
    const fullSap = `${sapName} ${sapDesc}`;
    
    let newAccessory: string | null = null;
    let newDesignation: string | null = null;
    
    if (line === 'CLASS') {
      switch (furnitureName) {
        case 'GODAI':
            if(fullSap.includes('CUBO CAJON') || fullSap.includes('CUBO-CAJON') || fullSap.includes('CUBO CAJÓN')) {
               newAccessory = 'RFE CIERRE LENTO';
               newDesignation = 'ELEVADO';
            } else {
               newAccessory = '';
            }
            break;
        case 'VITELLI':
            newAccessory = 'R OCULTO CIERRE LENTO';
            newDesignation = 'ELEVADO';
            break;
        case 'GRECO':
            newAccessory = 'RFE + R OCULTO CIERRE LENTO';
            newDesignation = 'ELEVADO';
            break;
        case 'MACAO':
            newAccessory = 'RFE CIERRE LENTO';
            newDesignation = 'ELEVADO';
            break;
        case 'MISUS':
            newAccessory = 'R OCULTO CIERRE LENTO';
            newDesignation = 'ELEVADO';
            break;
        case 'THALOS':
            newAccessory = 'RFE CIERRE LENTO';
            newDesignation = 'ELEVADO';
            break;
        case 'OTUS':
            newAccessory = 'RFE CIERRE LENTO';
            newDesignation = 'A PISO';
            break;
        case 'ZACURA':
            newAccessory = 'RFE CIERRE LENTO';
            newDesignation = 'ELEVADO';
            break;
      }
    } else if (line === 'LIFE') {
      switch (furnitureName) {
        case 'MACAO':
            newAccessory = 'RFE';
            newDesignation = 'ELEVADO';
            break;
        case 'TIZIANO':
            newAccessory = 'RFE';
            newDesignation = 'ELEVADO';
            break;
        case 'MISUS': 
            newAccessory = 'RFE';
            newDesignation = 'ELEVADO';
            break;
        case 'MONET':
            newAccessory = 'RFE';
            newDesignation = 'ELEVADO';
            break;
        case 'VALDEZ':
            newAccessory = 'RFE';
            if (fullSap.includes('A PISO')) newDesignation = 'A PISO';
            else newDesignation = 'ELEVADO';
            break;
        case 'DA VINCI':
            newAccessory = '';
            newDesignation = 'A PISO';
            break;
        case 'POLOCK':
            newAccessory = '';
            newDesignation = 'A PISO';
            break;
        case 'PICASSO':
            newAccessory = 'RFE';
            newDesignation = 'ELEVADO';
            break;
      }
    } else if (line === 'ESSENTIAL' || line === 'EUROCARIBE') {
      switch (furnitureName) {
        case 'VEGA':
            newAccessory = '';
            newDesignation = 'A PISO';
            break;
        case 'VAN GOGH':
            newAccessory = '';
            newDesignation = 'ELEVADO';
            break;
        case 'CALDER':
            newAccessory = '';
            newDesignation = 'ELEVADO';
            break;
        case 'BASICO':
        case 'BASICOS':
            if (fullSap.includes('SIN MANIJA')) newAccessory = 'SIN MANIJAS';
            else newAccessory = 'CON MANIJAS';
            if (fullSap.includes('A PISO')) newDesignation = 'A PISO';
            else newDesignation = 'ELEVADO';
            break;
        case 'RAYO':
            newAccessory = '';
            newDesignation = 'ELEVADO';
            break;
        case 'ELEVADO':
            newAccessory = 'TAPA VESSEL';
            newDesignation = 'ELEVADO';
            break;
        case 'A PISO':
            newAccessory = 'TAPA VESSEL';
            newDesignation = 'A PISO';
            break;
      }
    }
    
    // Determinar si hay cambios 
    // Usamos newAccessory != null para saber si la lógica cayó en uno de nuestros casos y tiene valor para accesorios
    // Hacemos lo mismo con designation si es distinto al que tiene.
    let needsUpdate = false;
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: any = {};
    
    if (newAccessory !== null && newAccessory !== p.accessory_text) {
       patch.accessory_text = newAccessory;
       needsUpdate = true;
    }
    
    if (newDesignation !== null && newDesignation !== p.designation) {
       patch.designation = newDesignation;
       needsUpdate = true;
    }
    
    if (needsUpdate) {
       console.log(`Modificando: [${p.code}] ${p.sap_description}`);
       if (patch.accessory_text !== undefined) console.log(`  -> accessory_text: '${p.accessory_text}' => '${patch.accessory_text}'`);
       if (patch.designation !== undefined) console.log(`  -> designation: '${p.designation}' => '${patch.designation}'`);
       
       const { error: updateError } = await supabase.from('cabinet_products').update(patch).eq('id', p.id);
       if(updateError) {
         console.error("Failed to update " + p.id, updateError);
       } else {
         updatedCount++;
       }
    }
  }
  
  console.log(`✅ ¡Proceso completado! Archivos actualizados: ${updatedCount}`);
}

main().catch(console.error);
