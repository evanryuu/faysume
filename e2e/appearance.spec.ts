import { expect, test } from '@playwright/test'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

test('appearance updates preview, survives reload and copying, and matches exported PDF styles', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.getByRole('button', { name: '用虚构示例体验编辑器' }).click()
  await page.getByRole('button', { name: '外观', exact: true }).click()
  const panel = page.getByRole('region', { name: '简历外观' })
  const paper = page.getByTestId('resume-paper')
  await panel.getByRole('button', { name: '深蓝', exact: true }).click()
  await expect(paper.locator('h2').first()).toHaveCSS('color', 'rgb(36, 84, 138)')
  await expect(paper.locator('.paper-description').first()).toHaveCSS('color', 'rgb(40, 44, 50)')
  await panel.getByRole('combobox', { name: '字体', exact: true }).selectOption('serif')
  await panel.getByLabel('正文字号').selectOption('12')
  await panel.getByRole('combobox', { name: '行距', exact: true }).selectOption('1.8')
  await panel.getByLabel('段落间距').selectOption('relaxed')
  await panel.getByLabel('页边距').selectOption('22')
  await expect(paper.locator('.paper-description').first()).toHaveCSS('font-size', '16px')
  await expect(paper).toHaveCSS('font-family', /Georgia/)
  await page.reload()
  await page.getByRole('button', { name: '外观', exact: true }).click()
  await expect(panel.getByLabel('页边距')).toHaveValue('22')
  await expect(panel.getByRole('combobox', { name: '行距', exact: true })).toHaveValue('1.8')
  await expect(panel.getByRole('button', { name: '深蓝', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  for (const template of ['classic', 'modern', 'compact']) {
    await page.getByLabel('简历模板').selectOption(template)
    await expect(paper).toHaveClass(new RegExp(`template-${template}`))
    await expect(paper.locator('h2').first()).toHaveCSS('color', 'rgb(36, 84, 138)')
  }
  await page.getByLabel('简历模板').selectOption('modern')
  await expect(paper.locator('.paper-header')).toHaveCSS('background-color', 'rgb(36, 84, 138)')
  await page.screenshot({ path: testInfo.outputPath('appearance-desktop.png') })

  const screen = await paper.evaluate((node) => {
    const body = getComputedStyle(node.querySelector('.paper-description')!)
    const heading = getComputedStyle(node.querySelector('h2')!)
    const style = getComputedStyle(node)
    return {
      font: body.fontFamily,
      size: body.fontSize,
      line: body.lineHeight,
      color: heading.color,
      contentWidth: parseFloat(style.width) - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
    }
  })
  await page.emulateMedia({ media: 'print' })
  await expect(panel).toBeHidden()
  await expect(paper).toBeVisible()
  const printed = await paper.evaluate((node) => {
    const body = getComputedStyle(node.querySelector('.paper-description')!)
    const heading = getComputedStyle(node.querySelector('h2')!)
    return { font: body.fontFamily, size: body.fontSize, line: body.lineHeight, color: heading.color }
  })
  expect(printed).toEqual({ font: screen.font, size: screen.size, line: screen.line, color: screen.color })
  expect(screen.contentWidth).toBeCloseTo(((210 - 44) * 96) / 25.4, 0)
  const pdfBytes = await page.pdf({
    path: testInfo.outputPath('appearance.pdf'),
    preferCSSPageSize: true,
    printBackground: true,
  })
  const loadingTask = getDocument({ data: new Uint8Array(pdfBytes), useSystemFonts: true })
  const pdf = await loadingTask.promise
  let text = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const pdfPage = await pdf.getPage(i)
    expect(pdfPage.view[2]).toBeCloseTo(595, 0)
    const content = await pdfPage.getTextContent()
    const textItems = content.items.filter((item) => 'str' in item && item.str.trim())
    for (const item of textItems) {
      if ('str' in item) expect(item.transform[4]).toBeGreaterThanOrEqual((22 * 72) / 25.4 - 1)
    }
    text += content.items.map((item) => ('str' in item ? item.str : '')).join('')
  }
  expect(text).toContain('林知夏')
  expect(text).not.toContain('恢复默认外观')
  await loadingTask.destroy()
  await page.emulateMedia({ media: 'screen' })

  const originalUrl = page.url()
  await page.getByRole('button', { name: '另存副本', exact: true }).click()
  await expect(page).not.toHaveURL(originalUrl)
  if (await panel.isHidden()) await page.getByRole('button', { name: '外观', exact: true }).click()
  await expect(panel.getByLabel('页边距')).toHaveValue('22')
  await panel.getByRole('button', { name: '恢复默认外观' }).click()
  await expect(panel.getByLabel('页边距')).toHaveValue('14')
  await expect(page.getByLabel('简历模板')).toHaveValue('modern')
  await page.goto(originalUrl)
  await page.getByRole('button', { name: '外观', exact: true }).click()
  await expect(panel.getByLabel('页边距')).toHaveValue('22')
  expect(errors).toEqual([])
})

test('appearance is keyboard accessible and usable at 375px, offline and with reduced motion', async ({
  page,
  context,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
  await page.goto('/')
  await page.getByRole('button', { name: '空白创建', exact: true }).click()
  await page.getByRole('button', { name: '查看预览', exact: true }).click()
  await context.setOffline(true)
  const trigger = page.getByRole('button', { name: '外观', exact: true })
  await trigger.focus()
  await trigger.press('Enter')
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  const panel = page.getByRole('region', { name: '简历外观' })
  const color = panel.getByRole('button', { name: '酒红', exact: true })
  await color.focus()
  await color.press('Space')
  await expect(color).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Tab')
  await expect(panel.getByRole('button', { name: '暖棕', exact: true })).toBeFocused()
  await panel.getByLabel('正文字号').selectOption('13')
  await panel.getByLabel('自定义主题色').fill('#ffff00')
  await expect(panel.getByText(/标题已自动加深/)).toBeVisible()
  await expect(page.getByTestId('resume-paper').locator('h1')).not.toHaveCSS('color', 'rgb(255, 255, 0)')
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  expect((await page.locator('.preview-toolbar').boundingBox())!.height).toBeLessThanOrEqual(72)
  await page.screenshot({ path: testInfo.outputPath('appearance-mobile.png'), fullPage: true })
  await page.addStyleTag({ content: '.appearance-fields label { font-size: 24px; }' })
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
  await trigger.press('Enter')
  await expect(panel).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(page.getByTestId('resume-paper')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('appearance-mobile-preview.png'), fullPage: true })
})

test('long content exports across pages without losing the final section or chosen margins', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: '用虚构示例体验编辑器' }).click()
  const summary = page.getByRole('textbox', { name: '个人简介', exact: true })
  await summary.fill(
    '负责需求分析、交互设计与上线验证，并与团队共同整理用户反馈。\n'.repeat(65) + 'END-OF-LONG-SUMMARY',
  )
  await summary.blur()
  await expect(page.getByTestId('resume-paper')).toContainText('END-OF-LONG-SUMMARY')
  await page.getByRole('button', { name: '外观', exact: true }).click()
  const panel = page.getByRole('region', { name: '简历外观' })
  await panel.getByLabel('页边距').selectOption('24')
  await panel.getByLabel('正文字号').selectOption('13')
  await expect(panel.getByLabel('正文字号')).toHaveValue('13')
  const bytes = await page.pdf({
    path: testInfo.outputPath('appearance-multipage.pdf'),
    preferCSSPageSize: true,
    printBackground: true,
  })
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true })
  const pdf = await task.promise
  expect(pdf.numPages).toBeGreaterThan(1)
  let text = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const pdfPage = await pdf.getPage(i)
    const content = await pdfPage.getTextContent()
    for (const item of content.items) {
      if ('str' in item && item.str.trim()) {
        text += item.str
        expect(item.transform[4]).toBeGreaterThanOrEqual((24 * 72) / 25.4 - 1)
        expect(item.transform[5]).toBeGreaterThan((24 * 72) / 25.4 - 1)
        expect(item.transform[5]).toBeLessThan(pdfPage.view[3] - (24 * 72) / 25.4)
      }
    }
  }
  expect(text).toContain('END-OF-LONG-SUMMARY')
  expect(text.match(/负责需求分析/g)).toHaveLength(65)
  expect(text).toContain('Figma')
  await task.destroy()
})
