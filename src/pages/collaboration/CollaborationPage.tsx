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
  background: 'rgba(41,28,30,0.8)',
  border: '1px solid rgba(87,65,68,0.3)',
  borderRadius: 10,
  padding: '11px 14px',
  color: 'var(--text-primary)',
  fontSize: 14,
  outline: 'none',
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
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--text-muted)',
          letterSpacing: '0.08em',
          marginBottom: 6,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </label>
      {hint && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{hint}</div>
      )}
      {children}
    </div>
  )
}

function SkillPill({
  label,
  variant,
}: {
  label: string
  variant: 'needed' | 'offered'
}) {
  const isNeeded = variant === 'needed'
  return (
    <span
      style={{
        padding: '4px 12px',
        borderRadius: 9999,
        background: isNeeded ? 'rgba(138,21,56,0.15)' : 'rgba(233,193,118,0.1)',
        border: isNeeded
          ? '1px solid rgba(138,21,56,0.3)'
          : '1px solid rgba(233,193,118,0.25)',
        color: isNeeded ? 'var(--text-secondary)' : 'var(--gold)',
        fontSize: 12,
        fontWeight: 500,
      }}
    >
      {label}
    </span>
  )
}

function Avatar({
  name,
  size = 52,
}: {
  name: string | null | undefined
  size?: number
}) {
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
        background: 'var(--accent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.36,
        fontWeight: 800,
        color: '#fff',
        flexShrink: 0,
        border: '2px solid rgba(255,255,255,0.12)',
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
  const [form, setForm] = useState({
    skills_needed: '',
    skills_offered: '',
  })
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
    if (myRightIds.length === 0) {
      setMatches([])
      return
    }

    const { data: mutual } = await supabase
      .from('founder_swipes')
      .select('swiper_id')
      .in('swiper_id', myRightIds)
      .eq('swiped_id', user.id)
      .eq('direction', 'right')

    const matchedIds = mutual?.map((s) => s.swiper_id) ?? []
    if (matchedIds.length === 0) {
      setMatches([])
      return
    }

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

    setCurrentIndex((i) => i + 1)
    setSwiping(false)
  }

  const handleSaveProfile = async () => {
    if (!user) return
    setSaving(true)
    const parseSkills = (s: string) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)

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

  return (
    <div style={{ padding: '32px 28px', maxWidth: 960 }}>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spinLoader {
          to { transform: rotate(360deg); }
        }
        .swipe-btn:hover:not(:disabled) {
          transform: scale(1.08);
        }
      `}</style>

      {/* ── Match flash overlay ── */}
      {matchFlash && (
        <div
          onClick={() => setMatchFlash(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,0.88)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ textAlign: 'center', animation: 'fadeInUp 0.4s ease' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
            <div
              style={{
                fontSize: 34,
                fontWeight: 800,
                color: '#fff',
                marginBottom: 10,
                letterSpacing: '-0.5px',
              }}
            >
              It's a Match!
            </div>
            <div
              style={{ fontSize: 16, color: 'var(--text-secondary)', marginBottom: 28 }}
            >
              You and{' '}
              <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{matchFlash}</span>{' '}
              both connected
            </div>
            <button
              onClick={() => setMatchFlash(null)}
              style={{
                padding: '12px 36px',
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 9999,
                color: '#fff',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Keep Exploring
            </button>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 28,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: 'var(--accent)',
              marginBottom: 6,
              textTransform: 'uppercase',
            }}
          >
            Collaboration
          </div>
          <h1
            style={{
              fontSize: 38,
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.5px',
              marginBottom: 8,
            }}
          >
            Founder Match
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Connect with student founders and build something great together.
          </p>
        </div>
        <button
          onClick={() => setShowProfileModal(true)}
          style={{
            padding: '10px 20px',
            background: myProfile ? 'rgba(138,21,56,0.12)' : 'var(--accent)',
            border: myProfile ? '1px solid var(--accent)' : 'none',
            borderRadius: 10,
            color: myProfile ? 'var(--accent)' : '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
            marginTop: 8,
            transition: 'all 0.15s',
          }}
        >
          {myProfile ? '✏  My Profile' : '+ Create Profile'}
        </button>
      </div>

      {/* ── Tabs ── */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          borderBottom: '1px solid rgba(87,65,68,0.3)',
          marginBottom: 36,
        }}
      >
        {(['discover', 'matches'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 22px',
              background: 'transparent',
              border: 'none',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: 15,
              fontWeight: tab === t ? 600 : 400,
              cursor: 'pointer',
              marginBottom: -1,
              transition: 'color 0.15s',
            }}
          >
            {t === 'matches'
              ? `Matches${matches.length > 0 ? ` (${matches.length})` : ''}`
              : 'Discover'}
          </button>
        ))}
      </div>

      {/* ── DISCOVER ── */}
      {tab === 'discover' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* No-profile nudge */}
          {!myProfile && (
            <div
              style={{
                width: '100%',
                maxWidth: 480,
                background: 'rgba(138,21,56,0.08)',
                border: '1px solid rgba(138,21,56,0.25)',
                borderRadius: 12,
                padding: '13px 18px',
                marginBottom: 24,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <span style={{ fontSize: 18 }}>💡</span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Create your profile so other founders can discover you too.{' '}
                <button
                  onClick={() => setShowProfileModal(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Set it up →
                </button>
              </span>
            </div>
          )}

          {loading ? (
            <div
              style={{
                color: 'var(--text-muted)',
                padding: '80px 0',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  border: '3px solid rgba(87,65,68,0.3)',
                  borderTopColor: 'var(--accent)',
                  borderRadius: '50%',
                  animation: 'spinLoader 0.8s linear infinite',
                  margin: '0 auto 16px',
                }}
              />
              Loading founders…
            </div>
          ) : noMore ? (
            <div
              style={{
                textAlign: 'center',
                padding: '80px 0',
                color: 'var(--text-muted)',
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 16 }}>✨</div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  marginBottom: 8,
                }}
              >
                You've seen everyone for now
              </div>
              <div style={{ fontSize: 14 }}>Check back later for new founders.</div>
            </div>
          ) : currentFounder ? (
            <>
              {/* Counter */}
              <div
                style={{
                  width: '100%',
                  maxWidth: 480,
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginBottom: 10,
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {currentIndex + 1} / {founders.length}
                </span>
              </div>

              {/* Founder card */}
              <div
                style={{
                  width: '100%',
                  maxWidth: 480,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 24,
                  overflow: 'hidden',
                  boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
                }}
              >
                {/* Top banner */}
                <div
                  style={{
                    padding: '26px 28px 22px',
                    background:
                      'linear-gradient(135deg, rgba(138,21,56,0.25) 0%, rgba(41,28,30,0.5) 100%)',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                  }}
                >
                  <Avatar name={currentFounder.profile?.full_name} size={60} />
                  <div>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        marginBottom: 3,
                      }}
                    >
                      {currentFounder.profile?.full_name ?? 'Unknown Founder'}
                    </div>
                    {currentFounder.university && (
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        {currentFounder.university.short_name ??
                          currentFounder.university.name}
                      </div>
                    )}
                  </div>
                </div>

                {/* Body */}
                <div style={{ padding: '24px 28px 28px' }}>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      marginBottom: 10,
                      lineHeight: 1.3,
                    }}
                  >
                    {currentFounder.project_title}
                  </div>
                  {currentFounder.project_description && (
                    <div
                      style={{
                        fontSize: 14,
                        color: 'var(--text-secondary)',
                        lineHeight: 1.65,
                        marginBottom: 22,
                        display: '-webkit-box',
                        WebkitLineClamp: 4,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {currentFounder.project_description}
                    </div>
                  )}

                  {currentFounder.skills_needed.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.1em',
                          color: 'var(--text-muted)',
                          marginBottom: 8,
                          textTransform: 'uppercase',
                        }}
                      >
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
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.1em',
                          color: 'var(--text-muted)',
                          marginBottom: 8,
                          textTransform: 'uppercase',
                        }}
                      >
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

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 28, marginTop: 28 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <button
                    className="swipe-btn"
                    onClick={() => handleSwipe('left')}
                    disabled={swiping}
                    title="Pass"
                    style={{
                      width: 62,
                      height: 62,
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.04)',
                      border: '2px solid rgba(255,255,255,0.12)',
                      color: 'var(--text-muted)',
                      fontSize: 22,
                      cursor: swiping ? 'default' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'transform 0.15s',
                      opacity: swiping ? 0.5 : 1,
                    }}
                  >
                    ✕
                  </button>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Pass
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <button
                    className="swipe-btn"
                    onClick={() => handleSwipe('right')}
                    disabled={swiping}
                    title="Connect"
                    style={{
                      width: 62,
                      height: 62,
                      borderRadius: '50%',
                      background: 'rgba(138,21,56,0.2)',
                      border: '2px solid var(--accent)',
                      color: 'var(--accent)',
                      fontSize: 24,
                      cursor: swiping ? 'default' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'transform 0.15s',
                      opacity: swiping ? 0.5 : 1,
                    }}
                  >
                    ♥
                  </button>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
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
            <div
              style={{
                textAlign: 'center',
                padding: '80px 0',
                color: 'var(--text-muted)',
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 16 }}>🤝</div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  marginBottom: 8,
                }}
              >
                No matches yet
              </div>
              <div style={{ fontSize: 14 }}>
                Swipe right on founders you'd like to collaborate with.
              </div>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>
                {matches.length} mutual connection{matches.length !== 1 ? 's' : ''}
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 20,
                }}
              >
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
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowProfileModal(false)
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(0,0,0,0.72)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 520,
              background: 'var(--bg-card)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 20,
              padding: '28px 32px',
              maxHeight: '90vh',
              overflowY: 'auto',
              animation: 'fadeInUp 0.25s ease',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 24,
              }}
            >
              <h2
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                }}
              >
                {myProfile ? 'Edit Founder Profile' : 'Create Founder Profile'}
              </h2>
              <button
                onClick={() => setShowProfileModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: 20,
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <Field label="Skills Needed" hint="Comma-separated — e.g. Backend Dev, UI Design">
                <input
                  value={form.skills_needed}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, skills_needed: e.target.value }))
                  }
                  placeholder="Backend Dev, UI Design, Marketing"
                  style={inputStyle}
                />
              </Field>

              <Field label="Skills You Offer" hint="Comma-separated">
                <input
                  value={form.skills_offered}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, skills_offered: e.target.value }))
                  }
                  placeholder="Product Management, React, Business Dev"
                  style={inputStyle}
                />
              </Field>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button
                onClick={() => setShowProfileModal(false)}
                style={{
                  flex: 1,
                  padding: '11px',
                  background: 'transparent',
                  border: '1px solid rgba(87,65,68,0.3)',
                  borderRadius: 10,
                  color: 'var(--text-muted)',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                style={{
                  flex: 2,
                  padding: '11px',
                  background: saving ? 'rgba(138,21,56,0.3)' : 'var(--accent)',
                  border: 'none',
                  borderRadius: 10,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: saving ? 'default' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                  transition: 'background 0.15s',
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
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        transition: 'border-color 0.2s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar name={founder.profile?.full_name} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {founder.profile?.full_name ?? 'Unknown'}
          </div>
          {founder.university && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
              {founder.university.short_name ?? founder.university.name}
            </div>
          )}
        </div>
        <span style={{ fontSize: 18, flexShrink: 0 }}>🤝</span>
      </div>

      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          lineHeight: 1.4,
        }}
      >
        {founder.project_title}
      </div>

      {founder.skills_needed.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {founder.skills_needed.slice(0, 3).map((s) => (
            <SkillPill key={s} label={s} variant="needed" />
          ))}
          {founder.skills_needed.length > 3 && (
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 9999,
                background: 'rgba(255,255,255,0.05)',
                color: 'var(--text-muted)',
                fontSize: 11,
              }}
            >
              +{founder.skills_needed.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
