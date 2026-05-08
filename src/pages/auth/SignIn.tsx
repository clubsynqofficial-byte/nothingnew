import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AuthLayout from './AuthLayout'

export default function SignIn() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      navigate(searchParams.get('redirect') ?? '/')
    }
  }

  return (
    <AuthLayout>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
        Welcome back
      </h2>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 28 }}>
        Sign in to your ClubSynQ account
      </p>

      <form onSubmit={handleSubmit}>
        <Field label="Email">
          <input
            type="email"
            required
            placeholder="you@university.edu.qa"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label="Password" style={{ marginTop: 16 }}>
          <input
            type="password"
            required
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={inputStyle}
          />
        </Field>

        {error && (
          <p style={{ color: '#ff6b6b', fontSize: 13, marginTop: 12 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            ...btnPrimaryStyle,
            marginTop: 24,
            width: '100%',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>

      <p style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'var(--text-muted)' }}>
        Don't have an account?{' '}
        <Link to="/signup" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 600 }}>
          Sign up
        </Link>
      </p>
    </AuthLayout>
  )
}

function Field({ label, children, style }: { label: string; children: ReactNode; style?: object }) {
  return (
    <div style={style}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-muted)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '11px 14px',
  color: 'var(--text-primary)',
  fontSize: 15,
  outline: 'none',
  transition: 'border-color 0.2s',
}

const btnPrimaryStyle: React.CSSProperties = {
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '13px 20px',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'background 0.2s',
}
