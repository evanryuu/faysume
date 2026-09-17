import { useEffect, useRef, useState } from 'react'
import { KeyRound, ShieldCheck, ArrowUpRight, CheckCircle2 } from 'lucide-react'
import { requestCompletion } from '../ai'
import type { AIConnection } from '../types'
import { Busy, errorMessage, type Notify } from './ui'

export default function Settings({
  connection,
  onChange,
  notify,
}: {
  connection: AIConnection
  onChange: (connection: AIConnection) => void
  notify: Notify
}) {
  const [busy, setBusy] = useState(false),
    [tested, setTested] = useState(false)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const update = (patch: Partial<AIConnection>) => {
    controller.current?.abort()
    setTested(false)
    onChange({ ...connection, ...patch })
  }
  const test = async () => {
    controller.current = new AbortController()
    const signal = controller.current.signal
    setBusy(true)
    try {
      await requestCompletion(
        { ...connection, jsonMode: false },
        'Reply OK.',
        'Connection test. Reply OK.',
        [],
        signal,
      )
      signal.throwIfAborted()
      setTested(true)
      notify('文本请求成功。图片能力仍取决于所选模型。')
    } catch (e) {
      if (!signal.aborted) notify(errorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="page narrow-page">
      <div className="eyebrow">YOUR MODEL, YOUR CHOICE</div>
      <h1>连接你的 AI</h1>
      <p className="page-subtitle">选择熟悉的模型，让每一次修改都由你掌控。</p>
      <section className="surface settings-card">
        <div className="section-title">
          <span className="soft-icon">
            <KeyRound size={21} />
          </span>
          <div>
            <h2>API 连接</h2>
            <p>支持 Chat Completions 兼容接口</p>
          </div>
        </div>
        <label className="field">
          <span>Base URL</span>
          <input
            value={connection.baseUrl}
            placeholder="https://api.example.com/v1"
            onChange={(e) => update({ baseUrl: e.target.value })}
          />
        </label>
        <label className="field">
          <span>API Key</span>
          <input
            type="password"
            autoComplete="off"
            value={connection.apiKey}
            placeholder="仅保存在当前页面内存中"
            onChange={(e) => update({ apiKey: e.target.value })}
          />
        </label>
        <label className="field">
          <span>模型名称</span>
          <input
            value={connection.model}
            placeholder="填写服务商提供的模型 ID"
            onChange={(e) => update({ model: e.target.value })}
          />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={connection.vision}
            onChange={(e) => update({ vision: e.target.checked })}
          />
          <span>
            <strong>这个模型支持图片输入</strong>
            <small>截图识别需要视觉模型；未启用时可以粘贴文字。</small>
          </span>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={connection.jsonMode}
            onChange={(e) => update({ jsonMode: e.target.checked })}
          />
          <span>
            <strong>启用 JSON 输出模式</strong>
            <small>仅在服务商支持 response_format 时开启。</small>
          </span>
        </label>
        <div className="settings-actions">
          {busy ? (
            <Busy label="正在测试文本连接…" onCancel={() => controller.current?.abort()} />
          ) : (
            <button className="button primary" onClick={() => void test()}>
              测试连接 <ArrowUpRight size={16} />
            </button>
          )}
          <button className="text-button" onClick={() => update({ apiKey: '' })}>
            清除 Key
          </button>
          {tested && (
            <span className="status">
              <CheckCircle2 size={15} />
              文本连接成功
            </span>
          )}
        </div>
      </section>
      <div className="privacy-note">
        <ShieldCheck size={22} />
        <div>
          <strong>简历留在本地，AI 由你选择</strong>
          <p>
            只有你点击识别或分析时，相关内容才会发送到配置的服务。API Key
            不进入本地数据库或备份，刷新页面后需重新输入。Base URL 和模型设置会保存在本机。
          </p>
          <p>
            浏览器直连需要服务端允许跨域请求（CORS）。无法连接时，请检查服务配置，或填写你信任的兼容网关。
          </p>
        </div>
      </div>
    </div>
  )
}
