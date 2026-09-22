import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { diffText } from '../src/textDiff'
import SuggestionDiff from '../src/components/SuggestionDiff'

const summaryBefore = '4年经验前端开发，曾任小组长，数个开源项目Contributor'
const summaryAfter =
  '4 年经验的前端/全栈开发，曾任项目前端小组长，多个开源项目 Contributor，具备 Next.js + Go/Node.js 全栈交付、云服务部署与 AI API 集成经验。'
const skillsBefore =
  '熟练使用Next.js进行SSR项目开发与部署；\n这个还是可以的；\n熟练运用AI辅助日常开发，具备调用AI API开发智能功能的经验；'
const skillsAfter =
  '熟练使用 Next.js 进行 SSR 项目开发与部署；\n熟练运用 AI 辅助日常开发，具备调用 AI API 开发智能功能的经验；'

describe('suggestion text differences', () => {
  it('keeps shared Chinese wording when spaces and new facts are added', () => {
    const changes = diffText(summaryBefore, summaryAfter)!
    expect(
      changes
        .filter((part) => part.removed)
        .map((part) => part.value)
        .join(''),
    ).toBe('数')
    expect(
      changes
        .filter((part) => !part.removed && !part.added)
        .map((part) => part.value)
        .join(''),
    ).toContain('4年经验前端开发，曾任小组长，个开源项目Contributor')
  })

  it('marks the deleted line without striking retained skills', () => {
    const changes = diffText(skillsBefore, skillsAfter)!
    expect(
      changes
        .filter((part) => part.removed)
        .map((part) => part.value)
        .join(''),
    ).toBe('这个还是可以的；\n')
    expect(
      changes
        .filter((part) => !part.removed && !part.added)
        .map((part) => part.value)
        .join(''),
    ).toContain('熟练使用Next.js进行SSR项目开发与部署；')
  })

  it.each([
    [summaryBefore, summaryAfter],
    [skillsBefore, skillsAfter],
    ['前端\nReact / Vue', '前端\nReact / Vue'],
    ['', '新简介'],
    ['旧简介', ''],
    ['', ''],
    ['React\r\nVue\t开发', 'React\nVue  开发\n'],
    ['👩‍💻开发😀', '👩‍💻开发🚀'],
    ['重复文字重复文字', '重复文字新增文字'],
    ['甲'.repeat(50_000) + '前端开发', '甲'.repeat(50_000) + '前端/全栈开发'],
  ])('preserves both original texts exactly (%#)', (before, after) => {
    const changes = diffText(before, after)
    expect(changes).toBeDefined()
    expect(
      changes!
        .filter((part) => !part.added)
        .map((part) => part.value)
        .join(''),
    ).toBe(before)
    expect(
      changes!
        .filter((part) => !part.removed)
        .map((part) => part.value)
        .join(''),
    ).toBe(after)
  })

  it('renders only changed fragments as deletions or insertions', () => {
    const markup = renderToStaticMarkup(
      createElement(SuggestionDiff, { before: '参与前端开发', after: '专注前端页面开发' }),
    )
    expect(markup).toContain('<del>参与</del>')
    expect(markup).toContain('<ins>专注</ins>')
    expect(markup).toContain('<ins>页面</ins>')
    expect(markup).toContain('<span class="diff-unchanged">前端</span>')
    expect(markup).not.toContain('<del>参与前端开发</del>')
  })

  it('escapes markup in AI text', () => {
    const markup = renderToStaticMarkup(
      createElement(SuggestionDiff, { before: '', after: '<script>alert(1)</script>' }),
    )
    expect(markup).not.toContain('<script>')
    expect(markup).toContain('&lt;script&gt;')
  })

  it('falls back to neutral full text with an explicit note for very large rewrites', () => {
    const markup = renderToStaticMarkup(
      createElement(SuggestionDiff, { before: '甲'.repeat(10_000), after: '乙'.repeat(10_000) }),
    )
    expect(markup).toContain('未逐字标记差异')
    expect(markup).not.toContain('<del>')
    expect(markup).not.toContain('<ins>')
  })
})
