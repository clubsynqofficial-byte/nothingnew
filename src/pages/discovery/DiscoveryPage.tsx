import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Club } from '../../types'
import ClubApplicationModal from '../../components/ClubApplicationModal'

const CATEGORIES = ['All', 'Technology', 'Arts & Culture', 'Sports', 'Entrepreneurship', 'Engineering', 'Business']

const CATEGORY_COLORS: Record<string, string> = {
  Technology: '#0ea5e9',
  'Arts & Culture': '#a855f7',
  Sports: '#e9c176',
  Entrepreneurship: '#f97316',
  Engineering: '#22c55e',
  Business: '#ec4899',
}

const CATEGORY_GRADIENTS: Record<string, string> = {
  Technology: 'linear-gradient(140deg, #0c1a2e 0%, #0e2a4a 100%)',
  'Arts & Culture': 'linear-gradient(140deg, #1a0d2e 0%, #2d1350 100%)',
  Sports: 'linear-gradient(140deg, #1e1400 0%, #3a2800 100%)',
  Entrepreneurship: 'linear-gradient(140deg, #200e00 0%, #3d1c00 100%)',
  Engineering: 'linear-gradient(140deg, #041a0c 0%, #063d1c 100%)',
  Business: 'linear-gradient(140deg, #220014 0%, #440028 100%)',
}

interface ClubWithMeta extends Club {
  is_member?: boolean
  has_form?: boolean
}

export default function DiscoveryPage() {
  const { user, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [clubs, setClubs] = useState<ClubWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [applyClub, setApplyClub] = useState<ClubWithMeta | null>(null)
  const [pendingClubIds, setPendingClubIds] = useState<Set<string>>(new Set())

  const fetchClubs = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('clubs')
      .select('*, university:universities(name, short_name)')
      .order('member_count', { ascending: false })

    if (search) query = query.ilike('name', `%${search}%`)
    if (activeCategory !== 'All') query = query.eq('category', activeCategory)

    const { data: clubsData } = await query
    if (!clubsData) { setLoading(false); return }

    // Always fetch which clubs have an active application form
    const { data: activeForms } = await supabase
      .from('club_forms')
      .select('club_id')
      .eq('is_active', true)
    const formClubIds = new Set((activeForms ?? []).map(f => f.club_id))

    if (user) {
      const [{ data: memberships }, { data: pending }] = await Promise.all([
        supabase.from('club_memberships').select('club_id').eq('user_id', user.id),
        supabase.from('club_form_responses').select('club_id').eq('user_id', user.id).eq('status', 'pending'),
      ])
      const joinedIds = new Set((memberships ?? []).map(m => m.club_id))
      const pendingIds = new Set((pending ?? []).map(r => r.club_id))
      setPendingClubIds(pendingIds)
      setClubs(clubsData.map(c => ({ ...c, is_member: joinedIds.has(c.id), has_form: formClubIds.has(c.id) })))
    } else {
      setClubs(clubsData.map(c => ({ ...c, has_form: formClubIds.has(c.id) })))
    }
    setLoading(false)
  }, [search, activeCategory, user])

  useEffect(() => { fetchClubs() }, [fetchClubs])

  async function handleJoin(club: ClubWithMeta) {
    if (!user || joiningId) return
    if (club.is_member) {
      setJoiningId(club.id)
      await supabase.from('club_memberships').delete().eq('club_id', club.id).eq('user_id', user.id)
      setJoiningId(null)
      fetchClubs()
      return
    }
    // Check if club has an active application form
    const { data: formData } = await supabase
      .from('club_forms')
      .select('id')
      .eq('club_id', club.id)
      .eq('is_active', true)
      .maybeSingle()

    if (formData) {
      setApplyClub(club)
      return
    }

    // No form — direct join
    setJoiningId(club.id)
    await supabase.from('club_memberships').insert({ club_id: club.id, user_id: user.id })
    await supabase.from('karak_transactions').insert({
      user_id: user.id, points: 5, reason: `Joined club: ${club.name}`,
    })
    await refreshProfile()
    setJoiningId(null)
    fetchClubs()
  }

  const initials = (name: string) =>
    name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <>
      <style>{`
        /* ── Card ── */
        .disc-card {
          transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.3s ease, border-color 0.3s ease;
          will-change: transform;
        }
        .disc-card:hover {
          transform: translateY(-10px) scale(1.015);
          box-shadow: 0 32px 72px rgba(0,0,0,0.55), 0 0 52px var(--cat-glow, rgba(138,21,56,0.15)) !important;
          border-color: rgba(138,21,56,0.35) !important;
        }

        /* ── Join button ── */
        .disc-join { transition: all 0.18s ease; }
        .disc-join:hover:not(:disabled) {
          filter: brightness(1.14);
          transform: translateY(-2px);
          box-shadow: 0 10px 32px rgba(138,21,56,0.5) !important;
        }
        .disc-join-shimmer {
          background: linear-gradient(135deg, #6e1030 0%, #8a1538 30%, #c0255a 55%, #8a1538 80%, #6e1030 100%) !important;
          background-size: 300% auto !important;
          animation: joinShimmer 4s linear infinite;
        }

        /* ── Search ── */
        .disc-search:focus {
          outline: none !important;
          border-color: rgba(138,21,56,0.65) !important;
          box-shadow: 0 0 0 3px rgba(138,21,56,0.14), 0 0 44px rgba(138,21,56,0.09) !important;
        }

        /* ── Category pills ── */
        .disc-cat { transition: all 0.2s ease; }
        .disc-cat:hover:not(.disc-cat-active) {
          border-color: rgba(87,65,68,0.5) !important;
          color: var(--text-secondary) !important;
          background: rgba(41,28,30,0.8) !important;
          transform: translateY(-1px);
        }
        .disc-cat-active {
          transform: scale(1.04);
        }

        /* ── Logo hover ── */
        .disc-logo {
          transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.3s ease;
        }
        .disc-card:hover .disc-logo {
          transform: translateY(-4px) scale(1.08);
          box-shadow: 0 8px 24px rgba(0,0,0,0.7) !important;
        }

        /* ── Banner zoom ── */
        .disc-banner-img {
          transition: transform 0.5s ease;
        }
        .disc-card:hover .disc-banner-img {
          transform: scale(1.06);
        }

        /* ── Keyframes ── */
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(22px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(32px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes orbFloat1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          38%      { transform: translate(22px, -18px) scale(1.07); }
          70%      { transform: translate(-12px, 12px) scale(0.96); }
        }
        @keyframes orbFloat2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          32%      { transform: translate(-16px, 14px) scale(1.05); }
          65%      { transform: translate(12px, -10px) scale(0.97); }
        }
        @keyframes orbFloat3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(10px, 20px) scale(1.04); }
        }
        @keyframes joinShimmer {
          0%   { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        @keyframes discSkeletonShimmer {
          0%   { background-position: -300% 0; }
          100% { background-position: 300% 0; }
        }
        @keyframes discSkeletonPulse {
          0%, 100% { opacity: 0.28; }
          50%      { opacity: 0.55; }
        }
        @keyframes resultsIn {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      <div className="page-content" style={{ maxWidth: 1320 }}>

        {/* ── Hero ── */}
        <div style={{ marginBottom: 44, position: 'relative', overflow: 'hidden' }}>
          {/* Ambient orb 1 */}
          <div style={{
            position: 'absolute',
            top: '50%', left: -20,
            transform: 'translateY(-60%)',
            width: 500, height: 180,
            background: 'radial-gradient(ellipse, rgba(138,21,56,0.24) 0%, transparent 68%)',
            animation: 'orbFloat1 14s ease-in-out infinite',
            pointerEvents: 'none',
          }} />
          {/* Ambient orb 2 */}
          <div style={{
            position: 'absolute',
            top: '-20px', right: -60,
            width: 380, height: 200,
            background: 'radial-gradient(ellipse, rgba(90,10,35,0.15) 0%, transparent 65%)',
            animation: 'orbFloat2 18s ease-in-out 2s infinite',
            pointerEvents: 'none',
          }} />
          {/* Ambient orb 3 */}
          <div style={{
            position: 'absolute',
            bottom: -30, left: '40%',
            width: 320, height: 140,
            background: 'radial-gradient(ellipse, rgba(138,21,56,0.1) 0%, transparent 68%)',
            animation: 'orbFloat3 22s ease-in-out 5s infinite',
            pointerEvents: 'none',
          }} />

          <div style={{ position: 'relative' }}>
            {/* Label badge */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
              animation: 'fadeUp 0.5s ease both',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 9,
                background: 'linear-gradient(135deg, var(--accent) 0%, #c0255a 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(138,21,56,0.45)',
                flexShrink: 0,
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', color: 'var(--accent)', textTransform: 'uppercase' }}>
                Discovery
              </span>
            </div>

            <h1 style={{
              fontSize: 46, fontWeight: 800,
              color: 'var(--text-primary)',
              letterSpacing: '-1.5px', lineHeight: 1.08,
              marginBottom: 14,
              animation: 'fadeUp 0.55s 0.08s ease both',
            }}>
              Find Your Community
            </h1>
            <p style={{
              fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.65, maxWidth: 460,
              animation: 'fadeUp 0.55s 0.18s ease both',
            }}>
              Explore student clubs and organizations across Qatar's universities. Join, connect, and make an impact.
            </p>
          </div>
        </div>

        {/* ── Search ── */}
        <div style={{
          position: 'relative', maxWidth: 580, marginBottom: 20,
          animation: 'fadeUp 0.5s 0.28s ease both',
        }}>
          <svg
            style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', opacity: 0.38, pointerEvents: 'none' }}
            width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="disc-search"
            type="text"
            placeholder="Search clubs, interests, universities…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(41,28,30,0.7)',
              border: '1px solid rgba(87,65,68,0.3)',
              borderRadius: 14,
              padding: '15px 24px 15px 52px',
              color: 'var(--text-primary)',
              fontSize: 15,
              backdropFilter: 'blur(16px)',
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
          />
        </div>

        {/* ── Category filters ── */}
        <div style={{ display: 'flex', gap: 7, marginBottom: 36, flexWrap: 'wrap' }}>
          {CATEGORIES.map((cat, i) => {
            const active = cat === activeCategory
            const catColor = CATEGORY_COLORS[cat]
            return (
              <button
                key={cat}
                className={`disc-cat${active ? ' disc-cat-active' : ''}`}
                onClick={() => setActiveCategory(cat)}
                style={{
                  padding: '8px 18px',
                  borderRadius: 10,
                  border: active
                    ? `1px solid ${catColor ? catColor + '55' : 'rgba(138,21,56,0.45)'}`
                    : '1px solid rgba(87,65,68,0.22)',
                  background: active
                    ? catColor ? `${catColor}14` : 'rgba(138,21,56,0.14)'
                    : 'rgba(41,28,30,0.45)',
                  color: active
                    ? catColor ?? 'var(--text-primary)'
                    : 'var(--text-muted)',
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.07em',
                  cursor: 'pointer',
                  boxShadow: active && catColor ? `0 0 24px ${catColor}20` : 'none',
                  animation: `fadeUp 0.45s ${0.34 + i * 0.045}s ease both`,
                }}
              >
                {cat.toUpperCase()}
              </button>
            )
          })}
        </div>

        {/* ── Results label ── */}
        {!loading && clubs.length > 0 && (
          <div style={{
            fontSize: 12, color: 'var(--text-muted)', marginBottom: 22, letterSpacing: '0.03em',
            animation: 'resultsIn 0.35s ease both',
          }}>
            {clubs.length} club{clubs.length !== 1 ? 's' : ''}
            {activeCategory !== 'All' ? ` · ${activeCategory}` : ''}
            {search ? ` · "${search}"` : ''}
          </div>
        )}

        {/* ── Grid ── */}
        {loading ? (
          <SkeletonGrid />
        ) : clubs.length === 0 ? (
          <EmptyState search={search} category={activeCategory} />
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
            gap: 22,
          }}>
            {clubs.map((club, i) => (
              <ClubCard
                key={club.id}
                club={club}
                index={i}
                onJoin={() => handleJoin(club)}
                onOpen={() => navigate(`/clubs/${club.id}`)}
                joining={joiningId === club.id}
                isPending={pendingClubIds.has(club.id)}
                hasForm={club.has_form ?? false}
                initials={initials}
              />
            ))}
          </div>
        )}
      </div>

      {applyClub && (
        <ClubApplicationModal
          clubId={applyClub.id}
          clubName={applyClub.name}
          onClose={() => setApplyClub(null)}
          onSubmitted={() => {
            setApplyClub(null)
            setPendingClubIds(prev => new Set([...prev, applyClub.id]))
          }}
        />
      )}
    </>
  )
}

function ClubCard({ club, index, onJoin, onOpen, joining, isPending, hasForm, initials }: {
  club: ClubWithMeta
  index: number
  onJoin: () => void
  onOpen: () => void
  joining: boolean
  isPending: boolean
  hasForm: boolean
  initials: (n: string) => string
}) {
  const catColor = CATEGORY_COLORS[club.category ?? ''] ?? 'var(--accent)'
  const catGradient = CATEGORY_GRADIENTS[club.category ?? '']
    ?? 'linear-gradient(140deg, var(--bg-card) 0%, var(--bg-muted) 100%)'
  const uniLabel = club.university
    ? (club.university.short_name ?? club.university.name)
    : null

  const animDelay = `${Math.min(index * 0.06, 0.38)}s`

  return (
    <div
      className="disc-card"
      onClick={onOpen}
      style={{
        background: 'rgba(41,28,30,0.55)',
        border: '1px solid rgba(87,65,68,0.18)',
        borderRadius: 20,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.28)',
        animation: `cardIn 0.5s ${animDelay} ease both`,
        cursor: 'pointer',
        ['--cat-glow' as string]: `${catColor}26`,
      } as React.CSSProperties}
    >
      {/* ── Banner ── */}
      <div style={{
        height: 150,
        position: 'relative',
        background: club.banner_url ? 'var(--bg-dark)' : catGradient,
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        {club.banner_url && (
          <img
            src={club.banner_url}
            alt=""
            className="disc-banner-img"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        )}

        {!club.banner_url && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 3,
            background: `linear-gradient(90deg, ${catColor}bb 0%, ${catColor}22 100%)`,
          }} />
        )}

        {/* Bottom fade */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(18,8,10,0.88) 0%, rgba(18,8,10,0.06) 50%, transparent 100%)',
        }} />

        {/* Top badges row */}
        <div style={{
          position: 'absolute', top: 12, left: 12, right: 12,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          {club.is_member ? (
            <div style={{
              background: 'rgba(34,197,94,0.14)',
              border: '1px solid rgba(34,197,94,0.32)',
              backdropFilter: 'blur(8px)',
              borderRadius: 9999, padding: '3px 10px',
              fontSize: 10, fontWeight: 800, color: '#22c55e', letterSpacing: '0.07em',
            }}>
              ✓ JOINED
            </div>
          ) : <div />}

          {club.is_verified && (
            <div style={{
              background: 'rgba(233,193,118,0.12)',
              border: '1px solid rgba(233,193,118,0.32)',
              backdropFilter: 'blur(8px)',
              borderRadius: 9999, padding: '3px 10px',
              fontSize: 10, fontWeight: 800, color: 'var(--gold)', letterSpacing: '0.07em',
            }}>
              ✓ VERIFIED
            </div>
          )}
        </div>

        {/* University badge */}
        {uniLabel && (
          <div style={{
            position: 'absolute', bottom: 12, right: 12,
            background: 'rgba(18,8,10,0.72)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 9999, padding: '4px 10px 4px 7px',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              background: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 6, fontWeight: 900, color: '#fff', flexShrink: 0, letterSpacing: '-0.5px',
            }}>
              {uniLabel.slice(0, 2).toUpperCase()}
            </div>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
              {uniLabel}
            </span>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ padding: '0 20px', flex: 1 }}>
        {/* Logo overlapping banner */}
        <div
          className="disc-logo"
          style={{
            marginTop: -28, marginBottom: 12,
            width: 54, height: 54, borderRadius: 14,
            border: '3px solid rgba(27,16,18,1)',
            outline: '1px solid rgba(255,255,255,0.08)',
            overflow: 'hidden',
            background: 'var(--bg-muted)',
            boxShadow: '0 4px 18px rgba(0,0,0,0.6)',
            position: 'relative', zIndex: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {club.logo_url ? (
            <img src={club.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-1px' }}>
              {initials(club.name)}
            </span>
          )}
        </div>

        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 5, lineHeight: 1.3, letterSpacing: '-0.2px' }}>
          {club.name}
        </div>

        {club.description && (
          <div style={{
            fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            marginBottom: 14,
          }}>
            {club.description}
          </div>
        )}

        {/* Category + members tags */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
          {club.category && (
            <span style={{
              background: `${catColor}14`,
              color: catColor,
              border: `1px solid ${catColor}2e`,
              fontSize: 11, fontWeight: 700,
              padding: '3px 10px', borderRadius: 7,
              letterSpacing: '0.04em',
            }}>
              {club.category}
            </span>
          )}
          <span style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'rgba(255,255,255,0.045)',
            color: 'var(--text-muted)',
            fontSize: 11, fontWeight: 500,
            padding: '3px 10px', borderRadius: 7,
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            {club.member_count.toLocaleString()}
          </span>
          {/* Application form indicator */}
          {hasForm ? (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'rgba(251,191,36,0.1)',
              color: '#fbbf24',
              border: '1px solid rgba(251,191,36,0.25)',
              fontSize: 11, fontWeight: 700,
              padding: '3px 10px', borderRadius: 7,
              letterSpacing: '0.03em',
            }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              Apply to Join
            </span>
          ) : (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'rgba(34,197,94,0.08)',
              color: '#4ade80',
              border: '1px solid rgba(34,197,94,0.2)',
              fontSize: 11, fontWeight: 700,
              padding: '3px 10px', borderRadius: 7,
              letterSpacing: '0.03em',
            }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Open Join
            </span>
          )}
        </div>
      </div>

      {/* ── Join button ── */}
      <div style={{ padding: '4px 20px 20px' }}>
        <button
          className={`disc-join${!club.is_member && !isPending ? ' disc-join-shimmer' : ''}`}
          onClick={e => { e.stopPropagation(); onJoin() }}
          disabled={joining || isPending}
          style={{
            width: '100%',
            padding: '11px',
            background: club.is_member
              ? 'transparent'
              : isPending
              ? 'rgba(233,193,118,0.08)'
              : 'linear-gradient(135deg, #8a1538 0%, #c0255a 100%)',
            border: club.is_member
              ? '1px solid rgba(34,197,94,0.28)'
              : isPending
              ? '1px solid rgba(233,193,118,0.3)'
              : '1px solid transparent',
            borderRadius: 12,
            color: club.is_member ? '#22c55e' : isPending ? 'rgba(233,193,118,0.8)' : '#fff',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.05em',
            cursor: joining || isPending ? 'default' : 'pointer',
            opacity: joining ? 0.6 : 1,
            boxShadow: club.is_member || isPending ? 'none' : '0 4px 18px rgba(138,21,56,0.32)',
          }}
        >
          {joining ? '···' : club.is_member ? '✓  Joined' : isPending ? '⏳  Applied' : hasForm ? '📋  Apply Now' : 'Join Club'}
        </button>
      </div>
    </div>
  )
}

function SkeletonGrid() {
  const shimmerBg = 'linear-gradient(90deg, rgba(52,39,40,0.3) 0%, rgba(72,54,57,0.55) 45%, rgba(52,39,40,0.3) 100%)'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 22 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{
          background: 'rgba(41,28,30,0.35)',
          border: '1px solid rgba(87,65,68,0.12)',
          borderRadius: 20, overflow: 'hidden',
          animation: `discSkeletonPulse 1.9s ease-in-out ${i * 0.13}s infinite`,
        }}>
          <div style={{
            height: 150,
            backgroundImage: shimmerBg,
            backgroundSize: '300% 100%',
            animation: `discSkeletonShimmer 2.2s linear ${i * 0.15}s infinite`,
          }} />
          <div style={{ padding: '0 20px 20px' }}>
            <div style={{ width: 54, height: 54, borderRadius: 14, background: 'rgba(52,39,40,0.75)', marginTop: -28, marginBottom: 12 }} />
            <div style={{ height: 17, background: 'rgba(52,39,40,0.65)', borderRadius: 6, marginBottom: 9, width: '58%' }} />
            <div style={{ height: 12, background: 'rgba(52,39,40,0.45)', borderRadius: 6, marginBottom: 6, width: '88%' }} />
            <div style={{ height: 12, background: 'rgba(52,39,40,0.45)', borderRadius: 6, marginBottom: 18, width: '68%' }} />
            <div style={{ height: 42, background: 'rgba(52,39,40,0.6)', borderRadius: 12 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ search, category }: { search: string; category: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '80px 0', animation: 'fadeUp 0.4s ease both' }}>
      <div style={{
        width: 60, height: 60, borderRadius: 17,
        background: 'rgba(138,21,56,0.09)',
        border: '1px solid rgba(138,21,56,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 20px',
      }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
          <line x1="8" y1="11" x2="14" y2="11"/>
        </svg>
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, letterSpacing: '-0.3px' }}>
        No clubs found
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: 340, margin: '0 auto' }}>
        {search
          ? `No clubs match "${search}"${category !== 'All' ? ` in ${category}` : ''}.`
          : 'No clubs have been created yet in this category.'}
      </div>
    </div>
  )
}
