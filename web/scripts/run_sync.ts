import { syncValidationStatus } from '../src/lib/engine/validationActions'

async function runSync() {
    console.log('Iniciando sincronización de estados de validación...')
    try {
        const result = await syncValidationStatus()
        console.log(`Sincronización completada. ${result.updated} productos procesados.`)
    } catch (error) {
        console.error('Error durante la sincronización:', error)
        process.exit(1)
    }
}

runSync()
