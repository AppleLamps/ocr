import { upload } from '@vercel/blob/client'
import type { BlobAccess } from './blob'
import { stripOcrImagePlaceholders } from './gap-detection'
import { isRetryableHttpStatus } from './ocr'
import { sleep } from './ocr-client'

export type LayoutDetail = {
  index: number
  label: string
  bbox_2d: number[]
  content: string
  height: number
  width: number
}

export type OcrApiResponse = {
  text?: string
  error?: string
  code?: string
  empty?: boolean
  layoutDetails?: LayoutDetail[] | null
  layoutVisualization?: string[] | null
}

const MAX_ERROR_BODY_LENGTH = 500
const MAX_RETRIES = 3
const RETRY_BASE_MS = 800

async function parseOcrResponse(response: Response): Promise<OcrApiResponse> {
  const contentType = response.headers.get('content-type') || ''
  const isJson = contentType.includes('application/json')
  const bodyText = await response.text()

  const nonJsonError =
    bodyText.length > MAX_ERROR_BODY_LENGTH
      ? `Non-JSON response: ${bodyText.slice(0, MAX_ERROR_BODY_LENGTH)}…`
      : `Non-JSON response: ${bodyText}`

  if (!isJson) {
    return { error: nonJsonError }
  }

  try {
    return JSON.parse(bodyText) as OcrApiResponse
  } catch {
    return { error: nonJsonError }
  }
}

let cachedBlobAccess: BlobAccess | null = null

/** Read access mode from the server at runtime so Vercel env changes do not require a rebuild. */
async function getClientBlobAccess(): Promise<BlobAccess> {
  if (cachedBlobAccess) return cachedBlobAccess

  const response = await fetch('/api/blob-config')
  if (!response.ok) {
    throw new Error('Blob storage is not configured')
  }

  const data = (await response.json()) as { access?: unknown }
  cachedBlobAccess = data.access === 'public' ? 'public' : 'private'
  return cachedBlobAccess
}

/**
 * Upload the file straight to Blob storage from the browser. This bypasses the
 * serverless function payload limit (no more base64 round-trip through our API)
 * and lets Z.AI fetch the file by URL.
 */
async function uploadToBlob(file: File, signal?: AbortSignal): Promise<string> {
  const result = await upload(`ocr-uploads/${file.name}`, file, {
    access: await getClientBlobAccess(),
    handleUploadUrl: '/api/blob-upload',
    contentType: file.type || undefined,
    abortSignal: signal,
  })
  return result.url
}

/** Best-effort cleanup when /api/ocr was never reached after a client upload. */
async function deleteUploadedBlob(blobUrl: string): Promise<void> {
  try {
    await fetch('/api/blob-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blobUrl }),
    })
  } catch {
    // Non-fatal; orphaned blobs are preferable to blocking the user.
  }
}

export type PageRange = { start: number; end: number }

export type OcrResult = {
  text: string
  layoutDetails: LayoutDetail[] | null
  layoutVisualization: string[] | null
}

export async function submitFileToOcr(
  sourceFile: File,
  options?: { signal?: AbortSignal; pageRange?: PageRange }
): Promise<OcrResult> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    if (options?.signal?.aborted) {
      throw new Error('OCR cancelled')
    }

    let blobUrl: string
    try {
      blobUrl = await uploadToBlob(sourceFile, options?.signal)
    } catch (error) {
      if (options?.signal?.aborted) {
        throw new Error('OCR cancelled')
      }
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_BASE_MS * 2 ** attempt)
        continue
      }
      throw lastError
    }

    let response: Response
    try {
      const body: { blobUrl: string; startPage?: number; endPage?: number } = { blobUrl }
      if (options?.pageRange) {
        body.startPage = options.pageRange.start
        body.endPage = options.pageRange.end
      }
      response = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: options?.signal,
      })
    } catch (error) {
      if (options?.signal?.aborted) {
        throw new Error('OCR cancelled')
      }
      await deleteUploadedBlob(blobUrl)
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_BASE_MS * 2 ** attempt)
        continue
      }
      throw lastError
    }

    const data = await parseOcrResponse(response)

    if (!response.ok) {
      const statusHint = ` (HTTP ${response.status})`
      const message = data.error || 'OCR processing failed'
      lastError = new Error(message + statusHint)

      if (isRetryableHttpStatus(response.status) && attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_BASE_MS * 2 ** attempt)
        continue
      }

      throw lastError
    }

    const text = stripOcrImagePlaceholders(String(data.text || ''))
    if (!text) {
      if (data.empty) {
        throw new Error(
          'OCR completed but no text was detected. Try a clearer scan or higher resolution.'
        )
      }
      throw new Error('OCR returned an empty result.')
    }

    return {
      text,
      layoutDetails: data.layoutDetails ?? null,
      layoutVisualization: data.layoutVisualization ?? null,
    }
  }

  throw lastError || new Error('OCR processing failed')
}
