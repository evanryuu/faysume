import type { CSSProperties } from 'react'
import { z } from 'zod'
import type { ResumeAppearance } from './types'

export const defaultAppearance: ResumeAppearance = {
  accentColor: '#284e43',
  fontFamily: 'sans',
  fontSize: 11,
  lineHeight: 1.65,
  spacing: 'standard',
  margin: 14,
}

export const appearanceSchema = z
  .object({
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    fontFamily: z.enum(['sans', 'serif', 'mono']),
    fontSize: z.number().min(9).max(13),
    lineHeight: z.number().min(1.3).max(1.9),
    spacing: z.enum(['compact', 'standard', 'relaxed']),
    margin: z.number().min(10).max(24),
  })
  .strict()

export const accentColors = [
  { name: '墨绿', value: '#284e43' },
  { name: '黑白', value: '#262626' },
  { name: '深蓝', value: '#24548a' },
  { name: '靛紫', value: '#65478c' },
  { name: '酒红', value: '#923d50' },
  { name: '暖棕', value: '#81583a' },
] as const

const fonts = {
  sans: 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
  serif: 'Georgia, "Songti SC", SimSun, serif',
  mono: '"SFMono-Regular", Consolas, "PingFang SC", "Microsoft YaHei", monospace',
}

export function resolveAppearance(value?: ResumeAppearance): ResumeAppearance {
  return value ?? { ...defaultAppearance }
}

function luminance(color: string) {
  const rgb = [1, 3, 5].map((start) => {
    const channel = parseInt(color.slice(start, start + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
}

// Light accent colors remain available for decoration; titles stay readable on white.
export function readableAccent(color: string) {
  let result = color
  while (1.05 / (luminance(result) + 0.05) < 4.5) {
    result =
      '#' +
      [1, 3, 5]
        .map((start) =>
          Math.floor(parseInt(result.slice(start, start + 2), 16) * 0.9)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')
  }
  return result
}

export function appearanceStyle(appearance: ResumeAppearance): CSSProperties {
  return {
    '--resume-accent': appearance.accentColor,
    '--resume-heading': readableAccent(appearance.accentColor),
    '--resume-on-accent': luminance(appearance.accentColor) > 0.179 ? '#000000' : '#ffffff',
    '--resume-font': fonts[appearance.fontFamily],
    '--resume-size': `${appearance.fontSize}pt`,
    '--resume-leading': appearance.lineHeight,
    '--resume-gap': `${{ compact: 4, standard: 6, relaxed: 8 }[appearance.spacing]}mm`,
    '--resume-margin': `${appearance.margin}mm`,
  } as CSSProperties
}
