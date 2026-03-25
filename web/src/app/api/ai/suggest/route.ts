import { NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

// Allow configuration from standard environment variable
const apiKey = process.env.GEMINI_API_KEY || ''
// Instantiate without throwing immediately if key is missing during build
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null

export async function POST(req: Request) {
    try {
        if (!ai) {
            return NextResponse.json({ error: 'Gemini API is not configured.' }, { status: 500 })
        }

        const { sapDescription } = await req.json()

        if (!sapDescription) {
            return NextResponse.json({ error: 'Missing sapDescription' }, { status: 400 })
        }

        const prompt = `
    You are an AI assistant for a manufacturing company. 
    Your job is to parse unstructured SAP material descriptions and extract structured product attributes.
    Analyze the following SAP description and return a JSON object with the exact following fields natively formatted:
    - "product_type": string (e.g., "MUEBLE", "LAVAMANOS", "BAÑERA", "ESPEJO")
    - "furniture_name": string (The human readable name of the model, e.g., "BONN", "MALAGA". Exclude dimensions or colors).
    - "color_name": string (The color of the product, e.g., "BLANCO", "WENGUE", "ROBLE", "GRIS").
    - "rh_flag": boolean (True if it mentions RH, Resistente a Humedad, etc.)
    - "assembled_flag": boolean (True if it explicitly mentions ARMADO or ENSAMBLADO. False if DESARMADO or missing)
    - "canto_puertas": string (Specify the type of edge mentioned, e.g., "CANTO 2MM", "CANTO 1MM", or "NA")
    - "accessory_text": string (Extract mentions of accessories like "MANIJAS", "RIEL FULL EXTENSION", "CIERRE LENTO", "BISAGRAS CIERRE LENTO")
    - "line": string (The product line, e.g., "LINEA BLANCA", "PREMIUM", "BASICS")
    - "use_destination": string (Where it's used, e.g., "LAVARROPAS", "LAVATRAPEROS", "AREA DE TRABAJO", "LAVAMANOS", "COCINAS")
    - "designation": string (Any specific designation mentioned)
    - "commercial_measure": string (The commercial dimension, e.g., "60X40", "120CM")

    SAP Description: "${sapDescription}"

    Return ONLY a valid JSON object, without markdown formatting blocks.
    `

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json'
            }
        })

        const text = response.text
        if (!text) throw new Error('No text generated')

        const suggestions = JSON.parse(text)
        return NextResponse.json({ suggestions })

    } catch (error: any) {
        console.error('AI Suggestion error:', error)
        return NextResponse.json({ error: error.message || 'Failed to generate suggestions' }, { status: 500 })
    }
}
