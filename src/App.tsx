import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useMatchRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, FileText, FolderOpen, Settings2, ShieldCheck, Upload, Download, X } from 'lucide-react'
import { db, deleteResume, exportBackup, importBackup, insertResume } from './db'
import { createExampleResume, createResume } from './domain'
import type { AIConnection, ResumeDocument } from './types'
import ImportDialog from './components/ImportDialog'
import { Modal, downloadJson, errorMessage, type Notify } from './components/ui'

type Workspace = {
  documents: ResumeDocument[] | undefined
  connection: AIConnection
  saveConnection: (connection: AIConnection) => void
  notify: Notify
  open: (id: string) => void
  create: (example?: boolean) => Promise<void>
  setImporting: (open: boolean) => void
  setDeleting: (document: ResumeDocument | null) => void
}
const WorkspaceContext = createContext<Workspace | null>(null)
export function useWorkspace(): Workspace {
  const workspace = useContext(WorkspaceContext)
  if (!workspace) throw new Error('页面缺少工作室上下文。')
  return workspace
}

function loadConnection(): AIConnection {
  try {
    const saved = JSON.parse(localStorage.getItem('resume-studio-ai') || '{}')
    return {
      mode: saved.mode === 'direct' || (!saved.mode && saved.baseUrl) ? 'direct' : 'server',
      baseUrl: typeof saved.baseUrl === 'string' ? saved.baseUrl : '',
      model: typeof saved.model === 'string' ? saved.model : '',
      vision: saved.vision === true,
      jsonMode: saved.jsonMode === true,
      apiKey: typeof saved.apiKey === 'string' ? saved.apiKey : '',
      accessToken: '',
    }
  } catch {
    return {
      mode: 'server',
      baseUrl: '',
      model: '',
      vision: false,
      jsonMode: false,
      apiKey: '',
      accessToken: '',
    }
  }
}
export default function App(): React.JSX.Element {
  const routeNavigate = useNavigate()
  const router = useRouter()
  const matchRoute = useMatchRoute()
  const editing = Boolean(matchRoute({ to: '/resumes/$resumeId' }))
  const page = matchRoute({ to: '/settings' })
    ? 'settings'
    : matchRoute({ to: '/materials' })
      ? 'materials'
      : editing || matchRoute({ to: '/' })
        ? 'resumes'
        : null
  const [importing, setImporting] = useState(false),
    [connection, setConnection] = useState<AIConnection>(loadConnection),
    [toast, setToast] = useState<{ text: string; kind: string } | null>(null),
    [deleting, setDeleting] = useState<ResumeDocument | null>(null)
  const records = useLiveQuery(() => db.resumes.orderBy('updatedAt').reverse().toArray(), [])
  const documents = records ?? []
  useEffect(
    () =>
      router.subscribe('onBeforeNavigate', ({ pathChanged }) => {
        if (pathChanged) {
          setImporting(false)
          setDeleting(null)
        }
      }),
    [router],
  )
  const restoreInput = useRef<HTMLInputElement>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notify: Notify = useCallback((text, kind = 'success') => {
    setToast({ text, kind })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 7000)
  }, [])
  const navigate = (next: 'resumes' | 'materials' | 'settings') => {
    void routeNavigate({ to: next === 'resumes' ? '/' : next === 'materials' ? '/materials' : '/settings' })
  }
  const open = (id: string) => {
    setImporting(false)
    void routeNavigate({ to: '/resumes/$resumeId', params: { resumeId: id }, search: {} })
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
      const { accessToken: _token, ...saved } = next
      localStorage.setItem('resume-studio-ai', JSON.stringify({ ...saved, apiKey: next.apiKey || undefined }))
    } catch {
      notify('浏览器无法保存模型设置，当前页面仍可使用。', 'error')
    }
  }
  const backup = async () => {
    try {
      downloadJson(`faysume-${new Date().toISOString().slice(0, 10)}.json`, await exportBackup())
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
  return (
    <WorkspaceContext.Provider
      value={{
        documents: records,
        connection,
        saveConnection,
        notify,
        open,
        create,
        setImporting,
        setDeleting,
      }}
    >
      <div className={`app-shell ${editing ? 'editing' : ''}`}>
        <aside className="sidebar">
          <Button
            variant="ghost"
            size="layout"
            type="button"
            className="brand"
            onClick={() => navigate('resumes')}
            aria-label="Faysume 首页"
          >
            <span className="brand-mark">
              <FileText size={24} />
            </span>
            <span>Faysume</span>
          </Button>
          <div className="workspace-label">个人工作空间</div>
          <nav aria-label="主导航">
            <Button
              variant="ghost"
              size="layout"
              type="button"
              className={page === 'resumes' ? 'active' : ''}
              onClick={() => navigate('resumes')}
            >
              <FolderOpen size={19} />
              我的简历<span className="nav-count">{documents.length}</span>
            </Button>
            <Button
              variant="ghost"
              size="layout"
              type="button"
              className={page === 'materials' ? 'active' : ''}
              onClick={() => navigate('materials')}
            >
              <BookOpen size={19} />
              经历素材
            </Button>
            <Button
              variant="ghost"
              size="layout"
              type="button"
              className={page === 'settings' ? 'active' : ''}
              onClick={() => navigate('settings')}
            >
              <Settings2 size={19} />
              AI 设置
              <span
                className={`connection-dot ${connection.apiKey || connection.accessToken ? 'connected' : ''}`}
              />
            </Button>
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
            <Button
              variant="ghost"
              size="layout"
              type="button"
              className="sidebar-utility"
              onClick={() => void backup()}
            >
              <Download size={16} />
              导出全部备份
            </Button>
            <Button
              variant="ghost"
              size="layout"
              type="button"
              className="sidebar-utility"
              onClick={() => restoreInput.current?.click()}
            >
              <Upload size={16} />
              导入工作室备份
            </Button>
            <Input
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
                本地工作室<small>Faysume · 0.1</small>
              </span>
            </div>
          </div>
          <Button variant="ghost" size="layout" className="sidebar-utility github-link" asChild>
            <a
              href="https://github.com/evanryuu/faysume"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="查看 Faysume 的 GitHub 仓库（新标签页）"
              title="查看 Faysume 的 GitHub 仓库（新标签页）"
            >
              {/* GitHub mark from Simple Icons (CC0). */}
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
              <span>GitHub</span>
            </a>
          </Button>
        </aside>
        <main className="main-content">
          <Outlet />
        </main>
        {toast && (
          <div className={`toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
            <span>{toast.text}</span>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              className="icon-button"
              aria-label="关闭提示"
              onClick={() => setToast(null)}
            >
              <X size={16} />
            </Button>
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
                      await deleteResume(deleting.id)
                      setDeleting(null)
                      notify('简历已删除。')
                    } catch (e) {
                      notify(errorMessage(e), 'error')
                    }
                  }}
                >
                  确认删除
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </WorkspaceContext.Provider>
  )
}
