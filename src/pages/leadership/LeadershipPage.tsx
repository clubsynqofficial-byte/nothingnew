import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Club } from '../../types'
import CreateClub from './CreateClub'
import CommandCenter from './CommandCenter'

const ANIM_CSS = `
@keyframes lp-fade-up {
  from { opacity: 0; transform: translateY(22px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes lp-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes lp-scale-in {
  from { opacity: 0; transform: scale(0.88); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes lp-hourglass {
  0%,100% { transform: rotate(0deg) scale(1); }
  25%      { transform: rotate(8deg) scale(1.08); }
  75%      { transform: rotate(-8deg) scale(1.08); }
}
@keyframes lp-shimmer-bar {
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
}
.lp-fade-up   { animation: lp-fade-up  0.45s cubic-bezier(0.22,1,0.36,1) both; }
.lp-fade-in   { animation: lp-fade-in  0.35s ease both; }
.lp-scale-in  { animation: lp-scale-in 0.4s  cubic-bezier(0.34,1.56,0.64,1) both; }
.lp-stagger-1 { animation-delay: 0.05s; }
.lp-stagger-2 { animation-delay: 0.12s; }
.lp-stagger-3 { animation-delay: 0.20s; }
.lp-stagger-4 { animation-delay: 0.28s; }
.lp-refresh-btn {
  transition: border-color 0.15s, color 0.15s, transform 0.15s;
}
.lp-refresh-btn:hover {
  border-color: rgba(255,255,255,0.28) !important;
  color: var(--text-primary) !important;
  transform: translateY(-2px);
}
`

interface ClubRequest {
  id: string
  name: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

export default function LeadershipPage() {
  const { user } = useAuth()
  const [club, setClub]       = useState<Club | null | undefined>(undefined)
  const [request, setRequest] = useState<ClubRequest | null | undefined>(undefined)

  async function fetchClub() {
    if (!user) return

    // Check for an existing approved club
    const { data: clubData } = await supabase
      .from('clubs')
      .select('*, university:universities(*)')
      .eq('president_id', user.id)
      .maybeSingle()

    setClub(clubData ?? null)

    // If no club yet, check for a pending or rejected request
    if (!clubData) {
      const { data: reqData } = await supabase
        .from('club_requests')
        .select('id, name, status, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      setRequest(reqData ?? null)
    }
  }

  useEffect(() => { fetchClub() }, [user])

  // Still loading
  if (club === undefined || (club === null && request === undefined)) {
    return (
      <>
        <style>{ANIM_CSS}</style>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }} className="lp-fade-in">
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            border: '3px solid rgba(138,21,56,0.2)',
            borderTopColor: 'var(--accent)',
            animation: 'spin 0.8s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading your leadership space…</div>
        </div>
      </>
    )
  }

  // Has an approved club
  if (club) return <CommandCenter club={club} />

  // Has a pending request — show waiting screen
  if (request?.status === 'pending') {
    return (
      <>
        <style>{ANIM_CSS}</style>
        <div className="page-content" style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center', gap: 24 }}>
          <div className="lp-scale-in" style={{ fontSize: 64, lineHeight: 1, animation: 'lp-scale-in 0.4s cubic-bezier(0.34,1.56,0.64,1) both, lp-hourglass 3s ease-in-out 0.5s infinite' }}>
            ⏳
          </div>
          <div className="lp-fade-up lp-stagger-1">
            <h2 style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 12, letterSpacing: '-0.5px' }}>
              Application Under Review
            </h2>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>
              Your request to create <strong style={{ color: 'var(--text-primary)' }}>{request.name}</strong> is being reviewed by ClubSynq support.
              <br /><br />
              You'll receive an email at your registered address once a decision is made. This usually takes 1–2 business days.
            </p>
          </div>
          <div className="lp-fade-up lp-stagger-2" style={{
            padding: '14px 22px', borderRadius: 14,
            background: 'rgba(233,193,118,0.08)', border: '1px solid rgba(233,193,118,0.2)',
            fontSize: 13, color: 'rgba(233,193,118,0.7)', lineHeight: 1.6,
          }}>
            📬 Submitted on {new Date(request.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
          <button
            className="lp-fade-up lp-stagger-3 lp-refresh-btn"
            onClick={fetchClub}
            style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10, padding: '9px 22px', color: 'rgba(255,255,255,0.4)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Refresh status
          </button>
        </div>
      </>
    )
  }

  // Request was rejected — let them try again with a notice
  if (request?.status === 'rejected') {
    return (
      <>
        <style>{ANIM_CSS}</style>
        <div>
          <div className="page-content" style={{ maxWidth: 860 }}>
            <div
              className="lp-fade-up"
              style={{
                marginBottom: 24, padding: '14px 20px', borderRadius: 14,
                background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)',
                display: 'flex', alignItems: 'flex-start', gap: 12,
              }}
            >
              <span style={{ fontSize: 20, flexShrink: 0 }}>❌</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f87171', marginBottom: 4 }}>
                  Previous request for "{request.name}" was not approved
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                  Please review your application and resubmit, or contact{' '}
                  <a href="mailto:support@clubsynq.org" style={{ color: 'var(--accent)' }}>support@clubsynq.org</a> for more information.
                </div>
              </div>
            </div>
          </div>
          <CreateClub onCreated={fetchClub} />
        </div>
      </>
    )
  }

  // No club and no request — show the creation form
  return (
    <>
      <style>{ANIM_CSS}</style>
      <CreateClub onCreated={fetchClub} />
    </>
  )
}
