import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import ResumeMarkdown from './ResumeMarkdown'

/** Keep rendered content identical in editing, pagination and print. */
export function PaperText({
  value,
  multiline = false,
  inline = false,
  children,
}: {
  value: string
  multiline?: boolean
  inline?: boolean
  children?: ReactNode
}) {
  const Tag = multiline ? 'div' : 'span'
  return (
    <Tag
      className={`paper-editable${inline ? ' paper-editable-inline' : ''}${multiline ? ' paper-editable-markdown' : ''}`}
    >
      <Tag
        className="paper-editable-mirror"
        aria-hidden={children ? true : undefined}
        inert={children ? true : undefined}
      >
        {multiline ? <ResumeMarkdown value={value} /> : value}
      </Tag>
      {multiline && children && (
        <div className="paper-editable-source" aria-hidden="true">
          {value}
          {'\u200b'}
        </div>
      )}
      {children}
    </Tag>
  )
}

/** The mirror preserves paper typography and sizes the native input, including multiline drafts. */
export default function EditablePaperText({
  value,
  label,
  multiline = false,
  inline = false,
  placeholder = '',
  onCommit,
}: {
  value: string
  label: string
  multiline?: boolean
  inline?: boolean
  placeholder?: string
  onCommit: (value: string, before: string) => Promise<boolean>
}) {
  const [draft, setDraft] = useState(value)
  const latest = useRef(value)
  const baseline = useRef(value)
  const focused = useRef(false)
  const dirty = useRef(false)
  const pending = useRef<{ value: string; result: Promise<boolean> } | null>(null)

  useLayoutEffect(() => {
    latest.current = value
    if (!focused.current && !pending.current) setDraft(value)
  }, [value])

  const props = {
    className: 'paper-editable-control',
    'aria-label': `预览：${label}`,
    placeholder,
    title: '点击编辑 · 离开后保存 · Esc 取消',
    value: draft,
    onFocus: () => {
      focused.current = true
      baseline.current = pending.current?.value ?? latest.current
      dirty.current = false
    },
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      dirty.current = true
      setDraft(event.currentTarget.value)
    },
    onBlur: async (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      focused.current = false
      const next = event.currentTarget.value
      const changed = dirty.current && next !== baseline.current
      dirty.current = false
      if (changed) {
        const before = baseline.current
        // Serialize edits made before the previous save has reached the live query.
        const previous = pending.current
        const save = {
          value: next,
          result: previous
            ? previous.result.then((saved) => saved && onCommit(next, before))
            : onCommit(next, before),
        }
        pending.current = save
        const saved = await save.result
        if (pending.current === save) {
          pending.current = null
          if (saved) latest.current = next
          if (!focused.current) setDraft(latest.current)
        }
      } else setDraft(pending.current?.value ?? latest.current)
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) return
      if (event.key === 'Escape') {
        event.preventDefault()
        dirty.current = false
        setDraft(pending.current?.value ?? latest.current)
        event.currentTarget.blur()
      } else if (event.key === 'Enter' && (!multiline || event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        event.currentTarget.blur()
      }
    },
  }

  return (
    <PaperText value={draft || placeholder} inline={inline} multiline={multiline}>
      {multiline ? <textarea {...props} rows={1} /> : <input {...props} type="text" />}
    </PaperText>
  )
}
