import { z } from 'zod'
import type { ResumeContent, ResumeDocument, ResumeItem, ResumeSection, SectionKind, Target } from './types'

export const uid = (): string => crypto.randomUUID()
const text = z.string().max(200_000)
const id = z.string().min(1).max(200)
const timestamp = z.iso.datetime()
const profileFields = ['name', 'headline', 'email', 'phone', 'location', 'website', 'summary'] as const
const itemFields = ['title', 'organization', 'location', 'startDate', 'endDate', 'description'] as const
const kinds = ['work', 'project', 'education', 'skills', 'other'] as const
const itemSchema = z
  .object({
    id,
    title: text,
    organization: text,
    location: text,
    startDate: text,
    endDate: text,
    description: text,
  })
  .strict()
const sectionSchema = z
  .object({ id, title: text, kind: z.enum(kinds), items: z.array(itemSchema).max(1000) })
  .strict()
export const contentSchema = z
  .object({
    name: text,
    headline: text,
    email: text,
    phone: text,
    location: text,
    website: text,
    summary: text,
    sections: z.array(sectionSchema).max(100),
  })
  .strict()
  .superRefine((content, ctx) => {
    const seen = new Set<string>()
    for (const section of content.sections) {
      for (const entry of [section, ...section.items]) {
        if (seen.has(entry.id)) ctx.addIssue({ code: 'custom', message: '章节与经历 ID 必须唯一' })
        seen.add(entry.id)
      }
    }
  })
export const targetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('profile'), field: z.enum(profileFields) }).strict(),
  z.object({ kind: z.literal('item'), sectionId: id, itemId: id, field: z.enum(itemFields) }).strict(),
  z.object({ kind: z.literal('section'), sectionId: id, field: z.literal('title') }).strict(),
])
const changeSchema = z.object({ target: targetSchema, before: text, after: text }).strict()
const suggestionSchema = z
  .object({
    id,
    target: targetSchema,
    before: text,
    after: text,
    reason: text,
    evidence: z.array(text).max(100),
    question: text,
    requiresConfirmation: z.boolean(),
    confirmed: z.boolean(),
    status: z.enum(['pending', 'applied', 'dismissed']),
  })
  .strict()
const historySchema = z
  .object({
    id,
    label: text,
    changes: z.array(changeSchema).min(1).max(1000),
    suggestionIds: z.array(id).min(1).max(1000),
    createdAt: timestamp,
    reverted: z.boolean(),
  })
  .strict()
export const documentSchema = z
  .object({
    id,
    name: text,
    revision: z.number().int().nonnegative(),
    template: z.enum(['classic', 'modern', 'compact']),
    locale: text,
    market: text,
    targetRole: text,
    jobDescription: text,
    content: contentSchema,
    analysisSummary: text,
    analysisQuestions: z.array(text).max(1000),
    suggestions: z.array(suggestionSchema).max(5000),
    history: z.array(historySchema).max(10000),
    sourceIds: z.array(id).max(5),
    warnings: z.array(text).max(1000),
    extractionReviewed: z.boolean(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict()
  .superRefine((doc, ctx) => {
    const unique = (values: string[], label: string) => {
      if (new Set(values).size !== values.length)
        ctx.addIssue({ code: 'custom', message: `${label}不能重复` })
    }
    unique(doc.sourceIds, '原图 ID')
    unique(
      doc.suggestions.map((s) => s.id),
      '建议 ID',
    )
    unique(
      doc.history.map((h) => h.id),
      '历史 ID',
    )
    for (const entry of doc.history) {
      unique(entry.suggestionIds, '历史关联建议 ID')
      unique(
        entry.changes.map((c) => targetKey(c.target)),
        '历史修改字段',
      )
      if (entry.changes.length !== entry.suggestionIds.length)
        ctx.addIssue({ code: 'custom', message: '历史修改与关联建议数量不匹配' })
    }
  })
export const validateContent = (input: unknown): ResumeContent => contentSchema.parse(input)
const sectionNames: Record<SectionKind, string> = {
  work: '工作经历',
  project: '项目经历',
  education: '教育背景',
  skills: '技能',
  other: '其他经历',
}
export const createItem = (): ResumeItem => ({
  id: uid(),
  title: '',
  organization: '',
  location: '',
  startDate: '',
  endDate: '',
  description: '',
})
export const createSection = (kind: SectionKind): ResumeSection => ({
  id: uid(),
  title: sectionNames[kind],
  kind,
  items: [],
})
export function createResume(name = '未命名简历'): ResumeDocument {
  const now = new Date().toISOString()
  return {
    id: uid(),
    name,
    revision: 0,
    template: 'classic',
    locale: 'zh-CN',
    market: '',
    targetRole: '',
    jobDescription: '',
    content: {
      name: '',
      headline: '',
      email: '',
      phone: '',
      location: '',
      website: '',
      summary: '',
      sections: [],
    },
    analysisSummary: '',
    analysisQuestions: [],
    suggestions: [],
    history: [],
    sourceIds: [],
    warnings: [],
    extractionReviewed: true,
    createdAt: now,
    updatedAt: now,
  }
}
export function createExampleResume(): ResumeDocument {
  const doc = createResume('虚构示例 · 林知夏')
  doc.content = {
    ...doc.content,
    name: '林知夏（虚构人物）',
    headline: '产品设计师',
    email: 'lin.zhixia@example.com',
    location: '杭州',
    summary:
      '虚构示例：关注用户研究与交互设计，擅长将复杂流程转化为清晰的产品体验。所有经历仅用于展示，请替换为自己的真实信息。',
  }
  const work = createSection('work')
  work.items.push({
    ...createItem(),
    title: '产品设计师',
    organization: '远山工作室（虚构）',
    startDate: '2023.03',
    endDate: '至今',
    description: '参与团队协作工具的需求梳理与交互设计。\n整理用户访谈记录，与工程师共同检查上线体验。',
  })
  const education = createSection('education')
  education.items.push({
    ...createItem(),
    title: '视觉传达设计 · 本科',
    organization: '示例设计学院（虚构）',
    startDate: '2018.09',
    endDate: '2022.06',
    description: '课程项目涉及信息设计、交互原型与用户研究。',
  })
  const skills = createSection('skills')
  skills.items.push({
    ...createItem(),
    title: '专业技能',
    description: '用户访谈 / 交互原型 / 信息架构 / Figma',
  })
  doc.content.sections = [work, education, skills]
  return doc
}
export function cloneResume(doc: ResumeDocument, name = `${doc.name} · 副本`): ResumeDocument {
  const copy = structuredClone(doc)
  const now = new Date().toISOString()
  return {
    ...copy,
    id: uid(),
    name,
    revision: 0,
    analysisSummary: '',
    analysisQuestions: [],
    suggestions: [],
    history: [],
    createdAt: now,
    updatedAt: now,
  }
}
function targetKey(target: Target): string {
  return target.kind === 'profile'
    ? JSON.stringify(['profile', target.field])
    : target.kind === 'section'
      ? JSON.stringify(['section', target.sectionId, target.field])
      : JSON.stringify(['item', target.sectionId, target.itemId, target.field])
}
export function readTarget(content: ResumeContent, input: Target): string {
  const target = targetSchema.parse(input)
  if (target.kind === 'profile') return content[target.field]
  const section = content.sections.find((s) => s.id === target.sectionId)
  if (!section) throw new Error('建议对应的章节已不存在')
  if (target.kind === 'section') return section.title
  const item = section.items.find((i) => i.id === target.itemId)
  if (!item) throw new Error('建议对应的经历已不存在')
  return item[target.field]
}
export function writeTarget(content: ResumeContent, target: Target, value: string): ResumeContent {
  readTarget(content, target)
  text.parse(value)
  const copy = structuredClone(content)
  if (target.kind === 'profile') copy[target.field] = value
  else {
    const section = copy.sections.find((s) => s.id === target.sectionId)!
    if (target.kind === 'section') section.title = value
    else section.items.find((i) => i.id === target.itemId)![target.field] = value
  }
  return copy
}
const fieldNames: Record<string, string> = {
  name: '姓名',
  headline: '职业标题',
  email: '邮箱',
  phone: '电话',
  location: '地点',
  website: '个人网站',
  summary: '个人简介',
  title: '标题',
  organization: '组织',
  startDate: '开始时间',
  endDate: '结束时间',
  description: '描述',
}
export function targetLabel(content: ResumeContent, target: Target): string {
  if (target.kind === 'profile') return fieldNames[target.field]
  const section = content.sections.find((s) => s.id === target.sectionId)
  if (target.kind === 'section') return `${section?.title || '已删除章节'} · 标题`
  const item = section?.items.find((i) => i.id === target.itemId)
  return `${section?.title || '已删除章节'} · ${item?.title || item?.organization || '经历'} · ${fieldNames[target.field]}`
}
export function applySuggestions(doc: ResumeDocument, ids: string[]): ResumeDocument {
  if (!ids.length) throw new Error('请先选择建议')
  if (new Set(ids).size !== ids.length) throw new Error('不能重复应用同一建议')
  const selected = ids.map((id) => {
    const suggestion = doc.suggestions.find((s) => s.id === id)
    if (!suggestion || suggestion.status !== 'pending') throw new Error('建议不存在或已处理')
    if (suggestion.requiresConfirmation && !suggestion.confirmed) throw new Error('请先确认建议中的新事实')
    if (readTarget(doc.content, suggestion.target) !== suggestion.before)
      throw new Error('字段已被修改，请重新分析后再应用建议')
    return suggestion
  })
  if (new Set(selected.map((s) => targetKey(s.target))).size !== selected.length)
    throw new Error('多条建议修改同一字段，请分别选择')
  const copy = structuredClone(doc)
  for (const suggestion of selected)
    copy.content = writeTarget(copy.content, suggestion.target, suggestion.after)
  for (const suggestion of copy.suggestions) if (ids.includes(suggestion.id)) suggestion.status = 'applied'
  copy.history.push({
    id: uid(),
    label: `应用 ${selected.length} 条建议`,
    changes: selected.map((s) => ({ target: structuredClone(s.target), before: s.before, after: s.after })),
    suggestionIds: [...ids],
    createdAt: new Date().toISOString(),
    reverted: false,
  })
  return copy
}
export function revertHistory(doc: ResumeDocument, historyId: string): ResumeDocument {
  const entry = doc.history.find((h) => h.id === historyId)
  if (!entry || entry.reverted) throw new Error('修改记录不存在或已撤回')
  for (const change of entry.changes) {
    if (readTarget(doc.content, change.target) !== change.after)
      throw new Error('字段有后续修改，无法撤回整组建议')
  }
  const copy = structuredClone(doc)
  for (const change of entry.changes) copy.content = writeTarget(copy.content, change.target, change.before)
  copy.history.find((h) => h.id === historyId)!.reverted = true
  for (const suggestion of copy.suggestions)
    if (entry.suggestionIds.includes(suggestion.id)) suggestion.status = 'pending'
  return copy
}
