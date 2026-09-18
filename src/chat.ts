import { z } from 'zod'
import type { UIMessage } from 'ai'
import { suggestionSchema } from './domain'
import { planSchema, researchSchema, workflowSchema } from './workflow'

export const revisionInputSchema = z
  .object({
    intent: z.string().min(1).max(10000).describe('用户希望达成的目标'),
    facts: z.string().max(20000).describe('用户在对话中补充的真实信息，没有则留空'),
    plan: planSchema,
    snapshot: z.string().length(64).describe('系统提供的当前简历快照标识，必须原样复制'),
  })
  .strict()
export const revisionOutputSchema = z
  .object({
    workflow: workflowSchema,
    summary: z.string().max(50000),
    questions: z.array(z.string().max(50000)).max(20),
    suggestions: z.array(suggestionSchema).max(60),
    research: z.array(researchSchema).max(15),
  })
  .strict()
export type RevisionOutput = z.infer<typeof revisionOutputSchema>
export type ResumeChatMessage = UIMessage<
  unknown,
  never,
  {
    reviseResume: { input: z.infer<typeof revisionInputSchema>; output: RevisionOutput }
  }
>
