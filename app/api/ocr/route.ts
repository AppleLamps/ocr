import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Check file size (max 10MB for images, 50MB for PDFs)
    const maxSize = file.type === 'application/pdf' ? 50 * 1024 * 1024 : 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${file.type === 'application/pdf' ? '50MB' : '10MB'}` },
        { status: 400 }
      )
    }

    // Convert file to base64
    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')

    // Determine mime type
    let mimeType = file.type
    if (!mimeType || mimeType === 'application/octet-stream') {
      const ext = file.name.split('.').pop()?.toLowerCase()
      const mimeTypes: Record<string, string> = {
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'webp': 'image/webp',
        'pdf': 'application/pdf'
      }
      mimeType = mimeTypes[ext || ''] || 'image/png'
    }

    const dataUrl = `data:${mimeType};base64,${base64}`

    // Call Z.AI OCR API
    const apiKey = process.env.ZAI_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      )
    }

    const ocrResponse = await fetch('https://api.z.ai/api/paas/v4/layout_parsing', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'glm-ocr',
        file: dataUrl
      })
    })

    if (!ocrResponse.ok) {
      const errorData = await ocrResponse.json().catch(() => ({}))
      console.error('OCR API Error:', errorData)
      return NextResponse.json(
        { error: errorData.message || 'OCR processing failed' },
        { status: ocrResponse.status }
      )
    }

    const result = await ocrResponse.json()

    return NextResponse.json({
      text: result.md_results || '',
      id: result.id,
      usage: result.usage
    })

  } catch (error) {
    console.error('OCR Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
