import { test, expect } from '@playwright/test'
import { simulateReadableStream } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider'
import { createApp } from '../worker'

test('SDK chat: clarify, persist approval, search, review, apply and undo', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  let streams = 0,
    searches = 0,
    revisions = 0
  const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  }
  const model = new MockLanguageModelV4({
    doStream: async ({ prompt }) => {
      const snapshot = JSON.stringify(prompt).match(/当前快照标识：([a-f0-9]{64})/)![1]
      const n = ++streams
      const text = n === 1 ? '你具体负责了哪些页面？' : '建议已生成，请在下方审阅。'
      const chunks: LanguageModelV4StreamPart[] =
        n === 2
          ? [
              { type: 'stream-start', warnings: [] },
              {
                type: 'tool-call',
                toolName: 'reviseResume',
                toolCallId: 'revision-e2e',
                input: JSON.stringify({
                  intent: '突出前端页面开发',
                  facts: '用户负责支付表单交互',
                  snapshot,
                  plan: {
                    summary: '强调个人贡献，保留真实内容',
                    directions: ['突出支付表单交互'],
                    questions: [],
                    searchQueries: ['前端 简历 官方指南'],
                  },
                }),
              },
              { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage },
            ]
          : [
              { type: 'stream-start', warnings: [] },
              { type: 'text-start', id: 'text' },
              { type: 'text-delta', id: 'text', delta: text },
              { type: 'text-end', id: 'text' },
              { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
            ]
      return { stream: simulateReadableStream({ chunks, initialDelayInMs: null, chunkDelayInMs: null }) }
    },
    doGenerate: async () => {
      revisions++
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              summary: '突出支付表单贡献',
              questions: [],
              suggestions: [
                {
                  target: { kind: 'profile', field: 'summary' },
                  after: '负责支付表单交互开发',
                  reason: '来自用户补充事实',
                  evidence: ['answer'],
                  references: ['web-1'],
                  question: '',
                  requiresConfirmation: true,
                },
              ],
            }),
          },
        ],
        finishReason: { unified: 'stop' as const, raw: 'stop' },
        usage,
        warnings: [],
      }
    },
  })
  const app = createApp(async () => {
    searches++
    return Response.json({
      results: [
        {
          title: '官方职业指导',
          url: 'https://example.org/careers',
          content: '突出个人贡献',
          published_date: '2026-09-01',
        },
      ],
    })
  }, model)
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const response = await app.fetch(
      new Request(request.url(), {
        method: request.method(),
        headers: request.headers(),
        body: request.postData() ?? undefined,
      }),
      {
        AI_BASE_URL: 'https://model.test/v1',
        AI_MODEL: 'test',
        AI_API_KEY: 'not-a-real-key',
        APP_ACCESS_TOKEN: 'test-site-token',
        TOOL_APPROVAL_SECRET: 'test-only-approval-secret-at-least-32-bytes',
        TAVILY_API_KEY: 'test-search-key',
      },
    )
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text(),
    })
  })
  const settings = async () => {
    await page.getByRole('button', { name: 'AI 设置', exact: true }).click()
    await page.getByLabel('站点访问口令').fill('test-site-token')
    await page.getByRole('button', { name: /我的简历/ }).click()
  }
  await page.goto('/')
  await settings()
  await page.getByRole('button', { name: '空白创建', exact: true }).click()
  await page.getByRole('button', { name: 'AI 建议', exact: true }).click()
  await page.getByLabel('你的目标或补充说明').fill('我想突出前端经验')
  await page.getByRole('button', { name: '发送给助手' }).click()
  await expect(page.getByText('你具体负责了哪些页面？', { exact: true })).toBeVisible()
  await page.getByLabel('你的目标或补充说明').fill('我负责支付表单交互，可以搜索公开指南')
  await page.getByRole('button', { name: '发送给助手' }).click()
  await expect(page.getByRole('button', { name: '确认方向，生成建议' })).toBeEnabled()
  expect(searches).toBe(0)
  expect(revisions).toBe(0)
  await page.screenshot({ path: testInfo.outputPath('approval.png'), fullPage: true })
  await page.reload()
  await expect(page).toHaveURL(/tab=ai/)
  await expect(page.getByRole('button', { name: '确认方向，生成建议' })).toBeVisible()
  await expect(page.getByText('你具体负责了哪些页面？', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'AI 设置', exact: true }).click()
  await expect(page.getByLabel('站点访问口令')).toHaveValue('')
  await page.getByLabel('站点访问口令').fill('test-site-token')
  await page.getByRole('button', { name: /我的简历/ }).click()
  await page.getByRole('button', { name: '打开 未命名简历', exact: true }).click()
  await page.getByRole('button', { name: 'AI 建议', exact: true }).click()
  await expect(page.getByText('你具体负责了哪些页面？', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '确认方向，生成建议' }).click()
  await expect(page.getByRole('button', { name: '采纳修改', exact: true })).toBeDisabled()
  await expect(page.getByText('负责支付表单交互开发', { exact: true })).toBeVisible()
  expect(searches).toBe(1)
  expect(revisions).toBe(1)
  await expect(page.getByTestId('resume-paper')).not.toContainText('负责支付表单交互开发')
  await page.getByText('本轮参考的外部资料（1）', { exact: true }).click()
  await expect(page.getByRole('link', { name: '官方职业指导', exact: true }).first()).toHaveAttribute(
    'href',
    'https://example.org/careers',
  )
  await page.screenshot({ path: testInfo.outputPath('suggestions.png'), fullPage: true })
  await page.getByLabel('我已核对，修改后的事实准确').check()
  await page.getByRole('button', { name: '采纳修改', exact: true }).click()
  await expect(page.getByTestId('resume-paper')).toContainText('负责支付表单交互开发')
  await page.getByRole('button', { name: '修改记录', exact: true }).click()
  await page.getByRole('button', { name: '撤回', exact: true }).click()
  await expect(page.getByTestId('resume-paper')).not.toContainText('负责支付表单交互开发')
  await page.getByRole('button', { name: /^AI 建议/ }).click()
  await expect(page.getByRole('button', { name: '采纳修改', exact: true })).toHaveCount(1)
  expect(searches).toBe(1)
  expect(revisions).toBe(1)
  await page.getByLabel('目标岗位', { exact: true }).fill('后端工程师')
  await page.getByLabel('目标岗位', { exact: true }).blur()
  await expect(
    page.getByText('简历、岗位或素材已经变化。请按当前内容重新开始，旧方案不能继续执行。'),
  ).toBeVisible()
  await page.getByRole('button', { name: '采纳修改', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('目标已变化')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('agent-mobile.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
