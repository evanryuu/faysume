import { test, expect, type Page } from '@playwright/test'
import { pdfFixture } from './pdf-fixtures'

const pageOne = 'PDF Candidate: Software engineer with five years of project experience.'
const pageTwo = 'Second page: Led the payment platform migration and documented results.'
const upload = (buffer: Buffer, name = 'resume.pdf') => ({ name, mimeType: 'application/pdf', buffer })

test('PDF assets are served locally and Chinese PDF text is readable', async ({ page, context, request }) => {
  for (const asset of [
    'cmaps/UniGB-UTF16-H.bcmap',
    'standard_fonts/LiberationSans-Regular.ttf',
    'wasm/openjpeg.wasm',
  ]) {
    const response = await request.get(`/pdfjs/${asset}`)
    expect(response.ok()).toBe(true)
    expect(response.headers()['content-type'] ?? '').not.toContain('text/html')
    const body = await response.body()
    expect(body.length).toBeGreaterThan(100)
    expect(body.subarray(0, 100).toString().toLowerCase()).not.toContain('<!doctype html')
  }
  const source = await context.newPage()
  const chinese = '负责支付平台前端开发和系统迁移，完成项目文档整理以及团队协作，保留真实经历作为简历素材。'
  await source.setContent(`<html lang="zh"><meta charset="utf-8"><body><p>${chinese}</p></body></html>`)
  const bytes = await source.pdf({ format: 'A4' })
  await source.close()
  await page.goto('/materials')
  await page.getByLabel('上传经历素材').setInputFiles(upload(bytes, '中文经历.pdf'))
  await expect(page.getByLabel('素材标题')).toHaveValue('中文经历')
  await expect(page.getByLabel('完整经历与证据')).toContainText('负责支付平台')
})

async function configure(page: Page, vision = false) {
  await page.goto('/settings')
  await page.getByLabel('连接方式').selectOption('direct')
  await page.getByLabel('Base URL', { exact: true }).fill('https://provider.test/v1')
  await page.getByLabel('API Key', { exact: true }).fill('fake-pdf-test-key')
  await page.getByLabel('模型名称').fill('pdf-test-model')
  if (vision) await page.getByLabel('这个模型支持图片输入').check()
  await page.getByRole('button', { name: /我的简历/ }).click()
  await page.getByRole('button', { name: '上传简历 PDF / 截图', exact: true }).click()
}

test('text PDF parses locally, preserves all pages, imports without vision and keeps source previews', async ({
  page,
}) => {
  const requests: unknown[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('https://provider.test/v1/chat/completions', async (route) => {
    const body = route.request().postDataJSON()
    requests.push(body)
    expect(typeof body.messages[1].content).toBe('string')
    expect(body.messages[1].content).toContain(pageOne)
    expect(body.messages[1].content).toContain(pageTwo)
    expect(body.messages[1].content).toContain('Additional facts')
    await route.fulfill({
      json: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                content: {
                  name: 'PDF Candidate',
                  headline: '',
                  email: '',
                  phone: '',
                  location: '',
                  website: '',
                  summary: pageTwo,
                  sections: [],
                },
                warnings: [],
              }),
            },
          },
        ],
      },
    })
  })
  await configure(page)
  await page.getByLabel('简历原文', { exact: true }).fill('Additional facts')
  await page.getByLabel('上传简历 PDF').setInputFiles(upload(pdfFixture([pageOne, pageTwo])))
  await expect(page.getByLabel('PDF 提取文字（可校对）')).toContainText(pageTwo)
  await expect(page.getByRole('region', { name: 'PDF 预览' }).getByRole('img')).toHaveCount(2)
  expect(requests).toHaveLength(0)
  await expect(page.getByRole('button', { name: '识别并生成简历' })).toBeEnabled()
  await page.getByRole('button', { name: '识别并生成简历' }).click()
  await expect(page.getByLabel('姓名', { exact: true })).toHaveValue('PDF Candidate')
  expect(requests).toHaveLength(1)
  await page.getByRole('button', { name: '识别原稿', exact: true }).click()
  await expect(page.getByRole('img', { name: /简历原图/ })).toHaveCount(2)
  await page.reload()
  await expect(page.getByRole('img', { name: /简历原图/ })).toHaveCount(2)
  expect(errors).toEqual([])
})

test('mixed scanned PDF requires vision and sends rendered pages only after confirmation', async ({
  page,
}) => {
  let called = false
  await page.route('https://provider.test/v1/chat/completions', async (route) => {
    called = true
    const content = route.request().postDataJSON().messages[1].content
    expect(content.filter((part: { type: string }) => part.type === 'image_url')).toHaveLength(2)
    expect(content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/)
    await route.fulfill({ status: 400, json: {} })
  })
  await configure(page)
  await page.getByLabel('上传简历 PDF').setInputFiles(upload(pdfFixture([pageOne, null])))
  await expect(page.getByText(/第 2 页文字不足/)).toBeVisible()
  await expect(page.getByRole('button', { name: '识别并生成简历' })).toBeDisabled()
  expect(called).toBe(false)
  await page.getByRole('button', { name: '关闭对话框' }).click()
  await page.getByRole('button', { name: 'AI 设置', exact: true }).click()
  await page.getByLabel('这个模型支持图片输入').check()
  await page.getByRole('button', { name: /我的简历/ }).click()
  await page.getByRole('button', { name: '上传简历 PDF / 截图', exact: true }).click()
  await page.getByLabel('上传简历 PDF').setInputFiles(upload(pdfFixture([pageOne, null])))
  await expect(page.getByRole('button', { name: '识别并生成简历' })).toBeEnabled()
  expect(called).toBe(false)
  await page.getByRole('button', { name: '识别并生成简历' }).click()
  await expect(page.getByRole('alert')).toContainText('HTTP 400')
  expect(called).toBe(true)
  await expect(page.getByRole('region', { name: 'PDF 预览' })).toBeVisible()
})

test('materials PDF is locally extracted, reviewed and saved; scan is rejected without partial import', async ({
  page,
}) => {
  await page.goto('/materials')
  await page
    .getByLabel('上传经历素材')
    .setInputFiles(upload(pdfFixture([pageOne, pageTwo]), 'experience.pdf'))
  await expect(page.getByLabel('素材标题')).toHaveValue('experience')
  await expect(page.getByLabel('完整经历与证据')).toContainText(pageTwo)
  await page.getByRole('button', { name: '保存素材' }).click()
  await expect(page.getByRole('heading', { name: 'experience', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'experience', exact: true })).toBeVisible()
  await page.getByLabel('上传经历素材').setInputFiles(upload(pdfFixture([pageOne, null]), 'scan.pdf'))
  await expect(page.getByRole('alert')).toContainText('暂不支持扫描 PDF')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'scan', exact: true })).toHaveCount(0)
  await page.getByLabel('上传经历素材').setInputFiles({
    name: 'notes.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('Existing markdown still works'),
  })
  await expect(page.getByLabel('完整经历与证据')).toHaveValue('Existing markdown still works')
})

test('invalid, encrypted and oversized PDFs fail explicitly without replacing an existing draft', async ({
  page,
}) => {
  await configure(page)
  const file = page.getByLabel('上传简历 PDF')
  await file.setInputFiles(upload(pdfFixture([pageOne])))
  await expect(page.getByLabel('PDF 提取文字（可校对）')).toContainText(pageOne)
  for (const [buffer, message] of [
    [Buffer.from('not a pdf'), '文件可能已损坏'],
    [pdfFixture([pageOne], true), '已加密'],
    [pdfFixture(Array(6).fill(pageOne)), '最多支持 5 页'],
    [Buffer.alloc(10 * 1024 * 1024 + 1), '不超过 10MB'],
    [Buffer.alloc(0), '非空'],
  ] as const) {
    await file.setInputFiles(upload(buffer))
    await expect(page.getByRole('alert')).toContainText(message)
    await expect(page.getByRole('button', { name: '更换 PDF', exact: true })).toBeEnabled()
    await expect(page.getByLabel('PDF 提取文字（可校对）')).toContainText(pageOne)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: '移除 PDF' }).click()
  await expect(page.getByLabel('PDF 提取文字（可校对）')).toHaveCount(0)
  await expect(page.getByLabel('上传截图文件')).toBeAttached()
})
