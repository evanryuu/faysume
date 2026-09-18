import { Button } from '@/components/ui/button'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import './styles.css'

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string }> {
  state = { error: '' }
  static getDerivedStateFromError(error: Error) {
    return { error: error.message }
  }
  render() {
    return this.state.error ? (
      <main style={{ padding: 40 }}>
        <h1>暂时无法打开工作室</h1>
        <p>请刷新页面重试。你的本地数据不会自动删除。</p>
        <pre>{this.state.error}</pre>
        <Button variant="ghost" size="layout" type="button" onClick={() => location.reload()}>
          刷新页面
        </Button>
      </main>
    ) : (
      this.props.children
    )
  }
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </React.StrictMode>,
)
