import { describe, expect, it } from 'vitest'
import {
  acknowledgeOverview,
  applySuggestions,
  careerMonths,
  cloneResume,
  createExampleResume,
  createItem,
  createResume,
  createSection,
  documentSchema,
  formatCareerLength,
  itemLabel,
  overviewOutdated,
  overviewRows,
  readTarget,
  regenerateOverview,
  revertHistory,
  targetLabel,
  validateContent,
  writeTarget,
} from '../src/domain'
import type { ResumeDocument, Suggestion } from '../src/types'

function fixture(): ResumeDocument {
  const doc = createResume('测试简历')
  doc.content.name = '林一'
  doc.suggestions = [
    suggestion('s1', 'name', '林一', '林一（英文名 Lin）'),
    suggestion('s2', 'headline', '', '产品工程师'),
  ]
  return doc
}
function suggestion(id: string, field: 'name' | 'headline', before: string, after: string): Suggestion {
  return {
    id,
    target: { kind: 'profile', field },
    before,
    after,
    reason: '清晰表达',
    evidence: ['用户素材'],
    question: '',
    requiresConfirmation: false,
    confirmed: false,
    status: 'pending',
  }
}
describe('resume domain', () => {
  it('creates a genuinely empty document and explicitly fictional example', () => {
    const doc = createResume()
    expect(doc.content).toEqual({
      name: '',
      headline: '',
      email: '',
      phone: '',
      location: '',
      website: '',
      summary: '',
      sections: [],
    })
    expect(doc).toMatchObject({
      revision: 0,
      template: 'classic',
      locale: 'zh-CN',
      extractionReviewed: true,
      analysisSummary: '',
      analysisQuestions: [],
    })
    const example = createExampleResume()
    expect(JSON.stringify(example)).toMatch(/虚构/)
    expect(documentSchema.safeParse(example).success).toBe(true)
  })
  it('creates addressable sections/items, writes immutably, rejects absent targets', () => {
    const doc = createResume()
    const section = createSection('work')
    const item = createItem()
    section.items.push(item)
    doc.content.sections.push(section)
    const target = { kind: 'item' as const, sectionId: section.id, itemId: item.id, field: 'title' as const }
    const edited = writeTarget(doc.content, target, '工程师')
    expect(readTarget(edited, target)).toBe('工程师')
    expect(readTarget(doc.content, target)).toBe('')
    expect(targetLabel(edited, target)).toContain('工作')
    expect(() => readTarget(edited, { ...target, itemId: 'absent' })).toThrow()
    expect(() => writeTarget(edited, { ...target, sectionId: 'absent' }, 'x')).toThrow()
    expect(() => readTarget(edited, { kind: 'profile', field: '__proto__' } as never)).toThrow()
  })
  it('clones nested content independently and clears workflow state', () => {
    const original = applySuggestions(fixture(), ['s1'])
    original.analysisSummary = '分析摘要'
    original.analysisQuestions = ['待回答问题']
    original.content.sections = [createSection('work')]
    original.content.sections[0].items = [createItem()]
    const copy = cloneResume(original)
    copy.content.sections[0].items[0].title = '只改副本'
    expect(copy.id).not.toBe(original.id)
    expect(copy.history).toEqual([])
    expect(copy.suggestions).toEqual([])
    expect(copy.analysisSummary).toBe('')
    expect(copy.analysisQuestions).toEqual([])
    expect(original.content.sections[0].items[0].title).toBe('')
    expect(copy.revision).toBe(0)
  })
  it('applies a batch as one reversible history without changing source or revision', () => {
    const original = fixture()
    const applied = applySuggestions(original, ['s1', 's2'])
    expect(applied.content).toMatchObject({ name: '林一（英文名 Lin）', headline: '产品工程师' })
    expect(applied.history).toHaveLength(1)
    expect(applied.history[0].suggestionIds).toEqual(['s1', 's2'])
    expect(applied.revision).toBe(0)
    expect(original.content.name).toBe('林一')
    const reverted = revertHistory(applied, applied.history[0].id)
    expect(reverted.content).toEqual(original.content)
    expect(reverted.history[0].reverted).toBe(true)
    expect(reverted.suggestions.every((s) => s.status === 'pending')).toBe(true)
    expect(() => revertHistory(reverted, reverted.history[0].id)).toThrow()
  })
  it('rejects the entire batch for stale, unconfirmed, duplicate or nonpending changes', () => {
    const original = fixture()
    original.suggestions[1].before = 'stale'
    expect(() => applySuggestions(original, ['s1', 's2'])).toThrow()
    expect(original.content.name).toBe('林一')
    original.suggestions[1].before = ''
    original.suggestions[1].requiresConfirmation = true
    expect(() => applySuggestions(original, ['s1', 's2'])).toThrow()
    original.suggestions[1].confirmed = true
    expect(applySuggestions(original, ['s1', 's2']).history).toHaveLength(1)
    expect(() => applySuggestions(original, ['s1', 's1'])).toThrow()
    original.suggestions[1].target = original.suggestions[0].target
    original.suggestions[1].before = original.suggestions[0].before
    expect(() => applySuggestions(original, ['s1', 's2'])).toThrow()
    original.suggestions[0].status = 'dismissed'
    expect(() => applySuggestions(original, ['s1'])).toThrow()
    expect(() => applySuggestions(original, ['missing'])).toThrow()
  })
  it('refuses to overwrite later manual changes during undo', () => {
    const applied = applySuggestions(fixture(), ['s1', 's2'])
    applied.content.headline = '后来编辑'
    expect(() => revertHistory(applied, applied.history[0].id)).toThrow()
    expect(applied.content.name).toBe('林一（英文名 Lin）')
    expect(applied.history[0].reverted).toBe(false)
  })
  it('strictly validates metadata, history, content and globally unique content IDs', () => {
    const doc = fixture()
    expect(() => validateContent({ ...doc.content, unknown: true })).toThrow()
    const section = createSection('work')
    section.items = [createItem()]
    doc.content.sections = [section, structuredClone(section)]
    expect(documentSchema.safeParse(doc).success).toBe(false)
    doc.content.sections = [
      section,
      { ...createSection('education'), items: [structuredClone(section.items[0])] },
    ]
    expect(documentSchema.safeParse(doc).success).toBe(false)
    const valid = applySuggestions(fixture(), ['s1'])
    expect(documentSchema.safeParse({ ...valid, revision: -1 }).success).toBe(false)
    expect(documentSchema.safeParse({ ...valid, createdAt: 'yesterday' }).success).toBe(false)
    expect(documentSchema.safeParse({ ...valid, apiKey: 'secret' }).success).toBe(false)
    expect(
      documentSchema.safeParse({
        ...valid,
        history: [{ ...valid.history[0], changes: [{ target: {}, before: '', after: '' }] }],
      }).success,
    ).toBe(false)
  })
})

it('preserves text/entry layouts through validation, copy and AI edits while accepting legacy items', () => {
  const doc = createResume()
  const section = createSection('other')
  const textItem = { ...createItem('text'), description: '开源贡献\n社区文档' }
  const legacy = { ...createItem(), description: '旧简历文本' }
  delete legacy.layout
  section.items = [textItem, createItem('entry'), legacy]
  doc.content.sections = [section]
  const parsed = documentSchema.parse(JSON.parse(JSON.stringify(doc)))
  expect(parsed.content.sections[0].items.map((item) => item.layout)).toEqual(['text', 'entry', undefined])
  const copied = cloneResume(parsed)
  expect(copied.content.sections[0].items[0].description).toBe(textItem.description)
  const target = {
    kind: 'item' as const,
    sectionId: section.id,
    itemId: textItem.id,
    field: 'description' as const,
  }
  const edited = writeTarget(parsed.content, target, '更新开源贡献')
  expect(edited.sections[0].items[0]).toMatchObject({ layout: 'text', description: '更新开源贡献' })
})

describe('职业概览', () => {
  const today = new Date(2026, 10, 23)
  function content(...items: [string, string, string, string][]) {
    const doc = createResume()
    const work = createSection('work')
    work.items = items.map(([title, organization, startDate, endDate]) => ({
      ...createItem(),
      title,
      organization,
      startDate,
      endDate,
    }))
    const education = createSection('education')
    education.items = [{ ...createItem(), title: '本科', startDate: '2014.09', endDate: '2018.06' }]
    doc.content.sections = [work, education]
    return doc.content
  }
  const rows = (...items: [string, string][]) =>
    items.map(([startDate, endDate]) => ({ ...createItem(), startDate, endDate }))

  it('按工作经历生成的行只带时间、公司和职位，保持简历里的顺序，并且是新的条目', () => {
    const c = content(
      ['产品设计师', '远山工作室', '2023.03', '至今'],
      ['交互设计师', '晨光科技', '2020.07', '2023.02'],
    )
    c.sections[0].items[0].description = '不带进概览'
    c.sections[0].items.push({ ...createItem('text'), description: '自由文本不算一段经历' })
    const generated = overviewRows(c)
    expect(
      generated.map((item) => [item.organization, item.title, item.startDate, item.description]),
    ).toEqual([
      ['远山工作室', '产品设计师', '2023.03', ''],
      ['晨光科技', '交互设计师', '2020.07', ''],
    ])
    expect(generated[0].id).not.toBe(c.sections[0].items[0].id)
  })

  it('总月数按概览自己的行计算，包含首尾两个月，「至今」按当前月份算，重叠时段只算一次', () => {
    expect(careerMonths(rows(['2023.03', '至今'], ['2020.07', '2023.02']), today)).toBe(77)
    expect(
      careerMonths(rows(['2020-01', '2020-12'], ['2020年6月', '2021年3月'], ['2020/2', '2020/4']), today),
    ).toBe(15)
    expect(
      careerMonths([...rows(['2020.01', '2020.12']), { ...createItem('text'), description: '说明' }], today),
    ).toBe(12)
    expect(formatCareerLength(77, 'zh-CN')).toBe('共 6 年 5 个月')
    expect(formatCareerLength(12, 'zh-CN')).toBe('共 1 年')
    expect(formatCareerLength(14, 'en-US')).toBe('1 yr 2 mos')
  })

  it('有一行日期认不出、缺失或前后颠倒时，不给出总月数', () => {
    expect(careerMonths(rows(['Mar 2020', '2021.01']), today)).toBeNull()
    expect(careerMonths(rows(['2020.01', '']), today)).toBeNull()
    expect(careerMonths(rows(['2022.01', '2021.01']), today)).toBeNull()
    expect(careerMonths([], today)).toBeNull()
  })

  it('用户改概览自己的行不算过期；工作经历变了才提示，重新生成会保留补充说明，选择保持现状后不再提示', () => {
    const c = content(['产品设计师', '远山工作室', '2023.03', '至今'])
    const note = { ...createItem('text'), description: '补充说明' }
    let overview = regenerateOverview({ ...createSection('overview'), items: [note] }, c)
    expect(overview.items.map((item) => item.layout)).toEqual(['text', 'entry'])
    expect(overviewOutdated(overview, c)).toBe(false)
    overview.items[1].title = '高级产品设计师'
    expect(overviewOutdated(overview, c)).toBe(false)
    c.sections[0].items[0].endDate = '2025.06'
    expect(overviewOutdated(overview, c)).toBe(true)
    expect(overviewOutdated(acknowledgeOverview(overview, c), c)).toBe(false)
    overview = regenerateOverview(overview, c)
    expect(overview.items.map((item) => item.description || item.endDate)).toEqual(['补充说明', '2025.06'])
    expect(overview.items[1].title).toBe('产品设计师')
  })

  it('职业概览区块的总年限可以手写、清空恢复自动，并能通过文档校验', () => {
    const doc = createResume()
    const overview = regenerateOverview(createSection('overview'), doc.content)
    doc.content.sections = [overview]
    expect(overview.title).toBe('职业概览')
    const target = { kind: 'section', sectionId: overview.id, field: 'careerLength' } as const
    expect(readTarget(doc.content, target)).toBe('')
    doc.content = writeTarget(doc.content, target, '8 年+')
    expect(readTarget(doc.content, target)).toBe('8 年+')
    expect(targetLabel(doc.content, target)).toBe('职业概览 · 总年限')
    expect(documentSchema.safeParse(doc).success).toBe(true)
    doc.content = writeTarget(doc.content, target, '')
    expect(readTarget(doc.content, target)).toBe('')
  })

  it('字段名按区块类型变化，没有专门名称的类型用通用名称', () => {
    expect(itemLabel('work', 'title')).toBe('职位')
    expect(itemLabel('education', 'organization')).toBe('学校')
    expect(itemLabel('project', 'title')).toBe('项目名称')
    expect(itemLabel('other', 'title')).toBe('标题')
    expect(itemLabel('work', 'startDate')).toBe('开始时间')
  })
})
