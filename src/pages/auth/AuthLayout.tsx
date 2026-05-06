import { type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

export default function AuthLayout({ children }: Props) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-dark)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background glow orbs */}
      <div style={{
        position: 'absolute',
        width: 400,
        height: 400,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(138,21,56,0.18) 0%, transparent 70%)',
        top: '-100px',
        right: '-100px',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        width: 300,
        height: 300,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(138,21,56,0.12) 0%, transparent 70%)',
        bottom: '-50px',
        left: '-50px',
        pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <span style={{
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: '0.2em',
            color: '#fff',
            textTransform: 'uppercase',
          }}>
            CLUBSYNQ
          </span>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6 }}>
            Qatar's student life, unified.
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 20,
          padding: '36px 32px',
        }}>
          {children}
        </div>
      </div>
    </div>
  )
}
