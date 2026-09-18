import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { NativeSelectOption, NativeSelect } from '@/components/ui/native-select'
import { useRef, useState } from 'react'
import { extractJob } from '../ai'
import { cloneResume } from '../domain'
import { db, insertResume } from '../db'
import type { AIConnection, ResumeDocument } from '../types'
import { Modal, ImagePicker, Busy, errorMessage, type ImageInput, type Notify } from './ui'

export default function JobDialog({
  document,
  connection,
  onClose,
  onCreated,
  notify,
}: {
  document: ResumeDocument
  connection: AIConnection
  onClose: () => void
  onCreated: (id: string) => void
  notify: Notify
}) {
  const [images, setImages] = useState<ImageInput[]>([]),
    [text, setText] = useState(document.jobDescription),
    [role, setRole] = useState(document.targetRole),
    [market, setMarket] = useState(document.market),
    [locale, setLocale] = useState(document.locale),
    [warnings, setWarnings] = useState<string[]>([]),
    [busy, setBusy] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const close = () => {
    controller.current?.abort()
    onClose()
  }
  const extract = async () => {
    controller.current = new AbortController()
    const signal = controller.current.signal
    setBusy(true)
    try {
      const result = await extractJob(
        connection,
        text,
        images.map((i) => i.dataUrl),
        signal,
      )
      signal.throwIfAborted()
      setText(result.text)
      setWarnings(result.warnings)
    } catch (e) {
      if (!signal.aborted) notify(errorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }
  const create = async () => {
    setBusy(true)
    try {
      const current = await db.resumes.get(document.id)
      if (!current) throw new Error('原简历已被删除。')
      const copy = cloneResume(current, `${document.name} · ${role.trim() || '岗位定制'}`)
      copy.jobDescription = text
      copy.targetRole = role
      copy.market = market
      copy.locale = locale
      await insertResume(copy)
      onCreated(copy.id)
      notify('岗位版本已创建。点击 AI 分析，查看针对性修改建议。')
    } catch (e) {
      notify(errorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="为一个具体机会，准备一份简历" onClose={close} wide>
      <div className="modal-body">
        <p className="muted">上传 JD 截图或粘贴职位描述。校对后创建独立版本，原简历保持完整。</p>
        <ImagePicker images={images} onChange={setImages} notify={notify} disabled={busy} />
        {images.length > 0 && (
          <Button
            variant="outline"
            size="default"
            type="button"
            className="button secondary full-width"
            disabled={busy}
            onClick={() => void extract()}
          >
            发送到配置的 AI，识别 JD 截图
          </Button>
        )}
        {warnings.length > 0 && <div className="notice warning">{warnings.join('；')}</div>}
        <label className="field">
          <span>岗位描述（请校对后再创建）</span>
          <Textarea
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
            placeholder="职责、任职要求、招聘地区…"
          />
        </label>
        <div className="field-grid">
          <label className="field">
            <span>目标岗位</span>
            <Input value={role} onChange={(e) => setRole(e.target.value)} />
          </label>
          <label className="field">
            <span>招聘市场</span>
            <Input
              value={market}
              onChange={(e) => setMarket(e.target.value)}
              placeholder="例如：中国、新加坡、美国"
            />
          </label>
          <label className="field">
            <span>简历语言</span>
            <NativeSelect value={locale} onChange={(e) => setLocale(e.target.value)}>
              <NativeSelectOption value="zh-CN">简体中文</NativeSelectOption>
              <NativeSelectOption value="en">English</NativeSelectOption>
              <NativeSelectOption value="ja">日本語</NativeSelectOption>
            </NativeSelect>
          </label>
        </div>
        <p className="hint">
          语言与市场将用于 AI 建议；创建版本不会自动改写内容。地区建议需要你结合实际招聘要求判断。
        </p>
        {busy ? (
          <Busy label="正在处理…" onCancel={() => controller.current?.abort()} />
        ) : (
          <div className="modal-actions">
            <Button
              variant="default"
              size="default"
              type="button"
              className="button primary"
              disabled={!text.trim()}
              onClick={() => void create()}
            >
              已校对，创建岗位版本
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
