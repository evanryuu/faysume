import { expect, test, type Page } from '@playwright/test'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const sample = [
  'A paragraph before the heading.',
  '',
  '## CUSTOM HEADING',
  '',
  '**Delivered outcome** with [supporting evidence](https://example.com/work).',
  '',
  '- First useful outcome',
  '- Second useful outcome',
  '',
  '> Customer evidence and feedback.',
  '',
  'Inline `npm test` stays distinct from a code block.',
  '',
  '```js',
  'const delivered = true',
  '```',
  '',
  '| Skill | Evidence |',
  '| --- | --- |',
  '| React | Shipped product |',
].join('\n')

async function seed(page: Page, description = sample, template = 'classic') {
  await page.setViewportSize({ width: 1440, height: 1050 })
  await page.goto('/')
  const id = await page.evaluate(
    async ({ description, template }) => {
      const domainPath = '/src/domain.ts'
      const dbPath = '/src/db.ts'
      const { createResume, createSection, createItem } = await import(/* @vite-ignore */ domainPath)
      const { db } = await import(/* @vite-ignore */ dbPath)
      const resume = createResume('Markdown style acceptance')
      resume.template = template
      resume.content.name = 'Resume Owner'
      resume.content.summary = 'A summary with **verifiable outcomes**.'
      const section = createSection('work')
      section.items = [{ ...createItem(), title: 'Product Engineer', description }]
      resume.content.sections = [section]
      await db.resumes.add(resume)
      sessionStorage.setItem('faysume.preview-mode', 'pages')
      return resume.id
    },
    { description, template },
  )
  await page.goto(`/resumes/${id}`)
  await expect(page.getByTestId('preview-page').first()).toBeVisible()
  return page.url()
}

async function openStyles(page: Page) {
  const appearance = page.getByRole('region', { name: '简历外观', exact: true })
  if (await appearance.isHidden()) await page.getByRole('button', { name: '外观', exact: true }).click()
  const panel = page.getByRole('region', { name: 'Markdown 元素样式', exact: true })
  if (await panel.isHidden()) await page.locator('summary').filter({ hasText: 'Markdown 元素样式' }).click()
  return panel
}

async function headingAndListStyles(page: Page) {
  const panel = await openStyles(page)
  const element = panel.getByRole('combobox', { name: 'Markdown 元素', exact: true })
  await element.selectOption('h2')
  await panel.getByLabel('文字颜色', { exact: true }).fill('#923d50')
  await panel.getByRole('combobox', { name: '字号', exact: true }).selectOption('16')
  await panel.getByRole('combobox', { name: '上下间距', exact: true }).selectOption('1')
  await element.selectOption('ul')
  await panel.getByRole('combobox', { name: '列表标记', exact: true }).selectOption('square')
  await panel.getByRole('combobox', { name: '缩进', exact: true }).selectOption('2')
  await panel.getByRole('combobox', { name: '列表项间距', exact: true }).selectOption('0.5')
  return panel
}

async function pdfContents(page: Page, path: string) {
  const bytes = await page.pdf({ path, preferCSSPageSize: true, printBackground: true })
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true })
  try {
    const document = await task.promise
    const pages = []
    for (let number = 1; number <= document.numPages; number++) {
      const sheet = await document.getPage(number)
      const content = await sheet.getTextContent()
      pages.push(content.items.flatMap((item) => ('str' in item ? [item] : [])))
    }
    return pages
  } finally {
    await task.destroy()
  }
}

async function comparePages(page: Page, path: string, boundaryTolerance = 0) {
  await page.evaluate(() => document.fonts.ready)
  const visible = await page.getByTestId('preview-page').evaluateAll((pages) =>
    pages.map((sheet) => {
      const clip = sheet.querySelector('.page-content')!.getBoundingClientRect()
      const walker = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT)
      let text = ''
      while (walker.nextNode()) {
        const node = walker.currentNode
        for (let i = 0; i < (node.textContent?.length ?? 0); i++) {
          const range = document.createRange()
          range.setStart(node, i)
          range.setEnd(node, i + 1)
          const box = range.getBoundingClientRect()
          if (
            box.width &&
            box.left >= clip.left - 1 &&
            box.right <= clip.right + 1 &&
            box.top >= clip.top - 1 &&
            box.bottom <= clip.bottom + 1
          )
            text += node.textContent![i]
        }
      }
      return text.match(/LINE\d{3}/g) ?? []
    }),
  )
  const printed = (await pdfContents(page, path)).map(
    (items) =>
      items
        .map((item) => item.str)
        .join('')
        .match(/LINE\d{3}/g) ?? [],
  )
  expect(visible.flat()).toEqual(printed.flat())
  expect(visible).toHaveLength(printed.length)
  for (let pageIndex = 0; pageIndex < visible.length; pageIndex++) {
    const visibleThroughPage = visible.slice(0, pageIndex + 1).flat().length
    const printedThroughPage = printed.slice(0, pageIndex + 1).flat().length
    expect(Math.abs(visibleThroughPage - printedThroughPage)).toBeLessThanOrEqual(boundaryTolerance)
  }
  return visible
}

test('element controls persist together, copy independently, and reset only the selected element', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const originalUrl = await seed(page)
  await page.getByRole('button', { name: '直接编辑', exact: true }).click()
  const panel = await headingAndListStyles(page)
  const appearance = page.getByRole('region', { name: '简历外观', exact: true })
  await appearance.getByRole('button', { name: '深蓝', exact: true }).click()
  const paper = page.getByTestId('resume-paper')
  const heading = paper.locator('.resume-markdown h2')
  await expect(heading).toHaveCSS('color', 'rgb(146, 61, 80)')
  await expect(heading).toHaveCSS('font-size', '21.3333px')
  await expect(heading).toHaveCSS('margin-top', '21.3333px')
  await expect(paper.locator('.paper-section > h2').first()).toHaveCSS('color', 'rgb(36, 84, 138)')
  await expect(paper.locator('.paper-header h1')).not.toHaveCSS('font-size', '21.3333px')
  const list = paper.locator('.resume-markdown ul').first()
  await expect(list).toHaveCSS('list-style-type', 'square')
  expect(
    await list.evaluate((node) => {
      const style = getComputedStyle(node)
      return parseFloat(style.paddingInlineStart) / parseFloat(style.fontSize)
    }),
  ).toBeCloseTo(2, 2)
  expect(
    await list.evaluate((node) => {
      const second = node.children[1]
      return parseFloat(getComputedStyle(second).marginTop) / parseFloat(getComputedStyle(node).fontSize)
    }),
  ).toBeCloseTo(0.5, 2)

  const element = panel.getByRole('combobox', { name: 'Markdown 元素', exact: true })
  await element.selectOption('pre')
  await panel.getByLabel('背景颜色', { exact: true }).fill('#f0e5d5')
  await panel.getByLabel('文字颜色', { exact: true }).fill('#923d50')
  await expect(paper.locator('.resume-markdown pre')).toHaveCSS('background-color', 'rgb(240, 229, 213)')
  await expect(paper.locator('.resume-markdown pre code')).toHaveCSS('color', 'rgb(146, 61, 80)')
  await element.selectOption('table')
  await panel.getByLabel('边框颜色', { exact: true }).fill('#65478c')
  await panel.getByRole('combobox', { name: '边框粗细', exact: true }).selectOption('2')
  await panel.getByLabel('表头背景', { exact: true }).fill('#e7eef7')
  await expect(paper.locator('.resume-markdown th').first()).toHaveCSS(
    'background-color',
    'rgb(231, 238, 247)',
  )
  await expect(paper.locator('.resume-markdown td').first()).toHaveCSS(
    'border-top-color',
    'rgb(101, 71, 140)',
  )
  const borderWidth = await paper
    .locator('.resume-markdown td')
    .first()
    .evaluate((node) => parseFloat(getComputedStyle(node).borderTopWidth))
  // CSS point widths are rounded to device pixels when borders are painted.
  expect(Math.abs(borderWidth - (2 * 96) / 72)).toBeLessThan(1)
  await expect(panel.getByRole('combobox', { name: '列表标记', exact: true })).toHaveCount(0)
  await panel.screenshot({ path: testInfo.outputPath('markdown-style-panel.png') })

  await page.reload()
  await openStyles(page)
  await element.selectOption('h2')
  await expect(panel.getByLabel('文字颜色', { exact: true })).toHaveValue('#923d50')
  await expect(panel.getByRole('combobox', { name: '字号', exact: true })).toHaveValue('16')
  await expect(panel.getByRole('combobox', { name: '上下间距', exact: true })).toHaveValue('1')
  await expect(heading).toHaveCSS('color', 'rgb(146, 61, 80)')
  await page.getByRole('button', { name: '另存副本', exact: true }).click()
  await expect(page).not.toHaveURL(originalUrl)
  await openStyles(page)
  await element.selectOption('h2')
  await expect(panel.getByRole('combobox', { name: '字号', exact: true })).toHaveValue('16')
  await panel.getByRole('button', { name: '恢复该元素默认样式', exact: true }).click()
  await expect(panel.getByRole('combobox', { name: '字号', exact: true })).toHaveValue('')
  await expect(heading).not.toHaveCSS('color', 'rgb(146, 61, 80)')
  await expect(list).toHaveCSS('list-style-type', 'square')
  await expect(paper.locator('.resume-markdown pre')).toHaveCSS('background-color', 'rgb(240, 229, 213)')
  await expect(appearance.getByRole('button', { name: '深蓝', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await element.selectOption('ul')
  await expect(panel.getByRole('combobox', { name: '缩进', exact: true })).toHaveValue('2')
  await expect(panel.getByRole('combobox', { name: '列表项间距', exact: true })).toHaveValue('0.5')
  await page.goto(originalUrl)
  await expect(heading).toHaveCSS('color', 'rgb(146, 61, 80)')
  await expect(heading).toHaveCSS('font-size', '21.3333px')
  await page.getByRole('button', { name: '分页预览', exact: true }).click()
  await page
    .getByTestId('preview-page')
    .first()
    .screenshot({ path: testInfo.outputPath('markdown-style-preview.png') })
  expect(errors).toEqual([])
})

test('custom element styles match print while the actual PDF preserves the selected heading size', async ({
  page,
}, testInfo) => {
  await seed(page)
  await page.getByRole('button', { name: '直接编辑', exact: true }).click()
  await headingAndListStyles(page)
  const paper = page.getByTestId('resume-paper')
  const styles = () =>
    paper.evaluate((node) => {
      const heading = getComputedStyle(node.querySelector('.resume-markdown h2')!)
      const list = getComputedStyle(node.querySelector('.resume-markdown ul')!)
      return {
        heading: [heading.fontSize, heading.color, heading.marginTop, heading.marginBottom],
        list: [list.listStyleType, list.paddingInlineStart, list.fontSize],
      }
    })
  const screen = await styles()
  const inline = page.getByRole('textbox', { name: '预览：文本内容', exact: true })
  await inline.focus()
  await page.emulateMedia({ media: 'print' })
  await expect(inline).toBeHidden()
  await expect(paper.locator('.resume-markdown h2')).toBeVisible()
  expect(await styles()).toEqual(screen)
  const printed = await pdfContents(page, testInfo.outputPath('markdown-style-print.pdf'))
  const items = printed.flat()
  const heading = items.filter((item) => /CUSTOM|HEADING/.test(item.str))
  expect(heading.length).toBeGreaterThan(0)
  for (const item of heading) expect(Math.abs(item.transform[0])).toBeCloseTo(16, 1)
  const text = items.map((item) => item.str).join('')
  expect(text).toContain('CUSTOM HEADING')
  expect(text).toContain('First useful outcome')
  expect(text).toContain('Shipped product')
  expect(text).not.toContain('## CUSTOM')
  expect(text).not.toContain('Markdown 元素样式')
  await page.emulateMedia({ media: 'screen' })
})

for (const template of ['classic', 'modern', 'compact']) {
  test(`${template}: custom Markdown styles preserve content and near-matching page boundaries at 375px`, async ({
    page,
  }, testInfo) => {
    const description = Array.from(
      { length: 72 },
      (_, i) =>
        `${i % 12 === 0 ? `\n\n## Outcome group ${i / 12 + 1}\n\nEvidence from shipped projects and user feedback.\n\n` : ''}- **LINE${String(i).padStart(3, '0')}** Delivered useful customer outcomes.`,
    ).join('\n')
    await seed(page, description, template)
    const panel = await headingAndListStyles(page)
    await panel.getByRole('combobox', { name: 'Markdown 元素', exact: true }).selectOption('p')
    await panel.getByRole('combobox', { name: '字号', exact: true }).selectOption('12')
    await panel.getByRole('combobox', { name: '上下间距', exact: true }).selectOption('0.5')
    await page
      .getByRole('region', { name: '简历外观', exact: true })
      .getByRole('combobox', { name: '页边距', exact: true })
      .selectOption('22')
    await page.getByRole('button', { name: '外观', exact: true }).click()
    await expect(page.getByTestId('preview-page').nth(1)).toBeVisible()
    // Chromium may move the last modern-template list item to the next preview column
    // while its print paginator keeps that same item on the current PDF page.
    const tolerance = template === 'modern' ? 1 : 0
    const desktop = await comparePages(
      page,
      testInfo.outputPath(`${template}-custom-markdown.pdf`),
      tolerance,
    )
    expect(desktop.flat()).toEqual(Array.from({ length: 72 }, (_, i) => `LINE${String(i).padStart(3, '0')}`))
    await page.setViewportSize({ width: 375, height: 900 })
    await page.getByRole('button', { name: '查看预览', exact: true }).click()
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(375)
    const mobile = await comparePages(
      page,
      testInfo.outputPath(`${template}-custom-markdown-mobile.pdf`),
      tolerance,
    )
    expect(mobile).toEqual(desktop)
    await page.screenshot({ path: testInfo.outputPath(`${template}-custom-markdown-mobile.png`) })
  })
}

test('element styles work on an empty mobile resume with keyboard, offline and enlarged controls', async ({
  page,
  context,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
  await page.goto('/')
  await page.getByRole('button', { name: '空白创建', exact: true }).click()
  await page.getByRole('button', { name: '查看预览', exact: true }).click()
  const appearanceTrigger = page.getByRole('button', { name: '外观', exact: true })
  await appearanceTrigger.focus()
  await appearanceTrigger.press('Enter')
  const summary = page.locator('summary').filter({ hasText: 'Markdown 元素样式' })
  const panel = page.getByRole('region', { name: 'Markdown 元素样式', exact: true })
  await expect(panel).toBeHidden()
  await context.setOffline(true)
  await summary.focus()
  await summary.press('Enter')
  await expect(panel).toBeVisible()
  await page.keyboard.press('Tab')
  expect(await panel.evaluate((node) => node.contains(document.activeElement))).toBe(true)
  const element = panel.getByRole('combobox', { name: 'Markdown 元素', exact: true })
  await element.selectOption('h2')
  await panel.getByRole('combobox', { name: '字号', exact: true }).selectOption('16')
  await panel.getByLabel('文字颜色', { exact: true }).fill('#923d50')
  await expect(panel.getByRole('combobox', { name: '字号', exact: true })).toHaveValue('16')
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  await page.screenshot({ path: testInfo.outputPath('markdown-style-mobile-panel.png'), fullPage: true })
  await page.addStyleTag({
    content:
      '.appearance-panel label, .appearance-panel select, .appearance-panel summary { font-size: 24px; }',
  })
  const controlsFit = await panel.locator('select').evaluateAll((controls) =>
    controls.every((control) => {
      const style = getComputedStyle(control)
      return (
        control.clientHeight >=
        parseFloat(style.lineHeight) + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
      )
    }),
  )
  expect(controlsFit).toBe(true)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  await summary.focus()
  await summary.press('Space')
  await expect(panel).toBeHidden()
  await expect(summary).toBeFocused()
  await appearanceTrigger.press('Enter')
  await expect(page.getByTestId('preview-page').first()).toBeVisible()
})
