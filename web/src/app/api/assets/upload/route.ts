import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { writeFile } from 'fs/promises'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

export async function POST(request: Request) {
    try {
        const data = await request.formData()
        const file: File | null = data.get('file') as unknown as File

        if (!file) {
            return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 })
        }

        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)

        // Generate unique name
        const ext = path.extname(file.name) || '.png'
        const fileName = `${uuidv4()}${ext}`

        // In our implementation plan, MVP uses local filesystem (public directory)
        const filepath = path.join(process.cwd(), 'public', 'uploads', fileName)
        await writeFile(filepath, buffer)

        // Determine type based on extension
        let type = 'icon'
        if (ext.toLowerCase() === '.svg') type = 'logo'
        if (file.name.toLowerCase().includes('logo')) type = 'logo'

        // Create DB record
        const asset = await prisma.asset.create({
            data: {
                name: file.name.replace(ext, ''),
                type,
                file_path: `/uploads/${fileName}`
            }
        })

        return NextResponse.json({ success: true, asset })
    } catch (error) {
        console.error('Upload Error:', error)
        return NextResponse.json({ success: false, error: 'Failed to upload asset' }, { status: 500 })
    }
}
