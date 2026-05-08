import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

interface FounderCard {
  id: string
  user_id: string
  project_title: string
  project_description: string | null
  skills_needed: string[]
  skills_offered: string[]
  university_id: string | null
  is_active: boolean
  created_at: string
  profile?: { full_name: string | null; avatar_url: string | null } | null
  university?: { name: string; short_name: string | null } | null
}

type Tab = 'discover' | 'matches'

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(27,16,18,0.6)',
  border: '1px solid rgba(87,65,68,0.4)',
  borderRadius: 12,
  padding: '12px 16px',
  color: 'var(--text-primary)',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 0.2s',
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--text-muted)',
          letterSpacing: '0.1em',
          marginBottom: 6,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </label>
      {hint && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5 }}>{hint}</div>
      )}
      {children}
    </div>
  )
}

function SkillPill({ label, variant }: { label: string; variant: 'needed' | 'offered' }) {
  const isNeeded = variant === 'needed'
  return (
    <span
      style={{
        padding: '3px 11px',
        borderRadius: 9999,
        background: isNeeded ? 'rgba(138,21,56,0.18)' : 'rgba(233,193,118,0.12)',
        border: isNeeded ? '1px solid rgba(138,21,56,0.35)' : '1px solid rgba(233,193,118,0.28)',
        color: isNeeded ? '#e8a0b0' : 'var(--gold)',
        fontSize: 11.5,
        fontWeight: 500,
        letterSpacing: '0.01em',
      }}
    >
      {label}
    </span>
  )
}

function Avatar({ name, size = 52 }: { name: string | null | undefined; size?: number }) {
  const letters = (name ?? '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, var(--accent) 0%, #c42057 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.35,
        fontWeight: 800,
        color: '#fff',
        flexShrink: 0,
        boxShadow: '0 4px 16px rgba(138,21,56,0.45)',
        letterSpacing: '-0.5px',
      }}
    >
      {letters}
    </div>
  )
}

export default function CollaborationPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('discover')
  const [founders, setFounders] = useState<FounderCard[]>([])
  const [matches, setMatches] = useState<FounderCard[]>([])
  const [myProfile, setMyProfile] = useState<FounderCard | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [swiping, setSwiping] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [matchFlash, setMatchFlash] = useState<string | null>(null)
  const [swipeDir, setSwipeDir] = useState<'left' | 'right' | null>(null)
  const [form, setForm] = useState({ skills_needed: '', skills_offered: '' })
  const [saving, setSaving] = useState(false)

  const fetchMyProfile = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('founder_profiles')
      .select('*, profile:profiles(full_name, avatar_url), university:universities(name, short_name)')
      .eq('user_id', user.id)
      .maybeSingle()
    setMyProfile(data ?? null)
    if (data) {
      setForm({
        skills_needed: (data.skills_needed ?? []).join(', '),
        skills_offered: (data.skills_offered ?? []).join(', '),
      })
    }
  }, [user])

  const fetchFounders = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data: swiped } = await supabase
      .from('founder_swipes')
      .select('swiped_id')
      .eq('swiper_id', user.id)
    const excludeIds = [user.id, ...(swiped?.map((s) => s.swiped_id) ?? [])]
    const { data } = await supabase
      .from('founder_profiles')
      .select('*, profile:profiles(full_name, avatar_url), university:universities(name, short_name)')
      .eq('is_active', true)
      .not('user_id', 'in', `(${excludeIds.join(',')})`)
    setFounders(data ?? [])
    setCurrentIndex(0)
    setLoading(false)
  }, [user])

  const fetchMatches = useCallback(async () => {
    if (!user) return
    const { data: myRights } = await supabase
      .from('founder_swipes')
      .select('swiped_id')
      .eq('swiper_id', user.id)
      .eq('direction', 'right')
    const myRightIds = myRights?.map((s) => s.swiped_id) ?? []
    if (myRightIds.length === 0) { setMatches([]); return }
    const { data: mutual } = await supabase
      .from('founder_swipes')
      .select('swiper_id')
      .in('swiper_id', myRightIds)
      .eq('swiped_id', user.id)
      .eq('direction', 'right')
    const matchedIds = mutual?.map((s) => s.swiper_id) ?? []
    if (matchedIds.length === 0) { setMatches([]); return }
    const { data } = await supabase
      .from('founder_profiles')
      .select('*, profile:profiles(full_name, avatar_url), university:universities(name, short_name)')
      .in('user_id', matchedIds)
      .eq('is_active', true)
    setMatches(data ?? [])
  }, [user])

  useEffect(() => {
    fetchMyProfile()
    fetchFounders()
    fetchMatches()
  }, [fetchMyProfile, fetchFounders, fetchMatches])

  const handleSwipe = async (direction: 'left' | 'right') => {
    if (!user || swiping) return
    const founder = founders[currentIndex]
    if (!founder) return
    setSwiping(true)
    setSwipeDir(direction)

    await supabase.from('founder_swipes').insert({
      swiper_id: user.id,
      swiped_id: founder.user_id,
      direction,
    })

    if (direction === 'right') {
      const { data: isMatch } = await supabase
        .from('founder_swipes')
        .select('id')
        .eq('swiper_id', founder.user_id)
        .eq('swiped_id', user.id)
        .eq('direction', 'right')
        .maybeSingle()
      if (isMatch) {
        setMatchFlash(founder.profile?.full_name ?? 'Someone')
        fetchMatches()
      }
    }

    setTimeout(() => {
      setCurrentIndex((i) => i + 1)
      setSwipeDir(null)
      setSwiping(false)
    }, 280)
  }

  const handleSaveProfile = async () => {
    if (!user) return
    setSaving(true)
    const parseSkills = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
    const payload = {
      user_id: user.id,
      project_title: myProfile?.project_title ?? '',
      project_description: myProfile?.project_description ?? null,
      skills_needed: parseSkills(form.skills_needed),
      skills_offered: parseSkills(form.skills_offered),
      is_active: true,
    }
    if (myProfile) {
      await supabase.from('founder_profiles').update(payload).eq('id', myProfile.id)
    } else {
      await supabase.from('founder_profiles').insert(payload)
    }
    await fetchMyProfile()
    setSaving(false)
    setShowProfileModal(false)
  }

  const currentFounder = founders[currentIndex]
  const noMore = !loading && currentIndex >= founders.length
  const progress = founders.length > 0 ? Math.min(currentIndex / founders.length, 1) : 0

  return (
    <div className="page-content" style={{ maxWidth: 1000 }}>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.92); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes spinLoader {
          to { transform: rotate(360deg); }
        }
        @keyframes swipeLeft {
          to { opacity: 0; transform: translateX(-120px) rotate(-8deg); }
        }
        @keyframes swipeRight {
          to { opacity: 0; transform: translateX(120px) rotate(8deg); }
        }
        @keyframes pulse-ring {
          0%   { transform: scale(0.95); opacity: 0.7; }
          70%  { transform: scale(1.3);  opacity: 0; }
          100% { transform: scale(1.3);  opacity: 0; }
        }
        @keyframes shimmer {
          0%   { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        .swipe-btn-pass:hover:not(:disabled) {
          background: rgba(255,255,255,0.08) !important;
          border-color: rgba(255,255,255,0.25) !important;
          transform: scale(1.06) !important;
        }
        .swipe-btn-connect:hover:not(:disabled) {
          background: rgba(138,21,56,0.35) !important;
          box-shadow: 0 0 32px rgba(138,21,56,0.55), 0 8px 24px rgba(138,21,56,0.3) !important;
          transform: scale(1.06) !important;
        }
        .match-card:hover {
          border-color: rgba(138,21,56,0.4) !important;
          transform: translateY(-3px);
          box-shadow: 0 16px 48px rgba(0,0,0,0.4) !important;
        }
        .profile-btn:hover {
          background: rgba(138,21,56,0.2) !important;
        }
        .tab-btn:hover {
          color: var(--text-secondary) !important;
        }
      `}</style>

      {/* ── Match flash ── */}
      {matchFlash && (
        <div
          onClick={() => setMatchFlash(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.92)',
            backdropFilter: 'blur(16px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{ textAlign: 'center', animation: 'fadeInScale 0.4s cubic-bezier(0.34,1.56,0.64,1)' }}>
            <div style={{ position: 'relative', display: 'inline-block', marginBottom: 28 }}>
              <div style={{
                position: 'absolute', inset: -20, borderRadius: '50%',
                border: '2px solid rgba(138,21,56,0.5)',
                animation: 'pulse-ring 1.5s ease-out infinite',
              }} />
              <div style={{
                width: 88, height: 88, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--accent), #c42057)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 40, boxShadow: '0 0 48px rgba(138,21,56,0.6)',
              }}>
                🤝
              </div>
            </div>
            <div style={{
              fontSize: 36, fontWeight: 800, color: '#fff',
              marginBottom: 10, letterSpacing: '-1px',
            }}>
              It's a Match!
            </div>
            <div style={{ fontSize: 16, color: 'var(--text-secondary)', marginBottom: 32, lineHeight: 1.6 }}>
              You and{' '}
              <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{matchFlash}</span>{' '}
              both want to connect
            </div>
            <button
              onClick={() => setMatchFlash(null)}
              style={{
                padding: '13px 40px',
                background: 'var(--accent)',
                border: 'none', borderRadius: 9999,
                color: '#fff', fontSize: 15, fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 8px 24px rgba(138,21,56,0.45)',
              }}
            >
              Keep Exploring
            </button>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', marginBottom: 32,
      }}>
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
            color: 'var(--accent)', marginBottom: 10, textTransform: 'uppercase',
          }}>
            <span style={{
              width: 18, height: 2,
              background: 'linear-gradient(90deg, var(--accent), transparent)',
              borderRadius: 9999, display: 'inline-block',
            }} />
            Collaboration
          </div>
          <h1 style={{
            fontSize: 40, fontWeight: 800, color: 'var(--text-primary)',
            letterSpacing: '-1.5px', lineHeight: 1.1, marginBottom: 10,
          }}>
            Founder Match
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.65, maxWidth: 380 }}>
            Connect with student founders and build something great together.
          </p>
        </div>
        <button
          className="profile-btn"
          onClick={() => setShowProfileModal(true)}
          style={{
            padding: '10px 20px',
            background: myProfile ? 'rgba(138,21,56,0.1)' : 'var(--accent)',
            border: myProfile ? '1px solid rgba(138,21,56,0.4)' : 'none',
            borderRadius: 12,
            color: myProfile ? 'var(--text-secondary)' : '#fff',
            fontSize: 13, fontWeight: 600,
            cursor: 'pointer', flexShrink: 0, marginTop: 6,
            transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 7,
          }}
        >
          {myProfile ? (
            <>
              <span style={{ fontSize: 14 }}>✏</span>
              My Profile
            </>
          ) : (
            <>
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
              Create Profile
            </>
          )}
        </button>
      </div>

      {/* ── Tabs ── */}
      <div style={{
        display: 'flex', gap: 2,
        borderBottom: '1px solid rgba(87,65,68,0.25)',
        marginBottom: 40,
      }}>
        {(['discover', 'matches'] as Tab[]).map((t) => (
          <button
            key={t}
            className="tab-btn"
            onClick={() => setTab(t)}
            style={{
              padding: '11px 24px',
              background: 'transparent', border: 'none',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: 14, fontWeight: tab === t ? 700 : 400,
              cursor: 'pointer', marginBottom: -1,
              transition: 'color 0.15s', letterSpacing: tab === t ? '-0.2px' : 'normal',
            }}
          >
            {t === 'discover' ? 'Discover' : (
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                Matches
                {matches.length > 0 && (
                  <span style={{
                    padding: '1px 7px', borderRadius: 9999,
                    background: tab === 'matches' ? 'var(--accent)' : 'rgba(138,21,56,0.3)',
                    color: '#fff', fontSize: 11, fontWeight: 700,
                  }}>
                    {matches.length}
                  </span>
                )}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── DISCOVER ── */}
      {tab === 'discover' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

          {/* No-profile nudge */}
          {!myProfile && (
            <div style={{
              width: '100%', maxWidth: 500,
              background: 'linear-gradient(135deg, rgba(138,21,56,0.1), rgba(41,28,30,0.6))',
              border: '1px solid rgba(138,21,56,0.2)',
              borderRadius: 14, padding: '14px 20px',
              marginBottom: 28,
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(138,21,56,0.2)',
                border: '1px solid rgba(138,21,56,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 17, flexShrink: 0,
              }}>
                💡
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                Create your profile so other founders can discover you too.{' '}
                <button
                  onClick={() => setShowProfileModal(true)}
                  style={{
                    background: 'none', border: 'none',
                    color: 'var(--accent)', fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', padding: 0,
                  }}
                >
                  Set it up →
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div style={{ color: 'var(--text-muted)', padding: '80px 0', textAlign: 'center' }}>
              <div style={{
                width: 30, height: 30,
                border: '2.5px solid rgba(87,65,68,0.25)',
                borderTopColor: 'var(--accent)', borderRadius: '50%',
                animation: 'spinLoader 0.75s linear infinite',
                margin: '0 auto 16px',
              }} />
              <div style={{ fontSize: 14 }}>Finding founders…</div>
            </div>
          ) : noMore ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 52, marginBottom: 20 }}>✨</div>
              <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, letterSpacing: '-0.3px' }}>
                You've seen everyone for now
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.6 }}>Check back later for new founders.</div>
            </div>
          ) : currentFounder ? (
            <>
              {/* Progress bar */}
              <div style={{ width: '100%', maxWidth: 500, marginBottom: 14 }}>
                <div style={{
                  height: 2, borderRadius: 9999,
                  background: 'rgba(87,65,68,0.2)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', borderRadius: 9999,
                    background: 'linear-gradient(90deg, var(--accent), #c42057)',
                    width: `${progress * 100}%`,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                <div style={{
                  display: 'flex', justifyContent: 'flex-end',
                  marginTop: 6,
                }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.03em' }}>
                    {currentIndex + 1} of {founders.length}
                  </span>
                </div>
              </div>

              {/* Founder card */}
              <div
                style={{
                  width: '100%', maxWidth: 500,
                  background: 'rgba(41,28,30,0.7)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 28,
                  overflow: 'hidden',
                  boxShadow: '0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(138,21,56,0.08)',
                  animation: swipeDir === 'left'
                    ? 'swipeLeft 0.28s ease forwards'
                    : swipeDir === 'right'
                    ? 'swipeRight 0.28s ease forwards'
                    : 'fadeInScale 0.3s cubic-bezier(0.34,1.1,0.64,1)',
                  position: 'relative',
                }}
              >
                {/* Ambient glow */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 200,
                  background: 'radial-gradient(ellipse at 30% 0%, rgba(138,21,56,0.18) 0%, transparent 70%)',
                  pointerEvents: 'none',
                }} />

                {/* Top banner */}
                <div style={{
                  padding: '28px 30px 24px',
                  background: 'linear-gradient(160deg, rgba(138,21,56,0.22) 0%, rgba(27,16,18,0.4) 100%)',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  display: 'flex', alignItems: 'center', gap: 18,
                  position: 'relative',
                }}>
                  <Avatar name={currentFounder.profile?.full_name} size={62} />
                  <div>
                    <div style={{
                      fontSize: 19, fontWeight: 700, color: 'var(--text-primary)',
                      marginBottom: 4, letterSpacing: '-0.3px',
                    }}>
                      {currentFounder.profile?.full_name ?? 'Unknown Founder'}
                    </div>
                    {currentFounder.university && (
                      <div style={{
                        fontSize: 12, color: 'var(--text-muted)',
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: 'var(--accent)', display: 'inline-block', flexShrink: 0,
                        }} />
                        {currentFounder.university.short_name ?? currentFounder.university.name}
                      </div>
                    )}
                  </div>
                </div>

                {/* Body */}
                <div style={{ padding: '26px 30px 30px' }}>
                  <div style={{
                    fontSize: 21, fontWeight: 700, color: 'var(--text-primary)',
                    marginBottom: 12, lineHeight: 1.3, letterSpacing: '-0.4px',
                  }}>
                    {currentFounder.project_title}
                  </div>

                  {currentFounder.project_description && (
                    <div style={{
                      fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7,
                      marginBottom: 24,
                      display: '-webkit-box', WebkitLineClamp: 4,
                      WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                      {currentFounder.project_description}
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {currentFounder.skills_needed.length > 0 && (
                      <div>
                        <div style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                          color: 'var(--text-muted)', marginBottom: 10,
                          textTransform: 'uppercase',
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          <span style={{
                            width: 12, height: 1.5,
                            background: 'rgba(138,21,56,0.6)',
                            display: 'inline-block', borderRadius: 9999,
                          }} />
                          Looking for
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {currentFounder.skills_needed.map((s) => (
                            <SkillPill key={s} label={s} variant="needed" />
                          ))}
                        </div>
                      </div>
                    )}

                    {currentFounder.skills_offered.length > 0 && (
                      <div>
                        <div style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                          color: 'var(--text-muted)', marginBottom: 10,
                          textTransform: 'uppercase',
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          <span style={{
                            width: 12, height: 1.5,
                            background: 'rgba(233,193,118,0.5)',
                            display: 'inline-block', borderRadius: 9999,
                          }} />
                          Brings to the table
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {currentFounder.skills_offered.map((s) => (
                            <SkillPill key={s} label={s} variant="offered" />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 36, marginTop: 32, alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <button
                    className="swipe-btn-pass"
                    onClick={() => handleSwipe('left')}
                    disabled={swiping}
                    title="Pass"
                    style={{
                      width: 64, height: 64, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1.5px solid rgba(255,255,255,0.1)',
                      color: 'var(--text-muted)',
                      fontSize: 20, cursor: swiping ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.2s', opacity: swiping ? 0.4 : 1,
                    }}
                  >
                    ✕
                  </button>
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                    color: 'var(--text-muted)', textTransform: 'uppercase',
                  }}>
                    Pass
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <button
                    className="swipe-btn-connect"
                    onClick={() => handleSwipe('right')}
                    disabled={swiping}
                    title="Connect"
                    style={{
                      width: 72, height: 72, borderRadius: '50%',
                      background: 'rgba(138,21,56,0.22)',
                      border: '1.5px solid rgba(138,21,56,0.6)',
                      color: 'var(--accent)',
                      fontSize: 26, cursor: swiping ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.2s', opacity: swiping ? 0.4 : 1,
                      boxShadow: '0 4px 20px rgba(138,21,56,0.2)',
                    }}
                  >
                    ✓
                  </button>
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                    color: 'var(--text-muted)', textTransform: 'uppercase',
                  }}>
                    Connect
                  </span>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ── MATCHES ── */}
      {tab === 'matches' && (
        <div>
          {matches.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-muted)' }}>
              <div style={{
                width: 72, height: 72, borderRadius: 20,
                background: 'rgba(138,21,56,0.08)',
                border: '1px solid rgba(138,21,56,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 36, margin: '0 auto 20px',
              }}>
                🤝
              </div>
              <div style={{
                fontSize: 19, fontWeight: 700, color: 'var(--text-secondary)',
                marginBottom: 8, letterSpacing: '-0.3px',
              }}>
                No matches yet
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.6, maxWidth: 260, margin: '0 auto' }}>
                Swipe right on founders you'd like to collaborate with.
              </div>
            </div>
          ) : (
            <>
              <div style={{
                fontSize: 13, color: 'var(--text-muted)', marginBottom: 24,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: 'var(--accent)', display: 'inline-block',
                }} />
                {matches.length} mutual connection{matches.length !== 1 ? 's' : ''}
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
                gap: 16,
              }}>
                {matches.map((m) => (
                  <MatchCard key={m.id} founder={m} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── PROFILE MODAL ── */}
      {showProfileModal && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowProfileModal(false) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.78)',
            backdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div style={{
            width: '100%', maxWidth: 520,
            background: 'var(--bg-card)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 24, padding: '30px 34px',
            maxHeight: '90vh', overflowY: 'auto',
            animation: 'fadeInScale 0.25s cubic-bezier(0.34,1.1,0.64,1)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: 28,
            }}>
              <div>
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                  color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 6,
                }}>
                  Founder Profile
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
                  {myProfile ? 'Edit Profile' : 'Create Profile'}
                </h2>
              </div>
              <button
                onClick={() => setShowProfileModal(false)}
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'var(--text-muted)',
                  fontSize: 15, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{
              height: 1,
              background: 'linear-gradient(90deg, rgba(138,21,56,0.3), transparent)',
              marginBottom: 24,
            }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <Field label="Skills Needed" hint="Comma-separated — e.g. Backend Dev, UI Design">
                <input
                  value={form.skills_needed}
                  onChange={(e) => setForm((f) => ({ ...f, skills_needed: e.target.value }))}
                  placeholder="Backend Dev, UI Design, Marketing"
                  style={inputStyle}
                />
              </Field>

              <Field label="Skills You Offer" hint="Comma-separated">
                <input
                  value={form.skills_offered}
                  onChange={(e) => setForm((f) => ({ ...f, skills_offered: e.target.value }))}
                  placeholder="Product Management, React, Business Dev"
                  style={inputStyle}
                />
              </Field>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
              <button
                onClick={() => setShowProfileModal(false)}
                style={{
                  flex: 1, padding: '12px',
                  background: 'transparent',
                  border: '1px solid rgba(87,65,68,0.35)',
                  borderRadius: 12,
                  color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                style={{
                  flex: 2, padding: '12px',
                  background: saving ? 'rgba(138,21,56,0.3)' : 'var(--accent)',
                  border: 'none', borderRadius: 12,
                  color: '#fff', fontSize: 14, fontWeight: 700,
                  cursor: saving ? 'default' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                  transition: 'background 0.15s',
                  boxShadow: saving ? 'none' : '0 4px 16px rgba(138,21,56,0.35)',
                }}
              >
                {saving ? 'Saving…' : myProfile ? 'Save Changes' : 'Save Profile'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MatchCard({ founder }: { founder: FounderCard }) {
  return (
    <div
      className="match-card"
      style={{
        background: 'rgba(41,28,30,0.5)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 20,
        padding: '20px 22px',
        display: 'flex', flexDirection: 'column', gap: 14,
        transition: 'all 0.2s ease',
        cursor: 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar name={founder.profile?.full_name} size={46} />
          <div style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 14, height: 14, borderRadius: '50%',
            background: 'var(--accent)',
            border: '2px solid var(--bg-card)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 7,
          }}>
            ✓
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 15, fontWeight: 700, color: 'var(--text-primary)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            letterSpacing: '-0.2px',
          }}>
            {founder.profile?.full_name ?? 'Unknown'}
          </div>
          {founder.university && (
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
              {founder.university.short_name ?? founder.university.name}
            </div>
          )}
        </div>
      </div>

      <div style={{
        height: 1, background: 'rgba(87,65,68,0.2)', borderRadius: 9999,
      }} />

      <div style={{
        fontSize: 13.5, fontWeight: 600, color: 'var(--text-secondary)',
        lineHeight: 1.45, letterSpacing: '-0.1px',
      }}>
        {founder.project_title}
      </div>

      {founder.skills_needed.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {founder.skills_needed.slice(0, 3).map((s) => (
            <SkillPill key={s} label={s} variant="needed" />
          ))}
          {founder.skills_needed.length > 3 && (
            <span style={{
              padding: '3px 10px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--text-muted)', fontSize: 11,
            }}>
              +{founder.skills_needed.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
