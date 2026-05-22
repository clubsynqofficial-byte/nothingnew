import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AuthLayout from './AuthLayout'

export default function SignIn() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]       = useState(false)
  const [googleLoading, setGLoading] = useState(false)
  const [error, setError]           = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else navigate(searchParams.get('redirect') ?? '/')
  }

  async function handleGoogle() {
    setError('')
    setGLoading(true)
    const redirect = searchParams.get('redirect')
    if (redirect) sessionStorage.setItem('post_auth_redirect', redirect)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    })
    if (error) { setError(error.message); setGLoading(false) }
  }

  return (
    <AuthLayout>
      <h2 style={{ fontSize:22, fontWeight:900, color:'#f3dddf', marginBottom:5, letterSpacing:'-.5px' }}>Welcome back</h2>
      <p style={{ fontSize:13.5, color:'rgba(243,221,223,.35)', marginBottom:26, lineHeight:1.65 }}>Sign in to your ClubSynq account</p>

      {/* Google */}
      <button className="auth-google-btn" onClick={handleGoogle} disabled={googleLoading} style={{ marginBottom:20, opacity:googleLoading ? .65 : 1 }}>
        <GoogleIcon />
        {googleLoading ? 'Redirecting…' : 'Continue with Google'}
      </button>

      <Divider label="or continue with email" />

      <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14, marginTop:20 }}>
        <Field label="Email">
          <input type="email" required autoComplete="email" placeholder="you@email.com"
            value={email} onChange={e => setEmail(e.target.value)} className="auth-input" />
        </Field>

        <Field label="Password" action={<Link to="/forgot-password" style={{ fontSize:11, color:'rgba(192,37,90,.7)', textDecoration:'none', fontWeight:600 }}>Forgot?</Link>}>
          <div style={{ position:'relative' }}>
            <input type={showPw ? 'text' : 'password'} required autoComplete="current-password" placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)} className="auth-input" style={{ paddingRight:52 }} />
            <button type="button" className="auth-pw-toggle" onClick={() => setShowPw(p => !p)}>{showPw ? 'Hide' : 'Show'}</button>
          </div>
        </Field>

        {error && <ErrorBox message={error} />}

        <button type="submit" disabled={loading} className="auth-btn" style={{ marginTop:4 }}>
          {loading ? 'Signing in…' : 'Sign In →'}
        </button>
      </form>

      <p style={{ textAlign:'center', marginTop:22, fontSize:13.5, color:'rgba(243,221,223,.32)' }}>
        No account?{' '}<Link to={`/signup${searchParams.get('redirect') ? `?redirect=${encodeURIComponent(searchParams.get('redirect')!)}` : ''}`} className="auth-link">Create one free</Link>
      </p>
    </AuthLayout>
  )
}

function Field({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
        <label style={{ fontSize:10.5, fontWeight:700, letterSpacing:'.12em', color:'rgba(243,221,223,.3)', textTransform:'uppercase' }}>{label}</label>
        {action}
      </div>
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
