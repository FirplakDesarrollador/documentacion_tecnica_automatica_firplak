import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/supabase'
import { supabaseServer } from '@/lib/supabase'
import { v4 as uuidv4 } from 'uuid'
import { apiGuard } from '@/utils/auth/access'

export async function POST(request: Request) {
    const guard = await apiGuard('admin')
    if (guard.response) {
        return guard.response
    }

    try {
        const data = await request.formData()
        const file: File | null = data.get('file') as unknown as File
        const assetId = data.get('assetId') as string | null

        if (!file) {
            return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 })
        }

        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)

        const ext = file.name.split('.').pop() || 'png'
        const fileName = `${uuidv4()}.${ext}`
        const bucketPath = `assets/${fileName}`

        // Type and name from form data (always explicit in Phase 2)
        const type = data.get('type') as string || 'icon'
        const customName = (data.get('name') as string || '').trim()

        // Upload to Supabase Storage (bucket 'assets')
        const { error: storageError } = await supabaseServer.storage
            .from('assets')
            .upload(bucketPath, buffer, {
                contentType: file.type || 'application/octet-stream',
                upsert: false
            })

        let filePath: string
        if (storageError) {
            // Fallback: guardar en filesystem local (dev mode)
            console.warn('Storage upload failed, falling back to local:', storageError.message)
            const { writeFile } = await import('fs/promises')
            const { join } = await import('path')
            const localPath = join(process.cwd(), 'public', 'uploads', fileName)
            await writeFile(localPath, buffer)
            filePath = `/uploads/${fileName}`
        } else {
            const { data: urlData } = supabaseServer.storage.from('assets').getPublicUrl(bucketPath)
            filePath = urlData.publicUrl
        }

        let rows: Record<string, unknown>[]
        if (assetId) {
            // Update existing record
            rows = await dbQuery(`
                UPDATE public.assets
                SET file_path = '${filePath.replace(/'/g, "''")}',
                    updated_at = now()
                WHERE id = '${assetId}'
                RETURNING id, name, type, file_path, created_at
            `)
        } else {
            // Create new DB record in Supabase
            const assetName = customName || file.name.replace(`.${ext}`, '').replace(/'/g, "''")
            rows = await dbQuery(`
                INSERT INTO public.assets (name, type, file_path)
                VALUES ('${assetName.replace(/'/g, "''")}', '${type}', '${filePath.replace(/'/g, "''")}')
                RETURNING id, name, type, file_path, created_at
            `)
        }

        return NextResponse.json({ success: true, asset: rows?.[0] })
    } catch (error: unknown) {
        console.error('Upload Error:', error)
        return NextResponse.json({ success: false, error: 'Failed to upload asset' }, { status: 500 })
    }
}
