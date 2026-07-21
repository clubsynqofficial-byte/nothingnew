import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Club } from '../../types'

interface Position {
  id: string
  title: string
  description: string | null
  requirements: string | null
  type: 'Full-time' | 'Part-time' | 'Volunteer' | 'Internship'
  deadline: string | null
  is_open: boolean
  created_at: string
}

interface Application {
  id: string
  position_id: string
  user_id: string
  cover_letter: string | null
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
  profile: { full_name: string | null; email: string | null } | null
}

const TYPES = ['Volunteer', 'Part-time', 'Full-time', 'Internship'] as const

const TYPE_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  'Full-time':  { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.25)'  },
  'Part-time':  { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.25)'  },
  'Volunteer':  { color: '#c084fc', bg: 'rgba(192,132,252,0.1)', border: 'rgba(192,132,252,0.25)' },
  'Internship': { color: '#fb923c', bg: 'rgba(251,146,60,0.1)',  border: 'rgba(251,146,60,0.25)'  },
}

const inputSt: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
  padding: '10px 13px', color: 'var(--text-primary)',
  fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}

const sectionBox: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 16, padding: 24, marginBottom: 20,
}

export default function ClubPositions({ club }: { club: Club }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [positions, setPositions] = useState<Position[]>([])
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'positions' | 'applications'>('positions')
  const [showForm, setShowForm] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [filterPosId, setFilterPosId] = useState<string | null>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [requirements, setRequirements] = useState('')
  const [type, setType] = useState<typeof TYPES[number]>('Volunteer')
  const [deadline, setDeadline] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => { fetchAll() }, [club.id])

  async function fetchAll() {
    setLoading(true)
    const [posRes, appRes] = await Promise.all([
      supabase
        .from('club_positions')
        .select('*')
        .eq('club_id', club.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('club_position_applications')
        .select('id, position_id, user_id, cover_letter, status, created_at, profile:profiles(full_name, email)')
        .eq('club_id', club.id)
        .order('created_at', { ascending: false }),
    ])
    setPositions((posRes.data as Position[]) ?? [])
    setApplications((appRes.data as unknown as Application[]) ?? [])
    setLoading(false)
  }

  function resetForm() {
    setTitle(''); setDescription(''); setRequirements('')
    setType('Volunteer'); setDeadline(''); setFormError('')
  }

  async function handleCreate() {
    if (!title.trim()) { setFormError('Title is required.'); return }
    setSaving(true)
    setFormError('')
    const { error } = await supabase.from('club_positions').insert({
      club_id: club.id,
      title: title.trim(),
      description: description.trim() || null,
      requirements: requirements.trim() || null,
      type,
      deadline: deadline || null,
    })
    if (error) { setFormError(error.message); setSaving(false); return }
    setSaving(false)
    setShowForm(false)
    resetForm()
    fetchAll()
  }

  async function toggleOpen(pos: Position) {
    setActionId(pos.id)
    await supabase.from('club_positions').update({ is_open: !pos.is_open }).eq('id', pos.id)
    setPositions(ps => ps.map(p => p.id === pos.id ? { ...p, is_open: !pos.is_open } : p))
    setActionId(null)
  }

  async function handleDelete(posId: string) {
    setActionId(posId)
    await supabase.from('club_positions').delete().eq('id', posId)
    setPositions(ps => ps.filter(p => p.id !== posId))
    setApplications(as => as.filter(a => a.position_id !== posId))
    setActionId(null)
  }

  async function handleMessage(userId: string, name: string | null) {
    if (!user) return
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(participant_1.eq.${user.id},participant_2.eq.${userId}),and(participant_1.eq.${userId},participant_2.eq.${user.id})`)
      .eq('type', 'dm')
      .maybeSingle()
    let convId = existing?.id
    if (!convId) {
      const { data: created } = await supabase
        .from('conversations')
        .insert({ participant_1: user.id, participant_2: userId, type: 'dm' })
        .select('id').single()
      convId = created?.id
    }
    if (!convId) return
    navigate('/messages', { state: { dmConvId: convId, dmOtherId: userId, dmOtherName: name } })
  }

  async function handleAppAction(app: Application, status: 'accepted' | 'rejected') {
    setActionId(app.id)
    await supabase.from('club_position_applications').update({ status }).eq('id', app.id)
    if (status === 'accepted') {
      const pos = positions.find(p => p.id === app.position_id)
      await supabase.from('club_memberships').upsert({
        club_id: club.id,
        user_id: app.user_id,
        role: 'member',
        custom_role: pos?.title ?? null,
      })
    }
    setApplications(as => as.map(a => a.id === app.id ? { ...a, status } : a))
    setActionId(null)
  }

  const visibleApps = filterPosId
    ? applications.filter(a => a.position_id === filterPosId)
    : applications

  const pendingCount = applications.filter(a => a.status === 'pending').length

  if (loading) return (
    <div style={{ ...sectionBox, color: 'var(--text-muted)', fontSize: 13 }}>Loading positions…</div>
  )

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Header */}
      <div style={sectionBox}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>Positions</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Post open roles for your club and review applicants.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['positions', 'applications'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '7px 16px', borderRadius: 9999, fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit', border: 'none', position: 'relative',
                  background: tab === t ? 'var(--accent)' : 'rgba(255,255,255,0.07)',
                  color: tab === t ? '#fff' : 'var(--text-muted)',
                }}
              >
                {t === 'positions' ? 'Positions' : 'Applications'}
                {t === 'applications' && pendingCount > 0 && (
                  <span style={{
                    position: 'absolute', top: -4, right: -4,
                    width: 18, height: 18, borderRadius: '50%',
                    background: '#f87171', color: '#fff',
                    fontSize: 10, fontWeight: 800, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}>{pendingCount > 9 ? '9+' : pendingCount}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'positions' ? (
        <>
          {/* Create form */}
          {showForm ? (
            <div style={sectionBox}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 18 }}>New Position</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Title *</label>
                  <input style={inputSt} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Social Media Manager" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Type</label>
                    <select
                      style={{ ...inputSt, cursor: 'pointer' }}
                      value={type}
                      onChange={e => setType(e.target.value as typeof TYPES[number])}
                    >
                      {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Application Deadline</label>
                    <input type="date" style={inputSt} value={deadline} onChange={e => setDeadline(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Description</label>
                  <textarea style={{ ...inputSt, minHeight: 80, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} placeholder="What will this person do?" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Requirements</label>
                  <textarea style={{ ...inputSt, minHeight: 68, resize: 'vertical' }} value={requirements} onChange={e => setRequirements(e.target.value)} placeholder="Skills, experience, or qualities needed…" />
                </div>
              </div>
              {formError && (
                <div style={{ marginTop: 12, fontSize: 13, color: '#f87171', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 10, padding: '9px 13px' }}>{formError}</div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button onClick={() => { setShowForm(false); resetForm() }} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                <button onClick={handleCreate} disabled={saving} style={{ flex: 2, padding: '10px', background: saving ? 'rgba(138,21,56,0.4)' : 'var(--accent)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', boxShadow: saving ? 'none' : '0 4px 16px rgba(138,21,56,0.3)' }}>
                  {saving ? 'Posting…' : 'Post Position'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              style={{ marginBottom: 16, background: 'var(--accent)', border: 'none', borderRadius: 10, padding: '10px 22px', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(138,21,56,0.3)', transition: 'all 0.15s' }}
            >
              + Post New Position
            </button>
          )}

          {/* List */}
          {positions.length === 0 ? (
            <div style={{ ...sectionBox, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '40px 20px' }}>
              <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>📋</div>
              No positions posted yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {positions.map(pos => {
                const tc = TYPE_COLORS[pos.type]
                const appCount = applications.filter(a => a.position_id === pos.id).length
                const pendingPos = applications.filter(a => a.position_id === pos.id && a.status === 'pending').length
                return (
                  <div key={pos.id} style={{ ...sectionBox, marginBottom: 0, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{pos.title}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 9999, background: tc.bg, border: `1px solid ${tc.border}`, color: tc.color }}>{pos.type}</span>
                        {!pos.is_open && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.1)' }}>CLOSED</span>}
                      </div>
                      {pos.description && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}>{pos.description}</p>}
                      <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                        {pos.deadline && <span>📅 {new Date(pos.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                        <button
                          onClick={() => { setTab('applications'); setFilterPosId(pos.id) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, fontFamily: 'inherit', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
                          onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                        >
                          👥 {appCount} applicant{appCount !== 1 ? 's' : ''}
                          {pendingPos > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#fb923c' }}> ({pendingPos} pending)</span>}
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => toggleOpen(pos)}
                        disabled={actionId === pos.id}
                        style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: pos.is_open ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.06)', color: pos.is_open ? '#4ade80' : 'var(--text-muted)', transition: 'all 0.15s' }}
                      >
                        {pos.is_open ? 'Open' : 'Closed'}
                      </button>
                      <button
                        onClick={() => handleDelete(pos.id)}
                        disabled={actionId === pos.id}
                        style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: 'rgba(248,113,113,0.08)', color: '#f87171', transition: 'all 0.15s' }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : (
        /* Applications tab */
        <div style={sectionBox}>
          {/* Position filter */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
            <button
              onClick={() => setFilterPosId(null)}
              style={{ padding: '5px 13px', borderRadius: 9999, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: !filterPosId ? 'var(--accent)' : 'rgba(255,255,255,0.07)', color: !filterPosId ? '#fff' : 'var(--text-muted)' }}
            >All</button>
            {positions.map(pos => (
              <button
                key={pos.id}
                onClick={() => setFilterPosId(pos.id)}
                style={{ padding: '5px 13px', borderRadius: 9999, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: filterPosId === pos.id ? 'var(--accent)' : 'rgba(255,255,255,0.07)', color: filterPosId === pos.id ? '#fff' : 'var(--text-muted)', whiteSpace: 'nowrap' }}
              >{pos.title}</button>
            ))}
          </div>

          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>
            {visibleApps.length} Application{visibleApps.length !== 1 ? 's' : ''}
          </h3>

          {visibleApps.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>No applications yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {visibleApps.map(app => {
                const pos = positions.find(p => p.id === app.position_id)
                return (
                  <div key={app.id} style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${app.status === 'accepted' ? 'rgba(74,222,128,0.25)' : app.status === 'rejected' ? 'rgba(248,113,113,0.2)' : 'rgba(255,255,255,0.07)'}`,
                    borderRadius: 12, padding: '14px 16px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: app.cover_letter ? 12 : 0, gap: 10 }}>
                      <div>
                        <div onClick={() => navigate(`/profile/${app.user_id}`)} style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2, cursor: 'pointer' }}>
                          {app.profile?.full_name ?? 'Unknown User'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {pos?.title ?? '—'} · {new Date(app.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {app.status === 'pending' ? (
                          <>
                            <button onClick={() => handleAppAction(app, 'accepted')} disabled={actionId === app.id} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>
                              {actionId === app.id ? '…' : 'Accept'}
                            </button>
                            <button onClick={() => handleMessage(app.user_id, app.profile?.full_name ?? null)} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: 'rgba(96,165,250,0.12)', color: '#60a5fa' }}>
                              💬 Message
                            </button>
                            <button onClick={() => handleAppAction(app, 'rejected')} disabled={actionId === app.id} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>
                              Reject
                            </button>
                          </>
                        ) : (
                          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 11px', borderRadius: 9999, background: app.status === 'accepted' ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.1)', color: app.status === 'accepted' ? '#4ade80' : '#f87171', border: `1px solid ${app.status === 'accepted' ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.25)'}` }}>
                            {app.status}
                          </span>
                        )}
                      </div>
                    </div>
                    {app.cover_letter && (
                      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 9, padding: '10px 12px' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Cover Letter</div>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}>{app.cover_letter}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
