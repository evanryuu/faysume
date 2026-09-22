import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ResumeMarkdown from '../src/components/ResumeMarkdown'

const render = (value: string) => renderToStaticMarkup(createElement(ResumeMarkdown, { value }))

describe('resume Markdown rendering', () => {
  it('renders nested lists and numbered lists as semantic list elements', () => {
    const html = render('- First outcome\n  - Nested outcome\n- Second outcome\n\n1. Research\n2. Delivery')
    expect(html.match(/<ul>/g)).toHaveLength(2)
    expect(html).toMatch(/<li>First outcome\s*<ul>/)
    expect(html).toContain('<li>Nested outcome</li>')
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>Delivery</li>')
  })

  it('renders emphasis, headings, quotes, links and code without changing their text', () => {
    const html = render(
      '### Outcomes\n\n**Bold** and *italic* and ~~removed~~\n\n> Evidence\n\n[Portfolio](https://example.com/work) and `const x = 1`\n\n```js\nconst safe = "<tag>"\n```',
    )
    expect(html).toContain('<h3>Outcomes</h3>')
    expect(html).toContain('<strong>Bold</strong>')
    expect(html).toContain('<em>italic</em>')
    expect(html).toContain('<del>removed</del>')
    expect(html).toContain('<blockquote>')
    expect(html).toContain('href="https://example.com/work"')
    expect(html).toContain('<code>const x = 1</code>')
    expect(html).toMatch(/<pre><code[^>]*>const safe = &quot;&lt;tag&gt;&quot;/)
  })

  it('renders GFM tables and read-only task lists', () => {
    const html = render(
      '| Skill | Level |\n| --- | --- |\n| React | Advanced |\n\n- [x] Shipped\n- [ ] Planned',
    )
    expect(html).toContain('<table>')
    expect(html).toContain('<th>Skill</th>')
    expect(html).toContain('<td>Advanced</td>')
    expect(html.match(/type="checkbox"/g)).toHaveLength(2)
    expect(html.match(/disabled=""/g)).toHaveLength(2)
  })

  it('shows raw HTML as text instead of creating active elements', () => {
    const html = render(
      '<script>alert(1)</script>\n\n<img src="https://example.com/track.png" onerror="alert(1)">\n\n<iframe src="https://example.com"></iframe>',
    )
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&lt;img')
    expect(html).not.toMatch(/<(?:script|img|iframe)\b/)
  })

  it.each(['javascript:alert%281%29', 'data:text/html,hello', 'vbscript:msgbox%281%29'])(
    'does not make an unsafe link actionable: %s',
    (url) => {
      const html = render(`[Unsafe](${url})`)
      expect(html).toContain('Unsafe')
      expect(html).not.toMatch(/href="(?:javascript|data|vbscript):/i)
    },
  )

  it('keeps image descriptions without loading remote images', () => {
    const html = render('![Architecture diagram](https://example.com/tracking-image.png)')
    expect(html).toContain('Architecture diagram')
    expect(html).not.toMatch(/<(?:img|link)\b/)
    expect(html).not.toContain('src=')
  })
})
