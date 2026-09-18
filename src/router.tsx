import {
  createRootRoute,
  createRoute,
  createRouter,
  stripSearchParams,
  useNavigate,
} from '@tanstack/react-router'
import { z } from 'zod'
import App, { useWorkspace } from './App'
import ResumeList from './components/ResumeList'
import Editor from './components/Editor'
import Materials from './components/Materials'
import Settings from './components/Settings'
import { Button } from './components/ui/button'
import { editorSearchSchema, resumeListSearchSchema } from './navigation'

function RouteMessage({ title, children }: { title: string; children: React.ReactNode }) {
  const navigate = useNavigate()
  return (
    <section className="page empty-state">
      <h1>{title}</h1>
      <p>{children}</p>
      <Button onClick={() => void navigate({ to: '/', search: {} })}>返回简历列表</Button>
    </section>
  )
}

const rootRoute = createRootRoute({
  component: App,
  notFoundComponent: () => <RouteMessage title="页面不存在">请检查链接地址，或返回简历列表。</RouteMessage>,
  errorComponent: () => (
    <RouteMessage title="页面暂时无法加载">请重试或刷新页面。本地数据不会自动删除。</RouteMessage>
  ),
})

const listRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: resumeListSearchSchema,
  search: { middlewares: [stripSearchParams({ q: '' })] },
  component: ResumeListPage,
})

function ResumeListPage() {
  const { q } = listRoute.useSearch()
  const navigate = listRoute.useNavigate()
  return (
    <ResumeList
      search={q}
      setSearch={(value) => void navigate({ search: { q: value }, replace: true, resetScroll: false })}
    />
  )
}

const materialsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/materials',
  validateSearch: z.object({}),
  component: MaterialsPage,
})

function MaterialsPage() {
  const { notify } = useWorkspace()
  return <Materials notify={notify} />
}

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  validateSearch: z.object({}),
  component: SettingsPage,
})

function SettingsPage() {
  const { connection, saveConnection, notify } = useWorkspace()
  return <Settings connection={connection} onChange={saveConnection} notify={notify} />
}

const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/resumes/$resumeId',
  validateSearch: editorSearchSchema,
  search: { middlewares: [stripSearchParams({ tab: 'content', preview: false })] },
  component: EditorPage,
})

function EditorPage() {
  const { resumeId } = editorRoute.useParams()
  const { tab, preview } = editorRoute.useSearch()
  const navigate = editorRoute.useNavigate()
  const { documents, connection, notify, open } = useWorkspace()
  if (!documents)
    return (
      <p role="status" className="page">
        正在读取本地简历…
      </p>
    )
  const document = documents.find((doc) => doc.id === resumeId)
  if (!document)
    return (
      <RouteMessage title="找不到这份简历">
        简历可能已被删除，或不在当前浏览器中。链接不会携带简历内容。
      </RouteMessage>
    )
  return (
    <Editor
      key={document.id}
      document={document}
      connection={connection}
      tab={tab}
      onTabChange={(next) =>
        void navigate({ search: (previous) => ({ ...previous, tab: next }), resetScroll: false })
      }
      showPreview={preview}
      onPreviewChange={(next) =>
        void navigate({ search: (previous) => ({ ...previous, preview: next }), resetScroll: false })
      }
      onBack={() => void navigate({ to: '/', search: {} })}
      onSettings={() => void navigate({ to: '/settings' })}
      onOpen={open}
      notify={notify}
    />
  )
}

export const router = createRouter({
  routeTree: rootRoute.addChildren([listRoute, materialsRoute, settingsRoute, editorRoute]),
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
