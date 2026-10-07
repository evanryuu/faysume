import { analyzeResume } from './ai'
import { db, mutateResume } from './db'
import { uid } from './domain'
import { workflowFor, workflowSnapshot } from './workflow'
import type { AIConnection, Analysis, DirectChatMessage, Material, ResumeDocument, Target } from './types'

export function assistantText(result: Pick<Analysis, 'summary' | 'questions'>): string {
  return [
    result.summary,
    result.questions.length ? result.questions.map((q, i) => `${i + 1}. ${q}`).join('\n') : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function conversationFor(doc: ResumeDocument): DirectChatMessage[] {
  if (doc.directConversation) return doc.directConversation.messages
  const text = assistantText({ summary: doc.analysisSummary, questions: doc.analysisQuestions })
  return text.trim() ? [{ id: `legacy-${doc.id}`, role: 'assistant', text }] : []
}

const targetKey = (target: Target) =>
  JSON.stringify([
    target.kind,
    target.field,
    target.kind !== 'profile' ? target.sectionId : '',
    target.kind === 'item' ? target.itemId : '',
  ])

export async function replyToResume(
  resumeId: string,
  connection: AIConnection,
  input: string | null,
  signal: AbortSignal,
  fetcher?: typeof fetch,
  onSubmitted?: () => void,
): Promise<void> {
  let snapshot!: ResumeDocument
  let selected!: Material[]
  await db.transaction('rw', db.resumes, db.materials, db.sources, async () => {
    signal.throwIfAborted()
    const current = await db.resumes.get(resumeId)
    if (!current) throw new Error('简历不存在。')
    if (!current.extractionReviewed) throw new Error('请先在「识别原稿」确认校对。')
    const materials = await db.materials.bulkGet(workflowFor(current).materialIds)
    if (materials.some((m) => !m)) throw new Error('参考素材已删除，请重新选择。')
    selected = materials as Material[]
    const messages = [...conversationFor(current)]
    if (input !== null) {
      if (!input.trim() || input.length > 10000) throw new Error('每条消息请填写 1–10,000 字。')
      messages.push({ id: uid(), role: 'user', text: input.trim() })
    } else if (messages.at(-1)?.role !== 'user') throw new Error('没有需要重试的消息。')
    if (messages.length >= 200) throw new Error('本次对话已达到长度上限，请另存简历副本后开始新的对话。')
    await mutateResume(resumeId, (doc) => ({ ...doc, directConversation: { messages } }))
    snapshot = { ...current, directConversation: { messages } }
  })
  onSubmitted?.()
  const messages = snapshot.directConversation!.messages
  const result = await analyzeResume(connection, snapshot, selected, signal, fetcher, [], undefined, messages)
  signal.throwIfAborted()
  await db.transaction('rw', db.resumes, db.materials, db.sources, async () => {
    signal.throwIfAborted()
    const current = await db.resumes.get(resumeId)
    if (!current) throw new Error('简历不存在。')
    const materials = (await db.materials.bulkGet(workflowFor(current).materialIds)).filter(
      (m): m is Material => Boolean(m),
    )
    if (workflowSnapshot(current, materials) !== workflowSnapshot(snapshot, selected))
      throw new Error('回复期间简历、岗位或素材已变化。消息已保留，请重试以使用最新内容。')
    if (JSON.stringify(current.directConversation?.messages) !== JSON.stringify(messages))
      throw new Error('另一窗口已更新对话，请查看最新消息后继续。')
    const replaced = new Set(result.suggestions.map((s) => targetKey(s.target)))
    await mutateResume(resumeId, (doc) => ({
      ...doc,
      analysisSummary: result.summary,
      analysisQuestions: result.questions,
      directConversation: {
        messages: [...messages, { id: uid(), role: 'assistant', text: assistantText(result) }],
      },
      // A conversational answer must not discard unrelated, unreviewed suggestions.
      suggestions: [
        ...doc.suggestions.map((s) =>
          s.status === 'pending' && replaced.has(targetKey(s.target))
            ? { ...s, status: 'dismissed' as const }
            : s,
        ),
        ...result.suggestions,
      ],
    }))
  })
}
