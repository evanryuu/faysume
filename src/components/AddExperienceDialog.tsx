import { useEffect, useRef, useState } from 'react'
import { Check, Sparkles, Trash2 } from 'lucide-react'
import { connectionReady, extractExperiences, MAX_EXPERIENCE_INPUT } from '../ai'
import { appendExperiences } from '../domain'
import { mutateResume } from '../db'
import type { AIConnection, ExperienceDraft, ItemField, ResumeDocument } from '../types'
import { Busy, Modal, errorMessage, type Notify } from './ui'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { NativeSelect, NativeSelectOption } from './ui/native-select'
import { Textarea } from './ui/textarea'

export default function AddExperienceDialog({
  document,
  connection,
  onClose,
  onSettings,
  notify,
}: {
  document: ResumeDocument
  connection: AIConnection
  onClose: () => void
  onSettings: () => void
  notify: Notify
}) {
  const [input, setInput] = useState('')
  const [entries, setEntries] = useState<ExperienceDraft[] | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const savingRef = useRef(false)
  useEffect(() => () => controller.current?.abort(), [])
  const cancel = () => {
    controller.current?.abort()
    controller.current = null
    setBusy(false)
  }
  const close = () => {
    if (savingRef.current) return
    cancel()
    onClose()
  }
  const recognize = async () => {
    if (controller.current) return
    const request = new AbortController()
    controller.current = request
    setBusy(true)
    setError('')
    try {
      const result = await extractExperiences(connection, input, request.signal)
      request.signal.throwIfAborted()
      setEntries(
        result.entries.map((entry) => ({
          ...entry,
          sectionId: document.content.sections.find((section) => section.kind === entry.kind)?.id,
        })),
      )
      setWarnings(result.warnings)
    } catch (e) {
      if (!request.signal.aborted) setError(errorMessage(e))
    } finally {
      if (controller.current === request) {
        controller.current = null
        setBusy(false)
      }
    }
  }
  const update = (index: number, patch: Partial<ExperienceDraft>) =>
    setEntries((previous) => previous!.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)))
  const updateField = (index: number, field: ItemField, value: string) =>
    setEntries((previous) =>
      previous!.map((entry, i) =>
        i === index ? { ...entry, item: { ...entry.item, [field]: value } } : entry,
      ),
    )
  const save = async () => {
    if (savingRef.current || !entries?.length) return
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      await mutateResume(document.id, (current) => appendExperiences(current, entries))
      notify(`已添加 ${entries.length} 段经历，可在修改记录中撤回。`)
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }
  const ready = connectionReady(connection)
  return (
    <Modal title="AI 添加经历" onClose={close} wide>
      <div className="modal-body experience-dialog">
        <div className="step-line" aria-label={entries ? '第 2 步：核对并添加' : '第 1 步：粘贴经历'}>
          <span className={!entries ? 'active' : ''}>01 粘贴经历</span>
          <span aria-hidden="true">→</span>
          <span className={entries ? 'active' : ''}>02 核对并添加</span>
        </div>
        {!entries ? (
          <>
            <p className="experience-intro">
              支持直接粘贴整段 AI 整理稿、Markdown 或多段经历。AI
              会优先提取可用于简历的表述，过滤分析和写作建议，并整理公司、职位、时间与经历描述。
            </p>
            {!ready && (
              <div className="notice warning">
                <span>请先配置 AI 连接，再识别经历。</span>
                <Button variant="ghost" className="text-button" onClick={onSettings}>
                  前往 AI 设置
                </Button>
              </div>
            )}
            <label className="field">
              <span>经历原文</span>
              <Textarea
                autoFocus
                className="experience-source"
                rows={10}
                value={input}
                disabled={busy}
                maxLength={MAX_EXPERIENCE_INPUT}
                onChange={(event) => setInput(event.target.value)}
                placeholder={
                  '直接粘贴 AI 整理的工作总结、项目介绍或简历表述，无需先删除标题、表格和建议。\n\n例如：## 可以直接使用的简历表述\n### 工作经历\n**前端工程师**\n- 建设 AI 对话和知识库能力……'
                }
              />
            </label>
            <p className="hint experience-input-hint">
              <span>点击识别后，仅将这段文字发送给你配置的 AI 服务。</span>
              <span>{input.length.toLocaleString()} / 30,000</span>
            </p>
          </>
        ) : (
          <>
            <p className="experience-intro">
              识别到 {entries.length} 段经历。核对内容和添加位置后，确认加入简历。
            </p>
            {warnings.length > 0 && (
              <div className="notice warning">
                <div>
                  <strong>这些内容需要核对</strong>
                  <ul>
                    {warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <fieldset className="experience-review" disabled={saving}>
              {entries.map((entry, index) => (
                <article className="item-editor" key={entry.item.id} aria-label={`第 ${index + 1} 段经历`}>
                  <div className="item-label">
                    <strong>
                      {String(index + 1).padStart(2, '0')} / {entry.item.title || '新经历'}
                    </strong>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="icon-button"
                      aria-label={`移除第 ${index + 1} 段经历`}
                      onClick={() => setEntries(entries.filter((_, i) => i !== index))}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                  <div className="field-grid">
                    <label className="field">
                      <span>经历类型</span>
                      <NativeSelect
                        value={entry.kind}
                        onChange={(event) => {
                          const kind = event.target.value as ExperienceDraft['kind']
                          update(index, {
                            kind,
                            sectionId: document.content.sections.find((section) => section.kind === kind)?.id,
                          })
                        }}
                      >
                        <NativeSelectOption value="work">工作经历</NativeSelectOption>
                        <NativeSelectOption value="project">项目经历</NativeSelectOption>
                      </NativeSelect>
                    </label>
                    <label className="field">
                      <span>添加到</span>
                      <NativeSelect
                        value={entry.sectionId ?? ''}
                        onChange={(event) => update(index, { sectionId: event.target.value || undefined })}
                      >
                        {document.content.sections
                          .filter((section) => section.kind === entry.kind)
                          .map((section) => (
                            <NativeSelectOption key={section.id} value={section.id}>
                              {section.title || '未命名区块'}
                            </NativeSelectOption>
                          ))}
                        {entry.sectionId &&
                          !document.content.sections.some(
                            (section) => section.id === entry.sectionId && section.kind === entry.kind,
                          ) && (
                            <NativeSelectOption value={entry.sectionId} disabled>
                              原区块已变化，请重新选择
                            </NativeSelectOption>
                          )}
                        <NativeSelectOption value="">
                          新建{entry.kind === 'work' ? '工作经历' : '项目经历'}区块
                        </NativeSelectOption>
                      </NativeSelect>
                    </label>
                    {(
                      [
                        ['title', entry.kind === 'work' ? '职位' : '项目名称'],
                        ['organization', '公司 / 组织'],
                        ['startDate', '开始时间'],
                        ['endDate', '结束时间'],
                        ['location', '地点'],
                      ] as [ItemField, string][]
                    ).map(([field, label]) => (
                      <label className="field" key={field}>
                        <span>{label}</span>
                        <Input
                          value={entry.item[field]}
                          onChange={(event) => updateField(index, field, event.target.value)}
                        />
                      </label>
                    ))}
                    <label className="field full">
                      <span>经历描述</span>
                      <Textarea
                        rows={5}
                        value={entry.item.description}
                        onChange={(event) => updateField(index, 'description', event.target.value)}
                      />
                    </label>
                  </div>
                </article>
              ))}
            </fieldset>
            {!entries.length && <p className="muted">已移除全部经历，可以返回修改原文后重新识别。</p>}
            <p className="hint">确认后追加到所选区块，保留已有内容。添加后仍可编辑，也可在修改记录中撤回。</p>
          </>
        )}
        {error && (
          <div className="notice warning" role="alert">
            {error}
          </div>
        )}
        {busy ? (
          <Busy label="正在识别经历…" onCancel={cancel} />
        ) : (
          <div className="modal-actions">
            <Button
              variant="outline"
              className="button secondary"
              disabled={saving}
              onClick={() => {
                if (entries) {
                  setEntries(null)
                  setError('')
                } else close()
              }}
            >
              {entries ? '返回修改原文' : '取消'}
            </Button>
            <Button
              className="button primary"
              disabled={entries ? !entries.length || saving : !ready || !input.trim()}
              onClick={() => void (entries ? save() : recognize())}
            >
              {entries ? <Check size={16} /> : <Sparkles size={16} />}
              {entries ? (saving ? '正在添加…' : `确认添加 ${entries.length} 段经历`) : '识别经历'}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
