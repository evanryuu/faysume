import { expect, test, type Page } from '@playwright/test'

const sample = [
  '### Project outcomes',
  '',
  '**Delivered product** with *careful testing* and ~~old workflow~~.',
  '',
  '- Parent outcome',
  '  - Nested outcome',
  '- Second outcome',
  '',
  '1. Research',
  '2. Delivery',
  '',
  '> Customer evidence',
  '',
  '[Portfolio](https://example.com/work) and `npm test`.',
  '',
  '```js',
  'const shipped = true',
  '```',
  '',
  '| Skill | Level |',
  '| --- | --- |',
  '| React | Advanced |',
].join('\n')

async function seed(page: Page, description: string, template = 'classic', margin = 14) {
  await page.goto('/')
  const id = await page.evaluate(
    async ({ description, template, margin }) => {
      const domainPath = '/src/domain.ts'
      const dbPath = '/src/db.ts'
      const { createResume, createSection, createItem } = await import(/* @vite-ignore */ domainPath)
      const { db } = await import(/* @vite-ignore */ dbPath)
      const resume = createResume('Markdown acceptance')
      resume.template = template
      resume.appearance.margin = margin
      resume.content.name = '**Literal name**'
      resume.content.summary = '**Summary outcome** with *evidence*.'
      const section = createSection('work')
      section.items = [{ ...createItem(), title: '**Literal title**', description }]
      resume.content.sections = [section]
      await db.resumes.add(resume)
      sessionStorage.setItem('faysume.preview-mode', 'pages')
      return resume.id
    },
    { description, template, margin },
  )
  await page.goto(`/resumes/${id}`)
  await expect(page.getByTestId('preview-page').first()).toBeVisible()
  return id
}

async function readPdf(page: Page, path: string) {
  const pdf = await page.pdf({ path, preferCSSPageSize: true, printBackground: true })
  return page.evaluate(
    async (bytes) => {
      const modulePath = '/src/pdf.ts'
      const { readPdf } = await import(/* @vite-ignore */ modulePath)
      const { text } = await readPdf(
        new File([new Uint8Array(bytes)], 'markdown.pdf', { type: 'application/pdf' }),
      )
      return text as string
    },
    [...pdf],
  )
}

async function comparePages(page: Page, path: string) {
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
  const printed = (await readPdf(page, path))
    .split(/--- 第 \d+ 页 ---/)
    .slice(1)
    .map((part) => part.match(/LINE\d{3}/g) ?? [])
  expect(visible).toEqual(printed)
  return visible
}

test('renders rich body content while keeping source, refresh and single-line fields intact', async ({
  page,
}, testInfo) => {
  await seed(page, sample)
  const accessible = page.getByTestId('accessible-preview')
  await expect(accessible.locator('strong').filter({ hasText: 'Delivered product' })).toHaveCount(1)
  await expect(accessible.locator('strong').filter({ hasText: 'Summary outcome' })).toHaveCount(1)
  await expect(accessible.locator('em').filter({ hasText: 'careful testing' })).toHaveCount(1)
  await expect(accessible.locator('ul ul li')).toHaveText('Nested outcome')
  await expect(accessible.locator('ol > li')).toHaveText(['Research', 'Delivery'])
  await expect(accessible.getByRole('heading', { name: 'Project outcomes' })).toHaveCount(1)
  await expect(accessible.getByRole('link', { name: 'Portfolio' })).toHaveAttribute(
    'href',
    'https://example.com/work',
  )
  await expect(accessible.locator('blockquote')).toContainText('Customer evidence')
  await expect(accessible.locator('pre code')).toHaveText('const shipped = true\n')
  await expect(accessible.getByRole('cell', { name: 'Advanced' })).toHaveCount(1)
  await expect(accessible.locator('h1')).toHaveText('**Literal name**')
  await expect(accessible.locator('h1 strong')).toHaveCount(0)
  await expect(accessible.getByRole('heading', { name: '**Literal title**', exact: true })).toHaveCount(1)
  await page
    .getByTestId('preview-page')
    .first()
    .screenshot({ path: testInfo.outputPath('markdown-rich-preview.png') })
  const richPdf = await readPdf(page, testInfo.outputPath('markdown-rich-preview.pdf'))
  expect(richPdf).toContain('Delivered product')
  expect(richPdf).toContain('Advanced')
  expect(richPdf).not.toContain('**Delivered product**')
  const body = page.getByRole('textbox', { name: '经历描述', exact: true })
  await expect(body).toHaveValue(sample)
  await page.reload()
  await expect(body).toHaveValue(sample)
  await page.getByRole('button', { name: '直接编辑', exact: true }).click()
  const inline = page.getByRole('textbox', { name: '预览：文本内容', exact: true })
  const title = page.getByRole('textbox', { name: '预览：职位 / 项目 / 学位', exact: true })
  await title.focus()
  await title.press('Tab')
  await expect(inline).toBeFocused()
  await inline.focus()
  await expect(inline).toHaveValue(sample)
  await inline.fill('**Uncommitted draft**')
  await inline.press('Escape')
  await expect(body).toHaveValue(sample)
  await expect(inline).toHaveValue(sample)
  const edited = '**Saved outcome**\n\n- Saved item\n  - Saved nested item'
  await inline.fill(edited)
  await inline.blur()
  await expect(body).toHaveValue(edited)
  await expect(
    page.getByTestId('resume-paper').locator('strong').filter({ hasText: 'Saved outcome' }),
  ).toBeVisible()
  await page.reload()
  await expect(body).toHaveValue(edited)
  await inline.focus()
  await page.emulateMedia({ media: 'print' })
  await expect(inline).toBeHidden()
  await expect(
    page.getByTestId('resume-paper').locator('strong').filter({ hasText: 'Saved outcome' }),
  ).toBeVisible()
  const printed = await readPdf(page, testInfo.outputPath('focused-markdown.pdf'))
  expect(printed).toContain('Saved outcome')
  expect(printed).not.toContain('**Saved outcome**')
  expect(printed).not.toContain('Uncommitted draft')
  await page.emulateMedia({ media: 'screen' })
  await page.screenshot({ path: testInfo.outputPath('markdown-desktop.png') })
})

test('Markdown paragraphs follow the selected resume line height in preview and print', async ({ page }) => {
  await seed(page, sample)
  await page.getByRole('button', { name: '外观', exact: true }).click()
  const appearance = page.getByRole('region', { name: '简历外观' })
  for (const lineHeight of ['1.5', '1.8']) {
    await appearance.getByRole('combobox', { name: '行距', exact: true }).selectOption(lineHeight)
    const paragraph = page.getByTestId('preview-page').first().locator('.resume-markdown p').first()
    await expect
      .poll(() =>
        paragraph.evaluate((node) => {
          const style = getComputedStyle(node)
          return parseFloat(style.lineHeight) / parseFloat(style.fontSize)
        }),
      )
      .toBeCloseTo(Number(lineHeight), 2)
    await page.emulateMedia({ media: 'print' })
    const printed = page.getByTestId('resume-paper').locator('.resume-markdown p').first()
    await expect
      .poll(() =>
        printed.evaluate((node) => {
          const style = getComputedStyle(node)
          return parseFloat(style.lineHeight) / parseFloat(style.fontSize)
        }),
      )
      .toBeCloseTo(Number(lineHeight), 2)
    await page.emulateMedia({ media: 'screen' })
  }
})

test('HTML, dangerous links and Markdown images cannot execute or request remote resources', async ({
  page,
}) => {
  const requested: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('markdown-tracker.invalid')) requested.push(request.url())
  })
  await seed(
    page,
    '<script>window.markdownExecuted = true</script>\n\n<img src="https://markdown-tracker.invalid/raw.png" onerror="window.markdownExecuted = true">\n\n[Unsafe](javascript:alert%281%29)\n\n[Data](data:text/html,test)\n\n![Diagram description](https://markdown-tracker.invalid/image.png)',
  )
  const accessible = page.getByTestId('accessible-preview')
  await expect(accessible).toContainText('<script>window.markdownExecuted = true</script>')
  await expect(accessible).toContainText('Diagram description')
  await expect(accessible.locator('script, img, iframe')).toHaveCount(0)
  await expect(accessible.locator('a[href^="javascript:"], a[href^="data:"]')).toHaveCount(0)
  await page.getByRole('button', { name: '直接编辑', exact: true }).click()
  await page.getByRole('textbox', { name: '预览：文本内容', exact: true }).focus()
  expect(await page.evaluate(() => 'markdownExecuted' in window)).toBe(false)
  expect(requested).toEqual([])
})

for (const template of ['classic', 'modern', 'compact']) {
  test(`${template}: Markdown list page assignments match PDF with custom margins and at 375px`, async ({
    page,
  }, testInfo) => {
    const description = Array.from(
      { length: 96 },
      (_, i) =>
        `${i % 3 === 1 ? '  ' : ''}- **LINE${String(i).padStart(3, '0')}** Delivered useful customer outcomes.`,
    ).join('\n')
    await seed(page, description, template, 22)
    await expect(page.getByTestId('preview-page').nth(1)).toBeVisible()
    const desktop = await comparePages(page, testInfo.outputPath(`${template}-markdown.pdf`))
    expect(desktop.flat()).toEqual(Array.from({ length: 96 }, (_, i) => `LINE${String(i).padStart(3, '0')}`))
    await page.setViewportSize({ width: 375, height: 900 })
    await page.getByRole('button', { name: '查看预览', exact: true }).click()
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(375)
    const mobile = await comparePages(page, testInfo.outputPath(`${template}-markdown-mobile.pdf`))
    expect(mobile).toEqual(desktop)
    await page.screenshot({ path: testInfo.outputPath(`${template}-markdown-mobile.png`) })
  })
}
