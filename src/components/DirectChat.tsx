import { useEffect, useRef, useState } from 'react'
import { ArrowUp, LoaderCircle, MessageCircle, RotateCcw, Square } from 'lucide-react'
import { connectionReady } from '../ai'
import { conversationFor, replyToResume } from '../directChat'
import type { AIConnection, ResumeDocument } from '../types'
import { errorMessage } from './ui'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import AssistantMessage from './AssistantMessage'

export default function DirectChat({
  document,
  connection,
  onSettings,
  pendingCount,
  onReview,
  discussion,
  onDiscussionUsed,
  active,
}: {
  document: ResumeDocument
  connection: AIConnection
  onSettings: () => void
  pendingCount: number
  onReview: () => void
  discussion: { text: string } | null
  onDiscussionUsed: () => void
  active: boolean
}) {
  const draftKey = `faysume-chat-draft:${document.id}`
  const [input, setInput] = useState(() => {
    try {
      return sessionStorage.getItem(draftKey) ?? ''
    } catch {
      return ''
    }
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const latest = useRef<HTMLElement>(null)
  const messages = conversationFor(document)
  const ready = connectionReady(connection)
  const unanswered = messages.at(-1)?.role === 'user'
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => {
    if (active && scroll.current && latest.current) scroll.current.scrollTop = latest.current.offsetTop
  }, [messages.length, active])
  const draft = (value: string) => {
    setInput(value)
    try {
      if (value) sessionStorage.setItem(draftKey, value)
      else sessionStorage.removeItem(draftKey)
    } catch {
      /* The in-memory draft remains usable when browser storage is unavailable. */
    }
  }
  useEffect(() => {
    if (discussion) {
      draft([discussion.text, input].filter(Boolean).join('\n\n'))
      composer.current?.focus()
      onDiscussionUsed()
    }
  }, [discussion])
  const send = async (text: string | null) => {
    if (controller.current || !ready || !document.extractionReviewed) return
    if (text !== null && !text.trim()) return
    const request = new AbortController()
    controller.current = request
    setBusy(true)
    setError('')
    try {
      await replyToResume(document.id, connection, text, request.signal, undefined, () => {
        if (text !== null) draft('')
      })
    } catch (e) {
      if (!request.signal.aborted) setError(errorMessage(e))
    } finally {
      if (controller.current === request) {
        controller.current = null
        setBusy(false)
      }
    }
  }
  return (
    <section className="agent-chat conversation-chat" aria-label="简历对话助手">
      <div className="agent-messages" ref={scroll}>
        {!messages.length && (
          <div className="chat-welcome">
            <MessageCircle size={28} />
            <h3>一起把经历说清楚</h3>
            <p>可以先分析简历，也可以直接聊你的目标。回答追问、补充事实或调整措辞，都可以接着说。</p>
            <Button
              variant="outline"
              className="button secondary"
              disabled={!ready || busy || !document.extractionReviewed}
              onClick={() => void send('请分析当前简历，指出最值得改进的地方，并在需要时向我追问。')}
            >
              开始 AI 分析
            </Button>
          </div>
        )}
        <div role="log" aria-label="对话记录" aria-live="polite">
          {messages.map((message, index) => (
            <article
              className={`agent-message ${message.role}`}
              key={message.id}
              ref={index === messages.length - 1 ? latest : undefined}
            >
              <strong>{message.role === 'user' ? '你' : '简历助手'}</strong>
              {message.role === 'assistant' ? (
                <AssistantMessage text={message.text} />
              ) : (
                <p className="agent-text">{message.text}</p>
              )}
            </article>
          ))}
        </div>
        {busy && (
          <p className="chat-thinking" role="status">
            <LoaderCircle size={16} className="spin" />
            正在回复…
          </p>
        )}
        {pendingCount > 0 && (
          <div className="chat-result-link">
            <div>
              <strong>{pendingCount} 条修改建议待审阅</strong>
              <p>确认采纳后才会更新简历。</p>
            </div>
            <Button variant="outline" className="button secondary" onClick={onReview}>
              查看修改建议
            </Button>
          </div>
        )}
      </div>
      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault()
          void send(input)
        }}
      >
        {error && (
          <p role="alert" className="notice warning">
            {error}
          </p>
        )}
        {unanswered && !busy && (
          <div className="chat-retry">
            <span>上一条消息尚未收到回复。</span>
            <Button
              variant="ghost"
              type="button"
              className="text-button"
              disabled={!ready || !document.extractionReviewed}
              onClick={() => void send(null)}
            >
              <RotateCcw size={14} />
              重试上一条消息
            </Button>
          </div>
        )}
        <Textarea
          ref={composer}
          aria-label="你的目标或补充说明"
          rows={3}
          value={input}
          maxLength={10000}
          disabled={busy}
          onChange={(event) => draft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
              event.preventDefault()
              void send(input)
            }
          }}
          placeholder="告诉助手你想修改什么，或补充真实经历…"
        />
        <div className="chat-composer-actions">
          <span className="hint">Enter 换行 · ⌘ / Ctrl + Enter 发送</span>
          {busy ? (
            <Button
              variant="outline"
              className="button secondary"
              type="button"
              onClick={() => controller.current?.abort()}
            >
              <Square size={14} />
              停止生成
            </Button>
          ) : (
            <Button
              type="submit"
              className="button primary"
              disabled={!ready || !input.trim() || !document.extractionReviewed}
            >
              <ArrowUp size={16} />
              发送给助手
            </Button>
          )}
        </div>
        {!ready && (
          <p className="hint">
            请先配置 AI 连接。
            <Button variant="ghost" className="text-button" type="button" onClick={onSettings}>
              前往 AI 设置
            </Button>
          </p>
        )}
        {!document.extractionReviewed && <p className="hint">请先到「识别原稿」确认校对。</p>}
      </form>
    </section>
  )
}
