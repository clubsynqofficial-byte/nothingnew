import { useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from '../contexts/AuthContext'

interface Props {
  onClose: () => void
}

export default function UserQRModal({ onClose }: Props) {
  const { user, profile } = useAuth()
  const cardRef = useRef<HTMLDivElement>(null)

  if (!user) return null

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, paddingTop: 'calc(64px + 24px)',
      }}
      onClick={onClose}
    >
      <div
        ref={cardRef}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 28,
          padding: '36px 28px 28px',
          maxWidth: 340, width: '100%',
          textAlign: 'center',
          boxShadow: '0 40px 100px rgba(0,0,0,0.7)',
          animation: 'qrPop 0.22s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <style>{`@keyframes qrPop{from{opacity:0;transform:scale(0.9)}to{opacity:1;transform:scale(1)}}`}</style>

        {/* Avatar */}
        <div style={{
          width: 60, height: 60, borderRadius: '50%',
          background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 800, color: '#fff',
          margin: '0 auto 12px', overflow: 'hidden',
          border: '3px solid rgba(138,21,56,0.4)',
        }}>
          {profile?.avatar_url
            ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : initials
          }
        </div>

        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          {profile?.full_name ?? 'Student'}
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: 'rgba(233,193,118,0.1)', border: '1px solid rgba(233,193,118,0.25)',
          borderRadius: 9999, padding: '3px 12px',
          fontSize: 12, fontWeight: 700, color: 'var(--gold)',
          marginBottom: 24,
        }}>
          {profile?.karak_points ?? 0} Karak Points
        </div>

        {/* QR Code */}
        <div style={{
          background: '#fff', borderRadius: 18,
          padding: 16, display: 'inline-block',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          <QRCodeSVG value={user.id} size={200} level="M" />
        </div>

        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 18, marginBottom: 24, lineHeight: 1.5 }}>
          Show this to the event organiser to check in and earn Karak Points
        </p>

        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '11px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12, color: 'var(--text-muted)',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </div>
  )
}
