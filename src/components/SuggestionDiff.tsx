import { useMemo } from 'react'
import { diffText } from '../textDiff'

export default function SuggestionDiff({ before, after }: { before: string; after: string }) {
  const changes = useMemo(() => diffText(before, after), [before, after])
  return (
    <div className="suggestion-diff" role="group" aria-label="修改对比">
      {(['before', 'after'] as const).map((side) => {
        const original = side === 'before'
        const text = original ? before : after
        return (
          <div className={`diff ${side}`} key={side}>
            <span className="diff-marker" aria-hidden="true">
              {original ? '−' : '+'}
            </span>
            <div className="diff-content">
              <small>{original ? '原文' : '建议'}</small>
              <p>
                {!text ? (
                  <span className="diff-empty">{original ? '（空）' : '（删除此内容）'}</span>
                ) : !changes ? (
                  text
                ) : (
                  changes.map((change, index) => {
                    if ((original && change.added) || (!original && change.removed)) return null
                    if (change.removed) return <del key={index}>{change.value}</del>
                    if (change.added) return <ins key={index}>{change.value}</ins>
                    return (
                      <span className="diff-unchanged" key={index}>
                        {change.value}
                      </span>
                    )
                  })
                )}
              </p>
            </div>
          </div>
        )
      })}
      {!changes && <p className="diff-notice">内容改动较大，显示完整前后文，未逐字标记差异。</p>}
    </div>
  )
}
