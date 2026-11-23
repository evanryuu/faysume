import { useId, useState } from 'react'
import { readableAccent } from '../appearance'
import { markdownElements, type MarkdownElement, type MarkdownElementStyle } from '../markdownAppearance'
import type { ResumeAppearance } from '../types'
import { Button } from './ui/button'
import { NativeSelect, NativeSelectOption } from './ui/native-select'

const labels: Record<keyof MarkdownElementStyle, string> = {
  color: '文字颜色',
  backgroundColor: '背景颜色',
  borderColor: '边框颜色',
  headerBackground: '表头背景',
  fontSize: '字号',
  spacing: '上下间距',
  lineHeight: '行距',
  indent: '缩进',
  itemSpacing: '列表项间距',
  borderWidth: '边框粗细',
  fontWeight: '字重',
  textAlign: '文字对齐',
  underline: '链接下划线',
  listStyle: '列表标记',
}
const numericOptions: Partial<Record<keyof MarkdownElementStyle, readonly number[]>> = {
  fontSize: [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24],
  spacing: [0, 0.25, 0.5, 0.75, 1, 1.5],
  lineHeight: [1.1, 1.3, 1.5, 1.65, 1.8, 2, 2.2],
  indent: [1.2, 1.6, 2, 2.4, 3],
  itemSpacing: [0, 0.15, 0.25, 0.5, 0.75, 1],
  borderWidth: [0, 0.5, 1, 2, 3],
  fontWeight: [400, 500, 600, 700],
}
const syntaxExamples: Record<MarkdownElement, string> = {
  h1: '# 一级标题',
  h2: '## 二级标题',
  h3: '### 三级标题',
  h4: '#### 四级标题',
  h5: '##### 五级标题',
  h6: '###### 六级标题',
  p: '普通正文，空行分隔段落',
  strong: '**重点成果**',
  a: '[作品集](https://example.com)',
  ul: '- 项目成果',
  ol: '1. 项目成果',
  blockquote: '> 引用内容',
  code: '`TypeScript`',
  pre: '```\n代码内容\n```',
  table: '| 技能 | 熟练程度 |\n| --- | --- |\n| React | 熟练 |',
}

function numberLabel(field: keyof MarkdownElementStyle, value: number) {
  if (field === 'fontSize' || field === 'borderWidth') return `${value} pt`
  if (field === 'fontWeight') return `${{ 400: '常规', 500: '中等', 600: '半粗', 700: '加粗' }[value]}`
  if (field === 'lineHeight') return `${value} 倍`
  return `${value} 倍字号`
}

export default function MarkdownAppearancePanel({
  appearance,
  onChange,
}: {
  appearance: ResumeAppearance
  onChange: (element: MarkdownElement, patch: Partial<MarkdownElementStyle> | null) => void
}) {
  const [element, setElement] = useState<MarkdownElement>('h2')
  const id = useId()
  const definition = markdownElements.find((item) => item.value === element)!
  const style = appearance.markdown?.[element] ?? {}
  const customized = Object.keys(style).length > 0
  const defaultColor = (field: keyof MarkdownElementStyle) => {
    if (field === 'borderColor') return '#dce0e4'
    if (field === 'headerBackground') return '#ffffff'
    if (field === 'backgroundColor') return element === 'blockquote' ? '#ffffff' : '#f3f4f6'
    if (element.startsWith('h') || element === 'a') return readableAccent(appearance.accentColor)
    return element === 'blockquote' ? '#59616b' : '#282c32'
  }
  const fieldControl = (field: keyof MarkdownElementStyle) => {
    const value = style[field]
    const label = labels[field]
    if (['color', 'backgroundColor', 'borderColor', 'headerBackground'].includes(field)) {
      return (
        <div className="markdown-color-field" key={field}>
          <label htmlFor={`${id}-${field}`}>{label}</label>
          <div className="markdown-color-control">
            <input
              id={`${id}-${field}`}
              type="color"
              value={typeof value === 'string' ? value : defaultColor(field)}
              onChange={(event) => onChange(element, { [field]: event.currentTarget.value })}
            />
            <span>{value ?? '跟随默认'}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`恢复${label}默认值`}
              disabled={value === undefined}
              onClick={() => onChange(element, { [field]: undefined })}
            >
              默认
            </Button>
          </div>
        </div>
      )
    }
    const numbers = numericOptions[field]
    let options: { value: string; label: string }[]
    if (numbers) {
      // Backups may contain any valid value in the supported range.
      const choices = typeof value === 'number' && !numbers.includes(value) ? [...numbers, value] : numbers
      options = choices.map((number) => ({ value: String(number), label: numberLabel(field, number) }))
    } else if (field === 'textAlign') {
      options = [
        { value: 'left', label: '左对齐' },
        { value: 'center', label: '居中' },
        { value: 'right', label: '右对齐' },
      ]
    } else if (field === 'underline') {
      options = [
        { value: 'true', label: '显示' },
        { value: 'false', label: '隐藏' },
      ]
    } else {
      options =
        element === 'ul'
          ? [
              { value: 'disc', label: '实心圆点' },
              { value: 'circle', label: '空心圆点' },
              { value: 'square', label: '方形' },
            ]
          : [
              { value: 'decimal', label: '数字 1、2、3' },
              { value: 'lower-alpha', label: '字母 a、b、c' },
              { value: 'upper-roman', label: '罗马数字 I、II、III' },
            ]
    }
    return (
      <label key={field}>
        {label}
        <NativeSelect
          value={value === undefined ? '' : String(value)}
          onChange={(event) => {
            const next = event.currentTarget.value
            onChange(element, {
              [field]:
                next === ''
                  ? undefined
                  : numbers
                    ? Number(next)
                    : field === 'underline'
                      ? next === 'true'
                      : next,
            })
          }}
        >
          <NativeSelectOption value="">跟随默认</NativeSelectOption>
          {options.map((option) => (
            <NativeSelectOption key={option.value} value={option.value}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
    )
  }
  return (
    <details className="markdown-appearance">
      <summary>Markdown 元素样式</summary>
      <section aria-label="Markdown 元素样式">
        <p className="appearance-note">只影响个人简介和正文，不影响姓名、职位和区块标题。</p>
        <div className="appearance-fields markdown-element-picker">
          <label>
            Markdown 元素
            <NativeSelect
              value={element}
              onChange={(event) => setElement(event.currentTarget.value as MarkdownElement)}
            >
              {markdownElements.map((item) => (
                <NativeSelectOption value={item.value} key={item.value}>
                  {item.label}
                  {appearance.markdown?.[item.value] ? ' · 已自定义' : ''}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        </div>
        <p className="markdown-syntax-example">
          语法示例：<code>{syntaxExamples[element]}</code>
        </p>
        <div className="appearance-fields markdown-style-fields">{definition.fields.map(fieldControl)}</div>
        <div className="markdown-style-footer">
          <span className="appearance-note">
            {customized ? '已自定义，自动保存' : '当前元素使用默认样式'}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!customized}
            onClick={() => onChange(element, null)}
          >
            恢复该元素默认样式
          </Button>
        </div>
      </section>
    </details>
  )
}
