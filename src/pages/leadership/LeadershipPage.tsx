import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Club } from '../../types'
import CreateClub from './CreateClub'
import CommandCenter from './CommandCenter'

const ANIM_CSS = `
@keyframes lp-fade-up   { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }
@keyframes lp-fade-in   { from{opacity:0} to{opacity:1} }
@keyframes lp-scale-in  { from{opacity:0;transform:scale(0.88)} to{opacity:1;transform:scale(1)} }
@keyframes lp-card-in   { from{opacity:0;transform:translateY(18px) scale(0.97)} to{opacity:1;transform:none} }
@keyframes lp-hourglass { 0%,100%{transform:rotate(0deg) scale(1)} 25%{transform:rotate(8deg) scale(1.08)} 75%{transform:rotate(-8deg) scale(1.08)} }
@keyframes lp-pulse-border { 0%,100%{border-color:rgba(233,193,118,0.25)} 50%{border-color:rgba(233,193,118,0.5)} }
@keyframes spin         { to{transform:rotate(360deg)} }
.lp-fade-up  { animation: lp-fade-up  0.45s cubic-bezier(0.22,1,0.36,1) both; }
.lp-fade-in  { animation: lp-fade-in  0.35s ease both; }
.lp-scale-in { animation: lp-scale-in 0.4s  cubic-bezier(0.34,1.56,0.64,1) both; }
.lp-stagger-1 { animation-delay:0.05s }
.lp-stagger-2 { animation-delay:0.12s }
.lp-stagger-3 { animation-delay:0.20s }
.lp-club-card {
  animation: lp-card-in 0.4s cubic-bezier(0.22,1,0.36,1) both;
  cursor: pointer;
  border-radius: 20px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.07);
  background: rgba(255,255,255,0.03);
  transition: border-color 0.18s, transform 0.18s, box-shadow 0.18s;
  display: flex;
  flex-direction: column;
}
.lp-club-card:hover {
  border-color: rgba(138,21,56,0.45);
  transform: translateY(-3px);
  box-shadow: 0 16px 48px rgba(0,0,0,0.4), 0 0 0 1px rgba(138,21,56,0.2);
}
.lp-new-card {
  animation: lp-card-in 0.4s cubic-bezier(0.22,1,0.36,1) both;
  cursor: pointer;
  border-radius: 20px;
  overflow: hidden;
  border: 2px dashed rgba(138,21,56,0.3);
  background: rgba(138,21,56,0.04);
  transition: border-color 0.18s, transform 0.18s, background 0.18s;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 220px;
}
.lp-new-card:hover {
  border-color: rgba(138,21,56,0.6);
  background: rgba(138,21,56,0.09);
  transform: translateY(-3px);
}
.lp-pending-card {
  animation: lp-card-in 0.4s cubic-bezier(0.22,1,0.36,1) both, lp-pulse-border 2.5s ease-in-out 0.5s infinite;
  border-radius: 20px;
  overflow: hidden;
  border: 1px solid rgba(233,193,118,0.25);
  background: rgba(233,193,118,0.04);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 220px;
  gap: 10px;
  padding: 24px;
  cursor: default;
}
.lp-refresh-btn { transition: border-color 0.15s, color 0.15s, transform 0.15s; }
.lp-refresh-btn:hover { border-color:rgba(255,255,255,0.28)!important; color:var(--text-primary)!important; transform:translateY(-2px); }
`

interface ClubRequest {
  id: string
  name: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

interface PermissionedClub {
  club: Club
  permissions: string[]
}

// ── Club Selector ─────────────────────────────────────────────────────────────

function ClubSelector({
  allAccessible,
  canCreateMore,
  pendingRequest,
  rejectedRequest,
  onSelect,
  onCreateNew,
  onRefresh,
}: {
  allAccessible: Array<{ club: Club; permissions?: string[] }>
  canCreateMore: boolean
  pendingRequest?: ClubRequest | null
  rejectedRequest?: ClubRequest | null
  onSelect: (id: string, permissions?: string[]) => void
  onCreateNew: () => void
  onRefresh: () => void
}) {
  const totalCards = allAccessible.length + (pendingRequest ? 1 : 0) + (canCreateMore && !pendingRequest ? 1 : 0)
  const isEmpty = totalCards === 0

  return (
    <div className="page-content" style={{ maxWidth: 1100 }}>
      <style>{ANIM_CSS}</style>

      {/* Header */}
      <div className="lp-fade-up" style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 10 }}>
          Leadership
        </div>
        <h1 style={{ fontSize: 'clamp(22px, 4vw, 36px)', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.5px', marginBottom: 8 }}>
          {isEmpty ? 'Start Your Journey' : 'Your Clubs'}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {isEmpty
            ? 'Create your first club and build something great.'
            : 'Select a club to open its command center.'
          }
        </p>
      </div>

      {/* Rejected notice banner */}
      {rejectedRequest && (
        <div className="lp-fade-up" style={{ marginBottom: 24, padding: '14px 20px', borderRadius: 14, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1.4 }}>❌</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f87171', marginBottom: 4 }}>
              Previous request for "{rejectedRequest.name}" was not approved
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
              Please review your application and resubmit using the card below, or contact{' '}
              <a href="mailto:support@clubsynq.org" style={{ color: 'var(--accent)' }}>support@clubsynq.org</a> for more information.
            </div>
          </div>
        </div>
      )}

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 20 }}>

        {allAccessible.map((a, i) => {
          const isPresident = !a.permissions
          const club = a.club
          return (
            <div
              key={club.id}
              className="lp-club-card"
              style={{ animationDelay: `${i * 0.07}s` }}
              onClick={() => onSelect(club.id, a.permissions)}
            >
              {/* Banner */}
              <div style={{ height: 120, position: 'relative', flexShrink: 0, overflow: 'hidden' }}>
                {club.banner_url
                  ? <img src={club.banner_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                  : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#1a0a10 0%,#3a1020 50%,#1a0a10 100%)' }}/>
                }
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(10,5,8,0.85) 0%, transparent 60%)' }}/>
                <div style={{ position: 'absolute', top: 12, right: 12 }}>
                  {isPresident
                    ? <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', padding: '4px 10px', borderRadius: 9999, background: 'rgba(233,193,118,0.18)', border: '1px solid rgba(233,193,118,0.4)', color: '#e9c176', backdropFilter: 'blur(8px)' }}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M2 19.5h20v2H2v-2zM12 2L8 9 2 6l3 11.5h14L22 6l-6 3-4-7z"/></svg>
                        PRESIDENT
                      </span>
                    : <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', padding: '4px 10px', borderRadius: 9999, background: 'rgba(167,139,250,0.18)', border: '1px solid rgba(167,139,250,0.35)', color: '#c4b5fd', backdropFilter: 'blur(8px)' }}>
                        ADMIN
                      </span>
                  }
                </div>
                {club.logo_url && (
                  <div style={{ position: 'absolute', bottom: 12, left: 16 }}>
                    <img src={club.logo_url} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', border: '2px solid rgba(255,255,255,0.15)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}/>
                  </div>
                )}
              </div>

              {/* Info */}
              <div style={{ padding: '16px 18px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 3, lineHeight: 1.2 }}>{club.name}</div>
                    {club.category && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{club.category}</div>
                    )}
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }}>
                    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                  </svg>
                </div>
                {club.description && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {club.description}
                  </div>
                )}
                <div style={{ marginTop: 'auto', paddingTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{club.member_count.toLocaleString()} members</span>
                  {club.is_verified && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: '#e9c176', background: 'rgba(233,193,118,0.1)', border: '1px solid rgba(233,193,118,0.2)', borderRadius: 9999, padding: '2px 8px' }}>✓ Verified</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {/* Pending request card */}
        {pendingRequest && (
          <div
            className="lp-pending-card"
            style={{ animationDelay: `${allAccessible.length * 0.07}s` }}
          >
            <div style={{ fontSize: 40, lineHeight: 1, animation: 'lp-hourglass 3s ease-in-out 0.5s infinite' }}>⏳</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center' }}>{pendingRequest.name}</div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#e9c176', textTransform: 'uppercase' }}>
              Pending Approval
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', lineHeight: 1.5 }}>
              Submitted {new Date(pendingRequest.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
            <button
              onClick={onRefresh}
              className="lp-refresh-btn"
              style={{ marginTop: 6, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 16px', color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Refresh status
            </button>
          </div>
        )}

        {/* Create New Club card — hidden while a request is pending */}
        {canCreateMore && !pendingRequest && (
          <div
            className="lp-new-card"
            style={{ animationDelay: `${(allAccessible.length + (pendingRequest ? 1 : 0)) * 0.07}s` }}
            onClick={onCreateNew}
          >
            <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(138,21,56,0.15)', border: '1px solid rgba(138,21,56,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>Create New Club</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '0 24px' }}>
              {allAccessible.length === 0 ? 'Start your first club and build something great' : 'Start a new organization and build your legacy'}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function LeadershipPage() {
  const { user } = useAuth()
  const [presClubs, setPresClubs]         = useState<Club[] | undefined>(undefined)
  const [request, setRequest]             = useState<ClubRequest | null | undefined>(undefined)
  const [permClubs, setPermClubs]         = useState<PermissionedClub[]>([])
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null)
  const [selectedPerms, setSelectedPerms]   = useState<string[] | undefined>(undefined)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [foundedCount, setFoundedCount] = useState(0)

  async function fetchClub() {
    if (!user) return

    const [memRes, foundedRes, reqRes] = await Promise.all([
      supabase
        .from('club_memberships')
        .select('role, custom_role, permissions, club:clubs(*, university:universities(*))')
        .eq('user_id', user.id),
      supabase
        .from('clubs')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', user.id),
      supabase
        .from('club_requests')
        .select('id, name, status, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const allMem = (memRes.data ?? []) as any[]
    setFoundedCount(foundedRes.count ?? 0)

    const pClubs = allMem.filter(m => m.role === 'president').map(m => m.club as Club)
    setPresClubs(pClubs)
    setRequest(reqRes.data ?? null)

    const withAccess = allMem
      .filter(m => m.role !== 'president' && (m.role === 'officer' || m.custom_role || (m.permissions?.length ?? 0) > 0))
    setPermClubs(withAccess.map(m => ({ club: m.club, permissions: m.permissions })))
  }

  useEffect(() => { fetchClub() }, [user])

  function handleClubUpdated(patch: Partial<Club>) {
    setPresClubs(prev => prev?.map(c => c.id === selectedClubId ? { ...c, ...patch } : c))
    setPermClubs(prev => prev.map(pc => pc.club.id === selectedClubId ? { ...pc, club: { ...pc.club, ...patch } } : pc))
  }

  // ── Loading ──
  if (presClubs === undefined || request === undefined) {
    return (
      <>
        <style>{ANIM_CSS}</style>
        <div className="lp-fade-in" style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'60vh', gap:16 }}>
          <div style={{ width:40, height:40, borderRadius:'50%', border:'3px solid rgba(138,21,56,0.2)', borderTopColor:'var(--accent)', animation:'spin 0.8s linear infinite' }}/>
          <div style={{ color:'var(--text-muted)', fontSize:13 }}>Loading your leadership space…</div>
        </div>
      </>
    )
  }

  const allAccessible: Array<{ club: Club; permissions?: string[] }> = [
    ...(presClubs ?? []).map(c => ({ club: c })),
    ...permClubs.map(pc => ({ club: pc.club, permissions: pc.permissions })),
  ]

  const canCreateMore = foundedCount < 2
  const pendingRequest  = request?.status === 'pending'  ? request : null
  const rejectedRequest = request?.status === 'rejected' ? request : null

  // Show create form
  if (showCreateForm) {
    return (
      <>
        <style>{ANIM_CSS}</style>
        <div style={{ padding: 'clamp(16px, 3vw, 28px) clamp(16px, 3vw, 28px) 0' }}>
          <button
            onClick={() => setShowCreateForm(false)}
            style={{ display:'flex', alignItems:'center', gap:7, background:'transparent', border:'none', color:'var(--text-muted)', fontSize:13, fontWeight:600, cursor:'pointer', padding:'6px 0', fontFamily:'inherit', transition:'color .15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
            </svg>
            Back to My Clubs
          </button>
        </div>
        <CreateClub onCreated={async () => { await fetchClub(); setShowCreateForm(false) }} />
      </>
    )
  }

  // Show CommandCenter for selected club
  if (selectedClubId) {
    const active = allAccessible.find(a => a.club.id === selectedClubId)
    if (active) {
      const backBtn = (
        <button
          onClick={() => setSelectedClubId(null)}
          style={{ display:'flex', alignItems:'center', gap:7, background:'transparent', border:'none', color:'var(--text-muted)', fontSize:12, fontWeight:600, cursor:'pointer', padding:'0', fontFamily:'inherit', marginBottom:20, transition:'color .15s' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          My Clubs
        </button>
      )
      return (
        <CommandCenter
          key={active.club.id}
          club={active.club}
          userPermissions={active.permissions ?? selectedPerms}
          onDeleted={() => { setSelectedClubId(null); fetchClub() }}
          onPresidencyTransferred={() => { setSelectedClubId(null); fetchClub() }}
          onClubUpdated={handleClubUpdated}
          clubSwitcher={backBtn}
        />
      )
    }
    // Club not found — fall through to selector
    setSelectedClubId(null)
  }

  // ── Always show selector ──
  return (
    <ClubSelector
      allAccessible={allAccessible}
      canCreateMore={canCreateMore}
      pendingRequest={pendingRequest}
      rejectedRequest={rejectedRequest}
      onSelect={(id, perms) => { setSelectedClubId(id); setSelectedPerms(perms) }}
      onCreateNew={() => setShowCreateForm(true)}
      onRefresh={fetchClub}
    />
  )
}
