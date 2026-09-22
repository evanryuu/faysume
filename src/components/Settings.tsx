import { NativeSelectOption, NativeSelect } from '@/components/ui/native-select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
  const [server, setServer] = useState<{
    configured: boolean
    vision: boolean
    search: boolean
    agent: boolean
  } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/config', { signal: controller.signal })
      .then((r) => r.json())
      .then(setServer)
      .catch(() => setServer(null))
    return () => controller.abort()
  }, [])
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
          <span>连接方式</span>
          <NativeSelect
            value={connection.mode ?? 'direct'}
            onChange={(e) => update({ mode: e.target.value as 'server' | 'direct' })}
          >
            <NativeSelectOption value="server">站点 AI 服务（支持对话助手）</NativeSelectOption>
            <NativeSelectOption value="direct">浏览器直连（原有基础分析）</NativeSelectOption>
          </NativeSelect>
        </label>
        {connection.mode === 'server' ? (
          <>
            <p className="hint">
              模型由站点配置，模型 API Key 不会发送到浏览器。访问口令仅保存在当前页面内存。
            </p>
            <label className="field">
              <span>站点访问口令</span>
              <Input
                type="password"
                autoComplete="off"
                value={connection.accessToken ?? ''}
                onChange={(e) => update({ accessToken: e.target.value })}
              />
            </label>
            <p className="notice">
              {server?.configured ? '站点 AI 已配置' : '站点 AI 尚未配置，请参考 README 设置本地或部署凭证。'}
              {server?.configured &&
                `；对话助手${server.agent ? '已启用' : '尚未配置'}；搜索${server.search ? '已启用' : '未配置'}；图片输入${server.vision ? '已启用' : '未启用'}。`}
            </p>
          </>
        ) : (
          <>
            <label className="field">
              <span>Base URL</span>
              <Input
                value={connection.baseUrl}
                placeholder="https://api.example.com/v1"
                onChange={(e) => update({ baseUrl: e.target.value })}
              />
            </label>
            <label className="field">
              <span>API Key</span>
              <Input
                type="password"
                autoComplete="off"
                value={connection.apiKey}
                placeholder="自动保存在当前浏览器中"
                onChange={(e) => update({ apiKey: e.target.value })}
              />
            </label>
            <p className="hint">API Key 自动保存在此浏览器，刷新或重新打开无需再输入；可随时清除凭证。</p>
            <label className="field">
              <span>模型名称</span>
              <Input
                value={connection.model}
                placeholder="填写服务商提供的模型 ID"
                onChange={(e) => update({ model: e.target.value })}
              />
            </label>
          </>
        )}
        <label className="check-row">
          <Checkbox
            checked={connection.vision}
            onCheckedChange={(checked) => update({ vision: checked === true })}
          />
          <span>
            <strong>这个模型支持图片输入</strong>
            <small>截图识别需要视觉模型；未启用时可以粘贴文字。</small>
          </span>
        </label>
        <label className="check-row">
          <Checkbox
            checked={connection.jsonMode}
            onCheckedChange={(checked) => update({ jsonMode: checked === true })}
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
            <Button
              variant="default"
              size="default"
              type="button"
              className="button primary"
              onClick={() => void test()}
            >
              测试连接 <ArrowUpRight size={16} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="layout"
            type="button"
            className="text-button"
            onClick={() => update({ apiKey: '', accessToken: '' })}
          >
            清除凭证
          </Button>
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
            识别、发送对话或确认分析时，当前简历和选中素材才会发送到模型服务。对话助手经站点后端转发；确认搜索后仅将显示的关键词发送到
            Tavily。简历和对话历史仍保存在本机。
          </p>
          <p>
            浏览器直连需要服务商允许 CORS。API Key 保存在当前浏览器的本地存储中，不会进入简历备份。
            站点访问口令仅在当前页面内存中，刷新后需重新输入。
          </p>
        </div>
      </div>
    </div>
  )
}
