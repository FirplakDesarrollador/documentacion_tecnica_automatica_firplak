/**
 * Ejecuta todos los lotes de productos en Supabase vía la API de Management
 * Llama directamente al endpoint SQL de Supabase con el access token
 */
const fs = require('fs')
const path = require('path')
const https = require('https')

const PROJECT_ID = 'nbifmxggfusipomspoly'
const ACCESS_TOKEN = 'sbp_ed55d9cf8972c72294fca512fb9ef3b2ef6cff12'

function execSQL(sql) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ query: sql })
        const options = {
            hostname: 'api.supabase.com',
            path: `/v1/projects/${PROJECT_ID}/database/query`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
                'Content-Length': Buffer.byteLength(body)
            }
        }
        const req = https.request(options, (res) => {
            let data = ''
            res.on('data', chunk => data += chunk)
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) resolve(data)
                else reject(new Error(`HTTP ${res.statusCode}: ${data}`))
            })
        })
        req.on('error', reject)
        req.write(body)
        req.end()
    })
}

async function main() {
    const files = fs.readdirSync('.').filter(f => f.startsWith('product_batch_') && f.endsWith('.sql')).sort()
    console.log(`🚀 Ejecutando ${files.length} lotes de productos en Supabase...\n`)

    let success = 0, failed = 0
    for (const file of files) {
        const sql = fs.readFileSync(file, 'utf-8')
        try {
            await execSQL(sql)
            success++
            process.stdout.write(`\r  ✅ ${success}/${files.length} lotes procesados...`)
        } catch (e) {
            console.error(`\n  ⚠️ Error en ${file}:`, e.message.substring(0, 200))
            failed++
        }
        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 100))
    }

    console.log(`\n\n🎉 Listo! ${success} lotes exitosos, ${failed} con error.`)
}

main().catch(console.error)
