import { NextResponse } from 'next/server'
import { dbQuery } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'
import { v4 as uuidv4 } from 'uuid'

export async function POST(request: Request) {
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

        // Determine type
        let type = data.get('type') as string || ''
        if (!type) {
            type = 'icon'
            if (ext.toLowerCase() === 'svg' || file.name.toLowerCase().includes('logo')) type = 'logo'
        }

        // Upload to Supabase Storage (bucket 'assets')
        const { error: storageError } = await supabase.storage
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
            const { data: urlData } = supabase.storage.from('assets').getPublicUrl(bucketPath)
            filePath = urlData.publicUrl
        }

        let rows: any[]
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
            rows = await dbQuery(`
                INSERT INTO public.assets (name, type, file_path)
                VALUES ('${file.name.replace(`.${ext}`, '').replace(/'/g, "''")}', '${type}', '${filePath.replace(/'/g, "''")}')
                RETURNING id, name, type, file_path, created_at
            `)
        }

        return NextResponse.json({ success: true, asset: rows?.[0] })
    } catch (error: any) {
        console.error('Upload Error:', error)
        return NextResponse.json({ success: false, error: 'Failed to upload asset' }, { status: 500 })
    }
}
