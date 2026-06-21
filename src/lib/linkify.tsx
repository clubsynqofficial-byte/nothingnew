import React from 'react'

export function linkify(text: string): React.ReactNode[] {
  const re = /https?:\/\/[^\s<>"]+|www\.[^\s<>"]+/g
  const nodes: React.ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const raw = match[0]
    const href = raw.startsWith('http') ? raw : `https://${raw}`
    nodes.push(
      <a
        key={match.index}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        style={{ color: 'var(--accent)', textDecoration: 'underline', wordBreak: 'break-all' }}
      >
        {raw}
      </a>
    )
    last = match.index + raw.length
  }

  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}
