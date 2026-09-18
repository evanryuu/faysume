import { test, expect } from '@playwright/test'

test('create, edit, persist, duplicate and change template without losing content', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /把经历，写成\s*下一次机会。/ })).toBeVisible()
  await page.getByRole('button', { name: '空白创建', exact: true }).click()
  await page.getByLabel('姓名', { exact: true }).fill('测试用户')
  await page.getByLabel('职业标题', { exact: true }).fill('前端工程师')
  await page.getByLabel('职业标题', { exact: true }).blur()
  await expect(page.getByTestId('resume-paper')).toContainText('测试用户')
  const resumeUrl = page.url()
  await page.reload()
  await expect(page).toHaveURL(resumeUrl)
  await expect(page.getByLabel('姓名', { exact: true })).toHaveValue('测试用户')
  await page.getByLabel('简历模板').selectOption('modern')
  await expect(page.getByTestId('resume-paper')).toContainText('测试用户')
  await page.getByRole('button', { name: '另存副本', exact: true }).click()
  await expect(page.getByLabel('简历名称')).toHaveValue('未命名简历 · 副本')
  await page.getByRole('button', { name: '返回简历列表' }).click()
  await expect(page.getByRole('button', { name: '打开 未命名简历', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '打开 未命名简历 · 副本', exact: true })).toBeVisible()
})

test('screenshot extraction, fact review, suggestion apply and undo, JD copy, no key persistence', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const content = {
    name: '测试候选人',
    headline: '前端工程师',
    email: 'test@example.com',
    phone: '',
    location: '杭州',
    website: '',
    summary: '参与前端开发',
    sections: [
      {
        title: '工作经历',
        kind: 'work',
        items: [
          {
            title: '工程师',
            organization: '测试公司',
            location: '',
            startDate: '2023',
            endDate: '至今',
            description: '负责页面开发',
          },
        ],
      },
    ],
  }
  let imageRequest = false
  await page.route('https://provider.test/v1/chat/completions', async (route) => {
    const body = route.request().postDataJSON()
    expect(route.request().headers().authorization).toBe('Bearer secret-test-key')
    const user = body.messages[1].content
    const prompt = typeof user === 'string' ? user : user[0].text
    let answer: unknown = 'OK'
    if (prompt.includes('逐字提取简历')) {
      imageRequest = user.some((part: { type: string }) => part.type === 'image_url')
      answer = { content, warnings: ['结束日期请核对'] }
    } else if (prompt.includes('提取岗位描述'))
      answer = { text: '高级前端工程师，React，招聘地点新加坡。', warnings: ['请核对岗位级别'] }
    else if (prompt.includes('分析简历的表达质量'))
      answer = {
        summary: '可以更清楚地描述你的贡献。',
        questions: ['具体负责哪些页面？'],
        suggestions: [
          {
            target: { kind: 'profile', field: 'summary' },
            after: '专注前端页面开发',
            reason: '简化表达',
            evidence: ['resume'],
            question: '',
            requiresConfirmation: false,
          },
        ],
      }
    await route.fulfill({
      json: {
        choices: [{ message: { content: typeof answer === 'string' ? answer : JSON.stringify(answer) } }],
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'AI 设置' }).click()
  await page.getByLabel('连接方式').selectOption('direct')
  await page.getByLabel('Base URL', { exact: true }).fill('https://provider.test/v1')
  await page.getByLabel('API Key', { exact: true }).fill('secret-test-key')
  await page.getByLabel('模型名称').fill('test-vision')
  await page.getByLabel('这个模型支持图片输入').check()
  await page.getByRole('button', { name: '测试连接', exact: true }).click()
  await expect(page.getByText('文本连接成功', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /我的简历/ }).click()
  await page.getByRole('button', { name: '上传简历 PDF / 截图', exact: true }).click()
  const screenshot = {
    name: 'resume.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/cL8AAAAASUVORK5CYII=',
      'base64',
    ),
  }
  await page.getByLabel('上传截图文件').setInputFiles(screenshot)
  await page.getByRole('button', { name: '识别并生成简历' }).click()
  await expect(page.getByLabel('姓名', { exact: true })).toHaveValue('测试候选人')
  expect(imageRequest).toBe(true)
  await page.getByRole('button', { name: '识别原稿', exact: true }).click()
  await expect(page.getByText('结束日期请核对', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '我已校对，开始编辑与优化' }).click()
  await page.getByRole('button', { name: 'AI 建议', exact: true }).click()
  await page.getByRole('button', { name: '开始 AI 分析' }).click()
  await expect(page.getByText('专注前端页面开发', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '采纳修改' })).toBeDisabled()
  await page.getByLabel('我已核对，修改后的事实准确').check()
  await page.getByRole('button', { name: '采纳修改' }).click()
  await expect(page.getByTestId('resume-paper')).toContainText('专注前端页面开发')
  await page.getByRole('button', { name: '修改记录', exact: true }).click()
  await page.getByRole('button', { name: '撤回', exact: true }).click()
  await expect(page.getByTestId('resume-paper')).toContainText('参与前端开发')
  await page.getByRole('button', { name: '针对岗位定制', exact: true }).click()
  await page.getByLabel('上传截图文件').setInputFiles(screenshot)
  await page.getByRole('button', { name: '发送到配置的 AI，识别 JD 截图' }).click()
  await expect(page.getByLabel('岗位描述（请校对后再创建）')).toHaveValue(
    '高级前端工程师，React，招聘地点新加坡。',
  )
  await page.getByLabel('目标岗位', { exact: true }).fill('高级前端')
  await page.getByLabel('招聘市场', { exact: true }).fill('新加坡')
  await page.getByRole('button', { name: '已校对，创建岗位版本' }).click()
  await expect(page.getByLabel('简历名称')).toHaveValue('测试候选人的简历 · 高级前端')
  await page.reload()
  await page.getByRole('button', { name: 'AI 设置' }).click()
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('模型名称')).toHaveValue('test-vision')
  expect(errors).toEqual([])
})

test('material upload, backup restore, responsive layout and print output', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: '经历素材', exact: true }).click()
  await page.getByRole('button', { name: '添加经历', exact: true }).click()
  await page.getByLabel('素材标题').pressSequentially('支付项目')
  await page.getByLabel('完整经历与证据').pressSequentially('负责支付表单交互，结果待补充。')
  await page.getByRole('button', { name: '保存素材' }).click()
  await expect(page.getByRole('heading', { name: '支付项目' })).toBeVisible()
  await page.getByRole('button', { name: /我的简历/ }).click()
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true })
  await page.getByRole('button', { name: '用虚构示例体验编辑器' }).click()
  await expect(page.getByTestId('resume-paper')).toContainText('虚构人物')
  await page.screenshot({ path: testInfo.outputPath('editor.png'), fullPage: true })
  await page.emulateMedia({ media: 'print' })
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeHidden()
  await expect(page.getByTestId('resume-paper')).toBeVisible()
  await page.pdf({ path: testInfo.outputPath('sample.pdf'), format: 'A4', printBackground: true })
  await page.emulateMedia({ media: 'screen' })
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出全部备份' }).click()
  const download = await downloadPromise
  const path = testInfo.outputPath('backup.json')
  await download.saveAs(path)
  await page.locator('input[type=file][accept=".json"]').setInputFiles(path)
  await expect(page.getByText('备份已作为独立副本导入，现有简历未被覆盖。')).toBeVisible()
  await page.getByRole('button', { name: '返回简历列表' }).click()
  await expect(page.getByRole('button', { name: '打开 虚构示例 · 林知夏', exact: true })).toHaveCount(2)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true, animations: 'disabled' })
})

test('focused fields do not silently overwrite another tab', async ({ page, context }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '用虚构示例体验编辑器' }).click()
  const other = await context.newPage()
  await other.goto('/')
  await other.getByRole('button', { name: '打开 虚构示例 · 林知夏', exact: true }).click()
  const local = page.getByLabel('姓名', { exact: true })
  const remote = other.getByLabel('姓名', { exact: true })
  await local.focus()
  await remote.fill('另一标签页更新')
  await remote.blur()
  await expect(page.getByTestId('resume-paper')).toContainText('另一标签页更新')
  await local.blur()
  await expect(local).toHaveValue('另一标签页更新')
  await local.fill('本地未提交的新内容')
  await remote.fill('另一标签页再次更新')
  await remote.blur()
  await expect(page.getByTestId('resume-paper')).toContainText('另一标签页再次更新')
  await local.blur()
  await expect(page.getByRole('alert')).toContainText('此字段已在其他操作中更新')
  await page.reload()
  await expect(page.getByLabel('姓名', { exact: true })).toHaveValue('另一标签页再次更新')
})
