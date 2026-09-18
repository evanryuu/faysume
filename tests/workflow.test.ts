import { describe, expect, it } from 'vitest'
import { analyzeResume } from '../src/ai'
import { applySuggestions, cloneResume, createResume, documentSchema } from '../src/domain'
import {
  emptyWorkflow,
  materialSnapshot,
  requireConfirmedPlan,
  reviewContext,
  workflowSnapshot,
} from '../src/workflow'
import type { Material } from '../src/types'

const config = {
  baseUrl: 'https://provider.test',
  apiKey: 'test',
  model: 'test',
  vision: false,
  jsonMode: false,
}
function prepared() {
  const doc = createResume()
  doc.workflow = {
    ...emptyWorkflow(),
    intent: '精简表达',
    plan: { summary: '突出贡献', directions: ['精简表达'], questions: [], searchQueries: [] },
    confirmed: true,
  }
  doc.workflow.inputSnapshot = workflowSnapshot(doc, [])
  return doc
}
describe('resume workflow', () => {
  it('accepts old documents and clears approvals and chat on copies', () => {
    expect(documentSchema.parse(createResume()).workflow).toBeUndefined()
    expect(cloneResume(prepared()).workflow).toBeUndefined()
  })
  it('requires a current confirmed plan, but ignores template and name changes', () => {
    const doc = prepared()
    doc.template = 'modern'
    doc.name = '另一个标题'
    expect(requireConfirmedPlan(doc, []).confirmed).toBe(true)
    doc.content.summary = '新内容'
    expect(() => requireConfirmedPlan(doc, [])).toThrow('重新生成')
  })
  it('rejects changed material content even when material ids remain unchanged', () => {
    const doc = prepared()
    const m: Material = {
      id: 'm1',
      title: '项目',
      content: '负责开发',
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }
    doc.workflow!.materialIds = ['m1']
    doc.workflow!.inputSnapshot = workflowSnapshot(doc, [m])
    m.content = '新事实'
    expect(() => requireConfirmedPlan(doc, [m])).toThrow()
  })
  it('allows sequential confirmed suggestions but rejects a changed goal', () => {
    const doc = prepared()
    doc.suggestions = ['summary', 'headline'].map((field, i) => ({
      id: `s${i}`,
      target: { kind: 'profile' as const, field: field as 'summary' | 'headline' },
      before: '',
      after: '真实内容',
      reason: '',
      evidence: ['当前简历'],
      question: '',
      confirmed: true,
      requiresConfirmation: true,
      status: 'pending' as const,
      reviewContext: reviewContext(doc),
      materialSnapshot: materialSnapshot([]),
    }))
    const first = applySuggestions(doc, ['s0'])
    expect(applySuggestions(first, ['s1']).content.headline).toBe('真实内容')
    first.workflow!.intent = '改为英文简历'
    expect(() => applySuggestions(first, ['s1'])).toThrow('目标')
  })
  it('never accepts external research as personal evidence', async () => {
    const doc = prepared()
    const response = {
      summary: '',
      questions: [],
      suggestions: [
        {
          target: { kind: 'profile', field: 'summary' },
          after: '精通新技术',
          reason: '',
          evidence: ['web-1'],
          references: [],
          question: '',
          requiresConfirmation: false,
        },
      ],
    }
    await expect(
      analyzeResume(config, doc, [], undefined, undefined, [], async () => JSON.stringify(response)),
    ).rejects.toThrow('事实来源')
  })
})
