import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Match {
  id: string
  tournament_id: string
  team1_id: string
  team2_id: string
  score1: number
  score2: number
  game_status: 'not_started' | 'in_progress' | 'halftime' | 'final'
  current_period: number
  game_clock: number
  fouls1: number
  fouls2: number
  timeouts1: number
  timeouts2: number
  live_stats: Record<string, unknown> | null
  round: number
  match_number: number
  status: 'scheduled' | 'live' | 'completed'
}

interface Team {
  id: string
  team_name: string
  logo_url: string | null
}

interface Config {
  homeColor: string
  awayColor: string
  homeTextColor: string
  awayTextColor: string
  boardBg: string
  boardText: string
  showTitle: boolean
  titleText: string
  showCards: boolean
  enableAudio: boolean
  autoPlayBuzzer: boolean
  fontSize: number
  timerLength: number
  timerCountsDown: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Config = {
  homeColor: '#16a34a',
  awayColor: '#dc2626',
  homeTextColor: '#ffffff',
  awayTextColor: '#ffffff',
  boardBg: '#0a1628',
  boardText: '#ffffff',
  showTitle: false,
  titleText: 'Football Match',
  showCards: true,
  enableAudio: false,
  autoPlayBuzzer: false,
  fontSize: 100,
  timerLength: 2700,
  timerCountsDown: false,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtClock(secs: number): string {
  const s = Math.abs(Math.round(secs))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function phaseLabel(match: Match | null): string {
  if (!match) return ''
  if (match.game_status === 'not_started') return 'NOT STARTED'
  if (match.game_status === 'final') return 'FULL TIME'
  if (match.game_status === 'halftime') return 'HALF TIME'
  if (match.current_period === 1) return '1ST'
  if (match.current_period === 2) return '2ND'
  if (match.current_period === 3) return 'ET'
  if (match.current_period === 4) return 'PEN'
  return ''
}

function teamInits(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

// ── Football Public View ──────────────────────────────────────────────────────

export function FootballPublicView({ tournamentId }: { tournamentId: string }) {
  const [match, setMatch] = useState<Match | null>(null)
  const [teams, setTeams] = useState<Record<string, Team>>({})
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG)

  useEffect(() => {
    let cancelled = false
    async function poll() {
      if (cancelled) return
      const { data: rows } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('round', { ascending: true })
        .order('match_number', { ascending: true })
        .limit(1)
      if (cancelled) return
      const m = (rows?.[0] ?? null) as Match | null
      if (m) {
        setMatch(m)
        const savedCfg = (m.live_stats as any)?.config
        if (savedCfg) setCfg(() => ({ ...DEFAULT_CONFIG, ...savedCfg }))
        const ids = [m.team1_id, m.team2_id].filter(Boolean)
        if (ids.length) {
          const { data: td } = await supabase
            .from('tournament_teams')
            .select('id,team_name,logo_url')
            .in('id', ids)
          if (!cancelled && td) {
            const map: Record<string, Team> = {}
            td.forEach(t => { map[t.id] = t })
            setTeams(map)
          }
        }
      }
      if (!cancelled) setTimeout(poll, 1000)
    }
    poll()
    return () => { cancelled = true }
  }, [tournamentId])

  const t1 = teams[match?.team1_id ?? '']
  const t2 = teams[match?.team2_id ?? '']
  const sc = cfg.fontSize / 100
  const phase = phaseLabel(match)
  const isLive = match?.game_status === 'in_progress'
  const isHalf = match?.game_status === 'halftime'
  const isFull = match?.game_status === 'final'

  return (
    <div style={{
      minHeight: '100vh', background: cfg.boardBg,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter',-apple-system,sans-serif", color: cfg.boardText,
      overflow: 'hidden', position: 'relative', userSelect: 'none',
    }}>
      <style>{`
        @keyframes fb-pulse{0%,100%{opacity:1}50%{opacity:.25}}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(ellipse 70% 40% at 50% 50%, ${cfg.homeColor}08 0%, transparent 70%)` }} />

      {cfg.showTitle && (
        <div style={{ position: 'absolute', top: 24, left: 0, right: 0, textAlign: 'center',
          fontSize: 14 * sc, fontWeight: 700, color: 'rgba(255,255,255,0.4)',
          letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          {cfg.titleText}
        </div>
      )}

      {(isLive || isHalf || isFull) && (
        <div style={{
          position: 'absolute', top: cfg.showTitle ? 56 : 24,
          left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 6,
          background: isFull ? 'rgba(255,255,255,.08)' : isHalf ? 'rgba(245,158,11,.15)' : 'rgba(239,68,68,.15)',
          border: `1px solid ${isFull ? 'rgba(255,255,255,.15)' : isHalf ? 'rgba(245,158,11,.4)' : 'rgba(239,68,68,.4)'}`,
          borderRadius: 20, padding: '5px 14px', whiteSpace: 'nowrap',
        }}>
          {isLive && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', animation: 'fb-pulse 1.4s ease-in-out infinite' }} />}
          <span style={{ fontSize: 11 * sc, fontWeight: 800, letterSpacing: '0.12em',
            color: isFull ? 'rgba(255,255,255,.6)' : isHalf ? '#f59e0b' : '#ef4444' }}>
            {isFull ? 'FULL TIME' : isHalf ? 'HALF TIME' : 'LIVE'}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 32 * sc, width: '100%', maxWidth: 860, padding: `0 ${32 * sc}px` }}>
        {/* Team 1 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 * sc }}>
          {t1?.logo_url
            ? <img src={t1.logo_url} alt="" style={{ width: 72 * sc, height: 72 * sc, objectFit: 'contain' }} />
            : <div style={{ width: 72 * sc, height: 72 * sc, borderRadius: 14 * sc, background: cfg.homeColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26 * sc, fontWeight: 900, color: cfg.homeTextColor }}>
                {t1 ? teamInits(t1.team_name) : 'H'}
              </div>
          }
          <div style={{ fontSize: 15 * sc, fontWeight: 800, textAlign: 'center', textTransform: 'uppercase',
            letterSpacing: '0.03em', lineHeight: 1.2, color: cfg.boardText }}>
            {t1?.team_name ?? 'Home'}
          </div>
          <div style={{ fontSize: 96 * sc, fontWeight: 900, color: cfg.homeColor, lineHeight: 1,
            fontVariantNumeric: 'tabular-nums', textShadow: `0 0 60px ${cfg.homeColor}50` }}>
            {match?.score1 ?? 0}
          </div>
          {cfg.showCards && (
            <div style={{ display: 'flex', gap: 14 * sc, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 * sc }}>
                <div style={{ width: 13 * sc, height: 17 * sc, background: '#facc15', borderRadius: 2 * sc, flexShrink: 0 }} />
                <span style={{ fontSize: 15 * sc, fontWeight: 700, color: 'rgba(255,255,255,.75)' }}>{match?.fouls1 ?? 0}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 * sc }}>
                <div style={{ width: 13 * sc, height: 17 * sc, background: '#ef4444', borderRadius: 2 * sc, flexShrink: 0 }} />
                <span style={{ fontSize: 15 * sc, fontWeight: 700, color: 'rgba(255,255,255,.75)' }}>{match?.timeouts1 ?? 0}</span>
              </div>
            </div>
          )}
        </div>

        {/* Centre */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 * sc, minWidth: 120 * sc }}>
          <div style={{ fontSize: 12 * sc, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,.35)', minHeight: 16 * sc, textAlign: 'center' }}>
            {phase}
          </div>
          <div style={{ fontSize: 16 * sc, fontWeight: 900, color: 'rgba(255,255,255,.15)' }}>—</div>
          <div style={{ fontSize: 28 * sc, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
            color: 'rgba(255,255,255,.5)', letterSpacing: '0.04em' }}>
            {fmtClock(match?.game_clock ?? 0)}
          </div>
        </div>

        {/* Team 2 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 * sc }}>
          {t2?.logo_url
            ? <img src={t2.logo_url} alt="" style={{ width: 72 * sc, height: 72 * sc, objectFit: 'contain' }} />
            : <div style={{ width: 72 * sc, height: 72 * sc, borderRadius: 14 * sc, background: cfg.awayColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26 * sc, fontWeight: 900, color: cfg.awayTextColor }}>
                {t2 ? teamInits(t2.team_name) : 'A'}
              </div>
          }
          <div style={{ fontSize: 15 * sc, fontWeight: 800, textAlign: 'center', textTransform: 'uppercase',
            letterSpacing: '0.03em', lineHeight: 1.2, color: cfg.boardText }}>
            {t2?.team_name ?? 'Away'}
          </div>
          <div style={{ fontSize: 96 * sc, fontWeight: 900, color: cfg.awayColor, lineHeight: 1,
            fontVariantNumeric: 'tabular-nums', textShadow: `0 0 60px ${cfg.awayColor}50` }}>
            {match?.score2 ?? 0}
          </div>
          {cfg.showCards && (
            <div style={{ display: 'flex', gap: 14 * sc, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 * sc }}>
                <div style={{ width: 13 * sc, height: 17 * sc, background: '#facc15', borderRadius: 2 * sc, flexShrink: 0 }} />
                <span style={{ fontSize: 15 * sc, fontWeight: 700, color: 'rgba(255,255,255,.75)' }}>{match?.fouls2 ?? 0}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 * sc }}>
                <div style={{ width: 13 * sc, height: 17 * sc, background: '#ef4444', borderRadius: 2 * sc, flexShrink: 0 }} />
                <span style={{ fontSize: 15 * sc, fontWeight: 700, color: 'rgba(255,255,255,.75)' }}>{match?.timeouts2 ?? 0}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Admin page ────────────────────────────────────────────────────────────────

function FootballAdminPage({ tournamentId }: { tournamentId: string }) {
  const navigate = useNavigate()
  const { session } = useAuth()

  const [matches, setMatches] = useState<Match[]>([])
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [match, setMatch] = useState<Match | null>(null)
  const [teams, setTeams] = useState<Record<string, Team>>({})
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG)
  const [tab, setTab] = useState<'ctrl' | 'match' | 'setup'>('ctrl')

  const [clockRunning, setClockRunning] = useState(false)
  const [updatingTeam, setUpdatingTeam] = useState<string | null>(null)
  const [shareToast, setShareToast] = useState(false)

  const homeLogoRef = useRef<HTMLInputElement>(null)
  const awayLogoRef = useRef<HTMLInputElement>(null)
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const clockValRef = useRef(0)

  // ── load ──
  useEffect(() => {
    if (!tournamentId || !session?.user) return
    async function load() {
      const uid = session!.user.id
      const { data: t } = await supabase
        .from('tournaments')
        .select('created_by,admins,club_id')
        .eq('id', tournamentId)
        .single()
      if (t) {
        const adminList: string[] = t.admins ?? []
        let flag = t.created_by === uid || adminList.includes(uid)
        if (!flag && t.club_id) {
          const { data: mem } = await supabase
            .from('club_members')
            .select('role')
            .eq('club_id', t.club_id)
            .eq('user_id', uid)
            .single()
          if (mem?.role === 'admin' || mem?.role === 'owner') flag = true
        }
        void flag // isAdmin check reserved for future use
      }

      const { data: ms } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('round', { ascending: true })
        .order('match_number', { ascending: true })
      if (ms?.length) {
        setMatches(ms as Match[])
        const first = ms[0] as Match
        setSelectedMatchId(first.id)
        setMatch(first)
        clockValRef.current = first.game_clock ?? 0
        setClockRunning(first.game_status === 'in_progress')
        const saved = (first.live_stats as any)?.config
        if (saved) setCfg(c => ({ ...c, ...saved }))
      }
    }
    load()
  }, [tournamentId, session?.user?.id])

  // ── load teams when match changes ──
  useEffect(() => {
    if (!match) return
    const ids = [match.team1_id, match.team2_id].filter(Boolean)
    if (!ids.length) return
    supabase
      .from('tournament_teams')
      .select('id,team_name,logo_url')
      .in('id', ids)
      .then(({ data }) => {
        if (data) {
          const map: Record<string, Team> = {}
          data.forEach(t => { map[t.id] = t })
          setTeams(ts => ({ ...ts, ...map }))
        }
      })
  }, [match?.team1_id, match?.team2_id])

  // ── realtime ──
  useEffect(() => {
    if (!selectedMatchId) return
    const ch = supabase
      .channel(`fb_match_${selectedMatchId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'tournament_matches',
        filter: `id=eq.${selectedMatchId}`,
      }, payload => {
        const m = payload.new as Match
        setMatch(m)
        if (!clockRunning) clockValRef.current = m.game_clock ?? 0
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [selectedMatchId, clockRunning])

  // ── clock interval ──
  useEffect(() => {
    if (clockRef.current) clearInterval(clockRef.current)
    if (!clockRunning || !selectedMatchId) return
    clockRef.current = setInterval(() => {
      const next = cfg.timerCountsDown
        ? Math.max(0, clockValRef.current - 1)
        : clockValRef.current + 1
      clockValRef.current = next
      setMatch(m => m ? { ...m, game_clock: next } : m)
      supabase.from('tournament_matches').update({ game_clock: next }).eq('id', selectedMatchId).then(() => {})
      if (cfg.timerCountsDown && next <= 0) {
        setClockRunning(false)
        if (cfg.autoPlayBuzzer) playBuzzer()
      }
    }, 1000)
    return () => { if (clockRef.current) clearInterval(clockRef.current) }
  }, [clockRunning, selectedMatchId, cfg.timerCountsDown, cfg.autoPlayBuzzer])

  // ── patch ──
  const patchMatch = useCallback(async (patch: Partial<Match>) => {
    if (!selectedMatchId) return
    const { data } = await supabase
      .from('tournament_matches')
      .update(patch)
      .eq('id', selectedMatchId)
      .select()
      .single()
    if (data) {
      setMatch(data as Match)
      setMatches(ms => ms.map(m => m.id === selectedMatchId ? data as Match : m))
    }
  }, [selectedMatchId])

  async function selectMatch(id: string) {
    if (clockRef.current) clearInterval(clockRef.current)
    setClockRunning(false)
    setSelectedMatchId(id)
    const { data } = await supabase.from('tournament_matches').select('*').eq('id', id).single()
    if (data) {
      const m = data as Match
      setMatch(m)
      clockValRef.current = m.game_clock ?? 0
      setClockRunning(m.game_status === 'in_progress')
      const saved = (m.live_stats as any)?.config
      setCfg(saved ? { ...DEFAULT_CONFIG, ...saved } : DEFAULT_CONFIG)
    }
  }

  // ── score ──
  function updateScore(team: 1 | 2, delta: number) {
    if (!match) return
    const key = team === 1 ? 'score1' : 'score2'
    const cur = team === 1 ? match.score1 : match.score2
    patchMatch({ [key]: Math.max(0, cur + delta) })
  }

  // ── cards ──
  function updateYellow(team: 1 | 2, delta: number) {
    if (!match) return
    const key = team === 1 ? 'fouls1' : 'fouls2'
    const cur = team === 1 ? match.fouls1 : match.fouls2
    patchMatch({ [key]: Math.max(0, cur + delta) })
  }

  function updateRed(team: 1 | 2, delta: number) {
    if (!match) return
    const key = team === 1 ? 'timeouts1' : 'timeouts2'
    const cur = team === 1 ? match.timeouts1 : match.timeouts2
    patchMatch({ [key]: Math.max(0, cur + delta) })
  }

  // ── phase ──
  function setPhase(period: number, status: Match['game_status'], resetClock?: boolean) {
    if (clockRef.current) clearInterval(clockRef.current)
    setClockRunning(false)
    const clockVal = resetClock
      ? (cfg.timerCountsDown ? cfg.timerLength : 0)
      : clockValRef.current
    clockValRef.current = clockVal
    patchMatch({ game_status: status, current_period: period, game_clock: clockVal })
  }

  // ── clock ──
  function toggleClock() {
    if (!match) return
    const starting = !clockRunning
    setClockRunning(starting)
    if (starting && match.game_status === 'not_started') {
      patchMatch({ game_status: 'in_progress', current_period: 1 })
    }
  }

  function adjustClock(deltaMin: number) {
    const next = Math.max(0, clockValRef.current + deltaMin * 60)
    clockValRef.current = next
    setMatch(m => m ? { ...m, game_clock: next } : m)
    patchMatch({ game_clock: next })
  }

  function resetClock() {
    const val = cfg.timerCountsDown ? cfg.timerLength : 0
    clockValRef.current = val
    setMatch(m => m ? { ...m, game_clock: val } : m)
    patchMatch({ game_clock: val })
  }

  // ── config ──
  function saveConfig(newCfg: Config) {
    setCfg(newCfg)
    if (!selectedMatchId || !match) return
    const liveStats = { ...(match.live_stats ?? {}), config: newCfg }
    supabase.from('tournament_matches').update({ live_stats: liveStats }).eq('id', selectedMatchId).then(() => {})
    setMatch(m => m ? { ...m, live_stats: liveStats } : m)
  }

  // ── flip ──
  function flipTeams() {
    if (!match) return
    patchMatch({
      team1_id: match.team2_id, team2_id: match.team1_id,
      score1: match.score2, score2: match.score1,
      fouls1: match.fouls2, fouls2: match.fouls1,
      timeouts1: match.timeouts2, timeouts2: match.timeouts1,
    })
  }

  // ── full reset ──
  function fullReset() {
    if (clockRef.current) clearInterval(clockRef.current)
    setClockRunning(false)
    const val = cfg.timerCountsDown ? cfg.timerLength : 0
    clockValRef.current = val
    patchMatch({ score1: 0, score2: 0, fouls1: 0, fouls2: 0, timeouts1: 0, timeouts2: 0,
      game_clock: val, game_status: 'not_started', current_period: 0 })
  }

  // ── team logo ──
  async function uploadTeamLogo(teamId: string, file: File) {
    setUpdatingTeam(teamId)
    const ext = file.name.split('.').pop()
    const path = `team-logos/${teamId}.${ext}`
    const { error } = await supabase.storage.from('tournament-assets').upload(path, file, { upsert: true })
    if (!error) {
      const { data: urlData } = supabase.storage.from('tournament-assets').getPublicUrl(path)
      await supabase.from('tournament_teams').update({ logo_url: urlData.publicUrl }).eq('id', teamId)
      setTeams(ts => ({ ...ts, [teamId]: { ...ts[teamId], logo_url: urlData.publicUrl } }))
    }
    setUpdatingTeam(null)
  }

  async function removeTeamLogo(teamId: string) {
    await supabase.from('tournament_teams').update({ logo_url: null }).eq('id', teamId)
    setTeams(ts => ({ ...ts, [teamId]: { ...ts[teamId], logo_url: null } }))
  }

  async function updateTeamName(teamId: string, name: string) {
    if (!name.trim()) return
    await supabase.from('tournament_teams').update({ team_name: name.trim() }).eq('id', teamId)
    setTeams(ts => ({ ...ts, [teamId]: { ...ts[teamId], team_name: name.trim() } }))
  }

  // ── audio ──
  function playBuzzer() {
    try {
      const ac = new AudioContext()
      const o = ac.createOscillator(); const g = ac.createGain()
      o.connect(g); g.connect(ac.destination)
      o.frequency.setValueAtTime(880, ac.currentTime)
      o.frequency.setValueAtTime(440, ac.currentTime + 0.15)
      g.gain.setValueAtTime(0.5, ac.currentTime)
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.5)
      o.start(); o.stop(ac.currentTime + 0.5)
    } catch {}
  }

  // ── share ──
  function copyShareUrl() {
    const url = `${window.location.origin}/tournaments/${tournamentId}/scoreboard/football?view=public`
    navigator.clipboard.writeText(url).then(() => {
      setShareToast(true)
      setTimeout(() => setShareToast(false), 2500)
    })
  }

  // ── derived ──
  const t1 = teams[match?.team1_id ?? '']
  const t2 = teams[match?.team2_id ?? '']
  const clock = match?.game_clock ?? 0
  const phase = phaseLabel(match)

  const PHASES = [
    { label: '1ST', active: match?.game_status === 'in_progress' && match?.current_period === 1,
      onClick: () => setPhase(1, 'in_progress', true) },
    { label: 'HT', active: match?.game_status === 'halftime',
      onClick: () => setPhase(match?.current_period ?? 1, 'halftime') },
    { label: '2ND', active: match?.game_status === 'in_progress' && match?.current_period === 2,
      onClick: () => setPhase(2, 'in_progress', true) },
    { label: 'ET', active: match?.game_status === 'in_progress' && match?.current_period === 3,
      onClick: () => setPhase(3, 'in_progress', true) },
    { label: 'PEN', active: match?.game_status === 'in_progress' && match?.current_period === 4,
      onClick: () => setPhase(4, 'in_progress', true) },
    { label: 'FT', active: match?.game_status === 'final',
      onClick: () => setPhase(match?.current_period ?? 2, 'final') },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#fff',
      fontFamily: "'Inter',-apple-system,sans-serif", padding: '20px 0' }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fb-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
          <button onClick={() => navigate(`/tournaments/${tournamentId}`)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
              color: 'rgba(255,255,255,.5)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', padding: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            Back
          </button>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.5)' }}>⚽ Football Scoreboard</span>
            <button
              onClick={() => window.open(`/tournaments/${tournamentId}/scoreboard/football?view=public`, '_blank')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)',
                borderRadius: 9, color: 'rgba(255,255,255,.7)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Public View
            </button>
            <button onClick={copyShareUrl}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                background: shareToast ? 'rgba(74,222,128,.15)' : 'rgba(255,255,255,.06)',
                border: `1px solid ${shareToast ? 'rgba(74,222,128,.4)' : 'rgba(255,255,255,.12)'}`,
                borderRadius: 9, color: shareToast ? '#4ade80' : 'rgba(255,255,255,.7)',
                cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', transition: 'all .2s' }}>
              {shareToast
                ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg> Copied!</>
                : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> Share</>
              }
            </button>
          </div>
        </div>

        {/* ── Mini scoreboard ── */}
        {match && (
          <div style={{ background: '#111827', borderRadius: 18, padding: '20px 24px', marginBottom: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
            animation: 'fb-in .3s ease both' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 80 }}>
              <div style={{ width: 44, height: 44, borderRadius: 11,
                background: t1?.logo_url ? 'transparent' : cfg.homeColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, fontWeight: 900, color: cfg.homeTextColor, overflow: 'hidden', flexShrink: 0 }}>
                {t1?.logo_url
                  ? <img src={t1.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (t1 ? teamInits(t1.team_name) : 'H')}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.6)', textAlign: 'center', maxWidth: 80 }}>
                {t1?.team_name ?? 'Home'}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, justifyContent: 'center', minWidth: 160 }}>
              <div style={{ fontSize: 56, fontWeight: 900, color: cfg.homeColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{match.score1}</div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.35)' }}>{phase}</div>
                <div style={{ fontSize: 24, fontWeight: 300, color: 'rgba(255,255,255,.2)' }}>:</div>
                <div style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'rgba(255,255,255,.4)' }}>{fmtClock(clock)}</div>
              </div>
              <div style={{ fontSize: 56, fontWeight: 900, color: cfg.awayColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{match.score2}</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 80 }}>
              <div style={{ width: 44, height: 44, borderRadius: 11,
                background: t2?.logo_url ? 'transparent' : cfg.awayColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, fontWeight: 900, color: cfg.awayTextColor, overflow: 'hidden', flexShrink: 0 }}>
                {t2?.logo_url
                  ? <img src={t2.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (t2 ? teamInits(t2.team_name) : 'A')}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.6)', textAlign: 'center', maxWidth: 80 }}>
                {t2?.team_name ?? 'Away'}
              </div>
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'rgba(255,255,255,.04)', borderRadius: 12, padding: 4 }}>
          {(['ctrl', 'match', 'setup'] as const).map(key => (
            <button key={key} onClick={() => setTab(key)}
              style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: tab === key ? 'rgba(255,255,255,.1)' : 'transparent',
                color: tab === key ? '#fff' : 'rgba(255,255,255,.45)',
                fontSize: 13, fontWeight: 700, transition: 'all .15s',
                textTransform: 'capitalize' }}>
              {key === 'ctrl' ? 'Controls' : key === 'match' ? 'Match' : 'Setup'}
            </button>
          ))}
        </div>

        {/* ── Controls tab ── */}
        {tab === 'ctrl' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fb-in .25s ease both' }}>

            {/* Goals */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {([1, 2] as const).map(team => {
                const score = team === 1 ? (match?.score1 ?? 0) : (match?.score2 ?? 0)
                const color = team === 1 ? cfg.homeColor : cfg.awayColor
                const tObj = team === 1 ? t1 : t2
                const rgb = team === 1 ? '22,163,74' : '220,38,38'
                return (
                  <div key={team} style={{ background: '#1f2937', borderRadius: 14, padding: '16px 18px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                      {team === 1 ? 'Home' : 'Away'} Goals
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.4)', marginBottom: 10 }}>
                      {tObj?.team_name ?? (team === 1 ? 'Home' : 'Away')}
                    </div>
                    <div style={{ fontSize: 52, fontWeight: 900, color, lineHeight: 1, fontVariantNumeric: 'tabular-nums', marginBottom: 14 }}>
                      {score}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => updateScore(team, +1)}
                        style={{ flex: 1, padding: '12px 0', background: `rgba(${rgb},.2)`, border: `1.5px solid ${color}60`,
                          borderRadius: 10, color, fontWeight: 900, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}
                        onMouseEnter={e => (e.currentTarget.style.background = `rgba(${rgb},.35)`)}
                        onMouseLeave={e => (e.currentTarget.style.background = `rgba(${rgb},.2)`)}>
                        ⚽ +1
                      </button>
                      <button onClick={() => updateScore(team, -1)}
                        style={{ padding: '12px 14px', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
                          borderRadius: 10, color: 'rgba(255,255,255,.5)', fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit' }}>
                        −1
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {([1, 2] as const).map(team => {
                const yellow = team === 1 ? (match?.fouls1 ?? 0) : (match?.fouls2 ?? 0)
                const red = team === 1 ? (match?.timeouts1 ?? 0) : (match?.timeouts2 ?? 0)
                const tObj = team === 1 ? t1 : t2
                return (
                  <div key={team} style={{ background: '#1f2937', borderRadius: 14, padding: '16px 18px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                      {team === 1 ? 'Home' : 'Away'} Cards
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.4)', marginBottom: 12 }}>
                      {tObj?.team_name ?? (team === 1 ? 'Home' : 'Away')}
                    </div>
                    {/* Yellow */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 14, height: 18, background: '#facc15', borderRadius: 3, flexShrink: 0 }} />
                        <span style={{ fontSize: 22, fontWeight: 800, color: '#facc15', fontVariantNumeric: 'tabular-nums' }}>{yellow}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => updateYellow(team, +1)}
                          style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(250,204,21,.15)', border: '1px solid rgba(250,204,21,.35)',
                            borderRadius: 9, color: '#facc15', fontWeight: 900, fontSize: 18, cursor: 'pointer', fontFamily: 'inherit' }}>+</button>
                        <button onClick={() => updateYellow(team, -1)}
                          style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
                            borderRadius: 9, color: 'rgba(255,255,255,.5)', fontWeight: 700, fontSize: 18, cursor: 'pointer', fontFamily: 'inherit' }}>−</button>
                      </div>
                    </div>
                    {/* Red */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 14, height: 18, background: '#ef4444', borderRadius: 3, flexShrink: 0 }} />
                        <span style={{ fontSize: 22, fontWeight: 800, color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{red}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => updateRed(team, +1)}
                          style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.35)',
                            borderRadius: 9, color: '#ef4444', fontWeight: 900, fontSize: 18, cursor: 'pointer', fontFamily: 'inherit' }}>+</button>
                        <button onClick={() => updateRed(team, -1)}
                          style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
                            borderRadius: 9, color: 'rgba(255,255,255,.5)', fontWeight: 700, fontSize: 18, cursor: 'pointer', fontFamily: 'inherit' }}>−</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Clock */}
            <div style={{ background: '#1f2937', borderRadius: 14, padding: '18px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Game Clock</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button onClick={toggleClock}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 22px',
                    background: clockRunning ? 'rgba(239,68,68,.15)' : 'rgba(74,222,128,.15)',
                    border: `1.5px solid ${clockRunning ? 'rgba(239,68,68,.4)' : 'rgba(74,222,128,.4)'}`,
                    borderRadius: 12, color: clockRunning ? '#f87171' : '#4ade80',
                    fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                  {clockRunning
                    ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>Pause</>
                    : <><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>Start</>
                  }
                </button>
                <div style={{ fontSize: 48, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: '#fff', letterSpacing: '0.04em', flex: 1, textAlign: 'center' }}>
                  {fmtClock(clock)}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => adjustClock(-1)}
                    style={{ padding: '8px 12px', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, color: 'rgba(255,255,255,.7)', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>−1m</button>
                  <button onClick={() => adjustClock(+1)}
                    style={{ padding: '8px 12px', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, color: 'rgba(255,255,255,.7)', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>+1m</button>
                  <button onClick={resetClock}
                    style={{ padding: '8px 12px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 8, color: 'rgba(255,255,255,.4)', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Reset</button>
                </div>
              </div>
            </div>

            {/* Phase */}
            <div style={{ background: '#1f2937', borderRadius: 14, padding: '18px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Match Phase</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PHASES.map(({ label, active, onClick }) => (
                  <button key={label} onClick={onClick}
                    style={{ padding: '10px 18px',
                      background: active ? 'rgba(138,21,56,.25)' : 'rgba(255,255,255,.06)',
                      border: `1.5px solid ${active ? 'rgba(138,21,56,.6)' : 'rgba(255,255,255,.1)'}`,
                      borderRadius: 10, color: active ? '#fff' : 'rgba(255,255,255,.55)',
                      fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reset */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={fullReset}
                style={{ padding: '9px 18px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 10, color: '#f87171', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit' }}>
                Full Reset
              </button>
            </div>
          </div>
        )}

        {/* ── Match tab ── */}
        {tab === 'match' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, animation: 'fb-in .25s ease both' }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.45)', marginBottom: 6 }}>Select a match to control</div>
            {matches.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,.3)', fontSize: 13 }}>
                No matches yet — generate the bracket from the tournament page
              </div>
            )}
            {matches.map(m => {
              const mt1 = teams[m.team1_id]
              const mt2 = teams[m.team2_id]
              const sel = m.id === selectedMatchId
              return (
                <button key={m.id} onClick={() => selectMatch(m.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                    background: sel ? 'rgba(138,21,56,.15)' : 'rgba(255,255,255,.04)',
                    border: `1px solid ${sel ? 'rgba(138,21,56,.45)' : 'rgba(255,255,255,.08)'}`,
                    borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all .15s' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.35)', width: 32, textAlign: 'center', flexShrink: 0 }}>R{m.round}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#fff', marginBottom: 2 }}>
                      {mt1?.team_name ?? '?'} vs {mt2?.team_name ?? '?'}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.4)' }}>
                      {m.game_status === 'not_started' ? 'Not Started'
                        : m.game_status === 'in_progress' ? `LIVE · ${phaseLabel(m)} · ${fmtClock(m.game_clock)}`
                        : m.game_status === 'halftime' ? 'Half Time'
                        : 'Full Time'} · {m.score1}–{m.score2}
                    </div>
                  </div>
                  {m.game_status === 'in_progress' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px',
                      background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.35)', borderRadius: 20 }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444' }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444' }}>LIVE</span>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* ── Setup tab ── */}
        {tab === 'setup' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fb-in .25s ease both' }}>

            {/* Team setup */}
            <div style={{ background: '#1f2937', borderRadius: 14, padding: '18px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Team Setup</span>
                <button onClick={flipTeams}
                  style={{ padding: '5px 11px', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 7, color: 'rgba(255,255,255,.5)', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ⇄ Flip Home/Away
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {([
                  { label: 'Home', bgKey: 'homeColor' as keyof Config, textKey: 'homeTextColor' as keyof Config, teamId: match?.team1_id ?? '', logoRef: homeLogoRef },
                  { label: 'Away', bgKey: 'awayColor' as keyof Config, textKey: 'awayTextColor' as keyof Config, teamId: match?.team2_id ?? '', logoRef: awayLogoRef },
                ]).map(({ label, bgKey, textKey, teamId, logoRef }) => {
                  const tObj = teams[teamId]
                  const isUploading = updatingTeam === teamId
                  const inits = (tObj?.team_name ?? label).trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
                  return (
                    <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label} Team</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          onClick={() => !isUploading && logoRef.current?.click()}
                          style={{ width: 48, height: 48, borderRadius: 11, background: tObj?.logo_url ? 'transparent' : 'rgba(255,255,255,.06)',
                            border: '2px dashed rgba(255,255,255,.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            overflow: 'hidden', flexShrink: 0, transition: 'border-color .15s' }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,.35)')}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,.15)')}>
                          {isUploading
                            ? <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
                            : tObj?.logo_url
                              ? <img src={tObj.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                          }
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 3 }}>{tObj?.team_name ?? inits}</div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => logoRef.current?.click()}
                              style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, fontWeight: 600 }}>
                              {tObj?.logo_url ? 'Change logo' : 'Upload logo'}
                            </button>
                            {tObj?.logo_url && (
                              <>
                                <span style={{ color: 'rgba(255,255,255,.2)', fontSize: 11 }}>·</span>
                                <button onClick={() => removeTeamLogo(teamId)}
                                  style={{ fontSize: 11, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Remove</button>
                              </>
                            )}
                          </div>
                        </div>
                        <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }}
                          onChange={e => { const f = e.target.files?.[0]; if (f && teamId) uploadTeamLogo(teamId, f); e.target.value = '' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginBottom: 4 }}>Team name</div>
                        <input
                          defaultValue={tObj?.team_name ?? ''}
                          key={tObj?.team_name}
                          onBlur={e => teamId && updateTeamName(teamId, e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                          placeholder="Team name"
                          style={{ width: '100%', padding: '7px 10px', background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, color: '#fff', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1 }}>
                          <input type="color" value={cfg[bgKey] as string} onChange={e => saveConfig({ ...cfg, [bgKey]: e.target.value })}
                            style={{ width: 32, height: 26, borderRadius: 6, border: '1px solid rgba(255,255,255,.15)', cursor: 'pointer', background: 'transparent', padding: 2, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: 'rgba(255,255,255,.45)' }}>Background</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1 }}>
                          <input type="color" value={cfg[textKey] as string} onChange={e => saveConfig({ ...cfg, [textKey]: e.target.value })}
                            style={{ width: 32, height: 26, borderRadius: 6, border: '1px solid rgba(255,255,255,.15)', cursor: 'pointer', background: 'transparent', padding: 2, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: 'rgba(255,255,255,.45)' }}>Text</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Board + Title + Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px,1fr))', gap: 14 }}>
              <div style={{ background: '#1f2937', borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Board Colors</div>
                {(['boardBg', 'boardText'] as const).map((key, i) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>{i === 0 ? 'Background' : 'Text'}</span>
                    <input type="color" value={cfg[key]} onChange={e => saveConfig({ ...cfg, [key]: e.target.value })}
                      style={{ width: 48, height: 30, borderRadius: 7, border: '1px solid rgba(255,255,255,.15)', cursor: 'pointer', background: 'transparent', padding: 2 }} />
                  </div>
                ))}
              </div>

              <div style={{ background: '#1f2937', borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Display</div>
                {([
                  ['showCards', 'Show yellow/red cards'] as const,
                  ['showTitle', 'Show a title'] as const,
                ]).map(([key, label]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 10 }}>
                    <div onClick={() => saveConfig({ ...cfg, [key]: !cfg[key] })}
                      style={{ width: 38, height: 22, borderRadius: 11,
                        background: cfg[key] ? 'rgba(138,43,226,.8)' : 'rgba(255,255,255,.12)',
                        position: 'relative', transition: 'all .2s', cursor: 'pointer', flexShrink: 0 }}>
                      <div style={{ position: 'absolute', top: 2, left: cfg[key] ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                    </div>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>{label}</span>
                  </label>
                ))}
                {cfg.showTitle && (
                  <input value={cfg.titleText} onChange={e => saveConfig({ ...cfg, titleText: e.target.value })}
                    placeholder="Match title"
                    style={{ width: '100%', padding: '7px 10px', background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, color: '#fff', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                )}
              </div>

              <div style={{ background: '#1f2937', borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Timer Settings</div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', marginBottom: 5 }}>Half length (mm:ss)</div>
                  <input
                    value={`${Math.floor(cfg.timerLength / 60)}:${(cfg.timerLength % 60).toString().padStart(2, '0')}`}
                    onChange={e => {
                      const [m, s] = e.target.value.split(':').map(Number)
                      if (!isNaN(m)) saveConfig({ ...cfg, timerLength: m * 60 + (s || 0) })
                    }}
                    placeholder="45:00"
                    style={{ width: '100%', padding: '7px 10px', background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, color: '#fff', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                  />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 8 }}>
                  <input type="radio" checked={!cfg.timerCountsDown} onChange={() => saveConfig({ ...cfg, timerCountsDown: false })} style={{ accentColor: 'rgba(138,43,226,.9)' }} />
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>Timer counts up</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input type="radio" checked={cfg.timerCountsDown} onChange={() => saveConfig({ ...cfg, timerCountsDown: true })} style={{ accentColor: 'rgba(138,43,226,.9)' }} />
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>Timer counts down</span>
                </label>
              </div>

              <div style={{ background: '#1f2937', borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Fonts</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', marginBottom: 8 }}>Font size</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => saveConfig({ ...cfg, fontSize: Math.max(60, cfg.fontSize - 10) })}
                    style={{ padding: '8px 16px', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 16, fontFamily: 'inherit' }}>−</button>
                  <span style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: 700, color: '#fff' }}>{cfg.fontSize}%</span>
                  <button onClick={() => saveConfig({ ...cfg, fontSize: Math.min(160, cfg.fontSize + 10) })}
                    style={{ padding: '8px 16px', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 16, fontFamily: 'inherit' }}>+</button>
                  <button onClick={() => saveConfig({ ...cfg, fontSize: 100 })}
                    style={{ padding: '8px 12px', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, color: 'rgba(255,255,255,.5)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Reset</button>
                </div>
              </div>

              <div style={{ background: '#1f2937', borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Audio</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 12 }}>
                  <div onClick={() => saveConfig({ ...cfg, enableAudio: !cfg.enableAudio })}
                    style={{ width: 38, height: 22, borderRadius: 11, background: cfg.enableAudio ? 'rgba(138,43,226,.8)' : 'rgba(255,255,255,.12)', position: 'relative', transition: 'all .2s', cursor: 'pointer', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: 2, left: cfg.enableAudio ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                  </div>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>Enable Audio on Public View</span>
                </label>
                <button onClick={playBuzzer}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: 'rgba(138,21,56,.15)', border: '1px solid rgba(138,21,56,.3)', borderRadius: 8, color: 'var(--accent)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit' }}>
                  🔔 Test Buzzer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page entry ────────────────────────────────────────────────────────────────

export default function FootballScoreboardPage() {
  const [searchParams] = useSearchParams()
  const { tournamentId } = useParams<{ tournamentId: string }>()
  if (searchParams.get('view') === 'public') return <FootballPublicView tournamentId={tournamentId!} />
  return <FootballAdminPage tournamentId={tournamentId!} />
}
