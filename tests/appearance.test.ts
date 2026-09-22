import { describe, expect, it } from 'vitest'
import { appearanceSchema, defaultAppearance, readableAccent, resolveAppearance } from '../src/appearance'
import { cloneResume, createResume, documentSchema } from '../src/domain'

describe('resume appearance', () => {
  it('opens old documents with defaults and creates independent appearance settings', () => {
    const old = createResume()
    delete old.appearance
    expect(documentSchema.parse(old).appearance).toBeUndefined()
    expect(resolveAppearance(old.appearance)).toEqual(defaultAppearance)
    const original = createResume()
    original.appearance!.accentColor = '#24548a'
    const copy = cloneResume(original)
    expect(copy.appearance).toEqual(original.appearance)
    copy.appearance!.fontSize = 13
    expect(original.appearance!.fontSize).toBe(11)
    expect(createResume().appearance!.accentColor).toBe(defaultAppearance.accentColor)
  })

  it.each([
    { accentColor: 'red; background: url(https://example.com)' },
    { accentColor: '#fff' },
    { fontFamily: 'external-font' },
    { fontSize: 100 },
    { lineHeight: 0.5 },
    { margin: -1 },
    { spacing: 'unknown' },
  ])('rejects unsafe or unreadable imported settings: %j', (patch) => {
    expect(appearanceSchema.safeParse({ ...defaultAppearance, ...patch }).success).toBe(false)
  })

  it('keeps dark colors and darkens pale colors to a readable heading color', () => {
    expect(readableAccent('#24548a')).toBe('#24548a')
    for (const color of ['#ffffff', '#ffff00', '#00ff00', '#aaffdd']) {
      const safe = readableAccent(color)
      const channels = [1, 3, 5].map((start) => {
        const c = parseInt(safe.slice(start, start + 2), 16) / 255
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      })
      const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
      expect(1.05 / (luminance + 0.05)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
