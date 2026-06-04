import { extractZaiErrorMessage, isRetryableHttpStatus } from './ocr'
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

export async function submitFileToOcr(
  sourceFile: File,
  options?: { signal?: AbortSignal }
): Promise<string> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    if (options?.signal?.aborted) {
      throw new Error('OCR cancelled')
    }

    const formData = new FormData()
    formData.append('file', sourceFile)

    let response: Response
    try {
      response = await fetch('/api/ocr', {
        method: 'POST',
        body: formData,
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
