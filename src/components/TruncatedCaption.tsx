import { useState, type CSSProperties, type ReactNode } from 'react'

export default function TruncatedCaption({
  content, truncate, style, render,
}: {
  content: string
  truncate: boolean
  style?: CSSProperties
  render?: (text: string) => ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const renderText = render ?? ((t: string) => t)

  if (!truncate || expanded) {
    return (
      <p style={{ margin: 0, whiteSpace: 'pre-wrap', cursor: truncate ? 'pointer' : undefined, ...style }}
        onClick={truncate ? () => setExpanded(false) : undefined}>
        {renderText(content)}
      </p>
    )
  }

  const firstLine = content.split('\n')[0]
  const hasMore = content.length > firstLine.length

  return (
    <p style={{ margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', ...style }}
      onClick={() => setExpanded(true)}>
      {renderText(firstLine)}
      {hasMore && <span style={{ opacity: 0.55, fontWeight: 600 }}> … more</span>}
    </p>
  )
}
