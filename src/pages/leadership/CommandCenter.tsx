import { useState, useEffect, useRef, useCallback, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Club, Event } from '../../types'
import { filterText, validateImage } from '../../lib/contentFilter'
import ClubFormBuilder from './ClubFormBuilder'
import ClubPositions from './ClubPositions'

interface Stats {
  memberCount: number
  eventCount: number
  totalAttendees: number
  threadCount: number
  newMembersThisMonth: number
}

interface AnnouncementRow {
  id: string
  content: string | null
  image_url: string | null
  created_at: string
  profile: { full_name: string | null; role: string | null } | null
}

interface EventAnnouncementRow {
  id: string
  content: string
  created_at: string
  profile: { full_name: string | null } | null
}

interface NoteRow {
  id: string
  title: string
  content: string | null
  created_by: string
  created_at: string
  profile?: { full_name: string | null } | null
}

interface BudgetEntry {
  id: string
  type: 'income' | 'expense'
  description: string
  amount: number
  category: string | null
  entry_date: string
  created_by: string
}

interface MembershipRow {
  id: string
  user_id: string
  role: 'member' | 'officer' | 'president'
  custom_role: string | null
  permissions: string[]
  profile: { full_name: string | null; school: string | null; email: string | null } | null
}

interface TournRow {
  id: string
  name: string
  sport: string
  status: string
  format: string
  start_date: string | null
  registration_deadline: string | null
  max_teams: number
  _accepted: number
  _pending: number
}

interface AppFormField { id: string; label: string; type: string }
interface ApplicationRow {
  id: string
  user_id: string
  answers: Record<string, string>
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  profile: { full_name: string | null; school: string | null; email: string | null } | null
  form: { fields: AppFormField[] } | null
}

const PRIVILEGES = [
  { key: 'remove_members',     label: 'Remove Members',     icon: '🚫', desc: 'Remove members from the club',        group: 'Team'    },
  { key: 'accept_members',     label: 'Accept Requests',    icon: '✅', desc: 'Approve pending join requests',       group: 'Team'    },
  { key: 'post_announcements', label: 'Announcements',      icon: '📢', desc: 'Post club-wide announcements',        group: 'Content' },
  { key: 'manage_notes',       label: 'Meeting Notes',      icon: '📝', desc: 'Create and manage meeting notes',     group: 'Content' },
  { key: 'manage_events',      label: 'Manage Events',      icon: '📅', desc: 'Create, edit and go-live events',     group: 'Events'  },
  { key: 'edit_appearance',    label: 'Edit Appearance',    icon: '🖼', desc: 'Update logo, banner & club info',     group: 'Club'    },
  { key: 'manage_budget',      label: 'Budget Tracker',     icon: '💰', desc: 'Track income and expenses',           group: 'Finance' },
] as const

const PRIVILEGE_GROUPS = ['Team', 'Content', 'Events', 'Club', 'Finance'] as const

interface ProfileSearchRow {
  id: string
  full_name: string | null
  school: string | null
  email: string | null
}

interface Props {
  club: Club
  onDeleted?: () => void
  onPresidencyTransferred?: () => void
  userPermissions?: string[]
  clubSwitcher?: React.ReactNode
}

export default function CommandCenter({ club, onDeleted, userPermissions, clubSwitcher }: Props) {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const isPresident = userPermissions === undefined
  const canDo = (perm: string) => isPresident || (userPermissions ?? []).includes(perm)
  const [stats, setStats] = useState<Stats>({ memberCount: 0, eventCount: 0, totalAttendees: 0, threadCount: 0, newMembersThisMonth: 0 })
  const [events, setEvents] = useState<Event[]>([])
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([])
  const [showEventForm, setShowEventForm] = useState(false)
  const [loadingStats, setLoadingStats] = useState(true)

  // Team management state
  const [teamMembers, setTeamMembers] = useState<MembershipRow[]>([])
  const [memberSearch, setMemberSearch] = useState('')
  const [searchProfiles, setSearchProfiles] = useState<ProfileSearchRow[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Event form state
  const [evTitle, setEvTitle] = useState('')
  const [evDesc, setEvDesc] = useState('')
  const [evLocation, setEvLocation] = useState('')
  const [evStart, setEvStart] = useState('')
  const [evPoints, setEvPoints] = useState('10')
  const [evCategory, setEvCategory] = useState('')
  const [creatingEvent, setCreatingEvent] = useState(false)
  const [eventError, setEventError] = useState('')

  // Certificate state
  const [certEvent, setCertEvent] = useState<Event | null>(null)
  // QR state
  const [qrEvent, setQrEvent] = useState<Event | null>(null)

  // Announcement state
  const [annContent, setAnnContent] = useState('')
  const [postingAnn, setPostingAnn] = useState(false)
  const [annError, setAnnError] = useState('')
  const [annImageFile, setAnnImageFile] = useState<File | null>(null)
  const [annImagePreview, setAnnImagePreview] = useState<string | null>(null)
  const annImgRef = useRef<HTMLInputElement>(null)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  // AI state
  const [showAnnAI, setShowAnnAI] = useState(false)
  const [annAiPrompt, setAnnAiPrompt] = useState('')
  const [annAiLoading, setAnnAiLoading] = useState(false)
  const [annAiResult, setAnnAiResult] = useState('')

  // Club appearance state
  const [logoPreview, setLogoPreview] = useState<string | null>(club.logo_url ?? null)
  const [bannerPreview, setBannerPreview] = useState<string | null>(club.banner_url ?? null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [appearanceMsg, setAppearanceMsg] = useState('')
  const [bannerCropFile, setBannerCropFile] = useState<File | null>(null)
  const logoRef = useRef<HTMLInputElement>(null)
  const bannerRef = useRef<HTMLInputElement>(null)

  // Event-specific announcement state
  const [evtAnnEvent, setEvtAnnEvent] = useState<Event | null>(null)
  const [evtAnnContent, setEvtAnnContent] = useState('')
  const [postingEvtAnn, setPostingEvtAnn] = useState(false)
  const [evtAnnouncements, setEvtAnnouncements] = useState<EventAnnouncementRow[]>([])

  // Transfer presidency state
  const [transferSuccess, setTransferSuccess] = useState(false)

  // Delete club state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [deletingClub, setDeletingClub] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Meeting notes state
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [noteTitle, setNoteTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [expandedNote, setExpandedNote] = useState<string | null>(null)

  // Budget state
  const [budgetEntries, setBudgetEntries] = useState<BudgetEntry[]>([])
  const [budgetType, setBudgetType] = useState<'income' | 'expense'>('expense')
  const [budgetDesc, setBudgetDesc] = useState('')
  const [budgetAmount, setBudgetAmount] = useState('')
  const [budgetCategory, setBudgetCategory] = useState('')
  const [budgetDate, setBudgetDate] = useState(new Date().toISOString().split('T')[0])
  const [savingBudget, setSavingBudget] = useState(false)
  const [showBudgetForm, setShowBudgetForm] = useState(false)
  const [budgetFilter, setBudgetFilter] = useState<'all' | 'income' | 'expense'>('all')

  // Analytics state
  interface MonthlyJoin { month: string; label: string; count: number }
  const [monthlyJoins, setMonthlyJoins] = useState<MonthlyJoin[]>([])
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)

  // Applications state
  const [applications, setApplications] = useState<ApplicationRow[]>([])
  const [loadingApps, setLoadingApps] = useState(false)
  const [appActionLoading, setAppActionLoading] = useState<string | null>(null)
  const [expandedApp, setExpandedApp] = useState<string | null>(null)

  // Tournaments state
  const [tournaments, setTournaments] = useState<TournRow[]>([])
  const [loadingTournaments, setLoadingTournaments] = useState(false)
  const [showTournamentForm, setShowTournamentForm] = useState(false)
  const [deleteTournamentConfirmId, setDeleteTournamentConfirmId] = useState<string | null>(null)
  const [deletingTournamentId, setDeletingTournamentId] = useState<string | null>(null)
  const tourType = 'bracket' as const
  const [tourName, setTourName] = useState('')
  const [tourSport, setTourSport] = useState('Basketball')
  const [tourDesc, setTourDesc] = useState('')
  const [tourRules, setTourRules] = useState('')
  const [tourLocation, setTourLocation] = useState('')
  const [tourRegDeadline, setTourRegDeadline] = useState('')
  const [tourStartDate, setTourStartDate] = useState('')
  const [tourMaxTeams, setTourMaxTeams] = useState('16')
  const [tourPrizes, setTourPrizes] = useState<Array<{ place: string; description: string }>>([
    { place: '1st Place', description: '' },
    { place: '2nd Place', description: '' },
    { place: '3rd Place', description: '' },
  ])
  const [creatingTournament, setCreatingTournament] = useState(false)
  const [tournamentError, setTournamentError] = useState('')
  const [tourCustomSport, setTourCustomSport] = useState('')
  const [tourCustomFields, setTourCustomFields] = useState<Array<{ id: string; label: string; type: string; options: string[] }>>([])
  const [tourLogoFile, setTourLogoFile] = useState<File | null>(null)
  const [tourLogoPreview, setTourLogoPreview] = useState<string | null>(null)
  const tourLogoRef = useRef<HTMLInputElement>(null)


  useEffect(() => { fetchAll() }, [club.id])

  // Live attendee count — increments the matching event when anyone checks in via QR
  useEffect(() => {
    const channel = supabase
      .channel(`cmd-attendees-${club.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'event_attendees' },
        payload => {
          const eventId = payload.new.event_id as string
          setEvents(prev =>
            prev.map(e => e.id === eventId ? { ...e, attendee_count: e.attendee_count + 1 } : e)
          )
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [club.id])

  async function fetchAll() {
    setLoadingStats(true)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const [membersRes, eventsRes, threadsRes, newMembersRes, annRes, teamRes] = await Promise.all([
      supabase.from('club_memberships').select('id', { count: 'exact' }).eq('club_id', club.id),
      supabase.from('events').select('*').eq('club_id', club.id).order('created_at', { ascending: false }),
      supabase.from('club_threads').select('id', { count: 'exact' }).eq('club_id', club.id),
      supabase.from('club_memberships').select('id', { count: 'exact' }).eq('club_id', club.id).gte('joined_at', thirtyDaysAgo.toISOString()),
      supabase.from('club_announcements')
        .select('id, content, created_at, profile:profiles(full_name, role)')
        .eq('club_id', club.id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('club_memberships')
        .select('id, user_id, role, custom_role, permissions, profile:profiles(full_name, school, email)')
        .eq('club_id', club.id)
        .order('joined_at', { ascending: true }),
    ])

    const memberCount = membersRes.count ?? 0
    const evList = eventsRes.data ?? []
    const eventIds = evList.map(e => e.id)

    // Count real check-ins from event_attendees (not the stale attendee_count column)
    const { data: attendeeRows } = eventIds.length > 0
      ? await supabase.from('event_attendees').select('event_id').in('event_id', eventIds)
      : { data: [] as { event_id: string }[] }

    const countByEvent = (attendeeRows ?? []).reduce<Record<string, number>>((acc, r) => {
      acc[r.event_id] = (acc[r.event_id] ?? 0) + 1
      return acc
    }, {})

    const evListWithCounts = evList.map(e => ({ ...e, attendee_count: countByEvent[e.id] ?? 0 }))
    const totalAttendees = evListWithCounts.reduce((sum, e) => sum + e.attendee_count, 0)

    setStats({
      memberCount,
      eventCount: evList.length,
      totalAttendees,
      threadCount: threadsRes.count ?? 0,
      newMembersThisMonth: newMembersRes.count ?? 0,
    })
    setEvents(evListWithCounts)
    setAnnouncements((annRes.data as unknown as AnnouncementRow[]) ?? [])
    setTeamMembers((teamRes.data as unknown as MembershipRow[]) ?? [])
    setLoadingStats(false)
    // Also keep app badge count fresh
    fetchApplications()
  }

  async function fetchTournaments() {
    setLoadingTournaments(true)
    const { data } = await supabase
      .from('tournaments')
      .select('id, name, sport, status, format, start_date, registration_deadline, max_teams')
      .eq('club_id', club.id)
      .order('created_at', { ascending: false })
    if (data) {
      const ids = data.map((t: { id: string }) => t.id)
      const { data: teamData } = await supabase
        .from('tournament_teams')
        .select('tournament_id, status')
        .in('tournament_id', ids)
      const acceptedMap: Record<string, number> = {}
      const pendingMap: Record<string, number> = {}
      for (const t of teamData ?? []) {
        if (t.status === 'accepted') acceptedMap[t.tournament_id] = (acceptedMap[t.tournament_id] ?? 0) + 1
        if (t.status === 'pending') pendingMap[t.tournament_id] = (pendingMap[t.tournament_id] ?? 0) + 1
      }
      setTournaments((data as any[]).map(t => ({ ...t, _accepted: acceptedMap[t.id] ?? 0, _pending: pendingMap[t.id] ?? 0 })))
    }
    setLoadingTournaments(false)
  }

  async function deleteTournament(id: string) {
    setDeletingTournamentId(id)
    await supabase.from('tournaments').delete().eq('id', id)
    setTournaments(prev => prev.filter(t => t.id !== id))
    setDeleteTournamentConfirmId(null)
    setDeletingTournamentId(null)
  }

  async function createTournament() {
    const sportName = tourSport === 'Other' ? tourCustomSport.trim() : tourSport
    if (!tourName.trim() || !sportName) { setTournamentError('Name and sport are required'); return }
    if (!tourLocation.trim()) { setTournamentError('Location is required'); return }
    setCreatingTournament(true)
    setTournamentError('')
    let tournamentLogoUrl: string | null = null
    if (tourLogoFile) {
      const ext = tourLogoFile.name.split('.').pop() ?? 'jpg'
      const path = `tournaments/${club.id}/${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('tournament-logos').upload(path, tourLogoFile)
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('tournament-logos').getPublicUrl(path)
        tournamentLogoUrl = urlData.publicUrl
      }
    }
    const filledPrizes = tourPrizes.filter(p => p.description.trim())
    const { error } = await supabase.from('tournaments').insert({
      club_id: club.id,
      created_by: user!.id,
      name: tourName.trim(),
      sport: sportName,
      description: tourDesc.trim() || null,
      rules: tourRules.trim() || null,
      location: tourLocation.trim(),
      registration_deadline: tourRegDeadline || null,
      start_date: tourStartDate || null,
      max_teams: parseInt(tourMaxTeams) || 16,
      format: 'single_elimination',
      type: tourType,
      logo_url: tournamentLogoUrl,
      prizes: filledPrizes.length > 0 ? filledPrizes : null,
      registration_fields: tourCustomFields.filter(f => f.label.trim()).map(f => ({ id: f.id, label: f.label.trim(), type: f.type, options: f.options })),
    })
    setCreatingTournament(false)
    if (error) { setTournamentError(error.message); return }
    setTourName(''); setTourSport('Basketball'); setTourDesc(''); setTourRules('')
    setTourLocation(''); setTourRegDeadline(''); setTourStartDate(''); setTourMaxTeams('16')
    setTourPrizes([{ place: '1st Place', description: '' }, { place: '2nd Place', description: '' }, { place: '3rd Place', description: '' }])
    setTourCustomSport(''); setTourCustomFields([])
    setTourLogoFile(null); setTourLogoPreview(null)
    setShowTournamentForm(false)
    fetchTournaments()
  }

  async function fetchApplications() {
    setLoadingApps(true)
    const { data } = await supabase
      .from('club_form_responses')
      .select('id, user_id, answers, status, created_at, profile:profiles(full_name, school, email), form:club_forms(fields)')
      .eq('club_id', club.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setApplications((data as unknown as ApplicationRow[]) ?? [])
    setLoadingApps(false)
  }

  async function handleAcceptApplication(appId: string, userId: string) {
    setAppActionLoading(appId)
    // Insert membership — ignore conflict if already a member
    await supabase.from('club_memberships').upsert({ club_id: club.id, user_id: userId }, { onConflict: 'club_id,user_id', ignoreDuplicates: true })
    // Award Karak points
    await supabase.from('karak_transactions').insert({ user_id: userId, points: 5, reason: `Joined club: ${club.name}` })
    // Increment member count
    await supabase.from('clubs').update({ member_count: club.member_count + 1 }).eq('id', club.id)
    // Mark response approved
    await supabase.from('club_form_responses').update({ status: 'approved' }).eq('id', appId)
    setApplications(prev => prev.filter(a => a.id !== appId))
    setAppActionLoading(null)
    fetchAll()
  }

  async function handleRejectApplication(appId: string) {
    setAppActionLoading(appId)
    await supabase.from('club_form_responses').update({ status: 'rejected' }).eq('id', appId)
    setApplications(prev => prev.filter(a => a.id !== appId))
    setAppActionLoading(null)
  }

  async function handleMessageApplicant(userId: string, name: string | null) {
    if (!user) return
    // Find existing conversation or create one
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(participant_1.eq.${user.id},participant_2.eq.${userId}),and(participant_1.eq.${userId},participant_2.eq.${user.id})`)
      .eq('type', 'dm')
      .maybeSingle()
    let convId = existing?.id
    if (!convId) {
      const { data: created } = await supabase
        .from('conversations')
        .insert({ participant_1: user.id, participant_2: userId, type: 'dm' })
        .select('id')
        .single()
      convId = created?.id
    }
    if (!convId) return
    navigate('/messages', { state: { dmConvId: convId, dmOtherId: userId, dmOtherName: name } })
  }

  async function handleCreateEvent(e: FormEvent) {
    e.preventDefault()
    setEventError('')
    const textCheck = filterText(evTitle, evDesc, evLocation, evCategory)
    if (!textCheck.ok) { setEventError(textCheck.reason!); return }
    setCreatingEvent(true)

    const { error } = await supabase.from('events').insert({
      club_id: club.id,
      title: evTitle,
      description: evDesc || null,
      location: evLocation || null,
      start_time: evStart || null,
      karak_points_reward: parseInt(evPoints) || 10,
      category: evCategory || null,
      university_id: club.university_id,
    })

    if (error) {
      setEventError(error.message)
    } else {
      setEvTitle(''); setEvDesc(''); setEvLocation(''); setEvStart(''); setEvPoints('10'); setEvCategory('')
      setShowEventForm(false)
      fetchAll()
    }
    setCreatingEvent(false)
  }

  async function toggleLive(event: Event) {
    await supabase.from('events').update({ is_live: !event.is_live }).eq('id', event.id)
    fetchAll()
  }

  function handleAnnImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAnnImageFile(file)
    const reader = new FileReader()
    reader.onload = () => setAnnImagePreview(reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function clearAnnImage() {
    setAnnImageFile(null)
    setAnnImagePreview(null)
  }

  async function generateAnnAI(mode?: 'improve', instruction?: string) {
    if (annAiLoading) return
    setAnnAiLoading(true)
    setAnnAiResult('')
    const prompt = instruction ?? annAiPrompt.trim()
    const { data, error } = await supabase.functions.invoke('ai-write', {
      body: {
        prompt,
        draft: (mode === 'improve' || !prompt) ? annContent.trim() : '',
      },
    })
    setAnnAiLoading(false)
    if (error || !data?.text) { setAnnAiResult('Could not generate — please try again.'); return }
    setAnnAiResult(data.text)
  }

  async function handlePostAnnouncement() {
    if (!user || (!annContent.trim() && !annImageFile)) return
    if (annContent.trim()) {
      const check = filterText(annContent)
      if (!check.ok) { setAnnError(check.reason!); return }
    }
    if (annImageFile) {
      const imgCheck = validateImage(annImageFile)
      if (!imgCheck.ok) { setAnnError(imgCheck.reason!); return }
    }
    setAnnError('')
    setPostingAnn(true)

    let imageUrl: string | null = null
    if (annImageFile) {
      const ext = annImageFile.name.split('.').pop() ?? 'jpg'
      const path = `announcement-images/${club.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('clubs')
        .upload(path, annImageFile, { upsert: true })
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('clubs').getPublicUrl(path)
        imageUrl = urlData.publicUrl
      }
    }

    await supabase.from('club_announcements').insert({
      club_id: club.id,
      user_id: user.id,
      content: annContent.trim() || null,
      image_url: imageUrl,
    })
    // Fire-and-forget email to all members
    supabase.functions.invoke('send-announcement-email', {
      body: {
        clubId: club.id,
        clubName: club.name,
        content: annContent.trim() || '[image]',
        posterName: profile?.full_name ?? 'Club Admin',
      },
    }).catch(() => {})
    setAnnContent('')
    clearAnnImage()
    setPostingAnn(false)
    fetchAll()
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (!file.type.startsWith('image/')) { setAppearanceMsg('Please select an image file.'); return }
    if (file.size > 5 * 1024 * 1024) { setAppearanceMsg('Image must be under 5 MB.'); return }
    setUploadingLogo(true)
    setAppearanceMsg('')
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `logos/${club.id}.${ext}`
    const { error: upErr } = await supabase.storage.from('clubs').upload(path, file, { upsert: true })
    if (upErr) { setAppearanceMsg('Upload failed: ' + upErr.message); setUploadingLogo(false); return }
    const { data: urlData } = supabase.storage.from('clubs').getPublicUrl(path)
    const url = urlData.publicUrl + `?t=${Date.now()}`
    await supabase.from('clubs').update({ logo_url: urlData.publicUrl }).eq('id', club.id)
    setLogoPreview(url)
    setAppearanceMsg('Logo saved!')
    setUploadingLogo(false)
  }

  function handleBannerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (!file.type.startsWith('image/')) { setAppearanceMsg('Please select an image file.'); return }
    if (file.size > 20 * 1024 * 1024) { setAppearanceMsg('Banner must be under 20 MB.'); return }
    setAppearanceMsg('')
    setBannerCropFile(file)
  }

  async function handleBannerCropSave(blob: Blob) {
    setUploadingBanner(true)
    setAppearanceMsg('')
    setBannerCropFile(null)
    const path = `banners/${club.id}.jpg`
    const { error: upErr } = await supabase.storage.from('clubs').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
    if (upErr) { setAppearanceMsg('Upload failed: ' + upErr.message); setUploadingBanner(false); return }
    const { data: urlData } = supabase.storage.from('clubs').getPublicUrl(path)
    const url = urlData.publicUrl + `?t=${Date.now()}`
    await supabase.from('clubs').update({ banner_url: urlData.publicUrl }).eq('id', club.id)
    setBannerPreview(url)
    setAppearanceMsg('Banner saved!')
    setUploadingBanner(false)
  }

  async function fetchEventAnnouncements(eventId: string) {
    const { data } = await supabase
      .from('event_announcements')
      .select('id, content, created_at, profile:profiles(full_name)')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(30)
    setEvtAnnouncements((data as unknown as EventAnnouncementRow[]) ?? [])
  }

  async function handleOpenEventAnn(event: Event) {
    setEvtAnnEvent(event)
    setEvtAnnContent('')
    await fetchEventAnnouncements(event.id)
  }

  async function handlePostEventAnn() {
    if (!user || !evtAnnEvent || !evtAnnContent.trim()) return
    const check = filterText(evtAnnContent)
    if (!check.ok) { alert(check.reason); return }
    setPostingEvtAnn(true)
    await supabase.from('event_announcements').insert({
      event_id: evtAnnEvent.id,
      club_id: club.id,
      user_id: user.id,
      content: evtAnnContent.trim(),
    })
    setEvtAnnContent('')
    setPostingEvtAnn(false)
    fetchEventAnnouncements(evtAnnEvent.id)
  }

  // Debounced profile search
  useEffect(() => {
    if (!memberSearch.trim()) { setSearchProfiles([]); setSearchLoading(false); return }
    setSearchLoading(true)
    const t = setTimeout(async () => {
      const term = memberSearch.trim()
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, school, email')
        .or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
        .limit(8)
      setSearchProfiles((data as ProfileSearchRow[]) ?? [])
      setSearchLoading(false)
    }, 280)
    return () => clearTimeout(t)
  }, [memberSearch])

  async function handleAddMember(userId: string, role: 'officer' | 'member', customRole?: string) {
    setActionLoading(userId)
    await supabase.from('club_memberships').insert({
      club_id: club.id, user_id: userId, role,
      custom_role: customRole ?? null,
    })
    setMemberSearch('')
    setSearchProfiles([])
    fetchAll()
    setActionLoading(null)
  }

  async function handleRoleChange(membershipId: string, newRole: 'officer' | 'member', customRole?: string) {
    setActionLoading(membershipId)
    const updates: Record<string, unknown> = { role: newRole, custom_role: customRole ?? null }
    if (!customRole) updates.permissions = []
    await supabase.from('club_memberships').update(updates).eq('id', membershipId)
    setTeamMembers(prev => prev.map(m => m.id === membershipId ? { ...m, role: newRole, custom_role: customRole ?? null, permissions: customRole ? m.permissions : [] } : m))
    setActionLoading(null)
  }

  async function handlePermissionsChange(membershipId: string, permissions: string[]) {
    setTeamMembers(prev => prev.map(m => m.id === membershipId ? { ...m, permissions } : m))
    await supabase.from('club_memberships').update({ permissions }).eq('id', membershipId)
  }

  async function handleRemoveMember(membershipId: string) {
    setActionLoading(membershipId)
    await supabase.from('club_memberships').delete().eq('id', membershipId)
    setTeamMembers(prev => prev.filter(m => m.id !== membershipId))
    fetchAll()
    setActionLoading(null)
  }

  async function handleDemotePresident(membershipId: string) {
    setActionLoading(membershipId)
    await supabase.rpc('demote_from_president', { p_club_id: club.id, p_membership_id: membershipId })
    setActionLoading(null)
    fetchAll()
  }

  async function handleMakeCoPresident(membershipId: string) {
    setActionLoading(membershipId)
    const { error } = await supabase.rpc('promote_to_president', {
      p_club_id: club.id,
      p_membership_id: membershipId,
    })
    setActionLoading(null)
    if (error) return
    setTransferSuccess(true)
    setTimeout(() => setTransferSuccess(false), 3000)
    fetchAll()
  }

  async function handleDeleteClub() {
    if (deleteConfirmName.trim() !== club.name) return
    setDeletingClub(true)
    setDeleteError('')
    const { error } = await supabase.from('clubs').delete().eq('id', club.id)
    if (error) {
      setDeleteError('Failed to delete club. Please try again.')
      setDeletingClub(false)
      return
    }
    onDeleted?.()
  }

  async function fetchNotes() {
    const { data } = await supabase
      .from('club_meeting_notes')
      .select('id, title, content, created_by, created_at, profile:profiles!created_by(full_name)')
      .eq('club_id', club.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setNotes((data as unknown as NoteRow[]) ?? [])
  }

  async function handleSaveNote() {
    if (!user || !noteTitle.trim()) return
    setSavingNote(true)
    await supabase.from('club_meeting_notes').insert({ club_id: club.id, title: noteTitle.trim(), content: noteContent.trim() || null, created_by: user.id })
    setNoteTitle(''); setNoteContent(''); setShowNoteForm(false); setSavingNote(false)
    fetchNotes()
  }

  async function handleDeleteNote(noteId: string) {
    await supabase.from('club_meeting_notes').delete().eq('id', noteId)
    setNotes(prev => prev.filter(n => n.id !== noteId))
  }

  async function fetchBudget() {
    const { data } = await supabase
      .from('club_budget_entries')
      .select('id, type, description, amount, category, entry_date, created_by')
      .eq('club_id', club.id)
      .order('entry_date', { ascending: false })
      .limit(100)
    setBudgetEntries((data as unknown as BudgetEntry[]) ?? [])
  }

  async function handleSaveBudget() {
    if (!user || !budgetDesc.trim() || !budgetAmount) return
    setSavingBudget(true)
    await supabase.from('club_budget_entries').insert({ club_id: club.id, type: budgetType, description: budgetDesc.trim(), amount: parseFloat(budgetAmount), category: budgetCategory.trim() || null, entry_date: budgetDate, created_by: user.id })
    setBudgetDesc(''); setBudgetAmount(''); setBudgetCategory(''); setShowBudgetForm(false); setSavingBudget(false)
    fetchBudget()
  }

  async function handleDeleteBudgetEntry(id: string) {
    await supabase.from('club_budget_entries').delete().eq('id', id)
    setBudgetEntries(prev => prev.filter(e => e.id !== id))
  }

  const defaultTab = isPresident || canDo('manage_events') ? 'events'
    : canDo('post_announcements') ? 'announcements'
    : canDo('remove_members') || canDo('accept_members') ? 'team'
    : canDo('edit_appearance') ? 'settings'
    : 'events'
  const [activeTab, setActiveTab] = useState<string>(defaultTab)

  async function fetchAnalytics() {
    setLoadingAnalytics(true)
    const months: MonthlyJoin[] = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const start = d.toISOString()
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString()
      const { count } = await supabase
        .from('club_memberships')
        .select('id', { count: 'exact', head: true })
        .eq('club_id', club.id)
        .gte('joined_at', start)
        .lt('joined_at', end)
      months.push({
        month: start,
        label: d.toLocaleString('default', { month: 'short' }),
        count: count ?? 0,
      })
    }
    setMonthlyJoins(months)
    setLoadingAnalytics(false)
  }

  useEffect(() => {
    if (activeTab === 'notes') fetchNotes()
    if (activeTab === 'budget') fetchBudget()
    if (activeTab === 'analytics') fetchAnalytics()
    if (activeTab === 'applications') fetchApplications()
    if (activeTab === 'tournaments') fetchTournaments()
  }, [activeTab, club.id])

  const avgAttendees = stats.eventCount > 0 ? (stats.totalAttendees / stats.eventCount).toFixed(1) : '—'
  const liveCount = events.filter(e => e.is_live).length

  const statCard = (label: string, value: string | number, sub?: string, accentColor?: string) => (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${accentColor ? `${accentColor}28` : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 14,
      padding: '20px 22px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {accentColor && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: accentColor, opacity: 0.55 }} />
      )}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 36, fontWeight: 700, color: accentColor ?? 'var(--text-primary)', letterSpacing: '-1px', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{sub}</div>}
    </div>
  )

  const TABS = [
    { key: 'events',        label: 'Events',        badge: events.length,        visible: isPresident || canDo('manage_events') },
    { key: 'tournaments',   label: 'Tournaments',   badge: tournaments.reduce((s, t) => s + t._pending, 0) || null, badgeColor: tournaments.some(t => t._pending > 0) ? '#f87171' : undefined, visible: isPresident || canDo('manage_events') },
    { key: 'team',          label: 'Team',           badge: teamMembers.length,   visible: isPresident || canDo('remove_members') || canDo('accept_members') },
    { key: 'applications',  label: 'Applications',   badge: applications.length,  visible: isPresident || canDo('accept_members'), badgeColor: applications.length > 0 ? '#f87171' : undefined },
    { key: 'announcements', label: 'Announcements',  badge: announcements.length, visible: isPresident || canDo('post_announcements') },
    { key: 'positions',     label: 'Positions',      badge: null,                 visible: isPresident },
    { key: 'analytics',     label: 'Analytics',      badge: null,                 visible: isPresident },
    { key: 'notes',         label: 'Notes',          badge: null,                 visible: isPresident || canDo('post_announcements') || canDo('manage_notes') },
    { key: 'budget',        label: 'Budget',         badge: null,                 visible: isPresident || canDo('manage_budget') },
    { key: 'settings',      label: 'Settings',       badge: null,                 visible: isPresident || canDo('edit_appearance') },
  ].filter(t => t.visible)

  return (
    <div className="page-content" style={{ maxWidth: 1100 }}>
      <style>{`
        @keyframes cc-pop { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .cc-panel { animation: cc-pop 0.25s cubic-bezier(0.22,1,0.36,1) both; }
        .cc-tab { font-family:inherit; cursor:pointer; transition:all 0.18s; border:none; }
        .cc-tab:hover { color:var(--text-primary) !important; }
        .cc-tabs { display:flex; gap:3px; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.07); border-radius:14px; padding:4px; margin-bottom:20px; }
        @media(max-width:640px) {
          .cc-tabs { overflow-x:auto; -webkit-overflow-scrolling:touch; scrollbar-width:none; border-radius:12px; }
          .cc-tabs::-webkit-scrollbar { display:none; }
          .cc-tab { flex:0 0 auto !important; padding:9px 14px !important; font-size:12px !important; white-space:nowrap; }
        }
        @keyframes cc-toast { from{opacity:0;transform:translateY(12px) scale(.97)} to{opacity:1;transform:none} }
      `}</style>

      {/* ── Presidency transfer success toast ── */}
      {transferSuccess && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(22,163,74,0.18)', border: '1px solid rgba(22,163,74,0.45)',
          backdropFilter: 'blur(12px)', borderRadius: 14,
          padding: '14px 24px', color: '#4ade80', fontSize: 14, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 10,
          zIndex: 9999, animation: 'cc-toast .25s cubic-bezier(.22,1,.36,1) both',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          whiteSpace: 'nowrap',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Co-president added!
        </div>
      )}

      {/* ── Club switcher (injected by LeadershipPage when user has access to multiple clubs) ── */}
      {clubSwitcher}

      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:28, flexWrap:'wrap', gap:16 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
            <h1 style={{ fontSize:30, fontWeight:700, color:'var(--text-primary)', letterSpacing:'-0.3px' }}>
              {club.name}
            </h1>
            {club.is_verified && (
              <span style={{ background:'rgba(233,193,118,0.15)', border:'1px solid rgba(233,193,118,0.4)', borderRadius:9999, padding:'3px 10px', fontSize:11, fontWeight:700, color:'var(--gold)', letterSpacing:'0.05em' }}>
                ✓ VERIFIED
              </span>
            )}
          </div>
          <p style={{ fontSize:14, color:'var(--text-muted)' }}>{isPresident ? "Manage your organization's legacy, reach, and standing." : `You have limited access to ${club.name}.`}</p>
        </div>
        {(isPresident || canDo('manage_events')) && (
          <button
            onClick={() => { setActiveTab('events'); setShowEventForm(v => !v) }}
            style={{ background:'var(--accent)', border:'none', borderRadius:10, padding:'11px 22px', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', boxShadow:'0 0 20px rgba(138,21,56,0.3)', fontFamily:'inherit' }}
          >
            {showEventForm ? '✕ Cancel' : '+ Create Event'}
          </button>
        )}
      </div>

      {/* ── Stats (untouched) ── */}
      {loadingStats ? (
        <div style={{ color:'var(--text-muted)', marginBottom:28 }}>Loading stats…</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:14, marginBottom:24 }}>
          {statCard('Members', stats.memberCount, 'Total enrolled')}
          {statCard('Events', stats.eventCount, 'All time')}
          {statCard('Total Attendees', stats.totalAttendees, 'Across all events')}
          {statCard('Avg Attendance', avgAttendees, 'Per event', '#0ea5e9')}
          {statCard('Community Threads', stats.threadCount, 'Active discussions', '#a855f7')}
          {statCard('Joined This Month', stats.newMembersThisMonth, 'Last 30 days', '#22c55e')}
        </div>
      )}

      {/* ── Live banner ── */}
      {liveCount > 0 && (
        <div style={{ background:'rgba(255,180,171,0.07)', border:'1px solid rgba(255,180,171,0.22)', borderRadius:11, padding:'11px 18px', marginBottom:18, display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:11, fontWeight:700, color:'var(--live-red)', letterSpacing:'0.1em' }}>● LIVE</span>
          <span style={{ fontSize:13, color:'var(--text-secondary)' }}>
            {liveCount} event{liveCount !== 1 ? 's' : ''} currently live — members can check in now
          </span>
        </div>
      )}

      {/* ── Tab bar ── */}
      <div className="cc-tabs">
        {TABS.map(t => (
          <button key={t.key} className="cc-tab" onClick={() => setActiveTab(t.key)} style={{
            flex:1, padding:'9px 10px', borderRadius:11, fontSize:13,
            fontWeight: activeTab === t.key ? 700 : 500,
            color: activeTab === t.key ? '#fff' : 'var(--text-muted)',
            background: activeTab === t.key ? 'rgba(138,21,56,0.22)' : 'transparent',
            border: activeTab === t.key ? '1px solid rgba(138,21,56,0.32)' : '1px solid transparent',
            display:'flex', alignItems:'center', justifyContent:'center', gap:6,
            position: 'relative',
          }}>
            {t.label}
            {t.badge !== null && t.badge > 0 && (
              <span style={{
                fontSize:11, fontWeight:700, padding:'1px 7px', borderRadius:99, minWidth:18,
                background: (t as any).badgeColor
                  ? `${(t as any).badgeColor}22`
                  : activeTab === t.key ? 'rgba(138,21,56,0.35)' : 'rgba(255,255,255,0.07)',
                color: (t as any).badgeColor ?? (activeTab === t.key ? '#f08' : 'var(--text-muted)'),
                border: (t as any).badgeColor && activeTab !== t.key ? `1px solid ${(t as any).badgeColor}44` : 'none',
                transition:'all 0.18s',
              }}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Events tab ── */}
      {activeTab === 'events' && (
        <div key="events" className="cc-panel">
          {/* Create event form */}
          {showEventForm && (
            <div style={{ background:'rgba(41,28,30,0.6)', border:'1px solid rgba(138,21,56,0.3)', borderRadius:16, padding:'24px 24px', marginBottom:20 }}>
              <h3 style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)', marginBottom:20 }}>New Event</h3>
              <form onSubmit={handleCreateEvent}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                  <FormField label="Event Title"><input required value={evTitle} onChange={e => setEvTitle(e.target.value)} placeholder="Event name" style={fi} /></FormField>
                  <FormField label="Category"><input value={evCategory} onChange={e => setEvCategory(e.target.value)} placeholder="e.g. Workshop, Social" style={fi} /></FormField>
                  <FormField label="Location"><input value={evLocation} onChange={e => setEvLocation(e.target.value)} placeholder="Venue or link" style={fi} /></FormField>
                  <FormField label="Start Time"><input type="datetime-local" value={evStart} onChange={e => setEvStart(e.target.value)} style={fi} /></FormField>
                  <FormField label="Karak Points Reward"><input type="number" min="0" value={evPoints} onChange={e => setEvPoints(e.target.value)} style={fi} /></FormField>
                </div>
                <FormField label="Description">
                  <textarea value={evDesc} onChange={e => setEvDesc(e.target.value)} placeholder="What's happening?" rows={3} style={{ ...fi, resize:'vertical' }} />
                </FormField>
                {eventError && <p style={{ color:'#ff6b6b', fontSize:12, margin:'8px 0' }}>{eventError}</p>}
                <div style={{ marginTop:16, display:'flex', justifyContent:'flex-end' }}>
                  <button type="submit" disabled={creatingEvent} style={{ background:'var(--accent)', border:'none', borderRadius:10, padding:'10px 28px', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', opacity:creatingEvent?0.7:1, fontFamily:'inherit' }}>
                    {creatingEvent ? 'Creating…' : 'Create Event'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Events list */}
          <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16, padding:24 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
              <h2 style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)' }}>All Events</h2>
              <span style={{ fontSize:11, color:'var(--text-muted)' }}>{events.length} total</span>
            </div>
            {events.length === 0 ? (
              <p style={{ color:'var(--text-muted)', fontSize:13 }}>No events yet. Hit "+ Create Event" to add your first one.</p>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {events.map(ev => {
                  const isCompleted = !ev.is_live && !!ev.start_time && new Date(ev.start_time) < new Date()
                  return (
                    <div key={ev.id} style={{ background:'rgba(255,255,255,0.03)', border:`1px solid ${isCompleted?'rgba(138,21,56,0.2)':'rgba(255,255,255,0.06)'}`, borderRadius:10, padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:4 }}>
                          <div style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{ev.title}</div>
                          {isCompleted && <span style={{ fontSize:9, fontWeight:700, letterSpacing:'0.08em', padding:'2px 7px', borderRadius:9999, flexShrink:0, background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.25)', color:'#4ade80' }}>COMPLETED</span>}
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                          <span style={{ fontSize:11, color:'var(--text-muted)' }}>{ev.location ?? 'No location'} · {ev.karak_points_reward} pts</span>
                          <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:9999, background:'rgba(14,165,233,0.1)', border:'1px solid rgba(14,165,233,0.25)', color:'#38bdf8' }}>
                            👥 {ev.attendee_count} checked in
                          </span>
                        </div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                        <button onClick={() => setQrEvent(ev)} style={{ padding:'4px 11px', borderRadius:9999, border:'1px solid rgba(14,165,233,0.35)', background:'rgba(14,165,233,0.08)', color:'#38bdf8', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>QR</button>
                        {isCompleted && <button onClick={() => setCertEvent(ev)} style={{ padding:'4px 11px', borderRadius:9999, border:'1px solid rgba(233,193,118,0.35)', background:'rgba(233,193,118,0.08)', color:'var(--gold)', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>🎓 Send Certs</button>}
                        {ev.is_live && <button onClick={() => handleOpenEventAnn(ev)} style={{ padding:'4px 11px', borderRadius:9999, border:'1px solid rgba(255,180,171,0.35)', background:'rgba(255,180,171,0.08)', color:'var(--live-red)', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>📢 Announce</button>}
                        {(!isCompleted || ev.is_live) && (
                          <button onClick={() => toggleLive(ev)} style={{ padding:'4px 12px', borderRadius:9999, border:ev.is_live?'1px solid rgba(255,180,171,0.4)':'1px solid rgba(87,65,68,0.3)', background:ev.is_live?'rgba(255,180,171,0.1)':'transparent', color:ev.is_live?'var(--live-red)':'var(--text-muted)', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                            {ev.is_live ? '● LIVE' : 'Go Live'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Team tab ── */}
      {activeTab === 'team' && (() => {
        const presidents = teamMembers.filter(m => m.role === 'president')
        const officers   = teamMembers.filter(m => m.role !== 'president' && m.custom_role)
        const members    = teamMembers.filter(m => m.role !== 'president' && !m.custom_role)
        return (
          <div key="team" className="cc-panel">
            <style>{`
              @keyframes tmCardIn    { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
              @keyframes crownGlow   { 0%,100%{filter:drop-shadow(0 0 2px #e9c17666)} 50%{filter:drop-shadow(0 0 6px #e9c176cc)} }
              @keyframes privCheckIn { from{opacity:0;transform:scale(.5) rotate(-15deg)} to{opacity:1;transform:scale(1) rotate(0)} }
              @keyframes confirmIn   { from{opacity:0;transform:scale(.88) translateX(6px)} to{opacity:1;transform:scale(1) translateX(0)} }
              .tm-card { animation: tmCardIn .28s cubic-bezier(.22,1,.36,1) both }
            `}</style>

            {/* ── Header ── */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
              <div>
                <h2 style={{ fontSize:18, fontWeight:800, color:'var(--text-primary)', marginBottom:5 }}>Team</h2>
                <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                  {[
                    { label:'President', count: presidents.length },
                    { label:'Admin',     count: officers.length   },
                    { label:'Member',    count: members.length    },
                  ].map(s => (
                    <div key={s.label} style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', opacity:.7 }}/>
                      <span style={{ fontSize:12, color:'var(--text-muted)', fontWeight:600 }}>
                        <span style={{ color:'var(--text-primary)', fontWeight:800 }}>{s.count}</span> {s.label}{s.count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', borderRadius:12, padding:'8px 16px', textAlign:'center', flexShrink:0 }}>
                <div style={{ fontSize:22, fontWeight:900, color:'#fff', lineHeight:1 }}>{stats.memberCount}</div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,.4)', fontWeight:700, letterSpacing:'.08em', marginTop:2 }}>TOTAL</div>
              </div>
            </div>

            {/* ── Search ── */}
            {isPresident && (
              <div style={{ position:'relative', marginBottom:20 }}>
                <svg style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', pointerEvents:'none' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Search by name or email to add members…" style={{ ...fi, paddingLeft:36, fontSize:13 }}/>
                {memberSearch && <button onClick={() => { setMemberSearch(''); setSearchProfiles([]) }} style={{ position:'absolute', right:11, top:'50%', transform:'translateY(-50%)', background:'transparent', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:15, lineHeight:1, padding:'3px' }}>✕</button>}
              </div>
            )}

            {/* ── Search results ── */}
            {isPresident && memberSearch.trim() && (
              <div style={{ marginBottom:24 }}>
                <div style={{ fontSize:10, fontWeight:800, color:'rgba(255,255,255,.3)', letterSpacing:'.12em', textTransform:'uppercase', marginBottom:12 }}>
                  {searchLoading ? 'Searching…' : `${searchProfiles.length} result${searchProfiles.length !== 1 ? 's' : ''}`}
                </div>
                {!searchLoading && searchProfiles.length === 0 && (
                  <div style={{ fontSize:13, color:'var(--text-muted)', padding:'20px 0', textAlign:'center', background:'rgba(255,255,255,.02)', borderRadius:12, border:'1px solid rgba(255,255,255,.06)' }}>No users found matching "<strong style={{ color:'var(--text-primary)' }}>{memberSearch}</strong>"</div>
                )}
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {searchProfiles.map(p => {
                    const existing = teamMembers.find(m => m.user_id === p.id)
                    const isLoadingRow = actionLoading === (existing?.id ?? p.id)
                    const isPres = p.id === club.president_id
                    if (isPres) return (
                      <div key={p.id} className="tm-card" style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', borderRadius:14, background:'rgba(233,193,118,.04)', border:'1px solid rgba(233,193,118,.15)' }}>
                        <TeamAvatar name={p.full_name} size={40}/>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)' }}>{p.full_name ?? 'Unknown'}</div>
                          {p.school && <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{p.school}</div>}
                        </div>
                        <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:10, fontWeight:800, letterSpacing:'.08em', padding:'4px 12px', borderRadius:9999, background:'rgba(233,193,118,.12)', color:'#e9c176', border:'1px solid rgba(233,193,118,.25)' }}><IcoCrown size={11} style={{ animation:'crownGlow 2.5s ease-in-out infinite' }}/>President</span>
                      </div>
                    )
                    if (existing) return <ExistingMemberRow key={p.id} profile={p} membership={existing} isLoading={isLoadingRow} canRemove={isPresident || canDo('remove_members')} canEditRole={isPresident} canMakePresident={isPresident} onRoleChange={handleRoleChange} onRemove={handleRemoveMember} onMakePresident={handleMakeCoPresident} onDemotePresident={handleDemotePresident} onPermissionsChange={handlePermissionsChange}/>
                    return <NewMemberRow key={p.id} profile={p} isLoading={isLoadingRow} onAdd={handleAddMember}/>
                  })}
                </div>
              </div>
            )}

            {/* ── Current team ── */}
            {teamMembers.length === 0 && !memberSearch.trim() ? (
              <div style={{ textAlign:'center', padding:'60px 20px' }}>
                <IcoUsers size={52} style={{ opacity:.18, color:'var(--text-muted)', marginBottom:14 }}/>
                <div style={{ fontSize:15, fontWeight:700, color:'var(--text-primary)', marginBottom:6 }}>No team members yet</div>
                <div style={{ fontSize:13, color:'var(--text-muted)' }}>{isPresident ? 'Search above to add your first team member' : 'No members found'}</div>
              </div>
            ) : teamMembers.length > 0 && !memberSearch.trim() && (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {/* President section */}
                {presidents.length > 0 && (
                  <div style={{ marginBottom:4 }}>
                    <div style={{ fontSize:9, fontWeight:800, color:'rgba(255,255,255,.25)', letterSpacing:'.14em', textTransform:'uppercase', marginBottom:8 }}>President</div>
                    {presidents.map((m, idx) => (
                      <PresidentRow key={m.id} member={m} idx={idx} isLoading={actionLoading === m.id} canDemote={isPresident} onDemote={handleDemotePresident} />
                    ))}
                  </div>
                )}

                {/* Officers section */}
                {officers.length > 0 && (
                  <div style={{ marginBottom:4 }}>
                    <div style={{ fontSize:9, fontWeight:800, color:'rgba(255,255,255,.25)', letterSpacing:'.14em', textTransform:'uppercase', marginBottom:8 }}>Admins</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {officers.map((m, idx) => (
                        <ExistingMemberRow key={m.id} profile={{ id:m.user_id, full_name:m.profile?.full_name??null, school:m.profile?.school??null, email:m.profile?.email??null }} membership={m} isLoading={actionLoading===m.id} canRemove={isPresident||canDo('remove_members')} canEditRole={isPresident} canMakePresident={isPresident} onRoleChange={handleRoleChange} onRemove={handleRemoveMember} onMakePresident={handleMakeCoPresident} onDemotePresident={handleDemotePresident} onPermissionsChange={handlePermissionsChange} animDelay={idx*.05}/>
                      ))}
                    </div>
                  </div>
                )}

                {/* Members section */}
                {members.length > 0 && (
                  <div>
                    <div style={{ fontSize:9, fontWeight:800, color:'rgba(255,255,255,.25)', letterSpacing:'.14em', textTransform:'uppercase', marginBottom:8 }}>Members</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {members.map((m, idx) => (
                        <ExistingMemberRow key={m.id} profile={{ id:m.user_id, full_name:m.profile?.full_name??null, school:m.profile?.school??null, email:m.profile?.email??null }} membership={m} isLoading={actionLoading===m.id} canRemove={isPresident||canDo('remove_members')} canEditRole={isPresident} canMakePresident={isPresident} onRoleChange={handleRoleChange} onRemove={handleRemoveMember} onMakePresident={handleMakeCoPresident} onDemotePresident={handleDemotePresident} onPermissionsChange={handlePermissionsChange} animDelay={(officers.length+idx)*.05}/>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Applications tab ── */}
      {activeTab === 'applications' && (
        <div key="applications" className="cc-panel">
          <style>{`
            @keyframes appCardIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
            @keyframes appExpand { from{opacity:0;max-height:0} to{opacity:1;max-height:600px} }
            @keyframes spin { to{transform:rotate(360deg)} }
            .app-card { animation: appCardIn .28s cubic-bezier(.22,1,.36,1) both; border-radius:16px; border:1px solid rgba(255,255,255,0.07); background:rgba(255,255,255,0.03); overflow:hidden; transition:border-color .18s; }
            .app-card:hover { border-color:rgba(138,21,56,0.35); }
          `}</style>

          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
            <div>
              <h2 style={{ fontSize:18, fontWeight:800, color:'var(--text-primary)', marginBottom:4 }}>Pending Applications</h2>
              <p style={{ fontSize:13, color:'var(--text-muted)' }}>
                {applications.length === 0
                  ? 'No pending applications right now.'
                  : `${applications.length} applicant${applications.length !== 1 ? 's' : ''} waiting for review`
                }
              </p>
            </div>
            <button
              onClick={fetchApplications}
              disabled={loadingApps}
              style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:9, padding:'7px 14px', color:'var(--text-muted)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', transition:'all .15s', opacity:loadingApps?0.5:1 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(255,255,255,0.22)'; e.currentTarget.style.color='var(--text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(255,255,255,0.1)'; e.currentTarget.style.color='var(--text-muted)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.7"/></svg>
              Refresh
            </button>
          </div>

          {loadingApps ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'60px 0', gap:14, flexDirection:'column' }}>
              <div style={{ width:32, height:32, borderRadius:'50%', border:'3px solid rgba(138,21,56,0.2)', borderTopColor:'var(--accent)', animation:'spin 0.8s linear infinite' }}/>
              <span style={{ fontSize:13, color:'var(--text-muted)' }}>Loading applications…</span>
            </div>
          ) : applications.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 20px' }}>
              <div style={{ fontSize:48, marginBottom:16, opacity:0.4 }}>📋</div>
              <div style={{ fontSize:15, fontWeight:700, color:'var(--text-primary)', marginBottom:6 }}>No pending applications</div>
              <div style={{ fontSize:13, color:'var(--text-muted)', lineHeight:1.6 }}>
                When users apply to join your club, they'll appear here for review.
                {!isPresident && <><br/>Make sure an active application form exists.</>}
              </div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {applications.map((app, idx) => {
                const isExpanded = expandedApp === app.id
                const isLoading = appActionLoading === app.id
                const fields = app.form?.fields ?? []
                const name = app.profile?.full_name ?? 'Unknown'
                const submittedAt = new Date(app.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
                return (
                  <div key={app.id} className="app-card" style={{ animationDelay:`${idx*.06}s` }}>
                    {/* Top: name + meta */}
                    <div
                      onClick={() => setExpandedApp(isExpanded ? null : app.id)}
                      style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 18px 12px', cursor:'pointer' }}
                    >
                      <div onClick={e => { e.stopPropagation(); navigate(`/profile/${app.user_id}`) }} style={{ width:40, height:40, borderRadius:'50%', background:'linear-gradient(135deg,#8a1538,#c0185c)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:'#fff', flexShrink:0, cursor:'pointer' }}>
                        {name.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase()}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div onClick={e => { e.stopPropagation(); navigate(`/profile/${app.user_id}`) }} style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', marginBottom:2, cursor:'pointer' }}>{name}</div>
                        <div style={{ fontSize:11, color:'var(--text-muted)' }}>
                          {app.profile?.school && <span style={{ marginRight:10 }}>{app.profile.school}</span>}
                          Applied {submittedAt}
                        </div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                        <span style={{ fontSize:10, fontWeight:700, color:'#fbbf24', background:'rgba(251,191,36,0.1)', border:'1px solid rgba(251,191,36,0.25)', borderRadius:9999, padding:'3px 9px', letterSpacing:'.06em' }}>PENDING</span>
                        {fields.length > 0 && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color:'var(--text-muted)', transform:isExpanded?'rotate(180deg)':'none', transition:'transform .2s' }}>
                            <polyline points="6 9 12 15 18 9"/>
                          </svg>
                        )}
                      </div>
                    </div>

                    {/* Always-visible action buttons */}
                    <div style={{ display:'flex', gap:8, padding:'0 18px 16px' }}>
                      <button
                        onClick={() => handleRejectApplication(app.id)}
                        disabled={isLoading}
                        style={{ flex:1, padding:'9px', background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.3)', borderRadius:10, color:'#f87171', fontSize:13, fontWeight:700, cursor:isLoading?'default':'pointer', fontFamily:'inherit', opacity:isLoading?0.5:1, transition:'all .15s' }}
                        onMouseEnter={e => { if(!isLoading) { e.currentTarget.style.background='rgba(248,113,113,0.16)'; e.currentTarget.style.borderColor='rgba(248,113,113,0.5)' }}}
                        onMouseLeave={e => { e.currentTarget.style.background='rgba(248,113,113,0.08)'; e.currentTarget.style.borderColor='rgba(248,113,113,0.3)' }}
                      >{isLoading ? '…' : '✕ Reject'}</button>
                      <button
                        onClick={() => handleMessageApplicant(app.user_id, app.profile?.full_name ?? null)}
                        style={{ flex:1, padding:'9px', background:'rgba(96,165,250,0.08)', border:'1px solid rgba(96,165,250,0.3)', borderRadius:10, color:'#60a5fa', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', transition:'all .15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background='rgba(96,165,250,0.16)'; e.currentTarget.style.borderColor='rgba(96,165,250,0.5)' }}
                        onMouseLeave={e => { e.currentTarget.style.background='rgba(96,165,250,0.08)'; e.currentTarget.style.borderColor='rgba(96,165,250,0.3)' }}
                      >💬 Message</button>
                      <button
                        onClick={() => handleAcceptApplication(app.id, app.user_id)}
                        disabled={isLoading}
                        style={{ flex:1, padding:'9px', background:isLoading?'rgba(34,197,94,0.1)':'rgba(34,197,94,0.15)', border:'1px solid rgba(34,197,94,0.4)', borderRadius:10, color:'#4ade80', fontSize:13, fontWeight:700, cursor:isLoading?'default':'pointer', fontFamily:'inherit', opacity:isLoading?0.5:1, transition:'all .15s' }}
                        onMouseEnter={e => { if(!isLoading) { e.currentTarget.style.background='rgba(34,197,94,0.25)'; e.currentTarget.style.borderColor='rgba(34,197,94,0.6)' }}}
                        onMouseLeave={e => { e.currentTarget.style.background='rgba(34,197,94,0.15)'; e.currentTarget.style.borderColor='rgba(34,197,94,0.4)' }}
                      >{isLoading ? '…' : '✓ Accept'}</button>
                    </div>

                    {/* Expandable answers (only if form has fields) */}
                    {isExpanded && fields.length > 0 && (
                      <div style={{ padding:'0 18px 18px', borderTop:'1px solid rgba(255,255,255,0.06)', animation:'appExpand .22s ease both' }}>
                        <div style={{ display:'flex', flexDirection:'column', gap:12, marginTop:16 }}>
                          {fields.map(f => (
                            <div key={f.id}>
                              <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', letterSpacing:'.06em', textTransform:'uppercase', marginBottom:5 }}>{f.label}</div>
                              <div style={{ fontSize:13, color:'var(--text-primary)', lineHeight:1.6, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:10, padding:'10px 13px', whiteSpace:'pre-wrap' }}>
                                {app.answers[f.id] || <span style={{ color:'var(--text-muted)', fontStyle:'italic' }}>No answer</span>}
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
          )}
        </div>
      )}

      {/* ── Announcements tab ── */}
      {activeTab === 'announcements' && (
        <div key="announcements" className="cc-panel" style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16, padding:24 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:18 }}>
            <div>
              <h2 style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)', marginBottom:3 }}>Announcements</h2>
              <p style={{ fontSize:12, color:'var(--text-muted)' }}>Broadcast updates to all club members</p>
            </div>
            <span style={{ background:'rgba(233,193,118,0.12)', border:'1px solid rgba(233,193,118,0.3)', borderRadius:9999, padding:'3px 10px', fontSize:10, fontWeight:700, color:'var(--gold)', letterSpacing:'0.06em', flexShrink:0 }}>PRESIDENT</span>
          </div>
          <div style={{ background:'rgba(41,28,30,0.5)', border:'1px solid rgba(138,21,56,0.2)', borderRadius:12, padding:16, marginBottom:20 }}>
            <textarea value={annContent} onChange={e => setAnnContent(e.target.value)} placeholder="Share an update, reminder, or important news with your members…" rows={3} maxLength={600} style={{ ...fi, resize:'vertical', marginBottom:10, lineHeight:1.65, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)' }} />
            {annImagePreview && (
              <div style={{ position:'relative', marginBottom:10, borderRadius:10, overflow:'hidden', background:'rgba(0,0,0,0.45)', border:'1px solid rgba(255,255,255,0.09)', display:'flex', alignItems:'center', justifyContent:'center', minHeight:80 }}>
                <img src={annImagePreview} alt="preview" style={{ maxWidth:'100%', maxHeight:260, width:'auto', height:'auto', display:'block', objectFit:'contain' }} />
                <button onClick={clearAnnImage} style={{ position:'absolute', top:8, right:8, width:28, height:28, borderRadius:'50%', background:'rgba(0,0,0,0.7)', border:'1px solid rgba(255,255,255,0.2)', color:'#fff', fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1, fontFamily:'inherit' }}>✕</button>
              </div>
            )}

            {/* AI Panel */}
            {showAnnAI && (
              <div style={{ marginBottom:10 }}>
                <div style={{ borderRadius:12, border:'1px solid rgba(168,85,247,.22)', background:'rgba(168,85,247,.04)', overflow:'hidden' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 14px', borderBottom:'1px solid rgba(168,85,247,.1)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                      <span style={{ fontSize:14 }}>✨</span>
                      <span style={{ fontSize:12, fontWeight:700, color:'#c084fc' }}>Write with AI</span>
                    </div>
                    <button onClick={() => { setShowAnnAI(false); setAnnAiResult(''); setAnnAiPrompt('') }}
                      style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:15, lineHeight:1, padding:'2px 4px' }}>✕</button>
                  </div>
                  <div style={{ padding:'12px 14px' }}>
                    {annAiResult && !annAiLoading && (
                      <div style={{ marginBottom:10, background:'rgba(255,255,255,.05)', border:'1px solid rgba(168,85,247,.18)', borderRadius:10, padding:'11px 13px' }}>
                        <p style={{ fontSize:13.5, color:'var(--text-primary)', lineHeight:1.7, margin:'0 0 10px', whiteSpace:'pre-wrap' }}>{annAiResult}</p>
                        <div style={{ display:'flex', gap:7 }}>
                          <button onClick={() => { setAnnContent(annAiResult); setShowAnnAI(false); setAnnAiResult(''); setAnnAiPrompt('') }}
                            style={{ flex:1, padding:'7px 0', borderRadius:8, border:'none', background:'linear-gradient(135deg,#7c3aed,#a855f7)', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                            Use this
                          </button>
                          <button onClick={() => generateAnnAI(annContent.trim() ? 'improve' : undefined)}
                            style={{ padding:'7px 14px', borderRadius:8, border:'1px solid rgba(168,85,247,.3)', background:'transparent', color:'#a855f7', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                            Retry
                          </button>
                        </div>
                      </div>
                    )}
                    {annAiLoading && (
                      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0', marginBottom:8 }}>
                        <div style={{ display:'flex', gap:4 }}>
                          {(['ai-dot-1 1.2s ease infinite','ai-dot-2 1.2s ease .18s infinite','ai-dot-3 1.2s ease .36s infinite'] as const).map((anim,i) => (
                            <span key={i} style={{ width:5, height:5, borderRadius:'50%', background:'#a855f7', display:'block', animation:anim }} />
                          ))}
                        </div>
                        <span style={{ fontSize:12, color:'#c084fc', fontWeight:600 }}>Writing…</span>
                      </div>
                    )}
                    {!annAiLoading && annContent.trim() && (
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                        <button onClick={() => generateAnnAI('improve','Polish the writing and fix any grammar')}
                          style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 12px', borderRadius:9999, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', transition:'all .15s', background:'rgba(168,85,247,.1)', border:'1px solid rgba(168,85,247,.2)', color:'#c084fc' }}>✨ Polish</button>
                        <button onClick={() => generateAnnAI('improve','Make this shorter and more concise')}
                          style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 12px', borderRadius:9999, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', transition:'all .15s', background:'rgba(168,85,247,.1)', border:'1px solid rgba(168,85,247,.2)', color:'#c084fc' }}>Shorter</button>
                        <button onClick={() => generateAnnAI('improve','Make this more engaging and exciting')}
                          style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 12px', borderRadius:9999, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', transition:'all .15s', background:'rgba(168,85,247,.1)', border:'1px solid rgba(168,85,247,.2)', color:'#c084fc' }}>More engaging</button>
                      </div>
                    )}
                    <div style={{ position:'relative' }}>
                      <input value={annAiPrompt} onChange={e => setAnnAiPrompt(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !annAiLoading && (annAiPrompt.trim() || annContent.trim())) generateAnnAI(annContent.trim() ? 'improve' : undefined) }}
                        placeholder={annContent.trim() ? 'Any specific instructions? (optional)' : 'What should the announcement say?'}
                        style={{ width:'100%', background:'rgba(255,255,255,.06)', border:'1px solid rgba(168,85,247,.2)', borderRadius:9, padding:'8px 42px 8px 12px', color:'var(--text-primary)', fontSize:13, outline:'none', fontFamily:'inherit', boxSizing:'border-box', caretColor:'#a855f7' }} />
                      <button onClick={() => generateAnnAI(annContent.trim() ? 'improve' : undefined)}
                        disabled={annAiLoading || (!annAiPrompt.trim() && !annContent.trim())}
                        style={{ position:'absolute', right:7, top:'50%', transform:'translateY(-50%)', width:26, height:26, borderRadius:'50%', border:'none', background:(annAiLoading||(!annAiPrompt.trim()&&!annContent.trim()))?'rgba(168,85,247,.2)':'linear-gradient(135deg,#7c3aed,#a855f7)', color:'#fff', cursor:(annAiLoading||(!annAiPrompt.trim()&&!annContent.trim()))?'default':'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700 }}>
                        ↑
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input ref={annImgRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleAnnImageSelect} />
                <button onClick={() => annImgRef.current?.click()} title="Attach image" style={{ padding:'6px 12px', borderRadius:7, background:annImageFile?'rgba(138,21,56,0.2)':'rgba(255,255,255,0.05)', border:annImageFile?'1px solid rgba(138,21,56,0.4)':'1px solid rgba(255,255,255,0.1)', color:annImageFile?'var(--accent)':'var(--text-muted)', fontSize:13, cursor:'pointer', transition:'all 0.15s', display:'flex', alignItems:'center', gap:5, fontFamily:'inherit' }}>
                  🖼 {annImageFile ? 'Image added' : 'Add image'}
                </button>
                <button onClick={() => { setShowAnnAI(v => !v); setAnnAiResult('') }}
                  style={{ padding:'6px 12px', borderRadius:7, background:showAnnAI?'rgba(168,85,247,.2)':'rgba(168,85,247,.08)', border:`1px solid ${showAnnAI?'rgba(168,85,247,.5)':'rgba(168,85,247,.25)'}`, color:showAnnAI?'#a855f7':'rgba(168,85,247,.8)', fontSize:13, fontWeight:700, cursor:'pointer', transition:'all 0.15s', display:'flex', alignItems:'center', gap:5, fontFamily:'inherit' }}>
                  ✨ AI
                </button>
                <span style={{ fontSize:11, color:'var(--text-muted)' }}>{annContent.length} / 600</span>
              </div>
              {annError && <div style={{ fontSize:12, color:'#f87171', background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.2)', borderRadius:8, padding:'8px 12px' }}>{annError}</div>}
              <button onClick={handlePostAnnouncement} disabled={postingAnn||(!annContent.trim()&&!annImageFile)} style={{ background:(annContent.trim()||annImageFile)?'var(--accent)':'rgba(87,65,68,0.18)', border:'none', borderRadius:9, padding:'9px 22px', color:(annContent.trim()||annImageFile)?'#fff':'var(--text-muted)', fontSize:13, fontWeight:700, cursor:(annContent.trim()||annImageFile)?'pointer':'default', transition:'all 0.15s', opacity:postingAnn?0.7:1, fontFamily:'inherit' }}>
                {postingAnn ? 'Posting…' : 'Post Announcement'}
              </button>
            </div>
          </div>
          {announcements.length === 0 ? (
            <p style={{ fontSize:13, color:'var(--text-muted)', textAlign:'center', padding:'16px 0' }}>No announcements yet — post one to keep your members in the loop.</p>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {announcements.map(ann => {
                const isAdmin = ann.profile?.role === 'admin'
                const rs = isAdmin ? { color:'#818cf8', bg:'rgba(99,102,241,0.13)', label:'Admin' } : { color:'var(--gold)', bg:'rgba(233,193,118,0.12)', label:'President' }
                return (
                  <div key={ann.id} style={{ background:'rgba(255,255,255,0.025)', borderLeft:`3px solid ${rs.color}`, borderRadius:'0 10px 10px 0', padding:'13px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, flexWrap:'wrap' }}>
                      <span style={{ background:rs.bg, borderRadius:9999, padding:'2px 8px', fontSize:10, fontWeight:700, color:rs.color, letterSpacing:'0.06em' }}>{rs.label.toUpperCase()}</span>
                      <span style={{ fontSize:13, fontWeight:600, color:'var(--text-secondary)' }}>{ann.profile?.full_name ?? 'Unknown'}</span>
                      <span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:'auto' }}>{new Date(ann.created_at).toLocaleDateString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
                    </div>
                    {ann.content && <p style={{ fontSize:14, color:'var(--text-primary)', lineHeight:1.65, margin:0, whiteSpace:'pre-wrap' }}>{ann.content}</p>}
                    {ann.image_url && (
                      <div onClick={() => setLightboxSrc(ann.image_url!)} style={{ position:'relative', marginTop:ann.content?12:0, marginLeft:-16, marginRight:-16, marginBottom:-13, borderRadius:'0 0 9px 0', overflow:'hidden', cursor:'pointer', lineHeight:0 }}>
                        <img src={ann.image_url} alt="" style={{ maxWidth:'100%', height:'auto', display:'block', margin:'0 auto' }} />
                        <div style={{ position:'absolute', bottom:10, right:10, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(6px)', border:'1px solid rgba(255,255,255,0.18)', borderRadius:8, padding:'5px 10px', display:'flex', alignItems:'center', gap:5, fontSize:11, fontWeight:600, color:'#fff', pointerEvents:'none' }}>
                          <span style={{ fontSize:13 }}>⛶</span> View full
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Positions tab ── */}
      {activeTab === 'positions' && (
        <div key="positions" className="cc-panel">
          <ClubPositions club={club} />
        </div>
      )}

      {/* ── Settings tab ── */}
      {activeTab === 'settings' && (
        <div key="settings" className="cc-panel">
          {/* Club Appearance */}
          <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:16, padding:24, marginBottom:20 }}>
            <div style={{ marginBottom:20 }}>
              <h2 style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)', marginBottom:3 }}>Club Appearance</h2>
              <p style={{ fontSize:12, color:'var(--text-muted)' }}>Upload a logo and banner image for your club's public profile</p>
            </div>
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:8 }}>Banner Image</div>
              <div onClick={() => !uploadingBanner && bannerRef.current?.click()} style={{ width:'100%', height:140, borderRadius:12, border:`2px dashed ${bannerPreview?'rgba(138,21,56,0.4)':'rgba(255,255,255,0.12)'}`, background:bannerPreview?'transparent':'rgba(255,255,255,0.02)', cursor:uploadingBanner?'default':'pointer', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', position:'relative', transition:'border-color 0.15s' }}
                onMouseEnter={e => { if (!uploadingBanner) e.currentTarget.style.borderColor='rgba(138,21,56,0.7)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor=bannerPreview?'rgba(138,21,56,0.4)':'rgba(255,255,255,0.12)' }}
              >
                {bannerPreview ? (
                  <><img src={bannerPreview} alt="banner" style={{ width:'100%', height:'100%', objectFit:'cover' }} /><div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', opacity:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#fff', transition:'opacity 0.15s' }} onMouseEnter={e => (e.currentTarget.style.opacity='1')} onMouseLeave={e => (e.currentTarget.style.opacity='0')}>{uploadingBanner?'Uploading…':'Change Banner'}</div></>
                ) : uploadingBanner ? <div style={{ fontSize:13, color:'var(--text-muted)' }}>Uploading…</div>
                : <div style={{ textAlign:'center', color:'var(--text-muted)' }}><div style={{ fontSize:28, marginBottom:8 }}>🖼</div><div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Click to upload banner</div><div style={{ fontSize:11 }}>Recommended: 1200 × 400 · Max 10 MB</div></div>}
              </div>
              <input ref={bannerRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleBannerChange} />
            </div>
            <div style={{ marginBottom:appearanceMsg?16:0 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:8 }}>Club Logo</div>
              <div style={{ display:'flex', alignItems:'center', gap:18 }}>
                <div onClick={() => !uploadingLogo && logoRef.current?.click()} style={{ width:88, height:88, borderRadius:16, flexShrink:0, border:`2px dashed ${logoPreview?'rgba(138,21,56,0.4)':'rgba(255,255,255,0.12)'}`, background:logoPreview?'transparent':'rgba(255,255,255,0.02)', cursor:uploadingLogo?'default':'pointer', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', position:'relative', transition:'border-color 0.15s' }}
                  onMouseEnter={e => { if (!uploadingLogo) e.currentTarget.style.borderColor='rgba(138,21,56,0.7)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor=logoPreview?'rgba(138,21,56,0.4)':'rgba(255,255,255,0.12)' }}
                >
                  {logoPreview ? (<><img src={logoPreview} alt="logo" style={{ width:'100%', height:'100%', objectFit:'cover' }} /><div style={{ position:'absolute', inset:0, borderRadius:14, background:'rgba(0,0,0,0.55)', opacity:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff', transition:'opacity 0.15s' }} onMouseEnter={e => (e.currentTarget.style.opacity='1')} onMouseLeave={e => (e.currentTarget.style.opacity='0')}>{uploadingLogo?'…':'Change'}</div></>)
                  : uploadingLogo ? <div style={{ fontSize:11, color:'var(--text-muted)' }}>…</div>
                  : <div style={{ textAlign:'center', color:'var(--text-muted)', padding:6 }}><div style={{ fontSize:20, marginBottom:4 }}>+</div><div style={{ fontSize:10, lineHeight:1.3 }}>Logo</div></div>}
                </div>
                <input ref={logoRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleLogoChange} />
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', marginBottom:4 }}>{club.name}</div>
                  <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:10 }}>Square image · PNG or JPG · Max 5 MB</div>
                  <button onClick={() => !uploadingLogo && logoRef.current?.click()} disabled={uploadingLogo} style={{ padding:'6px 16px', borderRadius:8, background:'rgba(138,21,56,0.15)', border:'1px solid rgba(138,21,56,0.3)', color:'var(--accent)', fontSize:12, fontWeight:700, cursor:uploadingLogo?'default':'pointer', opacity:uploadingLogo?0.6:1, fontFamily:'inherit' }}>
                    {uploadingLogo?'Uploading…':logoPreview?'Change Logo':'Upload Logo'}
                  </button>
                </div>
              </div>
            </div>
            {appearanceMsg && (
              <div style={{ marginTop:12, padding:'9px 14px', borderRadius:9, background:appearanceMsg.startsWith('Upload failed')||appearanceMsg.startsWith('Please')||appearanceMsg.includes('must be')?'rgba(255,107,107,0.08)':'rgba(34,197,94,0.08)', border:appearanceMsg.startsWith('Upload failed')||appearanceMsg.startsWith('Please')||appearanceMsg.includes('must be')?'1px solid rgba(255,107,107,0.25)':'1px solid rgba(34,197,94,0.25)', fontSize:13, fontWeight:600, color:appearanceMsg.startsWith('Upload failed')||appearanceMsg.startsWith('Please')||appearanceMsg.includes('must be')?'#ff6b6b':'#4ade80' }}>
                {appearanceMsg}
              </div>
            )}
          </div>

          {/* Application Form Builder — president only */}
          {isPresident && <ClubFormBuilder club={club} />}

          {/* Danger Zone — presidents only */}
          {isPresident && user?.id === club.president_id && (
            <div style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 16, padding: 24, marginTop: 20 }}>
              <div style={{ marginBottom: 16 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: '#f87171', marginBottom: 4 }}>Danger Zone</h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Permanently delete <strong style={{ color: 'var(--text-primary)' }}>{club.name}</strong>. This action cannot be undone — all members, events, announcements, and posts will be removed.
                </p>
              </div>
              <button
                onClick={() => { setShowDeleteConfirm(true); setDeleteConfirmName(''); setDeleteError('') }}
                style={{ padding: '8px 18px', borderRadius: 9, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.18)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.6)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)' }}
              >
                Delete Club
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Analytics tab ── */}
      {activeTab === 'analytics' && (() => {
        const CAT_COLORS = ['#c0185c','#60a5fa','#4ade80','#f59e0b','#a78bfa','#fb923c','#f87171','#38bdf8']
        const BAR_GRADS = [
          'linear-gradient(90deg,#8a1538,#f472b6)',
          'linear-gradient(90deg,#1d4ed8,#60a5fa)',
          'linear-gradient(90deg,#7c3aed,#c084fc)',
          'linear-gradient(90deg,#15803d,#4ade80)',
          'linear-gradient(90deg,#b45309,#fbbf24)',
          'linear-gradient(90deg,#0e7490,#38bdf8)',
        ]
        const engagementRate = stats.memberCount > 0 && stats.eventCount > 0
          ? Math.min(100, Math.round((stats.totalAttendees / (stats.memberCount * stats.eventCount)) * 100))
          : 0
        const totalKarak = events.reduce((s, e) => s + e.karak_points_reward * e.attendee_count, 0)
        const topEvent = [...events].sort((a, b) => b.attendee_count - a.attendee_count)[0] ?? null
        const sortedEvents = [...events].sort((a, b) => b.attendee_count - a.attendee_count).slice(0, 6)
        const maxAtt = Math.max(...events.map(e => e.attendee_count), 1)

        const categoryMap: Record<string, { count: number; attendees: number }> = {}
        events.forEach(e => {
          const cat = e.category ?? 'Uncategorised'
          if (!categoryMap[cat]) categoryMap[cat] = { count: 0, attendees: 0 }
          categoryMap[cat].count++; categoryMap[cat].attendees += e.attendee_count
        })
        const categories = Object.entries(categoryMap).sort((a, b) => b[1].attendees - a[1].attendees)
        const totalCatAtt = categories.reduce((s, [, v]) => s + v.attendees, 0) || 1

        // SVG area line chart
        const CW = 560, CH = 120, PL = 28, PR = 12, PT = 18, PB = 26
        const IW = CW - PL - PR, IH = CH - PT - PB
        const maxJoin = Math.max(...monthlyJoins.map(m => m.count), 1)
        const pts = monthlyJoins.map((m, i) => ({
          x: PL + (monthlyJoins.length > 1 ? i / (monthlyJoins.length - 1) : 0.5) * IW,
          y: PT + IH - (m.count / maxJoin) * IH,
          ...m,
        }))
        let linePath = '', areaPath = ''
        if (pts.length >= 2) {
          linePath = `M${pts[0].x},${pts[0].y}` + pts.slice(1).map((p, i) => {
            const cpx = (pts[i].x + p.x) / 2
            return ` C${cpx},${pts[i].y} ${cpx},${p.y} ${p.x},${p.y}`
          }).join('')
          areaPath = `${linePath} L${pts[pts.length-1].x},${PT+IH} L${pts[0].x},${PT+IH} Z`
        }

        // SVG donut chart
        const DR = 52, DCX = 70, DCY = 70, DCIRC = 2 * Math.PI * DR
        let cumAngle = -90
        const donutSegs = categories.slice(0, 6).map(([cat, v], i) => {
          const fraction = v.attendees / totalCatAtt
          const seg = { cat, v, segLen: fraction * DCIRC, startAngle: cumAngle, color: CAT_COLORS[i] }
          cumAngle += fraction * 360
          return seg
        })

        // Engagement ring
        const ER = 40, ECIRC = 2 * Math.PI * ER
        const eFill = (engagementRate / 100) * ECIRC
        const eColor = engagementRate >= 60 ? '#4ade80' : engagementRate >= 30 ? '#f59e0b' : '#c0185c'

        return (
          <div key="analytics" className="cc-panel">
            <style>{`
              @keyframes anBarIn { from{width:0} to{width:var(--w)} }
              @keyframes anFadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }
              @keyframes anRingIn { from{stroke-dasharray:0 9999} }
              @keyframes anSpin { to{transform:rotate(360deg)} }
              .an-bar   { animation: anBarIn  .9s cubic-bezier(.22,1,.36,1) both }
              .an-card  { animation: anFadeUp .4s cubic-bezier(.22,1,.36,1) both }
              .an-ring  { animation: anRingIn 1.1s cubic-bezier(.22,1,.36,1) both; animation-delay:.15s }
              .an-spin  { animation: anSpin .7s linear infinite }
              @media(max-width:640px){
                .an-hero { padding: 18px 16px !important }
                .an-kpi-grid { grid-template-columns: 1fr 1fr !important }
                .an-bottom-row { grid-template-columns: 1fr !important }
              }
            `}</style>

            {/* ── Hero banner ── */}
            <div className="an-hero" style={{ position:'relative', overflow:'hidden', borderRadius:20, marginBottom:20, background:'linear-gradient(135deg,rgba(138,21,56,.3) 0%,rgba(12,6,9,0) 55%)', border:'1px solid rgba(138,21,56,.35)', padding:'26px 28px' }}>
              <div style={{ position:'absolute', top:-60, right:-60, width:260, height:260, borderRadius:'50%', background:'radial-gradient(circle,rgba(192,24,92,.18) 0%,transparent 68%)', pointerEvents:'none' }} />
              <div style={{ position:'absolute', bottom:-40, left:80, width:160, height:160, borderRadius:'50%', background:'radial-gradient(circle,rgba(96,165,250,.07) 0%,transparent 70%)', pointerEvents:'none' }} />
              <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:'.14em', textTransform:'uppercase', marginBottom:8 }}>Analytics Dashboard</div>
              <div style={{ fontSize:28, fontWeight:900, color:'#fff', letterSpacing:'-.6px', lineHeight:1.1, marginBottom:8 }}>{club.name}</div>
              <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
                {[
                  { n: stats.memberCount, l: 'Members' },
                  { n: stats.eventCount,  l: 'Events'  },
                  { n: stats.totalAttendees, l: 'Check-ins' },
                  { n: stats.threadCount, l: 'Threads'  },
                ].map(x => (
                  <div key={x.l} style={{ display:'flex', alignItems:'baseline', gap:5 }}>
                    <span style={{ fontSize:22, fontWeight:900, color:'#fff' }}>{x.n}</span>
                    <span style={{ fontSize:11, color:'rgba(255,255,255,.45)', fontWeight:600 }}>{x.l}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── KPI row ── */}
            <div className="an-kpi-grid" style={{ display:'grid', gridTemplateColumns:'160px 1fr 1fr 1fr', gap:14, marginBottom:20 }}>

              {/* Engagement ring */}
              <div className="an-card" style={{ background:'rgba(255,255,255,.04)', border:`1px solid ${eColor}28`, borderRadius:18, padding:'18px 14px', display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
                <svg width="96" height="96" viewBox="0 0 96 96">
                  <circle cx="48" cy="48" r={ER} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="10"/>
                  <circle cx="48" cy="48" r={ER} fill="none" stroke={eColor} strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={`${eFill} ${ECIRC - eFill}`} transform="rotate(-90 48 48)"
                    className="an-ring" style={{ filter:`drop-shadow(0 0 8px ${eColor}99)` }}/>
                  <text x="48" y="44" textAnchor="middle" fill={eColor} fontSize="17" fontWeight="900" fontFamily="inherit">{engagementRate}%</text>
                  <text x="48" y="57" textAnchor="middle" fill="rgba(255,255,255,.35)" fontSize="8" fontFamily="inherit">ENGAGE</text>
                </svg>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--text-primary)' }}>Engagement</div>
                  <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:1 }}>attendance ÷ members</div>
                </div>
              </div>

              {/* Karak Points */}
              <div className="an-card" style={{ background:'rgba(255,255,255,.04)', border:'1px solid rgba(251,191,36,.2)', borderRadius:18, padding:'22px 22px', position:'relative', overflow:'hidden', animationDelay:'.06s' }}>
                <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'linear-gradient(90deg,#f59e0b,#fbbf24)' }}/>
                <div style={{ fontSize:10, fontWeight:800, color:'#f59e0b', letterSpacing:'.12em', textTransform:'uppercase', marginBottom:10 }}>🏆 Karak Points</div>
                <div style={{ fontSize:38, fontWeight:900, color:'#fff', letterSpacing:'-2.5px', lineHeight:1 }}>{totalKarak.toLocaleString()}</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,.4)', marginTop:7, marginBottom:14 }}>rewarded across {stats.eventCount} events</div>
                <div style={{ height:4, borderRadius:9999, background:'rgba(255,255,255,.07)', overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${Math.min(100,(stats.totalAttendees/Math.max(stats.memberCount,1))*50)}%`, background:'linear-gradient(90deg,#f59e0b,#fbbf24)', borderRadius:9999 }}/>
                </div>
              </div>

              {/* Top event */}
              <div className="an-card" style={{ background:'rgba(255,255,255,.04)', border:'1px solid rgba(167,139,250,.2)', borderRadius:18, padding:'22px 22px', position:'relative', overflow:'hidden', animationDelay:'.12s' }}>
                <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'linear-gradient(90deg,#7c3aed,#c084fc)' }}/>
                <div style={{ fontSize:10, fontWeight:800, color:'#a78bfa', letterSpacing:'.12em', textTransform:'uppercase', marginBottom:10 }}>🥇 Best Event</div>
                <div style={{ fontSize:topEvent ? 15 : 13, fontWeight:800, color:'#fff', lineHeight:1.35, marginBottom:8, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
                  {topEvent ? topEvent.title : 'No events yet'}
                </div>
                {topEvent && (
                  <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
                    <span style={{ fontSize:28, fontWeight:900, color:'#a78bfa', letterSpacing:'-1px' }}>{topEvent.attendee_count}</span>
                    <span style={{ fontSize:11, color:'rgba(255,255,255,.4)' }}>check-ins</span>
                  </div>
                )}
              </div>

              {/* New members */}
              <div className="an-card" style={{ background:'rgba(255,255,255,.04)', border:'1px solid rgba(96,165,250,.2)', borderRadius:18, padding:'22px 22px', position:'relative', overflow:'hidden', animationDelay:'.18s' }}>
                <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'linear-gradient(90deg,#1d4ed8,#38bdf8)' }}/>
                <div style={{ fontSize:10, fontWeight:800, color:'#60a5fa', letterSpacing:'.12em', textTransform:'uppercase', marginBottom:10 }}>📈 New Members</div>
                <div style={{ fontSize:38, fontWeight:900, color:'#fff', letterSpacing:'-2.5px', lineHeight:1 }}>+{stats.newMembersThisMonth}</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,.4)', marginTop:7 }}>in the last 30 days</div>
                {stats.memberCount > 0 && (
                  <div style={{ fontSize:12, color:'#60a5fa', marginTop:6, fontWeight:700 }}>
                    {Math.round((stats.newMembersThisMonth / stats.memberCount) * 100)}% of total
                  </div>
                )}
              </div>
            </div>

            {/* ── SVG Line Chart — Member Growth ── */}
            <div style={{ background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.08)', borderRadius:18, padding:'22px 24px 18px', marginBottom:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)' }}>Member Growth</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>New joins per month — last 6 months</div>
                </div>
                {loadingAnalytics && <div className="an-spin" style={{ width:14, height:14, borderRadius:'50%', border:'2px solid rgba(138,21,56,.3)', borderTopColor:'var(--accent)' }}/>}
              </div>
              {pts.length > 0 ? (
                <svg viewBox={`0 0 ${CW} ${CH}`} style={{ width:'100%', height:'auto', overflow:'visible', display:'block' }}>
                  <defs>
                    <linearGradient id="anAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#c0185c" stopOpacity="0.4"/>
                      <stop offset="100%" stopColor="#c0185c" stopOpacity="0.02"/>
                    </linearGradient>
                    <filter id="anLineGlow" x="-10%" y="-40%" width="120%" height="180%">
                      <feGaussianBlur stdDeviation="3" result="blur"/>
                      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                  </defs>
                  {/* Grid */}
                  {[0.25,0.5,0.75,1].map(f => (
                    <line key={f} x1={PL} y1={PT + IH*(1-f)} x2={PL+IW} y2={PT + IH*(1-f)} stroke="rgba(255,255,255,.05)" strokeWidth="1" strokeDasharray="3 4"/>
                  ))}
                  {/* Area + line */}
                  {areaPath && <path d={areaPath} fill="url(#anAreaGrad)"/>}
                  {linePath  && <path d={linePath} fill="none" stroke="#c0185c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" filter="url(#anLineGlow)"/>}
                  {/* Data points */}
                  {pts.map((p, i) => (
                    <g key={i}>
                      <circle cx={p.x} cy={p.y} r="6" fill="rgba(18,18,18,.9)" stroke="#c0185c" strokeWidth="2.5"/>
                      <circle cx={p.x} cy={p.y} r="2.5" fill="#c0185c"/>
                      {p.count > 0 && <text x={p.x} y={p.y-11} textAnchor="middle" fill="rgba(255,255,255,.75)" fontSize="11" fontWeight="700" fontFamily="inherit">{p.count}</text>}
                      <text x={p.x} y={PT+IH+18} textAnchor="middle" fill={i===pts.length-1?'#c0185c':'rgba(255,255,255,.35)'} fontSize="11" fontWeight={i===pts.length-1?'700':'400'} fontFamily="inherit">{p.label}</text>
                    </g>
                  ))}
                </svg>
              ) : (
                <div style={{ height:80, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:13 }}>
                  {loadingAnalytics ? 'Loading chart…' : 'No membership data yet'}
                </div>
              )}
            </div>

            {/* ── Bottom row: Leaderboard + Donut ── */}
            <div className="an-bottom-row" style={{ display:'grid', gridTemplateColumns: categories.length > 0 ? '1fr 260px' : '1fr', gap:16 }}>

              {/* Event Leaderboard */}
              {sortedEvents.length > 0 && (
                <div style={{ background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.08)', borderRadius:18, padding:'22px 24px' }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', marginBottom:4 }}>Event Leaderboard</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:20 }}>Ranked by check-in count</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
                    {sortedEvents.map((e, idx) => {
                      const pct = Math.round((e.attendee_count / maxAtt) * 100)
                      const medals = ['🥇','🥈','🥉']
                      return (
                        <div key={e.id} style={{ display:'grid', gridTemplateColumns:'28px 1fr', gap:10, alignItems:'start' }}>
                          <div style={{ fontSize:idx < 3 ? 18 : 13, textAlign:'center', paddingTop:2, color:'rgba(255,255,255,.4)', fontWeight:700 }}>
                            {idx < 3 ? medals[idx] : idx+1}
                          </div>
                          <div>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:7 }}>
                              <span style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, marginRight:10 }}>{e.title}</span>
                              <span style={{ fontSize:15, fontWeight:900, color:'#fff', flexShrink:0 }}>{e.attendee_count}</span>
                            </div>
                            <div style={{ height:9, borderRadius:5, background:'rgba(255,255,255,.06)', overflow:'hidden' }}>
                              <div className="an-bar" style={{
                                '--w':`${pct}%`, height:'100%', borderRadius:5,
                                background: BAR_GRADS[idx % BAR_GRADS.length],
                                boxShadow: idx===0 ? '0 0 14px rgba(244,114,182,.45)' : 'none',
                              } as React.CSSProperties}/>
                            </div>
                            <div style={{ display:'flex', gap:12, marginTop:4 }}>
                              {e.start_time && (
                                <span style={{ fontSize:10, color:'var(--text-muted)' }}>
                                  {new Date(e.start_time).toLocaleDateString('default',{month:'short',day:'numeric',year:'numeric'})}
                                </span>
                              )}
                              {e.karak_points_reward > 0 && (
                                <span style={{ fontSize:10, color:'#f59e0b', fontWeight:700 }}>+{e.karak_points_reward} pts</span>
                              )}
                              <span style={{ fontSize:10, color:'rgba(255,255,255,.25)' }}>{pct}%</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Category Donut */}
              {categories.length > 0 && (
                <div style={{ background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.08)', borderRadius:18, padding:'22px 22px', display:'flex', flexDirection:'column' }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', marginBottom:4 }}>Categories</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:16 }}>Attendees by type</div>
                  <div style={{ display:'flex', justifyContent:'center', marginBottom:16 }}>
                    <svg width="140" height="140" viewBox="0 0 140 140">
                      <circle cx={DCX} cy={DCY} r={DR} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="18"/>
                      {donutSegs.map(seg => (
                        <circle key={seg.cat} cx={DCX} cy={DCY} r={DR} fill="none"
                          stroke={seg.color} strokeWidth="18" strokeLinecap="butt"
                          strokeDasharray={`${seg.segLen - 1.5} ${DCIRC - seg.segLen + 1.5}`}
                          transform={`rotate(${seg.startAngle} ${DCX} ${DCY})`}
                          style={{ filter:`drop-shadow(0 0 5px ${seg.color}66)` }}/>
                      ))}
                      <text x={DCX} y={DCY-7} textAnchor="middle" fill="#fff" fontSize="22" fontWeight="900" fontFamily="inherit">{totalCatAtt}</text>
                      <text x={DCX} y={DCY+11} textAnchor="middle" fill="rgba(255,255,255,.35)" fontSize="9" fontFamily="inherit" fontWeight="600" letterSpacing="1">ATTENDEES</text>
                    </svg>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
                    {donutSegs.map(seg => (
                      <div key={seg.cat} style={{ display:'flex', alignItems:'center', gap:9 }}>
                        <div style={{ width:10, height:10, borderRadius:3, background:seg.color, flexShrink:0, boxShadow:`0 0 6px ${seg.color}99` }}/>
                        <span style={{ fontSize:12, color:'var(--text-secondary)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{seg.cat}</span>
                        <span style={{ fontSize:12, fontWeight:800, color:seg.color }}>{Math.round((seg.v.attendees/totalCatAtt)*100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Meeting Notes tab ── */}
      {activeTab === 'notes' && (() => {
        const NOTE_ACCENTS = ['#c0185c','#60a5fa','#4ade80','#f59e0b','#a78bfa','#fb923c','#38bdf8','#f472b6']
        const accentFor = (id: string) => NOTE_ACCENTS[id.charCodeAt(0) % NOTE_ACCENTS.length]
        const wordCount = (s: string | null) => s ? s.trim().split(/\s+/).filter(Boolean).length : 0

        return (
          <div key="notes" className="cc-panel">
            <style>{`
              @keyframes ntSlideIn { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:none} }
              @keyframes ntCardIn  { from{opacity:0;transform:translateY(8px)}  to{opacity:1;transform:none} }
              @keyframes ntExpand  { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:none} }
              .nt-form { animation: ntSlideIn .22s cubic-bezier(.22,1,.36,1) both }
              .nt-card { animation: ntCardIn  .3s  cubic-bezier(.22,1,.36,1) both }
              .nt-body { animation: ntExpand  .2s  cubic-bezier(.22,1,.36,1) both }
            `}</style>

            {/* ── Header ── */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
              <div>
                <h2 style={{ fontSize:18, fontWeight:800, color:'var(--text-primary)', marginBottom:4 }}>Meeting Notes</h2>
                <p style={{ fontSize:13, color:'var(--text-muted)' }}>
                  {notes.length > 0 ? `${notes.length} note${notes.length !== 1 ? 's' : ''} — shared with all members` : 'Document decisions, action items, and discussions'}
                </p>
              </div>
              {(isPresident || canDo('post_announcements')) && (
                <button
                  onClick={() => setShowNoteForm(v => !v)}
                  style={{ background: showNoteForm ? 'rgba(255,255,255,.06)' : 'var(--accent)', border: showNoteForm ? '1px solid rgba(255,255,255,.15)' : 'none', borderRadius:12, padding:'10px 20px', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', transition:'all .15s', flexShrink:0 }}
                >
                  {showNoteForm ? '✕ Cancel' : '+ New Note'}
                </button>
              )}
            </div>

            {/* ── Compose form ── */}
            {showNoteForm && (
              <div className="nt-form" style={{ background:'linear-gradient(135deg,rgba(24,14,18,.9),rgba(16,14,24,.9))', border:'1px solid rgba(138,21,56,.3)', borderRadius:20, padding:'22px 22px', marginBottom:22, boxShadow:'0 16px 40px rgba(0,0,0,.4)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
                  <div style={{ width:34, height:34, borderRadius:10, background:'rgba(138,21,56,.2)', border:'1px solid rgba(138,21,56,.35)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>📝</div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>New Meeting Note</div>
                    <div style={{ fontSize:11, color:'var(--text-muted)' }}>{new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</div>
                  </div>
                </div>

                <input
                  value={noteTitle}
                  onChange={e => setNoteTitle(e.target.value)}
                  placeholder="Meeting title or topic…"
                  style={{ ...fi, fontSize:16, fontWeight:700, padding:'12px 14px', marginBottom:12, background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)' }}
                />

                <div style={{ position:'relative', marginBottom:16 }}>
                  <textarea
                    value={noteContent}
                    onChange={e => setNoteContent(e.target.value)}
                    placeholder="Write your notes here — decisions made, action items, key discussions…"
                    rows={7}
                    style={{ ...fi, resize:'vertical', lineHeight:1.75, padding:'13px 14px', background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', fontSize:13 }}
                  />
                  {noteContent.trim() && (
                    <div style={{ position:'absolute', bottom:10, right:12, fontSize:10, color:'rgba(255,255,255,.25)', fontWeight:600, pointerEvents:'none' }}>
                      {wordCount(noteContent)} words
                    </div>
                  )}
                </div>

                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,.3)' }}>
                    {noteTitle.trim() ? '' : 'Title is required'}
                  </div>
                  <button
                    onClick={handleSaveNote}
                    disabled={savingNote || !noteTitle.trim()}
                    style={{ background:'linear-gradient(135deg,#8a1538,#c0185c)', border:'none', borderRadius:12, padding:'10px 26px', color:'#fff', fontSize:13, fontWeight:800, cursor: savingNote||!noteTitle.trim() ? 'default':'pointer', opacity: savingNote||!noteTitle.trim() ? .45:1, fontFamily:'inherit', boxShadow:'0 4px 16px rgba(138,21,56,.4)', transition:'opacity .15s' }}
                  >
                    {savingNote ? 'Saving…' : 'Save Note'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Notes list ── */}
            {notes.length === 0 ? (
              <div style={{ textAlign:'center', padding:'70px 20px' }}>
                <div style={{ fontSize:52, marginBottom:14, opacity:.2 }}>📋</div>
                <div style={{ fontSize:15, fontWeight:700, color:'var(--text-primary)', marginBottom:6 }}>No notes yet</div>
                <div style={{ fontSize:13, color:'var(--text-muted)' }}>Start documenting your meetings — decisions, action items, and discussions</div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {notes.map((n, idx) => {
                  const accent = accentFor(n.id)
                  const isOpen = expandedNote === n.id
                  const preview = n.content ? n.content.slice(0, 140).trimEnd() + (n.content.length > 140 ? '…' : '') : null
                  const wc = wordCount(n.content)
                  const initial = n.profile?.full_name?.[0]?.toUpperCase() ?? '?'

                  return (
                    <div key={n.id} className="nt-card" style={{ background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.07)', borderRadius:18, overflow:'hidden', transition:'border-color .15s, box-shadow .15s', animationDelay:`${idx * 0.05}s` }}
                      onMouseEnter={ev => { ev.currentTarget.style.borderColor = `${accent}30`; ev.currentTarget.style.boxShadow = `0 4px 24px rgba(0,0,0,.3)` }}
                      onMouseLeave={ev => { ev.currentTarget.style.borderColor = 'rgba(255,255,255,.07)'; ev.currentTarget.style.boxShadow = 'none' }}>

                      {/* Accent top strip */}
                      <div style={{ height:3, background:`linear-gradient(90deg,${accent},${accent}66)` }}/>

                      {/* Card header — always visible */}
                      <div style={{ display:'flex', alignItems:'flex-start', gap:14, padding:'16px 18px', cursor:'pointer' }} onClick={() => setExpandedNote(isOpen ? null : n.id)}>

                        {/* Author avatar */}
                        <div style={{ width:36, height:36, borderRadius:12, background:`${accent}22`, border:`1px solid ${accent}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:accent, flexShrink:0, marginTop:2 }}>
                          {initial}
                        </div>

                        {/* Text */}
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:15, fontWeight:700, color:'var(--text-primary)', marginBottom:4, lineHeight:1.3 }}>{n.title}</div>
                          {!isOpen && preview && (
                            <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.6, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{preview}</div>
                          )}
                          <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:6, flexWrap:'wrap' }}>
                            <span style={{ fontSize:10, color:'rgba(255,255,255,.35)', fontWeight:600 }}>
                              {new Date(n.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                            </span>
                            {n.profile?.full_name && (
                              <span style={{ fontSize:10, color:'rgba(255,255,255,.35)' }}>· {n.profile.full_name}</span>
                            )}
                            {wc > 0 && (
                              <span style={{ fontSize:10, fontWeight:700, color:accent, background:`${accent}15`, borderRadius:6, padding:'2px 8px' }}>{wc}w</span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                          {isPresident && (
                            <button
                              onClick={e => { e.stopPropagation(); handleDeleteNote(n.id) }}
                              style={{ background:'transparent', border:'none', color:'rgba(255,255,255,.18)', cursor:'pointer', fontSize:15, padding:'4px 6px', borderRadius:8, fontFamily:'inherit', lineHeight:1, transition:'color .12s' }}
                              onMouseEnter={e => e.currentTarget.style.color='#f87171'}
                              onMouseLeave={e => e.currentTarget.style.color='rgba(255,255,255,.18)'}
                            >✕</button>
                          )}
                          <div style={{ width:28, height:28, borderRadius:8, background:'rgba(255,255,255,.06)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:11, transition:'background .12s' }}>
                            {isOpen ? '▲' : '▼'}
                          </div>
                        </div>
                      </div>

                      {/* Expanded body */}
                      {isOpen && (
                        <div className="nt-body" style={{ borderTop:'1px solid rgba(255,255,255,.06)', margin:'0 18px', paddingBottom:20 }}>
                          {n.content ? (
                            <pre style={{ fontSize:13.5, color:'rgba(255,255,255,.75)', lineHeight:1.85, whiteSpace:'pre-wrap', wordBreak:'break-word', margin:'18px 0 0', fontFamily:'inherit', padding:'16px 18px', background:'rgba(0,0,0,.18)', borderRadius:12, border:'1px solid rgba(255,255,255,.05)' }}>{n.content}</pre>
                          ) : (
                            <div style={{ padding:'20px 0', fontSize:13, color:'rgba(255,255,255,.3)', fontStyle:'italic' }}>No content added.</div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Budget tab ── */}
      {activeTab === 'budget' && (() => {
        const income  = budgetEntries.filter(e => e.type === 'income' ).reduce((s, e) => s + Number(e.amount), 0)
        const expense = budgetEntries.filter(e => e.type === 'expense').reduce((s, e) => s + Number(e.amount), 0)
        const balance = income - expense
        const total   = income + expense || 1
        const incomePct = Math.round((income / total) * 100)
        const balColor = balance >= 0 ? '#4ade80' : '#f87171'

        const catTotals: Record<string, { income: number; expense: number }> = {}
        budgetEntries.forEach(e => {
          const cat = e.category ?? 'Other'
          if (!catTotals[cat]) catTotals[cat] = { income: 0, expense: 0 }
          catTotals[cat][e.type] += Number(e.amount)
        })
        const topCats = Object.entries(catTotals).sort((a, b) => (b[1].income + b[1].expense) - (a[1].income + a[1].expense)).slice(0, 5)

        const filtered = budgetFilter === 'all' ? budgetEntries : budgetEntries.filter(e => e.type === budgetFilter)

        return (
          <div key="budget" className="cc-panel">
            <style>{`
              @keyframes bdSlideIn { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:none} }
              @keyframes bdRowIn { from{opacity:0;transform:translateX(-6px)} to{opacity:1;transform:none} }
              .bd-form { animation: bdSlideIn .22s cubic-bezier(.22,1,.36,1) both }
              .bd-row  { animation: bdRowIn .25s cubic-bezier(.22,1,.36,1) both }
            `}</style>

            {/* ── Hero summary card ── */}
            <div style={{ position:'relative', overflow:'hidden', borderRadius:20, marginBottom:18, background:'linear-gradient(135deg,rgba(16,22,12,.9),rgba(12,16,22,.9))', border:`1px solid ${balColor}28`, padding:'24px 26px' }}>
              <div style={{ position:'absolute', top:-50, right:-50, width:200, height:200, borderRadius:'50%', background:`radial-gradient(circle,${balColor}18 0%,transparent 70%)`, pointerEvents:'none' }}/>

              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
                <div>
                  <div style={{ fontSize:10, fontWeight:800, color:'rgba(255,255,255,.4)', letterSpacing:'.14em', textTransform:'uppercase', marginBottom:6 }}>Current Balance</div>
                  <div style={{ fontSize:40, fontWeight:900, color:balColor, letterSpacing:'-2px', lineHeight:1 }}>
                    {balance < 0 ? '-' : ''}${Math.abs(balance).toFixed(2)}
                  </div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,.35)', marginTop:6 }}>
                    {budgetEntries.length} entr{budgetEntries.length !== 1 ? 'ies' : 'y'} recorded
                  </div>
                </div>
                {(isPresident || canDo('manage_budget')) && (
                  <button
                    onClick={() => setShowBudgetForm(v => !v)}
                    style={{ background: showBudgetForm ? 'rgba(255,255,255,.06)' : 'var(--accent)', border: showBudgetForm ? '1px solid rgba(255,255,255,.15)' : 'none', borderRadius:12, padding:'10px 20px', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', flexShrink:0, transition:'all .15s' }}
                  >
                    {showBudgetForm ? '✕ Cancel' : '+ Add Entry'}
                  </button>
                )}
              </div>

              {/* Income/Expense split bar */}
              <div style={{ marginBottom:16 }}>
                <div style={{ display:'flex', height:6, borderRadius:9999, overflow:'hidden', background:'rgba(255,255,255,.07)', marginBottom:10 }}>
                  <div style={{ width:`${incomePct}%`, background:'linear-gradient(90deg,#16a34a,#4ade80)', transition:'width .8s cubic-bezier(.22,1,.36,1)', borderRadius:'9999px 0 0 9999px' }}/>
                  <div style={{ flex:1, background:'linear-gradient(90deg,#f87171,#dc2626)', borderRadius:'0 9999px 9999px 0' }}/>
                </div>
                <div style={{ display:'flex', gap:20 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:'#4ade80', boxShadow:'0 0 6px #4ade8088', flexShrink:0 }}/>
                    <span style={{ fontSize:11, color:'rgba(255,255,255,.45)' }}>Income</span>
                    <span style={{ fontSize:14, fontWeight:800, color:'#4ade80' }}>${income.toFixed(2)}</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:'#f87171', boxShadow:'0 0 6px #f8717188', flexShrink:0 }}/>
                    <span style={{ fontSize:11, color:'rgba(255,255,255,.45)' }}>Expenses</span>
                    <span style={{ fontSize:14, fontWeight:800, color:'#f87171' }}>${expense.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Top categories */}
              {topCats.length > 0 && (
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {topCats.map(([cat, v]) => (
                    <div key={cat} style={{ background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', borderRadius:9999, padding:'3px 12px', fontSize:11, color:'rgba(255,255,255,.6)', fontWeight:600 }}>
                      {cat} · <span style={{ color: v.expense > v.income ? '#f87171' : '#4ade80' }}>${(v.income + v.expense).toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Add Entry Form ── */}
            {showBudgetForm && (
              <div className="bd-form" style={{ background:'rgba(20,28,20,.7)', border:'1px solid rgba(74,222,128,.18)', borderRadius:18, padding:'22px 22px', marginBottom:18 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', marginBottom:16 }}>New Entry</div>

                {/* Type toggle */}
                <div style={{ display:'flex', background:'rgba(0,0,0,.25)', borderRadius:12, padding:4, marginBottom:16, gap:4 }}>
                  {(['income','expense'] as const).map(t => (
                    <button key={t} onClick={() => setBudgetType(t)} style={{
                      flex:1, padding:'9px 0', borderRadius:9, border:'none', fontFamily:'inherit', fontSize:13, fontWeight:700, cursor:'pointer', transition:'all .15s',
                      background: budgetType===t ? (t==='income' ? 'rgba(74,222,128,.18)' : 'rgba(248,113,113,.18)') : 'transparent',
                      color: budgetType===t ? (t==='income' ? '#4ade80' : '#f87171') : 'rgba(255,255,255,.35)',
                      boxShadow: budgetType===t ? `0 0 0 1px ${t==='income'?'rgba(74,222,128,.3)':'rgba(248,113,113,.3)'}` : 'none',
                    }}>
                      {t === 'income' ? '↑ Income' : '↓ Expense'}
                    </button>
                  ))}
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                  <div>
                    <label style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,.4)', textTransform:'uppercase', letterSpacing:'.1em', display:'block', marginBottom:6 }}>Amount</label>
                    <div style={{ position:'relative' }}>
                      <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'rgba(255,255,255,.35)', fontSize:14, fontWeight:700 }}>$</span>
                      <input type="number" min="0" step="0.01" value={budgetAmount} onChange={e => setBudgetAmount(e.target.value)} placeholder="0.00" style={{ ...fi, paddingLeft:28 }}/>
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,.4)', textTransform:'uppercase', letterSpacing:'.1em', display:'block', marginBottom:6 }}>Date</label>
                    <input type="date" value={budgetDate} onChange={e => setBudgetDate(e.target.value)} style={fi}/>
                  </div>
                  <div>
                    <label style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,.4)', textTransform:'uppercase', letterSpacing:'.1em', display:'block', marginBottom:6 }}>Description</label>
                    <input value={budgetDesc} onChange={e => setBudgetDesc(e.target.value)} placeholder="What's this for?" style={fi}/>
                  </div>
                  <div>
                    <label style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,.4)', textTransform:'uppercase', letterSpacing:'.1em', display:'block', marginBottom:6 }}>Category</label>
                    <input value={budgetCategory} onChange={e => setBudgetCategory(e.target.value)} placeholder="Food, Printing, Venue…" style={fi}/>
                  </div>
                </div>

                <div style={{ display:'flex', justifyContent:'flex-end' }}>
                  <button
                    onClick={handleSaveBudget}
                    disabled={savingBudget || !budgetDesc.trim() || !budgetAmount}
                    style={{ background: budgetType==='income' ? 'linear-gradient(135deg,#15803d,#4ade80)' : 'linear-gradient(135deg,#dc2626,#f87171)', border:'none', borderRadius:12, padding:'10px 28px', color:'#fff', fontSize:13, fontWeight:800, cursor: savingBudget||!budgetDesc.trim()||!budgetAmount ? 'default':'pointer', opacity: savingBudget||!budgetDesc.trim()||!budgetAmount ? .45:1, fontFamily:'inherit', boxShadow: budgetType==='income' ? '0 4px 16px rgba(74,222,128,.3)':'0 4px 16px rgba(248,113,113,.3)', transition:'opacity .15s' }}
                  >
                    {savingBudget ? 'Saving…' : `Add ${budgetType === 'income' ? 'Income' : 'Expense'}`}
                  </button>
                </div>
              </div>
            )}

            {/* ── Entry list ── */}
            {budgetEntries.length === 0 ? (
              <div style={{ textAlign:'center', padding:'70px 20px' }}>
                <div style={{ fontSize:48, marginBottom:14, opacity:.25 }}>💳</div>
                <div style={{ fontSize:15, fontWeight:700, color:'var(--text-primary)', marginBottom:6 }}>No entries yet</div>
                <div style={{ fontSize:13, color:'var(--text-muted)' }}>Add your first income or expense to get started</div>
              </div>
            ) : (
              <>
                {/* Filter pills */}
                <div style={{ display:'flex', gap:8, marginBottom:14, alignItems:'center' }}>
                  <span style={{ fontSize:11, color:'rgba(255,255,255,.35)', fontWeight:600, marginRight:4 }}>SHOW</span>
                  {(['all','income','expense'] as const).map(f => (
                    <button key={f} onClick={() => setBudgetFilter(f)} style={{
                      padding:'5px 14px', borderRadius:9999, fontSize:12, fontWeight:700, fontFamily:'inherit', cursor:'pointer', transition:'all .15s',
                      background: budgetFilter===f ? (f==='income'?'rgba(74,222,128,.15)':f==='expense'?'rgba(248,113,113,.15)':'rgba(255,255,255,.08)') : 'transparent',
                      border: `1px solid ${budgetFilter===f?(f==='income'?'rgba(74,222,128,.4)':f==='expense'?'rgba(248,113,113,.4)':'rgba(255,255,255,.18)'):'rgba(255,255,255,.08)'}`,
                      color: budgetFilter===f ? (f==='income'?'#4ade80':f==='expense'?'#f87171':'#fff') : 'rgba(255,255,255,.4)',
                    }}>
                      {f === 'all' ? `All (${budgetEntries.length})` : f === 'income' ? `↑ Income (${budgetEntries.filter(e=>e.type==='income').length})` : `↓ Expenses (${budgetEntries.filter(e=>e.type==='expense').length})`}
                    </button>
                  ))}
                </div>

                <div style={{ background:'rgba(255,255,255,.02)', border:'1px solid rgba(255,255,255,.07)', borderRadius:16, overflow:'hidden' }}>
                  {filtered.length === 0 ? (
                    <div style={{ padding:'32px 20px', textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>No {budgetFilter} entries</div>
                  ) : filtered.map((e, i) => {
                    const isInc = e.type === 'income'
                    const col = isInc ? '#4ade80' : '#f87171'
                    return (
                      <div key={e.id} className="bd-row" style={{ display:'grid', gridTemplateColumns:'44px 1fr auto auto', gap:0, alignItems:'center', borderBottom: i < filtered.length-1 ? '1px solid rgba(255,255,255,.05)':'none', transition:'background .12s', animationDelay:`${i*0.04}s` }}
                        onMouseEnter={ev => ev.currentTarget.style.background='rgba(255,255,255,.03)'}
                        onMouseLeave={ev => ev.currentTarget.style.background='transparent'}>
                        {/* Icon */}
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', padding:'14px 0 14px 14px' }}>
                          <div style={{ width:32, height:32, borderRadius:10, background:`${col}14`, border:`1px solid ${col}28`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, color:col, fontWeight:900, flexShrink:0 }}>
                            {isInc ? '↑' : '↓'}
                          </div>
                        </div>
                        {/* Description + meta */}
                        <div style={{ padding:'14px 14px', minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', marginBottom:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.description}</div>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            {e.category && (
                              <span style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,.4)', background:'rgba(255,255,255,.07)', borderRadius:6, padding:'2px 8px' }}>{e.category}</span>
                            )}
                            <span style={{ fontSize:11, color:'rgba(255,255,255,.3)' }}>
                              {new Date(e.entry_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                            </span>
                          </div>
                        </div>
                        {/* Amount */}
                        <div style={{ padding:'14px 10px 14px 0', fontSize:15, fontWeight:900, color:col, letterSpacing:'-.3px', flexShrink:0 }}>
                          {isInc ? '+' : '-'}${Number(e.amount).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
                        </div>
                        {/* Delete */}
                        {(isPresident || canDo('manage_budget')) && (
                          <button onClick={() => handleDeleteBudgetEntry(e.id)} style={{ padding:'14px 14px 14px 4px', background:'transparent', border:'none', color:'rgba(255,255,255,.15)', cursor:'pointer', fontSize:16, fontFamily:'inherit', flexShrink:0, transition:'color .12s', lineHeight:1 }}
                            onMouseEnter={ev => ev.currentTarget.style.color='#f87171'}
                            onMouseLeave={ev => ev.currentTarget.style.color='rgba(255,255,255,.15)'}>✕</button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )
      })()}

      {/* ── Tournaments tab ── */}
      {activeTab === 'tournaments' && (() => {
        const SPORTS = ['Basketball', 'Football', 'Volleyball', 'Tennis', 'Badminton', 'Cricket', 'Swimming', 'Athletics', 'Chess', 'Gaming', 'Table Tennis', 'Rugby', 'Baseball', 'Hockey', 'Other']
        const STATUS_COLORS: Record<string, { color: string; bg: string; label: string }> = {
          registration_open: { color: '#4ade80', bg: 'rgba(74,222,128,0.12)', label: 'Open' },
          registration_closed: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Reg. Closed' },
          ongoing: { color: '#f97316', bg: 'rgba(249,115,22,0.14)', label: 'Live' },
          completed: { color: '#6b7280', bg: 'rgba(107,114,128,0.12)', label: 'Done' },
          cancelled: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'Cancelled' },
        }
        return (
          <div key="tournaments" className="cc-panel">
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>Tournaments</h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Create and manage tournaments hosted by your club</p>
              </div>
              <button onClick={() => setShowTournamentForm(v => !v)} style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '9px 16px', background: showTournamentForm ? 'rgba(255,255,255,0.08)' : 'var(--accent)',
                border: 'none', borderRadius: 10, color: '#fff', cursor: 'pointer',
                fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
                boxShadow: showTournamentForm ? 'none' : '0 4px 16px rgba(138,21,56,0.35)',
                transition: 'all 0.15s',
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                {showTournamentForm ? 'Cancel' : 'New Tournament'}
              </button>
            </div>

            {/* Create form */}
            {showTournamentForm && (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(138,21,56,0.2)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 18 }}>New Tournament</h3>


                {/* Tournament logo picker */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <div
                    onClick={() => tourLogoRef.current?.click()}
                    style={{ width: 60, height: 60, borderRadius: 14, background: tourLogoPreview ? 'transparent' : 'rgba(255,255,255,0.05)', border: tourLogoPreview ? '2px solid rgba(138,21,56,0.3)' : '2px dashed rgba(255,255,255,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, transition: 'border-color 0.15s' }}
                    onMouseEnter={e => !tourLogoPreview && (e.currentTarget.style.borderColor = 'rgba(138,21,56,0.5)')}
                    onMouseLeave={e => !tourLogoPreview && (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)')}
                  >
                    {tourLogoPreview
                      ? <img src={tourLogoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    }
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>Tournament Logo</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Optional · Click to upload · PNG or JPG</div>
                    {tourLogoPreview && (
                      <button onClick={() => { setTourLogoFile(null); setTourLogoPreview(null) }} style={{ marginTop: 4, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11.5, padding: 0, fontFamily: 'inherit', textDecoration: 'underline' }}>Remove</button>
                    )}
                  </div>
                  <input ref={tourLogoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setTourLogoFile(file)
                    setTourLogoPreview(URL.createObjectURL(file))
                  }} />
                </div>

                <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tournament Name *</label>
                    <input value={tourName} onChange={e => setTourName(e.target.value)} placeholder="e.g. Spring Basketball Cup" style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, color: 'var(--text-primary)', fontSize: 13.5, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Sport *</label>
                    <select value={tourSport} onChange={e => setTourSport(e.target.value)} style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, color: 'var(--text-primary)', fontSize: 13.5, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}>
                      {SPORTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {tourSport === 'Other' && (
                      <input value={tourCustomSport} onChange={e => setTourCustomSport(e.target.value)} placeholder="Enter sport name…" style={{ width: '100%', marginTop: 8, padding: '9px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, color: 'var(--text-primary)', fontSize: 13.5, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                    )}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Max Teams</label>
                    <input type="number" min={2} max={128} value={tourMaxTeams} onChange={e => setTourMaxTeams(e.target.value)} style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, color: 'var(--text-primary)', fontSize: 13.5, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Location *</label>
                    <input value={tourLocation} onChange={e => setTourLocation(e.target.value)} placeholder="e.g. Main Sports Hall" style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.06)', border: `1px solid ${!tourLocation.trim() && tournamentError.includes('Location') ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 9, color: 'var(--text-primary)', fontSize: 13.5, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Registration Deadline</label>
                    <input type="datetime-local" value={tourRegDeadline} onChange={e => setTourRegDeadline(e.target.value)} style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', colorScheme: 'dark' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Start Date</label>
                    <input type="datetime-local" value={tourStartDate} onChange={e => setTourStartDate(e.target.value)} style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', colorScheme: 'dark' }} />
                  </div>
                </div>
                <div style={{ marginTop: 14 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Description</label>
                  <textarea value={tourDesc} onChange={e => setTourDesc(e.target.value)} placeholder="What's this tournament about?" rows={2} style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, color: 'var(--text-primary)', fontSize: 13.5, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                </div>
                <div style={{ marginTop: 10 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Rules</label>
                  <textarea value={tourRules} onChange={e => setTourRules(e.target.value)} placeholder="Tournament rules and regulations..." rows={3} style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, color: 'var(--text-primary)', fontSize: 13.5, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                </div>

                {/* Prizes */}
                <div style={{ marginTop: 18, padding: 16, background: 'rgba(233,193,118,0.05)', border: '1px solid rgba(233,193,118,0.15)', borderRadius: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#e9c176' }}>🏆 Prizes</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>Set prize tiers — leave blank to skip any tier</div>
                    </div>
                    <button onClick={() => setTourPrizes(prev => [...prev, { place: `${prev.length + 1}th Place`, description: '' }])} style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px',
                      background: 'rgba(233,193,118,0.1)', border: '1px solid rgba(233,193,118,0.3)',
                      borderRadius: 8, color: '#e9c176', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                    }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Add Tier
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {tourPrizes.map((prize, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 16, flexShrink: 0 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅'}</span>
                        <input
                          value={prize.place}
                          onChange={e => setTourPrizes(prev => prev.map((p, j) => j === i ? { ...p, place: e.target.value } : p))}
                          placeholder="e.g. 1st Place"
                          style={{ flex: 1, padding: '8px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12.5, outline: 'none', fontFamily: 'inherit', fontWeight: 600 }}
                        />
                        <input
                          value={prize.description}
                          onChange={e => setTourPrizes(prev => prev.map((p, j) => j === i ? { ...p, description: e.target.value } : p))}
                          placeholder="e.g. Gold medal + AED 500"
                          style={{ flex: 3, padding: '8px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                        />
                        <button
                          onClick={() => setTourPrizes(prev => prev.filter((_, j) => j !== i))}
                          title="Remove tier"
                          style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7, color: '#f87171', cursor: 'pointer', flexShrink: 0 }}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Custom registration fields builder */}
                <div style={{ marginTop: 14, padding: 16, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Registration Fields</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>Ask teams extra questions when they register</div>
                    </div>
                    <button onClick={() => setTourCustomFields(prev => [...prev, { id: `f_${Date.now()}`, label: '', type: 'text', options: [] }])} style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px',
                      background: 'rgba(138,21,56,0.15)', border: '1px solid rgba(138,21,56,0.3)',
                      borderRadius: 8, color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                    }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Add Field
                    </button>
                  </div>
                  {tourCustomFields.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>
                      No custom fields — teams only fill in team name &amp; players by default
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {tourCustomFields.map(field => (
                        <div key={field.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 10 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                              value={field.label}
                              onChange={e => setTourCustomFields(prev => prev.map(f => f.id === field.id ? { ...f, label: e.target.value } : f))}
                              placeholder="Field label (e.g. Student ID)"
                              style={{ flex: 3, padding: '7px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                            />
                            <select
                              value={field.type}
                              onChange={e => setTourCustomFields(prev => prev.map(f => f.id === field.id ? { ...f, type: e.target.value, options: e.target.value === 'multiple_choice' ? (f.options.length ? f.options : ['', '']) : f.options } : f))}
                              style={{ flex: 2, padding: '7px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: 'var(--text-primary)', fontSize: 12.5, outline: 'none', fontFamily: 'inherit' }}
                            >
                              <option value="text">Short Text</option>
                              <option value="number">Number</option>
                              <option value="textarea">Long Text</option>
                              <option value="multiple_choice">Multiple Choice</option>
                            </select>
                            <button
                              onClick={() => setTourCustomFields(prev => prev.filter(f => f.id !== field.id))}
                              title="Remove field"
                              style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 7, color: '#f87171', cursor: 'pointer', flexShrink: 0 }}
                            >
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
                                    <input
                                      value={opt}
                                      onChange={e => setTourCustomFields(prev => prev.map(f => f.id === field.id ? { ...f, options: f.options.map((o, j) => j === oi ? e.target.value : o) } : f))}
                                      placeholder={`Option ${oi + 1}`}
                                      style={{ flex: 1, padding: '6px 9px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 7, color: 'var(--text-primary)', fontSize: 12.5, outline: 'none', fontFamily: 'inherit' }}
                                    />
                                    {field.options.length > 2 && (
                                      <button
                                        onClick={() => setTourCustomFields(prev => prev.map(f => f.id === field.id ? { ...f, options: f.options.filter((_, j) => j !== oi) } : f))}
                                        style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', borderRadius: 4, flexShrink: 0 }}
                                      >
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                              <button
                                onClick={() => setTourCustomFields(prev => prev.map(f => f.id === field.id ? { ...f, options: [...f.options, ''] } : f))}
                                style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'none', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 7, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11.5, fontFamily: 'inherit' }}
                              >
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

                {tournamentError && (
                  <div style={{ marginTop: 12, fontSize: 13, color: '#f87171', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px' }}>
                    {tournamentError}
                  </div>
                )}
                <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
                  <button onClick={createTournament} disabled={creatingTournament || !tourName.trim()} style={{
                    flex: 2, padding: '11px', background: creatingTournament ? 'rgba(138,21,56,0.4)' : 'var(--accent)',
                    border: 'none', borderRadius: 11, color: '#fff', fontSize: 14, fontWeight: 700,
                    cursor: creatingTournament ? 'default' : 'pointer',
                    boxShadow: creatingTournament ? 'none' : '0 4px 16px rgba(138,21,56,0.35)',
                    opacity: !tourName.trim() ? 0.5 : 1, fontFamily: 'inherit',
                  }}>
                    {creatingTournament ? 'Creating…' : 'Create Tournament'}
                  </button>
                  <button onClick={() => setShowTournamentForm(false)} style={{ flex: 1, padding: '11px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 11, color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Tournament list */}
            {loadingTournaments ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                <div style={{ width: 22, height: 22, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              </div>
            ) : tournaments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: 14 }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>🏆</div>
                No tournaments yet. Create one to get started!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {tournaments.map(t => {
                  const sc = STATUS_COLORS[t.status] ?? STATUS_COLORS.registration_open
                  return (
                    <div key={t.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{t.name}</span>
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: sc.color, background: sc.bg, borderRadius: 999, padding: '2px 8px' }}>{sc.label}</span>
                          {t._pending > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#f87171', background: 'rgba(239,68,68,0.12)', borderRadius: 999, padding: '2px 8px' }}>{t._pending} pending</span>}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {t.sport} · {t.format === 'single_elimination' ? 'Knockout' : 'Round Robin'} · {t._accepted}/{t.max_teams} teams
                          {t.start_date && <> · {new Date(t.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => navigate(`/tournaments/${t.id}`)} style={{
                          padding: '8px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 9, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                          whiteSpace: 'nowrap', transition: 'all 0.15s',
                        }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)' }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
                        >
                          Manage →
                        </button>
                        {deleteTournamentConfirmId === t.id ? (
                          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                            <span style={{ fontSize: 11.5, color: '#f87171', whiteSpace: 'nowrap' }}>Delete?</span>
                            <button
                              onClick={() => deleteTournament(t.id)}
                              disabled={deletingTournamentId === t.id}
                              style={{ padding: '6px 10px', background: 'rgba(239,68,68,0.8)', border: 'none', borderRadius: 7, color: '#fff', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit' }}
                            >
                              {deletingTournamentId === t.id ? '…' : 'Yes'}
                            </button>
                            <button onClick={() => setDeleteTournamentConfirmId(null)} style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11.5, fontFamily: 'inherit' }}>No</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteTournamentConfirmId(t.id)}
                            title="Delete tournament"
                            style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 9, color: '#f87171', cursor: 'pointer', transition: 'all 0.15s' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.07)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.18)' }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Modals (always rendered) ── */}
      {showDeleteConfirm && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 18, padding: 28, width: '100%', maxWidth: 420, boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ fontSize: 28, marginBottom: 12, textAlign: 'center' }}>⚠️</div>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: '#f87171', marginBottom: 8, textAlign: 'center' }}>Delete {club.name}?</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.65, marginBottom: 20, textAlign: 'center' }}>
              This will permanently delete the club and all its data. Type the club name to confirm.
            </p>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>
                Type <strong style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{club.name}</strong> to confirm
              </div>
              <input
                value={deleteConfirmName}
                onChange={e => setDeleteConfirmName(e.target.value)}
                placeholder={club.name}
                autoFocus
                style={{ ...fi, borderColor: deleteConfirmName && deleteConfirmName !== club.name ? 'rgba(239,68,68,0.5)' : undefined }}
              />
            </div>
            {deleteError && <div style={{ fontSize: 12, color: '#f87171', marginBottom: 10 }}>{deleteError}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deletingClub}
                style={{ flex: 1, padding: '10px', borderRadius: 9, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteClub}
                disabled={deleteConfirmName.trim() !== club.name || deletingClub}
                style={{ flex: 1, padding: '10px', borderRadius: 9, background: deleteConfirmName.trim() === club.name ? 'rgba(239,68,68,0.85)' : 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: deleteConfirmName.trim() === club.name && !deletingClub ? 'pointer' : 'default', fontFamily: 'inherit', opacity: deleteConfirmName.trim() !== club.name || deletingClub ? 0.5 : 1, transition: 'all 0.15s' }}
              >
                {deletingClub ? 'Deleting…' : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {bannerCropFile && <BannerCropModal file={bannerCropFile} onSave={handleBannerCropSave} onClose={() => setBannerCropFile(null)} />}
      {qrEvent && <QRModal event={qrEvent} onClose={() => setQrEvent(null)} />}
      {certEvent && <CertificateModal event={certEvent} club={club} members={teamMembers} onClose={() => setCertEvent(null)} />}
      {lightboxSrc && createPortal(
        <div onClick={() => setLightboxSrc(null)} style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.93)', backdropFilter:'blur(18px)', display:'flex', alignItems:'center', justifyContent:'center', padding:20, cursor:'zoom-out' }}>
          <img src={lightboxSrc} alt="" onClick={e => e.stopPropagation()} style={{ maxWidth:'92vw', maxHeight:'88vh', objectFit:'contain', borderRadius:14, boxShadow:'0 32px 80px rgba(0,0,0,0.7)', cursor:'default' }} />
          <button onClick={() => setLightboxSrc(null)} style={{ position:'absolute', top:18, right:18, width:38, height:38, borderRadius:'50%', background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)', color:'#fff', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'inherit' }}>✕</button>
        </div>,
        document.body
      )}
      {evtAnnEvent && <EventAnnouncementModal event={evtAnnEvent} announcements={evtAnnouncements} content={evtAnnContent} posting={postingEvtAnn} onContentChange={setEvtAnnContent} onPost={handlePostEventAnn} onClose={() => setEvtAnnEvent(null)} />}
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const fi: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-muted)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '9px 12px',
  color: 'var(--text-primary)',
  fontSize: 14,
  outline: 'none',
  fontFamily: 'inherit',
}

// ─── SVG Icon primitives ─────────────────────────────────────────────────────

const IcoCrown = ({ size = 14, style }: { size?: number; style?: React.CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style}>
    <path d="M2 19.5h20v2H2v-2zM12 2L8 9 2 6l3 11.5h14L22 6l-6 3-4-7z"/>
  </svg>
)

const IcoKey = ({ size = 15, style }: { size?: number; style?: React.CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <circle cx="7.5" cy="15.5" r="5.5"/>
    <path d="M21 2L11 12"/>
    <path d="M15 7l3 3"/>
  </svg>
)

const IcoUsers = ({ size = 44, style }: { size?: number; style?: React.CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)

const IcoCheck = ({ size = 13, style }: { size?: number; style?: React.CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)

function PrivIcon({ pKey, size = 14, style }: { pKey: string; size?: number; style?: React.CSSProperties }) {
  const s: React.CSSProperties = { ...style, width: size, height: size, flexShrink: 0 }
  const p = { fill: 'none' as const, stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (pKey) {
    case 'remove_members': return (
      <svg viewBox="0 0 24 24" style={s} {...p}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="8.5" cy="7" r="4"/>
        <line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/>
      </svg>
    )
    case 'accept_members': return (
      <svg viewBox="0 0 24 24" style={s} {...p}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="8.5" cy="7" r="4"/>
        <polyline points="17 11 19 13 23 9"/>
      </svg>
    )
    case 'post_announcements': return (
      <svg viewBox="0 0 24 24" style={s} {...p}>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
      </svg>
    )
    case 'manage_notes': return (
      <svg viewBox="0 0 24 24" style={s} {...p}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    )
    case 'manage_events': return (
      <svg viewBox="0 0 24 24" style={s} {...p}>
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    )
    case 'edit_appearance': return (
      <svg viewBox="0 0 24 24" style={s} {...p}>
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
    )
    case 'manage_budget': return (
      <svg viewBox="0 0 24 24" style={s} {...p}>
        <line x1="12" y1="1" x2="12" y2="23"/>
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    )
    default: return (
      <svg viewBox="0 0 24 24" style={s} {...p}>
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    )
  }
}

function TeamAvatar({ name, size = 38 }: { name?: string | null; size?: number }) {
  const l = (name ?? '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg,#8a1538,#c0185c)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.33), fontWeight: 800, color: '#fff',
      border: '2px solid rgba(255,255,255,0.1)',
      boxShadow: '0 2px 10px rgba(138,21,56,0.4)',
    }}>{l}</div>
  )
}

// ─── RoleTags ──────────────────────────────────────────────────────────────
// Stateful tag-picker: Member | Custom
// Uses a ref for customText so callers always read the latest value on blur.

function RoleTags({
  role, customRole, onChange, disabled,
}: {
  role: 'officer' | 'member'
  customRole?: string | null
  onChange: (role: 'officer' | 'member', customRole?: string) => void
  disabled?: boolean
}) {
  const initCustom = customRole ?? (role === 'officer' ? 'Admin' : '')
  const initTag: 'member' | 'custom' = initCustom ? 'custom' : 'member'

  const [activeTag, setActiveTag] = useState<'member' | 'custom'>(initTag)
  const [customText, setCustomText] = useState(initCustom)
  const [inputOpen, setInputOpen] = useState(false)
  const customTextRef = useRef(initCustom)

  const commitText = (raw: string) => {
    const text = raw.trim()
    if (text) {
      setCustomText(text)
      customTextRef.current = text
      setInputOpen(false)
      onChange('member', text)
    } else {
      setActiveTag('member')
      setCustomText('')
      customTextRef.current = ''
      setInputOpen(false)
      onChange('member')
    }
  }

  const tagSt = (active: boolean): React.CSSProperties => ({
    padding: '3px 11px', borderRadius: 9999, fontSize: 11, fontWeight: 700,
    letterSpacing: '0.04em', cursor: disabled ? 'default' : 'pointer',
    border: active ? '1px solid var(--accent)' : '1px solid rgba(87,65,68,0.3)',
    background: active ? 'rgba(138,21,56,0.2)' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    transition: 'all 0.15s', userSelect: 'none' as const, flexShrink: 0,
    opacity: disabled ? 0.5 : 1,
  })

  // Custom tag label shows the committed text once entered
  const customLabel = activeTag === 'custom' && customText ? customText : 'Custom'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
      {/* Member tag */}
      <span
        style={tagSt(activeTag === 'member')}
        onClick={() => {
          if (disabled) return
          setActiveTag('member'); setCustomText(''); customTextRef.current = ''
          setInputOpen(false); onChange('member')
        }}
      >
        Member
      </span>

      {/* Custom tag — shows committed text as its own label once set */}
      <span
        style={tagSt(activeTag === 'custom')}
        onClick={() => {
          if (disabled) return
          setActiveTag('custom')
          setInputOpen(true)
        }}
      >
        {customLabel}
      </span>

      {/* Inline text input — only visible while typing */}
      {inputOpen && (
        <input
          autoFocus
          value={customText}
          onChange={e => { setCustomText(e.target.value); customTextRef.current = e.target.value }}
          onKeyDown={e => {
            if (e.key === 'Enter') commitText(customTextRef.current)
            if (e.key === 'Escape') {
              setActiveTag('member'); setCustomText(''); customTextRef.current = ''
              setInputOpen(false); onChange('member')
            }
          }}
          onBlur={() => commitText(customTextRef.current)}
          placeholder="e.g. Treasurer"
          style={{
            background: 'rgba(41,28,30,0.8)', border: '1px solid rgba(138,21,56,0.5)',
            borderRadius: 7, padding: '3px 9px', color: 'var(--text-primary)',
            fontSize: 12, outline: 'none', width: 120, flexShrink: 0,
          }}
        />
      )}
    </div>
  )
}

// ─── NewMemberRow ───────────────────────────────────────────────────────────
// Own component so local state + ref are fresh when the Add button fires.

function NewMemberRow({
  profile, isLoading, onAdd,
}: {
  profile: ProfileSearchRow
  isLoading: boolean
  onAdd: (userId: string, role: 'officer' | 'member', customRole?: string) => void
}) {
  const [role, setRole] = useState<'officer' | 'member'>('member')
  const [customRole, setCustomRole] = useState<string | undefined>()
  const pendingRef = useRef<{ role: 'officer' | 'member'; customRole?: string }>({ role: 'member' })

  const handleChange = (r: 'officer' | 'member', c?: string) => {
    setRole(r); setCustomRole(c)
    pendingRef.current = { role: r, customRole: c }
  }

  return (
    <div className="tm-card" style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', borderRadius:14, background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.07)', transition:'border-color .15s' }}
      onMouseEnter={e => e.currentTarget.style.borderColor='rgba(255,255,255,.14)'}
      onMouseLeave={e => e.currentTarget.style.borderColor='rgba(255,255,255,.07)'}>
      <TeamAvatar name={profile.full_name} size={40}/>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', marginBottom:2 }}>{profile.full_name ?? 'Unknown'}</div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {profile.school && <span style={{ fontSize:11, color:'var(--text-muted)' }}>{profile.school}</span>}
          {profile.email  && <span style={{ fontSize:11, color:'rgba(255,255,255,.3)' }}>{profile.email}</span>}
        </div>
      </div>
      <RoleTags key={`new-${profile.id}`} role={role} customRole={customRole ?? null} onChange={handleChange}/>
      <button
        onMouseDown={e => e.preventDefault()}
        onClick={() => onAdd(profile.id, pendingRef.current.role, pendingRef.current.customRole)}
        disabled={isLoading}
        style={{ padding:'7px 16px', borderRadius:10, background: isLoading ? 'rgba(138,21,56,.3)' : 'var(--accent)', border:'none', color:'#fff', fontSize:12, fontWeight:800, cursor: isLoading ? 'default' : 'pointer', flexShrink:0, fontFamily:'inherit', boxShadow: isLoading ? 'none' : '0 0 14px rgba(138,21,56,.4)', transition:'all .15s' }}
      >{isLoading ? '…' : '+ Add'}</button>
    </div>
  )
}

// ─── PresidentRow ───────────────────────────────────────────────────────────

function PresidentRow({ member, idx, isLoading, canDemote, onDemote }: {
  member: MembershipRow; idx: number; isLoading: boolean; canDemote: boolean; onDemote: (id: string) => void
}) {
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState(false)
  return (
    <div className="tm-card" style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 18px', borderRadius:16, background:'rgba(233,193,118,.04)', border:'1px solid rgba(233,193,118,.15)', animationDelay:`${idx*.05}s`, marginBottom:8 }}>
      <div onClick={() => navigate(`/profile/${member.user_id}`)} style={{ cursor:'pointer', flexShrink:0 }}><TeamAvatar name={member.profile?.full_name} size={42}/></div>
      <div style={{ flex:1, minWidth:0 }}>
        <div onClick={() => navigate(`/profile/${member.user_id}`)} style={{ fontSize:15, fontWeight:800, color:'var(--text-primary)', marginBottom:3, cursor:'pointer' }}>{member.profile?.full_name ?? 'Unknown'}</div>
        {member.profile?.school && <div style={{ fontSize:11, color:'var(--text-muted)' }}>{member.profile.school}</div>}
        {member.profile?.email  && <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:1 }}>{member.profile.email}</div>}
      </div>
      <span style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, fontWeight:800, padding:'5px 14px', borderRadius:9999, background:'rgba(233,193,118,.12)', color:'#e9c176', border:'1px solid rgba(233,193,118,.25)', flexShrink:0 }}>
        <IcoCrown size={12} style={{ animation:'crownGlow 2.5s ease-in-out infinite' }}/>President
      </span>
      {canDemote && !confirm && (
        <button onClick={() => setConfirm(true)} disabled={isLoading} title="Remove presidency"
          style={{ height:28, padding:'0 10px', borderRadius:9, background:'rgba(233,193,118,.08)', border:'1px solid rgba(233,193,118,.25)', color:'#e9c176', cursor: isLoading ? 'default':'pointer', flexShrink:0, display:'flex', alignItems:'center', gap:5, opacity: isLoading ? .5:1, transition:'all .15s' }}
          onMouseEnter={e => { e.currentTarget.style.background='rgba(248,113,113,.12)'; e.currentTarget.style.borderColor='rgba(248,113,113,.45)'; e.currentTarget.style.color='#f87171' }}
          onMouseLeave={e => { e.currentTarget.style.background='rgba(233,193,118,.08)'; e.currentTarget.style.borderColor='rgba(233,193,118,.25)'; e.currentTarget.style.color='#e9c176' }}
        >
          <IcoCrown size={11}/><span style={{ fontSize:11, fontWeight:800 }}>✕</span>
        </button>
      )}
      {canDemote && confirm && (
        <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0, animation:'confirmIn .18s cubic-bezier(.22,1,.36,1) both' }}>
          <span style={{ fontSize:11, fontWeight:700, color:'#f87171', whiteSpace:'nowrap' }}>Remove?</span>
          <button onClick={() => { onDemote(member.id); setConfirm(false) }} disabled={isLoading}
            style={{ padding:'5px 12px', borderRadius:8, background:'rgba(248,113,113,.12)', border:'1px solid rgba(248,113,113,.4)', color:'#f87171', fontSize:11, fontWeight:800, cursor:'pointer', fontFamily:'inherit', lineHeight:1 }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(248,113,113,.25)' }}
            onMouseLeave={e => { e.currentTarget.style.background='rgba(248,113,113,.12)' }}
          >Yes</button>
          <button onClick={() => setConfirm(false)}
            style={{ padding:'5px 10px', borderRadius:8, background:'transparent', border:'1px solid rgba(255,255,255,.12)', color:'rgba(255,255,255,.45)', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', lineHeight:1 }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,.07)' }}
            onMouseLeave={e => { e.currentTarget.style.background='transparent' }}
          >No</button>
        </div>
      )}
    </div>
  )
}

// ─── ExistingMemberRow ──────────────────────────────────────────────────────

function ExistingMemberRow({
  profile, membership, isLoading, canRemove = true, canEditRole = true, canMakePresident = false, onRoleChange, onRemove, onMakePresident, onDemotePresident, onPermissionsChange, animDelay = 0,
}: {
  profile: ProfileSearchRow
  membership: MembershipRow
  isLoading: boolean
  canRemove?: boolean
  canEditRole?: boolean
  canMakePresident?: boolean
  animDelay?: number
  onRoleChange: (membershipId: string, role: 'officer' | 'member', customRole?: string) => void
  onRemove: (membershipId: string) => void
  onMakePresident?: (membershipId: string) => void
  onDemotePresident?: (membershipId: string) => void
  onPermissionsChange: (membershipId: string, permissions: string[]) => void
}) {
  const navigate = useNavigate()
  const [hasCustomRole, setHasCustomRole] = useState(!!membership.custom_role)
  const [perms, setPerms] = useState<string[]>(membership.permissions ?? [])
  const [showPerms, setShowPerms] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [confirmTransfer, setConfirmTransfer] = useState(false)

  const togglePerm = (key: string) => {
    const next = perms.includes(key) ? perms.filter(p => p !== key) : [...perms, key]
    setPerms(next)
    onPermissionsChange(membership.id, next)
  }

  const roleLabel = membership.custom_role ?? (membership.role === 'officer' ? 'Admin' : 'Member')
  const hasRole   = !!membership.custom_role

  return (
    <div className="tm-card" style={{ borderRadius:16, background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.07)', overflow:'hidden', transition:'border-color .15s', animationDelay:`${animDelay}s` }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor='rgba(255,255,255,.12)'}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor='rgba(255,255,255,.07)'}>
      {/* Main row */}
      <div style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px' }}>
        <div onClick={() => navigate(`/profile/${profile.id}`)} style={{ cursor:'pointer', flexShrink:0 }}><TeamAvatar name={profile.full_name} size={40}/></div>
        <div style={{ flex:1, minWidth:0 }}>
          <div onClick={() => navigate(`/profile/${profile.id}`)} style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', marginBottom:3, cursor:'pointer' }}>{profile.full_name ?? 'Unknown'}</div>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            {profile.school && <span style={{ fontSize:11, color:'rgba(255,255,255,.4)' }}>{profile.school}</span>}
            {profile.email  && <span style={{ fontSize:11, color:'rgba(255,255,255,.25)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:160 }}>{profile.email}</span>}
            {perms.length > 0 && (
              <span style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', borderRadius:9999, padding:'1px 8px' }}>
                {perms.length} permission{perms.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Role badge / editor */}
        {canEditRole ? (
          <RoleTags
            key={`${membership.id}-${membership.role}-${membership.custom_role}`}
            role={membership.role as 'officer' | 'member'}
            customRole={membership.custom_role}
            disabled={isLoading}
            onChange={(r, c) => {
              const gaining = !!c && !hasCustomRole
              setHasCustomRole(!!c)
              if (!c) { setPerms([]); onPermissionsChange(membership.id, []) }
              if (gaining) setPerms([])
              onRoleChange(membership.id, r, c)
            }}
          />
        ) : (
          <span style={{ fontSize:11, fontWeight:700, color: hasRole ? '#a78bfa' : 'rgba(255,255,255,.4)', background: hasRole ? 'rgba(167,139,250,.12)' : 'rgba(255,255,255,.05)', border:`1px solid ${hasRole?'rgba(167,139,250,.3)':'rgba(255,255,255,.08)'}`, borderRadius:9999, padding:'4px 12px', flexShrink:0 }}>
            {roleLabel}
          </span>
        )}

        {/* Permissions toggle (only for custom-role members) */}
        {hasCustomRole && canEditRole && (
          <button onClick={() => setShowPerms(v => !v)} title="Edit permissions"
            style={{ width:32, height:32, borderRadius:9, background: showPerms ? 'rgba(138,21,56,.2)' : 'rgba(255,255,255,.06)', border:`1px solid ${showPerms?'rgba(138,21,56,.45)':'rgba(255,255,255,.1)'}`, color: showPerms ? 'var(--accent)' : 'var(--text-muted)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all .15s' }}>
            <IcoKey size={14} style={{ transition:'transform .3s cubic-bezier(.22,1,.36,1)', transform: showPerms ? 'rotate(-30deg)' : 'rotate(0deg)' }}/>
          </button>
        )}

        {/* Make Co-President (only for non-presidents) */}
        {canMakePresident && membership.role !== 'president' && !confirmTransfer && !confirmRemove && (
          <button onClick={() => setConfirmTransfer(true)} disabled={isLoading} title="Make co-president"
            style={{ width:32, height:32, borderRadius:9, background:'transparent', border:'1px solid rgba(255,255,255,.08)', color:'rgba(255,255,255,.3)', cursor: isLoading ? 'default':'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', opacity: isLoading ? .5:1, transition:'all .15s' }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(233,193,118,.1)'; e.currentTarget.style.borderColor='rgba(233,193,118,.4)'; e.currentTarget.style.color='#e9c176' }}
            onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor='rgba(255,255,255,.08)'; e.currentTarget.style.color='rgba(255,255,255,.3)' }}
          ><IcoCrown size={13}/></button>
        )}
        {canMakePresident && membership.role !== 'president' && confirmTransfer && (
          <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0, animation:'confirmIn .18s cubic-bezier(.22,1,.36,1) both' }}>
            <span style={{ fontSize:11, fontWeight:700, color:'#e9c176', whiteSpace:'nowrap' }}>Make president?</span>
            <button onClick={() => { onMakePresident?.(membership.id); setConfirmTransfer(false) }} disabled={isLoading}
              style={{ padding:'5px 12px', borderRadius:8, background:'rgba(233,193,118,.15)', border:'1px solid rgba(233,193,118,.45)', color:'#e9c176', fontSize:11, fontWeight:800, cursor:'pointer', fontFamily:'inherit', transition:'all .12s', lineHeight:1 }}
              onMouseEnter={e => { e.currentTarget.style.background='rgba(233,193,118,.28)' }}
              onMouseLeave={e => { e.currentTarget.style.background='rgba(233,193,118,.15)' }}
            >Yes</button>
            <button onClick={() => setConfirmTransfer(false)}
              style={{ padding:'5px 10px', borderRadius:8, background:'transparent', border:'1px solid rgba(255,255,255,.12)', color:'rgba(255,255,255,.45)', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', transition:'all .12s', lineHeight:1 }}
              onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,.07)' }}
              onMouseLeave={e => { e.currentTarget.style.background='transparent' }}
            >No</button>
          </div>
        )}

        {/* Remove Presidency (only for co-presidents) */}
        {canMakePresident && membership.role === 'president' && !confirmTransfer && !confirmRemove && (
          <button onClick={() => setConfirmTransfer(true)} disabled={isLoading} title="Remove presidency"
            style={{ height:28, padding:'0 10px', borderRadius:9, background:'rgba(233,193,118,.08)', border:'1px solid rgba(233,193,118,.25)', color:'#e9c176', cursor: isLoading ? 'default':'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', gap:5, opacity: isLoading ? .5:1, transition:'all .15s' }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(248,113,113,.12)'; e.currentTarget.style.borderColor='rgba(248,113,113,.45)'; e.currentTarget.style.color='#f87171' }}
            onMouseLeave={e => { e.currentTarget.style.background='rgba(233,193,118,.08)'; e.currentTarget.style.borderColor='rgba(233,193,118,.25)'; e.currentTarget.style.color='#e9c176' }}
          >
            <IcoCrown size={11}/>
            <span style={{ fontSize:11, fontWeight:800, lineHeight:1 }}>✕</span>
          </button>
        )}
        {canMakePresident && membership.role === 'president' && confirmTransfer && (
          <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0, animation:'confirmIn .18s cubic-bezier(.22,1,.36,1) both' }}>
            <span style={{ fontSize:11, fontWeight:700, color:'#f87171', whiteSpace:'nowrap' }}>Remove presidency?</span>
            <button onClick={() => { onDemotePresident?.(membership.id); setConfirmTransfer(false) }} disabled={isLoading}
              style={{ padding:'5px 12px', borderRadius:8, background:'rgba(248,113,113,.12)', border:'1px solid rgba(248,113,113,.4)', color:'#f87171', fontSize:11, fontWeight:800, cursor:'pointer', fontFamily:'inherit', transition:'all .12s', lineHeight:1 }}
              onMouseEnter={e => { e.currentTarget.style.background='rgba(248,113,113,.25)' }}
              onMouseLeave={e => { e.currentTarget.style.background='rgba(248,113,113,.12)' }}
            >Yes</button>
            <button onClick={() => setConfirmTransfer(false)}
              style={{ padding:'5px 10px', borderRadius:8, background:'transparent', border:'1px solid rgba(255,255,255,.12)', color:'rgba(255,255,255,.45)', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', transition:'all .12s', lineHeight:1 }}
              onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,.07)' }}
              onMouseLeave={e => { e.currentTarget.style.background='transparent' }}
            >No</button>
          </div>
        )}

        {/* Remove */}
        {canRemove && !confirmRemove && !confirmTransfer && (
          <button onClick={() => setConfirmRemove(true)} disabled={isLoading} title="Remove from club"
            style={{ width:32, height:32, borderRadius:9, background:'transparent', border:'1px solid rgba(255,255,255,.08)', color:'rgba(255,255,255,.3)', fontSize:14, cursor: isLoading ? 'default':'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', opacity: isLoading ? .5:1, transition:'all .15s', lineHeight:1 }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(248,113,113,.1)'; e.currentTarget.style.borderColor='rgba(248,113,113,.35)'; e.currentTarget.style.color='#f87171' }}
            onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor='rgba(255,255,255,.08)'; e.currentTarget.style.color='rgba(255,255,255,.3)' }}
          >{isLoading ? '…' : '✕'}</button>
        )}
        {canRemove && confirmRemove && (
          <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0, animation:'confirmIn .18s cubic-bezier(.22,1,.36,1) both' }}>
            <span style={{ fontSize:11, fontWeight:700, color:'#f87171', whiteSpace:'nowrap' }}>Sure?</span>
            <button onClick={() => { onRemove(membership.id); setConfirmRemove(false) }} disabled={isLoading}
              style={{ padding:'5px 12px', borderRadius:8, background:'rgba(248,113,113,.15)', border:'1px solid rgba(248,113,113,.4)', color:'#f87171', fontSize:11, fontWeight:800, cursor:'pointer', fontFamily:'inherit', transition:'all .12s', lineHeight:1 }}
              onMouseEnter={e => { e.currentTarget.style.background='rgba(248,113,113,.28)' }}
              onMouseLeave={e => { e.currentTarget.style.background='rgba(248,113,113,.15)' }}
            >Yes</button>
            <button onClick={() => setConfirmRemove(false)}
              style={{ padding:'5px 10px', borderRadius:8, background:'transparent', border:'1px solid rgba(255,255,255,.12)', color:'rgba(255,255,255,.45)', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', transition:'all .12s', lineHeight:1 }}
              onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,.07)' }}
              onMouseLeave={e => { e.currentTarget.style.background='transparent' }}
            >No</button>
          </div>
        )}
      </div>

      {/* Privileges panel — grid-row animation for smooth expand/collapse */}
      {hasCustomRole && canEditRole && (
        <div style={{ display:'grid', gridTemplateRows: showPerms ? '1fr' : '0fr', transition:'grid-template-rows .35s cubic-bezier(.22,1,.36,1)' }}>
        <div style={{ overflow:'hidden' }}>
        <div style={{ padding: '16px 16px 18px', borderTop: '1px solid rgba(138,21,56,0.18)', background: 'rgba(0,0,0,0.18)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,.4)', letterSpacing: '.13em', textTransform: 'uppercase' }}>Permissions</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.25)', fontWeight: 600 }}>
              {perms.length}/{PRIVILEGES.length} granted
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {PRIVILEGE_GROUPS.map(group => {
              const groupPrivs = PRIVILEGES.filter(p => p.group === group)
              return (
                <div key={group}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,.22)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 8 }}>{group}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%, 190px),1fr))', gap: 7 }}>
                    {groupPrivs.map(p => {
                      const active = perms.includes(p.key)
                      return (
                        <button
                          key={p.key}
                          onClick={() => togglePerm(p.key)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 12px', borderRadius: 12, border: `1px solid ${active ? 'rgba(74,222,128,.35)' : 'rgba(255,255,255,.07)'}`,
                            background: active ? 'rgba(74,222,128,.07)' : 'rgba(255,255,255,.03)',
                            cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                            transition: 'all .15s', boxShadow: active ? '0 0 0 1px rgba(74,222,128,.12)' : 'none',
                          }}
                          onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = 'rgba(255,255,255,.14)' }}
                          onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = 'rgba(255,255,255,.07)' }}
                        >
                          <div style={{
                            width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                            background: active ? 'rgba(74,222,128,.15)' : 'rgba(255,255,255,.06)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all .2s',
                            border: active ? '1px solid rgba(74,222,128,.3)' : '1px solid transparent',
                            color: active ? '#4ade80' : 'var(--text-muted)',
                          }}>
                            {active
                              ? <IcoCheck size={13} style={{ animation:'privCheckIn .2s cubic-bezier(.22,1,.36,1) both' }}/>
                              : <PrivIcon pKey={p.key} size={14}/>
                            }
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: active ? '#4ade80' : 'var(--text-primary)', lineHeight: 1.2, marginBottom: 2 }}>{p.label}</div>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', lineHeight: 1.4 }}>{p.desc}</div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        </div>
        </div>
      )}
    </div>
  )
}

// ─── CertificateModal ────────────────────────────────────────────────────────

function CertificateModal({
  event,
  club,
  members,
  onClose,
}: {
  event: Event
  club: Club
  members: MembershipRow[]
  onClose: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const eventDate = event.start_time ? new Date(event.start_time).toISOString().slice(0, 10) : today

  const [eventName, setEventName] = useState(event.title)
  const [certDate, setCertDate] = useState(eventDate)
  const [reason, setReason] = useState('')
  const [issuedBy, setIssuedBy] = useState(club.name)
  const [issueDate, setIssueDate] = useState(today)
  const [selected, setSelected] = useState<Set<string>>(new Set(members.map(m => m.user_id)))
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<'success' | 'error' | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const allSelected = selected.size === members.length
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(members.map(m => m.user_id)))
  const toggleOne = (uid: string) => setSelected(prev => {
    const next = new Set(prev)
    next.has(uid) ? next.delete(uid) : next.add(uid)
    return next
  })

  const handleSend = useCallback(async () => {
    if (selected.size === 0) { setErrorMsg('Select at least one recipient.'); return }
    if (!reason.trim()) { setErrorMsg('Please describe the achievement / reason.'); return }

    setSending(true)
    setErrorMsg('')

    const selectedIds = Array.from(selected)
    const { data: emailData } = await supabase
      .from('profiles')
      .select('id, email')
      .in('id', selectedIds)

    const emailMap = Object.fromEntries((emailData ?? []).map(p => [p.id, p.email]))

    const rows = members
      .filter(m => selected.has(m.user_id))
      .map(m => ({
        club_id: club.id,
        club_name: club.name,
        event_name: eventName,
        event_date: certDate || null,
        reason: reason.trim(),
        issued_by: issuedBy,
        issue_date: issueDate,
        recipient_name: m.profile?.full_name ?? 'Member',
        recipient_email: emailMap[m.user_id] ?? null,
        recipient_user_id: m.user_id,
        status: 'pending',
      }))

    const { error } = await supabase.from('certificate_requests').insert(rows)

    if (error) {
      setResult('error')
      setErrorMsg(error.message)
    } else {
      setResult('success')
    }
    setSending(false)
  }, [selected, reason, members, eventName, certDate, issuedBy, issueDate, club])

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div style={{
        width: '100%', maxWidth: 580,
        background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 22, maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{
          padding: '24px 28px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1,
          borderRadius: '22px 22px 0 0',
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: 5 }}>
              🎓 Certificate Dispatch
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
              {event.title}
            </h2>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>✕</button>
        </div>

        <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {result === 'success' ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                Certificates Sent!
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {selected.size} certificate{selected.size !== 1 ? 's' : ''} have been successfully dispatched.
              </div>
              <button onClick={onClose} style={{
                marginTop: 24, padding: '10px 28px',
                background: 'var(--accent)', border: 'none', borderRadius: 9999,
                color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}>Done</button>
            </div>
          ) : (
            <>
              {/* Certificate Details */}
              <section>
                <SectionLabel>Certificate Details</SectionLabel>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <CertField label="Event Name">
                    <input value={eventName} onChange={e => setEventName(e.target.value)} style={cfi} />
                  </CertField>
                  <CertField label="Event Date">
                    <input type="date" value={certDate} onChange={e => setCertDate(e.target.value)} style={cfi} />
                  </CertField>
                  <CertField label="Issued By">
                    <input value={issuedBy} onChange={e => setIssuedBy(e.target.value)} style={cfi} />
                  </CertField>
                  <CertField label="Issue Date">
                    <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} style={cfi} />
                  </CertField>
                </div>
                <div style={{ marginTop: 12 }}>
                  <CertField label="Achievement / Reason">
                    <textarea
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      placeholder="e.g. Successfully completed the 3-day Entrepreneurship Workshop and demonstrated outstanding leadership skills."
                      rows={3}
                      style={{ ...cfi, resize: 'vertical', lineHeight: 1.6 }}
                    />
                  </CertField>
                </div>
              </section>

              {/* Member Selection */}
              <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <SectionLabel>Select Recipients</SectionLabel>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {selected.size} / {members.length} selected
                  </span>
                </div>

                {members.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
                    No members found. Add members in Manage Team first.
                  </div>
                ) : (
                  <div style={{
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 12, overflow: 'hidden',
                  }}>
                    {/* Select all row */}
                    <div
                      onClick={toggleAll}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '11px 14px', cursor: 'pointer',
                        background: 'rgba(138,21,56,0.07)',
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <Checkbox checked={allSelected} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                        Select All ({members.length} members)
                      </span>
                    </div>

                    {/* Member rows */}
                    <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                      {members.map(m => (
                        <div
                          key={m.user_id}
                          onClick={() => toggleOne(m.user_id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '10px 14px', cursor: 'pointer',
                            background: selected.has(m.user_id) ? 'rgba(138,21,56,0.05)' : 'transparent',
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                            transition: 'background 0.12s',
                          }}
                        >
                          <Checkbox checked={selected.has(m.user_id)} />
                          <TeamAvatar name={m.profile?.full_name} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                              {m.profile?.full_name ?? 'Unknown Member'}
                            </div>
                            {m.custom_role && (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.custom_role}</div>
                            )}
                          </div>
                          <span style={{
                            fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
                            padding: '2px 7px', borderRadius: 9999, flexShrink: 0,
                            background: m.role === 'officer' ? 'rgba(14,165,233,0.12)' : 'rgba(255,255,255,0.05)',
                            border: m.role === 'officer' ? '1px solid rgba(14,165,233,0.25)' : '1px solid rgba(255,255,255,0.08)',
                            color: m.role === 'officer' ? '#38bdf8' : 'var(--text-muted)',
                            textTransform: 'uppercase',
                          }}>
                            {m.role}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* Error */}
              {errorMsg && (
                <div style={{
                  padding: '10px 14px', borderRadius: 10,
                  background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.25)',
                  fontSize: 13, color: '#ff6b6b',
                }}>
                  {errorMsg}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={onClose} style={{
                  flex: 1, padding: '11px',
                  background: 'transparent', border: '1px solid rgba(87,65,68,0.35)',
                  borderRadius: 11, color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer',
                }}>Cancel</button>
                <button
                  onClick={handleSend}
                  disabled={sending || selected.size === 0}
                  style={{
                    flex: 2, padding: '11px',
                    background: sending || selected.size === 0 ? 'rgba(138,21,56,0.3)' : 'var(--accent)',
                    border: 'none', borderRadius: 11,
                    color: '#fff', fontSize: 14, fontWeight: 700,
                    cursor: sending || selected.size === 0 ? 'default' : 'pointer',
                    opacity: sending || selected.size === 0 ? 0.6 : 1,
                    boxShadow: sending ? 'none' : '0 4px 16px rgba(138,21,56,0.3)',
                    transition: 'all 0.15s',
                  }}
                >
                  {sending ? 'Sending…' : `Send Certificates → (${selected.size})`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
      color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10,
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <span style={{ width: 14, height: 1.5, background: 'rgba(138,21,56,0.5)', display: 'inline-block', borderRadius: 9999 }} />
      {children}
    </div>
  )
}

function CertField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <div style={{
      width: 18, height: 18, borderRadius: 5, flexShrink: 0,
      border: checked ? '2px solid var(--accent)' : '2px solid rgba(87,65,68,0.5)',
      background: checked ? 'var(--accent)' : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.12s', fontSize: 11, color: '#fff', fontWeight: 700,
    }}>
      {checked && '✓'}
    </div>
  )
}

const cfi: React.CSSProperties = {
  width: '100%',
  background: 'rgba(27,16,18,0.6)',
  border: '1px solid rgba(87,65,68,0.4)',
  borderRadius: 9,
  padding: '9px 12px',
  color: 'var(--text-primary)',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
}

// ─── EventAnnouncementModal ──────────────────────────────────────────────────

function EventAnnouncementModal({
  event, announcements, content, posting,
  onContentChange, onPost, onClose,
}: {
  event: Event
  announcements: EventAnnouncementRow[]
  content: string
  posting: boolean
  onContentChange: (v: string) => void
  onPost: () => void
  onClose: () => void
}) {
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div style={{
        width: '100%', maxWidth: 560,
        background: 'var(--bg-card)', border: '1px solid rgba(255,180,171,0.15)',
        borderRadius: 22, maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{
          padding: '24px 28px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1,
          borderRadius: '22px 22px 0 0',
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--live-red)', textTransform: 'uppercase', marginBottom: 5 }}>
              ● Live Event · Announcements
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
              {event.title}
            </h2>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>✕</button>
        </div>

        <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Compose */}
          <div style={{
            background: 'rgba(41,28,30,0.5)',
            border: '1px solid rgba(138,21,56,0.2)',
            borderRadius: 12, padding: 16,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--live-red)', textTransform: 'uppercase', marginBottom: 10 }}>
              Post Event Announcement
            </div>
            <textarea
              value={content}
              onChange={e => onContentChange(e.target.value)}
              placeholder="Share a live update, schedule change, or important notice for this event…"
              rows={3}
              maxLength={600}
              style={{
                ...cfi, resize: 'vertical', marginBottom: 10,
                lineHeight: 1.65, background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{content.length} / 600</span>
              <button
                onClick={onPost}
                disabled={posting || !content.trim()}
                style={{
                  background: content.trim() ? 'var(--live-red)' : 'rgba(87,65,68,0.18)',
                  border: 'none', borderRadius: 9, padding: '9px 22px',
                  color: content.trim() ? '#fff' : 'var(--text-muted)',
                  fontSize: 13, fontWeight: 700,
                  cursor: content.trim() ? 'pointer' : 'default',
                  transition: 'all 0.15s', opacity: posting ? 0.7 : 1,
                }}
              >
                {posting ? 'Posting…' : 'Post Update'}
              </button>
            </div>
          </div>

          {/* Feed */}
          {announcements.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
              No announcements yet for this event. Post one above.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {announcements.map(ann => (
                <div key={ann.id} style={{
                  background: 'rgba(255,255,255,0.025)',
                  borderLeft: '3px solid var(--live-red)',
                  borderRadius: '0 10px 10px 0',
                  padding: '13px 16px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      background: 'rgba(255,180,171,0.12)', borderRadius: 9999,
                      padding: '2px 8px', fontSize: 10, fontWeight: 700,
                      color: 'var(--live-red)', letterSpacing: '0.06em',
                    }}>
                      LIVE UPDATE
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {ann.profile?.full_name ?? 'Admin'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                      {new Date(ann.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}>
                    {ann.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── QRModal ────────────────────────────────────────────────────────────────

function QRModal({ event, onClose }: { event: Event; onClose: () => void }) {
  const url = `${window.location.origin}/attend/${event.id}`

  function downloadQR() {
    const canvas = document.getElementById('event-qr-canvas') as HTMLCanvasElement | null
    if (!canvas) return
    const a = document.createElement('a')
    a.download = `${event.title.replace(/\s+/g, '-')}-qr.png`
    a.href = canvas.toDataURL('image/png')
    a.click()
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div style={{
        width: '100%', maxWidth: 360,
        background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 22, padding: '32px 28px', textAlign: 'center',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#38bdf8', textTransform: 'uppercase', marginBottom: 6 }}>
          Event QR Code
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, lineHeight: 1.3 }}>
          {event.title}
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 24 }}>
          Members scan to check in
          {event.karak_points_reward > 0 && ` and earn ${event.karak_points_reward} pts`}
        </p>

        {/* QR code on white background */}
        <div style={{
          background: '#fff', borderRadius: 16,
          display: 'inline-flex', padding: 16, marginBottom: 24,
        }}>
          <QRCodeCanvas
            id="event-qr-canvas"
            value={url}
            size={200}
            level="H"
            marginSize={1}
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={downloadQR}
            style={{
              flex: 1, padding: '11px',
              background: 'var(--accent)', border: 'none',
              borderRadius: 11, color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Download PNG
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '11px',
              background: 'transparent', border: '1px solid rgba(87,65,68,0.35)',
              borderRadius: 11, color: 'var(--text-muted)',
              fontSize: 13, cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── BannerCropModal ─────────────────────────────────────────────────────────
// Canvas-based crop: drag to reposition, slider to zoom, saves at 1200×300.

function BannerCropModal({
  file, onSave, onClose,
}: {
  file: File
  onSave: (blob: Blob) => void
  onClose: () => void
}) {
  // Output dimensions (4:1)
  const OUT_W = 1200
  const OUT_H = 300

  const [imgSrc] = useState(() => URL.createObjectURL(file))
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [saving, setSaving] = useState(false)

  const cropW = 560  // preview box CSS width (px) — 4:1
  const cropH = 140  // preview box CSS height (px)

  const imgRef = useRef<HTMLImageElement>(null)
  const isDragging = useRef(false)
  const dragOrigin = useRef({ mx: 0, my: 0, ox: 0, oy: 0 })

  // Derive min zoom so image always covers the crop box
  const minZoom = imgNatural.w > 0
    ? Math.max(cropW / imgNatural.w, cropH / imgNatural.h)
    : 1

  // Clamp offset so image never shows empty space
  function clamp(ox: number, oy: number, z: number) {
    const sw = imgNatural.w * z
    const sh = imgNatural.h * z
    return {
      x: Math.min(0, Math.max(cropW - sw, ox)),
      y: Math.min(0, Math.max(cropH - sh, oy)),
    }
  }

  function onImgLoad() {
    const img = imgRef.current!
    const nat = { w: img.naturalWidth, h: img.naturalHeight }
    setImgNatural(nat)
    const initZoom = Math.max(cropW / nat.w, cropH / nat.h)
    const initZ = Math.max(initZoom, 1)
    setZoom(initZ)
    // Center
    const sw = nat.w * initZ
    const sh = nat.h * initZ
    setOffset({ x: (cropW - sw) / 2, y: (cropH - sh) / 2 })
  }

  function onMouseDown(e: React.MouseEvent) {
    isDragging.current = true
    dragOrigin.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y }
    e.preventDefault()
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!isDragging.current) return
    const dx = e.clientX - dragOrigin.current.mx
    const dy = e.clientY - dragOrigin.current.my
    setOffset(clamp(dragOrigin.current.ox + dx, dragOrigin.current.oy + dy, zoom))
  }
  function onMouseUp() { isDragging.current = false }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    isDragging.current = true
    dragOrigin.current = { mx: t.clientX, my: t.clientY, ox: offset.x, oy: offset.y }
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!isDragging.current) return
    const t = e.touches[0]
    const dx = t.clientX - dragOrigin.current.mx
    const dy = t.clientY - dragOrigin.current.my
    setOffset(clamp(dragOrigin.current.ox + dx, dragOrigin.current.oy + dy, zoom))
  }

  function handleZoomChange(val: number) {
    const clamped = clamp(offset.x, offset.y, val)
    setZoom(val)
    setOffset(clamped)
  }

  async function handleSave() {
    if (imgNatural.w === 0) return
    setSaving(true)

    const canvas = document.createElement('canvas')
    canvas.width = OUT_W
    canvas.height = OUT_H
    const ctx = canvas.getContext('2d')!

    const img = new Image()
    img.src = imgSrc
    await new Promise<void>(res => { img.onload = () => res() })

    // Scale factor from CSS crop box → output canvas
    const scaleX = OUT_W / cropW
    const scaleY = OUT_H / cropH
    const { x: ox, y: oy } = clamp(offset.x, offset.y, zoom)
    ctx.drawImage(
      img,
      ox * scaleX,
      oy * scaleY,
      imgNatural.w * zoom * scaleX,
      imgNatural.h * zoom * scaleY,
    )

    canvas.toBlob(blob => {
      if (blob) onSave(blob)
    }, 'image/jpeg', 0.93)
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div style={{
        width: '100%', maxWidth: 620,
        background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 22, boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
              Crop Banner
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Drag to reposition · Use slider to zoom
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'var(--text-muted)', fontSize: 15, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        <div style={{ padding: '24px' }}>
          {/* Crop preview box */}
          <div style={{
            width: cropW, height: cropH, maxWidth: '100%',
            borderRadius: 12, overflow: 'hidden',
            background: '#111',
            position: 'relative',
            cursor: 'grab',
            border: '1px solid rgba(255,255,255,0.1)',
            margin: '0 auto',
            boxShadow: '0 0 0 1px rgba(138,21,56,0.3)',
          }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onMouseUp}
          >
            {/* Grid overlay */}
            <div style={{
              position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
              backgroundImage: `
                linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)
              `,
              backgroundSize: `${cropW / 3}px ${cropH / 3}px`,
            }} />
            {/* Corner guides */}
            {[
              { top: 8, left: 8, borderTop: '2px solid rgba(255,255,255,0.6)', borderLeft: '2px solid rgba(255,255,255,0.6)' },
              { top: 8, right: 8, borderTop: '2px solid rgba(255,255,255,0.6)', borderRight: '2px solid rgba(255,255,255,0.6)' },
              { bottom: 8, left: 8, borderBottom: '2px solid rgba(255,255,255,0.6)', borderLeft: '2px solid rgba(255,255,255,0.6)' },
              { bottom: 8, right: 8, borderBottom: '2px solid rgba(255,255,255,0.6)', borderRight: '2px solid rgba(255,255,255,0.6)' },
            ].map((s, i) => (
              <div key={i} style={{ position: 'absolute', width: 14, height: 14, zIndex: 3, pointerEvents: 'none', ...s }} />
            ))}
            <img
              ref={imgRef}
              src={imgSrc}
              onLoad={onImgLoad}
              draggable={false}
              alt=""
              style={{
                position: 'absolute',
                left: offset.x,
                top: offset.y,
                width: imgNatural.w * zoom,
                height: imgNatural.h * zoom,
                userSelect: 'none',
                pointerEvents: 'none',
              }}
            />
          </div>

          {/* Zoom slider */}
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Zoom
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {Math.round(zoom / minZoom * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={minZoom}
              max={minZoom * 3}
              step={minZoom * 0.01}
              value={zoom}
              onChange={e => handleZoomChange(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Fit</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>3×</span>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: '11px',
                background: 'transparent', border: '1px solid rgba(87,65,68,0.35)',
                borderRadius: 11, color: 'var(--text-muted)',
                fontSize: 14, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || imgNatural.w === 0}
              style={{
                flex: 2, padding: '11px',
                background: saving ? 'rgba(138,21,56,0.4)' : 'var(--accent)',
                border: 'none', borderRadius: 11,
                color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: saving ? 'default' : 'pointer',
                boxShadow: saving ? 'none' : '0 4px 16px rgba(138,21,56,0.35)',
                transition: 'all 0.15s',
              }}
            >
              {saving ? 'Saving…' : 'Save Banner'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

