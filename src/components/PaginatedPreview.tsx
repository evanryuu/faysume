import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Files, Pencil } from 'lucide-react'
import type { ResumeDocument, Target } from '../types'
import ResumePaper from './ResumePaper'

/** Native columns use the same fragmentation rules and physical size as @page.
 * Each sheet reveals one column; the original editable document alone is printed.
 * No content is sliced into strings, so wrapping and links remain browser-native.
 */
export default function PaginatedPreview({
  document: resume,
  onEdit,
}: {
  document: ResumeDocument
  onEdit: (target: Target, value: string, before: string) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(() => sessionStorage.getItem('faysume.preview-mode') === 'edit')
  const [pages, setPages] = useState(1)
  const [scale, setScale] = useState(1)
  const canvas = useRef<HTMLDivElement>(null)
  const source = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const host = canvas.current!
    const flow = source.current!
    let active = true
    const measure = () => {
      if (!active) return
      const width = flow.getBoundingClientRect().width
      if (width) setPages(Math.max(1, Math.ceil((flow.scrollWidth - 1) / width)))
      // The canvas includes 20px of breathing room on either side of the paper.
      if (host.clientWidth)
        setScale(Math.min(1, Math.max(0.1, (host.clientWidth - 40) / ((210 * 96) / 25.4))))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(host)
    observer.observe(flow)
    void window.document.fonts.ready.then(measure)
    window.document.fonts.addEventListener('loadingdone', measure)
    return () => {
      active = false
      observer.disconnect()
      window.document.fonts.removeEventListener('loadingdone', measure)
    }
  }, [resume])

  const switchMode = (edit: boolean) => {
    setEditing(edit)
    sessionStorage.setItem('faysume.preview-mode', edit ? 'edit' : 'pages')
  }
  return (
    <>
      <div className="preview-mode-bar">
        <div className="preview-mode-switch" role="group" aria-label="预览模式">
          <button type="button" aria-pressed={!editing} onClick={() => switchMode(false)}>
            <Files size={14} />
            分页预览
          </button>
          <button type="button" aria-pressed={editing} onClick={() => switchMode(true)}>
            <Pencil size={14} />
            直接编辑
          </button>
        </div>
        <span className="preview-page-count" role="status">
          共 {pages} 页 · A4
        </span>
      </div>
      <p className="pagination-hint">
        {editing
          ? '点击文字编辑，离开后保存 · 切回分页预览查看断页'
          : '修改左侧内容，分页同步更新 · A4 / 100% / 页边距 14mm'}
      </p>
      <div
        className="paper-canvas paginated-canvas"
        ref={canvas}
        data-mode={editing ? 'edit' : 'pages'}
        style={{ '--preview-scale': scale } as CSSProperties}
      >
        <div className="pagination-measure" aria-hidden="true" inert>
          <div className="page-flow print-layout" ref={source}>
            <ResumePaper document={resume} previewCopy />
          </div>
        </div>
        <div className="paper-editor">
          <div className="editing-sheet">
            <div className="print-layout">
              <ResumePaper document={resume} onEdit={onEdit} />
            </div>
          </div>
        </div>
        {!editing && (
          <div className="preview-pages" aria-label="A4 分页预览">
            <div className="sr-only" data-testid="accessible-preview">
              <ResumePaper document={resume} previewCopy />
            </div>
            {Array.from({ length: pages }, (_, index) => (
              <div className="preview-page-group" key={index}>
                <div className="preview-page-label">
                  第 {index + 1} 页 / 共 {pages} 页
                </div>
                <div
                  className="preview-sheet"
                  data-testid="preview-page"
                  role="img"
                  aria-label={`简历第 ${index + 1} 页，共 ${pages} 页`}
                >
                  <div className="page-content" aria-hidden="true" inert>
                    <div
                      className="page-flow print-layout"
                      style={{ transform: `translateX(calc(${index} * -182mm))` }}
                    >
                      <ResumePaper document={resume} previewCopy />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="preview-footnote">导出时选择 A4、100% 缩放，关闭页眉和页脚。更改打印设置会影响分页。</p>
    </>
  )
}
