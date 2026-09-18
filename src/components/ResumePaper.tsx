import type { ItemField, ProfileField, ResumeDocument, Target } from '../types'
import EditablePaperText from './EditablePaperText'

function safeLink(value: string) {
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined
  } catch {
    return undefined
  }
}
export default function ResumePaper({
  document,
  miniature = false,
  onEdit,
}: {
  document: ResumeDocument
  miniature?: boolean
  onEdit?: (target: Target, value: string, before: string) => Promise<boolean>
}) {
  const c = document.content
  const editable = Boolean(onEdit && !miniature)
  const text = (
    value: string,
    target: Target,
    label: string,
    multiline = false,
    inline = false,
    placeholder = '',
  ) =>
    editable ? (
      <EditablePaperText
        value={value}
        label={label}
        multiline={multiline}
        inline={inline}
        placeholder={placeholder}
        onCommit={(next, before) => onEdit!(target, next, before)}
      />
    ) : (
      value || placeholder
    )
  const profile = (field: ProfileField, label: string, multiline = false, inline = false, placeholder = '') =>
    text(c[field], { kind: 'profile', field }, label, multiline, inline, placeholder)
  return (
    <article
      className={`resume-paper template-${document.template} ${miniature ? 'miniature' : ''}`}
      data-testid={miniature ? undefined : 'resume-paper'}
      lang={document.locale}
    >
      <header className="paper-header">
        <h1>{profile('name', '姓名', false, false, '你的姓名')}</h1>
        {c.headline && <p className="paper-headline">{profile('headline', '职业标题')}</p>}
        <div className="paper-contact">
          {(
            [
              ['email', '邮箱'],
              ['phone', '电话'],
              ['location', '所在地'],
            ] as const
          )
            .filter(([field]) => c[field])
            .map(([field, label]) => (
              <span key={field}>{profile(field, label, false, true)}</span>
            ))}
          {c.website && (
            <a
              href={safeLink(c.website)}
              target="_blank"
              rel="noreferrer"
              tabIndex={editable ? -1 : undefined}
              onClick={editable ? (event) => event.preventDefault() : undefined}
            >
              {profile('website', '个人网站', false, true)}
            </a>
          )}
        </div>
      </header>
      {c.summary && (
        <section className="paper-section">
          <h2>{document.locale.startsWith('zh') ? '个人简介' : 'Profile'}</h2>
          <p className="paper-description">{profile('summary', '个人简介', true)}</p>
        </section>
      )}
      {c.sections.map((section) => (
        <section className="paper-section" key={section.id}>
          <h2>
            {text(section.title, { kind: 'section', sectionId: section.id, field: 'title' }, '区块标题')}
          </h2>
          {section.items.map((item) => {
            const itemText = (field: ItemField, label: string, multiline = false, inline = false) =>
              text(
                item[field],
                { kind: 'item', sectionId: section.id, itemId: item.id, field },
                label,
                multiline,
                inline,
              )
            return (
              <div className="paper-item" key={item.id}>
                {[item.title, item.organization, item.startDate, item.endDate, item.location].some(
                  Boolean,
                ) && (
                  <div className="paper-item-heading">
                    <div>
                      {item.title && <h3>{itemText('title', '职位 / 项目 / 学位')}</h3>}
                      {item.organization && (
                        <p className="paper-organization">{itemText('organization', '公司 / 学校')}</p>
                      )}
                    </div>
                    <div className="paper-date">
                      {item.startDate && itemText('startDate', '开始时间', false, true)}
                      {item.startDate && item.endDate && ' — '}
                      {item.endDate && itemText('endDate', '结束时间', false, true)}
                      {item.location && <span>{itemText('location', '地点')}</span>}
                    </div>
                  </div>
                )}
                {item.description && (
                  <p className="paper-description">{itemText('description', '文本内容', true)}</p>
                )}
              </div>
            )
          })}
        </section>
      ))}
      {!c.summary && !c.sections.length && !c.headline && (
        <div className="paper-placeholder">
          {miniature
            ? '从这里开始你的下一次机会'
            : '在左侧填写内容，或上传简历截图。\n你的经历会在这里呈现。'}
        </div>
      )}
    </article>
  )
}
