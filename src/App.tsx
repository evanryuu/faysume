import { useCallback, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  FileText,
  FolderOpen,
  ImagePlus,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Download,
  X,
} from 'lucide-react'
import { db, deleteResume, exportBackup, importBackup, insertResume } from './db'
import { createExampleResume, createResume } from './domain'
import type { AIConnection, ResumeDocument } from './types'
import Editor from './components/Editor'
import ImportDialog from './components/ImportDialog'
import Settings from './components/Settings'
import Materials from './components/Materials'
import ResumePaper from './components/ResumePaper'
import { Modal, downloadJson, errorMessage, type Notify } from './components/ui'

function loadConnection(): AIConnection {
  try {
    const saved = JSON.parse(localStorage.getItem('resume-studio-ai') || '{}')
    return {
      baseUrl: typeof saved.baseUrl === 'string' ? saved.baseUrl : '',
      model: typeof saved.model === 'string' ? saved.model : '',
      vision: saved.vision === true,
      jsonMode: saved.jsonMode === true,
      apiKey: '',
    }
  } catch {
    return { baseUrl: '', model: '', vision: false, jsonMode: false, apiKey: '' }
  }
}
export default function App() {
  const [page, setPage] = useState<'resumes' | 'materials' | 'settings'>('resumes'),
    [selected, setSelected] = useState<string | null>(null),
    [importing, setImporting] = useState(false),
    [connection, setConnection] = useState<AIConnection>(loadConnection),
    [search, setSearch] = useState(''),
    [toast, setToast] = useState<{ text: string; kind: string } | null>(null),
    [deleting, setDeleting] = useState<ResumeDocument | null>(null)
  const documents = useLiveQuery(() => db.resumes.orderBy('updatedAt').reverse().toArray(), [], [])
  const selectedDocument = documents.find((d) => d.id === selected)
  const restoreInput = useRef<HTMLInputElement>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notify: Notify = useCallback((text, kind = 'success') => {
    setToast({ text, kind })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 7000)
  }, [])
  const navigate = (next: typeof page) => {
    setPage(next)
    setSelected(null)
  }
  const open = (id: string) => {
    setSelected(id)
    setPage('resumes')
    setImporting(false)
  }
  const create = async (example = false) => {
    try {
      const document = example ? createExampleResume() : createResume()
      await insertResume(document)
      open(document.id)
    } catch (e) {
      notify(errorMessage(e), 'error')
    }
  }
  const saveConnection = (next: AIConnection) => {
    setConnection(next)
    try {
      const { apiKey: _key, ...nonSecret } = next
      localStorage.setItem('resume-studio-ai', JSON.stringify(nonSecret))
    } catch {
      notify('浏览器无法保存模型设置，当前页面仍可使用。', 'error')
    }
  }
  const backup = async () => {
    try {
      downloadJson(`resume-studio-${new Date().toISOString().slice(0, 10)}.json`, await exportBackup())
      notify('备份已导出，不含 API Key。')
    } catch (e) {
      notify(errorMessage(e), 'error')
    }
  }
  const restore = async (file?: File) => {
    if (!file) return
    try {
      if (file.size > 150 * 1024 * 1024) throw new Error('备份文件不能超过 150MB。')
      await importBackup(await file.text())
      notify('备份已作为独立副本导入，现有简历未被覆盖。')
    } catch (e) {
      notify(`导入失败：${errorMessage(e)}`, 'error')
    }
  }
  const visible = documents.filter((d) =>
    `${d.name} ${d.content.name} ${d.targetRole}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  )
  return (
    <div className={`app-shell ${selectedDocument && page === 'resumes' ? 'editing' : ''}`}>
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate('resumes')} aria-label="Resume Studio 首页">
          <span className="brand-mark">
            <FileText size={24} />
          </span>
          <span>
            resume<span className="brand-studio">studio.</span>
          </span>
        </button>
        <div className="workspace-label">个人工作空间</div>
        <nav aria-label="主导航">
          <button className={page === 'resumes' ? 'active' : ''} onClick={() => navigate('resumes')}>
            <FolderOpen size={19} />
            我的简历<span className="nav-count">{documents.length}</span>
          </button>
          <button className={page === 'materials' ? 'active' : ''} onClick={() => navigate('materials')}>
            <BookOpen size={19} />
            经历素材
          </button>
          <button className={page === 'settings' ? 'active' : ''} onClick={() => navigate('settings')}>
            <Settings2 size={19} />
            AI 设置
            <span className={`connection-dot ${connection.apiKey ? 'connected' : ''}`} />
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <ShieldCheck size={20} />
            <strong>你的经历，只属于你</strong>
            <p>
              本地保存，无需注册。
              <br />
              AI 服务由你自己选择。
            </p>
          </div>
          <button className="sidebar-utility" onClick={() => void backup()}>
            <Download size={16} />
            导出全部备份
          </button>
          <button className="sidebar-utility" onClick={() => restoreInput.current?.click()}>
            <Upload size={16} />
            导入工作室备份
          </button>
          <input
            ref={restoreInput}
            className="sr-only"
            type="file"
            accept=".json"
            onChange={(e) => {
              void restore(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <div className="sidebar-version">
            <span className="small-avatar">我</span>
            <span>
              本地工作室<small>Resume Studio · 0.1</small>
            </span>
          </div>
        </div>
      </aside>
      <main className="main-content">
        {page === 'settings' ? (
          <Settings connection={connection} onChange={saveConnection} notify={notify} />
        ) : page === 'materials' ? (
          <Materials notify={notify} />
        ) : selectedDocument ? (
          <Editor
            key={selectedDocument.id}
            document={selectedDocument}
            connection={connection}
            onBack={() => setSelected(null)}
            onOpen={open}
            onSettings={() => navigate('settings')}
            notify={notify}
          />
        ) : (
          <div className="page dashboard">
            <header className="dashboard-top">
              <span>
                工作空间 <span className="crumb-slash">/</span> 我的简历
              </span>
              <span className="local-status">
                <span />
                本地优先，安心记录
              </span>
            </header>
            <section className="hero">
              <div className="hero-copy">
                <span className="hero-badge">
                  <Sparkles size={14} />让 AI 帮你，看见经历的价值
                </span>
                <h1>
                  把经历，写成
                  <br />
                  <em>下一次机会。</em>
                </h1>
                <p>
                  从一张简历截图开始。整理真实经历，发现你的亮点，
                  <br className="desktop-break" />
                  为每一个心动的岗位，准备更合适的表达。
                </p>
                <div className="hero-actions">
                  <button className="button primary large" onClick={() => setImporting(true)}>
                    <ImagePlus size={18} />
                    上传简历截图
                    <ArrowRight size={17} />
                  </button>
                  <button className="text-button" onClick={() => void create()}>
                    空白创建 <Plus size={16} />
                  </button>
                </div>
                <div className="hero-note">
                  <Check size={14} />
                  可编辑内容
                  <Check size={14} />
                  自由切换模板
                  <Check size={14} />
                  AI 修改可撤回
                </div>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="art-grid" />
                <div className="art-paper back">
                  <span className="art-kicker">YOUR EXPERIENCE</span>
                  <div className="art-line short" />
                  <div className="art-line" />
                  <div className="art-line" />
                </div>
                <div className="art-paper front">
                  <div className="art-monogram">
                    YOUR NEXT
                    <br />
                    <span>CHAPTER.</span>
                  </div>
                  <div className="art-rule" />
                  <span className="art-kicker">EXPERIENCE</span>
                  <div className="art-line medium" />
                  <div className="art-line" />
                  <div className="art-line" />
                  <div className="art-line short" />
                  <span className="art-kicker">A STORY WORTH TELLING</span>
                  <div className="art-line" />
                  <div className="art-line medium" />
                </div>
                <div className="art-insight">
                  <span>
                    <Sparkles size={17} />
                  </span>
                  <div>
                    <strong>让亮点，被看见</strong>
                    <small>真实经历，更好的表达</small>
                  </div>
                  <Check size={17} />
                </div>
                <div className="art-caption">YOUR STORY. YOUR WAY.</div>
              </div>
            </section>
            <section className="resume-library">
              <div className="library-heading">
                <div>
                  <h2>
                    我的简历 <span>{documents.length}</span>
                  </h2>
                  <p>一份经历，可以有很多种可能。</p>
                </div>
                <div className="library-tools">
                  <label className="search">
                    <Search size={16} />
                    <input
                      aria-label="搜索简历"
                      placeholder="搜索简历"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <button className="button secondary" onClick={() => void create()}>
                    <Plus size={16} />
                    新建简历
                  </button>
                </div>
              </div>
              <div className="resume-grid">
                <button className="new-resume-card" onClick={() => setImporting(true)}>
                  <span className="new-card-icon">
                    <Plus size={24} />
                  </span>
                  <strong>你的下一份简历</strong>
                  <span>上传截图，交给 AI 整理</span>
                  <span className="new-card-link">
                    开始创建 <ArrowUpRight size={16} />
                  </span>
                </button>
                {visible.map((document) => (
                  <article className="resume-card" key={document.id}>
                    <button
                      className="resume-card-preview"
                      aria-label={`打开 ${document.name}`}
                      onClick={() => open(document.id)}
                    >
                      <div className="miniature-container">
                        <ResumePaper document={document} miniature />
                      </div>
                      <span className="card-edit-badge">
                        打开编辑 <ArrowUpRight size={13} />
                      </span>
                    </button>
                    <div className="resume-card-info">
                      <div>
                        <h3>{document.name}</h3>
                        <p>
                          {document.targetRole ||
                            (document.name.includes('虚构') ? '示例内容 · 可自由编辑' : '通用简历')}
                          <span>·</span>
                          {new Date(document.updatedAt).toLocaleDateString('zh-CN')}
                        </p>
                      </div>
                      <button
                        className="icon-button"
                        aria-label={`删除 ${document.name}`}
                        onClick={() => setDeleting(document)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {!documents.length && (
                <div className="starter-note">
                  <span>还没有准备好自己的截图？</span>
                  <button className="text-button" onClick={() => void create(true)}>
                    用虚构示例体验编辑器 <ArrowRight size={14} />
                  </button>
                </div>
              )}
              {search && !visible.length && <p className="muted">没有找到匹配的简历。</p>}
            </section>
            <div className="workflow-strip">
              <div>
                <span>01</span>
                <strong>导入真实经历</strong>
                <small>截图、文字，轻松开始</small>
              </div>
              <div>
                <span>02</span>
                <strong>发现你的亮点</strong>
                <small>有依据的建议，由你决定</small>
              </div>
              <div>
                <span>03</span>
                <strong>为机会量身定制</strong>
                <small>结合 JD、语言与招聘市场</small>
              </div>
            </div>
          </div>
        )}
      </main>
      {toast && (
        <div className={`toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          <span>{toast.text}</span>
          <button className="icon-button" aria-label="关闭提示" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      {importing && (
        <ImportDialog
          connection={connection}
          onClose={() => setImporting(false)}
          onCreated={open}
          notify={notify}
          onSettings={() => {
            setImporting(false)
            navigate('settings')
          }}
        />
      )}
      {deleting && (
        <Modal title="删除这份简历？" onClose={() => setDeleting(null)}>
          <div className="modal-body">
            <p>「{deleting.name}」及其修改记录将被删除。建议先导出备份。</p>
            <div className="modal-actions">
              <button className="button secondary" onClick={() => setDeleting(null)}>
                取消
              </button>
              <button
                className="button danger"
                onClick={async () => {
                  try {
                    await deleteResume(deleting.id)
                    setDeleting(null)
                    notify('简历已删除。')
                  } catch (e) {
                    notify(errorMessage(e), 'error')
                  }
                }}
              >
                确认删除
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
