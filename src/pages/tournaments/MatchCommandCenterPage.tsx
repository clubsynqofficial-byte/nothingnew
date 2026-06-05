import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

interface Match {
  id: string; tournament_id: string
  team1_id: string | null; team2_id: string | null
  score1: number; score2: number
  status: 'scheduled' | 'live' | 'completed'
  game_status: 'not_started' | 'in_progress' | 'halftime' | 'extra_time' | 'final'
  current_period: number; game_clock: number
  fouls1: number; fouls2: number
  timeouts1: number; timeouts2: number
  live_stats: Record<string, unknown> | null
  round: number; match_number: number; winner_id: string | null
}

interface Team { id: string; team_name: string; logo_url: string | null }

interface Cfg {
  homeColor: string; awayColor: string
  homeTextColor: string; awayTextColor: string
  boardBg: string; boardText: string
  titleText: string; showTitle: boolean
  showTimer: boolean; showPeriod: boolean; showFouls: boolean
  showCards: boolean; showTimeouts: boolean
  timerLength: number; timerCountsDown: boolean
  fontSize: number; periods: number; autoPlayBuzzer: boolean
}

const DEFAULT_CFG: Cfg = {
  homeColor: '#16a34a', awayColor: '#1d4ed8',
  homeTextColor: '#ffffff', awayTextColor: '#ffffff',
  boardBg: '#0f172a', boardText: '#ffffff',
  titleText: 'Live Match', showTitle: true,
  showTimer: true, showPeriod: true, showFouls: true,
  showCards: true, showTimeouts: false,
  timerLength: 2700, timerCountsDown: true,
  fontSize: 100, periods: 2, autoPlayBuzzer: false,
}

function fmtClock(secs: number, down: boolean, length: number) {
  const val = down ? Math.max(0, length - secs) : secs
  const m = Math.floor(val / 60); const s = val % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function buzz() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator(); const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.6, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)
    osc.start(); osc.stop(ctx.currentTime + 0.8)
    setTimeout(() => ctx.close(), 1200)
  } catch {}
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <div onClick={onChange} style={{ width: 40, height: 22, borderRadius: 11, background: on ? '#8b2252' : 'rgba(255,255,255,0.12)', border: `1px solid ${on ? 'rgba(139,34,82,0.9)' : 'rgba(255,255,255,0.18)'}`, position: 'relative', transition: 'all 0.2s', cursor: 'pointer', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }} />
    </div>
  )
}

// ── Public scoreboard view (shown at ?view=public) ──────────────────────────────
export function MatchPublicView({ match, teams, cfg }: { match: Match | null; teams: Record<string, Team>; cfg: Cfg }) {
  const stats = (match?.live_stats ?? {}) as Record<string, number>
  if (!match) return (
    <div style={{ minHeight: '100vh', background: cfg.boardBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.3)' }}>Waiting for match to start…</div>
    </div>
  )
  const home = teams[match.team1_id ?? '']
  const away = teams[match.team2_id ?? '']
  const isFinal = match.game_status === 'final'
  const isHalf = match.game_status === 'halftime'
  const isET = match.game_status === 'extra_time'
  const clockStr = fmtClock(match.game_clock, cfg.timerCountsDown, cfg.timerLength)
  const p = match.current_period
  const periodLabel = isFinal ? 'FULL TIME' : isHalf ? 'HALF TIME' : isET ? 'EXTRA TIME'
    : cfg.periods === 4 ? `Q${p}` : p === 1 ? '1ST HALF' : '2ND HALF'
  const fs = (n: number) => Math.round(n * cfg.fontSize / 100)

  return (
    <div style={{ minHeight: '100vh', background: cfg.boardBg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'inherit', position: 'relative', overflow: 'hidden' }}>
      <style>{`@keyframes cc-glow{0%,100%{opacity:1}50%{opacity:.6}} @keyframes cc-in{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}`}</style>
      {/* Background ambient glow */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '30%', left: '15%', width: 400, height: 400, borderRadius: '50%', background: `${cfg.homeColor}18`, filter: 'blur(80px)' }} />
        <div style={{ position: 'absolute', top: '30%', right: '15%', width: 400, height: 400, borderRadius: '50%', background: `${cfg.awayColor}18`, filter: 'blur(80px)' }} />
      </div>

      {cfg.showTitle && (
        <div style={{ fontSize: fs(13), fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 20, textTransform: 'uppercase', letterSpacing: '0.16em', position: 'relative' }}>
          {cfg.titleText}
        </div>
      )}

      <div style={{ width: '100%', maxWidth: 700, borderRadius: 22, overflow: 'hidden', boxShadow: '0 32px 100px rgba(0,0,0,0.7)', animation: 'cc-in 0.4s ease both', position: 'relative' }}>
        {/* Home */}
        <div style={{ display: 'flex', alignItems: 'center', background: cfg.homeColor, padding: `${fs(18)}px ${fs(28)}px` }}>
          {home?.logo_url ? (
            <div style={{ width: fs(56), height: fs(56), borderRadius: 12, overflow: 'hidden', marginRight: fs(18), flexShrink: 0, border: '2px solid rgba(255,255,255,0.25)', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
              <img src={home.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ) : (
            <div style={{ width: fs(48), height: fs(48), borderRadius: 12, background: 'rgba(255,255,255,0.15)', marginRight: fs(16), flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: fs(18), fontWeight: 900, color: cfg.homeTextColor }}>
              {(home?.team_name ?? 'H').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: fs(26), fontWeight: 900, color: cfg.homeTextColor, textTransform: 'uppercase', lineHeight: 1.1, letterSpacing: '-0.01em' }}>{home?.team_name ?? 'HOME'}</div>
            <div style={{ display: 'flex', gap: 14, marginTop: 4, flexWrap: 'wrap' }}>
              {cfg.showFouls && <span style={{ fontSize: fs(12), color: `${cfg.homeTextColor}bb` }}>Fouls: {match.fouls1}</span>}
              {cfg.showCards && (stats.yellows1 ?? 0) > 0 && <span style={{ fontSize: fs(12) }}>🟨 {stats.yellows1}</span>}
              {cfg.showCards && (stats.reds1 ?? 0) > 0 && <span style={{ fontSize: fs(12) }}>🟥 {stats.reds1}</span>}
              {cfg.showTimeouts && <span style={{ fontSize: fs(12), color: `${cfg.homeTextColor}bb` }}>TO: {match.timeouts1}</span>}
            </div>
          </div>
          <div style={{ fontSize: fs(68), fontWeight: 900, color: cfg.homeTextColor, lineHeight: 1, minWidth: fs(80), textAlign: 'right', fontVariantNumeric: 'tabular-nums', textShadow: `0 0 40px ${cfg.homeColor}88` }}>
            {match.score1}
          </div>
        </div>

        <div style={{ height: 2, background: 'rgba(0,0,0,0.4)' }} />

        {/* Away */}
        <div style={{ display: 'flex', alignItems: 'center', background: cfg.awayColor, padding: `${fs(18)}px ${fs(28)}px` }}>
          {away?.logo_url ? (
            <div style={{ width: fs(56), height: fs(56), borderRadius: 12, overflow: 'hidden', marginRight: fs(18), flexShrink: 0, border: '2px solid rgba(255,255,255,0.25)', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
              <img src={away.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ) : (
            <div style={{ width: fs(48), height: fs(48), borderRadius: 12, background: 'rgba(255,255,255,0.15)', marginRight: fs(16), flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: fs(18), fontWeight: 900, color: cfg.awayTextColor }}>
              {(away?.team_name ?? 'A').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: fs(26), fontWeight: 900, color: cfg.awayTextColor, textTransform: 'uppercase', lineHeight: 1.1, letterSpacing: '-0.01em' }}>{away?.team_name ?? 'AWAY'}</div>
            <div style={{ display: 'flex', gap: 14, marginTop: 4, flexWrap: 'wrap' }}>
              {cfg.showFouls && <span style={{ fontSize: fs(12), color: `${cfg.awayTextColor}bb` }}>Fouls: {match.fouls2}</span>}
              {cfg.showCards && (stats.yellows2 ?? 0) > 0 && <span style={{ fontSize: fs(12) }}>🟨 {stats.yellows2}</span>}
              {cfg.showCards && (stats.reds2 ?? 0) > 0 && <span style={{ fontSize: fs(12) }}>🟥 {stats.reds2}</span>}
              {cfg.showTimeouts && <span style={{ fontSize: fs(12), color: `${cfg.awayTextColor}bb` }}>TO: {match.timeouts2}</span>}
            </div>
          </div>
          <div style={{ fontSize: fs(68), fontWeight: 900, color: cfg.awayTextColor, lineHeight: 1, minWidth: fs(80), textAlign: 'right', fontVariantNumeric: 'tabular-nums', textShadow: `0 0 40px ${cfg.awayColor}88` }}>
            {match.score2}
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{ background: '#080d16', padding: `${fs(14)}px ${fs(28)}px`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {cfg.showTimer ? (
            <div style={{ fontSize: fs(24), fontWeight: 800, color: (isFinal || isHalf) ? 'rgba(255,255,255,0.3)' : '#fff', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em' }}>
              {(isFinal || isHalf) ? '—' : clockStr}
            </div>
          ) : <div />}
          {cfg.showPeriod && (
            <div style={{ fontSize: fs(16), fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: match.game_status === 'in_progress' ? '#f97316' : isHalf ? '#60a5fa' : isET ? '#f59e0b' : isFinal ? '#e9c176' : 'rgba(255,255,255,0.4)' }}>
              {periodLabel}
            </div>
          )}
        </div>
      </div>

      {match.game_status === 'in_progress' && (
        <div style={{ position: 'absolute', top: 20, right: 24, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316', animation: 'cc-glow 1.4s ease-in-out infinite', boxShadow: '0 0 12px rgba(249,115,22,0.8)' }} />
          <span style={{ fontSize: 11, fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Live</span>
        </div>
      )}
    </div>
  )
}

// ── Admin Command Center ─────────────────────────────────────────────────────────
export default function MatchCommandCenterPage() {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const [searchParams] = useSearchParams()
  const isPublicView = searchParams.get('view') === 'public'
  const navigate = useNavigate()
  const { user } = useAuth()

  const matchParam = searchParams.get('match')

  const [matches, setMatches] = useState<Match[]>([])
  const [teams, setTeams] = useState<Record<string, Team>>({})
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(matchParam)
  const [match, setMatch] = useState<Match | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [cfg, setCfg] = useState<Cfg>(DEFAULT_CFG)
  const [activeSection, setActiveSection] = useState<'controls' | 'setup'>('controls')
  const [showPreview, setShowPreview] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tournamentName, setTournamentName] = useState('')

  // Clock
  const [clockRunning, setClockRunning] = useState(false)
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const clockCounterRef = useRef(0)
  const matchRef = useRef<Match | null>(null)
  matchRef.current = match

  // Extra stats in live_stats: yellows1/2, reds1/2
  const stats = ((match?.live_stats ?? {}) as Record<string, number>)

  const loadData = useCallback(async () => {
    if (!tournamentId) return
    setLoading(true)
    const { data: tData } = await supabase.from('tournaments').select('id, name, club_id, created_by').eq('id', tournamentId).single()
    if (tData) setTournamentName(tData.name)
    const { data: matchData } = await supabase.from('tournament_matches').select('*').eq('tournament_id', tournamentId).in('status', ['live', 'scheduled', 'completed']).order('round').order('match_number')
    const { data: teamsData } = await supabase.from('tournament_teams').select('id, team_name, logo_url').eq('tournament_id', tournamentId).eq('status', 'accepted')
    const teamMap: Record<string, Team> = {}
    for (const t of teamsData ?? []) teamMap[t.id] = t
    setTeams(teamMap)
    const allMatches = (matchData ?? []) as Match[]
    setMatches(allMatches)
    const pinned = matchParam ? allMatches.find(m => m.id === matchParam) : null
    const live = allMatches.find(m => m.status === 'live')
    const first = allMatches[0]
    const auto = pinned ?? live ?? first ?? null
    if (auto) {
      setSelectedMatchId(auto.id)
      setMatch(auto as Match)
      const savedCfg = (auto.live_stats as Record<string, unknown>)?.config
      if (savedCfg) setCfg(c => ({ ...c, ...(savedCfg as Cfg) }))
    }
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

  // Realtime subscription
  useEffect(() => {
    if (!selectedMatchId) return
    const ch = supabase.channel(`mcc-${selectedMatchId}-${isPublicView ? 'pub' : 'adm'}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tournament_matches', filter: `id=eq.${selectedMatchId}` },
        p => setMatch(p.new as Match))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [selectedMatchId, isPublicView])

  // Public view: poll every second
  useEffect(() => {
    if (!isPublicView || !selectedMatchId) return
    const poll = setInterval(async () => {
      const { data } = await supabase.from('tournament_matches').select('*').eq('id', selectedMatchId).single()
      if (data) setMatch(data as Match)
    }, 1000)
    return () => clearInterval(poll)
  }, [isPublicView, selectedMatchId])

  useEffect(() => () => {
    if (clockRef.current) clearInterval(clockRef.current)
  }, [])

  function selectMatch(id: string) {
    const m = matches.find(mx => mx.id === id) ?? null
    setSelectedMatchId(id)
    setMatch(m)
    setClockRunning(false)
    if (clockRef.current) clearInterval(clockRef.current)
    const savedCfg = (m?.live_stats as Record<string, unknown>)?.config
    if (savedCfg) setCfg(c => ({ ...c, ...(savedCfg as Cfg) }))
  }

  // ── Clock ────────────────────────────────────────────────────────────────────
  function startClock() {
    if (clockRunning) return
    const m = matchRef.current; if (!m) return
    clockCounterRef.current = m.game_clock
    setClockRunning(true)
    clockRef.current = setInterval(async () => {
      clockCounterRef.current += 1
      const newClock = clockCounterRef.current
      const cur = matchRef.current; if (!cur) return
      if (newClock >= cfg.timerLength) {
        clearInterval(clockRef.current!); setClockRunning(false)
        clockCounterRef.current = cfg.timerLength
        setMatch(prev => prev ? { ...prev, game_clock: cfg.timerLength } : prev)
        await supabase.from('tournament_matches').update({ game_clock: cfg.timerLength, game_status: 'in_progress', status: 'live' }).eq('id', cur.id)
        if (cfg.autoPlayBuzzer) buzz()
      } else {
        setMatch(prev => prev ? { ...prev, game_clock: newClock } : prev)
        await supabase.from('tournament_matches').update({ game_clock: newClock, game_status: 'in_progress', status: 'live' }).eq('id', cur.id)
      }
    }, 1000)
  }

  async function pauseClock() {
    clearInterval(clockRef.current!); clockRef.current = null; setClockRunning(false)
    const paused = clockCounterRef.current
    setMatch(prev => prev ? { ...prev, game_clock: paused } : prev)
    if (matchRef.current) await supabase.from('tournament_matches').update({ game_clock: paused }).eq('id', matchRef.current.id)
  }

  async function resetClock() {
    clearInterval(clockRef.current!); clockRef.current = null
    clockCounterRef.current = 0; setClockRunning(false)
    setMatch(prev => prev ? { ...prev, game_clock: 0 } : prev)
    if (matchRef.current) await supabase.from('tournament_matches').update({ game_clock: 0 }).eq('id', matchRef.current.id)
  }

  function adjustClock(delta: number) {
    const actualDelta = cfg.timerCountsDown ? -delta : delta
    const m = matchRef.current; if (!m) return
    const newClock = Math.max(0, Math.min(cfg.timerLength, m.game_clock + actualDelta))
    clockCounterRef.current = newClock
    setMatch(prev => prev ? { ...prev, game_clock: newClock } : prev)
    supabase.from('tournament_matches').update({ game_clock: newClock }).eq('id', m.id)
  }

  // ── Score ───────────────────────────────────────────────────────────────────
  async function addScore(team: 1 | 2, delta: number) {
    const m = matchRef.current; if (!m) return
    const key = team === 1 ? 'score1' : 'score2'
    const cur = team === 1 ? m.score1 : m.score2
    const newVal = Math.max(0, cur + delta)
    setMatch(prev => prev ? { ...prev, [key]: newVal } : prev)
    await supabase.from('tournament_matches').update({ [key]: newVal, status: 'live', game_status: 'in_progress' }).eq('id', m.id)
  }

  // ── Fouls ───────────────────────────────────────────────────────────────────
  async function addFoul(team: 1 | 2, delta: number) {
    const m = matchRef.current; if (!m) return
    const key = team === 1 ? 'fouls1' : 'fouls2'
    const cur = team === 1 ? m.fouls1 : m.fouls2
    const newVal = Math.max(0, cur + delta)
    setMatch(prev => prev ? { ...prev, [key]: newVal } : prev)
    await supabase.from('tournament_matches').update({ [key]: newVal }).eq('id', m.id)
  }

  // ── Timeouts ────────────────────────────────────────────────────────────────
  async function addTimeout(team: 1 | 2, delta: number) {
    const m = matchRef.current; if (!m) return
    const key = team === 1 ? 'timeouts1' : 'timeouts2'
    const cur = team === 1 ? m.timeouts1 : m.timeouts2
    const newVal = Math.max(0, cur + delta)
    setMatch(prev => prev ? { ...prev, [key]: newVal } : prev)
    await supabase.from('tournament_matches').update({ [key]: newVal }).eq('id', m.id)
  }

  // ── Cards (stored in live_stats) ────────────────────────────────────────────
  async function addCard(team: 1 | 2, type: 'yellow' | 'red', delta: number) {
    const m = matchRef.current; if (!m) return
    const key = `${type === 'yellow' ? 'yellows' : 'reds'}${team}`
    const cur = ((m.live_stats ?? {}) as Record<string, number>)[key] ?? 0
    const newVal = Math.max(0, cur + delta)
    const newStats = { ...(m.live_stats ?? {}), [key]: newVal }
    setMatch(prev => prev ? { ...prev, live_stats: newStats } : prev)
    await supabase.from('tournament_matches').update({ live_stats: newStats }).eq('id', m.id)
  }

  // ── Period / Game Status ─────────────────────────────────────────────────────
  async function setPeriod(delta: number) {
    const m = matchRef.current; if (!m) return
    clearInterval(clockRef.current!); setClockRunning(false)
    const newPeriod = Math.max(1, Math.min(cfg.periods + 1, m.current_period + delta))
    setMatch(prev => prev ? { ...prev, current_period: newPeriod, game_clock: 0, game_status: 'in_progress' } : prev)
    clockCounterRef.current = 0
    await supabase.from('tournament_matches').update({ current_period: newPeriod, game_clock: 0, game_status: 'in_progress', status: 'live' }).eq('id', m.id)
  }

  async function setGameStatus(gs: Match['game_status']) {
    const m = matchRef.current; if (!m) return
    if (gs === 'halftime' || gs === 'extra_time') {
      clearInterval(clockRef.current!); setClockRunning(false)
    }
    const isOver = gs === 'final'
    setMatch(prev => prev ? { ...prev, game_status: gs, status: isOver ? 'completed' : 'live' } : prev)
    await supabase.from('tournament_matches').update({ game_status: gs, status: isOver ? 'completed' : 'live' }).eq('id', m.id)
  }

  async function declareWinner(teamId: string | null) {
    const m = matchRef.current; if (!m) return
    clearInterval(clockRef.current!); setClockRunning(false)
    setMatch(prev => prev ? { ...prev, winner_id: teamId, game_status: 'final', status: 'completed' } : prev)
    await supabase.from('tournament_matches').update({ winner_id: teamId, game_status: 'final', status: 'completed' }).eq('id', m.id)
  }

  async function fullReset() {
    const m = matchRef.current; if (!m) return
    clearInterval(clockRef.current!); setClockRunning(false)
    clockCounterRef.current = 0
    const newStats = { ...(m.live_stats ?? {}), yellows1: 0, yellows2: 0, reds1: 0, reds2: 0 }
    setMatch(prev => prev ? { ...prev, score1: 0, score2: 0, fouls1: 0, fouls2: 0, timeouts1: 3, timeouts2: 3, current_period: 1, game_clock: 0, game_status: 'not_started', status: 'scheduled', winner_id: null, live_stats: newStats } : prev)
    await supabase.from('tournament_matches').update({ score1: 0, score2: 0, fouls1: 0, fouls2: 0, timeouts1: 3, timeouts2: 3, current_period: 1, game_clock: 0, game_status: 'not_started', status: 'scheduled', winner_id: null, live_stats: newStats }).eq('id', m.id)
  }

  async function saveCfg(newCfg: Cfg) {
    setCfg(newCfg)
    const m = matchRef.current; if (!m) return
    const existing = (m.live_stats as Record<string, unknown>) ?? {}
    await supabase.from('tournament_matches').update({ live_stats: { ...existing, config: newCfg } }).eq('id', m.id)
  }

  function shareLink() {
    const url = `${window.location.origin}/tournaments/${tournamentId}/control?view=public${selectedMatchId ? `&match=${selectedMatchId}` : ''}`
    if (navigator.share) navigator.share({ title: 'Live Match Scoreboard', url })
    else { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500) }
  }

  // Public view
  if (isPublicView) return <MatchPublicView match={match} teams={teams} cfg={cfg} />

  if (loading) return (
    <div className="page-content" style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 28, height: 28, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  const home = teams[match?.team1_id ?? '']
  const away = teams[match?.team2_id ?? '']
  const isFinal = match?.game_status === 'final'
  const clockDisplay = match ? fmtClock(match.game_clock, cfg.timerCountsDown, cfg.timerLength) : '0:00'
  const p = match?.current_period ?? 1
  const periodLabel = isFinal ? 'FULL TIME' : match?.game_status === 'halftime' ? 'HALF TIME'
    : match?.game_status === 'extra_time' ? 'EXTRA TIME'
    : cfg.periods === 4 ? `Q${p}` : p === 1 ? '1ST HALF' : '2ND HALF'

  // Team panel component
  const TeamPanel = ({ team, side, score, fouls, timeouts }: { team: Team | undefined; side: 1 | 2; score: number; fouls: number; timeouts: number }) => {
    const color = side === 1 ? cfg.homeColor : cfg.awayColor
    const textColor = side === 1 ? cfg.homeTextColor : cfg.awayTextColor
    const label = side === 1 ? 'HOME' : 'AWAY'
    const yellows = stats[`yellows${side}`] ?? 0
    const reds = stats[`reds${side}`] ?? 0
    return (
      <div style={{ flex: 1, borderRadius: 18, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.35)' }}>
        {/* Header */}
        <div style={{ background: color, padding: '16px 14px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: `${textColor}88`, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 4 }}>{label}</div>
          {team?.logo_url && (
            <div style={{ width: 36, height: 36, borderRadius: 8, overflow: 'hidden', margin: '0 auto 6px', border: '2px solid rgba(255,255,255,0.2)' }}>
              <img src={team.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}
          <div style={{ fontSize: 13.5, fontWeight: 900, color: textColor, marginBottom: 6, lineHeight: 1.2 }}>{team?.team_name ?? label}</div>
          <div style={{ fontSize: 58, fontWeight: 900, color: textColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{score}</div>
        </div>

        {/* Controls */}
        <div style={{ background: '#1a2235', padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Score +/- */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5, textAlign: 'center' }}>Score</div>
            <div style={{ display: 'flex', gap: 5, marginBottom: 5 }}>
              {[1, 2, 3].map(n => (
                <button key={n} onClick={() => isAdmin && addScore(side, n)}
                  style={{ flex: 1, padding: '11px 0', background: color, border: 'none', borderRadius: 9, color: textColor, fontWeight: 900, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', opacity: isAdmin ? 1 : 0.4, boxShadow: '0 2px 8px rgba(0,0,0,0.3)', transition: 'filter 0.1s, transform 0.1s' }}
                  onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.2)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = '' }}
                >+{n}</button>
              ))}
            </div>
            <button onClick={() => isAdmin && addScore(side, -1)} style={{ width: '100%', padding: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'rgba(255,255,255,0.55)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', opacity: isAdmin ? 1 : 0.4 }}>−1</button>
          </div>

          {/* Fouls */}
          <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: '8px 10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Fouls</span>
              <span style={{ fontSize: 20, fontWeight: 900, color: fouls >= 5 ? '#f87171' : '#fff', fontVariantNumeric: 'tabular-nums' }}>{fouls}</span>
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              <button onClick={() => isAdmin && addFoul(side, 1)} style={{ flex: 1, padding: '6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 7, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', opacity: isAdmin ? 1 : 0.4 }}>+1</button>
              <button onClick={() => isAdmin && addFoul(side, -1)} style={{ flex: 1, padding: '6px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, color: 'rgba(255,255,255,0.45)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', opacity: isAdmin ? 1 : 0.4 }}>−1</button>
            </div>
          </div>

          {/* Cards */}
          <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: '8px 10px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>Cards</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 11 }}>🟨</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#f59e0b', fontVariantNumeric: 'tabular-nums' }}>{yellows}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => isAdmin && addCard(side, 'yellow', 1)} style={{ flex: 1, padding: '5px', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, color: '#f59e0b', fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', opacity: isAdmin ? 1 : 0.4 }}>+</button>
                  <button onClick={() => isAdmin && addCard(side, 'yellow', -1)} style={{ flex: 1, padding: '5px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: 'rgba(255,255,255,0.4)', fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', opacity: isAdmin ? 1 : 0.4 }}>−</button>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 11 }}>🟥</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#f87171', fontVariantNumeric: 'tabular-nums' }}>{reds}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => isAdmin && addCard(side, 'red', 1)} style={{ flex: 1, padding: '5px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#f87171', fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', opacity: isAdmin ? 1 : 0.4 }}>+</button>
                  <button onClick={() => isAdmin && addCard(side, 'red', -1)} style={{ flex: 1, padding: '5px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: 'rgba(255,255,255,0.4)', fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', opacity: isAdmin ? 1 : 0.4 }}>−</button>
                </div>
              </div>
            </div>
          </div>

          {/* Timeouts */}
          {cfg.showTimeouts && (
            <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Timeouts</span>
                <span style={{ fontSize: 20, fontWeight: 900, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{timeouts}</span>
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                <button onClick={() => isAdmin && addTimeout(side, 1)} style={{ flex: 1, padding: '6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 7, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', opacity: isAdmin ? 1 : 0.4 }}>+1</button>
                <button onClick={() => isAdmin && addTimeout(side, -1)} style={{ flex: 1, padding: '6px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, color: 'rgba(255,255,255,0.45)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', opacity: isAdmin ? 1 : 0.4 }}>−1</button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-dark)' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes cc-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}} @keyframes live-pulse{0%,100%{opacity:1;box-shadow:0 0 6px rgba(249,115,22,.8)}50%{opacity:.5;box-shadow:0 0 16px rgba(249,115,22,.3)}}`}</style>

      {/* ── Header ── */}
      <div style={{ background: '#0f1623', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '11px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={() => navigate(`/tournaments/${tournamentId}`)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'rgba(255,255,255,0.45)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          {tournamentName || 'Tournament'}
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>
            <span style={{ marginRight: 8 }}>🎮</span>Match Command Center
          </div>
        </div>

        {/* Match selector */}
        {matches.length > 1 && (
          <select value={selectedMatchId ?? ''} onChange={e => selectMatch(e.target.value)} style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, color: '#fff', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', maxWidth: 200 }}>
            {matches.map(m => {
              const t1 = teams[m.team1_id ?? '']?.team_name ?? 'TBD'
              const t2 = teams[m.team2_id ?? '']?.team_name ?? 'TBD'
              return <option key={m.id} value={m.id}>{t1} vs {t2} (R{m.round}·M{m.match_number})</option>
            })}
          </select>
        )}

        {/* Live badge */}
        {match?.status === 'live' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', animation: 'live-pulse 1.4s ease-in-out infinite' }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Live</span>
          </div>
        )}

        <button onClick={() => window.open(`/tournaments/${tournamentId}/control?view=public${selectedMatchId ? `&match=${selectedMatchId}` : ''}`, '_blank')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 8, color: '#f97316', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Public View
        </button>
        <button onClick={shareLink} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', background: copied ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.06)', border: `1px solid ${copied ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.12)'}`, borderRadius: 8, color: copied ? '#4ade80' : 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0, transition: 'all 0.2s' }}>
          {copied ? '✓ Copied!' : 'Share'}
        </button>
      </div>

      <div style={{ padding: '14px 18px', maxWidth: 1280, margin: '0 auto' }}>

        {/* Preview toggle */}
        <div style={{ marginBottom: 12 }}>
          <button onClick={() => setShowPreview(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 13px', background: showPreview ? 'rgba(138,21,56,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${showPreview ? 'rgba(138,21,56,0.35)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 9, color: showPreview ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.15s' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            {showPreview ? 'Hide Preview' : 'Show Scoreboard Preview'}
          </button>
        </div>

        {showPreview && (
          <div style={{ marginBottom: 14, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.09)', animation: 'cc-in 0.2s ease both' }}>
            <div style={{ padding: '7px 13px', background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Scoreboard Preview</span>
            </div>
            <MatchPublicView match={match} teams={teams} cfg={cfg} />
          </div>
        )}

        {/* Section tabs */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 4, marginBottom: 14, width: 'fit-content' }}>
          {(['controls', 'setup'] as const).map(s => (
            <button key={s} onClick={() => setActiveSection(s)} style={{ padding: '8px 20px', borderRadius: 9, fontSize: 13, fontWeight: activeSection === s ? 700 : 500, color: activeSection === s ? '#fff' : 'var(--text-muted)', background: activeSection === s ? '#111827' : 'transparent', border: activeSection === s ? '1px solid rgba(255,255,255,0.14)' : '1px solid transparent', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', textTransform: 'capitalize' }}>
              {s === 'controls' ? '🎮 Controls' : '🎨 Customize'}
            </button>
          ))}
        </div>

        {/* ── Controls ── */}
        {activeSection === 'controls' && (
          <div style={{ animation: 'cc-in 0.2s ease both' }}>
            {!isAdmin && (
              <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, marginBottom: 12, fontSize: 13, color: '#f59e0b' }}>
                View-only — you need admin access to control this match
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(170px,210px) 1fr 1fr minmax(170px,200px)', gap: 12, alignItems: 'start' }}>

              {/* ── Timer Panel ── */}
              <div style={{ borderRadius: 18, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.35)' }}>
                <div style={{ background: '#0b1120', padding: '14px 14px 10px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Timer</div>
                  <div style={{ fontSize: 48, fontWeight: 900, color: clockRunning ? '#4ade80' : '#fff', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em', lineHeight: 1, textShadow: clockRunning ? '0 0 28px rgba(74,222,128,0.5)' : 'none', transition: 'color 0.3s, text-shadow 0.3s' }}>
                    {clockDisplay}
                  </div>
                </div>
                <div style={{ background: '#1a2235', padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {/* Adj buttons */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                    {[{ l: '+1m', d: 60 }, { l: '+1s', d: 1 }, { l: '−1m', d: -60 }, { l: '−1s', d: -1 }].map(b => (
                      <button key={b.l} onClick={() => isAdmin && adjustClock(b.d)} style={{ padding: '8px 4px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8, color: 'rgba(255,255,255,0.75)', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', opacity: isAdmin ? 1 : 0.4, transition: 'filter 0.1s' }}
                        onMouseEnter={e => { if (isAdmin) e.currentTarget.style.filter = 'brightness(1.3)' }}
                        onMouseLeave={e => { e.currentTarget.style.filter = '' }}
                      >{b.l}</button>
                    ))}
                  </div>
                  {/* Start/Pause */}
                  <button onClick={() => { if (!isAdmin) return; clockRunning ? pauseClock() : startClock() }}
                    style={{ width: '100%', padding: '12px', background: clockRunning ? 'rgba(239,68,68,0.2)' : 'rgba(74,222,128,0.18)', border: `1px solid ${clockRunning ? 'rgba(239,68,68,0.4)' : 'rgba(74,222,128,0.4)'}`, borderRadius: 11, color: clockRunning ? '#f87171' : '#4ade80', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', opacity: isAdmin ? 1 : 0.4, transition: 'all 0.15s' }}>
                    {clockRunning ? '⏸ Pause' : '▶ Start'}
                  </button>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => isAdmin && resetClock()} style={{ flex: 1, padding: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', opacity: isAdmin ? 1 : 0.4 }}>↺ Reset</button>
                    <button onClick={() => buzz()} style={{ flex: 1, padding: '8px', background: 'rgba(138,21,56,0.18)', border: '1px solid rgba(138,21,56,0.3)', borderRadius: 9, color: 'var(--accent)', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>🔔</button>
                  </div>
                </div>
              </div>

              {/* ── Home Team ── */}
              {isAdmin
                ? <TeamPanel team={home} side={1} score={match?.score1 ?? 0} fouls={match?.fouls1 ?? 0} timeouts={match?.timeouts1 ?? 0} />
                : <div style={{ background: cfg.homeColor, borderRadius: 16, padding: 16, opacity: 0.55, textAlign: 'center', color: cfg.homeTextColor, fontWeight: 700 }}>{home?.team_name ?? 'HOME'}<br /><span style={{ fontSize: 40, fontWeight: 900 }}>{match?.score1 ?? 0}</span></div>
              }

              {/* ── Away Team ── */}
              {isAdmin
                ? <TeamPanel team={away} side={2} score={match?.score2 ?? 0} fouls={match?.fouls2 ?? 0} timeouts={match?.timeouts2 ?? 0} />
                : <div style={{ background: cfg.awayColor, borderRadius: 16, padding: 16, opacity: 0.55, textAlign: 'center', color: cfg.awayTextColor, fontWeight: 700 }}>{away?.team_name ?? 'AWAY'}<br /><span style={{ fontSize: 40, fontWeight: 900 }}>{match?.score2 ?? 0}</span></div>
              }

              {/* ── Game Panel ── */}
              <div style={{ borderRadius: 18, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.35)' }}>
                <div style={{ background: '#0b1120', padding: '14px 14px 10px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>Game</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: isFinal ? '#e9c176' : match?.game_status === 'halftime' ? '#60a5fa' : match?.game_status === 'extra_time' ? '#f59e0b' : '#fff', letterSpacing: '-0.01em', lineHeight: 1 }}>{periodLabel}</div>
                  <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.28)', marginTop: 4 }}>Period {match?.current_period ?? 1} of {cfg.periods}</div>
                </div>
                <div style={{ background: '#1a2235', padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {/* Period controls */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                    <button onClick={() => isAdmin && setPeriod(1)} style={{ padding: '9px 4px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', opacity: isAdmin ? 1 : 0.4 }}>+1 Period</button>
                    <button onClick={() => isAdmin && setPeriod(-1)} style={{ padding: '9px 4px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'rgba(255,255,255,0.5)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', opacity: isAdmin ? 1 : 0.4 }}>−1 Period</button>
                  </div>
                  {/* Status buttons */}
                  <button onClick={() => isAdmin && setGameStatus('halftime')} style={{ width: '100%', padding: '9px', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: 9, color: '#60a5fa', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', opacity: isAdmin ? 1 : 0.4 }}>⏸ Halftime</button>
                  <button onClick={() => isAdmin && setGameStatus('extra_time')} style={{ width: '100%', padding: '9px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 9, color: '#f59e0b', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', opacity: isAdmin ? 1 : 0.4 }}>⚡ Extra Time</button>
                  <button onClick={() => isAdmin && setGameStatus('in_progress')} style={{ width: '100%', padding: '9px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 9, color: '#4ade80', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', opacity: isAdmin ? 1 : 0.4 }}>▶ Resume Play</button>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />
                  {/* Declare winner */}
                  {home && away && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'center' }}>Declare Winner</div>
                      <button onClick={() => isAdmin && declareWinner(match?.team1_id ?? null)} style={{ width: '100%', padding: '8px', background: `${cfg.homeColor}22`, border: `1px solid ${cfg.homeColor}55`, borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit', opacity: isAdmin ? 1 : 0.4 }}>🏆 {home.team_name}</button>
                      <button onClick={() => isAdmin && declareWinner(match?.team2_id ?? null)} style={{ width: '100%', padding: '8px', background: `${cfg.awayColor}22`, border: `1px solid ${cfg.awayColor}55`, borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit', opacity: isAdmin ? 1 : 0.4 }}>🏆 {away.team_name}</button>
                    </div>
                  )}
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />
                  <button onClick={() => isAdmin && setGameStatus('final')} style={{ width: '100%', padding: '9px', background: 'rgba(233,193,118,0.1)', border: '1px solid rgba(233,193,118,0.28)', borderRadius: 9, color: '#e9c176', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', opacity: isAdmin ? 1 : 0.4 }}>🏁 Full Time</button>
                  <button onClick={() => isAdmin && fullReset()} style={{ width: '100%', padding: '8px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 9, color: '#f87171', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', opacity: isAdmin ? 1 : 0.4 }}>↺ Reset All</button>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ── Customize ── */}
        {activeSection === 'setup' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'cc-in 0.2s ease both' }}>

            {/* Display toggles */}
            <div style={{ background: '#1f2937', borderRadius: 16, padding: '18px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Display Options</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 12 }}>
                {([
                  ['showTitle', 'Show title bar'],
                  ['showTimer', 'Show timer'],
                  ['showPeriod', 'Show period / half'],
                  ['showFouls', 'Show fouls'],
                  ['showCards', 'Show yellow/red cards'],
                  ['showTimeouts', 'Show timeouts'],
                  ['timerCountsDown', 'Timer counts down'],
                  ['autoPlayBuzzer', 'Auto buzzer on expire'],
                ] as [keyof Cfg, string][]).map(([key, label]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                    <Toggle on={!!cfg[key]} onChange={() => saveCfg({ ...cfg, [key]: !cfg[key] })} />
                    <span style={{ fontSize: 13, color: cfg[key] ? 'var(--text-primary)' : 'var(--text-muted)' }}>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Timer & Period settings */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px,1fr))', gap: 14 }}>
              <div style={{ background: '#1f2937', borderRadius: 16, padding: '18px 20px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Timer Settings</div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 5 }}>Timer length (mm:ss)</div>
                  <input
                    value={`${Math.floor(cfg.timerLength / 60)}:${(cfg.timerLength % 60).toString().padStart(2, '0')}`}
                    onChange={e => {
                      const [mm, ss] = e.target.value.split(':').map(Number)
                      if (!isNaN(mm) && !isNaN(ss)) saveCfg({ ...cfg, timerLength: mm * 60 + (ss || 0) })
                    }}
                    placeholder="45:00"
                    style={{ width: '100%', padding: '8px 10px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 5 }}>Quick set</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[{ l: '10m', v: 600 }, { l: '20m', v: 1200 }, { l: '45m', v: 2700 }, { l: '15m', v: 900 }].map(b => (
                    <button key={b.l} onClick={() => saveCfg({ ...cfg, timerLength: b.v })} style={{ padding: '5px 12px', background: cfg.timerLength === b.v ? 'rgba(138,21,56,0.3)' : 'rgba(255,255,255,0.06)', border: `1px solid ${cfg.timerLength === b.v ? 'rgba(138,21,56,0.6)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 7, color: cfg.timerLength === b.v ? 'var(--accent)' : 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{b.l}</button>
                  ))}
                </div>
              </div>

              <div style={{ background: '#1f2937', borderRadius: 16, padding: '18px 20px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Periods</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 8 }}>Number of periods / halves</div>
                <div style={{ display: 'flex', gap: 7 }}>
                  {[{ l: '2 Halves', v: 2 }, { l: '4 Quarters', v: 4 }].map(o => (
                    <button key={o.v} onClick={() => saveCfg({ ...cfg, periods: o.v })} style={{ flex: 1, padding: '9px', background: cfg.periods === o.v ? 'rgba(138,21,56,0.2)' : 'rgba(255,255,255,0.04)', border: `1px solid ${cfg.periods === o.v ? 'rgba(138,21,56,0.5)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 9, color: cfg.periods === o.v ? 'var(--accent)' : 'var(--text-muted)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{o.l}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Team colors */}
            <div style={{ background: '#1f2937', borderRadius: 16, padding: '18px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Team Colors</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {([
                  { label: 'Home', bgKey: 'homeColor' as keyof Cfg, textKey: 'homeTextColor' as keyof Cfg },
                  { label: 'Away', bgKey: 'awayColor' as keyof Cfg, textKey: 'awayTextColor' as keyof Cfg },
                ]).map(({ label, bgKey, textKey }) => (
                  <div key={label}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{label} Team</div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1 }}>
                        <input type="color" value={cfg[bgKey] as string} onChange={e => saveCfg({ ...cfg, [bgKey]: e.target.value })} style={{ width: 36, height: 28, borderRadius: 7, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', background: 'transparent', padding: 2, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Background</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1 }}>
                        <input type="color" value={cfg[textKey] as string} onChange={e => saveCfg({ ...cfg, [textKey]: e.target.value })} style={{ width: 36, height: 28, borderRadius: 7, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', background: 'transparent', padding: 2, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Text</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Board + Title + Font */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px,1fr))', gap: 14 }}>
              {/* Board colors */}
              <div style={{ background: '#1f2937', borderRadius: 16, padding: '18px 20px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Board Colors</div>
                {([['boardBg', 'Background'], ['boardText', 'Text']] as [keyof Cfg, string][]).map(([key, label]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</span>
                    <input type="color" value={cfg[key] as string} onChange={e => saveCfg({ ...cfg, [key]: e.target.value })} style={{ width: 44, height: 28, borderRadius: 7, border: '1px solid rgba(255,255,255,0.14)', cursor: 'pointer', background: 'transparent', padding: 2 }} />
                  </div>
                ))}
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 5, marginTop: 4 }}>Quick themes</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[{ l: 'Dark', bg: '#0f172a' }, { l: 'Black', bg: '#000000' }, { l: 'Navy', bg: '#0a0f2c' }, { l: 'Forest', bg: '#0a1f0a' }].map(t => (
                    <button key={t.l} onClick={() => saveCfg({ ...cfg, boardBg: t.bg })} style={{ flex: 1, padding: '5px 2px', background: t.bg, border: `2px solid ${cfg.boardBg === t.bg ? 'var(--accent)' : 'rgba(255,255,255,0.15)'}`, borderRadius: 7, color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{t.l}</button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div style={{ background: '#1f2937', borderRadius: 16, padding: '18px 20px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Title Bar</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, cursor: 'pointer' }}>
                  <Toggle on={cfg.showTitle} onChange={() => saveCfg({ ...cfg, showTitle: !cfg.showTitle })} />
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Show title</span>
                </label>
                {cfg.showTitle && (
                  <input value={cfg.titleText} onChange={e => saveCfg({ ...cfg, titleText: e.target.value })} placeholder="Live Match" style={{ width: '100%', padding: '8px 10px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                )}
              </div>

              {/* Font size */}
              <div style={{ background: '#1f2937', borderRadius: 16, padding: '18px 20px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Font Size</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => saveCfg({ ...cfg, fontSize: Math.max(60, cfg.fontSize - 10) })} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 16, fontFamily: 'inherit' }}>−</button>
                  <span style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: 700, color: '#fff' }}>{cfg.fontSize}%</span>
                  <button onClick={() => saveCfg({ ...cfg, fontSize: Math.min(160, cfg.fontSize + 10) })} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 16, fontFamily: 'inherit' }}>+</button>
                  <button onClick={() => saveCfg({ ...cfg, fontSize: 100 })} style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>Reset</button>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
