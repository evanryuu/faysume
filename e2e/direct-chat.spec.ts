import { expect, test, type Page } from '@playwright/test'

const endpoint = 'https://provider.test/v1/chat/completions'
async function setup(page: Page) {
  await page.goto('/settings')
  await page.getByLabel('连接方式').selectOption('direct')
  await page.getByLabel('Base URL', { exact: true }).fill('https://provider.test/v1')
  await page.getByLabel('API Key', { exact: true }).fill('test-key')
  await page.getByLabel('模型名称').fill('test')
  const id = await page.evaluate(async () => {
    const domainPath = '/src/domain.ts',
      dbPath = '/src/db.ts'
    const { createResume } = await import(/* @vite-ignore */ domainPath)
    const { insertResume } = await import(/* @vite-ignore */ dbPath)
    const doc = createResume('对话测试简历')
    doc.content.name = '测试用户'
    doc.content.summary = '参与前端开发'
    doc.analysisSummary = '可以更具体地说明你的贡献。'
    doc.analysisQuestions = ['你具体负责什么？', '希望在哪个城市工作？']
    await insertResume(doc)
    return doc.id
  })
  await page.goto(`/resumes/${id}?tab=ai`)
  return id
}
const completion = (summary: string, after?: string) => ({
  choices: [
    {
      message: {
        content: JSON.stringify({
          summary,
          questions: [],
          suggestions: after
            ? [
                {
                  target: { kind: 'profile', field: 'summary' },
                  after,
                  reason: '根据用户补充调整',
                  evidence: ['answer'],
                  question: '',
                  requiresConfirmation: true,
                },
              ]
            : [],
        }),
      },
    },
  ],
})
const composer = (page: Page) => page.getByRole('textbox', { name: '你的目标或补充说明', exact: true })

test('continues existing analysis, preserves conversation across reload and keeps chatting after apply', async ({
  page,
}, testInfo) => {
  await setup(page)
  let turns = 0
  await page.route(endpoint, async (route) => {
    const prompt = route.request().postDataJSON().messages[1].content
    expect(prompt).toContain('你具体负责什么？')
    expect(prompt).toContain('负责支付页面，期望深圳')
    turns++
    if (turns === 1)
      await route.fulfill({ json: completion('已了解你的职责和城市，下面是表达建议。', '负责支付页面开发') })
    else if (turns === 2) {
      expect(prompt).toContain('已了解你的职责和城市')
      await route.fulfill({ json: completion('先记录表单完成率，拿到真实结果再补进简历。') })
    } else {
      expect(prompt).toContain('"summary":"负责支付页面开发"')
      await route.fulfill({ json: completion('结合已采纳的内容，可以进一步精简。', '支付页面开发') })
    }
  })
  await expect(page.getByRole('log')).toContainText('希望在哪个城市工作？')
  await expect(page.getByRole('button', { name: '保存为经历素材', exact: true })).toHaveCount(0)
  await composer(page).fill('负责支付页面，期望深圳')
  await page.getByRole('button', { name: '发送给助手', exact: true }).click()
  await expect(page.getByRole('log')).toContainText('已了解你的职责和城市')
  await expect(page.locator('.suggestion')).toHaveCount(1)
  await expect(page.getByTestId('resume-paper')).toContainText('参与前端开发')
  await composer(page).fill('如何衡量效果？')
  await composer(page).press('Control+Enter')
  await expect(page.getByRole('log')).toContainText('先记录表单完成率')
  await expect(page.locator('.suggestion')).toHaveCount(1)
  await expect(page.getByRole('group', { name: '修改对比' })).toHaveCount(0)
  await page.getByRole('button', { name: '查看修改建议', exact: true }).click()
  await expect(composer(page)).toHaveCount(0)
  await page.getByLabel('我已核对，修改后的事实准确').check()
  await page.getByRole('button', { name: '采纳修改', exact: true }).click()
  await expect(page.getByTestId('resume-paper')).toContainText('负责支付页面开发')
  await page.getByRole('tab', { name: '对话', exact: true }).click()
  await composer(page).fill('再简短一点')
  await page.getByRole('button', { name: '发送给助手', exact: true }).click()
  await expect(page.getByRole('log')).toContainText('结合已采纳的内容')
  await expect(page.locator('.suggestion .before p')).toHaveText('负责支付页面开发')
  await composer(page).fill('尚未发送的草稿')
  await page.getByRole('tab', { name: /修改建议/ }).click()
  await page.screenshot({ path: testInfo.outputPath('review-desktop.png'), animations: 'disabled' })
  await page.getByRole('button', { name: '和助手讨论', exact: true }).click()
  await expect(composer(page)).toBeFocused()
  await expect(composer(page)).toHaveValue(/关于「个人简介」.*支付页面开发[\s\S]*尚未发送的草稿/)
  await page.getByRole('button', { name: '内容', exact: true }).click()
  await page.getByRole('button', { name: /^AI 助手/ }).click()
  await expect(composer(page)).toHaveValue(/尚未发送的草稿/)
  await page.getByRole('button', { name: '设置修改方向', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('修改会在下一轮对话中生效')
  await page.getByLabel('目标岗位', { exact: true }).fill('前端工程师')
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await expect(page.locator('.ai-context-summary')).toContainText('前端工程师')
  await composer(page).fill('这条先不要改，我还想补充一点')
  await page.reload()
  await expect(composer(page)).toHaveValue('这条先不要改，我还想补充一点')
  await expect(page.getByRole('log').locator('.agent-message')).toHaveCount(7)
  await expect(page.locator('.suggestion')).toHaveCount(1)
  await page.screenshot({ path: testInfo.outputPath('chat-desktop.png'), animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(composer(page)).toBeInViewport()
  await expect(page.getByRole('button', { name: '发送给助手', exact: true })).toBeInViewport()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('chat-mobile.png'), animations: 'disabled' })
  await page.getByRole('tab', { name: /修改建议/ }).click()
  await expect(composer(page)).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('review-mobile.png'), animations: 'disabled' })
  await page.getByRole('tab', { name: /修改建议/ }).press('ArrowLeft')
  await expect(page.getByRole('tab', { name: '对话', exact: true })).toBeFocused()
  await expect(composer(page)).toHaveValue('这条先不要改，我还想补充一点')
  expect(turns).toBe(3)
})

test('failed requests retain messages and suggestions; retry and cancellation remain usable', async ({
  page,
}) => {
  await setup(page)
  await page.route(endpoint, (route) => route.fulfill({ status: 503, body: 'unavailable' }))
  await composer(page).fill('这是不能丢失的补充')
  await page.getByRole('button', { name: '发送给助手', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('503')
  await expect(page.getByRole('log')).toContainText('这是不能丢失的补充')
  await page.unroute(endpoint)
  await page.route(endpoint, (route) => route.fulfill({ json: completion('补充已经收到。') }))
  await page.getByRole('button', { name: '重试上一条消息', exact: true }).click()
  await expect(page.getByRole('log')).toContainText('补充已经收到。')
  await expect(page.getByRole('log').locator('.user')).toHaveCount(1)
  await page.unroute(endpoint)
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(endpoint, async (route) => {
    await pending
    await route.fulfill({ json: completion('已取消的回复') }).catch(() => {})
  })
  await composer(page).fill('停止测试')
  await page.getByRole('button', { name: '发送给助手', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: '正在回复' })).toBeVisible()
  await page.getByRole('button', { name: '停止生成', exact: true }).click()
  release()
  await expect(page.getByRole('button', { name: '重试上一条消息', exact: true })).toBeVisible()
  await expect(composer(page)).toBeEnabled()
  await expect(page.getByRole('log')).not.toContainText('已取消的回复')
})

test('assistant replies have readable sections, lists and safe inline formatting', async ({
  page,
}, testInfo) => {
  const id = await setup(page)
  await page.evaluate(async (id) => {
    const dbPath = '/src/db.ts'
    const { mutateResume } = await import(/* @vite-ignore */ dbPath)
    await mutateResume(id, (doc: any) => {
      doc.analysisSummary =
        '表达质量：信息量充足，但技术栈里混有口语化表达，建议聚焦真实职责和技术难点。项目介绍可以先写目标，再说明你负责的部分。已有亮点：Agent 会话、知识库、Workflow 和跨端交互都能体现 AI 产品建设经验。可以选择最能说明个人贡献的两个项目展开，不必逐项罗列所有功能。岗位匹配：现有经历与 AI 平台方向有重合，建议区分已经完成的工作和希望发展的方向。没有真实结果数据的部分，可以先描述业务范围和解决的问题。'
      return doc
    })
  }, id)
  await expect(page.getByRole('heading', { name: '表达质量', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '已有亮点', exact: true })).toBeVisible()
  await expect(page.locator('.assistant-content p')).toHaveCount(3)
  await page.screenshot({
    path: testInfo.outputPath('readable-analysis-desktop.png'),
    animations: 'disabled',
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('readable-analysis-mobile.png'), animations: 'disabled' })
  await page.route(endpoint, (route) =>
    route.fulfill({
      json: completion(
        '### 可以先这样调整\n\n先写清楚贡献，再补充结果。\n\n- **个人贡献**：说明你负责的模块。\n- **技术难点**：保留 `WebSocket` 等关键技术。\n\n### 下一步\n\n1. 选择一个代表项目。\n2. 补充真实结果。\n\n<img src=x onerror=alert(1)>',
      ),
    }),
  )
  await composer(page).fill('怎样调整？')
  await page.getByRole('button', { name: '发送给助手', exact: true }).click()
  await expect(page.getByRole('heading', { name: '可以先这样调整', exact: true })).toBeVisible()
  const reply = page.locator('.assistant-content').last()
  await expect(reply.locator('li')).toHaveCount(4)
  await expect(reply.locator('strong').first()).toHaveText('个人贡献')
  await expect(reply.locator('code')).toHaveText('WebSocket')
  await expect(reply.locator('img')).toHaveCount(0)
  await expect(reply).toContainText('<img src=x onerror=alert(1)>')
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
