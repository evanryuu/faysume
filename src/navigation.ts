import { z } from 'zod'

export const resumeListSearchSchema = z.object({
  q: z.string().max(200).catch('').default(''),
})

export const editorSearchSchema = z.object({
  tab: z.enum(['content', 'ai', 'sources', 'history']).catch('content').default('content'),
  preview: z.boolean().catch(false).default(false),
})

export type EditorTab = z.infer<typeof editorSearchSchema>['tab']
