import { test, expect, type Page } from '@playwright/test'

const result = {
  entries: [
    {
      kind: 'work',
      item: {
        title: '前端工程师',
        organization: '星河科技',
        location: '杭州',
        startDate: '2024.03',
        endDate: '至今',
        description: '开发内部管理系统\n维护组件库',
      },
    },
    {
      kind: 'project',
      item: {
        title: '组件平台',
        organization: '',
        location: '',
        startDate: '',
        endDate: '',
        description: '负责组件文档与发布',
      },
    },
  ],
  warnings: ['项目时间未提供，请核对'],
}
async function setup(page: Page) {
  await page.goto('/settings')
  await page.getByLabel('连接方式').selectOption('direct')
  await page.getByLabel('Base URL', { exact: true }).fill('https://provider.test/v1')
  await page.getByLabel('API Key', { exact: true }).fill('test-key')
  await page.getByLabel('模型名称').fill('test')
  await page.getByRole('button', { name: /我的简历/ }).click()
  await page.getByRole('button', { name: '空白创建', exact: true }).click()
}
async function open(page: Page) {
  await page.getByRole('button', { name: 'AI 添加经历', exact: true }).click()
  await expect(page.getByRole('button', { name: '识别经历', exact: true })).toBeDisabled()
  await page
    .getByRole('textbox', { name: '经历原文', exact: true })
    .fill('星河科技，2024.03 至今，前端工程师，开发内部管理系统。项目：组件平台，负责组件文档与发布。')
}
async function mock(page: Page) {
  await page.route('https://provider.test/v1/chat/completions', async (route) => {
    expect(route.request().postDataJSON().messages[1].content).not.toContain('私有简介')
    await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify(result) } }] } })
  })
}

test('review, edit, append mixed experiences, persist and undo without replacing existing content', async ({
  page,
}, testInfo) => {
  await setup(page)
  await mock(page)
  await page.getByRole('textbox', { name: '个人简介', exact: true }).fill('私有简介')
  await page.getByRole('textbox', { name: '个人简介', exact: true }).blur()
  await page.getByRole('button', { name: '添加区块', exact: true }).click()
  await page.getByLabel('职位 / 项目 / 学位', { exact: true }).fill('原有职位')
  await page.getByLabel('职位 / 项目 / 学位', { exact: true }).blur()
  await open(page)
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('paste-desktop.png') })
  await page.getByRole('button', { name: '识别经历', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('项目时间未提供')
  await expect(dialog.getByLabel('添加到').first()).not.toHaveValue('')
  await expect(page.locator('.editor-section').getByLabel('职位 / 项目 / 学位')).toHaveCount(1)
  await dialog.getByLabel('职位', { exact: true }).fill('高级前端工程师')
  await dialog.getByRole('textbox', { name: '经历描述', exact: true }).last().fill('核对后的项目描述')
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('review-desktop.png') })
  await dialog.getByRole('button', { name: '确认添加 2 段经历', exact: true }).dblclick()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByLabel('职位 / 项目 / 学位', { exact: true })).toHaveCount(3)
  await expect(page.getByTestId('resume-paper')).toContainText('核对后的项目描述')
  await page.reload()
  await expect(page.getByLabel('职位 / 项目 / 学位', { exact: true }).nth(1)).toHaveValue('高级前端工程师')
  await expect(page.getByRole('textbox', { name: '个人简介', exact: true })).toHaveValue('私有简介')
  await page.getByRole('button', { name: '修改记录', exact: true }).click()
  await expect(page.locator('.history-entry')).toHaveCount(1)
  await page.getByRole('button', { name: '撤回', exact: true }).click()
  await expect(page.getByRole('button', { name: '已撤回', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '内容', exact: true }).click()
  await expect(page.getByLabel('职位 / 项目 / 学位', { exact: true })).toHaveValue('原有职位')
  await expect(page.getByLabel('区块标题', { exact: true })).toHaveCount(1)
})

test('failed recognition preserves text; closing and canceling pending recognition never append', async ({
  page,
}) => {
  await setup(page)
  await page.route('https://provider.test/v1/chat/completions', (route) =>
    route.fulfill({ status: 500, body: 'failure' }),
  )
  await open(page)
  const input = page.getByRole('textbox', { name: '经历原文', exact: true })
  const original = await input.inputValue()
  await page.getByRole('button', { name: '识别经历', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('500')
  await expect(input).toHaveValue(original)
  await page.unroute('https://provider.test/v1/chat/completions')
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('https://provider.test/v1/chat/completions', async (route) => {
    await pending
    await route
      .fulfill({ json: { choices: [{ message: { content: JSON.stringify(result) } }] } })
      .catch(() => {})
  })
  await page.getByRole('button', { name: '识别经历', exact: true }).click()
  await expect(page.getByText('正在识别经历…', { exact: true })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
  await expect(input).toHaveValue(original)
  await expect(page.getByRole('button', { name: '识别经历', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '关闭对话框', exact: true }).click()
  release()
  await expect(page.getByLabel('区块标题', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'AI 添加经历', exact: true })).toBeFocused()
})

test('mobile review supports correcting type, removing entries, and protects later manual edits on undo', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page)
  await mock(page)
  await open(page)
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('paste-mobile.png') })
  await page.getByRole('button', { name: '识别经历', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('经历类型').first().selectOption('project')
  await dialog.getByRole('button', { name: '移除第 2 段经历', exact: true }).click()
  await expect(dialog.getByLabel('添加到')).toHaveValue('')
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('review-mobile.png') })
  await dialog.getByRole('button', { name: '确认添加 1 段经历', exact: true }).click()
  await expect(page.getByLabel('区块标题', { exact: true })).toHaveValue('项目经历')
  await page.getByRole('textbox', { name: '经历描述', exact: true }).fill('后续手动修改')
  await page.getByRole('textbox', { name: '经历描述', exact: true }).blur()
  await page.getByRole('button', { name: '修改记录', exact: true }).click()
  await page.getByRole('button', { name: '撤回', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('后续修改')
  await page.getByRole('button', { name: '内容', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '经历描述', exact: true })).toHaveValue('后续手动修改')
})

test('unconfigured AI and blank input cannot start recognition', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '空白创建', exact: true }).click()
  await open(page)
  await expect(page.getByRole('button', { name: '识别经历', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '前往 AI 设置', exact: true }).click()
  await expect(page).toHaveURL(/settings/)
})

// Provider-mocked coverage of a long AI report's transport, review and save flow.
// The fixture uses fictional project names; this does not evaluate model extraction quality.
test('pastes a Markdown report intact and reviews missing employment metadata before saving', async ({
  page,
}) => {
  await setup(page)
  const report = [
    '```markdown',
    '聚焦三个项目，经历可以整理成一条主线：AI 平台 → 跨端交易 → 存量维护。',
    '## 工作概览',
    '统计范围：2025-11 至 2026-09。',
    '| 项目 | MR | 已合并 |',
    '| - | - | - |',
    '| AtlasAI | 120 | 100 |',
    '| mobile-demo | 80 | 70 |',
    '| legacy-demo | 20 | 18 |',
    '## AtlasAI：AI 产品平台建设',
    '- 知识库、Agent 会话、独立编辑器包和新版 Composer。',
    '- 代表性工作：建设 Mention、引用回复和文件上传。',
    '这部分经历应该突出：你能够建设复杂的 AI 产品交互。',
    '## mobile-demo：跨端交易业务',
    '- 将 AI Chat 接入 App/H5，支持 App Bridge 和 WebSocket。',
    '## legacy-demo：存量系统',
    '- 维护 Vue 2 业务和权限校验。建议合并到金融业务条目。',
    '## 可以直接使用的简历表述',
    '### 工作经历',
    '**前端工程师｜AI 与业务平台方向**',
    '- 建设 AtlasAI 知识库、Agent 会话及新版 Composer，支持 Mention 和文件上传。',
    '- 将统一 AI Chat 接入 App 与 H5，打通 App Bridge 和 WebSocket 实时更新。',
    '- 完成 React 版业务迁移，并新增 180 个单元测试。',
    '### 技术栈',
    '建议写成：`React、TypeScript、Vue 2、WebSocket`',
    '## 简历中应该删掉的内容',
    '不要逐条写样式修复和 MR 数量。',
    '下一步需要补充转化率、交易量和缺陷率。',
    '```',
  ].join('\n\n')
  const description = [
    '建设 AtlasAI 知识库、Agent 会话及新版 Composer，支持 Mention 和文件上传。',
    '将统一 AI Chat 接入 App 与 H5，打通 App Bridge 和 WebSocket 实时更新。',
    '完成 React 版业务迁移，并新增 180 个单元测试。',
  ].join('\n')
  await page.route('https://provider.test/v1/chat/completions', async (route) => {
    const messages = route.request().postDataJSON().messages
    expect(messages[1].content.endsWith(report)).toBe(true)
    await route.fulfill({
      json: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                entries: [
                  {
                    kind: 'work',
                    item: {
                      title: '前端工程师｜AI 与业务平台方向',
                      organization: '',
                      location: '',
                      startDate: '',
                      endDate: '',
                      description,
                    },
                  },
                ],
                warnings: ['统计范围不是任职起止日期，已留空供核对。'],
              }),
            },
          },
        ],
      },
    })
  })
  await page.getByRole('button', { name: 'AI 添加经历', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: '经历原文', exact: true }).fill(report)
  await dialog.getByRole('button', { name: '识别经历', exact: true }).click()
  await expect(dialog.getByRole('article')).toHaveCount(1)
  await expect(dialog).toContainText('公司 / 组织、开始时间、结束时间')
  await expect(dialog.getByLabel('公司 / 组织', { exact: true })).toHaveValue('')
  await expect(dialog.getByLabel('开始时间', { exact: true })).toHaveValue('')
  await expect(dialog.getByLabel('结束时间', { exact: true })).toHaveValue('')
  await expect(dialog.getByRole('textbox', { name: '经历描述', exact: true })).toHaveValue(description)
  await dialog.getByLabel('公司 / 组织', { exact: true }).fill('用户补充的公司')
  await dialog.getByLabel('开始时间', { exact: true }).fill('2025.10')
  await dialog.getByLabel('结束时间', { exact: true }).fill('至今')
  await dialog.getByRole('button', { name: '确认添加 1 段经历', exact: true }).click()
  await expect(page.getByLabel('公司 / 学校', { exact: true })).toHaveValue('用户补充的公司')
  await page.reload()
  await expect(page.getByRole('textbox', { name: '经历描述', exact: true })).toHaveValue(description)
  await expect(page.getByLabel('区块标题', { exact: true })).toHaveCount(1)
  await expect(page.getByTestId('resume-paper')).not.toContainText('下一步')
})
