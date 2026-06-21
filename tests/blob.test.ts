import { describe, it, expect } from 'vitest'
import { getBlobAccess, isOwnBlobUrl, isPrivateBlobUrl } from '@/lib/blob'

describe('isOwnBlobUrl', () => {
  it('accepts public and private blob hosts', () => {
    expect(
      isOwnBlobUrl(
        'https://abc123.public.blob.vercel-storage.com/ocr-uploads/file.pdf'
      )
    ).toBe(true)
    expect(
      isOwnBlobUrl(
        'https://abc123.private.blob.vercel-storage.com/ocr-uploads/file.pdf'
      )
    ).toBe(true)
  })

  it('rejects other hosts and schemes', () => {
    expect(isOwnBlobUrl('https://evil.example.com/file.pdf')).toBe(false)
    expect(isOwnBlobUrl('http://abc.public.blob.vercel-storage.com/x')).toBe(false)
    expect(isOwnBlobUrl('not-a-url')).toBe(false)
  })
})

describe('isPrivateBlobUrl', () => {
  it('detects private blob URLs', () => {
    expect(
      isPrivateBlobUrl(
        'https://abc123.private.blob.vercel-storage.com/ocr-uploads/file.pdf'
      )
    ).toBe(true)
    expect(
      isPrivateBlobUrl(
        'https://abc123.public.blob.vercel-storage.com/ocr-uploads/file.pdf'
      )
    ).toBe(false)
  })
})

describe('getBlobAccess', () => {
  it('defaults to private when unset', () => {
    expect(getBlobAccess()).toBe('private')
  })
})
