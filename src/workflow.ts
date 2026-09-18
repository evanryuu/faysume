import { z } from 'zod'
import type { Material, ResumeDocument } from './types'

export const planSchema = z
  .object({
    summary: z.string().min(1).max(5000),
    directions: z.array(z.string().min(1).max(2000)).min(1).max(8),
    questions: z.array(z.string().min(1).max(1000)).max(6),
    searchQueries: z.array(z.string().min(1).max(300)).max(3),
  })
  .strict()
export const researchSchema = z
  .object({
    id: z.string().max(100),
    title: z.string().max(1000),
    url: z
      .string()
      .url()
      .max(4000)
      .refine((v) => {
        const url = new URL(v)
        return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      }),
    content: z.string().max(6000),
    publishedAt: z.string().max(100),
    retrievedAt: z.iso.datetime(),
  })
  .strict()
export const workflowSchema = z
  .object({
    runId: z.string().max(100).default(''),
    intent: z.string().max(10000),
    answer: z.string().max(20000),
    materialIds: z.array(z.string().max(200)).max(100),
    plan: planSchema.nullable(),
    inputSnapshot: z.string().max(3_000_000),
    confirmed: z.boolean(),
    searchEnabled: z.boolean(),
    research: z.array(researchSchema).max(15),
  })
  .strict()
export type Plan = z.infer<typeof planSchema>
export type Research = z.infer<typeof researchSchema>
export type Workflow = z.infer<typeof workflowSchema>
export const emptyWorkflow = (): Workflow => ({
  runId: '',
  intent: '',
  answer: '',
  materialIds: [],
  plan: null,
  inputSnapshot: '',
  confirmed: false,
  searchEnabled: false,
  research: [],
})
export const workflowFor = (doc: ResumeDocument): Workflow => doc.workflow ?? emptyWorkflow()
// Exclude presentation settings and suggestion checkboxes from user intent.
export function reviewContext(doc: ResumeDocument): string {
  const w = workflowFor(doc)
  return JSON.stringify([
    w.intent,
    w.answer,
    [...w.materialIds].sort(),
    doc.targetRole,
    doc.market,
    doc.locale,
    doc.jobDescription,
    w.plan,
    w.searchEnabled,
    w.runId,
  ])
}
export function materialSnapshot(materials: Material[]): string {
  return JSON.stringify(
    [...materials]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(({ id, title, content }) => ({ id, title, content })),
  )
}
export function workflowSnapshot(doc: ResumeDocument, materials: Material[]): string {
  const w = workflowFor(doc)
  return JSON.stringify([
    doc.content,
    doc.extractionReviewed,
    w.intent,
    w.answer,
    [...w.materialIds].sort(),
    doc.targetRole,
    doc.market,
    doc.locale,
    doc.jobDescription,
    materialSnapshot(materials),
  ])
}
export function requireConfirmedPlan(doc: ResumeDocument, materials: Material[]): Workflow {
  const w = workflowFor(doc)
  if (!doc.extractionReviewed) throw new Error('请先校对识别内容。')
  if (!w.plan || !w.confirmed || w.inputSnapshot !== workflowSnapshot(doc, materials))
    throw new Error('目标、简历或素材已变化，请重新生成并确认修改方向。')
  return w
}
