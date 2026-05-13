import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Club } from '../../types'

interface FormField {
  id: string
  label: string
  type: 'text' | 'textarea' | 'select'
  placeholder?: string
  options?: string[]   // for select
  required: boolean
}

interface ClubForm {
  id: string
  title: string
  description: string
  fields: FormField[]
  is_active: boolean
}

interface ResponseRow {
  id: string
  user_id: string
  answers: Record<string, string>
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  profile: { full_name: string | null; email: string | null } | null
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

export default function ClubFormBuilder({ club }: { club: Club }) {
  const [form, setForm] = useState<ClubForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [responses, setResponses] = useState<ResponseRow[]>([])
  const [tab, setTab] = useState<'builder' | 'responses'>('builder')
  const [actionId, setActionId] = useState<string | null>(null)

  useEffect(() => { fetchForm() }, [club.id])

  async function fetchForm() {
    setLoading(true)
    const { data } = await supabase
      .from('club_forms')
      .select('*')
      .eq('club_id', club.id)
      .maybeSingle()
    setForm(data ?? null)
    setLoading(false)
  }

  async function fetchResponses() {
    if (!form) return
    const { data } = await supabase
      .from('club_form_responses')
      .select('id, user_id, answers, status, created_at, profile:profiles(full_name, email)')
      .eq('club_id', club.id)
      .order('created_at', { ascending: false })
    setResponses((data as unknown as ResponseRow[]) ?? [])
  }

  useEffect(() => {
    if (tab === 'responses') fetchResponses()
  }, [tab, form])

  // ── Create or update form ──
  async function handleSave() {
    if (!form) return
    setSaving(true)
    setMsg('')
    const payload = {
      club_id: club.id,
      title: form.title,
      description: form.description,
      fields: form.fields,
      is_active: form.is_active,
    }
    if (form.id) {
      await supabase.from('club_forms').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', form.id)
    } else {
      const { data } = await supabase.from('club_forms').insert(payload).select().single()
      if (data) setForm({ ...form, id: data.id })
    }
    setSaving(false)
    setMsg('Saved!')
    setTimeout(() => setMsg(''), 2500)
  }

  async function handleToggleActive(val: boolean) {
    if (!form) return
    if (!form.id) { setMsg('Save the form first.'); return }
    await supabase.from('club_forms').update({ is_active: val }).eq('id', form.id)
    setForm(f => f ? { ...f, is_active: val } : f)
    setMsg(val ? 'Form is now active — users must apply to join.' : 'Form disabled — users can join directly.')
    setTimeout(() => setMsg(''), 3000)
  }

  async function handleCreateForm() {
    setForm({ id: '', title: 'Club Application', description: '', fields: [], is_active: false })
  }

  function addField(type: FormField['type']) {
    const newField: FormField = { id: uid(), label: '', type, placeholder: '', required: false, options: type === 'select' ? [''] : undefined }
    setForm(f => f ? { ...f, fields: [...f.fields, newField] } : f)
  }

  function updateField(id: string, patch: Partial<FormField>) {
    setForm(f => f ? { ...f, fields: f.fields.map(field => field.id === id ? { ...field, ...patch } : field) } : f)
  }

  function removeField(id: string) {
    setForm(f => f ? { ...f, fields: f.fields.filter(field => field.id !== id) } : f)
  }

  function moveField(id: string, dir: -1 | 1) {
    setForm(f => {
      if (!f) return f
      const idx = f.fields.findIndex(fi => fi.id === id)
      if (idx < 0) return f
      const next = idx + dir
      if (next < 0 || next >= f.fields.length) return f
      const arr = [...f.fields]
      ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
      return { ...f, fields: arr }
    })
  }

  function addOption(fieldId: string) {
    setForm(f => f ? {
      ...f,
      fields: f.fields.map(fi => fi.id === fieldId
        ? { ...fi, options: [...(fi.options ?? []), ''] }
        : fi)
    } : f)
  }

  function updateOption(fieldId: string, idx: number, val: string) {
    setForm(f => f ? {
      ...f,
      fields: f.fields.map(fi => {
        if (fi.id !== fieldId) return fi
        const opts = [...(fi.options ?? [])]
        opts[idx] = val
        return { ...fi, options: opts }
      })
    } : f)
  }

  function removeOption(fieldId: string, idx: number) {
    setForm(f => f ? {
      ...f,
      fields: f.fields.map(fi => {
        if (fi.id !== fieldId) return fi
        const opts = [...(fi.options ?? [])]
        opts.splice(idx, 1)
        return { ...fi, options: opts }
      })
    } : f)
  }

  async function handleApprove(resp: ResponseRow) {
    setActionId(resp.id)
    await supabase.from('club_form_responses').update({ status: 'approved' }).eq('id', resp.id)
    await supabase.from('club_memberships').upsert({ club_id: club.id, user_id: resp.user_id, role: 'member' })
    setResponses(rs => rs.map(r => r.id === resp.id ? { ...r, status: 'approved' } : r))
    setActionId(null)
  }

  async function handleReject(resp: ResponseRow) {
    setActionId(resp.id)
    await supabase.from('club_form_responses').update({ status: 'rejected' }).eq('id', resp.id)
    setResponses(rs => rs.map(r => r.id === resp.id ? { ...r, status: 'rejected' } : r))
    setActionId(null)
  }

  const sectionBox: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: '9px 13px',
    color: 'var(--text-primary)',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  }

  if (loading) return (
    <div style={{ ...sectionBox, color: 'var(--text-muted)', fontSize: 13 }}>Loading form settings…</div>
  )

  // ── No form yet ──
  if (!form) return (
    <div style={sectionBox}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Application Form</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Optionally require applicants to fill a custom form before joining.
          </p>
        </div>
      </div>
      <button
        onClick={handleCreateForm}
        style={{
          background: 'var(--accent)', border: 'none', borderRadius: 10,
          padding: '10px 22px', color: '#fff', fontSize: 14, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        + Create Application Form
      </button>
    </div>
  )

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Header with toggle */}
      <div style={{ ...sectionBox, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>Application Form</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {form.is_active ? 'Active — users must submit an application to join.' : 'Inactive — users can join without a form.'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Tab switcher */}
            {(['builder', 'responses'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '7px 16px', borderRadius: 9999, fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit', border: 'none',
                  background: tab === t ? 'var(--accent)' : 'rgba(255,255,255,0.07)',
                  color: tab === t ? '#fff' : 'var(--text-muted)',
                  transition: 'all 0.15s',
                }}
              >
                {t === 'builder' ? 'Form Builder' : 'Applications'}
              </button>
            ))}
            {/* Active toggle */}
            <button
              onClick={() => handleToggleActive(!form.is_active)}
              style={{
                padding: '7px 16px', borderRadius: 9999, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', border: 'none',
                background: form.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.07)',
                color: form.is_active ? '#4ade80' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}
            >
              {form.is_active ? '● Active' : '○ Inactive'}
            </button>
          </div>
        </div>
        {msg && (
          <div style={{ marginTop: 12, fontSize: 13, color: msg.startsWith('Save') ? '#f87171' : '#4ade80' }}>{msg}</div>
        )}
      </div>

      {tab === 'builder' ? (
        <>
          {/* Form meta */}
          <div style={sectionBox}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Form Title
              </label>
              <input
                style={inputStyle}
                value={form.title}
                onChange={e => setForm(f => f ? { ...f, title: e.target.value } : f)}
                placeholder="e.g. Club Application"
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Description (optional)
              </label>
              <textarea
                style={{ ...inputStyle, minHeight: 68, resize: 'vertical' }}
                value={form.description}
                onChange={e => setForm(f => f ? { ...f, description: e.target.value } : f)}
                placeholder="Tell applicants what this form is for…"
              />
            </div>
          </div>

          {/* Fields */}
          <div style={sectionBox}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
              Form Fields
            </h3>

            {form.fields.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                No fields yet. Add fields below.
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              {form.fields.map((field, idx) => (
                <div key={field.id} style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  borderRadius: 12,
                  padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                      padding: '2px 8px', borderRadius: 9999,
                      background: 'rgba(138,21,56,0.15)', border: '1px solid rgba(138,21,56,0.3)',
                      color: 'var(--accent-hover)', textTransform: 'uppercase',
                    }}>
                      {field.type}
                    </span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                      <button onClick={() => moveField(field.id, -1)} disabled={idx === 0} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, opacity: idx === 0 ? 0.3 : 1 }}>↑</button>
                      <button onClick={() => moveField(field.id, 1)} disabled={idx === form.fields.length - 1} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, opacity: idx === form.fields.length - 1 ? 0.3 : 1 }}>↓</button>
                      <button onClick={() => removeField(field.id)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14 }}>✕</button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Label *</label>
                      <input
                        style={inputStyle}
                        value={field.label}
                        onChange={e => updateField(field.id, { label: e.target.value })}
                        placeholder="e.g. Why do you want to join?"
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Placeholder</label>
                      <input
                        style={inputStyle}
                        value={field.placeholder ?? ''}
                        onChange={e => updateField(field.id, { placeholder: e.target.value })}
                        placeholder="Hint text…"
                      />
                    </div>
                  </div>

                  {field.type === 'select' && (
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Options</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(field.options ?? []).map((opt, oi) => (
                          <div key={oi} style={{ display: 'flex', gap: 6 }}>
                            <input
                              style={{ ...inputStyle, flex: 1 }}
                              value={opt}
                              onChange={e => updateOption(field.id, oi, e.target.value)}
                              placeholder={`Option ${oi + 1}`}
                            />
                            <button
                              onClick={() => removeOption(field.id, oi)}
                              style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}
                            >✕</button>
                          </div>
                        ))}
                        <button
                          onClick={() => addOption(field.id)}
                          style={{
                            alignSelf: 'flex-start', background: 'none',
                            border: '1px dashed rgba(255,255,255,0.15)',
                            borderRadius: 8, padding: '5px 12px',
                            color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >+ Add option</button>
                      </div>
                    </div>
                  )}

                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)' }}>
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={e => updateField(field.id, { required: e.target.checked })}
                      style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
                    />
                    Required
                  </label>
                </div>
              ))}
            </div>

            {/* Add field buttons */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {([
                { type: 'text', label: '+ Short Text' },
                { type: 'textarea', label: '+ Long Text' },
                { type: 'select', label: '+ Dropdown' },
              ] as const).map(({ type, label }) => (
                <button
                  key={type}
                  onClick={() => addField(type)}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 9,
                    padding: '7px 14px',
                    color: 'var(--text-secondary)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              background: saving ? 'rgba(138,21,56,0.4)' : 'var(--accent)',
              border: 'none', borderRadius: 11,
              padding: '11px 28px',
              color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: saving ? 'default' : 'pointer',
              fontFamily: 'inherit',
              boxShadow: saving ? 'none' : '0 4px 16px rgba(138,21,56,0.35)',
            }}
          >
            {saving ? 'Saving…' : 'Save Form'}
          </button>
        </>
      ) : (
        /* Applications tab */
        <div style={sectionBox}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
            Applications ({responses.length})
          </h3>
          {responses.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No applications yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {responses.map(resp => (
                <div key={resp.id} style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${
                    resp.status === 'approved' ? 'rgba(34,197,94,0.25)' :
                    resp.status === 'rejected' ? 'rgba(248,113,113,0.25)' :
                    'rgba(255,255,255,0.07)'
                  }`,
                  borderRadius: 12,
                  padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {resp.profile?.full_name ?? 'Unknown User'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {resp.profile?.email ?? ''} · {new Date(resp.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {resp.status === 'pending' ? (
                        <>
                          <button
                            onClick={() => handleApprove(resp)}
                            disabled={actionId === resp.id}
                            style={{
                              padding: '6px 14px', borderRadius: 9, fontSize: 13, fontWeight: 700,
                              cursor: 'pointer', fontFamily: 'inherit', border: 'none',
                              background: 'rgba(34,197,94,0.15)', color: '#4ade80',
                            }}
                          >
                            {actionId === resp.id ? '…' : 'Approve'}
                          </button>
                          <button
                            onClick={() => handleReject(resp)}
                            disabled={actionId === resp.id}
                            style={{
                              padding: '6px 14px', borderRadius: 9, fontSize: 13, fontWeight: 700,
                              cursor: 'pointer', fontFamily: 'inherit', border: 'none',
                              background: 'rgba(248,113,113,0.12)', color: '#f87171',
                            }}
                          >
                            Reject
                          </button>
                        </>
                      ) : (
                        <span style={{
                          fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
                          padding: '3px 10px', borderRadius: 9999, textTransform: 'uppercase',
                          background: resp.status === 'approved' ? 'rgba(34,197,94,0.1)' : 'rgba(248,113,113,0.1)',
                          color: resp.status === 'approved' ? '#4ade80' : '#f87171',
                          border: `1px solid ${resp.status === 'approved' ? 'rgba(34,197,94,0.3)' : 'rgba(248,113,113,0.3)'}`,
                        }}>
                          {resp.status}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Answers */}
                  {form.fields.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {form.fields.map(field => (
                        <div key={field.id}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {field.label}
                          </div>
                          <div style={{
                            fontSize: 13, color: 'var(--text-secondary)',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: 8, padding: '7px 10px',
                          }}>
                            {resp.answers[field.id] || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No answer</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
