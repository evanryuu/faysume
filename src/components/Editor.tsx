import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { NativeSelectOption, NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useEffect, useRef, useState } from 'react'
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
  uid,
  writeTarget,
} from '../domain'
import { analyzeResume, connectionReady } from '../ai'
import { materialSnapshot, reviewContext, workflowFor } from '../workflow'
import AgentChat from './AgentChat'
import type {
  AIConnection,
  ItemField,
  ProfileField,
  ResumeDocument,
  SectionKind,
  Target,
  Template,
} from '../types'
import ResumePaper from './ResumePaper'
import JobDialog from './JobDialog'
import { Busy, Field, Modal, errorMessage, type Notify } from './ui'

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
    [busy, setBusy] = useState(false),
    [adding, setAdding] = useState<SectionKind>('work'),
    [deleting, setDeleting] = useState<{ sectionId: string; itemId?: string } | null>(null),
    [answer, setAnswer] = useState('')
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
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [document.id])
  const change = async (mutate: (doc: ResumeDocument) => ResumeDocument) => {
    try {
      await mutateResume(document.id, mutate)
    } catch (e) {
      notify(errorMessage(e), 'error')
    }
  }
  const write = (target: Target, value: string, before: string) => {
    void change((doc) => {
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
  const analyze = async () => {
    if (!connectionReady(connection)) {
      notify('请先配置 AI 连接。', 'error')
      onSettings()
      return
    }
    setBusy(true)
    controller.current = new AbortController()
    const signal = controller.current.signal
    try {
      const snapshot = await db.resumes.get(document.id)
      if (!snapshot) throw new Error('简历不存在。')
      if (!snapshot.extractionReviewed) throw new Error('请先在「识别原稿」中确认已校对内容。')
      const result = await analyzeResume(
        connection,
        { ...snapshot, workflow: undefined },
        materials.filter((m) => selectedMaterials.includes(m.id)),
        signal,
      )
      signal.throwIfAborted()
      await mutateResume(snapshot.id, (current) => {
        if (
          current.locale !== snapshot.locale ||
          current.market !== snapshot.market ||
          current.targetRole !== snapshot.targetRole ||
          current.jobDescription !== snapshot.jobDescription
        )
          throw new Error('分析期间岗位或语言设置已变化，请重新分析。')
        return {
          ...current,
          analysisSummary: result.summary,
          analysisQuestions: result.questions,
          suggestions: [
            ...current.suggestions.map((s) =>
              s.status === 'pending' ? { ...s, status: 'dismissed' as const } : s,
            ),
            ...result.suggestions,
          ],
        }
      })
      notify(`分析完成，生成 ${result.suggestions.length} 条可审阅建议。`)
    } catch (e) {
      if (!signal.aborted) notify(errorMessage(e), 'error')
    } finally {
      setBusy(false)
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
  const saveAnswer = async () => {
    try {
      const now = new Date().toISOString()
      await db.materials.add({
        id: uid(),
        title: `${document.name} · 亮点补充`,
        content: answer,
        createdAt: now,
        updatedAt: now,
      })
      setAnswer('')
      notify('已保存到经历素材库，请勾选该素材后重新分析。')
    } catch (e) {
      notify(errorMessage(e), 'error')
    }
  }
  const print = async () => {
    await db.resumes.get(document.id)
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
  }
  const profileLabels: [ProfileField, string][] = [
    ['name', '姓名'],
    ['headline', '职业标题'],
    ['email', '邮箱'],
    ['phone', '电话'],
    ['location', '所在地'],
    ['website', '个人网站'],
  ]
  const itemLabels: [ItemField, string][] = [
    ['title', '职位 / 项目 / 学位'],
    ['organization', '公司 / 学校'],
    ['startDate', '开始时间'],
    ['endDate', '结束时间'],
    ['location', '地点'],
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
                ['ai', 'AI 建议', Sparkles],
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
          <div className="editor-scroll">
            {tab === 'content' && (
              <>
                <div className="panel-heading">
                  <h2>你的经历，你来定义</h2>
                  <p>填写真实内容，右侧即刻呈现。</p>
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
                      <div className="item-editor" key={item.id}>
                        <div className="item-label">
                          <span>
                            {String(i + 1).padStart(2, '0')} / {item.title || '新的经历'}
                          </span>
                          <div>
                            <Button
                              variant="ghost"
                              size="icon"
                              type="button"
                              className="icon-button"
                              aria-label={`上移经历 ${i + 1}`}
                              disabled={i === 0}
                              onClick={() => move(section.id, item.id, -1)}
                            >
                              <ArrowUp size={14} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              type="button"
                              className="icon-button"
                              aria-label={`下移经历 ${i + 1}`}
                              disabled={i === section.items.length - 1}
                              onClick={() => move(section.id, item.id, 1)}
                            >
                              <ArrowDown size={14} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              type="button"
                              className="icon-button"
                              aria-label={`删除经历 ${i + 1}`}
                              onClick={() => setDeleting({ sectionId: section.id, itemId: item.id })}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </div>
                        <div className="field-grid">
                          {itemLabels.map(([field, label]) => (
                            <Field
                              key={field}
                              label={label}
                              value={item[field]}
                              onCommit={(value, before) =>
                                write(
                                  { kind: 'item', sectionId: section.id, itemId: item.id, field },
                                  value,
                                  before,
                                )
                              }
                            />
                          ))}
                          <Field
                            label="经历描述"
                            value={item.description}
                            onCommit={(value, before) =>
                              write(
                                {
                                  kind: 'item',
                                  sectionId: section.id,
                                  itemId: item.id,
                                  field: 'description',
                                },
                                value,
                                before,
                              )
                            }
                            multiline
                            placeholder="背景、你的行动，以及有证据支持的成果…"
                          />
                        </div>
                      </div>
                    ))}
                    <Button
                      variant="secondary"
                      size="default"
                      type="button"
                      className="button subtle full-width"
                      onClick={() =>
                        void change((doc) => {
                          doc.content.sections.find((s) => s.id === section.id)!.items.push(createItem())
                          return doc
                        })
                      }
                    >
                      <Plus size={15} />
                      添加一条经历
                    </Button>
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
                    <NativeSelectOption value="other">其他经历</NativeSelectOption>
                  </NativeSelect>
                  <Button
                    variant="outline"
                    size="default"
                    type="button"
                    className="button secondary"
                    onClick={() =>
                      void change((doc) => {
                        const section = createSection(adding)
                        section.items.push(createItem())
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
                <div className="panel-heading">
                  <span className="soft-icon">
                    <Sparkles size={23} />
                  </span>
                  <h2>发现值得被看见的亮点</h2>
                  <p>提供理由、对照原文，由你决定如何修改。</p>
                </div>
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
                  <details className="material-select">
                    <summary>
                      <BookOpen size={15} />
                      选择参考素材（已选 {selectedMaterials.length}）
                    </summary>
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
                  </details>
                )}
                <p className="hint">
                  分析会发送当前简历、岗位描述及选中的素材到配置的 AI 服务。市场与语言建议供参考，请核对事实。
                </p>
                {connection.mode === 'server' ? (
                  <AgentChat
                    document={document}
                    materials={materials.filter((m) => selectedMaterials.includes(m.id))}
                    connection={connection}
                    notify={notify}
                  />
                ) : busy ? (
                  <Busy label="正在分析你的经历…" onCancel={() => controller.current?.abort()} />
                ) : (
                  <Button
                    variant="default"
                    size="default"
                    type="button"
                    className="button primary full-width"
                    disabled={!document.extractionReviewed}
                    onClick={() => void analyze()}
                  >
                    <Sparkles size={17} />
                    {document.analysisSummary ? '重新分析简历' : '开始 AI 分析'}
                  </Button>
                )}
                {!document.extractionReviewed && <p className="hint">请先到「识别原稿」确认校对。</p>}
                {document.analysisSummary && (
                  <div className="analysis-summary">{document.analysisSummary}</div>
                )}
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
                {document.analysisQuestions.length > 0 && (
                  <div className="questions">
                    <h3>再补充一点，亮点会更具体</h3>
                    <ol>
                      {document.analysisQuestions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ol>
                    <Textarea
                      aria-label="补充亮点回答"
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      rows={4}
                      placeholder="写下真实经历或数据依据…"
                    />
                    <Button
                      variant="outline"
                      size="default"
                      type="button"
                      className="button secondary"
                      disabled={!answer.trim()}
                      onClick={() => void saveAnswer()}
                    >
                      保存为经历素材
                    </Button>
                  </div>
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
                    <div className="diff before">
                      <small>原文</small>
                      <p>{suggestion.before || '（空）'}</p>
                    </div>
                    <div className="diff after">
                      <small>建议</small>
                      <p>{suggestion.after}</p>
                    </div>
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
                            suggestions: doc.suggestions.map((s) =>
                              s.id === suggestion.id ? { ...s, confirmed } : s,
                            ),
                          }))
                        }}
                      />
                      <span>我已核对，修改后的事实准确</span>
                    </label>
                    <div className="suggestion-actions">
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
            <span>实时预览</span>
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
                <NativeSelectOption value="modern">现代 · 墨绿</NativeSelectOption>
                <NativeSelectOption value="compact">紧凑 · 精简</NativeSelectOption>
              </NativeSelect>
            </label>
            <span className="paper-size">A4</span>
          </div>
          <div className="paper-canvas">
            <ResumePaper document={document} />
          </div>
          <p className="preview-footnote">导出使用浏览器打印，可选择“保存为 PDF”。长内容会自动分页。</p>
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
