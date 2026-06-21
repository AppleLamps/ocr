import { upload } from '@vercel/blob/client'
import { getBlobAccess } from './blob'
import { isRetryableHttpStatus } from './ocr'
import { sleep } from './ocr-client'

export type OcrApiResponse = {
  text?: string
  error?: string
  code?: string
  empty?: boolean
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

/**
 * Upload the file straight to Blob storage from the browser. This bypasses the
 * serverless function payload limit (no more base64 round-trip through our API)
 * and lets Z.AI fetch the file by URL.
 */
async function uploadToBlob(file: File, signal?: AbortSignal): Promise<string> {
  const result = await upload(`ocr-uploads/${file.name}`, file, {
    access: getBlobAccess(),
    handleUploadUrl: '/api/blob-upload',
    contentType: file.type || undefined,
    abortSignal: signal,
  })
  return result.url
}

export async function submitFileToOcr(
  sourceFile: File,
  options?: { signal?: AbortSignal }
): Promise<string> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    if (options?.signal?.aborted) {
      throw new Error('OCR cancelled')
    }

    // Upload per attempt: the API deletes the blob after it responds, so a retry
    // needs a fresh upload. This only re-uploads on the rare failure path.
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
      response = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blobUrl }),
        signal: options?.signal,
      })
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

    const text = String(data.text || '').trim()
    if (!text) {
      if (data.empty) {
        throw new Error(
          'OCR completed but no text was detected. Try a clearer scan or higher resolution.'
        )
      }
      throw new Error('OCR returned an empty result.')
    }

    return text
  }

  throw lastError || new Error('OCR processing failed')
}
