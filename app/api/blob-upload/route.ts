import { NextRequest, NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { OCR_IMAGE_LIMIT_BYTES, OCR_PDF_LIMIT_BYTES } from '@/lib/ocr'
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit'
import { getBlobToken } from '@/lib/blob'

// Node runtime so the read-write token and rate limiter behave like the OCR route.
export const runtime = 'nodejs'

/**
 * Issues short-lived client tokens so the browser can upload the file straight
 * to Blob storage, bypassing the serverless function payload limit. The token
 * constrains what can be uploaded (type + size), and the actual OCR call still
 * goes through `/api/ocr`, which deletes the blob when it is done.
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAllowedOrigin(request)) {
    return NextResponse.json(
      { error: 'Cross-origin requests are not allowed.', code: 'FORBIDDEN_ORIGIN' },
      { status: 403 }
    )
  }

  const rate = checkRateLimit(getClientIdentifier(request.headers))
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment and try again.', code: 'RATE_LIMITED' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
    )
  }

  const token = getBlobToken()
  if (!token) {
    return NextResponse.json(
      { error: 'Blob storage is not configured', code: 'MISSING_BLOB_TOKEN' },
      { status: 500 }
    )
  }

  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      token,
      request,
      body,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['image/png', 'image/jpeg', 'application/pdf'],
        // PDFs can be larger than images; allow the larger cap and let the OCR
        // route enforce the precise per-type limit.
        maximumSizeInBytes: Math.max(OCR_IMAGE_LIMIT_BYTES, OCR_PDF_LIMIT_BYTES),
        addRandomSuffix: true,
      }),
      // onUploadCompleted requires a public webhook callback and is not needed:
      // the browser calls /api/ocr with the blob URL once the upload resolves.
      onUploadCompleted: async () => {},
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Upload authorization failed',
        code: 'BLOB_UPLOAD_ERROR',
      },
      { status: 400 }
    )
  }
}
