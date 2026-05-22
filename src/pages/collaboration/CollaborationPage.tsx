import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { filterText } from '../../lib/contentFilter'

interface FounderCard {
  id: string; user_id: string; project_title: string
  project_description: string | null; skills_needed: string[]; skills_offered: string[]
  university_id: string | null; is_active: boolean; created_at: string
  profile?: { full_name: string | null; avatar_url: string | null } | null
  university?: { name: string; short_name: string | null } | null
}

interface RequestEntry {
  swiper_id: string
  message: string | null
  target_idea: FounderCard          // which of MY ideas they want to join
  swiper_name: string | null
  swiper_avatar: string | null
}

interface MatchEntry {
  swiper_id: string
  swiper_name: string | null
  swiper_avatar: string | null
  target_idea: FounderCard          // which of MY ideas they joined
}

type Tab = 'discover' | 'requests' | 'matches'

const iSt: React.CSSProperties = {
  width: '100%', background: 'rgba(27,16,18,0.6)', border: '1px solid rgba(87,65,68,0.4)',
  borderRadius: 12, padding: '12px 16px', color: 'var(--text-primary)', fontSize: 14,
  outline: 'none', fontFamily: 'inherit',
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: 6, textTransform: 'uppercase' }}>{label}</label>
      {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5 }}>{hint}</div>}
      {children}
    </div>
  )
}

function Av({ name, url, size = 44 }: { name: string | null | undefined; url?: string | null; size?: number }) {
  const letters = (name ?? '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  if (url) return <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'linear-gradient(135deg,var(--accent),#c42057)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 800, color: '#fff', flexShrink: 0, letterSpacing: '-0.5px' }}>
      {letters}
    </div>
  )
}

function Pill({ label, variant, highlight }: { label: string; variant: 'need' | 'offer'; highlight?: boolean }) {
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 9999, fontSize: 11.5, fontWeight: highlight ? 600 : 500,
      background: highlight ? 'rgba(74,222,128,0.15)' : variant === 'need' ? 'rgba(138,21,56,0.18)' : 'rgba(233,193,118,0.12)',
      border: highlight ? '1px solid rgba(74,222,128,0.4)' : variant === 'need' ? '1px solid rgba(138,21,56,0.35)' : '1px solid rgba(233,193,118,0.28)',
      color: highlight ? '#4ade80' : variant === 'need' ? '#e8a0b0' : 'var(--gold)',
    }}>{label}</span>
  )
}

function Spinner() {
  return <div style={{ width: 28, height: 28, border: '2.5px solid rgba(87,65,68,0.25)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'col-spin .75s linear infinite', margin: '0 auto 14px' }} />
}

export default function CollaborationPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab] = useState<Tab>('discover')
  const [founders, setFounders] = useState<FounderCard[]>([])
  const [requests, setRequests] = useState<RequestEntry[]>([])
  const [matches, setMatches] = useState<MatchEntry[]>([])
  const [myProfiles, setMyProfiles] = useState<FounderCard[]>([])
  const [loading, setLoading] = useState(true)
  // Modal state: null = closed, 'list' = my ideas list, 'form' = create/edit form
  const [modalView, setModalView] = useState<null | 'list' | 'form'>(null)
  const [editingProfile, setEditingProfile] = useState<FounderCard | null>(null) // null = new idea
  const [matchFlash, setMatchFlash] = useState<{ name: string; projectTitle: string } | null>(null)
  const [expandedCard, setExpandedCard] = useState<FounderCard | null>(null)
  const [connectTarget, setConnectTarget] = useState<FounderCard | null>(null)
  const [connectMessage, setConnectMessage] = useState('')
  const [search, setSearch] = useState('')
  const [skillFilter, setSkillFilter] = useState<string | null>(null)
  const [actionPending, setActionPending] = useState<string | null>(null)
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const [form, setForm] = useState({ project_title: '', project_description: '', skills_needed: '', skills_offered: '' })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [profileError, setProfileError] = useState('')

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchMyProfiles = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('founder_profiles')
      .select('*, profile:profiles(full_name,avatar_url), university:universities(name,short_name)')
      .eq('user_id', user.id).order('created_at', { ascending: true })
    setMyProfiles(data ?? [])
  }, [user])

  const fetchFounders = useCallback(async () => {
    if (!user) return
    setLoading(true)
    // Exclude specific profiles already swiped on (not entire users)
    const { data: swiped } = await supabase.from('founder_swipes')
      .select('swiped_profile_id').eq('swiper_id', user.id).not('swiped_profile_id', 'is', null)
    const swipedProfileIds = (swiped ?? []).map(s => s.swiped_profile_id).filter(Boolean) as string[]
    let query = supabase.from('founder_profiles')
      .select('*, profile:profiles(full_name,avatar_url), university:universities(name,short_name)')
      .eq('is_active', true).neq('user_id', user.id).order('created_at', { ascending: false })
    if (swipedProfileIds.length > 0) query = query.not('id', 'in', `(${swipedProfileIds.join(',')})`)
    const { data } = await query
    setFounders(data ?? [])
    setLoading(false)
  }, [user])

  const fetchRequests = useCallback(async () => {
    if (!user) return
    // Pending inbound connects to any of my ideas
    const { data: inbound } = await supabase.from('founder_swipes')
      .select('swiper_id, swiped_profile_id, message')
      .eq('swiped_id', user.id).eq('direction', 'right').eq('status', 'pending')
    if (!inbound?.length) { setRequests([]); return }

    const swiperIds = [...new Set(inbound.map(s => s.swiper_id))]
    const targetProfileIds = inbound.map(s => s.swiped_profile_id).filter(Boolean) as string[]
    const [{ data: swiperUsers }, { data: targetIdeas }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, avatar_url').in('id', swiperIds),
      targetProfileIds.length
        ? supabase.from('founder_profiles')
            .select('*, profile:profiles(full_name,avatar_url), university:universities(name,short_name)')
            .in('id', targetProfileIds)
        : Promise.resolve({ data: [] as FounderCard[], error: null }),
    ])
    const userMap = new Map((swiperUsers ?? []).map(u => [u.id, u]))
    const ideaMap = new Map(((targetIdeas ?? []) as FounderCard[]).map(i => [i.id, i]))

    const entries: RequestEntry[] = inbound
      .map(s => ({
        swiper_id: s.swiper_id,
        message: s.message ?? null,
        target_idea: ideaMap.get(s.swiped_profile_id) as FounderCard,
        swiper_name: userMap.get(s.swiper_id)?.full_name ?? null,
        swiper_avatar: userMap.get(s.swiper_id)?.avatar_url ?? null,
      }))
      .filter(e => e.target_idea)
    setRequests(entries)
  }, [user])

  const fetchMatches = useCallback(async () => {
    if (!user) return
    const { data: accepted } = await supabase.from('founder_swipes')
      .select('swiper_id, swiped_profile_id')
      .eq('swiped_id', user.id).eq('status', 'accepted')
    if (!accepted?.length) { setMatches([]); return }

    const swiperIds = [...new Set(accepted.map(s => s.swiper_id))]
    const targetProfileIds = accepted.map(s => s.swiped_profile_id).filter(Boolean) as string[]
    const [{ data: swiperUsers }, { data: targetIdeas }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, avatar_url').in('id', swiperIds),
      targetProfileIds.length
        ? supabase.from('founder_profiles')
            .select('*, profile:profiles(full_name,avatar_url), university:universities(name,short_name)')
            .in('id', targetProfileIds)
        : Promise.resolve({ data: [] as FounderCard[], error: null }),
    ])
    const userMap = new Map((swiperUsers ?? []).map(u => [u.id, u]))
    const ideaMap = new Map(((targetIdeas ?? []) as FounderCard[]).map(i => [i.id, i]))

    const entries: MatchEntry[] = accepted
      .map(s => ({
        swiper_id: s.swiper_id,
        swiper_name: userMap.get(s.swiper_id)?.full_name ?? null,
        swiper_avatar: userMap.get(s.swiper_id)?.avatar_url ?? null,
        target_idea: ideaMap.get(s.swiped_profile_id) as FounderCard,
      }))
      .filter(e => e.target_idea)
    setMatches(entries)
  }, [user])

  useEffect(() => { fetchMyProfiles(); fetchFounders(); fetchRequests(); fetchMatches() }, [fetchMyProfiles, fetchFounders, fetchRequests, fetchMatches])

  // ── Actions ────────────────────────────────────────────────────────────────
  const dismiss = (uid: string) => setDoneIds(prev => new Set([...prev, uid]))

  const openConnectModal = (f: FounderCard) => {
    setConnectTarget(f)
    setConnectMessage('')
    setExpandedCard(null)
  }

  const submitConnect = async () => {
    const f = connectTarget
    if (!f || !user || actionPending) return
    setActionPending(f.user_id)
    await supabase.from('founder_swipes').insert({
      swiper_id: user.id, swiped_id: f.user_id, swiped_profile_id: f.id,
      direction: 'right', message: connectMessage.trim() || null,
    })
    dismiss(f.user_id)
    setConnectTarget(null)
    setActionPending(null)
  }

  const handlePass = async (f: FounderCard) => {
    if (!user || actionPending) return
    setActionPending(f.user_id)
    await supabase.from('founder_swipes').insert({ swiper_id: user.id, swiped_id: f.user_id, swiped_profile_id: f.id, direction: 'left' })
    dismiss(f.user_id)
    setActionPending(null)
    if (expandedCard?.user_id === f.user_id) setExpandedCard(null)
  }

  const handleAccept = async (req: RequestEntry) => {
    if (!user || actionPending) return
    setActionPending(req.swiper_id)
    await supabase.from('founder_swipes')
      .update({ status: 'accepted' })
      .eq('swiper_id', req.swiper_id).eq('swiped_profile_id', req.target_idea.id)
    setRequests(prev => prev.filter(r => !(r.swiper_id === req.swiper_id && r.target_idea.id === req.target_idea.id)))
    fetchMatches()
    setMatchFlash({ name: req.swiper_name ?? 'them', projectTitle: req.target_idea.project_title })
    setActionPending(null)
  }

  const handleDecline = async (req: RequestEntry) => {
    if (!user || actionPending) return
    setActionPending(req.swiper_id)
    await supabase.from('founder_swipes')
      .update({ status: 'declined' })
      .eq('swiper_id', req.swiper_id).eq('swiped_profile_id', req.target_idea.id)
    setRequests(prev => prev.filter(r => !(r.swiper_id === req.swiper_id && r.target_idea.id === req.target_idea.id)))
    setActionPending(null)
  }

  const handleSaveProfile = async () => {
    if (!user) return
    if (!form.project_title.trim()) { setProfileError('Please enter your project title.'); return }
    const check = filterText(form.project_title, form.project_description, form.skills_needed, form.skills_offered)
    if (!check.ok) { setProfileError(check.reason!); return }
    setProfileError(''); setSaving(true)
    const parse = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean)
    const payload = { user_id: user.id, project_title: form.project_title.trim(), project_description: form.project_description.trim() || null, skills_needed: parse(form.skills_needed), skills_offered: parse(form.skills_offered), is_active: true }
    if (editingProfile) await supabase.from('founder_profiles').update(payload).eq('id', editingProfile.id)
    else await supabase.from('founder_profiles').insert(payload)
    await fetchMyProfiles(); setSaving(false); setModalView('list')
  }

  const handleDeleteProfile = async (id: string) => {
    if (!user) return
    setDeleting(id)
    await supabase.from('founder_profiles').delete().eq('id', id).eq('user_id', user.id)
    setMyProfiles(prev => prev.filter(p => p.id !== id))
    setDeleting(null)
  }

  // ── Computed ───────────────────────────────────────────────────────────────
  const myOffered = useMemo(() => {
    const all = new Set<string>()
    myProfiles.forEach(p => p.skills_offered.forEach(s => all.add(s.toLowerCase())))
    return [...all]
  }, [myProfiles])
  const getMatching = (card: FounderCard) => card.skills_needed.filter(s => myOffered.includes(s.toLowerCase()))

  const filterSkills = useMemo(() => {
    const set = new Set<string>()
    founders.forEach(f => f.skills_needed.forEach(s => set.add(s)))
    return [...set].sort().slice(0, 14)
  }, [founders])

  const displayed = useMemo(() => founders.filter(f => {
    if (doneIds.has(f.user_id)) return false
    const q = search.toLowerCase()
    if (q && ![f.project_title, f.profile?.full_name ?? '', f.project_description ?? '', ...f.skills_needed, ...f.skills_offered].some(t => t.toLowerCase().includes(q))) return false
    if (skillFilter && !f.skills_needed.includes(skillFilter)) return false
    return true
  }), [founders, doneIds, search, skillFilter])

  const matchCount = displayed.filter(f => getMatching(f).length > 0).length

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page-content" style={{ maxWidth: 1080 }}>
      <style>{`
        /* ── Core keyframes ── */
        @keyframes col-fade    { from{opacity:0;transform:scale(.95)} to{opacity:1;transform:scale(1)} }
        @keyframes col-spring  { 0%{opacity:0;transform:scale(.88) translateY(16px)} 60%{transform:scale(1.03) translateY(-2px)} 100%{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes col-up      { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes col-left    { from{opacity:0;transform:translateX(-16px)} to{opacity:1;transform:translateX(0)} }
        @keyframes col-spin    { to{transform:rotate(360deg)} }
        @keyframes col-float   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-9px)} }
        @keyframes col-pop     { 0%{transform:scale(.7);opacity:0} 65%{transform:scale(1.12)} 100%{transform:scale(1);opacity:1} }
        @keyframes col-tab-in  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }

        /* ── Match flash rings ── */
        @keyframes col-ring  { 0%{transform:scale(.88);opacity:.8} 70%{transform:scale(1.5);opacity:0} 100%{transform:scale(1.5);opacity:0} }
        @keyframes col-ring2 { 0%{transform:scale(.88);opacity:.5} 70%{transform:scale(1.75);opacity:0} 100%{transform:scale(1.75);opacity:0} }

        /* ── Glow pulses ── */
        @keyframes col-glow-r { 0%,100%{box-shadow:0 0 0 0 rgba(138,21,56,0), 0 6px 28px rgba(0,0,0,.35)} 50%{box-shadow:0 0 22px 4px rgba(138,21,56,.22), 0 6px 28px rgba(0,0,0,.35)} }
        @keyframes col-glow-g { 0%,100%{box-shadow:0 0 0 0 rgba(74,222,128,0)} 50%{box-shadow:0 0 18px 3px rgba(74,222,128,.2)} }
        @keyframes col-dot    { 0%,100%{box-shadow:0 0 0 0 rgba(74,222,128,.5)} 50%{box-shadow:0 0 0 5px rgba(74,222,128,0)} }
        @keyframes col-badge  { 0%,100%{box-shadow:0 0 0 0 rgba(74,222,128,.3)} 50%{box-shadow:0 0 12px 2px rgba(74,222,128,.18)} }
        @keyframes col-border { 0%,100%{border-color:rgba(138,21,56,.16)} 50%{border-color:rgba(138,21,56,.42)} }

        /* ── Cards ── */
        .col-card {
          transition: transform .2s cubic-bezier(.34,1.2,.64,1), box-shadow .2s, border-color .2s;
          cursor: pointer;
        }
        .col-card:hover {
          transform: translateY(-4px) scale(1.005);
          box-shadow: 0 20px 56px rgba(0,0,0,.5), 0 0 0 1px rgba(138,21,56,.22) !important;
          border-color: rgba(138,21,56,.32) !important;
        }
        .col-card-match:hover {
          box-shadow: 0 20px 56px rgba(0,0,0,.5), 0 0 20px rgba(74,222,128,.1) !important;
          border-color: rgba(74,222,128,.28) !important;
        }
        .col-match-card { animation: col-border 4s ease-in-out infinite; }

        /* ── Connect button shimmer ── */
        .col-connect {
          position: relative; overflow: hidden;
          transition: all .15s, filter .15s;
        }
        .col-connect::after {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,.22) 50%, transparent 65%);
          background-size: 300% 100%;
          background-position: -300% center;
          pointer-events: none;
          transition: background-position .5s ease;
        }
        .col-connect:hover::after { background-position: 300% center; }
        .col-connect:hover:not(:disabled) { filter: brightness(1.12); transform: scale(1.02); }

        /* ── Accept button pulse ── */
        .col-accept {
          transition: all .15s;
          animation: col-glow-r 3s ease-in-out infinite;
        }
        .col-accept:hover:not(:disabled) { filter: brightness(1.14); transform: scale(1.03); }

        /* ── Misc ── */
        .col-chip   { transition: all .15s; cursor:pointer; font-family:inherit; }
        .col-chip:hover { border-color: rgba(138,21,56,.5) !important; color: var(--accent) !important; background: rgba(138,21,56,.12) !important; }
        .col-chip-on { animation: col-pop .24s cubic-bezier(.34,1.56,.64,1) both; }
        .col-btn    { transition: all .15s; font-family:inherit; }
        .col-btn:hover:not(:disabled) { filter: brightness(1.1); }
        .col-req    { transition: border-color .18s, box-shadow .2s; }
        .col-req:hover { border-color: rgba(138,21,56,.3) !important; box-shadow: 0 12px 36px rgba(0,0,0,.42) !important; }
        .col-badge-g { animation: col-badge 2.5s ease-in-out infinite; }
        .col-dot-p   { animation: col-dot 2s ease-in-out infinite; }
        .col-float   { animation: col-float 3.5s ease-in-out infinite; }
        .col-tab     { animation: col-tab-in .24s cubic-bezier(.22,1,.36,1) both; }
      `}</style>

      {/* ── Match flash ── */}
      {matchFlash && (
        <div onClick={() => setMatchFlash(null)} style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,0.95)', backdropFilter:'blur(20px)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ textAlign:'center', animation:'col-spring .55s cubic-bezier(.34,1.56,.64,1) both', padding:32 }}>
            <div style={{ position:'relative', display:'inline-block', marginBottom:36 }}>
              {/* Outer ring */}
              <div style={{ position:'absolute', inset:-28, borderRadius:'50%', border:'1.5px solid rgba(138,21,56,.35)', animation:'col-ring2 2s ease-out infinite' }} />
              {/* Inner ring */}
              <div style={{ position:'absolute', inset:-14, borderRadius:'50%', border:'2px solid rgba(138,21,56,.5)', animation:'col-ring 1.8s ease-out infinite' }} />
              <div style={{ width:100, height:100, borderRadius:'50%', background:'linear-gradient(135deg,var(--accent),#d0205f)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:46, boxShadow:'0 0 64px rgba(138,21,56,.7), 0 0 120px rgba(138,21,56,.25)' }}>🤝</div>
            </div>
            <div style={{ fontSize:40, fontWeight:900, color:'#fff', marginBottom:10, letterSpacing:'-1.5px', animation:'col-up .4s .15s ease both' }}>It's a Match!</div>
            <div style={{ fontSize:15, color:'var(--text-secondary)', marginBottom:6, lineHeight:1.6, animation:'col-up .4s .22s ease both' }}>
              You and <span style={{ color:'var(--gold)', fontWeight:700 }}>{matchFlash.name}</span> are now collaborating
            </div>
            <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:38, animation:'col-up .4s .28s ease both' }}>{matchFlash.projectTitle}</div>
            <div style={{ display:'flex', gap:10, justifyContent:'center', animation:'col-up .4s .34s ease both' }}>
              <button className="col-connect" onClick={() => { setMatchFlash(null); navigate('/messages') }} style={{ padding:'12px 28px', background:'var(--accent)', border:'none', borderRadius:9999, color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', boxShadow:'0 8px 24px rgba(138,21,56,.45)', fontFamily:'inherit' }}>
                Message Now →
              </button>
              <button className="col-btn" onClick={() => { setMatchFlash(null); setTab('matches') }} style={{ padding:'12px 24px', background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', borderRadius:9999, color:'var(--text-muted)', fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>
                View Matches
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Expanded card modal ── */}
      {expandedCard && (
        <div onClick={e => { if (e.target === e.currentTarget) setExpandedCard(null) }} style={{ position:'fixed', inset:0, zIndex:100, background:'rgba(0,0,0,0.84)', backdropFilter:'blur(16px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
          <div style={{ width:'100%', maxWidth:540, background:'rgba(27,16,20,0.98)', border:'1px solid rgba(255,255,255,.08)', borderRadius:24, overflow:'hidden', animation:'col-spring .32s cubic-bezier(.34,1.4,.64,1)', boxShadow:'0 40px 90px rgba(0,0,0,.7)', maxHeight:'90vh', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'22px 26px 18px', background:'linear-gradient(160deg,rgba(138,21,56,.18),transparent)', borderBottom:'1px solid rgba(255,255,255,.05)', display:'flex', alignItems:'center', gap:14, flexShrink:0 }}>
              <Av name={expandedCard.profile?.full_name} url={expandedCard.profile?.avatar_url} size={52} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:17, fontWeight:700, color:'var(--text-primary)', marginBottom:2 }}>{expandedCard.profile?.full_name ?? 'Unknown'}</div>
                {expandedCard.university && <div style={{ fontSize:11.5, color:'var(--text-muted)' }}>📍 {expandedCard.university.name}</div>}
              </div>
              {getMatching(expandedCard).length > 0 && (
                <div style={{ padding:'4px 11px', borderRadius:9999, background:'rgba(74,222,128,.1)', border:'1px solid rgba(74,222,128,.28)', color:'#4ade80', fontSize:11, fontWeight:700, flexShrink:0 }}>
                  ✓ {getMatching(expandedCard).length} skill{getMatching(expandedCard).length > 1 ? 's' : ''} match
                </div>
              )}
              <button onClick={() => setExpandedCard(null)} style={{ width:30, height:30, borderRadius:'50%', background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.08)', color:'var(--text-muted)', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontFamily:'inherit' }}>✕</button>
            </div>
            <div style={{ padding:'22px 26px', overflowY:'auto', flex:1 }}>
              <div style={{ fontSize:19, fontWeight:800, color:'var(--text-primary)', marginBottom:10, letterSpacing:'-0.4px', lineHeight:1.3 }}>{expandedCard.project_title}</div>
              {expandedCard.project_description && (
                <div style={{ fontSize:13.5, color:'var(--text-secondary)', lineHeight:1.75, marginBottom:22, padding:'13px 15px', background:'rgba(255,255,255,.03)', borderRadius:12, border:'1px solid rgba(255,255,255,.05)' }}>
                  {expandedCard.project_description}
                </div>
              )}
              {expandedCard.skills_needed.length > 0 && (
                <div style={{ marginBottom:18 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', letterSpacing:'.1em', textTransform:'uppercase', marginBottom:9 }}>Looking for</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {expandedCard.skills_needed.map(s => <Pill key={s} label={s} variant="need" highlight={getMatching(expandedCard).includes(s)} />)}
                  </div>
                </div>
              )}
              {expandedCard.skills_offered.length > 0 && (
                <div>
                  <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', letterSpacing:'.1em', textTransform:'uppercase', marginBottom:9 }}>Brings to the table</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {expandedCard.skills_offered.map(s => <Pill key={s} label={s} variant="offer" />)}
                  </div>
                </div>
              )}
            </div>
            <div style={{ padding:'14px 26px 22px', borderTop:'1px solid rgba(255,255,255,.05)', display:'flex', gap:9, flexShrink:0 }}>
              <button className="col-btn" onClick={() => handlePass(expandedCard)} disabled={!!actionPending} style={{ padding:'11px 20px', background:'transparent', border:'1px solid rgba(255,255,255,.1)', borderRadius:12, color:'var(--text-muted)', fontSize:13, fontWeight:600, cursor:'pointer', opacity:actionPending?0.45:1, fontFamily:'inherit' }}>Pass</button>
              <button className="col-btn" onClick={() => openConnectModal(expandedCard)} disabled={!!actionPending} style={{ flex:1, padding:'11px', background:'var(--accent)', border:'none', borderRadius:12, color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', opacity:actionPending?0.45:1, boxShadow:'0 4px 16px rgba(138,21,56,.4)', fontFamily:'inherit' }}>
                Connect →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Connect pitch modal ── */}
      {connectTarget && (
        <div onClick={e => { if (e.target === e.currentTarget) setConnectTarget(null) }} style={{ position:'fixed', inset:0, zIndex:150, background:'rgba(0,0,0,0.86)', backdropFilter:'blur(16px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
          <div style={{ width:'100%', maxWidth:460, background:'rgba(27,16,20,0.98)', border:'1px solid rgba(255,255,255,.08)', borderRadius:22, overflow:'hidden', animation:'col-spring .32s cubic-bezier(.34,1.4,.64,1)', boxShadow:'0 40px 90px rgba(0,0,0,.7)' }}>
            <div style={{ padding:'20px 24px 16px', background:'linear-gradient(160deg,rgba(138,21,56,.15),transparent)', borderBottom:'1px solid rgba(255,255,255,.05)', display:'flex', alignItems:'center', gap:13 }}>
              <Av name={connectTarget.profile?.full_name} url={connectTarget.profile?.avatar_url} size={44} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', letterSpacing:'.08em', textTransform:'uppercase', marginBottom:3 }}>Connecting to</div>
                <div style={{ fontSize:14.5, fontWeight:700, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{connectTarget.project_title}</div>
                <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:1 }}>{connectTarget.profile?.full_name ?? 'Unknown'}</div>
              </div>
              <button onClick={() => setConnectTarget(null)} style={{ width:28, height:28, borderRadius:'50%', background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.08)', color:'var(--text-muted)', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontFamily:'inherit' }}>✕</button>
            </div>
            <div style={{ padding:'20px 24px 10px' }}>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', marginBottom:4 }}>Why are you a good fit? <span style={{ color:'var(--text-muted)', fontWeight:400 }}>· optional</span></div>
              <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:11, lineHeight:1.5 }}>Tell {connectTarget.profile?.full_name?.split(' ')[0] ?? 'them'} what you bring — skills, experience, or what excites you.</div>
              <textarea
                value={connectMessage}
                onChange={e => setConnectMessage(e.target.value)}
                placeholder={`e.g. "I've built 3 React apps and I'm passionate about this space…"`}
                maxLength={400}
                rows={4}
                style={{ ...iSt, resize:'none', lineHeight:1.65 }}
              />
              <div style={{ textAlign:'right', fontSize:11, color:'var(--text-muted)', marginTop:4 }}>{connectMessage.length}/400</div>
            </div>
            <div style={{ padding:'10px 24px 20px', display:'flex', gap:9 }}>
              <button onClick={() => setConnectTarget(null)} style={{ flex:1, padding:'11px', background:'transparent', border:'1px solid rgba(87,65,68,.35)', borderRadius:11, color:'var(--text-muted)', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
              <button className="col-btn" onClick={submitConnect} disabled={!!actionPending} style={{ flex:2, padding:'11px', background:'var(--accent)', border:'none', borderRadius:11, color:'#fff', fontSize:14, fontWeight:700, cursor: actionPending ? 'default' : 'pointer', opacity: actionPending ? .55 : 1, boxShadow:'0 4px 16px rgba(138,21,56,.35)', fontFamily:'inherit' }}>
                {actionPending ? 'Sending…' : 'Send Request →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:26 }}>
        <div>
          <h1 style={{ fontSize:'clamp(20px, 4vw, 30px)', fontWeight:900, color:'var(--text-primary)', letterSpacing:'-1px', lineHeight:1.1, marginBottom:5 }}>Founder Match</h1>
          <p style={{ fontSize:13, color:'var(--text-muted)', lineHeight:1.5 }}>
            Find student founders and connect with people building something you believe in.
          </p>
        </div>
        <button className="col-btn" onClick={() => setModalView('list')} style={{ padding:'9px 18px', background:'rgba(138,21,56,.12)', border:'1px solid rgba(138,21,56,.35)', borderRadius:11, color:'var(--text-secondary)', fontSize:13, fontWeight:600, cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', gap:7, fontFamily:'inherit' }}>
          <span>💡</span>
          {myProfiles.length > 0 ? `My Ideas (${myProfiles.length})` : 'Post Idea'}
        </button>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display:'flex', gap:3, background:'rgba(0,0,0,.22)', border:'1px solid rgba(255,255,255,.055)', borderRadius:14, padding:4, marginBottom:24 }}>
        {(['discover', 'requests', 'matches'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex:1, padding:'9px 12px', borderRadius:11, border: tab===t ? '1px solid rgba(138,21,56,.3)' : '1px solid transparent',
            background: tab===t ? 'rgba(138,21,56,.2)' : 'transparent',
            color: tab===t ? '#fff' : 'var(--text-muted)',
            fontSize:13, fontWeight: tab===t ? 700 : 500, cursor:'pointer', fontFamily:'inherit',
            display:'flex', alignItems:'center', justifyContent:'center', gap:7, transition:'all .15s',
          }}>
            {t === 'discover' ? 'Discover' : t === 'requests' ? 'Requests' : 'Matches'}
            {t === 'requests' && requests.length > 0 && (
              <span style={{ padding:'1px 7px', borderRadius:9999, background: tab==='requests' ? 'var(--accent)' : 'rgba(138,21,56,.4)', color:'#fff', fontSize:10, fontWeight:700 }}>{requests.length}</span>
            )}
            {t === 'matches' && matches.length > 0 && (
              <span style={{ padding:'1px 7px', borderRadius:9999, background: tab==='matches' ? 'var(--accent)' : 'rgba(138,21,56,.4)', color:'#fff', fontSize:10, fontWeight:700 }}>{matches.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════ DISCOVER ══════════ */}
      {tab === 'discover' && (
        <div className="col-tab">
          {/* No-profile nudge */}
          {myProfiles.length === 0 && (
            <div style={{ background:'rgba(138,21,56,.07)', border:'1px solid rgba(138,21,56,.18)', borderRadius:13, padding:'13px 18px', marginBottom:20, display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:18 }}>💡</span>
              <div style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.5 }}>
                Post your startup idea so founders can connect with you.{' '}
                <button onClick={() => { setEditingProfile(null); setForm({ project_title: '', project_description: '', skills_needed: '', skills_offered: '' }); setModalView('form') }} style={{ background:'none', border:'none', color:'var(--accent)', fontSize:13, fontWeight:700, cursor:'pointer', padding:0, fontFamily:'inherit' }}>Get started →</button>
              </div>
            </div>
          )}

          {/* Search + filters */}
          <div style={{ marginBottom:18 }}>
            <div style={{ position:'relative', marginBottom:10 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', pointerEvents:'none' }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects, skills, or founders…" style={{ ...iSt, paddingLeft:36, borderRadius:12 }} />
            </div>
            {filterSkills.length > 0 && (
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {skillFilter && (
                  <button className="col-chip" onClick={() => setSkillFilter(null)} style={{ padding:'4px 11px', borderRadius:9999, background:'rgba(138,21,56,.2)', border:'1px solid rgba(138,21,56,.5)', color:'var(--accent)', fontSize:11.5, fontWeight:600, fontFamily:'inherit' }}>
                    ✕ {skillFilter}
                  </button>
                )}
                {filterSkills.filter(s => s !== skillFilter).map(s => (
                  <button key={s} className="col-chip" onClick={() => setSkillFilter(s)} style={{ padding:'4px 11px', borderRadius:9999, background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.09)', color:'var(--text-muted)', fontSize:11.5, fontFamily:'inherit' }}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Status line */}
          {!loading && displayed.length > 0 && (
            <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
              <span>{displayed.length} founder{displayed.length !== 1 ? 's' : ''}{skillFilter ? ` · ${skillFilter}` : ''}</span>
              {myProfiles.length > 0 && matchCount > 0 && (
                <span style={{ padding:'2px 9px', borderRadius:9999, background:'rgba(74,222,128,.08)', border:'1px solid rgba(74,222,128,.22)', color:'#4ade80', fontSize:11, fontWeight:700 }}>
                  ✓ {matchCount} match your skills
                </span>
              )}
            </div>
          )}

          {loading ? (
            <div style={{ padding:'72px 0', textAlign:'center', color:'var(--text-muted)' }}>
              <Spinner />
              <div style={{ fontSize:13 }}>Finding founders…</div>
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ textAlign:'center', padding:'72px 0', color:'var(--text-muted)' }}>
              <div className="col-float" style={{ fontSize:40, marginBottom:16 }}>{search || skillFilter ? '🔍' : '✨'}</div>
              <div style={{ fontSize:17, fontWeight:700, color:'var(--text-secondary)', marginBottom:7 }}>
                {search || skillFilter ? 'No founders match' : "You've seen everyone for now"}
              </div>
              <div style={{ fontSize:13, lineHeight:1.6 }}>
                {search || skillFilter ? 'Try a different filter.' : 'Check back later.'}
              </div>
              {(search || skillFilter) && (
                <button onClick={() => { setSearch(''); setSkillFilter(null) }} style={{ marginTop:18, padding:'8px 20px', background:'rgba(138,21,56,.12)', border:'1px solid rgba(138,21,56,.28)', borderRadius:9999, color:'var(--accent)', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Clear filters</button>
              )}
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(min(100%,296px),1fr))', gap:14 }}>
              {displayed.map((f, i) => {
                const matching = getMatching(f)
                const pending = actionPending === f.user_id
                return (
                  <div key={f.id} className={`col-card${matching.length > 0 ? ' col-card-match' : ''}`} onClick={() => setExpandedCard(f)} style={{ background:'rgba(30,18,22,.85)', border:'1px solid rgba(255,255,255,.07)', borderRadius:18, overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 6px 28px rgba(0,0,0,.35)', animation:`col-up .3s cubic-bezier(.22,1,.36,1) ${Math.min(i,7)*.05}s both` }}>
                    {/* Top */}
                    <div style={{ padding:'16px 18px 12px', background: matching.length > 0 ? 'linear-gradient(160deg,rgba(74,222,128,.07),transparent)' : 'linear-gradient(160deg,rgba(138,21,56,.1),transparent)', display:'flex', alignItems:'center', gap:11 }}>
                      <Av name={f.profile?.full_name} url={f.profile?.avatar_url} size={42} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.profile?.full_name ?? 'Unknown'}</div>
                        {f.university && <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:1 }}>{f.university.short_name ?? f.university.name}</div>}
                      </div>
                      {matching.length > 0 && (
                        <div className="col-badge-g" style={{ padding:'3px 9px', borderRadius:9999, background:'rgba(74,222,128,.1)', border:'1px solid rgba(74,222,128,.28)', color:'#4ade80', fontSize:10, fontWeight:700, flexShrink:0 }}>✓ Match</div>
                      )}
                    </div>

                    {/* Body */}
                    <div style={{ padding:'0 18px 14px', flex:1 }}>
                      <div style={{ fontSize:14.5, fontWeight:700, color:'var(--text-primary)', marginBottom:6, lineHeight:1.35, letterSpacing:'-0.2px' }}>{f.project_title}</div>
                      {f.project_description && (
                        <div style={{ fontSize:12.5, color:'var(--text-secondary)', lineHeight:1.62, marginBottom:12, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
                          {f.project_description}
                        </div>
                      )}
                      {f.skills_needed.length > 0 && (
                        <div style={{ marginBottom:7 }}>
                          <div style={{ fontSize:9.5, fontWeight:700, color:'var(--text-muted)', letterSpacing:'.09em', textTransform:'uppercase', marginBottom:5 }}>Looking for</div>
                          <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                            {f.skills_needed.slice(0, 4).map(s => <Pill key={s} label={s} variant="need" highlight={matching.includes(s)} />)}
                            {f.skills_needed.length > 4 && <span style={{ fontSize:11, color:'var(--text-muted)', padding:'3px 4px' }}>+{f.skills_needed.length - 4}</span>}
                          </div>
                        </div>
                      )}
                      {f.skills_offered.length > 0 && (
                        <div>
                          <div style={{ fontSize:9.5, fontWeight:700, color:'var(--text-muted)', letterSpacing:'.09em', textTransform:'uppercase', marginBottom:5 }}>Brings</div>
                          <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                            {f.skills_offered.slice(0, 3).map(s => <Pill key={s} label={s} variant="offer" />)}
                            {f.skills_offered.length > 3 && <span style={{ fontSize:11, color:'var(--text-muted)', padding:'3px 4px' }}>+{f.skills_offered.length - 3}</span>}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Footer — two buttons only */}
                    <div onClick={e => e.stopPropagation()} style={{ padding:'10px 14px', borderTop:'1px solid rgba(255,255,255,.05)', display:'flex', gap:7 }}>
                      <button className="col-btn" onClick={() => handlePass(f)} disabled={pending} style={{ padding:'8px 14px', background:'transparent', border:'1px solid rgba(255,255,255,.09)', borderRadius:9, color:'var(--text-muted)', fontSize:12, fontWeight:600, cursor:'pointer', opacity:pending?0.4:1, fontFamily:'inherit' }}>Pass</button>
                      <button className="col-connect" onClick={() => openConnectModal(f)} disabled={pending} style={{ flex:1, padding:'8px', background: matching.length > 0 ? 'rgba(74,222,128,.12)' : 'rgba(138,21,56,.18)', border: matching.length > 0 ? '1px solid rgba(74,222,128,.3)' : '1px solid rgba(138,21,56,.38)', borderRadius:9, color: matching.length > 0 ? '#4ade80' : 'var(--accent)', fontSize:13, fontWeight:700, cursor:'pointer', opacity:pending?0.4:1, fontFamily:'inherit' }}>
                        Connect →
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════ REQUESTS ══════════ */}
      {tab === 'requests' && (
        <div className="col-tab">
          {requests.length === 0 ? (
            <div style={{ textAlign:'center', padding:'72px 0', color:'var(--text-muted)' }}>
              <div className="col-float" style={{ fontSize:40, marginBottom:16 }}>📬</div>
              <div style={{ fontSize:17, fontWeight:700, color:'var(--text-secondary)', marginBottom:7 }}>No pending requests</div>
              <div style={{ fontSize:13, lineHeight:1.6 }}>When founders want to collaborate on your ideas, they'll show up here.</div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {requests.map((req, ri) => {
                const pending = actionPending === req.swiper_id
                return (
                  <div key={`${req.swiper_id}-${req.target_idea.id}`} className="col-req" style={{ background:'rgba(30,18,22,.85)', border:'1px solid rgba(255,255,255,.07)', borderRadius:18, padding:'18px 20px', boxShadow:'0 4px 20px rgba(0,0,0,.28)', animation:`col-left .3s cubic-bezier(.22,1,.36,1) ${ri*.07}s both` }}>
                    <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
                      <Av name={req.swiper_name} url={req.swiper_avatar} size={46} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:15, fontWeight:700, color:'var(--text-primary)', marginBottom:2 }}>{req.swiper_name ?? 'Someone'}</div>
                        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                          <span style={{ fontSize:12, color:'var(--text-muted)' }}>wants to join</span>
                          <span style={{ fontSize:12, fontWeight:700, color:'var(--accent)', background:'rgba(138,21,56,.1)', border:'1px solid rgba(138,21,56,.22)', borderRadius:7, padding:'2px 9px' }}>{req.target_idea.project_title}</span>
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:7, flexShrink:0 }}>
                        <button className="col-btn" onClick={() => handleDecline(req)} disabled={pending} style={{ padding:'8px 14px', background:'transparent', border:'1px solid rgba(255,255,255,.09)', borderRadius:9, color:'var(--text-muted)', fontSize:12, fontWeight:600, cursor:'pointer', opacity:pending?0.4:1, fontFamily:'inherit' }}>Decline</button>
                        <button className="col-accept" onClick={() => handleAccept(req)} disabled={pending} style={{ padding:'8px 16px', background:'var(--accent)', border:'none', borderRadius:9, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:pending?0.4:1, boxShadow:'0 3px 12px rgba(138,21,56,.38)', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                          {pending ? '…' : 'Accept'}
                        </button>
                      </div>
                    </div>
                    {req.message && (
                      <div style={{ marginTop:12, marginLeft:60, padding:'11px 14px', background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.06)', borderRadius:11, borderLeft:'3px solid rgba(138,21,56,.4)' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', letterSpacing:'.08em', textTransform:'uppercase', marginBottom:5 }}>Their pitch</div>
                        <div style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.65 }}>{req.message}</div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════ MATCHES ══════════ */}
      {tab === 'matches' && (
        <div className="col-tab">
          {matches.length === 0 ? (
            <div style={{ textAlign:'center', padding:'72px 0', color:'var(--text-muted)' }}>
              <div className="col-float" style={{ width:68, height:68, borderRadius:18, background:'rgba(138,21,56,.08)', border:'1px solid rgba(138,21,56,.14)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:34, margin:'0 auto 18px' }}>🤝</div>
              <div style={{ fontSize:17, fontWeight:700, color:'var(--text-secondary)', marginBottom:7 }}>No matches yet</div>
              <div style={{ fontSize:13, lineHeight:1.6, maxWidth:240, margin:'0 auto 18px' }}>Accept requests to see your collaborators here.</div>
              <button onClick={() => setTab('discover')} style={{ padding:'8px 22px', background:'rgba(138,21,56,.12)', border:'1px solid rgba(138,21,56,.28)', borderRadius:9999, color:'var(--accent)', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Browse founders →</button>
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(min(100%,290px),1fr))', gap:12 }}>
              {matches.map((m, mi) => (
                <div key={`${m.swiper_id}-${m.target_idea.id}`} className="col-card col-match-card" style={{ background:'rgba(30,18,22,.85)', border:'1px solid rgba(138,21,56,.16)', borderRadius:18, padding:'18px 20px', display:'flex', flexDirection:'column', gap:14, boxShadow:'0 4px 20px rgba(0,0,0,.28)', animation:`col-up .3s cubic-bezier(.22,1,.36,1) ${mi*.07}s both` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ position:'relative', flexShrink:0 }}>
                      <Av name={m.swiper_name} url={m.swiper_avatar} size={44} />
                      <div className="col-dot-p" style={{ position:'absolute', bottom:-1, right:-1, width:14, height:14, borderRadius:'50%', background:'#4ade80', border:'2.5px solid rgba(30,18,22,1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:7, color:'#fff', fontWeight:900 }}>✓</div>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14.5, fontWeight:700, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.swiper_name ?? 'Unknown'}</div>
                      <div style={{ fontSize:11, color:'#4ade80', fontWeight:600, marginTop:1 }}>Collaborator</div>
                    </div>
                  </div>
                  <div style={{ background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.06)', borderRadius:12, padding:'12px 14px' }}>
                    <div style={{ fontSize:9.5, fontWeight:700, color:'var(--text-muted)', letterSpacing:'.09em', textTransform:'uppercase', marginBottom:5 }}>Joined your idea</div>
                    <div style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', lineHeight:1.35, marginBottom: m.target_idea.project_description ? 6 : 0 }}>{m.target_idea.project_title}</div>
                    {m.target_idea.project_description && (
                      <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.58, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{m.target_idea.project_description}</div>
                    )}
                  </div>
                  <button className="col-btn" onClick={() => navigate('/messages')} style={{ padding:'9px', background:'rgba(138,21,56,.16)', border:'1px solid rgba(138,21,56,.35)', borderRadius:10, color:'var(--accent)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                    Message →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════ MY IDEAS MODAL ══════════ */}
      {modalView !== null && (
        <div onClick={e => { if (e.target === e.currentTarget) setModalView(null) }} style={{ position:'fixed', inset:0, zIndex:50, background:'rgba(0,0,0,.8)', backdropFilter:'blur(14px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
          <div style={{ width:'100%', maxWidth:500, background:'rgba(22,13,17,.98)', border:'1px solid rgba(255,255,255,.07)', borderRadius:22, padding:'clamp(18px, 4vw, 28px) clamp(16px, 4vw, 30px)', maxHeight:'88vh', overflowY:'auto', animation:'col-spring .32s cubic-bezier(.34,1.4,.64,1)', boxShadow:'0 40px 90px rgba(0,0,0,.7)' }}>

            {/* ── LIST VIEW ── */}
            {modalView === 'list' && (
              <>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
                  <h2 style={{ fontSize:19, fontWeight:800, color:'var(--text-primary)', letterSpacing:'-0.4px' }}>My Ideas</h2>
                  <button onClick={() => setModalView(null)} style={{ width:30, height:30, borderRadius:'50%', background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.08)', color:'var(--text-muted)', fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'inherit' }}>✕</button>
                </div>
                {myProfiles.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'28px 0 16px', color:'var(--text-muted)' }}>
                    <div style={{ fontSize:32, marginBottom:10 }}>💡</div>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text-secondary)', marginBottom:5 }}>No ideas yet</div>
                    <div style={{ fontSize:12 }}>Post your first startup idea to find collaborators.</div>
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:9, marginBottom:14 }}>
                    {myProfiles.map(p => (
                      <div key={p.id} style={{ background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.07)', borderRadius:13, padding:'14px 16px', display:'flex', alignItems:'flex-start', gap:13 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.project_title}</div>
                          {p.project_description && <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.5, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{p.project_description}</div>}
                          {(p.skills_needed.length > 0 || p.skills_offered.length > 0) && (
                            <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:7 }}>
                              {p.skills_needed.slice(0, 3).map(s => <Pill key={s} label={s} variant="need" />)}
                              {p.skills_offered.slice(0, 2).map(s => <Pill key={s} label={s} variant="offer" />)}
                            </div>
                          )}
                        </div>
                        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                          <button onClick={() => { setEditingProfile(p); setForm({ project_title: p.project_title, project_description: p.project_description ?? '', skills_needed: p.skills_needed.join(', '), skills_offered: p.skills_offered.join(', ') }); setModalView('form') }} style={{ padding:'6px 12px', background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', borderRadius:8, color:'var(--text-secondary)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Edit</button>
                          <button onClick={() => handleDeleteProfile(p.id)} disabled={deleting === p.id} style={{ padding:'6px 12px', background:'rgba(248,113,113,.06)', border:'1px solid rgba(248,113,113,.18)', borderRadius:8, color:'#f87171', fontSize:12, cursor:'pointer', opacity: deleting === p.id ? .5 : 1, fontFamily:'inherit' }}>{deleting === p.id ? '…' : 'Delete'}</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => { setEditingProfile(null); setForm({ project_title: '', project_description: '', skills_needed: '', skills_offered: '' }); setProfileError(''); setModalView('form') }} style={{ width:'100%', padding:'11px', background:'var(--accent)', border:'none', borderRadius:11, color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 16px rgba(138,21,56,.32)', fontFamily:'inherit' }}>
                  + Add New Idea
                </button>
              </>
            )}

            {/* ── FORM VIEW ── */}
            {modalView === 'form' && (
              <>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
                  <div>
                    <button onClick={() => { setModalView(myProfiles.length > 0 ? 'list' : null); setProfileError('') }} style={{ background:'none', border:'none', color:'var(--text-muted)', fontSize:12, cursor:'pointer', padding:0, marginBottom:6, display:'flex', alignItems:'center', gap:4, fontFamily:'inherit' }}>← Back</button>
                    <h2 style={{ fontSize:19, fontWeight:800, color:'var(--text-primary)', letterSpacing:'-0.4px' }}>{editingProfile ? 'Edit Idea' : 'New Idea'}</h2>
                  </div>
                  <button onClick={() => { setModalView(null); setProfileError('') }} style={{ width:30, height:30, borderRadius:'50%', background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.08)', color:'var(--text-muted)', fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontFamily:'inherit' }}>✕</button>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
                  <Field label="Project Title" hint="What are you building?">
                    <input value={form.project_title} onChange={e => setForm(f => ({ ...f, project_title: e.target.value }))} placeholder="e.g. AI-powered campus marketplace" maxLength={100} style={iSt} />
                  </Field>
                  <Field label="Description" hint="The problem you're solving and your vision.">
                    <textarea value={form.project_description} onChange={e => setForm(f => ({ ...f, project_description: e.target.value }))} placeholder="We're building a platform that connects students with…" maxLength={500} rows={4} style={{ ...iSt, resize:'vertical', minHeight:88, lineHeight:1.6 }} />
                  </Field>
                  <div style={{ height:1, background:'rgba(87,65,68,.2)', borderRadius:9999 }} />
                  <Field label="Skills Needed" hint="Comma-separated — what roles are you hiring for?">
                    <input value={form.skills_needed} onChange={e => setForm(f => ({ ...f, skills_needed: e.target.value }))} placeholder="Backend Dev, UI Design, Marketing" style={iSt} />
                  </Field>
                  <Field label="Skills You Offer" hint="Comma-separated — what do you bring?">
                    <input value={form.skills_offered} onChange={e => setForm(f => ({ ...f, skills_offered: e.target.value }))} placeholder="Product Management, React, Business Dev" style={iSt} />
                  </Field>
                </div>
                {profileError && <div style={{ fontSize:12, color:'#f87171', background:'rgba(248,113,113,.07)', border:'1px solid rgba(248,113,113,.2)', borderRadius:8, padding:'8px 12px', marginTop:12 }}>{profileError}</div>}
                <div style={{ display:'flex', gap:9, marginTop:18 }}>
                  <button onClick={() => { setModalView(myProfiles.length > 0 ? 'list' : null); setProfileError('') }} style={{ flex:1, padding:'11px', background:'transparent', border:'1px solid rgba(87,65,68,.3)', borderRadius:11, color:'var(--text-muted)', fontSize:14, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
                  <button className="col-btn" onClick={handleSaveProfile} disabled={saving} style={{ flex:2, padding:'11px', background: saving ? 'rgba(138,21,56,.3)' : 'var(--accent)', border:'none', borderRadius:11, color:'#fff', fontSize:14, fontWeight:700, cursor: saving ? 'default' : 'pointer', opacity: saving ? .65 : 1, boxShadow: saving ? 'none' : '0 4px 16px rgba(138,21,56,.32)', fontFamily:'inherit' }}>
                    {saving ? 'Saving…' : editingProfile ? 'Save Changes' : 'Post Idea'}
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}
    </div>
  )
}
