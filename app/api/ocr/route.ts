import { NextRequest, NextResponse } from 'next/server'
import { del, head } from '@vercel/blob'
import {
  extractZaiErrorMessage,
  isPdfMime,
  isSupportedOcrMime,
  OCR_IMAGE_LIMIT_BYTES,
  OCR_PDF_LIMIT_BYTES,
} from '@/lib/ocr'
import { getBlobToken, isOwnBlobUrl } from '@/lib/blob'
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit'

// Node runtime avoids Edge request body limits and matches the blob SDK.
export const runtime = 'nodejs'

const MAX_ERROR_TEXT_LENGTH = 2000
const OCR_API_TIMEOUT_MS = 120_000

/**
 * Reject cross-site callers. The endpoint exists to serve this app's own
 * frontend; blocking foreign origins stops other sites from spending the
 * Z.AI quota. Same-origin requests omit the Origin header on some browsers,
 * so a missing Origin is treated as allowed (it cannot be cross-site).
 */
function isAllowedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true

  try {
    const originHost = new URL(origin).host
    const host = request.headers.get('host')
    return Boolean(host) && originHost === host
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  let blobUrl: string | null = null
  let blobToken: string | undefined

  try {
    if (!isAllowedOrigin(request)) {
      return NextResponse.json(
        { error: 'Cross-origin requests are not allowed.', code: 'FORBIDDEN_ORIGIN' },
        { status: 403 }
      )
    }

    const rate = checkRateLimit(getClientIdentifier(request.headers))
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: 'Too many requests. Please wait a moment and try again.',
          code: 'RATE_LIMITED',
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rate.retryAfterSeconds),
            'X-RateLimit-Limit': String(rate.limit),
            'X-RateLimit-Remaining': String(rate.remaining),
          },
        }
      )
    }

    const payload = (await request.json().catch(() => null)) as { blobUrl?: unknown } | null
    const candidate = typeof payload?.blobUrl === 'string' ? payload.blobUrl : ''

    // The URL is handed to Z.AI to fetch and is later deleted, so it must point
    // at our own Blob store and nowhere else.
    if (!candidate || !isOwnBlobUrl(candidate)) {
      return NextResponse.json(
        { error: 'A valid uploaded file reference is required.', code: 'INVALID_BLOB_URL' },
        { status: 400 }
      )
    }
    blobUrl = candidate

    blobToken = getBlobToken()
    if (!blobToken) {
      return NextResponse.json(
        { error: 'Blob storage is not configured', code: 'MISSING_BLOB_TOKEN' },
        { status: 500 }
      )
    }

    const apiKey = process.env.ZAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key not configured', code: 'MISSING_API_KEY' },
        { status: 500 }
      )
    }

    // Authoritative type/size, straight from the store (the client's values are
    // untrusted). This also confirms the blob actually exists.
    const meta = await head(blobUrl, { token: blobToken })
    const mimeType = meta.contentType || ''

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

    const sizeLimit = isPdfMime(mimeType) ? OCR_PDF_LIMIT_BYTES : OCR_IMAGE_LIMIT_BYTES
    if (meta.size > sizeLimit) {
      return NextResponse.json(
        {
          error: `File too large for OCR. Maximum is ${Math.floor(
            sizeLimit / (1024 * 1024)
          )}MB for this file type.`,
          code: 'FILE_TOO_LARGE',
        },
        { status: 400 }
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
          file: blobUrl,
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
  } finally {
    // Always clean up the uploaded blob; it is only needed for the OCR call.
    if (blobUrl && blobToken) {
      await del(blobUrl, { token: blobToken }).catch((err) => {
        console.error('Blob cleanup failed:', err)
      })
    }
  }
}
