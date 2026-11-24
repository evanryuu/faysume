import { expect, test } from '@playwright/test'

test('职业概览从提示添加，每一行可自由修改，工作经历变化后可重新生成并撤销，并进入导出的 PDF', async ({
  page,
}) => {
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
    localStorage.removeItem('faysume.overview-tip')
    sessionStorage.setItem('faysume.preview-mode', 'pages')
    return resume.id
  })
  await page.goto(`/resumes/${id}`)
  const preview = page.getByTestId('accessible-preview')
  const overview = preview.getByTestId('career-overview')
  const heading = overview.getByRole('heading')
  const rows = overview.locator('li')
  await expect(overview).toHaveCount(0)

  await expect(page.getByRole('note')).toContainText('你已经有 2 段工作经历')
  await page.getByRole('button', { name: '添加职业概览', exact: true }).click()
  await expect(page.getByRole('note')).toHaveCount(0)
  await expect(heading).toHaveText('职业概览 共 4 年 8 个月')
  await expect(rows).toHaveText([
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
  await expect(
    page.getByRole('group', { name: '添加区块' }).getByRole('button', { name: /^职业概览/ }),
  ).toBeDisabled()

  const section = page.locator('[data-section-id]').filter({ has: page.locator('.overview-editor') })
  const firstTitle = section.getByLabel('职位', { exact: true }).first()
  await firstTitle.fill('首席交互设计师')
  await firstTitle.blur()
  await expect(rows.first()).toHaveText('2020.07 — 2023.02 晨光科技 首席交互设计师')
  await expect(section.getByText('工作经历有更新')).toHaveCount(0)

  const length = section.getByLabel('总年限', { exact: true })
  await length.fill('8 年+')
  await length.blur()
  await expect(heading).toHaveText('职业概览 8 年+')
  await section.getByRole('button', { name: '恢复自动计算' }).click()
  await expect(heading).toHaveText('职业概览 共 4 年 8 个月')

  const workSection = page.locator('[data-section-id]').filter({ hasNot: page.locator('.overview-editor') })
  const workEnd = workSection.getByLabel('结束时间', { exact: true }).nth(1)
  await workEnd.fill('2023.06')
  await workEnd.blur()
  await expect(section.getByText('工作经历有更新，职业概览还是之前的内容。')).toBeVisible()
  await section.getByRole('button', { name: '按工作经历重新生成' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('你手动改过的行会被覆盖')
  await dialog.getByRole('button', { name: '重新生成', exact: true }).click()
  await expect(rows.first()).toHaveText('2020.07 — 2023.06 晨光科技 交互设计师')
  await expect(heading).toHaveText('职业概览 共 5 年')
  await expect(section.getByText('工作经历有更新')).toHaveCount(0)
  await section.getByRole('button', { name: '撤销重新生成' }).click()
  await expect(rows.first()).toHaveText('2020.07 — 2023.02 晨光科技 首席交互设计师')
  await expect(section.getByText('工作经历有更新，职业概览还是之前的内容。')).toBeVisible()
  await section.getByRole('button', { name: '按工作经历重新生成' }).click()
  await dialog.getByRole('button', { name: '重新生成', exact: true }).click()
  await expect(section.getByRole('button', { name: '撤销重新生成' })).toBeVisible()
  await firstTitle.fill('首席交互设计师')
  await firstTitle.blur()
  await expect(rows.first()).toHaveText('2020.07 — 2023.06 晨光科技 首席交互设计师')
  await expect(section.getByRole('button', { name: '撤销重新生成' })).toHaveCount(0)

  await workEnd.fill('2023.08')
  await workEnd.blur()
  await section.getByRole('button', { name: '保持现状' }).click()
  await expect(section.getByText('工作经历有更新')).toHaveCount(0)
  await expect(section.getByLabel('区块标题', { exact: true })).toBeFocused()
  await expect(rows.first()).toHaveText('2020.07 — 2023.06 晨光科技 首席交互设计师')

  await section.getByRole('button', { name: '添加补充说明' }).click()
  const note = section.getByRole('textbox', { name: '文本内容', exact: true })
  await note.fill('**两段设计经历**，从助理成长为独立负责 B 端产品。')
  await note.blur()
  await expect(overview.locator('strong')).toHaveText('两段设计经历')

  await page.getByRole('button', { name: '直接编辑', exact: true }).click()
  const paper = page.getByTestId('resume-paper')
  const paperLength = paper.getByLabel('预览：总年限')
  await paperLength.fill('近 5 年')
  await paperLength.press('Enter')
  await expect(length).toHaveValue('近 5 年')
  const paperCompany = paper.getByLabel('预览：公司').first()
  await paperCompany.fill('晨光科技（上海）')
  await paperCompany.press('Enter')
  await expect(section.getByLabel('公司', { exact: true }).first()).toHaveValue('晨光科技（上海）')
  await page.getByRole('button', { name: '分页预览', exact: true }).click()

  await page.reload()
  await expect(heading).toHaveText('职业概览 近 5 年')
  await expect(rows.first()).toHaveText(/^2020\.07 — 2023\.06 晨光科技（上海）\s*首席交互设计师$/)

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
  expect(text).toMatch(/首席交互设计师/)
  expect(text).toMatch(/两段设计经历/)
  expect(text.indexOf('职业概览')).toBeLessThan(text.indexOf('工作经历'))
  expect(errors).toEqual([])
})
