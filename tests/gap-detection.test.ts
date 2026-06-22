import { describe, it, expect } from 'vitest'
import type { LayoutDetail } from '@/lib/ocr-fetch'
import {
  findUncoveredMarginZones,
  flattenLayoutDetails,
  hasMainBodyContent,
  mergeGapRecoveryText,
  normalizeBbox,
  stripOcrImagePlaceholders,
  zoneCoverage,
} from '@/lib/gap-detection'

function detail(
  partial: Partial<LayoutDetail> & Pick<LayoutDetail, 'bbox_2d'>
): LayoutDetail {
  return {
    index: 0,
    label: 'text',
    content: 'sample',
    height: 1000,
    width: 800,
    ...partial,
  }
}

describe('normalizeBbox', () => {
  it('keeps normalized coordinates', () => {
    expect(normalizeBbox([0.1, 0.2, 0.5, 0.4], 800, 1000)).toEqual([
      0.1, 0.2, 0.5, 0.4,
    ])
  })

  it('converts pixel coordinates using page size', () => {
    expect(normalizeBbox([80, 100, 400, 500], 800, 1000)).toEqual([
      0.1, 0.1, 0.5, 0.5,
    ])
  })
})

describe('zoneCoverage', () => {
  it('returns 0 when nothing overlaps the zone', () => {
    const zone = [0.5, 0, 1, 0.2] as const
    expect(zoneCoverage(zone, [[0, 0.3, 0.4, 0.8]])).toBe(0)
  })

  it('returns partial coverage for overlapping boxes', () => {
    const zone = [0.5, 0, 1, 0.2] as const
    expect(zoneCoverage(zone, [[0.7, 0.02, 0.95, 0.1]])).toBeGreaterThan(0)
    expect(zoneCoverage(zone, [[0.7, 0.02, 0.95, 0.1]])).toBeLessThan(1)
  })
})

describe('findUncoveredMarginZones', () => {
  it('flags top-right when only left-side elements are detected', () => {
    const details = [
      detail({
        index: 0,
        label: 'image',
        bbox_2d: [62, 79, 275, 203],
        content: '',
      }),
      detail({
        index: 1,
        label: 'image',
        bbox_2d: [60, 203, 273, 513],
        content: '',
      }),
      detail({
        index: 2,
        label: 'text',
        bbox_2d: [300, 520, 750, 900],
        content: 'Dear Congressman',
      }),
    ]

    const gaps = findUncoveredMarginZones(details)
    expect(gaps.some((g) => g.id === 'top-right')).toBe(true)
  })

  it('does not flag top-right when text covers that band', () => {
    const details = [
      detail({
        bbox_2d: [0.55, 0.03, 0.95, 0.08],
        content: 'June 18, 2026',
      }),
      detail({
        bbox_2d: [0.2, 0.2, 0.9, 0.95],
        content: 'Body paragraph',
      }),
    ]

    const gaps = findUncoveredMarginZones(details)
    expect(gaps.some((g) => g.id === 'top-right')).toBe(false)
  })
})

describe('hasMainBodyContent', () => {
  it('requires enough body text before gap recovery runs', () => {
    expect(hasMainBodyContent([detail({ content: 'Hi' })])).toBe(false)
    expect(
      hasMainBodyContent([
        detail({ content: 'Line one' }),
        detail({ index: 1, content: 'Line two' }),
      ])
    ).toBe(true)
  })
})

describe('mergeGapRecoveryText', () => {
  it('prepends recovered text before the main body', () => {
    expect(mergeGapRecoveryText('Dear Congressman:', ['June 18, 2026'])).toBe(
      'June 18, 2026\n\nDear Congressman:'
    )
  })
})

describe('stripOcrImagePlaceholders', () => {
  it('removes bbox image markers', () => {
    expect(
      stripOcrImagePlaceholders('![](page=0,bbox=[1,2,3,4])\n\nHello')
    ).toBe('Hello')
  })

  it('removes multiple leading letterhead placeholders', () => {
    const input = `![](page=0,bbox=[62, 79, 275, 203])

![](page=0,bbox=[60, 203, 273, 513])

Dear Congressman:`
    expect(stripOcrImagePlaceholders(input)).toBe('Dear Congressman:')
  })
})

describe('flattenLayoutDetails', () => {
  it('flattens per-page nested arrays', () => {
    const nested = [
      [detail({ index: 0, bbox_2d: [0, 0, 1, 1] })],
      [detail({ index: 1, bbox_2d: [0, 0, 1, 1] })],
    ] as unknown as LayoutDetail[]
    expect(flattenLayoutDetails(nested)).toHaveLength(2)
  })
})
