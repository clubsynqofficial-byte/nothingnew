import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import AuthLayout from './AuthLayout'

export default function SignUp() {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [school, setSchool] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    // Save school name to profile
    if (data.user && school) {
      await supabase
        .from('profiles')
        .update({ school })
        .eq('id', data.user.id)
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <AuthLayout>
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'rgba(138,21,56,0.2)',
            border: '1px solid var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            fontSize: 24,
            color: 'var(--text-primary)',
          }}>
            ✓
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
            Check your email
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6 }}>
            We sent a confirmation link to{' '}
            <strong style={{ color: 'var(--text-secondary)' }}>{email}</strong>.
            Click it to activate your account.
          </p>
          <button
            onClick={() => navigate('/signin')}
            style={{ ...btnPrimaryStyle, marginTop: 28, padding: '11px 28px' }}
          >
            Go to Sign In
          </button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
        Create your account
      </h2>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 28 }}>
        Join Qatar's student network
      </p>

      <form onSubmit={handleSubmit}>
        <Field label="Full Name">
          <input
            type="text"
            required
            placeholder="Your name"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label="School / University" style={{ marginTop: 16 }}>
          <input
            type="text"
            required
            placeholder="e.g. Qatar University, CMU-Q"
            value={school}
            onChange={e => setSchool(e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label="Email" style={{ marginTop: 16 }}>
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
            minLength={8}
            placeholder="Min. 8 characters"
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
          style={{ ...btnPrimaryStyle, marginTop: 24, width: '100%', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Creating account…' : 'Create Account'}
        </button>
      </form>

      <p style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'var(--text-muted)' }}>
        Already have an account?{' '}
        <Link to="/signin" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 600 }}>
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}

function Field({ label, children, style }: { label: string; children: ReactNode; style?: React.CSSProperties }) {
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
}
