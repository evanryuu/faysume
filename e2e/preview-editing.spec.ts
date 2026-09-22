import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('faysume.preview-mode', 'edit'))
})

test('immediate consecutive edits do not conflict with their own pending save', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '空白创建', exact: true }).click()
  const name = page.getByTestId('resume-paper').getByRole('textbox', { name: '预览：姓名', exact: true })
  await name.fill('第一次修改')
  await name.evaluate((element) => {
    const node = element as HTMLInputElement
    node.blur()
    node.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, '连续第二次修改')
    node.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
    node.blur()
  })
  await expect(page.getByRole('textbox', { name: '姓名', exact: true })).toHaveValue('连续第二次修改')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.reload()
  await expect(name).toHaveValue('连续第二次修改')
})

test('preview text edits sync with the form and persist after reload', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '空白创建', exact: true }).click()
  const paper = page.getByTestId('resume-paper')
  const name = paper.getByRole('textbox', { name: '预览：姓名', exact: true })
  await expect(name).toBeVisible()
  await name.fill('刘瀚')
  await name.press('Enter')
  await expect(page.getByRole('textbox', { name: '姓名', exact: true })).toHaveValue('刘瀚')
  await page.getByLabel('新增区块类型').selectOption('skills')
  await page.getByRole('button', { name: '添加区块', exact: true }).click()
  const formText = page.getByRole('textbox', { name: '文本内容', exact: true })
  await formText.fill('熟悉 React / Vue\n熟悉 TypeScript')
  await formText.blur()
  const text = paper.getByRole('textbox', { name: '预览：文本内容', exact: true })
  await text.fill('熟悉 React / Vue\n参与开源项目')
  await text.blur()
  await expect(formText).toHaveValue('熟悉 React / Vue\n参与开源项目')
  await formText.fill('来自左侧的更新')
  await formText.blur()
  await expect(text).toHaveValue('来自左侧的更新')
  await text.fill('不应保存的修改')
  await text.press('Escape')
  await expect(text).toHaveValue('来自左侧的更新')
  await expect(formText).toHaveValue('来自左侧的更新')
  await page.reload()
  await expect(name).toHaveValue('刘瀚')
  await expect(text).toHaveValue('来自左侧的更新')
})

test('preview supports entry fields, templates and mobile without printing editing outlines', async ({
  page,
  context,
}, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: /用虚构示例体验编辑器/ }).click()
  const paper = page.getByTestId('resume-paper')
  for (const [label, value] of [
    ['区块标题', '团队经历'],
    ['职位 / 项目 / 学位', '高级产品设计师'],
    ['公司 / 学校', '设计工作室'],
    ['开始时间', '2024.01'],
    ['结束时间', '2026.09'],
    ['职业标题', '设计负责人'],
    ['邮箱', 'designer@example.com'],
    ['所在地', '上海'],
    ['个人简介', '关注用户体验\n擅长设计系统'],
  ]) {
    const preview = paper.getByRole('textbox', { name: `预览：${label}`, exact: true }).first()
    await preview.fill(value)
    await preview.blur()
    const form =
      label === '区块标题'
        ? page.getByLabel(label, { exact: true })
        : page.getByRole('textbox', { name: label, exact: true })
    await expect(form.first()).toHaveValue(value)
  }
  await page.getByRole('textbox', { name: '个人网站', exact: true }).fill('example.com')
  await page.getByRole('textbox', { name: '个人网站', exact: true }).blur()
  const website = paper.getByRole('textbox', { name: '预览：个人网站' })
  await website.click()
  await website.fill('portfolio.example.com')
  await website.press('Enter')
  await expect(paper.getByRole('link')).toHaveAttribute('href', 'https://portfolio.example.com/')
  expect(context.pages()).toHaveLength(1)
  for (const template of ['classic', 'modern', 'compact']) {
    await page.getByRole('combobox', { name: '简历模板' }).selectOption(template)
    await expect(paper).toHaveClass(new RegExp(`template-${template}`))
    const title = paper.getByRole('textbox', { name: '预览：职业标题' })
    await title.click()
    await expect(title).toBeFocused()
    await page.screenshot({ path: testInfo.outputPath(`preview-${template}.png`) })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '查看预览', exact: true }).click()
  const name = paper.getByRole('textbox', { name: '预览：姓名', exact: true })
  await name.fill('移动端编辑')
  await name.press('Enter')
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await name.click()
  await page.screenshot({ path: testInfo.outputPath('preview-mobile.png') })
  await page.emulateMedia({ media: 'print' })
  await expect(name).toBeHidden()
  await expect(paper.locator('.paper-editable-mirror').first()).toBeVisible()
  await expect(page.locator('.preview-editing-hint')).toBeHidden()
  await page.emulateMedia({ media: 'screen' })
  await page.getByRole('button', { name: '返回编辑', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '姓名', exact: true })).toHaveValue('移动端编辑')
  await page.getByRole('button', { name: '返回简历列表' }).click()
  await expect(page.locator('.miniature input, .miniature textarea')).toHaveCount(0)
})

test('multiline typing, plain text paste and IME confirmation preserve text', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await page.getByRole('button', { name: /用虚构示例体验编辑器/ }).click()
  const paper = page.getByTestId('resume-paper')
  const text = paper.getByRole('textbox', { name: '预览：文本内容' }).first()
  await text.fill('第一行')
  await text.press('End')
  await text.press('Enter')
  await text.pressSequentially('React')
  await text.press('Control+Enter')
  await expect(page.getByRole('textbox', { name: '经历描述', exact: true }).first()).toHaveValue(
    '第一行\nReact',
  )
  await page.evaluate(async () => {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/plain': new Blob(['<b>纯文本</b>\n保留换行'], { type: 'text/plain' }),
        'text/html': new Blob(['<b>纯文本</b><div>保留换行</div>'], { type: 'text/html' }),
      }),
    ])
  })
  await text.fill('')
  await text.press('Meta+V')
  await text.blur()
  await expect(page.getByRole('textbox', { name: '经历描述', exact: true }).first()).toHaveValue(
    '<b>纯文本</b>\n保留换行',
  )
  await expect(text.locator('b')).toHaveCount(0)
  await text.fill('保留空行')
  await text.press('End')
  await text.press('Enter')
  await text.press('Enter')
  await text.blur()
  await expect(page.getByRole('textbox', { name: '经历描述', exact: true }).first()).toHaveValue(
    '保留空行\n\n',
  )
  const name = paper.getByRole('textbox', { name: '预览：姓名', exact: true })
  await name.fill('中文输入')
  await name.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true })
  await expect(name).toBeFocused()
  await name.press('Enter')
  await expect(page.getByRole('textbox', { name: '姓名', exact: true })).toHaveValue('中文输入')
  await text.fill('')
  await text.blur()
  await expect(page.getByRole('textbox', { name: '经历描述', exact: true }).first()).toHaveValue('')
})

test('preview rejects conflicting edits from another tab and shows the saved value', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: '空白创建', exact: true }).click()
  const name = page.getByTestId('resume-paper').getByRole('textbox', { name: '预览：姓名', exact: true })
  await name.fill('原始姓名')
  await name.blur()
  await expect(page.getByRole('textbox', { name: '姓名', exact: true })).toHaveValue('原始姓名')
  const other = await context.newPage()
  await other.goto(page.url())
  await name.fill('尚未保存的姓名')
  await other.getByRole('textbox', { name: '姓名', exact: true }).fill('另一页保存的姓名')
  await other.getByRole('textbox', { name: '姓名', exact: true }).blur()
  await expect(page.getByRole('textbox', { name: '姓名', exact: true })).toHaveValue('另一页保存的姓名')
  await expect(name).toHaveValue('尚未保存的姓名')
  await name.blur()
  await expect(page.getByRole('alert')).toContainText('此字段已在其他操作中更新')
  await expect(name).toHaveValue('另一页保存的姓名')
  await page.reload()
  await expect(name).toHaveValue('另一页保存的姓名')
})
