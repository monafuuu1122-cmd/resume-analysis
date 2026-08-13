import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

function readLossyWebpDimensions(relativePath: string) {
  const buffer = readFileSync(resolve(process.cwd(), relativePath))
  expect(buffer.toString('ascii', 0, 4)).toBe('RIFF')
  expect(buffer.toString('ascii', 8, 12)).toBe('WEBP')
  expect(buffer.toString('ascii', 12, 16)).toBe('VP8 ')

  const frameHeader = 20
  expect(buffer.subarray(frameHeader + 3, frameHeader + 6)).toEqual(
    Buffer.from([0x9d, 0x01, 0x2a]),
  )

  return {
    width: buffer.readUInt16LE(frameHeader + 6) & 0x3fff,
    height: buffer.readUInt16LE(frameHeader + 8) & 0x3fff,
  }
}

describe('dashboard artwork dimensions', () => {
  it('fits the planned hero slot exactly', () => {
    expect(
      readLossyWebpDimensions(
        'public/assets/dashboard/hero-job-journey.webp',
      ),
    ).toEqual({ width: 1600, height: 520 })
  })

  it.each([
    'card-experiences.webp',
    'card-capabilities.webp',
    'card-role-directions.webp',
    'card-jd-lab.webp',
  ])('fits %s to the planned card slot exactly', (filename) => {
    expect(
      readLossyWebpDimensions(`public/assets/dashboard/${filename}`),
    ).toEqual({ width: 480, height: 320 })
  })
})
