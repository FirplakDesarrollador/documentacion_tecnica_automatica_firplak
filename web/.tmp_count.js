const { PrismaClient } = require('./node_modules/@prisma/client')
const p = new PrismaClient()

async function main() {
    const counts = {
        products: await p.product.count(),
        colors: await p.color.count(),
        familias: await p.familia.count(),
        clients: await p.client.count(),
        assets: await p.asset.count(),
        rules: await p.rule.count(),
        templates: await p.template.count(),
    }
    console.log(JSON.stringify(counts, null, 2))
    await p.$disconnect()
}

main().catch(e => { console.error(e.message); process.exit(1) })
