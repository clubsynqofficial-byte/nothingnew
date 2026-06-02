import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

interface Match {
  id: string; tournament_id: string; team1_id: string | null; team2_id: string | null
  score1: number; score2: number; winner_id: string | null
  game_status: 'not_started' | 'in_progress' | 'halftime' | 'final'
  current_period: number; game_clock: number
  fouls1: number; fouls2: number
  timeouts1: number; timeouts2: number
  live_stats: Record<string, PlayerStat[]> | null
  match_wrapped: MatchWrapped | null
  status: 'scheduled' | 'live' | 'completed'
  round: number; match_number: number
}

interface PlayerStat {
  name: string; points: number; fouls: number; assists: number; rebounds: number
}

interface MatchWrapped {
  mvp: { name: string; team: string; points: number } | null
  final_score: { team1: string; score1: number; team2: string; score2: number }
  box_score: { team1: PlayerStat[]; team2: PlayerStat[] }
  generated_at: string
}

interface Team {
  id: string; team_name: string; logo_url: string | null
  players: Array<{ name: string; role: string }> | null
}

interface MatchEvent {
  id: string; period: number; clock_time: number; event_type: string
  team_id: string | null; player_name: string | null; description: string
  created_at: string
}

interface Reaction {
  id: string; team_id: string; user_id: string | null
}

const MAX_PERIODS = 4
const PERIOD_LENGTH = 12 * 60 // 12 minutes in seconds

function formatTime(s: number) {
  const m = Math.floor(s / 60); return `${m}:${(s % 60).toString().padStart(2, '0')}`
}
function countdownTime(elapsed: number) {
  const rem = Math.max(0, PERIOD_LENGTH - elapsed)
  return formatTime(rem)
}

export default function MatchCenterPage() {
  const { matchId } = useParams<{ matchId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [match, setMatch] = useState<Match | null>(null)
  const [teams, setTeams] = useState<Record<string, Team>>({})
  const [events, setEvents] = useState<MatchEvent[]>([])
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const eventsFeedRef = useRef<HTMLDivElement>(null)

  // Admin clock
  const [clockRunning, setClockRunning] = useState(false)
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const matchRef = useRef<Match | null>(null)

  // Admin commentary
  const [commentary, setCommentary] = useState('')
  const [commentaryTeam] = useState('')
  const [commentaryPlayer, setCommentaryPlayer] = useState('')
  const [addingEvent, setAddingEvent] = useState(false)

  // Admin player stats init
  const [statsInitialized, setStatsInitialized] = useState(false)

  // Post-game
  const [savingWrapped, setSavingWrapped] = useState(false)
  const [pushingToFeed, setPushingToFeed] = useState(false)

  matchRef.current = match

  const checkAdmin = useCallback(async (m: Match) => {
    if (!user) return
    const { data: tourny } = await supabase
      .from('tournaments').select('created_by, club_id').eq('id', m.tournament_id).single()
    if (!tourny) return
    if (tourny.created_by === user.id) { setIsAdmin(true); return }
    const { data: mem } = await supabase
      .from('club_memberships').select('role')
      .eq('club_id', tourny.club_id).eq('user_id', user.id).single()
    setIsAdmin(mem?.role === 'president' || mem?.role === 'officer')
  }, [user])

  const fetchMatch = useCallback(async () => {
    if (!matchId) return
    setLoading(true)
    const { data: matchData } = await supabase.from('tournament_matches').select('*').eq('id', matchId).single()
    if (matchData) {
      setMatch(matchData)
      const teamIds = [matchData.team1_id, matchData.team2_id].filter(Boolean)
      const { data: teamsData } = await supabase.from('tournament_teams').select('id, team_name, logo_url, players').in('id', teamIds)
      const tm: Record<string, Team> = {}
      for (const t of teamsData ?? []) tm[t.id] = t
      setTeams(tm)
      const { data: eventsData } = await supabase.from('match_events').select('*').eq('match_id', matchId).order('created_at')
      setEvents(eventsData ?? [])
      const { data: reactionsData } = await supabase.from('match_reactions').select('*').eq('match_id', matchId)
      setReactions(reactionsData ?? [])
      await checkAdmin(matchData)
    }
    setLoading(false)
  }, [matchId, checkAdmin])

  useEffect(() => { fetchMatch() }, [fetchMatch])

  // Realtime subscriptions
  useEffect(() => {
    if (!matchId) return
    const ch = supabase.channel(`match-${matchId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_matches', filter: `id=eq.${matchId}` },
        payload => setMatch(payload.new as Match))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [matchId])

  useEffect(() => {
    if (!matchId) return
    const ch = supabase.channel(`events-${matchId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'match_events', filter: `match_id=eq.${matchId}` },
        payload => {
          setEvents(prev => [...prev, payload.new as MatchEvent])
          setTimeout(() => eventsFeedRef.current?.scrollTo({ top: eventsFeedRef.current.scrollHeight, behavior: 'smooth' }), 100)
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [matchId])

  useEffect(() => {
    if (!matchId) return
    const ch = supabase.channel(`reactions-${matchId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'match_reactions', filter: `match_id=eq.${matchId}` },
        payload => setReactions(prev => [...prev, payload.new as Reaction]))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [matchId])

  // Clock cleanup
  useEffect(() => () => { if (clockRef.current) clearInterval(clockRef.current) }, [])

  // ── Clock controls ──────────────────────────────────────────────────────────
  function startClock() {
    if (clockRunning) return
    setClockRunning(true)
    clockRef.current = setInterval(async () => {
      const m = matchRef.current
      if (!m || m.game_status === 'final' || m.game_status === 'halftime') return
      const newClock = m.game_clock + 1
      if (newClock >= PERIOD_LENGTH) {
        clearInterval(clockRef.current!)
        setClockRunning(false)
        const gs = m.current_period === 2 ? 'halftime' : m.current_period >= MAX_PERIODS ? 'final' : 'in_progress'
        await supabase.from('tournament_matches').update({ game_clock: PERIOD_LENGTH, game_status: gs }).eq('id', m.id)
      } else {
        setMatch(prev => prev ? { ...prev, game_clock: newClock } : prev)
        if (newClock % 15 === 0) {
          await supabase.from('tournament_matches').update({ game_clock: newClock }).eq('id', m.id)
        }
      }
    }, 1000)
  }

  async function pauseClock() {
    if (clockRef.current) clearInterval(clockRef.current)
    setClockRunning(false)
    if (matchRef.current) {
      await supabase.from('tournament_matches').update({ game_clock: matchRef.current.game_clock }).eq('id', matchRef.current.id)
    }
  }

  async function nextPeriod() {
    const m = matchRef.current
    if (!m) return
    if (clockRef.current) clearInterval(clockRef.current)
    setClockRunning(false)
    const newPeriod = m.current_period + 1
    const gs = newPeriod > MAX_PERIODS ? 'final' : 'in_progress'
    await supabase.from('tournament_matches').update({
      current_period: Math.min(newPeriod, MAX_PERIODS), game_clock: 0, game_status: gs,
      status: gs === 'final' ? 'completed' : 'live',
    }).eq('id', m.id)
  }

  async function startGame() {
    if (!match) return
    await supabase.from('tournament_matches').update({ game_status: 'in_progress', status: 'live', current_period: 1, game_clock: 0 }).eq('id', match.id)
  }

  // ── Score controls ──────────────────────────────────────────────────────────
  async function addPoints(team: 1 | 2, pts: number) {
    const m = matchRef.current
    if (!m) return
    const key = team === 1 ? 'score1' : 'score2'
    const newVal = Math.max(0, (team === 1 ? m.score1 : m.score2) + pts)
    await supabase.from('tournament_matches').update({ [key]: newVal }).eq('id', m.id)
    setMatch(prev => prev ? { ...prev, [key]: newVal } : prev)
  }

  async function addFoul(team: 1 | 2) {
    const m = matchRef.current
    if (!m) return
    const key = team === 1 ? 'fouls1' : 'fouls2'
    const newVal = (team === 1 ? m.fouls1 : m.fouls2) + 1
    await supabase.from('tournament_matches').update({ [key]: newVal }).eq('id', m.id)
    setMatch(prev => prev ? { ...prev, [key]: newVal } : prev)
  }

  async function useTimeout(team: 1 | 2) {
    const m = matchRef.current
    if (!m) return
    const key = team === 1 ? 'timeouts1' : 'timeouts2'
    const newVal = Math.max(0, (team === 1 ? m.timeouts1 : m.timeouts2) - 1)
    await supabase.from('tournament_matches').update({ [key]: newVal }).eq('id', m.id)
    setMatch(prev => prev ? { ...prev, [key]: newVal } : prev)
    // Log timeout as event
    await logEvent(`Timeout called by ${team === 1 ? teams[m.team1_id ?? '']?.team_name ?? 'Team 1' : teams[m.team2_id ?? '']?.team_name ?? 'Team 2'}`, 'timeout', team === 1 ? m.team1_id : m.team2_id, null)
  }

  // ── Commentary / events ─────────────────────────────────────────────────────
  async function logEvent(description: string, eventType: string, teamId: string | null, playerName: string | null) {
    const m = matchRef.current
    if (!m) return
    await supabase.from('match_events').insert({
      match_id: m.id, period: m.current_period, clock_time: m.game_clock,
      event_type: eventType, team_id: teamId, player_name: playerName,
      description, created_by: user?.id ?? null,
    })
  }

  async function submitCommentary() {
    if (!commentary.trim() || !match) return
    setAddingEvent(true)
    await logEvent(commentary.trim(), 'commentary', commentaryTeam || null, commentaryPlayer || null)
    setCommentary('')
    setCommentaryPlayer('')
    setAddingEvent(false)
  }

  // ── Player stats ────────────────────────────────────────────────────────────
  function buildInitialStats(m: Match): Record<string, PlayerStat[]> {
    const stats: Record<string, PlayerStat[]> = {}
    const existing = m.live_stats ?? {}
    for (const [teamKey, teamId] of [['team1', m.team1_id], ['team2', m.team2_id]] as [string, string | null][]) {
      if (!teamId) continue
      const team = teams[teamId]
      if (existing[teamKey] && existing[teamKey].length > 0) {
        stats[teamKey] = existing[teamKey]
      } else if (team?.players && team.players.length > 0) {
        stats[teamKey] = team.players.map(p => ({ name: p.name, points: 0, fouls: 0, assists: 0, rebounds: 0 }))
      } else {
        stats[teamKey] = []
      }
    }
    return stats
  }

  async function updatePlayerStat(teamKey: string, idx: number, stat: keyof PlayerStat, delta: number) {
    const m = matchRef.current
    if (!m) return
    const currentStats = m.live_stats ?? buildInitialStats(m)
    const teamStats = [...(currentStats[teamKey] ?? [])]
    if (!teamStats[idx]) return
    const updated = { ...teamStats[idx], [stat]: Math.max(0, (teamStats[idx][stat] as number) + delta) }
    teamStats[idx] = updated
    const newStats = { ...currentStats, [teamKey]: teamStats }

    setMatch(prev => prev ? { ...prev, live_stats: newStats } : prev)
    await supabase.from('tournament_matches').update({ live_stats: newStats }).eq('id', m.id)

    if (stat === 'points' && delta > 0) {
      const teamId = teamKey === 'team1' ? m.team1_id : m.team2_id
      await logEvent(`${updated.name} +${delta}pts`, 'score', teamId, updated.name)
    } else if (stat === 'fouls' && delta > 0) {
      const teamId = teamKey === 'team1' ? m.team1_id : m.team2_id
      await logEvent(`Foul on ${updated.name}`, 'foul', teamId, updated.name)
    }
  }

  async function initPlayerStats() {
    const m = matchRef.current
    if (!m) return
    const stats = buildInitialStats(m)
    await supabase.from('tournament_matches').update({ live_stats: stats }).eq('id', m.id)
    setMatch(prev => prev ? { ...prev, live_stats: stats } : prev)
    setStatsInitialized(true)
  }

  // ── Match Wrapped / End Game ────────────────────────────────────────────────
  async function finalizeMatch() {
    const m = matchRef.current
    if (!m) return
    if (clockRef.current) clearInterval(clockRef.current)
    setClockRunning(false)
    setSavingWrapped(true)

    const stats = m.live_stats ?? {}
    const allPlayers: Array<PlayerStat & { teamName: string }> = []
    const t1 = teams[m.team1_id ?? '']
    const t2 = teams[m.team2_id ?? '']
    for (const p of stats.team1 ?? []) allPlayers.push({ ...p, teamName: t1?.team_name ?? 'Team 1' })
    for (const p of stats.team2 ?? []) allPlayers.push({ ...p, teamName: t2?.team_name ?? 'Team 2' })

    const mvpPlayer = allPlayers.reduce<(PlayerStat & { teamName: string }) | null>((best, p) =>
      !best || p.points > best.points ? p : best, null)

    const wrapped: MatchWrapped = {
      mvp: mvpPlayer ? { name: mvpPlayer.name, team: mvpPlayer.teamName, points: mvpPlayer.points } : null,
      final_score: {
        team1: t1?.team_name ?? 'Team 1', score1: m.score1,
        team2: t2?.team_name ?? 'Team 2', score2: m.score2,
      },
      box_score: { team1: stats.team1 ?? [], team2: stats.team2 ?? [] },
      generated_at: new Date().toISOString(),
    }

    const winner = m.score1 > m.score2 ? m.team1_id : m.score2 > m.score1 ? m.team2_id : null
    await supabase.from('tournament_matches').update({
      game_status: 'final', status: 'completed',
      winner_id: winner, match_wrapped: wrapped,
    }).eq('id', m.id)

    setSavingWrapped(false)
  }

  async function pushWrappedToFeed() {
    const m = matchRef.current
    if (!m?.match_wrapped || !user) return
    setPushingToFeed(true)
    const { data: tourny } = await supabase.from('tournaments').select('name').eq('id', m.tournament_id).single()
    const w = m.match_wrapped
    const t1Name = w.final_score.team1; const t2Name = w.final_score.team2
    const content = `🏀 Match Wrapped — ${tourny?.name ?? 'Tournament'}\n\n${t1Name} ${w.final_score.score1} · ${w.final_score.score2} ${t2Name}${w.mvp ? `\n🏅 MVP: ${w.mvp.name} (${w.mvp.team}) — ${w.mvp.points} pts` : ''}`
    await supabase.from('posts').insert({ user_id: user.id, content })
    setPushingToFeed(false)
  }

  async function addCheer(teamId: string) {
    if (!matchId) return
    await supabase.from('match_reactions').insert({ match_id: matchId, team_id: teamId, user_id: user?.id, reaction_type: 'cheer' })
  }

  if (loading) return (
    <div className="page-content" style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
      <div style={{ width: 28, height: 28, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (!match) return (
    <div className="page-content" style={{ textAlign: 'center', padding: '80px 0' }}>
      <p style={{ color: 'var(--text-muted)' }}>Match not found</p>
    </div>
  )

  const t1 = teams[match.team1_id ?? '']
  const t2 = teams[match.team2_id ?? '']
  const t1Cheers = reactions.filter(r => r.team_id === match.team1_id).length
  const t2Cheers = reactions.filter(r => r.team_id === match.team2_id).length
  const maxCheers = Math.max(t1Cheers, t2Cheers, 1)
  const liveStats = match.live_stats ?? (statsInitialized ? buildInitialStats(match) : null)
  const periodLabel = match.game_status === 'halftime' ? 'Halftime' : match.game_status === 'final' ? 'Final' : match.game_status === 'not_started' ? 'Not Started' : `Q${match.current_period}`
  const isFinal = match.game_status === 'final'

  const allPlayers4Selector = [
    ...(liveStats?.team1 ?? []).map((p, i) => ({ key: `team1-${i}`, name: p.name, teamId: match.team1_id ?? '' })),
    ...(liveStats?.team2 ?? []).map((p, i) => ({ key: `team2-${i}`, name: p.name, teamId: match.team2_id ?? '' })),
  ]

  return (
    <div className="page-content" style={{ maxWidth: 1100 }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes live-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.6;transform:scale(.95)}}
        @keyframes mc-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes wrapped-in{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}
        .mc-score-btn{transition:all 0.1s;cursor:pointer;border:none;font-family:inherit;}
        .mc-score-btn:hover{filter:brightness(1.2);}
        .mc-score-btn:active{transform:scale(0.93);}
        .stat-btn{cursor:pointer;border:none;font-family:inherit;transition:all 0.1s;}
        .stat-btn:hover{filter:brightness(1.2);}
        .stat-btn:active{transform:scale(0.9);}
      `}</style>

      {/* Back + match title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: 13, fontFamily: 'inherit' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
        {match.game_status === 'in_progress' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 8, padding: '5px 11px' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#f97316', animation: 'live-pulse 1.4s ease-in-out infinite' }} />
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Live</span>
          </div>
        )}
        {isAdmin && (
          <div style={{ marginLeft: 'auto', background: 'rgba(138,21,56,0.12)', border: '1px solid rgba(138,21,56,0.25)', borderRadius: 8, padding: '5px 11px', fontSize: 11.5, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Admin Mode
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '1fr 340px' : '1fr 320px', gap: 16 }}>

        {/* ── Left column: scoreboard + play-by-play ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Scoreboard */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${match.game_status === 'in_progress' ? 'rgba(249,115,22,0.25)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 20, padding: 24, animation: 'mc-in 0.3s ease both' }}>
            {/* Status / clock */}
            <div style={{ textAlign: 'center', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: match.game_status === 'in_progress' ? '#f97316' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>{periodLabel}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: match.game_status === 'in_progress' ? '#fff' : 'rgba(255,255,255,0.4)', fontVariantNumeric: 'tabular-nums' }}>
                {countdownTime(match.game_clock)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {match.game_status === 'not_started' ? 'Game not started' : `Quarter ${match.current_period} of ${MAX_PERIODS}`}
              </div>
            </div>

            {/* Scores */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              {/* Team 1 */}
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(138,21,56,0.15)', border: '1px solid rgba(138,21,56,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, overflow: 'hidden', margin: '0 auto 10px' }}>
                  {t1?.logo_url ? <img src={t1.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : t1?.team_name?.[0] ?? '?'}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, lineHeight: 1.3 }}>{t1?.team_name ?? 'Team 1'}</div>
                <div style={{ fontSize: 60, fontWeight: 900, color: '#fff', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{match.score1}</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.25)' }}>VS</span>
                {isFinal && match.winner_id && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#e9c176', background: 'rgba(233,193,118,0.1)', borderRadius: 6, padding: '3px 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Final</div>
                )}
              </div>

              {/* Team 2 */}
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(138,21,56,0.15)', border: '1px solid rgba(138,21,56,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, overflow: 'hidden', margin: '0 auto 10px' }}>
                  {t2?.logo_url ? <img src={t2.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : t2?.team_name?.[0] ?? '?'}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, lineHeight: 1.3 }}>{t2?.team_name ?? 'Team 2'}</div>
                <div style={{ fontSize: 60, fontWeight: 900, color: '#fff', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{match.score2}</div>
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 12 }}>
              {[
                { label: 'Fouls', v1: match.fouls1, v2: match.fouls2 },
                { label: 'Timeouts', v1: match.timeouts1, v2: match.timeouts2 },
              ].map(row => (
                <div key={row.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{row.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{row.v1} <span style={{ opacity: 0.35 }}>|</span> {row.v2}</div>
                </div>
              ))}
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Quarter</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>Q{match.current_period}</div>
              </div>
            </div>
          </div>

          {/* Play-by-play feed */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: 16, animation: 'mc-in 0.3s ease 0.05s both' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Play-by-Play</div>
            <div ref={eventsFeedRef} style={{ height: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {events.length === 0
                ? <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: 13 }}>No events yet</div>
                : events.map(evt => {
                  const isScore = evt.event_type === 'score'
                  const isFoul = evt.event_type === 'foul'
                  const isTimeout = evt.event_type === 'timeout'
                  const border = isScore ? '#4ade80' : isFoul ? '#f87171' : isTimeout ? '#f59e0b' : 'rgba(255,255,255,0.1)'
                  const bg = isScore ? 'rgba(74,222,128,0.07)' : isFoul ? 'rgba(239,68,68,0.07)' : isTimeout ? 'rgba(245,158,11,0.07)' : 'rgba(255,255,255,0.02)'
                  return (
                    <div key={evt.id} style={{ padding: '7px 10px', background: bg, borderRadius: 8, fontSize: 12, borderLeft: `3px solid ${border}` }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 2 }}>Q{evt.period} · {countdownTime(evt.clock_time)}</div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{evt.description}</div>
                    </div>
                  )
                })
              }
            </div>
          </div>

          {/* Match Wrapped — shown when final */}
          {isFinal && match.match_wrapped && (
            <MatchWrappedCard wrapped={match.match_wrapped} onPushToFeed={pushWrappedToFeed} pushingToFeed={pushingToFeed} isAdmin={isAdmin} />
          )}
        </div>

        {/* ── Right column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Admin Command Console */}
          {isAdmin && (
            <div style={{ background: 'rgba(138,21,56,0.07)', border: '1px solid rgba(138,21,56,0.2)', borderRadius: 18, padding: 16, animation: 'mc-in 0.3s ease 0.04s both' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Command Center</div>

              {/* Game control row */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                {match.game_status === 'not_started' && (
                  <button className="mc-score-btn" onClick={startGame} style={{ flex: 1, padding: '10px 8px', background: 'rgba(74,222,128,0.18)', border: '1px solid rgba(74,222,128,0.4)', borderRadius: 10, color: '#4ade80', fontSize: 12, fontWeight: 700 }}>
                    ▶ Start Game
                  </button>
                )}
                {(match.game_status === 'in_progress' || match.game_status === 'halftime') && (
                  <>
                    {clockRunning
                      ? <button className="mc-score-btn" onClick={pauseClock} style={{ flex: 1, padding: '10px 8px', background: 'rgba(249,115,22,0.18)', border: '1px solid rgba(249,115,22,0.4)', borderRadius: 10, color: '#f97316', fontSize: 12, fontWeight: 700 }}>⏸ Pause Clock</button>
                      : <button className="mc-score-btn" onClick={startClock} style={{ flex: 1, padding: '10px 8px', background: 'rgba(74,222,128,0.18)', border: '1px solid rgba(74,222,128,0.4)', borderRadius: 10, color: '#4ade80', fontSize: 12, fontWeight: 700 }}>▶ Start Clock</button>
                    }
                    <button className="mc-score-btn" onClick={nextPeriod} style={{ flex: 1, padding: '10px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>
                      {match.current_period >= MAX_PERIODS ? 'End Game' : `Next Q${match.current_period + 1}`}
                    </button>
                  </>
                )}
                {!isFinal && match.game_status !== 'not_started' && (
                  <button className="mc-score-btn" onClick={finalizeMatch} disabled={savingWrapped} style={{ padding: '10px 8px', background: 'rgba(233,193,118,0.12)', border: '1px solid rgba(233,193,118,0.3)', borderRadius: 10, color: '#e9c176', fontSize: 11, fontWeight: 700, opacity: savingWrapped ? 0.6 : 1 }}>
                    {savingWrapped ? '…' : '🏁 Final'}
                  </button>
                )}
              </div>

              {/* Score controls */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Score</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {([1, 2] as const).map(team => {
                    const teamObj = team === 1 ? t1 : t2
                    const score = team === 1 ? match.score1 : match.score2
                    return (
                      <div key={team} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', flexShrink: 0, overflow: 'hidden' }}>
                          {teamObj?.logo_url ? <img src={teamObj.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : teamObj?.team_name?.[0] ?? (team === 1 ? '1' : '2')}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', minWidth: 28, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{score}</span>
                        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                          {[1, 2, 3].map(pts => (
                            <button key={pts} className="mc-score-btn" onClick={() => addPoints(team, pts)} style={{ flex: 1, padding: '7px 2px', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 7, color: '#4ade80', fontSize: 12, fontWeight: 700 }}>+{pts}</button>
                          ))}
                          <button className="mc-score-btn" onClick={() => addPoints(team, -1)} style={{ padding: '7px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>−</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Fouls & Timeouts */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                {([1, 2] as const).map(team => {
                  const teamObj = team === 1 ? t1 : t2
                  const fouls = team === 1 ? match.fouls1 : match.fouls2
                  const timeouts = team === 1 ? match.timeouts1 : match.timeouts2
                  return (
                    <div key={team} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {teamObj?.team_name ?? `T${team}`}
                      </div>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button className="mc-score-btn" onClick={() => addFoul(team)} style={{ flex: 1, padding: '6px 4px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 7, color: '#f87171', fontSize: 11, fontWeight: 700 }}>
                          Foul ({fouls})
                        </button>
                        <button className="mc-score-btn" onClick={() => useTimeout(team)} disabled={timeouts === 0} style={{ flex: 1, padding: '6px 4px', background: timeouts > 0 ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${timeouts > 0 ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 7, color: timeouts > 0 ? '#f59e0b' : 'var(--text-muted)', fontSize: 11, fontWeight: 700, opacity: timeouts === 0 ? 0.5 : 1 }}>
                          TO ({timeouts})
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Commentary entry */}
              <div style={{ marginBottom: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Commentary</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                  {allPlayers4Selector.slice(0, 4).map(p => (
                    <button key={p.key} onClick={() => setCommentaryPlayer(commentaryPlayer === p.name ? '' : p.name)} style={{ padding: '4px 9px', background: commentaryPlayer === p.name ? 'rgba(138,21,56,0.25)' : 'rgba(255,255,255,0.05)', border: `1px solid ${commentaryPlayer === p.name ? 'rgba(138,21,56,0.5)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 6, color: commentaryPlayer === p.name ? '#fff' : 'var(--text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}>
                      {p.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={commentary}
                    onChange={e => setCommentary(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submitCommentary()}
                    placeholder="Log a play…"
                    style={{ flex: 1, padding: '9px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                  />
                  <button className="mc-score-btn" onClick={submitCommentary} disabled={addingEvent || !commentary.trim()} style={{ padding: '9px 13px', background: commentary.trim() ? 'var(--accent)' : 'rgba(255,255,255,0.04)', border: 'none', borderRadius: 9, color: '#fff', fontSize: 12, fontWeight: 700, opacity: commentary.trim() ? 1 : 0.4 }}>
                    {addingEvent ? '…' : 'Log'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Player Stats Panel */}
          {isAdmin && (
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: 16, animation: 'mc-in 0.3s ease 0.06s both' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Live Stats</div>
                {!liveStats && (
                  <button onClick={initPlayerStats} style={{ padding: '5px 10px', background: 'rgba(138,21,56,0.15)', border: '1px solid rgba(138,21,56,0.3)', borderRadius: 7, color: 'var(--accent)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Init Rosters</button>
                )}
              </div>
              {liveStats ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {(['team1', 'team2'] as const).map(tk => {
                    const teamObj = tk === 'team1' ? t1 : t2
                    const players = liveStats[tk] ?? []
                    if (players.length === 0) return null
                    return (
                      <div key={tk}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{teamObj?.team_name ?? tk}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {players.map((p, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 12, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                              <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                                <span style={{ fontSize: 11, fontWeight: 800, color: '#4ade80', minWidth: 22, textAlign: 'right' }}>{p.points}p</span>
                                <button className="stat-btn" onClick={() => updatePlayerStat(tk, i, 'points', 1)} style={{ width: 22, height: 22, background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 5, color: '#4ade80', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                                <button className="stat-btn" onClick={() => updatePlayerStat(tk, i, 'points', 2)} style={{ width: 22, height: 22, background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 5, color: '#4ade80', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+2</button>
                                <button className="stat-btn" onClick={() => updatePlayerStat(tk, i, 'points', 3)} style={{ width: 22, height: 22, background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 5, color: '#4ade80', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+3</button>
                                <span style={{ fontSize: 11, fontWeight: 800, color: '#f87171', minWidth: 16, textAlign: 'right' }}>{p.fouls}f</span>
                                <button className="stat-btn" onClick={() => updatePlayerStat(tk, i, 'fouls', 1)} style={{ width: 22, height: 22, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 5, color: '#f87171', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: 12 }}>
                  Click "Init Rosters" to pull players from team registrations
                </div>
              )}
            </div>
          )}

          {/* Fan stats panel (for non-admins) */}
          {!isAdmin && liveStats && (
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Live Stats</div>
              {(['team1', 'team2'] as const).map(tk => {
                const teamObj = tk === 'team1' ? t1 : t2
                const players = liveStats[tk] ?? []
                if (players.length === 0) return null
                return (
                  <div key={tk} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>{teamObj?.team_name ?? tk}</div>
                    {players.slice(0, 5).map((p, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <span style={{ color: '#4ade80', fontWeight: 700 }}>{p.points}pts</span>
                          {p.fouls > 0 && <span style={{ color: '#f87171', fontWeight: 600 }}>{p.fouls}f</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}

          {/* Fan cheers */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: 16, animation: 'mc-in 0.3s ease 0.08s both' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Fan Support</div>
            {([{ team: t1, id: match.team1_id, cheers: t1Cheers, color: '#4ade80', borderColor: 'rgba(74,222,128,0.3)', bg: 'rgba(74,222,128,0.7)' }, { team: t2, id: match.team2_id, cheers: t2Cheers, color: '#f97316', borderColor: 'rgba(249,115,22,0.3)', bg: 'rgba(249,115,22,0.7)' }]).map(({ team, id, cheers, color, borderColor, bg }) => (
              <div key={id ?? ''} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{team?.team_name ?? '?'}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color }}>{cheers}</span>
                </div>
                <div style={{ height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', marginBottom: 7 }}>
                  <div style={{ height: '100%', background: bg, width: `${(cheers / maxCheers) * 100}%`, transition: 'width 0.4s ease', borderRadius: 3 }} />
                </div>
                <button onClick={() => id && addCheer(id)} disabled={!id} style={{ width: '100%', padding: '8px', background: `rgba(${color === '#4ade80' ? '74,222,128' : '249,115,22'},0.1)`, border: `1px solid ${borderColor}`, borderRadius: 8, color, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', transition: 'all 0.12s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = `rgba(${color === '#4ade80' ? '74,222,128' : '249,115,22'},0.18)` }}
                  onMouseLeave={e => { e.currentTarget.style.background = `rgba(${color === '#4ade80' ? '74,222,128' : '249,115,22'},0.1)` }}
                >
                  🎉 Cheer
                </button>
              </div>
            ))}
          </div>

          {/* Finalize prompt for admin when match has ended without wrapped */}
          {isAdmin && isFinal && !match.match_wrapped && (
            <button onClick={finalizeMatch} disabled={savingWrapped} style={{ width: '100%', padding: '12px', background: 'rgba(233,193,118,0.12)', border: '1px solid rgba(233,193,118,0.3)', borderRadius: 12, color: '#e9c176', fontSize: 13, fontWeight: 700, cursor: savingWrapped ? 'default' : 'pointer', fontFamily: 'inherit', opacity: savingWrapped ? 0.6 : 1 }}>
              {savingWrapped ? 'Generating Match Wrapped…' : '🏁 Generate Match Wrapped'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Match Wrapped Card ──────────────────────────────────────────────────────
function MatchWrappedCard({ wrapped, onPushToFeed, pushingToFeed, isAdmin }: {
  wrapped: MatchWrapped; onPushToFeed: () => void; pushingToFeed: boolean; isAdmin: boolean
}) {
  const winner = wrapped.final_score.score1 > wrapped.final_score.score2
    ? wrapped.final_score.team1
    : wrapped.final_score.score2 > wrapped.final_score.score1
    ? wrapped.final_score.team2
    : null

  return (
    <div style={{ background: 'linear-gradient(135deg, rgba(233,193,118,0.08) 0%, rgba(138,21,56,0.08) 100%)', border: '1px solid rgba(233,193,118,0.25)', borderRadius: 20, padding: 20, animation: 'wrapped-in 0.4s cubic-bezier(0.22,1,0.36,1) both' }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>🏁</div>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#e9c176', letterSpacing: '-0.01em' }}>Match Wrapped</div>
        {winner && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{winner} wins!</div>}
      </div>

      {/* Final score */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{wrapped.final_score.team1}</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: '#fff' }}>{wrapped.final_score.score1}</div>
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>FINAL</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{wrapped.final_score.team2}</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: '#fff' }}>{wrapped.final_score.score2}</div>
        </div>
      </div>

      {/* MVP */}
      {wrapped.mvp && (
        <div style={{ background: 'rgba(233,193,118,0.08)', border: '1px solid rgba(233,193,118,0.18)', borderRadius: 12, padding: '12px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 24 }}>🏅</div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#e9c176', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>MVP</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>{wrapped.mvp.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{wrapped.mvp.team} · {wrapped.mvp.points} pts</div>
          </div>
        </div>
      )}

      {/* Box score */}
      {(wrapped.box_score.team1.length > 0 || wrapped.box_score.team2.length > 0) && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Box Score</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(['team1', 'team2'] as const).map(tk => {
              const players = wrapped.box_score[tk]
              const teamName = tk === 'team1' ? wrapped.final_score.team1 : wrapped.final_score.team2
              if (!players.length) return null
              return (
                <div key={tk}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 }}>{teamName}</div>
                  {players.slice(0, 5).map((p, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>{p.name}</span>
                      <span style={{ color: '#4ade80', fontWeight: 700 }}>{p.points}pts</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {isAdmin && (
        <button onClick={onPushToFeed} disabled={pushingToFeed} style={{ width: '100%', padding: '11px', background: pushingToFeed ? 'rgba(138,21,56,0.3)' : 'var(--accent)', border: 'none', borderRadius: 11, color: '#fff', cursor: pushingToFeed ? 'default' : 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', boxShadow: pushingToFeed ? 'none' : '0 4px 16px rgba(138,21,56,0.35)', transition: 'all 0.15s' }}>
          {pushingToFeed ? 'Pushing…' : '📣 Push to Club Feed'}
        </button>
      )}
    </div>
  )
}
