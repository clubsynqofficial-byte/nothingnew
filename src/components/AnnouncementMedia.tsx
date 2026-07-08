import { useState } from 'react'

export default function AnnouncementMedia({
  imageUrls, videoUrl, onImageClick,
}: {
  imageUrls: string[]
  videoUrl?: string | null
  onImageClick?: (url: string) => void
}) {
  const [cur, setCur] = useState(0)
  const [touchX, setTouchX] = useState<number | null>(null)

  if (videoUrl) {
    return (
      <div style={{ borderRadius: 10, overflow: 'hidden', lineHeight: 0, background: '#000' }}>
        <video src={videoUrl} controls playsInline style={{ width: '100%', maxHeight: 460, display: 'block' }} />
      </div>
    )
  }

  if (imageUrls.length === 0) return null

  if (imageUrls.length === 1) {
    return (
      <div style={{ borderRadius: 10, overflow: 'hidden', lineHeight: 0, cursor: onImageClick ? 'pointer' : undefined }}
        onClick={() => onImageClick?.(imageUrls[0])}>
        <img src={imageUrls[0]} alt="" style={{ width: '100%', maxHeight: 460, objectFit: 'cover', display: 'block' }} />
      </div>
    )
  }

  const prev = () => setCur(c => (c - 1 + imageUrls.length) % imageUrls.length)
  const next = () => setCur(c => (c + 1) % imageUrls.length)

  return (
    <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', lineHeight: 0, userSelect: 'none' }}
      onTouchStart={e => setTouchX(e.touches[0].clientX)}
      onTouchEnd={e => {
        if (touchX === null) return
        const dx = e.changedTouches[0].clientX - touchX
        if (dx < -40) next(); else if (dx > 40) prev()
        setTouchX(null)
      }}
    >
      <div style={{ display: 'flex', transition: 'transform .3s cubic-bezier(.22,1,.36,1)', transform: `translateX(-${cur * 100}%)` }}>
        {imageUrls.map((u, i) => (
          <img key={i} src={u} alt="" style={{ width: '100%', flexShrink: 0, maxHeight: 460, objectFit: 'cover', display: 'block', cursor: onImageClick ? 'pointer' : undefined }}
            onClick={() => onImageClick?.(u)} />
        ))}
      </div>

      {cur > 0 && (
        <button onClick={e => { e.stopPropagation(); prev() }} style={{
          position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
          width: 30, height: 30, borderRadius: '50%', border: 'none',
          background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(6px)',
          color: '#fff', fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
        }}>‹</button>
      )}
      {cur < imageUrls.length - 1 && (
        <button onClick={e => { e.stopPropagation(); next() }} style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          width: 30, height: 30, borderRadius: '50%', border: 'none',
          background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(6px)',
          color: '#fff', fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
        }}>›</button>
      )}

      <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 4 }}>
        {imageUrls.map((_, i) => (
          <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i === cur ? '#fff' : 'rgba(255,255,255,.4)' }} />
        ))}
      </div>
    </div>
  )
}
