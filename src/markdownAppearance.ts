import type { CSSProperties } from 'react'
import { z } from 'zod'

export type MarkdownElement =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'p'
  | 'strong'
  | 'a'
  | 'ul'
  | 'ol'
  | 'blockquote'
  | 'code'
  | 'pre'
  | 'table'

export interface MarkdownElementStyle {
  color?: string
  backgroundColor?: string
  borderColor?: string
  headerBackground?: string
  fontSize?: number
  spacing?: number
  lineHeight?: number
  indent?: number
  itemSpacing?: number
  borderWidth?: number
  fontWeight?: 400 | 500 | 600 | 700
  textAlign?: 'left' | 'center' | 'right'
  underline?: boolean
  listStyle?: 'disc' | 'circle' | 'square' | 'decimal' | 'lower-alpha' | 'upper-roman'
}

export type MarkdownAppearance = Partial<Record<MarkdownElement, MarkdownElementStyle>>

type StyleField = keyof MarkdownElementStyle
const headingFields: StyleField[] = ['color', 'fontSize', 'fontWeight', 'spacing', 'textAlign']
const listFields: StyleField[] = ['color', 'indent', 'itemSpacing', 'spacing', 'listStyle']

export const markdownElements: { value: MarkdownElement; label: string; fields: StyleField[] }[] = [
  { value: 'h1', label: '一级标题（H1）', fields: headingFields },
  { value: 'h2', label: '二级标题（H2）', fields: headingFields },
  { value: 'h3', label: '三级标题（H3）', fields: headingFields },
  { value: 'h4', label: '四级标题（H4）', fields: headingFields },
  { value: 'h5', label: '五级标题（H5）', fields: headingFields },
  { value: 'h6', label: '六级标题（H6）', fields: headingFields },
  { value: 'p', label: '段落', fields: ['color', 'fontSize', 'lineHeight', 'spacing', 'textAlign'] },
  { value: 'strong', label: '粗体', fields: ['color', 'fontWeight'] },
  { value: 'a', label: '链接', fields: ['color', 'underline'] },
  { value: 'ul', label: '无序列表', fields: listFields },
  { value: 'ol', label: '有序列表', fields: listFields },
  {
    value: 'blockquote',
    label: '引用',
    fields: ['color', 'backgroundColor', 'borderColor', 'borderWidth', 'spacing'],
  },
  { value: 'code', label: '行内代码', fields: ['color', 'backgroundColor', 'fontSize'] },
  { value: 'pre', label: '代码块', fields: ['color', 'backgroundColor', 'fontSize', 'spacing'] },
  {
    value: 'table',
    label: '表格',
    fields: ['color', 'fontSize', 'headerBackground', 'borderColor', 'borderWidth', 'spacing'],
  },
]

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const styleSchema = z
  .object({
    color: colorSchema.optional(),
    backgroundColor: colorSchema.optional(),
    borderColor: colorSchema.optional(),
    headerBackground: colorSchema.optional(),
    fontSize: z.number().min(8).max(24).optional(),
    spacing: z.number().min(0).max(1.5).optional(),
    lineHeight: z.number().min(1.1).max(2.2).optional(),
    indent: z.number().min(1.2).max(3).optional(),
    itemSpacing: z.number().min(0).max(1).optional(),
    borderWidth: z.number().min(0).max(3).optional(),
    fontWeight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700)]).optional(),
    textAlign: z.enum(['left', 'center', 'right']).optional(),
    underline: z.boolean().optional(),
    listStyle: z.enum(['disc', 'circle', 'square', 'decimal', 'lower-alpha', 'upper-roman']).optional(),
  })
  .strict()

const headingSchema = styleSchema.pick({
  color: true,
  fontSize: true,
  fontWeight: true,
  spacing: true,
  textAlign: true,
})
const listSchema = styleSchema.pick({
  color: true,
  indent: true,
  itemSpacing: true,
  spacing: true,
  listStyle: true,
})

export const markdownAppearanceSchema = z
  .object({
    h1: headingSchema.optional(),
    h2: headingSchema.optional(),
    h3: headingSchema.optional(),
    h4: headingSchema.optional(),
    h5: headingSchema.optional(),
    h6: headingSchema.optional(),
    p: styleSchema
      .pick({ color: true, fontSize: true, lineHeight: true, spacing: true, textAlign: true })
      .optional(),
    strong: styleSchema.pick({ color: true, fontWeight: true }).optional(),
    a: styleSchema.pick({ color: true, underline: true }).optional(),
    ul: listSchema.extend({ listStyle: z.enum(['disc', 'circle', 'square']).optional() }).optional(),
    ol: listSchema
      .extend({ listStyle: z.enum(['decimal', 'lower-alpha', 'upper-roman']).optional() })
      .optional(),
    blockquote: styleSchema
      .pick({ color: true, backgroundColor: true, borderColor: true, borderWidth: true, spacing: true })
      .optional(),
    code: styleSchema.pick({ color: true, backgroundColor: true, fontSize: true }).optional(),
    pre: styleSchema.pick({ color: true, backgroundColor: true, fontSize: true, spacing: true }).optional(),
    table: styleSchema
      .pick({
        color: true,
        fontSize: true,
        headerBackground: true,
        borderColor: true,
        borderWidth: true,
        spacing: true,
      })
      .optional(),
  })
  .strict()

const cssFields: Record<StyleField, { name: string; unit?: string }> = {
  color: { name: 'color' },
  backgroundColor: { name: 'background' },
  borderColor: { name: 'border-color' },
  headerBackground: { name: 'header-background' },
  fontSize: { name: 'size', unit: 'pt' },
  spacing: { name: 'spacing', unit: 'em' },
  lineHeight: { name: 'leading' },
  indent: { name: 'indent', unit: 'em' },
  itemSpacing: { name: 'item-spacing', unit: 'em' },
  borderWidth: { name: 'border-width', unit: 'pt' },
  fontWeight: { name: 'weight' },
  textAlign: { name: 'align' },
  underline: { name: 'decoration' },
  listStyle: { name: 'marker' },
}

export function markdownAppearanceStyle(value?: MarkdownAppearance): CSSProperties {
  const style: Record<string, string | number> = {}
  for (const element of markdownElements) {
    const settings = value?.[element.value]
    if (!settings) continue
    for (const field of element.fields) {
      const setting = settings[field]
      if (setting === undefined) continue
      const { name, unit } = cssFields[field]
      style[`--md-${element.value}-${name}`] =
        typeof setting === 'boolean' ? (setting ? 'underline' : 'none') : unit ? `${setting}${unit}` : setting
    }
  }
  return style as CSSProperties
}

export function mergeMarkdownStyle(
  current: MarkdownAppearance | undefined,
  element: MarkdownElement,
  patch: Partial<MarkdownElementStyle> | null,
): MarkdownAppearance | undefined {
  const next = { ...current }
  if (patch === null) {
    delete next[element]
  } else {
    const style = { ...current?.[element], ...patch }
    for (const field of Object.keys(style) as StyleField[]) {
      if (style[field] === undefined) delete style[field]
    }
    if (Object.keys(style).length) next[element] = style
    else delete next[element]
  }
  return Object.keys(next).length ? next : undefined
}
