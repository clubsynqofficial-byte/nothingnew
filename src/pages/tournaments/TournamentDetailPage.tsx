import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { computeGame } from '../../lib/bowling'

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
  format: 'single_elimination' | 'round_robin' | 'group_knockout'
  advance_per_group: number | null
  prize_description: string | null
  prizes: Array<{ place: string; description: string }> | null
  registration_fields: Array<{ id: string; label: string; type: string; options?: string[] }> | null
  sections: Array<{ id: string; name: string; maxTeams?: number | null }> | null
  admins: string[] | null
  logo_url: string | null
  type: 'bracket' | 'head_to_head' | 'scoresheet' | 'scoreboard' | null
  maintenance_mode: boolean | null
  standings_paused: boolean | null
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
  section: string | null
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
  stage: 'group' | 'knockout' | null
}

interface BowlingScorecard {
  id: string
  tournament_id: string
  team_id: string
  rolls: number[]
  total_score: number
  status: 'not_started' | 'in_progress' | 'completed'
  lane: number | null
}

const BOWLERS_PER_LANE = 5

interface TournamentTeamMember {
  id: string
  tournament_team_id: string
  user_id: string
  role: string
  status: 'pending' | 'accepted' | 'declined'
  invite_type: 'invite' | 'request'
  created_at: string
  profile?: { full_name: string | null; avatar_url: string | null; school: string | null } | null
}

interface ProfileSearchResult {
  id: string; full_name: string | null; avatar_url: string | null; school: string | null
}

const SPORT_EMOJIS: Record<string, string> = {
  Basketball: '🏀', Football: '⚽', Bowling: '🎳', Volleyball: '🏐', Tennis: '🎾',
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

// Points-based standings (3/1/0) for one group, scoped to completed group-stage matches.
function computeGroupStandings(groupName: string, allTeams: Team[], groupMatches: Match[]) {
  const groupTeams = allTeams.filter(t => t.status === 'accepted' && t.section === groupName)
  return groupTeams.map(team => {
    const played = groupMatches.filter(m => (m.team1_id === team.id || m.team2_id === team.id) && m.status === 'completed')
    const wins = played.filter(m => m.winner_id === team.id).length
    const losses = played.filter(m => m.winner_id && m.winner_id !== team.id).length
    const draws = played.length - wins - losses
    const gf = played.reduce((s, m) => s + (m.team1_id === team.id ? m.score1 : m.score2), 0)
    const ga = played.reduce((s, m) => s + (m.team1_id === team.id ? m.score2 : m.score1), 0)
    const pts = wins * 3 + draws
    return { team, played: played.length, wins, draws, losses, gf, ga, pts }
  }).sort((a, b) => b.pts - a.pts || b.wins - a.wins || (b.gf - b.ga) - (a.gf - a.ga))
}

export default function TournamentDetailPage() {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [bowlingScorecards, setBowlingScorecards] = useState<BowlingScorecard[]>([])
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
  const [regSection, setRegSection] = useState('')
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

  // Admin — direct team adding in bracket
  const [directTeamName, setDirectTeamName] = useState('')
  const [addingDirectTeam, setAddingDirectTeam] = useState(false)
  const [directTeamError, setDirectTeamError] = useState('')

  // Admin — status update
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // Admin — delete tournament
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [deletingTournament, setDeletingTournament] = useState(false)

  // Admin — edit tournament
  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState('')
  const [editSport, setEditSport] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editRules, setEditRules] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [editStartDate, setEditStartDate] = useState('')
  const [editRegDeadline, setEditRegDeadline] = useState('')
  const [editMaxTeams, setEditMaxTeams] = useState('')
  const [editPrizes, setEditPrizes] = useState<Array<{ _id: string; place: string; description: string }>>([])
  const [editCustomFields, setEditCustomFields] = useState<Array<{ _id: string; id: string; label: string; type: string; options: string[] }>>([])
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')

  // Team detail modal
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)

  // Admin — match editing
  const [editMatch, setEditMatch] = useState<string | null>(null)
  const [editScore1, setEditScore1] = useState('')
  const [editScore2, setEditScore2] = useState('')
  const [savingMatch, setSavingMatch] = useState(false)
  const [generatingBracket, setGeneratingBracket] = useState(false)
  const [assigningSlot, setAssigningSlot] = useState<{ matchId: string; slot: 'team1_id' | 'team2_id' } | null>(null)
  const [scoreboardFlow, setScoreboardFlow] = useState<null | 'sport' | 'format' | 'groups' | 'template'>(null)
  const [scoreboardSport, setScoreboardSport] = useState<string>('basketball')
  const [scoreboardFormat, setScoreboardFormat] = useState<'single_elimination' | 'round_robin' | 'group_knockout' | null>(null)
  const [groupCount, setGroupCount] = useState('4')
  const [advancePerGroupInput, setAdvancePerGroupInput] = useState('2')
  const [generatingKnockout, setGeneratingKnockout] = useState(false)
  const [bracketActiveSection, setBracketActiveSection] = useState('')
  const [standingsPaused, setStandingsPaused] = useState(false)
  const standingsPausedRef = useRef(false)
  // Sync local pause state from DB once tournament loads
  useEffect(() => {
    if (tournament) {
      setStandingsPaused(!!tournament.standings_paused)
      standingsPausedRef.current = !!tournament.standings_paused
    }
  }, [tournament?.id])
  const [scoreboardTemplate, setScoreboardTemplate] = useState<string | null>(null)
  const [assignLoading, setAssignLoading] = useState(false)

  // Roster management
  const [rosterMembers, setRosterMembers] = useState<TournamentTeamMember[]>([])
  const [profileSearch, setProfileSearch] = useState('')
  const [profileResults, setProfileResults] = useState<ProfileSearchResult[]>([])
  const [searchingProfiles, setSearchingProfiles] = useState(false)
  const [invitingUser, setInvitingUser] = useState<string | null>(null)
  const [rosterActionLoading, setRosterActionLoading] = useState<string | null>(null)

  // Co-manager (tournament.admins) management
  const [coAdminProfiles, setCoAdminProfiles] = useState<ProfileSearchResult[]>([])
  const [coAdminSearch, setCoAdminSearch] = useState('')
  const [coAdminResults, setCoAdminResults] = useState<ProfileSearchResult[]>([])
  const [searchingCoAdmins, setSearchingCoAdmins] = useState(false)
  const [coAdminActionLoading, setCoAdminActionLoading] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    if (!tournamentId) return
    setLoading(true)

    const [tournRes, teamsRes, matchesRes, bowlingRes] = await Promise.all([
      supabase.from('tournaments').select('*, club:clubs(id, name, logo_url)').eq('id', tournamentId).single(),
      supabase.from('tournament_teams').select('*, captain:profiles!captain_id(full_name, school)').eq('tournament_id', tournamentId).order('created_at'),
      supabase.from('tournament_matches').select('*').eq('tournament_id', tournamentId).order('round').order('match_number'),
      supabase.from('bowling_scorecards').select('*').eq('tournament_id', tournamentId),
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
    if (bowlingRes.data) setBowlingScorecards(bowlingRes.data)

    // Check admin: creator, explicit admins array, or club president/officer
    if (user && tournRes.data) {
      const isCreator = tournRes.data.created_by === user.id
      const isExplicitAdmin = (tournRes.data.admins ?? []).includes(user.id)
      if (isCreator || isExplicitAdmin) {
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

  // Resolve co-manager names whenever the tournament's admins list changes
  useEffect(() => {
    const ids = tournament?.admins ?? []
    if (ids.length === 0) { setCoAdminProfiles([]); return }
    supabase.from('profiles').select('id, full_name, avatar_url, school').in('id', ids)
      .then(({ data }) => setCoAdminProfiles(data ?? []))
  }, [tournament?.admins])

  async function searchCoAdmins(q: string) {
    if (q.trim().length < 2) { setCoAdminResults([]); return }
    setSearchingCoAdmins(true)
    const existingIds = new Set([tournament?.created_by, ...(tournament?.admins ?? [])])
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, school')
      .ilike('full_name', `%${q.trim()}%`)
      .limit(8)
    setCoAdminResults((data ?? []).filter(p => !existingIds.has(p.id)))
    setSearchingCoAdmins(false)
  }

  async function addCoAdmin(profileId: string) {
    if (!tournament) return
    setCoAdminActionLoading(profileId)
    const nextAdmins = [...(tournament.admins ?? []), profileId]
    const { error } = await supabase.from('tournaments').update({ admins: nextAdmins }).eq('id', tournament.id)
    if (!error) {
      setTournament(prev => prev ? { ...prev, admins: nextAdmins } : prev)
      setCoAdminSearch('')
      setCoAdminResults([])
    }
    setCoAdminActionLoading(null)
  }

  async function removeCoAdmin(profileId: string) {
    if (!tournament) return
    setCoAdminActionLoading(profileId)
    const nextAdmins = (tournament.admins ?? []).filter(id => id !== profileId)
    const { error } = await supabase.from('tournaments').update({ admins: nextAdmins }).eq('id', tournament.id)
    if (!error) setTournament(prev => prev ? { ...prev, admins: nextAdmins } : prev)
    setCoAdminActionLoading(null)
  }

  // Keep ref in sync so the realtime callback can read the latest value
  useEffect(() => { standingsPausedRef.current = standingsPaused }, [standingsPaused])

  // Broadcast channel for instant pause/resume across all viewers
  const pauseBroadcastRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  useEffect(() => {
    if (!tournamentId) return
    const ch = supabase.channel(`standings-ctrl-${tournamentId}`).subscribe()
    pauseBroadcastRef.current = ch
    return () => { supabase.removeChannel(ch) }
  }, [tournamentId])

  // Realtime score updates
  useEffect(() => {
    if (!tournamentId) return
    const ch = supabase.channel(`tourny-matches-${tournamentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_matches', filter: `tournament_id=eq.${tournamentId}` },
        payload => {
          if (standingsPausedRef.current) return
          if (payload.eventType === 'INSERT') setMatches(prev => [...prev, payload.new as Match].sort((a, b) => a.round - b.round || a.match_number - b.match_number))
          if (payload.eventType === 'UPDATE') setMatches(prev => prev.map(m => m.id === (payload.new as Match).id ? payload.new as Match : m))
          if (payload.eventType === 'DELETE') setMatches(prev => prev.filter(m => m.id !== (payload.old as Match).id))
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tournament_teams', filter: `tournament_id=eq.${tournamentId}` },
        payload => {
          if (standingsPausedRef.current) return
          setTeams(prev => prev.map(t => t.id === (payload.new as Team).id ? { ...t, ...payload.new } : t))
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [tournamentId])

  async function handleRegister() {
    if (!user || !tournament) return
    if (!regTeamName.trim()) { setRegError('Team name is required'); return }
    if ((tournament.sections?.length ?? 0) > 0 && !regSection) { setRegError('Please select a section'); return }
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
      section: regSection || null,
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

  async function handleAddTeamDirectly() {
    if (!directTeamName.trim() || !tournament || !user) return
    if (teams.some(t => t.team_name.toLowerCase() === directTeamName.trim().toLowerCase() && t.status === 'accepted')) {
      setDirectTeamError('A team with this name already exists')
      return
    }
    setAddingDirectTeam(true)
    setDirectTeamError('')
    const { error } = await supabase.from('tournament_teams').insert({
      tournament_id: tournament.id,
      captain_id: user.id,
      team_name: directTeamName.trim(),
      status: 'accepted',
      player_names: [],
    })
    setAddingDirectTeam(false)
    if (error) { setDirectTeamError(error.message); return }
    setDirectTeamName('')
    await fetchAll()
  }

  async function handleRemoveDirectTeam(teamId: string) {
    await supabase.from('tournament_teams').delete().eq('id', teamId)
    setTeams(prev => prev.filter(t => t.id !== teamId))
  }

  async function handleStatusUpdate(newStatus: Tournament['status']) {
    if (!tournament) return
    setUpdatingStatus(true)
    await supabase.from('tournaments').update({ status: newStatus }).eq('id', tournament.id)
    setTournament(prev => prev ? { ...prev, status: newStatus } : prev)
    setUpdatingStatus(false)
  }

  async function toggleMaintenance() {
    if (!tournament) return
    const next = !tournament.maintenance_mode
    await supabase.from('tournaments').update({ maintenance_mode: next }).eq('id', tournament.id)
    setTournament(prev => prev ? { ...prev, maintenance_mode: next } : prev)
  }

  async function handleDeleteTournament() {
    if (!tournament || deleteInput.trim().toLowerCase() !== tournament.name.toLowerCase()) return
    setDeletingTournament(true)
    await supabase.from('tournaments').delete().eq('id', tournament.id)
    navigate('/tournaments')
  }

  function enterEditMode() {
    if (!tournament) return
    setEditName(tournament.name)
    setEditSport(tournament.sport)
    setEditDesc(tournament.description ?? '')
    setEditRules(tournament.rules ?? '')
    setEditLocation(tournament.location ?? '')
    setEditStartDate(tournament.start_date ? new Date(tournament.start_date).toISOString().slice(0, 16) : '')
    setEditRegDeadline(tournament.registration_deadline ? new Date(tournament.registration_deadline).toISOString().slice(0, 16) : '')
    setEditMaxTeams(String(tournament.max_teams))
    const basePrizes = tournament.prizes?.length
      ? tournament.prizes
      : [{ place: '1st Place', description: '' }, { place: '2nd Place', description: '' }, { place: '3rd Place', description: '' }]
    setEditPrizes(basePrizes.map((p, i) => ({ ...p, _id: `ep_${i}_${Date.now()}` })))
    setEditCustomFields((tournament.registration_fields ?? []).map((f, i) => ({ ...f, _id: `ef_${i}_${Date.now()}`, options: f.options ?? [] })))
    setEditError('')
    setEditMode(true)
  }

  async function handleSaveEdit() {
    if (!tournament) return
    if (!editName.trim()) { setEditError('Tournament name is required'); return }
    if (!editLocation.trim()) { setEditError('Location is required'); return }
    setSavingEdit(true)
    setEditError('')
    // Strip internal _id before saving
    const filledPrizes = editPrizes.filter(p => p.description.trim()).map(({ _id, ...p }) => p)
    const filledFields = editCustomFields.filter(f => f.label.trim()).map(({ _id, ...f }) => f)
    const { error } = await supabase.from('tournaments').update({
      name: editName.trim(),
      sport: editSport,
      description: editDesc.trim() || null,
      rules: editRules.trim() || null,
      location: editLocation.trim(),
      start_date: editStartDate || null,
      registration_deadline: editRegDeadline || null,
      max_teams: parseInt(editMaxTeams) || 16,
      prizes: filledPrizes.length > 0 ? filledPrizes : null,
      registration_fields: filledFields,
    }).eq('id', tournament.id)
    setSavingEdit(false)
    if (error) { setEditError(error.message); return }
    setTournament(prev => prev ? { ...prev, name: editName.trim(), sport: editSport, description: editDesc.trim() || null, rules: editRules.trim() || null, location: editLocation.trim(), start_date: editStartDate || null, registration_deadline: editRegDeadline || null, max_teams: parseInt(editMaxTeams) || 16, prizes: filledPrizes.length > 0 ? filledPrizes : null, registration_fields: filledFields } : prev)
    setEditMode(false)
  }

  async function handleSaveScore(matchId: string, winnerId: string | null) {
    setSavingMatch(true)
    const s1 = parseInt(editScore1) || 0
    const s2 = parseInt(editScore2) || 0
    const m = matches.find(mx => mx.id === matchId)
    // Only complete the match when winner is explicitly declared via a team button.
    // Plain "Save" just updates scores without ending the match.
    const isCompleted = !!winnerId
    await supabase.from('tournament_matches').update({
      score1: s1, score2: s2,
      winner_id: winnerId ?? null,
      status: isCompleted ? 'completed' : 'live',
    }).eq('id', matchId)
    if (winnerId && m && (tournament?.format === 'single_elimination' || (tournament?.format === 'group_knockout' && m.stage === 'knockout'))) {
      await advanceWinner({ ...m, winner_id: winnerId, status: 'completed', score1: s1, score2: s2 }, matches)
    }
    await fetchAll()
    setSavingMatch(false)
    setEditMatch(null)
  }

  async function handleSetMatchLive(matchId: string) {
    await supabase.from('tournament_matches').update({ status: 'live' }).eq('id', matchId)
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, status: 'live' } : m))
  }

  // Advance a winner from a completed single-elimination match into the next round slot.
  // Standard formula: winner of match M in round R goes to match ceil(M/2) in round R+1.
  // Odd match number → team1 slot; even match number → team2 slot.
  async function advanceWinner(completedMatch: Match, currentMatches: Match[]) {
    if (!completedMatch.winner_id) return
    const nextRound = completedMatch.round + 1
    const nextMatchNum = Math.ceil(completedMatch.match_number / 2)
    const slot = completedMatch.match_number % 2 === 1 ? 'team1_id' : 'team2_id'
    const nextMatch = currentMatches.find(m => m.round === nextRound && m.match_number === nextMatchNum && m.stage === completedMatch.stage)
    if (!nextMatch) return
    await supabase.from('tournament_matches').update({ [slot]: completedMatch.winner_id }).eq('id', nextMatch.id)
  }

  async function handleManualAssign(teamId: string) {
    if (!assigningSlot) return
    setAssignLoading(true)
    await supabase.from('tournament_matches').update({ [assigningSlot.slot]: teamId, winner_id: null, score1: 0, score2: 0, status: 'scheduled' }).eq('id', assigningSlot.matchId)
    setAssigningSlot(null)
    setAssignLoading(false)
    await fetchAll()
  }

  async function clearMatchSlot(matchId: string, slot: 'team1_id' | 'team2_id') {
    await supabase.from('tournament_matches').update({ [slot]: null }).eq('id', matchId)
    await fetchAll()
  }

  // ── Roster management ──────────────────────────────────────────────────────

  const fetchRoster = useCallback(async (teamId: string) => {
    const { data } = await supabase
      .from('tournament_team_members')
      .select('*, profile:profiles(full_name, avatar_url, school)')
      .eq('tournament_team_id', teamId)
    setRosterMembers(data ?? [])
  }, [])

  useEffect(() => {
    if (myRegistration) fetchRoster(myRegistration.id)
  }, [myRegistration, fetchRoster])

  async function searchProfiles(q: string) {
    if (q.trim().length < 2) { setProfileResults([]); return }
    setSearchingProfiles(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, school')
      .ilike('full_name', `%${q.trim()}%`)
      .neq('id', user?.id ?? '')
      .limit(8)
    setProfileResults(data ?? [])
    setSearchingProfiles(false)
  }

  async function inviteUser(profileId: string) {
    if (!myRegistration || !user) return
    if (rosterMembers.some(m => m.user_id === profileId)) return
    setInvitingUser(profileId)
    await supabase.from('tournament_team_members').insert({
      tournament_team_id: myRegistration.id,
      user_id: profileId,
      role: 'player',
      status: 'pending',
      invite_type: 'invite',
    })
    await fetchRoster(myRegistration.id)
    setProfileSearch('')
    setProfileResults([])
    setInvitingUser(null)
  }

  async function handleRosterAction(memberId: string, status: 'accepted' | 'declined') {
    setRosterActionLoading(memberId)
    await supabase.from('tournament_team_members').update({ status }).eq('id', memberId)
    setRosterMembers(prev => prev.map(m => m.id === memberId ? { ...m, status } : m))
    setRosterActionLoading(null)
  }

  async function removeMember(memberId: string) {
    setRosterActionLoading(memberId)
    await supabase.from('tournament_team_members').delete().eq('id', memberId)
    setRosterMembers(prev => prev.filter(m => m.id !== memberId))
    setRosterActionLoading(null)
  }

  async function requestToJoin(teamId: string) {
    if (!user) return
    const existing = await supabase
      .from('tournament_team_members')
      .select('id').eq('tournament_team_id', teamId).eq('user_id', user.id).single()
    if (existing.data) return
    await supabase.from('tournament_team_members').insert({
      tournament_team_id: teamId,
      user_id: user.id,
      role: 'player',
      status: 'pending',
      invite_type: 'request',
    })
    await fetchAll()
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
      // Immediately advance all bye-match winners so next-round slots are pre-populated.
      // This fixes the "Team vs TBD" display when odd numbers of teams create byes.
      const { data: createdMatches } = await supabase
        .from('tournament_matches').select('*')
        .eq('tournament_id', tournament.id)
        .order('round').order('match_number')
      if (createdMatches) {
        const byeMatches = createdMatches.filter(m => m.status === 'completed' && m.winner_id)
        for (const bye of byeMatches) {
          await advanceWinner(bye, createdMatches)
        }
      }
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
    if (scoreboardTemplate === 'Basketball Scoreboard Template') {
      navigate(`/tournaments/${tournament.id}/scoreboard/basketball`)
    } else if (scoreboardTemplate === 'Football Scoreboard Template') {
      navigate(`/tournaments/${tournament.id}/scoreboard/football`)
    }
  }

  async function generateRoundRobinSchedule() {
    if (!tournament) return
    const accepted = teams.filter(t => t.status === 'accepted')
    if (accepted.length < 2) return
    setGeneratingBracket(true)
    await supabase.from('tournament_matches').delete().eq('tournament_id', tournament.id)
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
    await supabase.from('tournaments').update({ format: 'round_robin' }).eq('id', tournament.id)
    setTournament(prev => prev ? { ...prev, format: 'round_robin' } : prev)
    await fetchAll()
    setGeneratingBracket(false)
    setTab('bracket')
  }

  // Bowling has no matchups — every registered entry (bowler) gets its own independent
  // 10-frame scorecard, so this just seeds one blank scorecard per accepted team.
  async function generateBowlingScorecards() {
    if (!tournament) return
    const accepted = teams.filter(t => t.status === 'accepted')
    if (accepted.length < 2) return
    setGeneratingBracket(true)

    // Assign lanes in registration order, BOWLERS_PER_LANE bowlers per lane — recomputed
    // across everyone each time so newly-accepted bowlers slot in evenly rather than
    // always starting a fresh lane of their own.
    const laneOf = new Map(accepted.map((t, i) => [t.id, Math.floor(i / BOWLERS_PER_LANE) + 1]))
    const existingByTeam = new Map(bowlingScorecards.map(c => [c.team_id, c]))

    const toCreate = accepted.filter(t => !existingByTeam.has(t.id))
    if (toCreate.length > 0) {
      await supabase.from('bowling_scorecards').insert(
        toCreate.map(t => ({ tournament_id: tournament.id, team_id: t.id, lane: laneOf.get(t.id) }))
      )
    }
    const toRelane = accepted.filter(t => {
      const existing = existingByTeam.get(t.id)
      return existing && existing.lane !== laneOf.get(t.id)
    })
    await Promise.all(toRelane.map(t =>
      supabase.from('bowling_scorecards').update({ lane: laneOf.get(t.id) }).eq('id', existingByTeam.get(t.id)!.id)
    ))

    await fetchAll()
    setGeneratingBracket(false)
    setTab('bracket')
    navigate(`/tournaments/${tournament.id}/scoreboard/bowling`)
  }

  // Split accepted teams into N groups, persist the groups as tournament sections,
  // and generate a round-robin schedule within each group (stage: 'group').
  async function generateGroupStage() {
    if (!tournament) return
    const accepted = teams.filter(t => t.status === 'accepted')
    if (accepted.length < 2) return
    setGeneratingBracket(true)

    const numGroups = Math.max(1, Math.min(parseInt(groupCount) || 4, accepted.length))
    const advance = Math.max(1, parseInt(advancePerGroupInput) || 2)
    const groupNames = Array.from({ length: numGroups }, (_, i) => `Group ${String.fromCharCode(65 + i)}`)
    const newSections = groupNames.map((name, i) => ({ id: `grp-${i}`, name, maxTeams: null as number | null }))

    // Distribute teams evenly across groups
    const groupOf: Record<string, string> = {}
    accepted.forEach((team, i) => { groupOf[team.id] = groupNames[i % numGroups] })

    await Promise.all(accepted.map(team =>
      supabase.from('tournament_teams').update({ section: groupOf[team.id] }).eq('id', team.id)
    ))

    await supabase.from('tournament_matches').delete().eq('tournament_id', tournament.id)

    let matchNum = 1
    const newMatches: object[] = []
    for (const gName of groupNames) {
      const groupTeams = accepted.filter(t => groupOf[t.id] === gName)
      for (let i = 0; i < groupTeams.length; i++) {
        for (let j = i + 1; j < groupTeams.length; j++) {
          newMatches.push({
            tournament_id: tournament.id,
            team1_id: groupTeams[i].id,
            team2_id: groupTeams[j].id,
            round: 1,
            match_number: matchNum++,
            status: 'scheduled',
            score1: 0,
            score2: 0,
            stage: 'group',
          })
        }
      }
    }
    if (newMatches.length > 0) await supabase.from('tournament_matches').insert(newMatches)
    await supabase.from('tournaments').update({ format: 'group_knockout', sections: newSections, advance_per_group: advance }).eq('id', tournament.id)
    setTournament(prev => prev ? { ...prev, format: 'group_knockout', sections: newSections, advance_per_group: advance } : prev)
    await fetchAll()
    setGeneratingBracket(false)
    setTab('bracket')
    navigate(`/tournaments/${tournament.id}/scoreboard/football`)
  }

  // Take the top `advance_per_group` teams from each group and seed them into a
  // single-elimination knockout bracket (stage: 'knockout'), interleaved by rank
  // so group-mates avoid meeting in the first round where possible.
  async function generateKnockoutFromGroups() {
    if (!tournament) return
    setGeneratingKnockout(true)
    const groupMatches = matches.filter(m => m.stage === 'group')
    const sections = tournament.sections ?? []
    const advance = tournament.advance_per_group ?? 2

    const byRank: Team[][] = []
    for (let r = 0; r < advance; r++) {
      for (const sec of sections) {
        const standings = computeGroupStandings(sec.name, teams, groupMatches)
        if (standings[r]) {
          if (!byRank[r]) byRank[r] = []
          byRank[r].push(standings[r].team)
        }
      }
    }
    const seeded = byRank.flat()
    if (seeded.length < 2) { setGeneratingKnockout(false); return }

    await supabase.from('tournament_matches').delete().eq('tournament_id', tournament.id).eq('stage', 'knockout')

    const n = seeded.length
    const roundsN = Math.ceil(Math.log2(n))
    const slots = Math.pow(2, roundsN)
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
        stage: 'knockout',
      })
    }
    for (let r = 2; r <= roundsN; r++) {
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
          stage: 'knockout',
        })
      }
    }
    await supabase.from('tournament_matches').insert(newMatches)
    const { data: createdMatches } = await supabase
      .from('tournament_matches').select('*')
      .eq('tournament_id', tournament.id)
      .order('round').order('match_number')
    if (createdMatches) {
      const byeMatches = createdMatches.filter(m => m.stage === 'knockout' && m.status === 'completed' && m.winner_id)
      for (const bye of byeMatches) {
        await advanceWinner(bye, createdMatches)
      }
    }
    await fetchAll()
    setGeneratingKnockout(false)
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

  // Non-admins see maintenance page when enabled
  if (tournament.maintenance_mode && !isAdmin) return (
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center', padding: '60px 20px' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes wrench{0%,100%{transform:rotate(-15deg)}50%{transform:rotate(15deg)}}`}</style>
      <div style={{ fontSize: 56, marginBottom: 20, animation: 'wrench 1.6s ease-in-out infinite' }}>🔧</div>
      <h2 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 10, letterSpacing: '-0.02em' }}>Under Maintenance</h2>
      <p style={{ fontSize: 15, color: 'var(--text-muted)', maxWidth: 380, lineHeight: 1.65, marginBottom: 28 }}>
        <strong style={{ color: 'var(--text-primary)' }}>{tournament.name}</strong> is currently being updated. Check back soon — we'll be up shortly!
      </p>
      <button onClick={() => navigate('/tournaments')} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 11, color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
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

  const hasBracketSections = (tournament.sections?.length ?? 0) > 0
  const activeBracketSec = bracketActiveSection || tournament.sections?.[0]?.name || ''
  function bracketMatchSection(m: Match): string | null {
    const s1 = m.team1_id ? (teamMap[m.team1_id] as Team | undefined)?.section ?? null : null
    const s2 = m.team2_id ? (teamMap[m.team2_id] as Team | undefined)?.section ?? null : null
    if (s1 && s1 === s2) return s1
    if (s1 && !s2) return s1
    if (!s1 && s2) return s2
    return null
  }

  const canRegister = tournament.status === 'registration_open' && !myRegistration && !!user

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: 'info', label: 'Info' },
    { key: 'teams', label: 'Teams', badge: isAdmin ? pendingTeams.length : acceptedTeams.length },
    { key: 'bracket', label: 'Scoreboard', badge: matches.filter(m => m.status === 'live').length || undefined },
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

      {/* ── Assign Team Modal ─────────────────────────────────────────────────── */}
      {assigningSlot && (
        <div onClick={() => setAssigningSlot(null)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(18,10,14,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 420, boxShadow: '0 32px 80px rgba(0,0,0,0.7)', animation: 'td-in 0.2s cubic-bezier(0.22,1,0.36,1) both' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Assign Team</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Select a team for the {assigningSlot.slot === 'team1_id' ? 'top' : 'bottom'} slot
                </div>
              </div>
              <button onClick={() => setAssigningSlot(null)} style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {acceptedTeams.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>No accepted teams yet</div>
              )}
              {acceptedTeams.map(team => {
                const initials = team.team_name.trim().split(/\s+/).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
                return (
                  <button key={team.id} onClick={() => handleManualAssign(team.id)} disabled={assignLoading} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 11, cursor: assignLoading ? 'default' : 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.12s', opacity: assignLoading ? 0.6 : 1 }}
                    onMouseEnter={e => !assignLoading && (e.currentTarget.style.background = 'rgba(138,21,56,0.12)', e.currentTarget.style.borderColor = 'rgba(138,21,56,0.3)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)', e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(138,21,56,0.18)', border: '1px solid rgba(138,21,56,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: 'var(--accent)', overflow: 'hidden', flexShrink: 0 }}>
                      {team.logo_url ? <img src={team.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{team.team_name}</span>
                    {assignLoading && <div style={{ marginLeft: 'auto', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.15)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Back nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <button onClick={() => navigate('/tournaments')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: 13 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Tournaments
        </button>
        <button
          onClick={() => {
            const url = tournament.sport === 'Basketball'
              ? `/tournaments/${tournament.id}/scoreboard/basketball?view=public`
              : tournament.sport === 'Football'
              ? `/tournaments/${tournament.id}/scoreboard/football?view=public`
              : `/tournaments/${tournament.id}/control?view=public`
            navigate(url)
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: matches.filter(m => m.status === 'live').length > 0 ? 'rgba(249,115,22,0.12)' : 'rgba(255,255,255,0.05)', border: `1px solid ${matches.filter(m => m.status === 'live').length > 0 ? 'rgba(249,115,22,0.35)' : 'rgba(255,255,255,0.12)'}`, borderRadius: 9, color: matches.filter(m => m.status === 'live').length > 0 ? '#f97316' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', transition: 'all 0.15s' }}>
          {matches.filter(m => m.status === 'live').length > 0 && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', animation: 'live-pulse 1.4s ease-in-out infinite' }} />}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9l6 6"/><path d="M15 9H9v6"/></svg>
          Live View
        </button>
        <button
          onClick={() => window.open(`/tournaments/${tournament.id}/scoreboard`, '_blank')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', transition: 'all 0.15s' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 9H4.5a2.5 2.5 0 0 0 0 5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 1 0 5H18"/><path d="M4 22h16"/><path d="M8 22V11.3"/><path d="M16 22V11.3"/><rect x="6" y="2" width="12" height="9" rx="1"/></svg>
          Standings
        </button>
      </div>

      {/* Tournament Header */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: 24, marginBottom: 20, animation: 'td-in 0.3s cubic-bezier(0.22,1,0.36,1) both' }}>
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
              {tournament.sport}
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
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
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
            {/* Maintenance mode toggle */}
            <button
              onClick={toggleMaintenance}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px',
                background: tournament.maintenance_mode ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${tournament.maintenance_mode ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.12)'}`,
                borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                color: tournament.maintenance_mode ? '#f59e0b' : 'var(--text-muted)', transition: 'all 0.15s',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
              {tournament.maintenance_mode ? 'Maintenance ON — click to go live' : 'Put under maintenance'}
            </button>

            {/* Co-managers — only the original creator can grant/revoke, matching the DB permission model */}
            {tournament.created_by === user?.id && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Co-Managers</div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
                  Give other people full admin access to this tournament — including entering scores from the Command Center.
                </p>
                {coAdminProfiles.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                    {coAdminProfiles.map(p => {
                      const initials = (p.full_name ?? '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
                      return (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9 }}>
                          <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(138,21,56,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700, color: 'var(--accent)', overflow: 'hidden', flexShrink: 0 }}>
                            {p.avatar_url ? <img src={p.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
                          </div>
                          <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{p.full_name ?? 'Unknown'}</span>
                          <button
                            disabled={coAdminActionLoading === p.id}
                            onClick={() => removeCoAdmin(p.id)}
                            style={{ padding: '4px 10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7, color: '#f87171', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit', flexShrink: 0 }}
                          >
                            {coAdminActionLoading === p.id ? '…' : 'Remove'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
                <div style={{ position: 'relative' }}>
                  <input
                    value={coAdminSearch}
                    onChange={e => { setCoAdminSearch(e.target.value); searchCoAdmins(e.target.value) }}
                    placeholder="Search ClubSynq users by name…"
                    style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                  />
                  {searchingCoAdmins && (
                    <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  )}
                </div>
                {coAdminResults.length > 0 && (
                  <div style={{ marginTop: 6, background: 'rgba(14,8,11,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, overflow: 'hidden' }}>
                    {coAdminResults.map(p => {
                      const initials = (p.full_name ?? '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
                      return (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(138,21,56,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--accent)', overflow: 'hidden', flexShrink: 0 }}>
                            {p.avatar_url ? <img src={p.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{p.full_name ?? 'Unknown'}</div>
                            {p.school && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.school}</div>}
                          </div>
                          <button
                            disabled={coAdminActionLoading === p.id}
                            onClick={() => addCoAdmin(p.id)}
                            style={{ padding: '5px 12px', background: 'rgba(138,21,56,0.2)', border: '1px solid rgba(138,21,56,0.4)', borderRadius: 7, color: 'var(--accent)', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0 }}
                          >
                            {coAdminActionLoading === p.id ? '…' : 'Add'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
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

      {/* Team detail modal */}
      {selectedTeam && (
        <TeamDetailModal
          team={selectedTeam}
          isAdmin={isAdmin}
          actionLoading={actionLoading}
          deleteLoading={deleteLoading}
          onAccept={() => { handleTeamAction(selectedTeam.id, 'accepted'); setSelectedTeam(prev => prev ? { ...prev, status: 'accepted' } : prev) }}
          onDecline={() => { handleTeamAction(selectedTeam.id, 'declined'); setSelectedTeam(prev => prev ? { ...prev, status: 'declined' } : prev) }}
          onDelete={() => { handleDeleteTeam(selectedTeam.id); setSelectedTeam(null) }}
          onClose={() => setSelectedTeam(null)}
        />
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 24, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {TABS.map(t => (
          <button key={t.key} className="td-tab" onClick={() => setTab(t.key)} style={{
            flexShrink: 0, padding: '12px 18px',
            fontWeight: tab === t.key ? 700 : 500,
            fontSize: 13,
            color: tab === t.key ? 'var(--text-primary)' : 'var(--text-muted)',
            background: 'none',
            border: 'none',
            borderBottom: `2px solid ${tab === t.key ? 'var(--accent)' : 'transparent'}`,
            marginBottom: -1,
            display: 'flex', alignItems: 'center', gap: 7,
            whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit',
            transition: 'color 0.15s, border-color 0.15s',
          }}>
            {t.label}
            {!!t.badge && t.badge > 0 && (
              <span style={{ minWidth: 17, height: 17, borderRadius: 999, background: t.key === 'teams' && isAdmin ? 'rgba(248,113,113,0.2)' : t.key === 'bracket' ? 'rgba(249,115,22,0.2)' : 'rgba(138,21,56,0.3)', color: t.key === 'teams' && isAdmin ? '#f87171' : t.key === 'bracket' ? '#f97316' : 'var(--text-secondary)', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Info tab ── */}
      {tab === 'info' && (
        <div style={{ animation: 'td-in 0.25s ease both' }}>
          {/* Admin edit button */}
          {isAdmin && !editMode && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
              <button onClick={enterEditMode} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Edit Details
              </button>
            </div>
          )}

          {editMode ? (
            /* ── Edit form ── */
            <EditTournamentForm
              editName={editName} setEditName={setEditName}
              editSport={editSport} setEditSport={setEditSport}
              editDesc={editDesc} setEditDesc={setEditDesc}
              editRules={editRules} setEditRules={setEditRules}
              editLocation={editLocation} setEditLocation={setEditLocation}
              editStartDate={editStartDate} setEditStartDate={setEditStartDate}
              editRegDeadline={editRegDeadline} setEditRegDeadline={setEditRegDeadline}
              editMaxTeams={editMaxTeams} setEditMaxTeams={setEditMaxTeams}
              editPrizes={editPrizes} setEditPrizes={setEditPrizes}
              editCustomFields={editCustomFields} setEditCustomFields={setEditCustomFields}
              editError={editError}
              savingEdit={savingEdit}
              onSave={handleSaveEdit}
              onCancel={() => setEditMode(false)}
            />
          ) : (
            /* ── View mode ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Quick-info pill row */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {tournament.location && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8, padding: '6px 12px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <span style={{ fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 500 }}>{tournament.location}</span>
                  </div>
                )}
                {tournament.start_date && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8, padding: '6px 12px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <span style={{ fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 500 }}>{fmt(tournament.start_date)}</span>
                  </div>
                )}
                {tournament.registration_deadline && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '6px 12px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <span style={{ fontSize: 12.5, color: '#f59e0b', fontWeight: 600 }}>Reg. closes {fmt(tournament.registration_deadline)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8, padding: '6px 12px' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  <span style={{ fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 500 }}>{tournament.min_team_size}–{tournament.max_team_size} players · max {tournament.max_teams} teams</span>
                </div>
              </div>

              {/* About */}
              {tournament.description && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>About</div>
                  <p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}>{tournament.description}</p>
                </div>
              )}

              {/* Rules */}
              {tournament.rules && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Rules</div>
                  <p style={{ fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.75, margin: 0, whiteSpace: 'pre-wrap' }}>{tournament.rules}</p>
                </div>
              )}

              {/* Prizes */}
              {((tournament.prizes && tournament.prizes.length > 0) || tournament.prize_description) && (
                <div style={{ background: 'rgba(233,193,118,0.06)', border: '1px solid rgba(233,193,118,0.18)', borderRadius: 14, padding: '18px 20px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#e9c176', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>🏆 Prizes</div>
                  {tournament.prizes && tournament.prizes.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {tournament.prizes.map((prize, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <span style={{ fontSize: 22, flexShrink: 0 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅'}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#e9c176', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{prize.place}</div>
                            <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.4 }}>{prize.description}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}>{tournament.prize_description}</p>
                  )}
                </div>
              )}

              {/* Sections */}
              {tournament.sections && tournament.sections.length > 0 && (
                <div style={{ background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.18)', borderRadius: 14, padding: '18px 20px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>🏷️ Sections / Divisions</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {tournament.sections.map((sec, i) => (
                      <div key={sec.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(56,189,248,0.07)', border: '1px solid rgba(56,189,248,0.2)', borderRadius: 10, padding: '10px 14px' }}>
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(56,189,248,0.18)', border: '1px solid rgba(56,189,248,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#38bdf8', flexShrink: 0 }}>{i + 1}</div>
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>{sec.name}</div>
                          {sec.maxTeams && <div style={{ fontSize: 11, color: 'rgba(56,189,248,0.55)', marginTop: 1 }}>Max {sec.maxTeams} teams</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!tournament.description && !tournament.rules && !((tournament.prizes && tournament.prizes.length > 0) || tournament.prize_description) && !(tournament.sections && tournament.sections.length > 0) && (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
                  No additional details yet.{isAdmin && ' Use Edit Details to add a description and rules.'}
                </div>
              )}
            </div>
          )}
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
                  <TeamCard key={team.id} team={team} isAdmin={isAdmin} actionLoading={actionLoading} deleteLoading={deleteLoading} onAccept={() => handleTeamAction(team.id, 'accepted')} onDecline={() => handleTeamAction(team.id, 'declined')} onDelete={() => handleDeleteTeam(team.id)} onExpand={() => setSelectedTeam(team)} />
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
          ) : tournament.sections && tournament.sections.length > 0 ? (
            /* Grouped by section */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {tournament.sections.map(sec => {
                const sectionTeams = acceptedTeams.filter(t => t.section === sec.name)
                return (
                  <div key={sec.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{sec.name}</div>
                      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, rgba(56,189,248,0.2), transparent)' }} />
                      <span style={{ fontSize: 11, color: 'rgba(56,189,248,0.5)', fontWeight: 600 }}>{sectionTeams.length}{sec.maxTeams ? `/${sec.maxTeams}` : ''} teams</span>
                    </div>
                    {sectionTeams.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: 13, background: 'rgba(56,189,248,0.03)', border: '1px dashed rgba(56,189,248,0.15)', borderRadius: 12 }}>
                        No teams registered for this section yet.
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                        {sectionTeams.map(team => (
                          <TeamCard key={team.id} team={team} isAdmin={false} actionLoading={null} deleteLoading={null} onAccept={() => {}} onDecline={() => {}} onDelete={() => {}} onExpand={() => setSelectedTeam(team)} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              {/* Unassigned teams */}
              {acceptedTeams.filter(t => !t.section).length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Unassigned</div>
                    <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, rgba(255,255,255,0.08), transparent)' }} />
                  </div>
                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                    {acceptedTeams.filter(t => !t.section).map(team => (
                      <TeamCard key={team.id} team={team} isAdmin={false} actionLoading={null} deleteLoading={null} onAccept={() => {}} onDecline={() => {}} onDelete={() => {}} onExpand={() => setSelectedTeam(team)} />
                    ))}
                  </div>
                </div>
              )}
              {acceptedTeams.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 14 }}>No teams accepted yet.</div>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
              {acceptedTeams.length === 0 ? (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 14 }}>
                  No teams accepted yet.
                </div>
              ) : acceptedTeams.map(team => (
                <TeamCard key={team.id} team={team} isAdmin={false} actionLoading={null} deleteLoading={null} onAccept={() => {}} onDecline={() => {}} onDelete={() => {}} onExpand={() => setSelectedTeam(team)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Scoreboard tab ── */}
      {tab === 'bracket' && (
        <div style={{ animation: 'td-in 0.25s ease both' }}>
          {(matches.length === 0 && bowlingScorecards.length === 0) ? (
            isAdmin ? (
              scoreboardFlow === 'sport' ? (
                <ScoreboardSportPicker
                  onBack={() => setScoreboardFlow(null)}
                  onSelect={(sport: string) => { setScoreboardSport(sport); setScoreboardFlow(sport === 'football' ? 'format' : 'template') }}
                />
              ) : scoreboardFlow === 'format' ? (
                <ScoreboardFormatPicker
                  onBack={() => setScoreboardFlow('sport')}
                  onSelect={(fmt) => {
                    setScoreboardFormat(fmt)
                    setScoreboardTemplate('Football Scoreboard Template')
                    if (fmt === 'group_knockout') {
                      // Default to ~4 teams per group (standard group-stage size), capped so every
                      // group still has at least 2 teams to actually play a round-robin.
                      const n = acceptedTeams.length
                      const defaultGroups = n >= 2 ? Math.max(1, Math.min(Math.round(n / 4), Math.floor(n / 2))) : 1
                      setGroupCount(String(defaultGroups))
                    }
                    setScoreboardFlow(fmt === 'group_knockout' ? 'groups' : null)
                  }}
                />
              ) : scoreboardFlow === 'groups' ? (
                <ScoreboardGroupsSetup
                  teamCount={acceptedTeams.length}
                  groupCount={groupCount} setGroupCount={setGroupCount}
                  advancePerGroup={advancePerGroupInput} setAdvancePerGroup={setAdvancePerGroupInput}
                  onBack={() => setScoreboardFlow('format')}
                  onConfirm={() => setScoreboardFlow(null)}
                />
              ) : scoreboardFlow === 'template' ? (
                <ScoreboardTemplatePicker
                  sport={scoreboardSport}
                  onBack={() => setScoreboardFlow('sport')}
                  onSelect={t => {
                    setScoreboardTemplate(t)
                    setScoreboardFlow(null)
                  }}
                />
              ) : scoreboardTemplate ? (
                /* ── Bracket builder (template chosen) ── */
                <div style={{ maxWidth: 560, animation: 'td-in 0.25s ease both' }}>
                  {/* Selected template badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(138,21,56,0.18)', border: '1px solid rgba(138,21,56,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                        {scoreboardTemplate === 'Round Robin Standings' ? '🏆' : scoreboardTemplate === 'Football Scoreboard Template' ? '⚽' : scoreboardTemplate === 'Bowling Scoreboard Template' ? '🎳' : '🏀'}
                      </div>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>{scoreboardTemplate}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {scoreboardTemplate === 'Round Robin Standings' ? 'Round Robin · Selected template'
                            : scoreboardTemplate === 'Football Scoreboard Template'
                            ? `Football · ${scoreboardFormat === 'round_robin' ? 'Round Robin' : scoreboardFormat === 'group_knockout' ? 'Group Stages + Knockouts' : 'Single Elimination'}`
                            : scoreboardTemplate === 'Bowling Scoreboard Template'
                            ? 'Bowling · Selected template'
                            : 'Basketball · Selected template'}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => { setScoreboardTemplate(null); setScoreboardFormat(null) }} style={{ padding: '5px 11px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11.5, fontFamily: 'inherit' }}>Change</button>
                  </div>

                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                    {scoreboardTemplate === 'Round Robin Standings' || scoreboardFormat === 'round_robin'
                      ? 'Every team plays every other team once. Add teams, then generate the full schedule.'
                      : scoreboardFormat === 'group_knockout'
                      ? `Teams will be split into ${groupCount} groups for round-robin play. The top ${advancePerGroupInput} from each group advance to a knockout bracket.`
                      : scoreboardTemplate === 'Bowling Scoreboard Template'
                      ? 'Each bowler gets their own independent 10-frame scorecard — no matchups needed. Add every registered bowler, then generate.'
                      : scoreboardTemplate === 'Basketball Scoreboard Template' || scoreboardTemplate === 'Football Scoreboard Template'
                      ? 'Add the teams below, then hit Generate — you\'ll be taken straight to the live scoreboard.'
                      : 'Add all participating teams, then generate the scoreboard to create matchups.'}
                  </div>

                  {/* Team list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                    {acceptedTeams.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13, background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 12 }}>
                        No teams yet — add your first team below
                      </div>
                    )}
                    {acceptedTeams.map((team, i) => (
                      <div key={team.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, padding: '10px 14px' }}>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(138,21,56,0.2)', border: '1px solid rgba(138,21,56,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 800, color: 'var(--accent)', flexShrink: 0 }}>{i + 1}</div>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,0.5)', overflow: 'hidden', flexShrink: 0 }}>
                          {team.logo_url ? <img src={team.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : team.team_name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                        </div>
                        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{team.team_name}</span>
                        <button onClick={() => handleRemoveDirectTeam(team.id)} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 7, color: '#f87171', cursor: 'pointer', flexShrink: 0 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginBottom: directTeamError ? 8 : 16 }}>
                    <input value={directTeamName} onChange={e => { setDirectTeamName(e.target.value); setDirectTeamError('') }} onKeyDown={e => e.key === 'Enter' && handleAddTeamDirectly()} placeholder="Team name (press Enter to add)" style={{ flex: 1, padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: `1px solid ${directTeamError ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.12)'}`, borderRadius: 10, color: 'var(--text-primary)', fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
                    <button onClick={handleAddTeamDirectly} disabled={addingDirectTeam || !directTeamName.trim()} style={{ padding: '10px 18px', background: directTeamName.trim() ? 'var(--accent)' : 'rgba(255,255,255,0.04)', border: 'none', borderRadius: 10, color: '#fff', cursor: directTeamName.trim() ? 'pointer' : 'default', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', opacity: directTeamName.trim() ? 1 : 0.4 }}>
                      {addingDirectTeam ? '…' : 'Add'}
                    </button>
                  </div>
                  {directTeamError && <div style={{ fontSize: 12.5, color: '#f87171', marginBottom: 12 }}>{directTeamError}</div>}
                  {teams.filter(t => t.status === 'pending').length > 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14, padding: '10px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 10 }}>
                      <span style={{ color: '#f59e0b', fontWeight: 600 }}>{teams.filter(t => t.status === 'pending').length} pending registration{teams.filter(t => t.status === 'pending').length !== 1 ? 's' : ''}</span>
                      {' '}— accept them in the Teams tab to include.
                    </div>
                  )}
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', marginBottom: 14 }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      {acceptedTeams.length < 2 ? 'Add at least 2 teams to generate' : <span><span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{acceptedTeams.length} teams</span> ready</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        onClick={
                          scoreboardTemplate === 'Bowling Scoreboard Template' ? generateBowlingScorecards
                          : scoreboardTemplate === 'Round Robin Standings' || scoreboardFormat === 'round_robin' ? generateRoundRobinSchedule
                          : scoreboardFormat === 'group_knockout' ? generateGroupStage
                          : generateBracket
                        }
                        disabled={generatingBracket || acceptedTeams.length < 2}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 22px', background: acceptedTeams.length < 2 ? 'rgba(255,255,255,0.04)' : 'var(--accent)', border: 'none', borderRadius: 12, color: '#fff', cursor: acceptedTeams.length < 2 ? 'default' : 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', opacity: acceptedTeams.length < 2 ? 0.4 : 1, boxShadow: acceptedTeams.length >= 2 && !generatingBracket ? '0 4px 18px rgba(138,21,56,0.4)' : 'none' }}
                      >
                        {generatingBracket
                          ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Generating…</>
                          : scoreboardTemplate === 'Bowling Scoreboard Template' ? 'Generate Scorecards →'
                          : scoreboardTemplate === 'Round Robin Standings' || scoreboardFormat === 'round_robin' ? 'Generate Schedule →'
                          : scoreboardFormat === 'group_knockout' ? 'Generate Groups →'
                          : 'Generate Scoreboard →'}
                      </button>
                      {matches.length > 0 && scoreboardTemplate === 'Basketball Scoreboard Template' && (
                        <button onClick={() => navigate(`/tournaments/${tournament.id}/scoreboard/basketball`)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 20px', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 12, color: '#4ade80', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>
                          🏀 Launch Scoreboard
                        </button>
                      )}
                      {matches.length > 0 && scoreboardTemplate === 'Football Scoreboard Template' && (
                        <button onClick={() => navigate(`/tournaments/${tournament.id}/scoreboard/football`)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 20px', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 12, color: '#4ade80', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>
                          ⚽ Launch Scoreboard
                        </button>
                      )}
                      {bowlingScorecards.length > 0 && scoreboardTemplate === 'Bowling Scoreboard Template' && (
                        <button onClick={() => navigate(`/tournaments/${tournament.id}/scoreboard/bowling`)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 20px', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 12, color: '#4ade80', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>
                          🎳 Launch Scoreboard
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* ── Create Scoreboard CTA ── */
                <ScoreboardCreateCTA onStart={() => setScoreboardFlow('sport')} />
              )
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🏀</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Scoreboard not set up yet</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>The scoreboard will appear here once the admin sets it up.</div>
              </div>
            )
          ) : bowlingScorecards.length > 0 ? (
            <BowlingOverview
              teams={acceptedTeams}
              scorecards={bowlingScorecards}
              isAdmin={isAdmin}
              generating={generatingBracket}
              onOpenControl={() => navigate(`/tournaments/${tournament.id}/scoreboard/bowling`)}
              onOpenPublic={() => window.open(`/tournaments/${tournament.id}/scoreboard/bowling?view=public`, '_blank')}
              onRefreshBowlers={generateBowlingScorecards}
            />
          ) : (
            <>
              {/* Admin toolbar */}
              {isAdmin && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                  {/* Inline add team */}
                  <div style={{ display: 'flex', gap: 6, flex: 1, minWidth: 240 }}>
                    <input
                      value={directTeamName}
                      onChange={e => { setDirectTeamName(e.target.value); setDirectTeamError('') }}
                      onKeyDown={e => e.key === 'Enter' && handleAddTeamDirectly()}
                      placeholder="Add a team to bracket…"
                      style={{ flex: 1, padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                    />
                    <button onClick={handleAddTeamDirectly} disabled={addingDirectTeam || !directTeamName.trim()} style={{ padding: '8px 14px', background: directTeamName.trim() ? 'var(--accent)' : 'rgba(255,255,255,0.04)', border: 'none', borderRadius: 9, color: '#fff', cursor: directTeamName.trim() ? 'pointer' : 'default', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', opacity: directTeamName.trim() ? 1 : 0.4, transition: 'all 0.15s' }}>
                      {addingDirectTeam ? '…' : '+ Add'}
                    </button>
                  </div>
                  <button onClick={generateBracket} disabled={generatingBracket} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, color: 'var(--text-muted)', cursor: generatingBracket ? 'default' : 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.15s', flexShrink: 0 }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.36"/></svg>
                    {generatingBracket ? 'Generating…' : 'Re-generate'}
                  </button>
                  <button onClick={() => navigate(`/tournaments/${tournament.id}/control`)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'rgba(138,21,56,0.15)', border: '1px solid rgba(138,21,56,0.4)', borderRadius: 9, color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0, transition: 'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(138,21,56,0.25)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(138,21,56,0.15)' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h2m-1-1v2M15 12h2"/></svg>
                    Command Center
                  </button>
                  <button onClick={async () => {
                    const next = !standingsPaused
                    setStandingsPaused(next)
                    standingsPausedRef.current = next
                    // Broadcast instantly to all viewers, then persist to DB
                    pauseBroadcastRef.current?.send({ type: 'broadcast', event: 'pause-update', payload: { paused: next } })
                    await supabase.from('tournaments').update({ standings_paused: next }).eq('id', tournament.id)
                    if (!next) fetchAll()
                  }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: standingsPaused ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${standingsPaused ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 9, color: standingsPaused ? '#f59e0b' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0, transition: 'all 0.2s' }}>
                    {standingsPaused
                      ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>Resume</>
                      : <><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>Pause Standings</>
                    }
                  </button>
                </div>
              )}

              {/* Paused banner */}
              {standingsPaused && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, marginBottom: 16, fontSize: 13, color: '#f59e0b' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  Standings paused — live updates are frozen. Click <strong style={{ fontWeight: 800 }}>Resume</strong> to sync again.
                </div>
              )}

              {/* ── Section tab bar ── */}
              {hasBracketSections && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(tournament.sections ?? []).map(sec => {
                      const isActive = activeBracketSec === sec.name
                      const secLive = matches.filter(m => bracketMatchSection(m) === sec.name && m.status === 'live').length
                      const secTeamCount = acceptedTeams.filter(t => t.section === sec.name).length
                      return (
                        <button key={sec.id} onClick={() => setBracketActiveSection(sec.name)} style={{
                          display: 'flex', alignItems: 'center', gap: 7,
                          padding: '8px 15px', borderRadius: 10, fontSize: 13, fontWeight: isActive ? 700 : 500,
                          cursor: 'pointer', fontFamily: 'inherit',
                          background: isActive ? 'rgba(56,189,248,0.13)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${isActive ? 'rgba(56,189,248,0.4)' : 'rgba(255,255,255,0.08)'}`,
                          color: isActive ? '#38bdf8' : 'var(--text-muted)',
                          transition: 'all 0.13s',
                        }}>
                          {sec.name}
                          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: isActive ? 'rgba(56,189,248,0.18)' : 'rgba(255,255,255,0.07)', color: isActive ? '#38bdf8' : 'rgba(255,255,255,0.3)' }}>
                            {secTeamCount}
                          </span>
                          {secLive > 0 && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', animation: 'live-pulse 1.4s ease-in-out infinite' }} />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── LIVE NOW hero section ── */}
              {(hasBracketSections ? matches.filter(m => m.status === 'live' && bracketMatchSection(m) === activeBracketSec) : matches.filter(m => m.status === 'live')).length > 0 && (
                <div style={{ marginBottom: 32 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#f97316', animation: 'live-pulse 1.4s ease-in-out infinite', boxShadow: '0 0 10px rgba(249,115,22,0.6)' }} />
                    <span style={{ fontSize: 14, fontWeight: 900, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Live Now</span>
                    <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, rgba(249,115,22,0.3), transparent)' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                    {(hasBracketSections ? matches.filter(m => m.status === 'live' && bracketMatchSection(m) === activeBracketSec) : matches.filter(m => m.status === 'live')).map(match => (
                      <LiveMatchHero
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
                        onSave={(wid) => handleSaveScore(match.id, wid)}
                        onScore1Change={setEditScore1}
                        onScore2Change={setEditScore2}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Round Robin Standings */}
              {tournament.format === 'round_robin' && (
                <RoundRobinStandings teams={acceptedTeams} matches={matches} sections={tournament.sections} activeSection={activeBracketSec} />
              )}

              {/* Bracket or match list */}
              {tournament.format === 'single_elimination' ? (
                <>
                  {tournament.sections && tournament.sections.length > 0 ? (
                    /* Section-grouped brackets */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                      {tournament.sections.map(sec => {
                        const secMatches = matches.filter(m => {
                          const s1 = m.team1_id ? teamMap[m.team1_id]?.section ?? null : null
                          const s2 = m.team2_id ? teamMap[m.team2_id]?.section ?? null : null
                          const ms = (s1 && s1 === s2) ? s1 : (s1 && !s2) ? s1 : (!s1 && s2) ? s2 : null
                          return ms === sec.name
                        })
                        const secRounds = [...new Set(secMatches.map(m => m.round))].sort((a, b) => a - b)
                        const secMax = Math.max(...secRounds, 0)
                        return (
                          <div key={sec.id}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                              <span style={{ fontSize: 12, fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{sec.name}</span>
                              <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, rgba(56,189,248,0.25), transparent)' }} />
                            </div>
                            {secMatches.length === 0 ? (
                              <div style={{ textAlign: 'center', padding: '20px', fontSize: 13, color: 'var(--text-muted)', background: 'rgba(56,189,248,0.03)', border: '1px dashed rgba(56,189,248,0.15)', borderRadius: 12 }}>
                                No matches for this section yet.
                              </div>
                            ) : (
                              <div style={{ overflowX: 'auto', paddingBottom: 12 }}>
                                <div style={{ display: 'flex', gap: 12, minWidth: Math.max(secRounds.length * 240, 400) }}>
                                  {secRounds.map(round => (
                                    <div key={round} style={{ flex: 1, minWidth: 220 }}>
                                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, textAlign: 'center', color: round === secMax ? '#e9c176' : 'var(--text-muted)' }}>
                                        {round === secMax ? '🏆 Final' : round === secMax - 1 && secRounds.length > 2 ? 'Semi-finals' : `Round ${round}`}
                                      </div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {secMatches.filter(m => m.round === round && (m.team1_id || m.team2_id)).map(match => (
                                          <MatchCard
                                            key={match.id} match={match} teamMap={teamMap} isAdmin={isAdmin}
                                            isEditing={editMatch === match.id} editScore1={editScore1} editScore2={editScore2} savingMatch={savingMatch}
                                            onEdit={() => { setEditMatch(match.id); setEditScore1(String(match.score1)); setEditScore2(String(match.score2)) }}
                                            onCancelEdit={() => setEditMatch(null)}
                                            onSave={(wid) => handleSaveScore(match.id, wid)}
                                            onSetLive={() => handleSetMatchLive(match.id)}
                                            onScore1Change={setEditScore1} onScore2Change={setEditScore2}
                                            onAssignTeam1={isAdmin ? () => setAssigningSlot({ matchId: match.id, slot: 'team1_id' }) : undefined}
                                            onAssignTeam2={isAdmin ? () => setAssigningSlot({ matchId: match.id, slot: 'team2_id' }) : undefined}
                                            onClearTeam1={isAdmin ? () => clearMatchSlot(match.id, 'team1_id') : undefined}
                                            onClearTeam2={isAdmin ? () => clearMatchSlot(match.id, 'team2_id') : undefined}
                                          />
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    /* Standard bracket (no sections) */
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Bracket</span>
                        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                      </div>
                      <div style={{ overflowX: 'auto', paddingBottom: 12 }}>
                        <div style={{ display: 'flex', gap: 12, minWidth: Math.max(rounds.length * 240, 400) }}>
                          {rounds.map(round => (
                            <div key={round} style={{ flex: 1, minWidth: 220 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, textAlign: 'center', color: round === Math.max(...rounds) ? '#e9c176' : 'var(--text-muted)' }}>
                                {round === Math.max(...rounds) ? '🏆 Final' : round === Math.max(...rounds) - 1 && rounds.length > 2 ? 'Semi-finals' : `Round ${round}`}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {matches.filter(m => m.round === round && (m.team1_id || m.team2_id)).map(match => (
                                  <MatchCard
                                    key={match.id} match={match} teamMap={teamMap} isAdmin={isAdmin}
                                    isEditing={editMatch === match.id} editScore1={editScore1} editScore2={editScore2} savingMatch={savingMatch}
                                    onEdit={() => { setEditMatch(match.id); setEditScore1(String(match.score1)); setEditScore2(String(match.score2)) }}
                                    onCancelEdit={() => setEditMatch(null)}
                                    onSave={(wid) => handleSaveScore(match.id, wid)}
                                    onSetLive={() => handleSetMatchLive(match.id)}
                                    onScore1Change={setEditScore1} onScore2Change={setEditScore2}
                                    onAssignTeam1={isAdmin ? () => setAssigningSlot({ matchId: match.id, slot: 'team1_id' }) : undefined}
                                    onAssignTeam2={isAdmin ? () => setAssigningSlot({ matchId: match.id, slot: 'team2_id' }) : undefined}
                                    onClearTeam1={isAdmin ? () => clearMatchSlot(match.id, 'team1_id') : undefined}
                                    onClearTeam2={isAdmin ? () => clearMatchSlot(match.id, 'team2_id') : undefined}
                                  />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </>
              ) : tournament.format === 'group_knockout' ? (
                <GroupKnockoutView
                  tournament={tournament} teams={acceptedTeams} matches={matches} teamMap={teamMap} isAdmin={isAdmin}
                  editMatch={editMatch} editScore1={editScore1} editScore2={editScore2} savingMatch={savingMatch}
                  onEdit={(matchId) => { setEditMatch(matchId); const m = matches.find(mm => mm.id === matchId); setEditScore1(String(m?.score1 ?? 0)); setEditScore2(String(m?.score2 ?? 0)) }}
                  onCancelEdit={() => setEditMatch(null)}
                  onSave={(matchId, wid) => handleSaveScore(matchId, wid)}
                  onSetLive={(matchId) => handleSetMatchLive(matchId)}
                  onScore1Change={setEditScore1} onScore2Change={setEditScore2}
                  onAssignTeam1={(matchId) => setAssigningSlot({ matchId, slot: 'team1_id' })}
                  onAssignTeam2={(matchId) => setAssigningSlot({ matchId, slot: 'team2_id' })}
                  onClearTeam1={(matchId) => clearMatchSlot(matchId, 'team1_id')}
                  onClearTeam2={(matchId) => clearMatchSlot(matchId, 'team2_id')}
                  onGenerateKnockout={generateKnockoutFromGroups}
                  generatingKnockout={generatingKnockout}
                />
              ) : (
                <>
                  {tournament.sections && tournament.sections.length > 0 ? (
                    /* Section-grouped match list */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                      {tournament.sections.map(sec => {
                        const secMatches = [...matches].filter(m => {
                          const s1 = m.team1_id ? teamMap[m.team1_id]?.section ?? null : null
                          const s2 = m.team2_id ? teamMap[m.team2_id]?.section ?? null : null
                          const ms = (s1 && s1 === s2) ? s1 : (s1 && !s2) ? s1 : (!s1 && s2) ? s2 : null
                          return ms === sec.name
                        }).sort((a, b) => {
                          const order = { live: 0, scheduled: 1, completed: 2 }
                          return (order[a.status] ?? 1) - (order[b.status] ?? 1)
                        })
                        return (
                          <div key={sec.id}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                              <span style={{ fontSize: 12, fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{sec.name}</span>
                              <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, rgba(56,189,248,0.25), transparent)' }} />
                            </div>
                            {secMatches.length === 0 ? (
                              <div style={{ textAlign: 'center', padding: '20px', fontSize: 13, color: 'var(--text-muted)', background: 'rgba(56,189,248,0.03)', border: '1px dashed rgba(56,189,248,0.15)', borderRadius: 12 }}>
                                No matches for this section yet.
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {(() => { const maxR = Math.max(...matches.map(m => m.round)); return secMatches.filter(m => m.team1_id || m.team2_id || m.round === maxR) })().map(match => (
                                  <MatchCard
                                    key={match.id} match={match} teamMap={teamMap} isAdmin={isAdmin}
                                    isEditing={editMatch === match.id} editScore1={editScore1} editScore2={editScore2} savingMatch={savingMatch}
                                    onEdit={() => { setEditMatch(match.id); setEditScore1(String(match.score1)); setEditScore2(String(match.score2)) }}
                                    onCancelEdit={() => setEditMatch(null)}
                                    onSave={(wid) => handleSaveScore(match.id, wid)}
                                    onSetLive={() => handleSetMatchLive(match.id)}
                                    onScore1Change={setEditScore1} onScore2Change={setEditScore2}
                                    onAssignTeam1={isAdmin ? () => setAssigningSlot({ matchId: match.id, slot: 'team1_id' }) : undefined}
                                    onAssignTeam2={isAdmin ? () => setAssigningSlot({ matchId: match.id, slot: 'team2_id' }) : undefined}
                                    onClearTeam1={isAdmin ? () => clearMatchSlot(match.id, 'team1_id') : undefined}
                                    onClearTeam2={isAdmin ? () => clearMatchSlot(match.id, 'team2_id') : undefined}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    /* Standard all-matches list */
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>All Matches</span>
                        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {(() => { const maxR = Math.max(...matches.map(m => m.round)); return [...matches].filter(m => m.team1_id || m.team2_id || m.round === maxR).sort((a, b) => { const order = { live: 0, scheduled: 1, completed: 2 }; return (order[a.status] ?? 1) - (order[b.status] ?? 1) }) })().map(match => (
                          <MatchCard
                            key={match.id} match={match} teamMap={teamMap} isAdmin={isAdmin}
                            isEditing={editMatch === match.id} editScore1={editScore1} editScore2={editScore2} savingMatch={savingMatch}
                            onEdit={() => { setEditMatch(match.id); setEditScore1(String(match.score1)); setEditScore2(String(match.score2)) }}
                            onCancelEdit={() => setEditMatch(null)}
                            onSave={(wid) => handleSaveScore(match.id, wid)}
                            onSetLive={() => handleSetMatchLive(match.id)}
                            onScore1Change={setEditScore1} onScore2Change={setEditScore2}
                            onAssignTeam1={isAdmin ? () => setAssigningSlot({ matchId: match.id, slot: 'team1_id' }) : undefined}
                            onAssignTeam2={isAdmin ? () => setAssigningSlot({ matchId: match.id, slot: 'team2_id' }) : undefined}
                            onClearTeam1={isAdmin ? () => clearMatchSlot(match.id, 'team1_id') : undefined}
                            onClearTeam2={isAdmin ? () => clearMatchSlot(match.id, 'team2_id') : undefined}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Register tab ── */}
      {tab === 'register' && user && (
        <div style={{ animation: 'td-in 0.25s ease both' }}>
          {myRegistration ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Team info card */}
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Your Registration</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(138,21,56,0.15)', border: '1px solid rgba(138,21,56,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: 'var(--accent)', overflow: 'hidden' }}>
                    {myRegistration.logo_url
                      ? <img src={myRegistration.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : myRegistration.team_name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
                    }
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>{myRegistration.team_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>You are Team Captain</div>
                  </div>
                  {(() => {
                    const s = myRegistration.status
                    const sc = s === 'accepted' ? { color: '#4ade80', bg: 'rgba(74,222,128,0.12)', label: 'Accepted' } :
                               s === 'declined' ? { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'Declined' } :
                               { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Pending Review' }
                    return (
                      <div style={{ background: sc.bg, borderRadius: 999, padding: '5px 12px', flexShrink: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: sc.color }}>{sc.label}</span>
                      </div>
                    )
                  })()}
                </div>
                {(myRegistration.status === 'pending' || myRegistration.status === 'declined') && (
                  <button onClick={handleWithdraw} disabled={actionLoading === 'withdraw'} style={{
                    padding: '8px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                    borderRadius: 9, color: '#f87171', cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'inherit',
                    opacity: actionLoading === 'withdraw' ? 0.6 : 1,
                  }}>
                    {actionLoading === 'withdraw' ? 'Withdrawing…' : 'Withdraw Registration'}
                  </button>
                )}
              </div>

              {/* Roster Management */}
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Manage Roster</div>

                {/* Invite search */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Invite Players</div>
                  <div style={{ position: 'relative' }}>
                    <input
                      value={profileSearch}
                      onChange={e => { setProfileSearch(e.target.value); searchProfiles(e.target.value) }}
                      placeholder="Search ClubSynq users by name…"
                      style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    />
                    {searchingProfiles && (
                      <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    )}
                  </div>
                  {profileResults.length > 0 && (
                    <div style={{ marginTop: 6, background: 'rgba(14,8,11,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, overflow: 'hidden' }}>
                      {profileResults.map(p => {
                        const already = rosterMembers.some(m => m.user_id === p.id)
                        const initials = (p.full_name ?? '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
                        return (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: already ? 'default' : 'pointer', opacity: already ? 0.5 : 1 }}
                            onMouseEnter={e => !already && (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(138,21,56,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--accent)', overflow: 'hidden', flexShrink: 0 }}>
                              {p.avatar_url ? <img src={p.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{p.full_name ?? 'Unknown'}</div>
                              {p.school && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.school}</div>}
                            </div>
                            <button
                              disabled={already || invitingUser === p.id}
                              onClick={() => inviteUser(p.id)}
                              style={{ padding: '5px 12px', background: already ? 'rgba(255,255,255,0.05)' : 'rgba(138,21,56,0.2)', border: `1px solid ${already ? 'rgba(255,255,255,0.1)' : 'rgba(138,21,56,0.4)'}`, borderRadius: 7, color: already ? 'var(--text-muted)' : 'var(--accent)', cursor: already ? 'default' : 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0 }}
                            >
                              {invitingUser === p.id ? '…' : already ? 'Invited' : 'Invite'}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Current roster */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Roster ({rosterMembers.filter(m => m.status === 'accepted').length} accepted · {rosterMembers.filter(m => m.status === 'pending').length} pending)
                  </div>

                  {/* Incoming join requests */}
                  {rosterMembers.filter(m => m.invite_type === 'request' && m.status === 'pending').length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#f59e0b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Join Requests ({rosterMembers.filter(m => m.invite_type === 'request' && m.status === 'pending').length})
                      </div>
                      {rosterMembers.filter(m => m.invite_type === 'request' && m.status === 'pending').map(m => {
                        const initials = (m.profile?.full_name ?? '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
                        return (
                          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, marginBottom: 6 }}>
                            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#f59e0b', flexShrink: 0, overflow: 'hidden' }}>
                              {m.profile?.avatar_url ? <img src={m.profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{m.profile?.full_name ?? 'Unknown'}</div>
                              {m.profile?.school && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.profile.school}</div>}
                            </div>
                            <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                              <button onClick={() => handleRosterAction(m.id, 'declined')} disabled={rosterActionLoading === m.id} style={{ padding: '5px 9px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 7, color: '#f87171', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>✕</button>
                              <button onClick={() => handleRosterAction(m.id, 'accepted')} disabled={rosterActionLoading === m.id} style={{ padding: '5px 9px', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 7, color: '#4ade80', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}>Accept</button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Sent invites + accepted players */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {rosterMembers.filter(m => !(m.invite_type === 'request' && m.status === 'pending')).length === 0 && (
                      <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                        No roster members yet — invite players above or share the tournament for free agents to request.
                      </div>
                    )}
                    {rosterMembers.filter(m => !(m.invite_type === 'request' && m.status === 'pending')).map(m => {
                      const initials = (m.profile?.full_name ?? '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
                      const sc = m.status === 'accepted' ? { color: '#4ade80', bg: 'rgba(74,222,128,0.1)' } :
                                 m.status === 'declined' ? { color: '#f87171', bg: 'rgba(239,68,68,0.1)' } :
                                 { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' }
                      return (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 9 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0, overflow: 'hidden' }}>
                            {m.profile?.avatar_url ? <img src={m.profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
                          </div>
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.profile?.full_name ?? 'Unknown'}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: sc.color, background: sc.bg, borderRadius: 6, padding: '2px 7px', flexShrink: 0 }}>
                            {m.status === 'accepted' ? 'Joined' : m.status === 'declined' ? 'Declined' : 'Pending'}
                          </span>
                          <button onClick={() => removeMember(m.id)} disabled={rosterActionLoading === m.id} title="Remove" style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 6, color: '#f87171', cursor: 'pointer', flexShrink: 0, opacity: rosterActionLoading === m.id ? 0.5 : 0.7, transition: 'opacity 0.12s' }}
                            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
                          >
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : !canRegister ? (
            <div>
              <div style={{ textAlign: 'center', padding: '40px 20px 24px' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Registration Closed</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {tournament.status === 'registration_open' ? 'You have already registered.' : 'Registration for this tournament is no longer open.'}
                </div>
              </div>
              {/* Free Agent: request to join an accepted team */}
              {tournament.status === 'registration_open' && acceptedTeams.length > 0 && (
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 18 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Free Agent</div>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
                    Want to play but don't have a team? Request to join one of the registered teams below. The Team Captain will review your request.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {acceptedTeams.map(team => (
                      <div key={team.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(138,21,56,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, overflow: 'hidden', flexShrink: 0 }}>
                          {team.logo_url ? <img src={team.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : team.team_name[0]}
                        </div>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{team.team_name}</span>
                        <button onClick={() => requestToJoin(team.id)} style={{ padding: '6px 13px', background: 'rgba(138,21,56,0.15)', border: '1px solid rgba(138,21,56,0.35)', borderRadius: 7, color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', transition: 'all 0.12s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(138,21,56,0.28)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(138,21,56,0.15)')}
                        >
                          Request to Join
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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

              {/* Section picker */}
              {tournament.sections && tournament.sections.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Section <span style={{ color: '#f87171', fontWeight: 700 }}>*</span>
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {tournament.sections.map(sec => {
                      const selected = regSection === sec.name
                      return (
                        <button
                          key={sec.id}
                          type="button"
                          onClick={() => setRegSection(sec.name)}
                          style={{
                            padding: '9px 16px', borderRadius: 10, fontSize: 13.5, fontWeight: selected ? 700 : 500,
                            fontFamily: 'inherit', cursor: 'pointer',
                            background: selected ? 'rgba(56,189,248,0.14)' : 'rgba(255,255,255,0.05)',
                            border: `1px solid ${selected ? 'rgba(56,189,248,0.45)' : 'rgba(255,255,255,0.12)'}`,
                            color: selected ? '#38bdf8' : 'var(--text-muted)',
                            transition: 'all 0.12s',
                          }}
                        >
                          {selected && '✓ '}{sec.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

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

// ─── Compact Team Card (click to expand) ─────────────────────────────────────
function TeamCard({ team, isAdmin, actionLoading, deleteLoading, onAccept, onDecline, onDelete, onExpand }: {
  team: Team
  isAdmin: boolean
  actionLoading: string | null
  deleteLoading: string | null
  onAccept: () => void
  onDecline: () => void
  onDelete: () => void
  onExpand: () => void
}) {
  const sc = team.status === 'accepted' ? { color: '#4ade80', bg: 'rgba(74,222,128,0.1)' } :
             team.status === 'declined' ? { color: '#ef4444', bg: 'rgba(239,68,68,0.1)' } :
             { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' }
  const initials = team.team_name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const playerCount = team.players?.length ?? team.player_names.length

  return (
    <div
      className="td-team-card"
      onClick={onExpand}
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '12px 16px', cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Logo / initials */}
        <div style={{ width: 40, height: 40, borderRadius: 10, background: sc.bg, border: `1px solid ${sc.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: sc.color, overflow: 'hidden', flexShrink: 0 }}>
          {team.logo_url ? <img src={team.logo_url} alt={team.team_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
        </div>

        {/* Name + captain */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{team.team_name}</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: sc.color, background: sc.bg, borderRadius: 999, padding: '2px 7px' }}>
              {team.status.charAt(0).toUpperCase() + team.status.slice(1)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {team.captain?.full_name ?? 'Unknown captain'}
              {playerCount > 0 && <span style={{ opacity: 0.6 }}> · {playerCount} player{playerCount !== 1 ? 's' : ''}</span>}
            </span>
            {team.section && (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#38bdf8', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)', borderRadius: 999, padding: '1px 7px', flexShrink: 0 }}>
                {team.section}
              </span>
            )}
          </div>
        </div>

        {/* Admin actions — stop propagation so clicks don't open modal */}
        {isAdmin ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            {team.status === 'pending' && (
              <>
                <button onClick={onDecline} disabled={actionLoading === team.id} style={{ padding: '6px 11px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 7, color: '#f87171', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', opacity: actionLoading === team.id ? 0.6 : 1 }}>Decline</button>
                <button onClick={onAccept} disabled={actionLoading === team.id} style={{ padding: '6px 11px', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 7, color: '#4ade80', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', opacity: actionLoading === team.id ? 0.6 : 1 }}>Accept</button>
              </>
            )}
            <button onClick={onDelete} disabled={deleteLoading === team.id} title="Remove" style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7, color: '#f87171', cursor: 'pointer', opacity: deleteLoading === team.id ? 0.5 : 0.75, transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.45)' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '0.75'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)' }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            </button>
          </div>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
        )}
      </div>
    </div>
  )
}

// ─── Team Detail Modal ────────────────────────────────────────────────────────
function TeamDetailModal({ team, isAdmin, actionLoading, deleteLoading, onAccept, onDecline, onDelete, onClose }: {
  team: Team
  isAdmin: boolean
  actionLoading: string | null
  deleteLoading: string | null
  onAccept: () => void
  onDecline: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const sc = team.status === 'accepted' ? { color: '#4ade80', bg: 'rgba(74,222,128,0.12)', label: 'Accepted' } :
             team.status === 'declined' ? { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'Declined' } :
             { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Pending Review' }
  const initials = team.team_name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const registeredAt = new Date(team.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'rgba(18,10,14,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, width: '100%', maxWidth: 480, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.7)', animation: 'td-in 0.2s cubic-bezier(0.22,1,0.36,1) both' }}
      >
        {/* Header */}
        <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ width: 64, height: 64, borderRadius: 14, background: sc.bg, border: `1px solid ${sc.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: sc.color, overflow: 'hidden', flexShrink: 0 }}>
            {team.logo_url ? <img src={team.logo_url} alt={team.team_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.2, marginBottom: 6 }}>{team.team_name}</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', background: sc.bg, borderRadius: 999, padding: '4px 10px' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: sc.color }}>{sc.label}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style={{ padding: '16px 20px 20px' }}>
          {/* Captain */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Captain</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{team.captain?.full_name ?? 'Unknown'}</div>
            {team.captain?.school && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{team.captain.school}</div>}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, opacity: 0.7 }}>Registered {registeredAt}</div>
          </div>

          {/* Players */}
          {(team.players?.length ?? team.player_names.length) > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                Players ({team.players?.length ?? team.player_names.length})
              </div>
              {team.players && team.players.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {team.players.map((p, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>{i + 1}</div>
                      <span style={{ fontSize: 13.5, color: 'var(--text-primary)', fontWeight: 500, flex: 1 }}>{p.name}</span>
                      {p.role && <span style={{ fontSize: 11.5, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: '2px 9px', border: '1px solid rgba(255,255,255,0.09)' }}>{p.role}</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {team.player_names.map((p, i) => (
                    <span key={i} style={{ fontSize: 12.5, background: 'rgba(255,255,255,0.06)', borderRadius: 7, padding: '3px 10px', color: 'var(--text-primary)' }}>{p}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Admin actions */}
          {isAdmin && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {team.status === 'pending' && (
                <>
                  <button onClick={onDecline} disabled={actionLoading === team.id} style={{ flex: 1, padding: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#f87171', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', opacity: actionLoading === team.id ? 0.6 : 1 }}>Decline</button>
                  <button onClick={onAccept} disabled={actionLoading === team.id} style={{ flex: 2, padding: '10px', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.35)', borderRadius: 10, color: '#4ade80', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', opacity: actionLoading === team.id ? 0.6 : 1 }}>Accept Team</button>
                </>
              )}
              {team.status === 'declined' && (
                <button onClick={onAccept} disabled={actionLoading === team.id} style={{ flex: 1, padding: '10px', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.35)', borderRadius: 10, color: '#4ade80', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>Move to Accepted</button>
              )}
              <button onClick={onDelete} disabled={deleteLoading === team.id} style={{ padding: '10px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, color: '#f87171', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, opacity: deleteLoading === team.id ? 0.5 : 1 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                {deleteLoading === team.id ? 'Removing…' : 'Remove'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Shared match admin controls ─────────────────────────────────────────────
function MatchAdminControls({ match, t1, t2, isEditing, savingMatch, onEdit, onCancelEdit, onSave, onSetLive }: {
  match: Match; t1: Team | null; t2: Team | null
  isEditing: boolean; savingMatch: boolean
  onEdit: () => void; onCancelEdit: () => void
  onSave: (w: string | null) => void; onSetLive: () => void
}) {
  if (isEditing) return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button onClick={() => onSave(null)} disabled={savingMatch} style={{ flex: 1, padding: '7px 10px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', opacity: savingMatch ? 0.6 : 1 }}>
        {savingMatch ? 'Saving…' : 'Save Score'}
      </button>
      {t1 && t2 && <>
        <button onClick={() => onSave(match.team1_id)} disabled={savingMatch} style={{ padding: '7px 10px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 8, color: '#4ade80', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>
          {t1.team_name.split(' ')[0]} wins
        </button>
        <button onClick={() => onSave(match.team2_id)} disabled={savingMatch} style={{ padding: '7px 10px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 8, color: '#4ade80', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>
          {t2.team_name.split(' ')[0]} wins
        </button>
      </>}
      <button onClick={onCancelEdit} style={{ padding: '7px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>Cancel</button>
    </div>
  )
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {match.status === 'scheduled' && (
        <button onClick={onSetLive} style={{ padding: '6px 12px', background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 8, color: '#f97316', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}>
          ● Set Live
        </button>
      )}
      <button onClick={onEdit} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>
        {match.status === 'completed' ? 'Edit' : 'Update Score'}
      </button>
    </div>
  )
}

// ─── Team avatar helper ───────────────────────────────────────────────────────
function TeamAvatar({ team, size = 32, color }: { team: Team | null; size?: number; color: string }) {
  const initials = (team?.team_name ?? 'TBD').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.28, background: `${color}22`, border: `1px solid ${color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.35, fontWeight: 800, color, overflow: 'hidden', flexShrink: 0 }}>
      {team?.logo_url ? <img src={team.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
    </div>
  )
}

// ─── Live Match Hero ──────────────────────────────────────────────────────────
function LiveMatchHero({ match, teamMap, isAdmin, isEditing, editScore1, editScore2, savingMatch, onEdit, onCancelEdit, onSave, onScore1Change, onScore2Change }: {
  match: Match; teamMap: Record<string, Team>
  isAdmin: boolean; isEditing: boolean
  editScore1: string; editScore2: string; savingMatch: boolean
  onEdit: () => void; onCancelEdit: () => void
  onSave: (w: string | null) => void
  onScore1Change: (v: string) => void; onScore2Change: (v: string) => void
}) {
  const t1 = match.team1_id ? teamMap[match.team1_id] : null
  const t2 = match.team2_id ? teamMap[match.team2_id] : null

  return (
    <div style={{ background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.35)', borderRadius: 18, overflow: 'hidden', animation: 'score-glow 2.5s ease-in-out infinite' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'rgba(249,115,22,0.1)', borderBottom: '1px solid rgba(249,115,22,0.2)' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316', animation: 'live-pulse 1.4s ease-in-out infinite', boxShadow: '0 0 8px rgba(249,115,22,0.8)', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 900, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Live</span>
        <span style={{ fontSize: 11, color: 'rgba(249,115,22,0.6)', marginLeft: 2 }}>Round {match.round} · Match {match.match_number}</span>
      </div>

      {/* Scoreboard */}
      <div style={{ padding: '20px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Team 1 side */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <TeamAvatar team={t1} size={52} color="#f97316" />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', lineHeight: 1.3 }}>{t1?.team_name ?? 'TBD'}</span>
            {isEditing ? (
              <input type="number" min={0} value={editScore1} onChange={e => onScore1Change(e.target.value)}
                style={{ width: 72, padding: '6px', background: 'rgba(255,255,255,0.1)', border: '2px solid rgba(249,115,22,0.5)', borderRadius: 10, color: '#fff', fontSize: 36, fontWeight: 900, textAlign: 'center', outline: 'none', fontFamily: 'inherit' }} />
            ) : (
              <span style={{ fontSize: 52, fontWeight: 900, color: '#fff', lineHeight: 1, textShadow: '0 0 24px rgba(249,115,22,0.3)' }}>{match.score1}</span>
            )}
          </div>

          {/* VS */}
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'rgba(249,115,22,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>vs</span>
          </div>

          {/* Team 2 side */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <TeamAvatar team={t2} size={52} color="#f97316" />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', lineHeight: 1.3 }}>{t2?.team_name ?? 'TBD'}</span>
            {isEditing ? (
              <input type="number" min={0} value={editScore2} onChange={e => onScore2Change(e.target.value)}
                style={{ width: 72, padding: '6px', background: 'rgba(255,255,255,0.1)', border: '2px solid rgba(249,115,22,0.5)', borderRadius: 10, color: '#fff', fontSize: 36, fontWeight: 900, textAlign: 'center', outline: 'none', fontFamily: 'inherit' }} />
            ) : (
              <span style={{ fontSize: 52, fontWeight: 900, color: '#fff', lineHeight: 1, textShadow: '0 0 24px rgba(249,115,22,0.3)' }}>{match.score2}</span>
            )}
          </div>
        </div>

        {/* Admin controls */}
        {isAdmin && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(249,115,22,0.15)' }}>
            <MatchAdminControls match={match} t1={t1} t2={t2} isEditing={isEditing} savingMatch={savingMatch} onEdit={onEdit} onCancelEdit={onCancelEdit} onSave={onSave} onSetLive={() => {}} />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Match Card (bracket view) ────────────────────────────────────────────────
function MatchCard({ match, teamMap, isAdmin, isEditing, editScore1, editScore2, savingMatch, onEdit, onCancelEdit, onSave, onSetLive, onScore1Change, onScore2Change, onAssignTeam1, onAssignTeam2, onClearTeam1, onClearTeam2 }: {
  match: Match; teamMap: Record<string, Team>
  isAdmin: boolean; isEditing: boolean
  editScore1: string; editScore2: string; savingMatch: boolean
  onEdit: () => void; onCancelEdit: () => void
  onSave: (w: string | null) => void; onSetLive: () => void
  onScore1Change: (v: string) => void; onScore2Change: (v: string) => void
  onAssignTeam1?: () => void; onAssignTeam2?: () => void
  onClearTeam1?: () => void; onClearTeam2?: () => void
}) {
  const t1 = match.team1_id ? teamMap[match.team1_id] : null
  const t2 = match.team2_id ? teamMap[match.team2_id] : null
  const isBye = !t1 && !t2
  const isLive = match.status === 'live'
  const isDone = match.status === 'completed'
  const showScore = isLive || isDone
  const canScore = !!(t1 && t2)

  if (isBye && isAdmin) return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '2px dashed rgba(138,21,56,0.25)', borderRadius: 12, padding: '10px 14px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
        R{match.round} · M{match.match_number} — Waiting for advancement
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onAssignTeam1} style={{ flex: 1, padding: '7px', background: 'rgba(138,21,56,0.12)', border: '1px solid rgba(138,21,56,0.28)', borderRadius: 8, color: 'var(--accent)', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit' }}>+ Top Slot</button>
        <button onClick={onAssignTeam2} style={{ flex: 1, padding: '7px', background: 'rgba(138,21,56,0.12)', border: '1px solid rgba(138,21,56,0.28)', borderRadius: 8, color: 'var(--accent)', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit' }}>+ Bottom Slot</button>
      </div>
    </div>
  )

  if (isBye) return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '10px 14px', textAlign: 'center' }}>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>Awaiting advancement</span>
    </div>
  )

  const t1Wins = match.winner_id === match.team1_id
  const t2Wins = match.winner_id === match.team2_id

  const teamRowStyle = (isWinner: boolean, _isLoser: boolean) => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
    background: isWinner ? 'rgba(74,222,128,0.06)' : 'transparent',
    transition: 'background 0.2s',
  })
  const nameStyle = (isWinner: boolean, isLoser: boolean): React.CSSProperties => ({
    flex: 1, fontSize: 13, fontWeight: isWinner ? 800 : 600,
    color: isLoser ? 'rgba(255,255,255,0.3)' : isWinner ? '#fff' : 'var(--text-primary)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  })
  const scoreStyle = (isWinner: boolean, isLoser: boolean): React.CSSProperties => ({
    fontSize: 22, fontWeight: 900, minWidth: 28, textAlign: 'right',
    color: isWinner ? '#4ade80' : isLoser ? 'rgba(255,255,255,0.2)' : isLive ? '#f97316' : 'rgba(255,255,255,0.5)',
  })

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${isLive ? 'rgba(249,115,22,0.3)' : isDone ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 14, overflow: 'hidden', boxShadow: isLive ? '0 0 20px rgba(249,115,22,0.1)' : 'none' }}>
      {/* Status bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', background: isLive ? 'rgba(249,115,22,0.08)' : isDone ? 'rgba(255,255,255,0.02)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        {isLive && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', animation: 'live-pulse 1.4s ease-in-out infinite', flexShrink: 0 }} />}
        <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: isLive ? '#f97316' : isDone ? '#4ade80' : 'rgba(255,255,255,0.25)' }}>
          {isLive ? 'Live' : isDone ? 'Final' : `R${match.round} · M${match.match_number}`}
        </span>
        {(isLive || isDone) && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginLeft: 2 }}>R{match.round} · M{match.match_number}</span>}
      </div>

      {/* Team 1 */}
      <div style={teamRowStyle(t1Wins, t2Wins && isDone)}>
        <TeamAvatar team={t1} size={28} color={t1Wins ? '#4ade80' : isLive ? '#f97316' : 'rgba(255,255,255,0.4)'} />
        {t1 ? (
          <span style={nameStyle(t1Wins, t2Wins && isDone)}>{t1.team_name}</span>
        ) : isAdmin ? (
          <button onClick={onAssignTeam1} style={{ flex: 1, padding: '3px 8px', background: 'rgba(138,21,56,0.12)', border: '1px dashed rgba(138,21,56,0.35)', borderRadius: 6, color: 'var(--accent)', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit', textAlign: 'left' }}>+ Assign</button>
        ) : (
          <span style={{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>Awaiting winner…</span>
        )}
        {t1Wins && <span style={{ fontSize: 12 }}>🏆</span>}
        {t1 && isAdmin && !isDone && !isLive && (
          <button onClick={onClearTeam1} title="Clear slot" style={{ width: 18, height: 18, background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
        {isEditing
          ? <input type="number" min={0} value={editScore1} onChange={e => onScore1Change(e.target.value)} style={{ width: 46, padding: '4px 6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 7, color: '#fff', fontSize: 16, fontWeight: 900, textAlign: 'center', outline: 'none', fontFamily: 'inherit' }} />
          : <span style={scoreStyle(t1Wins, t2Wins && isDone)}>{showScore ? match.score1 : '–'}</span>
        }
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', marginLeft: 52 }} />

      {/* Team 2 */}
      <div style={teamRowStyle(t2Wins, t1Wins && isDone)}>
        <TeamAvatar team={t2} size={28} color={t2Wins ? '#4ade80' : isLive ? '#f97316' : 'rgba(255,255,255,0.4)'} />
        {t2 ? (
          <span style={nameStyle(t2Wins, t1Wins && isDone)}>{t2.team_name}</span>
        ) : isAdmin ? (
          <button onClick={onAssignTeam2} style={{ flex: 1, padding: '3px 8px', background: 'rgba(138,21,56,0.12)', border: '1px dashed rgba(138,21,56,0.35)', borderRadius: 6, color: 'var(--accent)', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit', textAlign: 'left' }}>+ Assign</button>
        ) : (
          <span style={{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>Awaiting winner…</span>
        )}
        {t2Wins && <span style={{ fontSize: 12 }}>🏆</span>}
        {t2 && isAdmin && !isDone && !isLive && (
          <button onClick={onClearTeam2} title="Clear slot" style={{ width: 18, height: 18, background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
        {isEditing
          ? <input type="number" min={0} value={editScore2} onChange={e => onScore2Change(e.target.value)} style={{ width: 46, padding: '4px 6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 7, color: '#fff', fontSize: 16, fontWeight: 900, textAlign: 'center', outline: 'none', fontFamily: 'inherit' }} />
          : <span style={scoreStyle(t2Wins, t1Wins && isDone)}>{showScore ? match.score2 : '–'}</span>
        }
      </div>

      {/* Admin controls */}
      {isAdmin && (
        <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.12)' }}>
          {canScore ? (
            <MatchAdminControls match={match} t1={t1} t2={t2} isEditing={isEditing} savingMatch={savingMatch} onEdit={onEdit} onCancelEdit={onCancelEdit} onSave={onSave} onSetLive={onSetLive} />
          ) : (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>Assign both teams to enable scoring</div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Round Robin Standings ────────────────────────────────────────────────────
function RoundRobinStandings({ teams, matches, sections, activeSection }: {
  teams: Team[]
  matches: Match[]
  sections?: Array<{ id: string; name: string; maxTeams?: number | null }> | null
  activeSection?: string
}) {
  function buildStats(teamList: Team[]) {
    return teamList.map(team => {
      const myMatches = matches.filter(m => (m.team1_id === team.id || m.team2_id === team.id) && m.status === 'completed')
      const wins = myMatches.filter(m => m.winner_id === team.id).length
      const losses = myMatches.filter(m => m.winner_id && m.winner_id !== team.id).length
      const gf = myMatches.reduce((s, m) => s + (m.team1_id === team.id ? m.score1 : m.score2), 0)
      const ga = myMatches.reduce((s, m) => s + (m.team1_id === team.id ? m.score2 : m.score1), 0)
      return { team, played: myMatches.length, wins, losses, gf, ga }
    }).sort((a, b) => b.wins - a.wins || (b.gf - b.ga) - (a.gf - a.ga))
  }

  function StatsTable({ stats }: { stats: ReturnType<typeof buildStats> }) {
    return (
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
    )
  }

  const hasSections = (sections?.length ?? 0) > 0
  // When a parent passes activeSection (e.g. bracket tab's own tab bar), use it.
  // Only maintain internal tab state when rendering standalone (no parent controller).
  const [internalSec, setInternalSec] = React.useState(() => sections?.[0]?.name ?? '')
  const controlled = !!activeSection && hasSections
  const currentSec = controlled ? activeSection : (internalSec || sections?.[0]?.name || '')

  if (hasSections) {
    const secTeams = teams.filter(t => t.section === currentSec)
    const stats = buildStats(secTeams)
    return (
      <div style={{ marginBottom: 20 }}>
        {/* Only render own tab pills when not controlled by a parent tab bar */}
        {!controlled && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {(sections ?? []).map(sec => {
              const isActive = currentSec === sec.name
              const count = teams.filter(t => t.section === sec.name).length
              return (
                <button key={sec.id} onClick={() => setInternalSec(sec.name)} style={{
                  padding: '7px 14px', borderRadius: 10, fontSize: 13, fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer', fontFamily: 'inherit',
                  background: isActive ? 'rgba(56,189,248,0.13)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isActive ? 'rgba(56,189,248,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  color: isActive ? '#38bdf8' : 'var(--text-muted)',
                  display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.13s',
                }}>
                  {sec.name}
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: isActive ? 'rgba(56,189,248,0.18)' : 'rgba(255,255,255,0.07)', color: isActive ? '#38bdf8' : 'rgba(255,255,255,0.3)' }}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        )}
        {/* Active section table */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '10px 18px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{currentSec}</span>
          </div>
          <div style={{ padding: '0 8px 8px', overflowX: 'auto' }}>
            {secTeams.length === 0
              ? <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: 'var(--text-muted)' }}>No teams in this section yet.</div>
              : <StatsTable stats={stats} />}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20, marginBottom: 20, overflowX: 'auto' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Standings</div>
      <StatsTable stats={buildStats(teams)} />
    </div>
  )
}

// ─── Group Stages + Knockouts view ───────────────────────────────────────────
function GroupKnockoutView({ tournament, teams, matches, teamMap, isAdmin, editMatch, editScore1, editScore2, savingMatch, onEdit, onCancelEdit, onSave, onSetLive, onScore1Change, onScore2Change, onAssignTeam1, onAssignTeam2, onClearTeam1, onClearTeam2, onGenerateKnockout, generatingKnockout }: {
  tournament: Tournament
  teams: Team[]
  matches: Match[]
  teamMap: Record<string, Team>
  isAdmin: boolean
  editMatch: string | null; editScore1: string; editScore2: string; savingMatch: boolean
  onEdit: (matchId: string) => void; onCancelEdit: () => void
  onSave: (matchId: string, w: string | null) => void; onSetLive: (matchId: string) => void
  onScore1Change: (v: string) => void; onScore2Change: (v: string) => void
  onAssignTeam1: (matchId: string) => void; onAssignTeam2: (matchId: string) => void
  onClearTeam1: (matchId: string) => void; onClearTeam2: (matchId: string) => void
  onGenerateKnockout: () => void; generatingKnockout: boolean
}) {
  const sections = tournament.sections ?? []
  const groupMatches = matches.filter(m => m.stage === 'group')
  const knockoutMatches = matches.filter(m => m.stage === 'knockout')
  const allGroupsComplete = groupMatches.length > 0 && groupMatches.every(m => m.status === 'completed')
  const koRounds = [...new Set(knockoutMatches.map(m => m.round))].sort((a, b) => a - b)
  const koMaxRound = Math.max(...koRounds, 0)

  function matchCardProps(match: Match) {
    return {
      match, teamMap, isAdmin,
      isEditing: editMatch === match.id, editScore1, editScore2, savingMatch,
      onEdit: () => onEdit(match.id), onCancelEdit,
      onSave: (wid: string | null) => onSave(match.id, wid), onSetLive: () => onSetLive(match.id),
      onScore1Change, onScore2Change,
      onAssignTeam1: isAdmin ? () => onAssignTeam1(match.id) : undefined,
      onAssignTeam2: isAdmin ? () => onAssignTeam2(match.id) : undefined,
      onClearTeam1: isAdmin ? () => onClearTeam1(match.id) : undefined,
      onClearTeam2: isAdmin ? () => onClearTeam2(match.id) : undefined,
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Group standings + matches */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Group Stage</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
        </div>
        <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {sections.map(sec => {
            const secMatches = groupMatches.filter(m => {
              const s1 = m.team1_id ? teamMap[m.team1_id]?.section ?? null : null
              const s2 = m.team2_id ? teamMap[m.team2_id]?.section ?? null : null
              return (s1 && s1 === sec.name) || (s2 && s2 === sec.name)
            })
            const standings = computeGroupStandings(sec.name, teams, groupMatches)
            return (
              <div key={sec.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{sec.name}</span>
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 14, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ color: 'var(--text-muted)', fontSize: 10.5 }}>
                        <th style={{ textAlign: 'left', padding: '2px 6px', fontWeight: 600 }}>Team</th>
                        <th style={{ textAlign: 'center', padding: '2px 6px' }}>P</th>
                        <th style={{ textAlign: 'center', padding: '2px 6px' }}>W</th>
                        <th style={{ textAlign: 'center', padding: '2px 6px' }}>D</th>
                        <th style={{ textAlign: 'center', padding: '2px 6px' }}>L</th>
                        <th style={{ textAlign: 'center', padding: '2px 6px' }}>Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((row, i) => (
                        <tr key={row.team.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: i < (tournament.advance_per_group ?? 2) ? 'rgba(74,222,128,0.05)' : 'transparent' }}>
                          <td style={{ padding: '6px 6px', color: i < (tournament.advance_per_group ?? 2) ? '#4ade80' : 'var(--text-primary)', fontWeight: i === 0 ? 700 : 500 }}>{row.team.team_name}</td>
                          <td style={{ padding: '6px 6px', textAlign: 'center', color: 'var(--text-muted)' }}>{row.played}</td>
                          <td style={{ padding: '6px 6px', textAlign: 'center', color: '#4ade80', fontWeight: 700 }}>{row.wins}</td>
                          <td style={{ padding: '6px 6px', textAlign: 'center', color: '#f59e0b' }}>{row.draws}</td>
                          <td style={{ padding: '6px 6px', textAlign: 'center', color: '#f87171' }}>{row.losses}</td>
                          <td style={{ padding: '6px 6px', textAlign: 'center', color: 'var(--text-primary)', fontWeight: 800 }}>{row.pts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {secMatches.map(match => <MatchCard key={match.id} {...matchCardProps(match)} />)}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Knockout bracket */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Knockout Bracket</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
          {isAdmin && knockoutMatches.length > 0 && (
            <button onClick={onGenerateKnockout} disabled={generatingKnockout} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, color: 'var(--text-muted)', cursor: generatingKnockout ? 'default' : 'pointer', fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit', flexShrink: 0 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.36"/></svg>
              {generatingKnockout ? 'Generating…' : 'Re-generate from Standings'}
            </button>
          )}
        </div>
        {knockoutMatches.length === 0 ? (
          isAdmin ? (
            <div style={{ padding: 16, background: 'rgba(138,21,56,0.08)', border: '1px solid rgba(138,21,56,0.2)', borderRadius: 14 }}>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12 }}>
                {allGroupsComplete
                  ? `Group stage complete. Generate the knockout bracket with the top ${tournament.advance_per_group ?? 2} team(s) from each group.`
                  : `Group stage still in progress — you can generate the bracket early, but standings may still change.`}
              </p>
              <button onClick={onGenerateKnockout} disabled={generatingKnockout} style={{
                padding: '10px 20px', background: generatingKnockout ? 'rgba(138,21,56,0.4)' : 'var(--accent)',
                border: 'none', borderRadius: 10, color: '#fff', cursor: generatingKnockout ? 'default' : 'pointer',
                fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
              }}>
                {generatingKnockout ? 'Generating…' : 'Generate Knockout Bracket'}
              </button>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px', fontSize: 13, color: 'var(--text-muted)' }}>Knockout bracket hasn't been generated yet.</div>
          )
        ) : (
          <div style={{ overflowX: 'auto', paddingBottom: 12 }}>
            <div style={{ display: 'flex', gap: 12, minWidth: Math.max(koRounds.length * 240, 400) }}>
              {koRounds.map(round => (
                <div key={round} style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, textAlign: 'center', color: round === koMaxRound ? '#e9c176' : 'var(--text-muted)' }}>
                    {round === koMaxRound ? '🏆 Final' : round === koMaxRound - 1 && koRounds.length > 2 ? 'Semi-finals' : `Round ${round}`}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {knockoutMatches.filter(m => m.round === round && (m.team1_id || m.team2_id)).map(match => (
                      <MatchCard key={match.id} {...matchCardProps(match)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Bowling Overview ─────────────────────────────────────────────────────────
// Bowling has no matchups — each accepted team is an independent bowler with their
// own 10-frame scorecard, so this replaces the bracket/standings view entirely.
function BowlingOverview({ teams, scorecards, isAdmin, generating, onOpenControl, onOpenPublic, onRefreshBowlers }: {
  teams: Team[]
  scorecards: BowlingScorecard[]
  isAdmin: boolean
  generating: boolean
  onOpenControl: () => void
  onOpenPublic: () => void
  onRefreshBowlers: () => void
}) {
  const cardByTeam = Object.fromEntries(scorecards.map(c => [c.team_id, c]))
  const rows = teams.map(t => {
    const card = cardByTeam[t.id]
    const game = computeGame(card?.rolls ?? [])
    return { team: t, card, total: game.total }
  })

  const laneGroups = new Map<number | 'unassigned', typeof rows>()
  for (const row of rows) {
    const lane = row.card?.lane ?? 'unassigned'
    if (!laneGroups.has(lane)) laneGroups.set(lane, [])
    laneGroups.get(lane)!.push(row)
  }
  const sortedLanes = [...laneGroups.entries()].sort((a, b) => {
    if (a[0] === 'unassigned') return 1
    if (b[0] === 'unassigned') return -1
    return a[0] - b[0]
  })
  for (const [, group] of sortedLanes) group.sort((a, b) => (b.total ?? -1) - (a.total ?? -1))

  return (
    <div>
      {isAdmin && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <button onClick={onOpenControl} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: 'var(--accent)', border: 'none', borderRadius: 11, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}>
            🎳 Open Bowling Command Center
          </button>
          <button onClick={onOpenPublic} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', background: 'rgba(233,193,118,0.1)', border: '1px solid rgba(233,193,118,0.3)', borderRadius: 11, color: '#e9c176', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}>
            Public Leaderboard ↗
          </button>
          <button onClick={onRefreshBowlers} disabled={generating} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 11, color: 'var(--text-muted)', cursor: generating ? 'default' : 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', opacity: generating ? 0.5 : 1 }}>
            {generating ? 'Checking…' : '+ Add newly accepted bowlers'}
          </button>
        </div>
      )}

      {sortedLanes.map(([lane, group]) => (
        <div key={lane} style={{ marginBottom: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {lane === 'unassigned' ? 'Unassigned' : `Lane ${lane}`}
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>{group.length}/{BOWLERS_PER_LANE}</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {group.map((row, i) => (
              <div key={row.team.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 }}>
                <span style={{ width: 22, textAlign: 'center', fontSize: 14, fontWeight: 900, color: i === 0 && row.total !== null ? '#e9c176' : i === 1 && row.total !== null ? '#94a3b8' : i === 2 && row.total !== null ? '#b87333' : 'rgba(255,255,255,0.25)' }}>
                  {i + 1}
                </span>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, overflow: 'hidden', flexShrink: 0 }}>
                  {row.team.logo_url ? <img src={row.team.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : row.team.team_name[0]}
                </div>
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>{row.team.team_name}</span>
                {row.card?.status === 'in_progress' && <span style={{ fontSize: 10, fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Live</span>}
                {row.card?.status === 'completed' && <span style={{ fontSize: 10, fontWeight: 800, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Final</span>}
                {(!row.card || row.card.status === 'not_started') && <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.25)' }}>Not started</span>}
                <span style={{ fontSize: 16, fontWeight: 900, color: '#e9c176', minWidth: 32, textAlign: 'right' }}>{row.total ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Scoreboard Create CTA ───────────────────────────────────────────────────
function ScoreboardCreateCTA({ onStart }: { onStart: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 20px 40px', animation: 'td-in 0.3s ease both' }}>
      {/* Mini scoreboard preview */}
      <div style={{ marginBottom: 28, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: '20px 28px', display: 'flex', alignItems: 'center', gap: 20, boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}>
        {/* Team A */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, margin: '0 auto 6px' }}>🏀</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>TEAM A</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: '#4ade80', lineHeight: 1 }}>72</div>
        </div>
        {/* Centre */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(249,115,22,0.8)', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'rgba(249,115,22,0.12)', borderRadius: 6, padding: '3px 8px' }}>Q4</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontVariantNumeric: 'tabular-nums' }}>2:41</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.3)' }}>VS</div>
        </div>
        {/* Team B */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, margin: '0 auto 6px' }}>🏀</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>TEAM B</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: '#f97316', lineHeight: 1 }}>68</div>
        </div>
      </div>

      <h2 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 8, letterSpacing: '-0.02em' }}>Set Up Your Scoreboard</h2>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 28, textAlign: 'center', maxWidth: 360, lineHeight: 1.6 }}>
        Choose a sport and template to create a live, real-time scoreboard for your tournament.
      </p>
      <button
        onClick={onStart}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 28px', background: 'var(--accent)', border: 'none', borderRadius: 14, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 20px rgba(138,21,56,0.45)', transition: 'all 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-1px)', e.currentTarget.style.boxShadow = '0 8px 28px rgba(138,21,56,0.55)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)', e.currentTarget.style.boxShadow = '0 4px 20px rgba(138,21,56,0.45)')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Create Scoreboard
      </button>
    </div>
  )
}

// ─── Scoreboard Sport Picker ──────────────────────────────────────────────────
const SPORTS_LIST = [
  { key: 'universal', label: 'Universal', emoji: '🏆', locked: true },
  { key: 'football', label: 'Football', emoji: '⚽', locked: false },
  { key: 'baseball', label: 'Baseball', emoji: '⚾', locked: true },
  { key: 'basketball', label: 'Basketball', emoji: '🏀', locked: false },
  { key: 'bowling', label: 'Bowling', emoji: '🎳', locked: false },
  { key: 'badminton', label: 'Badminton', emoji: '🏸', locked: true },
  { key: 'tennis', label: 'Tennis', emoji: '🎾', locked: true },
  { key: 'esports', label: 'Esports', emoji: '🎮', locked: true },
  { key: 'timer', label: 'Timer', emoji: '⏱️', locked: true },
] as const

function ScoreboardSportPicker({ onBack, onSelect }: { onBack: () => void; onSelect: (sport: string) => void }) {
  return (
    <div style={{ animation: 'td-in 0.25s ease both' }}>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: 13, fontFamily: 'inherit', marginBottom: 24 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </button>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 4, letterSpacing: '-0.02em' }}>Choose Your Sport</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Select the sport to get the right scoring rules and layout</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
        {SPORTS_LIST.map(sport => (
          <button
            key={sport.key}
            onClick={() => !sport.locked && onSelect(sport.key)}
            disabled={sport.locked}
            style={{
              position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 10, padding: '20px 12px',
              background: sport.locked ? 'rgba(255,255,255,0.02)' : 'rgba(138,21,56,0.1)',
              border: `1.5px solid ${sport.locked ? 'rgba(255,255,255,0.07)' : 'rgba(138,21,56,0.35)'}`,
              borderRadius: 16, cursor: sport.locked ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', transition: 'all 0.15s',
              opacity: sport.locked ? 0.55 : 1,
            }}
            onMouseEnter={e => { if (!sport.locked) { e.currentTarget.style.background = 'rgba(138,21,56,0.18)'; e.currentTarget.style.transform = 'translateY(-2px)' } }}
            onMouseLeave={e => { if (!sport.locked) { e.currentTarget.style.background = 'rgba(138,21,56,0.1)'; e.currentTarget.style.transform = 'translateY(0)' } }}
          >
            <span style={{ fontSize: 32 }}>{sport.emoji}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: sport.locked ? 'rgba(255,255,255,0.45)' : 'var(--text-primary)' }}>{sport.label}</span>
            {sport.locked ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: '2px 8px' }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>Coming Soon</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(138,21,56,0.2)', borderRadius: 6, padding: '2px 8px' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />
                <span style={{ fontSize: 10, color: '#4ade80', fontWeight: 700 }}>Available</span>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Scoreboard Format Picker (Football) ─────────────────────────────────────
const FORMAT_OPTIONS = [
  {
    key: 'round_robin' as const,
    label: 'Round Robin',
    emoji: '🏆',
    desc: 'Every team plays every other team once. Standings decide the winner.',
  },
  {
    key: 'single_elimination' as const,
    label: 'Single Elimination',
    emoji: '⚔️',
    desc: 'Straight knockout bracket. Lose once and you\'re out.',
  },
  {
    key: 'group_knockout' as const,
    label: 'Group Stages + Knockouts',
    emoji: '🏟️',
    desc: 'Teams are split into groups for round-robin play, then top teams advance to a knockout bracket.',
  },
]

function ScoreboardFormatPicker({ onBack, onSelect }: { onBack: () => void; onSelect: (format: 'round_robin' | 'single_elimination' | 'group_knockout') => void }) {
  return (
    <div style={{ animation: 'td-in 0.25s ease both' }}>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: 13, fontFamily: 'inherit', marginBottom: 24 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Sports
      </button>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 18 }}>⚽</span>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Football — Choose a Format</h2>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Pick how the tournament decides its winner</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        {FORMAT_OPTIONS.map(f => (
          <button
            key={f.key}
            onClick={() => onSelect(f.key)}
            style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', gap: 10, background: 'rgba(255,255,255,0.03)', border: '1.5px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 18, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(138,21,56,0.1)'; e.currentTarget.style.borderColor = 'rgba(138,21,56,0.4)'; e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.4)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
          >
            <span style={{ fontSize: 26 }}>{f.emoji}</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>{f.label}</span>
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>{f.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Group Stage Setup (Football → Group Stages + Knockouts) ────────────────
function ScoreboardGroupsSetup({ teamCount, groupCount, setGroupCount, advancePerGroup, setAdvancePerGroup, onBack, onConfirm }: {
  teamCount: number
  groupCount: string; setGroupCount: (v: string) => void
  advancePerGroup: string; setAdvancePerGroup: (v: string) => void
  onBack: () => void; onConfirm: () => void
}) {
  const numGroups = Math.max(1, parseInt(groupCount) || 1)
  const numAdvance = Math.max(1, parseInt(advancePerGroup) || 1)
  const perGroup = numGroups > 0 ? Math.ceil(teamCount / numGroups) : 0
  return (
    <div style={{ maxWidth: 480, animation: 'td-in 0.25s ease both' }}>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: 13, fontFamily: 'inherit', marginBottom: 24 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Formats
      </button>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 4, letterSpacing: '-0.02em' }}>Set Up Groups</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {teamCount > 0 ? `${teamCount} teams accepted so far — you can still add more before generating.` : 'Add teams first, then come back to generate — groups will be filled in evenly.'}
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>Number of groups</label>
          <input type="number" min={1} value={groupCount} onChange={e => setGroupCount(e.target.value)} style={{ width: '100%', padding: '11px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
          {teamCount > 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>~{perGroup} team{perGroup !== 1 ? 's' : ''} per group</div>}
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>Teams advancing per group</label>
          <input type="number" min={1} value={advancePerGroup} onChange={e => setAdvancePerGroup(e.target.value)} style={{ width: '100%', padding: '11px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Top {numAdvance} from each group move on to the knockout bracket ({numGroups * numAdvance} teams total)</div>
        </div>
        <button
          onClick={onConfirm}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 22px', background: 'var(--accent)', border: 'none', borderRadius: 12, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', boxShadow: '0 4px 18px rgba(138,21,56,0.4)' }}
        >
          Continue →
        </button>
      </div>
    </div>
  )
}

// ─── Scoreboard Template Picker ───────────────────────────────────────────────
const BASKETBALL_TEMPLATES = [
  {
    key: 'Basketball Scoreboard Template',
    preview: (
      <div style={{ width: '100%', padding: '10px 12px', fontFamily: 'inherit' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.5)', borderRadius: 8, padding: '8px 12px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>HOME</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#4ade80', lineHeight: 1 }}>54</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 7, color: '#f97316', fontWeight: 700 }}>Q3</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontVariantNumeric: 'tabular-nums' }}>5:20</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>AWAY</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#f97316', lineHeight: 1 }}>48</div>
          </div>
        </div>
      </div>
    ),
  },
  {
    key: 'Basketball Centered Scoreboard',
    preview: (
      <div style={{ width: '100%', padding: '10px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Q2 · 8:04</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#fff' }}>31</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontWeight: 600 }}>–</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#fff' }}>29</div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.4)' }}>BULLS</div>
          <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.4)' }}>HAWKS</div>
        </div>
      </div>
    ),
  },
  {
    key: 'Shot Clock Scoreboard',
    preview: (
      <div style={{ width: '100%', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>67</div>
          <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.4)' }}>HOME</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2.5px solid #f97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: '#f97316' }}>14</span>
          </div>
          <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.3)' }}>SHOT</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>61</div>
          <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.4)' }}>AWAY</div>
        </div>
      </div>
    ),
  },
  {
    key: 'FIBA International Scoreboard',
    preview: (
      <div style={{ width: '100%', padding: '6px 10px', fontFamily: 'inherit' }}>
        <div style={{ background: '#002147', borderRadius: 6, padding: '8px 10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 7, color: '#c0a060', fontWeight: 800, letterSpacing: '0.1em' }}>FIBA</span>
            <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.5)' }}>P2 · 12:00</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 14, height: 10, background: 'rgba(255,255,255,0.15)', borderRadius: 2 }} />
              <span style={{ fontSize: 8, color: '#fff', fontWeight: 700 }}>USA</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>82</span>
              <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)' }}>-</span>
              <span style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>77</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 8, color: '#fff', fontWeight: 700 }}>ESP</span>
              <div style={{ width: 14, height: 10, background: 'rgba(255,255,255,0.15)', borderRadius: 2 }} />
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    key: 'NBA Game Day Template',
    preview: (
      <div style={{ width: '100%', padding: '6px 10px', fontFamily: 'inherit' }}>
        <div style={{ background: '#1a1a2e', borderRadius: 6, padding: '8px 10px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6, justifyContent: 'center' }}>
            {['Q1','Q2','Q3','Q4'].map((q, i) => (
              <div key={q} style={{ width: 18, height: 12, borderRadius: 3, background: i === 2 ? 'rgba(249,115,22,0.6)' : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 6, color: i === 2 ? '#fff' : 'rgba(255,255,255,0.3)', fontWeight: 700 }}>{q}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 8, fontWeight: 800, color: '#fff' }}>LAL</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: '#f0c040' }}>88</span>
              <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)' }}>·</span>
              <span style={{ fontSize: 22, fontWeight: 900, color: '#4ade80' }}>85</span>
            </div>
            <span style={{ fontSize: 8, fontWeight: 800, color: '#fff' }}>BOS</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    key: 'Round Robin Standings',
    preview: (
      <div style={{ width: '100%', padding: '8px 12px', fontFamily: 'inherit' }}>
        <div style={{ fontSize: 7, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5, textAlign: 'center' }}>Standings</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 7 }}>
          <thead>
            <tr style={{ color: 'rgba(255,255,255,0.3)' }}>
              <th style={{ textAlign: 'left', padding: '1px 3px', fontWeight: 600 }}>Team</th>
              <th style={{ textAlign: 'center', padding: '1px 3px' }}>W</th>
              <th style={{ textAlign: 'center', padding: '1px 3px' }}>L</th>
              <th style={{ textAlign: 'center', padding: '1px 3px' }}>Pts</th>
            </tr>
          </thead>
          <tbody>
            {[{ name: 'Wolves', w: 4, l: 0 }, { name: 'Hawks', w: 3, l: 1 }, { name: 'Bulls', w: 2, l: 2 }, { name: 'Tigers', w: 0, l: 4 }].map((row, i) => (
              <tr key={row.name} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <td style={{ padding: '2px 3px', color: i === 0 ? '#e9c176' : 'rgba(255,255,255,0.7)', fontWeight: i === 0 ? 700 : 500 }}>{row.name}</td>
                <td style={{ padding: '2px 3px', textAlign: 'center', color: '#4ade80', fontWeight: 700 }}>{row.w}</td>
                <td style={{ padding: '2px 3px', textAlign: 'center', color: '#f87171' }}>{row.l}</td>
                <td style={{ padding: '2px 3px', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>{row.w * 2}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  },
  {
    key: '3x3 Basketball Scoreboard',
    preview: (
      <div style={{ width: '100%', padding: '8px 12px', fontFamily: 'inherit' }}>
        <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 6, padding: '8px 10px', border: '1px solid rgba(249,115,22,0.2)' }}>
          <div style={{ textAlign: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 7, color: '#f97316', fontWeight: 800, letterSpacing: '0.12em' }}>3×3</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.45)', marginBottom: 2 }}>RED</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#f87171', lineHeight: 1 }}>15</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.4)' }}>9:12</div>
              <div style={{ fontSize: 7, color: '#f59e0b', fontWeight: 700, marginTop: 2 }}>LIVE</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.45)', marginBottom: 2 }}>BLU</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#60a5fa', lineHeight: 1 }}>12</div>
            </div>
          </div>
        </div>
      </div>
    ),
  },
]

const FOOTBALL_TEMPLATES = [
  {
    key: 'Football Scoreboard Template',
    preview: (
      <div style={{ width: '100%', padding: '10px 12px', fontFamily: 'inherit' }}>
        <div style={{ background: '#0a1628', borderRadius: 8, padding: '8px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>HOME</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#16a34a', lineHeight: 1 }}>2</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 7, color: '#ef4444', fontWeight: 700 }}>1ST</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontVariantNumeric: 'tabular-nums' }}>38:00</div>
              <div style={{ display: 'flex', gap: 4, marginTop: 2, justifyContent: 'center' }}>
                <div style={{ width: 5, height: 7, background: '#facc15', borderRadius: 1 }} />
                <div style={{ width: 5, height: 7, background: '#ef4444', borderRadius: 1 }} />
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>AWAY</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#dc2626', lineHeight: 1 }}>1</div>
            </div>
          </div>
        </div>
      </div>
    ),
  },
]

const BOWLING_TEMPLATES = [
  {
    key: 'Bowling Scoreboard Template',
    preview: (
      <div style={{ width: '100%', padding: '10px 12px', fontFamily: 'inherit' }}>
        <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, overflow: 'hidden' }}>
          {[['X', '', 20], ['7', '/', 40], ['9', '-', 49]].map(([a, b, score], i) => (
            <div key={i} style={{ flex: 1, borderRight: i < 2 ? '1px solid rgba(255,255,255,0.1)' : 'none' }}>
              <div style={{ display: 'flex', height: 14 }}>
                <span style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff', borderRight: '1px solid rgba(255,255,255,0.08)' }}>{a}</span>
                <span style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff' }}>{b}</span>
              </div>
              <div style={{ height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: 9, fontWeight: 900, color: '#e9c176' }}>{score}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
]

function ScoreboardTemplatePicker({ sport, onBack, onSelect }: { sport: string; onBack: () => void; onSelect: (t: string) => void }) {
  const isFootball = sport === 'football'
  const isBowling = sport === 'bowling'
  const templates = isFootball ? FOOTBALL_TEMPLATES : isBowling ? BOWLING_TEMPLATES : BASKETBALL_TEMPLATES
  const emoji = isFootball ? '⚽' : isBowling ? '🎳' : '🏀'
  const sportLabel = isFootball ? 'Football' : isBowling ? 'Bowling' : 'Basketball'
  return (
    <div style={{ animation: 'td-in 0.25s ease both' }}>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: 13, fontFamily: 'inherit', marginBottom: 24 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Sports
      </button>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 18 }}>{emoji}</span>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{sportLabel} — Choose a Template</h2>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Pick the scoreboard layout that fits your game</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        {templates.map(t => (
          <button
            key={t.key}
            onClick={() => onSelect(t.key)}
            style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', background: 'rgba(255,255,255,0.03)', border: '1.5px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 0, cursor: 'pointer', fontFamily: 'inherit', overflow: 'hidden', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(138,21,56,0.1)'; e.currentTarget.style.borderColor = 'rgba(138,21,56,0.4)'; e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.4)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
          >
            <div style={{ height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.06)', width: '100%', overflow: 'hidden' }}>
              {t.preview}
            </div>
            <div style={{ padding: '12px 14px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>{t.key}</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Edit Tournament Form ─────────────────────────────────────────────────────
type EditPrize = { _id: string; place: string; description: string }
type EditField = { _id: string; id: string; label: string; type: string; options: string[] }

function EditTournamentForm({
  editName, setEditName, editSport, setEditSport,
  editDesc, setEditDesc, editRules, setEditRules,
  editLocation, setEditLocation, editStartDate, setEditStartDate,
  editRegDeadline, setEditRegDeadline, editMaxTeams, setEditMaxTeams,
  editPrizes, setEditPrizes, editCustomFields, setEditCustomFields,
  editError, savingEdit, onSave, onCancel,
}: {
  editName: string; setEditName: (v: string) => void
  editSport: string; setEditSport: (v: string) => void
  editDesc: string; setEditDesc: (v: string) => void
  editRules: string; setEditRules: (v: string) => void
  editLocation: string; setEditLocation: (v: string) => void
  editStartDate: string; setEditStartDate: (v: string) => void
  editRegDeadline: string; setEditRegDeadline: (v: string) => void
  editMaxTeams: string; setEditMaxTeams: (v: string) => void
  editPrizes: EditPrize[]; setEditPrizes: React.Dispatch<React.SetStateAction<EditPrize[]>>
  editCustomFields: EditField[]; setEditCustomFields: React.Dispatch<React.SetStateAction<EditField[]>>
  editError: string; savingEdit: boolean
  onSave: () => void; onCancel: () => void
}) {
  const SPORTS = ['Basketball','Football','Volleyball','Tennis','Badminton','Cricket','Swimming','Athletics','Chess','Gaming','Table Tennis','Rugby','Baseball','Hockey','Other']
  const IS = { width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, color: 'var(--text-primary)', fontSize: '13.5px', outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit' }
  const LS = { display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }

  const addPrize = () => setEditPrizes(prev => [...prev, { _id: `ep_${Date.now()}`, place: `${prev.length + 1}th Place`, description: '' }])
  const removePrize = (_id: string) => setEditPrizes(prev => prev.filter(p => p._id !== _id))
  const setPrizePlace = (_id: string, val: string) => setEditPrizes(prev => prev.map(p => p._id === _id ? { ...p, place: val } : p))
  const setPrizeDesc = (_id: string, val: string) => setEditPrizes(prev => prev.map(p => p._id === _id ? { ...p, description: val } : p))

  const addField = () => setEditCustomFields(prev => [...prev, { _id: `ef_${Date.now()}`, id: `f_${Date.now()}`, label: '', type: 'text', options: [] }])
  const removeField = (_id: string) => setEditCustomFields(prev => prev.filter(f => f._id !== _id))
  const setFieldLabel = (_id: string, val: string) => setEditCustomFields(prev => prev.map(f => f._id === _id ? { ...f, label: val } : f))
  const setFieldType = (_id: string, val: string) => setEditCustomFields(prev => prev.map(f => f._id === _id ? { ...f, type: val, options: val === 'multiple_choice' ? (f.options.length ? f.options : ['', '']) : f.options } : f))
  const addOption = (_id: string) => setEditCustomFields(prev => prev.map(f => f._id === _id ? { ...f, options: [...f.options, ''] } : f))
  const removeOption = (_id: string, oi: number) => setEditCustomFields(prev => prev.map(f => f._id === _id ? { ...f, options: f.options.filter((_, j) => j !== oi) } : f))
  const setOption = (_id: string, oi: number, val: string) => setEditCustomFields(prev => prev.map(f => f._id === _id ? { ...f, options: f.options.map((o, j) => j === oi ? val : o) } : f))

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(138,21,56,0.25)', borderRadius: 18, padding: 24 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 18 }}>Edit Tournament</div>

      {/* Basic fields grid */}
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', marginBottom: 14 }}>
        <div>
          <label style={LS}>Tournament Name *</label>
          <input value={editName} onChange={e => setEditName(e.target.value)} style={IS} />
        </div>
        <div>
          <label style={LS}>Sport</label>
          <select value={SPORTS.includes(editSport) ? editSport : 'Other'} onChange={e => setEditSport(e.target.value)} style={IS}>
            {SPORTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {!SPORTS.includes(editSport) && (
            <input value={editSport} onChange={e => setEditSport(e.target.value)} placeholder="Sport name" style={{ ...IS, marginTop: 8 }} />
          )}
        </div>
        <div>
          <label style={LS}>Location *</label>
          <input value={editLocation} onChange={e => setEditLocation(e.target.value)} style={IS} />
        </div>
        <div>
          <label style={LS}>Max Teams</label>
          <input type="number" min={2} value={editMaxTeams} onChange={e => setEditMaxTeams(e.target.value)} style={IS} />
        </div>
        <div>
          <label style={LS}>Start Date</label>
          <input type="datetime-local" value={editStartDate} onChange={e => setEditStartDate(e.target.value)} style={{ ...IS, colorScheme: 'dark' }} />
        </div>
        <div>
          <label style={LS}>Registration Deadline</label>
          <input type="datetime-local" value={editRegDeadline} onChange={e => setEditRegDeadline(e.target.value)} style={{ ...IS, colorScheme: 'dark' }} />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={LS}>About</label>
        <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3} placeholder="What's this tournament about?" style={{ ...IS, resize: 'vertical' }} />
      </div>
      <div style={{ marginBottom: 18 }}>
        <label style={LS}>Rules</label>
        <textarea value={editRules} onChange={e => setEditRules(e.target.value)} rows={4} placeholder="Tournament rules..." style={{ ...IS, resize: 'vertical' }} />
      </div>

      {/* Prizes */}
      <div style={{ marginBottom: 16, padding: 14, background: 'rgba(233,193,118,0.05)', border: '1px solid rgba(233,193,118,0.15)', borderRadius: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#e9c176' }}>🏆 Prizes</div>
          <button type="button" onClick={addPrize} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'rgba(233,193,118,0.1)', border: '1px solid rgba(233,193,118,0.3)', borderRadius: 7, color: '#e9c176', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit' }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Tier
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {editPrizes.map((prize, i) => (
            <div key={prize._id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 15, flexShrink: 0 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅'}</span>
              <input value={prize.place} onChange={e => setPrizePlace(prize._id, e.target.value)} placeholder="Place" style={{ flex: 1, padding: '7px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: 'var(--text-primary)', fontSize: '12.5px', outline: 'none', fontFamily: 'inherit', fontWeight: 600 }} />
              <input value={prize.description} onChange={e => setPrizeDesc(prize._id, e.target.value)} placeholder="Prize description" style={{ flex: 3, padding: '7px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: 'var(--text-primary)', fontSize: '12.5px', outline: 'none', fontFamily: 'inherit' }} />
              <button type="button" onClick={() => removePrize(prize._id)} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7, color: '#f87171', cursor: 'pointer', flexShrink: 0 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ))}
          {editPrizes.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>No prizes set</div>}
        </div>
      </div>

      {/* Custom registration fields */}
      <div style={{ marginBottom: 18, padding: 14, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Registration Fields</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>Questions teams answer when registering</div>
          </div>
          <button type="button" onClick={addField} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', background: 'rgba(138,21,56,0.15)', border: '1px solid rgba(138,21,56,0.3)', borderRadius: 8, color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Field
          </button>
        </div>
        {editCustomFields.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>No custom fields</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {editCustomFields.map(field => (
              <div key={field._id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input value={field.label} onChange={e => setFieldLabel(field._id, e.target.value)} placeholder="Field label" style={{ flex: 3, padding: '7px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: 'var(--text-primary)', fontSize: '13px', outline: 'none', fontFamily: 'inherit' }} />
                  <select value={field.type} onChange={e => setFieldType(field._id, e.target.value)} style={{ flex: 2, padding: '7px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: 'var(--text-primary)', fontSize: '12.5px', outline: 'none', fontFamily: 'inherit' }}>
                    <option value="text">Short Text</option>
                    <option value="number">Number</option>
                    <option value="textarea">Long Text</option>
                    <option value="multiple_choice">Multiple Choice</option>
                  </select>
                  <button type="button" onClick={() => removeField(field._id)} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 7, color: '#f87171', cursor: 'pointer', flexShrink: 0 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                  </button>
                </div>
                {field.type === 'multiple_choice' && (
                  <div style={{ marginTop: 10, paddingLeft: 10, borderLeft: '2px solid rgba(138,21,56,0.3)' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Options</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {field.options.map((opt, oi) => (
                        <div key={oi} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
                          <input value={opt} onChange={e => setOption(field._id, oi, e.target.value)} placeholder={`Option ${oi + 1}`} style={{ flex: 1, padding: '6px 9px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 7, color: 'var(--text-primary)', fontSize: '12.5px', outline: 'none', fontFamily: 'inherit' }} />
                          {field.options.length > 2 && (
                            <button type="button" onClick={() => removeOption(field._id, oi)} style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', flexShrink: 0 }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={() => addOption(field._id)} style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'none', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 7, color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11.5px', fontFamily: 'inherit' }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Add option
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {editError && <div style={{ fontSize: 13, color: '#f87171', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>{editError}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" onClick={onSave} disabled={savingEdit} style={{ flex: 2, padding: '11px', background: savingEdit ? 'rgba(138,21,56,0.4)' : 'var(--accent)', border: 'none', borderRadius: 11, color: '#fff', fontSize: 14, fontWeight: 700, cursor: savingEdit ? 'default' : 'pointer', fontFamily: 'inherit', boxShadow: savingEdit ? 'none' : '0 4px 16px rgba(138,21,56,0.35)' }}>
          {savingEdit ? 'Saving…' : 'Save Changes'}
        </button>
        <button type="button" onClick={onCancel} style={{ flex: 1, padding: '11px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 11, color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
      </div>
    </div>
  )
}

