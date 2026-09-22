import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import { Field } from './ui'
import type { ItemField, ResumeItem, Target } from '../types'

const labels: [ItemField, string][] = [
  ['title', '职位 / 项目 / 学位'],
  ['organization', '公司 / 学校'],
  ['startDate', '开始时间'],
  ['endDate', '结束时间'],
  ['location', '地点'],
]

export default function ResumeItemEditor({
  item,
  sectionId,
  index,
  count,
  write,
  onMove,
  onDelete,
}: {
  item: ResumeItem
  sectionId: string
  index: number
  count: number
  write: (target: Target, value: string, before: string) => void
  onMove: (offset: number) => void
  onDelete: () => void
}) {
  const hasDetails = labels.some(([field]) => Boolean(item[field].trim()))
  // Legacy imports containing only a description naturally open as free text.
  const isText = item.layout === 'text' || (!item.layout && !hasDetails)
  const [expanded, setExpanded] = useState(false)
  const showDetails = !isText || hasDetails || expanded
  const field = ([key, label]: [ItemField, string]) => (
    <Field
      key={key}
      label={label}
      value={item[key]}
      onCommit={(value, before) =>
        write({ kind: 'item', sectionId, itemId: item.id, field: key }, value, before)
      }
    />
  )
  return (
    <div className={`item-editor ${isText ? 'text-item-editor' : ''}`}>
      <div className="item-label">
        <span>
          {String(index + 1).padStart(2, '0')} / {item.title || (isText ? '自由文本' : '经历条目')}
        </span>
        <div>
          <Button
            variant="ghost"
            size="icon"
            className="icon-button"
            aria-label={`上移内容 ${index + 1}`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="icon-button"
            aria-label={`下移内容 ${index + 1}`}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="icon-button"
            aria-label={`删除内容 ${index + 1}`}
            onClick={onDelete}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>
      <div className="field-grid">
        {showDetails && labels.map(field)}
        <Field
          label={isText ? '文本内容' : '经历描述'}
          value={item.description}
          onCommit={(value, before) =>
            write({ kind: 'item', sectionId, itemId: item.id, field: 'description' }, value, before)
          }
          multiline
          placeholder={
            isText
              ? '自由记录技能、开源贡献、获奖或其他内容，支持 Markdown…'
              : '背景、你的行动，以及有证据支持的成果，支持 Markdown…'
          }
        />
      </div>
      {isText && !hasDetails && (
        <Button
          variant="ghost"
          size="sm"
          className="item-details-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronDown size={14} />
          {expanded ? '收起可选字段' : '补充标题、时间等'}
        </Button>
      )}
    </div>
  )
}
