import { Fragment, type ReactNode } from 'react'

// Render a small, safe Markdown subset as React text nodes; never interpret HTML.
function inline(text: string): ReactNode {
  return text
    .split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g)
    .map((part, index) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : part.startsWith('`') && part.endsWith('`') ? (
        <code key={index}>{part.slice(1, -1)}</code>
      ) : (
        <Fragment key={index}>{part}</Fragment>
      ),
    )
}

function readableText(text: string) {
  // Older analyses were saved as one paragraph with these explicit section labels.
  // Only promote labels when multiple sections exist; leave ordinary replies alone.
  const labels =
    /(^|[。！？\n]\s*)(表达质量|已有亮点|岗位匹配|语言\/招聘市场适配|语言与招聘市场适配|语言与市场适配|招聘市场适配)[：:]/g
  if (!/^\s*#{1,6}\s/m.test(text) && [...text.matchAll(labels)].length >= 2) {
    return text.replace(
      labels,
      (_, boundary: string, title: string) => `${boundary.trim()}\n\n### ${title}\n`,
    )
  }
  return text
}

function paragraphs(text: string) {
  if (text.length < 180) return [text]
  // Keep sentences intact while giving existing dense replies some breathing room.
  const sentences = text.match(/[^。！？]*[。！？][”’」』"]*|[^。！？]+$/g) ?? [text]
  const result: string[] = []
  let current = ''
  for (const sentence of sentences) {
    current += sentence
    if (current.length >= 110) {
      result.push(current)
      current = ''
    }
  }
  if (current) result.push(current)
  return result
}

export default function AssistantMessage({ text }: { text: string }) {
  const lines = readableText(text).replace(/\r\n?/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  for (let i = 0; i < lines.length; ) {
    const line = lines[i].trim()
    if (!line) {
      i++
      continue
    }
    const heading = line.match(/^#{1,6}\s+(.+)$/)
    if (heading) {
      blocks.push(<h4 key={i}>{inline(heading[1])}</h4>)
      i++
      continue
    }
    const list = line.match(/^(?:([-*+])|(\d+)[.)])\s+(.+)$/)
    if (list) {
      const ordered = Boolean(list[2])
      const start = i
      const items: ReactNode[] = []
      while (i < lines.length) {
        const item = lines[i].trim().match(/^(?:([-*+])|(\d+)[.)])\s+(.+)$/)
        if (!item || Boolean(item[2]) !== ordered) break
        items.push(<li key={i}>{inline(item[3])}</li>)
        i++
      }
      blocks.push(
        ordered ? (
          <ol key={start} start={Number(list[2])}>
            {items}
          </ol>
        ) : (
          <ul key={start}>{items}</ul>
        ),
      )
      continue
    }
    const start = i
    const body: string[] = [lines[i++]]
    while (i < lines.length && lines[i].trim() && !/^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s)/.test(lines[i]))
      body.push(lines[i++])
    blocks.push(
      ...paragraphs(body.join('\n')).map((part, index) => <p key={`${start}-${index}`}>{inline(part)}</p>),
    )
  }
  return <div className="assistant-content">{blocks}</div>
}
