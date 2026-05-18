import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AuthLayout from './AuthLayout'

export default function ForgotPassword() {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setSent(true)
  }

  if (sent) {
    return (
      <AuthLayout>
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: 'linear-gradient(135deg,rgba(138,21,56,.22),rgba(192,37,90,.1))', border: '1px solid rgba(192,37,90,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px', fontSize: 26, color: '#c0255a', boxShadow: '0 0 40px rgba(192,37,90,.18)' }}>
            ✉
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#f3dddf', letterSpacing: '-.5px', marginBottom: 12 }}>Check your inbox</h2>
          <p style={{ color: 'rgba(243,221,223,.38)', fontSize: 14, lineHeight: 1.78, margin: '0 auto 32px', maxWidth: 290 }}>
            We sent a password reset link to <strong style={{ color: '#e0aab4' }}>{email}</strong>. It expires in 1 hour.
          </p>
          <Link to="/signin" className="auth-btn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', padding: '14px 20px', borderRadius: 12, fontWeight: 700, fontSize: 15, letterSpacing: '.04em', color: '#fff' }}>
            Back to Sign In →
          </Link>
          <button
            type="button"
            onClick={() => { setSent(false); setEmail('') }}
            style={{ marginTop: 16, background: 'none', border: 'none', color: 'rgba(243,221,223,.35)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Try a different email
          </button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <div style={{ marginBottom: 24 }}>
        <Link to="/signin" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'rgba(243,221,223,.35)', fontSize: 13, textDecoration: 'none', fontWeight: 600, transition: 'color .15s' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'rgba(243,221,223,.7)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(243,221,223,.35)')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Back to sign in
        </Link>
      </div>

      <h2 style={{ fontSize: 22, fontWeight: 900, color: '#f3dddf', marginBottom: 5, letterSpacing: '-.5px' }}>Forgot your password?</h2>
      <p style={{ fontSize: 13.5, color: 'rgba(243,221,223,.35)', marginBottom: 28, lineHeight: 1.65 }}>
        Enter your email and we'll send you a reset link.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: '.12em', color: 'rgba(243,221,223,.3)', textTransform: 'uppercase', marginBottom: 8 }}>
            Email
          </label>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@university.edu"
            value={email}
            onChange={e => { setEmail(e.target.value); setError('') }}
            className="auth-input"
          />
        </div>

        {error && (
          <div style={{ display: 'flex', gap: 9, padding: '11px 14px', background: 'rgba(239,68,68,.07)', border: '1px solid rgba(239,68,68,.17)', borderRadius: 11 }}>
            <span style={{ color: 'rgba(239,68,68,.75)', flexShrink: 0 }}>⚠</span>
            <span style={{ fontSize: 13, color: 'rgba(239,68,68,.82)', lineHeight: 1.5 }}>{error}</span>
          </div>
        )}

        <button type="submit" disabled={loading} className="auth-btn" style={{ marginTop: 4 }}>
          {loading ? 'Sending…' : 'Send Reset Link →'}
        </button>
      </form>
    </AuthLayout>
  )
}
