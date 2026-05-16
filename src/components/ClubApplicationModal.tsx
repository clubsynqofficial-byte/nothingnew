import { useState, useEffect, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

interface FormField {
  id: string
  label: string
  type: 'text' | 'textarea' | 'select'
  placeholder?: string
  options?: string[]
  required: boolean
}

interface ClubForm {
  id: string
  club_id: string
  title: string
  description: string
  fields: FormField[]
}

interface Props {
  clubId: string
  clubName: string
  onClose: () => void
  onSubmitted: () => void
}

export default function ClubApplicationModal({ clubId, clubName, onClose, onSubmitted }: Props) {
  const { user } = useAuth()
  const [form, setForm] = useState<ClubForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('club_forms')
        .select('*')
        .eq('club_id', clubId)
        .eq('is_active', true)
        .maybeSingle()
      setForm(data ?? null)
      setLoading(false)
    }
    load()
  }, [clubId])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user || !form) return

    // Validate required fields
    for (const field of form.fields) {
      if (field.required && !answers[field.id]?.trim()) {
        setError(`Please fill in: ${field.label}`)
        return
      }
    }

    setSubmitting(true)
    setError('')

    // Remove any stale approved/rejected response so a returning member can re-apply
    await supabase
      .from('club_form_responses')
      .delete()
      .eq('club_id', clubId)
      .eq('user_id', user.id)
      .in('status', ['approved', 'rejected'])

    const { error: insertErr } = await supabase.from('club_form_responses').insert({
      form_id: form.id,
      club_id: clubId,
      user_id: user.id,
      answers,
    })

    if (insertErr) {
      if (insertErr.code === '23505') {
        setError('You have already submitted an application to this club.')
      } else {
        setError(insertErr.message)
      }
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    onSubmitted()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    padding: '10px 13px',
    color: 'var(--text-primary)',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px 16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 20,
          padding: 28,
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4, letterSpacing: '-0.3px' }}>
              Apply to {clubName}
            </h2>
            {form && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{form.description || 'Fill in the application form below.'}</p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: 20, lineHeight: 1, padding: 4,
            }}
          >✕</button>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Loading form…</div>
        ) : !form ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
            No active form found. Try refreshing.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 22 }}>
              {form.fields.map(field => (
                <div key={field.id}>
                  <label style={{
                    display: 'block', fontSize: 13, fontWeight: 600,
                    color: 'var(--text-secondary)', marginBottom: 7,
                  }}>
                    {field.label}
                    {field.required && <span style={{ color: '#f87171', marginLeft: 4 }}>*</span>}
                  </label>
                  {field.type === 'text' && (
                    <input
                      style={inputStyle}
                      placeholder={field.placeholder}
                      value={answers[field.id] ?? ''}
                      onChange={e => setAnswers(a => ({ ...a, [field.id]: e.target.value }))}
                    />
                  )}
                  {field.type === 'textarea' && (
                    <textarea
                      style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
                      placeholder={field.placeholder}
                      value={answers[field.id] ?? ''}
                      onChange={e => setAnswers(a => ({ ...a, [field.id]: e.target.value }))}
                    />
                  )}
                  {field.type === 'select' && (
                    <select
                      style={{ ...inputStyle, cursor: 'pointer' }}
                      value={answers[field.id] ?? ''}
                      onChange={e => setAnswers(a => ({ ...a, [field.id]: e.target.value }))}
                    >
                      <option value="">— Select —</option>
                      {(field.options ?? []).filter(Boolean).map((opt, i) => (
                        <option key={i} value={opt}>{opt}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>

            {error && (
              <div style={{
                marginBottom: 14, padding: '10px 14px',
                background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)',
                borderRadius: 10, fontSize: 13, color: '#f87171',
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  flex: 1, padding: '11px', background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 11,
                  color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  flex: 2, padding: '11px',
                  background: submitting ? 'rgba(138,21,56,0.4)' : 'var(--accent)',
                  border: 'none', borderRadius: 11,
                  color: '#fff', fontSize: 14, fontWeight: 700,
                  cursor: submitting ? 'default' : 'pointer', fontFamily: 'inherit',
                  boxShadow: submitting ? 'none' : '0 4px 16px rgba(138,21,56,0.35)',
                }}
              >
                {submitting ? 'Submitting…' : 'Submit Application'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  )
}
