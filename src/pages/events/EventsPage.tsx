import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import ClubApplicationModal from '../../components/ClubApplicationModal'

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
  club?: { id: string; name: string; logo_url: string | null; category: string | null } | null
}

type Filter = 'all' | 'live' | 'today' | 'week'

const CATEGORY_COLORS: Record<string, string> = {
  Technology: '#0ea5e9',
  'Arts & Culture': '#a855f7',
  Sports: '#e9c176',
  Entrepreneurship: '#f97316',
  Engineering: '#22c55e',
  Business: '#ec4899',
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
  const { user, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [memberClubIds, setMemberClubIds] = useState<Set<string>>(new Set())
  const [pendingClubIds, setPendingClubIds] = useState<Set<string>>(new Set())
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null)
  const [applyClub, setApplyClub] = useState<{ id: string; name: string } | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { const t = setTimeout(() => setMounted(true), 30); return () => clearTimeout(t) }, [])

  const fetchMemberships = useCallback(async () => {
    if (!user) return
    const [{ data: mem }, { data: pending }] = await Promise.all([
      supabase.from('club_memberships').select('club_id').eq('user_id', user.id),
      supabase.from('club_form_responses').select('club_id').eq('user_id', user.id).eq('status', 'pending'),
    ])
    setMemberClubIds(new Set((mem ?? []).map((m: { club_id: string }) => m.club_id)))
    setPendingClubIds(new Set((pending ?? []).map((r: { club_id: string }) => r.club_id)))
  }, [user])

  const fetchEvents = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('events')
      .select('*, club:clubs(id, name, logo_url, category)')
      .or('is_live.eq.true,start_time.gt.' + new Date().toISOString())
      .order('is_live', { ascending: false })
      .order('start_time', { ascending: true })
    setEvents(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetchEvents(); fetchMemberships() }, [fetchEvents, fetchMemberships])

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
        /* ── Keyframes ── */
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
        @keyframes stripeIn    { from{height:0} to{height:100%} }
        @keyframes evModalIn   { 0%{opacity:0;transform:translateY(40px) scale(.94)} 65%{transform:translateY(-4px) scale(1.01)} 100%{opacity:1;transform:none} }
        @keyframes evOverlayIn { from{opacity:0} to{opacity:1} }
        @keyframes evSearchIn  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
        @keyframes spin        { to{transform:rotate(360deg)} }
        @keyframes emptyIn     { 0%{opacity:0;transform:scale(.8) translateY(16px)} 65%{transform:scale(1.04) translateY(-3px)} 100%{opacity:1;transform:none} }
        @keyframes emptyOrb    { 0%,100%{transform:scale(1);opacity:.25} 50%{transform:scale(1.3);opacity:.45} }
        @keyframes filterPing  { from{transform:scale(1);opacity:.6} to{transform:scale(2.2);opacity:0} }

        /* ── Card hover ── */
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

        /* ── Join button ── */
        .ev-join-btn { transition: all .18s cubic-bezier(.22,1,.36,1); }
        .ev-join-btn:hover:not(:disabled) {
          filter: brightness(1.15);
          transform: translateY(-2px) scale(1.04);
          box-shadow: 0 8px 24px rgba(138,21,56,.5) !important;
        }

        /* ── Search ── */
        .ev-search:focus {
          outline: none !important;
          border-color: rgba(138,21,56,.55) !important;
          box-shadow: 0 0 0 3px rgba(138,21,56,.12), 0 0 32px rgba(138,21,56,.08) !important;
        }

        /* ── Filter active ring ── */
        .ev-filter-ring {
          position: absolute; inset: -1px; border-radius: 9999px;
          border: 1px solid rgba(138,21,56,.6);
          animation: filterPing 1.6s ease-out infinite;
          pointer-events: none;
        }
      `}</style>

      {/* ── Hero ── */}
      <div style={{ marginBottom: 24, position: 'relative' }}>
        {/* Ambient orbs */}
        <div style={{ position:'absolute', top:-30, left:-40, width:220, height:120, borderRadius:'50%', background:'radial-gradient(ellipse,rgba(138,21,56,.18) 0%,transparent 70%)', pointerEvents:'none', animation:'emptyOrb 9s ease-in-out infinite' }}/>
        <div style={{ position:'absolute', top:-10, right:-20, width:160, height:100, borderRadius:'50%', background:'radial-gradient(ellipse,rgba(192,37,90,.12) 0%,transparent 70%)', pointerEvents:'none', animation:'emptyOrb 12s ease-in-out 1s infinite' }}/>

        <h1 style={{
          margin: 0, letterSpacing: '-0.6px',
          fontSize: 'clamp(22px,4vw,28px)', fontWeight: 900,
          background: 'linear-gradient(90deg,#fff 0%,#e57c9a 35%,#fff 55%,#c0255a 80%,#fff 100%)',
          backgroundSize: '260% auto',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          animation: mounted ? 'evTitleIn .55s cubic-bezier(.22,1,.36,1) both, evGradient 5s ease-in-out .6s infinite' : 'none',
        }}>
          Events
        </h1>
        <p style={{
          margin: '5px 0 0', fontSize: 14, color: 'var(--text-muted)',
          animation: mounted ? 'evSubIn .45s ease .12s both' : 'none',
        }}>
          Upcoming events from all clubs
        </p>
      </div>

      {/* ── Search ── */}
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
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '10px 14px 10px 36px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 10, color: 'var(--text-primary)',
            fontSize: 14, outline: 'none',
            transition: 'border-color .2s, box-shadow .2s',
          }}
        />
      </div>

      {/* ── Filters ── */}
      <div className="pill-scroll" style={{ gap: 8, marginBottom: 24 }}>
        {FILTERS.map((f, fi) => {
          const active = filter === f.key
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '6px 14px', borderRadius: 9999, position: 'relative',
                border: active ? '1px solid var(--accent)' : '1px solid rgba(87,65,68,0.3)',
                background: active ? 'rgba(138,21,56,0.22)' : 'rgba(255,255,255,0.03)',
                color: active ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 13, fontWeight: active ? 700 : 400,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: active ? '0 0 18px rgba(138,21,56,.22)' : 'none',
                transition: 'all .2s cubic-bezier(.22,1,.36,1)',
                animation: mounted ? `evFilterIn .4s cubic-bezier(.22,1,.36,1) ${.22 + fi * .06}s both` : 'none',
              }}
            >
              {active && <span className="ev-filter-ring"/>}
              {f.key === 'live' && liveCount > 0 && (
                <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--live-red)', display:'inline-block', animation:'livePulse 1.4s ease-in-out infinite' }}/>
              )}
              {f.label}
              {f.count > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  background: active ? 'rgba(138,21,56,0.4)' : 'rgba(255,255,255,0.08)',
                  color: active ? 'var(--accent)' : 'var(--text-muted)',
                  borderRadius: 9999, padding: '1px 7px',
                }}>{f.count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── List ── */}
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
            {search ? 'No events match your search'
              : filter === 'live'  ? 'No live events right now'
              : filter === 'today' ? 'No events today'
              : filter === 'week'  ? 'No events this week'
              : 'No upcoming events'}
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
              joining={joiningId === event.club_id}
              onClick={() => setSelectedEvent(event)}
              onClubClick={() => navigate(`/clubs/${event.club_id}`)}
              onJoin={() => handleJoin(event.club_id, event.club?.name ?? 'Club')}
            />
          ))}
        </div>
      )}

      {/* ── Event detail modal ── */}
      {selectedEvent && (() => {
        const ev = selectedEvent
        const catColor = CATEGORY_COLORS[ev.club?.category ?? ''] ?? 'var(--accent)'
        const isMember = memberClubIds.has(ev.club_id)
        const isPending = pendingClubIds.has(ev.club_id)
        const joining = joiningId === ev.club_id
        return (
          <div onClick={() => setSelectedEvent(null)} style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.78)', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px 16px', animation:'evOverlayIn .25s ease both' }}>
            <div onClick={e => e.stopPropagation()} style={{ background:'var(--bg-card)', border:`1px solid ${catColor}28`, borderRadius:24, width:'100%', maxWidth:520, maxHeight:'88vh', overflow:'hidden', display:'flex', flexDirection:'column', animation:'evModalIn 0.42s cubic-bezier(.22,1,.36,1) both', boxShadow:`0 32px 80px rgba(0,0,0,.7), 0 0 60px ${catColor}15` }}>
              {/* Color header stripe */}
              <div style={{ height:4, background:`linear-gradient(90deg,${catColor}cc,${catColor}44,transparent)`, flexShrink:0 }}/>
              <div style={{ overflowY:'auto', padding:'clamp(20px,4vw,28px)', flex:1 }}>
                {/* Club + close */}
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
                      ? { icon:'👥', text: `${ev.attendee_count} / ${ev.max_attendees} attending` }
                      : ev.attendee_count > 0 ? { icon:'👥', text: `${ev.attendee_count} attending` } : null,
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
                    <p style={{ fontSize:14, color:'var(--text-secondary)', lineHeight:1.75, margin:0, whiteSpace:'pre-wrap' }}>{ev.description}</p>
                  </div>
                )}
              </div>

              <div style={{ padding:'14px clamp(20px,4vw,28px)', borderTop:'1px solid rgba(255,255,255,0.07)', background:'var(--bg-card)', display:'flex', gap:10 }}>
                <button onClick={() => setSelectedEvent(null)} style={{ flex:1, padding:'11px', background:'transparent', border:'1px solid rgba(255,255,255,0.1)', borderRadius:12, color:'var(--text-muted)', fontSize:14, cursor:'pointer', fontFamily:'inherit', transition:'all .15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor='rgba(255,255,255,.25)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor='rgba(255,255,255,.1)'}>Close</button>
                {!isMember && !isPending && (
                  <button onClick={() => { setSelectedEvent(null); handleJoin(ev.club_id, ev.club?.name ?? 'Club') }} disabled={joining}
                    style={{ flex:2, padding:'11px', background:'linear-gradient(135deg,#8a1538,#c0255a)', border:'none', borderRadius:12, color:'#fff', fontSize:14, fontWeight:700, cursor:joining?'default':'pointer', fontFamily:'inherit', opacity:joining?0.6:1, boxShadow:'0 4px 18px rgba(138,21,56,.4)', transition:'all .2s' }}
                    onMouseEnter={e => { if (!joining) { e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 8px 28px rgba(138,21,56,.55)' }}}
                    onMouseLeave={e => { e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='0 4px 18px rgba(138,21,56,.4)' }}>
                    {joining ? '…' : 'Join Club to Attend'}
                  </button>
                )}
                {isMember  && <div style={{ flex:2, padding:'11px', background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.25)', borderRadius:12, color:'#4ade80', fontSize:14, fontWeight:600, textAlign:'center' }}>✓ You're a member</div>}
                {isPending && <div style={{ flex:2, padding:'11px', background:'rgba(251,146,60,0.08)', border:'1px solid rgba(251,146,60,0.25)', borderRadius:12, color:'#fb923c', fontSize:14, fontWeight:600, textAlign:'center' }}>⏳ Membership pending</div>}
              </div>
            </div>
          </div>
        )
      })()}

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

function EventCard({ event, index, isMember, isPending, joining, onClick, onClubClick, onJoin }: {
  event: EventRow; index: number; isMember: boolean; isPending: boolean; joining: boolean
  onClick: () => void; onClubClick: () => void; onJoin: () => void
}) {
  const catColor = CATEGORY_COLORS[event.club?.category ?? ''] ?? 'var(--accent)'
  const btnRef = useRef<HTMLButtonElement>(null)
  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null)

  function handleJoin(e: React.MouseEvent) {
    e.stopPropagation()
    if (joining) return
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) {
      setRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top, key: Date.now() })
      setTimeout(() => setRipple(null), 600)
    }
    onJoin()
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
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        background: event.is_live
          ? 'linear-gradient(180deg,rgba(239,68,68,.9),rgba(239,68,68,.3))'
          : `linear-gradient(180deg,${catColor}cc,${catColor}22)`,
        borderRadius: '3px 0 0 3px',
        opacity: event.is_live ? 1 : 0.45,
        transition: 'opacity .2s',
      }}/>

      {/* Date block */}
      <div className="ev-date-block" style={{
        flexShrink: 0, width: 52, textAlign: 'center',
        background: event.is_live ? 'rgba(239,68,68,0.1)' : 'rgba(138,21,56,0.1)',
        border: event.is_live ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(138,21,56,0.18)',
        borderRadius: 10, padding: '8px 4px',
        animation: `evDatePop 0.5s cubic-bezier(.22,1,.36,1) ${Math.min(index * 0.05 + 0.1, 0.45)}s both`,
        transition: 'background .2s, border-color .2s',
        position: 'relative',
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
            <div style={{ fontSize:20, fontWeight:800, color:'var(--text-primary)', lineHeight:1 }}>
              {new Date(event.start_time).getDate()}
            </div>
            <div style={{ fontSize:9, fontWeight:600, color:'var(--text-muted)', marginTop:2 }}>
              {new Date(event.start_time).toLocaleString('en-US', { month:'short' }).toUpperCase()}
            </div>
          </>
        ) : (
          <div style={{ fontSize:9, fontWeight:600, color:'var(--text-muted)' }}>TBA</div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex:1, minWidth:0 }}>
        <button onClick={e => { e.stopPropagation(); onClubClick() }} style={{ display:'inline-flex', alignItems:'center', gap:6, background:'transparent', border:'none', padding:0, cursor:'pointer', marginBottom:6 }}>
          <div style={{ width:18, height:18, borderRadius:5, background:event.club?.logo_url?'transparent':`${catColor}22`, border:`1px solid ${catColor}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:catColor, overflow:'hidden', flexShrink:0 }}>
            {event.club?.logo_url
              ? <img src={event.club.logo_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
              : (event.club?.name?.[0] ?? '?')}
          </div>
          <span style={{ fontSize:11, fontWeight:600, color:catColor }}>{event.club?.name ?? 'Unknown Club'}</span>
        </button>

        <div style={{ fontSize:15, fontWeight:600, color:'var(--text-primary)', marginBottom:5, lineHeight:1.3 }}>{event.title}</div>

        <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:6 }}>
          {event.start_time && <span style={{ fontSize:12, color:'var(--text-muted)' }}>🕐 {formatEventDate(event.start_time)}</span>}
          {event.location   && <span style={{ fontSize:12, color:'var(--text-muted)' }}>📍 {event.location}</span>}
        </div>

        {event.description && (
          <p style={{ fontSize:13, color:'var(--text-muted)', lineHeight:1.55, margin:'0 0 8px', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
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
            <span style={{ fontSize:11, color:'var(--text-muted)' }}>{event.attendee_count} / {event.max_attendees} attending</span>
          ) : event.attendee_count > 0 ? (
            <span style={{ fontSize:11, color:'var(--text-muted)' }}>{event.attendee_count} attending</span>
          ) : null}
        </div>
      </div>

      {/* Buttons */}
      <div style={{ flexShrink:0, alignSelf:'center', display:'flex', flexDirection:'column', gap:7 }}>
        {isMember ? (
          <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:9, border:'1px solid rgba(34,197,94,0.3)', background:'rgba(34,197,94,0.08)', color:'#4ade80', fontSize:12, fontWeight:600, boxShadow:'0 0 10px rgba(34,197,94,.08)' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
            Member
          </span>
        ) : isPending ? (
          <span style={{ padding:'7px 14px', borderRadius:9, border:'1px solid rgba(251,146,60,0.3)', background:'rgba(251,146,60,0.08)', color:'#fb923c', fontSize:12, fontWeight:600 }}>Pending</span>
        ) : (
          <button ref={btnRef} className="ev-join-btn" onClick={handleJoin} disabled={!!joining}
            style={{ padding:'7px 16px', borderRadius:9, background:'var(--accent)', border:'1px solid rgba(138,21,56,0.5)', color:'#fff', fontSize:12, fontWeight:700, cursor:joining?'default':'pointer', opacity:joining?0.6:1, whiteSpace:'nowrap', fontFamily:'inherit', position:'relative', overflow:'hidden', boxShadow:'0 4px 14px rgba(138,21,56,.35)' }}>
            {ripple && (
              <span key={ripple.key} style={{ position:'absolute', left:ripple.x, top:ripple.y, width:8, height:8, marginLeft:-4, marginTop:-4, borderRadius:'50%', background:'rgba(255,255,255,.5)', animation:'evCardIn .6s ease-out forwards', pointerEvents:'none', transform:'scale(0)' }}
                onAnimationStart={e => { (e.currentTarget as HTMLElement).style.animation = 'none'; requestAnimationFrame(() => { (e.currentTarget as HTMLElement).style.animation = 'liveRing .6s ease-out forwards' }) }}
              />
            )}
            {joining ? '…' : 'Join Club'}
          </button>
        )}
      </div>
    </div>
  )
}
