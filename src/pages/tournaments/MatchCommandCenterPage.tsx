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

const CSS = `
@keyframes orb1{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(6%,4%) scale(1.06)}66%{transform:translate(-4%,6%) scale(.94)}}
@keyframes orb2{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(-5%,-4%) scale(1.09)}66%{transform:translate(4%,-6%) scale(.91)}}
@keyframes orb3{0%,100%{transform:translate(0,0)}50%{transform:translate(-6%,6%)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes cc-in{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes score-pop{0%{transform:scale(1)}30%{transform:scale(1.28)}70%{transform:scale(.96)}100%{transform:scale(1)}}
@keyframes score-flash{0%{opacity:1}50%{opacity:.3}100%{opacity:1}}
@keyframes live-ring{0%,100%{box-shadow:0 0 0 0 rgba(249,115,22,.8)}70%{box-shadow:0 0 0 8px rgba(249,115,22,0)}}
@keyframes tab-slide{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
@keyframes btn-lift{to{transform:translateY(-3px)}}
@keyframes glow-text{0%,100%{text-shadow:0 0 30px rgba(74,222,128,.6),0 0 60px rgba(74,222,128,.3)}50%{text-shadow:0 0 50px rgba(74,222,128,.9),0 0 100px rgba(74,222,128,.4)}}
@keyframes shimmer{0%{background-position:200% center}100%{background-position:-200% center}}
@keyframes card-glow{0%,100%{opacity:.6}50%{opacity:1}}
.cc-btn{transition:all .15s cubic-bezier(.34,1.56,.64,1);cursor:pointer;border:none;font-family:inherit;user-select:none;}
.cc-btn:hover{filter:brightness(1.2);transform:translateY(-2px);}
.cc-btn:active{transform:scale(.93)!important;filter:brightness(.9)!important;}
.cc-score-pop{animation:score-pop .45s cubic-bezier(.34,1.56,.64,1) both;}
`

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
    gain.gain.setValueAtTime(0.7, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9)
    osc.start(); osc.stop(ctx.currentTime + 0.9)
    setTimeout(() => ctx.close(), 1400)
  } catch {}
}

function Toggle({ on, onChange, accent = 'var(--accent)' }: { on: boolean; onChange: () => void; accent?: string }) {
  return (
    <div onClick={onChange} style={{ width: 42, height: 24, borderRadius: 12, background: on ? accent : 'rgba(255,255,255,0.1)', border: `1.5px solid ${on ? accent : 'rgba(255,255,255,0.15)'}`, position: 'relative', transition: 'all 0.25s', cursor: 'pointer', flexShrink: 0, boxShadow: on ? `0 0 16px ${accent}60` : 'none' }}>
      <div style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.25s cubic-bezier(.34,1.56,.64,1)', boxShadow: '0 2px 6px rgba(0,0,0,0.5)' }} />
    </div>
  )
}

// ─── Public View ─────────────────────────────────────────────────────────────
export function MatchPublicView({ match, teams, cfg }: { match: Match | null; teams: Record<string, Team>; cfg: Cfg }) {
  const stats = (match?.live_stats ?? {}) as Record<string, number>
  if (!match) return (
    <div style={{ minHeight: '100vh', background: cfg.boardBg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <style>{CSS}</style>
      <div style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'rgba(255,255,255,0.5)', animation: 'spin 1.2s linear infinite' }} />
      <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em' }}>Waiting for match…</div>
    </div>
  )
  const home = teams[match.team1_id ?? '']
  const away = teams[match.team2_id ?? '']
  const isFinal = match.game_status === 'final'
  const isHalf = match.game_status === 'halftime'
  const isET = match.game_status === 'extra_time'
  const isLive = match.game_status === 'in_progress'
  const clockStr = fmtClock(match.game_clock, cfg.timerCountsDown, cfg.timerLength)
  const p = match.current_period
  const periodLabel = isFinal ? 'FULL TIME' : isHalf ? 'HALF TIME' : isET ? 'EXTRA TIME' : cfg.periods === 4 ? `Q${p}` : p === 1 ? '1ST HALF' : '2ND HALF'
  const fs = (n: number) => Math.round(n * cfg.fontSize / 100)

  return (
    <div style={{ minHeight: '100vh', background: cfg.boardBg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'inherit', position: 'relative', overflow: 'hidden' }}>
      <style>{CSS}</style>
      {/* Ambient glows */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '20%', left: '5%', width: '55vw', height: '55vw', borderRadius: '50%', background: `radial-gradient(circle, ${cfg.homeColor}22 0%, transparent 70%)`, filter: 'blur(60px)', animation: 'orb1 22s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: '20%', right: '5%', width: '50vw', height: '50vw', borderRadius: '50%', background: `radial-gradient(circle, ${cfg.awayColor}1a 0%, transparent 70%)`, filter: 'blur(60px)', animation: 'orb2 28s ease-in-out infinite' }} />
      </div>

      {cfg.showTitle && (
        <div style={{ fontSize: fs(12), fontWeight: 700, color: 'rgba(255,255,255,0.35)', marginBottom: fs(20), textTransform: 'uppercase', letterSpacing: '0.2em', position: 'relative', zIndex: 1 }}>{cfg.titleText}</div>
      )}

      {/* Live badge */}
      {isLive && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: fs(16), position: 'relative', zIndex: 1 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316', animation: 'live-ring 1.5s ease-in-out infinite', boxShadow: '0 0 8px #f97316' }} />
          <span style={{ fontSize: fs(11), fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.16em' }}>Live</span>
        </div>
      )}

      <div style={{ width: '100%', maxWidth: fs(700), borderRadius: fs(24), overflow: 'hidden', boxShadow: `0 40px 120px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06)`, animation: 'cc-in .5s ease both', position: 'relative', zIndex: 1 }}>
        {/* Home */}
        <div style={{ display: 'flex', alignItems: 'center', background: cfg.homeColor, padding: `${fs(20)}px ${fs(32)}px`, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: -20, top: -20, width: fs(160), height: fs(160), borderRadius: '50%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', right: fs(40), bottom: -fs(40), width: fs(100), height: fs(100), borderRadius: '50%', background: 'rgba(0,0,0,0.1)', pointerEvents: 'none' }} />
          {home?.logo_url ? (
            <div style={{ width: fs(58), height: fs(58), borderRadius: fs(13), overflow: 'hidden', marginRight: fs(18), flexShrink: 0, border: '2px solid rgba(255,255,255,0.3)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)', position: 'relative', zIndex: 1 }}>
              <img src={home.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ) : (
            <div style={{ width: fs(50), height: fs(50), borderRadius: fs(13), background: 'rgba(255,255,255,0.18)', marginRight: fs(16), flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: fs(18), fontWeight: 900, color: cfg.homeTextColor, position: 'relative', zIndex: 1 }}>{(home?.team_name ?? 'H').slice(0, 2).toUpperCase()}</div>
          )}
          <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: fs(28), fontWeight: 900, color: cfg.homeTextColor, textTransform: 'uppercase', lineHeight: 1, letterSpacing: '-0.02em' }}>{home?.team_name ?? 'HOME'}</div>
            <div style={{ display: 'flex', gap: fs(12), marginTop: fs(5), flexWrap: 'wrap' }}>
              {cfg.showFouls && <span style={{ fontSize: fs(12), color: `${cfg.homeTextColor}cc` }}>Fouls: {match.fouls1}</span>}
              {cfg.showCards && (stats.yellows1 ?? 0) > 0 && <span style={{ fontSize: fs(12) }}>🟨 ×{stats.yellows1}</span>}
              {cfg.showCards && (stats.reds1 ?? 0) > 0 && <span style={{ fontSize: fs(12) }}>🟥 ×{stats.reds1}</span>}
            </div>
          </div>
          <div style={{ fontSize: fs(80), fontWeight: 900, color: cfg.homeTextColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums', textShadow: `0 0 60px rgba(255,255,255,0.2)`, position: 'relative', zIndex: 1 }}>{match.score1}</div>
        </div>

        {/* Divider with VS */}
        <div style={{ background: '#070b14', display: 'flex', alignItems: 'center', padding: `${fs(10)}px ${fs(32)}px`, gap: fs(16) }}>
          {cfg.showTimer ? (
            <div style={{ fontSize: fs(26), fontWeight: 900, color: (isFinal || isHalf) ? 'rgba(255,255,255,0.25)' : '#fff', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.06em', flex: 1 }}>
              {(isFinal || isHalf) ? '—' : clockStr}
            </div>
          ) : <div style={{ flex: 1 }} />}
          {cfg.showPeriod && (
            <div style={{ fontSize: fs(14), fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', padding: `${fs(4)}px ${fs(12)}px`, borderRadius: fs(8), background: isLive ? 'rgba(249,115,22,0.15)' : isHalf ? 'rgba(96,165,250,0.15)' : isET ? 'rgba(245,158,11,0.15)' : isFinal ? 'rgba(233,193,118,0.15)' : 'rgba(255,255,255,0.07)', color: isLive ? '#f97316' : isHalf ? '#60a5fa' : isET ? '#f59e0b' : isFinal ? '#e9c176' : 'rgba(255,255,255,0.4)', border: `1px solid ${isLive ? 'rgba(249,115,22,0.3)' : isHalf ? 'rgba(96,165,250,0.3)' : 'rgba(255,255,255,0.1)'}` }}>
              {periodLabel}
            </div>
          )}
          <div style={{ flex: 1, textAlign: 'right', fontSize: fs(11), color: 'rgba(255,255,255,0.2)', fontWeight: 700, letterSpacing: '0.1em' }}>VS</div>
        </div>

        {/* Away */}
        <div style={{ display: 'flex', alignItems: 'center', background: cfg.awayColor, padding: `${fs(20)}px ${fs(32)}px`, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: -20, top: -20, width: fs(160), height: fs(160), borderRadius: '50%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
          {away?.logo_url ? (
            <div style={{ width: fs(58), height: fs(58), borderRadius: fs(13), overflow: 'hidden', marginRight: fs(18), flexShrink: 0, border: '2px solid rgba(255,255,255,0.3)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)', position: 'relative', zIndex: 1 }}>
              <img src={away.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ) : (
            <div style={{ width: fs(50), height: fs(50), borderRadius: fs(13), background: 'rgba(255,255,255,0.18)', marginRight: fs(16), flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: fs(18), fontWeight: 900, color: cfg.awayTextColor, position: 'relative', zIndex: 1 }}>{(away?.team_name ?? 'A').slice(0, 2).toUpperCase()}</div>
          )}
          <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: fs(28), fontWeight: 900, color: cfg.awayTextColor, textTransform: 'uppercase', lineHeight: 1, letterSpacing: '-0.02em' }}>{away?.team_name ?? 'AWAY'}</div>
            <div style={{ display: 'flex', gap: fs(12), marginTop: fs(5), flexWrap: 'wrap' }}>
              {cfg.showFouls && <span style={{ fontSize: fs(12), color: `${cfg.awayTextColor}cc` }}>Fouls: {match.fouls2}</span>}
              {cfg.showCards && (stats.yellows2 ?? 0) > 0 && <span style={{ fontSize: fs(12) }}>🟨 ×{stats.yellows2}</span>}
              {cfg.showCards && (stats.reds2 ?? 0) > 0 && <span style={{ fontSize: fs(12) }}>🟥 ×{stats.reds2}</span>}
            </div>
          </div>
          <div style={{ fontSize: fs(80), fontWeight: 900, color: cfg.awayTextColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums', textShadow: `0 0 60px rgba(255,255,255,0.2)`, position: 'relative', zIndex: 1 }}>{match.score2}</div>
        </div>
      </div>
    </div>
  )
}

// ─── Admin Command Center ─────────────────────────────────────────────────────
export default function MatchCommandCenterPage() {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const [searchParams] = useSearchParams()
  const isPublicView = searchParams.get('view') === 'public'
  const matchParam = searchParams.get('match')
  const navigate = useNavigate()
  const { user } = useAuth()

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
  const [flashHome, setFlashHome] = useState(false)
  const [flashAway, setFlashAway] = useState(false)

  const [clockRunning, setClockRunning] = useState(false)
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const clockCounterRef = useRef(0)
  const matchRef = useRef<Match | null>(null)
  matchRef.current = match

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
    const auto = pinned ?? live ?? allMatches[0] ?? null
    if (auto) {
      setSelectedMatchId(auto.id)
      setMatch(auto)
      const savedCfg = (auto.live_stats as Record<string, unknown>)?.config
      if (savedCfg) setCfg(c => ({ ...c, ...(savedCfg as Cfg) }))
    }
    if (user && tData) {
      if (tData.created_by === user.id) setIsAdmin(true)
      else {
        const { data: mem } = await supabase.from('club_memberships').select('role').eq('club_id', tData.club_id).eq('user_id', user.id).single()
        setIsAdmin(mem?.role === 'president' || mem?.role === 'officer')
      }
    }
    setLoading(false)
  }, [tournamentId, user, matchParam])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (!selectedMatchId) return
    const ch = supabase.channel(`mcc-${selectedMatchId}-${isPublicView ? 'pub' : 'adm'}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tournament_matches', filter: `id=eq.${selectedMatchId}` },
        p => setMatch(p.new as Match))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [selectedMatchId, isPublicView])

  useEffect(() => {
    if (!isPublicView || !selectedMatchId) return
    const poll = setInterval(async () => {
      const { data } = await supabase.from('tournament_matches').select('*').eq('id', selectedMatchId).single()
      if (data) setMatch(data as Match)
    }, 1000)
    return () => clearInterval(poll)
  }, [isPublicView, selectedMatchId])

  useEffect(() => () => { if (clockRef.current) clearInterval(clockRef.current) }, [])

  function selectMatch(id: string) {
    const m = matches.find(mx => mx.id === id) ?? null
    setSelectedMatchId(id); setMatch(m)
    setClockRunning(false)
    if (clockRef.current) clearInterval(clockRef.current)
    const savedCfg = (m?.live_stats as Record<string, unknown>)?.config
    if (savedCfg) setCfg(c => ({ ...c, ...(savedCfg as Cfg) }))
  }

  function startClock() {
    if (clockRunning) return
    const m = matchRef.current; if (!m) return
    clockCounterRef.current = m.game_clock
    setClockRunning(true)
    clockRef.current = setInterval(async () => {
      clockCounterRef.current += 1
      const cur = matchRef.current; if (!cur) return
      const newClock = clockCounterRef.current
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
    const m = matchRef.current; if (!m) return
    const actualDelta = cfg.timerCountsDown ? -delta : delta
    const newClock = Math.max(0, Math.min(cfg.timerLength, m.game_clock + actualDelta))
    clockCounterRef.current = newClock
    setMatch(prev => prev ? { ...prev, game_clock: newClock } : prev)
    supabase.from('tournament_matches').update({ game_clock: newClock }).eq('id', m.id)
  }

  async function addScore(team: 1 | 2, delta: number) {
    const m = matchRef.current; if (!m) return
    const key = team === 1 ? 'score1' : 'score2'
    const newVal = Math.max(0, (team === 1 ? m.score1 : m.score2) + delta)
    setMatch(prev => prev ? { ...prev, [key]: newVal } : prev)
    if (team === 1) { setFlashHome(true); setTimeout(() => setFlashHome(false), 450) }
    else { setFlashAway(true); setTimeout(() => setFlashAway(false), 450) }
    await supabase.from('tournament_matches').update({ [key]: newVal, status: 'live', game_status: 'in_progress' }).eq('id', m.id)
  }

  async function addFoul(team: 1 | 2, delta: number) {
    const m = matchRef.current; if (!m) return
    const key = team === 1 ? 'fouls1' : 'fouls2'
    const newVal = Math.max(0, (team === 1 ? m.fouls1 : m.fouls2) + delta)
    setMatch(prev => prev ? { ...prev, [key]: newVal } : prev)
    await supabase.from('tournament_matches').update({ [key]: newVal }).eq('id', m.id)
  }

  async function addTimeout(team: 1 | 2, delta: number) {
    const m = matchRef.current; if (!m) return
    const key = team === 1 ? 'timeouts1' : 'timeouts2'
    const newVal = Math.max(0, (team === 1 ? m.timeouts1 : m.timeouts2) + delta)
    setMatch(prev => prev ? { ...prev, [key]: newVal } : prev)
    await supabase.from('tournament_matches').update({ [key]: newVal }).eq('id', m.id)
  }

  async function addCard(team: 1 | 2, type: 'yellow' | 'red', delta: number) {
    const m = matchRef.current; if (!m) return
    const key = `${type === 'yellow' ? 'yellows' : 'reds'}${team}`
    const cur = ((m.live_stats ?? {}) as Record<string, number>)[key] ?? 0
    const newVal = Math.max(0, cur + delta)
    const newStats = { ...(m.live_stats ?? {}), [key]: newVal }
    setMatch(prev => prev ? { ...prev, live_stats: newStats } : prev)
    await supabase.from('tournament_matches').update({ live_stats: newStats }).eq('id', m.id)
  }

  async function setPeriod(delta: number) {
    const m = matchRef.current; if (!m) return
    clearInterval(clockRef.current!); setClockRunning(false)
    const newPeriod = Math.max(1, Math.min(cfg.periods + 1, m.current_period + delta))
    clockCounterRef.current = 0
    setMatch(prev => prev ? { ...prev, current_period: newPeriod, game_clock: 0, game_status: 'in_progress' } : prev)
    await supabase.from('tournament_matches').update({ current_period: newPeriod, game_clock: 0, game_status: 'in_progress', status: 'live' }).eq('id', m.id)
  }

  async function setGameStatus(gs: Match['game_status']) {
    const m = matchRef.current; if (!m) return
    if (gs === 'halftime' || gs === 'extra_time') { clearInterval(clockRef.current!); setClockRunning(false) }
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
    clearInterval(clockRef.current!); setClockRunning(false); clockCounterRef.current = 0
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

  if (isPublicView) return <MatchPublicView match={match} teams={teams} cfg={cfg} />

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#060a14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{CSS}</style>
      <div style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,0.08)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  const home = teams[match?.team1_id ?? '']
  const away = teams[match?.team2_id ?? '']
  const isFinal = match?.game_status === 'final'
  const isHalf = match?.game_status === 'halftime'
  const isET = match?.game_status === 'extra_time'
  const clockDisplay = match ? fmtClock(match.game_clock, cfg.timerCountsDown, cfg.timerLength) : '0:00'
  const p = match?.current_period ?? 1
  const periodLabel = isFinal ? 'FULL TIME' : isHalf ? 'HALF TIME' : isET ? 'EXTRA TIME' : cfg.periods === 4 ? `Q${p}` : p === 1 ? '1ST HALF' : '2ND HALF'
  const timeRemaining = cfg.timerCountsDown ? cfg.timerLength - (match?.game_clock ?? 0) : (match?.game_clock ?? 0)
  const isUrgent = timeRemaining <= 60 && timeRemaining > 0 && clockRunning

  const glass = { background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)' } as React.CSSProperties

  // ── Team Panel ──────────────────────────────────────────────────────────────
  const TeamPanel = ({ team, side, score, fouls, timeouts, flash }: { team: Team | undefined; side: 1 | 2; score: number; fouls: number; timeouts: number; flash: boolean }) => {
    const color = side === 1 ? cfg.homeColor : cfg.awayColor
    const textColor = side === 1 ? cfg.homeTextColor : cfg.awayTextColor
    const label = side === 1 ? 'HOME' : 'AWAY'
    const yellows = stats[`yellows${side}`] ?? 0
    const reds = stats[`reds${side}`] ?? 0

    return (
      <div style={{ flex: 1, borderRadius: 20, overflow: 'hidden', boxShadow: flash ? `0 0 0 2px ${color}, 0 0 60px ${color}60, 0 8px 32px rgba(0,0,0,0.5)` : `0 0 0 1px ${color}30, 0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)`, transition: 'box-shadow .3s ease', ...glass }}>
        {/* Score header */}
        <div style={{ background: `linear-gradient(160deg, ${color}ee 0%, ${color}cc 100%)`, padding: '18px 16px 14px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
          {/* Decorative circles */}
          <div style={{ position: 'absolute', top: -24, right: -24, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -16, left: -16, width: 70, height: 70, borderRadius: '50%', background: 'rgba(0,0,0,0.12)', pointerEvents: 'none' }} />
          {/* Label */}
          <div style={{ fontSize: 9, fontWeight: 800, color: `${textColor}99`, textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 6, position: 'relative' }}>{label}</div>
          {/* Logo / initials */}
          {team?.logo_url ? (
            <div style={{ width: 38, height: 38, borderRadius: 10, overflow: 'hidden', margin: '0 auto 8px', border: '2px solid rgba(255,255,255,0.3)', boxShadow: '0 2px 12px rgba(0,0,0,0.4)', position: 'relative' }}>
              <img src={team.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ) : (
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.18)', margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: textColor }}>{(team?.team_name ?? label).slice(0, 2).toUpperCase()}</div>
          )}
          <div style={{ fontSize: 13, fontWeight: 800, color: textColor, marginBottom: 10, lineHeight: 1.2, position: 'relative' }}>{team?.team_name ?? label}</div>
          {/* Big score */}
          <div className={flash ? 'cc-score-pop' : ''} style={{ fontSize: 66, fontWeight: 900, color: textColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums', textShadow: `0 0 40px rgba(255,255,255,0.2)`, position: 'relative' }}>{score}</div>
        </div>

        {/* Controls */}
        <div style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Score buttons */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6, textAlign: 'center' }}>Add Points</div>
            <div style={{ display: 'flex', gap: 5, marginBottom: 5 }}>
              {[1, 2, 3].map(n => (
                <button key={n} className="cc-btn" onClick={() => isAdmin && addScore(side, n)}
                  style={{ flex: 1, padding: '12px 0', background: `linear-gradient(135deg, ${color}ee, ${color}99)`, border: 'none', borderRadius: 10, color: textColor, fontWeight: 900, fontSize: 16, opacity: isAdmin ? 1 : 0.35, boxShadow: `0 4px 14px ${color}50` }}>
                  +{n}
                </button>
              ))}
            </div>
            <button className="cc-btn" onClick={() => isAdmin && addScore(side, -1)}
              style={{ width: '100%', padding: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 700, fontSize: 13, opacity: isAdmin ? 1 : 0.35 }}>
              −1 point
            </button>
          </div>

          {/* Fouls */}
          <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: '9px 11px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Fouls</span>
              <span style={{ fontSize: 22, fontWeight: 900, color: fouls >= 5 ? '#f87171' : '#fff', fontVariantNumeric: 'tabular-nums', textShadow: fouls >= 5 ? '0 0 16px rgba(248,113,113,0.6)' : 'none' }}>{fouls}</span>
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              <button className="cc-btn" onClick={() => isAdmin && addFoul(side, 1)} style={{ flex: 1, padding: '7px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 13, opacity: isAdmin ? 1 : 0.35 }}>+1</button>
              <button className="cc-btn" onClick={() => isAdmin && addFoul(side, -1)} style={{ flex: 1, padding: '7px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, color: 'rgba(255,255,255,0.4)', fontWeight: 700, fontSize: 13, opacity: isAdmin ? 1 : 0.35 }}>−1</button>
            </div>
          </div>

          {/* Cards */}
          <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: '9px 11px' }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Cards</div>
            <div style={{ display: 'flex', gap: 7 }}>
              {/* Yellow */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 14 }}>🟨</span>
                  <span style={{ fontSize: 18, fontWeight: 900, color: '#f59e0b', fontVariantNumeric: 'tabular-nums' }}>{yellows}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="cc-btn" onClick={() => isAdmin && addCard(side, 'yellow', 1)} style={{ flex: 1, padding: '5px', background: 'rgba(245,158,11,0.18)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 7, color: '#f59e0b', fontWeight: 800, fontSize: 12, opacity: isAdmin ? 1 : 0.35 }}>+</button>
                  <button className="cc-btn" onClick={() => isAdmin && addCard(side, 'yellow', -1)} style={{ flex: 1, padding: '5px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7, color: 'rgba(255,255,255,0.35)', fontWeight: 800, fontSize: 12, opacity: isAdmin ? 1 : 0.35 }}>−</button>
                </div>
              </div>
              <div style={{ width: 1, background: 'rgba(255,255,255,0.07)' }} />
              {/* Red */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 14 }}>🟥</span>
                  <span style={{ fontSize: 18, fontWeight: 900, color: '#f87171', fontVariantNumeric: 'tabular-nums' }}>{reds}</span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="cc-btn" onClick={() => isAdmin && addCard(side, 'red', 1)} style={{ flex: 1, padding: '5px', background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 7, color: '#f87171', fontWeight: 800, fontSize: 12, opacity: isAdmin ? 1 : 0.35 }}>+</button>
                  <button className="cc-btn" onClick={() => isAdmin && addCard(side, 'red', -1)} style={{ flex: 1, padding: '5px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7, color: 'rgba(255,255,255,0.35)', fontWeight: 800, fontSize: 12, opacity: isAdmin ? 1 : 0.35 }}>−</button>
                </div>
              </div>
            </div>
          </div>

          {/* Timeouts */}
          {cfg.showTimeouts && (
            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: '9px 11px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Timeouts</span>
                <span style={{ fontSize: 22, fontWeight: 900, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{timeouts}</span>
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                <button className="cc-btn" onClick={() => isAdmin && addTimeout(side, 1)} style={{ flex: 1, padding: '7px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 13, opacity: isAdmin ? 1 : 0.35 }}>+1</button>
                <button className="cc-btn" onClick={() => isAdmin && addTimeout(side, -1)} style={{ flex: 1, padding: '7px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, color: 'rgba(255,255,255,0.4)', fontWeight: 700, fontSize: 13, opacity: isAdmin ? 1 : 0.35 }}>−1</button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#060a14', position: 'relative', overflow: 'hidden' }}>
      <style>{CSS}</style>

      {/* Animated background orbs */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-10%', left: '-5%', width: '50vw', height: '50vw', borderRadius: '50%', background: `radial-gradient(circle, ${cfg.homeColor}20 0%, transparent 70%)`, filter: 'blur(50px)', animation: 'orb1 24s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '-10%', right: '-5%', width: '45vw', height: '45vw', borderRadius: '50%', background: `radial-gradient(circle, ${cfg.awayColor}18 0%, transparent 70%)`, filter: 'blur(50px)', animation: 'orb2 30s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: '45%', left: '45%', width: '25vw', height: '25vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(138,21,56,0.1) 0%, transparent 70%)', filter: 'blur(60px)', animation: 'orb3 18s ease-in-out infinite' }} />
      </div>

      {/* ── Header ── */}
      <div style={{ position: 'relative', zIndex: 10, background: 'rgba(6,10,20,0.85)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button className="cc-btn" onClick={() => navigate(`/tournaments/${tournamentId}`)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 13, flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          {tournamentName || 'Tournament'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #8b2252, #c0395a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, boxShadow: '0 2px 12px rgba(138,21,56,0.5)' }}>🎮</div>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>Command Center</span>
        </div>

        {matches.length > 1 && (
          <select value={selectedMatchId ?? ''} onChange={e => selectMatch(e.target.value)} style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, color: '#fff', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', maxWidth: 210, backdropFilter: 'blur(12px)' }}>
            {matches.map(m => {
              const t1 = teams[m.team1_id ?? '']?.team_name ?? 'TBD'
              const t2 = teams[m.team2_id ?? '']?.team_name ?? 'TBD'
              return <option key={m.id} value={m.id}>{t1} vs {t2} (R{m.round}·M{m.match_number})</option>
            })}
          </select>
        )}

        {match?.status === 'live' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.28)', borderRadius: 20 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#f97316', animation: 'live-ring 1.5s ease-in-out infinite' }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.14em' }}>Live</span>
          </div>
        )}

        <button className="cc-btn" onClick={() => window.open(`/tournaments/${tournamentId}/control?view=public${selectedMatchId ? `&match=${selectedMatchId}` : ''}`, '_blank')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.28)', borderRadius: 9, color: '#f97316', fontSize: 12, fontWeight: 700 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Public View
        </button>
        <button className="cc-btn" onClick={shareLink}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: copied ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.05)', border: `1px solid ${copied ? 'rgba(74,222,128,0.28)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 9, color: copied ? '#4ade80' : 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: 700, transition: 'all 0.2s' }}>
          {copied ? '✓ Copied!' : 'Share'}
        </button>
      </div>

      <div style={{ position: 'relative', zIndex: 1, padding: '16px 20px', maxWidth: 1320, margin: '0 auto' }}>

        {/* Preview toggle */}
        <div style={{ marginBottom: 14 }}>
          <button className="cc-btn" onClick={() => setShowPreview(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: showPreview ? 'rgba(138,21,56,0.18)' : 'rgba(255,255,255,0.04)', border: `1px solid ${showPreview ? 'rgba(138,21,56,0.4)' : 'rgba(255,255,255,0.09)'}`, borderRadius: 10, color: showPreview ? 'var(--accent)' : 'rgba(255,255,255,0.5)', fontSize: 12.5, fontWeight: 600, boxShadow: showPreview ? '0 0 20px rgba(138,21,56,0.2)' : 'none' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            {showPreview ? 'Hide Preview' : 'Show Scoreboard Preview'}
          </button>
        </div>

        {showPreview && (
          <div style={{ marginBottom: 16, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', animation: 'cc-in 0.25s ease both', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 8px #4ade80' }} />
              <span style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Live Preview</span>
            </div>
            <MatchPublicView match={match} teams={teams} cfg={cfg} />
          </div>
        )}

        {/* Section tabs */}
        <div style={{ display: 'flex', gap: 3, padding: 4, marginBottom: 16, width: 'fit-content', background: 'rgba(0,0,0,0.4)', borderRadius: 13, border: '1px solid rgba(255,255,255,0.07)' }}>
          {(['controls', 'setup'] as const).map(s => (
            <button key={s} className="cc-btn" onClick={() => setActiveSection(s)}
              style={{ padding: '9px 22px', borderRadius: 10, fontSize: 13, fontWeight: activeSection === s ? 700 : 500, color: activeSection === s ? '#fff' : 'rgba(255,255,255,0.4)', background: activeSection === s ? 'rgba(255,255,255,0.1)' : 'transparent', border: activeSection === s ? '1px solid rgba(255,255,255,0.14)' : '1px solid transparent', boxShadow: activeSection === s ? 'inset 0 1px 0 rgba(255,255,255,0.1)' : 'none' }}>
              {s === 'controls' ? '🎮 Controls' : '🎨 Customize'}
            </button>
          ))}
        </div>

        {/* ── CONTROLS ── */}
        {activeSection === 'controls' && (
          <div style={{ animation: 'cc-in 0.2s ease both' }}>
            {!isAdmin && (
              <div style={{ padding: '11px 16px', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)', borderRadius: 11, marginBottom: 14, fontSize: 13, color: '#f59e0b' }}>
                View-only — you need admin access to control this match
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(175px, 215px) 1fr 1fr minmax(175px, 210px)', gap: 12, alignItems: 'start' }}>

              {/* ── Timer ── */}
              <div style={{ borderRadius: 20, overflow: 'hidden', boxShadow: clockRunning ? `0 0 40px rgba(74,222,128,0.15), 0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)` : '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)', transition: 'box-shadow 0.4s ease', ...glass }}>
                <div style={{ padding: '18px 14px 14px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 12 }}>Timer</div>
                  <div style={{ fontSize: 52, fontWeight: 900, lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em', color: isUrgent ? '#f87171' : clockRunning ? '#4ade80' : '#fff', animation: clockRunning && !isUrgent ? 'glow-text 2s ease-in-out infinite' : isUrgent ? 'score-flash 0.5s ease-in-out infinite' : 'none', textShadow: clockRunning && !isUrgent ? '0 0 40px rgba(74,222,128,0.7)' : isUrgent ? '0 0 30px rgba(248,113,113,0.8)' : 'none', transition: 'color 0.3s' }}>
                    {clockDisplay}
                  </div>
                </div>
                <div style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                    {[{ l: '+1m', d: 60 }, { l: '+1s', d: 1 }, { l: '−1m', d: -60 }, { l: '−1s', d: -1 }].map(b => (
                      <button key={b.l} className="cc-btn" onClick={() => isAdmin && adjustClock(b.d)}
                        style={{ padding: '8px 0', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 9, color: 'rgba(255,255,255,0.7)', fontWeight: 700, fontSize: 12.5, opacity: isAdmin ? 1 : 0.35 }}>
                        {b.l}
                      </button>
                    ))}
                  </div>
                  <button className="cc-btn" onClick={() => { if (!isAdmin) return; clockRunning ? pauseClock() : startClock() }}
                    style={{ width: '100%', padding: '13px', background: clockRunning ? 'rgba(239,68,68,0.15)' : 'rgba(74,222,128,0.15)', border: `1.5px solid ${clockRunning ? 'rgba(239,68,68,0.4)' : 'rgba(74,222,128,0.4)'}`, borderRadius: 12, color: clockRunning ? '#f87171' : '#4ade80', fontWeight: 800, fontSize: 14.5, opacity: isAdmin ? 1 : 0.35, boxShadow: clockRunning ? '0 0 20px rgba(239,68,68,0.15)' : '0 0 20px rgba(74,222,128,0.15)' }}>
                    {clockRunning ? '⏸ Pause' : '▶ Start'}
                  </button>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="cc-btn" onClick={() => isAdmin && resetClock()} style={{ flex: 1, padding: '9px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: 'rgba(255,255,255,0.45)', fontWeight: 600, fontSize: 12, opacity: isAdmin ? 1 : 0.35 }}>↺ Reset</button>
                    <button className="cc-btn" onClick={() => buzz()} style={{ flex: 1, padding: '9px', background: 'rgba(138,21,56,0.18)', border: '1px solid rgba(138,21,56,0.35)', borderRadius: 10, color: 'var(--accent)', fontWeight: 700, fontSize: 13, boxShadow: '0 0 16px rgba(138,21,56,0.2)' }}>🔔</button>
                  </div>
                </div>
              </div>

              {/* ── Home ── */}
              {isAdmin
                ? <TeamPanel team={home} side={1} score={match?.score1 ?? 0} fouls={match?.fouls1 ?? 0} timeouts={match?.timeouts1 ?? 0} flash={flashHome} />
                : <div style={{ borderRadius: 20, padding: 20, textAlign: 'center', color: cfg.homeTextColor, fontWeight: 700, background: cfg.homeColor, opacity: 0.5 }}>{home?.team_name ?? 'HOME'}<br /><span style={{ fontSize: 48, fontWeight: 900 }}>{match?.score1 ?? 0}</span></div>
              }

              {/* ── Away ── */}
              {isAdmin
                ? <TeamPanel team={away} side={2} score={match?.score2 ?? 0} fouls={match?.fouls2 ?? 0} timeouts={match?.timeouts2 ?? 0} flash={flashAway} />
                : <div style={{ borderRadius: 20, padding: 20, textAlign: 'center', color: cfg.awayTextColor, fontWeight: 700, background: cfg.awayColor, opacity: 0.5 }}>{away?.team_name ?? 'AWAY'}<br /><span style={{ fontSize: 48, fontWeight: 900 }}>{match?.score2 ?? 0}</span></div>
              }

              {/* ── Game ── */}
              <div style={{ borderRadius: 20, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)', ...glass }}>
                <div style={{ padding: '18px 14px 14px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 10 }}>Game</div>
                  <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1, color: isFinal ? '#e9c176' : isHalf ? '#60a5fa' : isET ? '#f59e0b' : '#fff', textShadow: isFinal ? '0 0 20px rgba(233,193,118,0.4)' : isHalf ? '0 0 20px rgba(96,165,250,0.4)' : isET ? '0 0 20px rgba(245,158,11,0.4)' : 'none' }}>{periodLabel}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 5 }}>Period {p} of {cfg.periods}</div>
                </div>
                <div style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                    <button className="cc-btn" onClick={() => isAdmin && setPeriod(1)} style={{ padding: '9px 0', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, color: '#fff', fontWeight: 700, fontSize: 12.5, opacity: isAdmin ? 1 : 0.35 }}>+1</button>
                    <button className="cc-btn" onClick={() => isAdmin && setPeriod(-1)} style={{ padding: '9px 0', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9, color: 'rgba(255,255,255,0.45)', fontWeight: 700, fontSize: 12.5, opacity: isAdmin ? 1 : 0.35 }}>−1</button>
                  </div>
                  <button className="cc-btn" onClick={() => isAdmin && setGameStatus('halftime')} style={{ width: '100%', padding: '9px', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: 10, color: '#60a5fa', fontWeight: 700, fontSize: 12.5, opacity: isAdmin ? 1 : 0.35 }}>⏸ Halftime</button>
                  <button className="cc-btn" onClick={() => isAdmin && setGameStatus('extra_time')} style={{ width: '100%', padding: '9px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, color: '#f59e0b', fontWeight: 700, fontSize: 12.5, opacity: isAdmin ? 1 : 0.35 }}>⚡ Extra Time</button>
                  <button className="cc-btn" onClick={() => isAdmin && setGameStatus('in_progress')} style={{ width: '100%', padding: '9px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 10, color: '#4ade80', fontWeight: 700, fontSize: 12.5, opacity: isAdmin ? 1 : 0.35 }}>▶ Resume</button>

                  {home && away && isAdmin && (
                    <>
                      <div style={{ height: 1, background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.08), transparent)', margin: '2px 0' }} />
                      <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.14em', textAlign: 'center' }}>Declare Winner</div>
                      <button className="cc-btn" onClick={() => declareWinner(match?.team1_id ?? null)} style={{ width: '100%', padding: '8px 10px', background: `${cfg.homeColor}20`, border: `1px solid ${cfg.homeColor}50`, borderRadius: 9, color: '#fff', fontWeight: 700, fontSize: 11.5, textAlign: 'left' }}>
                        🏆 {home.team_name}
                      </button>
                      <button className="cc-btn" onClick={() => declareWinner(match?.team2_id ?? null)} style={{ width: '100%', padding: '8px 10px', background: `${cfg.awayColor}20`, border: `1px solid ${cfg.awayColor}50`, borderRadius: 9, color: '#fff', fontWeight: 700, fontSize: 11.5, textAlign: 'left' }}>
                        🏆 {away.team_name}
                      </button>
                    </>
                  )}

                  <div style={{ height: 1, background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.08), transparent)', margin: '2px 0' }} />
                  <button className="cc-btn" onClick={() => isAdmin && setGameStatus('final')} style={{ width: '100%', padding: '9px', background: 'rgba(233,193,118,0.1)', border: '1px solid rgba(233,193,118,0.28)', borderRadius: 10, color: '#e9c176', fontWeight: 800, fontSize: 13, opacity: isAdmin ? 1 : 0.35 }}>🏁 Full Time</button>
                  <button className="cc-btn" onClick={() => isAdmin && fullReset()} style={{ width: '100%', padding: '8px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 10, color: '#f87171', fontWeight: 600, fontSize: 12, opacity: isAdmin ? 1 : 0.35 }}>↺ Reset All</button>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ── CUSTOMIZE ── */}
        {activeSection === 'setup' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'cc-in 0.2s ease both' }}>

            <div style={{ borderRadius: 18, padding: '20px 22px', ...glass }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Display Options</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px,1fr))', gap: 13 }}>
                {([
                  ['showTitle', 'Show title bar'],
                  ['showTimer', 'Show timer'],
                  ['showPeriod', 'Show period / half'],
                  ['showFouls', 'Show fouls'],
                  ['showCards', 'Show yellow / red cards'],
                  ['showTimeouts', 'Show timeouts'],
                  ['timerCountsDown', 'Timer counts down'],
                  ['autoPlayBuzzer', 'Auto buzzer on expire'],
                ] as [keyof Cfg, string][]).map(([key, label]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                    <Toggle on={!!cfg[key]} onChange={() => saveCfg({ ...cfg, [key]: !cfg[key] })} />
                    <span style={{ fontSize: 13, color: cfg[key] ? 'var(--text-primary)' : 'rgba(255,255,255,0.4)' }}>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px,1fr))', gap: 14 }}>
              {/* Timer settings */}
              <div style={{ borderRadius: 18, padding: '20px 22px', ...glass }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Timer</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>Length (mm:ss)</div>
                <input value={`${Math.floor(cfg.timerLength / 60)}:${(cfg.timerLength % 60).toString().padStart(2, '0')}`}
                  onChange={e => { const [mm, ss] = e.target.value.split(':').map(Number); if (!isNaN(mm) && !isNaN(ss)) saveCfg({ ...cfg, timerLength: mm * 60 + (ss || 0) }) }}
                  placeholder="45:00" style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 10 }} />
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[{ l: '10m', v: 600 }, { l: '20m', v: 1200 }, { l: '45m', v: 2700 }, { l: '12m', v: 720 }].map(b => (
                    <button key={b.l} className="cc-btn" onClick={() => saveCfg({ ...cfg, timerLength: b.v })} style={{ padding: '5px 13px', background: cfg.timerLength === b.v ? 'rgba(138,21,56,0.3)' : 'rgba(255,255,255,0.05)', border: `1px solid ${cfg.timerLength === b.v ? 'rgba(138,21,56,0.6)' : 'rgba(255,255,255,0.09)'}`, borderRadius: 8, color: cfg.timerLength === b.v ? 'var(--accent)' : 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 600, boxShadow: cfg.timerLength === b.v ? '0 0 14px rgba(138,21,56,0.25)' : 'none' }}>{b.l}</button>
                  ))}
                </div>
              </div>

              {/* Periods */}
              <div style={{ borderRadius: 18, padding: '20px 22px', ...glass }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Format</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[{ l: '2 Halves', v: 2 }, { l: '4 Quarters', v: 4 }].map(o => (
                    <button key={o.v} className="cc-btn" onClick={() => saveCfg({ ...cfg, periods: o.v })} style={{ flex: 1, padding: '11px', background: cfg.periods === o.v ? 'rgba(138,21,56,0.22)' : 'rgba(255,255,255,0.04)', border: `1.5px solid ${cfg.periods === o.v ? 'rgba(138,21,56,0.6)' : 'rgba(255,255,255,0.09)'}`, borderRadius: 11, color: cfg.periods === o.v ? 'var(--accent)' : 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: 700, boxShadow: cfg.periods === o.v ? '0 0 18px rgba(138,21,56,0.2)' : 'none' }}>{o.l}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Team colors */}
            <div style={{ borderRadius: 18, padding: '20px 22px', ...glass }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 18 }}>Team Colors</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {([
                  { label: 'Home', bgKey: 'homeColor' as keyof Cfg, textKey: 'homeTextColor' as keyof Cfg },
                  { label: 'Away', bgKey: 'awayColor' as keyof Cfg, textKey: 'awayTextColor' as keyof Cfg },
                ]).map(({ label, bgKey, textKey }) => (
                  <div key={label}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: cfg[bgKey] as string, boxShadow: `0 0 8px ${cfg[bgKey] as string}` }} />
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label} Team</div>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                        <input type="color" value={cfg[bgKey] as string} onChange={e => saveCfg({ ...cfg, [bgKey]: e.target.value })} style={{ width: 38, height: 30, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', background: 'transparent', padding: 2, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Background</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                        <input type="color" value={cfg[textKey] as string} onChange={e => saveCfg({ ...cfg, [textKey]: e.target.value })} style={{ width: 38, height: 30, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', background: 'transparent', padding: 2, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Text</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px,1fr))', gap: 14 }}>
              {/* Board */}
              <div style={{ borderRadius: 18, padding: '20px 22px', ...glass }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Board Background</div>
                {([['boardBg', 'Background'], ['boardText', 'Text']] as [keyof Cfg, string][]).map(([key, label]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>{label}</span>
                    <input type="color" value={cfg[key] as string} onChange={e => saveCfg({ ...cfg, [key]: e.target.value })} style={{ width: 46, height: 30, borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)', cursor: 'pointer', background: 'transparent', padding: 2 }} />
                  </div>
                ))}
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.3)', marginBottom: 7 }}>Quick themes</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[{ l: 'Dark', bg: '#0f172a' }, { l: 'Black', bg: '#000' }, { l: 'Navy', bg: '#0a0f2c' }, { l: 'Forest', bg: '#071a07' }].map(t => (
                    <button key={t.l} className="cc-btn" onClick={() => saveCfg({ ...cfg, boardBg: t.bg })} style={{ flex: 1, padding: '6px 2px', background: t.bg, border: `2px solid ${cfg.boardBg === t.bg ? 'var(--accent)' : 'rgba(255,255,255,0.12)'}`, borderRadius: 8, color: '#fff', fontSize: 10, fontWeight: 600, boxShadow: cfg.boardBg === t.bg ? '0 0 14px rgba(138,21,56,0.4)' : 'none' }}>{t.l}</button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div style={{ borderRadius: 18, padding: '20px 22px', ...glass }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Title Bar</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, cursor: 'pointer' }}>
                  <Toggle on={cfg.showTitle} onChange={() => saveCfg({ ...cfg, showTitle: !cfg.showTitle })} />
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Show title</span>
                </label>
                {cfg.showTitle && <input value={cfg.titleText} onChange={e => saveCfg({ ...cfg, titleText: e.target.value })} placeholder="Live Match" style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />}
              </div>

              {/* Font size */}
              <div style={{ borderRadius: 18, padding: '20px 22px', ...glass }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Font Size</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <button className="cc-btn" onClick={() => saveCfg({ ...cfg, fontSize: Math.max(60, cfg.fontSize - 10) })} style={{ padding: '9px 18px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, color: '#fff', fontWeight: 700, fontSize: 16 }}>−</button>
                  <span style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 900, color: '#fff' }}>{cfg.fontSize}%</span>
                  <button className="cc-btn" onClick={() => saveCfg({ ...cfg, fontSize: Math.min(160, cfg.fontSize + 10) })} style={{ padding: '9px 18px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, color: '#fff', fontWeight: 700, fontSize: 16 }}>+</button>
                </div>
                <button className="cc-btn" onClick={() => saveCfg({ ...cfg, fontSize: 100 })} style={{ width: '100%', padding: '7px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 9, color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 600 }}>Reset to 100%</button>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
