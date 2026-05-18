import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AuthLayout from './AuthLayout'

export default function SignUp() {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [school, setSchool]     = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]       = useState(false)
  const [googleLoading, setGLoading] = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { data, error: signUpError } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } },
    })
    if (signUpError) { setError(signUpError.message); setLoading(false); return }
    if (data.user && school) await supabase.from('profiles').update({ school }).eq('id', data.user.id)
    setSuccess(true)
    setLoading(false)
  }

  async function handleGoogle() {
    setError('')
    setGLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    })
    if (error) { setError(error.message); setGLoading(false) }
  }

  if (success) {
    return (
      <AuthLayout>
        <div style={{ textAlign:'center', padding:'8px 0' }}>
          <div style={{ width:64, height:64, borderRadius:20, background:'linear-gradient(135deg,rgba(138,21,56,.22),rgba(192,37,90,.1))', border:'1px solid rgba(192,37,90,.3)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 22px', fontSize:26, color:'#c0255a', boxShadow:'0 0 40px rgba(192,37,90,.18)' }}>✦</div>
          <h2 style={{ fontSize:22, fontWeight:900, color:'#f3dddf', letterSpacing:'-.5px', marginBottom:12 }}>Check your email</h2>
          <p style={{ color:'rgba(243,221,223,.38)', fontSize:14, lineHeight:1.78, margin:'0 auto 32px', maxWidth:290 }}>
            We sent a confirmation link to <strong style={{ color:'#e0aab4' }}>{email}</strong>. Click it to activate your account.
          </p>
          <button onClick={() => navigate('/signin')} className="auth-btn">Go to Sign In →</button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <h2 style={{ fontSize:22, fontWeight:900, color:'#f3dddf', marginBottom:5, letterSpacing:'-.5px' }}>Create your account</h2>
      <p style={{ fontSize:13.5, color:'rgba(243,221,223,.35)', marginBottom:26, lineHeight:1.65 }}>Free forever. No credit card needed.</p>

      {/* Google */}
      <button className="auth-google-btn" onClick={handleGoogle} disabled={googleLoading} style={{ marginBottom:20, opacity:googleLoading ? .65 : 1 }}>
        <GoogleIcon />
        {googleLoading ? 'Redirecting…' : 'Sign up with Google'}
      </button>

      <Divider label="or sign up with email" />

      <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:13, marginTop:20 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <Field label="Full Name">
            <input type="text" required autoComplete="name" placeholder="Ahmad Khalil"
              value={fullName} onChange={e => setFullName(e.target.value)} className="auth-input" />
          </Field>
          <Field label="University">
            <input type="text" required placeholder="QU, CMU-Q…"
              value={school} onChange={e => setSchool(e.target.value)} className="auth-input" />
          </Field>
        </div>

        <Field label="Email">
          <input type="email" required autoComplete="email" placeholder="you@university.edu"
            value={email} onChange={e => setEmail(e.target.value)} className="auth-input" />
        </Field>

        <Field label="Password">
          <div style={{ position:'relative' }}>
            <input type={showPw ? 'text' : 'password'} required minLength={8} autoComplete="new-password" placeholder="Min. 8 characters"
              value={password} onChange={e => setPassword(e.target.value)} className="auth-input" style={{ paddingRight:52 }} />
            <button type="button" className="auth-pw-toggle" onClick={() => setShowPw(p => !p)}>{showPw ? 'Hide' : 'Show'}</button>
          </div>
          {password.length > 0 && <PasswordStrength password={password} />}
        </Field>

        {error && <ErrorBox message={error} />}

        <button type="submit" disabled={loading} className="auth-btn" style={{ marginTop:4 }}>
          {loading ? 'Creating account…' : 'Create Free Account →'}
        </button>

        <p style={{ fontSize:11, color:'rgba(243,221,223,.17)', textAlign:'center', lineHeight:1.6, margin:0 }}>
          By signing up you agree to our terms of service.
        </p>
      </form>

      <p style={{ textAlign:'center', marginTop:20, fontSize:13.5, color:'rgba(243,221,223,.32)' }}>
        Already have an account?{' '}<Link to="/signin" className="auth-link">Sign in</Link>
      </p>
    </AuthLayout>
  )
}

function PasswordStrength({ password }: { password: string }) {
  const checks = [password.length >= 8, /[A-Z]/.test(password), /[0-9]/.test(password), /[^a-zA-Z0-9]/.test(password)]
  const score  = checks.filter(Boolean).length
  const colors = ['', '#ef4444', '#f97316', '#eab308', '#22c55e']
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']
  return (
    <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ display:'flex', gap:3, flex:1 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ flex:1, height:3, borderRadius:9999, background: i <= score ? colors[score] : 'rgba(87,65,68,.22)', transition:'background .3s' }} />
        ))}
      </div>
      <span style={{ fontSize:11, fontWeight:600, color: colors[score] || 'rgba(243,221,223,.28)', minWidth:36, textAlign:'right' }}>{labels[score]}</span>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label style={{ display:'block', fontSize:10.5, fontWeight:700, letterSpacing:'.12em', color:'rgba(243,221,223,.3)', textTransform:'uppercase', marginBottom:8 }}>{label}</label>
      {children}
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div style={{ display:'flex', gap:9, padding:'11px 14px', background:'rgba(239,68,68,.07)', border:'1px solid rgba(239,68,68,.17)', borderRadius:11 }}>
      <span style={{ color:'rgba(239,68,68,.75)', flexShrink:0 }}>⚠</span>
      <span style={{ fontSize:13, color:'rgba(239,68,68,.82)', lineHeight:1.5 }}>{message}</span>
    </div>
  )
}

function Divider({ label }: { label: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
      <div style={{ flex:1, height:1, background:'rgba(87,65,68,.18)' }} />
      <span style={{ fontSize:11, color:'rgba(243,221,223,.2)', whiteSpace:'nowrap' }}>{label}</span>
      <div style={{ flex:1, height:1, background:'rgba(87,65,68,.18)' }} />
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.96L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}
