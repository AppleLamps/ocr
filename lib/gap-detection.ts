import type { LayoutDetail } from '@/lib/ocr-fetch'

export type Bbox = [number, number, number, number]

export type MarginGapZone = {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
}

/** Margin bands where letterheads often place dates, refs, etc. */
const MARGIN_GAP_ZONES: MarginGapZone[] = [
  { id: 'top-right', x1: 0.5, y1: 0, x2: 1, y2: 0.22 },
  { id: 'top-left', x1: 0, y1: 0, x2: 0.32, y2: 0.2 },
]

const DEFAULT_COVERAGE_THRESHOLD = 0.22
const MAX_GAP_ZONES = 2

export function flattenLayoutDetails(
  details: LayoutDetail[] | null | undefined
): LayoutDetail[] {
  if (!details?.length) return []
  const first = details[0] as unknown
  if (Array.isArray(first)) {
    return (details as unknown as LayoutDetail[][]).flat()
  }
  return details
}

/** Normalize bbox to [0,1] coordinates using page dimensions when needed. */
export function normalizeBbox(
  bbox: number[],
  pageWidth: number,
  pageHeight: number
): Bbox {
  const [x1, y1, x2, y2] = bbox
  const looksNormalized =
    pageWidth > 1 &&
    pageHeight > 1 &&
    x1 <= 1.5 &&
    y1 <= 1.5 &&
    x2 <= 1.5 &&
    y2 <= 1.5

  if (looksNormalized) {
    return [x1, y1, x2, y2]
  }

  return [x1 / pageWidth, y1 / pageHeight, x2 / pageWidth, y2 / pageHeight]
}

function bboxArea(bbox: Bbox): number {
  return Math.max(0, bbox[2] - bbox[0]) * Math.max(0, bbox[3] - bbox[1])
}

function intersectionArea(a: Bbox, b: Bbox): number {
  const x1 = Math.max(a[0], b[0])
  const y1 = Math.max(a[1], b[1])
  const x2 = Math.min(a[2], b[2])
  const y2 = Math.min(a[3], b[3])
  if (x2 <= x1 || y2 <= y1) return 0
  return (x2 - x1) * (y2 - y1)
}

/** Share of a zone overlapped by any detected layout element (images count as covered). */
export function zoneCoverage(zone: Bbox, elementBboxes: Bbox[]): number {
  const area = bboxArea(zone)
  if (area === 0) return 1

  let covered = 0
  for (const el of elementBboxes) {
    covered += intersectionArea(zone, el)
  }

  return Math.min(1, covered / area)
}

export function hasMainBodyContent(details: LayoutDetail[]): boolean {
  const textElements = details.filter(
    (el) => el.label === 'text' && el.content.trim().length > 0
  )
  if (textElements.length >= 2) return true
  return textElements.some((el) => el.content.trim().length >= 80)
}

export function findUncoveredMarginZones(
  details: LayoutDetail[],
  options?: { coverageThreshold?: number }
): MarginGapZone[] {
  if (!details.length) return []

  const pageWidth = details[0]?.width || 1
  const pageHeight = details[0]?.height || 1
  const threshold = options?.coverageThreshold ?? DEFAULT_COVERAGE_THRESHOLD

  const elementBboxes = details
    .filter((el) => el.bbox_2d?.length === 4)
    .map((el) => normalizeBbox(el.bbox_2d, pageWidth, pageHeight))

  return MARGIN_GAP_ZONES.filter((zone) => {
    const zoneBbox: Bbox = [zone.x1, zone.y1, zone.x2, zone.y2]
    return zoneCoverage(zoneBbox, elementBboxes) < threshold
  }).slice(0, MAX_GAP_ZONES)
}

export function stripOcrImagePlaceholders(text: string): string {
  return text.replace(/!\[\]\(page=\d+,bbox=\[[^\]]+\]\)\s*/g, '').trim()
}

/** Prepend recovered margin text after any leading image placeholders. */
export function mergeGapRecoveryText(
  primary: string,
  recoveredTexts: string[]
): string {
  const parts = recoveredTexts.map(stripOcrImagePlaceholders).filter(Boolean)
  if (!parts.length) return primary

  const recoveredBlock = parts.join('\n\n')
  const imagePrefixMatch = primary.match(/^(\s*!\[\]\(page=\d+,bbox=\[[^\]]+\]\)\s*)+/)
  if (imagePrefixMatch) {
    const prefix = imagePrefixMatch[0].replace(/\s+$/, '')
    const rest = primary.slice(imagePrefixMatch[0].length).trimStart()
    return `${prefix}\n${recoveredBlock}\n\n${rest}`
  }

  return `${recoveredBlock}\n\n${primary}`
}
