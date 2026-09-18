import { expect, test } from '@playwright/test'

test('Faysume branding and GitHub link work on desktop and mobile without leaving the workspace', async ({
  page,
  context,
}, testInfo) => {
  const repositoryUrl = 'https://github.com/evanryuu/faysume'
  await context.route(repositoryUrl, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Faysume repository</h1>' }),
  )
  for (const width of [1280, 900, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/materials')
    await expect(page).toHaveTitle('Faysume · 简历工作室')
    const home = page.getByRole('button', { name: 'Faysume 首页', exact: true })
    await expect(home).toHaveText('Faysume')
    await expect(home).toBeVisible()
    const github = page.getByRole('link', { name: '查看 Faysume 的 GitHub 仓库（新标签页）' })
    await expect(github).toBeVisible()
    await expect(github).toHaveAttribute('href', repositoryUrl)
    await expect(github).toHaveAttribute('target', '_blank')
    await expect(github).toHaveAttribute('rel', 'noopener noreferrer')
    const bounds = await github.boundingBox()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900)
    await github.focus()
    await expect(github).toBeFocused()
    const popupPromise = page.waitForEvent('popup')
    await github.press('Enter')
    const popup = await popupPromise
    await expect(popup).toHaveURL(repositoryUrl)
    await expect(page).toHaveURL(/\/materials$/)
    await popup.close()
    await page.screenshot({ path: testInfo.outputPath(`faysume-${width}.png`) })
    await home.click()
    await expect(page).toHaveURL(/\/$/)
  }
  await page.setViewportSize({ width: 1280, height: 900 })
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出全部备份' }).click()
  expect((await downloadPromise).suggestedFilename()).toMatch(/^faysume-\d{4}-\d{2}-\d{2}\.json$/)
})

test('settings controls have enough vertical space for their text on desktop and mobile', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'AI 设置', exact: true }).click()
  const mode = page.getByRole('combobox', { name: '连接方式', exact: true })
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 })
    for (const value of ['server', 'direct']) {
      await mode.selectOption(value)
      await expect(mode).toHaveValue(value)
      const measurements = await page.locator('.field select, .field input').evaluateAll((controls) =>
        controls.map((element) => {
          const style = getComputedStyle(element)
          const context = document.createElement('canvas').getContext('2d')!
          context.font = `${style.fontSize} ${style.fontFamily}`
          const metrics = context.measureText('站点 AI 服务 Ag')
          return {
            label: element.closest('label')?.querySelector('span')?.textContent,
            available:
              element.getBoundingClientRect().height -
              parseFloat(style.paddingTop) -
              parseFloat(style.paddingBottom) -
              parseFloat(style.borderTopWidth) -
              parseFloat(style.borderBottomWidth),
            required: metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent,
          }
        }),
      )
      for (const measurement of measurements) {
        expect(measurement.available, `${width}px ${value}: ${measurement.label}`).toBeGreaterThanOrEqual(
          measurement.required,
        )
      }
      if (value === 'direct') {
        const model = page.getByRole('textbox', { name: '模型名称', exact: true })
        await model.fill('测试模型 Ag')
        await expect(model).toHaveValue('测试模型 Ag')
      }
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width)
      await page.screenshot({
        path: testInfo.outputPath(`settings-${width}-${value}.png`),
        animations: 'disabled',
      })
    }
  }
})

test('dialog keeps keyboard focus, preserves drafts on outside click, and restores focus', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  const trigger = page.getByRole('button', { name: '上传简历 PDF / 截图', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '导入 PDF、截图或文字，生成你的简历' })
  const resumeText = dialog.getByRole('textbox', { name: '简历原文', exact: true })
  await expect(dialog).toBeVisible()
  await resumeText.fill('尚未提交的简历草稿')
  await page.mouse.click(5, 5)
  await expect(dialog).toBeVisible()
  await expect(resumeText).toHaveValue('尚未提交的简历草稿')
  const close = dialog.getByRole('button', { name: '关闭对话框' })
  await close.focus()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: '稍后再说' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  await page.screenshot({ path: testInfo.outputPath('dialog-desktop.png'), animations: 'disabled' })
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()

  await page.setViewportSize({ width: 390, height: 844 })
  await trigger.click()
  await expect(dialog).toBeVisible()
  await resumeText.fill('移动端简历草稿')
  const box = await dialog.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: testInfo.outputPath('dialog-mobile.png'), animations: 'disabled' })
  await close.click()
  await expect(dialog).toHaveCount(0)

  await page.getByRole('button', { name: 'AI 设置' }).click()
  const vision = page.getByRole('checkbox', { name: /这个模型支持图片输入/ })
  await vision.focus()
  await page.keyboard.press('Space')
  await expect(vision).toBeChecked()
  await page.reload()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(vision).toBeChecked()
})
