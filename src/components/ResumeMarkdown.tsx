import { memo } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

const components: Components = {
  a: ({ href, children }) =>
    href ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  // Resume content stays local: embedded Markdown images never trigger a request.
  img: ({ alt }) => <span>{alt}</span>,
}
const plugins = [remarkGfm]

/** Shared by thumbnails, paginated preview, direct editing and PDF output. */
export default memo(function ResumeMarkdown({ value }: { value: string }) {
  return (
    <div className="resume-markdown">
      <Markdown remarkPlugins={plugins} components={components}>
        {value}
      </Markdown>
    </div>
  )
})
