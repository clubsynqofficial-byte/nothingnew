import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const BASE_COUNTRIES = ['India', 'Qatar']
const COUNTRY_FLAG: Record<string, string> = { India: '🇮🇳', Qatar: '🇶🇦' }

interface UniOption { id: string; name: string }

const INTERESTS = [
  { key: 'tech',      label: 'Technology',       icon: '💻' },
  { key: 'arts',      label: 'Arts & Culture',   icon: '🎨' },
  { key: 'sports',    label: 'Sports',            icon: '⚽' },
  { key: 'business',  label: 'Business',          icon: '📈' },
  { key: 'social',    label: 'Social',            icon: '🎉' },
  { key: 'academic',  label: 'Academic',          icon: '📚' },
  { key: 'gaming',    label: 'Gaming',            icon: '🎮' },
  { key: 'music',     label: 'Music',             icon: '🎵' },
  { key: 'health',    label: 'Health & Fitness',  icon: '💪' },
  { key: 'volunteer', label: 'Volunteering',      icon: '🤝' },
  { key: 'science',   label: 'Science',           icon: '🔬' },
  { key: 'food',      label: 'Food & Cooking',    icon: '🍳' },
]

const INTEREST_TO_CATEGORY: Record<string, string[]> = {
  tech:      ['Technology', 'Engineering'],
  arts:      ['Arts & Culture', 'Media'],
  sports:    ['Sports'],
  business:  ['Business', 'Entrepreneurship'],
  social:    ['Community'],
  academic:  ['Science', 'Law'],
  gaming:    ['Technology'],
  music:     ['Arts & Culture'],
  health:    ['Sports'],
  volunteer: ['Community'],
  science:   ['Science', 'Engineering'],
  food:      ['Community'],
}

interface ClubRow {
  id: string
  name: string
  category: string | null
  logo_url: string | null
  member_count: number
}

interface Props { onDone: () => void }

export default function OnboardingModal({ onDone }: Props) {
  const { user, refreshProfile } = useAuth()
  const [selected, setSelected]       = useState<Set<string>>(new Set())
  const [saving, setSaving]           = useState(false)
  const [step, setStep]               = useState<'location' | 'interests' | 'clubs'>('location')
  const [suggestedClubs, setSuggested] = useState<ClubRow[]>([])
  const [clubsLoading, setClubsLoading] = useState(false)
  const [joiningIds, setJoiningIds]   = useState<Set<string>>(new Set())
  const [joinedIds, setJoinedIds]     = useState<Set<string>>(new Set())

  // Country + university state
  const [countries, setCountries]     = useState<string[]>(BASE_COUNTRIES)
  const [country, setCountry]         = useState('')
  const [uniQuery, setUniQuery]       = useState('')
  const [uniSuggestions, setUniSuggestions] = useState<UniOption[]>([])
  const [selectedUni, setSelectedUni] = useState<UniOption | null>(null)
  const [savingLocation, setSavingLocation] = useState(false)
  const [locationError, setLocationError] = useState('')

  useEffect(() => {
    supabase.from('universities').select('country').then(({ data }) => {
      const found = [...new Set((data ?? []).map(r => r.country))]
      setCountries([...new Set([...BASE_COUNTRIES, ...found])])
    })
  }, [])

  useEffect(() => {
    if (!country) { setUniSuggestions([]); return }
    const handle = setTimeout(() => {
      let q = supabase.from('universities').select('id,name').eq('country', country).order('name').limit(8)
      if (uniQuery.trim()) q = q.ilike('name', `%${uniQuery.trim()}%`)
      q.then(({ data }) => setUniSuggestions((data ?? []) as UniOption[]))
    }, 200)
    return () => clearTimeout(handle)
  }, [country, uniQuery])

  async function saveLocation() {
    if (!user || !country) return
    setSavingLocation(true)
    setLocationError('')
    let uniId = selectedUni?.id ?? null
    const typedName = uniQuery.trim()
    if (!uniId && typedName) {
      const { data: existing } = await supabase
        .from('universities').select('id').eq('country', country).ilike('name', typedName).maybeSingle()
      if (existing) uniId = existing.id
      else {
        const { data: created, error: uniError } = await supabase
          .from('universities').insert({ name: typedName, country }).select('id').single()
        if (uniError) { setSavingLocation(false); setLocationError('Failed to add university — ' + uniError.message); return }
        uniId = created?.id ?? null
      }
    }
    await supabase.from('profiles').update({ country, university_id: uniId }).eq('id', user.id)
    setSavingLocation(false)
    setStep('interests')
  }

  async function handleSkipLocation() {
    setStep('interests')
  }

  function toggle(key: string) {
    setSelected(prev => {
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      return s
    })
  }

  async function handleFinish() {
    if (!user) return
    setSaving(true)
    // Write to DB but do NOT call refreshProfile() here — that would set
    // profile.onboarded = true in memory, which unmounts this modal before
    // the clubs step renders. refreshProfile() is called in handleDone() instead.
    await supabase.from('profiles').update({ interests: [...selected], onboarded: true }).eq('id', user.id)
    setSaving(false)
    await fetchSuggestedClubs()
    setStep('clubs')
  }

  async function handleDone() {
    await refreshProfile()
    onDone()
  }

  async function fetchSuggestedClubs() {
    setClubsLoading(true)
    const categories = [...selected].flatMap(k => INTEREST_TO_CATEGORY[k] ?? [])
    const unique = [...new Set(categories)]

    let clubs: ClubRow[] = []
    if (unique.length > 0) {
      let q = supabase
        .from('clubs')
        .select('id,name,category,logo_url,member_count')
        .in('category', unique)
        .order('member_count', { ascending: false })
        .limit(3)
      if (country) q = q.eq('country', country)
      const { data } = await q
      clubs = (data ?? []) as ClubRow[]
    }

    if (clubs.length === 0) {
      let q = supabase
        .from('clubs')
        .select('id,name,category,logo_url,member_count')
        .order('member_count', { ascending: false })
        .limit(3)
      if (country) q = q.eq('country', country)
      const { data } = await q
      clubs = (data ?? []) as ClubRow[]
    }

    setSuggested(clubs)
    setClubsLoading(false)
  }

  async function joinClub(club: ClubRow) {
    if (!user || joiningIds.has(club.id) || joinedIds.has(club.id)) return
    setJoiningIds(prev => new Set([...prev, club.id]))
    await supabase.from('club_memberships').insert({ club_id: club.id, user_id: user.id, role: 'member' })
    setJoinedIds(prev => new Set([...prev, club.id]))
    setJoiningIds(prev => { const s = new Set(prev); s.delete(club.id); return s })
  }

  async function handleSkip() {
    if (!user) return
    await supabase.from('profiles').update({ onboarded: true }).eq('id', user.id)
    await refreshProfile()
    onDone()
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(4,1,3,0.92)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 16px' }}>
      <style>{`
        @keyframes obIn   { from{opacity:0;transform:translateY(28px) scale(.97)} to{opacity:1;transform:none} }
        @keyframes obStep { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:none} }
        .ob-chip { transition: all .15s; cursor: pointer; }
        .ob-chip:hover { transform: translateY(-1px); }
        .ob-join:hover:not(:disabled) { filter: brightness(1.12); transform: scale(1.04); }
      `}</style>

      <div style={{
        width: '100%', maxWidth: step === 'clubs' ? 540 : 520, maxHeight: '90vh',
        background: 'linear-gradient(170deg,#16090d,#0d050a)',
        border: '1px solid rgba(138,21,56,.3)', borderRadius: 24,
        overflowX: 'hidden', overflowY: 'auto', animation: 'obIn .3s cubic-bezier(.22,1,.36,1) both',
        boxShadow: '0 40px 100px rgba(0,0,0,.85)',
        transition: 'max-width .25s ease',
      }}>
        {/* Progress strip */}
        <div style={{ height: 4, background: 'rgba(138,21,56,.18)', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, right: step === 'location' ? '66.6%' : step === 'interests' ? '33.3%' : '0%', background: 'linear-gradient(90deg,#8a1538,#c0185c,#e57c9a)', transition: 'right .4s cubic-bezier(.22,1,.36,1)' }} />
        </div>

        {/* ── Step 1: Country + University ── */}
        {step === 'location' && (
          <div style={{ padding: '32px 28px 28px' }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🌍</div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-.5px', marginBottom: 8 }}>Where are you studying?</h2>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,.55)', lineHeight: 1.65 }}>
                This helps us show you clubs and people from your own country.
              </p>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 22, justifyContent: 'center' }}>
              {countries.map(c => {
                const on = country === c
                return (
                  <button key={c} className="ob-chip" onClick={() => { setCountry(c); setUniQuery(''); setSelectedUni(null) }} style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '9px 16px', borderRadius: 9999,
                    border: `1px solid ${on ? 'rgba(138,21,56,.55)' : 'rgba(255,255,255,.1)'}`,
                    background: on ? 'rgba(138,21,56,.22)' : 'rgba(255,255,255,.04)',
                    color: on ? '#fff' : 'rgba(255,255,255,.6)',
                    fontSize: 13, fontWeight: on ? 700 : 500, fontFamily: 'inherit',
                  }}>
                    {COUNTRY_FLAG[c] && <span>{COUNTRY_FLAG[c]}</span>}
                    <span>{c}</span>
                    {on && <span style={{ fontSize: 11, color: 'var(--accent)' }}>✓</span>}
                  </button>
                )
              })}
            </div>

            {country && (
              <div style={{ marginBottom: 24, position: 'relative' }}>
                <input
                  value={uniQuery}
                  onChange={e => { setUniQuery(e.target.value); setSelectedUni(null) }}
                  placeholder={`Search or type your university in ${country}...`}
                  style={{
                    width: '100%', padding: '11px 14px', borderRadius: 12,
                    background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)',
                    color: '#fff', fontSize: 13.5, fontFamily: 'inherit', outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                {selectedUni && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#4ade80', fontWeight: 600 }}>✓ {selectedUni.name}</div>
                )}
                {!selectedUni && uniSuggestions.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
                    {uniSuggestions.map(u => (
                      <button key={u.id} onClick={() => { setSelectedUni(u); setUniQuery(u.name) }} style={{
                        textAlign: 'left', padding: '8px 12px', borderRadius: 9,
                        background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)',
                        color: 'rgba(255,255,255,.8)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
                      }}>
                        {u.name}
                      </button>
                    ))}
                  </div>
                )}
                {!selectedUni && uniQuery.trim() && uniSuggestions.every(u => u.name.toLowerCase() !== uniQuery.trim().toLowerCase()) && (
                  <div style={{ marginTop: 8, fontSize: 11.5, color: 'rgba(255,255,255,.35)' }}>
                    No match yet — we'll add "{uniQuery.trim()}" as a new university.
                  </div>
                )}
              </div>
            )}

            {/* Step indicator */}
            <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,.2)', marginBottom: 16, fontWeight: 600, letterSpacing: '.06em' }}>
              STEP 1 OF 3
            </div>

            {locationError && (
              <div style={{ fontSize: 12, color: '#f87171', textAlign: 'center', marginBottom: 12, fontWeight: 600 }}>{locationError}</div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleSkipLocation} style={{ flex: 1, padding: '11px', borderRadius: 12, background: 'transparent', border: '1px solid rgba(255,255,255,.1)', color: 'rgba(255,255,255,.4)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Skip for now
              </button>
              <button onClick={saveLocation} disabled={savingLocation || !country || !uniQuery.trim()} style={{
                flex: 2, padding: '11px', borderRadius: 12, border: 'none', color: '#fff',
                fontSize: 13, fontWeight: 800, fontFamily: 'inherit',
                background: country && uniQuery.trim() ? 'linear-gradient(135deg,#8a1538,#c0185c)' : 'rgba(87,65,68,.3)',
                cursor: country && uniQuery.trim() && !savingLocation ? 'pointer' : 'default',
                boxShadow: country && uniQuery.trim() ? '0 4px 20px rgba(138,21,56,.5)' : 'none',
                opacity: savingLocation ? .7 : 1,
              }}>
                {savingLocation ? 'Saving…' : 'Continue'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Interests ── */}
        {step === 'interests' && (
          <div style={{ padding: '32px 28px 28px' }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>👋</div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-.5px', marginBottom: 8 }}>Welcome to ClubSynq!</h2>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,.55)', lineHeight: 1.65 }}>
                Pick your interests and we'll recommend clubs that match you.
              </p>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 28, justifyContent: 'center' }}>
              {INTERESTS.map(it => {
                const on = selected.has(it.key)
                return (
                  <button key={it.key} className="ob-chip" onClick={() => toggle(it.key)} style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '9px 16px', borderRadius: 9999,
                    border: `1px solid ${on ? 'rgba(138,21,56,.55)' : 'rgba(255,255,255,.1)'}`,
                    background: on ? 'rgba(138,21,56,.22)' : 'rgba(255,255,255,.04)',
                    color: on ? '#fff' : 'rgba(255,255,255,.6)',
                    fontSize: 13, fontWeight: on ? 700 : 500, fontFamily: 'inherit',
                  }}>
                    <span>{it.icon}</span>
                    <span>{it.label}</span>
                    {on && <span style={{ fontSize: 11, color: 'var(--accent)' }}>✓</span>}
                  </button>
                )
              })}
            </div>

            {/* Step indicator */}
            <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,.2)', marginBottom: 16, fontWeight: 600, letterSpacing: '.06em' }}>
              STEP 2 OF 3
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleSkip} style={{ flex: 1, padding: '11px', borderRadius: 12, background: 'transparent', border: '1px solid rgba(255,255,255,.1)', color: 'rgba(255,255,255,.4)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Skip for now
              </button>
              <button onClick={handleFinish} disabled={saving || selected.size === 0} style={{
                flex: 2, padding: '11px', borderRadius: 12, border: 'none', color: '#fff',
                fontSize: 13, fontWeight: 800, fontFamily: 'inherit',
                background: selected.size > 0 ? 'linear-gradient(135deg,#8a1538,#c0185c)' : 'rgba(87,65,68,.3)',
                cursor: selected.size > 0 && !saving ? 'pointer' : 'default',
                boxShadow: selected.size > 0 ? '0 4px 20px rgba(138,21,56,.5)' : 'none',
                opacity: saving ? .7 : 1,
              }}>
                {saving ? 'Finding clubs…' : selected.size > 0 ? `Continue (${selected.size} selected)` : 'Select at least one'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Join clubs ── */}
        {step === 'clubs' && (
          <div style={{ padding: '32px 28px 28px', animation: 'obStep .22s ease both' }}>
            <div style={{ textAlign: 'center', marginBottom: 22 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🏛️</div>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: '#fff', letterSpacing: '-.5px', marginBottom: 8 }}>Join your first club</h2>
              <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,.5)', lineHeight: 1.6 }}>
                These match your interests. Join one so your feed has content right away.
              </p>
            </div>

            {/* Step indicator */}
            <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,.2)', marginBottom: 18, fontWeight: 600, letterSpacing: '.06em' }}>
              STEP 3 OF 3
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
              {clubsLoading
                ? [0,1,2].map(i => (
                    <div key={i} style={{ height: 68, borderRadius: 14, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.06)', animation: `obIn .4s ${i * .08}s ease both` }} />
                  ))
                : suggestedClubs.length === 0
                ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(255,255,255,.3)', fontSize: 13 }}>
                    No clubs yet — check back soon or create your own.
                  </div>
                )
                : suggestedClubs.map((club, i) => {
                    const joined  = joinedIds.has(club.id)
                    const joining = joiningIds.has(club.id)
                    const initials = club.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
                    return (
                      <div key={club.id} style={{
                        display: 'flex', alignItems: 'center', gap: 13,
                        padding: '13px 16px', borderRadius: 14,
                        background: joined ? 'rgba(34,197,94,.06)' : 'rgba(255,255,255,.03)',
                        border: `1px solid ${joined ? 'rgba(34,197,94,.25)' : 'rgba(255,255,255,.08)'}`,
                        transition: 'all .2s', animation: `obIn .35s ${i * .07}s ease both`,
                      }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(138,21,56,.2)', border: '1px solid rgba(138,21,56,.3)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: 'var(--accent)' }}>
                          {club.logo_url
                            ? <img src={club.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : initials}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{club.name}</div>
                          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.35)', marginTop: 2 }}>
                            {club.category ?? 'Club'} · {club.member_count.toLocaleString()} member{club.member_count !== 1 ? 's' : ''}
                          </div>
                        </div>
                        <button
                          className="ob-join"
                          onClick={() => joinClub(club)}
                          disabled={joined || joining}
                          style={{
                            padding: '7px 16px', borderRadius: 9999, fontSize: 12, fontWeight: 700,
                            cursor: joined || joining ? 'default' : 'pointer',
                            fontFamily: 'inherit', flexShrink: 0, transition: 'all .15s',
                            background: joined ? 'transparent' : 'linear-gradient(135deg,#8a1538,#c0185c)',
                            border: joined ? '1px solid rgba(34,197,94,.4)' : '1px solid transparent',
                            color: joined ? '#4ade80' : '#fff',
                            boxShadow: joined ? 'none' : '0 3px 14px rgba(138,21,56,.4)',
                          }}
                        >
                          {joining ? '···' : joined ? '✓ Joined' : 'Join'}
                        </button>
                      </div>
                    )
                  })
              }
            </div>

            <button onClick={handleDone} style={{
              width: '100%', padding: '12px', borderRadius: 12, border: 'none',
              background: joinedIds.size > 0 ? 'linear-gradient(135deg,#8a1538,#c0185c)' : 'rgba(87,65,68,.35)',
              color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer',
              fontFamily: 'inherit',
              boxShadow: joinedIds.size > 0 ? '0 4px 20px rgba(138,21,56,.5)' : 'none',
              transition: 'all .2s',
            }}>
              {joinedIds.size > 0 ? 'Go to my feed →' : 'Skip for now →'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
