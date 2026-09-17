import { useRef, useState } from 'react'
import { ArrowRight, ScanText } from 'lucide-react'
import { extractResume } from '../ai'
import { createResume } from '../domain'
import { insertResume } from '../db'
import type { AIConnection } from '../types'
import { Modal, ImagePicker, Busy, errorMessage, type ImageInput, type Notify } from './ui'

export default function ImportDialog({
  connection,
  onClose,
  onCreated,
  notify,
  onSettings,
}: {
  connection: AIConnection
  onClose: () => void
  onCreated: (id: string) => void
  notify: Notify
  onSettings: () => void
}) {
  const [images, setImages] = useState<ImageInput[]>([]),
    [input, setInput] = useState(''),
    [busy, setBusy] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const close = () => {
    controller.current?.abort()
    onClose()
  }
  const run = async () => {
    controller.current = new AbortController()
    const signal = controller.current.signal
    setBusy(true)
    try {
      const result = await extractResume(
        connection,
        input,
        images.map((i) => i.dataUrl),
        signal,
      )
      signal.throwIfAborted()
      const document = createResume(result.content.name ? `${result.content.name}的简历` : '导入的简历')
      document.content = result.content
      document.warnings = result.warnings
      document.extractionReviewed = false
      document.sourceIds = images.map((i) => i.id)
      await insertResume(
        document,
        images.map((image) => ({ ...image, resumeId: document.id })),
      )
      onCreated(document.id)
      notify('识别完成。请先对照原图，核对内容。')
    } catch (e) {
      if (!signal.aborted) notify(errorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }
  const ready = connection.apiKey && connection.baseUrl && connection.model
  return (
    <Modal title="从截图开始，生成你的简历" onClose={close} wide>
      <div className="modal-body">
        <div className="step-line">
          <span className="active">01 上传截图</span>
          <ArrowRight size={14} />
          <span>02 识别并校对</span>
          <ArrowRight size={14} />
          <span>03 编辑与优化</span>
        </div>
        <ImagePicker images={images} onChange={setImages} notify={notify} disabled={busy} />
        <div className="or-divider">也可以粘贴已有简历</div>
        <label className="field">
          <span>简历原文</span>
          <textarea
            rows={5}
            placeholder="粘贴你的简历文字；没有视觉模型也可以从这里开始。"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
          />
        </label>
        <p className="hint">
          点击识别后，所选截图与文字将发送到你配置的 AI 服务。识别会保留原文，不自动润色。
        </p>
        {!ready && (
          <div className="notice">
            <ScanText size={19} />
            <div>
              先连接你的 AI 服务，再开始识别。
              <button className="text-button" onClick={onSettings}>
                前往 AI 设置 →
              </button>
            </div>
          </div>
        )}
        {busy ? (
          <Busy label="正在识别和整理，请稍候…" onCancel={() => controller.current?.abort()} />
        ) : (
          <div className="modal-actions">
            <button className="button secondary" onClick={close}>
              稍后再说
            </button>
            <button
              className="button primary"
              disabled={!ready || (!images.length && !input.trim())}
              onClick={() => void run()}
            >
              识别并生成简历 <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
