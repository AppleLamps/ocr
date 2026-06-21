/** Vercel Blob helpers shared by the API routes. */

/**
 * Read-write token for the Blob store. The store is provisioned under the
 * `zaiblob_` prefix in this project, so prefer that and fall back to the
 * SDK default for portability.
 */
export function getBlobToken(): string | undefined {
  return process.env.zaiblob_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN
}

/**
 * Only accept URLs that live on our own Blob store host. The OCR route hands
 * this URL to Z.AI to fetch and then deletes it, so a caller must not be able
 * to point either action at an arbitrary host.
 */
export function isOwnBlobUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  return (
    url.protocol === 'https:' &&
    url.hostname.endsWith('.public.blob.vercel-storage.com')
  )
}
