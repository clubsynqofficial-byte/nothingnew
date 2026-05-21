import { useState, useEffect, useCallback } from 'react'
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
  const [applyClub, setApplyClub] = useState<{ id: string; name: string } | null>(null)
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

  useEffect(() => {
    fetchEvents()
    fetchMemberships()
  }, [fetchEvents, fetchMemberships])

  const handleJoin = async (clubId: string, clubName: string) => {
    if (!user || joiningId) return

    // Check for active application form
    const { data: formData } = await supabase
      .from('club_forms')
      .select('id')
      .eq('club_id', clubId)
      .eq('is_active', true)
      .maybeSingle()

    if (formData) {
      setApplyClub({ id: clubId, name: clubName })
      return
    }

    // Direct join
    setJoiningId(clubId)
    await supabase.from('club_memberships').insert({ club_id: clubId, user_id: user.id })
    await supabase.from('karak_transactions').insert({
      user_id: user.id, points: 5, reason: `Joined club: ${clubName}`,
    })
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
        @keyframes evUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
        @keyframes livePulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { to { transform:rotate(360deg) } }
        .ev-row { transition: background 0.15s; }
        .ev-row:hover { background: rgba(255,255,255,0.06) !important; }
        .ev-join-btn { transition: all 0.18s ease; }
        .ev-join-btn:hover:not(:disabled) { filter: brightness(1.15); transform: translateY(-1px); }
      `}</style>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>Events</h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>Upcoming events from all clubs</p>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
          width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
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
          }}
        />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '6px 14px', borderRadius: 9999,
              border: filter === f.key ? '1px solid var(--accent)' : '1px solid rgba(87,65,68,0.3)',
              background: filter === f.key ? 'rgba(138,21,56,0.2)' : 'rgba(255,255,255,0.03)',
              color: filter === f.key ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: 13, fontWeight: filter === f.key ? 600 : 400,
              cursor: 'pointer', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {f.key === 'live' && liveCount > 0 && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--live-red)', display: 'inline-block', animation: 'livePulse 1.4s ease-in-out infinite' }} />
            )}
            {f.label}
            {f.count > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 700,
                background: filter === f.key ? 'rgba(138,21,56,0.4)' : 'rgba(255,255,255,0.08)',
                color: filter === f.key ? 'var(--accent)' : 'var(--text-muted)',
                borderRadius: 9999, padding: '1px 7px',
              }}>{f.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: 14 }}>
          <div style={{ width: 28, height: 28, border: '3px solid rgba(87,65,68,0.3)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          Loading events…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📅</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
            {search ? 'No events match your search'
              : filter === 'live'  ? 'No live events right now'
              : filter === 'today' ? 'No events today'
              : filter === 'week'  ? 'No events this week'
              : 'No upcoming events'}
          </div>
          <div style={{ fontSize: 13 }}>Check back later or explore clubs to find events.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((event, i) => (
            <EventCard
              key={event.id}
              event={event}
              index={i}
              isMember={memberClubIds.has(event.club_id)}
              isPending={pendingClubIds.has(event.club_id)}
              joining={joiningId === event.club_id}
              onClubClick={() => navigate(`/clubs/${event.club_id}`)}
              onJoin={() => handleJoin(event.club_id, event.club?.name ?? 'Club')}
            />
          ))}
        </div>
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

function EventCard({ event, index, isMember, isPending, joining, onClubClick, onJoin }: {
  event: EventRow
  index: number
  isMember: boolean
  isPending: boolean
  joining: boolean
  onClubClick: () => void
  onJoin: () => void
}) {
  const catColor = CATEGORY_COLORS[event.club?.category ?? ''] ?? 'var(--accent)'

  return (
    <div className="ev-row" style={{
      background: event.is_live ? 'rgba(255,180,171,0.05)' : 'rgba(255,255,255,0.03)',
      border: event.is_live ? '1px solid rgba(255,180,171,0.18)' : '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14, padding: '16px 20px',
      display: 'flex', gap: 16, alignItems: 'flex-start',
      animation: `evUp 0.38s cubic-bezier(0.22,1,0.36,1) ${index * 0.045}s both`,
    }}>
      {/* Date block */}
      <div style={{
        flexShrink: 0, width: 52, textAlign: 'center',
        background: event.is_live ? 'rgba(255,180,171,0.1)' : 'rgba(138,21,56,0.1)',
        border: event.is_live ? '1px solid rgba(255,180,171,0.2)' : '1px solid rgba(138,21,56,0.18)',
        borderRadius: 10, padding: '8px 4px',
      }}>
        {event.is_live ? (
          <>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--live-red)', margin: '0 auto 3px', animation: 'livePulse 1.4s ease-in-out infinite' }} />
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--live-red)', letterSpacing: '0.07em' }}>LIVE</div>
          </>
        ) : event.start_time ? (
          <>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
              {new Date(event.start_time).getDate()}
            </div>
            <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', marginTop: 2 }}>
              {new Date(event.start_time).toLocaleString('en-US', { month: 'short' }).toUpperCase()}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)' }}>TBA</div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <button
          onClick={onClubClick}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', marginBottom: 6 }}
        >
          <div style={{
            width: 18, height: 18, borderRadius: 5,
            background: event.club?.logo_url ? 'transparent' : `${catColor}22`,
            border: `1px solid ${catColor}44`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, color: catColor, overflow: 'hidden', flexShrink: 0,
          }}>
            {event.club?.logo_url
              ? <img src={event.club.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (event.club?.name?.[0] ?? '?')}
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: catColor }}>
            {event.club?.name ?? 'Unknown Club'}
          </span>
        </button>

        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 5, lineHeight: 1.3 }}>
          {event.title}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 6 }}>
          {event.start_time && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>🕐 {formatEventDate(event.start_time)}</span>}
          {event.location   && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>📍 {event.location}</span>}
        </div>

        {event.description && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, margin: '0 0 8px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {event.description}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {event.karak_points_reward > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', background: 'rgba(233,193,118,0.1)', border: '1px solid rgba(233,193,118,0.22)', borderRadius: 9999, padding: '2px 9px' }}>
              +{event.karak_points_reward} pts
            </span>
          )}
          {event.max_attendees !== null ? (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {event.attendee_count} / {event.max_attendees} attending
            </span>
          ) : event.attendee_count > 0 ? (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{event.attendee_count} attending</span>
          ) : null}
        </div>
      </div>

      {/* Buttons */}
      <div style={{ flexShrink: 0, alignSelf: 'center', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {/* Join club button */}
        {isMember ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '7px 14px', borderRadius: 9,
            border: '1px solid rgba(34,197,94,0.3)',
            background: 'rgba(34,197,94,0.08)',
            color: '#4ade80', fontSize: 12, fontWeight: 600,
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
            Member
          </span>
        ) : isPending ? (
          <span style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid rgba(251,146,60,0.3)', background: 'rgba(251,146,60,0.08)', color: '#fb923c', fontSize: 12, fontWeight: 600 }}>
            Pending
          </span>
        ) : (
          <button className="ev-join-btn" onClick={onJoin} disabled={!!joining} style={{ padding: '7px 16px', borderRadius: 9, background: 'var(--accent)', border: '1px solid rgba(138,21,56,0.5)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: joining ? 'default' : 'pointer', opacity: joining ? 0.6 : 1, whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
            {joining ? '…' : 'Join Club'}
          </button>
        )}
      </div>
    </div>
  )
}
