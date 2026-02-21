import { NextRequest, NextResponse } from 'next/server'

// Node runtime avoids Edge request body limits (common cause of 413 on PDF uploads) and supports Buffer usage reliably.
export const runtime = 'nodejs'
// Limit echoed upstream error bodies to avoid oversized responses while keeping useful context.
const MAX_ERROR_TEXT_LENGTH = 2000

function hasMessage(v: unknown): v is { message: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'message' in v &&
    typeof (v as { message?: unknown }).message === 'string'
  )
}

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024
const MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x2000
  let binary = ''

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const subArray = bytes.subarray(i, i + chunkSize)
    let chunk = ''
    for (let j = 0; j < subArray.length; j += 1) {
      chunk += String.fromCharCode(subArray[j])
    }
    binary += chunk
  }

  return btoa(binary)
}

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

    // Mirror GLM-OCR documented limits.
    const maxSize = file.type === 'application/pdf' ? MAX_PDF_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES
    if (file.size > maxSize) {
      return NextResponse.json(
        {
          error: `File too large. Maximum size is ${file.type === 'application/pdf' ? '50MB' : '10MB'}`,
          code: 'FILE_TOO_LARGE',
          limits: {
            imageMb: 10,
            pdfMb: 50
          }
        },
        { status: 400 }
      )
    }

    // Convert file to base64
    const bytes = await file.arrayBuffer()
    const base64 = arrayBufferToBase64(bytes)

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
      const errorText = await ocrResponse.text()
      let errorMessage: string | undefined
      if (errorText) {
        try {
          const parsed: unknown = JSON.parse(errorText)
          if (hasMessage(parsed)) errorMessage = parsed.message
        } catch {
          errorMessage = undefined
        }
      }
      const safeErrorText = !errorText
        ? ''
        : errorText.length > MAX_ERROR_TEXT_LENGTH
          ? `${errorText.slice(0, MAX_ERROR_TEXT_LENGTH)}…`
          : errorText
      console.error('OCR API Error:', errorMessage || safeErrorText)
      return NextResponse.json(
        {
          error: errorMessage || safeErrorText || 'OCR processing failed',
          code: 'OCR_API_ERROR',
          details: safeErrorText || undefined
        },
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
