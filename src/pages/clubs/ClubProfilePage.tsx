import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { filterText } from '../../lib/contentFilter'
function linkify(text: string) {
  const re = /https?:\/\/[^\s<>"]+|www\.[^\s<>"]+/g
  const nodes: ReactNode[] = []
  let last = 0; let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const href = m[0].startsWith('http') ? m[0] : `https://${m[0]}`
    nodes.push(<a key={m.index} href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color:'var(--accent)', textDecoration:'underline', wordBreak:'break-all' }}>{m[0]}</a>)
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

// ─────────────────────────────────────────── Types ──

interface SocialLink {
  type: 'instagram' | 'twitter' | 'linkedin' | 'facebook' | 'youtube' | 'website' | 'custom'
  url: string
  label?: string
}

interface ClubDetail {
  id: string; name: string; description: string | null
  category: string | null; logo_url: string | null
  banner_url: string | null; is_verified: boolean
  president_id: string | null; member_count: number
  created_at: string
  social_links?: SocialLink[]
  club_theme?: ClubTheme | null
  university?: { name: string; short_name: string | null } | null
}

interface EventRow {
  id: string; title: string; description: string | null
  location: string | null; start_time: string | null; end_time: string | null
  max_attendees: number | null; karak_points_reward: number
  is_live: boolean; attendee_count: number; category: string | null
  is_attending?: boolean
}

interface MemberRow {
  id: string; user_id: string; role: 'member' | 'officer' | 'president'; joined_at: string; custom_role?: string | null
  profile?: { id: string; full_name: string | null; school: string | null; skills: string[] } | null
}

interface ThreadRow {
  id: string; club_id: string; user_id: string
  title: string; content: string | null; reply_count: number; created_at: string
  profile?: { full_name: string | null } | null
}

interface ReplyRow {
  id: string; thread_id: string; user_id: string
  content: string; created_at: string
  profile?: { full_name: string | null } | null
}

interface AnnouncementRow {
  id: string; club_id: string; user_id: string
  content: string | null; image_url: string | null; created_at: string
  pinned: boolean
  profile?: { full_name: string | null } | null
}

interface EventAnnouncementRow {
  id: string; event_id: string; user_id: string
  content: string; created_at: string
  profile?: { full_name: string | null } | null
}

type Tab = 'events' | 'calendar' | 'community' | 'announcements' | 'threads'
type EventFilter = 'upcoming' | 'live' | 'past'

// ─────────────────────────────────────── Constants ──

const CATEGORY_COLORS: Record<string, string> = {
  Technology: '#0ea5e9', 'Arts & Culture': '#a855f7', Sports: '#e9c176',
  Entrepreneurship: '#f97316', Engineering: '#22c55e', Business: '#ec4899',
  Community: '#f43f5e', Law: '#8b5cf6', Science: '#06b6d4', Media: '#f59e0b',
}

const ROLE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  president: { bg: 'rgba(233,193,118,0.15)', color: 'var(--gold)',       label: 'President' },
  officer:   { bg: 'rgba(138,21,56,0.15)',   color: 'var(--accent)',     label: 'Officer'   },
  member:    { bg: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', label: 'Member'    },
}

const ROLE_ORDER = { president: 0, officer: 1, member: 2 }
const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December']
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

// ─────────────────────────── Club theme system ──
interface ClubTheme { accent: string; bg: string; glow: boolean }
const DEFAULT_CLUB_THEME: ClubTheme = { accent: '', bg: 'dark', glow: false }

const CLUB_ACCENT_PRESETS = [
  '#8a1538','#e53e3e','#f97316','#f59e0b','#22c55e',
  '#0ea5e9','#3b82f6','#8b5cf6','#ec4899','#06b6d4','#ffffff','#6b7280',
]

const CLUB_BG_THEMES: Record<string, { base: string; dots: string }> = {
  dark:     { base: '#0b0210', dots: 'rgba(255,255,255,0.09)' },
  midnight: { base: '#050820', dots: 'rgba(255,255,255,0.07)' },
  space:    { base: '#040416', dots: 'rgba(255,255,255,0.06)' },
  forest:   { base: '#041208', dots: 'rgba(255,255,255,0.07)' },
  ocean:    { base: '#030e1c', dots: 'rgba(255,255,255,0.06)' },
  dusk:     { base: '#110818', dots: 'rgba(255,255,255,0.08)' },
  void:     { base: '#080808', dots: 'rgba(255,255,255,0.05)' },
}

function hexToRgbClub(hex: string): [number, number, number] {
  const c = hex.replace('#', '')
  if (c.length !== 6) return [138, 21, 56]
  return [parseInt(c.slice(0,2),16), parseInt(c.slice(2,4),16), parseInt(c.slice(4,6),16)]
}

function buildClubCSS(r: number, g: number, b: number) {
  const a = (al: number) => `rgba(${r},${g},${b},${al})`
  return `
    @keyframes livePulse{0%,100%{opacity:1}50%{opacity:0.4}}
    @keyframes spinCP{to{transform:rotate(360deg)}}
    @keyframes cp-up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
    @keyframes cp-pop{from{opacity:0;transform:translateY(10px) scale(0.99)}to{opacity:1;transform:translateY(0) scale(1)}}
    @keyframes cp-fade{from{opacity:0}to{opacity:1}}
    .cp-banner{animation:cp-fade 0.5s ease both}
    .cp-0{animation:cp-up 0.5s cubic-bezier(0.22,1,0.36,1) 0.1s both}
    .cp-1{animation:cp-up 0.5s cubic-bezier(0.22,1,0.36,1) 0.18s both}
    .cp-2{animation:cp-up 0.5s cubic-bezier(0.22,1,0.36,1) 0.26s both}
    .cp-panel{animation:cp-pop 0.28s cubic-bezier(0.22,1,0.36,1) both}
    .ev-card{transition:border-color 0.2s,box-shadow 0.2s,transform 0.2s!important}
    .ev-card:hover{border-color:${a(0.4)}!important;transform:translateY(-1px);box-shadow:0 5px 20px rgba(0,0,0,0.25)!important}
    .mem-card{transition:border-color 0.2s,background 0.2s!important}
    .mem-card:hover{border-color:${a(0.3)}!important;background:rgba(255,255,255,0.05)!important}
    .cal-day:hover{background:rgba(255,255,255,0.06)!important;cursor:pointer}
    .thread-row:hover{border-color:${a(0.3)}!important}
    .cal-layout{display:grid;grid-template-columns:1fr 300px;gap:24px;align-items:start}
    .cp-tabs{display:flex;border-bottom:1px solid rgba(87,65,68,0.3);overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
    .cp-tabs::-webkit-scrollbar{display:none}
    .cp-tab{padding:11px 22px;background:transparent;border:none;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:color 0.15s;font-family:inherit;display:flex;align-items:center;gap:6px;margin-bottom:-1px}
    @media(max-width:640px){
      .cal-layout{grid-template-columns:1fr}
      .cp-banner-wrap{margin:12px 0 0!important;border-radius:0!important}
      .cp-back{padding:16px 16px 0!important}
      .cp-content{padding:0 14px 52px!important}
      .cp-tab{padding:10px 14px!important;font-size:13px!important}
      .cp-club-name{font-size:20px!important}
      .cp-logo{width:56px!important;height:56px!important;border-radius:14px!important}
    }
  `
}

// ──────────────────────────────────────── Helpers ──

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
}

function formatEventDate(iso: string | null) {
  if (!iso) return 'TBA'
  const d = new Date(iso), now = new Date()
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  if (d.toDateString() === now.toDateString()) return `Today · ${time}`
  if (d.toDateString() === new Date(now.getTime() + 86400000).toDateString()) return `Tomorrow · ${time}`
  return `${d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`
}

function isUpcoming(e: EventRow) {
  if (e.is_live) return false
  return !e.start_time || new Date(e.start_time) > new Date()
}
function isPast(e: EventRow) {
  if (e.is_live || !e.start_time) return false
  return new Date(e.start_time) <= new Date()
}

function getCalendarDays(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)
  const days: (Date | null)[] = Array(first.getDay()).fill(null)
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d))
  return days
}

function eventsOnDay(events: EventRow[], d: Date) {
  return events.filter(e => {
    if (!e.start_time) return false
    const ed = new Date(e.start_time)
    return ed.getFullYear() === d.getFullYear() &&
           ed.getMonth()    === d.getMonth()    &&
           ed.getDate()     === d.getDate()
  })
}

// ───────────────────────────────── Shared widgets ──

function Avatar({ name, size = 36 }: { name?: string | null; size?: number }) {
  const l = (name ?? '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: 'var(--accent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 800, color: '#fff', flexShrink: 0,
      border: '2px solid rgba(255,255,255,0.1)',
    }}>{l}</div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
      color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 14,
    }}>{children}</div>
  )
}

// ─────────────────────────────────────── Page ──────

export default function ClubProfilePage() {
  const { clubId } = useParams<{ clubId: string }>()
  const navigate = useNavigate()
  const { user, profile: authProfile, refreshProfile } = useAuth()

  const [club,          setClub]          = useState<ClubDetail | null>(null)
  const [events,        setEvents]        = useState<EventRow[]>([])
  const [members,       setMembers]       = useState<MemberRow[]>([])
  const [threads,       setThreads]       = useState<ThreadRow[]>([])
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab,          setTab]          = useState<Tab>('events')
  const [eventFilter,  setEventFilter]  = useState<EventFilter>('upcoming')
  const [attendingId,  setAttendingId]  = useState<string | null>(null)
  const [communitySearch, setCommunitySearch] = useState('')
  const [evtAnnModal, setEvtAnnModal] = useState<EventRow | null>(null)
  const [evtAnns, setEvtAnns] = useState<EventAnnouncementRow[]>([])
  const [loadingEvtAnns, setLoadingEvtAnns] = useState(false)

  const [theme,       setTheme]       = useState<ClubTheme | null>(null)
  const [editTheme,   setEditTheme]   = useState<ClubTheme>(DEFAULT_CLUB_THEME)
  const [customizing, setCustomizing] = useState(false)
  const [savingTheme, setSavingTheme] = useState(false)

  // ── fetch ──
  const fetchAll = useCallback(async () => {
    if (!clubId || !user) return
    const [{ data: cd }, { data: ed }, { data: md }, { data: att }, { data: td }, { data: ad }] = await Promise.all([
      supabase.from('clubs').select('*, social_links, club_theme, university:universities(name,short_name)').eq('id', clubId).single(),
      supabase.from('events').select('*').eq('club_id', clubId).order('start_time', { ascending: true }),
      supabase.from('club_memberships')
        .select('id,user_id,role,custom_role,joined_at,profile:profiles(id,full_name,school,skills)')
        .eq('club_id', clubId),
      supabase.from('event_attendees').select('event_id').eq('user_id', user.id),
      supabase.from('club_threads')
        .select('*,profile:profiles(full_name)')
        .eq('club_id', clubId)
        .order('created_at', { ascending: false }),
      supabase.from('club_announcements')
        .select('*,profile:profiles(full_name)')
        .eq('club_id', clubId)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false }),
    ])
    setClub(cd ?? null)
    if (cd?.club_theme) setTheme(cd.club_theme as ClubTheme)
    const attended = new Set((att ?? []).map(a => a.event_id))
    setEvents((ed ?? []).map(e => ({ ...e, is_attending: attended.has(e.id) })))
    setMembers(
      ((md as unknown as MemberRow[]) ?? [])
        .sort((a, b) => (ROLE_ORDER[a.role] ?? 2) - (ROLE_ORDER[b.role] ?? 2))
    )
    setThreads((td as unknown as ThreadRow[]) ?? [])
    setAnnouncements((ad as unknown as AnnouncementRow[]) ?? [])
    setLoading(false)
  }, [clubId, user])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleAttend = async (event: EventRow) => {
    if (!user || attendingId) return
    setAttendingId(event.id)
    if (event.is_attending) {
      await supabase.from('event_attendees').delete().eq('event_id', event.id).eq('user_id', user.id)
      await supabase.from('events').update({ attendee_count: Math.max(0, event.attendee_count - 1) }).eq('id', event.id)
    } else {
      await supabase.from('event_attendees').insert({ event_id: event.id, user_id: user.id })
      await supabase.from('events').update({ attendee_count: event.attendee_count + 1 }).eq('id', event.id)
      if (event.karak_points_reward > 0) {
        await supabase.from('karak_transactions').insert({
          user_id: user.id, points: event.karak_points_reward,
          reason: `Attending: ${event.title}`, event_id: event.id,
        })
        await refreshProfile()
      }
    }
    setAttendingId(null)
    fetchAll()
  }

  const handleViewEventAnn = useCallback(async (event: EventRow) => {
    setEvtAnnModal(event)
    setEvtAnns([])
    setLoadingEvtAnns(true)
    const { data } = await supabase
      .from('event_announcements')
      .select('id, event_id, user_id, content, created_at, profile:profiles(full_name)')
      .eq('event_id', event.id)
      .order('created_at', { ascending: false })
    setEvtAnns((data as unknown as EventAnnouncementRow[]) ?? [])
    setLoadingEvtAnns(false)
  }, [])

  async function saveTheme() {
    if (!clubId) return
    setSavingTheme(true)
    await supabase.from('clubs').update({ club_theme: editTheme }).eq('id', clubId)
    setTheme(editTheme)
    setSavingTheme(false)
    setCustomizing(false)
  }

  // ── derived ──
  const liveEvents     = events.filter(e => e.is_live)
  const upcomingEvents = events.filter(isUpcoming)
  const pastEvents     = events.filter(isPast)
  const shownEvents    = eventFilter === 'live' ? liveEvents : eventFilter === 'past' ? pastEvents : upcomingEvents
  const myMember   = members.find(m => m.user_id === user?.id)
  const canPost    = myMember?.role === 'president' || authProfile?.role === 'admin' || club?.president_id === user?.id
  const presidents       = members.filter(m => m.role === 'president')
  const officers         = members.filter(m => m.role === 'officer')
  const assignedMembers  = members.filter(m => m.role === 'member' && !!m.custom_role)
  const regularMembers   = members.filter(m => m.role === 'member' && !m.custom_role)

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{
        width: 36, height: 36, border: '3px solid rgba(87,65,68,0.3)',
        borderTopColor: 'var(--accent)', borderRadius: '50%',
        animation: 'spinCP 0.8s linear infinite',
      }}/>
      <style>{`@keyframes spinCP{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (!club) return (
    <div style={{ padding: '60px 28px', textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>🏛️</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 20 }}>Club not found</div>
      <button onClick={() => navigate('/clubs')} style={backBtnStyle}>← Back to My Clubs</button>
    </div>
  )

  const catColor = CATEGORY_COLORS[club.category ?? ''] ?? '#8a1538'
  const activeTheme  = customizing ? editTheme : (theme ?? DEFAULT_CLUB_THEME)
  const activeAccent = activeTheme.accent || catColor
  const bgTheme      = CLUB_BG_THEMES[activeTheme.bg] ?? CLUB_BG_THEMES.dark
  const [tr, tg, tb] = hexToRgbClub(activeAccent)
  const ta           = (alpha: number) => `rgba(${tr},${tg},${tb},${alpha})`
  const uniLabel = club.university?.short_name ?? club.university?.name ?? null

  return (
    <div className="page-content" style={{ maxWidth: 1100, '--accent': activeAccent } as React.CSSProperties}>
      <style>{buildClubCSS(tr, tg, tb)}</style>

      {/* ── Back ── */}
      <div className="cp-back" style={{ padding: '20px 28px 0' }}>
        <button onClick={() => navigate('/clubs')} style={backBtnStyle}>← My Clubs</button>
      </div>

      {/* ── Banner ── */}
      <div className="cp-banner cp-banner-wrap" style={{ position: 'relative', height: 240, margin: '16px 28px 0', borderRadius: 20, overflow: 'hidden' }}>
        {club.banner_url
          ? <img src={club.banner_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
          : <div style={{
              width: '100%', height: '100%',
              backgroundColor: bgTheme.base,
              backgroundImage: [
                `radial-gradient(circle at 1px 1px, ${bgTheme.dots} 1px, transparent 0)`,
                `radial-gradient(ellipse 75% 120% at 18% 55%, ${activeAccent}cc 0%, transparent 55%)`,
                `radial-gradient(ellipse 60% 85% at 82% 22%, ${activeAccent}88 0%, transparent 52%)`,
                `radial-gradient(ellipse 50% 65% at 55% 95%, ${activeAccent}55 0%, transparent 50%)`,
              ].join(', '),
              backgroundSize: '22px 22px, 100% 100%, 100% 100%, 100% 100%',
            }}/>
        }
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(18,8,10,0.95) 0%, rgba(18,8,10,0.45) 55%, transparent 100%)' }}/>
        {/* Top-right controls */}
        <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          {club.is_verified && (
            <div style={{
              background: 'rgba(233,193,118,0.15)', border: '1px solid rgba(233,193,118,0.4)',
              backdropFilter: 'blur(8px)', borderRadius: 9999,
              padding: '4px 12px', fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.05em',
            }}>✓ VERIFIED</div>
          )}
          {canPost && (
            <button
              onClick={() => { setEditTheme(theme ?? DEFAULT_CLUB_THEME); setCustomizing(true) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)',
                border: `1px solid ${ta(0.35)}`, borderRadius: 9999,
                padding: '5px 14px', fontSize: 12, fontWeight: 700,
                color: '#fff', cursor: 'pointer', letterSpacing: '0.02em',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = ta(0.25) }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.45)' }}
            >
              🎨 Customize
            </button>
          )}
        </div>
        {/* Club identity */}
        <div style={{ position: 'absolute', bottom: 22, left: 22, right: 22, display: 'flex', alignItems: 'flex-end', gap: 18 }}>
          <div className="cp-logo" style={{
            width: 76, height: 76, borderRadius: 18,
            border: `3px solid ${ta(0.28)}`,
            overflow: 'hidden', background: ta(0.12),
            boxShadow: `0 8px 28px rgba(0,0,0,0.6)${activeTheme.glow ? `, 0 0 28px ${ta(0.35)}` : ''}`,
            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {club.logo_url
              ? <img src={club.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
              : <span style={{ fontSize: 28, fontWeight: 800, color: '#fff' }}>{club.name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}</span>
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="cp-club-name" style={{ fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 7, letterSpacing: '-0.3px', lineHeight: 1.15 }}>
              {club.name}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {club.category && (
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: catColor, background: `${catColor}22`, border: `1px solid ${catColor}45`, borderRadius: 6, padding: '3px 9px' }}>
                  {club.category.toUpperCase()}
                </span>
              )}
              {uniLabel && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{uniLabel}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* ── Content area ── */}
      <div className="cp-content" style={{ padding: '0 28px 52px' }}>

        {/* ── Stats row ── */}
        <div className="cp-0" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 20 }}>
          {[
            { label: 'Members',  value: club.member_count },
            { label: 'Events',   value: events.length },
            { label: 'Threads',  value: threads.length },
          ].map(({ label, value }, i) => (
            <div key={label} style={{
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${activeTheme.glow ? ta(0.18) : 'rgba(255,255,255,0.07)'}`,
              boxShadow: activeTheme.glow ? `0 0 16px ${ta(0.1)}` : 'none',
              borderRadius: 12, padding: '14px 18px', textAlign: 'center',
              animation: `cp-up 0.45s cubic-bezier(0.22,1,0.36,1) ${0.1 + i * 0.07}s both`,
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginTop: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* ── About ── */}
        {club.description && (
          <div className="cp-1" style={{ marginTop: 16, padding: '16px 20px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${activeTheme.glow ? ta(0.16) : 'rgba(255,255,255,0.06)'}`, borderRadius: 14 }}>
            <SectionLabel>About</SectionLabel>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>{club.description}</p>
          </div>
        )}

        {/* ── Links ── */}
        <LinksSection
          club={club}
          canEdit={canPost}
          onSaved={links => setClub(c => c ? { ...c, social_links: links } : c)}
        />

        {/* ── Tabs ── */}
        <div className="cp-2 cp-tabs" style={{ marginTop: 28 }}>
          {([
            { key: 'events'        as Tab, label: 'Events',        badge: events.length },
            { key: 'calendar'      as Tab, label: 'Calendar',      badge: null },
            { key: 'community'     as Tab, label: 'Community',     badge: members.length },
            { key: 'announcements' as Tab, label: 'Announcements', badge: announcements.length },
            { key: 'threads'       as Tab, label: 'Threads',       badge: threads.length },
          ]).map(({ key, label, badge }) => (
            <button key={key} onClick={() => setTab(key)} className="cp-tab" style={{
              borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === key ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: 14, fontWeight: tab === key ? 600 : 400,
            }}>
              {label}
              {badge !== null && badge > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 9999,
                  background: tab === key ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                  color: tab === key ? '#fff' : 'var(--text-muted)',
                }}>{badge}</span>
              )}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 28 }}>

          {/* ══════════════ EVENTS ══════════════ */}
          {tab === 'events' && (
            <div className="cp-panel">
              {liveEvents.length > 0 && (
                <div style={{
                  marginBottom: 20, background: 'rgba(255,180,171,0.07)',
                  border: '1px solid rgba(255,180,171,0.22)', borderRadius: 12,
                  padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--live-red)', animation: 'livePulse 1.4s ease-in-out infinite', flexShrink: 0 }}/>
                  <span style={{ fontSize: 13, color: 'var(--live-red)', fontWeight: 600 }}>
                    {liveEvents.length} event{liveEvents.length > 1 ? 's' : ''} happening right now
                  </span>
                  <button onClick={() => setEventFilter('live')} style={{
                    marginLeft: 'auto', padding: '4px 12px',
                    background: 'rgba(255,180,171,0.12)', border: '1px solid rgba(255,180,171,0.25)',
                    borderRadius: 9999, color: 'var(--live-red)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  }}>VIEW LIVE</button>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
                {([
                  { key: 'upcoming' as EventFilter, label: `Upcoming`, n: upcomingEvents.length },
                  { key: 'live'     as EventFilter, label: `Live`,     n: liveEvents.length },
                  { key: 'past'     as EventFilter, label: `Past`,     n: pastEvents.length },
                ]).map(({ key, label, n }) => (
                  <button key={key} onClick={() => setEventFilter(key)} style={{
                    padding: '6px 16px', borderRadius: 9999, fontSize: 12, fontWeight: 700,
                    letterSpacing: '0.04em', cursor: 'pointer', transition: 'all 0.15s',
                    border: eventFilter === key ? '1px solid var(--accent)' : '1px solid rgba(87,65,68,0.3)',
                    background: eventFilter === key ? 'rgba(138,21,56,0.2)' : 'rgba(41,28,30,0.5)',
                    color: eventFilter === key ? 'var(--text-primary)' : 'var(--text-muted)',
                  }}>{label.toUpperCase()} · {n}</button>
                ))}
              </div>

              {shownEvents.length === 0 ? (
                <EmptyState icon={eventFilter === 'live' ? '📡' : eventFilter === 'past' ? '📅' : '🗓️'}
                  title={`No ${eventFilter} events`}
                  sub={eventFilter === 'upcoming' ? 'Check back soon.' : eventFilter === 'live' ? 'Nothing right now.' : 'No history yet.'} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {shownEvents.map((ev, i) => (
                    <EventCard
                      key={ev.id}
                      event={ev}
                      index={i}
                      onAttend={() => handleAttend(ev)}
                      attending={attendingId === ev.id}
                      onViewAnn={ev.is_live && ev.is_attending ? () => handleViewEventAnn(ev) : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══════════════ CALENDAR ══════════════ */}
          {tab === 'calendar' && (
            <div className="cp-panel"><CalendarSection events={events} /></div>
          )}

          {/* ══════════════ COMMUNITY ══════════════ */}
          {tab === 'community' && (() => {
            const term = communitySearch.trim().toLowerCase()
            const match = (m: MemberRow) => !term || (m.profile?.full_name ?? '').toLowerCase().includes(term)
            const filteredPresidents = presidents.filter(match)
            const filteredOfficers   = officers.filter(match)
            const filteredAssigned   = assignedMembers.filter(match)
            const filteredRegular    = regularMembers.filter(match)
            const noResults = term && filteredPresidents.length === 0 && filteredOfficers.length === 0 && filteredAssigned.length === 0 && filteredRegular.length === 0

            return (
              <div className="cp-panel" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                {/* Search bar */}
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--text-muted)', pointerEvents: 'none' }}>🔍</span>
                  <input
                    value={communitySearch}
                    onChange={e => setCommunitySearch(e.target.value)}
                    placeholder="Search members by name…"
                    style={{ ...inputSt, paddingLeft: 36, fontSize: 13 }}
                  />
                  {communitySearch && (
                    <button
                      onClick={() => setCommunitySearch('')}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 4px' }}
                    >✕</button>
                  )}
                </div>

                {/* Presidents + officers + custom-role members */}
                {(filteredPresidents.length > 0 || filteredOfficers.length > 0 || filteredAssigned.length > 0) && (
                  <section>
                    <SectionLabel>Leadership Team</SectionLabel>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {filteredPresidents.map((m, i) => <MemberCard key={m.id} member={m} highlight index={i} />)}
                      {filteredOfficers.map((m, i) => <MemberCard key={m.id} member={m} index={filteredPresidents.length + i} />)}
                      {filteredAssigned.map((m, i) => <MemberCard key={m.id} member={m} index={filteredPresidents.length + filteredOfficers.length + i} />)}
                    </div>
                  </section>
                )}

                {/* Plain members (no custom role) */}
                {filteredRegular.length > 0 && (
                  <section>
                    <SectionLabel>Members · {filteredRegular.length}</SectionLabel>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: 10 }}>
                      {filteredRegular.map((m, i) => <MemberCard key={m.id} member={m} index={i} />)}
                    </div>
                  </section>
                )}

                {members.length === 0 && (
                  <EmptyState icon="👥" title="No members yet" sub="Club leadership hasn't added any members yet." />
                )}
                {noResults && (
                  <EmptyState icon="🔍" title="No members found" sub={`No members match "${communitySearch}"`} />
                )}
              </div>
            )
          })()}

          {/* ══════════════ ANNOUNCEMENTS ══════════════ */}
          {tab === 'announcements' && (
            <div className="cp-panel"><AnnouncementsSection
              clubId={clubId!}
              clubName={club?.name ?? ''}
              announcements={announcements}
              members={members}
              canPost={canPost}
              onRefresh={fetchAll}
            /></div>
          )}

          {/* ══════════════ THREADS ══════════════ */}
          {tab === 'threads' && (
            <div className="cp-panel"><ThreadsSection
              clubId={clubId!}
              threads={threads}
              onRefresh={fetchAll}
            /></div>
          )}

        </div>
      </div>

      {/* Club Theme Customizer */}
      {customizing && canPost && (
        <ClubThemeCustomizer
          editTheme={editTheme}
          setEditTheme={setEditTheme}
          catColor={catColor}
          saving={savingTheme}
          onSave={saveTheme}
          onCancel={() => setCustomizing(false)}
        />
      )}

      {/* Event Announcements Modal — live events only, visible to all members */}
      {evtAnnModal && (
        <EventAnnouncementsModal
          event={evtAnnModal}
          announcements={evtAnns}
          loading={loadingEvtAnns}
          onClose={() => setEvtAnnModal(null)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────── EventCard ──────────

function EventCard({ event, onAttend, attending, onViewAnn, index = 0 }: { event: EventRow; onAttend: () => void; attending: boolean; onViewAnn?: () => void; index?: number }) {
  const full = event.max_attendees !== null && event.attendee_count >= event.max_attendees && !event.is_attending
  return (
    <div className="ev-card" style={{
      background: event.is_live ? 'rgba(255,180,171,0.05)' : 'rgba(255,255,255,0.04)',
      border: event.is_live ? '1px solid rgba(255,180,171,0.18)' : '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14, padding: '16px 20px',
      display: 'flex', gap: 16, alignItems: 'flex-start',
      animation: `cp-up 0.4s cubic-bezier(0.22,1,0.36,1) ${index * 0.055}s both`,
    }}>
      {/* Date block */}
      <div style={{
        flexShrink: 0, width: 50, textAlign: 'center',
        background: event.is_live ? 'rgba(255,180,171,0.1)' : 'rgba(138,21,56,0.1)',
        border: event.is_live ? '1px solid rgba(255,180,171,0.2)' : '1px solid rgba(138,21,56,0.18)',
        borderRadius: 10, padding: '8px 4px',
      }}>
        {event.is_live ? (
          <>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--live-red)', margin: '0 auto 3px', animation: 'livePulse 1.4s ease-in-out infinite' }}/>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--live-red)', letterSpacing: '0.07em' }}>LIVE</div>
          </>
        ) : event.start_time ? (
          <>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{new Date(event.start_time).getDate()}</div>
            <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', marginTop: 2 }}>{new Date(event.start_time).toLocaleString('en-US',{month:'short'}).toUpperCase()}</div>
          </>
        ) : <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)' }}>TBA</div>}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 5, lineHeight: 1.3 }}>{event.title}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 6 }}>
          {event.start_time && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>🕐 {formatEventDate(event.start_time)}</span>}
          {event.location   && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>📍 {event.location}</span>}
        </div>
        {event.description && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, margin: '0 0 8px',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {event.description}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {event.karak_points_reward > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', background: 'rgba(233,193,118,0.1)', border: '1px solid rgba(233,193,118,0.22)', borderRadius: 9999, padding: '2px 9px' }}>
              +{event.karak_points_reward} pts
            </span>
          )}
          {event.max_attendees !== null && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{event.attendee_count} / {event.max_attendees} attending</span>
          )}
          {event.max_attendees === null && event.attendee_count > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{event.attendee_count} attending</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, alignItems: 'stretch' }}>
        {onViewAnn && (
          <button onClick={onViewAnn} style={{
            padding: '6px 14px',
            background: 'rgba(255,180,171,0.08)',
            border: '1px solid rgba(255,180,171,0.25)',
            borderRadius: 8, color: 'var(--live-red)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            whiteSpace: 'nowrap', transition: 'all 0.15s', textAlign: 'center',
          }}>
            📢 Updates
          </button>
        )}
        <button onClick={onAttend} disabled={attending || (full && !event.is_attending)} style={{
          padding: '7px 16px',
          background: event.is_attending ? 'transparent' : full ? 'transparent' : 'rgba(52,39,40,0.8)',
          border: event.is_attending ? '1px solid var(--accent)' : '1px solid rgba(87,65,68,0.25)',
          borderRadius: 8, color: event.is_attending ? 'var(--accent)' : full ? 'var(--text-muted)' : 'var(--text-primary)',
          fontSize: 13, fontWeight: 500, cursor: attending || full ? 'default' : 'pointer',
          opacity: attending ? 0.6 : 1, whiteSpace: 'nowrap', transition: 'all 0.15s',
        }}>
          {attending ? '…' : event.is_attending ? 'Going ✓' : full ? 'Full' : 'RSVP'}
        </button>
      </div>
    </div>
  )
}

// ──────────────────────────────── MemberCard ────────

function MemberCard({ member, highlight, index = 0 }: { member: MemberRow; highlight?: boolean; index?: number }) {
  const navigate = useNavigate()
  const rs = ROLE_STYLES[member.role] ?? ROLE_STYLES.member
  const p = member.profile
  const hasCustom   = !!member.custom_role
  const isLeadership = member.role === 'president' || member.role === 'officer' || hasCustom

  const roleColor = hasCustom ? '#a78bfa' : rs.color
  const roleBg    = hasCustom ? 'rgba(139,92,246,0.15)' : rs.bg
  const roleBorder= hasCustom ? '1px solid rgba(139,92,246,0.3)' : 'none'
  const roleLabel = hasCustom ? member.custom_role! : rs.label

  return (
    <div className="mem-card" style={{
      background: highlight ? 'rgba(233,193,118,0.04)' : 'rgba(255,255,255,0.03)',
      border: highlight ? '1px solid rgba(233,193,118,0.18)' : '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12, padding: '13px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
      animation: `cp-up 0.4s cubic-bezier(0.22,1,0.36,1) ${index * 0.045}s both`,
    }}>
      <div onClick={() => p?.id && navigate(`/profile/${p.id}`)} style={{ cursor: 'pointer', flexShrink: 0 }}><Avatar name={p?.full_name} size={highlight ? 44 : 38} /></div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div onClick={() => p?.id && navigate(`/profile/${p.id}`)} style={{ fontSize: highlight ? 15 : 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2, cursor: 'pointer' }}>
          {p?.full_name ?? 'Unknown'}
        </div>

        {/* Role shown as subtitle for president / officer / custom-role members */}
        {isLeadership && (
          <div style={{ fontSize: 11, fontWeight: 700, color: roleColor, marginBottom: 3, letterSpacing: '0.04em' }}>
            {roleLabel}
          </div>
        )}

        {p?.school && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.school}</div>}
        {p?.skills && p.skills.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
            {p.skills.slice(0, 3).map(s => (
              <span key={s} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'rgba(138,21,56,0.1)', color: 'var(--text-muted)', border: '1px solid rgba(138,21,56,0.18)' }}>{s}</span>
            ))}
          </div>
        )}
      </div>

      {/* Badge on the right — only for non-plain members */}
      {isLeadership && (
        <span style={{ padding: '3px 10px', borderRadius: 9999, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', background: roleBg, color: roleColor, flexShrink: 0, border: roleBorder, whiteSpace: 'nowrap' }}>
          {roleLabel.toUpperCase()}
        </span>
      )}
    </div>
  )
}

// ─────────────────────────── CalendarSection ────────

function CalendarSection({ events }: { events: EventRow[] }) {
  const now = new Date()
  const [viewDate, setViewDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1))
  const [selected, setSelected] = useState<Date | null>(now)

  const yr = viewDate.getFullYear()
  const mo = viewDate.getMonth()
  const days = getCalendarDays(yr, mo)
  const todayStr = now.toDateString()
  const selectedEvents = selected ? eventsOnDay(events, selected) : []

  return (
    <div className="cal-layout">
      {/* Grid */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden' }}>
        {/* Nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={() => setViewDate(new Date(yr, mo - 1, 1))} style={navBtnStyle}>‹</button>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{MONTH_NAMES[mo]} {yr}</span>
          <button onClick={() => setViewDate(new Date(yr, mo + 1, 1))} style={navBtnStyle}>›</button>
        </div>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          {DAY_LABELS.map(d => (
            <div key={d} style={{ padding: '10px 0', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>{d}</div>
          ))}
        </div>
        {/* Days */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
          {days.map((day, i) => {
            if (!day) return <div key={`e${i}`} style={{ padding: '10px 0', minHeight: 52 }} />
            const dayEvs  = eventsOnDay(events, day)
            const isToday = day.toDateString() === todayStr
            const isSel   = selected?.toDateString() === day.toDateString()
            return (
              <div
                key={i}
                className="cal-day"
                onClick={() => setSelected(day)}
                style={{
                  padding: '8px 0 6px', minHeight: 52, textAlign: 'center',
                  background: isSel ? 'rgba(138,21,56,0.2)' : 'transparent',
                  borderRadius: 0, transition: 'background 0.15s',
                  borderTop: '1px solid rgba(255,255,255,0.04)',
                }}
              >
                <div style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: '50%',
                  background: isToday ? 'var(--accent)' : 'transparent',
                  border: isSel && !isToday ? '1px solid var(--accent)' : 'none',
                  fontSize: 13, fontWeight: isToday || isSel ? 700 : 400,
                  color: isToday ? '#fff' : isSel ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}>
                  {day.getDate()}
                </div>
                {dayEvs.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 3, marginTop: 4 }}>
                    {dayEvs.slice(0, 3).map((_, j) => (
                      <div key={j} style={{ width: 5, height: 5, borderRadius: '50%', background: j === 0 && dayEvs[0].is_live ? 'var(--live-red)' : 'var(--accent)' }}/>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Day detail */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            {selected
              ? selected.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
              : 'Select a day'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {selectedEvents.length} event{selectedEvents.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ padding: '12px', maxHeight: 380, overflowY: 'auto' }}>
          {selectedEvents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              No events on this day
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {selectedEvents.map(ev => (
                <div key={ev.id} style={{
                  background: ev.is_live ? 'rgba(255,180,171,0.06)' : 'rgba(255,255,255,0.04)',
                  border: ev.is_live ? '1px solid rgba(255,180,171,0.2)' : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 10, padding: '11px 13px',
                }}>
                  {ev.is_live && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--live-red)', animation: 'livePulse 1.4s ease-in-out infinite' }}/>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--live-red)', letterSpacing: '0.07em' }}>LIVE</span>
                    </div>
                  )}
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{ev.title}</div>
                  {ev.start_time && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {new Date(ev.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                      {ev.location ? ` · ${ev.location}` : ''}
                    </div>
                  )}
                  {ev.karak_points_reward > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold)', background: 'rgba(233,193,118,0.1)', border: '1px solid rgba(233,193,118,0.2)', borderRadius: 9999, padding: '2px 8px' }}>
                        +{ev.karak_points_reward} pts
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────── LinksSection ──────────

const LINK_TYPES: { value: SocialLink['type']; label: string; placeholder: string; icon: string }[] = [
  { value: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourclub', icon: '📸' },
  { value: 'twitter',   label: 'X / Twitter', placeholder: 'https://x.com/yourclub',      icon: '𝕏' },
  { value: 'linkedin',  label: 'LinkedIn',  placeholder: 'https://linkedin.com/company/…', icon: '💼' },
  { value: 'facebook',  label: 'Facebook',  placeholder: 'https://facebook.com/…',         icon: '🔵' },
  { value: 'youtube',   label: 'YouTube',   placeholder: 'https://youtube.com/@…',         icon: '▶️' },
  { value: 'website',   label: 'Website',   placeholder: 'https://yourclub.com',           icon: '🌐' },
  { value: 'custom',    label: 'Custom',    placeholder: 'https://…',                      icon: '🔗' },
]

function linkIcon(type: SocialLink['type']) {
  return LINK_TYPES.find(l => l.value === type)?.icon ?? '🔗'
}
function linkLabel(l: SocialLink) {
  if (l.type === 'custom' && l.label) return l.label
  return LINK_TYPES.find(t => t.value === l.type)?.label ?? 'Link'
}

function LinksSection({ club, canEdit, onSaved }: {
  club: ClubDetail
  canEdit: boolean
  onSaved: (links: SocialLink[]) => void
}) {
  const [editing, setEditing] = useState(false)
  const [links, setLinks] = useState<SocialLink[]>(club.social_links ?? [])
  const [saving, setSaving] = useState(false)

  useEffect(() => { setLinks(club.social_links ?? []) }, [club.social_links])

  const openEdit = () => {
    const existing = club.social_links ?? []
    setLinks(existing.length > 0 ? existing : [{ type: 'website', url: '' }])
    setEditing(true)
  }

  const addLink = () => setLinks(l => [...l, { type: 'website', url: '' }])
  const removeLink = (i: number) => setLinks(l => l.filter((_, idx) => idx !== i))
  const updateLink = (i: number, patch: Partial<SocialLink>) =>
    setLinks(l => l.map((item, idx) => idx === i ? { ...item, ...patch } : item))

  const save = async () => {
    const valid = links.filter(l => l.url.trim())
    setSaving(true)
    await supabase.from('clubs').update({ social_links: valid }).eq('id', club.id)
    onSaved(valid)
    setLinks(valid)
    setSaving(false)
    setEditing(false)
  }

  const hasLinks = (club.social_links ?? []).length > 0

  if (!hasLinks && !canEdit) return null

  return (
    <div className="cp-1" style={{ marginTop: 16 }}>
      {/* Display mode */}
      {!editing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {hasLinks && (club.social_links ?? []).map((l, i) => (
            <a
              key={i}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 9999,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500,
                textDecoration: 'none', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.2)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.1)' }}
            >
              <span>{linkIcon(l.type)}</span>
              <span>{linkLabel(l)}</span>
            </a>
          ))}
          {canEdit && (
            <button
              onClick={openEdit}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '6px 14px', borderRadius: 9999,
                background: 'transparent',
                border: '1px dashed rgba(87,65,68,0.5)',
                color: 'var(--text-muted)', fontSize: 12, fontWeight: 500,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(87,65,68,0.5)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' }}
            >
              + {hasLinks ? 'Edit Links' : 'Add Links'}
            </button>
          )}
        </div>
      )}

      {/* Edit mode */}
      {editing && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '18px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>Club Links</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {links.map((l, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  value={l.type}
                  onChange={e => updateLink(i, { type: e.target.value as SocialLink['type'] })}
                  style={{
                    padding: '7px 10px', borderRadius: 8, fontSize: 12,
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--text-primary)', flexShrink: 0, width: 120,
                  }}
                >
                  {LINK_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
                {l.type === 'custom' && (
                  <input
                    value={l.label ?? ''}
                    onChange={e => updateLink(i, { label: e.target.value })}
                    placeholder="Label"
                    style={{
                      padding: '7px 10px', borderRadius: 8, fontSize: 12, width: 100, flexShrink: 0,
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                      color: 'var(--text-primary)', outline: 'none',
                    }}
                  />
                )}
                <input
                  value={l.url}
                  onChange={e => updateLink(i, { url: e.target.value })}
                  placeholder={LINK_TYPES.find(t => t.value === l.type)?.placeholder ?? 'https://…'}
                  style={{
                    flex: 1, padding: '7px 10px', borderRadius: 8, fontSize: 12,
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--text-primary)', outline: 'none',
                  }}
                />
                <button
                  onClick={() => removeLink(i)}
                  style={{ background: 'transparent', border: 'none', color: '#f87171', fontSize: 16, cursor: 'pointer', flexShrink: 0, padding: '4px 6px', lineHeight: 1 }}
                >×</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button
              onClick={addLink}
              style={{
                padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: 'rgba(138,21,56,0.12)', border: '1px solid rgba(138,21,56,0.3)',
                color: 'var(--accent)', cursor: 'pointer',
              }}
            >
              + Add Another Link
            </button>
            <button
              onClick={save}
              disabled={saving}
              style={{ padding: '7px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'var(--accent)', border: 'none', color: '#fff', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => { setLinks(club.social_links ?? []); setEditing(false) }}
              style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, background: 'transparent', border: '1px solid rgba(87,65,68,0.3)', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────── AnnouncementsSection ───────

function AnnouncementsSection({
  clubId, clubName, announcements, members, canPost, onRefresh,
}: {
  clubId: string
  clubName: string
  announcements: AnnouncementRow[]
  members: MemberRow[]
  canPost: boolean
  onRefresh: () => void
}) {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [showForm, setShowForm]     = useState(false)
  const [content,  setContent]     = useState('')
  const [posting,  setPosting]     = useState(false)
  const [postError, setPostError]  = useState('')
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [pinning, setPinning] = useState<string | null>(null)

  const togglePin = async (ann: AnnouncementRow) => {
    if (pinning) return
    setPinning(ann.id)
    await supabase.from('club_announcements').update({ pinned: !ann.pinned }).eq('id', ann.id)
    setPinning(null)
    onRefresh()
  }

  const handlePost = async () => {
    if (!user || !content.trim() || posting) return
    const check = filterText(content)
    if (!check.ok) { setPostError(check.reason!); return }
    setPostError('')
    setPosting(true)
    const trimmed = content.trim()
    await supabase.from('club_announcements').insert({
      club_id: clubId, user_id: user.id, content: trimmed,
    })
    // Fire-and-forget — don't block the UI on email delivery
    supabase.functions.invoke('send-announcement-email', {
      body: {
        clubId,
        clubName,
        content: trimmed,
        posterName: profile?.full_name ?? 'Club Admin',
      },
    }).catch(() => {})
    setContent('')
    setShowForm(false)
    setPosting(false)
    onRefresh()
  }

  const getRoleLabel = (userId: string): string => {
    const m = members.find(m => m.user_id === userId)
    if (!m) return 'Admin'
    return m.role === 'president' ? 'President' : m.role === 'officer' ? 'Officer' : 'Admin'
  }

  const getRoleStyle = (userId: string) => {
    const m = members.find(m => m.user_id === userId)
    if (!m || m.role === 'officer') return ROLE_STYLES.officer
    if (m.role === 'president') return ROLE_STYLES.president
    return { bg: 'rgba(99,102,241,0.12)', color: '#a5b4fc', label: 'Admin' }
  }

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Announcements</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Official posts from club leadership
          </div>
        </div>
        {canPost && (
          <button
            onClick={() => setShowForm(v => !v)}
            style={{
              padding: '8px 18px',
              background: showForm ? 'transparent' : 'var(--accent)',
              border: showForm ? '1px solid rgba(87,65,68,0.3)' : 'none',
              borderRadius: 9999, color: showForm ? 'var(--text-muted)' : '#fff',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {showForm ? 'Cancel' : '+ Post'}
          </button>
        )}
      </div>

      {/* Compose form */}
      {showForm && canPost && (
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(138,21,56,0.3)',
          borderRadius: 14, padding: '18px 20px', marginBottom: 20,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 10 }}>
            New Announcement
          </div>
          <textarea
            autoFocus
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Write your announcement…"
            rows={4}
            style={{ ...inputSt, resize: 'vertical', lineHeight: 1.7, marginBottom: 14, fontSize: 14 }}
          />
          {postError && <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>{postError}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button onClick={() => { setShowForm(false); setContent(''); setPostError('') }} style={{ padding: '8px 18px', background: 'transparent', border: '1px solid rgba(87,65,68,0.3)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
              Cancel
            </button>
            <button
              onClick={handlePost}
              disabled={!content.trim() || posting}
              style={{
                padding: '8px 20px',
                background: !content.trim() ? 'rgba(138,21,56,0.3)' : 'var(--accent)',
                border: 'none', borderRadius: 8, color: '#fff',
                fontSize: 13, fontWeight: 600,
                cursor: !content.trim() ? 'default' : 'pointer',
                opacity: posting ? 0.6 : 1,
              }}
            >
              {posting ? 'Posting…' : 'Post Announcement'}
            </button>
          </div>
        </div>
      )}

      {/* Feed */}
      {announcements.length === 0 ? (
        <EmptyState icon="📢" title="No announcements yet" sub={canPost ? 'Post an update for your club members.' : 'Club leadership hasn\'t posted anything yet.'} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {announcements.map((ann, i) => {
            const rs = getRoleStyle(ann.user_id)
            const roleLabel = getRoleLabel(ann.user_id)
            return (
              <div key={ann.id} style={{
                background: ann.pinned ? 'rgba(230,175,50,0.04)' : 'rgba(255,255,255,0.03)',
                border: ann.pinned ? '1px solid rgba(230,175,50,0.22)' : '1px solid rgba(255,255,255,0.07)',
                borderLeft: `3px solid ${ann.pinned ? '#e6af32' : rs.color}`,
                borderRadius: 14, padding: '18px 20px',
                animation: `cp-up 0.4s cubic-bezier(0.22,1,0.36,1) ${i * 0.05}s both`,
                position: 'relative',
              }}>
                {/* Pinned badge */}
                {ann.pinned && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10, fontSize: 10.5, fontWeight: 700, color: '#e6af32', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
                    Pinned
                  </div>
                )}
                {/* Author row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div onClick={() => navigate(`/profile/${ann.user_id}`)} style={{ cursor: 'pointer', flexShrink: 0 }}><Avatar name={ann.profile?.full_name} size={34} /></div>
                  <div style={{ flex: 1 }}>
                    <div onClick={() => navigate(`/profile/${ann.user_id}`)} style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                      {ann.profile?.full_name ?? 'Admin'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                      {timeAgo(ann.created_at)}
                    </div>
                  </div>
                  <span style={{
                    padding: '3px 10px', borderRadius: 9999, fontSize: 10,
                    fontWeight: 700, letterSpacing: '0.06em',
                    background: rs.bg, color: rs.color,
                  }}>
                    {roleLabel.toUpperCase()}
                  </span>
                  {/* Pin / Unpin button — admins only */}
                  {canPost && (
                    <button
                      onClick={() => togglePin(ann)}
                      disabled={pinning === ann.id}
                      title={ann.pinned ? 'Unpin' : 'Pin to top'}
                      style={{
                        background: ann.pinned ? 'rgba(230,175,50,0.15)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${ann.pinned ? 'rgba(230,175,50,0.35)' : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: 8, padding: '5px 8px', cursor: 'pointer',
                        color: ann.pinned ? '#e6af32' : 'var(--text-muted)',
                        display: 'flex', alignItems: 'center', gap: 4,
                        fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
                        opacity: pinning === ann.id ? 0.5 : 1,
                        flexShrink: 0,
                      }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>
                      {ann.pinned ? 'Unpin' : 'Pin'}
                    </button>
                  )}
                </div>
                {/* Content */}
                {ann.content && (
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.75, margin: 0, whiteSpace: 'pre-wrap' }}>
                    {linkify(ann.content)}
                  </p>
                )}
                {ann.image_url && (
                  <div
                    onClick={() => setLightboxSrc(ann.image_url!)}
                    style={{
                      position: 'relative',
                      marginTop: ann.content ? 12 : 0,
                      marginLeft: -20, marginRight: -20,
                      marginBottom: -18,
                      borderRadius: '0 0 13px 0',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      lineHeight: 0,
                    }}
                  >
                    <img
                      src={ann.image_url}
                      alt=""
                      style={{ maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto' }}
                    />
                    <div style={{
                      position: 'absolute', bottom: 10, right: 10,
                      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
                      border: '1px solid rgba(255,255,255,0.18)',
                      borderRadius: 8, padding: '5px 10px',
                      display: 'flex', alignItems: 'center', gap: 5,
                      fontSize: 11, fontWeight: 600, color: '#fff',
                      pointerEvents: 'none',
                    }}>
                      <span style={{ fontSize: 13 }}>⛶</span> View full
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightboxSrc && createPortal(
        <div
          onClick={() => setLightboxSrc(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.93)', backdropFilter: 'blur(18px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, cursor: 'zoom-out',
          }}
        >
          <img
            src={lightboxSrc}
            alt=""
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '92vw', maxHeight: '88vh',
              objectFit: 'contain', borderRadius: 14,
              boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
              cursor: 'default',
            }}
          />
          <button
            onClick={() => setLightboxSrc(null)}
            style={{
              position: 'absolute', top: 18, right: 18,
              width: 38, height: 38, borderRadius: '50%',
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff', fontSize: 18, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>,
        document.body
      )}
    </div>
  )
}

// ─────────────────────────── ThreadsSection ─────────

function ThreadsSection({ clubId, threads, onRefresh }: { clubId: string; threads: ThreadRow[]; onRefresh: () => void }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [replies, setReplies] = useState<Record<string, ReplyRow[]>>({})
  const [replyText, setReplyText] = useState<Record<string, string>>({})
  const [postingReply, setPostingReply] = useState(false)
  const [replyError, setReplyError] = useState('')
  const [showNewThread, setShowNewThread] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [postingThread, setPostingThread] = useState(false)
  const [threadError, setThreadError] = useState('')
  const bottomRef = useRef<HTMLTextAreaElement>(null)

  const fetchReplies = useCallback(async (threadId: string) => {
    const { data } = await supabase
      .from('club_thread_replies')
      .select('*,profile:profiles(full_name)')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
    setReplies(r => ({ ...r, [threadId]: (data as unknown as ReplyRow[]) ?? [] }))
  }, [])

  const handleExpand = (threadId: string) => {
    if (expanded === threadId) { setExpanded(null); return }
    setExpanded(threadId)
    fetchReplies(threadId)
  }

  const handleReply = async (threadId: string) => {
    const text = (replyText[threadId] ?? '').trim()
    if (!user || !text || postingReply) return
    const check = filterText(text)
    if (!check.ok) { setReplyError(check.reason!); return }
    setReplyError('')
    setPostingReply(true)
    await supabase.from('club_thread_replies').insert({ thread_id: threadId, user_id: user.id, content: text })
    const thread = threads.find(t => t.id === threadId)
    if (thread) await supabase.from('club_threads').update({ reply_count: thread.reply_count + 1 }).eq('id', threadId)
    setReplyText(r => ({ ...r, [threadId]: '' }))
    await fetchReplies(threadId)
    onRefresh()
    setPostingReply(false)
  }

  const handlePostThread = async () => {
    if (!user || !newTitle.trim() || postingThread) return
    const check = filterText(newTitle, newContent)
    if (!check.ok) { setThreadError(check.reason!); return }
    setThreadError('')
    setPostingThread(true)
    await supabase.from('club_threads').insert({
      club_id: clubId, user_id: user.id,
      title: newTitle.trim(), content: newContent.trim() || null,
    })
    setNewTitle(''); setNewContent(''); setShowNewThread(false)
    setPostingThread(false)
    onRefresh()
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {threads.length} thread{threads.length !== 1 ? 's' : ''}
        </div>
        <button
          onClick={() => setShowNewThread(v => !v)}
          style={{
            padding: '8px 18px', background: showNewThread ? 'transparent' : 'var(--accent)',
            border: showNewThread ? '1px solid rgba(87,65,68,0.3)' : 'none',
            borderRadius: 9999, color: showNewThread ? 'var(--text-muted)' : '#fff',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          {showNewThread ? 'Cancel' : '+ New Thread'}
        </button>
      </div>

      {/* New thread form */}
      {showNewThread && (
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(138,21,56,0.3)',
          borderRadius: 14, padding: '18px 20px', marginBottom: 20,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12 }}>New Thread</div>
          <input
            autoFocus
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Thread title…"
            style={{ ...inputSt, marginBottom: 10, fontWeight: 600, fontSize: 15 }}
          />
          <textarea
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            placeholder="Add some context (optional)…"
            rows={3}
            style={{ ...inputSt, resize: 'vertical', lineHeight: 1.65, marginBottom: 14 }}
          />
          {threadError && <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>{threadError}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button onClick={() => { setShowNewThread(false); setThreadError('') }} style={{ padding: '8px 18px', background: 'transparent', border: '1px solid rgba(87,65,68,0.3)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button
              onClick={handlePostThread}
              disabled={!newTitle.trim() || postingThread}
              style={{ padding: '8px 20px', background: !newTitle.trim() ? 'rgba(138,21,56,0.3)' : 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: !newTitle.trim() ? 'default' : 'pointer', opacity: postingThread ? 0.6 : 1 }}
            >
              {postingThread ? 'Posting…' : 'Post Thread'}
            </button>
          </div>
        </div>
      )}

      {/* Thread list */}
      {threads.length === 0 ? (
        <EmptyState icon="💬" title="No threads yet" sub="Start a conversation for this club." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {threads.map((thread, i) => {
            const isOpen = expanded === thread.id
            const threadReplies = replies[thread.id] ?? []
            return (
              <div key={thread.id} style={{
                background: isOpen ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)',
                border: isOpen ? '1px solid rgba(138,21,56,0.3)' : '1px solid rgba(255,255,255,0.07)',
                borderRadius: 14, overflow: 'hidden', transition: 'border-color 0.2s',
                animation: `cp-up 0.4s cubic-bezier(0.22,1,0.36,1) ${i * 0.05}s both`,
              }}>
                {/* Thread header — click to expand */}
                <div
                  className="thread-row"
                  onClick={() => handleExpand(thread.id)}
                  style={{ padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer', transition: 'border-color 0.2s' }}
                >
                  <div onClick={e => { e.stopPropagation(); navigate(`/profile/${thread.user_id}`) }} style={{ cursor: 'pointer', flexShrink: 0 }}><Avatar name={thread.profile?.full_name} size={36} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3, lineHeight: 1.3 }}>
                      {thread.title}
                    </div>
                    {thread.content && !isOpen && (
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {thread.content}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 12, marginTop: 5 }}>
                      <span onClick={e => { e.stopPropagation(); navigate(`/profile/${thread.user_id}`) }} style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>{thread.profile?.full_name ?? 'Unknown'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>·</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(thread.created_at)}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>·</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{thread.reply_count} {thread.reply_count === 1 ? 'reply' : 'replies'}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 16, color: 'var(--text-muted)', flexShrink: 0, transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none' }}>
                    ⌄
                  </div>
                </div>

                {/* Expanded body */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {/* Full content */}
                    {thread.content && (
                      <div style={{ padding: '14px 18px 10px', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                        {thread.content}
                      </div>
                    )}

                    {/* Replies */}
                    {threadReplies.length > 0 && (
                      <div style={{ padding: '0 18px', display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {threadReplies.map((rep, idx) => (
                          <div key={rep.id} style={{
                            display: 'flex', gap: 10, alignItems: 'flex-start',
                            padding: '12px 0',
                            borderTop: idx === 0 ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(255,255,255,0.04)',
                          }}>
                            <div onClick={() => navigate(`/profile/${rep.user_id}`)} style={{ cursor: 'pointer', flexShrink: 0 }}><Avatar name={rep.profile?.full_name} size={28} /></div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 4 }}>
                                <span onClick={() => navigate(`/profile/${rep.user_id}`)} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>{rep.profile?.full_name ?? 'Unknown'}</span>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(rep.created_at)}</span>
                              </div>
                              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{rep.content}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Reply input */}
                    {replyError && <div style={{ padding: '5px 18px', fontSize: 12, color: '#f87171', background: 'rgba(248,113,113,0.08)', borderTop: '1px solid rgba(248,113,113,0.15)' }}>{replyError}</div>}
                    <div style={{ padding: '12px 18px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                      <Avatar name={undefined} size={28} />
                      <div style={{ flex: 1 }}>
                        <textarea
                          ref={bottomRef}
                          value={replyText[thread.id] ?? ''}
                          onChange={e => { setReplyText(r => ({ ...r, [thread.id]: e.target.value })); setReplyError('') }}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(thread.id) } }}
                          placeholder="Write a reply… (Enter to send)"
                          rows={1}
                          style={{ ...inputSt, resize: 'none', lineHeight: 1.5, fontSize: 13 }}
                        />
                      </div>
                      <button
                        onClick={() => handleReply(thread.id)}
                        disabled={!(replyText[thread.id] ?? '').trim() || postingReply}
                        style={{
                          padding: '8px 14px', background: !(replyText[thread.id] ?? '').trim() ? 'rgba(138,21,56,0.2)' : 'var(--accent)',
                          border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600,
                          cursor: !(replyText[thread.id] ?? '').trim() ? 'default' : 'pointer',
                          flexShrink: 0, transition: 'background 0.15s',
                        }}
                      >
                        Reply
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ──────────────── EventAnnouncementsModal ───────────

function EventAnnouncementsModal({
  event, announcements, loading, onClose,
}: {
  event: EventRow
  announcements: EventAnnouncementRow[]
  loading: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div style={{
        width: '100%', maxWidth: 520,
        background: 'var(--bg-card)', border: '1px solid rgba(255,180,171,0.15)',
        borderRadius: 22, maxHeight: '80vh', overflowY: 'auto',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{
          padding: '22px 26px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1,
          borderRadius: '22px 22px 0 0',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--live-red)', animation: 'livePulse 1.4s ease-in-out infinite' }}/>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--live-red)', letterSpacing: '0.1em' }}>LIVE EVENT</span>
            </div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.2px' }}>
              {event.title}
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Live updates from organizers
            </p>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>✕</button>
        </div>

        <div style={{ padding: '20px 26px 28px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              Loading updates…
            </div>
          ) : announcements.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📢</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>No updates yet</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Organizers will post live updates here during the event.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {announcements.map(ann => (
                <div key={ann.id} style={{
                  background: 'rgba(255,255,255,0.03)',
                  borderLeft: '3px solid var(--live-red)',
                  borderRadius: '0 12px 12px 0',
                  padding: '14px 18px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div onClick={() => navigate(`/profile/${ann.user_id}`)} style={{ cursor: 'pointer', flexShrink: 0 }}><Avatar name={ann.profile?.full_name} size={28} /></div>
                    <div style={{ flex: 1 }}>
                      <div onClick={() => navigate(`/profile/${ann.user_id}`)} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                        {ann.profile?.full_name ?? 'Organizer'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                        {timeAgo(ann.created_at)}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
                      background: 'rgba(255,180,171,0.1)', border: '1px solid rgba(255,180,171,0.22)',
                      borderRadius: 9999, padding: '2px 8px', color: 'var(--live-red)',
                    }}>
                      LIVE UPDATE
                    </span>
                  </div>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>
                    {linkify(ann.content)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ───────────────────────── ClubThemeCustomizer ──────

const BG_THEME_LABELS: Record<string, string> = {
  dark: 'Dark', midnight: 'Midnight', space: 'Space',
  forest: 'Forest', ocean: 'Ocean', dusk: 'Dusk', void: 'Void',
}

function ClubThemeCustomizer({
  editTheme, setEditTheme, catColor, saving, onSave, onCancel,
}: {
  editTheme: ClubTheme
  setEditTheme: React.Dispatch<React.SetStateAction<ClubTheme>>
  catColor: string
  saving: boolean
  onSave: () => void
  onCancel: () => void
}) {
  const [hexInput, setHexInput] = useState(editTheme.accent)
  const update = (patch: Partial<ClubTheme>) => setEditTheme(prev => ({ ...prev, ...patch }))

  const previewAccent = editTheme.accent || catColor
  const [pr, pg, pb] = hexToRgbClub(previewAccent)
  const pa = (a: number) => `rgba(${pr},${pg},${pb},${a})`

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      width: 'min(680px,100vw)', maxHeight: '88vh',
      margin: '0 auto',
      background: 'rgba(12,6,9,0.96)',
      backdropFilter: 'blur(28px)',
      WebkitBackdropFilter: 'blur(28px)',
      border: `1px solid ${pa(0.28)}`,
      borderBottom: 'none',
      borderRadius: '22px 22px 0 0',
      zIndex: 55,
      overflowY: 'auto',
      paddingBottom: 'env(safe-area-inset-bottom)',
      boxShadow: `0 -20px 60px rgba(0,0,0,0.7), 0 -1px 0 ${pa(0.2)}`,
    }}>
      {/* Drag handle */}
      <div style={{ padding: '14px 0 6px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 38, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.12)' }}/>
      </div>

      <div style={{ padding: '4px 22px 28px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.2px' }}>Club Appearance</h3>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.32)', margin: '4px 0 0' }}>Changes are live-previewed above</p>
          </div>
          <button onClick={onCancel} style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        {/* ── Accent Color ── */}
        <div style={{ marginBottom: 26 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Accent Color</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {/* Auto = category color */}
            <button
              onClick={() => { update({ accent: '' }); setHexInput('') }}
              title="Auto (category color)"
              style={{
                width: 42, height: 42, borderRadius: '50%',
                background: catColor,
                border: !editTheme.accent ? '3px solid #fff' : '3px solid transparent',
                cursor: 'pointer', outline: 'none', flexShrink: 0,
                boxShadow: !editTheme.accent ? `0 0 0 2px ${catColor}` : 'none',
                position: 'relative',
              }}
            >
              <span style={{ position: 'absolute', bottom: -16, left: '50%', transform: 'translateX(-50%)', fontSize: 8, color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap', fontWeight: 600 }}>AUTO</span>
            </button>
            {CLUB_ACCENT_PRESETS.map(hex => (
              <button key={hex} onClick={() => { update({ accent: hex }); setHexInput(hex) }}
                style={{
                  width: 42, height: 42, borderRadius: '50%',
                  background: hex,
                  border: editTheme.accent === hex ? '3px solid #fff' : '3px solid transparent',
                  cursor: 'pointer', outline: 'none', flexShrink: 0,
                  boxShadow: editTheme.accent === hex ? `0 0 0 2px ${hex}` : 'none',
                  transition: 'transform 0.12s, box-shadow 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.12)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 18 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: previewAccent, flexShrink: 0, border: '1px solid rgba(255,255,255,0.1)' }}/>
            <input
              value={hexInput}
              onChange={e => {
                setHexInput(e.target.value)
                if (/^#[0-9a-f]{6}$/i.test(e.target.value)) update({ accent: e.target.value })
              }}
              placeholder="#8a1538"
              style={{ flex: 1, padding: '9px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'monospace' }}
            />
          </div>
        </div>

        {/* ── Banner Background ── */}
        <div style={{ marginBottom: 26 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Banner Background</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            {Object.entries(CLUB_BG_THEMES).map(([key, t]) => {
              const active = editTheme.bg === key
              return (
                <button
                  key={key}
                  onClick={() => update({ bg: key })}
                  style={{
                    borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                    border: active ? `2px solid ${previewAccent}` : '2px solid rgba(255,255,255,0.07)',
                    padding: 0, outline: 'none', background: 'transparent',
                    boxShadow: active ? `0 0 12px ${pa(0.4)}` : 'none',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                >
                  <div style={{
                    height: 52,
                    backgroundColor: t.base,
                    backgroundImage: [
                      `radial-gradient(ellipse 80% 140% at 30% 60%, ${previewAccent}aa 0%, transparent 60%)`,
                      `radial-gradient(ellipse 60% 90% at 80% 20%, ${previewAccent}66 0%, transparent 55%)`,
                    ].join(','),
                    display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 0 6px',
                  }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{BG_THEME_LABELS[key]}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Card Glow ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Card Glow</div>
          <button
            onClick={() => update({ glow: !editTheme.glow })}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 16px', borderRadius: 12, cursor: 'pointer',
              background: editTheme.glow ? pa(0.12) : 'rgba(255,255,255,0.04)',
              border: editTheme.glow ? `1px solid ${pa(0.35)}` : '1px solid rgba(255,255,255,0.09)',
              color: editTheme.glow ? previewAccent : 'rgba(255,255,255,0.4)',
              fontSize: 13, fontWeight: 600, transition: 'all 0.15s', width: '100%', textAlign: 'left',
              boxShadow: editTheme.glow ? `0 0 20px ${pa(0.18)}` : 'none',
            }}
          >
            <div style={{
              width: 18, height: 18, borderRadius: '50%',
              background: editTheme.glow ? previewAccent : 'rgba(255,255,255,0.12)',
              boxShadow: editTheme.glow ? `0 0 10px ${pa(0.6)}` : 'none',
              transition: 'all 0.2s', flexShrink: 0,
            }}/>
            {editTheme.glow ? 'Glow On — cards have an accent border glow' : 'Glow Off — standard flat card borders'}
          </button>
        </div>

        {/* ── Actions ── */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '12px', borderRadius: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.45)', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={onSave} disabled={saving} style={{ flex: 2, padding: '12px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg, ${previewAccent}, ${previewAccent}cc)`, color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1, boxShadow: saving ? 'none' : `0 4px 20px ${pa(0.4)}`, transition: 'all 0.2s' }}>
            {saving ? 'Saving…' : 'Save Appearance'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────── EmptyState ──────────

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '52px 0', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 38, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{title}</div>
      {sub && <div style={{ fontSize: 13 }}>{sub}</div>}
    </div>
  )
}

// ─────────────────────────────── Shared styles ──────

const backBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none',
  color: 'var(--text-muted)', fontSize: 13, fontWeight: 500,
  cursor: 'pointer', padding: '4px 0',
}

const navBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none',
  color: 'var(--text-muted)', fontSize: 20,
  cursor: 'pointer', padding: '4px 10px', lineHeight: 1,
  borderRadius: 8, transition: 'color 0.15s',
}

const inputSt: React.CSSProperties = {
  width: '100%', background: 'rgba(41,28,30,0.8)',
  border: '1px solid rgba(87,65,68,0.3)', borderRadius: 8,
  padding: '9px 12px', color: 'var(--text-primary)',
  fontSize: 14, outline: 'none',
}
