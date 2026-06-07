import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

interface Tournament {
  id: string; name: string; sport: string; status: string
  format: 'single_elimination' | 'round_robin'
  logo_url: string | null; location: string | null
  prizes: Array<{ place: string; description: string }> | null
  club: { name: string } | null
  standings_paused: boolean | null
}
interface Team { id: string; team_name: string; logo_url: string | null }
interface Match {
  id: string; tournament_id: string
  team1_id: string | null; team2_id: string | null
  score1: number; score2: number
  winner_id: string | null; round: number; match_number: number
  status: 'scheduled' | 'live' | 'completed'
}

const CSS = `
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes sb-in{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes row-in{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
`

function Logo({ team, size }: { team: Team | null | undefined; size: number }) {
  const init = (team?.team_name ?? '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.24), background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.34), fontWeight: 800, color: 'rgba(255,255,255,0.5)', overflow: 'hidden', flexShrink: 0, letterSpacing: '-0.01em' }}>
      {team?.logo_url ? <img src={team.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : init}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.14em', whiteSpace: 'nowrap' }}>{children}</span>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, rgba(255,255,255,0.08), transparent)' }} />
    </div>
  )
}

export default function TournamentScoreboardPage() {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const navigate = useNavigate()
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(new Date())

  const fetchData = useCallback(async () => {
    if (!tournamentId) return
    const [tRes, teamsRes, matchesRes] = await Promise.all([
      supabase.from('tournaments').select('id,name,sport,status,format,logo_url,location,prizes,standings_paused,club:clubs(name)').eq('id', tournamentId).single(),
      supabase.from('tournament_teams').select('id,team_name,logo_url').eq('tournament_id', tournamentId).eq('status', 'accepted'),
      supabase.from('tournament_matches').select('*').eq('tournament_id', tournamentId).order('round').order('match_number'),
    ])
    if (tRes.data) setTournament(tRes.data as unknown as Tournament)
    if (teamsRes.data) setTeams(teamsRes.data)
    if (matchesRes.data) setMatches(matchesRes.data)
    setLoading(false)
    setLastUpdated(new Date())
  }, [tournamentId])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!tournamentId) return
    const ch = supabase.channel(`sb-${tournamentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_matches', filter: `tournament_id=eq.${tournamentId}` },
        p => {
          if (p.eventType === 'INSERT') setMatches(prev => [...prev, p.new as Match].sort((a, b) => a.round - b.round || a.match_number - b.match_number))
          if (p.eventType === 'UPDATE') { setMatches(prev => prev.map(m => m.id === (p.new as Match).id ? p.new as Match : m)); setLastUpdated(new Date()) }
          if (p.eventType === 'DELETE') setMatches(prev => prev.filter(m => m.id !== (p.old as Match).id))
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tournaments', filter: `id=eq.${tournamentId}` },
        p => setTournament(prev => prev ? { ...prev, ...(p.new as Partial<Tournament>) } : prev))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [tournamentId])

  function share() {
    const url = window.location.href
    if (navigator.share) navigator.share({ title: tournament?.name ?? 'Tournament Standings', url })
    else { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500) }
  }

  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const liveMatches = matches.filter(m => m.status === 'live')
  const completedMatches = matches.filter(m => m.status === 'completed')
  const rounds = [...new Set(matches.map(m => m.round))].sort((a, b) => a - b)
  const maxRound = Math.max(...rounds, 0)

  // Standings for round robin
  const standings = teams.map(team => {
    const played = matches.filter(m => (m.team1_id === team.id || m.team2_id === team.id) && m.status === 'completed')
    const wins = played.filter(m => m.winner_id === team.id).length
    const losses = played.filter(m => m.winner_id && m.winner_id !== team.id).length
    const draws = played.length - wins - losses
    const pf = played.reduce((s, m) => s + (m.team1_id === team.id ? m.score1 : m.score2), 0)
    const pa = played.reduce((s, m) => s + (m.team1_id === team.id ? m.score2 : m.score1), 0)
    const pts = wins * 3 + draws
    return { team, played: played.length, wins, draws, losses, pf, pa, pts }
  }).sort((a, b) => b.pts - a.pts || b.wins - a.wins || (b.pf - b.pa) - (a.pf - a.pa))

  const maxPts = standings[0]?.pts || 1

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#070b14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{CSS}</style>
      <div style={{ width: 28, height: 28, border: '3px solid rgba(255,255,255,0.08)', borderTopColor: 'rgba(255,255,255,0.5)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  if (!tournament) return (
    <div style={{ minHeight: '100vh', background: '#070b14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontFamily: 'inherit' }}>
      Tournament not found.
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#070b14', color: '#fff', fontFamily: 'inherit', position: 'relative' }}>
      <style>{CSS}</style>

      {/* Background */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-5%', left: '20%', width: '60vw', height: '40vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(138,21,56,0.12) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      </div>

      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(7,11,20,0.88)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={() => navigate(`/tournaments/${tournamentId}`)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'rgba(255,255,255,0.38)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', padding: 0, flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Tournament
        </button>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tournament.name}</span>
          {liveMatches.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.25)', borderRadius: 20, flexShrink: 0 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316' }} />
              <span style={{ fontSize: 10.5, fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Live</span>
            </div>
          )}
        </div>

        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.18)', flexShrink: 0 }}>
          {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </span>
        <button onClick={share} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: copied ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${copied ? 'rgba(74,222,128,0.28)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 9, color: copied ? '#4ade80' : 'rgba(255,255,255,0.55)', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', transition: 'all 0.2s', flexShrink: 0 }}>
          {copied ? (
            <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>Copied!</>
          ) : (
            <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>Share</>
          )}
        </button>
      </div>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 960, margin: '0 auto', padding: '40px 20px 80px' }}>

        {/* Pause overlay */}
        {tournament?.standings_paused && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 22px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 14, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(245,158,11,0.9)"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', letterSpacing: '0.04em' }}>Standings Paused</span>
            </div>
          </div>
        )}

        {/* Tournament hero */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginBottom: 48, animation: 'sb-in 0.4s ease both' }}>
          <div style={{ width: 72, height: 72, borderRadius: 18, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
            {tournament.logo_url
              ? <img src={tournament.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round"><path d="M6 9H4.5a2.5 2.5 0 0 0 0 5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 1 0 5H18"/><path d="M4 22h16"/><path d="M8 22V11.3"/><path d="M16 22V11.3"/><rect x="6" y="2" width="12" height="9" rx="1"/></svg>
            }
          </div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 6px', letterSpacing: '-0.025em', lineHeight: 1.1 }}>{tournament.name}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>{tournament.sport}</span>
              {tournament.club && <>
                <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'inline-block' }} />
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{tournament.club.name}</span>
              </>}
              {tournament.location && <>
                <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'inline-block' }} />
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{tournament.location}</span>
              </>}
              <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '2px 8px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6 }}>
                {tournament.format === 'round_robin' ? 'Round Robin' : 'Single Elimination'}
              </span>
            </div>
          </div>
        </div>

        {/* Blurred content wrapper when paused */}
        <div style={{ filter: tournament?.standings_paused ? 'blur(6px)' : 'none', transition: 'filter 0.4s ease', userSelect: tournament?.standings_paused ? 'none' : 'auto', pointerEvents: tournament?.standings_paused ? 'none' : 'auto' }}>

        {matches.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: 'rgba(255,255,255,0.2)', fontSize: 14, animation: 'sb-in 0.4s ease both' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" style={{ display: 'block', margin: '0 auto 16px' }} strokeLinecap="round"><path d="M6 9H4.5a2.5 2.5 0 0 0 0 5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 1 0 5H18"/><path d="M4 22h16"/><path d="M8 22V11.3"/><path d="M16 22V11.3"/><rect x="6" y="2" width="12" height="9" rx="1"/></svg>
            Bracket hasn't been set up yet. Check back soon.
          </div>
        )}

        {/* ── LIVE NOW ── */}
        {liveMatches.length > 0 && (
          <div style={{ marginBottom: 52, animation: 'sb-in 0.45s ease both' }}>
            <SectionLabel>Live Now</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px,1fr))', gap: 14 }}>
              {liveMatches.map(match => {
                const t1 = match.team1_id ? teamMap[match.team1_id] : null
                const t2 = match.team2_id ? teamMap[match.team2_id] : null
                return (
                  <div key={match.id} onClick={() => navigate(`/tournaments/${tournamentId}/control?view=public&match=${match.id}`)} style={{ background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.28)', borderRadius: 18, overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(249,115,22,0.55)'; e.currentTarget.style.boxShadow = '0 0 24px rgba(249,115,22,0.12)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(249,115,22,0.28)'; e.currentTarget.style.boxShadow = 'none' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', borderBottom: '1px solid rgba(249,115,22,0.18)' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Live</span>
                      <span style={{ fontSize: 11, color: 'rgba(249,115,22,0.45)', marginLeft: 2 }}>
                        {match.round === maxRound ? 'Final' : match.round === maxRound - 1 && rounds.length > 2 ? 'Semi-final' : `Round ${match.round}`}
                      </span>
                    </div>
                    <div style={{ padding: '22px 20px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
                        <Logo team={t1} size={48} />
                        <span style={{ fontSize: 13, fontWeight: 700, textAlign: 'center', lineHeight: 1.3, color: 'rgba(255,255,255,0.85)' }}>{t1?.team_name ?? 'TBD'}</span>
                        <span style={{ fontSize: 56, fontWeight: 900, lineHeight: 1, color: '#fff' }}>{match.score1}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.06em' }}>vs</span>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
                        <Logo team={t2} size={48} />
                        <span style={{ fontSize: 13, fontWeight: 700, textAlign: 'center', lineHeight: 1.3, color: 'rgba(255,255,255,0.85)' }}>{t2?.team_name ?? 'TBD'}</span>
                        <span style={{ fontSize: 56, fontWeight: 900, lineHeight: 1, color: '#fff' }}>{match.score2}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Standings (round robin) ── */}
        {tournament.format === 'round_robin' && standings.length > 0 && (
          <div style={{ marginBottom: 52, animation: 'sb-in 0.5s ease both' }}>
            <SectionLabel>Standings</SectionLabel>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 44px 44px 44px 44px 44px 52px', gap: 4, padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                <span>#</span>
                <span>Team</span>
                <span style={{ textAlign: 'center' }}>P</span>
                <span style={{ textAlign: 'center' }}>W</span>
                <span style={{ textAlign: 'center' }}>D</span>
                <span style={{ textAlign: 'center' }}>L</span>
                <span style={{ textAlign: 'center' }}>+/−</span>
                <span style={{ textAlign: 'center' }}>Pts</span>
              </div>
              {standings.map((row, i) => {
                const pct = maxPts > 0 ? row.pts / maxPts : 0
                const medal = i === 0 ? '#e9c176' : i === 1 ? '#94a3b8' : i === 2 ? '#b87333' : null
                return (
                  <div key={row.team.id} style={{ display: 'grid', gridTemplateColumns: '36px 1fr 44px 44px 44px 44px 44px 52px', gap: 4, padding: '13px 20px', borderBottom: i < standings.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', alignItems: 'center', background: i === 0 ? 'rgba(233,193,118,0.04)' : 'transparent', animation: `row-in 0.3s ${i * 0.05}s ease both` }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: medal ?? 'rgba(255,255,255,0.2)' }}>{i + 1}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <Logo team={row.team} size={30} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: i < 3 ? 700 : 500, color: i === 0 ? '#fff' : 'rgba(255,255,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.team.team_name}</div>
                        {/* Win bar */}
                        <div style={{ marginTop: 4, height: 2, width: 60, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct * 100}%`, background: medal ?? 'rgba(255,255,255,0.25)', borderRadius: 2, transition: 'width 0.6s ease' }} />
                        </div>
                      </div>
                    </div>
                    <span style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.35)' }}>{row.played}</span>
                    <span style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: row.wins > 0 ? '#4ade80' : 'rgba(255,255,255,0.2)' }}>{row.wins}</span>
                    <span style={{ textAlign: 'center', fontSize: 14, color: row.draws > 0 ? '#f59e0b' : 'rgba(255,255,255,0.2)' }}>{row.draws}</span>
                    <span style={{ textAlign: 'center', fontSize: 14, color: row.losses > 0 ? '#f87171' : 'rgba(255,255,255,0.2)' }}>{row.losses}</span>
                    <span style={{ textAlign: 'center', fontSize: 13, color: (row.pf - row.pa) >= 0 ? 'rgba(255,255,255,0.45)' : '#f87171' }}>
                      {row.pf - row.pa > 0 ? '+' : ''}{row.pf - row.pa}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 16, fontWeight: 900, color: medal ?? '#fff', background: medal ? `${medal}18` : 'rgba(255,255,255,0.06)', border: `1px solid ${medal ? `${medal}35` : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, padding: '3px 10px', minWidth: 36, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{row.pts}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 16, paddingLeft: 4 }}>
              {[['#4ade80','W = win (3 pts)'], ['#f59e0b','D = draw (1 pt)'], ['#f87171','L = loss (0 pts)']].map(([c, l]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: c, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>{l}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Bracket (single elimination) ── */}
        {tournament.format === 'single_elimination' && matches.length > 0 && (
          <div style={{ marginBottom: 52, animation: 'sb-in 0.5s ease both' }}>
            <SectionLabel>Bracket</SectionLabel>
            <div style={{ overflowX: 'auto', paddingBottom: 12 }}>
              <div style={{ display: 'flex', gap: 10, minWidth: rounds.length * 210 }}>
                {rounds.map(round => (
                  <div key={round} style={{ flex: 1, minWidth: 195 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12, textAlign: 'center', color: round === maxRound ? '#e9c176' : 'rgba(255,255,255,0.25)' }}>
                      {round === maxRound ? 'Final' : round === maxRound - 1 && rounds.length > 2 ? 'Semi-finals' : `Round ${round}`}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {matches.filter(m => m.round === round).map(match => {
                        const t1 = match.team1_id ? teamMap[match.team1_id] : null
                        const t2 = match.team2_id ? teamMap[match.team2_id] : null
                        const isLive = match.status === 'live'
                        const isDone = match.status === 'completed'
                        const t1w = match.winner_id === match.team1_id
                        const t2w = match.winner_id === match.team2_id
                        return (
                          <div key={match.id} style={{ background: isLive ? 'rgba(249,115,22,0.06)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isLive ? 'rgba(249,115,22,0.3)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 13, overflow: 'hidden' }}>
                            <div style={{ padding: '4px 11px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 5 }}>
                              {isLive && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#f97316', flexShrink: 0 }} />}
                              <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: isLive ? '#f97316' : isDone ? 'rgba(74,222,128,0.5)' : 'rgba(255,255,255,0.18)' }}>
                                {isLive ? 'Live' : isDone ? 'Final' : 'Upcoming'}
                              </span>
                            </div>
                            {[{ team: t1, score: match.score1, wins: t1w, loses: t2w && isDone }, { team: t2, score: match.score2, wins: t2w, loses: t1w && isDone }].map((row, ri) => (
                              <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', background: row.wins ? 'rgba(74,222,128,0.05)' : 'transparent', borderBottom: ri === 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                <Logo team={row.team} size={22} />
                                <span style={{ flex: 1, fontSize: 12.5, fontWeight: row.wins ? 700 : 400, color: row.loses ? 'rgba(255,255,255,0.22)' : row.wins ? '#fff' : 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {row.team?.team_name ?? (!((ri === 0 ? t2 : t1)) ? 'Bye' : 'TBD')}
                                </span>
                                {row.wins && (
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                                )}
                                <span style={{ fontSize: 18, fontWeight: 900, minWidth: 24, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: row.wins ? '#4ade80' : row.loses ? 'rgba(255,255,255,0.15)' : isLive ? '#f97316' : 'rgba(255,255,255,0.3)' }}>
                                  {isDone || isLive ? (ri === 0 ? match.score1 : match.score2) : '—'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {completedMatches.length > 0 && (
          <div style={{ marginBottom: 52, animation: 'sb-in 0.55s ease both' }}>
            <SectionLabel>Results</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[...completedMatches].reverse().slice(0, 12).map((match, i) => {
                const t1 = match.team1_id ? teamMap[match.team1_id] : null
                const t2 = match.team2_id ? teamMap[match.team2_id] : null
                const t1w = match.winner_id === match.team1_id
                const t2w = match.winner_id === match.team2_id
                return (
                  <div key={match.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '11px 18px', animation: `row-in 0.3s ${i * 0.03}s ease both` }}>
                    {/* Team 1 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Logo team={t1} size={26} />
                      <span style={{ fontSize: 13.5, fontWeight: t1w ? 700 : 400, color: t1w ? '#fff' : 'rgba(255,255,255,0.32)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t1?.team_name ?? 'TBD'}
                      </span>
                      {t1w && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    {/* Score */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span style={{ fontSize: 22, fontWeight: 900, minWidth: 28, textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: t1w ? '#fff' : 'rgba(255,255,255,0.25)' }}>{match.score1}</span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.18)', fontWeight: 600 }}>—</span>
                      <span style={{ fontSize: 22, fontWeight: 900, minWidth: 28, textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: t2w ? '#fff' : 'rgba(255,255,255,0.25)' }}>{match.score2}</span>
                    </div>
                    {/* Team 2 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
                      {t2w && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>}
                      <span style={{ fontSize: 13.5, fontWeight: t2w ? 700 : 400, color: t2w ? '#fff' : 'rgba(255,255,255,0.32)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t2?.team_name ?? 'TBD'}
                      </span>
                      <Logo team={t2} size={26} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Prizes ── */}
        {tournament.prizes && tournament.prizes.length > 0 && (
          <div style={{ marginBottom: 40, animation: 'sb-in 0.6s ease both' }}>
            <SectionLabel>Prizes</SectionLabel>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {tournament.prizes.map((prize, i) => {
                const colors = ['#e9c176', '#94a3b8', '#b87333']
                const c = colors[i] ?? 'rgba(255,255,255,0.3)'
                return (
                  <div key={i} style={{ background: `${c}0d`, border: `1px solid ${c}28`, borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, minWidth: 180 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: `${c}18`, border: `1px solid ${c}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"><path d="M6 9H4.5a2.5 2.5 0 0 0 0 5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 1 0 5H18"/><path d="M4 22h16"/><path d="M8 22V11.3"/><path d="M16 22V11.3"/><rect x="6" y="2" width="12" height="9" rx="1"/></svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: c, marginBottom: 3, letterSpacing: '0.04em' }}>{prize.place}</div>
                      <div style={{ fontSize: 14, color: '#fff', fontWeight: 600 }}>{prize.description}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        </div>{/* end blur wrapper */}

      </div>

      {/* Footer */}
      <div style={{ position: 'relative', zIndex: 1, borderTop: '1px solid rgba(255,255,255,0.06)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.15)', letterSpacing: '0.06em' }}>Powered by</span>
        <span style={{ fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.14em' }}>CLUBSYNQ</span>
      </div>
    </div>
  )
}
