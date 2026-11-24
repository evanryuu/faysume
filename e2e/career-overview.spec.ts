import { expect, test } from '@playwright/test'

test('职业概览作为区块添加到工作经历前，总年限可手写、可恢复自动，并进入导出的 PDF', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  const id = await page.evaluate(async () => {
    const domainPath = '/src/domain.ts'
    const dbPath = '/src/db.ts'
    const { createResume, createSection, createItem } = await import(/* @vite-ignore */ domainPath)
    const { db } = await import(/* @vite-ignore */ dbPath)
    const resume = createResume('职业概览验收')
    resume.content.name = '林一'
    resume.content.summary = '六年产品设计经验。'
    const project = createSection('project')
    project.items = [{ ...createItem(), title: '协作工具改版', startDate: '2022.01', endDate: '2022.06' }]
    const work = createSection('work')
    work.items = [
      {
        ...createItem(),
        title: '交互设计师',
        organization: '晨光科技',
        startDate: '2020.07',
        endDate: '2023.02',
      },
      {
        ...createItem(),
        title: '设计助理',
        organization: '远山工作室',
        startDate: '2018.07',
        endDate: '2020.06',
      },
    ]
    resume.content.sections = [project, work]
    await db.resumes.add(resume)
    sessionStorage.setItem('faysume.preview-mode', 'pages')
    return resume.id
  })
  await page.goto(`/resumes/${id}`)
  const preview = page.getByTestId('accessible-preview')
  const overview = preview.getByTestId('career-overview')
  await expect(overview).toHaveCount(0)

  await page.getByLabel('新增区块类型').selectOption('overview')
  await page.getByRole('button', { name: '添加区块' }).click()
  await expect(overview.getByRole('heading')).toHaveText('职业概览 共 4 年 8 个月')
  await expect(overview.locator('li')).toHaveText([
    '2020.07 — 2023.02 晨光科技 交互设计师',
    '2018.07 — 2020.06 远山工作室 设计助理',
  ])
  const headings = await preview.locator('.paper-section > h2').allTextContents()
  expect(headings.map((h) => h.replace(/\s*共.*/, ''))).toEqual([
    '个人简介',
    '项目经历',
    '职业概览',
    '工作经历',
  ])

  const length = page.getByLabel('总年限', { exact: true })
  await length.fill('8 年+')
  await length.blur()
  await expect(overview.getByRole('heading')).toHaveText('职业概览 8 年+')
  await page.getByRole('button', { name: '恢复自动计算' }).click()
  await expect(overview.getByRole('heading')).toHaveText('职业概览 共 4 年 8 个月')
  await expect(length).toHaveValue('')

  await page.getByRole('button', { name: '添加补充说明' }).click()
  const note = page.locator('.editor-scroll').getByLabel('文本内容').last()
  await note.fill('**两段设计经历**，从助理成长为独立负责 B 端产品。')
  await note.blur()
  await expect(overview.locator('strong')).toHaveText('两段设计经历')

  await page.getByRole('button', { name: '直接编辑', exact: true }).click()
  const paperLength = page.getByTestId('resume-paper').getByLabel('预览：总年限')
  await paperLength.fill('近 5 年')
  await paperLength.press('Enter')
  await expect(length).toHaveValue('近 5 年')
  await page.getByRole('button', { name: '分页预览', exact: true }).click()

  await page.reload()
  await expect(overview.getByRole('heading')).toHaveText('职业概览 近 5 年')
  await page.screenshot({ path: testInfo.outputPath('career-overview.png') })

  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true })
  const text = await page.evaluate(
    async (bytes) => {
      const modulePath = '/src/pdf.ts'
      const { readPdf } = await import(/* @vite-ignore */ modulePath)
      const result = await readPdf(
        new File([new Uint8Array(bytes)], 'overview.pdf', { type: 'application/pdf' }),
      )
      return result.text as string
    },
    [...pdf],
  )
  expect(text).toMatch(/职业概览\s*近\s*5\s*年/)
  expect(text).toMatch(/两段设计经历/)
  expect(text.indexOf('职业概览')).toBeLessThan(text.indexOf('工作经历'))
  expect(errors).toEqual([])
})
