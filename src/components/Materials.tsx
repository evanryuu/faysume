import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, FileText, Upload, Pencil, Trash2, BookOpen } from 'lucide-react'
import { db } from '../db'
import { uid } from '../domain'
import type { Material } from '../types'
import { Modal, errorMessage, type Notify } from './ui'

export default function Materials({ notify }: { notify: Notify }) {
  const materials = useLiveQuery(() => db.materials.orderBy('updatedAt').reverse().toArray(), [], [])
  const [editing, setEditing] = useState<Material | null>(null),
    [deleting, setDeleting] = useState<Material | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const create = (title = '', content = '') => {
    const now = new Date().toISOString()
    setEditing({ id: uid(), title, content, createdAt: now, updatedAt: now })
  }
  const upload = async (file?: File) => {
    if (!file) return
    try {
      if (!/\.(txt|md)$/i.test(file.name) || file.size > 2 * 1024 * 1024)
        throw new Error('首版支持 2MB 以内的 TXT / Markdown。其他格式请先复制文字。')
      create(file.name.replace(/\.[^.]+$/, ''), await file.text())
    } catch (e) {
      notify(errorMessage(e), 'error')
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
        <button className="button primary" onClick={() => create()}>
          <Plus size={17} />
          添加经历
        </button>
      </div>
      <div className="material-tip">
        <BookOpen size={24} />
        <div>
          <strong>记录你做过什么，更记录你为什么这样做。</strong>
          <p>
            公司背景、项目目标、你的贡献、采取的行动、结果与证据，都可以保存在这里。分析简历时，由你选择需要参考的素材。
          </p>
        </div>
        <button className="button secondary" onClick={() => input.current?.click()}>
          <Upload size={16} />
          导入文本
        </button>
        <input
          ref={input}
          className="sr-only"
          type="file"
          accept=".txt,.md"
          onChange={(e) => {
            void upload(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      <div className="material-grid">
        {materials.map((material) => (
          <article className="surface material-card" key={material.id}>
            <FileText size={23} />
            <h3>{material.title}</h3>
            <p>{material.content}</p>
            <div className="card-footer">
              <span>{new Date(material.updatedAt).toLocaleDateString('zh-CN')}</span>
              <div>
                <button
                  className="icon-button"
                  aria-label={`编辑 ${material.title}`}
                  onClick={() => setEditing(material)}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`删除素材 ${material.title}`}
                  onClick={() => setDeleting(material)}
                >
                  <Trash2 size={16} />
                </button>
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
          <button className="button secondary" onClick={() => create()}>
            添加第一段经历
          </button>
        </div>
      )}
      {editing && (
        <Modal title="记录经历素材" onClose={() => setEditing(null)} wide>
          <div className="modal-body">
            <label className="field">
              <span>素材标题</span>
              <input
                value={editing.title}
                placeholder="例如：支付平台性能优化项目"
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
            </label>
            <label className="field">
              <span>完整经历与证据</span>
              <textarea
                rows={12}
                value={editing.content}
                placeholder="背景与目标：\n我的角色：\n具体行动：\n结果与证据：\n待补充的信息："
                onChange={(e) => setEditing({ ...editing, content: e.target.value })}
              />
            </label>
            <div className="modal-actions">
              <button
                className="button primary"
                disabled={!editing.title.trim() || !editing.content.trim()}
                onClick={() => void save()}
              >
                保存素材
              </button>
            </div>
          </div>
        </Modal>
      )}
      {deleting && (
        <Modal title="删除经历素材？" onClose={() => setDeleting(null)}>
          <div className="modal-body">
            <p>将删除「{deleting.title}」。已有简历的内容不会改变。</p>
            <div className="modal-actions">
              <button className="button secondary" onClick={() => setDeleting(null)}>
                取消
              </button>
              <button
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
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
