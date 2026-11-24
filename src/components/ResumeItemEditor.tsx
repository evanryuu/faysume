import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import { Field } from './ui'
import { itemLabel } from '../domain'
import type { ItemField, ResumeItem, SectionKind, Target } from '../types'

const detailFields: ItemField[] = ['title', 'organization', 'startDate', 'endDate', 'location']
/** 这些区块的条目默认不显示用不上的字段，已经填了值的照常显示 */
const hiddenByKind: Partial<Record<SectionKind, ItemField[]>> = {
  skills: ['organization', 'startDate', 'endDate', 'location'],
  overview: ['location'],
}
const placeholders: Partial<Record<ItemField, string>> = {
  startDate: '例如 2023.03',
  endDate: '例如 2024.06，或写「至今」',
}

export default function ResumeItemEditor({
  item,
  sectionId,
  kind,
  index,
  count,
  write,
  onMove,
  onDelete,
}: {
  item: ResumeItem
  sectionId: string
  kind: SectionKind
  index: number
  count: number
  write: (target: Target, value: string, before: string) => void
  onMove: (offset: number) => void
  onDelete: () => void
}) {
  const hasDetails = detailFields.some((field) => Boolean(item[field].trim()))
  // Legacy imports containing only a description naturally open as free text.
  const isText = item.layout === 'text' || (!item.layout && !hasDetails)
  const [expanded, setExpanded] = useState(false)
  const showDetails = !isText || hasDetails || expanded
  const isOverviewRow = kind === 'overview' && !isText
  const fields = detailFields.filter((key) => !hiddenByKind[kind]?.includes(key) || item[key].trim())
  const field = (key: ItemField) => (
    <Field
      key={key}
      label={itemLabel(kind, key)}
      placeholder={placeholders[key]}
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
        {showDetails && fields.map(field)}
        {!(isOverviewRow && !item.description) && (
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
        )}
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
