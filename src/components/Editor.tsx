import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { NativeSelectOption, NativeSelect } from '@/components/ui/native-select'
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Copy,
  Download,
  Sparkles,
  Check,
  Undo2,
  BriefcaseBusiness,
  ScanText,
  ArrowUp,
  ArrowDown,
  BookOpen,
  History,
  SlidersHorizontal,
  Eye,
} from 'lucide-react'
import { db, mutateResume, insertResume } from '../db'
import {
  applySuggestions,
  cloneResume,
  createItem,
  createSection,
  readTarget,
  revertHistory,
  targetLabel,
  writeTarget,
} from '../domain'
import { materialSnapshot, reviewContext, workflowFor } from '../workflow'
import AgentChat from './AgentChat'
import AppearancePanel from './AppearancePanel'
import { defaultAppearance, resolveAppearance } from '../appearance'
import DirectChat from './DirectChat'
import SuggestionDiff from './SuggestionDiff'
import type { AIConnection, ProfileField, ResumeDocument, SectionKind, Target, Template } from '../types'
import PaginatedPreview from './PaginatedPreview'
import ResumeItemEditor from './ResumeItemEditor'
import JobDialog from './JobDialog'
import AddExperienceDialog from './AddExperienceDialog'
import { Field, Modal, errorMessage, type Notify } from './ui'

import type { EditorTab } from '../navigation'
export default function Editor({
  document,
  connection,
  tab,
  onTabChange: setTab,
  showPreview,
  onPreviewChange: setShowPreview,
  onBack,
  onOpen,
  onSettings,
  notify,
}: {
  document: ResumeDocument
  connection: AIConnection
  tab: EditorTab
  onTabChange: (tab: EditorTab) => void
  showPreview: boolean
  onPreviewChange: (show: boolean) => void
  onBack: () => void
  onOpen: (id: string) => void
  onSettings: () => void
  notify: Notify
}) {
  const [jobOpen, setJobOpen] = useState(false),
    [appearanceOpen, setAppearanceOpen] = useState(false),
    [experienceOpen, setExperienceOpen] = useState(false),
    [aiView, setAiView] = useState<'chat' | 'review'>('chat'),
    [contextOpen, setContextOpen] = useState(false),
    [discussion, setDiscussion] = useState<{ text: string } | null>(null),
    [adding, setAdding] = useState<SectionKind>('work'),
    [deleting, setDeleting] = useState<{ sectionId: string; itemId?: string } | null>(null)
  const materials = useLiveQuery(() => db.materials.orderBy('updatedAt').reverse().toArray(), [], [])
  const selectedMaterials = workflowFor(document).materialIds
  const setSelectedMaterials = (ids: string[]) =>
    void change((doc) => ({
      ...doc,
      workflow: { ...workflowFor(doc), materialIds: ids, confirmed: false },
    }))
  const sources = useLiveQuery(
    () => db.sources.bulkGet(document.sourceIds),
    [document.id, document.sourceIds.join(',')],
    [],
  )
  const change = async (mutate: (doc: ResumeDocument) => ResumeDocument) => {
    try {
      await mutateResume(document.id, mutate)
      return true
    } catch (e) {
      notify(errorMessage(e), 'error')
      return false
    }
  }
  const write = (target: Target, value: string, before: string) => {
    return change((doc) => {
      if (readTarget(doc.content, target) !== before)
        throw new Error('此字段已在其他操作中更新，请重新核对后编辑。')
      return { ...doc, content: writeTarget(doc.content, target, value) }
    })
  }
  const writeMetadata = (
    field: 'name' | 'targetRole' | 'market' | 'jobDescription',
    value: string,
    before: string,
  ) =>
    void change((doc) => {
      if (doc[field] !== before) throw new Error('此设置已在其他操作中更新，请重新核对后编辑。')
      return { ...doc, [field]: field === 'name' ? value || '未命名简历' : value }
    })
  const copy = async () => {
    try {
      const current = await db.resumes.get(document.id)
      if (!current) return
      const next = cloneResume(current)
      await insertResume(next)
      onOpen(next.id)
      notify('已创建独立副本。')
    } catch (e) {
      notify(errorMessage(e), 'error')
    }
  }
  const pending = document.suggestions.filter((s) => s.status === 'pending')
  const apply = async (ids: string[]) => {
    try {
      await db.transaction('rw', db.resumes, db.materials, db.sources, async () => {
        const latest = await db.resumes.get(document.id)
        if (!latest) throw new Error('简历不存在。')
        const chosen = (await db.materials.bulkGet(workflowFor(latest).materialIds)).filter(
          (m): m is NonNullable<typeof m> => Boolean(m),
        )
        if (
          latest.suggestions.some(
            (s) =>
              ids.includes(s.id) && s.materialSnapshot && s.materialSnapshot !== materialSnapshot(chosen),
          )
        )
          throw new Error('参考素材已变化，请重新分析后采纳。')
        await mutateResume(document.id, (doc) => applySuggestions(doc, ids))
      })
      notify('建议已应用，可以在修改记录中撤回。')
    } catch (e) {
      notify(errorMessage(e), 'error')
    }
  }
  const move = (sectionId: string, itemId: string | null, offset: number) =>
    void change((doc) => {
      const items = itemId
        ? doc.content.sections.find((s) => s.id === sectionId)!.items
        : doc.content.sections
      const index = items.findIndex((i) => i.id === (itemId || sectionId))
      if (index + offset < 0 || index + offset >= items.length) return doc
      ;[items[index], items[index + offset]] = [items[index + offset], items[index]]
      return doc
    })
  const addMaterials = () =>
    void change((doc) => {
      const section = createSection('project')
      section.title = '补充经历'
      section.items = materials
        .filter((m) => selectedMaterials.includes(m.id))
        .map((m) => ({ ...createItem(), title: m.title, description: m.content }))
      doc.content.sections.push(section)
      return doc
    })
  const print = async () => {
    await db.resumes.get(document.id)
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
  }
  const review = (
    <>
      {document.workflow?.research && document.workflow.research.length > 0 && (
        <details className="material-select">
          <summary>本轮参考的外部资料（{document.workflow.research.length}）</summary>
          <p className="hint">
            外部资料用于写法和岗位参考，不是个人经历的证据。未标明发布日期的资料不能证明是最新发布。
          </p>
          {document.workflow.research.map((source) => (
            <article key={source.id} className="research-source">
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.title}
              </a>
              <small>
                发布日期：{source.publishedAt || '未提供'} · 检索日期：
                {source.retrievedAt.slice(0, 10)}
              </small>
              <p>{source.content}</p>
            </article>
          ))}
        </details>
      )}
      {pending.length > 0 && (
        <div className="suggestion-heading">
          <h3>{pending.length} 条待审阅建议</h3>
          <Button
            variant="ghost"
            size="layout"
            type="button"
            className="text-button"
            disabled={!pending.some((s) => s.confirmed)}
            onClick={() => void apply(pending.filter((s) => s.confirmed).map((s) => s.id))}
          >
            应用所有已确认建议
          </Button>
        </div>
      )}
      {pending.map((suggestion) => (
        <article className="suggestion" key={suggestion.id}>
          <span className="eyebrow">{targetLabel(document.content, suggestion.target)}</span>
          <p className="suggestion-reason">{suggestion.reason}</p>
          <SuggestionDiff before={suggestion.before} after={suggestion.after} />
          <p className="hint">参考来源：{suggestion.evidence.join('、')}</p>
          {suggestion.reviewContext === reviewContext(document) &&
            suggestion.references?.map((id) => {
              const source = document.workflow?.research.find((s) => s.id === id)
              return source ? (
                <p className="hint" key={id}>
                  外部参考：
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.title}
                  </a>
                </p>
              ) : null
            })}
          {suggestion.question && <div className="notice warning">{suggestion.question}</div>}
          <label className="check-row">
            <Checkbox
              key={`${suggestion.id}-${suggestion.confirmed}`}
              defaultChecked={suggestion.confirmed}
              onCheckedChange={(checked) => {
                const confirmed = checked === true
                void change((doc) => ({
                  ...doc,
                  suggestions: doc.suggestions.map((s) => (s.id === suggestion.id ? { ...s, confirmed } : s)),
                }))
              }}
            />
            <span>我已核对，修改后的事实准确</span>
          </label>
          <div className="suggestion-actions">
            <Button
              variant="ghost"
              className="text-button"
              onClick={() => {
                setDiscussion({
                  text: `关于「${targetLabel(document.content, suggestion.target)}」的建议“${suggestion.after.slice(0, 300)}”，我想调整：`,
                })
                setAiView('chat')
              }}
            >
              和助手讨论
            </Button>
            <Button
              variant="ghost"
              size="layout"
              type="button"
              className="text-button muted"
              onClick={() =>
                void change((doc) => ({
                  ...doc,
                  suggestions: doc.suggestions.map((s) =>
                    s.id === suggestion.id ? { ...s, status: 'dismissed' } : s,
                  ),
                }))
              }
            >
              忽略
            </Button>
            <Button
              variant="default"
              size="sm"
              type="button"
              className="button primary small"
              disabled={!suggestion.confirmed}
              onClick={() => void apply([suggestion.id])}
            >
              <Check size={15} />
              采纳修改
            </Button>
          </div>
        </article>
      ))}
    </>
  )
  const profileLabels: [ProfileField, string][] = [
    ['name', '姓名'],
    ['headline', '职业标题'],
    ['email', '邮箱'],
    ['phone', '电话'],
    ['location', '所在地'],
    ['website', '个人网站'],
  ]
  return (
    <div className="editor-page">
      <div className="editor-toolbar">
        <div className="editor-title">
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className="icon-button"
            aria-label="返回简历列表"
            onClick={onBack}
          >
            <ArrowLeft size={20} />
          </Button>
          <div>
            <Field
              label="简历名称"
              value={document.name}
              onCommit={(value, before) => writeMetadata('name', value, before)}
            />
            <span className="autosave">
              <span />
              本机保存 · 字段离开后保存
            </span>
          </div>
        </div>
        <div className="toolbar-actions">
          <Button
            variant="outline"
            size="default"
            type="button"
            className="button secondary"
            onClick={() => void copy()}
          >
            <Copy size={15} />
            <span>另存副本</span>
          </Button>
          <Button
            variant="outline"
            size="default"
            type="button"
            className="button secondary"
            onClick={() => setJobOpen(true)}
          >
            <BriefcaseBusiness size={15} />
            <span>针对岗位定制</span>
          </Button>
          <Button
            variant="default"
            size="default"
            type="button"
            className="button primary"
            onClick={() => void print()}
          >
            <Download size={16} />
            <span>导出 PDF</span>
          </Button>
        </div>
      </div>
      {!document.extractionReviewed && (
        <div className="review-banner">
          <ScanText size={18} />
          <span>这是 AI 提取的原始内容。请先核对姓名、日期和数字，再开始优化。</span>
          <Button
            variant="ghost"
            size="layout"
            type="button"
            className="text-button"
            onClick={() => setTab('sources')}
          >
            查看原稿并校对 →
          </Button>
        </div>
      )}
      <div className="editor-layout">
        <div className={`edit-panel ${showPreview ? 'mobile-hidden' : ''}`}>
          <div className="editor-tabs">
            {(
              [
                ['content', '内容', SlidersHorizontal],
                ['ai', 'AI 助手', Sparkles],
                ['sources', '识别原稿', ScanText],
                ['history', '修改记录', History],
              ] as const
            ).map(([id, label, Icon]) => (
              <Button
                variant="ghost"
                size="layout"
                type="button"
                key={id}
                className={tab === id ? 'active' : ''}
                onClick={() => setTab(id)}
              >
                <Icon size={15} />
                {label}
                {id === 'ai' && pending.length > 0 && <b>{pending.length}</b>}
              </Button>
            ))}
          </div>
          <div className={`editor-scroll ${tab === 'ai' ? 'ai-editor-scroll' : ''}`}>
            {tab === 'content' && (
              <>
                <div className="panel-heading content-panel-heading">
                  <div className="content-heading-row">
                    <h2>你的经历，你来定义</h2>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="button subtle experience-trigger"
                      onClick={() => setExperienceOpen(true)}
                      title="粘贴工作或项目经历，AI 识别后添加"
                    >
                      <Sparkles size={16} />
                      AI 添加经历
                    </Button>
                  </div>
                  <p>按需添加自由文本或经历条目，区块标题和顺序都可调整。</p>
                  <p>个人简介和正文支持 Markdown：**粗体**、- 列表、[文字](链接)。</p>
                </div>
                <div className="editor-section">
                  <h3>基本信息</h3>
                  <div className="field-grid">
                    {profileLabels.map(([field, label]) => (
                      <Field
                        key={field}
                        label={label}
                        value={document.content[field]}
                        onCommit={(value, before) => write({ kind: 'profile', field }, value, before)}
                      />
                    ))}
                    <Field
                      label="个人简介"
                      value={document.content.summary}
                      onCommit={(value, before) =>
                        write({ kind: 'profile', field: 'summary' }, value, before)
                      }
                      multiline
                      placeholder="你擅长什么，能够创造什么价值？"
                    />
                  </div>
                </div>
                {document.content.sections.map((section, index) => (
                  <div className="editor-section" key={section.id}>
                    <div className="section-tools">
                      <Field
                        label="区块标题"
                        value={section.title}
                        onCommit={(value, before) =>
                          write({ kind: 'section', sectionId: section.id, field: 'title' }, value, before)
                        }
                      />
                      <div>
                        <Button
                          variant="ghost"
                          size="icon"
                          type="button"
                          className="icon-button"
                          title="上移区块"
                          aria-label={`上移 ${section.title}`}
                          disabled={index === 0}
                          onClick={() => move(section.id, null, -1)}
                        >
                          <ArrowUp size={15} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          type="button"
                          className="icon-button"
                          title="下移区块"
                          aria-label={`下移 ${section.title}`}
                          disabled={index === document.content.sections.length - 1}
                          onClick={() => move(section.id, null, 1)}
                        >
                          <ArrowDown size={15} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          type="button"
                          className="icon-button"
                          aria-label={`删除区块 ${section.title}`}
                          onClick={() => setDeleting({ sectionId: section.id })}
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </div>
                    {section.items.map((item, i) => (
                      <ResumeItemEditor
                        key={item.id}
                        item={item}
                        sectionId={section.id}
                        index={i}
                        count={section.items.length}
                        write={write}
                        onMove={(offset) => move(section.id, item.id, offset)}
                        onDelete={() => setDeleting({ sectionId: section.id, itemId: item.id })}
                      />
                    ))}
                    <div className="add-content-actions">
                      {(['text', 'entry'] as const).map((layout) => (
                        <Button
                          key={layout}
                          variant="secondary"
                          className="button subtle"
                          onClick={() =>
                            void change((doc) => {
                              doc.content.sections
                                .find((s) => s.id === section.id)!
                                .items.push(createItem(layout))
                              return doc
                            })
                          }
                        >
                          <Plus size={15} />
                          {layout === 'text' ? '添加自由文本' : '添加经历条目'}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="add-section">
                  <NativeSelect
                    aria-label="新增区块类型"
                    value={adding}
                    onChange={(e) => setAdding(e.target.value as SectionKind)}
                  >
                    <NativeSelectOption value="work">工作经历</NativeSelectOption>
                    <NativeSelectOption value="project">项目经历</NativeSelectOption>
                    <NativeSelectOption value="education">教育背景</NativeSelectOption>
                    <NativeSelectOption value="skills">技能</NativeSelectOption>
                    <NativeSelectOption value="other">自定义区块</NativeSelectOption>
                  </NativeSelect>
                  <Button
                    variant="outline"
                    size="default"
                    type="button"
                    className="button secondary"
                    onClick={() =>
                      void change((doc) => {
                        const section = createSection(adding)
                        section.items.push(
                          createItem(adding === 'skills' || adding === 'other' ? 'text' : 'entry'),
                        )
                        doc.content.sections.push(section)
                        return doc
                      })
                    }
                  >
                    <Plus size={16} />
                    添加区块
                  </Button>
                </div>
              </>
            )}
            {tab === 'ai' && (
              <>
                <div className="ai-workspace-header">
                  <div>
                    <h2>AI 简历助手</h2>
                    <p>聊清楚经历，再确认修改。</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="button secondary"
                    onClick={() => setContextOpen(true)}
                  >
                    <SlidersHorizontal size={15} />
                    设置修改方向
                  </Button>
                </div>
                <div className="ai-context-summary">
                  <span>当前修改方向</span>
                  <strong>{document.targetRole || '通用简历优化'}</strong>
                  <small>
                    基于当前简历{selectedMaterials.length ? `和 ${selectedMaterials.length} 份参考素材` : ''}
                  </small>
                </div>
                <div
                  className="ai-view-tabs"
                  role="tablist"
                  aria-label="AI 工作区"
                  onKeyDown={(event) => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                    event.preventDefault()
                    const next =
                      event.key === 'Home'
                        ? 'chat'
                        : event.key === 'End'
                          ? 'review'
                          : aiView === 'chat'
                            ? 'review'
                            : 'chat'
                    setAiView(next)
                    event.currentTarget.querySelector<HTMLButtonElement>(`#ai-${next}-tab`)?.focus()
                  }}
                >
                  <Button
                    variant="ghost"
                    role="tab"
                    id="ai-chat-tab"
                    aria-selected={aiView === 'chat'}
                    tabIndex={aiView === 'chat' ? 0 : -1}
                    aria-controls="ai-chat-panel"
                    onClick={() => setAiView('chat')}
                  >
                    对话
                  </Button>
                  <Button
                    variant="ghost"
                    role="tab"
                    id="ai-review-tab"
                    aria-selected={aiView === 'review'}
                    tabIndex={aiView === 'review' ? 0 : -1}
                    aria-controls="ai-review-panel"
                    onClick={() => setAiView('review')}
                  >
                    修改建议 <span>{pending.length}</span>
                  </Button>
                </div>
                <div
                  id="ai-chat-panel"
                  role="tabpanel"
                  aria-labelledby="ai-chat-tab"
                  className="ai-chat-panel"
                  hidden={aiView !== 'chat'}
                >
                  {connection.mode === 'server' ? (
                    <AgentChat
                      document={document}
                      materials={materials.filter((m) => selectedMaterials.includes(m.id))}
                      connection={connection}
                      notify={notify}
                      pendingCount={pending.length}
                      onReview={() => setAiView('review')}
                      discussion={discussion}
                      onDiscussionUsed={() => setDiscussion(null)}
                      active={aiView === 'chat'}
                    />
                  ) : (
                    <DirectChat
                      document={document}
                      connection={connection}
                      onSettings={onSettings}
                      pendingCount={pending.length}
                      onReview={() => setAiView('review')}
                      discussion={discussion}
                      onDiscussionUsed={() => setDiscussion(null)}
                      active={aiView === 'chat'}
                    />
                  )}
                </div>
                <div
                  id="ai-review-panel"
                  role="tabpanel"
                  aria-labelledby="ai-review-tab"
                  className="ai-review-panel"
                  hidden={aiView !== 'review'}
                >
                  <p className="review-intro">这里是尚未写入简历的修改。核对后采纳，或回到对话继续调整。</p>
                  {review}
                  {!pending.length && (
                    <div className="chat-welcome">
                      <Check size={26} />
                      <h3>没有待审阅的修改</h3>
                      <p>继续和助手讨论，或在「修改记录」中查看已采纳的内容。</p>
                      <Button
                        variant="outline"
                        className="button secondary"
                        onClick={() => setAiView('chat')}
                      >
                        返回对话
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}
            {tab === 'sources' && (
              <>
                <div className="panel-heading">
                  <h2>先确认真实，再优化表达</h2>
                  <p>对照原图检查内容。模糊文字、日期和数字尤其需要核对。</p>
                </div>
                {document.warnings.length > 0 && (
                  <div className="notice warning">
                    <div>
                      <strong>识别中需要注意</strong>
                      <ul>
                        {document.warnings.map((warning, i) => (
                          <li key={i}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
                {sources.filter(Boolean).map((source, index) => (
                  <figure className="source-image" key={source!.id}>
                    <figcaption>
                      原图 {index + 1} · {source!.name}
                    </figcaption>
                    <img src={source!.dataUrl} alt={`简历原图 ${index + 1}`} />
                  </figure>
                ))}
                {!sources.length && <p className="muted">这份简历没有关联截图，可直接在内容页校对。</p>}
                {!document.extractionReviewed ? (
                  <Button
                    variant="default"
                    size="default"
                    type="button"
                    className="button primary full-width"
                    onClick={() => void change((doc) => ({ ...doc, extractionReviewed: true }))}
                  >
                    <Check size={17} />
                    我已校对，开始编辑与优化
                  </Button>
                ) : (
                  <div className="status">
                    <Check size={16} />
                    已确认校对
                  </div>
                )}
              </>
            )}
            {tab === 'history' && (
              <>
                <div className="panel-heading">
                  <h2>每次采纳，都可以回看</h2>
                  <p>撤回会检查后续修改；存在冲突时保留你的新内容。</p>
                </div>
                {[...document.history].reverse().map((entry) => (
                  <div className="history-entry" key={entry.id}>
                    <div>
                      <strong>{entry.label}</strong>
                      <small>{new Date(entry.createdAt).toLocaleString('zh-CN')}</small>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      className="button secondary small"
                      disabled={entry.reverted}
                      onClick={() => void change((doc) => revertHistory(doc, entry.id))}
                    >
                      <Undo2 size={14} />
                      {entry.reverted ? '已撤回' : '撤回'}
                    </Button>
                    <ul>
                      {entry.additions?.flatMap((addition) =>
                        addition.items.map((item) => (
                          <li key={item.id}>新增经历 · {item.title || item.organization || '经历'}</li>
                        )),
                      )}
                      {entry.changes.map((c, i) => (
                        <li key={i}>{targetLabel(document.content, c.target)}</li>
                      ))}
                    </ul>
                  </div>
                ))}
                {!document.history.length && (
                  <div className="empty-state compact">
                    <History size={30} />
                    <p>采纳 AI 建议后，修改记录会出现在这里。</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className={`preview-panel ${!showPreview ? 'mobile-hidden-preview' : ''}`}>
          <div className="preview-toolbar">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={appearanceOpen}
              aria-controls="resume-appearance"
              onClick={() => setAppearanceOpen(!appearanceOpen)}
            >
              <SlidersHorizontal size={15} aria-hidden="true" />
              外观
            </Button>
            <label>
              <span className="sr-only">简历模板</span>
              <NativeSelect
                value={document.template}
                onChange={(e) => {
                  const template = e.currentTarget.value as Template
                  void change((doc) => ({ ...doc, template }))
                }}
              >
                <NativeSelectOption value="classic">经典 · 单栏</NativeSelectOption>
                <NativeSelectOption value="modern">现代 · 色块</NativeSelectOption>
                <NativeSelectOption value="compact">紧凑 · 精简</NativeSelectOption>
              </NativeSelect>
            </label>
            <span className="paper-size">A4</span>
          </div>
          {appearanceOpen && (
            <AppearancePanel
              value={document.appearance}
              onChange={(patch) =>
                void change((doc) => ({
                  ...doc,
                  appearance: { ...resolveAppearance(doc.appearance), ...patch },
                }))
              }
              onReset={() => void change((doc) => ({ ...doc, appearance: { ...defaultAppearance } }))}
            />
          )}
          <PaginatedPreview key={document.id} document={document} onEdit={write} />
        </div>
      </div>
      <Button
        variant="default"
        size="default"
        type="button"
        className="mobile-toggle button primary"
        onClick={() => setShowPreview(!showPreview)}
      >
        <Eye size={17} />
        {showPreview ? '返回编辑' : '查看预览'}
      </Button>
      {jobOpen && (
        <JobDialog
          document={document}
          connection={connection}
          onClose={() => setJobOpen(false)}
          onCreated={onOpen}
          notify={notify}
        />
      )}
      {contextOpen && (
        <Modal title="设置修改方向" onClose={() => setContextOpen(false)} wide>
          <div className="modal-body">
            <p className="experience-intro">
              这些信息帮助 AI 判断简历的修改方向；留空也可以先聊。修改会在下一轮对话中生效。
            </p>

            <div className="field-grid">
              <Field
                label="目标岗位"
                value={document.targetRole}
                onCommit={(value, before) => writeMetadata('targetRole', value, before)}
              />
              <Field
                label="招聘市场"
                value={document.market}
                placeholder="例如：中国、新加坡"
                onCommit={(value, before) => writeMetadata('market', value, before)}
              />
              <label className="field">
                <span>目标简历语言</span>
                <NativeSelect
                  value={document.locale}
                  onChange={(e) => {
                    const locale = e.currentTarget.value
                    void change((doc) => ({ ...doc, locale }))
                  }}
                >
                  <NativeSelectOption value="zh-CN">简体中文</NativeSelectOption>
                  <NativeSelectOption value="en">English</NativeSelectOption>
                  <NativeSelectOption value="ja">日本語</NativeSelectOption>
                </NativeSelect>
              </label>
            </div>
            <Field
              label="岗位描述（可选）"
              value={document.jobDescription}
              onCommit={(value, before) => writeMetadata('jobDescription', value, before)}
              multiline
            />
            {materials.length > 0 && (
              <section className="context-materials">
                <h3>
                  <BookOpen size={15} />
                  选择参考素材（已选 {selectedMaterials.length}）
                </h3>
                {materials.map((material) => (
                  <label className="check-row" key={material.id}>
                    <Checkbox
                      checked={selectedMaterials.includes(material.id)}
                      onCheckedChange={(checked) =>
                        setSelectedMaterials(
                          checked === true
                            ? [...selectedMaterials, material.id]
                            : selectedMaterials.filter((id) => id !== material.id),
                        )
                      }
                    />
                    <span>{material.title}</span>
                  </label>
                ))}
                <Button
                  variant="ghost"
                  size="layout"
                  type="button"
                  className="text-button"
                  disabled={!selectedMaterials.length}
                  onClick={addMaterials}
                >
                  将选中素材原文加入简历
                </Button>
              </section>
            )}
            <p className="hint">每轮对话会将当前简历、岗位描述、选中素材及对话记录发送到你配置的 AI 服务。</p>

            <div className="modal-actions">
              <Button className="button primary" onClick={() => setContextOpen(false)}>
                完成
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {experienceOpen && (
        <AddExperienceDialog
          document={document}
          connection={connection}
          onClose={() => setExperienceOpen(false)}
          onSettings={onSettings}
          notify={notify}
        />
      )}
      {deleting && (
        <Modal title="删除这段内容？" onClose={() => setDeleting(null)}>
          <div className="modal-body">
            <p>手动删除无法通过 AI 修改记录撤回。你可以先另存副本。</p>
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
                  await change((doc) => {
                    if (deleting.itemId) {
                      const section = doc.content.sections.find((s) => s.id === deleting.sectionId)!
                      section.items = section.items.filter((i) => i.id !== deleting.itemId)
                    } else
                      doc.content.sections = doc.content.sections.filter((s) => s.id !== deleting.sectionId)
                    return doc
                  })
                  setDeleting(null)
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
