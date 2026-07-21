import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import ClubApplicationModal from '../../components/ClubApplicationModal'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

interface EventRow {
  id: string
  club_id: string
  title: string
  description: string | null
  location: string | null
  start_time: string | null
  end_time: string | null
  max_attendees: number | null
  karak_points_reward: number
  is_live: boolean
  attendee_count: number
  category: string | null
  registration_closed: boolean
  club?: { id: string; name: string; logo_url: string | null; category: string | null } | null
}


type Filter = 'all' | 'live' | 'today' | 'week'

interface PastEvent {
  id: string
  title: string
  start_time: string | null
  end_time: string | null
  location: string | null
  attendee_count: number
  karak_points_reward: number
  category: string | null
  club?: { id: string; name: string; logo_url: string | null; category: string | null } | null
}

interface EventImage {
  id: string
  url: string
  caption: string | null
}

const CATEGORY_COLORS: Record<string, string> = {
  Technology: '#0ea5e9',
  'Arts & Culture': '#a855f7',
  Sports: '#e9c176',
  Entrepreneurship: '#f97316',
  Engineering: '#22c55e',
  Business: '#ec4899',
  Fashion: '#f43f8a',
}

function formatEventDate(iso: string | null) {
  if (!iso) return 'TBA'
  const d = new Date(iso), now = new Date()
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  if (d.toDateString() === now.toDateString()) return `Today · ${time}`
  if (d.toDateString() === new Date(now.getTime() + 86400000).toDateString()) return `Tomorrow · ${time}`
  return `${d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`
}

function isToday(iso: string | null) {
  if (!iso) return false
  return new Date(iso).toDateString() === new Date().toDateString()
}

function isThisWeek(iso: string | null) {
  if (!iso) return false
  const d = new Date(iso).getTime(), now = Date.now()
  return d >= now && d <= now + 7 * 86400000
}

export default function EventsPage() {
  const { user, session, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [memberClubIds, setMemberClubIds] = useState<Set<string>>(new Set())
  const [pendingClubIds, setPendingClubIds] = useState<Set<string>>(new Set())
  const [registeredEventIds, setRegisteredEventIds] = useState<Set<string>>(new Set())
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [registering, setRegistering] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null)
  const [registrationQR, setRegistrationQR] = useState<EventRow | null>(null)
  const [applyClub, setApplyClub] = useState<{ id: string; name: string } | null>(null)
  const [pastEvents, setPastEvents] = useState<PastEvent[]>([])
  const [pastLoading, setPastLoading] = useState(false)
  const [galleryEvent, setGalleryEvent] = useState<PastEvent | null>(null)
  const [galleryImages, setGalleryImages] = useState<EventImage[]>([])
  const [galleryLoading, setGalleryLoading] = useState(false)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { const t = setTimeout(() => setMounted(true), 30); return () => clearTimeout(t) }, [])

  const fetchMemberships = useCallback(async () => {
    if (!user) return
    const [{ data: mem }, { data: pending }, { data: regs }] = await Promise.all([
      supabase.from('club_memberships').select('club_id, role').eq('user_id', user.id),
      supabase.from('club_form_responses').select('club_id').eq('user_id', user.id).eq('status', 'pending'),
      supabase.from('event_attendees').select('event_id').eq('user_id', user.id),
    ])
    setMemberClubIds(new Set((mem ?? []).map((m: any) => m.club_id)))
    setPendingClubIds(new Set((pending ?? []).map((r: any) => r.club_id)))
    setRegisteredEventIds(new Set((regs ?? []).map((r: any) => r.event_id)))
  }, [user])

  const fetchPastEvents = useCallback(async () => {
    setPastLoading(true)
    let q = supabase
      .from('events')
      .select('id, title, start_time, end_time, location, attendee_count, karak_points_reward, category, club:clubs!inner(id, name, logo_url, category, country)')
      .eq('is_live', false)
      .lt('start_time', new Date().toISOString())
      .order('start_time', { ascending: false })
      .limit(50)
    if (profile?.country) q = q.eq('club.country', profile.country)
    const { data } = await q
    setPastEvents((data as unknown as PastEvent[]) ?? [])
    setPastLoading(false)
  }, [profile?.country])

  const openGallery = async (ev: PastEvent) => {
    setGalleryEvent(ev)
    setGalleryImages([])
    setLightboxIdx(null)
    setGalleryLoading(true)
    const { data } = await supabase
      .from('event_images')
      .select('id, url, caption')
      .eq('event_id', ev.id)
      .order('created_at', { ascending: true })
    setGalleryImages(data ?? [])
    setGalleryLoading(false)
  }

  const fetchEvents = useCallback(async () => {
    if (!user) return
    setLoading(true)
    let q = supabase
      .from('events')
      .select('*, club:clubs!inner(id, name, logo_url, category, country)')
      .or('is_live.eq.true,start_time.gt.' + new Date().toISOString())
      .order('is_live', { ascending: false })
      .order('start_time', { ascending: true })
    if (profile?.country) q = q.eq('club.country', profile.country)
    const { data } = await q
    setEvents(data ?? [])
    setLoading(false)
  }, [user, profile?.country])

  useEffect(() => { fetchEvents(); fetchMemberships(); fetchPastEvents() }, [fetchEvents, fetchMemberships, fetchPastEvents])

  const handleJoin = async (clubId: string, clubName: string) => {
    if (!user || joiningId) return
    const { data: formData } = await supabase.from('club_forms').select('id').eq('club_id', clubId).eq('is_active', true).maybeSingle()
    if (formData) { setApplyClub({ id: clubId, name: clubName }); return }
    setJoiningId(clubId)
    await supabase.from('club_memberships').insert({ club_id: clubId, user_id: user.id })
    await supabase.from('karak_transactions').insert({ user_id: user.id, points: 5, reason: `Joined club: ${clubName}` })
    await refreshProfile()
    setJoiningId(null)
    fetchMemberships()
  }

  const handleRegister = async (event: EventRow) => {
    if (!user || registering) return
    if (registeredEventIds.has(event.id)) {
      setRegistrationQR(event)
      return
    }
    setRegistering(event.id)
    // attendee_count is maintained server-side by a DB trigger on event_attendees — do not update it from the client.
    await supabase.from('event_attendees').insert({ event_id: event.id, user_id: user.id, checked_in_at: null })
    setRegisteredEventIds(prev => new Set([...prev, event.id]))
    setEvents(prev => prev.map(e => e.id === event.id ? { ...e, attendee_count: e.attendee_count + 1 } : e))
    setRegistering(null)
    setRegistrationQR(event)
    // fire-and-forget confirmation email
    fetch(`${SUPABASE_URL}/functions/v1/send-event-confirmation`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: event.id, userId: user.id }),
    }).catch(() => {})
  }

  const liveCount  = events.filter(e => e.is_live).length
  const todayCount = events.filter(e => !e.is_live && isToday(e.start_time)).length
  const weekCount  = events.filter(e => !e.is_live && isThisWeek(e.start_time)).length

  const filtered = events.filter(e => {
    const q = search.toLowerCase()
    if (q && !e.title.toLowerCase().includes(q) && !(e.club?.name ?? '').toLowerCase().includes(q) && !(e.location ?? '').toLowerCase().includes(q)) return false
    if (filter === 'live')  return e.is_live
    if (filter === 'today') return !e.is_live && isToday(e.start_time)
    if (filter === 'week')  return !e.is_live && isThisWeek(e.start_time)
    return true
  })

  const FILTERS: { key: Filter; label: string; count: number }[] = [
    { key: 'all',   label: 'All',       count: events.length },
    { key: 'live',  label: 'Live Now',  count: liveCount },
    { key: 'today', label: 'Today',     count: todayCount },
    { key: 'week',  label: 'This Week', count: weekCount },
  ]

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '28px 20px 60px' }}>
      <style>{`
        @keyframes evUp        { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:none} }
        @keyframes evTitleIn   { 0%{opacity:0;transform:translateY(24px) scale(.95)} 65%{transform:translateY(-3px) scale(1.005)} 100%{opacity:1;transform:none} }
        @keyframes evSubIn     { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }
        @keyframes evGradient  { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes evFilterIn  { 0%{opacity:0;transform:translateY(10px) scale(.9)} 70%{transform:translateY(-2px) scale(1.02)} 100%{opacity:1;transform:none} }
        @keyframes evCardIn    { 0%{opacity:0;transform:translateY(28px) scale(.95)} 65%{transform:translateY(-4px) scale(1.008)} 100%{opacity:1;transform:none} }
        @keyframes evDatePop   { 0%{opacity:0;transform:scale(.6) rotate(-8deg)} 65%{transform:scale(1.12) rotate(2deg)} 100%{opacity:1;transform:none} }
        @keyframes livePulse   { 0%,100%{opacity:1} 50%{opacity:0.35} }
        @keyframes liveRing    { from{transform:scale(1);opacity:.7} to{transform:scale(2.6);opacity:0} }
        @keyframes goldBreath  { 0%,100%{box-shadow:0 0 0 0 rgba(233,193,118,0)} 50%{box-shadow:0 0 10px 2px rgba(233,193,118,.22)} }
        @keyframes evModalIn   { 0%{opacity:0;transform:translateY(40px) scale(.94)} 65%{transform:translateY(-4px) scale(1.01)} 100%{opacity:1;transform:none} }
        @keyframes evOverlayIn { from{opacity:0} to{opacity:1} }
        @keyframes evSearchIn  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
        @keyframes spin        { to{transform:rotate(360deg)} }
        @keyframes emptyIn     { 0%{opacity:0;transform:scale(.8) translateY(16px)} 65%{transform:scale(1.04) translateY(-3px)} 100%{opacity:1;transform:none} }
        @keyframes emptyOrb    { 0%,100%{transform:scale(1);opacity:.25} 50%{transform:scale(1.3);opacity:.45} }
        @keyframes filterPing  { from{transform:scale(1);opacity:.6} to{transform:scale(2.2);opacity:0} }
        @keyframes qrPop       { 0%{opacity:0;transform:scale(.8) translateY(20px)} 65%{transform:scale(1.04) translateY(-3px)} 100%{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes scanLine    { 0%{top:8px;opacity:.9} 48%{opacity:.9} 50%{top:calc(100% - 8px);opacity:.7} 100%{top:8px;opacity:.9} }
        @keyframes cornerPulse { 0%,100%{opacity:.5} 50%{opacity:1} }
        @keyframes glowOrb     { 0%,100%{transform:scale(1);opacity:.18} 50%{transform:scale(1.2);opacity:.28} }
        @keyframes regPop      { 0%{transform:scale(0);opacity:0} 60%{transform:scale(1.15);opacity:1} 100%{transform:scale(1);opacity:1} }
        @keyframes hallIn      { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }
        @keyframes trophyBob   { 0%,100%{transform:translateY(0) rotate(-4deg)} 50%{transform:translateY(-5px) rotate(4deg)} }
        @keyframes hallRowIn   { 0%{opacity:0;transform:translateX(-12px)} to{opacity:1;transform:none} }
        @keyframes galleryIn   { 0%{opacity:0;transform:translateY(100%)} 100%{opacity:1;transform:translateY(0)} }
        @keyframes imgFadeIn   { from{opacity:0;transform:scale(.92)} to{opacity:1;transform:scale(1)} }
        @keyframes lbIn        { from{opacity:0;transform:scale(.88)} to{opacity:1;transform:scale(1)} }
        @keyframes lbSlideL    { from{opacity:0;transform:translateX(60px) scale(.96)} to{opacity:1;transform:none} }
        @keyframes lbSlideR    { from{opacity:0;transform:translateX(-60px) scale(.96)} to{opacity:1;transform:none} }
        @keyframes thumbIn     { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:none} }
        .hall-row { transition: background .15s, transform .18s; cursor: pointer; }
        .hall-row:hover { background: rgba(233,193,118,0.06) !important; transform: translateX(3px); }
        .gal-thumb { transition: transform .2s cubic-bezier(.22,1,.36,1), opacity .2s, box-shadow .2s; cursor: pointer; }
        .gal-thumb:hover { transform: scale(1.06) translateY(-2px); opacity: 1 !important; box-shadow: 0 8px 28px rgba(0,0,0,.6) !important; }
        .gal-cell { transition: transform .22s cubic-bezier(.22,1,.36,1), box-shadow .22s; cursor: pointer; overflow: hidden; }
        .gal-cell:hover { transform: scale(1.025); z-index: 2; }
        .gal-cell:hover img { transform: scale(1.06); }
        .gal-cell img { transition: transform .4s cubic-bezier(.22,1,.36,1); }
        .lb-nav { transition: background .15s, transform .2s; }
        .lb-nav:hover { background: rgba(255,255,255,0.18) !important; transform: translateY(-50%) scale(1.1) !important; }

        .ev-row {
          transition: background .18s, transform .22s cubic-bezier(.22,1,.36,1), box-shadow .22s, border-color .18s;
          position: relative;
        }
        .ev-row:hover {
          background: rgba(255,255,255,0.055) !important;
          transform: translateY(-3px) scale(1.008);
          box-shadow: 0 16px 48px rgba(0,0,0,.45) !important;
          border-color: rgba(138,21,56,.28) !important;
        }
        .ev-row:hover .ev-stripe { opacity: 1 !important; }
        .ev-row:hover .ev-date-block { border-color: rgba(138,21,56,.35) !important; background: rgba(138,21,56,.18) !important; }

        .ev-action-btn { transition: all .18s cubic-bezier(.22,1,.36,1); }
        .ev-action-btn:hover:not(:disabled) {
          filter: brightness(1.15);
          transform: translateY(-2px) scale(1.04);
          box-shadow: 0 8px 24px rgba(138,21,56,.5) !important;
        }

        .ev-search:focus {
          outline: none !important;
          border-color: rgba(138,21,56,.55) !important;
          box-shadow: 0 0 0 3px rgba(138,21,56,.12) !important;
        }

        .ev-filter-ring {
          position: absolute; inset: -1px; border-radius: 9999px;
          border: 1px solid rgba(138,21,56,.6);
          animation: filterPing 1.6s ease-out infinite;
          pointer-events: none;
        }
      `}</style>

      {/* Hero */}
      <div style={{ marginBottom: 24, position: 'relative' }}>
        <div style={{ position:'absolute', top:-30, left:-40, width:220, height:120, borderRadius:'50%', background:'radial-gradient(ellipse,rgba(138,21,56,.18) 0%,transparent 70%)', pointerEvents:'none', animation:'emptyOrb 9s ease-in-out infinite' }}/>
        <div style={{ position:'absolute', top:-10, right:-20, width:160, height:100, borderRadius:'50%', background:'radial-gradient(ellipse,rgba(192,37,90,.12) 0%,transparent 70%)', pointerEvents:'none', animation:'emptyOrb 12s ease-in-out 1s infinite' }}/>
        <h1 style={{
          margin: 0, letterSpacing: '-0.6px',
          fontSize: 'clamp(22px,4vw,28px)', fontWeight: 900,
          background: 'linear-gradient(90deg,#fff 0%,#e57c9a 35%,#fff 55%,#c0255a 80%,#fff 100%)',
          backgroundSize: '260% auto',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          animation: mounted ? 'evTitleIn .55s cubic-bezier(.22,1,.36,1) both, evGradient 5s ease-in-out .6s infinite' : 'none',
        }}>Events</h1>
        <p style={{ margin: '5px 0 0', fontSize: 14, color: 'var(--text-muted)', animation: mounted ? 'evSubIn .45s ease .12s both' : 'none' }}>
          Upcoming events from all clubs
        </p>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'flex-start', gap: 7, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '9px 13px', animation: mounted ? 'evSubIn .45s ease .18s both' : 'none' }}>
          <span style={{ fontSize: 13, flexShrink: 0 }}>⚠️</span>
          <span style={{ fontSize: 12, color: 'rgba(245,158,11,0.85)', lineHeight: 1.5 }}>
            <strong style={{ fontWeight: 700 }}>Note:</strong> ClubSynQ won't be responsible for any event that's being hosted.
          </span>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16, animation: mounted ? 'evSearchIn .4s ease .18s both' : 'none' }}>
        <svg style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', pointerEvents:'none' }}
          width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          className="ev-search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search events, clubs, locations…"
          style={{ width:'100%', boxSizing:'border-box', padding:'10px 14px 10px 36px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.09)', borderRadius:10, color:'var(--text-primary)', fontSize:14, outline:'none', transition:'border-color .2s, box-shadow .2s' }}
        />
      </div>

      {/* Filters */}
      <div className="pill-scroll" style={{ gap: 8, marginBottom: 24 }}>
        {FILTERS.map((f, fi) => {
          const active = filter === f.key
          return (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding:'6px 14px', borderRadius:9999, position:'relative',
              border: active ? '1px solid var(--accent)' : '1px solid rgba(87,65,68,0.3)',
              background: active ? 'rgba(138,21,56,0.22)' : 'rgba(255,255,255,0.03)',
              color: active ? 'var(--accent)' : 'var(--text-muted)',
              fontSize:13, fontWeight: active ? 700 : 400,
              cursor:'pointer', fontFamily:'inherit',
              display:'flex', alignItems:'center', gap:6,
              boxShadow: active ? '0 0 18px rgba(138,21,56,.22)' : 'none',
              transition:'all .2s cubic-bezier(.22,1,.36,1)',
              animation: mounted ? `evFilterIn .4s cubic-bezier(.22,1,.36,1) ${.22 + fi * .06}s both` : 'none',
            }}>
              {active && <span className="ev-filter-ring"/>}
              {f.key === 'live' && liveCount > 0 && (
                <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--live-red)', display:'inline-block', animation:'livePulse 1.4s ease-in-out infinite' }}/>
              )}
              {f.label}
              {f.count > 0 && (
                <span style={{ fontSize:11, fontWeight:700, background: active ? 'rgba(138,21,56,0.4)' : 'rgba(255,255,255,0.08)', color: active ? 'var(--accent)' : 'var(--text-muted)', borderRadius:9999, padding:'1px 7px' }}>{f.count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign:'center', padding:'80px 0', color:'var(--text-muted)', fontSize:14 }}>
          <div style={{ position:'relative', width:44, height:44, margin:'0 auto 16px' }}>
            <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'3px solid rgba(138,21,56,.15)' }}/>
            <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'3px solid transparent', borderTopColor:'var(--accent)', animation:'spin .8s linear infinite' }}/>
          </div>
          Loading events…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:'70px 20px', animation:'emptyIn .5s cubic-bezier(.22,1,.36,1) both' }}>
          <div style={{ position:'relative', width:64, height:64, margin:'0 auto 20px' }}>
            <div style={{ position:'absolute', inset:0, borderRadius:18, background:'rgba(138,21,56,.08)', border:'1px solid rgba(138,21,56,.18)', animation:'emptyOrb 4s ease-in-out infinite' }}/>
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28 }}>📅</div>
          </div>
          <div style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)', marginBottom:6 }}>
            {search ? 'No events match your search' : filter === 'live' ? 'No live events right now' : filter === 'today' ? 'No events today' : filter === 'week' ? 'No events this week' : 'No upcoming events'}
          </div>
          <div style={{ fontSize:13, color:'var(--text-muted)' }}>Check back later or explore clubs to find events.</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {filtered.map((event, i) => (
            <EventCard
              key={event.id}
              event={event}
              index={i}
              isMember={memberClubIds.has(event.club_id)}
              isPending={pendingClubIds.has(event.club_id)}
              isRegistered={registeredEventIds.has(event.id)}
              joining={joiningId === event.club_id}
              registering={registering === event.id}
              onClick={() => setSelectedEvent(event)}
              onClubClick={() => navigate(`/clubs/${event.club_id}`)}
              onJoin={() => handleJoin(event.club_id, event.club?.name ?? 'Club')}
              onRegister={() => handleRegister(event)}
            />
          ))}
        </div>
      )}

      {/* Hall of Events */}
      <div style={{ marginTop: 56, animation: mounted ? 'hallIn .5s ease .3s both' : 'none' }}>
        {/* Section header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <span style={{ fontSize: 28, animation: mounted ? 'trophyBob 3.5s ease-in-out infinite' : 'none', display: 'inline-block' }}>🏆</span>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, letterSpacing: '-0.4px', background: 'linear-gradient(90deg,#e9c176,#f5d78e,#c9a44a)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Hall of Events
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              {pastEvents.length} events conducted
            </p>
          </div>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(233,193,118,.35),transparent)', marginLeft: 4 }}/>
        </div>

        {pastLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            <div style={{ position: 'relative', width: 36, height: 36, margin: '0 auto 12px' }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid rgba(233,193,118,.15)' }}/>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid transparent', borderTopColor: '#e9c176', animation: 'spin .8s linear infinite' }}/>
            </div>
            Loading history…
          </div>
        ) : pastEvents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
            No events have been conducted yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {pastEvents.map((ev, i) => {
              const catColor = CATEGORY_COLORS[ev.club?.category ?? ''] ?? '#e9c176'
              const d = ev.start_time ? new Date(ev.start_time) : null
              return (
                <div key={ev.id} className="hall-row" onClick={() => openGallery(ev)} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 16px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(233,193,118,0.06)',
                  animation: mounted ? `hallRowIn .35s ease ${Math.min(i * 0.04, 0.6)}s both` : 'none',
                }}>
                  {/* Position badge */}
                  <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 8, background: 'rgba(233,193,118,0.07)', border: '1px solid rgba(233,193,118,0.15)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    {d ? (
                      <>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#e9c176', lineHeight: 1 }}>{d.getDate()}</div>
                        <div style={{ fontSize: 8, fontWeight: 600, color: 'rgba(233,193,118,0.6)', letterSpacing: '0.05em' }}>{d.toLocaleString('en-US', { month: 'short' }).toUpperCase()}</div>
                      </>
                    ) : (
                      <div style={{ fontSize: 8, color: 'rgba(233,193,118,0.5)' }}>TBA</div>
                    )}
                  </div>

                  {/* Club logo */}
                  <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, background: ev.club?.logo_url ? 'transparent' : `${catColor}18`, border: `1px solid ${catColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: catColor, overflow: 'hidden' }}>
                    {ev.club?.logo_url ? <img src={ev.club.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : (ev.club?.name?.[0] ?? '?')}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                      {ev.club?.name ?? 'Unknown Club'}
                    </div>
                  </div>

                  {/* Stats */}
                  <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {ev.karak_points_reward > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#c9a44a' }}>+{ev.karak_points_reward} pts</span>
                    )}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(233,193,118,0.4)" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Gallery modal */}
      {galleryEvent && (
        <div onClick={() => { setGalleryEvent(null); setLightboxIdx(null) }} style={{ position:'fixed', inset:0, zIndex:9998, background:'rgba(0,0,0,0.75)', backdropFilter:'blur(12px)', display:'flex', alignItems:'flex-end', justifyContent:'center', animation:'evOverlayIn .2s ease both' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#0e0a12', borderTop:'1px solid rgba(255,255,255,0.08)', borderRadius:'28px 28px 0 0', width:'100%', maxWidth:800, maxHeight:'92vh', display:'flex', flexDirection:'column', animation:'galleryIn .38s cubic-bezier(.22,1,.36,1) both', boxShadow:'0 -32px 100px rgba(0,0,0,0.8)', overflow:'hidden' }}>

            {/* Handle */}
            <div style={{ display:'flex', justifyContent:'center', paddingTop:12, paddingBottom:4, flexShrink:0 }}>
              <div style={{ width:36, height:4, borderRadius:99, background:'rgba(255,255,255,0.12)' }}/>
            </div>

            {/* Header */}
            <div style={{ padding:'10px 22px 16px', display:'flex', alignItems:'center', gap:14, flexShrink:0 }}>
              {galleryEvent.club?.logo_url ? (
                <img src={galleryEvent.club.logo_url} alt="" style={{ width:40, height:40, borderRadius:12, objectFit:'cover', border:'1px solid rgba(255,255,255,0.1)', flexShrink:0 }}/>
              ) : (
                <div style={{ width:40, height:40, borderRadius:12, background:'rgba(233,193,118,0.12)', border:'1px solid rgba(233,193,118,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:800, color:'#e9c176', flexShrink:0 }}>
                  {galleryEvent.club?.name?.[0] ?? '?'}
                </div>
              )}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:17, fontWeight:800, color:'#fff', letterSpacing:'-0.3px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{galleryEvent.title}</div>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:3 }}>
                  <span style={{ fontSize:12, color:'rgba(233,193,118,0.7)', fontWeight:600 }}>{galleryEvent.club?.name ?? ''}</span>
                  {galleryEvent.start_time && <>
                    <span style={{ width:3, height:3, borderRadius:'50%', background:'rgba(255,255,255,0.2)', flexShrink:0, display:'inline-block' }}/>
                    <span style={{ fontSize:12, color:'rgba(255,255,255,0.35)' }}>{new Date(galleryEvent.start_time).toLocaleDateString('en-US', { day:'numeric', month:'short', year:'numeric' })}</span>
                  </>}
                  {!galleryLoading && galleryImages.length > 0 && (
                    <span style={{ fontSize:11, fontWeight:700, color:'rgba(233,193,118,0.6)', background:'rgba(233,193,118,0.08)', border:'1px solid rgba(233,193,118,0.15)', borderRadius:99, padding:'1px 8px' }}>{galleryImages.length} photos</span>
                  )}
                </div>
              </div>
              <button onClick={() => { setGalleryEvent(null); setLightboxIdx(null) }} style={{ width:36, height:36, borderRadius:'50%', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.5)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0, transition:'background .15s' }}
                onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.12)'}
                onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.06)'}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Body */}
            <div style={{ flex:1, overflowY:'auto', padding:'0 18px 36px' }}>
              {galleryLoading ? (
                <div style={{ display:'flex', justifyContent:'center', alignItems:'center', padding:'70px 0', flexDirection:'column', gap:16 }}>
                  <div style={{ position:'relative', width:40, height:40 }}>
                    <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'3px solid rgba(233,193,118,.1)' }}/>
                    <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'3px solid transparent', borderTopColor:'#e9c176', animation:'spin .8s linear infinite' }}/>
                  </div>
                  <span style={{ fontSize:13, color:'var(--text-muted)' }}>Loading photos…</span>
                </div>
              ) : galleryImages.length === 0 ? (
                <div style={{ textAlign:'center', padding:'70px 20px' }}>
                  <div style={{ fontSize:48, marginBottom:16, filter:'grayscale(0.3)' }}>📷</div>
                  <div style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)', marginBottom:8 }}>No photos yet</div>
                  <div style={{ fontSize:13, color:'var(--text-muted)', lineHeight:1.6 }}>Club admins can upload event photos<br/>from the Command Center.</div>
                </div>
              ) : galleryImages.length === 1 ? (
                /* Single image — full width featured */
                <div className="gal-cell" onClick={() => setLightboxIdx(0)} style={{ borderRadius:18, overflow:'hidden', position:'relative', boxShadow:'0 8px 40px rgba(0,0,0,0.5)', animation:'imgFadeIn .4s ease both' }}>
                  <img src={galleryImages[0].url} alt="" style={{ width:'100%', maxHeight:420, objectFit:'cover', display:'block' }}/>
                  <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top,rgba(0,0,0,0.55) 0%,transparent 50%)' }}/>
                  <div style={{ position:'absolute', bottom:16, right:16, background:'rgba(0,0,0,0.55)', border:'1px solid rgba(255,255,255,0.15)', backdropFilter:'blur(8px)', borderRadius:9999, padding:'5px 12px', fontSize:11, color:'rgba(255,255,255,0.8)', display:'flex', alignItems:'center', gap:5 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    View full
                  </div>
                  {galleryImages[0].caption && <div style={{ position:'absolute', bottom:16, left:16, fontSize:13, color:'rgba(255,255,255,0.85)', fontWeight:600, maxWidth:'70%', textShadow:'0 1px 8px rgba(0,0,0,0.8)' }}>{galleryImages[0].caption}</div>}
                </div>
              ) : galleryImages.length === 2 ? (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                  {galleryImages.map((img, idx) => (
                    <div key={img.id} className="gal-cell" onClick={() => setLightboxIdx(idx)} style={{ borderRadius:16, overflow:'hidden', position:'relative', aspectRatio:'3/4', boxShadow:'0 4px 20px rgba(0,0,0,0.4)', animation:`imgFadeIn .35s ease ${idx * 0.08}s both` }}>
                      <img src={img.url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
                      <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top,rgba(0,0,0,0.4) 0%,transparent 60%)' }}/>
                      {img.caption && <div style={{ position:'absolute', bottom:10, left:10, right:10, fontSize:11, color:'rgba(255,255,255,0.85)', fontWeight:600, textShadow:'0 1px 6px rgba(0,0,0,0.8)' }}>{img.caption}</div>}
                    </div>
                  ))}
                </div>
              ) : (
                /* 3+ images — hero + masonry grid */
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {/* Hero row */}
                  <div style={{ display:'grid', gridTemplateColumns: galleryImages.length >= 3 ? '2fr 1fr' : '1fr', gap:6 }}>
                    <div className="gal-cell" onClick={() => setLightboxIdx(0)} style={{ borderRadius:18, overflow:'hidden', position:'relative', aspectRatio:'16/10', boxShadow:'0 8px 32px rgba(0,0,0,0.5)', animation:'imgFadeIn .35s ease both' }}>
                      <img src={galleryImages[0].url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
                      <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top,rgba(0,0,0,0.5) 0%,transparent 55%)' }}/>
                      {galleryImages[0].caption && <div style={{ position:'absolute', bottom:12, left:14, fontSize:12, color:'rgba(255,255,255,0.9)', fontWeight:600, textShadow:'0 1px 8px rgba(0,0,0,0.8)' }}>{galleryImages[0].caption}</div>}
                    </div>
                    {galleryImages.length >= 3 && (
                      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                        {[1, 2].map(idx => idx < galleryImages.length && (
                          <div key={galleryImages[idx].id} className="gal-cell" onClick={() => setLightboxIdx(idx)} style={{ borderRadius:14, overflow:'hidden', position:'relative', flex:1, boxShadow:'0 4px 16px rgba(0,0,0,0.4)', animation:`imgFadeIn .35s ease ${idx * 0.08}s both` }}>
                            <img src={galleryImages[idx].url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', minHeight:0 }}/>
                            <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top,rgba(0,0,0,0.4) 0%,transparent 60%)' }}/>
                            {idx === 2 && galleryImages.length > 3 && (
                              <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:4 }}>
                                <span style={{ fontSize:22, fontWeight:900, color:'#fff' }}>+{galleryImages.length - 3}</span>
                                <span style={{ fontSize:11, color:'rgba(255,255,255,0.7)' }}>more</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Remaining grid */}
                  {galleryImages.length > 3 && (
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:6 }}>
                      {galleryImages.slice(3).map((img, i) => (
                        <div key={img.id} className="gal-cell" onClick={() => setLightboxIdx(i + 3)} style={{ borderRadius:12, overflow:'hidden', position:'relative', aspectRatio:'1', boxShadow:'0 3px 12px rgba(0,0,0,0.4)', animation:`imgFadeIn .3s ease ${(i + 3) * 0.04}s both` }}>
                          <img src={img.url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
                          <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top,rgba(0,0,0,0.35) 0%,transparent 55%)' }}/>
                          {img.caption && <div style={{ position:'absolute', bottom:6, left:6, right:6, fontSize:9, color:'rgba(255,255,255,0.8)', fontWeight:600, textShadow:'0 1px 4px rgba(0,0,0,0.8)', lineHeight:1.3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{img.caption}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {galleryEvent && lightboxIdx !== null && galleryImages.length > 0 && (() => {
        const img = galleryImages[lightboxIdx]
        return (
          <div onClick={() => setLightboxIdx(null)} style={{ position:'fixed', inset:0, zIndex:10001, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', animation:'evOverlayIn .18s ease both' }}>
            {/* Blurred ambient bg */}
            <div style={{ position:'absolute', inset:0, overflow:'hidden' }}>
              <img src={img.url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', filter:'blur(40px) brightness(0.22) saturate(1.4)', transform:'scale(1.1)' }}/>
              <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.55)' }}/>
            </div>

            {/* Top bar */}
            <div style={{ position:'relative', zIndex:2, width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', flexShrink:0 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'rgba(255,255,255,0.5)', background:'rgba(0,0,0,0.35)', backdropFilter:'blur(8px)', borderRadius:99, padding:'5px 14px', border:'1px solid rgba(255,255,255,0.1)' }}>
                {lightboxIdx + 1} <span style={{ color:'rgba(255,255,255,0.25)' }}>/</span> {galleryImages.length}
              </div>
              <button onClick={e => { e.stopPropagation(); setLightboxIdx(null) }} className="lb-nav" style={{ width:38, height:38, borderRadius:'50%', background:'rgba(0,0,0,0.4)', backdropFilter:'blur(8px)', border:'1px solid rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.7)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Main image */}
            <div onClick={e => e.stopPropagation()} style={{ position:'relative', zIndex:2, flex:1, display:'flex', alignItems:'center', justifyContent:'center', width:'100%', padding:'0 70px', minHeight:0 }}>
              <img key={lightboxIdx} src={img.url} alt="" style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain', borderRadius:16, boxShadow:'0 32px 100px rgba(0,0,0,0.7)', display:'block', animation:'lbIn .28s cubic-bezier(.22,1,.36,1) both' }}/>
            </div>

            {/* Prev / Next arrows */}
            {lightboxIdx > 0 && (
              <button onClick={e => { e.stopPropagation(); setLightboxIdx(i => i! - 1) }} className="lb-nav" style={{ position:'fixed', left:14, top:'50%', transform:'translateY(-50%)', width:48, height:48, borderRadius:'50%', background:'rgba(0,0,0,0.45)', backdropFilter:'blur(8px)', border:'1px solid rgba(255,255,255,0.14)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', zIndex:10002 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
            )}
            {lightboxIdx < galleryImages.length - 1 && (
              <button onClick={e => { e.stopPropagation(); setLightboxIdx(i => i! + 1) }} className="lb-nav" style={{ position:'fixed', right:14, top:'50%', transform:'translateY(-50%)', width:48, height:48, borderRadius:'50%', background:'rgba(0,0,0,0.45)', backdropFilter:'blur(8px)', border:'1px solid rgba(255,255,255,0.14)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', zIndex:10002 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            )}

            {/* Caption + thumbnail strip */}
            <div style={{ position:'relative', zIndex:2, width:'100%', flexShrink:0, padding:'12px 20px 24px' }}>
              {img.caption && (
                <div style={{ textAlign:'center', marginBottom:14, fontSize:14, fontWeight:600, color:'rgba(255,255,255,0.85)', textShadow:'0 1px 8px rgba(0,0,0,0.8)' }}>{img.caption}</div>
              )}
              {/* Thumbnail strip — only show if >1 image */}
              {galleryImages.length > 1 && (
                <div style={{ display:'flex', gap:6, justifyContent:'center', overflowX:'auto', paddingBottom:4 }}>
                  {galleryImages.map((t, ti) => (
                    <div key={t.id} className="gal-thumb" onClick={e => { e.stopPropagation(); setLightboxIdx(ti) }} style={{ width:52, height:52, borderRadius:10, overflow:'hidden', flexShrink:0, border: ti === lightboxIdx ? '2px solid #fff' : '2px solid rgba(255,255,255,0.1)', opacity: ti === lightboxIdx ? 1 : 0.45, boxShadow: ti === lightboxIdx ? '0 0 0 2px rgba(255,255,255,0.2)' : 'none', animation:`thumbIn .3s ease ${ti * 0.03}s both` }}>
                      <img src={t.url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Event detail modal */}
      {selectedEvent && (() => {
        const ev = selectedEvent
        const catColor = CATEGORY_COLORS[ev.club?.category ?? ''] ?? 'var(--accent)'
        const isMember = memberClubIds.has(ev.club_id)
        const isPending = pendingClubIds.has(ev.club_id)
        const joining = joiningId === ev.club_id
        const isRegistered = registeredEventIds.has(ev.id)
        return (
          <div onClick={() => setSelectedEvent(null)} style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.78)', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px 16px', animation:'evOverlayIn .25s ease both' }}>
            <div onClick={e => e.stopPropagation()} style={{ background:'var(--bg-card)', border:`1px solid ${catColor}28`, borderRadius:24, width:'100%', maxWidth:520, maxHeight:'88vh', overflow:'hidden', display:'flex', flexDirection:'column', animation:'evModalIn 0.42s cubic-bezier(.22,1,.36,1) both', boxShadow:`0 32px 80px rgba(0,0,0,.7), 0 0 60px ${catColor}15` }}>
              <div style={{ height:4, background:`linear-gradient(90deg,${catColor}cc,${catColor}44,transparent)`, flexShrink:0 }}/>
              <div style={{ overflowY:'auto', padding:'clamp(20px,4vw,28px)', flex:1 }}>
                {/* Club row + close */}
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
                  <button onClick={e => { e.stopPropagation(); navigate(`/clubs/${ev.club_id}`); setSelectedEvent(null) }} style={{ display:'flex', alignItems:'center', gap:6, background:'transparent', border:'none', padding:0, cursor:'pointer' }}>
                    <div style={{ width:24, height:24, borderRadius:7, background:ev.club?.logo_url?'transparent':`${catColor}22`, border:`1px solid ${catColor}55`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:catColor, overflow:'hidden', flexShrink:0, boxShadow:`0 0 10px ${catColor}30` }}>
                      {ev.club?.logo_url ? <img src={ev.club.logo_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : (ev.club?.name?.[0] ?? '?')}
                    </div>
                    <span style={{ fontSize:12, fontWeight:700, color:catColor }}>{ev.club?.name ?? 'Unknown Club'}</span>
                  </button>
                  {ev.is_live && (
                    <span style={{ fontSize:10, fontWeight:800, color:'var(--live-red)', background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:9999, padding:'2px 8px', letterSpacing:'.07em', position:'relative', boxShadow:'0 0 12px rgba(239,68,68,.3)' }}>
                      <span style={{ position:'absolute', inset:-2, borderRadius:9999, border:'1px solid rgba(239,68,68,.5)', animation:'liveRing 1.4s ease-out infinite' }}/>
                      ● LIVE
                    </span>
                  )}
                  <button onClick={() => setSelectedEvent(null)} style={{ marginLeft:'auto', background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', cursor:'pointer', color:'var(--text-muted)', fontSize:14, lineHeight:1, padding:'6px 8px', borderRadius:9, flexShrink:0, transition:'all .15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,.12)'; e.currentTarget.style.color='#fff' }}
                    onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,.06)'; e.currentTarget.style.color='var(--text-muted)' }}>✕</button>
                </div>

                <h2 style={{ fontSize:'clamp(20px,4vw,26px)', fontWeight:900, color:'var(--text-primary)', letterSpacing:'-0.5px', marginBottom:18, lineHeight:1.25 }}>{ev.title}</h2>

                <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
                  {[
                    ev.start_time && { icon:'🕐', text: formatEventDate(ev.start_time) },
                    ev.location   && { icon:'📍', text: ev.location },
                    ev.max_attendees !== null
                      ? { icon:'👥', text: `${ev.attendee_count} / ${ev.max_attendees} registered` }
                      : ev.attendee_count > 0 ? { icon:'👥', text: `${ev.attendee_count} registered` } : null,
                    ev.karak_points_reward > 0 && { icon:'⭐', text: `+${ev.karak_points_reward} Karak points for attending`, gold: true },
                  ].filter(Boolean).map((row: any, ri) => (
                    <div key={ri} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color: row.gold ? 'var(--gold)' : 'var(--text-muted)', animation:`evUp .3s ease ${ri * .05}s both` }}>
                      <span style={{ fontSize:15 }}>{row.icon}</span>
                      <span>{row.text}</span>
                    </div>
                  ))}
                </div>

                {ev.description && (
                  <div style={{ background:'rgba(255,255,255,0.03)', border:`1px solid ${catColor}18`, borderRadius:14, padding:'16px 18px' }}>
                    <div style={{ fontSize:11, fontWeight:700, color:catColor, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>About</div>
                    <p style={{ fontSize:14, color:'var(--text-secondary)', lineHeight:1.75, margin:0, whiteSpace:'pre-wrap', overflowWrap:'break-word', wordBreak:'break-word' }}>{ev.description}</p>
                  </div>
                )}
              </div>

              {/* Footer actions */}
              <div style={{ padding:'14px clamp(20px,4vw,28px)', borderTop:'1px solid rgba(255,255,255,0.07)', background:'var(--bg-card)', display:'flex', gap:10 }}>
                <button onClick={() => setSelectedEvent(null)} style={{ flex:1, padding:'11px', background:'transparent', border:'1px solid rgba(255,255,255,0.1)', borderRadius:12, color:'var(--text-muted)', fontSize:14, cursor:'pointer', fontFamily:'inherit', transition:'all .15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor='rgba(255,255,255,.25)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor='rgba(255,255,255,.1)'}>Close</button>

                {isMember && !isRegistered && !ev.registration_closed && (
                  <button onClick={() => { setSelectedEvent(null); handleRegister(ev) }} disabled={registering === ev.id}
                    style={{ flex:2, padding:'11px', background:'linear-gradient(135deg,#8a1538,#c0255a)', border:'none', borderRadius:12, color:'#fff', fontSize:14, fontWeight:700, cursor:registering===ev.id?'default':'pointer', fontFamily:'inherit', opacity:registering===ev.id?0.6:1, boxShadow:'0 4px 18px rgba(138,21,56,.4)', transition:'all .2s' }}
                    onMouseEnter={e => { if (!registering) { e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 8px 28px rgba(138,21,56,.55)' }}}
                    onMouseLeave={e => { e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='0 4px 18px rgba(138,21,56,.4)' }}>
                    {registering === ev.id ? '…' : 'Register for Event'}
                  </button>
                )}
                {isMember && !isRegistered && ev.registration_closed && (
                  <div style={{ flex:2, padding:'11px', background:'rgba(245,158,11,0.07)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:12, color:'#f59e0b', fontSize:13, fontWeight:700, fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
                    🔒 Registration Closed
                  </div>
                )}
                {isMember && isRegistered && (
                  <button onClick={() => { setSelectedEvent(null); setRegistrationQR(ev) }}
                    style={{ flex:2, padding:'11px', background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.3)', borderRadius:12, color:'#4ade80', fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8, transition:'background .15s' }}
                    onMouseEnter={e => e.currentTarget.style.background='rgba(34,197,94,0.14)'}
                    onMouseLeave={e => e.currentTarget.style.background='rgba(34,197,94,0.08)'}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    Registered · View QR
                  </button>
                )}
                {!isMember && !isPending && (
                  <button onClick={() => { setSelectedEvent(null); handleJoin(ev.club_id, ev.club?.name ?? 'Club') }} disabled={joining}
                    style={{ flex:2, padding:'11px', background:'linear-gradient(135deg,#8a1538,#c0255a)', border:'none', borderRadius:12, color:'#fff', fontSize:14, fontWeight:700, cursor:joining?'default':'pointer', fontFamily:'inherit', opacity:joining?0.6:1, boxShadow:'0 4px 18px rgba(138,21,56,.4)', transition:'all .2s' }}
                    onMouseEnter={e => { if (!joining) { e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 8px 28px rgba(138,21,56,.55)' }}}
                    onMouseLeave={e => { e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='0 4px 18px rgba(138,21,56,.4)' }}>
                    {joining ? '…' : 'Join Club to Attend'}
                  </button>
                )}
                {isPending && <div style={{ flex:2, padding:'11px', background:'rgba(251,146,60,0.08)', border:'1px solid rgba(251,146,60,0.25)', borderRadius:12, color:'#fb923c', fontSize:14, fontWeight:600, textAlign:'center' }}>⏳ Membership pending</div>}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Registration QR modal */}
      {registrationQR && (
        <RegistrationQRModal
          event={registrationQR}
          userId={user!.id}
          onClose={() => setRegistrationQR(null)}
        />
      )}

      {applyClub && (
        <ClubApplicationModal
          clubId={applyClub.id}
          clubName={applyClub.name}
          onClose={() => setApplyClub(null)}
          onSubmitted={() => { setApplyClub(null); fetchMemberships() }}
        />
      )}
    </div>
  )
}

function EventCard({
  event, index, isMember, isPending, isRegistered, joining, registering,
  onClick, onClubClick, onJoin, onRegister,
}: {
  event: EventRow; index: number
  isMember: boolean; isPending: boolean; isRegistered: boolean
  joining: boolean; registering: boolean
  onClick: () => void; onClubClick: () => void; onJoin: () => void; onRegister: () => void
}) {
  const catColor = CATEGORY_COLORS[event.club?.category ?? ''] ?? 'var(--accent)'
  const btnRef = useRef<HTMLButtonElement>(null)
  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null)

  function handleAction(e: React.MouseEvent) {
    e.stopPropagation()
    if (joining || registering) return
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) {
      setRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top, key: Date.now() })
      setTimeout(() => setRipple(null), 600)
    }
    if (isMember) onRegister()
    else onJoin()
  }

  return (
    <div className="ev-row" onClick={onClick} style={{
      background: event.is_live ? 'rgba(255,180,171,0.05)' : 'rgba(255,255,255,0.03)',
      border: event.is_live ? '1px solid rgba(255,180,171,0.2)' : '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14, padding: '16px 20px',
      display: 'flex', gap: 16, alignItems: 'flex-start',
      cursor: 'pointer', overflow: 'hidden',
      animation: `evCardIn 0.5s cubic-bezier(.22,1,.36,1) ${Math.min(index * 0.05, 0.35)}s both`,
      boxShadow: event.is_live ? '0 0 24px rgba(239,68,68,.08)' : 'none',
    }}>
      {/* Category stripe */}
      <div className="ev-stripe" style={{
        position:'absolute', left:0, top:0, bottom:0, width:3,
        background: event.is_live ? 'linear-gradient(180deg,rgba(239,68,68,.9),rgba(239,68,68,.3))' : `linear-gradient(180deg,${catColor}cc,${catColor}22)`,
        borderRadius:'3px 0 0 3px', opacity: event.is_live ? 1 : 0.45, transition:'opacity .2s',
      }}/>

      {/* Date block */}
      <div className="ev-date-block" style={{
        flexShrink:0, width:52, textAlign:'center',
        background: event.is_live ? 'rgba(239,68,68,0.1)' : 'rgba(138,21,56,0.1)',
        border: event.is_live ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(138,21,56,0.18)',
        borderRadius:10, padding:'8px 4px',
        animation:`evDatePop 0.5s cubic-bezier(.22,1,.36,1) ${Math.min(index * 0.05 + 0.1, 0.45)}s both`,
        transition:'background .2s, border-color .2s', position:'relative',
      }}>
        {event.is_live ? (
          <>
            <div style={{ position:'relative', width:7, height:7, margin:'0 auto 3px' }}>
              <span style={{ position:'absolute', inset:0, borderRadius:'50%', background:'var(--live-red)', animation:'liveRing 1.4s ease-out infinite' }}/>
              <span style={{ position:'absolute', inset:0, borderRadius:'50%', background:'var(--live-red)' }}/>
            </div>
            <div style={{ fontSize:9, fontWeight:700, color:'var(--live-red)', letterSpacing:'0.07em' }}>LIVE</div>
          </>
        ) : event.start_time ? (
          <>
            <div style={{ fontSize:20, fontWeight:800, color:'var(--text-primary)', lineHeight:1 }}>{new Date(event.start_time).getDate()}</div>
            <div style={{ fontSize:9, fontWeight:600, color:'var(--text-muted)', marginTop:2 }}>{new Date(event.start_time).toLocaleString('en-US',{month:'short'}).toUpperCase()}</div>
          </>
        ) : (
          <div style={{ fontSize:9, fontWeight:600, color:'var(--text-muted)' }}>TBA</div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex:1, minWidth:0 }}>
        <button onClick={e => { e.stopPropagation(); onClubClick() }} style={{ display:'inline-flex', alignItems:'center', gap:6, background:'transparent', border:'none', padding:0, cursor:'pointer', marginBottom:6 }}>
          <div style={{ width:18, height:18, borderRadius:5, background:event.club?.logo_url?'transparent':`${catColor}22`, border:`1px solid ${catColor}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:catColor, overflow:'hidden', flexShrink:0 }}>
            {event.club?.logo_url ? <img src={event.club.logo_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : (event.club?.name?.[0] ?? '?')}
          </div>
          <span style={{ fontSize:11, fontWeight:600, color:catColor }}>{event.club?.name ?? 'Unknown Club'}</span>
        </button>

        <div style={{ fontSize:15, fontWeight:600, color:'var(--text-primary)', marginBottom:5, lineHeight:1.3 }}>{event.title}</div>

        <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:6 }}>
          {event.start_time && <span style={{ fontSize:12, color:'var(--text-muted)' }}>🕐 {formatEventDate(event.start_time)}</span>}
          {event.location   && <span style={{ fontSize:12, color:'var(--text-muted)' }}>📍 {event.location}</span>}
        </div>

        {event.description && (
          <p style={{ fontSize:13, color:'var(--text-muted)', lineHeight:1.55, margin:'0 0 8px', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden', wordBreak:'break-word', whiteSpace:'pre-wrap' }}>
            {event.description}
          </p>
        )}

        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          {event.karak_points_reward > 0 && (
            <span style={{ fontSize:11, fontWeight:700, color:'var(--gold)', background:'rgba(233,193,118,0.1)', border:'1px solid rgba(233,193,118,0.22)', borderRadius:9999, padding:'2px 9px', animation:'goldBreath 3s ease-in-out infinite' }}>
              +{event.karak_points_reward} pts
            </span>
          )}
          {event.max_attendees !== null ? (
            <span style={{ fontSize:11, color:'var(--text-muted)' }}>{event.attendee_count}/{event.max_attendees} registered</span>
          ) : event.attendee_count > 0 ? (
            <span style={{ fontSize:11, color:'var(--text-muted)' }}>{event.attendee_count} registered</span>
          ) : null}
        </div>
      </div>

      {/* Action button */}
      <div style={{ flexShrink:0, alignSelf:'center' }}>
        {isMember && isRegistered ? (
          <button ref={btnRef} className="ev-action-btn" onClick={e => { e.stopPropagation(); onRegister() }}
            style={{ padding:'7px 13px', borderRadius:9, border:'1px solid rgba(34,197,94,0.35)', background:'rgba(34,197,94,0.1)', color:'#4ade80', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit', display:'flex', alignItems:'center', gap:5 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
            Registered
          </button>
        ) : isMember && event.registration_closed ? (
          <span style={{ padding:'7px 12px', borderRadius:9, border:'1px solid rgba(245,158,11,0.3)', background:'rgba(245,158,11,0.08)', color:'#f59e0b', fontSize:12, fontWeight:700, whiteSpace:'nowrap' }}>🔒 Closed</span>
        ) : isMember ? (
          <button ref={btnRef} className="ev-action-btn" onClick={handleAction} disabled={registering}
            style={{ padding:'7px 16px', borderRadius:9, background:'var(--accent)', border:'1px solid rgba(138,21,56,0.5)', color:'#fff', fontSize:12, fontWeight:700, cursor:registering?'default':'pointer', opacity:registering?0.6:1, whiteSpace:'nowrap', fontFamily:'inherit', position:'relative', overflow:'hidden', boxShadow:'0 4px 14px rgba(138,21,56,.35)' }}>
            {ripple && (
              <span key={ripple.key} style={{ position:'absolute', left:ripple.x, top:ripple.y, width:8, height:8, marginLeft:-4, marginTop:-4, borderRadius:'50%', background:'rgba(255,255,255,.5)', pointerEvents:'none', animation:'liveRing .6s ease-out forwards' }}/>
            )}
            {registering ? '…' : 'Register'}
          </button>
        ) : isPending ? (
          <span style={{ padding:'7px 12px', borderRadius:9, border:'1px solid rgba(251,146,60,0.3)', background:'rgba(251,146,60,0.08)', color:'#fb923c', fontSize:12, fontWeight:600 }}>Pending</span>
        ) : (
          <button ref={btnRef} className="ev-action-btn" onClick={handleAction} disabled={joining}
            style={{ padding:'7px 13px', borderRadius:9, background:'transparent', border:'1px solid rgba(255,255,255,.15)', color:'var(--text-muted)', fontSize:12, fontWeight:600, cursor:joining?'default':'pointer', opacity:joining?0.6:1, whiteSpace:'nowrap', fontFamily:'inherit' }}>
            {joining ? '…' : 'Join Club'}
          </button>
        )}
      </div>
    </div>
  )
}

function RegistrationQRModal({ event, userId, onClose }: { event: EventRow; userId: string; onClose: () => void }) {
  const [visible, setVisible] = useState(false)
  const [contentReady, setContentReady] = useState(false)
  const catColor = CATEGORY_COLORS[event.club?.category ?? ''] ?? '#8a1538'

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 20)
    const t2 = setTimeout(() => setContentReady(true), 200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 340)
  }

  return (
    <div
      style={{ position:'fixed', inset:0, zIndex:10000, background: visible ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0)', transition:'background 0.35s ease', display:'flex', flexDirection:'column', justifyContent:'flex-end' }}
      onClick={handleClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background:'linear-gradient(180deg,#1c0e14 0%,#120810 60%,#0e0610 100%)', borderTop:'1px solid rgba(255,255,255,0.09)', borderRadius:'28px 28px 0 0', maxHeight:'90vh', display:'flex', flexDirection:'column', transform: visible ? 'translateY(0)' : 'translateY(100%)', transition:'transform 0.4s cubic-bezier(0.22,1,0.36,1)', boxShadow:'0 -24px 80px rgba(138,21,56,0.2), 0 -4px 40px rgba(0,0,0,0.8)', overflow:'hidden', position:'relative' }}
      >
        {/* Ambient glow */}
        <div style={{ position:'absolute', top:'-10%', left:'15%', width:260, height:260, borderRadius:'50%', background:`radial-gradient(circle,${catColor}28 0%,transparent 70%)`, animation:'glowOrb 8s ease-in-out infinite', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', top:'5%', right:'-5%', width:180, height:180, borderRadius:'50%', background:`radial-gradient(circle,${catColor}18 0%,transparent 70%)`, animation:'glowOrb 11s ease-in-out infinite .5s', pointerEvents:'none' }}/>

        {/* Handle */}
        <div style={{ display:'flex', justifyContent:'center', padding:'14px 0 6px', position:'relative', zIndex:1 }}>
          <div style={{ height:4, width:44, borderRadius:99, background:'rgba(255,255,255,0.18)' }}/>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'6px 28px 48px', position:'relative', zIndex:1 }}>
          {/* Header */}
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
            <div style={{ animation: contentReady ? 'evUp 0.4s ease both' : 'none' }}>
              <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'rgba(255,255,255,0.3)', marginBottom:4 }}>Event Registration</div>
              <div style={{ fontSize:18, fontWeight:800, color:'#fff', lineHeight:1.3, maxWidth:260 }}>{event.title}</div>
              {event.club?.name && <div style={{ fontSize:12, color:`${catColor}bb`, marginTop:3 }}>{event.club.name}</div>}
            </div>
            <button onClick={handleClose} style={{ width:36, height:36, borderRadius:'50%', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.55)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0, animation: contentReady ? 'regPop 0.35s cubic-bezier(0.22,1,0.36,1) .1s both' : 'none' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          {/* Success badge */}
          <div style={{ display:'flex', justifyContent:'center', marginBottom:22, animation: contentReady ? 'regPop 0.45s cubic-bezier(.22,1,.36,1) .08s both' : 'none' }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:7, background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.3)', borderRadius:9999, padding:'6px 18px', fontSize:13, fontWeight:700, color:'#4ade80' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
              You're registered!
            </div>
          </div>

          {/* QR code */}
          <div style={{ display:'flex', justifyContent:'center', marginBottom:20, animation: contentReady ? 'qrPop 0.6s cubic-bezier(0.22,1,0.36,1) 0.2s both' : 'none' }}>
            <div style={{ position:'relative', display:'inline-block' }}>
              <div style={{ background:'#fff', borderRadius:20, padding:18, boxShadow:`0 12px 48px ${catColor}50, 0 4px 16px rgba(0,0,0,0.5)`, position:'relative', overflow:'hidden' }}>
                <QRCodeSVG value={userId} size={190} level="M"/>
                <div style={{ position:'absolute', left:8, right:8, height:2, background:`linear-gradient(90deg,transparent,${catColor}bb,${catColor},${catColor}bb,transparent)`, borderRadius:99, animation:'scanLine 2.4s ease-in-out infinite', boxShadow:`0 0 10px ${catColor}` }}/>
              </div>
              {[
                { top:-6, left:-6, borderRight:'none', borderBottom:'none' },
                { top:-6, right:-6, borderLeft:'none', borderBottom:'none' },
                { bottom:-6, left:-6, borderRight:'none', borderTop:'none' },
                { bottom:-6, right:-6, borderLeft:'none', borderTop:'none' },
              ].map((s, i) => (
                <div key={i} style={{ position:'absolute', width:18, height:18, border:`2.5px solid ${catColor}`, borderRadius:3, animation:`cornerPulse 2s ease-in-out ${i * 0.2}s infinite`, ...s }}/>
              ))}
            </div>
          </div>

          {/* Instruction */}
          <div style={{ textAlign:'center', marginBottom:20, animation: contentReady ? 'evUp 0.4s ease 0.38s both' : 'none' }}>
            <div style={{ fontSize:15, fontWeight:700, color:'rgba(255,255,255,0.8)', marginBottom:6 }}>Show this at the entrance</div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.3)', lineHeight:1.6 }}>
              The event organiser will scan your QR code to check you in{event.karak_points_reward > 0 ? ` and award your ${event.karak_points_reward} Karak Points` : ''}.
            </div>
          </div>

          {/* Event meta */}
          {(event.start_time || event.location || event.karak_points_reward > 0) && (
            <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'14px 18px', display:'flex', flexDirection:'column', gap:10, animation: contentReady ? 'evUp 0.4s ease 0.48s both' : 'none' }}>
              {event.start_time && (
                <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'rgba(255,255,255,0.45)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  {formatEventDate(event.start_time)}
                </div>
              )}
              {event.location && (
                <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'rgba(255,255,255,0.45)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  {event.location}
                </div>
              )}
              {event.karak_points_reward > 0 && (
                <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'var(--gold)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--gold)"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  +{event.karak_points_reward} Karak Points on check-in
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
