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
  Basketball: '🏀', Football: '⚽', Bowling: '🎳', Volleyball: '🏐', Tennis: '🎾',
  Badminton: '🏸', Cricket: '🏏', Swimming: '🏊', Athletics: '🏃',
  Chess: '♟️', Gaming: '🎮', 'Table Tennis': '🏓', Rugby: '🏉',
  Baseball: '⚾', Hockey: '🏑', Other: '🏆',
}


function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

type Filter = 'all' | 'open' | 'ongoing' | 'completed'

const MAINTENANCE_MODE = false
const MAINTENANCE_ALLOWED = ['aby.nair08@gmail.com', 'abbasmazin48845@gmail.com']

export default function TournamentsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  if (MAINTENANCE_MODE && !MAINTENANCE_ALLOWED.includes(user?.email ?? '')) return (
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
        .tourny-card { cursor:pointer; transition:transform 0.18s ease, box-shadow 0.18s ease, background 0.15s ease; }
        .tourny-card:hover { transform:translateY(-3px); box-shadow:0 16px 48px rgba(0,0,0,0.55); background:rgba(255,255,255,0.05) !important; }
        .tourny-filter-btn { transition:all 0.15s; cursor:pointer; border:none; font-family:inherit; }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <h1 style={{ fontSize: 32, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>
                Tournaments
              </h1>
              {tournaments.filter(t => t.status === 'ongoing').length > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.12em', padding: '4px 10px', background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.35)', borderRadius: 20 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', animation: 'live-pulse 1.5s ease-in-out infinite' }} />
                  {tournaments.filter(t => t.status === 'ongoing').length} Live
                </span>
              )}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, opacity: 0.7 }}>
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
            placeholder="Search tournaments, sports, clubs…"
            style={{
              width: '100%', padding: '10px 12px 10px 36px',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 10, color: 'var(--text-primary)', fontSize: 14,
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 2, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 4 }}>
          {(['all', 'open', 'ongoing', 'completed'] as Filter[]).map(f => (
            <button key={f} className="tourny-filter-btn" onClick={() => setFilter(f)} style={{
              padding: '7px 16px', borderRadius: 7, fontSize: 13, fontWeight: filter === f ? 800 : 500,
              color: filter === f ? '#fff' : 'var(--text-muted)',
              background: filter === f ? 'rgba(138,21,56,0.3)' : 'transparent',
              border: filter === f ? '1px solid rgba(138,21,56,0.45)' : '1px solid transparent',
              letterSpacing: filter === f ? '0.01em' : '0',
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
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>No tournaments found</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {search ? `No results for "${search}" — try a different sport or club name.` : filter !== 'all' ? 'Nothing in this category right now. Try switching to All.' : 'No tournaments yet — clubs will post competitions here soon.'}
          </div>
        </div>
      ) : (() => {
        const live = filtered.filter(t => t.status === 'ongoing')
        const open = filtered.filter(t => t.status === 'registration_open' || t.status === 'registration_closed')
        const done = filtered.filter(t => t.status === 'completed' || t.status === 'cancelled')

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

            {/* ── LIVE NOW ── */}
            {live.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316', animation: 'live-pulse 1.4s ease-in-out infinite', boxShadow: '0 0 8px rgba(249,115,22,0.7)' }} />
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.14em' }}>Live Now</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {live.map((t, i) => {
                    return (
                      <div key={t.id} className="tourny-card" onClick={() => navigate(`/tournaments/${t.id}`)}
                        style={{ background: 'var(--bg-card)', border: '1px solid rgba(249,115,22,0.2)', borderLeft: '4px solid #f97316', borderRadius: 14, padding: '18px 20px', display: 'flex', gap: 16, alignItems: 'center', animation: `tourny-in 0.3s ease both`, animationDelay: `${i * 0.05}s` }}
                      >
                        <div style={{ width: 52, height: 52, borderRadius: 12, background: 'rgba(249,115,22,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, overflow: 'hidden', flexShrink: 0 }}>
                          {t.logo_url ? <img src={t.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : sportEmoji(t.sport)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {t.sport}{t.club && <> · {t.club.name}</>}{t.location && <> · {t.location}</>}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1 }}>{t._accepted}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>teams</div>
                        </div>
                        <button onClick={e => handleShare(e, t.id)} style={{ padding: '8px 14px', background: copiedId === t.id ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${copiedId === t.id ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 9, color: copiedId === t.id ? '#4ade80' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', flexShrink: 0 }}>
                          {copiedId === t.id ? 'Copied!' : 'Share'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── OPEN / UPCOMING ── */}
            {open.length > 0 && (
              <div>
                {(live.length > 0 || done.length > 0) && (
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 14 }}>
                    {open.some(t => t.status === 'registration_open') ? 'Registration Open' : 'Upcoming'}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                  {open.map((t, i) => {
                    const fillPct = t.max_teams > 0 ? Math.min(t._accepted / t.max_teams, 1) : 0
                    const isOpen = t.status === 'registration_open'
                    return (
                      <div key={t.id} className="tourny-card" onClick={() => navigate(`/tournaments/${t.id}`)}
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 18px 14px', animation: `tourny-in 0.3s ease both`, animationDelay: `${i * 0.04}s` }}
                      >
                        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                          <div style={{ width: 44, height: 44, borderRadius: 11, background: 'var(--bg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, overflow: 'hidden', flexShrink: 0 }}>
                            {t.logo_url ? <img src={t.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : sportEmoji(t.sport)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {t.name}
                                {t.is_test && t.created_by === user?.id && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 4, padding: '1px 5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Dev</span>}
                              </div>
                              {isOpen && <span style={{ fontSize: 10, fontWeight: 700, color: '#4ade80', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 999, padding: '2px 7px', flexShrink: 0, whiteSpace: 'nowrap' }}>Open</span>}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.sport}{t.club && <> · {t.club.name}</>}</div>
                          </div>
                        </div>

                        {/* Fill bar */}
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}><span style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)' }}>{t._accepted}</span> / {t.max_teams} teams</span>
                            {fillPct >= 0.5 && <span style={{ fontSize: 11, fontWeight: 700, color: fillPct >= 0.9 ? '#f87171' : '#f59e0b' }}>{Math.round(fillPct * 100)}% full</span>}
                          </div>
                          <div style={{ height: 3, background: 'var(--bg-muted)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${fillPct * 100}%`, background: fillPct >= 0.9 ? '#f87171' : fillPct >= 0.6 ? '#f59e0b' : 'var(--accent)', borderRadius: 2, transition: 'width 0.6s ease' }} />
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {t.registration_deadline && isOpen && (
                              <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>Closes {formatDate(t.registration_deadline)}</span>
                            )}
                            {t.start_date && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Starts {formatDate(t.start_date)}</span>}
                            {t.prize_description && <span style={{ fontSize: 11, color: 'var(--gold)' }}>🥇 Prize</span>}
                          </div>
                          <button onClick={e => handleShare(e, t.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, display: 'flex', flexShrink: 0 }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── COMPLETED — compact list ── */}
            {done.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 12 }}>Completed</div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                  {done.map((t, i) => (
                    <div key={t.id} className="tourny-card" onClick={() => navigate(`/tournaments/${t.id}`)}
                      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', background: 'var(--bg-card)', borderBottom: i < done.length - 1 ? '1px solid var(--border)' : 'none', animation: `tourny-in 0.25s ease both`, animationDelay: `${i * 0.03}s` }}
                    >
                      <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--bg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, overflow: 'hidden', flexShrink: 0, opacity: 0.7 }}>
                        {t.logo_url ? <img src={t.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : sportEmoji(t.sport)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{t.sport}{t.club && <> · {t.club.name}</>}</div>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>{t._accepted} teams</span>
                      <button onClick={e => handleShare(e, t.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, display: 'flex', flexShrink: 0, opacity: 0.6 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )
      })()}
    </div>
  )
}
