import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()

async function main() {
    console.log('Seeding MVP data...')

    // 1. Seed Familias
    const familias = [
        { code: 'BAN05', name: 'Muebles Lavamanos BAN05', product_type: 'MUEBLE', use_destination: 'LAVAMANOS', assembled_default: false, rh_default: false },
        { code: 'BAN12', name: 'Muebles Lavamanos Class', product_type: 'MUEBLE', use_destination: 'LAVAMANOS', assembled_default: false, rh_default: false },
        { code: 'BAN22', name: 'Muebles Class Armados', product_type: 'MUEBLE', use_destination: 'LAVAMANOS', assembled_default: true, rh_default: false },
        { code: 'BAN23', name: 'Muebles Life Armados', product_type: 'MUEBLE', use_destination: 'LAVAMANOS', assembled_default: true, rh_default: false },
        { code: 'BAN24', name: 'Muebles Esencial Armados', product_type: 'MUEBLE', use_destination: 'LAVAMANOS', assembled_default: true, rh_default: false },
    ]

    for (const f of familias) {
        await prisma.familia.upsert({
            where: { code: f.code },
            update: f,
            create: f,
        })
    }
    console.log(`Seeded ${familias.length} Familias.`)

    // 2. Seed Colores desde CSV
    const coloresPath = path.join(process.cwd(), 'prisma', 'data', 'colores.csv')
    if (fs.existsSync(coloresPath)) {
        const fileContent = fs.readFileSync(coloresPath, 'utf-8')
        // Manejar posibles line breaks (CRLF o LF)
        const lines = fileContent.split(/\r?\n/).filter(Boolean)
        let colorCount = 0

        // Saltamos el header (index 0)
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim()
            if (!line) continue
            // Formato CSV original: COD-COLOR,Cod_color_completo4dig,Color SAP
            const parts = line.split(',')
            if (parts.length >= 3) {
                const code_short = parseInt(parts[0].trim(), 10)
                const code_4dig = parts[1].trim()
                const name_color_sap = parts[2].trim()

                await prisma.color.upsert({
                    where: { code_4dig },
                    update: { code_short: isNaN(code_short) ? null : code_short, name_color_sap },
                    create: { code_4dig, code_short: isNaN(code_short) ? null : code_short, name_color_sap }
                })
                colorCount++
            }
        }
        console.log(`Seeded ${colorCount} colores.`)
    } else {
        console.log(`Archivo de colores no encontrado en ${coloresPath}`)
    }

    // 3. Initial Document Templates
    const labelTemplate = await prisma.template.upsert({
        where: { id: 'default-label-template' },
        update: {},
        create: {
            id: 'default-label-template',
            name: 'Escala Prueba LVM (100x50)',
            document_type: 'label',
            width_mm: 100,
            height_mm: 50,
            orientation: 'horizontal',
            elements_json: JSON.stringify([]),
        }
    })
    console.log(`Ensured Template: ${labelTemplate.name}`)

    // 4. Clean up old rules that reference old fields to prevent errors, and insert new updated rules
    await prisma.rule.deleteMany({})

    const rules = await prisma.rule.createMany({
        data: [
            // Name Component Rules
            { rule_type: 'name_component', target_entity: 'product', condition_expression: 'rh_flag == true', action_type: 'append_text', action_payload: 'RH', priority: 10 },
            { rule_type: 'name_component', target_entity: 'product', condition_expression: 'product_type != null', action_type: 'append_text', action_payload: '{product_type}', priority: 20 },
            { rule_type: 'name_component', target_entity: 'product', condition_expression: 'assembled_flag == true', action_type: 'append_text', action_payload: 'ARMADO', priority: 30 },
            { rule_type: 'name_component', target_entity: 'product', condition_expression: 'cabinet_name != null', action_type: 'append_text', action_payload: '{cabinet_name}', priority: 40 },
            { rule_type: 'name_component', target_entity: 'product', condition_expression: 'designation != null', action_type: 'append_text', action_payload: '{designation}', priority: 50 },
            { rule_type: 'name_component', target_entity: 'product', condition_expression: 'line != null', action_type: 'append_text', action_payload: '{line}', priority: 60 },
            { rule_type: 'name_component', target_entity: 'product', condition_expression: 'accessory_text != null', action_type: 'append_text', action_payload: '{accessory_text}', priority: 70 },
            { rule_type: 'name_component', target_entity: 'product', condition_expression: 'door_color_text != null', action_type: 'append_text', action_payload: '{door_color_text}', priority: 80 },
            { rule_type: 'name_component', target_entity: 'product', condition_expression: 'edge_2mm_flag == true', action_type: 'append_text', action_payload: 'CANTO 2MM', priority: 90 },
            { rule_type: 'name_component', target_entity: 'product', condition_expression: 'use_destination != null', action_type: 'append_text', action_payload: 'PARA {use_destination}', priority: 110 },
            { rule_type: 'name_component', target_entity: 'product', condition_expression: 'commercial_measure != null', action_type: 'append_text', action_payload: '{commercial_measure}', priority: 120 },

            // Icon Activation Rules
            { rule_type: 'icon_activation', target_entity: 'product', condition_expression: 'rh_flag == true', action_type: 'activate_icon', action_payload: 'icon-rh', priority: 1 },
            { rule_type: 'icon_activation', target_entity: 'product', condition_expression: 'edge_2mm_flag == true', action_type: 'activate_icon', action_payload: 'icon-edge2mm', priority: 1 },
            { rule_type: 'icon_activation', target_entity: 'product', condition_expression: 'icon_soft_close == true', action_type: 'activate_icon', action_payload: 'icon-hinge-soft', priority: 1 },
            { rule_type: 'icon_activation', target_entity: 'product', condition_expression: 'icon_full_extension == true', action_type: 'activate_icon', action_payload: 'icon-full-ext', priority: 1 },
        ],
    })

    console.log(`Created ${rules.count} rules`)
    console.log('Seed completed successfully.')
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
