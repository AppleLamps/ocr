import { NextRequest, NextResponse } from 'next/server'
import {
  extractZaiErrorMessage,
  inferMimeType,
  isPdfMime,
  isSupportedOcrMime,
  OCR_IMAGE_LIMIT_BYTES,
  OCR_PDF_LIMIT_BYTES,
} from '@/lib/ocr'

// Node runtime avoids Edge request body limits (common cause of 413 on PDF uploads).
export const runtime = 'nodejs'

const MAX_ERROR_TEXT_LENGTH = 2000
const OCR_API_TIMEOUT_MS = 120_000

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString('base64')
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided', code: 'NO_FILE' },
        { status: 400 }
      )
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: 'File is empty', code: 'EMPTY_FILE' },
        { status: 400 }
      )
    }

    const mimeType = inferMimeType(file.name, file.type)
    if (!isSupportedOcrMime(mimeType)) {
      return NextResponse.json(
        {
          error:
            'Unsupported file type. Upload PNG, JPEG, WebP (converted automatically), or PDF.',
          code: 'UNSUPPORTED_TYPE',
        },
        { status: 400 }
      )
    }

    const maxSize = isPdfMime(mimeType) ? OCR_PDF_LIMIT_BYTES : OCR_IMAGE_LIMIT_BYTES
    if (file.size > maxSize) {
      return NextResponse.json(
        {
          error: `File too large. Maximum size is ${isPdfMime(mimeType) ? '50MB' : '10MB'} for OCR.`,
          code: 'FILE_TOO_LARGE',
          limits: { imageMb: 10, pdfMb: 50 },
        },
        { status: 400 }
      )
    }

    const bytes = await file.arrayBuffer()
    const base64 = arrayBufferToBase64(bytes)
    const dataUrl = `data:${mimeType};base64,${base64}`

    const apiKey = process.env.ZAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key not configured', code: 'MISSING_API_KEY' },
        { status: 500 }
      )
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), OCR_API_TIMEOUT_MS)

    let ocrResponse: Response
    try {
      ocrResponse = await fetch('https://api.z.ai/api/paas/v4/layout_parsing', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-ocr',
          file: dataUrl,
        }),
        signal: controller.signal,
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return NextResponse.json(
          {
            error: 'OCR request timed out. Try a smaller file or fewer pages.',
            code: 'OCR_TIMEOUT',
          },
          { status: 504 }
        )
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }

    if (!ocrResponse.ok) {
      const errorText = await ocrResponse.text()
      let errorMessage: string | undefined
      if (errorText) {
        try {
          errorMessage = extractZaiErrorMessage(JSON.parse(errorText) as unknown)
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
          details: safeErrorText || undefined,
        },
        { status: ocrResponse.status }
      )
    }

    const result = (await ocrResponse.json()) as {
      md_results?: string
      id?: string
      usage?: unknown
    }

    const text = (result.md_results || '').trim()

    return NextResponse.json({
      text,
      empty: text.length === 0,
      id: result.id,
      usage: result.usage,
    })
  } catch (error) {
    console.error('OCR Error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    )
  }
}
