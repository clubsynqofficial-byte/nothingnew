import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

interface Tournament {
  id: string
  club_id: string
  created_by: string
  name: string
  sport: string
  description: string | null
  rules: string | null
  location: string | null
  registration_deadline: string | null
  start_date: string | null
  end_date: string | null
  max_teams: number
  min_team_size: number
  max_team_size: number
  status: 'registration_open' | 'registration_closed' | 'ongoing' | 'completed' | 'cancelled'
  format: 'single_elimination' | 'round_robin'
  prize_description: string | null
  prizes: Array<{ place: string; description: string }> | null
  registration_fields: Array<{ id: string; label: string; type: string; options?: string[] }> | null
  logo_url: string | null
  created_at: string
  club: { id: string; name: string; logo_url: string | null } | null
}

interface Team {
  id: string
  tournament_id: string
  captain_id: string
  team_name: string
  player_names: string[]
  status: 'pending' | 'accepted' | 'declined'
  notes: string | null
  seed: number | null
  created_at: string
  logo_url: string | null
  registration_answers: Record<string, string> | null
  players: Array<{ name: string; role: string }> | null
  captain?: { full_name: string | null; school: string | null } | null
}

interface Match {
  id: string
  tournament_id: string
  team1_id: string | null
  team2_id: string | null
  score1: number
  score2: number
  winner_id: string | null
  round: number
  match_number: number
  status: 'scheduled' | 'live' | 'completed'
  scheduled_at: string | null
  location: string | null
  notes: string | null
}

const SPORT_EMOJIS: Record<string, string> = {
  Basketball: '🏀', Football: '⚽', Volleyball: '🏐', Tennis: '🎾',
  Badminton: '🏸', Cricket: '🏏', Swimming: '🏊', Athletics: '🏃',
  Chess: '♟️', Gaming: '🎮', 'Table Tennis': '🏓', Rugby: '🏉',
  Baseball: '⚾', Hockey: '🏑', Other: '🏆',
}

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  registration_open: { label: 'Registration Open', color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
  registration_closed: { label: 'Reg. Closed', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  ongoing: { label: 'Live Now', color: '#f97316', bg: 'rgba(249,115,22,0.14)' },
  completed: { label: 'Completed', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  cancelled: { label: 'Cancelled', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
}

function fmt(iso: string | null) {
  if (!iso) return 'TBA'
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

type Tab = 'info' | 'teams' | 'bracket' | 'register'
type TeamFilter = 'pending' | 'accepted' | 'declined'

export default function TournamentDetailPage() {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('info')
  const [isAdmin, setIsAdmin] = useState(false)
  const [myRegistration, setMyRegistration] = useState<Team | null>(null)

  // Register form
  const [regTeamName, setRegTeamName] = useState('')
  const [regPlayers, setRegPlayers] = useState<Array<{ name: string; role: string }>>([{ name: '', role: '' }])
  const [regLogoFile, setRegLogoFile] = useState<File | null>(null)
  const [regLogoPreview, setRegLogoPreview] = useState<string | null>(null)
  const [regCustomAnswers, setRegCustomAnswers] = useState<Record<string, string>>({})
  const [registering, setRegistering] = useState(false)
  const [regError, setRegError] = useState('')
  const regLogoRef = useRef<HTMLInputElement>(null)

  // Admin — team filter + delete
  const [teamFilter, setTeamFilter] = useState<TeamFilter>('pending')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null)

  // Admin — tournament logo upload
  const adminLogoRef = useRef<HTMLInputElement>(null)
  const [uploadingTourLogo, setUploadingTourLogo] = useState(false)

  // Admin — status update
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // Admin — delete tournament
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [deletingTournament, setDeletingTournament] = useState(false)

  // Admin — match editing
  const [editMatch, setEditMatch] = useState<string | null>(null)
  const [editScore1, setEditScore1] = useState('')
  const [editScore2, setEditScore2] = useState('')
  const [savingMatch, setSavingMatch] = useState(false)
  const [generatingBracket, setGeneratingBracket] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!tournamentId) return
    setLoading(true)

    const [tournRes, teamsRes, matchesRes] = await Promise.all([
      supabase.from('tournaments').select('*, club:clubs(id, name, logo_url)').eq('id', tournamentId).single(),
      supabase.from('tournament_teams').select('*, captain:profiles!captain_id(full_name, school)').eq('tournament_id', tournamentId).order('created_at'),
      supabase.from('tournament_matches').select('*').eq('tournament_id', tournamentId).order('round').order('match_number'),
    ])

    if (tournRes.data) setTournament(tournRes.data)
    if (teamsRes.data) {
      setTeams(teamsRes.data)
      if (user) {
        const mine = teamsRes.data.find((t: Team) => t.captain_id === user.id) ?? null
        setMyRegistration(mine)
      }
    }
    if (matchesRes.data) setMatches(matchesRes.data)

    // Check admin: creator or club president
    if (user && tournRes.data) {
      if (tournRes.data.created_by === user.id) {
        setIsAdmin(true)
      } else {
        const { data: mem } = await supabase
          .from('club_memberships')
          .select('role')
          .eq('club_id', tournRes.data.club_id)
          .eq('user_id', user.id)
          .single()
        setIsAdmin(mem?.role === 'president' || mem?.role === 'officer')
      }
    }

    setLoading(false)
  }, [tournamentId, user])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Realtime score updates
  useEffect(() => {
    if (!tournamentId) return
    const ch = supabase.channel(`tourny-matches-${tournamentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_matches', filter: `tournament_id=eq.${tournamentId}` },
        payload => {
          if (payload.eventType === 'INSERT') setMatches(prev => [...prev, payload.new as Match].sort((a, b) => a.round - b.round || a.match_number - b.match_number))
          if (payload.eventType === 'UPDATE') setMatches(prev => prev.map(m => m.id === (payload.new as Match).id ? payload.new as Match : m))
          if (payload.eventType === 'DELETE') setMatches(prev => prev.filter(m => m.id !== (payload.old as Match).id))
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tournament_teams', filter: `tournament_id=eq.${tournamentId}` },
        payload => setTeams(prev => prev.map(t => t.id === (payload.new as Team).id ? { ...t, ...payload.new } : t)))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [tournamentId])

  async function handleRegister() {
    if (!user || !tournament) return
    if (!regTeamName.trim()) { setRegError('Team name is required'); return }
    setRegistering(true)
    setRegError('')

    let logoUrl: string | null = null
    if (regLogoFile) {
      const ext = regLogoFile.name.split('.').pop() ?? 'jpg'
      const path = `${user.id}/${tournament.id}/${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('tournament-logos').upload(path, regLogoFile)
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('tournament-logos').getPublicUrl(path)
        logoUrl = urlData.publicUrl
      }
    }

    const filteredPlayers = regPlayers.filter(p => p.name.trim())
    const answers = Object.keys(regCustomAnswers).length > 0 ? regCustomAnswers : null
    const { error } = await supabase.from('tournament_teams').insert({
      tournament_id: tournament.id,
      captain_id: user.id,
      team_name: regTeamName.trim(),
      player_names: filteredPlayers.map(p => p.name.trim()),
      players: filteredPlayers.length > 0 ? filteredPlayers : null,
      logo_url: logoUrl,
      registration_answers: answers,
    })
    setRegistering(false)
    if (error) { setRegError(error.message.includes('unique') ? 'You already registered or that team name is taken.' : error.message); return }
    await fetchAll()
    setTab('teams')
  }

  async function handleWithdraw() {
    if (!myRegistration) return
    setActionLoading('withdraw')
    await supabase.from('tournament_teams').delete().eq('id', myRegistration.id)
    setMyRegistration(null)
    await fetchAll()
    setActionLoading(null)
  }

  async function handleTeamAction(teamId: string, status: 'accepted' | 'declined') {
    setActionLoading(teamId)
    await supabase.from('tournament_teams').update({ status }).eq('id', teamId)
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, status } : t))
    setActionLoading(null)
  }

  async function handleDeleteTeam(teamId: string) {
    setDeleteLoading(teamId)
    await supabase.from('tournament_teams').delete().eq('id', teamId)
    setTeams(prev => prev.filter(t => t.id !== teamId))
    if (myRegistration?.id === teamId) setMyRegistration(null)
    setDeleteLoading(null)
  }

  async function handleUploadTournamentLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !tournament) return
    setUploadingTourLogo(true)
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `tournaments/${tournament.id}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('tournament-logos').upload(path, file)
    if (!error) {
      const { data } = supabase.storage.from('tournament-logos').getPublicUrl(path)
      await supabase.from('tournaments').update({ logo_url: data.publicUrl }).eq('id', tournament.id)
      setTournament(prev => prev ? { ...prev, logo_url: data.publicUrl } : prev)
    }
    setUploadingTourLogo(false)
    e.target.value = ''
  }

  async function handleStatusUpdate(newStatus: Tournament['status']) {
    if (!tournament) return
    setUpdatingStatus(true)
    await supabase.from('tournaments').update({ status: newStatus }).eq('id', tournament.id)
    setTournament(prev => prev ? { ...prev, status: newStatus } : prev)
    setUpdatingStatus(false)
  }

  async function handleDeleteTournament() {
    if (!tournament || deleteInput.trim().toLowerCase() !== tournament.name.toLowerCase()) return
    setDeletingTournament(true)
    await supabase.from('tournaments').delete().eq('id', tournament.id)
    navigate('/tournaments')
  }

  async function handleSaveScore(matchId: string, winnerId: string | null) {
    setSavingMatch(true)
    const s1 = parseInt(editScore1) || 0
    const s2 = parseInt(editScore2) || 0
    const autoWinner = winnerId ?? (s1 > s2 ? matches.find(m => m.id === matchId)?.team1_id ?? null : s2 > s1 ? matches.find(m => m.id === matchId)?.team2_id ?? null : null)
    await supabase.from('tournament_matches').update({
      score1: s1, score2: s2,
      winner_id: autoWinner,
      status: winnerId || s1 !== s2 ? 'completed' : 'live',
    }).eq('id', matchId)
    setSavingMatch(false)
    setEditMatch(null)
  }

  async function handleSetMatchLive(matchId: string) {
    await supabase.from('tournament_matches').update({ status: 'live' }).eq('id', matchId)
  }

  async function generateBracket() {
    if (!tournament) return
    const accepted = teams.filter(t => t.status === 'accepted')
    if (accepted.length < 2) return

    setGeneratingBracket(true)
    // Delete existing matches
    await supabase.from('tournament_matches').delete().eq('tournament_id', tournament.id)

    if (tournament.format === 'single_elimination') {
      // Pad to next power of 2
      const n = accepted.length
      const rounds = Math.ceil(Math.log2(n))
      const slots = Math.pow(2, rounds)
      const seeded = [...accepted]
      // Fill to slots with null (byes)
      while (seeded.length < slots) seeded.push(null as unknown as Team)

      const newMatches: object[] = []
      for (let i = 0; i < slots / 2; i++) {
        const t1 = seeded[i * 2]
        const t2 = seeded[i * 2 + 1]
        newMatches.push({
          tournament_id: tournament.id,
          team1_id: t1?.id ?? null,
          team2_id: t2?.id ?? null,
          round: 1,
          match_number: i + 1,
          status: (!t1 || !t2) ? 'completed' : 'scheduled',
          winner_id: !t1 ? t2?.id ?? null : !t2 ? t1?.id ?? null : null,
          score1: 0,
          score2: 0,
        })
      }
      // Create placeholder matches for subsequent rounds
      for (let r = 2; r <= rounds; r++) {
        const matchesInRound = slots / Math.pow(2, r)
        for (let i = 0; i < matchesInRound; i++) {
          newMatches.push({
            tournament_id: tournament.id,
            team1_id: null,
            team2_id: null,
            round: r,
            match_number: i + 1,
            status: 'scheduled',
            score1: 0,
            score2: 0,
          })
        }
      }
      await supabase.from('tournament_matches').insert(newMatches)
    } else {
      // Round robin: every team plays every other team
      let matchNum = 1
      const newMatches: object[] = []
      for (let i = 0; i < accepted.length; i++) {
        for (let j = i + 1; j < accepted.length; j++) {
          newMatches.push({
            tournament_id: tournament.id,
            team1_id: accepted[i].id,
            team2_id: accepted[j].id,
            round: 1,
            match_number: matchNum++,
            status: 'scheduled',
            score1: 0,
            score2: 0,
          })
        }
      }
      await supabase.from('tournament_matches').insert(newMatches)
    }

    await fetchAll()
    setGeneratingBracket(false)
    setTab('bracket')
  }

  if (loading) return (
    <div className="page-content" style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
      <div style={{ width: 28, height: 28, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
    </div>
  )

  if (!tournament) return (
    <div className="page-content" style={{ textAlign: 'center', padding: '80px 0' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🏆</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Tournament not found</div>
      <button onClick={() => navigate('/tournaments')} style={{ marginTop: 16, padding: '10px 20px', background: 'var(--accent)', border: 'none', borderRadius: 10, color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
        Back to Tournaments
      </button>
    </div>
  )

  const st = STATUS_STYLES[tournament.status] ?? STATUS_STYLES.registration_open
  const acceptedTeams = teams.filter(t => t.status === 'accepted')
  const pendingTeams = teams.filter(t => t.status === 'pending')
  const declinedTeams = teams.filter(t => t.status === 'declined')
  const rounds = [...new Set(matches.map(m => m.round))].sort((a, b) => a - b)
  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]))

  const canRegister = tournament.status === 'registration_open' && !myRegistration && !!user

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: 'info', label: 'Info' },
    { key: 'teams', label: 'Teams', badge: isAdmin ? pendingTeams.length : acceptedTeams.length },
    { key: 'bracket', label: matches.length > 0 ? 'Bracket / Scores' : 'Bracket', badge: matches.filter(m => m.status === 'live').length || undefined },
    ...(user ? [{ key: 'register' as Tab, label: myRegistration ? 'My Registration' : 'Register' }] : []),
  ]

  return (
    <div className="page-content" style={{ maxWidth: 900 }}>
      <style>{`
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes td-in { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes live-pulse { 0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.85)} }
        @keyframes score-glow { 0%,100%{box-shadow:0 0 0 rgba(249,115,22,0)} 50%{box-shadow:0 0 18px rgba(249,115,22,0.4)} }
        .td-tab { font-family:inherit; cursor:pointer; transition:all 0.15s; border:none; }
        .td-tab:hover { color:var(--text-primary) !important; }
        .td-team-card { transition:transform 0.15s, border-color 0.15s; }
        .td-team-card:hover { transform:translateY(-1px); border-color:rgba(138,21,56,0.3) !important; }
        .match-card { transition:border-color 0.15s, box-shadow 0.15s; }
        .match-card.live { border-color:rgba(249,115,22,0.4) !important; animation:score-glow 2s ease-in-out infinite; }
      `}</style>

      {/* Back nav */}
      <button onClick={() => navigate('/tournaments')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 0 18px', fontSize: 13 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        Tournaments
      </button>

      {/* Tournament Header */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 24, marginBottom: 20, animation: 'td-in 0.3s cubic-bezier(0.22,1,0.36,1) both' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div
            onClick={() => isAdmin && adminLogoRef.current?.click()}
            title={isAdmin ? 'Click to update tournament logo' : undefined}
            style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(138,21,56,0.15)', border: '1px solid rgba(138,21,56,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0, overflow: 'hidden', position: 'relative', cursor: isAdmin ? 'pointer' : 'default', transition: 'opacity 0.15s' }}
            onMouseEnter={e => isAdmin && (e.currentTarget.style.opacity = '0.8')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            {tournament.logo_url
              ? <img src={tournament.logo_url} alt={tournament.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (SPORT_EMOJIS[tournament.sport] ?? '🏆')
            }
            {isAdmin && !uploadingTourLogo && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0)', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 3 }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                </div>
              </div>
            )}
            {uploadingTourLogo && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              </div>
            )}
          </div>
          <input ref={adminLogoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUploadTournamentLogo} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.01em' }}>{tournament.name}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: st.bg, borderRadius: 999, padding: '4px 10px' }}>
                {tournament.status === 'ongoing' && <div style={{ width: 7, height: 7, borderRadius: '50%', background: st.color, animation: 'live-pulse 1.5s ease-in-out infinite' }} />}
                <span style={{ fontSize: 11.5, fontWeight: 700, color: st.color }}>{st.label}</span>
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
              {tournament.sport} · {tournament.format === 'single_elimination' ? 'Single Elimination' : 'Round Robin'}
              {tournament.club && <> · <span style={{ color: 'var(--text-primary)', opacity: 0.8 }}>{tournament.club.name}</span></>}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {tournament.location && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  {tournament.location}
                </div>
              )}
              {tournament.start_date && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  {fmt(tournament.start_date)}
                </div>
              )}
              {tournament.registration_deadline && tournament.status === 'registration_open' && (
                <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>
                  Reg. closes {fmt(tournament.registration_deadline)}
                </div>
              )}
            </div>
          </div>
          {/* Stats */}
          <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-primary)' }}>{acceptedTeams.length}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Teams</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-muted)' }}>{tournament.max_teams}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Max</div>
            </div>
          </div>
        </div>

        {/* Admin status controls */}
        {isAdmin && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Admin Controls</div>
              <button
                onClick={() => { setShowDeleteConfirm(true); setDeleteInput('') }}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: '#f87171', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)' }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                Delete Tournament
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['registration_open', 'registration_closed', 'ongoing', 'completed', 'cancelled'] as Tournament['status'][]).map(s => (
                <button key={s} disabled={tournament.status === s || updatingStatus} onClick={() => handleStatusUpdate(s)} style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: tournament.status === s ? STATUS_STYLES[s].bg : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${tournament.status === s ? STATUS_STYLES[s].color + '44' : 'rgba(255,255,255,0.1)'}`,
                  color: tournament.status === s ? STATUS_STYLES[s].color : 'var(--text-muted)',
                  cursor: tournament.status === s ? 'default' : 'pointer',
                  opacity: updatingStatus ? 0.6 : 1,
                  transition: 'all 0.15s',
                }}>
                  {STATUS_STYLES[s].label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Delete tournament confirmation modal */}
      {showDeleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--bg-card, rgba(22,12,16,0.98))', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 18, padding: 28, width: '100%', maxWidth: 400, boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ fontSize: 28, textAlign: 'center', marginBottom: 12 }}>⚠️</div>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: '#f87171', marginBottom: 8, textAlign: 'center' }}>Delete {tournament.name}?</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.65, marginBottom: 20, textAlign: 'center' }}>
              This will permanently delete the tournament, all team registrations, and all match data. This cannot be undone.
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Type <strong style={{ color: 'var(--text-primary)' }}>{tournament.name}</strong> to confirm
              </label>
              <input
                value={deleteInput}
                onChange={e => setDeleteInput(e.target.value)}
                placeholder={tournament.name}
                autoFocus
                style={{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                onKeyDown={e => e.key === 'Enter' && deleteInput.trim().toLowerCase() === tournament.name.toLowerCase() && handleDeleteTournament()}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleDeleteTournament}
                disabled={deletingTournament || deleteInput.trim().toLowerCase() !== tournament.name.toLowerCase()}
                style={{ flex: 2, padding: '11px', background: deletingTournament ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.85)', border: 'none', borderRadius: 11, color: '#fff', fontSize: 14, fontWeight: 700, cursor: deletingTournament || deleteInput.trim().toLowerCase() !== tournament.name.toLowerCase() ? 'default' : 'pointer', opacity: deleteInput.trim().toLowerCase() !== tournament.name.toLowerCase() ? 0.4 : 1, fontFamily: 'inherit', transition: 'all 0.15s' }}
              >
                {deletingTournament ? 'Deleting…' : 'Delete Forever'}
              </button>
              <button onClick={() => setShowDeleteConfirm(false)} style={{ flex: 1, padding: '11px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 11, color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 3, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 4, marginBottom: 20, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.key} className="td-tab" onClick={() => setTab(t.key)} style={{
            flex: 1, minWidth: 80, padding: '10px 14px', borderRadius: 10, fontSize: 13,
            fontWeight: tab === t.key ? 700 : 500,
            color: tab === t.key ? '#fff' : 'var(--text-muted)',
            background: tab === t.key ? 'rgba(138,21,56,0.22)' : 'transparent',
            border: tab === t.key ? '1px solid rgba(138,21,56,0.32)' : '1px solid transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            whiteSpace: 'nowrap',
          }}>
            {t.label}
            {!!t.badge && t.badge > 0 && (
              <span style={{ minWidth: 17, height: 17, borderRadius: 999, background: t.key === 'teams' && isAdmin ? '#f87171' : t.key === 'bracket' ? '#f97316' : 'var(--accent)', color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Info tab ── */}
      {tab === 'info' && (
        <div style={{ animation: 'td-in 0.25s ease both' }}>
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {tournament.description && (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>About</div>
                <p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.65, margin: 0 }}>{tournament.description}</p>
              </div>
            )}
            {tournament.rules && (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Rules</div>
                <p style={{ fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{tournament.rules}</p>
              </div>
            )}
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Details</div>
              {[
                { label: 'Format', value: tournament.format === 'single_elimination' ? 'Single Elimination (Knockout)' : 'Round Robin' },
                { label: 'Max Teams', value: tournament.max_teams },
                { label: 'Team Size', value: `${tournament.min_team_size}–${tournament.max_team_size} players` },
                { label: 'Location', value: tournament.location ?? 'TBA' },
                { label: 'Start Date', value: fmt(tournament.start_date) },
                { label: 'Registration Closes', value: fmt(tournament.registration_deadline) },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 10 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600, textAlign: 'right', maxWidth: '60%' }}>{String(row.value)}</span>
                </div>
              ))}
            </div>
            {((tournament.prizes && tournament.prizes.length > 0) || tournament.prize_description) && (
              <div style={{ background: 'rgba(233,193,118,0.07)', border: '1px solid rgba(233,193,118,0.2)', borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#e9c176', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>🏆 Prizes</div>
                {tournament.prizes && tournament.prizes.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {tournament.prizes.map((prize, i) => (
                      <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 20, flexShrink: 0 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅'}</span>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#e9c176', marginBottom: 2 }}>{prize.place}</div>
                          <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>{prize.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.65, margin: 0 }}>{tournament.prize_description}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Teams tab ── */}
      {tab === 'teams' && (
        <div style={{ animation: 'td-in 0.25s ease both' }}>
          {isAdmin ? (
            <>
              {/* Admin sub-filter */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                {(['pending', 'accepted', 'declined'] as TeamFilter[]).map(f => {
                  const count = f === 'pending' ? pendingTeams.length : f === 'accepted' ? acceptedTeams.length : declinedTeams.length
                  return (
                    <button key={f} onClick={() => setTeamFilter(f)} style={{
                      padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: teamFilter === f ? 700 : 500,
                      cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                      color: teamFilter === f ? '#fff' : 'var(--text-muted)',
                      background: teamFilter === f ? (f === 'pending' ? 'rgba(245,158,11,0.2)' : f === 'accepted' ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.15)') : 'rgba(255,255,255,0.05)',
                      transition: 'all 0.15s',
                    }}>
                      {f.charAt(0).toUpperCase() + f.slice(1)} <span style={{ opacity: 0.7 }}>({count})</span>
                    </button>
                  )
                })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(teamFilter === 'pending' ? pendingTeams : teamFilter === 'accepted' ? acceptedTeams : declinedTeams).map(team => (
                  <TeamCard key={team.id} team={team} isAdmin={isAdmin} actionLoading={actionLoading} deleteLoading={deleteLoading} registrationFields={tournament.registration_fields ?? []} onAccept={() => handleTeamAction(team.id, 'accepted')} onDecline={() => handleTeamAction(team.id, 'declined')} onDelete={() => handleDeleteTeam(team.id)} />
                ))}
                {(teamFilter === 'pending' ? pendingTeams : teamFilter === 'accepted' ? acceptedTeams : declinedTeams).length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 14 }}>
                    No {teamFilter} teams yet.
                  </div>
                )}
              </div>
              {teamFilter === 'accepted' && acceptedTeams.length >= 2 && (
                <div style={{ marginTop: 20, padding: 16, background: 'rgba(138,21,56,0.08)', border: '1px solid rgba(138,21,56,0.2)', borderRadius: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Ready to start?</div>
                  <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12 }}>
                    {acceptedTeams.length} teams accepted. Generate the bracket to create the match schedule.
                  </p>
                  <button onClick={generateBracket} disabled={generatingBracket} style={{
                    padding: '10px 20px', background: generatingBracket ? 'rgba(138,21,56,0.4)' : 'var(--accent)',
                    border: 'none', borderRadius: 10, color: '#fff', cursor: generatingBracket ? 'default' : 'pointer',
                    fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
                  }}>
                    {generatingBracket ? 'Generating…' : matches.length > 0 ? 'Re-generate Bracket' : 'Generate Bracket'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
              {acceptedTeams.length === 0 ? (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 14 }}>
                  No teams accepted yet.
                </div>
              ) : acceptedTeams.map(team => (
                <TeamCard key={team.id} team={team} isAdmin={false} actionLoading={null} deleteLoading={null} registrationFields={tournament.registration_fields ?? []} onAccept={() => {}} onDecline={() => {}} onDelete={() => {}} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Bracket tab ── */}
      {tab === 'bracket' && (
        <div style={{ animation: 'td-in 0.25s ease both' }}>
          {matches.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>No bracket yet</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: isAdmin ? 20 : 0 }}>
                {isAdmin ? 'Accept teams and generate the bracket to get started.' : 'The bracket will appear here once the admin sets it up.'}
              </div>
              {isAdmin && acceptedTeams.length >= 2 && (
                <button onClick={generateBracket} disabled={generatingBracket} style={{
                  padding: '11px 24px', background: generatingBracket ? 'rgba(138,21,56,0.4)' : 'var(--accent)',
                  border: 'none', borderRadius: 12, color: '#fff', cursor: generatingBracket ? 'default' : 'pointer',
                  fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
                }}>
                  {generatingBracket ? 'Generating…' : 'Generate Bracket'}
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Round Robin Standings */}
              {tournament.format === 'round_robin' && (
                <RoundRobinStandings teams={acceptedTeams} matches={matches} />
              )}

              {/* Match list */}
              {tournament.format === 'single_elimination' ? (
                <div style={{ overflowX: 'auto', paddingBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 16, minWidth: rounds.length * 220 }}>
                    {rounds.map(round => (
                      <div key={round} style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, textAlign: 'center' }}>
                          {rounds.length === round ? 'Final' : round === rounds.length - 1 ? 'Semis' : `Round ${round}`}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {matches.filter(m => m.round === round).map(match => (
                            <MatchCard
                              key={match.id}
                              match={match}
                              teamMap={teamMap}
                              isAdmin={isAdmin}
                              isEditing={editMatch === match.id}
                              editScore1={editScore1}
                              editScore2={editScore2}
                              savingMatch={savingMatch}
                              onEdit={() => { setEditMatch(match.id); setEditScore1(String(match.score1)); setEditScore2(String(match.score2)) }}
                              onCancelEdit={() => setEditMatch(null)}
                              onSave={(winnerId) => handleSaveScore(match.id, winnerId)}
                              onSetLive={() => handleSetMatchLive(match.id)}
                              onScore1Change={setEditScore1}
                              onScore2Change={setEditScore2}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {matches.map(match => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      teamMap={teamMap}
                      isAdmin={isAdmin}
                      isEditing={editMatch === match.id}
                      editScore1={editScore1}
                      editScore2={editScore2}
                      savingMatch={savingMatch}
                      onEdit={() => { setEditMatch(match.id); setEditScore1(String(match.score1)); setEditScore2(String(match.score2)) }}
                      onCancelEdit={() => setEditMatch(null)}
                      onSave={(winnerId) => handleSaveScore(match.id, winnerId)}
                      onSetLive={() => handleSetMatchLive(match.id)}
                      onScore1Change={setEditScore1}
                      onScore2Change={setEditScore2}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Register tab ── */}
      {tab === 'register' && user && (
        <div style={{ animation: 'td-in 0.25s ease both' }}>
          {myRegistration ? (
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Your Registration</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(138,21,56,0.15)', border: '1px solid rgba(138,21,56,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: 'var(--accent)', overflow: 'hidden' }}>
                  {myRegistration.logo_url
                    ? <img src={myRegistration.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : myRegistration.team_name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
                  }
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>{myRegistration.team_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {(myRegistration.players?.length ?? myRegistration.player_names.length) > 0
                      ? `${myRegistration.players?.length ?? myRegistration.player_names.length} players listed`
                      : 'No players listed'}
                  </div>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  {(() => {
                    const s = myRegistration.status
                    const sc = s === 'accepted' ? { color: '#4ade80', bg: 'rgba(74,222,128,0.12)', label: 'Accepted' } :
                               s === 'declined' ? { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'Declined' } :
                               { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Pending Review' }
                    return (
                      <div style={{ background: sc.bg, borderRadius: 999, padding: '5px 12px' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: sc.color }}>{sc.label}</span>
                      </div>
                    )
                  })()}
                </div>
              </div>
              {(myRegistration.players?.length ?? myRegistration.player_names.length) > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Players</div>
                  {myRegistration.players && myRegistration.players.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {myRegistration.players.map((p, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>{i + 1}</div>
                          <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{p.name}</span>
                          {p.role && <span style={{ fontSize: 11.5, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: '2px 8px', border: '1px solid rgba(255,255,255,0.09)' }}>{p.role}</span>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {myRegistration.player_names.map((p, i) => (
                        <span key={i} style={{ fontSize: 12.5, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '4px 10px', color: 'var(--text-primary)' }}>{p}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {(myRegistration.status === 'pending' || myRegistration.status === 'declined') && (
                <button onClick={handleWithdraw} disabled={actionLoading === 'withdraw'} style={{
                  padding: '9px 18px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 10, color: '#f87171', cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'inherit',
                  opacity: actionLoading === 'withdraw' ? 0.6 : 1,
                }}>
                  {actionLoading === 'withdraw' ? 'Withdrawing…' : 'Withdraw Registration'}
                </button>
              )}
            </div>
          ) : !canRegister ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Registration Closed</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {tournament.status === 'registration_open' ? 'You have already registered.' : 'Registration for this tournament is no longer open.'}
              </div>
            </div>
          ) : (
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, maxWidth: 520 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>Register Your Team</div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                Submit your team to participate in {tournament.name}. The club admin will review and confirm your spot.
              </p>

              {/* Team Logo */}
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Team Logo <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    onClick={() => regLogoRef.current?.click()}
                    style={{ width: 64, height: 64, borderRadius: 14, background: regLogoPreview ? 'transparent' : 'rgba(255,255,255,0.05)', border: regLogoPreview ? 'none' : '2px dashed rgba(255,255,255,0.18)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, transition: 'border-color 0.15s' }}
                    onMouseEnter={e => !regLogoPreview && (e.currentTarget.style.borderColor = 'rgba(138,21,56,0.6)')}
                    onMouseLeave={e => !regLogoPreview && (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)')}
                  >
                    {regLogoPreview
                      ? <img src={regLogoPreview} alt="Team logo preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    }
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    {regLogoPreview ? (
                      <div>
                        <div style={{ color: '#4ade80', fontWeight: 600, marginBottom: 2 }}>Logo selected</div>
                        <button onClick={() => { setRegLogoFile(null); setRegLogoPreview(null) }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, padding: 0, fontFamily: 'inherit', textDecoration: 'underline' }}>Remove</button>
                      </div>
                    ) : (
                      <>Click to upload your team logo<br /><span style={{ fontSize: 11 }}>PNG, JPG up to 2MB</span></>
                    )}
                  </div>
                </div>
                <input ref={regLogoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setRegLogoFile(file)
                  setRegLogoPreview(URL.createObjectURL(file))
                }} />
              </div>

              {/* Team Name */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Team Name *</label>
                <input
                  value={regTeamName}
                  onChange={e => setRegTeamName(e.target.value)}
                  placeholder="e.g. Thunder Hawks"
                  style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
              </div>

              {/* Players */}
              <div style={{ marginBottom: (tournament.registration_fields?.length ?? 0) > 0 ? 16 : 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Players</label>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>
                      ({tournament.min_team_size}–{tournament.max_team_size} players)
                    </span>
                  </div>
                  <button onClick={() => setRegPlayers(prev => [...prev, { name: '', role: '' }])} style={{
                    display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                    transition: 'all 0.15s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Add Player
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {regPlayers.map((player, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>
                        {i + 1}
                      </div>
                      <input
                        value={player.name}
                        onChange={e => setRegPlayers(prev => prev.map((p, j) => j === i ? { ...p, name: e.target.value } : p))}
                        placeholder="Player name"
                        style={{ flex: 2, padding: '9px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, color: 'var(--text-primary)', fontSize: 13.5, outline: 'none', fontFamily: 'inherit' }}
                      />
                      <input
                        value={player.role}
                        onChange={e => setRegPlayers(prev => prev.map((p, j) => j === i ? { ...p, role: e.target.value } : p))}
                        placeholder="Role (e.g. Captain)"
                        style={{ flex: 1.5, padding: '9px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                      />
                      {regPlayers.length > 1 && (
                        <button onClick={() => setRegPlayers(prev => prev.filter((_, j) => j !== i))} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: '#f87171', cursor: 'pointer', flexShrink: 0 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom fields */}
              {(tournament.registration_fields ?? []).length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Additional Info</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {(tournament.registration_fields ?? []).map(field => (
                      <div key={field.id}>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>{field.label}</label>
                        {field.type === 'textarea' ? (
                          <textarea
                            value={regCustomAnswers[field.id] ?? ''}
                            onChange={e => setRegCustomAnswers(prev => ({ ...prev, [field.id]: e.target.value }))}
                            rows={3}
                            style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, color: 'var(--text-primary)', fontSize: 13.5, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                          />
                        ) : field.type === 'multiple_choice' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                            {(field.options ?? []).map((opt, oi) => {
                              const selected = regCustomAnswers[field.id] === opt
                              return (
                                <label key={oi} onClick={() => setRegCustomAnswers(prev => ({ ...prev, [field.id]: opt }))} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', background: selected ? 'rgba(138,21,56,0.14)' : 'rgba(255,255,255,0.03)', border: `1px solid ${selected ? 'rgba(138,21,56,0.45)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 9, cursor: 'pointer', transition: 'all 0.12s', userSelect: 'none' }}>
                                  <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${selected ? 'var(--accent)' : 'rgba(255,255,255,0.25)'}`, background: selected ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.12s' }}>
                                    {selected && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                                  </div>
                                  <span style={{ fontSize: 13.5, color: selected ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: selected ? 600 : 400 }}>{opt}</span>
                                </label>
                              )
                            })}
                          </div>
                        ) : (
                          <input
                            type={field.type}
                            value={regCustomAnswers[field.id] ?? ''}
                            onChange={e => setRegCustomAnswers(prev => ({ ...prev, [field.id]: e.target.value }))}
                            style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, color: 'var(--text-primary)', fontSize: 13.5, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {regError && (
                <div style={{ fontSize: 13, color: '#f87171', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
                  {regError}
                </div>
              )}
              <button onClick={handleRegister} disabled={registering || !regTeamName.trim()} style={{
                width: '100%', padding: '12px', background: registering ? 'rgba(138,21,56,0.4)' : 'var(--accent)',
                border: 'none', borderRadius: 12, color: '#fff', cursor: registering ? 'default' : 'pointer',
                fontWeight: 700, fontSize: 15, fontFamily: 'inherit',
                boxShadow: registering ? 'none' : '0 4px 18px rgba(138,21,56,0.4)',
                transition: 'all 0.15s', opacity: !regTeamName.trim() ? 0.5 : 1,
              }}>
                {registering ? 'Submitting…' : 'Submit Registration'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Team Card ────────────────────────────────────────────────────────────────
function TeamCard({ team, isAdmin, actionLoading, deleteLoading, registrationFields, onAccept, onDecline, onDelete }: {
  team: Team
  isAdmin: boolean
  actionLoading: string | null
  deleteLoading: string | null
  registrationFields?: Array<{ id: string; label: string; type: string }>
  onAccept: () => void
  onDecline: () => void
  onDelete: () => void
}) {
  const sc = team.status === 'accepted' ? { color: '#4ade80', bg: 'rgba(74,222,128,0.1)' } :
             team.status === 'declined' ? { color: '#ef4444', bg: 'rgba(239,68,68,0.1)' } :
             { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' }
  const initials = team.team_name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const answers = team.registration_answers
  const hasAnswers = answers && Object.keys(answers).length > 0 && (registrationFields?.length ?? 0) > 0

  return (
    <div className="td-team-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '14px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Team logo or initials */}
        <div style={{ width: 42, height: 42, borderRadius: 11, background: sc.bg, border: `1px solid ${sc.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: sc.color, overflow: 'hidden', flexShrink: 0 }}>
          {team.logo_url
            ? <img src={team.logo_url} alt={team.team_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : initials
          }
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{team.team_name}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: sc.color, background: sc.bg, borderRadius: 999, padding: '2px 8px' }}>
              {team.status.charAt(0).toUpperCase() + team.status.slice(1)}
            </span>
          </div>
          {team.captain && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
              Captain: {team.captain.full_name ?? 'Unknown'}
              {team.captain.school && <span style={{ opacity: 0.6 }}> · {team.captain.school}</span>}
            </div>
          )}
          {team.players && team.players.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 6 }}>
              {team.players.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>{i + 1}</div>
                  <span style={{ fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 500 }}>{p.name}</span>
                  {p.role && <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', borderRadius: 5, padding: '1px 7px', border: '1px solid rgba(255,255,255,0.08)' }}>{p.role}</span>}
                </div>
              ))}
            </div>
          ) : team.player_names.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {team.player_names.map((p, i) => (
                <span key={i} style={{ fontSize: 11.5, background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '2px 7px', color: 'var(--text-muted)' }}>{p}</span>
              ))}
            </div>
          ) : null}
          {/* Custom field answers */}
          {hasAnswers && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              {(registrationFields ?? []).map(field => {
                const val = answers?.[field.id]
                if (!val) return null
                return (
                  <div key={field.id} style={{ display: 'flex', gap: 6, marginBottom: 4, fontSize: 12 }}>
                    <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{field.label}:</span>
                    <span style={{ color: 'var(--text-primary)' }}>{val}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, alignItems: 'flex-end' }}>
            {team.status === 'pending' && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={onDecline} disabled={actionLoading === team.id} style={{
                  padding: '7px 13px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                  borderRadius: 8, color: '#f87171', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                  opacity: actionLoading === team.id ? 0.6 : 1, transition: 'all 0.15s',
                }}>Decline</button>
                <button onClick={onAccept} disabled={actionLoading === team.id} style={{
                  padding: '7px 13px', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)',
                  borderRadius: 8, color: '#4ade80', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                  opacity: actionLoading === team.id ? 0.6 : 1, transition: 'all 0.15s',
                }}>Accept</button>
              </div>
            )}
            <button
              onClick={onDelete}
              disabled={deleteLoading === team.id}
              title="Delete registration"
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 7, color: '#f87171', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit',
                opacity: deleteLoading === team.id ? 0.5 : 0.8, transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.45)' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)' }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              {deleteLoading === team.id ? 'Removing…' : 'Remove'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Match Card ───────────────────────────────────────────────────────────────
function MatchCard({ match, teamMap, isAdmin, isEditing, editScore1, editScore2, savingMatch, onEdit, onCancelEdit, onSave, onSetLive, onScore1Change, onScore2Change }: {
  match: Match
  teamMap: Record<string, Team>
  isAdmin: boolean
  isEditing: boolean
  editScore1: string
  editScore2: string
  savingMatch: boolean
  onEdit: () => void
  onCancelEdit: () => void
  onSave: (winnerId: string | null) => void
  onSetLive: () => void
  onScore1Change: (v: string) => void
  onScore2Change: (v: string) => void
}) {
  const t1 = match.team1_id ? teamMap[match.team1_id] : null
  const t2 = match.team2_id ? teamMap[match.team2_id] : null
  const isBye = !t1 || !t2
  const isLive = match.status === 'live'
  const isDone = match.status === 'completed'

  return (
    <div className={`match-card${isLive ? ' live' : ''}`} style={{
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${isLive ? 'rgba(249,115,22,0.35)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 14,
      padding: '14px 16px',
      position: 'relative',
    }}>
      {isLive && (
        <div style={{ position: 'absolute', top: 10, right: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#f97316', animation: 'live-pulse 1.5s ease-in-out infinite' }} />
          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#f97316' }}>LIVE</span>
        </div>
      )}
      {isDone && match.winner_id && (
        <div style={{ position: 'absolute', top: 10, right: 12, fontSize: 10.5, fontWeight: 700, color: '#4ade80' }}>FINAL</div>
      )}

      {isBye ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>TBD</div>
      ) : (
        <>
          {/* Team 1 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13.5, fontWeight: match.winner_id === match.team1_id ? 800 : 600, color: match.winner_id && match.winner_id !== match.team1_id ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                {t1?.team_name ?? 'TBD'}
              </span>
              {match.winner_id === match.team1_id && <span style={{ fontSize: 10, color: '#4ade80' }}>🏆</span>}
            </div>
            {isEditing ? (
              <input type="number" min={0} value={editScore1} onChange={e => onScore1Change(e.target.value)} style={{ width: 52, padding: '5px 8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 15, fontWeight: 700, textAlign: 'center', outline: 'none', fontFamily: 'inherit' }} />
            ) : (
              <span style={{ fontSize: 20, fontWeight: 900, color: match.winner_id === match.team1_id ? '#4ade80' : match.winner_id ? '#6b7280' : 'var(--text-primary)', minWidth: 28, textAlign: 'center' }}>{match.score1}</span>
            )}
          </div>
          {/* Divider */}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 0 10px' }} />
          {/* Team 2 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13.5, fontWeight: match.winner_id === match.team2_id ? 800 : 600, color: match.winner_id && match.winner_id !== match.team2_id ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                {t2?.team_name ?? 'TBD'}
              </span>
              {match.winner_id === match.team2_id && <span style={{ fontSize: 10, color: '#4ade80' }}>🏆</span>}
            </div>
            {isEditing ? (
              <input type="number" min={0} value={editScore2} onChange={e => onScore2Change(e.target.value)} style={{ width: 52, padding: '5px 8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 15, fontWeight: 700, textAlign: 'center', outline: 'none', fontFamily: 'inherit' }} />
            ) : (
              <span style={{ fontSize: 20, fontWeight: 900, color: match.winner_id === match.team2_id ? '#4ade80' : match.winner_id ? '#6b7280' : 'var(--text-primary)', minWidth: 28, textAlign: 'center' }}>{match.score2}</span>
            )}
          </div>

          {/* Admin controls */}
          {isAdmin && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {isEditing ? (
                <>
                  <button onClick={() => onSave(null)} disabled={savingMatch} style={{ flex: 1, padding: '7px 10px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', opacity: savingMatch ? 0.6 : 1 }}>
                    {savingMatch ? 'Saving…' : 'Save'}
                  </button>
                  {t1 && t2 && (
                    <>
                      <button onClick={() => onSave(match.team1_id)} disabled={savingMatch} style={{ padding: '7px 10px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 8, color: '#4ade80', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>
                        {t1.team_name.split(' ')[0]} wins
                      </button>
                      <button onClick={() => onSave(match.team2_id)} disabled={savingMatch} style={{ padding: '7px 10px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 8, color: '#4ade80', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>
                        {t2.team_name.split(' ')[0]} wins
                      </button>
                    </>
                  )}
                  <button onClick={onCancelEdit} style={{ padding: '7px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Cancel</button>
                </>
              ) : (
                <>
                  {match.status === 'scheduled' && (
                    <button onClick={onSetLive} style={{ padding: '6px 12px', background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 8, color: '#f97316', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}>
                      Set Live
                    </button>
                  )}
                  {match.status !== 'completed' && (
                    <button onClick={onEdit} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>
                      Update Score
                    </button>
                  )}
                  {match.status === 'completed' && (
                    <button onClick={onEdit} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>
                      Edit
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Round Robin Standings ────────────────────────────────────────────────────
function RoundRobinStandings({ teams, matches }: { teams: Team[]; matches: Match[] }) {
  const stats = teams.map(team => {
    const myMatches = matches.filter(m => (m.team1_id === team.id || m.team2_id === team.id) && m.status === 'completed')
    const wins = myMatches.filter(m => m.winner_id === team.id).length
    const losses = myMatches.filter(m => m.winner_id && m.winner_id !== team.id).length
    const gf = myMatches.reduce((s, m) => s + (m.team1_id === team.id ? m.score1 : m.score2), 0)
    const ga = myMatches.reduce((s, m) => s + (m.team1_id === team.id ? m.score2 : m.score1), 0)
    return { team, played: myMatches.length, wins, losses, gf, ga }
  }).sort((a, b) => b.wins - a.wins || (b.gf - b.ga) - (a.gf - a.ga))

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20, marginBottom: 20, overflowX: 'auto' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Standings</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ color: 'var(--text-muted)', fontSize: 11 }}>
            <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>#</th>
            <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>Team</th>
            <th style={{ textAlign: 'center', padding: '4px 8px', fontWeight: 600 }}>P</th>
            <th style={{ textAlign: 'center', padding: '4px 8px', fontWeight: 600 }}>W</th>
            <th style={{ textAlign: 'center', padding: '4px 8px', fontWeight: 600 }}>L</th>
            <th style={{ textAlign: 'center', padding: '4px 8px', fontWeight: 600 }}>GF</th>
            <th style={{ textAlign: 'center', padding: '4px 8px', fontWeight: 600 }}>GA</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((row, i) => (
            <tr key={row.team.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <td style={{ padding: '8px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>{i + 1}</td>
              <td style={{ padding: '8px 8px', color: 'var(--text-primary)', fontWeight: i === 0 ? 700 : 500 }}>{row.team.team_name}</td>
              <td style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--text-muted)' }}>{row.played}</td>
              <td style={{ padding: '8px 8px', textAlign: 'center', color: '#4ade80', fontWeight: 700 }}>{row.wins}</td>
              <td style={{ padding: '8px 8px', textAlign: 'center', color: '#f87171' }}>{row.losses}</td>
              <td style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--text-muted)' }}>{row.gf}</td>
              <td style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--text-muted)' }}>{row.ga}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
