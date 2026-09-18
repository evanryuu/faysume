import { test, expect } from '@playwright/test'
import { pdfFixture } from './pdf-fixtures'

const png = {
  name: 'extra.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/cL8AAAAASUVORK5CYII=',
    'base64',
  ),
}
const pdf = {
  name: 'resume.pdf',
  mimeType: 'application/pdf',
  buffer: pdfFixture([
    'A software engineer with experience building accessible applications and developer tools.',
  ]),
}

test('one input accepts PDF and screenshots together, preserves text, and rejects overflow atomically', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: '上传简历 PDF / 截图', exact: true }).click()
  await expect(page.getByRole('button', { name: '上传 PDF', exact: true })).toHaveCount(0)
  const input = page.getByLabel('上传简历 PDF 或图片')
  await page.getByRole('textbox', { name: '简历原文', exact: true }).fill('补充事实')
  await input.setInputFiles([pdf, png])
  await expect(page.getByLabel('PDF 提取文字（可校对）')).toContainText('software engineer')
  await expect(page.getByRole('img', { name: '第 1 页：extra.png' })).toBeVisible()
  await input.setInputFiles(Array.from({ length: 5 }, (_, i) => ({ ...png, name: `extra${i}.png` })))
  await expect(page.getByRole('alert')).toContainText('合计最多 5 页')
  await expect(page.getByRole('textbox', { name: '简历原文', exact: true })).toHaveValue('补充事实')
  await expect(page.getByRole('img', { name: '第 1 页：extra.png' })).toBeVisible()
  await page.getByRole('button', { name: '移除 PDF', exact: true }).click()
  await expect(page.getByRole('img', { name: '第 1 页：extra.png' })).toBeVisible()
})

test('custom sections support text and entries together with persistence and clean preview', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: '空白创建', exact: true }).click()
  await page.getByLabel('新增区块类型').selectOption('other')
  await page.getByRole('button', { name: '添加区块', exact: true }).click()
  await page.getByLabel('区块标题').fill('开源贡献')
  await page.getByLabel('区块标题').blur()
  await expect(page.getByLabel('职位 / 项目 / 学位')).toHaveCount(0)
  await page.getByRole('textbox', { name: '文本内容', exact: true }).fill('维护开源工具\n参与社区文档翻译')
  await page.getByRole('textbox', { name: '文本内容', exact: true }).blur()
  await expect(page.getByTestId('resume-paper')).toContainText('参与社区文档翻译')
  await expect(page.getByTestId('resume-paper').locator('.paper-item-heading')).toHaveCount(0)
  await page.getByRole('button', { name: '添加自由文本', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('free-text-desktop.png') })
  await page.getByRole('button', { name: '添加自由文本', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '文本内容', exact: true })).toHaveCount(2)
  await page.getByRole('button', { name: '删除内容 2', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '文本内容', exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: '添加经历条目', exact: true }).click()
  await page.getByLabel('职位 / 项目 / 学位').fill('维护者')
  await page.getByLabel('职位 / 项目 / 学位').blur()
  await page.reload()
  await expect(page.getByRole('textbox', { name: '文本内容', exact: true })).toHaveValue(
    '维护开源工具\n参与社区文档翻译',
  )
  await expect(page.getByLabel('职位 / 项目 / 学位')).toHaveValue('维护者')
  await page.getByRole('button', { name: '上移内容 2', exact: true }).click()
  await expect(page.getByTestId('resume-paper').locator('.paper-item').first()).toContainText('维护者')
  await page.getByRole('button', { name: '补充标题、时间等', exact: true }).click()
  await expect(page.getByLabel('职位 / 项目 / 学位')).toHaveCount(2)
  await page.getByLabel('职位 / 项目 / 学位').nth(1).fill('社区参与')
  await page.getByLabel('职位 / 项目 / 学位').nth(1).blur()
  await page.reload()
  await expect(page.getByLabel('职位 / 项目 / 学位').nth(1)).toHaveValue('社区参与')
  await page.screenshot({ path: testInfo.outputPath('flexible-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: '添加自由文本', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('flexible-mobile.png') })
})

test('PDF drag and screenshot paste share the importer and both sources survive recognition', async ({
  page,
}) => {
  await page.goto('/settings')
  await page.getByLabel('连接方式').selectOption('direct')
  await page.getByLabel('Base URL', { exact: true }).fill('https://provider.test/v1')
  await page.getByLabel('API Key', { exact: true }).fill('fake-test-key')
  await page.getByLabel('模型名称').fill('vision-test')
  await page.getByLabel('这个模型支持图片输入').check()
  let sent = false
  await page.route('https://provider.test/v1/chat/completions', async (route) => {
    const parts = route.request().postDataJSON().messages[1].content
    expect(parts[0].text).toContain('software engineer')
    expect(parts.filter((part: { type: string }) => part.type === 'image_url')).toHaveLength(1)
    sent = true
    await route.fulfill({
      json: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                content: {
                  name: '混合导入',
                  headline: '',
                  email: '',
                  phone: '',
                  location: '',
                  website: '',
                  summary: '',
                  sections: [
                    {
                      title: '开源',
                      kind: 'other',
                      items: [
                        {
                          title: '',
                          organization: '',
                          location: '',
                          startDate: '',
                          endDate: '',
                          description: '旧格式自由文本',
                        },
                      ],
                    },
                  ],
                },
                warnings: [],
              }),
            },
          },
        ],
      },
    })
  })
  await page.getByRole('button', { name: /我的简历/ }).click()
  await page.getByRole('button', { name: '上传简历 PDF / 截图', exact: true }).click()
  const transfer = await page.evaluateHandle(
    ({ name, bytes, mimeType }) => {
      const data = new DataTransfer()
      data.items.add(new File([new Uint8Array(bytes)], name, { type: mimeType }))
      return data
    },
    { ...pdf, bytes: [...pdf.buffer] },
  )
  await page.locator('.dropzone').dispatchEvent('drop', { dataTransfer: transfer })
  await transfer.dispose()
  await expect(page.getByLabel('PDF 提取文字（可校对）')).toContainText('software engineer')
  const clipboard = await page.evaluateHandle(
    ({ name, bytes, mimeType }) => {
      const data = new DataTransfer()
      data.items.add(new File([new Uint8Array(bytes)], name, { type: mimeType }))
      return data
    },
    { ...png, bytes: [...png.buffer] },
  )
  await page.locator('.dropzone').evaluate((element, data) => {
    element.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
    )
  }, clipboard)
  await clipboard.dispose()
  await expect(page.getByRole('img', { name: '第 1 页：extra.png' })).toBeVisible()
  expect(sent).toBe(false)
  await page.getByRole('button', { name: '识别并生成简历', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '文本内容', exact: true })).toHaveValue('旧格式自由文本')
  await expect(page.getByLabel('职位 / 项目 / 学位')).toHaveCount(0)
  expect(sent).toBe(true)
  await page.getByRole('button', { name: '识别原稿', exact: true }).click()
  await expect(page.getByRole('img', { name: /简历原图/ })).toHaveCount(2)
  await page.reload()
  await expect(page.getByRole('img', { name: /简历原图/ })).toHaveCount(2)
})
