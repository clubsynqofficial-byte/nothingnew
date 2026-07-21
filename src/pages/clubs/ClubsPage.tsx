import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

interface MembershipRow {
  id: string
  role: 'member' | 'officer' | 'president'
  joined_at: string
  club: {
    id: string
    name: string
    description: string | null
    category: string | null
    logo_url: string | null
    banner_url: string | null
    is_verified: boolean
    member_count: number
    university?: { name: string; short_name: string | null } | null
  }
}

const CATEGORY_COLORS: Record<string, string> = {
  Technology: '#0ea5e9',
  'Arts & Culture': '#a855f7',
  Sports: '#e9c176',
  Entrepreneurship: '#f97316',
  Engineering: '#22c55e',
  Business: '#ec4899',
  Community: '#f43f5e',
  Law: '#8b5cf6',
  Science: '#06b6d4',
  Media: '#f59e0b',
}

const ROLE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  president: { bg: 'rgba(233,193,118,0.15)', color: 'var(--gold)',  label: 'President' },
  officer:   { bg: 'rgba(138,21,56,0.15)',   color: 'var(--accent)', label: 'Officer'   },
  member:    { bg: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', label: 'Member' },
}

export default function ClubsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [memberships, setMemberships] = useState<MembershipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [leavingId, setLeavingId] = useState<string | null>(null)

  const fetchMemberships = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('club_memberships')
      .select(`
        id, role, joined_at,
        club:clubs(
          id, name, description, category,
          logo_url, banner_url, is_verified, member_count,
          university:universities(name, short_name)
        )
      `)
      .eq('user_id', user.id)
      .order('joined_at', { ascending: false })
    setMemberships((data as unknown as MembershipRow[]) ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetchMemberships() }, [fetchMemberships])

  const handleLeave = async (membership: MembershipRow) => {
    if (leavingId) return
    setLeavingId(membership.id)
    await supabase.from('club_memberships').delete().eq('id', membership.id)
    await supabase
      .from('clubs')
      .update({ member_count: Math.max(0, membership.club.member_count - 1) })
      .eq('id', membership.club.id)
    setLeavingId(null)
    fetchMemberships()
  }

  const initials = (name: string) =>
    name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="page-content" style={{ maxWidth: 1100 }}>
      <style>{`
        @keyframes cl-up { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes cl-shimmer { from { background-position:-700px 0; } to { background-position:700px 0; } }
        .cl-0 { animation: cl-up 0.5s cubic-bezier(0.22,1,0.36,1) both; }
        .cl-1 { animation: cl-up 0.5s cubic-bezier(0.22,1,0.36,1) 0.08s both; }
        .cl-shimmer { background: linear-gradient(90deg, rgba(41,28,30,0.6) 25%, rgba(72,46,54,0.85) 50%, rgba(41,28,30,0.6) 75%); background-size:700px 100%; animation:cl-shimmer 1.4s ease-in-out infinite; }
        .club-card { transition: border-color 0.2s, box-shadow 0.22s, transform 0.22s !important; }
        .club-card:hover { border-color: rgba(138,21,56,0.5) !important; box-shadow: 0 10px 36px rgba(0,0,0,0.38) !important; transform: translateY(-4px) !important; }
      `}</style>

      {/* Header */}
      <div className="cl-0" style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 'clamp(24px, 5vw, 38px)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.5px', marginBottom: 8 }}>
          My Clubs
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          All the clubs you're part of, in one place.
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 24 }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, overflow: 'hidden', animationDelay: `${i * 0.06}s` }}>
              <div className="cl-shimmer" style={{ height: 130, borderRadius: 0 }} />
              <div style={{ padding: '0 20px' }}>
                <div className="cl-shimmer" style={{ width: 52, height: 52, borderRadius: 13, marginTop: -26, marginBottom: 12 }} />
                <div className="cl-shimmer" style={{ width: '70%', height: 17, borderRadius: 7, marginBottom: 8 }} />
                <div className="cl-shimmer" style={{ width: '90%', height: 13, borderRadius: 6, marginBottom: 5 }} />
                <div className="cl-shimmer" style={{ width: '75%', height: 13, borderRadius: 6, marginBottom: 16 }} />
                <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                  <div className="cl-shimmer" style={{ width: 72, height: 22, borderRadius: 6 }} />
                  <div className="cl-shimmer" style={{ width: 90, height: 22, borderRadius: 6 }} />
                </div>
              </div>
              <div style={{ padding: '0 20px 20px' }}>
                <div className="cl-shimmer" style={{ height: 36, borderRadius: 10 }} />
              </div>
            </div>
          ))}
        </div>
      ) : memberships.length === 0 ? (
        <div className="cl-1" style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏛️</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
            You haven't joined any clubs yet
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24 }}>
            Discover clubs and become part of your campus community.
          </div>
          <button
            onClick={() => navigate('/discovery')}
            style={{
              padding: '11px 28px',
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 9999,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Explore Clubs
          </button>
        </div>
      ) : (
        <>
          <p className="cl-1" style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24 }}>
            {memberships.length} club{memberships.length !== 1 ? 's' : ''}
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
            gap: 24,
          }}>
            {memberships.map((m, i) => (
              <ClubCard
                key={m.id}
                membership={m}
                index={i}
                onLeave={() => handleLeave(m)}
                leaving={leavingId === m.id}
                initials={initials}
                onClick={() => navigate(`/clubs/${m.club.id}`)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ClubCard({
  membership,
  onLeave,
  leaving,
  initials,
  onClick,
  index = 0,
}: {
  membership: MembershipRow
  onLeave: () => void
  leaving: boolean
  initials: (n: string) => string
  onClick: () => void
  index?: number
}) {
  const { club, role } = membership
  const catColor = CATEGORY_COLORS[club.category ?? ''] ?? 'var(--accent)'
  const roleStyle = ROLE_STYLES[role] ?? ROLE_STYLES.member
  const uniLabel = club.university
    ? (club.university.short_name ?? club.university.name)
    : null

  return (
    <div
      className="club-card"
      onClick={onClick}
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer',
        animation: `cl-up 0.48s cubic-bezier(0.22,1,0.36,1) ${index * 0.065}s both`,
      }}
    >
      {/* Banner */}
      <div style={{ height: 130, position: 'relative', background: 'var(--bg-dark)', overflow: 'hidden', flexShrink: 0 }}>
        {club.banner_url
          ? <img src={club.banner_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <div style={{
              position: 'absolute', inset: 0,
              backgroundColor: '#0b0210',
              backgroundImage: [
                'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.09) 1px, transparent 0)',
                `radial-gradient(ellipse 80% 140% at 18% 60%, ${catColor}cc 0%, transparent 55%)`,
                `radial-gradient(ellipse 65% 100% at 82% 20%, ${catColor}88 0%, transparent 52%)`,
                `radial-gradient(ellipse 55% 75% at 55% 110%, ${catColor}55 0%, transparent 50%)`,
              ].join(', '),
              backgroundSize: '20px 20px, 100% 100%, 100% 100%, 100% 100%',
            }} />
        }
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(18,8,10,0.82) 0%, rgba(18,8,10,0.1) 55%, transparent 100%)',
        }} />

        {/* Verified */}
        {club.is_verified && (
          <div style={{
            position: 'absolute', top: 10, right: 10,
            background: 'rgba(233,193,118,0.15)',
            border: '1px solid rgba(233,193,118,0.4)',
            backdropFilter: 'blur(6px)',
            borderRadius: 9999, padding: '3px 8px',
            fontSize: 10, fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.05em',
          }}>
            ✓ VERIFIED
          </div>
        )}

        {/* Role badge */}
        <div style={{
          position: 'absolute', top: 10, left: 10,
          background: roleStyle.bg,
          border: `1px solid ${roleStyle.color}40`,
          backdropFilter: 'blur(6px)',
          borderRadius: 9999, padding: '3px 10px',
          fontSize: 10, fontWeight: 700, color: roleStyle.color, letterSpacing: '0.06em',
        }}>
          {roleStyle.label.toUpperCase()}
        </div>

        {/* University */}
        {uniLabel && (
          <div style={{
            position: 'absolute', bottom: 10, right: 12,
            background: 'rgba(41,28,30,0.8)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 9999, padding: '4px 10px',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <div style={{
              width: 16, height: 16, borderRadius: '50%',
              background: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 7, fontWeight: 800, color: '#fff', flexShrink: 0,
            }}>
              {uniLabel.slice(0, 2).toUpperCase()}
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-primary)', fontWeight: 400 }}>
              {uniLabel}
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '0 20px 0', flex: 1 }}>
        {/* Logo */}
        <div style={{
          marginTop: -26, marginBottom: 10,
          width: 52, height: 52, borderRadius: 13,
          border: '2px solid rgba(255,255,255,0.12)',
          overflow: 'hidden',
          background: 'var(--bg-muted)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          position: 'relative', zIndex: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {club.logo_url ? (
            <img src={club.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{initials(club.name)}</span>
          )}
        </div>

        <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
          {club.name}
        </div>
        {club.description && (
          <div style={{
            fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55,
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
            marginBottom: 12, whiteSpace: 'pre-wrap', overflowWrap: 'break-word',
          }}>
            {club.description}
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {club.category && (
            <span style={{
              background: 'var(--bg-muted)', color: catColor,
              fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6,
            }}>
              {club.category}
            </span>
          )}
          <span style={{
            background: 'var(--bg-muted)', color: 'var(--text-secondary)',
            fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 6,
          }}>
            {club.member_count} Members
          </span>
        </div>
      </div>

      {/* Leave button — presidents can't leave */}
      <div style={{ padding: '0 20px 20px' }}>
        {role === 'president' ? (
          <div style={{
            width: '100%', padding: '10px',
            background: 'transparent',
            border: '1px solid rgba(87,65,68,0.2)',
            borderRadius: 10,
            color: 'var(--text-muted)',
            fontSize: 13, textAlign: 'center',
          }}>
            You lead this club
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onLeave() }}
            disabled={leaving}
            style={{
              width: '100%', padding: '10px',
              background: 'transparent',
              border: '1px solid rgba(87,65,68,0.3)',
              borderRadius: 10,
              color: leaving ? 'var(--text-muted)' : '#f87171',
              fontSize: 14, fontWeight: 500,
              cursor: leaving ? 'default' : 'pointer',
              opacity: leaving ? 0.6 : 1,
              transition: 'all 0.15s',
            }}
          >
            {leaving ? '…' : 'Leave Club'}
          </button>
        )}
      </div>
    </div>
  )
}
