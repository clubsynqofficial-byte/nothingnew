import { useState, useEffect, useRef, useCallback, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { QRCodeCanvas } from 'qrcode.react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Club, Event } from '../../types'
import { filterText, validateImage } from '../../lib/contentFilter'

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

interface MembershipRow {
  id: string
  user_id: string
  role: 'member' | 'officer' | 'president'
  custom_role: string | null
  profile: { full_name: string | null; school: string | null; email: string | null } | null
}

interface ProfileSearchRow {
  id: string
  full_name: string | null
  school: string | null
  email: string | null
}

interface Props {
  club: Club
}

export default function CommandCenter({ club }: Props) {
  const { user, profile } = useAuth()
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

  // Club appearance state
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(club.logo_url ?? null)
  const [bannerPreview, setBannerPreview] = useState<string | null>(club.banner_url ?? null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [appearanceMsg, setAppearanceMsg] = useState('')
  const logoRef = useRef<HTMLInputElement>(null)
  const bannerRef = useRef<HTMLInputElement>(null)

  // Event-specific announcement state
  const [evtAnnEvent, setEvtAnnEvent] = useState<Event | null>(null)
  const [evtAnnContent, setEvtAnnContent] = useState('')
  const [postingEvtAnn, setPostingEvtAnn] = useState(false)
  const [evtAnnouncements, setEvtAnnouncements] = useState<EventAnnouncementRow[]>([])

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
        .select('id, user_id, role, custom_role, profile:profiles(full_name, school, email)')
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
    setLogoFile(file)
    setAppearanceMsg('Logo saved!')
    setUploadingLogo(false)
  }

  async function handleBannerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (!file.type.startsWith('image/')) { setAppearanceMsg('Please select an image file.'); return }
    if (file.size > 10 * 1024 * 1024) { setAppearanceMsg('Banner must be under 10 MB.'); return }
    setUploadingBanner(true)
    setAppearanceMsg('')
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `banners/${club.id}.${ext}`
    const { error: upErr } = await supabase.storage.from('clubs').upload(path, file, { upsert: true })
    if (upErr) { setAppearanceMsg('Upload failed: ' + upErr.message); setUploadingBanner(false); return }
    const { data: urlData } = supabase.storage.from('clubs').getPublicUrl(path)
    const url = urlData.publicUrl + `?t=${Date.now()}`
    await supabase.from('clubs').update({ banner_url: urlData.publicUrl }).eq('id', club.id)
    setBannerPreview(url)
    setBannerFile(file)
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
    await supabase.from('clubs').update({ member_count: stats.memberCount + 1 }).eq('id', club.id)
    setMemberSearch('')
    setSearchProfiles([])
    fetchAll()
    setActionLoading(null)
  }

  async function handleRoleChange(membershipId: string, newRole: 'officer' | 'member', customRole?: string) {
    setActionLoading(membershipId)
    await supabase.from('club_memberships').update({ role: newRole, custom_role: customRole ?? null }).eq('id', membershipId)
    setTeamMembers(prev => prev.map(m => m.id === membershipId ? { ...m, role: newRole, custom_role: customRole ?? null } : m))
    setActionLoading(null)
  }

  async function handleRemoveMember(membershipId: string) {
    setActionLoading(membershipId)
    await supabase.from('club_memberships').delete().eq('id', membershipId)
    await supabase.from('clubs').update({ member_count: Math.max(0, stats.memberCount - 1) }).eq('id', club.id)
    setTeamMembers(prev => prev.filter(m => m.id !== membershipId))
    fetchAll()
    setActionLoading(null)
  }

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

  return (
    <div className="page-content" style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <h1 style={{ fontSize: 30, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
              {club.name}
            </h1>
            {club.is_verified && (
              <span style={{
                background: 'rgba(233,193,118,0.15)',
                border: '1px solid rgba(233,193,118,0.4)',
                borderRadius: 9999,
                padding: '3px 10px',
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--gold)',
                letterSpacing: '0.05em',
              }}>
                ✓ VERIFIED
              </span>
            )}
          </div>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            Manage your organization's legacy, reach, and standing.
          </p>
        </div>
        <button
          onClick={() => setShowEventForm(v => !v)}
          style={{
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 10,
            padding: '11px 22px',
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 0 20px rgba(138,21,56,0.3)',
          }}
        >
          {showEventForm ? '✕ Cancel' : '+ Create Event'}
        </button>
      </div>

      {/* Event creation form */}
      {showEventForm && (
        <div style={{
          background: 'rgba(41,28,30,0.6)',
          border: '1px solid rgba(138,21,56,0.3)',
          borderRadius: 16,
          padding: '28px 28px',
          marginBottom: 28,
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20 }}>New Event</h3>
          <form onSubmit={handleCreateEvent}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <FormField label="Event Title">
                <input required value={evTitle} onChange={e => setEvTitle(e.target.value)} placeholder="Event name" style={fi} />
              </FormField>
              <FormField label="Category">
                <input value={evCategory} onChange={e => setEvCategory(e.target.value)} placeholder="e.g. Workshop, Social" style={fi} />
              </FormField>
              <FormField label="Location">
                <input value={evLocation} onChange={e => setEvLocation(e.target.value)} placeholder="Venue or link" style={fi} />
              </FormField>
              <FormField label="Start Time">
                <input type="datetime-local" value={evStart} onChange={e => setEvStart(e.target.value)} style={fi} />
              </FormField>
              <FormField label="Karak Points Reward">
                <input type="number" min="0" value={evPoints} onChange={e => setEvPoints(e.target.value)} style={fi} />
              </FormField>
            </div>
            <FormField label="Description">
              <textarea value={evDesc} onChange={e => setEvDesc(e.target.value)} placeholder="What's happening?" rows={3} style={{ ...fi, resize: 'vertical' }} />
            </FormField>
            {eventError && <p style={{ color: '#ff6b6b', fontSize: 12, margin: '8px 0' }}>{eventError}</p>}
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" disabled={creatingEvent} style={{ background: 'var(--accent)', border: 'none', borderRadius: 10, padding: '10px 28px', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: creatingEvent ? 0.7 : 1 }}>
                {creatingEvent ? 'Creating…' : 'Create Event'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Stats — 6 cards, 3-col × 2-row */}
      {loadingStats ? (
        <div style={{ color: 'var(--text-muted)', marginBottom: 28 }}>Loading stats…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
          {statCard('Members', stats.memberCount, 'Total enrolled')}
          {statCard('Events', stats.eventCount, 'All time')}
          {statCard('Total Attendees', stats.totalAttendees, 'Across all events')}
          {statCard('Avg Attendance', avgAttendees, 'Per event', '#0ea5e9')}
          {statCard('Community Threads', stats.threadCount, 'Active discussions', '#a855f7')}
          {statCard('Joined This Month', stats.newMembersThisMonth, 'Last 30 days', '#22c55e')}
        </div>
      )}

      {/* Live events banner */}
      {liveCount > 0 && (
        <div style={{
          background: 'rgba(255,180,171,0.07)',
          border: '1px solid rgba(255,180,171,0.22)',
          borderRadius: 11,
          padding: '11px 18px',
          marginBottom: 22,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--live-red)', letterSpacing: '0.1em' }}>● LIVE</span>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {liveCount} event{liveCount !== 1 ? 's' : ''} currently live — members can check in now
          </span>
        </div>
      )}

      {/* ── Manage Team ── */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16,
        padding: 24,
        marginBottom: 22,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>Manage Team</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Search, add members and assign their roles</p>
          </div>
          <span style={{
            background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.3)',
            borderRadius: 9999, padding: '3px 10px', fontSize: 10, fontWeight: 700,
            color: '#38bdf8', letterSpacing: '0.06em', flexShrink: 0,
          }}>
            {stats.memberCount} MEMBER{stats.memberCount !== 1 ? 'S' : ''}
          </span>
        </div>

        {/* Search bar */}
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <span style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            fontSize: 14, color: 'var(--text-muted)', pointerEvents: 'none',
          }}>🔍</span>
          <input
            value={memberSearch}
            onChange={e => setMemberSearch(e.target.value)}
            placeholder="Search by name or email to find and add members…"
            style={{ ...fi, paddingLeft: 36, fontSize: 13 }}
          />
          {memberSearch && (
            <button
              onClick={() => { setMemberSearch(''); setSearchProfiles([]) }}
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'transparent', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 4px',
              }}
            >✕</button>
          )}
        </div>

        {/* Search results (when searching) */}
        {memberSearch.trim() && (
          <div style={{ marginBottom: teamMembers.length > 0 ? 20 : 0 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted)',
              textTransform: 'uppercase', marginBottom: 10,
            }}>
              {searchLoading ? 'Searching…' : `${searchProfiles.length} result${searchProfiles.length !== 1 ? 's' : ''}`}
            </div>
            {!searchLoading && searchProfiles.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0', textAlign: 'center' }}>
                No users found matching "{memberSearch}"
              </div>
            )}
            {searchProfiles.map(p => {
              const existing = teamMembers.find(m => m.user_id === p.id)
              const isLoading = actionLoading === (existing?.id ?? p.id)
              const isPresident = p.id === club.president_id
              return existing ? (
                <ExistingMemberRow
                  key={p.id}
                  profile={p}
                  membership={existing}
                  isLoading={isLoading}
                  onRoleChange={handleRoleChange}
                  onRemove={handleRemoveMember}
                />
              ) : isPresident ? (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 10, marginBottom: 6,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <TeamAvatar name={p.full_name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{p.full_name ?? 'Unknown'}</div>
                    {p.school && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{p.school}</div>}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '3px 10px', borderRadius: 9999, background: 'rgba(233,193,118,0.15)', color: 'var(--gold)', flexShrink: 0 }}>PRESIDENT</span>
                </div>
              ) : (
                <NewMemberRow
                  key={p.id}
                  profile={p}
                  isLoading={isLoading}
                  onAdd={handleAddMember}
                />
              )
            })}
          </div>
        )}

        {/* Current members list */}
        {teamMembers.length === 0 && !memberSearch.trim() ? (
          <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            No members yet — search above to add your first team member.
          </div>
        ) : teamMembers.length > 0 && (
          <>
            {!memberSearch.trim() && (
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>
                Current Team
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {teamMembers.map(m => {
                if (m.role === 'president') {
                  return (
                    <div key={m.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px', borderRadius: 10,
                      background: 'rgba(233,193,118,0.04)', border: '1px solid rgba(233,193,118,0.14)',
                    }}>
                      <TeamAvatar name={m.profile?.full_name} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{m.profile?.full_name ?? 'Unknown'}</div>
                        {m.profile?.school && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{m.profile.school}</div>}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '3px 10px', borderRadius: 9999, background: 'rgba(233,193,118,0.15)', color: 'var(--gold)', flexShrink: 0 }}>PRESIDENT</span>
                    </div>
                  )
                }
                return (
                  <ExistingMemberRow
                    key={m.id}
                    profile={{ id: m.user_id, full_name: m.profile?.full_name ?? null, school: m.profile?.school ?? null, email: m.profile?.email ?? null }}
                    membership={m}
                    isLoading={actionLoading === m.id}
                    onRoleChange={handleRoleChange}
                    onRemove={handleRemoveMember}
                  />
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Announcements — full-width */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16,
        padding: 24,
        marginBottom: 22,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>Announcements</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Broadcast updates to all club members</p>
          </div>
          <span style={{
            background: 'rgba(233,193,118,0.12)',
            border: '1px solid rgba(233,193,118,0.3)',
            borderRadius: 9999,
            padding: '3px 10px',
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--gold)',
            letterSpacing: '0.06em',
            flexShrink: 0,
          }}>
            PRESIDENT
          </span>
        </div>

        {/* Compose */}
        <div style={{
          background: 'rgba(41,28,30,0.5)',
          border: '1px solid rgba(138,21,56,0.2)',
          borderRadius: 12,
          padding: 16,
          marginBottom: 20,
        }}>
          <textarea
            value={annContent}
            onChange={e => setAnnContent(e.target.value)}
            placeholder="Share an update, reminder, or important news with your members…"
            rows={3}
            maxLength={600}
            style={{
              ...fi,
              resize: 'vertical',
              marginBottom: 10,
              lineHeight: 1.65,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}
          />

          {/* Image preview */}
          {annImagePreview && (
            <div style={{
              position: 'relative', marginBottom: 10,
              borderRadius: 10, overflow: 'hidden',
              background: 'rgba(0,0,0,0.45)',
              border: '1px solid rgba(255,255,255,0.09)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              minHeight: 80,
            }}>
              <img
                src={annImagePreview}
                alt="preview"
                style={{
                  maxWidth: '100%', maxHeight: 260,
                  width: 'auto', height: 'auto',
                  display: 'block', objectFit: 'contain',
                }}
              />
              <button
                onClick={clearAnnImage}
                style={{
                  position: 'absolute', top: 8, right: 8,
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.2)',
                  color: '#fff', fontSize: 14, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  lineHeight: 1,
                }}
              >✕</button>
            </div>
          )}

          {/* Toolbar + post button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                ref={annImgRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleAnnImageSelect}
              />
              <button
                onClick={() => annImgRef.current?.click()}
                title="Attach image"
                style={{
                  padding: '6px 12px', borderRadius: 7,
                  background: annImageFile ? 'rgba(138,21,56,0.2)' : 'rgba(255,255,255,0.05)',
                  border: annImageFile ? '1px solid rgba(138,21,56,0.4)' : '1px solid rgba(255,255,255,0.1)',
                  color: annImageFile ? 'var(--accent)' : 'var(--text-muted)',
                  fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                🖼 {annImageFile ? 'Image added' : 'Add image'}
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{annContent.length} / 600</span>
            </div>
            {annError && <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>{annError}</div>}
            <button
              onClick={handlePostAnnouncement}
              disabled={postingAnn || (!annContent.trim() && !annImageFile)}
              style={{
                background: (annContent.trim() || annImageFile) ? 'var(--accent)' : 'rgba(87,65,68,0.18)',
                border: 'none',
                borderRadius: 9,
                padding: '9px 22px',
                color: (annContent.trim() || annImageFile) ? '#fff' : 'var(--text-muted)',
                fontSize: 13,
                fontWeight: 700,
                cursor: (annContent.trim() || annImageFile) ? 'pointer' : 'default',
                transition: 'all 0.15s',
                opacity: postingAnn ? 0.7 : 1,
              }}
            >
              {postingAnn ? 'Posting…' : 'Post Announcement'}
            </button>
          </div>
        </div>

        {/* Feed */}
        {announcements.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
            No announcements yet — post one to keep your members in the loop.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {announcements.map(ann => {
              const isAdmin = ann.profile?.role === 'admin'
              const roleStyle = isAdmin
                ? { color: '#818cf8', bg: 'rgba(99,102,241,0.13)', label: 'Admin' }
                : { color: 'var(--gold)', bg: 'rgba(233,193,118,0.12)', label: 'President' }

              return (
                <div key={ann.id} style={{
                  background: 'rgba(255,255,255,0.025)',
                  borderLeft: `3px solid ${roleStyle.color}`,
                  borderRadius: '0 10px 10px 0',
                  padding: '13px 16px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      background: roleStyle.bg,
                      borderRadius: 9999,
                      padding: '2px 8px',
                      fontSize: 10,
                      fontWeight: 700,
                      color: roleStyle.color,
                      letterSpacing: '0.06em',
                    }}>
                      {roleStyle.label.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {ann.profile?.full_name ?? 'Unknown'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                      {new Date(ann.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>
                  {ann.content && (
                    <p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}>
                      {ann.content}
                    </p>
                  )}
                  {ann.image_url && (
                    <div
                      onClick={() => setLightboxSrc(ann.image_url!)}
                      style={{
                        position: 'relative',
                        marginTop: ann.content ? 12 : 0,
                        marginLeft: -16, marginRight: -16,
                        marginBottom: -13,
                        borderRadius: '0 0 9px 0',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        lineHeight: 0,
                      }}
                    >
                      <img
                        src={ann.image_url}
                        alt=""
                        style={{ maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto' }}
                      />
                      <div style={{
                        position: 'absolute', bottom: 10, right: 10,
                        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
                        border: '1px solid rgba(255,255,255,0.18)',
                        borderRadius: 8, padding: '5px 10px',
                        display: 'flex', alignItems: 'center', gap: 5,
                        fontSize: 11, fontWeight: 600, color: '#fff',
                        pointerEvents: 'none',
                      }}>
                        <span style={{ fontSize: 13 }}>⛶</span> View full
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Club Appearance */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16,
        padding: 24,
        marginBottom: 22,
      }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>Club Appearance</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Upload a logo and banner image for your club's public profile</p>
        </div>

        {/* Banner */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            Banner Image
          </div>
          <div
            onClick={() => !uploadingBanner && bannerRef.current?.click()}
            style={{
              width: '100%', height: 140,
              borderRadius: 12,
              border: `2px dashed ${bannerPreview ? 'rgba(138,21,56,0.4)' : 'rgba(255,255,255,0.12)'}`,
              background: bannerPreview ? 'transparent' : 'rgba(255,255,255,0.02)',
              cursor: uploadingBanner ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', position: 'relative',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => { if (!uploadingBanner) e.currentTarget.style.borderColor = 'rgba(138,21,56,0.7)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = bannerPreview ? 'rgba(138,21,56,0.4)' : 'rgba(255,255,255,0.12)' }}
          >
            {bannerPreview ? (
              <>
                <img src={bannerPreview} alt="banner" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'rgba(0,0,0,0.5)', opacity: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color: '#fff', transition: 'opacity 0.15s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
                >
                  {uploadingBanner ? 'Uploading…' : 'Change Banner'}
                </div>
              </>
            ) : uploadingBanner ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Uploading…</div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🖼</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Click to upload banner</div>
                <div style={{ fontSize: 11 }}>Recommended: 1200 × 400 · Max 10 MB</div>
              </div>
            )}
          </div>
          <input ref={bannerRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBannerChange} />
        </div>

        {/* Logo */}
        <div style={{ marginBottom: appearanceMsg ? 16 : 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            Club Logo
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div
              onClick={() => !uploadingLogo && logoRef.current?.click()}
              style={{
                width: 88, height: 88, borderRadius: 16, flexShrink: 0,
                border: `2px dashed ${logoPreview ? 'rgba(138,21,56,0.4)' : 'rgba(255,255,255,0.12)'}`,
                background: logoPreview ? 'transparent' : 'rgba(255,255,255,0.02)',
                cursor: uploadingLogo ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', position: 'relative', transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => { if (!uploadingLogo) e.currentTarget.style.borderColor = 'rgba(138,21,56,0.7)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = logoPreview ? 'rgba(138,21,56,0.4)' : 'rgba(255,255,255,0.12)' }}
            >
              {logoPreview ? (
                <>
                  <img src={logoPreview} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{
                    position: 'absolute', inset: 0, borderRadius: 14,
                    background: 'rgba(0,0,0,0.55)', opacity: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: '#fff', transition: 'opacity 0.15s',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
                  >
                    {uploadingLogo ? '…' : 'Change'}
                  </div>
                </>
              ) : uploadingLogo ? (
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>…</div>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 6 }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>+</div>
                  <div style={{ fontSize: 10, lineHeight: 1.3 }}>Logo</div>
                </div>
              )}
            </div>
            <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoChange} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                {club.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                Square image · PNG or JPG · Max 5 MB
              </div>
              <button
                onClick={() => !uploadingLogo && logoRef.current?.click()}
                disabled={uploadingLogo}
                style={{
                  padding: '6px 16px', borderRadius: 8,
                  background: 'rgba(138,21,56,0.15)', border: '1px solid rgba(138,21,56,0.3)',
                  color: 'var(--accent)', fontSize: 12, fontWeight: 700,
                  cursor: uploadingLogo ? 'default' : 'pointer', opacity: uploadingLogo ? 0.6 : 1,
                }}
              >
                {uploadingLogo ? 'Uploading…' : logoPreview ? 'Change Logo' : 'Upload Logo'}
              </button>
            </div>
          </div>
        </div>

        {/* Status message */}
        {appearanceMsg && (
          <div style={{
            marginTop: 12, padding: '9px 14px', borderRadius: 9,
            background: appearanceMsg.startsWith('Upload failed') || appearanceMsg.startsWith('Please') || appearanceMsg.includes('must be')
              ? 'rgba(255,107,107,0.08)' : 'rgba(34,197,94,0.08)',
            border: appearanceMsg.startsWith('Upload failed') || appearanceMsg.startsWith('Please') || appearanceMsg.includes('must be')
              ? '1px solid rgba(255,107,107,0.25)' : '1px solid rgba(34,197,94,0.25)',
            fontSize: 13, fontWeight: 600,
            color: appearanceMsg.startsWith('Upload failed') || appearanceMsg.startsWith('Please') || appearanceMsg.includes('must be')
              ? '#ff6b6b' : '#4ade80',
          }}>
            {appearanceMsg}
          </div>
        )}
      </div>

      {/* Events */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 18 }}>Events</h2>
        {events.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No events yet. Create your first one!</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {events.map(ev => {
              const isCompleted = !ev.is_live && !!ev.start_time && new Date(ev.start_time) < new Date()
              return (
                <div key={ev.id} style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isCompleted ? 'rgba(138,21,56,0.2)' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 10,
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ev.title}
                      </div>
                      {isCompleted && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                          padding: '2px 7px', borderRadius: 9999, flexShrink: 0,
                          background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
                          color: '#4ade80',
                        }}>COMPLETED</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {ev.location ?? 'No location'} · {ev.karak_points_reward} pts
                      </span>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 11, fontWeight: 700,
                        padding: '2px 8px', borderRadius: 9999,
                        background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.25)',
                        color: '#38bdf8',
                      }}>
                        👥 {ev.attendee_count} checked in
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => setQrEvent(ev)}
                      style={{
                        padding: '4px 11px', borderRadius: 9999,
                        border: '1px solid rgba(14,165,233,0.35)',
                        background: 'rgba(14,165,233,0.08)',
                        color: '#38bdf8', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      QR
                    </button>
                    {isCompleted && (
                      <button
                        onClick={() => setCertEvent(ev)}
                        style={{
                          padding: '4px 11px', borderRadius: 9999,
                          border: '1px solid rgba(233,193,118,0.35)',
                          background: 'rgba(233,193,118,0.08)',
                          color: 'var(--gold)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        🎓 Send Certs
                      </button>
                    )}
                    {ev.is_live && (
                      <button
                        onClick={() => handleOpenEventAnn(ev)}
                        style={{
                          padding: '4px 11px', borderRadius: 9999,
                          border: '1px solid rgba(255,180,171,0.35)',
                          background: 'rgba(255,180,171,0.08)',
                          color: 'var(--live-red)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        📢 Announce
                      </button>
                    )}
                    <button
                      onClick={() => toggleLive(ev)}
                      style={{
                        padding: '4px 12px', borderRadius: 9999,
                        border: ev.is_live ? '1px solid rgba(255,180,171,0.4)' : '1px solid rgba(87,65,68,0.3)',
                        background: ev.is_live ? 'rgba(255,180,171,0.1)' : 'transparent',
                        color: ev.is_live ? 'var(--live-red)' : 'var(--text-muted)',
                        fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      {ev.is_live ? '● LIVE' : 'Go Live'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* QR Modal */}
      {qrEvent && (
        <QRModal event={qrEvent} onClose={() => setQrEvent(null)} />
      )}

      {/* Certificate Modal */}
      {certEvent && (
        <CertificateModal
          event={certEvent}
          club={club}
          members={teamMembers}
          onClose={() => setCertEvent(null)}
        />
      )}

      {/* Image lightbox */}
      {lightboxSrc && createPortal(
        <div
          onClick={() => setLightboxSrc(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.93)', backdropFilter: 'blur(18px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, cursor: 'zoom-out',
          }}
        >
          <img
            src={lightboxSrc}
            alt=""
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '92vw', maxHeight: '88vh',
              objectFit: 'contain', borderRadius: 14,
              boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
              cursor: 'default',
            }}
          />
          <button
            onClick={() => setLightboxSrc(null)}
            style={{
              position: 'absolute', top: 18, right: 18,
              width: 38, height: 38, borderRadius: '50%',
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff', fontSize: 18, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>,
        document.body
      )}

      {/* Event Announcement Modal */}
      {evtAnnEvent && (
        <EventAnnouncementModal
          event={evtAnnEvent}
          announcements={evtAnnouncements}
          content={evtAnnContent}
          posting={postingEvtAnn}
          onContentChange={setEvtAnnContent}
          onPost={handlePostEventAnn}
          onClose={() => setEvtAnnEvent(null)}
        />
      )}
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

function TeamAvatar({ name }: { name?: string | null }) {
  const l = (name ?? '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div style={{
      width: 34, height: 34, borderRadius: '50%', background: 'var(--accent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0,
      border: '2px solid rgba(255,255,255,0.08)',
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
  const initCustom = customRole ?? (role === 'officer' ? 'Officer' : '')
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
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px', borderRadius: 10, marginBottom: 6,
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <TeamAvatar name={profile.full_name} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{profile.full_name ?? 'Unknown'}</div>
        {profile.school && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.school}</div>}
        {profile.email && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.email}</div>}
      </div>
      <RoleTags
        key={`new-${profile.id}`}
        role={role}
        customRole={customRole ?? null}
        onChange={handleChange}
      />
      <button
        onMouseDown={e => e.preventDefault()}
        onClick={() => onAdd(profile.id, pendingRef.current.role, pendingRef.current.customRole)}
        disabled={isLoading}
        style={{
          padding: '5px 14px', borderRadius: 7,
          background: isLoading ? 'rgba(138,21,56,0.3)' : 'var(--accent)',
          border: 'none', color: '#fff', fontSize: 12, fontWeight: 700,
          cursor: isLoading ? 'default' : 'pointer', flexShrink: 0, transition: 'background 0.15s',
        }}
      >{isLoading ? '…' : '+ Add'}</button>
    </div>
  )
}

// ─── ExistingMemberRow ──────────────────────────────────────────────────────

function ExistingMemberRow({
  profile, membership, isLoading, onRoleChange, onRemove,
}: {
  profile: ProfileSearchRow
  membership: MembershipRow
  isLoading: boolean
  onRoleChange: (membershipId: string, role: 'officer' | 'member', customRole?: string) => void
  onRemove: (membershipId: string) => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px', borderRadius: 10, marginBottom: 6,
      background: 'rgba(138,21,56,0.06)', border: '1px solid rgba(138,21,56,0.2)',
    }}>
      <TeamAvatar name={profile.full_name} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{profile.full_name ?? 'Unknown'}</div>
        {profile.school && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.school}</div>}
        {profile.email && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.email}</div>}
      </div>
      <RoleTags
        key={`${membership.id}-${membership.role}-${membership.custom_role}`}
        role={membership.role as 'officer' | 'member'}
        customRole={membership.custom_role}
        disabled={isLoading}
        onChange={(r, c) => onRoleChange(membership.id, r, c)}
      />
      <button
        onClick={() => onRemove(membership.id)}
        disabled={isLoading}
        title="Remove from club"
        style={{ background: 'transparent', border: '1px solid rgba(87,65,68,0.3)', borderRadius: 6, padding: '4px 9px', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', flexShrink: 0, opacity: isLoading ? 0.5 : 1 }}
      >{isLoading ? '…' : '✕'}</button>
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
                Sent to Google Sheets!
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {selected.size} certificate{selected.size !== 1 ? 's' : ''} dispatched to Google Sheets.
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

