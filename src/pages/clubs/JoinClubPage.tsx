import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

interface ClubInfo {
  id: string
  name: string
  logo_url: string | null
}

type Status = 'loading' | 'already' | 'success' | 'error'

export default function JoinClubPage() {
  const { code } = useParams<{ code: string }>()
  const { user, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [club, setClub] = useState<ClubInfo | null>(null)
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    if (code && user) joinClub()
  }, [code, user])

  async function joinClub() {
    if (!code || !user) return

    const { data: c } = await supabase
      .from('clubs')
      .select('id, name, logo_url')
      .eq('invite_code', code)
      .maybeSingle()

    if (!c) { setStatus('error'); return }
    setClub(c)

    const { data: existing } = await supabase
      .from('club_memberships')
      .select('id')
      .eq('club_id', c.id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing) { setStatus('already'); return }

    await supabase.from('club_memberships').insert({ club_id: c.id, user_id: user.id, role: 'member' })
    await supabase.from('karak_transactions').insert({ user_id: user.id, points: 5, reason: `Joined club: ${c.name}` })
    await refreshProfile()

    setStatus('success')
  }

  const initials = (club?.name ?? '').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-dark)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      fontFamily: 'inherit',
    }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pop{0%{transform:scale(0.8);opacity:0}100%{transform:scale(1);opacity:1}}`}</style>

      <div style={{
        width: '100%', maxWidth: 380,
        background: 'var(--bg-card)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 24,
        padding: '40px 32px',
        textAlign: 'center',
        boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
        animation: 'pop 0.25s ease-out',
      }}>

        {status === 'loading' && (
          <>
            <div style={{
              width: 40, height: 40,
              border: '3px solid rgba(87,65,68,0.3)',
              borderTopColor: 'var(--accent)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 20px',
            }} />
            <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Joining club…</div>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{ width: 72, height: 72, borderRadius: 18, margin: '0 auto 16px', overflow: 'hidden', background: 'rgba(138,21,56,0.15)', border: '1px solid rgba(138,21,56,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: 'var(--accent)' }}>
              {club?.logo_url ? <img src={club.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 8 }}>
              Welcome
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, lineHeight: 1.3 }}>
              You've joined {club?.name}
            </h2>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(233,193,118,0.12)', border: '1px solid rgba(233,193,118,0.3)',
              borderRadius: 9999, padding: '6px 16px',
              fontSize: 14, fontWeight: 700, color: 'var(--gold)',
              marginTop: 12, marginBottom: 20,
            }}>
              +5 Karak Points
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 28 }}>
              You're now a member. Head to the club page to see announcements and events.
            </p>
            <button
              onClick={() => navigate(`/clubs/${club?.id}`)}
              style={{
                width: '100%', padding: '12px',
                background: 'var(--accent)', border: 'none',
                borderRadius: 12, color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Go to Club
            </button>
          </>
        )}

        {status === 'already' && (
          <>
            <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#22c55e', textTransform: 'uppercase', marginBottom: 8 }}>
              Already a Member
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, lineHeight: 1.3 }}>
              {club?.name}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 28 }}>
              You're already part of this club.
            </p>
            <button
              onClick={() => navigate(`/clubs/${club?.id}`)}
              style={{
                width: '100%', padding: '12px',
                background: 'transparent', border: '1px solid rgba(87,65,68,0.35)',
                borderRadius: 12, color: 'var(--text-muted)',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Go to Club
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize: 56, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              Invite Not Found
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 28 }}>
              This invite link may be invalid or no longer active.
            </p>
            <button
              onClick={() => navigate('/')}
              style={{
                width: '100%', padding: '12px',
                background: 'transparent', border: '1px solid rgba(87,65,68,0.35)',
                borderRadius: 12, color: 'var(--text-muted)',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Go to Home
            </button>
          </>
        )}
      </div>
    </div>
  )
}
