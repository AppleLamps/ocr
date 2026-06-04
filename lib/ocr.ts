/** GLM-OCR limits and helpers shared by client and API route. */

export const OCR_IMAGE_LIMIT_BYTES = 10 * 1024 * 1024
export const OCR_PDF_LIMIT_BYTES = 50 * 1024 * 1024
export const OCR_PDF_PAGE_LIMIT = 100
export const DROPZONE_MAX_BYTES = 200 * 1024 * 1024
export const VERCEL_FUNCTION_PAYLOAD_LIMIT_BYTES = 4.5 * 1024 * 1024
export const OCR_FUNCTION_FILE_LIMIT_BYTES = 4 * 1024 * 1024

export const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
])

export const SUPPORTED_MIME_TYPES = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/pdf',
])

const EXTENSION_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
}

export function inferMimeType(fileName: string, reportedType?: string): string {
  const normalized = reportedType?.toLowerCase().trim()
  if (normalized && normalized !== 'application/octet-stream') {
    if (normalized === 'image/jpg') return 'image/jpeg'
    return normalized
  }

  const ext = fileName.split('.').pop()?.toLowerCase()
  return (ext && EXTENSION_TO_MIME[ext]) || 'application/octet-stream'
}

export function isSupportedOcrMime(mimeType: string): boolean {
  const normalized = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType
  return SUPPORTED_MIME_TYPES.has(normalized) || mimeType === 'image/webp'
}

export function isPdfMime(mimeType: string): boolean {
  return mimeType === 'application/pdf'
}

export function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

/** Parse Z.AI error payloads (nested `error` object or top-level `message`). */
export function extractZaiErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined

  const root = payload as Record<string, unknown>
  const nested = root.error
  if (nested && typeof nested === 'object') {
    const nestedError = nested as Record<string, unknown>
    if (typeof nestedError.message === 'string' && nestedError.message.trim()) {
      const code =
        nestedError.code !== undefined && nestedError.code !== null
          ? String(nestedError.code)
          : undefined
      return code ? `${nestedError.message} (code ${code})` : nestedError.message
    }
  }

  if (typeof root.message === 'string' && root.message.trim()) {
    return root.message
  }

  return undefined
}

export function isRetryableHttpStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

export function replaceExtension(name: string, nextExt: string): string {
  return `${name.replace(/\.[^/.]+$/, '')}.${nextExt}`
}

export function friendlyPdfLoadError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()

  if (lower.includes('encrypt') || lower.includes('password')) {
    return 'This PDF is password-protected. Remove the password and try again.'
  }
  if (lower.includes('invalid') || lower.includes('parse') || lower.includes('corrupt')) {
    return 'Could not read this PDF. The file may be corrupted or not a valid PDF.'
  }

  return `Could not read this PDF: ${message}`
}
