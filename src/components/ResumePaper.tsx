import type { ResumeDocument } from '../types'

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
}: {
  document: ResumeDocument
  miniature?: boolean
}) {
  const c = document.content
  return (
    <article
      className={`resume-paper template-${document.template} ${miniature ? 'miniature' : ''}`}
      data-testid={miniature ? undefined : 'resume-paper'}
      lang={document.locale}
    >
      <header className="paper-header">
        <h1>{c.name || '你的姓名'}</h1>
        {c.headline && <p className="paper-headline">{c.headline}</p>}
        <div className="paper-contact">
          {[c.email, c.phone, c.location].filter(Boolean).map((text, i) => (
            <span key={i}>{text}</span>
          ))}
          {c.website && (
            <a href={safeLink(c.website)} target="_blank" rel="noreferrer">
              {c.website}
            </a>
          )}
        </div>
      </header>
      {c.summary && (
        <section className="paper-section">
          <h2>{document.locale.startsWith('zh') ? '个人简介' : 'Profile'}</h2>
          <p className="paper-description">{c.summary}</p>
        </section>
      )}
      {c.sections.map((section) => (
        <section className="paper-section" key={section.id}>
          <h2>{section.title}</h2>
          {section.items.map((item) => (
            <div className="paper-item" key={item.id}>
              <div className="paper-item-heading">
                <div>
                  <h3>{item.title}</h3>
                  {item.organization && <p className="paper-organization">{item.organization}</p>}
                </div>
                <div className="paper-date">
                  {[item.startDate, item.endDate].filter(Boolean).join(' — ')}
                  {item.location && <span>{item.location}</span>}
                </div>
              </div>
              {item.description && <p className="paper-description">{item.description}</p>}
            </div>
          ))}
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
