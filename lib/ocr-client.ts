/** Browser-only OCR helpers (canvas, PDF chunking). */

import { PDFDocument } from 'pdf-lib'
import {
  OCR_IMAGE_LIMIT_BYTES,
  OCR_PDF_LIMIT_BYTES,
  OCR_PDF_PAGE_LIMIT,
  replaceExtension,
  friendlyPdfLoadError,
} from './ocr'

// Chunks only exist to stay within the API's own per-request limits.
const PDF_CHUNK_TARGET_BYTES = OCR_PDF_LIMIT_BYTES
const PDF_CHUNK_MAX_PAGES = OCR_PDF_PAGE_LIMIT

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function loadImageElement(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Failed to decode image'))
      img.src = objectUrl
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((createdBlob) => resolve(createdBlob), 'image/jpeg', quality)
  })

  if (!blob) {
    throw new Error('Could not encode compressed image')
  }

  return blob
}

/** GLM-OCR accepts JPG/PNG; WebP and oversized images are converted to JPEG. */
export async function prepareImageForOcr(file: File): Promise<File> {
  const needsWebpConversion = file.type === 'image/webp'
  const needsCompression = file.size > OCR_IMAGE_LIMIT_BYTES

  if (!needsWebpConversion && !needsCompression) {
    return file
  }

  const image = await loadImageElement(file)
  const scales = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4]
  const qualities = [0.92, 0.82, 0.72, 0.62, 0.52, 0.42]

  for (const scale of scales) {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Could not initialize canvas for image preparation')
    }
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

    for (const quality of qualities) {
      const blob = await canvasToBlob(canvas, quality)
      if (blob.size <= OCR_IMAGE_LIMIT_BYTES) {
        return new File([blob], replaceExtension(file.name, 'jpg'), {
          type: 'image/jpeg',
          lastModified: Date.now(),
        })
      }
    }
  }

  throw new Error(
    'Image is still too large after compression. Please resize it manually and try again.'
  )
}

async function createPdfChunk(
  source: PDFDocument,
  startPage: number,
  endPageExclusive: number,
  fileName: string,
  partNumber: number
) {
  const chunkDoc = await PDFDocument.create()
  const pageIndexes = Array.from(
    { length: endPageExclusive - startPage },
    (_, idx) => startPage + idx
  )
  const pages = await chunkDoc.copyPages(source, pageIndexes)
  pages.forEach((page) => chunkDoc.addPage(page))
  const chunkBytes = await chunkDoc.save()
  const chunkArrayBuffer = Uint8Array.from(chunkBytes).buffer

  return new File([chunkArrayBuffer], replaceExtension(fileName, `part-${partNumber}.pdf`), {
    type: 'application/pdf',
    lastModified: Date.now(),
  })
}

export async function splitPdfForOcr(file: File): Promise<{ chunks: File[]; pageCount: number }> {
  let source: PDFDocument
  try {
    const bytes = await file.arrayBuffer()
    source = await PDFDocument.load(bytes)
  } catch (error) {
    throw new Error(friendlyPdfLoadError(error))
  }

  const pageCount = source.getPageCount()
  if (pageCount === 0) {
    throw new Error('This PDF has no pages to process.')
  }

  const chunks: File[] = []
  let cursor = 0
  let partNumber = 1

  while (cursor < pageCount) {
    let end = Math.min(cursor + PDF_CHUNK_MAX_PAGES, pageCount)
    let chunk = await createPdfChunk(source, cursor, end, file.name, partNumber)

    while (chunk.size > PDF_CHUNK_TARGET_BYTES && end - cursor > 1) {
      end -= 1
      chunk = await createPdfChunk(source, cursor, end, file.name, partNumber)
    }

    if (chunk.size > OCR_PDF_LIMIT_BYTES) {
      throw new Error(
        'A single PDF page exceeds the upload size limit. Please reduce page resolution and try again.'
      )
    }

    chunks.push(chunk)
    cursor = end
    partNumber += 1
  }

  return { chunks, pageCount }
}

export async function loadPdfPageCount(file: File): Promise<number> {
  try {
    const bytes = await file.arrayBuffer()
    const doc = await PDFDocument.load(bytes)
    return doc.getPageCount()
  } catch (error) {
    throw new Error(friendlyPdfLoadError(error))
  }
}
