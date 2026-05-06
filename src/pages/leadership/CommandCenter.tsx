import { useState, useEffect, useRef, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Club, Event } from '../../types'

interface Stats {
  memberCount: number
  eventCount: number
  totalAttendees: number
  threadCount: number
  newMembersThisMonth: number
}

interface AnnouncementRow {
  id: string
  content: string
  created_at: string
  profile: { full_name: string | null; role: string | null } | null
}

interface MembershipRow {
  id: string
  user_id: string
  role: 'member' | 'officer' | 'president'
  custom_role: string | null
  profile: { full_name: string | null; school: string | null } | null
}

interface ProfileSearchRow {
  id: string
  full_name: string | null
  school: string | null
}

interface Props {
  club: Club
}

export default function CommandCenter({ club }: Props) {
  const { user } = useAuth()
  const [stats, setStats] = useState<Stats>({ memberCount: 0, eventCount: 0, totalAttendees: 0, threadCount: 0, newMembersThisMonth: 0 })
  const [events, setEvents] = useState<Event[]>([])
  const [vaultDocs, setVaultDocs] = useState<{ id: string; title: string; created_at: string }[]>([])
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

  // Announcement state
  const [annContent, setAnnContent] = useState('')
  const [postingAnn, setPostingAnn] = useState(false)

  useEffect(() => { fetchAll() }, [club.id])

  async function fetchAll() {
    setLoadingStats(true)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const [membersRes, eventsRes, vaultRes, threadsRes, newMembersRes, annRes, teamRes] = await Promise.all([
      supabase.from('club_memberships').select('id', { count: 'exact' }).eq('club_id', club.id),
      supabase.from('events').select('*').eq('club_id', club.id).order('created_at', { ascending: false }),
      supabase.from('legacy_vault_docs').select('id,title,created_at').eq('club_id', club.id).order('created_at', { ascending: false }).limit(8),
      supabase.from('club_threads').select('id', { count: 'exact' }).eq('club_id', club.id),
      supabase.from('club_memberships').select('id', { count: 'exact' }).eq('club_id', club.id).gte('joined_at', thirtyDaysAgo.toISOString()),
      supabase.from('club_announcements')
        .select('id, content, created_at, profile:profiles(full_name, role)')
        .eq('club_id', club.id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('club_memberships')
        .select('id, user_id, role, custom_role, profile:profiles(full_name, school)')
        .eq('club_id', club.id)
        .order('joined_at', { ascending: true }),
    ])

    const memberCount = membersRes.count ?? 0
    const evList = eventsRes.data ?? []
    const totalAttendees = evList.reduce((sum, e) => sum + (e.attendee_count ?? 0), 0)

    setStats({
      memberCount,
      eventCount: evList.length,
      totalAttendees,
      threadCount: threadsRes.count ?? 0,
      newMembersThisMonth: newMembersRes.count ?? 0,
    })
    setEvents(evList)
    setVaultDocs(vaultRes.data ?? [])
    setAnnouncements((annRes.data as unknown as AnnouncementRow[]) ?? [])
    setTeamMembers((teamRes.data as unknown as MembershipRow[]) ?? [])
    setLoadingStats(false)
  }

  async function handleCreateEvent(e: FormEvent) {
    e.preventDefault()
    setEventError('')
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

  async function handlePostAnnouncement() {
    if (!user || !annContent.trim()) return
    setPostingAnn(true)
    await supabase.from('club_announcements').insert({
      club_id: club.id,
      user_id: user.id,
      content: annContent.trim(),
    })
    setAnnContent('')
    setPostingAnn(false)
    fetchAll()
  }

  // Debounced profile search
  useEffect(() => {
    if (!memberSearch.trim()) { setSearchProfiles([]); setSearchLoading(false); return }
    setSearchLoading(true)
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, school')
        .ilike('full_name', `%${memberSearch.trim()}%`)
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
    <div style={{ padding: '32px 28px', maxWidth: 1100 }}>
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
            placeholder="Search by name to find and add members…"
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
                    profile={{ id: m.user_id, full_name: m.profile?.full_name ?? null, school: m.profile?.school ?? null }}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{annContent.length} / 600</span>
            <button
              onClick={handlePostAnnouncement}
              disabled={postingAnn || !annContent.trim()}
              style={{
                background: annContent.trim() ? 'var(--accent)' : 'rgba(87,65,68,0.18)',
                border: 'none',
                borderRadius: 9,
                padding: '9px 22px',
                color: annContent.trim() ? '#fff' : 'var(--text-muted)',
                fontSize: 13,
                fontWeight: 700,
                cursor: annContent.trim() ? 'pointer' : 'default',
                transition: 'all 0.15s',
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
                  <p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.65, margin: 0 }}>
                    {ann.content}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Events + Legacy Vault */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Events list */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 18 }}>Events</h2>
          {events.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No events yet. Create your first one!</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {events.map(ev => (
                <div key={ev.id} style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 10,
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ev.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {ev.location ?? 'No location'} · {ev.karak_points_reward} pts · {ev.attendee_count} attending
                    </div>
                  </div>
                  <button
                    onClick={() => toggleLive(ev)}
                    style={{
                      flexShrink: 0,
                      padding: '4px 12px',
                      borderRadius: 9999,
                      border: ev.is_live ? '1px solid rgba(255,180,171,0.4)' : '1px solid rgba(87,65,68,0.3)',
                      background: ev.is_live ? 'rgba(255,180,171,0.1)' : 'transparent',
                      color: ev.is_live ? 'var(--live-red)' : 'var(--text-muted)',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {ev.is_live ? '● LIVE' : 'Go Live'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Legacy Vault */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Legacy Vault</h2>
            <VaultUpload clubId={club.id} onUploaded={fetchAll} />
          </div>
          {vaultDocs.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No documents yet. Upload your first.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {vaultDocs.map(doc => (
                <div key={doc.id} style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(87,65,68,0.2)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}>
                  <span style={{ fontSize: 16 }}>📄</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{doc.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {new Date(doc.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
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
        {profile.school && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{profile.school}</div>}
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
        {profile.school && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{profile.school}</div>}
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

function VaultUpload({ clubId, onUploaded }: { clubId: string; onUploaded: () => void }) {
  const { user } = useAuth()
  const [title, setTitle] = useState('')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!title.trim() || !user) return
    setSaving(true)
    await supabase.from('legacy_vault_docs').insert({ club_id: clubId, title: title.trim(), uploaded_by: user.id })
    setTitle('')
    setOpen(false)
    setSaving(false)
    onUploaded()
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ background: 'transparent', border: '1px solid rgba(233,193,118,0.3)', borderRadius: 6, padding: '5px 12px', color: 'var(--gold)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer' }}>
        + UPLOAD
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Document name"
        onKeyDown={e => { if (e.key === 'Enter') save() }}
        style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', color: 'var(--text-primary)', fontSize: 12, outline: 'none', width: 140 }}
      />
      <button onClick={save} disabled={saving} style={{ background: 'var(--accent)', border: 'none', borderRadius: 6, padding: '5px 10px', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
        {saving ? '…' : 'Save'}
      </button>
      <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }}>✕</button>
    </div>
  )
}
