import { useEffect, useRef, useState } from 'react'
import type { ResumeDocument } from '../types'
import { resolveAppearance } from '../appearance'
import ResumePaper from './ResumePaper'

export default function ResumePreview({ document }: { document: ResumeDocument }) {
  const container = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setScale(Math.min(1, entry.contentRect.width / ((210 * 96) / 25.4)))
    })
    if (container.current) observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  const appearance = resolveAppearance(document.appearance)
  return (
    <>
      <style>{`@media print { @page { size: A4 portrait; margin: ${appearance.margin}mm; } }`}</style>
      <div className="paper-canvas" ref={container}>
        <div className="resume-preview-scale" style={{ zoom: scale }}>
          <ResumePaper document={document} />
        </div>
      </div>
    </>
  )
}
