import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'profile' | 'account' | 'notifications'
interface Toast { id: number; msg: string; type: 'success' | 'error' }

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
  @keyframes st-up    { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:none} }
  @keyframes st-toast { from{opacity:0;transform:translateY(10px) scale(.97)} to{opacity:1;transform:none} }
  @keyframes st-spin  { to{transform:rotate(360deg)} }
  @keyframes st-modal { from{opacity:0;transform:scale(.94)} to{opacity:1;transform:none} }
  .st-card  { animation: st-up 0.3s cubic-bezier(0.22,1,0.36,1) both; }
  .st-tab   { transition: background .13s, color .13s; cursor: pointer; }
  .st-tab:hover:not(.st-tab-active) { background: rgba(255,255,255,.05) !important; color: #fff !important; }
  .st-input { transition: border-color .15s, box-shadow .15s; outline: none; }
  .st-input:focus { border-color: rgba(192,24,92,.6) !important; box-shadow: 0 0 0 3px rgba(138,21,56,.12) !important; }
  .st-btn   { transition: opacity .14s, transform .14s; cursor: pointer; }
  .st-btn:hover:not(:disabled) { opacity: .88; transform: translateY(-1px); }
  .st-btn:active:not(:disabled) { transform: translateY(0); }
  .st-btn:disabled { opacity: .4; cursor: not-allowed; }
  .st-skill-tag:hover { background: rgba(255,60,60,.14) !important; }
  .st-toggle { transition: background .2s, box-shadow .2s; cursor: pointer; user-select: none; }
  .st-av-overlay { opacity: 0; transition: opacity .15s; }
  .st-av-wrap:hover .st-av-overlay { opacity: 1; }
  .st-row-hover { transition: background .12s; }
  .st-row-hover:hover { background: rgba(255,255,255,.03) !important; }
  @media(max-width:640px) {
    .st-outer-pad { padding: 20px 16px 80px !important; }
    .st-layout { flex-direction: column !important; }
    .st-sidebar { width: 100% !important; position: static !important; flex-direction: row !important; overflow-x: auto !important; scrollbar-width: none !important; border-radius: 12px !important; }
    .st-sidebar::-webkit-scrollbar { display: none; }
    .st-sidebar button { flex-shrink: 0 !important; border-left: none !important; border-bottom: 3px solid transparent !important; white-space: nowrap !important; padding: 11px 14px !important; }
    .st-sidebar button.st-tab-active { border-bottom-color: #c0185c !important; }
    .st-del-modal { padding: 24px 18px !important; }
  }
`

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,.04)',
  border: '1.5px solid rgba(255,255,255,.1)',
  borderRadius: 12, padding: '11px 14px',
  color: '#fff', fontSize: 14, fontFamily: 'inherit',
  caretColor: '#c0185c',
}

function SectionHead({ title, desc }: { title: string; desc?: string }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '-0.2px', marginBottom: 4 }}>{title}</div>
      {desc && <div style={{ fontSize: 13, color: 'rgba(255,255,255,.42)', lineHeight: 1.55 }}>{desc}</div>}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.5)', marginBottom: 7, letterSpacing: '.06em', textTransform: 'uppercase' }}>
        {label}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.28)', marginTop: 5, lineHeight: 1.45 }}>{hint}</div>}
    </div>
  )
}

function SaveBtn({ saving, label = 'Save Changes', disabled = false }: { saving: boolean; label?: string; disabled?: boolean }) {
  return (
    <button
      type="submit"
      className="st-btn"
      disabled={saving || disabled}
      style={{
        padding: '11px 28px',
        background: 'linear-gradient(135deg,#8a1538,#c0185c)',
        border: 'none', borderRadius: 12,
        color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
        boxShadow: '0 2px 14px rgba(138,21,56,.4)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}
    >
      {saving && <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', animation: 'st-spin .8s linear infinite' }} />}
      {saving ? 'Saving…' : label}
    </button>
  )
}

function EyeToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.35)', display: 'flex', padding: 2 }}>
      {show
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      }
    </button>
  )
}

// ── Root component ────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('profile')
  const [toasts, setToasts] = useState<Toast[]>([])

  function addToast(msg: string, type: Toast['type'] = 'success') {
    const id = Date.now()
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3800)
  }

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'profile', label: 'Profile', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
    { key: 'account', label: 'Account', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> },
    { key: 'notifications', label: 'Notifications', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> },
  ]

  return (
    <div className="st-outer-pad" style={{ minHeight: '100vh', padding: '32px 24px 80px', maxWidth: 860, margin: '0 auto' }}>
      <style>{CSS}</style>

      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', marginBottom: 5 }}>Settings</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,.38)' }}>Manage your profile, account and preferences</div>
      </div>

      <div className="st-layout" style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {/* Sidebar */}
        <div className="st-sidebar" style={{ width: 196, flexShrink: 0, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 16, overflow: 'hidden', position: 'sticky', top: 24 }}>
          {TABS.map(t => {
            const active = activeTab === t.key
            return (
              <button key={t.key} className={`st-tab${active ? ' st-tab-active' : ''}`} onClick={() => setActiveTab(t.key)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', background: active ? 'rgba(138,21,56,.18)' : 'transparent', border: 'none', borderLeft: `3px solid ${active ? '#c0185c' : 'transparent'}`, color: active ? '#fff' : 'rgba(255,255,255,.5)', fontSize: 13.5, fontWeight: active ? 700 : 500, fontFamily: 'inherit', textAlign: 'left' }}>
                <span style={{ color: active ? '#c0185c' : 'rgba(255,255,255,.35)' }}>{t.icon}</span>
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {activeTab === 'profile'       && <ProfileTab       addToast={addToast} />}
          {activeTab === 'account'       && <AccountTab       addToast={addToast} />}
          {activeTab === 'notifications' && <NotificationsTab addToast={addToast} />}
        </div>
      </div>

      {/* Toast stack */}
      <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none' }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding: '10px 20px', borderRadius: 99,
            background: t.type === 'success' ? 'rgba(34,197,94,.13)' : 'rgba(239,68,68,.13)',
            border: `1px solid ${t.type === 'success' ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)'}`,
            color: t.type === 'success' ? '#4ade80' : '#f87171',
            fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 8px 32px rgba(0,0,0,.45)',
            animation: 'st-toast .22s cubic-bezier(.22,1,.36,1) both',
            backdropFilter: 'blur(16px)',
          }}>
            {t.type === 'success'
              ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            }
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Profile Tab ───────────────────────────────────────────────────────────────

function ProfileTab({ addToast }: { addToast: (msg: string, type?: 'success' | 'error') => void }) {
  const { user, profile, refreshProfile } = useAuth()
  const [name,         setName]         = useState(profile?.full_name ?? '')
  const [username,     setUsername]     = useState(profile?.username ?? '')
  const [usernameErr,  setUsernameErr]  = useState('')
  const [uStatus, setUStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle')
  const [bio,          setBio]          = useState(profile?.bio ?? '')
  const [school,       setSchool]       = useState(profile?.school ?? '')
  const [country,      setCountry]      = useState(profile?.country ?? '')
  const [countries,    setCountries]    = useState<string[]>([])
  const [uniQuery,     setUniQuery]     = useState(profile?.university?.name ?? '')
  const [uniId,        setUniId]        = useState<string | null>(profile?.university_id ?? null)
  const [uniSuggestions, setUniSuggestions] = useState<{ id: string; name: string }[]>([])
  const [skills,       setSkills]       = useState<string[]>(profile?.skills ?? [])
  const [skillInput,   setSkillInput]   = useState('')
  const [saving,       setSaving]       = useState(false)
  const [avLoading,    setAvLoading]    = useState(false)
  const fileRef     = useRef<HTMLInputElement>(null)
  const uDebounce   = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!profile) return
    setName(profile.full_name ?? '')
    setUsername(profile.username ?? '')
    setBio(profile.bio ?? '')
    setSchool(profile.school ?? '')
    setSkills(profile.skills ?? [])
    setCountry(profile.country ?? '')
    setUniQuery(profile.university?.name ?? '')
    setUniId(profile.university_id ?? null)
  }, [profile?.id])

  useEffect(() => {
    supabase.from('universities').select('country').then(({ data }) => {
      const found = [...new Set((data ?? []).map(r => r.country))]
      setCountries([...new Set(['India', 'Qatar', ...found])])
    })
  }, [])

  useEffect(() => {
    if (!country) { setUniSuggestions([]); return }
    const handle = setTimeout(() => {
      let q = supabase.from('universities').select('id,name').eq('country', country).order('name').limit(8)
      if (uniQuery.trim()) q = q.ilike('name', `%${uniQuery.trim()}%`)
      q.then(({ data }) => setUniSuggestions((data ?? []) as { id: string; name: string }[]))
    }, 200)
    return () => clearTimeout(handle)
  }, [country, uniQuery])

  useEffect(() => {
    const uname = username.trim().toLowerCase()
    if (!uname || uname === (profile?.username ?? '')) { setUStatus('idle'); return }
    if (!/^[a-z0-9_]{3,20}$/.test(uname)) { setUStatus('invalid'); return }
    setUStatus('checking')
    if (uDebounce.current) clearTimeout(uDebounce.current)
    uDebounce.current = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('id').eq('username', uname).neq('id', user?.id ?? '').maybeSingle()
      setUStatus(data ? 'taken' : 'available')
    }, 450)
    return () => { if (uDebounce.current) clearTimeout(uDebounce.current) }
  }, [username])

  function addSkill() {
    const s = skillInput.trim()
    if (s && !skills.includes(s) && skills.length < 20) {
      setSkills(prev => [...prev, s])
      setSkillInput('')
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setUsernameErr('')
    if (!user) return
    const uname = username.trim().toLowerCase()
    if (uname && !/^[a-z0-9_]{3,20}$/.test(uname)) {
      setUsernameErr('3–20 chars, letters, numbers, underscores only')
      return
    }
    if (uStatus === 'taken') { setUsernameErr('That username is already taken.'); return }
    if (uStatus === 'checking') { setUsernameErr('Still checking availability — please wait.'); return }
    setSaving(true)

    let resolvedUniId = uniId
    const typedUni = uniQuery.trim()
    if (country && typedUni && !resolvedUniId) {
      const { data: existing } = await supabase
        .from('universities').select('id').eq('country', country).ilike('name', typedUni).maybeSingle()
      if (existing) resolvedUniId = existing.id
      else {
        const { data: created, error: uniError } = await supabase
          .from('universities').insert({ name: typedUni, country }).select('id').single()
        if (uniError) { setSaving(false); addToast('Failed to add university — ' + uniError.message, 'error'); return }
        resolvedUniId = created?.id ?? null
      }
    } else if (!typedUni) {
      resolvedUniId = null
    }

    const { error } = await supabase.from('profiles').update({
      full_name: name.trim() || null,
      username: uname || null,
      bio: bio.trim() || null,
      school: school.trim() || null,
      skills,
      country: country || null,
      university_id: resolvedUniId,
    }).eq('id', user.id)
    setUniId(resolvedUniId)
    await refreshProfile()
    setSaving(false)
    if (error) addToast('Failed to save — ' + error.message, 'error')
    else addToast('Profile updated')
  }

  async function uploadAvatar(file: File) {
    if (!user) return
    if (file.size > 5 * 1024 * 1024) { addToast('Image must be under 5 MB', 'error'); return }
    setAvLoading(true)
    const ext  = file.name.split('.').pop() ?? 'jpg'
    const path = `${user.id}/avatar.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
    if (error) { addToast('Upload failed', 'error'); setAvLoading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    await supabase.from('profiles').update({ avatar_url: `${publicUrl}?t=${Date.now()}` }).eq('id', user.id)
    await refreshProfile()
    setAvLoading(false)
    addToast('Photo updated')
  }

  async function removeAvatar() {
    if (!user) return
    await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id)
    await refreshProfile()
    addToast('Photo removed')
  }

  const avatarUrl = profile?.avatar_url
  const initials  = (profile?.full_name ?? '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <form className="st-card" onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Avatar card */}
      <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 18, padding: '24px 24px 20px' }}>
        <SectionHead title="Profile Photo" desc="Shown on your profile, posts, and across ClubSynq." />
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <div className="st-av-wrap" style={{ position: 'relative', width: 80, height: 80, borderRadius: '50%', cursor: 'pointer', flexShrink: 0 }} onClick={() => fileRef.current?.click()}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#8a1538,#c0185c)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 900, color: '#fff', overflow: 'hidden', border: '3px solid rgba(255,255,255,.1)' }}>
              {avLoading
                ? <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2.5px solid rgba(255,255,255,.3)', borderTopColor: '#fff', animation: 'st-spin .8s linear infinite' }} />
                : avatarUrl
                  ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : initials
              }
            </div>
            <div className="st-av-overlay" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button type="button" className="st-btn" onClick={() => fileRef.current?.click()} style={{ padding: '8px 18px', background: 'linear-gradient(135deg,#8a1538,#c0185c)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', boxShadow: '0 2px 10px rgba(138,21,56,.4)' }}>
              Upload Photo
            </button>
            {avatarUrl && (
              <button type="button" className="st-btn" onClick={removeAvatar} style={{ padding: '7px 14px', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, color: 'rgba(255,255,255,.6)', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit' }}>
                Remove
              </button>
            )}
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.28)' }}>JPG, PNG or WebP · max 5 MB</div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = '' }} />
        </div>
      </div>

      {/* Personal info card */}
      <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 18, padding: '24px 24px 20px' }}>
        <SectionHead title="Personal Info" />

        <Field label="Display Name">
          <input className="st-input" style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" maxLength={80} />
        </Field>

        <Field label="Username" hint="3–20 chars · letters, numbers, underscores · used to @mention you">
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,.3)', fontSize: 14, pointerEvents: 'none' }}>@</span>
            <input className="st-input" style={{ ...inputStyle, paddingLeft: 28, paddingRight: uStatus !== 'idle' ? 110 : 14,
              borderColor: usernameErr || uStatus === 'taken' || uStatus === 'invalid' ? 'rgba(239,68,68,.5)' : uStatus === 'available' ? 'rgba(34,197,94,.45)' : undefined }}
              value={username} onChange={e => { setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')); setUsernameErr('') }}
              placeholder="yourname" maxLength={20} />
            {uStatus !== 'idle' && (
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', pointerEvents: 'none',
                color: uStatus === 'available' ? '#22c55e' : uStatus === 'taken' ? '#ef4444' : uStatus === 'invalid' ? '#f97316' : 'rgba(255,255,255,.35)' }}>
                {uStatus === 'checking'  ? 'Checking…'
                : uStatus === 'available' ? '✓ Available'
                : uStatus === 'taken'     ? '✗ Already taken'
                : '3–20 chars only'}
              </span>
            )}
          </div>
          {(usernameErr || uStatus === 'taken' || uStatus === 'invalid') && (
            <div style={{ fontSize: 11.5, color: '#f87171', marginTop: 5 }}>
              {usernameErr || (uStatus === 'taken' ? 'That username is already taken.' : '3–20 chars, letters, numbers, underscores only')}
            </div>
          )}
        </Field>

        <Field label="Country" hint="Which country are you studying in?">
          <select className="st-input" style={{ ...inputStyle, cursor: 'pointer' }} value={country}
            onChange={e => { setCountry(e.target.value); setUniQuery(''); setUniId(null) }}>
            <option value="">Select country...</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>

        {country && (
          <Field label="University" hint="Search for your university, or type a new one to add it.">
            <input className="st-input" style={inputStyle} value={uniQuery}
              onChange={e => { setUniQuery(e.target.value); setUniId(null) }}
              placeholder={`Search or type your university in ${country}...`} maxLength={120} />
            {!uniId && uniSuggestions.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
                {uniSuggestions.map(u => (
                  <button type="button" key={u.id} onClick={() => { setUniId(u.id); setUniQuery(u.name) }} style={{
                    textAlign: 'left', padding: '8px 12px', borderRadius: 9,
                    background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)',
                    color: 'rgba(255,255,255,.8)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
                  }}>
                    {u.name}
                  </button>
                ))}
              </div>
            )}
            {!uniId && uniQuery.trim() && uniSuggestions.every(u => u.name.toLowerCase() !== uniQuery.trim().toLowerCase()) && (
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.35)', marginTop: 6 }}>
                No match yet — saving will add "{uniQuery.trim()}" as a new university.
              </div>
            )}
          </Field>
        )}

        <Field label="School / Faculty" hint="Your department or faculty within your university.">
          <input className="st-input" style={inputStyle} value={school} onChange={e => setSchool(e.target.value)} placeholder="e.g. Faculty of Engineering" maxLength={120} />
        </Field>

        <Field label="Bio" hint="Short intro shown on your public profile. Max 400 characters.">
          <textarea className="st-input" style={{ ...inputStyle, resize: 'vertical', minHeight: 88, lineHeight: 1.55 }} value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell others a bit about yourself…" maxLength={400} />
          <div style={{ textAlign: 'right', fontSize: 11, color: bio.length > 360 ? '#e9c176' : 'rgba(255,255,255,.22)', marginTop: 4 }}>{bio.length}/400</div>
        </Field>

        <Field label="Skills" hint="Press Enter or comma to add · up to 20 skills">
          {skills.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {skills.map(s => (
                <span key={s} className="st-skill-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px 5px 14px', background: 'rgba(138,21,56,.18)', border: '1px solid rgba(192,24,92,.3)', borderRadius: 99, fontSize: 12.5, color: 'rgba(255,255,255,.85)', fontWeight: 600, cursor: 'default', transition: 'background .13s' }}>
                  {s}
                  <button type="button" onClick={() => setSkills(p => p.filter(x => x !== s))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,110,110,.7)', lineHeight: 1, padding: 0, display: 'flex' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="st-input" style={{ ...inputStyle, flex: 1 }} value={skillInput} onChange={e => setSkillInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSkill() } }}
              placeholder="e.g. React, Design, Marketing…" disabled={skills.length >= 20} />
            <button type="button" className="st-btn" onClick={addSkill} disabled={!skillInput.trim() || skills.length >= 20}
              style={{ padding: '0 16px', borderRadius: 11, border: 'none', background: skillInput.trim() ? 'rgba(138,21,56,.35)' : 'rgba(255,255,255,.06)', color: skillInput.trim() ? '#fff' : 'rgba(255,255,255,.3)', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0 }}>
              Add
            </button>
          </div>
        </Field>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <SaveBtn saving={saving} />
        </div>
      </div>
    </form>
  )
}

// ── Account Tab ───────────────────────────────────────────────────────────────

function AccountTab({ addToast }: { addToast: (msg: string, type?: 'success' | 'error') => void }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  // Password change
  const [currentPw,  setCurrentPw]  = useState('')
  const [newPw,      setNewPw]      = useState('')
  const [confirmPw,  setConfirmPw]  = useState('')
  const [pwSaving,   setPwSaving]   = useState(false)
  const [showCur,    setShowCur]    = useState(false)
  const [showNew,    setShowNew]    = useState(false)
  const [showConf,   setShowConf]   = useState(false)
  const [pwError,    setPwError]    = useState('')

  // Delete account modal
  const [deleteOpen,    setDeleteOpen]    = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting,      setDeleting]      = useState(false)

  const pwStrength = (() => {
    if (!newPw) return 0
    let s = 0
    if (newPw.length >= 8)           s++
    if (/[A-Z]/.test(newPw))         s++
    if (/[0-9]/.test(newPw))         s++
    if (/[^A-Za-z0-9]/.test(newPw))  s++
    return s
  })()
  const pwColor = ['', '#ef4444', '#f97316', '#e9c176', '#22c55e'][pwStrength]
  const pwLabel = ['', 'Weak',    'Fair',    'Good',    'Strong' ][pwStrength]

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwError('')
    if (!user?.email) return
    if (newPw !== confirmPw)  { setPwError("New passwords don't match"); return }
    if (newPw.length < 8)     { setPwError('Password must be at least 8 characters'); return }
    if (newPw === currentPw)  { setPwError('New password must differ from current password'); return }
    setPwSaving(true)
    // Verify current password by re-authenticating
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPw })
    if (signInErr) { setPwSaving(false); setPwError('Current password is incorrect'); return }
    // Update password
    const { error } = await supabase.auth.updateUser({ password: newPw })
    setPwSaving(false)
    if (error) { setPwError(error.message); return }
    setCurrentPw(''); setNewPw(''); setConfirmPw('')
    addToast('Password changed successfully')
  }

  async function handleDeleteAccount() {
    if (deleteConfirm !== 'DELETE') return
    setDeleting(true)
    const { error } = await supabase.rpc('delete_own_account')
    if (error) {
      setDeleting(false)
      addToast('Failed to delete account: ' + error.message, 'error')
      return
    }
    await signOut()
    navigate('/')
  }

  return (
    <div className="st-card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Email */}
      <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 18, padding: '24px 24px 20px' }}>
        <SectionHead title="Email Address" desc="Your sign-in email. Contact support to change it." />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'rgba(255,255,255,.02)', border: '1.5px solid rgba(255,255,255,.07)', borderRadius: 12 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,.65)', flex: 1 }}>{user?.email}</span>
          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.22)', color: '#4ade80', fontWeight: 700 }}>Verified</span>
        </div>
      </div>

      {/* Change password */}
      <form onSubmit={changePassword} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 18, padding: '24px 24px 20px' }}>
        <SectionHead title="Change Password" desc="Use a strong password you haven't used elsewhere." />

        <Field label="Current Password">
          <div style={{ position: 'relative' }}>
            <input className="st-input" style={inputStyle} type={showCur ? 'text' : 'password'} value={currentPw} onChange={e => { setCurrentPw(e.target.value); setPwError('') }} placeholder="Enter your current password" />
            <EyeToggle show={showCur} onToggle={() => setShowCur(o => !o)} />
          </div>
        </Field>

        <Field label="New Password">
          <div style={{ position: 'relative' }}>
            <input className="st-input" style={inputStyle} type={showNew ? 'text' : 'password'} value={newPw} onChange={e => { setNewPw(e.target.value); setPwError('') }} placeholder="At least 8 characters" />
            <EyeToggle show={showNew} onToggle={() => setShowNew(o => !o)} />
          </div>
          {newPw.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, height: 4, borderRadius: 99, background: 'rgba(255,255,255,.07)', overflow: 'hidden' }}>
                <div style={{ width: `${pwStrength * 25}%`, height: '100%', background: pwColor, borderRadius: 99, transition: 'width .3s, background .3s' }} />
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: pwColor, minWidth: 38 }}>{pwLabel}</span>
            </div>
          )}
        </Field>

        <Field label="Confirm New Password">
          <div style={{ position: 'relative' }}>
            <input className="st-input"
              style={{ ...inputStyle, borderColor: confirmPw && newPw !== confirmPw ? 'rgba(239,68,68,.5)' : undefined }}
              type={showConf ? 'text' : 'password'} value={confirmPw}
              onChange={e => { setConfirmPw(e.target.value); setPwError('') }}
              placeholder="Re-enter new password" />
            <EyeToggle show={showConf} onToggle={() => setShowConf(o => !o)} />
          </div>
        </Field>

        {pwError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 10, marginBottom: 16 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span style={{ fontSize: 12.5, color: '#f87171' }}>{pwError}</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <SaveBtn saving={pwSaving} label="Update Password" disabled={!currentPw || !newPw || !confirmPw} />
        </div>
      </form>

      {/* Danger zone */}
      <div style={{ background: 'rgba(239,68,68,.04)', border: '1px solid rgba(239,68,68,.18)', borderRadius: 18, padding: '22px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#f87171' }}>Danger Zone</span>
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.38)', lineHeight: 1.6, marginBottom: 16 }}>
          Permanently deletes your account, all club memberships, posts, and messages. This cannot be undone.
        </div>
        <button type="button" className="st-btn" onClick={() => setDeleteOpen(true)}
          style={{ padding: '9px 20px', borderRadius: 10, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.28)', color: '#f87171', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>
          Delete Account
        </button>
      </div>

      {/* Delete confirmation modal */}
      {deleteOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) { setDeleteOpen(false); setDeleteConfirm('') } }}>
          <div className="st-del-modal" style={{ width: '100%', maxWidth: 440, background: '#130810', border: '1px solid rgba(239,68,68,.25)', borderRadius: 20, padding: '32px 28px', animation: 'st-modal .22s cubic-bezier(.22,1,.36,1) both' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Delete your account?</div>
            <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,.45)', lineHeight: 1.6, marginBottom: 22 }}>
              All your data will be permanently erased. This action is irreversible. Type <strong style={{ color: '#f87171' }}>DELETE</strong> to confirm.
            </div>
            <input className="st-input" style={{ ...inputStyle, marginBottom: 18, borderColor: 'rgba(239,68,68,.3)' }}
              value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)}
              placeholder="Type DELETE to confirm" autoFocus />
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="st-btn" onClick={() => { setDeleteOpen(false); setDeleteConfirm('') }}
                style={{ flex: 1, padding: '11px 0', borderRadius: 11, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.1)', color: 'rgba(255,255,255,.7)', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button type="button" className="st-btn" onClick={handleDeleteAccount}
                disabled={deleteConfirm !== 'DELETE' || deleting}
                style={{ flex: 1, padding: '11px 0', borderRadius: 11, background: deleteConfirm === 'DELETE' ? '#dc2626' : 'rgba(239,68,68,.15)', border: 'none', color: '#fff', fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                {deleting && <div style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', animation: 'st-spin .8s linear infinite' }} />}
                {deleting ? 'Deleting…' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Notifications Tab ─────────────────────────────────────────────────────────

const NOTIF_DEFS: { key: string; label: string; desc: string; defaultOn: boolean }[] = [
  { key: 'club_announcements', label: 'Club Announcements',    desc: 'Posts and announcements from clubs you belong to',     defaultOn: true  },
  { key: 'club_events',        label: 'Upcoming Events',       desc: 'Reminders for events in your clubs',                  defaultOn: true  },
  { key: 'join_requests',      label: 'Join Request Updates',  desc: 'When your application is accepted or rejected',       defaultOn: true  },
  { key: 'direct_messages',    label: 'Direct Messages',       desc: 'When someone sends you a private message',            defaultOn: true  },
  { key: 'skill_matches',      label: 'Skill Trade Matches',   desc: 'New matches for your skill listings',                 defaultOn: true  },
  { key: 'karak_points',       label: 'Karak Points Earned',   desc: 'Notifications when you earn points from activities',  defaultOn: false },
  { key: 'weekly_digest',      label: 'Weekly Digest',         desc: 'A weekly summary of activity across your clubs',      defaultOn: false },
]

function mergePrefs(saved: Record<string, boolean> | null | undefined): Record<string, boolean> {
  const base = saved ?? {}
  return Object.fromEntries(NOTIF_DEFS.map(d => [d.key, d.key in base ? base[d.key] : d.defaultOn]))
}

function NotificationsTab({ addToast }: { addToast: (msg: string, type?: 'success' | 'error') => void }) {
  const { user, profile, refreshProfile } = useAuth()

  // Lazy-initialize directly from profile so first render is correct
  const [prefs,  setPrefs]  = useState<Record<string, boolean>>(() => mergePrefs(profile?.notification_prefs))
  const [saving, setSaving] = useState(false)

  // Re-sync whenever the saved value in the DB changes (after save + refresh, or first real load)
  const savedJson = JSON.stringify(profile?.notification_prefs ?? {})
  useEffect(() => {
    setPrefs(mergePrefs(profile?.notification_prefs))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedJson])

  const toggle = (key: string) => setPrefs(prev => ({ ...prev, [key]: !prev[key] }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ notification_prefs: prefs })
      .eq('id', user.id)
      .select('notification_prefs')
      .single()
    if (error) {
      setSaving(false)
      addToast('Failed to save — ' + error.message, 'error')
      return
    }
    await refreshProfile()
    setSaving(false)
    addToast('Notification preferences saved')
  }

  return (
    <form className="st-card" onSubmit={save}>
      <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 18, padding: '24px 24px 20px' }}>
        <SectionHead title="Notification Preferences" desc="Choose what you'd like to be notified about." />

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {NOTIF_DEFS.map((d, i) => (
            <div key={d.key} className="st-row-hover"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 0', borderBottom: i < NOTIF_DEFS.length - 1 ? '1px solid rgba(255,255,255,.05)' : 'none', gap: 16, cursor: 'pointer', borderRadius: 8 }}
              onClick={() => toggle(d.key)}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 3 }}>{d.label}</div>
                <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.36)' }}>{d.desc}</div>
              </div>
              {/* Toggle */}
              <div style={{ width: 44, height: 24, borderRadius: 99, flexShrink: 0, position: 'relative', background: prefs[d.key] ? 'linear-gradient(135deg,#8a1538,#c0185c)' : 'rgba(255,255,255,.1)', boxShadow: prefs[d.key] ? '0 0 10px rgba(138,21,56,.35)' : 'none', transition: 'background .2s, box-shadow .2s' }}>
                <div style={{ position: 'absolute', top: 3, left: prefs[d.key] ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .18s cubic-bezier(.4,0,.2,1)', boxShadow: '0 1px 4px rgba(0,0,0,.28)' }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <SaveBtn saving={saving} label="Save Preferences" />
        </div>
      </div>
    </form>
  )
}
