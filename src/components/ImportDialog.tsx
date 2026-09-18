import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ScanText } from 'lucide-react'
import { connectionReady, extractResume } from '../ai'
import { createResume } from '../domain'
import { insertResume } from '../db'
import type { AIConnection } from '../types'
import type { PdfImport } from '../pdf'
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
    [busy, setBusy] = useState(false),
    [reading, setReading] = useState(false),
    [pdf, setPdf] = useState<PdfImport | null>(null),
    [sendPages, setSendPages] = useState(false),
    [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const pdfInput = useRef<HTMLInputElement>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const uploadPdf = async (file?: File) => {
    if (!file || controller.current) return
    const operation = new AbortController()
    controller.current = operation
    setError('')
    setReading(true)
    try {
      const { readPdf } = await import('../pdf')
      const result = await readPdf(file, { renderPages: true, signal: operation.signal })
      operation.signal.throwIfAborted()
      setPdf(result)
      setSendPages(result.imageOnlyPages.length > 0)
    } catch (error) {
      if (!operation.signal.aborted) setError(errorMessage(error))
    } finally {
      controller.current = null
      setReading(false)
    }
  }
  const close = () => {
    controller.current?.abort()
    onClose()
  }
  const run = async () => {
    if (controller.current) return
    setError('')
    controller.current = new AbortController()
    const signal = controller.current.signal
    setBusy(true)
    try {
      const result = await extractResume(
        connection,
        [pdf?.text, input].filter(Boolean).join('\n\n'),
        (pdf ? (sendPages ? pdf.images : []) : images).map((i) => i.dataUrl),
        signal,
      )
      signal.throwIfAborted()
      const document = createResume(result.content.name ? `${result.content.name}的简历` : '导入的简历')
      document.content = result.content
      document.warnings = result.warnings
      document.extractionReviewed = false
      const sources = pdf ? pdf.images : images
      document.sourceIds = sources.map((i) => i.id)
      await insertResume(
        document,
        sources.map((image) => ({ ...image, resumeId: document.id })),
      )
      onCreated(document.id)
      notify('识别完成。请先对照原图，核对内容。')
    } catch (e) {
      if (!signal.aborted) setError(errorMessage(e))
    } finally {
      controller.current = null
      setBusy(false)
    }
  }
  const ready = connectionReady(connection)
  const needsVision = pdf ? sendPages : images.length > 0
  const locked = busy || reading
  return (
    <Modal title="导入 PDF、截图或文字，生成你的简历" onClose={close} wide>
      <div className="modal-body">
        <div className="step-line">
          <span className="active">01 导入简历</span>
          <ArrowRight size={14} />
          <span>02 识别并校对</span>
          <ArrowRight size={14} />
          <span>03 编辑与优化</span>
        </div>
        <Button
          variant="outline"
          disabled={locked || images.length > 0}
          onClick={() => pdfInput.current?.click()}
        >
          {pdf ? '更换 PDF' : '上传 PDF'}
        </Button>
        <Input
          ref={pdfInput}
          className="sr-only"
          type="file"
          accept=".pdf,application/pdf"
          aria-label="上传简历 PDF"
          disabled={locked || images.length > 0}
          onChange={(event) => {
            void uploadPdf(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        <p className="hint">
          PDF 最多 5 页、10MB，在本地解析。PDF 与截图分开导入；更换 PDF 不会清除下方手动输入的文字。
        </p>
        {pdf ? (
          <section aria-label="PDF 预览">
            <p>
              {pdf.name} · {pdf.pageCount} 页
            </p>
            <div className="image-strip">
              {pdf.images.map((image) => (
                <img
                  key={image.id}
                  src={image.dataUrl}
                  alt={image.name}
                  style={{ width: 100, height: 140, objectFit: 'contain' }}
                />
              ))}
            </div>
            <label className="field">
              <span>PDF 提取文字（可校对）</span>
              <Textarea
                rows={6}
                value={pdf.text}
                disabled={locked}
                onChange={(event) => setPdf({ ...pdf, text: event.target.value })}
              />
            </label>
            {pdf.imageOnlyPages.length > 0 && (
              <p className="notice">
                第 {pdf.imageOnlyPages.join('、')} 页文字不足，可能是扫描页，将使用图片识别，需要视觉模型。
              </p>
            )}
            <label className="check-row">
              <Checkbox
                checked={sendPages}
                disabled={locked || pdf.imageOnlyPages.length > 0}
                onCheckedChange={(value) => setSendPages(value === true)}
              />
              同时识别 PDF 页面图片（需要视觉模型）
            </label>
            <Button
              variant="ghost"
              disabled={locked}
              onClick={() => {
                setPdf(null)
                setSendPages(false)
                setError('')
              }}
            >
              移除 PDF
            </Button>
          </section>
        ) : (
          <ImagePicker images={images} onChange={setImages} notify={notify} disabled={locked} />
        )}
        <div className="or-divider">也可以粘贴已有简历</div>
        <label className="field">
          <span>简历原文</span>
          <Textarea
            rows={5}
            placeholder="粘贴你的简历文字；没有视觉模型也可以从这里开始。"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={locked}
          />
        </label>
        <p className="hint">
          点击识别后，文字和已选择识别的页面图片才会发送到你配置的 AI 服务。PDF
          原文件不上传，页面预览会随简历保存在本机。识别不自动润色。
        </p>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        {needsVision && !connection.vision && (
          <p className="notice">请先在 AI 设置中启用支持图片输入的模型，再识别这些页面。</p>
        )}
        {!ready && (
          <div className="notice">
            <ScanText size={19} />
            <div>
              先连接你的 AI 服务，再开始识别。
              <Button
                variant="ghost"
                size="layout"
                type="button"
                className="text-button"
                onClick={onSettings}
              >
                前往 AI 设置 →
              </Button>
            </div>
          </div>
        )}
        {locked ? (
          <Busy
            label={reading ? '正在本地解析 PDF，请稍候…' : '正在识别和整理，请稍候…'}
            onCancel={() => controller.current?.abort()}
          />
        ) : (
          <div className="modal-actions">
            <Button
              variant="outline"
              size="default"
              type="button"
              className="button secondary"
              onClick={close}
            >
              稍后再说
            </Button>
            <Button
              variant="default"
              size="default"
              type="button"
              className="button primary"
              disabled={
                !ready || (needsVision && !connection.vision) || (!pdf && !images.length && !input.trim())
              }
              onClick={() => void run()}
            >
              识别并生成简历 <ArrowRight size={16} />
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
