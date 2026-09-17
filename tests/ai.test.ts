import { describe, expect, it, vi } from 'vitest'
import { endpointFor, requestCompletion, extractResume, analyzeResume, extractJob } from '../src/ai'
import type { AIConnection, ResumeDocument } from '../src/types'
import { createResume } from '../src/domain'

const config: AIConnection = {
  baseUrl: 'https://example.com/v1/',
  apiKey: 'test-key',
  model: 'test-model',
  vision: true,
  jsonMode: false,
}
const content = {
  name: '测试',
  headline: '',
  email: '',
  phone: '',
  location: '',
  website: '',
  summary: '做过前端开发',
  sections: [],
}
const resume: ResumeDocument = {
  ...createResume(),
  id: 'r1',
  revision: 3,
  content,
  locale: 'zh-CN',
  market: '中国',
  targetRole: '',
  jobDescription: '',
}
const response = (value: unknown) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: typeof value === 'string' ? value : JSON.stringify(value) } }],
    }),
    { status: 200 },
  )

describe('AI adapter boundaries', () => {
  it('normalizes endpoints and rejects credential-bearing, insecure remote URLs', () => {
    expect(endpointFor(config.baseUrl)).toBe('https://example.com/v1/chat/completions')
    expect(endpointFor('http://localhost:1234/v1/chat/completions')).toBe(
      'http://localhost:1234/v1/chat/completions',
    )
    for (const url of [
      'http://remote.test/v1',
      'https://user:secret@api.test',
      'https://api.test?key=secret',
      'file:///secret',
    ])
      expect(() => endpointFor(url)).toThrow()
  })
  it('sends only configured credentials and model, without opting into unsupported JSON mode', async () => {
    const fetcher = vi.fn(async () => response('OK'))
    expect(await requestCompletion(config, 'test', 'hello', [], undefined, fetcher)).toBe('OK')
    const call = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(call[0]).toBe('https://example.com/v1/chat/completions')
    expect(JSON.parse(call[1].body as string)).toMatchObject({ model: 'test-model', stream: false })
    expect(JSON.parse(call[1].body as string)).not.toHaveProperty('response_format')
    expect(call[1].headers).toMatchObject({ Authorization: 'Bearer test-key' })
  })
  it('never calls a non-vision connection with images', async () => {
    const fetcher = vi.fn()
    await expect(
      extractResume({ ...config, vision: false }, '', ['data:image/png;base64,AA=='], undefined, fetcher),
    ).rejects.toThrow('视觉')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('validates extracted content and assigns local IDs', async () => {
    const value = {
      content: {
        ...content,
        sections: [
          {
            title: '工作',
            kind: 'work',
            items: [
              {
                title: '开发',
                organization: '公司',
                location: '',
                startDate: '',
                endDate: '',
                description: '参与开发',
              },
            ],
          },
        ],
      },
      warnings: ['日期不清晰'],
    }
    const result = await extractResume(config, '原始内容', [], undefined, async () => response(value))
    expect(result.content.sections[0].id).toBeTruthy()
    expect(result.content.sections[0].items[0].id).toBeTruthy()
    expect(result.warnings).toEqual(['日期不清晰'])
    await expect(
      extractResume(config, '内容', [], undefined, async () => response({ content: { name: 123 } })),
    ).rejects.toThrow()
  })
  it('binds suggestion before values to snapshot and guards new numerical claims', async () => {
    const result = await analyzeResume(config, resume, [], undefined, async () =>
      response({
        summary: '建议补充',
        questions: ['负责哪个模块？'],
        suggestions: [
          {
            target: { kind: 'profile', field: 'summary' },
            after: '提升效率 50%',
            reason: '量化',
            evidence: ['resume'],
            question: '',
            requiresConfirmation: false,
          },
        ],
      }),
    )
    expect(result.suggestions[0].before).toBe('做过前端开发')
    expect(result.suggestions[0].requiresConfirmation).toBe(true)
    expect(result.suggestions[0].confirmed).toBe(false)
  })
  it('rejects invalid and duplicate suggestion targets and unknown evidence', async () => {
    const valid = {
      target: { kind: 'profile', field: 'summary' },
      after: '开发工作',
      reason: '简洁',
      evidence: ['resume'],
      question: '',
      requiresConfirmation: false,
    }
    for (const suggestions of [
      [{ ...valid, target: { kind: 'profile', field: '__proto__' } }],
      [valid, valid],
      [{ ...valid, evidence: ['unknown-material'] }],
    ]) {
      await expect(
        analyzeResume(config, resume, [], undefined, async () =>
          response({ suggestions, questions: [], summary: '' }),
        ),
      ).rejects.toThrow()
    }
  })
  it('keeps the initiating snapshot even if caller mutates while awaiting AI', async () => {
    const snapshot = structuredClone(resume)
    const promise = analyzeResume(config, snapshot, [], undefined, async () => {
      snapshot.content.summary = '请求期间的手工修改'
      return response({
        summary: '',
        questions: [],
        suggestions: [
          {
            target: { kind: 'profile', field: 'summary' },
            after: '专注前端开发',
            reason: '表达',
            evidence: ['resume'],
            question: '',
            requiresConfirmation: false,
          },
        ],
      })
    })
    expect((await promise).suggestions[0].before).toBe('做过前端开发')
  })
  it('requires user fact verification even when model invents nonnumeric responsibilities', async () => {
    const result = await analyzeResume(config, resume, [], undefined, async () =>
      response({
        summary: '',
        questions: [],
        suggestions: [
          {
            target: { kind: 'profile', field: 'summary' },
            after: '负责团队招聘',
            reason: '表达',
            evidence: ['resume'],
            question: '',
            requiresConfirmation: false,
          },
        ],
      }),
    )
    expect(result.suggestions[0].requiresConfirmation).toBe(true)
  })
  it('handles cancellation, HTTP errors without echoing provider secrets, and malformed output', async () => {
    await expect(
      requestCompletion(
        config,
        '',
        '',
        [],
        undefined,
        async () => new Response('test-key secret debug', { status: 401 }),
      ),
    ).rejects.toThrow('401')
    await expect(
      extractJob(config, '', ['data:image/png;base64,AA=='], undefined, async () => response('not json')),
    ).rejects.toThrow('JSON')
    const controller = new AbortController()
    controller.abort()
    const fetcher = vi.fn()
    await expect(requestCompletion(config, '', '', [], controller.signal, fetcher)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('aborts a pending request when the user cancels', async () => {
    const controller = new AbortController()
    const fetcher: typeof fetch = async (_url, init) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))),
      )
    const pending = requestCompletion(config, '', '', [], controller.signal, fetcher)
    controller.abort()
    await expect(pending).rejects.toThrow('取消')
  })
  it('times out pending requests and aborts transport', async () => {
    vi.useFakeTimers()
    try {
      const fetcher: typeof fetch = async (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))),
        )
      const pending = requestCompletion(config, '', '', [], undefined, fetcher)
      const assertion = expect(pending).rejects.toThrow('90 秒')
      await vi.advanceTimersByTimeAsync(90000)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })
})
