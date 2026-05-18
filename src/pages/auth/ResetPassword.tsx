import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AuthLayout from './AuthLayout'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [showPw,    setShowPw]    = useState(false)
  const [showConf,  setShowConf]  = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [ready,     setReady]     = useState(false)
  const [done,      setDone]      = useState(false)

  useEffect(() => {
    // PKCE flow: Supabase redirects with ?code= in query string
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) setError('This reset link is invalid or has expired. Please request a new one.')
        else setReady(true)
        // Clean the code out of the URL so refresh doesn't re-use it
        window.history.replaceState({}, '', window.location.pathname)
      })
      return
    }

    // Implicit flow: Supabase sets session from hash fragment and fires event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })

    // Also check if session is already active (event fired before mount)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError("Passwords don't match"); return }
    if (password.length < 8)  { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { setError(error.message); return }
    setDone(true)
    setTimeout(() => navigate('/signin'), 2800)
  }

  const checks = [password.length >= 8, /[A-Z]/.test(password), /[0-9]/.test(password), /[^a-zA-Z0-9]/.test(password)]
  const score  = checks.filter(Boolean).length
  const strengthColor = ['', '#ef4444', '#f97316', '#eab308', '#22c55e'][score]
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][score]

  if (done) {
    return (
      <AuthLayout>
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: 'linear-gradient(135deg,rgba(34,197,94,.12),rgba(34,197,94,.06))', border: '1px solid rgba(34,197,94,.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px', fontSize: 28, color: '#22c55e', boxShadow: '0 0 40px rgba(34,197,94,.12)' }}>
            ✓
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#f3dddf', letterSpacing: '-.5px', marginBottom: 12 }}>Password updated!</h2>
          <p style={{ color: 'rgba(243,221,223,.38)', fontSize: 14, lineHeight: 1.78, maxWidth: 280, margin: '0 auto' }}>
            Redirecting you to sign in…
          </p>
        </div>
      </AuthLayout>
    )
  }

  if (error && !ready) {
    return (
      <AuthLayout>
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px', fontSize: 26, color: '#f87171' }}>
            ⚠
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: '#f3dddf', letterSpacing: '-.5px', marginBottom: 12 }}>Link expired</h2>
          <p style={{ color: 'rgba(243,221,223,.38)', fontSize: 13.5, lineHeight: 1.7, maxWidth: 280, margin: '0 auto 28px' }}>{error}</p>
          <button
            onClick={() => navigate('/forgot-password')}
            className="auth-btn"
            style={{ width: '100%' }}
          >
            Request a new link →
          </button>
        </div>
      </AuthLayout>
    )
  }

  if (!ready) {
    return (
      <AuthLayout>
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid rgba(192,37,90,.2)', borderTopColor: '#c0255a', margin: '0 auto 16px' }}>
            <style>{`@keyframes rp-spin { to { transform: rotate(360deg); } }`}</style>
            <div style={{ width: '100%', height: '100%', borderRadius: '50%', animation: 'rp-spin .8s linear infinite' }} />
          </div>
          <p style={{ color: 'rgba(243,221,223,.38)', fontSize: 14 }}>Verifying reset link…</p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <h2 style={{ fontSize: 22, fontWeight: 900, color: '#f3dddf', marginBottom: 5, letterSpacing: '-.5px' }}>Set a new password</h2>
      <p style={{ fontSize: 13.5, color: 'rgba(243,221,223,.35)', marginBottom: 28, lineHeight: 1.65 }}>
        Choose a strong password you haven't used before.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: '.12em', color: 'rgba(243,221,223,.3)', textTransform: 'uppercase', marginBottom: 8 }}>
            New Password
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPw ? 'text' : 'password'}
              required
              autoComplete="new-password"
              placeholder="Min. 8 characters"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              className="auth-input"
              style={{ paddingRight: 52 }}
            />
            <button type="button" className="auth-pw-toggle" onClick={() => setShowPw(p => !p)}>
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>
          {password.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', gap: 3, flex: 1 }}>
                {[1, 2, 3, 4].map(i => (
                  <div key={i} style={{ flex: 1, height: 3, borderRadius: 9999, background: i <= score ? strengthColor : 'rgba(87,65,68,.22)', transition: 'background .3s' }} />
                ))}
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: strengthColor || 'rgba(243,221,223,.28)', minWidth: 36, textAlign: 'right' }}>
                {strengthLabel}
              </span>
            </div>
          )}
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: '.12em', color: 'rgba(243,221,223,.3)', textTransform: 'uppercase', marginBottom: 8 }}>
            Confirm Password
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showConf ? 'text' : 'password'}
              required
              autoComplete="new-password"
              placeholder="Re-enter new password"
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setError('') }}
              className="auth-input"
              style={{ paddingRight: 52, borderColor: confirm && password !== confirm ? 'rgba(239,68,68,.5)' : undefined }}
            />
            <button type="button" className="auth-pw-toggle" onClick={() => setShowConf(p => !p)}>
              {showConf ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ display: 'flex', gap: 9, padding: '11px 14px', background: 'rgba(239,68,68,.07)', border: '1px solid rgba(239,68,68,.17)', borderRadius: 11 }}>
            <span style={{ color: 'rgba(239,68,68,.75)', flexShrink: 0 }}>⚠</span>
            <span style={{ fontSize: 13, color: 'rgba(239,68,68,.82)', lineHeight: 1.5 }}>{error}</span>
          </div>
        )}

        <button type="submit" disabled={loading || !password || !confirm} className="auth-btn" style={{ marginTop: 4 }}>
          {loading ? 'Updating…' : 'Update Password →'}
        </button>
      </form>
    </AuthLayout>
  )
}
