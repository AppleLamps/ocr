import { NextRequest, NextResponse } from 'next/server'
import { del } from '@vercel/blob'
import { getBlobToken, isOwnBlobUrl } from '@/lib/blob'
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit'

export const runtime = 'nodejs'

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

/** Delete an uploaded blob when the OCR request never reached the server. */
export async function POST(request: NextRequest) {
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

  const payload = (await request.json().catch(() => null)) as { blobUrl?: unknown } | null
  const blobUrl = typeof payload?.blobUrl === 'string' ? payload.blobUrl : ''

  if (!blobUrl || !isOwnBlobUrl(blobUrl)) {
    return NextResponse.json(
      { error: 'A valid uploaded file reference is required.', code: 'INVALID_BLOB_URL' },
      { status: 400 }
    )
  }

  const blobToken = getBlobToken()
  if (!blobToken) {
    return NextResponse.json(
      { error: 'Blob storage is not configured', code: 'MISSING_BLOB_TOKEN' },
      { status: 500 }
    )
  }

  try {
    await del(blobUrl, { token: blobToken })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Blob delete failed:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Blob delete failed',
        code: 'BLOB_DELETE_ERROR',
      },
      { status: 500 }
    )
  }
}