import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Club } from '../../types'
import ClubApplicationModal from '../../components/ClubApplicationModal'
import TalentPage from '../talent/TalentPage'
import CollaborationPage from '../collaboration/CollaborationPage'

const CATEGORIES = ['All', 'Technology', 'Arts & Culture', 'Sports', 'Entrepreneurship', 'Engineering', 'Business', 'Law']

const CATEGORY_COLORS: Record<string, string> = {
  Technology: '#0ea5e9',
  'Arts & Culture': '#a855f7',
  Sports: '#e9c176',
  Entrepreneurship: '#f97316',
  Engineering: '#22c55e',
  Business: '#ec4899',
  Law: '#94a3b8',
  Fashion: '#f43f8a',
}

const CATEGORY_GRADIENTS: Record<string, string> = {
  Technology:       'linear-gradient(140deg,#061528 0%,#0a2244 45%,#0e1a36 100%)',
  'Arts & Culture': 'linear-gradient(140deg,#12082a 0%,#230f48 45%,#1a0936 100%)',
  Sports:           'linear-gradient(140deg,#1a1000 0%,#2e1e00 45%,#1e1500 100%)',
  Entrepreneurship: 'linear-gradient(140deg,#1c0900 0%,#351500 45%,#220c00 100%)',
  Engineering:      'linear-gradient(140deg,#031408 0%,#063220 45%,#041a0e 100%)',
  Business:         'linear-gradient(140deg,#1e0018 0%,#3c0030 45%,#280020 100%)',
  Law:              'linear-gradient(140deg,#0c1220 0%,#18243c 45%,#10192e 100%)',
  Fashion:          'linear-gradient(140deg,#200010 0%,#3d0028 45%,#280018 100%)',
}

function CategorySVGIcon({ category, color }: { category: string; color: string }) {
  const s = { fill:'none', stroke:color, strokeWidth:2, strokeLinecap:'round' as const, strokeLinejoin:'round' as const }
  const size = 58
  switch (category) {
    case 'Fashion': return (
      <svg width={size} height={size} viewBox="0 0 64 64" {...s}>
        {/* Hanger hook */}
        <path d="M32 10 C32 10 42 10 42 18 C42 24 37 26 32 26"/>
        {/* Arms */}
        <path d="M32 26 L9 50"/>
        <path d="M32 26 L55 50"/>
        {/* Base bar */}
        <path d="M9 50 Q32 56 55 50"/>
        {/* Sparkles */}
        <path d="M52 14 L53.5 11 L55 14 L58 15.5 L55 17 L53.5 20 L52 17 L49 15.5 Z" strokeWidth={1.2}/>
        <path d="M12 20 L13 18 L14 20 L16 21 L14 22 L13 24 L12 22 L10 21 Z" strokeWidth={1}/>
      </svg>
    )
    case 'Technology': return (
      <svg width={size} height={size} viewBox="0 0 64 64" {...s}>
        {/* Circuit nodes */}
        <circle cx="32" cy="32" r="6"/>
        <line x1="32" y1="8" x2="32" y2="26"/>
        <line x1="32" y1="38" x2="32" y2="56"/>
        <line x1="8" y1="32" x2="26" y2="32"/>
        <line x1="38" y1="32" x2="56" y2="32"/>
        <circle cx="32" cy="8" r="3"/>
        <circle cx="32" cy="56" r="3"/>
        <circle cx="8" cy="32" r="3"/>
        <circle cx="56" cy="32" r="3"/>
        {/* Diagonals */}
        <line x1="15" y1="15" x2="24" y2="24"/>
        <line x1="40" y1="40" x2="49" y2="49"/>
        <circle cx="13" cy="13" r="2.5"/>
        <circle cx="51" cy="51" r="2.5"/>
      </svg>
    )
    case 'Arts & Culture': return (
      <svg width={size} height={size} viewBox="0 0 64 64" {...s}>
        {/* Abstract brush strokes */}
        <path d="M12 48 C16 32 28 14 44 12" strokeWidth={2.5}/>
        <path d="M44 12 C50 11 54 16 52 22 C50 28 42 30 38 34 C34 38 34 46 40 50" strokeWidth={2}/>
        <path d="M40 50 C44 53 48 52 50 48" strokeWidth={2}/>
        {/* Paint dots */}
        <circle cx="18" cy="20" r="3" fill={color} stroke="none"/>
        <circle cx="46" cy="42" r="2.5" fill={color} stroke="none"/>
        <circle cx="28" cy="50" r="2" fill={color} stroke="none"/>
      </svg>
    )
    case 'Sports': return (
      <svg width={size} height={size} viewBox="0 0 64 64" {...s}>
        {/* Trophy cup */}
        <path d="M20 10 L44 10 L44 36 C44 44 38 50 32 50 C26 50 20 44 20 36 Z"/>
        <path d="M44 16 C52 16 54 24 50 28 C47 31 44 30 44 30"/>
        <path d="M20 16 C12 16 10 24 14 28 C17 31 20 30 20 30"/>
        <line x1="32" y1="50" x2="32" y2="58"/>
        <line x1="22" y1="58" x2="42" y2="58"/>
        {/* Star on cup */}
        <path d="M32 20 L33.8 25.5 L39.5 25.5 L35 29 L36.8 34.5 L32 31 L27.2 34.5 L29 29 L24.5 25.5 L30.2 25.5 Z" strokeWidth={1.2}/>
      </svg>
    )
    case 'Entrepreneurship': return (
      <svg width={size} height={size} viewBox="0 0 64 64" {...s}>
        {/* Rocket */}
        <path d="M32 8 C32 8 44 14 44 30 L44 40 L32 48 L20 40 L20 30 C20 14 32 8 32 8 Z"/>
        <path d="M20 36 C14 38 12 44 14 50 L20 44"/>
        <path d="M44 36 C50 38 52 44 50 50 L44 44"/>
        <circle cx="32" cy="26" r="5"/>
        {/* Exhaust */}
        <path d="M26 48 C26 54 30 56 32 58 C34 56 38 54 38 48"/>
      </svg>
    )
    case 'Engineering': return (
      <svg width={size} height={size} viewBox="0 0 64 64" {...s}>
        {/* Hexagon gear */}
        <polygon points="32,10 46,18 46,34 32,42 18,34 18,18"/>
        <circle cx="32" cy="26" r="7"/>
        {/* Gear teeth */}
        <line x1="32" y1="5" x2="32" y2="10"/>
        <line x1="32" y1="42" x2="32" y2="47"/>
        <line x1="13" y1="13.5" x2="18" y2="18"/>
        <line x1="46" y1="34" x2="51" y2="38.5"/>
        <line x1="13" y1="38.5" x2="18" y2="34"/>
        <line x1="46" y1="18" x2="51" y2="13.5"/>
      </svg>
    )
    case 'Business': return (
      <svg width={size} height={size} viewBox="0 0 64 64" {...s}>
        {/* Rising bar chart */}
        <rect x="10" y="38" width="10" height="16" rx="2"/>
        <rect x="27" y="26" width="10" height="28" rx="2"/>
        <rect x="44" y="14" width="10" height="40" rx="2"/>
        {/* Trend line */}
        <path d="M15 36 L32 24 L49 12" strokeWidth={1.8} strokeDasharray="3 2"/>
        <circle cx="49" cy="12" r="3" fill={color} stroke="none"/>
      </svg>
    )
    case 'Law': return (
      <svg width={size} height={size} viewBox="0 0 64 64" {...s}>
        {/* Scales of justice */}
        <line x1="32" y1="8" x2="32" y2="54"/>
        <line x1="16" y1="58" x2="48" y2="58"/>
        <line x1="16" y1="20" x2="48" y2="20"/>
        <circle cx="32" cy="14" r="4"/>
        {/* Left pan */}
        <path d="M10 28 L22 28"/>
        <path d="M10 28 C10 36 22 36 22 28"/>
        <line x1="16" y1="20" x2="10" y2="28"/>
        <line x1="16" y1="20" x2="22" y2="28"/>
        {/* Right pan */}
        <path d="M42 28 L54 28"/>
        <path d="M42 32 C42 40 54 40 54 32"/>
        <line x1="48" y1="20" x2="42" y2="28"/>
        <line x1="48" y1="20" x2="54" y2="28"/>
      </svg>
    )
    default: return (
      <svg width={size} height={size} viewBox="0 0 64 64" {...s}>
        {/* Abstract star cluster */}
        <path d="M32 8 L35 22 L49 18 L40 29 L54 32 L40 35 L49 46 L35 42 L32 56 L29 42 L15 46 L24 35 L10 32 L24 29 L15 18 L29 22 Z"/>
        <circle cx="32" cy="32" r="6"/>
      </svg>
    )
  }
}

interface ClubWithMeta extends Club {
  is_member?: boolean
  has_form?: boolean
}

export default function DiscoveryPage() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [clubs, setClubs] = useState<ClubWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [applyClub, setApplyClub] = useState<ClubWithMeta | null>(null)
  const [pendingClubIds, setPendingClubIds] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<'clubs' | 'skill-souq' | 'cofounder'>('clubs')

  const fetchClubs = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('clubs')
      .select('*, university:universities(name, short_name)')
      .order('member_count', { ascending: false })

    if (profile?.country) query = query.eq('country', profile.country)
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
  }, [search, activeCategory, user, profile?.country])

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
        /* ── Card (handled in new block below) ── */

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

        /* ── Banner zoom ── */
        .disc-banner-img { transition: transform 0.55s cubic-bezier(.22,1,.36,1); }
        .disc-card:hover .disc-banner-img { transform: scale(1.07); }

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
        .disc-tab-bar::-webkit-scrollbar { display: none; }

        /* ── Hero gradient title ── */
        @keyframes heroGradient {
          0%   { background-position: 0%   50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0%   50%; }
        }
        @keyframes heroIn {
          0%   { opacity:0; transform: translateY(32px) scale(.94); }
          62%  { transform: translateY(-5px) scale(1.01); }
          100% { opacity:1; transform: none; }
        }

        /* ── Card entrance ── */
        @keyframes cardEntrance {
          0%   { opacity:0; transform: translateY(48px) scale(.88); }
          65%  { transform: translateY(-6px) scale(1.015); }
          100% { opacity:1; transform: none; }
        }

        /* ── Banner shimmer wipe ── */
        @keyframes bannerShine {
          from { left: -100%; }
          to   { left:  220%; }
        }
        .disc-card:hover .disc-banner-shine {
          animation: bannerShine 0.75s cubic-bezier(.4,0,.2,1) forwards !important;
        }

        /* ── Logo hover ── */
        .disc-logo-go {
          transition: transform 0.38s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.3s ease;
        }
        .disc-card:hover .disc-logo-go {
          transform: translateY(-7px) scale(1.14) rotate(4deg) !important;
          box-shadow: 0 12px 32px rgba(0,0,0,0.75) !important;
        }

        /* ── Card border glow on hover ── */
        .disc-card { transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.3s ease, border-color 0.3s ease; will-change: transform; }
        .disc-card:hover {
          transform: translateY(-10px) scale(1.016);
          box-shadow: 0 32px 72px rgba(0,0,0,.55), 0 0 52px var(--cat-glow, rgba(138,21,56,0.15)) !important;
          border-color: var(--cat-border, rgba(138,21,56,0.35)) !important;
        }

        /* ── Join ripple ── */
        @keyframes discRipple { from{transform:scale(0);opacity:.5} to{transform:scale(5);opacity:0} }

        /* ── Join success ── */
        @keyframes joinSuccess { 0%{transform:scale(1)} 35%{transform:scale(1.06)} 65%{transform:scale(.97)} 100%{transform:scale(1)} }

        /* ── Category pill pulse ring ── */
        @keyframes catRingPulse {
          0%   { transform: scale(1);   opacity: .5; }
          100% { transform: scale(1.9); opacity: 0;  }
        }

        /* ── Tab active glow ── */
        @keyframes tabGlow {
          0%,100% { text-shadow: none; }
          50%     { text-shadow: 0 0 14px rgba(192,37,90,.7); }
        }

        /* ── Member count pop ── */
        @keyframes memberPop {
          0%   { opacity:0; transform: scale(.6) translateY(4px); }
          70%  { transform: scale(1.12) translateY(-1px); }
          100% { opacity:1; transform: none; }
        }

        /* ── Banner orb drift ── */
        @keyframes bannerDrift {
          0%,100% { transform: translate(0,0) scale(1); opacity:.35; }
          50%      { transform: translate(18px,-12px) scale(1.1); opacity:.55; }
        }

        /* ── Default banner ── */
        @keyframes aurora1 { 0%,100%{transform:translate(0,0) scale(1)} 30%{transform:translate(22px,-14px) scale(1.18)} 65%{transform:translate(-12px,10px) scale(.92)} }
        @keyframes aurora2 { 0%,100%{transform:translate(0,0) scale(1)} 35%{transform:translate(-18px,16px) scale(1.12)} 70%{transform:translate(16px,-10px) scale(.95)} }
        @keyframes aurora3 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(12px,18px) scale(1.1)} }
        @keyframes iconFloat { 0%,100%{transform:translate(-50%,-50%) scale(1) rotate(-2deg)} 40%{transform:translate(-50%,-56%) scale(1.07) rotate(3deg)} 75%{transform:translate(-50%,-46%) scale(.96) rotate(-1deg)} }
        @keyframes iconGlow  { 0%,100%{opacity:.12} 50%{opacity:.22} }
        @keyframes particleUp { 0%{transform:translate(0,0) scale(1);opacity:.9} 100%{transform:translate(var(--px),calc(var(--py) - 55px)) scale(0);opacity:0} }
        @keyframes beamPulse { 0%,100%{opacity:.055} 50%{opacity:.13} }
        @keyframes hexPulse  { 0%,100%{opacity:.1} 50%{opacity:.18} }
        @keyframes scanMove  { from{background-position:0 0} to{background-position:0 8px} }
        @keyframes cornerBlink { 0%,100%{opacity:.35} 50%{opacity:.7} }
      `}</style>

      {/* ── Tab bar ── */}
      <div style={{ padding: '24px 0 0', maxWidth: 1320, margin: '0 auto', boxSizing: 'border-box' }}>
        <div className="disc-tab-bar" style={{
          display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)',
          overflowX: 'auto', overflowY: 'hidden',
          scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' as any,
          paddingLeft: 28,
        }}>
          {([
            { id: 'clubs'      as const, label: 'Discover Clubs'   },
            { id: 'skill-souq' as const, label: 'Skill Souq'       },
            { id: 'cofounder'  as const, label: 'Co-Founder Match'  },
          ]).map(t => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '10px 22px', background: 'transparent', border: 'none',
                  borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                  color: active ? '#fff' : 'var(--text-muted)',
                  fontSize: 14, fontWeight: active ? 700 : 400,
                  cursor: 'pointer', fontFamily: 'inherit',
                  marginBottom: -1, whiteSpace: 'nowrap', flexShrink: 0,
                  transition: 'color .2s, border-color .2s',
                  animation: active ? 'tabGlow 2.4s ease-in-out infinite' : 'none',
                  position: 'relative',
                }}
              >
                {t.label}
                {active && (
                  <span style={{
                    position: 'absolute', bottom: -2, left: '50%', transform: 'translateX(-50%)',
                    width: '60%', height: 2,
                    background: 'linear-gradient(90deg,transparent,var(--accent),rgba(192,37,90,.8),var(--accent),transparent)',
                    borderRadius: 99,
                    boxShadow: '0 0 10px rgba(192,37,90,.8)',
                    animation: 'tabGlow 2.4s ease-in-out infinite',
                  }}/>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {tab === 'skill-souq' && <TalentPage />}
      {tab === 'cofounder'  && <CollaborationPage />}
      {tab === 'clubs' && <div className="page-content" style={{ maxWidth: 1320 }}>

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
              fontSize: 'clamp(26px, 5vw, 46px)', fontWeight: 800,
              background: 'linear-gradient(90deg, #fff 0%, #e57c9a 30%, #fff 55%, #c0255a 80%, #fff 100%)',
              backgroundSize: '250% auto',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-1.5px', lineHeight: 1.08,
              marginBottom: 14,
              animation: 'heroIn 0.6s 0.08s cubic-bezier(.22,1,.36,1) both, heroGradient 5s ease-in-out 0.7s infinite',
            }}>
              Find Your Community
            </h1>
            <p style={{
              fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.65, maxWidth: 460,
              animation: 'fadeUp 0.55s 0.18s ease both',
            }}>
              Explore student clubs and organizations{profile?.country ? ` across ${profile.country}` : ''}. Join, connect, and make an impact.
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
        <div className="pill-scroll" style={{ gap: 7, marginBottom: 36 }}>
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
                    ? `1px solid ${catColor ? catColor + '66' : 'rgba(138,21,56,0.55)'}`
                    : '1px solid rgba(87,65,68,0.22)',
                  background: active
                    ? catColor ? `${catColor}1a` : 'rgba(138,21,56,0.18)'
                    : 'rgba(41,28,30,0.45)',
                  color: active
                    ? catColor ?? 'var(--text-primary)'
                    : 'var(--text-muted)',
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.07em',
                  cursor: 'pointer',
                  boxShadow: active ? `0 0 28px ${catColor ? catColor + '30' : 'rgba(138,21,56,.2)'}, inset 0 0 12px ${catColor ? catColor + '10' : 'rgba(138,21,56,.06)'}` : 'none',
                  animation: `fadeUp 0.45s ${0.34 + i * 0.045}s ease both`,
                  position: 'relative', overflow: 'visible',
                  transition: 'all .2s cubic-bezier(.22,1,.36,1)',
                }}
              >
                {active && (
                  <span style={{
                    position: 'absolute', inset: -1, borderRadius: 10,
                    border: `1px solid ${catColor ?? 'rgba(138,21,56,.5)'}`,
                    animation: 'catRingPulse 1.5s ease-out infinite',
                    pointerEvents: 'none',
                  }}/>
                )}
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
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 310px), 1fr))',
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
      </div>}

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

  const animDelay = `${Math.min(index * 0.055, 0.36)}s`

  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null)
  const [justJoined, setJustJoined] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  function handleJoin(e: React.MouseEvent) {
    e.stopPropagation()
    if (joining || isPending) return
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) {
      setRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top, key: Date.now() })
      setTimeout(() => setRipple(null), 650)
    }
    if (!club.is_member) { setJustJoined(true); setTimeout(() => setJustJoined(false), 600) }
    onJoin()
  }

  return (
    <div
      className="disc-card"
      onClick={onOpen}
      style={{
        background: 'rgba(41,28,30,0.55)',
        border: `1px solid rgba(87,65,68,0.18)`,
        borderRadius: 20,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.28)',
        animation: `cardEntrance 0.55s ${animDelay} cubic-bezier(.22,1,.36,1) both`,
        cursor: 'pointer',
        ['--cat-glow' as string]: `${catColor}2a`,
        ['--cat-border' as string]: `${catColor}44`,
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

        {/* Shimmer wipe on hover */}
        <div className="disc-banner-shine" style={{
          position: 'absolute', top: 0, left: '-100%', width: '60%', height: '100%',
          background: 'linear-gradient(105deg, transparent 20%, rgba(255,255,255,0.13) 50%, transparent 80%)',
          pointerEvents: 'none', zIndex: 2,
        }}/>

        {/* Ambient orb — top-right */}
        <div style={{
          position: 'absolute', top: '-35%', right: '-8%', width: 160, height: 160,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${catColor}${club.banner_url ? '28' : '45'} 0%, transparent 70%)`,
          animation: 'bannerDrift 7s ease-in-out infinite',
          pointerEvents: 'none',
        }}/>

        {!club.banner_url && (<>
          {/* ── Aurora layer ── */}
          <div style={{ position:'absolute', top:'-35%', left:'-5%',  width:220, height:220, borderRadius:'50%', background:`radial-gradient(circle,${catColor}60 0%,transparent 65%)`, filter:'blur(3px)', animation:'aurora1 9s ease-in-out infinite', pointerEvents:'none' }}/>
          <div style={{ position:'absolute', top:'10%',  right:'-12%', width:170, height:170, borderRadius:'50%', background:`radial-gradient(circle,${catColor}42 0%,transparent 65%)`, filter:'blur(2px)', animation:'aurora2 12s ease-in-out 1.2s infinite', pointerEvents:'none' }}/>
          <div style={{ position:'absolute', bottom:'-25%',left:'35%', width:130, height:130, borderRadius:'50%', background:`radial-gradient(circle,${catColor}30 0%,transparent 70%)`, filter:'blur(1px)', animation:'aurora3 15s ease-in-out 2.5s infinite', pointerEvents:'none' }}/>

          {/* ── Hexagon SVG grid ── */}
          <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', animation:'hexPulse 4s ease-in-out infinite' }} xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id={`hex-${club.id}`} x="0" y="0" width="36" height="42" patternUnits="userSpaceOnUse">
                <polygon points="18,2 34,11 34,29 18,38 2,29 2,11" fill="none" stroke={catColor} strokeWidth="0.6" opacity="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#hex-${club.id})`} opacity="0.13"/>
          </svg>

          {/* ── Scanline texture ── */}
          <div style={{ position:'absolute', inset:0, backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.06) 3px,rgba(0,0,0,.06) 4px)', pointerEvents:'none' }}/>

          {/* ── Diagonal light beams ── */}
          <div style={{ position:'absolute', top:'-40%', left:'5%',  width:'28%', height:'250%', background:`linear-gradient(108deg,transparent 35%,${catColor}18 50%,transparent 65%)`, transform:'skewX(-18deg)', animation:'beamPulse 5s ease-in-out infinite', pointerEvents:'none' }}/>
          <div style={{ position:'absolute', top:'-40%', left:'40%', width:'18%', height:'250%', background:`linear-gradient(108deg,transparent 35%,${catColor}10 50%,transparent 65%)`, transform:'skewX(-18deg)', animation:'beamPulse 5s ease-in-out 1.8s infinite', pointerEvents:'none' }}/>
          <div style={{ position:'absolute', top:'-40%', left:'65%', width:'12%', height:'250%', background:`linear-gradient(108deg,transparent 35%,${catColor}08 50%,transparent 65%)`, transform:'skewX(-18deg)', animation:'beamPulse 5s ease-in-out 3.2s infinite', pointerEvents:'none' }}/>

          {/* ── Floating particles ── */}
          {([
            { left:'12%', top:'70%', size:3, delay:'0s',   dur:'3.2s', dx:'8px'  },
            { left:'28%', top:'80%', size:2, delay:'1.1s', dur:'4s',   dx:'-6px' },
            { left:'50%', top:'75%', size:4, delay:'0.5s', dur:'2.8s', dx:'12px' },
            { left:'68%', top:'82%', size:2, delay:'2s',   dur:'3.8s', dx:'-4px' },
            { left:'82%', top:'72%', size:3, delay:'1.4s', dur:'4.5s', dx:'6px'  },
            { left:'90%', top:'78%', size:2, delay:'0.8s', dur:'3.5s', dx:'-8px' },
          ] as const).map((p, i) => (
            <div key={i} style={{
              position:'absolute', left:p.left, top:p.top,
              width:p.size, height:p.size, borderRadius:'50%',
              background:catColor, opacity:.85,
              boxShadow:`0 0 ${p.size * 3}px ${catColor}`,
              ['--px' as string]: p.dx, ['--py' as string]: '0px',
              animation:`particleUp ${p.dur} ${p.delay} ease-in infinite`,
              pointerEvents:'none',
            } as React.CSSProperties}/>
          ))}

          {/* ── Floating category icon ── */}
          <div style={{ position:'absolute', left:'50%', top:'50%', transform:'translate(-50%,-50%)', userSelect:'none', pointerEvents:'none', animation:'iconFloat 5s ease-in-out infinite', opacity:.55, filter:`drop-shadow(0 0 14px ${catColor}) drop-shadow(0 0 28px ${catColor}88)` }}>
            <CategorySVGIcon category={club.category ?? ''} color={catColor}/>
          </div>
          {/* Glow orb behind icon */}
          <div style={{ position:'absolute', left:'50%', top:'50%', transform:'translate(-50%,-50%)', width:90, height:90, borderRadius:'50%', background:`radial-gradient(circle,${catColor}35 0%,transparent 70%)`, animation:'iconGlow 3s ease-in-out infinite', pointerEvents:'none' }}/>

          {/* ── Corner brackets ── */}
          {[
            { top:8,  left:8,  borderRight:'none', borderBottom:'none' },
            { top:8,  right:8, borderLeft:'none',  borderBottom:'none' },
            { bottom:8, left:8,  borderRight:'none', borderTop:'none' },
            { bottom:8, right:8, borderLeft:'none',  borderTop:'none' },
          ].map((s, i) => (
            <div key={i} style={{ position:'absolute', width:14, height:14, border:`1.5px solid ${catColor}`, borderRadius:2, animation:`cornerBlink 3s ease-in-out ${i * 0.4}s infinite`, ...s, pointerEvents:'none' } as React.CSSProperties}/>
          ))}

          {/* ── Club name badge ── */}
          <div style={{ position:'absolute', bottom:12, left:12, right:12, display:'flex', alignItems:'center', gap:6, pointerEvents:'none' }}>
            <div style={{ height:1, flex:1, background:`linear-gradient(90deg,${catColor}60,transparent)` }}/>
            <span style={{ fontSize:9, fontWeight:900, letterSpacing:'0.22em', textTransform:'uppercase', color:catColor, opacity:.6 }}>
              {club.name.length > 22 ? club.name.slice(0,22)+'…' : club.name}
            </span>
            <div style={{ height:1, flex:1, background:`linear-gradient(270deg,${catColor}60,transparent)` }}/>
          </div>

          {/* ── Top colour stripe ── */}
          <div style={{ position:'absolute', top:0, left:0, right:0, height:4, background:`linear-gradient(90deg,transparent 0%,${catColor}aa 20%,${catColor} 50%,${catColor}aa 80%,transparent 100%)`, zIndex:3, boxShadow:`0 0 14px ${catColor}88` }}/>
        </>)}

        {/* Bottom fade */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(18,8,10,0.9) 0%, rgba(18,8,10,0.04) 50%, transparent 100%)',
        }} />

        {/* Top badges */}
        <div style={{
          position: 'absolute', top: 12, left: 12, right: 12,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          {club.is_member ? (
            <div style={{
              background: 'rgba(34,197,94,0.18)',
              border: '1px solid rgba(34,197,94,0.4)',
              backdropFilter: 'blur(8px)',
              borderRadius: 9999, padding: '3px 10px',
              fontSize: 10, fontWeight: 800, color: '#22c55e', letterSpacing: '0.07em',
              animation: 'memberPop 0.4s cubic-bezier(.22,1,.36,1) both',
              boxShadow: '0 0 14px rgba(34,197,94,.25)',
            }}>
              ✓ JOINED
            </div>
          ) : <div />}

          {club.is_verified && (
            <div style={{
              background: 'rgba(233,193,118,0.15)',
              border: '1px solid rgba(233,193,118,0.38)',
              backdropFilter: 'blur(8px)',
              borderRadius: 9999, padding: '3px 10px',
              fontSize: 10, fontWeight: 800, color: 'var(--gold)', letterSpacing: '0.07em',
              boxShadow: '0 0 14px rgba(233,193,118,.2)',
            }}>
              ✓ VERIFIED
            </div>
          )}
        </div>

        {uniLabel && (
          <div style={{
            position: 'absolute', bottom: 12, right: 12,
            background: 'rgba(18,8,10,0.75)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.08)',
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
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{uniLabel}</span>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ padding: '0 20px', flex: 1 }}>
        {/* Logo overlapping banner */}
        <div
          className="disc-logo-go"
          style={{
            marginTop: -28, marginBottom: 12,
            width: 54, height: 54, borderRadius: 14,
            border: '3px solid rgba(27,16,18,1)',
            outline: `1px solid ${catColor}33`,
            overflow: 'hidden',
            background: 'var(--bg-muted)',
            boxShadow: `0 4px 18px rgba(0,0,0,0.6), 0 0 0 0 ${catColor}33`,
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
            marginBottom: 14, whiteSpace: 'pre-wrap', overflowWrap: 'break-word',
          }}>
            {club.description}
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
          {club.category && (
            <span style={{
              background: `${catColor}16`,
              color: catColor,
              border: `1px solid ${catColor}33`,
              fontSize: 11, fontWeight: 700,
              padding: '3px 10px', borderRadius: 7,
              letterSpacing: '0.04em',
              boxShadow: `0 0 10px ${catColor}18`,
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
            animation: 'memberPop 0.5s cubic-bezier(.22,1,.36,1) both',
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            {club.member_count.toLocaleString()}
          </span>
          {hasForm ? (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'rgba(251,191,36,0.1)',
              color: '#fbbf24',
              border: '1px solid rgba(251,191,36,0.28)',
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
              border: '1px solid rgba(34,197,94,0.22)',
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
          ref={btnRef}
          className={`disc-join${!club.is_member && !isPending ? ' disc-join-shimmer' : ''}`}
          onClick={handleJoin}
          disabled={joining || isPending}
          style={{
            width: '100%', padding: '11px',
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
            fontSize: 13, fontWeight: 700, letterSpacing: '0.05em',
            cursor: joining || isPending ? 'default' : 'pointer',
            opacity: joining ? 0.6 : 1,
            boxShadow: club.is_member || isPending ? 'none' : '0 4px 18px rgba(138,21,56,0.35)',
            position: 'relative', overflow: 'hidden',
            animation: justJoined ? 'joinSuccess 0.5s ease' : 'none',
          }}
        >
          {ripple && (
            <span key={ripple.key} style={{
              position: 'absolute',
              left: ripple.x, top: ripple.y,
              width: 10, height: 10,
              marginLeft: -5, marginTop: -5,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.45)',
              animation: 'discRipple 0.65s ease-out forwards',
              pointerEvents: 'none',
            }}/>
          )}
          {joining ? '···' : club.is_member ? '✓  Joined' : isPending ? '⏳  Applied' : hasForm ? '📋  Apply Now' : 'Join Club'}
        </button>
      </div>
    </div>
  )
}

function SkeletonGrid() {
  const shimmerBg = 'linear-gradient(90deg, rgba(52,39,40,0.3) 0%, rgba(72,54,57,0.55) 45%, rgba(52,39,40,0.3) 100%)'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 310px), 1fr))', gap: 22 }}>
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
