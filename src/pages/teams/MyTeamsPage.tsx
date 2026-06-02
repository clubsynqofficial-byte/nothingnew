import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

interface TournamentTeamInvite {
  id: string
  tournament_team_id: string
  user_id: string
  status: 'pending' | 'accepted' | 'declined'
  invite_type: 'invite' | 'request'
  created_at: string
  tournament_team?: {
    id: string; team_name: string; logo_url: string | null
    tournament?: { id: string; name: string; sport: string } | null
  } | null
}

interface TournamentTeamMembership {
  id: string
  tournament_team_id: string
  role: string
  status: string
  invite_type: string
  tournament_team?: {
    id: string; team_name: string; logo_url: string | null; captain_id: string
    tournament?: { id: string; name: string; sport: string; status: string } | null
  } | null
}

const SPORT_EMOJIS: Record<string, string> = {
  Basketball: '🏀', Football: '⚽', Volleyball: '🏐', Tennis: '🎾',
  Badminton: '🏸', Cricket: '🏏', Swimming: '🏊', Athletics: '🏃',
  Chess: '♟️', Gaming: '🎮', 'Table Tennis': '🏓', Rugby: '🏉',
  Baseball: '⚾', Hockey: '🏑', Other: '🏆',
}

export default function MyTeamsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [pendingInvites, setPendingInvites] = useState<TournamentTeamInvite[]>([])
  const [memberships, setMemberships] = useState<TournamentTeamMembership[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => { if (user) fetchAll() }, [user])

  async function fetchAll() {
    if (!user) return
    setLoading(true)

    // Pending invites (captain invited me)
    const { data: inviteData } = await supabase
      .from('tournament_team_members')
      .select('*, tournament_team:tournament_teams(id, team_name, logo_url, tournament:tournaments(id, name, sport))')
      .eq('user_id', user.id)
      .eq('invite_type', 'invite')
      .eq('status', 'pending')

    // All accepted memberships + my own captain teams
    const { data: memberData } = await supabase
      .from('tournament_team_members')
      .select('*, tournament_team:tournament_teams(id, team_name, logo_url, captain_id, tournament:tournaments(id, name, sport, status))')
      .eq('user_id', user.id)
      .eq('status', 'accepted')

    setPendingInvites(inviteData ?? [])
    setMemberships(memberData ?? [])
    setLoading(false)
  }

  async function respondToInvite(inviteId: string, status: 'accepted' | 'declined') {
    setActionLoading(inviteId)
    await supabase.from('tournament_team_members').update({ status }).eq('id', inviteId)
    setPendingInvites(prev => prev.filter(i => i.id !== inviteId))
    if (status === 'accepted') fetchAll()
    setActionLoading(null)
  }

  async function leaveTeam(membershipId: string) {
    setActionLoading(membershipId)
    await supabase.from('tournament_team_members').delete().eq('id', membershipId)
    setMemberships(prev => prev.filter(m => m.id !== membershipId))
    setActionLoading(null)
  }

  if (loading) return (
    <div className="page-content" style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
      <div style={{ width: 28, height: 28, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div className="page-content">
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes team-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .team-card{transition:all 0.15s;animation:team-in 0.3s ease both;}
        .team-card:hover{transform:translateY(-2px);}
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 4 }}>My Teams</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Tournament rosters you're part of and pending invites</p>
      </div>

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Pending Invites</h2>
            <span style={{ minWidth: 18, height: 18, borderRadius: 999, background: 'var(--accent)', color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{pendingInvites.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pendingInvites.map((inv, i) => {
              const team = inv.tournament_team
              const sport = team?.tournament?.sport ?? ''
              const initials = (team?.team_name ?? '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
              return (
                <div key={inv.id} className="team-card" style={{ animationDelay: `${i * 0.05}s`, background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 14, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 11, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, overflow: 'hidden', flexShrink: 0 }}>
                      {team?.logo_url ? <img src={team.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{team?.team_name ?? 'Unknown Team'}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {SPORT_EMOJIS[sport] ?? '🏆'} {team?.tournament?.name ?? 'Tournament'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
                      <button onClick={() => respondToInvite(inv.id, 'declined')} disabled={actionLoading === inv.id} style={{ padding: '7px 13px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.28)', borderRadius: 8, color: '#f87171', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', opacity: actionLoading === inv.id ? 0.6 : 1 }}>
                        Decline
                      </button>
                      <button onClick={() => respondToInvite(inv.id, 'accepted')} disabled={actionLoading === inv.id} style={{ padding: '7px 13px', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.32)', borderRadius: 8, color: '#4ade80', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', opacity: actionLoading === inv.id ? 0.6 : 1 }}>
                        Join Team
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Active team memberships */}
      <div>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>My Tournament Teams</h2>

        {memberships.length === 0 && pendingInvites.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 16 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>No tournament teams yet</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
              Register a team in a tournament, or get invited by a Team Captain
            </div>
            <button onClick={() => navigate('/tournaments')} style={{ padding: '10px 22px', background: 'var(--accent)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(138,21,56,0.3)' }}>
              Browse Tournaments
            </button>
          </div>
        ) : memberships.length === 0 ? null : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {memberships.map((m, i) => {
              const team = m.tournament_team
              const tourny = team?.tournament
              const sport = tourny?.sport ?? ''
              const isCaptain = team?.captain_id === user?.id
              const initials = (team?.team_name ?? '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
              const tStatusSt = tourny?.status === 'ongoing' ? { color: '#f97316', bg: 'rgba(249,115,22,0.12)' } :
                tourny?.status === 'completed' ? { color: '#6b7280', bg: 'rgba(107,114,128,0.12)' } :
                { color: '#4ade80', bg: 'rgba(74,222,128,0.12)' }

              return (
                <div key={m.id} className="team-card" style={{ animationDelay: `${i * 0.05}s`, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 18, cursor: 'pointer' }}
                  onClick={() => tourny && navigate(`/tournaments/${tourny.id}`)}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 11, background: 'rgba(138,21,56,0.15)', border: '1px solid rgba(138,21,56,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, overflow: 'hidden', flexShrink: 0 }}>
                      {team?.logo_url ? <img src={team.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{team?.team_name ?? 'Unknown'}</div>
                      {isCaptain && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#e9c176', background: 'rgba(233,193,118,0.12)', borderRadius: 5, padding: '2px 7px' }}>Captain</span>}
                    </div>
                    {tourny?.status && (
                      <div style={{ flexShrink: 0, background: tStatusSt.bg, borderRadius: 999, padding: '3px 8px' }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: tStatusSt.color }}>
                          {tourny.status === 'ongoing' ? 'Live' : tourny.status === 'completed' ? 'Done' : 'Open'}
                        </span>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                    <span style={{ fontSize: 14 }}>{SPORT_EMOJIS[sport] ?? '🏆'}</span>
                    <span style={{ fontSize: 12.5, color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tourny?.name ?? 'Tournament'}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {isCaptain ? 'You own this team' : `Joined as ${m.role}`}
                    </span>
                    {!isCaptain && (
                      <button
                        onClick={e => { e.stopPropagation(); leaveTeam(m.id) }}
                        disabled={actionLoading === m.id}
                        style={{ padding: '5px 10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7, color: '#f87171', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit', opacity: actionLoading === m.id ? 0.5 : 0.8, transition: 'opacity 0.12s' }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '0.8')}
                      >
                        Leave
                      </button>
                    )}
                    {isCaptain && (
                      <button onClick={e => { e.stopPropagation(); tourny && navigate(`/tournaments/${tourny.id}?tab=register`) }} style={{ padding: '5px 10px', background: 'var(--accent)', border: 'none', borderRadius: 7, color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}>
                        Manage Roster
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
  )
}
