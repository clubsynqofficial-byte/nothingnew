import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

interface Tournament {
  id: string; name: string; sport: string; status: string
  format: 'single_elimination' | 'round_robin'
  logo_url: string | null; location: string | null
  prizes: Array<{ place: string; description: string }> | null
  club: { name: string } | null
}

interface Team {
  id: string; team_name: string; logo_url: string | null
}

interface Match {
  id: string; tournament_id: string
  team1_id: string | null; team2_id: string | null
  score1: number; score2: number
  winner_id: string | null
  round: number; match_number: number
  status: 'scheduled' | 'live' | 'completed'
}

const SPORT_EMOJIS: Record<string, string> = {
  Basketball: '🏀', Football: '⚽', Volleyball: '🏐', Tennis: '🎾',
  Badminton: '🏸', Cricket: '🏏', Swimming: '🏊', Athletics: '🏃',
  Chess: '♟️', Gaming: '🎮', 'Table Tennis': '🏓', Rugby: '🏉',
  Baseball: '⚾', Hockey: '🏑',
}

function TeamLogo({ team, size }: { team: Team | null | undefined; size: number }) {
  const initials = (team?.team_name ?? '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.22, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.32, fontWeight: 900, color: 'rgba(255,255,255,0.6)', overflow: 'hidden', flexShrink: 0 }}>
      {team?.logo_url ? <img src={team.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
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
  const [lastUpdated, setLastUpdated] = useState(new Date())

  const fetchData = useCallback(async () => {
    if (!tournamentId) return
    const [tRes, teamsRes, matchesRes] = await Promise.all([
      supabase.from('tournaments').select('id,name,sport,status,format,logo_url,location,prizes,club:clubs(name)').eq('id', tournamentId).single(),
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

  // Realtime score updates
  useEffect(() => {
    if (!tournamentId) return
    const ch = supabase.channel(`scoreboard-${tournamentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_matches', filter: `tournament_id=eq.${tournamentId}` },
        payload => {
          if (payload.eventType === 'INSERT') setMatches(prev => [...prev, payload.new as Match].sort((a, b) => a.round - b.round || a.match_number - b.match_number))
          if (payload.eventType === 'UPDATE') { setMatches(prev => prev.map(m => m.id === (payload.new as Match).id ? payload.new as Match : m)); setLastUpdated(new Date()) }
          if (payload.eventType === 'DELETE') setMatches(prev => prev.filter(m => m.id !== (payload.old as Match).id))
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [tournamentId])

  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const liveMatches = matches.filter(m => m.status === 'live')
  const completedMatches = matches.filter(m => m.status === 'completed')
  const rounds = [...new Set(matches.map(m => m.round))].sort((a, b) => a - b)
  const maxRound = Math.max(...rounds, 0)

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#060304', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>🏆</div>
        <div style={{ width: 28, height: 28, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#f97316', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  )

  if (!tournament) return (
    <div style={{ minHeight: '100vh', background: '#060304', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
      Tournament not found. <Link to="/tournaments" style={{ color: '#f97316', marginLeft: 8 }}>Go back</Link>
    </div>
  )

  const isLiveTournament = liveMatches.length > 0 || tournament.status === 'ongoing'

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0d0507 0%, #080305 100%)', color: '#fff', fontFamily: 'inherit' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes sb-pulse { 0%,100%{opacity:1;box-shadow:0 0 12px rgba(249,115,22,0.8)} 50%{opacity:.5;box-shadow:0 0 4px rgba(249,115,22,0.3)} }
        @keyframes sb-glow { 0%,100%{box-shadow:0 0 40px rgba(249,115,22,0.12)} 50%{box-shadow:0 0 80px rgba(249,115,22,0.25)} }
        @keyframes sb-in { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes score-tick { 0%{transform:scale(1.25);color:#fff} 100%{transform:scale(1)} }
      `}</style>

      {/* ── Top bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(10px)', position: 'sticky', top: 0, zIndex: 10, background: 'rgba(6,3,4,0.9)' }}>
        <button onClick={() => navigate(`/tournaments/${tournamentId}`)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', padding: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Back to Tournament
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isLiveTournament && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 999, padding: '5px 12px' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#f97316', animation: 'sb-pulse 1.4s ease-in-out infinite' }} />
              <span style={{ fontSize: 11.5, fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Live</span>
            </div>
          )}
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>Updated {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>

      {/* ── Tournament header ── */}
      <div style={{ textAlign: 'center', padding: '40px 24px 32px', animation: 'sb-in 0.4s ease both' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 80, height: 80, borderRadius: 20, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', fontSize: 40, marginBottom: 16, overflow: 'hidden' }}>
          {tournament.logo_url
            ? <img src={tournament.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : (SPORT_EMOJIS[tournament.sport] ?? '🏆')}
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 8px', background: 'linear-gradient(135deg,#fff 60%,rgba(255,255,255,0.5))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          {tournament.name}
        </h1>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>
          {tournament.sport}
          {tournament.club && <> · {tournament.club.name}</>}
          {tournament.location && <> · {tournament.location}</>}
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 16px 60px' }}>

        {/* ── No matches yet ── */}
        {matches.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.3)', fontSize: 15 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
            The bracket hasn't been set up yet. Check back soon.
          </div>
        )}

        {/* ── LIVE NOW ── */}
        {liveMatches.length > 0 && (
          <div style={{ marginBottom: 48, animation: 'sb-in 0.5s ease both' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f97316', animation: 'sb-pulse 1.3s ease-in-out infinite', flexShrink: 0 }} />
              <span style={{ fontSize: 15, fontWeight: 900, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Live Now</span>
              <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, rgba(249,115,22,0.4), transparent)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {liveMatches.map(match => {
                const t1 = match.team1_id ? teamMap[match.team1_id] : null
                const t2 = match.team2_id ? teamMap[match.team2_id] : null
                return (
                  <div key={match.id} style={{ background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.35)', borderRadius: 20, overflow: 'hidden', animation: 'sb-glow 2.5s ease-in-out infinite' }}>
                    {/* Card header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', background: 'rgba(249,115,22,0.12)', borderBottom: '1px solid rgba(249,115,22,0.2)' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316', animation: 'sb-pulse 1.3s ease-in-out infinite' }} />
                      <span style={{ fontSize: 11, fontWeight: 900, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Live</span>
                      <span style={{ fontSize: 11, color: 'rgba(249,115,22,0.55)', marginLeft: 4 }}>
                        {match.round === maxRound ? 'Final' : match.round === maxRound - 1 && rounds.length > 2 ? 'Semi-final' : `Round ${match.round}`} · Match {match.match_number}
                      </span>
                    </div>
                    {/* Score */}
                    <div style={{ padding: '24px 18px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      {/* Team 1 */}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                        <TeamLogo team={t1} size={56} />
                        <span style={{ fontSize: 14, fontWeight: 700, textAlign: 'center', lineHeight: 1.3 }}>{t1?.team_name ?? 'TBD'}</span>
                        <span style={{ fontSize: 64, fontWeight: 900, lineHeight: 1, color: '#fff', textShadow: '0 0 30px rgba(249,115,22,0.5)' }}>{match.score1}</span>
                      </div>
                      <div style={{ flexShrink: 0, fontSize: 18, fontWeight: 700, color: 'rgba(249,115,22,0.4)', letterSpacing: '0.05em' }}>vs</div>
                      {/* Team 2 */}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                        <TeamLogo team={t2} size={56} />
                        <span style={{ fontSize: 14, fontWeight: 700, textAlign: 'center', lineHeight: 1.3 }}>{t2?.team_name ?? 'TBD'}</span>
                        <span style={{ fontSize: 64, fontWeight: 900, lineHeight: 1, color: '#fff', textShadow: '0 0 30px rgba(249,115,22,0.5)' }}>{match.score2}</span>
                      </div>
                    </div>
                    {/* Watch Live button */}
                    <div style={{ padding: '0 18px 18px' }}>
                      <button onClick={() => navigate(`/matches/${match.id}`)} style={{ width: '100%', padding: '11px', background: 'rgba(249,115,22,0.18)', border: '1px solid rgba(249,115,22,0.45)', borderRadius: 12, color: '#f97316', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(249,115,22,0.28)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(249,115,22,0.18)' }}
                      >
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#f97316', animation: 'sb-pulse 1.3s ease-in-out infinite' }} />
                        Watch Match Center
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Bracket (single elimination) ── */}
        {tournament.format === 'single_elimination' && matches.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Bracket</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
            </div>
            <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
              <div style={{ display: 'flex', gap: 12, minWidth: rounds.length * 220 }}>
                {rounds.map(round => (
                  <div key={round} style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12, textAlign: 'center', color: round === maxRound ? '#e9c176' : 'rgba(255,255,255,0.3)' }}>
                      {round === maxRound ? '🏆 Final' : round === maxRound - 1 && rounds.length > 2 ? 'Semis' : `Round ${round}`}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {matches.filter(m => m.round === round).map(match => {
                        const t1 = match.team1_id ? teamMap[match.team1_id] : null
                        const t2 = match.team2_id ? teamMap[match.team2_id] : null
                        const isLive = match.status === 'live'
                        const isDone = match.status === 'completed'
                        const t1Wins = match.winner_id === match.team1_id
                        const t2Wins = match.winner_id === match.team2_id
                        return (
                          <div key={match.id} style={{ background: isLive ? 'rgba(249,115,22,0.07)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isLive ? 'rgba(249,115,22,0.35)' : 'rgba(255,255,255,0.09)'}`, borderRadius: 12, overflow: 'hidden' }}>
                            {/* Status pill */}
                            <div style={{ padding: '4px 12px', background: isLive ? 'rgba(249,115,22,0.1)' : isDone ? 'rgba(255,255,255,0.03)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 5 }}>
                              {isLive && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#f97316', animation: 'sb-pulse 1.4s ease-in-out infinite' }} />}
                              <span style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: isLive ? '#f97316' : isDone ? 'rgba(74,222,128,0.6)' : 'rgba(255,255,255,0.2)' }}>
                                {isLive ? 'Live' : isDone ? 'Final' : 'Upcoming'}
                              </span>
                            </div>
                            {/* Team rows */}
                            {[{ team: t1, score: match.score1, wins: t1Wins, loses: t2Wins && isDone }, { team: t2, score: match.score2, wins: t2Wins, loses: t1Wins && isDone }].map((row, ri) => (
                              <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: row.wins ? 'rgba(74,222,128,0.06)' : 'transparent', borderBottom: ri === 0 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                <TeamLogo team={row.team} size={24} />
                                <span style={{ flex: 1, fontSize: 12.5, fontWeight: row.wins ? 800 : 500, color: row.loses ? 'rgba(255,255,255,0.25)' : row.wins ? '#fff' : 'rgba(255,255,255,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {row.team?.team_name ?? (ri === 0 ? (!t2 ? 'Bye' : 'TBD') : (!t1 ? 'Bye' : 'TBD'))}
                                </span>
                                {row.wins && <span style={{ fontSize: 11 }}>🏆</span>}
                                <span style={{ fontSize: 20, fontWeight: 900, minWidth: 26, textAlign: 'right', color: row.wins ? '#4ade80' : row.loses ? 'rgba(255,255,255,0.18)' : isLive ? '#f97316' : 'rgba(255,255,255,0.35)' }}>
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

        {/* ── Standings (round robin) ── */}
        {tournament.format === 'round_robin' && matches.length > 0 && (() => {
          const standings = teams.map(team => {
            const played = matches.filter(m => (m.team1_id === team.id || m.team2_id === team.id) && m.status === 'completed')
            const wins = played.filter(m => m.winner_id === team.id).length
            const losses = played.length - wins
            const gf = played.reduce((s, m) => s + (m.team1_id === team.id ? m.score1 : m.score2), 0)
            const ga = played.reduce((s, m) => s + (m.team1_id === team.id ? m.score2 : m.score1), 0)
            return { team, played: played.length, wins, losses, gf, ga }
          }).sort((a, b) => b.wins - a.wins || (b.gf - b.ga) - (a.gf - a.ga))
          return (
            <div style={{ marginBottom: 40 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Standings</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 48px 48px 48px 48px 48px', padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', gap: 8, alignItems: 'center' }}>
                  <span>#</span><span>Team</span><span style={{ textAlign: 'center' }}>P</span><span style={{ textAlign: 'center' }}>W</span><span style={{ textAlign: 'center' }}>L</span><span style={{ textAlign: 'center' }}>GF</span><span style={{ textAlign: 'center' }}>GA</span>
                </div>
                {standings.map((row, i) => (
                  <div key={row.team.id} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 48px 48px 48px 48px 48px', padding: '12px 16px', borderBottom: i < standings.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', gap: 8, alignItems: 'center', background: i === 0 ? 'rgba(233,193,118,0.05)' : 'transparent' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: i === 0 ? '#e9c176' : 'rgba(255,255,255,0.3)' }}>{i + 1}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <TeamLogo team={row.team} size={28} />
                      <span style={{ fontSize: 14, fontWeight: i === 0 ? 800 : 500 }}>{row.team.team_name}</span>
                    </div>
                    <span style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>{row.played}</span>
                    <span style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#4ade80' }}>{row.wins}</span>
                    <span style={{ textAlign: 'center', fontSize: 14, color: '#f87171' }}>{row.losses}</span>
                    <span style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>{row.gf}</span>
                    <span style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>{row.ga}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* ── Recent Results ── */}
        {completedMatches.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Results</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...completedMatches].reverse().slice(0, 10).map(match => {
                const t1 = match.team1_id ? teamMap[match.team1_id] : null
                const t2 = match.team2_id ? teamMap[match.team2_id] : null
                const t1Wins = match.winner_id === match.team1_id
                const t2Wins = match.winner_id === match.team2_id
                return (
                  <div key={match.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '10px 16px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(74,222,128,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', minWidth: 38 }}>Final</span>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <TeamLogo team={t1} size={22} />
                      <span style={{ fontSize: 13, fontWeight: t1Wins ? 800 : 400, color: t1Wins ? '#fff' : 'rgba(255,255,255,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t1?.team_name ?? 'TBD'}</span>
                      {t1Wins && <span style={{ fontSize: 11, marginLeft: 2 }}>🏆</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 22, fontWeight: 900, color: t1Wins ? '#4ade80' : 'rgba(255,255,255,0.3)', minWidth: 24, textAlign: 'center' }}>{match.score1}</span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', fontWeight: 700 }}>—</span>
                      <span style={{ fontSize: 22, fontWeight: 900, color: t2Wins ? '#4ade80' : 'rgba(255,255,255,0.3)', minWidth: 24, textAlign: 'center' }}>{match.score2}</span>
                    </div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', minWidth: 0 }}>
                      {t2Wins && <span style={{ fontSize: 11 }}>🏆</span>}
                      <span style={{ fontSize: 13, fontWeight: t2Wins ? 800 : 400, color: t2Wins ? '#fff' : 'rgba(255,255,255,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t2?.team_name ?? 'TBD'}</span>
                      <TeamLogo team={t2} size={22} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Prizes ── */}
        {tournament.prizes && tournament.prizes.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Prizes</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {tournament.prizes.map((prize, i) => (
                <div key={i} style={{ background: 'rgba(233,193,118,0.07)', border: '1px solid rgba(233,193,118,0.18)', borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 24 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅'}</span>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#e9c176', marginBottom: 2 }}>{prize.place}</div>
                    <div style={{ fontSize: 14, color: '#fff' }}>{prize.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>Powered by</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em' }}>CLUBSYNQ</span>
      </div>
    </div>
  )
}
