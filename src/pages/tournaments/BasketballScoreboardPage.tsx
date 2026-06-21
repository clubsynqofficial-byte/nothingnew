import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

interface Match {
  id: string; tournament_id: string
  team1_id: string | null; team2_id: string | null
  score1: number; score2: number
  game_status: 'not_started' | 'in_progress' | 'halftime' | 'final'
  current_period: number; game_clock: number
  fouls1: number; fouls2: number
  timeouts1: number; timeouts2: number
  live_stats: Record<string, unknown> | null
  shot_clock: number
  shot_clock_running: boolean
  round: number; match_number: number; status: string
}

interface Team {
  id: string; team_name: string; logo_url: string | null
}

interface Config {
  showTimeouts: boolean; showFouls: boolean; showPeriod: boolean
  showPossession: boolean; show3Pt: boolean; showBonus: boolean; showRecords: boolean
  homeColor: string; awayColor: string; homeTextColor: string; awayTextColor: string
  boardBg: string; boardText: string; possessionColor: string
  titleText: string; showTitle: boolean
  timerLength: number; timerCountsDown: boolean; showTimer: boolean
  showShotClock: boolean; autoPlayBuzzer: boolean; enableAudio: boolean
  labelTO: string; labelFO: string; labelBonus: string
  fontSize: number
}

const DEFAULT_CONFIG: Config = {
  showTimeouts: true, showFouls: true, showPeriod: true,
  showPossession: false, show3Pt: true, showBonus: false, showRecords: false,
  homeColor: '#16a34a', awayColor: '#ca8a04',
  homeTextColor: '#ffffff', awayTextColor: '#ffffff',
  boardBg: '#111827', boardText: '#ffffff', possessionColor: '#f59e0b',
  titleText: 'Basketball Scoreboard', showTitle: true,
  timerLength: 600, timerCountsDown: true, showTimer: true,
  showShotClock: false, autoPlayBuzzer: false, enableAudio: false,
  labelTO: 'TO', labelFO: 'FO', labelBonus: 'BONUS',
  fontSize: 100,
}

function formatClock(secs: number, down: boolean, length: number) {
  const val = down ? Math.max(0, length - secs) : secs
  const m = Math.floor(val / 60); const s = val % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function playBuzzer() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.6, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.7)
    setTimeout(() => ctx.close(), 1000)
  } catch {}
}

// ── Public scoreboard (Screenshot 3) ────────────────────────────────────────
// No local clock — displays game_clock directly from DB.
// Admin writes to DB every second when running; admin pausing stops writes → public freezes.
export function BasketballPublicView({ match, teams, cfg }: { match: Match | null; teams: Record<string, Team>; cfg: Config }) {
  const [localShotClock, setLocalShotClock] = useState(match?.shot_clock ?? 24)
  const scIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // When DB signals shot_clock_running=true, start local countdown from the DB value.
  // When false, stop and show the DB value directly.
  useEffect(() => {
    if (!match) return
    setLocalShotClock(match.shot_clock ?? 24)
    if (scIntervalRef.current) { clearInterval(scIntervalRef.current); scIntervalRef.current = null }
    if (match.shot_clock_running) {
      scIntervalRef.current = setInterval(() => {
        setLocalShotClock(prev => {
          if (prev <= 1) { clearInterval(scIntervalRef.current!); scIntervalRef.current = null; return 0 }
          return prev - 1
        })
      }, 1000)
    }
    return () => { if (scIntervalRef.current) clearInterval(scIntervalRef.current) }
  }, [match?.shot_clock_running, match?.shot_clock, match?.id])

  if (!match) return (
    <div style={{ minHeight: '100vh', background: cfg.boardBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.4)' }}>Waiting for match to start…</div>
    </div>
  )

  const home = teams[match.team1_id ?? '']
  const away = teams[match.team2_id ?? '']
  const clockStr = formatClock(match.game_clock, cfg.timerCountsDown, cfg.timerLength)
  const periodLabels = ['1st','2nd','3rd','4th','OT']
  const periodLabel = match.game_status === 'final' ? 'FINAL' : match.game_status === 'halftime' ? 'HALF' : (periodLabels[match.current_period - 1] ?? `${match.current_period}th`)
  const isFinal = match.game_status === 'final'

  return (
    <div style={{ minHeight: '100vh', background: cfg.boardBg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'inherit' }}>
      {cfg.showTitle && (
        <div style={{ fontSize: Math.round(16 * cfg.fontSize / 100), fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          {cfg.titleText}
        </div>
      )}
      <div style={{ width: '100%', maxWidth: 680, borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
        {/* Home row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: cfg.homeColor, padding: '20px 28px' }}>
          {home?.logo_url && (
            <div style={{ width: Math.round(56 * cfg.fontSize / 100), height: Math.round(56 * cfg.fontSize / 100), borderRadius: 10, overflow: 'hidden', marginRight: 18, flexShrink: 0, border: '2px solid rgba(255,255,255,0.2)' }}>
              <img src={home.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: Math.round(28 * cfg.fontSize / 100), fontWeight: 900, color: cfg.homeTextColor, letterSpacing: '-0.01em', textTransform: 'uppercase', lineHeight: 1.1 }}>
              {home?.team_name ?? 'HOME'}
            </div>
            <div style={{ fontSize: Math.round(13 * cfg.fontSize / 100), color: `${cfg.homeTextColor}bb`, marginTop: 4, display: 'flex', gap: 12 }}>
              {cfg.showTimeouts && <span>{cfg.labelTO}: {match.timeouts1}</span>}
              {cfg.showFouls && <span>{cfg.labelFO}: {match.fouls1}</span>}
            </div>
          </div>
          <div style={{ fontSize: Math.round(64 * cfg.fontSize / 100), fontWeight: 900, color: cfg.homeTextColor, lineHeight: 1, minWidth: 90, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {match.score1}
          </div>
        </div>
        {/* Divider */}
        <div style={{ height: 2, background: 'rgba(0,0,0,0.3)' }} />
        {/* Away row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: cfg.awayColor, padding: '20px 28px' }}>
          {away?.logo_url && (
            <div style={{ width: Math.round(56 * cfg.fontSize / 100), height: Math.round(56 * cfg.fontSize / 100), borderRadius: 10, overflow: 'hidden', marginRight: 18, flexShrink: 0, border: '2px solid rgba(255,255,255,0.2)' }}>
              <img src={away.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: Math.round(28 * cfg.fontSize / 100), fontWeight: 900, color: cfg.awayTextColor, letterSpacing: '-0.01em', textTransform: 'uppercase', lineHeight: 1.1 }}>
              {away?.team_name ?? 'AWAY'}
            </div>
            <div style={{ fontSize: Math.round(13 * cfg.fontSize / 100), color: `${cfg.awayTextColor}bb`, marginTop: 4, display: 'flex', gap: 12 }}>
              {cfg.showTimeouts && <span>{cfg.labelTO}: {match.timeouts2}</span>}
              {cfg.showFouls && <span>{cfg.labelFO}: {match.fouls2}</span>}
            </div>
          </div>
          <div style={{ fontSize: Math.round(64 * cfg.fontSize / 100), fontWeight: 900, color: cfg.awayTextColor, lineHeight: 1, minWidth: 90, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {match.score2}
          </div>
        </div>
        {/* Bottom bar */}
        <div style={{ background: '#0d111a', padding: '14px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {cfg.showTimer
            ? <div style={{ fontSize: Math.round(22 * cfg.fontSize / 100), fontWeight: 800, color: isFinal ? 'rgba(255,255,255,0.4)' : '#fff', fontVariantNumeric: 'tabular-nums' }}>{isFinal ? '—' : clockStr}</div>
            : <div />
          }
          {cfg.showPeriod && (
            <div style={{ fontSize: Math.round(18 * cfg.fontSize / 100), fontWeight: 800, color: match.game_status === 'in_progress' ? '#f97316' : 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{periodLabel}</div>
          )}
          {cfg.showShotClock && !isFinal && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: Math.round(11 * cfg.fontSize / 100), fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>Shot</div>
              <div style={{ fontSize: Math.round(28 * cfg.fontSize / 100), fontWeight: 900, color: localShotClock <= 5 ? '#ef4444' : '#f59e0b', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {localShotClock}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main admin page ──────────────────────────────────────────────────────────
export default function BasketballScoreboardPage() {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const [searchParams] = useSearchParams()
  const isPublicView = searchParams.get('view') === 'public'
  const navigate = useNavigate()
  const { user } = useAuth()

  const [matches, setMatches] = useState<Match[]>([])
  const [teams, setTeams] = useState<Record<string, Team>>({})
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [match, setMatch] = useState<Match | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG)
  const [activeSection, setActiveSection] = useState<'controls' | 'setup'>('controls')
  const [showPreview, setShowPreview] = useState(false)
  const [copied, setCopied] = useState(false)
  const [updatingTeam, setUpdatingTeam] = useState<string | null>(null)
  const homeLogoRef = useRef<HTMLInputElement>(null)
  const awayLogoRef = useRef<HTMLInputElement>(null)

  function shareScoreboard() {
    const url = `${window.location.origin}/tournaments/${tournamentId}/scoreboard/basketball?view=public`
    if (navigator.share) {
      navigator.share({ title: 'Live Basketball Scoreboard', url })
    } else {
      navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  // Clock
  const [clockRunning, setClockRunning] = useState(false)
  const clockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const clockCounterRef = useRef(0) // tracks elapsed secs independently of DB round-trips
  const matchRef = useRef<Match | null>(null)

  // Shot clock
  const [shotClock, setShotClock] = useState(24)
  const [shotClockRunning, setShotClockRunning] = useState(false)
  const shotRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Score flash
  const [flashHome, setFlashHome] = useState(false)
  const [flashAway, setFlashAway] = useState(false)

  // Bracket builder state (used when no matches exist yet)
  const [acceptedTeams, setAcceptedTeams] = useState<Array<{ id: string; team_name: string; logo_url: string | null }>>([])
  const [_directTeamName, _setDirectTeamName] = useState('')
  const [_addingTeam, _setAddingTeam] = useState(false)
  const [_teamError, _setTeamError] = useState('')
  const [generatingBracket, setGeneratingBracket] = useState(false)
  const [tournamentData, setTournamentData] = useState<{ id: string; name: string; club_id: string; created_by: string; format: string } | null>(null)

  matchRef.current = match

  const loadData = useCallback(async () => {
    if (!tournamentId) return
    setLoading(true)
    const { data: tData } = await supabase.from('tournaments').select('id, name, club_id, created_by, format').eq('id', tournamentId).single()
    if (tData) setTournamentData(tData)
    const { data: matchData } = await supabase.from('tournament_matches').select('*').eq('tournament_id', tournamentId).in('status', ['live','scheduled','completed']).order('round').order('match_number')
    const { data: teamsData } = await supabase.from('tournament_teams').select('id, team_name, logo_url').eq('tournament_id', tournamentId).eq('status', 'accepted')
    setAcceptedTeams(teamsData ?? [])

    const teamMap: Record<string, Team> = {}
    for (const t of teamsData ?? []) teamMap[t.id] = t
    setTeams(teamMap)

    const allMatches = matchData ?? []
    setMatches(allMatches)

    // Auto-select: prefer live, then first scheduled
    const live = allMatches.find(m => m.status === 'live')
    const first = allMatches[0]
    const auto = live ?? first ?? null
    if (auto) {
      setSelectedMatchId(auto.id)
      setMatch(auto)
      // Load config from live_stats if it exists
      const savedCfg = (auto.live_stats as any)?.config
      if (savedCfg) setCfg(c => ({ ...c, ...savedCfg }))
    }

    // Check admin
    if (user && tData) {
      if (tData.created_by === user.id) { setIsAdmin(true) }
      else {
        const { data: mem } = await supabase.from('club_memberships').select('role').eq('club_id', tData.club_id).eq('user_id', user.id).single()
        setIsAdmin(mem?.role === 'president' || mem?.role === 'officer')
      }
    }

    setLoading(false)
  }, [tournamentId, user])

  useEffect(() => { loadData() }, [loadData])

  // Realtime match updates — subscribes for both admin and public view
  useEffect(() => {
    if (!selectedMatchId) return
    const channelId = `bball-match-${selectedMatchId}-${isPublicView ? 'pub' : 'adm'}`
    const ch = supabase.channel(channelId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tournament_matches', filter: `id=eq.${selectedMatchId}` },
        p => setMatch(p.new as Match))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [selectedMatchId, isPublicView])

  useEffect(() => () => {
    if (clockIntervalRef.current) clearInterval(clockIntervalRef.current)
    if (shotRef.current) clearInterval(shotRef.current)
  }, [])

  // Public view: poll DB every second as the primary update mechanism.
  // Realtime subscriptions can be unreliable; polling guarantees the displayed
  // values always match whatever the admin last wrote to the DB.
  useEffect(() => {
    if (!isPublicView || !selectedMatchId) return
    const poll = setInterval(async () => {
      const { data } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('id', selectedMatchId)
        .single()
      if (data) setMatch(data as Match)
    }, 1000)
    return () => clearInterval(poll)
  }, [isPublicView, selectedMatchId])

  function selectMatch(id: string) {
    const m = matches.find(mx => mx.id === id) ?? null
    setSelectedMatchId(id)
    setMatch(m)
    setClockRunning(false)
    if (clockIntervalRef.current) clearInterval(clockIntervalRef.current)
    if (m?.shot_clock != null) setShotClock(m.shot_clock)
    const savedCfg = (m?.live_stats as any)?.config
    if (savedCfg) setCfg(c => ({ ...c, ...savedCfg }))
  }

  // ── Clock controls ────────────────────────────────────────────────────────
  function startClock() {
    if (clockRunning) return
    const m = matchRef.current
    if (!m) return
    // Seed the independent counter from current DB value so we don't jump
    clockCounterRef.current = m.game_clock
    setClockRunning(true)
    clockIntervalRef.current = setInterval(async () => {
      clockCounterRef.current += 1
      const newClock = clockCounterRef.current
      const maxClock = cfg.timerLength
      const currentMatch = matchRef.current
      if (!currentMatch) return
      if (newClock >= maxClock) {
        clearInterval(clockIntervalRef.current!)
        setClockRunning(false)
        clockCounterRef.current = maxClock
        setMatch(prev => prev ? { ...prev, game_clock: maxClock } : prev)
        await supabase.from('tournament_matches').update({
          game_clock: maxClock,
          game_status: currentMatch.current_period >= 4 ? 'final' : 'in_progress',
          status: currentMatch.current_period >= 4 ? 'completed' : 'live',
        }).eq('id', currentMatch.id)
        if (cfg.autoPlayBuzzer) playBuzzer()
      } else {
        setMatch(prev => prev ? { ...prev, game_clock: newClock } : prev)
        await supabase.from('tournament_matches').update({ game_clock: newClock, game_status: 'in_progress', status: 'live' }).eq('id', currentMatch.id)
      }
    }, 1000)
  }

  async function pauseClock() {
    clearInterval(clockIntervalRef.current!)
    clockIntervalRef.current = null
    setClockRunning(false)
    // Write the exact counter value so public view sees the paused time
    const pausedAt = clockCounterRef.current
    setMatch(prev => prev ? { ...prev, game_clock: pausedAt } : prev)
    if (matchRef.current) {
      await supabase.from('tournament_matches').update({ game_clock: pausedAt, game_status: 'in_progress', status: 'live' }).eq('id', matchRef.current.id)
    }
  }

  async function resetClock() {
    clearInterval(clockIntervalRef.current!)
    clockIntervalRef.current = null
    clockCounterRef.current = 0
    setClockRunning(false)
    setMatch(prev => prev ? { ...prev, game_clock: 0 } : prev)
    if (matchRef.current) await supabase.from('tournament_matches').update({ game_clock: 0 }).eq('id', matchRef.current.id)
  }

  function adjustClock(delta: number) {
    // +delta = add to displayed time. In countdown mode, adding displayed time means reducing elapsed.
    const actualDelta = cfg.timerCountsDown ? -delta : delta
    const m = matchRef.current
    if (!m) return
    const newClock = Math.max(0, Math.min(cfg.timerLength, m.game_clock + actualDelta))
    clockCounterRef.current = newClock // keep counter in sync when adjusted
    setMatch(prev => prev ? { ...prev, game_clock: newClock } : prev)
    supabase.from('tournament_matches').update({ game_clock: newClock }).eq('id', m.id)
  }

  // Shot clock
  function startShotClock() {
    if (shotClockRunning) return
    setShotClockRunning(true)
    // Write start signal to DB once — public view picks it up via postgres_changes and runs locally
    if (matchRef.current) supabase.from('tournament_matches').update({ shot_clock: shotClock, shot_clock_running: true }).eq('id', matchRef.current.id)
    shotRef.current = setInterval(() => {
      setShotClock(prev => {
        const next = prev <= 1 ? 0 : prev - 1
        if (next === 0) {
          clearInterval(shotRef.current!)
          setShotClockRunning(false)
          if (cfg.autoPlayBuzzer) playBuzzer()
          if (matchRef.current) supabase.from('tournament_matches').update({ shot_clock: 0, shot_clock_running: false }).eq('id', matchRef.current.id)
        }
        return next
      })
    }, 1000)
  }

  function pauseShotClock() {
    clearInterval(shotRef.current!)
    setShotClockRunning(false)
    // Write current value + stopped signal so public view freezes at the right number
    if (matchRef.current) supabase.from('tournament_matches').update({ shot_clock: shotClock, shot_clock_running: false }).eq('id', matchRef.current.id)
  }

  function resetShotClock(val = 24) {
    clearInterval(shotRef.current!)
    setShotClockRunning(false)
    setShotClock(val)
    if (matchRef.current) supabase.from('tournament_matches').update({ shot_clock: val, shot_clock_running: false }).eq('id', matchRef.current.id)
  }

  // ── Score / game controls ────────────────────────────────────────────────
  async function addPoints(team: 1 | 2, pts: number) {
    const m = matchRef.current; if (!m) return
    const key = team === 1 ? 'score1' : 'score2'
    const newVal = Math.max(0, (team === 1 ? m.score1 : m.score2) + pts)
    setMatch(prev => prev ? { ...prev, [key]: newVal } : prev)
    await supabase.from('tournament_matches').update({ [key]: newVal, status: 'live', game_status: 'in_progress' }).eq('id', m.id)
    if (team === 1) { setFlashHome(true); setTimeout(() => setFlashHome(false), 600) }
    else { setFlashAway(true); setTimeout(() => setFlashAway(false), 600) }
    if (cfg.show3Pt && pts === 3) { /* future animation */ }
  }


  async function addFoulDelta(team: 1 | 2, delta: number) {
    const m = matchRef.current; if (!m) return
    const key = team === 1 ? 'fouls1' : 'fouls2'
    const newVal = Math.max(0, (team === 1 ? m.fouls1 : m.fouls2) + delta)
    setMatch(prev => prev ? { ...prev, [key]: newVal } : prev)
    await supabase.from('tournament_matches').update({ [key]: newVal }).eq('id', m.id)
  }

  async function addTimeoutDelta(team: 1 | 2, delta: number) {
    const m = matchRef.current; if (!m) return
    const key = team === 1 ? 'timeouts1' : 'timeouts2'
    const newVal = Math.max(0, (team === 1 ? m.timeouts1 : m.timeouts2) + delta)
    setMatch(prev => prev ? { ...prev, [key]: newVal } : prev)
    await supabase.from('tournament_matches').update({ [key]: newVal }).eq('id', m.id)
  }

  async function setPeriod(delta: number, final = false) {
    const m = matchRef.current; if (!m) return
    clearInterval(clockIntervalRef.current!); setClockRunning(false)
    const newPeriod = final ? m.current_period : Math.max(1, Math.min(10, m.current_period + delta))
    const gs = final ? 'final' : 'in_progress'
    setMatch(prev => prev ? { ...prev, current_period: newPeriod, game_status: gs, game_clock: 0, status: final ? 'completed' : 'live' } : prev)
    await supabase.from('tournament_matches').update({ current_period: newPeriod, game_status: gs, game_clock: 0, status: final ? 'completed' : 'live' }).eq('id', m.id)
  }

  async function fullReset() {
    const m = matchRef.current; if (!m) return
    clearInterval(clockIntervalRef.current!); setClockRunning(false)
    setMatch(prev => prev ? { ...prev, score1: 0, score2: 0, fouls1: 0, fouls2: 0, timeouts1: 3, timeouts2: 3, current_period: 1, game_clock: 0, game_status: 'not_started', status: 'scheduled' } : prev)
    await supabase.from('tournament_matches').update({ score1: 0, score2: 0, fouls1: 0, fouls2: 0, timeouts1: 3, timeouts2: 3, current_period: 1, game_clock: 0, game_status: 'not_started', status: 'scheduled' }).eq('id', m.id)
  }

  async function flipTeams() {
    const m = matchRef.current; if (!m) return
    setMatch(prev => prev ? { ...prev, team1_id: prev.team2_id, team2_id: prev.team1_id, score1: prev.score2, score2: prev.score1, fouls1: prev.fouls2, fouls2: prev.fouls1, timeouts1: prev.timeouts2, timeouts2: prev.timeouts1 } : prev)
    await supabase.from('tournament_matches').update({ team1_id: m.team2_id, team2_id: m.team1_id, score1: m.score2, score2: m.score1, fouls1: m.fouls2, fouls2: m.fouls1, timeouts1: m.timeouts2, timeouts2: m.timeouts1 }).eq('id', m.id)
  }

  async function saveConfig(newCfg: Config) {
    setCfg(newCfg)
    const m = matchRef.current; if (!m) return
    const existingStats = (m.live_stats as Record<string, unknown>) ?? {}
    await supabase.from('tournament_matches').update({ live_stats: { ...existingStats, config: newCfg } }).eq('id', m.id)
  }

  async function updateTeamName(teamId: string, name: string) {
    if (!name.trim()) return
    await supabase.from('tournament_teams').update({ team_name: name.trim() }).eq('id', teamId)
    setTeams(prev => ({ ...prev, [teamId]: { ...prev[teamId], team_name: name.trim() } }))
  }

  async function uploadTeamLogo(teamId: string, file: File) {
    setUpdatingTeam(teamId)
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `teams/${teamId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('tournament-logos').upload(path, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('tournament-logos').getPublicUrl(path)
      await supabase.from('tournament_teams').update({ logo_url: data.publicUrl }).eq('id', teamId)
      setTeams(prev => ({ ...prev, [teamId]: { ...prev[teamId], logo_url: data.publicUrl } }))
    }
    setUpdatingTeam(null)
  }

  async function removeTeamLogo(teamId: string) {
    await supabase.from('tournament_teams').update({ logo_url: null }).eq('id', teamId)
    setTeams(prev => ({ ...prev, [teamId]: { ...prev[teamId], logo_url: null } }))
  }

  // Public view mode
  if (isPublicView) {
    return <BasketballPublicView match={match} teams={teams} cfg={cfg} />
  }

  if (loading) return (
    <div className="page-content" style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
      <div style={{ width: 28, height: 28, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  async function generateBracket() {
    if (!tournamentData || !tournamentId || acceptedTeams.length < 2) return
    setGeneratingBracket(true)
    await supabase.from('tournament_matches').delete().eq('tournament_id', tournamentId)
    const n = acceptedTeams.length
    const rounds = Math.ceil(Math.log2(n))
    const slots = Math.pow(2, rounds)
    const seeded = [...acceptedTeams]
    while (seeded.length < slots) seeded.push(null as unknown as typeof seeded[0])
    const newMatches: object[] = []
    for (let i = 0; i < slots / 2; i++) {
      const t1 = seeded[i * 2]; const t2 = seeded[i * 2 + 1]
      newMatches.push({ tournament_id: tournamentId, team1_id: t1?.id ?? null, team2_id: t2?.id ?? null, round: 1, match_number: i + 1, status: (!t1 || !t2) ? 'completed' : 'scheduled', winner_id: !t1 ? t2?.id ?? null : !t2 ? t1?.id ?? null : null, score1: 0, score2: 0 })
    }
    for (let r = 2; r <= rounds; r++) {
      const inRound = slots / Math.pow(2, r)
      for (let i = 0; i < inRound; i++) {
        newMatches.push({ tournament_id: tournamentId, team1_id: null, team2_id: null, round: r, match_number: i + 1, status: 'scheduled', score1: 0, score2: 0 })
      }
    }
    await supabase.from('tournament_matches').insert(newMatches)
    await loadData()
    setGeneratingBracket(false)
  }

  if (matches.length === 0 && !loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-dark)' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes bs-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ background: '#111827', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => navigate(`/tournaments/${tournamentId}`)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Tournament
        </button>
        <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 14 }}>/</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Basketball Scoreboard</span>
      </div>

      <div style={{ maxWidth: 520, margin: '48px auto', padding: '0 20px', animation: 'bs-in 0.3s ease both' }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: 'rgba(138,21,56,0.15)', border: '1px solid rgba(138,21,56,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, margin: '0 auto 16px' }}>🏀</div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 8, letterSpacing: '-0.02em' }}>Ready to start?</h2>
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Accept teams in the tournament's <strong style={{ color: 'var(--text-primary)' }}>Teams tab</strong>, then come back here to launch the scoreboard.
          </p>
        </div>

        {/* Teams from tournament */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Accepted Teams ({acceptedTeams.length})</div>
            <button onClick={() => navigate(`/tournaments/${tournamentId}`)} style={{ fontSize: 11.5, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, textDecoration: 'underline' }}>
              Manage teams ↗
            </button>
          </div>

          {acceptedTeams.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              No accepted teams yet — go accept teams in the Teams tab first.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {acceptedTeams.map((team, i) => {
                const initials = team.team_name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
                return (
                  <div key={team.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(138,21,56,0.2)', border: '1px solid rgba(138,21,56,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 800, color: 'var(--accent)', flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.5)', overflow: 'hidden', flexShrink: 0 }}>
                      {team.logo_url ? <img src={team.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
                    </div>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{team.team_name}</span>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', flexShrink: 0 }} />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {acceptedTeams.length < 2 && (
          <div style={{ fontSize: 12.5, color: '#f59e0b', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.18)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, textAlign: 'center' }}>
            You need at least 2 accepted teams to start the scoreboard.
          </div>
        )}

        <button onClick={generateBracket} disabled={generatingBracket || acceptedTeams.length < 2} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px', background: acceptedTeams.length < 2 ? 'rgba(255,255,255,0.04)' : 'var(--accent)', border: 'none', borderRadius: 13, color: '#fff', cursor: acceptedTeams.length < 2 ? 'default' : 'pointer', fontWeight: 700, fontSize: 15, fontFamily: 'inherit', opacity: acceptedTeams.length < 2 ? 0.4 : 1, boxShadow: acceptedTeams.length >= 2 ? '0 4px 20px rgba(138,21,56,0.4)' : 'none', transition: 'all 0.15s' }}>
          {generatingBracket
            ? <><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Setting up…</>
            : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="5 12 12 5 19 12"/><polyline points="5 19 12 12 19 19"/></svg>Launch Scoreboard</>
          }
        </button>
      </div>
    </div>
  )

  const home = teams[match?.team1_id ?? '']
  const away = teams[match?.team2_id ?? '']
  const isFinal = match?.game_status === 'final'
  const periodLabels = ['1st','2nd','3rd','4th','OT']
  const periodLabel = isFinal ? 'FINAL' : match?.game_status === 'halftime' ? 'HALF' : (periodLabels[(match?.current_period ?? 1) - 1] ?? `${match?.current_period}th`)
  const clockDisplay = match ? formatClock(match.game_clock, cfg.timerCountsDown, cfg.timerLength) : '0:00'

  const TeamPanel = ({ team, side, score, fouls, timeouts, flash }: { team: Team | undefined; side: 1 | 2; score: number; fouls: number; timeouts: number; flash: boolean }) => {
    const color = side === 1 ? cfg.homeColor : cfg.awayColor
    const textColor = side === 1 ? cfg.homeTextColor : cfg.awayTextColor
    const label = side === 1 ? 'HOME' : 'AWAY'
    return (
      <div style={{ flex: 1, borderRadius: 16, overflow: 'hidden', boxShadow: flash ? `0 0 0 3px ${color}, 0 0 40px ${color}88` : '0 4px 20px rgba(0,0,0,0.3)', transition: 'box-shadow 0.25s' }}>
        {/* Team header */}
        <div style={{ background: color, padding: '16px 16px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: `${textColor}88`, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 15, fontWeight: 900, color: textColor, letterSpacing: '-0.01em', marginBottom: 8 }}>{team?.team_name ?? label}</div>
          <div style={{ fontSize: 54, fontWeight: 900, color: textColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums', textShadow: '0 2px 12px rgba(0,0,0,0.3)' }}>{score}</div>
        </div>

        {/* Controls body */}
        <div style={{ background: '#1a2235', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Score buttons */}
          <div>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, textAlign: 'center' }}>Add Points</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[1,2,3].map(pts => (
                <button key={pts} onClick={() => addPoints(side, pts)} style={{ flex: 1, padding: '11px 4px', background: color, border: 'none', borderRadius: 9, fontWeight: 900, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit', color: textColor, boxShadow: '0 2px 8px rgba(0,0,0,0.3)', transition: 'all 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.15)', e.currentTarget.style.transform = 'translateY(-1px)')}
                  onMouseLeave={e => (e.currentTarget.style.filter = '', e.currentTarget.style.transform = '')}
                  onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.93)')}
                  onMouseUp={e => (e.currentTarget.style.transform = 'translateY(-1px)')}
                >+{pts}</button>
              ))}
            </div>
          </div>
          <button onClick={() => addPoints(side, -1)} style={{ width: '100%', padding: '9px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, color: 'rgba(255,255,255,0.6)', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.1s' }}>−1 point</button>

          {/* Timeouts row */}
          <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{cfg.labelTO}</span>
              <span style={{ fontSize: 20, fontWeight: 900, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{timeouts}</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => addTimeoutDelta(side, 1)} style={{ flex: 1, padding: '7px', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 7, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.1s' }}>+1</button>
              <button onClick={() => addTimeoutDelta(side, -1)} style={{ flex: 1, padding: '7px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, color: 'rgba(255,255,255,0.5)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.1s' }}>−1</button>
            </div>
          </div>

          {/* Fouls row */}
          <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{cfg.labelFO}</span>
              <span style={{ fontSize: 20, fontWeight: 900, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{fouls}</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => addFoulDelta(side, 1)} style={{ flex: 1, padding: '7px', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 7, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.1s' }}>+1</button>
              <button onClick={() => addFoulDelta(side, -1)} style={{ flex: 1, padding: '7px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, color: 'rgba(255,255,255,0.5)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.1s' }}>−1</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-dark)' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes bs-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}} .bs-ctrl-btn{transition:all 0.1s;cursor:pointer;border:none;font-family:inherit;} .bs-ctrl-btn:hover{filter:brightness(1.15);} .bs-ctrl-btn:active{transform:scale(0.94);}`}</style>

      {/* Header */}
      <div style={{ background: '#111827', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={() => navigate(`/tournaments/${tournamentId}`)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Tournament
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Basketball Scoreboard Control</div>
        </div>
        {/* Match selector */}
        {matches.length > 1 && (
          <select value={selectedMatchId ?? ''} onChange={e => selectMatch(e.target.value)} style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', maxWidth: 200 }}>
            {matches.map(m => {
              const t1 = teams[m.team1_id ?? '']?.team_name ?? 'TBD'
              const t2 = teams[m.team2_id ?? '']?.team_name ?? 'TBD'
              return <option key={m.id} value={m.id}>{t1} vs {t2} (R{m.round}·M{m.match_number})</option>
            })}
          </select>
        )}
        <button
          onClick={() => window.open(`/tournaments/${tournamentId}/scoreboard/basketball?view=public`, '_blank')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.35)', borderRadius: 9, color: '#f97316', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0, transition: 'all 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(249,115,22,0.25)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(249,115,22,0.15)')}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Open Public View
        </button>
        <button
          onClick={shareScoreboard}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: copied ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.07)', border: `1px solid ${copied ? 'rgba(74,222,128,0.35)' : 'rgba(255,255,255,0.15)'}`, borderRadius: 9, color: copied ? '#4ade80' : 'rgba(255,255,255,0.75)', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0, transition: 'all 0.2s' }}
          onMouseEnter={e => { if (!copied) e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
          onMouseLeave={e => { if (!copied) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
        >
          {copied ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Link copied!
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              Share
            </>
          )}
        </button>
      </div>

      <div style={{ padding: '16px 20px', maxWidth: 1200, margin: '0 auto' }}>

        {/* Preview toggle */}
        <div style={{ marginBottom: 12 }}>
          <button onClick={() => setShowPreview(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: showPreview ? 'rgba(138,21,56,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${showPreview ? 'rgba(138,21,56,0.35)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 9, color: showPreview ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.15s' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            {showPreview ? 'Hide Preview' : 'Show Scoreboard Preview'}
          </button>
        </div>

        {/* Live preview */}
        {showPreview && (
          <div style={{ marginBottom: 16, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', animation: 'bs-in 0.2s ease both' }}>
            <div style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Scoreboard Preview</span>
            </div>
            <BasketballPublicView match={match} teams={teams} cfg={cfg} />
          </div>
        )}

        {/* Section tabs */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 4, marginBottom: 16, width: 'fit-content' }}>
          {(['controls','setup'] as const).map(s => (
            <button key={s} onClick={() => setActiveSection(s)} style={{ padding: '8px 20px', borderRadius: 9, fontSize: 13, fontWeight: activeSection === s ? 700 : 500, color: activeSection === s ? '#fff' : 'var(--text-muted)', background: activeSection === s ? '#111827' : 'transparent', border: activeSection === s ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', textTransform: 'capitalize' }}>
              {s === 'controls' ? '🎮 Controls' : '⚙️ Setup'}
            </button>
          ))}
        </div>

        {/* ── Controls section ── */}
        {activeSection === 'controls' && (
          <div style={{ animation: 'bs-in 0.2s ease both' }}>
            {!isAdmin && (
              <div style={{ padding: '12px 16px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, marginBottom: 14, fontSize: 13, color: '#f59e0b' }}>
                View-only mode — admin controls not available
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px,200px) 1fr 1fr minmax(160px,180px)', gap: 12, alignItems: 'start' }}>

              {/* ── Timer & Buzzer ── */}
              <div style={{ borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
                <div style={{ background: '#0f172a', padding: '12px 14px 10px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Timer</div>
                  <div style={{ fontSize: 44, fontWeight: 900, color: clockRunning ? '#4ade80' : '#fff', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em', lineHeight: 1, textShadow: clockRunning ? '0 0 20px rgba(74,222,128,0.4)' : 'none', transition: 'color 0.3s' }}>
                    {clockDisplay}
                  </div>
                </div>
                <div style={{ background: '#1a2235', padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                    {[{ label: '+1s', d: 1 },{ label: '+1m', d: 60 },{ label: '−1s', d: -1 },{ label: '−1m', d: -60 }].map(b => (
                      <button key={b.label} className="bs-ctrl-btn" onClick={() => isAdmin && adjustClock(b.d)} style={{ padding: '9px 4px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'rgba(255,255,255,0.8)', fontWeight: 700, fontSize: 12.5, opacity: isAdmin ? 1 : 0.4 }}>{b.label}</button>
                    ))}
                  </div>
                  <button className="bs-ctrl-btn" onClick={() => { if (!isAdmin) return; clockRunning ? pauseClock() : startClock() }} style={{ width: '100%', padding: '12px', background: clockRunning ? 'rgba(239,68,68,0.18)' : 'rgba(74,222,128,0.18)', border: `1px solid ${clockRunning ? 'rgba(239,68,68,0.35)' : 'rgba(74,222,128,0.35)'}`, borderRadius: 10, color: clockRunning ? '#f87171' : '#4ade80', fontWeight: 800, fontSize: 14, opacity: isAdmin ? 1 : 0.4 }}>
                    {clockRunning ? '⏸ Pause' : '▶ Start'}
                  </button>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="bs-ctrl-btn" onClick={() => isAdmin && resetClock()} style={{ flex: 1, padding: '9px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 600, fontSize: 12, opacity: isAdmin ? 1 : 0.4 }}>↺ Reset</button>
                    <button className="bs-ctrl-btn" onClick={() => playBuzzer()} style={{ flex: 1, padding: '9px', background: 'rgba(138,21,56,0.18)', border: '1px solid rgba(138,21,56,0.3)', borderRadius: 9, color: 'var(--accent)', fontWeight: 700, fontSize: 12 }}>🔔 Buzzer</button>
                  </div>

                  {cfg.showShotClock && (
                    <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Shot Clock</span>
                        <span style={{ fontSize: 26, fontWeight: 900, color: shotClock <= 5 ? '#ef4444' : '#f59e0b', fontVariantNumeric: 'tabular-nums' }}>{shotClock}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button className="bs-ctrl-btn" onClick={() => shotClockRunning ? pauseShotClock() : startShotClock()} style={{ flex: 1, padding: '7px', background: shotClockRunning ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 7, color: '#f59e0b', fontWeight: 700, fontSize: 11 }}>
                          {shotClockRunning ? '⏸' : '▶'}
                        </button>
                        <button className="bs-ctrl-btn" onClick={() => resetShotClock(24)} style={{ padding: '7px 10px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: 'rgba(255,255,255,0.7)', fontWeight: 700, fontSize: 11 }}>24</button>
                        <button className="bs-ctrl-btn" onClick={() => resetShotClock(14)} style={{ padding: '7px 10px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: 'rgba(255,255,255,0.7)', fontWeight: 700, fontSize: 11 }}>14</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Home team ── */}
              {isAdmin ? (
                <TeamPanel team={home} side={1} score={match?.score1 ?? 0} fouls={match?.fouls1 ?? 0} timeouts={match?.timeouts1 ?? 0} flash={flashHome} />
              ) : (
                <div style={{ flex: 1, background: cfg.homeColor, borderRadius: 14, padding: 16, opacity: 0.6, textAlign: 'center', color: cfg.homeTextColor, fontWeight: 700 }}>
                  {home?.team_name ?? 'HOME'}<br/><span style={{ fontSize: 36, fontWeight: 900 }}>{match?.score1 ?? 0}</span>
                </div>
              )}

              {/* ── Away team ── */}
              {isAdmin ? (
                <TeamPanel team={away} side={2} score={match?.score2 ?? 0} fouls={match?.fouls2 ?? 0} timeouts={match?.timeouts2 ?? 0} flash={flashAway} />
              ) : (
                <div style={{ flex: 1, background: cfg.awayColor, borderRadius: 14, padding: 16, opacity: 0.6, textAlign: 'center', color: cfg.awayTextColor, fontWeight: 700 }}>
                  {away?.team_name ?? 'AWAY'}<br/><span style={{ fontSize: 36, fontWeight: 900 }}>{match?.score2 ?? 0}</span>
                </div>
              )}

              {/* ── Game controls ── */}
              <div style={{ borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
                <div style={{ background: '#0f172a', padding: '12px 14px 10px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Game</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: isFinal ? '#e9c176' : '#fff', letterSpacing: '-0.01em', lineHeight: 1 }}>{periodLabel}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
                    {isFinal ? 'Game over' : `of ${4} quarters`}
                  </div>
                </div>
                <div style={{ background: '#1a2235', padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                    <button className="bs-ctrl-btn" onClick={() => isAdmin && setPeriod(1)} style={{ padding: '10px 4px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 13, opacity: isAdmin ? 1 : 0.4 }}>+1</button>
                    <button className="bs-ctrl-btn" onClick={() => isAdmin && setPeriod(-1)} style={{ padding: '10px 4px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'rgba(255,255,255,0.5)', fontWeight: 700, fontSize: 13, opacity: isAdmin ? 1 : 0.4 }}>−1</button>
                  </div>
                  <button className="bs-ctrl-btn" onClick={() => isAdmin && setPeriod(0, true)} style={{ width: '100%', padding: '10px', background: 'rgba(233,193,118,0.12)', border: '1px solid rgba(233,193,118,0.28)', borderRadius: 10, color: '#e9c176', fontWeight: 800, fontSize: 13, opacity: isAdmin ? 1 : 0.4 }}>🏁 FINAL</button>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '2px 0' }} />
                  <button className="bs-ctrl-btn" onClick={() => isAdmin && flipTeams()} style={{ width: '100%', padding: '9px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 600, fontSize: 11.5, opacity: isAdmin ? 1 : 0.4 }}>
                    ⇄ Flip Home / Away
                  </button>
                  <button className="bs-ctrl-btn" onClick={() => isAdmin && fullReset()} style={{ width: '100%', padding: '9px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 9, color: '#f87171', fontWeight: 600, fontSize: 12, opacity: isAdmin ? 1 : 0.4 }}>
                    ↺ Reset All
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ── Setup section ── */}
        {activeSection === 'setup' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'bs-in 0.2s ease both' }}>

            {/* Display toggles */}
            <div style={{ background: '#1f2937', borderRadius: 14, padding: '18px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Display Options</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 10 }}>
                {([
                  ['showTimeouts','Show timeouts'],['showFouls','Show fouls'],['showPeriod','Show period'],
                  ['showPossession','Show possession'],['show3Pt','Show 3-pointer animation'],
                  ['showBonus','Show bonus'],['showRecords','Show team records'],
                  ['showTimer','Show timer'],['showShotClock','Show shot clock'],
                ] as [keyof Config, string][]).map(([key, label]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                    <div onClick={() => saveConfig({ ...cfg, [key]: !cfg[key] })} style={{ width: 38, height: 22, borderRadius: 11, background: cfg[key] ? 'rgba(138,43,226,0.8)' : 'rgba(255,255,255,0.12)', border: `1px solid ${cfg[key] ? 'rgba(138,43,226,0.9)' : 'rgba(255,255,255,0.18)'}`, position: 'relative', transition: 'all 0.2s', cursor: 'pointer', flexShrink: 0 }}>
                      <div style={{ position: 'absolute', top: 2, left: cfg[key] ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }} />
                    </div>
                    <span style={{ fontSize: 13, color: cfg[key] ? 'var(--text-primary)' : 'var(--text-muted)' }}>{label}</span>
                  </label>
                ))}
              </div>
              {/* Animation style */}
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Animation style:</div>
                <select defaultValue="scale" style={{ padding: '7px 12px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}>
                  <option value="scale">Scale effect</option>
                  <option value="fade">Fade in</option>
                  <option value="slide">Slide up</option>
                </select>
              </div>
            </div>

            {/* Team setup */}
            <div style={{ background: '#1f2937', borderRadius: 14, padding: '18px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Team Setup</span>
                <button onClick={flipTeams} style={{ padding: '5px 11px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: 'var(--text-muted)', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}>⇄ Flip Home/Away</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {([
                  { label: 'Home', bgKey: 'homeColor' as keyof Config, textKey: 'homeTextColor' as keyof Config, teamId: match?.team1_id ?? '', logoRef: homeLogoRef },
                  { label: 'Away', bgKey: 'awayColor' as keyof Config, textKey: 'awayTextColor' as keyof Config, teamId: match?.team2_id ?? '', logoRef: awayLogoRef },
                ]).map(({ label, bgKey, textKey, teamId, logoRef }) => {
                  const teamObj = teams[teamId]
                  const isUploading = updatingTeam === teamId
                  const initials = (teamObj?.team_name ?? label).trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
                  return (
                    <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label} Team</div>

                      {/* Logo */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          onClick={() => !isUploading && logoRef.current?.click()}
                          style={{ width: 48, height: 48, borderRadius: 11, background: teamObj?.logo_url ? 'transparent' : 'rgba(255,255,255,0.06)', border: '2px dashed rgba(255,255,255,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, position: 'relative', transition: 'border-color 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)')}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)')}
                        >
                          {isUploading ? (
                            <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                          ) : teamObj?.logo_url ? (
                            <img src={teamObj.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                          )}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{teamObj?.team_name ?? initials}</div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => logoRef.current?.click()} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, fontWeight: 600 }}>
                              {teamObj?.logo_url ? 'Change logo' : 'Upload logo'}
                            </button>
                            {teamObj?.logo_url && (
                              <>
                                <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>·</span>
                                <button onClick={() => removeTeamLogo(teamId)} style={{ fontSize: 11, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Remove</button>
                              </>
                            )}
                          </div>
                        </div>
                        <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f && teamId) uploadTeamLogo(teamId, f); e.target.value = '' }} />
                      </div>

                      {/* Team name */}
                      <div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Team name</div>
                        <input
                          defaultValue={teamObj?.team_name ?? ''}
                          key={teamObj?.team_name}
                          onBlur={e => teamId && updateTeamName(teamId, e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                          placeholder="Team name"
                          style={{ width: '100%', padding: '7px 10px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                        />
                      </div>

                      {/* Colors */}
                      <div style={{ display: 'flex', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1 }}>
                          <input type="color" value={cfg[bgKey] as string} onChange={e => saveConfig({ ...cfg, [bgKey]: e.target.value })} style={{ width: 32, height: 26, borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', background: 'transparent', padding: 2, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Background</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1 }}>
                          <input type="color" value={cfg[textKey] as string} onChange={e => saveConfig({ ...cfg, [textKey]: e.target.value })} style={{ width: 32, height: 26, borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', background: 'transparent', padding: 2, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Text</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Labels + Board colors + Title */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px,1fr))', gap: 14 }}>
              {/* Labels */}
              <div style={{ background: '#1f2937', borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Labels</div>
                {([['labelTO','TO label','TO'],['labelFO','FO label','FO'],['labelBonus','Bonus label','BONUS']] as [keyof Config,string,string][]).map(([key,label,ph]) => (
                  <div key={key} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                    <input value={cfg[key] as string} onChange={e => saveConfig({ ...cfg, [key]: e.target.value })} placeholder={ph} style={{ width: '100%', padding: '7px 10px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  </div>
                ))}
              </div>

              {/* Board colors */}
              <div style={{ background: '#1f2937', borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Board Colors</div>
                {([['boardBg','Background'],['boardText','Text'],['possessionColor','Possession']] as [keyof Config,string][]).map(([key,label]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</span>
                    <input type="color" value={cfg[key] as string} onChange={e => saveConfig({ ...cfg, [key]: e.target.value })} style={{ width: 48, height: 30, borderRadius: 7, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', background: 'transparent', padding: 2 }} />
                  </div>
                ))}
              </div>

              {/* Title */}
              <div style={{ background: '#1f2937', borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Title</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, cursor: 'pointer' }}>
                  <div onClick={() => saveConfig({ ...cfg, showTitle: !cfg.showTitle })} style={{ width: 38, height: 22, borderRadius: 11, background: cfg.showTitle ? 'rgba(138,43,226,0.8)' : 'rgba(255,255,255,0.12)', border: `1px solid ${cfg.showTitle ? 'rgba(138,43,226,0.9)' : 'rgba(255,255,255,0.18)'}`, position: 'relative', transition: 'all 0.2s', cursor: 'pointer', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: 2, left: cfg.showTitle ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Show a title</span>
                </label>
                {cfg.showTitle && (
                  <input value={cfg.titleText} onChange={e => saveConfig({ ...cfg, titleText: e.target.value })} placeholder="Basketball Scoreboard" style={{ width: '100%', padding: '8px 10px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                )}
              </div>
            </div>

            {/* Timer + Font settings */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px,1fr))', gap: 14 }}>
              {/* Timer settings */}
              <div style={{ background: '#1f2937', borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Timer Settings</div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 5 }}>Timer length (minutes:seconds)</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      value={`${Math.floor(cfg.timerLength / 60)}:${(cfg.timerLength % 60).toString().padStart(2,'0')}`}
                      onChange={e => {
                        const [m, s] = e.target.value.split(':').map(Number)
                        if (!isNaN(m) && !isNaN(s)) saveConfig({ ...cfg, timerLength: m * 60 + (s || 0) })
                      }}
                      placeholder="10:00"
                      style={{ flex: 1, padding: '7px 10px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {([['timerCountsDown','Timer counts down'],['autoPlayBuzzer','Auto play buzzer']] as [keyof Config,string][]).map(([key,label]) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                      <div onClick={() => saveConfig({ ...cfg, [key]: !cfg[key] })} style={{ width: 38, height: 22, borderRadius: 11, background: cfg[key] ? 'rgba(138,43,226,0.8)' : 'rgba(255,255,255,0.12)', position: 'relative', transition: 'all 0.2s', cursor: 'pointer', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', top: 2, left: cfg[key] ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                      </div>
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</span>
                    </label>
                  ))}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input type="radio" checked={!cfg.timerCountsDown} onChange={() => saveConfig({ ...cfg, timerCountsDown: false })} style={{ accentColor: 'rgba(138,43,226,0.9)' }} />
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Timer counts up</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input type="radio" checked={cfg.timerCountsDown} onChange={() => saveConfig({ ...cfg, timerCountsDown: true })} style={{ accentColor: 'rgba(138,43,226,0.9)' }} />
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Timer counts down</span>
                  </label>
                </div>
              </div>

              {/* Font size */}
              <div style={{ background: '#1f2937', borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Fonts</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Change font size</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => saveConfig({ ...cfg, fontSize: Math.max(60, cfg.fontSize - 10) })} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 16, fontFamily: 'inherit' }}>−</button>
                  <span style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: 700, color: '#fff' }}>{cfg.fontSize}%</span>
                  <button onClick={() => saveConfig({ ...cfg, fontSize: Math.min(160, cfg.fontSize + 10) })} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 16, fontFamily: 'inherit' }}>+</button>
                  <button onClick={() => saveConfig({ ...cfg, fontSize: 100 })} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Reset</button>
                </div>
              </div>

              {/* Audio */}
              <div style={{ background: '#1f2937', borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Audio Settings</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <div onClick={() => saveConfig({ ...cfg, enableAudio: !cfg.enableAudio })} style={{ width: 38, height: 22, borderRadius: 11, background: cfg.enableAudio ? 'rgba(138,43,226,0.8)' : 'rgba(255,255,255,0.12)', position: 'relative', transition: 'all 0.2s', cursor: 'pointer', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: 2, left: cfg.enableAudio ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Enable Audio on Public View</span>
                </label>
                <div style={{ marginTop: 12 }}>
                  <button onClick={playBuzzer} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: 'rgba(138,21,56,0.15)', border: '1px solid rgba(138,21,56,0.3)', borderRadius: 8, color: 'var(--accent)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit' }}>
                    🔔 Test Buzzer
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
