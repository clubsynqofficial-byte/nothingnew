import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

interface TournamentRow {
  id: string
  name: string
  sport: string
  description: string | null
  logo_url: string | null
  location: string | null
  start_date: string | null
  registration_deadline: string | null
  max_teams: number
  status: 'registration_open' | 'registration_closed' | 'ongoing' | 'completed' | 'cancelled'
  format: 'single_elimination' | 'round_robin'
  prize_description: string | null
  created_at: string
  created_by: string
  is_test: boolean | null
  club: { id: string; name: string; logo_url: string | null } | null
  _accepted: number
  _pending: number
}

const SPORT_EMOJIS: Record<string, string> = {
  Basketball: '🏀', Football: '⚽', Volleyball: '🏐', Tennis: '🎾',
  Badminton: '🏸', Cricket: '🏏', Swimming: '🏊', Athletics: '🏃',
  Chess: '♟️', Gaming: '🎮', 'Table Tennis': '🏓', Rugby: '🏉',
  Baseball: '⚾', Hockey: '🏑', Other: '🏆',
}

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string; dot?: boolean }> = {
  registration_open: { label: 'Registration Open', color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
  registration_closed: { label: 'Reg. Closed', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  ongoing: { label: 'Live', color: '#f97316', bg: 'rgba(249,115,22,0.14)', dot: true },
  completed: { label: 'Completed', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  cancelled: { label: 'Cancelled', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

type Filter = 'all' | 'open' | 'ongoing' | 'completed'

const MAINTENANCE_MODE = false

export default function TournamentsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  if (MAINTENANCE_MODE && user?.email !== 'aby.nair08@gmail.com') return (
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '65vh', textAlign: 'center' }}>
      <style>{`@keyframes wrench{0%,100%{transform:rotate(-15deg)}50%{transform:rotate(15deg)}}`}</style>
      <div style={{ fontSize: 60, marginBottom: 20, display: 'inline-block', animation: 'wrench 1.6s ease-in-out infinite' }}>🔧</div>
      <h1 style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 10, letterSpacing: '-0.02em' }}>Under Maintenance</h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 360, lineHeight: 1.7 }}>
        The Tournaments section is currently being updated.<br />Check back soon — we'll be up shortly!
      </p>
    </div>
  )
  const [tournaments, setTournaments] = useState<TournamentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  function handleShare(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const url = `${window.location.origin}/tournaments/${id}`
    if (navigator.share) {
      navigator.share({ title: 'ClubSynq Tournament', url })
    } else {
      navigator.clipboard.writeText(url)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  useEffect(() => { fetchTournaments() }, [])

  async function fetchTournaments() {
    setLoading(true)
    // On localhost show everything; on production hide test tournaments for everyone
    let query = supabase
      .from('tournaments')
      .select('*, club:clubs(id, name, logo_url)')
      .order('created_at', { ascending: false })
    if (window.location.hostname !== 'localhost') {
      query = query.not('is_test', 'eq', true)
    }
    const { data } = await query

    if (data) {
      const ids = data.map(t => t.id)
      const { data: teamData } = await supabase
        .from('tournament_teams')
        .select('tournament_id, status')
        .in('tournament_id', ids)

      const acceptedMap: Record<string, number> = {}
      const pendingMap: Record<string, number> = {}
      for (const t of teamData ?? []) {
        if (t.status === 'accepted') acceptedMap[t.tournament_id] = (acceptedMap[t.tournament_id] ?? 0) + 1
        if (t.status === 'pending') pendingMap[t.tournament_id] = (pendingMap[t.tournament_id] ?? 0) + 1
      }
      setTournaments(data.map(t => ({ ...t, _accepted: acceptedMap[t.id] ?? 0, _pending: pendingMap[t.id] ?? 0 })))
    }
    setLoading(false)
  }

  const filtered = tournaments.filter(t => {
    if (filter === 'open' && t.status !== 'registration_open') return false
    if (filter === 'ongoing' && t.status !== 'ongoing') return false
    if (filter === 'completed' && t.status !== 'completed') return false
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) &&
        !t.sport.toLowerCase().includes(search.toLowerCase()) &&
        !t.club?.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const sportEmoji = (sport: string) => SPORT_EMOJIS[sport] ?? '🏆'

  return (
    <div className="page-content">
      <style>{`
        @keyframes tourny-in { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes live-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.5; transform:scale(.85); } }
        .tourny-card { cursor:pointer; transition:transform 0.15s, box-shadow 0.15s, border-color 0.15s; }
        .tourny-card:hover { transform:translateY(-2px); box-shadow:0 12px 40px rgba(0,0,0,0.5); border-color:rgba(138,21,56,0.35) !important; }
        .tourny-filter-btn { transition:all 0.15s; cursor:pointer; border:none; font-family:inherit; }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 6 }}>
              Tournaments
            </h1>
            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
              Register your team, track live scores, and follow the bracket
            </p>
          </div>
        </div>
      </div>

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tournaments..."
            style={{
              width: '100%', padding: '10px 12px 10px 36px',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10, color: 'var(--text-primary)', fontSize: 14,
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 4 }}>
          {(['all', 'open', 'ongoing', 'completed'] as Filter[]).map(f => (
            <button key={f} className="tourny-filter-btn" onClick={() => setFilter(f)} style={{
              padding: '7px 14px', borderRadius: 7, fontSize: 13, fontWeight: filter === f ? 700 : 500,
              color: filter === f ? '#fff' : 'var(--text-muted)',
              background: filter === f ? 'rgba(138,21,56,0.22)' : 'transparent',
              border: filter === f ? '1px solid rgba(138,21,56,0.32)' : '1px solid transparent',
            }}>
              {f === 'all' ? 'All' : f === 'open' ? 'Open' : f === 'ongoing' ? 'Live' : 'Done'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <div style={{ width: 28, height: 28, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏆</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>No tournaments found</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {search ? 'Try a different search term.' : 'Check back later — clubs will post tournaments here.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filtered.map((t, i) => {
            const st = STATUS_STYLES[t.status] ?? STATUS_STYLES.registration_open
            return (
              <div
                key={t.id}
                className="tourny-card"
                onClick={() => navigate(`/tournaments/${t.id}`)}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 16,
                  padding: 20,
                  animation: `tourny-in 0.3s cubic-bezier(0.22,1,0.36,1) both`,
                  animationDelay: `${i * 0.04}s`,
                }}
              >
                {/* Sport + status */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: 'rgba(138,21,56,0.15)', border: '1px solid rgba(138,21,56,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                    overflow: 'hidden',
                  }}>
                    {t.logo_url
                      ? <img src={t.logo_url} alt={t.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : sportEmoji(t.sport)
                    }
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: st.bg, borderRadius: 999, padding: '4px 10px' }}>
                    {st.dot && (
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: st.color, animation: 'live-pulse 1.5s ease-in-out infinite' }} />
                    )}
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: st.color }}>{st.label}</span>
                  </div>
                </div>

                {/* Name + sport */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 2 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.3 }}>{t.name}</div>
                    {t.is_test && t.created_by === user?.id && (
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 5, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>Dev</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{t.sport}</div>
                </div>

                {/* Club */}
                {t.club && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', overflow: 'hidden', flexShrink: 0 }}>
                      {t.club.logo_url
                        ? <img src={t.club.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : t.club.name[0]}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.club.name}</span>
                  </div>
                )}

                {/* Stats row */}
                <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>{t._accepted}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Teams</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>{t.max_teams}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Max</div>
                  </div>
                </div>

                {/* Dates */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                  {t.registration_deadline && t.status === 'registration_open' && (
                    <div style={{ fontSize: 11.5, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', borderRadius: 6, padding: '3px 8px', fontWeight: 600 }}>
                      Reg. closes {formatDate(t.registration_deadline)}
                    </div>
                  )}
                  {t.start_date && (
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '3px 8px' }}>
                      Starts {formatDate(t.start_date)}
                    </div>
                  )}
                  {t.prize_description && (
                    <div style={{ fontSize: 11.5, color: '#e9c176', background: 'rgba(233,193,118,0.1)', borderRadius: 6, padding: '3px 8px', fontWeight: 600 }}>
                      🥇 Prize
                    </div>
                  )}
                </div>

                {/* Share button */}
                <button
                  onClick={e => handleShare(e, t.id)}
                  style={{
                    width: '100%', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    background: copiedId === t.id ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${copiedId === t.id ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.09)'}`,
                    borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 12.5, fontWeight: 600,
                    color: copiedId === t.id ? '#4ade80' : 'var(--text-muted)',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (copiedId !== t.id) { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'var(--text-primary)' } }}
                  onMouseLeave={e => { if (copiedId !== t.id) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--text-muted)' } }}
                >
                  {copiedId === t.id ? (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      Link copied!
                    </>
                  ) : (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                      Share
                    </>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
