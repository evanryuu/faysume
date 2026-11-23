import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appearanceSchema, appearanceStyle, defaultAppearance, resolveAppearance } from '../src/appearance'
import { db, exportBackup, importBackup, insertResume, mutateResume } from '../src/db'
import { cloneResume, createResume, documentSchema } from '../src/domain'
import {
  markdownAppearanceSchema,
  markdownAppearanceStyle,
  markdownElements,
  mergeMarkdownStyle,
  type MarkdownAppearance,
  type MarkdownElementStyle,
} from '../src/markdownAppearance'

describe('Markdown element appearance', () => {
  it('leaves old and new documents on the existing Markdown defaults until customized', () => {
    const old = createResume()
    delete old.appearance
    expect(documentSchema.parse(old).appearance).toBeUndefined()
    expect(resolveAppearance(old.appearance).markdown).toBeUndefined()
    expect(createResume().appearance?.markdown).toBeUndefined()
    expect(appearanceSchema.parse(defaultAppearance)).toEqual(defaultAppearance)
    expect(markdownAppearanceStyle()).toEqual({})
    expect(markdownAppearanceStyle({})).toEqual({})
    expect(Object.keys(appearanceStyle(defaultAppearance)).filter((key) => key.startsWith('--md-'))).toEqual(
      [],
    )
  })

  it('accepts the controls offered for every supported element', () => {
    const values: Required<MarkdownElementStyle> = {
      color: '#abcdef',
      backgroundColor: '#fedcba',
      borderColor: '#ABCDEF',
      headerBackground: '#f0f0f0',
      fontSize: 24,
      spacing: 1.5,
      lineHeight: 2.2,
      indent: 3,
      itemSpacing: 1,
      borderWidth: 3,
      fontWeight: 700,
      textAlign: 'center',
      underline: false,
      listStyle: 'circle',
    }
    const markdown = Object.fromEntries(
      markdownElements.map(({ value, fields }) => [
        value,
        Object.fromEntries(
          fields.map((field) => [
            field,
            value === 'ol' && field === 'listStyle' ? 'upper-roman' : values[field],
          ]),
        ),
      ]),
    )
    expect(markdownAppearanceSchema.parse(markdown)).toEqual(markdown)
    expect(appearanceSchema.parse({ ...defaultAppearance, markdown }).markdown).toEqual(markdown)
  })

  it('exports only customized CSS variables with physical font sizes and original colors', () => {
    const markdown: MarkdownAppearance = {
      h2: { color: '#ffff00', fontSize: 16, fontWeight: 500, textAlign: 'center', spacing: 0 },
      p: { lineHeight: 1.7 },
      a: { underline: false },
      ul: { listStyle: 'square', indent: 2.4, itemSpacing: 0.5 },
      code: { backgroundColor: '#eeeeee' },
      blockquote: { borderColor: '#123456', borderWidth: 0 },
      table: { headerBackground: '#abcdef' },
    }
    const expected = {
      '--md-h2-color': '#ffff00',
      '--md-h2-size': '16pt',
      '--md-h2-weight': 500,
      '--md-h2-align': 'center',
      '--md-h2-spacing': '0em',
      '--md-p-leading': 1.7,
      '--md-a-decoration': 'none',
      '--md-ul-marker': 'square',
      '--md-ul-indent': '2.4em',
      '--md-ul-item-spacing': '0.5em',
      '--md-code-background': '#eeeeee',
      '--md-blockquote-border-color': '#123456',
      '--md-blockquote-border-width': '0pt',
      '--md-table-header-background': '#abcdef',
    }
    expect(markdownAppearanceStyle(markdown)).toEqual(expected)
    expect(appearanceStyle({ ...defaultAppearance, markdown })).toMatchObject(expected)
    expect(markdownAppearanceStyle({ a: { underline: true } })).toEqual({ '--md-a-decoration': 'underline' })
  })

  it.each([
    { h7: { color: '#ffffff' } },
    { img: { color: '#ffffff' } },
    { h1: { underline: true } },
    { p: { borderWidth: 1 } },
    { a: { fontSize: 12 } },
    { strong: { spacing: 0.2 } },
    { code: { spacing: 0.2 } },
    { table: { backgroundColor: '#ffffff' } },
    { ul: { listStyle: 'decimal' } },
    { ol: { listStyle: 'disc' } },
    { h2: { color: 'red; background: url(https://example.com)' } },
    { code: { backgroundColor: 'url(https://example.com)' } },
    { blockquote: { borderColor: '#fff' } },
    { table: { headerBackground: 'transparent' } },
    { h2: { fontSize: '16pt' } },
    { h2: { fontSize: 7 } },
    { h2: { fontSize: 25 } },
    { h2: { fontWeight: 900 } },
    { h2: { textAlign: 'justify' } },
    { h2: { spacing: -0.1 } },
    { h2: { spacing: 1.6 } },
    { p: { lineHeight: 1 } },
    { p: { lineHeight: 2.3 } },
    { ul: { indent: 1 } },
    { ol: { indent: 3.1 } },
    { ul: { itemSpacing: -0.1 } },
    { ol: { itemSpacing: 1.1 } },
    { blockquote: { borderWidth: -1 } },
    { table: { borderWidth: 4 } },
    { a: { underline: 'false' } },
  ])('rejects unsafe values or controls unsupported by that element: %j', (markdown) => {
    expect(markdownAppearanceSchema.safeParse(markdown).success).toBe(false)
    expect(appearanceSchema.safeParse({ ...defaultAppearance, markdown }).success).toBe(false)
  })

  it('merges successive changes without changing the source or losing other element settings', () => {
    const original: MarkdownAppearance = { h2: { color: '#123456' }, p: { lineHeight: 1.8 } }
    const resized = mergeMarkdownStyle(original, 'h2', { fontSize: 18 })
    const aligned = mergeMarkdownStyle(resized, 'h2', { textAlign: 'right' })
    expect(aligned).toEqual({
      h2: { color: '#123456', fontSize: 18, textAlign: 'right' },
      p: { lineHeight: 1.8 },
    })
    expect(original).toEqual({ h2: { color: '#123456' }, p: { lineHeight: 1.8 } })
    expect(resized).toEqual({ h2: { color: '#123456', fontSize: 18 }, p: { lineHeight: 1.8 } })
  })

  it('resets one property or element independently and removes empty customizations', () => {
    const original: MarkdownAppearance = { h2: { color: '#123456', fontSize: 18 }, a: { underline: false } }
    const resetColor = mergeMarkdownStyle(original, 'h2', { color: undefined })
    expect(resetColor).toEqual({ h2: { fontSize: 18 }, a: { underline: false } })
    expect(mergeMarkdownStyle(resetColor, 'h2', null)).toEqual({ a: { underline: false } })
    expect(mergeMarkdownStyle({ h2: { fontSize: 18 } }, 'h2', { fontSize: undefined })).toBeUndefined()
    expect(mergeMarkdownStyle({ h2: { fontSize: 18 } }, 'h2', null)).toBeUndefined()
    expect(mergeMarkdownStyle(undefined, 'h2', {})).toBeUndefined()
    expect(mergeMarkdownStyle(undefined, 'h2', null)).toBeUndefined()
    expect(original.h2).toEqual({ color: '#123456', fontSize: 18 })
  })

  it('keeps nested Markdown styles independent when a resume is duplicated', () => {
    const original = createResume()
    original.appearance!.markdown = { h2: { color: '#123456', fontSize: 18 }, a: { underline: false } }
    const copy = cloneResume(original)
    expect(copy.appearance?.markdown).toEqual(original.appearance!.markdown)
    copy.appearance!.markdown!.h2!.fontSize = 24
    copy.appearance!.markdown!.a!.underline = true
    expect(original.appearance!.markdown).toEqual({
      h2: { color: '#123456', fontSize: 18 },
      a: { underline: false },
    })
  })
})

describe('Markdown appearance persistence', () => {
  beforeEach(async () => {
    await db.open()
    await Promise.all([db.resumes.clear(), db.materials.clear(), db.sources.clear()])
  })
  afterEach(async () => {
    await db.delete()
  })

  it('preserves queued changes after reopening and makes an independent backup copy', async () => {
    const doc = createResume('Markdown 样式')
    doc.appearance!.markdown = { h2: { color: '#123456' } }
    await insertResume(doc)
    await Promise.all([
      mutateResume(doc.id, (current) => ({
        ...current,
        appearance: {
          ...current.appearance!,
          markdown: mergeMarkdownStyle(current.appearance?.markdown, 'h2', { fontSize: 18 }),
        },
      })),
      mutateResume(doc.id, (current) => ({
        ...current,
        appearance: {
          ...current.appearance!,
          markdown: mergeMarkdownStyle(current.appearance?.markdown, 'a', { underline: false }),
        },
      })),
    ])
    db.close()
    await db.open()
    const expected = { h2: { color: '#123456', fontSize: 18 }, a: { underline: false } }
    expect((await db.resumes.get(doc.id))?.appearance?.markdown).toEqual(expected)
    await importBackup(await exportBackup())
    const restored = (await db.resumes.toArray()).find((item) => item.id !== doc.id)!
    expect(restored.appearance?.markdown).toEqual(expected)
    await mutateResume(restored.id, (current) => ({
      ...current,
      appearance: {
        ...current.appearance!,
        markdown: mergeMarkdownStyle(current.appearance?.markdown, 'h2', null),
      },
    }))
    expect((await db.resumes.get(restored.id))?.appearance?.markdown).toEqual({ a: { underline: false } })
    expect((await db.resumes.get(doc.id))?.appearance?.markdown).toEqual(expected)
  })
})
