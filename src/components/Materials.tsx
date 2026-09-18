import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, FileText, Upload, Pencil, Trash2, BookOpen } from 'lucide-react'
import { db } from '../db'
import { uid } from '../domain'
import type { Material } from '../types'
import { Busy, Modal, errorMessage, type Notify } from './ui'

export default function Materials({ notify }: { notify: Notify }) {
  const materials = useLiveQuery(() => db.materials.orderBy('updatedAt').reverse().toArray(), [], [])
  const [editing, setEditing] = useState<Material | null>(null),
    [deleting, setDeleting] = useState<Material | null>(null),
    [reading, setReading] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const create = (title = '', content = '') => {
    const now = new Date().toISOString()
    setEditing({ id: uid(), title, content, createdAt: now, updatedAt: now })
  }
  const upload = async (file?: File) => {
    if (!file || controller.current) return
    const operation = new AbortController()
    controller.current = operation
    setReading(true)
    try {
      let content: string
      if (/\.pdf$/i.test(file.name)) {
        const { readPdf } = await import('../pdf')
        const pdf = await readPdf(file, { signal: operation.signal })
        if (pdf.imageOnlyPages.length)
          throw new Error(
            `第 ${pdf.imageOnlyPages.join('、')} 页文字不足，可能是扫描页。经历素材暂不支持扫描 PDF，请先转成文字后导入。`,
          )
        content = pdf.text
      } else {
        if (!/\.(txt|md)$/i.test(file.name) || file.size > 2 * 1024 * 1024)
          throw new Error('支持 2MB 以内的 TXT / Markdown，或 10MB、5 页以内的文字版 PDF。')
        content = await file.text()
      }
      operation.signal.throwIfAborted()
      create(file.name.replace(/\.[^.]+$/, ''), content)
    } catch (e) {
      if (!operation.signal.aborted) notify(errorMessage(e), 'error')
    } finally {
      controller.current = null
      setReading(false)
    }
  }
  const save = async () => {
    if (!editing?.title.trim() || !editing.content.trim()) return
    try {
      await db.materials.put({ ...editing, title: editing.title.trim(), updatedAt: new Date().toISOString() })
      setEditing(null)
      notify('经历素材已保存。')
    } catch (e) {
      notify(errorMessage(e), 'error')
    }
  }
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR EXPERIENCE LIBRARY</div>
          <h1>每一段经历，都有价值。</h1>
          <p className="page-subtitle">先完整记录，再为不同机会挑选。这里不受一页简历限制。</p>
        </div>
        <Button
          variant="default"
          size="default"
          type="button"
          className="button primary"
          disabled={reading}
          onClick={() => create()}
        >
          <Plus size={17} />
          添加经历
        </Button>
      </div>
      <div className="material-tip">
        <BookOpen size={24} />
        <div>
          <strong>记录你做过什么，更记录你为什么这样做。</strong>
          <p>
            公司背景、项目目标、你的贡献、采取的行动、结果与证据，都可以保存在这里。分析简历时，由你选择需要参考的素材。
          </p>
        </div>
        <Button
          variant="outline"
          size="default"
          type="button"
          className="button secondary"
          disabled={reading}
          onClick={() => input.current?.click()}
        >
          <Upload size={16} />
          导入 PDF / 文本
        </Button>
        <Input
          ref={input}
          className="sr-only"
          type="file"
          accept=".txt,.md,.pdf"
          aria-label="上传经历素材"
          disabled={reading}
          onChange={(e) => {
            void upload(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      <p className="hint">
        支持 TXT / Markdown（2MB 以内）和文字版 PDF（10MB、5 页以内）。在本地解析，保存前可校对。
      </p>
      {reading && <Busy label="正在读取文件…" onCancel={() => controller.current?.abort()} />}
      <div className="material-grid">
        {materials.map((material) => (
          <article className="surface material-card" key={material.id}>
            <FileText size={23} />
            <h3>{material.title}</h3>
            <p>{material.content}</p>
            <div className="card-footer">
              <span>{new Date(material.updatedAt).toLocaleDateString('zh-CN')}</span>
              <div>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  className="icon-button"
                  aria-label={`编辑 ${material.title}`}
                  onClick={() => setEditing(material)}
                >
                  <Pencil size={16} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  className="icon-button"
                  aria-label={`删除素材 ${material.title}`}
                  onClick={() => setDeleting(material)}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!materials.length && (
        <div className="empty-state">
          <BookOpen size={35} />
          <h3>为下一次机会，积累真实素材</h3>
          <p>从一段工作经历或一个值得讲述的项目开始。</p>
          <Button
            variant="outline"
            size="default"
            type="button"
            className="button secondary"
            onClick={() => create()}
          >
            添加第一段经历
          </Button>
        </div>
      )}
      {editing && (
        <Modal title="记录经历素材" onClose={() => setEditing(null)} wide>
          <div className="modal-body">
            <label className="field">
              <span>素材标题</span>
              <Input
                value={editing.title}
                placeholder="例如：支付平台性能优化项目"
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
            </label>
            <label className="field">
              <span>完整经历与证据</span>
              <Textarea
                rows={12}
                value={editing.content}
                placeholder="背景与目标：\n我的角色：\n具体行动：\n结果与证据：\n待补充的信息："
                onChange={(e) => setEditing({ ...editing, content: e.target.value })}
              />
            </label>
            <div className="modal-actions">
              <Button
                variant="default"
                size="default"
                type="button"
                className="button primary"
                disabled={!editing.title.trim() || !editing.content.trim()}
                onClick={() => void save()}
              >
                保存素材
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {deleting && (
        <Modal title="删除经历素材？" onClose={() => setDeleting(null)}>
          <div className="modal-body">
            <p>将删除「{deleting.title}」。已有简历的内容不会改变。</p>
            <div className="modal-actions">
              <Button
                variant="outline"
                size="default"
                type="button"
                className="button secondary"
                onClick={() => setDeleting(null)}
              >
                取消
              </Button>
              <Button
                variant="destructive"
                size="default"
                type="button"
                className="button danger"
                onClick={async () => {
                  try {
                    await db.materials.delete(deleting.id)
                    setDeleting(null)
                  } catch (e) {
                    notify(errorMessage(e), 'error')
                  }
                }}
              >
                删除
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
