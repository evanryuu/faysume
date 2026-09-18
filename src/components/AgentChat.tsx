import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai'
import { db, mutateResume } from '../db'
import { revisionOutputSchema, type ResumeChatMessage } from '../chat'
import { workflowFor, workflowSnapshot } from '../workflow'
import type { AIConnection, Material, ResumeDocument } from '../types'
import { errorMessage, type Notify } from './ui'

export default function AgentChat({
  document,
  materials,
  connection,
  notify,
}: {
  document: ResumeDocument
  materials: Material[]
  connection: AIConnection
  notify: Notify
}) {
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const access = useRef(connection.accessToken)
  access.current = connection.accessToken
  const requestSnapshot = useRef('')
  const mounted = useRef(true)
  const transport = useMemo(
    () =>
      new DefaultChatTransport<ResumeChatMessage>({
        api: '/api/chat',
        headers: () => ({ Authorization: `Bearer ${access.current?.trim() ?? ''}` }),
        prepareSendMessagesRequest: async ({ messages, id, trigger, messageId }) => {
          const current = await db.resumes.get(document.id)
          if (!current) throw new Error('简历已被删除。')
          const selected = await db.materials.bulkGet(workflowFor(current).materialIds)
          if (selected.some((m) => !m)) throw new Error('选中素材已被删除，请重新选择。')
          if (messages.at(-1)?.role === 'user') {
            await mutateResume(document.id, (doc) => ({
              ...doc,
              suggestions: doc.suggestions.map((s) =>
                s.status === 'pending' ? { ...s, status: 'dismissed' } : s,
              ),
            }))
          }
          requestSnapshot.current = workflowSnapshot(current, selected as Material[])
          return {
            body: {
              id,
              trigger,
              messageId,
              messages,
              document: { ...current, conversation: undefined, history: [], suggestions: [] },
              materials: selected,
            },
          }
        },
        fetch: async (url, options) => {
          const response = await fetch(url, options)
          if (!response.ok) {
            const body = await response.json().catch(() => null)
            throw new Error(body?.error || `助手请求失败（HTTP ${response.status}）。`)
          }
          return response
        },
      }),
    [document.id],
  )
  const { messages, setMessages, sendMessage, addToolApprovalResponse, status, error, stop, clearError } =
    useChat<ResumeChatMessage>({
      id: document.id,
      messages: document.conversation?.messages ?? [],
      transport,
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
      onFinish: async ({ message, messages, isAbort, isError }) => {
        if (!mounted.current) return
        setSaving(true)
        try {
          await db.transaction('rw', db.resumes, db.materials, db.sources, async () => {
            const current = await db.resumes.get(document.id)
            if (!current) throw new Error('简历已被删除。')
            const selected = (await db.materials.bulkGet(workflowFor(current).materialIds)).filter(
              (m): m is Material => Boolean(m),
            )
            if (workflowSnapshot(current, selected) !== requestSnapshot.current)
              throw new Error('简历或素材在请求期间发生变化，本轮结果未保存。请重新开始对话。')
            await mutateResume(document.id, (doc) => {
              const handledCalls = [...(doc.conversation?.handledCalls ?? [])]
              for (const part of message.parts) {
                if (isAbort || isError) continue
                if (
                  part.type !== 'tool-reviseResume' ||
                  part.state !== 'output-available' ||
                  handledCalls.includes(part.toolCallId)
                )
                  continue
                const output = revisionOutputSchema.parse(part.output)
                if (
                  output.workflow.inputSnapshot !==
                  workflowSnapshot({ ...doc, workflow: output.workflow }, selected)
                )
                  throw new Error('建议对应的简历或素材已经变化，请重新生成。')
                doc.workflow = output.workflow
                doc.analysisSummary = output.summary
                doc.analysisQuestions = output.questions
                doc.suggestions = [
                  ...doc.suggestions.map((s) =>
                    s.status === 'pending' ? { ...s, status: 'dismissed' as const } : s,
                  ),
                  ...output.suggestions,
                ]
                handledCalls.push(part.toolCallId)
              }
              doc.conversation = { messages, handledCalls, snapshot: workflowSnapshot(doc, selected) }
              return doc
            })
          })
        } catch (e) {
          notify(errorMessage(e), 'error')
        } finally {
          if (mounted.current) setSaving(false)
        }
      },
    })
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      void stop()
    }
  }, [stop])
  const busy = status === 'submitted' || status === 'streaming' || saving
  const stale = Boolean(
    document.conversation && document.conversation.snapshot !== workflowSnapshot(document, materials),
  )
  const pending =
    messages.at(-1)?.parts.some((p) => p.type === 'tool-reviseResume' && p.state === 'approval-requested') ??
    false
  const reset = async () => {
    await stop()
    try {
      await mutateResume(document.id, (doc) => ({ ...doc, conversation: undefined }))
      setMessages([])
      clearError()
    } catch (e) {
      notify(errorMessage(e), 'error')
    }
  }
  return (
    <section className="agent-chat" aria-label="简历对话助手">
      <h3>先聊聊，你希望怎样调整？</h3>
      <p className="hint">
        助手会了解目标、追问细节，再请你确认修改方向和搜索关键词。生成建议后，你仍可逐条审阅。
      </p>
      {stale && (
        <p className="notice warning">简历、岗位或素材已经变化。请按当前内容重新开始，旧方案不能继续执行。</p>
      )}
      <div className="agent-messages" aria-live="polite">
        {messages.map((message) => (
          <article key={message.id} className={`agent-message ${message.role}`}>
            <strong>{message.role === 'user' ? '你' : '简历助手'}</strong>
            {message.parts.map((part, index) => {
              if (part.type === 'text')
                return (
                  <p className="agent-text" key={index}>
                    {part.text}
                  </p>
                )
              if (part.type !== 'tool-reviseResume') return null
              if (part.state === 'input-streaming') return <p key={index}>正在整理修改方向…</p>
              const proposal = part.input
              return (
                <div className="agent-proposal" key={part.toolCallId}>
                  {proposal && (
                    <>
                      <h4>请确认修改方向</h4>
                      <p>{proposal.intent}</p>
                      <p>{proposal.plan.summary}</p>
                      <ul>
                        {proposal.plan.directions.map((direction, i) => (
                          <li key={i}>{direction}</li>
                        ))}
                      </ul>
                      {proposal.facts && (
                        <>
                          <strong>本轮采用的补充事实</strong>
                          <p className="agent-text">{proposal.facts}</p>
                        </>
                      )}
                      {proposal.plan.questions.length > 0 && (
                        <>
                          <strong>仍需你核对的问题</strong>
                          <ul>
                            {proposal.plan.questions.map((q, i) => (
                              <li key={i}>{q}</li>
                            ))}
                          </ul>
                        </>
                      )}
                      {proposal.plan.searchQueries.length > 0 ? (
                        <>
                          <strong>批准后将搜索以下关键词</strong>
                          <ul>
                            {proposal.plan.searchQueries.map((q, i) => (
                              <li key={i}>{q}</li>
                            ))}
                          </ul>
                          <p className="hint">
                            关键词将发送到 Tavily。请确认其中没有私人信息；需要调整时先拒绝，再告诉助手。
                          </p>
                        </>
                      ) : (
                        <p className="hint">本轮不联网搜索。</p>
                      )}
                    </>
                  )}
                  {part.state === 'approval-requested' && (
                    <div className="agent-actions">
                      <Button
                        variant="default"
                        size="default"
                        type="button"
                        className="button primary"
                        disabled={busy || stale || message !== messages.at(-1)}
                        onClick={() => void addToolApprovalResponse({ id: part.approval.id, approved: true })}
                      >
                        确认方向，生成建议
                      </Button>
                      <Button
                        variant="outline"
                        size="default"
                        type="button"
                        className="button secondary"
                        disabled={busy || stale || message !== messages.at(-1)}
                        onClick={() =>
                          void addToolApprovalResponse({
                            id: part.approval.id,
                            approved: false,
                            reason: '用户希望先调整方案，请等待补充说明。',
                          })
                        }
                      >
                        我想先调整
                      </Button>
                    </div>
                  )}
                  {part.state === 'approval-responded' && <p>已提交你的选择。</p>}
                  {part.state === 'output-denied' && <p>你已拒绝这个方向，可以继续说明需要调整的地方。</p>}
                  {part.state === 'output-error' && (
                    <p role="alert">{part.errorText || '生成建议失败，请重试。'}</p>
                  )}
                  {part.state === 'output-available' && <p>建议已生成，请在下方审阅。未自动修改简历。</p>}
                </div>
              )
            })}
          </article>
        ))}
      </div>
      {error && (
        <p role="alert" className="notice warning">
          {error.message}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!input.trim() || busy || stale || pending) return
          void sendMessage({ text: input.trim() }).catch((e) => notify(errorMessage(e), 'error'))
          setInput('')
        }}
      >
        <label className="field">
          <span>你的目标或补充说明</span>
          <Textarea
            rows={3}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder="例如：我想申请高级前端岗位，突出性能优化，保留技术细节。没有依据的数据不要补。"
          />
        </label>
        <div className="agent-actions">
          <Button
            variant="default"
            size="default"
            className="button primary"
            type="submit"
            disabled={
              !input.trim() ||
              busy ||
              pending ||
              stale ||
              !connection.accessToken ||
              !document.extractionReviewed
            }
          >
            发送给助手
          </Button>
          {busy && (
            <Button
              variant="outline"
              size="default"
              type="button"
              className="button secondary"
              onClick={() => void stop()}
            >
              停止生成
            </Button>
          )}
          {!busy && messages.length > 0 && (
            <Button
              variant="ghost"
              size="layout"
              type="button"
              className="text-button"
              onClick={() => void reset()}
            >
              按当前简历重新开始
            </Button>
          )}
        </div>
        {pending && <p className="hint">请先确认或拒绝上面的修改方向，再继续对话。</p>}
        {!connection.accessToken && <p className="hint">请先到 AI 设置填写站点访问口令。</p>}
      </form>
    </section>
  )
}
