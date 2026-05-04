import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('🔄 Wiping old rules for MUEBLE...');
    
    // Deleting old general rules and MUEBLE rules
    await prisma.rule.deleteMany({
        where: {
            OR: [
                { target_entity: 'product' },
                { target_entity: 'MUEBLE' }
            ],
            rule_type: 'name_component'
        }
    });

    console.log('✅ Deleted old rules.');

    console.log('📝 Creating exact MUEBLE nomenclature rules...');
    
    const rules = [
        { rule_type: 'name_component', target_entity: 'MUEBLE', condition_expression: 'product_type != null', action_type: 'append_text', action_payload: '{product_type}', priority: 10 },
        { rule_type: 'name_component', target_entity: 'MUEBLE', condition_expression: 'cabinet_name != null', action_type: 'append_text', action_payload: '{cabinet_name}', priority: 20 },
        { rule_type: 'name_component', target_entity: 'MUEBLE', condition_expression: 'designation != null', action_type: 'append_text', action_payload: '{designation}', priority: 30 },
        { rule_type: 'name_component', target_entity: 'MUEBLE', condition_expression: 'use_destination != null', action_type: 'append_text', action_payload: 'PARA {use_destination}', priority: 40 },
        { rule_type: 'name_component', target_entity: 'MUEBLE', condition_expression: 'commercial_measure != null', action_type: 'append_text', action_payload: '{commercial_measure}', priority: 50 },
        { rule_type: 'name_component', target_entity: 'MUEBLE', condition_expression: 'true', action_type: 'append_text', action_payload: '-', priority: 55 },
        { rule_type: 'name_component', target_entity: 'MUEBLE', condition_expression: 'edge_2mm_flag == true', action_type: 'append_text', action_payload: 'CANTO 2MM', priority: 60 },
        { rule_type: 'name_component', target_entity: 'MUEBLE', condition_expression: 'accessory_text != null', action_type: 'append_text', action_payload: '{accessory_text}', priority: 70 },
    ];

    await prisma.rule.createMany({ data: rules });

    console.log('✅ Created MUEBLE rules successfully.');
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    });
