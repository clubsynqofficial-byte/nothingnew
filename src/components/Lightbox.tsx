import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

export type LightboxMedia =
  | { type: 'image'; urls: string[]; index: number }
  | { type: 'video'; url: string; time?: number }

export default function Lightbox({ media, onClose }: { media: LightboxMedia | null; onClose: () => void }) {
  const [rendered, setRendered] = useState(media)
  const [visible, setVisible] = useState(false)
  const [idx, setIdx] = useState(media?.type === 'image' ? media.index : 0)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (media) {
      setRendered(media)
      setIdx(media.type === 'image' ? media.index : 0)
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
    } else if (rendered) {
      setVisible(false)
      const t = setTimeout(() => setRendered(null), 220)
      return () => clearTimeout(t)
    }
  }, [media])

  useEffect(() => {
    if (!rendered) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (rendered?.type === 'image') {
        if (e.key === 'ArrowLeft') setIdx(i => (i - 1 + rendered.urls.length) % rendered.urls.length)
        if (e.key === 'ArrowRight') setIdx(i => (i + 1) % rendered.urls.length)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rendered, onClose])

  if (!rendered) return null

  const urls = rendered.type === 'image' ? rendered.urls : []

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.93)', backdropFilter: 'blur(18px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, cursor: 'zoom-out',
        opacity: visible ? 1 : 0,
        transition: 'opacity .22s cubic-bezier(.22,1,.36,1)',
      }}
    >
      {rendered.type === 'video' ? (
        <video
          ref={videoRef}
          src={rendered.url}
          controls
          autoPlay
          playsInline
          onClick={e => e.stopPropagation()}
          onLoadedMetadata={() => { if (videoRef.current && rendered.time) videoRef.current.currentTime = rendered.time }}
          style={{
            maxWidth: '92vw', maxHeight: '88vh',
            borderRadius: 14, boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
            cursor: 'default',
            transform: visible ? 'scale(1)' : 'scale(0.96)',
            transition: 'transform .22s cubic-bezier(.22,1,.36,1)',
          }}
        />
      ) : (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'relative',
            transform: visible ? 'scale(1)' : 'scale(0.96)',
            transition: 'transform .22s cubic-bezier(.22,1,.36,1)',
          }}
        >
          <img
            src={urls[idx]}
            alt=""
            style={{
              maxWidth: '92vw', maxHeight: '88vh',
              objectFit: 'contain', borderRadius: 14,
              boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
              display: 'block',
            }}
          />
          {urls.length > 1 && (
            <>
              <button
                onClick={e => { e.stopPropagation(); setIdx(i => (i - 1 + urls.length) % urls.length) }}
                style={navBtnStyle('left')}
              >‹</button>
              <button
                onClick={e => { e.stopPropagation(); setIdx(i => (i + 1) % urls.length) }}
                style={navBtnStyle('right')}
              >›</button>
              <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 5 }}>
                {urls.map((_, i) => (
                  <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i === idx ? '#fff' : 'rgba(255,255,255,.4)' }} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 18, right: 18,
          width: 38, height: 38, borderRadius: '50%',
          background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
          color: '#fff', fontSize: 18, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >✕</button>
    </div>,
    document.body,
  )
}

function navBtnStyle(side: 'left' | 'right'): CSSProperties {
  return {
    position: 'absolute', [side]: 14, top: '50%', transform: 'translateY(-50%)',
    width: 42, height: 42, borderRadius: '50%', border: 'none',
    background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(6px)',
    color: '#fff', fontSize: 20, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
  }
}
