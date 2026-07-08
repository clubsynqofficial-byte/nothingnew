import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import type { LightboxMedia } from './Lightbox'

const FRAME_RATIO = '4 / 5'

function VolumeIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      {muted ? (
        <>
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </>
      ) : (
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
      )}
    </svg>
  )
}

function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  )
}

function IconBtn({ onClick, children, style }: { onClick: (e: MouseEvent) => void; children: ReactNode; style?: CSSProperties }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(e) }}
      style={{
        width: 30, height: 30, borderRadius: '50%', border: 'none',
        background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(6px)',
        color: '#fff', fontSize: 14, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
        transition: 'transform .15s ease, background .15s ease',
        ...style,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,.75)'; e.currentTarget.style.transform = 'scale(1.08)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,.55)'; e.currentTarget.style.transform = (style?.transform as string) ?? 'scale(1)' }}
    >{children}</button>
  )
}

function FeedVideo({ url, onExpand }: { url: string; onExpand?: (m: LightboxMedia) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(true)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    const video = videoRef.current
    if (!el || !video) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!paused) video.play().catch(() => {})
        } else {
          video.pause()
        }
      },
      { threshold: 0.6 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [paused])

  return (
    <div ref={containerRef} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', lineHeight: 0, background: '#000', aspectRatio: FRAME_RATIO }}
      onClick={() => {
        if (!videoRef.current) return
        if (videoRef.current.paused) { videoRef.current.play().catch(() => {}); setPaused(false) }
        else { videoRef.current.pause(); setPaused(true) }
      }}
    >
      <video
        ref={videoRef}
        src={url}
        muted={muted}
        loop
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: 'pointer' }}
      />
      <IconBtn onClick={() => setMuted(m => !m)} style={{ position: 'absolute', bottom: 10, left: 10 }}>
        <VolumeIcon muted={muted} />
      </IconBtn>
      {onExpand && (
        <IconBtn
          onClick={() => onExpand({ type: 'video', url, time: videoRef.current?.currentTime ?? 0 })}
          style={{ position: 'absolute', bottom: 10, right: 10 }}
        ><ExpandIcon /></IconBtn>
      )}
    </div>
  )
}

export default function AnnouncementMedia({
  imageUrls, videoUrl, onExpand,
}: {
  imageUrls: string[]
  videoUrl?: string | null
  onExpand?: (media: LightboxMedia) => void
}) {
  const [cur, setCur] = useState(0)
  const [touchX, setTouchX] = useState<number | null>(null)

  if (videoUrl) return <FeedVideo url={videoUrl} onExpand={onExpand} />

  if (imageUrls.length === 0) return null

  if (imageUrls.length === 1) {
    return (
      <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', lineHeight: 0, aspectRatio: FRAME_RATIO, cursor: onExpand ? 'zoom-in' : undefined }}
        onClick={() => onExpand?.({ type: 'image', urls: imageUrls, index: 0 })}>
        <img src={imageUrls[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform .25s ease' }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.015)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }} />
        {onExpand && <div style={{ position: 'absolute', bottom: 10, right: 10 }}><IconBtn onClick={() => onExpand({ type: 'image', urls: imageUrls, index: 0 })}><ExpandIcon /></IconBtn></div>}
      </div>
    )
  }

  const prev = () => setCur(c => (c - 1 + imageUrls.length) % imageUrls.length)
  const next = () => setCur(c => (c + 1) % imageUrls.length)

  return (
    <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', lineHeight: 0, userSelect: 'none', aspectRatio: FRAME_RATIO }}
      onTouchStart={e => setTouchX(e.touches[0].clientX)}
      onTouchEnd={e => {
        if (touchX === null) return
        const dx = e.changedTouches[0].clientX - touchX
        if (dx < -40) next(); else if (dx > 40) prev()
        setTouchX(null)
      }}
    >
      <div style={{ display: 'flex', height: '100%', transition: 'transform .3s cubic-bezier(.22,1,.36,1)', transform: `translateX(-${cur * 100}%)` }}>
        {imageUrls.map((u, i) => (
          <img key={i} src={u} alt="" style={{ width: '100%', height: '100%', flexShrink: 0, objectFit: 'cover', display: 'block', cursor: onExpand ? 'zoom-in' : undefined }}
            onClick={() => onExpand?.({ type: 'image', urls: imageUrls, index: i })} />
        ))}
      </div>

      {cur > 0 && (
        <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
          <IconBtn onClick={prev} style={{ width: 30, height: 30, fontSize: 15, background: 'rgba(0,0,0,.65)' }}>‹</IconBtn>
        </div>
      )}
      {cur < imageUrls.length - 1 && (
        <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
          <IconBtn onClick={next} style={{ width: 30, height: 30, fontSize: 15, background: 'rgba(0,0,0,.65)' }}>›</IconBtn>
        </div>
      )}

      {onExpand && <div style={{ position: 'absolute', bottom: 10, right: 10 }}><IconBtn onClick={() => onExpand({ type: 'image', urls: imageUrls, index: cur })}><ExpandIcon /></IconBtn></div>}

      <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 4 }}>
        {imageUrls.map((_, i) => (
          <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i === cur ? '#fff' : 'rgba(255,255,255,.4)', transition: 'background .2s ease' }} />
        ))}
      </div>
    </div>
  )
}
