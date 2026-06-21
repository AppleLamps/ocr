/** Vercel Blob helpers shared by the API routes. */

export type BlobAccess = 'public' | 'private'

/**
 * Read-write token for the Blob store. The store is provisioned under the
 * `zaiblob_` prefix in this project, so prefer that and fall back to the
 * SDK default for portability.
 */
export function getBlobToken(): string | undefined {
  return process.env.zaiblob_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN
}

/**
 * Blob store access mode. New Vercel Blob stores default to private; uploads
 * must use the same mode or the Blob API returns 400 (often surfaced as CORS).
 * `NEXT_PUBLIC_BLOB_ACCESS` is injected from the server env in `next.config.js`.
 */
export function getBlobAccess(): BlobAccess {
  const value =
    process.env.NEXT_PUBLIC_BLOB_ACCESS ||
    process.env.BLOB_ACCESS ||
    process.env.zaiblob_ACCESS

  return value === 'public' ? 'public' : 'private'
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
    (url.hostname.endsWith('.public.blob.vercel-storage.com') ||
      url.hostname.endsWith('.private.blob.vercel-storage.com'))
  )
}

export function isPrivateBlobUrl(value: string): boolean {
  try {
    return new URL(value).hostname.endsWith('.private.blob.vercel-storage.com')
  } catch {
    return false
  }
}
