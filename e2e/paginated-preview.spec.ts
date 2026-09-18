import { expect, test, type Page } from '@playwright/test'

async function comparePages(page: Page, path: string) {
  // Read only the glyphs physically visible inside each clipped sheet, not the
  // offscreen columns. Compare their page assignment with an actual PDF.
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
      return text.match(/(?:LINE|ROLE)\d{3}/g) ?? []
    }),
  )
  const pdf = await page.pdf({
    path,
    preferCSSPageSize: true,
    printBackground: true,
  })
  const printed = await page.evaluate(
    async (bytes) => {
      const modulePath = '/src/pdf.ts'
      const { readPdf } = await import(/* @vite-ignore */ modulePath)
      const { text } = await readPdf(
        new File([new Uint8Array(bytes)], 'preview.pdf', { type: 'application/pdf' }),
      )
      return (text as string)
        .split(/--- 第 \d+ 页 ---/)
        .slice(1)
        .map((part) => part.match(/(?:LINE|ROLE)\d{3}/g) ?? [])
    },
    [...pdf],
  )
  expect(visible).toEqual(printed)
  return visible
}

for (const template of ['classic', 'modern', 'compact']) {
  test(`${template}: blank lines, spaces and short headings keep their printed page assignments`, async ({
    page,
  }, testInfo) => {
    await page.goto('/')
    const id = await page.evaluate(async (template) => {
      const domainPath = '/src/domain.ts'
      const dbPath = '/src/db.ts'
      const { createResume, createSection, createItem } = await import(/* @vite-ignore */ domainPath)
      const { db } = await import(/* @vite-ignore */ dbPath)
      const resume = createResume('Whitespace pagination')
      resume.template = template
      resume.content.name = 'Whitespace test'
      const section = createSection('work')
      section.items = Array.from({ length: 12 }, (_, i) => ({
        ...createItem(),
        title: `ROLE${String(i).padStart(3, '0')} Engineer`,
        organization: 'Example     company     with     preserved     spaces',
        startDate: '2020.01',
        endDate: '2024.06',
        description: `LINE${String(i * 2).padStart(3, '0')} First outcome. ${'在跨职能项目中持续改进交付质量，维护组件库并优化页面性能。'.repeat(2)}\n\nLINE${String(i * 2 + 1).padStart(3, '0')} Second outcome.\n\n`,
      }))
      resume.content.sections = [section]
      await db.resumes.add(resume)
      return resume.id
    }, template)
    await page.goto(`/resumes/${id}`)
    await expect(page.getByTestId('preview-page').nth(1)).toBeVisible()
    const visible = await comparePages(page, testInfo.outputPath(`${template}-whitespace.pdf`))
    expect(visible.flat()).toHaveLength(36)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: '查看预览', exact: true }).click()
    await comparePages(page, testInfo.outputPath(`${template}-whitespace-mobile.pdf`))
    const accessible = page.getByTestId('accessible-preview')
    await expect(accessible.getByRole('heading', { name: 'Whitespace test' })).toHaveCount(1)
    await expect(
      accessible.getByRole('paragraph').filter({ hasText: 'LINE023 Second outcome.' }),
    ).toHaveCount(1)
    await expect(page.getByRole('heading', { name: 'Whitespace test' })).toHaveCount(1)
  })
  test(`${template}: preview page contents match exported PDF and update after edits`, async ({
    page,
  }, testInfo) => {
    await page.goto('/')
    await page.getByRole('button', { name: '空白创建', exact: true }).click()
    await page.getByLabel('姓名', { exact: true }).fill('Page Preview')
    await page.getByLabel('姓名', { exact: true }).blur()
    await page.getByLabel('简历模板').selectOption(template)
    await page.getByLabel('新增区块类型').selectOption('work')
    await page.getByRole('button', { name: '添加区块', exact: true }).click()
    await page.getByLabel('职位 / 项目 / 学位', { exact: true }).fill('Engineer')
    await page.getByLabel('公司 / 学校', { exact: true }).fill('Example Company')
    const body = page.getByRole('textbox', { name: '经历描述', exact: true })
    const lines = Array.from(
      { length: 95 },
      (_, i) => `LINE${String(i).padStart(3, '0')} 中文工作成果 and project delivery.`,
    ).join('\n')
    await body.fill(lines)
    await body.blur()
    const sheets = page.getByTestId('preview-page')
    await expect(sheets).toHaveCount(3)
    await expect(page.getByText('第 1 页 / 共 3 页', { exact: true })).toBeVisible()

    const visible = await comparePages(page, testInfo.outputPath(`${template}-preview.pdf`))
    expect(visible.flat()).toHaveLength(95)
    await page.screenshot({ path: testInfo.outputPath(`${template}-paginated.png`) })
    await sheets.nth(1).scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath(`${template}-second-page.png`) })

    await page.getByRole('button', { name: '直接编辑', exact: true }).click()
    const inline = page.getByRole('textbox', { name: '预览：文本内容', exact: true })
    await inline.fill('Shortened in preview')
    await page.getByRole('button', { name: '分页预览', exact: true }).click()
    await expect(body).toHaveValue('Shortened in preview')
    await expect(sheets).toHaveCount(1)
    await expect(page.getByText('第 1 页 / 共 1 页', { exact: true })).toBeVisible()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: '查看预览', exact: true }).click()
    await expect(sheets).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(390)
    await page.screenshot({ path: testInfo.outputPath(`${template}-mobile.png`) })
  })
}
