import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db, exportBackup, importBackup, insertResume, mutateResume } from '../src/db'
import { applySuggestions, cloneResume, createResume, revertHistory } from '../src/domain'
import { conversationFor, replyToResume } from '../src/directChat'
import type { AIConnection } from '../src/types'

const connection: AIConnection = {
  mode: 'direct',
  baseUrl: 'https://provider.test/v1',
  model: 'test',
  apiKey: 'test-key',
  vision: false,
  jsonMode: true,
}
const result = (summary = '请继续补充。', suggestions: unknown[] = []) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ summary, questions: [], suggestions }) } }],
    }),
  )
const suggestion = (after: string) => ({
  target: { kind: 'profile', field: 'summary' },
  after,
  reason: '用户补充',
  evidence: ['answer'],
  question: '',
  requiresConfirmation: true,
})
const signal = () => new AbortController().signal
beforeEach(async () => {
  await db.open()
  await Promise.all([db.resumes.clear(), db.materials.clear(), db.sources.clear()])
})
afterEach(async () => {
  await db.delete()
})

it('continues legacy analysis with its questions and persists a real multi-turn conversation', async () => {
  const doc = createResume()
  doc.analysisSummary = '可以突出前端贡献。'
  doc.analysisQuestions = ['具体负责哪些页面？']
  await insertResume(doc)
  const fetcher = vi.fn<typeof fetch>(async (_url, options) => {
    const prompt = JSON.parse(options!.body as string).messages[1].content
    expect(prompt).toContain('具体负责哪些页面？')
    expect(prompt).toContain('我负责支付页面')
    return result('明白，我会突出支付页面。', [suggestion('负责支付页面开发')])
  })
  await replyToResume(doc.id, connection, '我负责支付页面', signal(), fetcher)
  const first = (await db.resumes.get(doc.id))!
  expect(first.directConversation?.messages.map((m) => m.role)).toEqual(['assistant', 'user', 'assistant'])
  expect(first.content.summary).toBe('')
  expect(first.suggestions[0]).toMatchObject({
    before: '',
    after: '负责支付页面开发',
    confirmed: false,
    requiresConfirmation: true,
  })
  await replyToResume(doc.id, connection, '怎样评估业务结果？', signal(), async (_url, options) => {
    const prompt = JSON.parse(options!.body as string).messages[1].content
    expect(prompt).toContain('明白，我会突出支付页面。')
    expect(prompt).toContain('怎样评估业务结果？')
    return result('可以记录表单完成率，先采集实际数据。')
  })
  const second = (await db.resumes.get(doc.id))!
  expect(second.directConversation?.messages).toHaveLength(5)
  expect(second.suggestions[0].status).toBe('pending')
  db.close()
  await db.open()
  expect(conversationFor((await db.resumes.get(doc.id))!)).toEqual(second.directConversation!.messages)
  expect(cloneResume(second).directConversation).toBeUndefined()
  await importBackup(await exportBackup())
  expect((await db.resumes.toArray()).find((d) => d.id !== doc.id)?.directConversation).toEqual(
    second.directConversation,
  )
})

it('uses the latest applied resume on the next turn and keeps changes reversible', async () => {
  const doc = createResume()
  await insertResume(doc)
  await replyToResume(doc.id, connection, '我负责支付页面', signal(), async () =>
    result('给你一条建议。', [suggestion('负责支付页面开发')]),
  )
  await mutateResume(doc.id, (d) => {
    d.suggestions[0].confirmed = true
    return applySuggestions(d, [d.suggestions[0].id])
  })
  await replyToResume(doc.id, connection, '再简短一些', signal(), async (_url, options) => {
    const prompt = JSON.parse(options!.body as string).messages[1].content
    expect(prompt).toContain('"summary":"负责支付页面开发"')
    return result('可以缩短成这样。', [suggestion('支付页面开发')])
  })
  const saved = (await db.resumes.get(doc.id))!
  expect(saved.suggestions[1].before).toBe('负责支付页面开发')
  expect(saved.suggestions[0].status).toBe('applied')
  expect(revertHistory(saved, saved.history[0].id).content.summary).toBe('')
})

it('preserves the sent message on transport failure and retries without duplicating it', async () => {
  const doc = createResume()
  await insertResume(doc)
  await expect(
    replyToResume(doc.id, connection, '我的补充', signal(), async () => new Response('', { status: 503 })),
  ).rejects.toThrow('503')
  expect(conversationFor((await db.resumes.get(doc.id))!)).toHaveLength(1)
  await replyToResume(doc.id, connection, null, signal(), async () => result('已收到。'))
  expect(conversationFor((await db.resumes.get(doc.id))!).map((m) => m.text)).toEqual([
    '我的补充',
    '已收到。',
  ])
})

it('discards a late response after cancellation without discarding user input', async () => {
  const doc = createResume()
  await insertResume(doc)
  const controller = new AbortController()
  await expect(
    replyToResume(doc.id, connection, '取消测试', controller.signal, async () => {
      controller.abort()
      return result('不应保存', [suggestion('不应出现')])
    }),
  ).rejects.toThrow()
  const saved = (await db.resumes.get(doc.id))!
  expect(saved.suggestions).toEqual([])
  expect(conversationFor(saved).map((m) => m.text)).toEqual(['取消测试'])
})

it('rejects stale responses after concurrent edits and reuses updated context on retry', async () => {
  const doc = createResume()
  await insertResume(doc)
  await expect(
    replyToResume(doc.id, connection, '帮我调整', signal(), async () => {
      await mutateResume(doc.id, (d) => ({ ...d, content: { ...d.content, summary: '另一个窗口更新' } }))
      return result('过期回复', [suggestion('过期建议')])
    }),
  ).rejects.toThrow('已变化')
  expect((await db.resumes.get(doc.id))!.suggestions).toEqual([])
  await replyToResume(doc.id, connection, null, signal(), async () =>
    result('基于新内容', [suggestion('有效建议')]),
  )
  expect((await db.resumes.get(doc.id))!.suggestions[0].before).toBe('另一个窗口更新')
})

it('does not accept an assistant message as a personal fact source', async () => {
  const doc = createResume()
  await insertResume(doc)
  await expect(
    replyToResume(doc.id, connection, '怎么写？', signal(), async () =>
      result('建议', [{ ...suggestion('编造的经历'), evidence: ['assistant'] }]),
    ),
  ).rejects.toThrow('未知的事实来源')
  expect((await db.resumes.get(doc.id))!.suggestions).toEqual([])
})
