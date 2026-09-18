import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowRight, ArrowUpRight, Check, ImagePlus, Plus, Search, Sparkles, Trash2 } from 'lucide-react'
import ResumePaper from './ResumePaper'
import { useWorkspace } from '../App'

export default function ResumeList({
  search,
  setSearch,
}: {
  search: string
  setSearch: (value: string) => void
}) {
  const { documents, create, open, setImporting, setDeleting } = useWorkspace()
  if (!documents)
    return (
      <p role="status" className="page">
        正在读取本地简历…
      </p>
    )
  const visible = documents.filter((d) =>
    `${d.name} ${d.content.name} ${d.targetRole}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  )
  return (
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
            从 PDF、截图或文字开始。整理真实经历，发现你的亮点，
            <br className="desktop-break" />
            为每一个心动的岗位，准备更合适的表达。
          </p>
          <div className="hero-actions">
            <Button
              variant="default"
              size="lg"
              type="button"
              className="button primary large"
              onClick={() => setImporting(true)}
            >
              <ImagePlus size={18} />
              上传简历 PDF / 截图
              <ArrowRight size={17} />
            </Button>
            <Button
              variant="ghost"
              size="layout"
              type="button"
              className="text-button"
              onClick={() => void create()}
            >
              空白创建 <Plus size={16} />
            </Button>
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
              <Input
                aria-label="搜索简历"
                placeholder="搜索简历"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <Button
              variant="outline"
              size="default"
              type="button"
              className="button secondary"
              onClick={() => void create()}
            >
              <Plus size={16} />
              新建简历
            </Button>
          </div>
        </div>
        <div className="resume-grid">
          <Button
            variant="ghost"
            size="layout"
            type="button"
            className="new-resume-card"
            onClick={() => setImporting(true)}
          >
            <span className="new-card-icon">
              <Plus size={24} />
            </span>
            <strong>你的下一份简历</strong>
            <span>上传 PDF 或截图，交给 AI 整理</span>
            <span className="new-card-link">
              开始创建 <ArrowUpRight size={16} />
            </span>
          </Button>
          {visible.map((document) => (
            <article className="resume-card" key={document.id}>
              <Button
                variant="ghost"
                size="layout"
                type="button"
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
              </Button>
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
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  className="icon-button"
                  aria-label={`删除 ${document.name}`}
                  onClick={() => setDeleting(document)}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </article>
          ))}
        </div>
        {!documents.length && (
          <div className="starter-note">
            <span>还没有准备好自己的简历？</span>
            <Button
              variant="ghost"
              size="layout"
              type="button"
              className="text-button"
              onClick={() => void create(true)}
            >
              用虚构示例体验编辑器 <ArrowRight size={14} />
            </Button>
          </div>
        )}
        {search && !visible.length && <p className="muted">没有找到匹配的简历。</p>}
      </section>
      <div className="workflow-strip">
        <div>
          <span>01</span>
          <strong>导入真实经历</strong>
          <small>PDF、截图、文字，轻松开始</small>
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
  )
}
