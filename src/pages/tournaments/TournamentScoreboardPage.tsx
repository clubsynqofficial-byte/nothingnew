import React from 'react'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const SPORT_EMOJIS: Record<string, string> = { Basketball:'🏀', Football:'⚽', Bowling:'🎳', Volleyball:'🏐', Tennis:'🎾', Badminton:'🏸', Cricket:'🏏', Swimming:'🏊', Athletics:'🏃', Chess:'♟️', Gaming:'🎮', 'Table Tennis':'🏓', Rugby:'🏉', Baseball:'⚾', Hockey:'🏑' }

type StandingsRow = { team: Team; played: number; wins: number; draws: number; losses: number; pf: number; pa: number; pts: number }
function StandingsTable({ rows, maxPts }: { rows: StandingsRow[]; maxPts: number }) {
  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr repeat(5,40px) 56px', gap: 0, padding: '8px 16px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' as const, letterSpacing: '0.14em' }}>
        <span></span><span>Team</span>
        <span style={{ textAlign:'center' }}>P</span>
        <span style={{ textAlign:'center' }}>W</span>
        <span style={{ textAlign:'center' }}>D</span>
        <span style={{ textAlign:'center' }}>L</span>
        <span style={{ textAlign:'center' }}>±</span>
        <span style={{ textAlign:'center' }}>Pts</span>
      </div>
      {rows.map((row, i) => {
        const pct = maxPts > 0 ? row.pts / maxPts : 0
        const medal = i === 0 ? { icon: '🥇', border: 'rgba(233,193,118,0.5)', bg: 'rgba(233,193,118,0.04)' }
                    : i === 1 ? { icon: '🥈', border: 'rgba(148,163,184,0.3)', bg: 'transparent' }
                    : i === 2 ? { icon: '🥉', border: 'rgba(184,115,51,0.3)', bg: 'transparent' }
                    : null
        return (
          <div
            key={row.team.id}
            style={{
              display: 'grid', gridTemplateColumns: '40px 1fr repeat(5,40px) 56px',
              gap: 0, padding: '14px 16px',
              borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
              borderLeft: medal ? `3px solid ${medal.border}` : '3px solid transparent',
              background: medal?.bg ?? 'transparent',
              alignItems: 'center',
              animation: `row-in 0.3s ${i * 0.06}s ease both`,
              transition: 'background 0.15s',
            }}
          >
            <span style={{ fontSize: medal ? 18 : 13, textAlign: 'center' }}>
              {medal ? medal.icon : <span style={{ color: 'rgba(255,255,255,0.15)', fontWeight: 700 }}>{i + 1}</span>}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: i === 0 ? 800 : 600, color: i === 0 ? '#fff' : 'rgba(255,255,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.team.team_name}
              </div>
              <div style={{ marginTop: 5, height: 3, width: 80, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct * 100}%`, background: i === 0 ? '#e9c176' : i === 1 ? '#94a3b8' : i === 2 ? '#b87333' : 'rgba(255,255,255,0.2)', borderRadius: 2, transition: 'width 0.8s ease' }} />
              </div>
            </div>
            <span style={{ textAlign:'center', fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>{row.played}</span>
            <span style={{ textAlign:'center', fontSize: 13, fontWeight: 700, color: row.wins > 0 ? '#4ade80' : 'rgba(255,255,255,0.15)' }}>{row.wins}</span>
            <span style={{ textAlign:'center', fontSize: 13, color: row.draws > 0 ? '#f59e0b' : 'rgba(255,255,255,0.15)' }}>{row.draws}</span>
            <span style={{ textAlign:'center', fontSize: 13, color: row.losses > 0 ? '#f87171' : 'rgba(255,255,255,0.15)' }}>{row.losses}</span>
            <span style={{ textAlign:'center', fontSize: 12, color: (row.pf-row.pa)>=0 ? 'rgba(255,255,255,0.4)' : '#f87171' }}>
              {row.pf-row.pa>0?'+':''}{row.pf-row.pa}
            </span>
            <div style={{ display:'flex', justifyContent:'center' }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: i===0?'#e9c176':i===1?'#94a3b8':i===2?'#b87333':'#fff', fontVariantNumeric:'tabular-nums', minWidth: 32, textAlign:'center' }}>
                {row.pts}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface Match { id: string; tournament_id: string; team1_id: string | null; team2_id: string | null; score1: number; score2: number; winner_id: string | null; round: number; match_number: number; status: 'scheduled' | 'live' | 'completed'; stage: 'group' | 'knockout' | null; potm_voting_enabled: boolean; potm_voting_closes_at: string | null }
interface PotmVote { id: string; match_id: string; voter_id: string; team_id: string; player_name: string }
interface Team { id: string; team_name: string; logo_url: string | null; section: string | null; player_names: string[]; players: Array<{ name: string; role: string }> | null }

function BracketGrid({ matches, rounds, maxRound, teamMap }: { matches: Match[]; rounds: number[]; maxRound: number; teamMap: Record<string, Team> }) {
  return (
    <div style={{ overflowX: 'auto', paddingBottom: 12 }}>
      <div style={{ display: 'flex', gap: 10, minWidth: rounds.length * 210 }}>
        {rounds.map(round => (
          <div key={round} style={{ flex: 1, minWidth: 195 }}>
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12, textAlign: 'center', color: round === maxRound ? '#e9c176' : 'rgba(255,255,255,0.25)' }}>
              {round === maxRound ? 'Final' : round === maxRound - 1 && rounds.length > 2 ? 'Semi-finals' : `Round ${round}`}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {matches.filter(m => m.round === round && (m.team1_id || m.team2_id)).map(match => {
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
                          {row.team?.team_name ?? 'TBD'}
                        </span>
                        {row.wins && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
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
  )
}

interface Tournament {
  id: string; name: string; sport: string; status: string
  format: 'single_elimination' | 'round_robin' | 'group_knockout'
  advance_per_group: number | null
  logo_url: string | null; location: string | null
  prizes: Array<{ place: string; description: string }> | null
  sections: Array<{ id: string; name: string; maxTeams?: number | null }> | null
  club: { name: string } | null
  standings_paused: boolean | null
}
const CSS = `
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes sb-in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes row-in{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}
@keyframes score-pop{0%{transform:scale(1)}50%{transform:scale(1.08)}100%{transform:scale(1)}}
`

function Logo({ team, size }: { team: Team | null | undefined; size: number }) {
  const init = (team?.team_name ?? '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.24), background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.34), fontWeight: 800, color: 'rgba(255,255,255,0.5)', overflow: 'hidden', flexShrink: 0, letterSpacing: '-0.01em' }}>
      {team?.logo_url ? <img src={team.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : init}
    </div>
  )
}

function PotmVoting({ matchId, closesAt, t1, t2, votes, userId, isOpen, onToggle, casting, onVote }: {
  matchId: string
  closesAt: string | null
  t1: Team | null | undefined; t2: Team | null | undefined
  votes: PotmVote[]
  userId: string | undefined
  isOpen: boolean; onToggle: () => void
  casting: boolean; onVote: (teamId: string, playerName: string) => void
}) {
  const votingClosed = !!closesAt && new Date(closesAt) < new Date()
  const matchVotes = votes.filter(v => v.match_id === matchId)
  const myVote = userId ? matchVotes.find(v => v.voter_id === userId) : undefined

  function candidatesFor(team: Team | null | undefined) {
    if (!team) return []
    const names = team.players?.length ? team.players.map(p => p.name) : team.player_names
    return names.filter(Boolean)
  }

  const groups = [
    { team: t1, names: candidatesFor(t1) },
    { team: t2, names: candidatesFor(t2) },
  ].filter(g => g.team && g.names.length > 0)

  const totalVotes = matchVotes.length
  const voteCounts: Record<string, number> = {}
  for (const v of matchVotes) {
    const key = `${v.team_id}::${v.player_name}`
    voteCounts[key] = (voteCounts[key] ?? 0) + 1
  }
  const maxVotes = Math.max(1, ...Object.values(voteCounts))

  if (groups.length === 0) return null

  return (
    <div style={{ marginTop: 6 }}>
      <button onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', padding: '4px 0', fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit' }}>
        🏅 Player of the Match {totalVotes > 0 ? `(${totalVotes} vote${totalVotes !== 1 ? 's' : ''})` : ''} {votingClosed && <span style={{ color: '#f87171' }}>· Closed</span>}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {isOpen && (
        <div style={{ display: 'grid', gridTemplateColumns: groups.length > 1 ? '1fr 1fr' : '1fr', gap: 14, marginTop: 8, padding: '12px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 }}>
          {groups.map((g, gi) => (
            <div key={gi} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{g.team!.team_name}</span>
              {g.names.map(name => {
                const count = voteCounts[`${g.team!.id}::${name}`] ?? 0
                const isMine = myVote?.team_id === g.team!.id && myVote?.player_name === name
                const isLeader = count > 0 && count === maxVotes
                const pct = totalVotes > 0 ? (count / maxVotes) * 100 : 0
                return (
                  <button
                    key={name}
                    disabled={!userId || casting || votingClosed}
                    onClick={() => onVote(g.team!.id, name)}
                    style={{
                      position: 'relative', overflow: 'hidden', textAlign: 'left',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                      padding: '7px 10px', borderRadius: 8, fontFamily: 'inherit', fontSize: 12.5,
                      background: isMine ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isMine ? 'rgba(74,222,128,0.35)' : 'rgba(255,255,255,0.08)'}`,
                      color: isMine ? '#4ade80' : 'rgba(255,255,255,0.75)',
                      cursor: userId && !casting && !votingClosed ? 'pointer' : 'default',
                      fontWeight: isMine ? 700 : 500,
                    }}
                  >
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: isLeader ? 'rgba(233,193,118,0.1)' : 'rgba(255,255,255,0.04)', zIndex: 0 }} />
                    <span style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isLeader && '👑'} {name} {isMine && '✓'}
                    </span>
                    <span style={{ position: 'relative', zIndex: 1, fontSize: 11, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{count}</span>
                  </button>
                )
              })}
            </div>
          ))}
          {votingClosed ? (
            <div style={{ gridColumn: '1 / -1', fontSize: 11, color: '#f87171', textAlign: 'center' }}>Voting has closed for this match</div>
          ) : !userId && (
            <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>Log in to vote</div>
          )}
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <div style={{ width: 3, height: 18, borderRadius: 2, background: '#8a1538', flexShrink: 0 }} />
      <span style={{ fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.16em' }}>{children}</span>
    </div>
  )
}

export default function TournamentScoreboardPage() {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [votes, setVotes] = useState<PotmVote[]>([])
  const [openVoteMatch, setOpenVoteMatch] = useState<string | null>(null)
  const [castingVote, setCastingVote] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [, setLastUpdated] = useState(new Date())
  const [activeSectionName, setActiveSectionName] = useState('')

  const fetchData = useCallback(async () => {
    if (!tournamentId) return
    const [tRes, teamsRes, matchesRes, votesRes] = await Promise.all([
      supabase.from('tournaments').select('id,name,sport,status,format,advance_per_group,logo_url,location,prizes,sections,standings_paused,club:clubs(name)').eq('id', tournamentId).single(),
      supabase.from('tournament_teams').select('id,team_name,logo_url,section,player_names,players').eq('tournament_id', tournamentId).eq('status', 'accepted'),
      supabase.from('tournament_matches').select('*').eq('tournament_id', tournamentId).order('round').order('match_number'),
      supabase.from('match_potm_votes').select('id,match_id,voter_id,team_id,player_name,tournament_matches!inner(tournament_id)').eq('tournament_matches.tournament_id', tournamentId),
    ])
    if (tRes.data) setTournament(tRes.data as unknown as Tournament)
    if (teamsRes.data) setTeams(teamsRes.data)
    if (matchesRes.data) setMatches(matchesRes.data)
    if (votesRes.data) setVotes(votesRes.data as unknown as PotmVote[])
    setLoading(false)
    setLastUpdated(new Date())
  }, [tournamentId])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!tournamentId) return
    const ch = supabase.channel(`potm-votes-${tournamentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_potm_votes' }, () => { fetchData() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [tournamentId, fetchData])

  async function castVote(matchId: string, teamId: string, playerName: string) {
    if (!user) return
    setCastingVote(matchId)
    const { error } = await supabase.from('match_potm_votes').upsert(
      { match_id: matchId, voter_id: user.id, team_id: teamId, player_name: playerName },
      { onConflict: 'match_id,voter_id' },
    )
    if (!error) {
      setVotes(prev => [
        ...prev.filter(v => !(v.match_id === matchId && v.voter_id === user.id)),
        { id: `${matchId}-${user.id}`, match_id: matchId, voter_id: user.id, team_id: teamId, player_name: playerName },
      ])
    }
    setCastingVote(null)
  }

  useEffect(() => {
    if (!tournamentId) return
    const ch = supabase.channel(`sb-${tournamentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_matches', filter: `tournament_id=eq.${tournamentId}` },
        p => {
          if (p.eventType === 'INSERT') setMatches(prev => [...prev, p.new as Match].sort((a, b) => a.round - b.round || a.match_number - b.match_number))
          if (p.eventType === 'UPDATE') { setMatches(prev => prev.map(m => m.id === (p.new as Match).id ? p.new as Match : m)); setLastUpdated(new Date()) }
          if (p.eventType === 'DELETE') setMatches(prev => prev.filter(m => m.id !== (p.old as Match).id))
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [tournamentId])

  // Live team roster — new registrations, edits (name/logo/section), and accept/decline
  // status changes should all reach viewers without a manual refresh.
  useEffect(() => {
    if (!tournamentId) return
    const ch = supabase.channel(`sb-teams-${tournamentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_teams', filter: `tournament_id=eq.${tournamentId}` },
        p => {
          if (p.eventType === 'DELETE') {
            setTeams(prev => prev.filter(t => t.id !== (p.old as { id: string }).id))
            return
          }
          const row = p.new as Team & { status: string }
          setTeams(prev => {
            const isAccepted = row.status === 'accepted'
            const exists = prev.some(t => t.id === row.id)
            if (!isAccepted) return exists ? prev.filter(t => t.id !== row.id) : prev
            return exists ? prev.map(t => t.id === row.id ? row : t) : [...prev, row]
          })
          setLastUpdated(new Date())
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [tournamentId])

  // Instant pause/resume via broadcast — no DB round-trip needed
  useEffect(() => {
    if (!tournamentId) return
    const ch = supabase.channel(`standings-ctrl-${tournamentId}`)
      .on('broadcast', { event: 'pause-update' }, ({ payload }) => {
        setTournament(prev => prev ? { ...prev, standings_paused: payload.paused as boolean } : prev)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [tournamentId])

  // Tournament-level changes — format switches, group/section edits, prizes, logo, etc.
  useEffect(() => {
    if (!tournamentId) return
    const ch = supabase.channel(`sb-tournament-${tournamentId}`)
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

  const hasSections = (tournament?.sections?.length ?? 0) > 0
  const activeSec = hasSections ? (activeSectionName || tournament!.sections![0].name) : ''

  function buildStandings(teamList: Team[], matchPool: Match[] = matches) {
    return teamList.map(team => {
      const played = matchPool.filter(m => (m.team1_id === team.id || m.team2_id === team.id) && m.status === 'completed')
      const wins = played.filter(m => m.winner_id === team.id).length
      const losses = played.filter(m => m.winner_id && m.winner_id !== team.id).length
      const draws = played.length - wins - losses
      const pf = played.reduce((s, m) => s + (m.team1_id === team.id ? m.score1 : m.score2), 0)
      const pa = played.reduce((s, m) => s + (m.team1_id === team.id ? m.score2 : m.score1), 0)
      const pts = wins * 3 + draws
      return { team, played: played.length, wins, draws, losses, pf, pa, pts }
    }).sort((a, b) => b.pts - a.pts || b.wins - a.wins || (b.pf - b.pa) - (a.pf - a.pa))
  }

  // Standings for round robin
  const standings = buildStandings(teams)
  const maxPts = standings[0]?.pts || 1

  function matchSection(match: Match): string | null {
    const s1 = match.team1_id ? teamMap[match.team1_id]?.section ?? null : null
    const s2 = match.team2_id ? teamMap[match.team2_id]?.section ?? null : null
    if (s1 && s1 === s2) return s1
    if (s1 && !s2) return s1
    if (!s1 && s2) return s2
    return null
  }

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

      {/* Subtle top accent line */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(to right, #8a1538, #c2185b, #8a1538)', zIndex: 30 }} />

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
        <div style={{ marginBottom: 52, animation: 'sb-in 0.4s ease both' }}>
          {/* Sport banner */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, paddingBottom: 28, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ width: 88, height: 88, borderRadius: 20, background: 'linear-gradient(135deg, rgba(138,21,56,0.6) 0%, rgba(80,10,30,0.9) 100%)', border: '1px solid rgba(138,21,56,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, boxShadow: '0 8px 32px rgba(138,21,56,0.3)' }}>
              {tournament.logo_url
                ? <img src={tournament.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 40 }}>{SPORT_EMOJIS[tournament.sport] ?? '🏆'}</span>
              }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {tournament.club && (
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(138,21,56,0.9)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 6 }}>
                  {tournament.club.name}
                </div>
              )}
              <h1 style={{ fontSize: 'clamp(24px, 5vw, 42px)', fontWeight: 900, margin: '0 0 10px', letterSpacing: '-0.03em', lineHeight: 1.05, color: '#fff' }}>
                {tournament.name}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 10px', background: tournament.format === 'round_robin' ? 'rgba(99,102,241,0.2)' : tournament.format === 'group_knockout' ? 'rgba(56,189,248,0.2)' : 'rgba(245,158,11,0.2)', border: `1px solid ${tournament.format === 'round_robin' ? 'rgba(99,102,241,0.4)' : tournament.format === 'group_knockout' ? 'rgba(56,189,248,0.4)' : 'rgba(245,158,11,0.4)'}`, borderRadius: 6, color: tournament.format === 'round_robin' ? '#818cf8' : tournament.format === 'group_knockout' ? '#38bdf8' : '#f59e0b' }}>
                  {tournament.format === 'round_robin' ? 'Round Robin' : tournament.format === 'group_knockout' ? 'Group Stages + Knockouts' : 'Single Elimination'}
                </span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>{tournament.sport}</span>
                {tournament.location && (
                  <>
                    <span style={{ width: 2, height: 2, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{tournament.location}</span>
                  </>
                )}
                {liveMatches.length > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.12em', padding: '4px 10px', background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.35)', borderRadius: 20 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', animation: 'live-pulse 1.5s ease-in-out infinite' }} />
                    {liveMatches.length} Live
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Blurred content wrapper when paused */}
        <div style={{ filter: tournament?.standings_paused ? 'blur(6px)' : 'none', transition: 'filter 0.4s ease', userSelect: tournament?.standings_paused ? 'none' : 'auto', pointerEvents: tournament?.standings_paused ? 'none' : 'auto' }}>

        {/* ── Section tab bar ── */}
        {hasSections && (
          <div style={{ marginBottom: 40, animation: 'sb-in 0.38s ease both' }}>
            <style>{`.sb-section-tabs::-webkit-scrollbar{display:none}`}</style>
            <div className="sb-section-tabs" style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', overflowX: 'auto', scrollbarWidth: 'none' }}>
              {(tournament.sections ?? []).map(sec => {
                const isActive = activeSec === sec.name
                const secTeamCount = teams.filter(t => t.section === sec.name).length
                const secLiveCount = liveMatches.filter(m => matchSection(m) === sec.name).length
                return (
                  <button
                    key={sec.id}
                    onClick={() => setActiveSectionName(sec.name)}
                    style={{
                      flexShrink: 0,
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '14px 20px',
                      background: 'none', border: 'none',
                      borderBottom: `2px solid ${isActive ? '#8a1538' : 'transparent'}`,
                      marginBottom: -1,
                      color: isActive ? '#fff' : 'rgba(255,255,255,0.38)',
                      fontSize: 14, fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'all 0.15s',
                    }}
                  >
                    {sec.name}
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: isActive ? 'rgba(138,21,56,0.25)' : 'rgba(255,255,255,0.06)', color: isActive ? '#e57399' : 'rgba(255,255,255,0.25)' }}>
                      {secTeamCount}
                    </span>
                    {secLiveCount > 0 && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', animation: 'live-pulse 1.5s ease-in-out infinite' }} />}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {(hasSections ? matches.filter(m => matchSection(m) === activeSec) : matches).length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: 'rgba(255,255,255,0.2)', fontSize: 14, animation: 'sb-in 0.4s ease both' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" style={{ display: 'block', margin: '0 auto 16px' }} strokeLinecap="round"><path d="M6 9H4.5a2.5 2.5 0 0 0 0 5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 1 0 5H18"/><path d="M4 22h16"/><path d="M8 22V11.3"/><path d="M16 22V11.3"/><rect x="6" y="2" width="12" height="9" rx="1"/></svg>
            {hasSections ? `No matches for ${activeSec} yet. Check back soon.` : 'Bracket hasn\'t been set up yet. Check back soon.'}
          </div>
        )}

        {/* ── LIVE NOW ── */}
        {(hasSections ? liveMatches.filter(m => matchSection(m) === activeSec) : liveMatches).length > 0 && (() => {
          const visibleLive = hasSections ? liveMatches.filter(m => matchSection(m) === activeSec) : liveMatches
          return (
          <div style={{ marginBottom: 52, animation: 'sb-in 0.45s ease both' }}>
            <SectionLabel>Live Now</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px,1fr))', gap: 14 }}>
              {visibleLive.map(match => {
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
                        <span style={{ fontSize: 15, fontWeight: 700, textAlign: 'center', lineHeight: 1.3, color: 'rgba(255,255,255,0.85)' }}>{t1?.team_name ?? 'TBD'}</span>
                        <span style={{ fontSize: 72, fontWeight: 900, lineHeight: 1, color: '#fff', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>{match.score1}</span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.12)', letterSpacing: '0.06em' }}>—</span>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
                        <Logo team={t2} size={48} />
                        <span style={{ fontSize: 15, fontWeight: 700, textAlign: 'center', lineHeight: 1.3, color: 'rgba(255,255,255,0.85)' }}>{t2?.team_name ?? 'TBD'}</span>
                        <span style={{ fontSize: 72, fontWeight: 900, lineHeight: 1, color: '#fff', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }}>{match.score2}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          )
        })()}

        {/* ── Standings (round robin) ── */}
        {tournament.format === 'round_robin' && (hasSections ? teams.filter(t => t.section === activeSec) : teams).length > 0 && (
          <div style={{ marginBottom: 52, animation: 'sb-in 0.5s ease both' }}>
            <SectionLabel>Standings</SectionLabel>
            {hasSections ? (() => {
              const secTeams = teams.filter(t => t.section === activeSec)
              const secStandings = buildStandings(secTeams)
              const secMaxPts = secStandings[0]?.pts || 1
              return secTeams.length === 0
                ? <div style={{ textAlign: 'center', padding: '32px', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>No teams registered for {activeSec} yet.</div>
                : <StandingsTable rows={secStandings} maxPts={secMaxPts} />
            })() : (
              <StandingsTable rows={standings} maxPts={maxPts} />
            )}
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
            {hasSections ? (() => {
              const secMatches = matches.filter(m => matchSection(m) === activeSec)
              const secRounds = [...new Set(secMatches.map(m => m.round))].sort((a, b) => a - b)
              const secMaxRound = Math.max(...secRounds, 0)
              return secMatches.length === 0
                ? <div style={{ textAlign: 'center', padding: '32px', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>No bracket matches for {activeSec} yet.</div>
                : <BracketGrid matches={secMatches} rounds={secRounds} maxRound={secMaxRound} teamMap={teamMap} />
            })() : (
              <BracketGrid matches={matches} rounds={rounds} maxRound={maxRound} teamMap={teamMap} />
            )}
          </div>
        )}

        {/* ── Group Standings + Knockout Bracket (group_knockout) ── */}
        {tournament.format === 'group_knockout' && (() => {
          const groupMatches = matches.filter(m => m.stage === 'group')
          const knockoutMatches = matches.filter(m => m.stage === 'knockout')
          const koRounds = [...new Set(knockoutMatches.map(m => m.round))].sort((a, b) => a - b)
          const koMaxRound = Math.max(...koRounds, 0)
          return (
            <>
              {groupMatches.length > 0 && (
                <div style={{ marginBottom: 52, animation: 'sb-in 0.5s ease both' }}>
                  <SectionLabel>Group Standings</SectionLabel>
                  {hasSections ? (() => {
                    const secTeams = teams.filter(t => t.section === activeSec)
                    const secGroupMatches = groupMatches.filter(m => matchSection(m) === activeSec)
                    const secStandings = buildStandings(secTeams, secGroupMatches)
                    const secMaxPts = secStandings[0]?.pts || 1
                    return secTeams.length === 0
                      ? <div style={{ textAlign: 'center', padding: '32px', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>No teams registered for {activeSec} yet.</div>
                      : <StandingsTable rows={secStandings} maxPts={secMaxPts} />
                  })() : (
                    <StandingsTable rows={buildStandings(teams, groupMatches)} maxPts={buildStandings(teams, groupMatches)[0]?.pts || 1} />
                  )}
                </div>
              )}
              {knockoutMatches.length > 0 && (
                <div style={{ marginBottom: 52, animation: 'sb-in 0.55s ease both' }}>
                  <SectionLabel>Knockout Bracket</SectionLabel>
                  <BracketGrid matches={knockoutMatches} rounds={koRounds} maxRound={koMaxRound} teamMap={teamMap} />
                </div>
              )}
            </>
          )
        })()}

        {/* ── Results ── */}
        {(hasSections ? completedMatches.filter(m => matchSection(m) === activeSec && (m.team1_id && m.team2_id)) : completedMatches.filter(m => m.team1_id && m.team2_id)).length > 0 && (
          <div style={{ marginBottom: 52, animation: 'sb-in 0.55s ease both' }}>
            <SectionLabel>Results</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[...(hasSections ? completedMatches.filter(m => matchSection(m) === activeSec && (m.team1_id && m.team2_id)) : completedMatches.filter(m => m.team1_id && m.team2_id))].reverse().slice(0, 12).map((match, i) => {
                const t1 = match.team1_id ? teamMap[match.team1_id] : null
                const t2 = match.team2_id ? teamMap[match.team2_id] : null
                const t1w = match.winner_id === match.team1_id
                const t2w = match.winner_id === match.team2_id
                return (
                  <div key={match.id} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '11px 18px', animation: `row-in 0.3s ${i * 0.03}s ease both` }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12 }}>
                      {/* Team 1 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Logo team={t1} size={26} />
                        <span style={{ fontSize: t1w ? 14 : 13, fontWeight: t1w ? 800 : 400, color: t1w ? '#fff' : 'rgba(255,255,255,0.25)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t1?.team_name ?? 'TBD'}
                        </span>
                        {t1w && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                      {/* Score */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 24, fontWeight: 900, minWidth: 28, textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: t1w ? '#fff' : 'rgba(255,255,255,0.2)' }}>{match.score1}</span>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.15)', fontWeight: 600 }}>—</span>
                        <span style={{ fontSize: 24, fontWeight: 900, minWidth: 28, textAlign: 'center', fontVariantNumeric: 'tabular-nums', color: t2w ? '#fff' : 'rgba(255,255,255,0.2)' }}>{match.score2}</span>
                      </div>
                      {/* Team 2 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
                        {t2w && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>}
                        <span style={{ fontSize: t2w ? 14 : 13, fontWeight: t2w ? 800 : 400, color: t2w ? '#fff' : 'rgba(255,255,255,0.25)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t2?.team_name ?? 'TBD'}
                        </span>
                        <Logo team={t2} size={26} />
                      </div>
                    </div>
                    {match.potm_voting_enabled && (
                      <PotmVoting
                        matchId={match.id} closesAt={match.potm_voting_closes_at} t1={t1} t2={t2} votes={votes} userId={user?.id}
                        isOpen={openVoteMatch === match.id}
                        onToggle={() => setOpenVoteMatch(prev => prev === match.id ? null : match.id)}
                        casting={castingVote === match.id}
                        onVote={(teamId, playerName) => castVote(match.id, teamId, playerName)}
                      />
                    )}
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
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {tournament.prizes.map((prize, i) => {
                const medals = ['🥇', '🥈', '🥉']
                const colors = ['#e9c176', '#94a3b8', '#b87333']
                const c = colors[i] ?? 'rgba(255,255,255,0.3)'
                const medalIcon = medals[i] ?? '🏅'
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', background: i === 0 ? 'rgba(233,193,118,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${c}30`, borderLeft: `3px solid ${c}`, borderRadius: 12, minWidth: 200, flex: '1 1 200px' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: `${c}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                      {medalIcon}
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: c, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>{prize.place}</div>
                      <div style={{ fontSize: 15, color: '#fff', fontWeight: 700, lineHeight: 1.3 }}>{prize.description}</div>
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
      <div style={{ position: 'relative', zIndex: 1, borderTop: '1px solid rgba(255,255,255,0.05)', background: 'linear-gradient(to bottom, transparent, rgba(138,21,56,0.04))', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.12)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Powered by</span>
        <span style={{ fontSize: 13, fontWeight: 900, color: 'rgba(138,21,56,0.6)', letterSpacing: '0.18em', textTransform: 'uppercase' }}>CLUBSYNQ</span>
      </div>
    </div>
  )
}
