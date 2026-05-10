import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { filterText } from '../../lib/contentFilter'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClubMem {
  club_id: string
  role: string
  club: { name: string; logo_url: string | null; category: string | null } | null
}

interface Listing {
  id: string
  title: string
  skill_offered: string
  skill_wanted: string
  category: string | null
  is_active: boolean
  created_at: string
}

interface Review {
  id: string
  rating: number
  comment: string | null
  created_at: string
  reviewer: { full_name: string | null } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  Technology: '#0ea5e9', 'Arts & Culture': '#a855f7', Sports: '#e9c176',
  Entrepreneurship: '#f97316', Engineering: '#22c55e', Business: '#ec4899',
  Tech: '#0ea5e9', Design: '#a855f7', Languages: '#22c55e',
  Marketing: '#f97316', Finance: '#e9c176', Other: '#6b7280',
}

function catColor(cat: string | null) {
  return CATEGORY_COLORS[cat ?? ''] ?? '#6b7280'
}

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return d < 30 ? `${d}d ago` : `${Math.floor(d / 30)}mo ago`
}

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span style={{ fontSize: size, letterSpacing: 1 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{ color: i <= rating ? '#e9c176' : 'rgba(255,255,255,0.15)' }}>★</span>
      ))}
    </span>
  )
}

const inputSt: React.CSSProperties = {
  width: '100%', background: 'rgba(41,28,30,0.7)', border: '1px solid rgba(87,65,68,0.3)',
  borderRadius: 10, padding: '10px 14px', color: 'var(--text-primary)',
  fontSize: 14, outline: 'none', fontFamily: 'inherit',
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, profile, refreshProfile, signOut } = useAuth()

  const [clubs, setClubs] = useState<ClubMem[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [completedTrades, setCompletedTrades] = useState(0)
  const [loading, setLoading] = useState(true)

  // Edit state
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editBio, setEditBio] = useState('')
  const [editSkillsRaw, setEditSkillsRaw] = useState('')
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // Avatar upload
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState('')

  // Active listing toggle
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    if (!user) return
    setLoading(true)

    const [clubsRes, listingsRes, reviewsRes, asRequester, myListingsRes] = await Promise.all([
      supabase
        .from('club_memberships')
        .select('club_id, role, club:clubs(name, logo_url, category)')
        .eq('user_id', user.id),
      supabase
        .from('skill_listings')
        .select('id, title, skill_offered, skill_wanted, category, is_active, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('skill_trade_reviews')
        .select('id, rating, comment, created_at, reviewer:profiles!reviewer_id(full_name)')
        .eq('reviewee_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
      // Trades where user was the requester
      supabase
        .from('skill_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed')
        .eq('requester_id', user.id),
      // My listing IDs so we can count trades where user was the listing owner
      supabase
        .from('skill_listings')
        .select('id')
        .eq('user_id', user.id),
    ])

    setClubs((clubsRes.data as unknown as ClubMem[]) ?? [])
    setListings((listingsRes.data as Listing[]) ?? [])
    setReviews((reviewsRes.data as unknown as Review[]) ?? [])

    // Count trades where user was the listing owner (other side of the trade)
    const myListingIds = (myListingsRes.data ?? []).map(l => l.id)
    let asOwnerCount = 0
    if (myListingIds.length > 0) {
      const { count } = await supabase
        .from('skill_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed')
        .in('listing_id', myListingIds)
      asOwnerCount = count ?? 0
    }

    setCompletedTrades((asRequester.count ?? 0) + asOwnerCount)
    setLoading(false)
  }, [user])

  useEffect(() => { fetchAll() }, [fetchAll])

  function openEdit() {
    setEditName(profile?.full_name ?? '')
    setEditBio(profile?.bio ?? '')
    setEditSkillsRaw((profile?.skills ?? []).join(', '))
    setEditError('')
    setEditing(true)
  }

  async function saveEdit() {
    if (!user) return
    const name = editName.trim()
    if (!name) { setEditError('Name is required.'); return }
    const check = filterText(name, editBio, editSkillsRaw)
    if (!check.ok) { setEditError(check.reason!); return }

    setSaving(true)
    const skills = editSkillsRaw.split(',').map(s => s.trim()).filter(Boolean)
    await supabase
      .from('profiles')
      .update({ full_name: name, bio: editBio.trim() || null, skills })
      .eq('id', user.id)
    await refreshProfile()
    setSaving(false)
    setEditing(false)
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setAvatarError('Only JPEG, PNG, WebP, or GIF images are allowed.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Image must be under 5 MB.')
      return
    }
    setAvatarError('')
    setUploadingAvatar(true)
    const ext = file.name.split('.').pop()
    const path = `${user.id}/avatar.${ext}`
    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) { setAvatarError('Upload failed. Please try again.'); setUploadingAvatar(false); return }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    // Bust cache by appending a timestamp
    const bustedUrl = `${publicUrl}?t=${Date.now()}`
    await supabase.from('profiles').update({ avatar_url: bustedUrl }).eq('id', user.id)
    await refreshProfile()
    setUploadingAvatar(false)
    // Reset input so same file can be re-selected
    if (avatarInputRef.current) avatarInputRef.current.value = ''
  }

  async function toggleListing(id: string, isActive: boolean) {
    setTogglingId(id)
    await supabase.from('skill_listings').update({ is_active: !isActive }).eq('id', id)
    setListings(prev => prev.map(l => l.id === id ? { ...l, is_active: !isActive } : l))
    setTogglingId(null)
  }

  const avgRating = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : null

  const initials = (name: string | null) =>
    (name ?? '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  if (loading) return (
    <div className="page-content" style={{ maxWidth: 860, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading profile…</div>
    </div>
  )

  return (
    <div className="page-content" style={{ maxWidth: 860 }}>
      <style>{`
        @keyframes profFadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes profSpin { to { transform: rotate(360deg); } }
        .prof-section { animation: profFadeUp 0.4s ease both; }
        .prof-toggle:hover { opacity: 0.85; }
        .prof-listing-card { transition: border-color 0.2s, background 0.2s; }
        .prof-listing-card:hover { border-color: rgba(138,21,56,0.35) !important; background: rgba(41,28,30,0.7) !important; }
        .prof-avatar-overlay {
          position: absolute; inset: 0; border-radius: 22px;
          background: rgba(0,0,0,0.55); display: flex;
          align-items: center; justify-content: center;
          opacity: 0; transition: opacity 0.18s;
        }
        .prof-avatar:hover .prof-avatar-overlay { opacity: 1; }
      `}</style>

      {/* ── Profile Header ── */}
      <div className="prof-section" style={{ background: 'rgba(41,28,30,0.45)', border: '1px solid rgba(87,65,68,0.2)', borderRadius: 20, padding: '32px', marginBottom: 20, position: 'relative', overflow: 'hidden' }}>
        {/* Ambient glow */}
        <div style={{ position: 'absolute', top: -60, right: -60, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(138,21,56,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {!editing ? (
          <div style={{ position: 'relative', display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Avatar — click to upload */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div
                onClick={() => avatarInputRef.current?.click()}
                title="Change profile picture"
                style={{
                  width: 80, height: 80, borderRadius: 22, flexShrink: 0,
                  background: 'linear-gradient(135deg, var(--accent) 0%, #c0255a 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, fontWeight: 900, color: '#fff',
                  boxShadow: '0 8px 28px rgba(138,21,56,0.4)',
                  cursor: 'pointer', overflow: 'hidden', position: 'relative',
                }}
                className="prof-avatar"
              >
                {profile?.avatar_url
                  ? <img src={profile.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : initials(profile?.full_name ?? null)
                }
                {/* Hover overlay */}
                <div className="prof-avatar-overlay">
                  {uploadingAvatar
                    ? <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.5)', borderTopColor: '#fff', borderRadius: '50%', animation: 'profSpin 0.7s linear infinite' }} />
                    : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  }
                </div>
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                style={{ display: 'none' }}
                onChange={handleAvatarChange}
              />
              {avatarError && (
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, width: 200, fontSize: 11, color: '#f87171', background: 'rgba(27,16,18,0.97)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 8, padding: '6px 10px', zIndex: 10, lineHeight: 1.4 }}>
                  {avatarError}
                </div>
              )}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px', lineHeight: 1.2 }}>
                  {profile?.full_name ?? 'Student'}
                </h1>
                <RoleBadge role={profile?.role ?? 'student'} />
              </div>

              {profile?.university && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
                  {profile.university.name}
                </div>
              )}

              {profile?.bio && (
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 520, marginBottom: 14 }}>
                  {profile.bio}
                </p>
              )}

              {/* Skills */}
              {profile?.skills && profile.skills.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                  {profile.skills.map(s => (
                    <span key={s} style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 7, background: 'rgba(138,21,56,0.12)', color: 'var(--accent)', border: '1px solid rgba(138,21,56,0.25)' }}>
                      {s}
                    </span>
                  ))}
                </div>
              )}

              {!profile?.bio && (!profile?.skills || profile.skills.length === 0) && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>No bio yet — add one to introduce yourself.</div>
              )}
            </div>

            {/* Karak Points + Edit */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12, flexShrink: 0 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--gold)', letterSpacing: '-1px', lineHeight: 1 }}>
                  {(profile?.karak_points ?? 0).toLocaleString()}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(233,193,118,0.6)', textTransform: 'uppercase' }}>
                  Karak Points
                </div>
              </div>
              <button
                onClick={openEdit}
                style={{ padding: '8px 18px', background: 'transparent', border: '1px solid rgba(87,65,68,0.35)', borderRadius: 9, color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(138,21,56,0.5)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(87,65,68,0.35)'; e.currentTarget.style.color = 'var(--text-muted)' }}
              >
                Edit Profile
              </button>
              <button
                onClick={signOut}
                style={{ padding: '8px 18px', background: 'transparent', border: '1px solid rgba(87,65,68,0.25)', borderRadius: 9, color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(248,113,113,0.4)'; e.currentTarget.style.color = '#f87171' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(87,65,68,0.25)'; e.currentTarget.style.color = 'var(--text-muted)' }}
              >
                Sign Out
              </button>
            </div>
          </div>
        ) : (
          /* ── Edit Form ── */
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 20 }}>
              Edit Profile
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Full Name</label>
                <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Your name" style={inputSt} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Bio</label>
                <textarea value={editBio} onChange={e => setEditBio(e.target.value)} placeholder="Tell people who you are and what you're about…" rows={3} maxLength={300} style={{ ...inputSt, resize: 'vertical', lineHeight: 1.65 }} />
                <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{editBio.length} / 300</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Skills <span style={{ fontWeight: 400, textTransform: 'none' }}>(comma-separated)</span></label>
                <input value={editSkillsRaw} onChange={e => setEditSkillsRaw(e.target.value)} placeholder="e.g. React, Figma, Python, Marketing" style={inputSt} />
              </div>
            </div>
            {editError && (
              <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '8px 12px', marginTop: 14 }}>
                {editError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setEditing(false)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(87,65,68,0.3)', borderRadius: 10, color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={saveEdit} disabled={saving} style={{ flex: 2, padding: '10px', background: saving ? 'rgba(138,21,56,0.4)' : 'var(--accent)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1, transition: 'background 0.15s' }}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Stats Row ── */}
      <div className="prof-section" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28, animationDelay: '0.05s' }}>
        {[
          { label: 'Clubs Joined',      value: clubs.length,                                          color: '#0ea5e9' },
          { label: 'Active Listings',   value: listings.filter(l => l.is_active).length,              color: '#a855f7' },
          { label: 'Trades Completed',  value: completedTrades,                                        color: '#22c55e' },
          { label: 'Avg Rating',        value: avgRating ? `★ ${avgRating}` : '—',                   color: '#e9c176' },
        ].map(s => (
          <div key={s.label} style={{ background: 'rgba(41,28,30,0.45)', border: '1px solid rgba(87,65,68,0.18)', borderRadius: 14, padding: '16px 18px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color, letterSpacing: '-0.5px', marginBottom: 4 }}>
              {s.value}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.04em' }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* ── Clubs ── */}
      {clubs.length > 0 && (
        <div className="prof-section" style={{ marginBottom: 28, animationDelay: '0.1s' }}>
          <SectionHeader title="Clubs" count={clubs.length} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {clubs.map(m => {
              const color = catColor(m.club?.category ?? null)
              return (
                <div key={m.club_id} style={{ background: 'rgba(41,28,30,0.45)', border: '1px solid rgba(87,65,68,0.18)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: m.club?.logo_url ? 'var(--bg-muted)' : `${color}18`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color, flexShrink: 0, overflow: 'hidden' }}>
                    {m.club?.logo_url
                      ? <img src={m.club.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : (m.club?.name ?? '?')[0].toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.club?.name ?? '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{m.role}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Skill Listings ── */}
      <div className="prof-section" style={{ marginBottom: 28, animationDelay: '0.15s' }}>
        <SectionHeader title="Skill Listings" count={listings.length} />
        {listings.length === 0 ? (
          <EmptyCard icon="⚡" text="No skill listings yet. Head to Skill Souq to post one." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {listings.map(l => {
              const color = catColor(l.category)
              return (
                <div key={l.id} className="prof-listing-card" style={{ background: 'rgba(41,28,30,0.4)', border: '1px solid rgba(87,65,68,0.18)', borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                  {/* Active indicator */}
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.is_active ? '#22c55e' : 'rgba(255,255,255,0.15)', flexShrink: 0, boxShadow: l.is_active ? '0 0 8px rgba(34,197,94,0.6)' : 'none' }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {l.title}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 6, padding: '2px 8px' }}>
                        Offers: {l.skill_offered}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>⇄</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', background: 'rgba(138,21,56,0.1)', border: '1px solid rgba(138,21,56,0.2)', borderRadius: 6, padding: '2px 8px' }}>
                        Wants: {l.skill_wanted}
                      </span>
                      {l.category && (
                        <span style={{ fontSize: 10, fontWeight: 700, color, background: `${color}12`, border: `1px solid ${color}25`, borderRadius: 6, padding: '2px 8px' }}>
                          {l.category}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Toggle active */}
                  <button
                    className="prof-toggle"
                    onClick={() => toggleListing(l.id, l.is_active)}
                    disabled={togglingId === l.id}
                    style={{ padding: '6px 14px', borderRadius: 8, background: l.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${l.is_active ? 'rgba(34,197,94,0.28)' : 'rgba(87,65,68,0.3)'}`, color: l.is_active ? '#4ade80' : 'var(--text-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s' }}
                  >
                    {togglingId === l.id ? '…' : l.is_active ? 'Active' : 'Paused'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Reviews Received ── */}
      <div className="prof-section" style={{ marginBottom: 28, animationDelay: '0.2s' }}>
        <SectionHeader
          title="Reviews Received"
          count={reviews.length}
          badge={avgRating ? `★ ${avgRating} avg` : undefined}
        />
        {reviews.length === 0 ? (
          <EmptyCard icon="★" text="No reviews yet. Complete a skill trade to start earning them." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reviews.map(r => (
              <div key={r.id} style={{ background: 'rgba(41,28,30,0.4)', border: '1px solid rgba(87,65,68,0.18)', borderRadius: 14, padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: r.comment ? 10 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                      {(r.reviewer?.full_name ?? '?')[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {r.reviewer?.full_name ?? 'Anonymous'}
                      </div>
                      <Stars rating={r.rating} size={13} />
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(r.created_at)}</span>
                </div>
                {r.comment && (
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, marginLeft: 40 }}>
                    "{r.comment}"
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Small Components ──────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    admin:        { label: 'Admin',          color: '#f97316', bg: 'rgba(249,115,22,0.12)'  },
    club_leader:  { label: 'Club Leader',    color: '#e9c176', bg: 'rgba(233,193,118,0.12)' },
    student:      { label: 'Student',        color: '#6b7280', bg: 'rgba(107,114,128,0.1)'  },
  }
  const style = map[role] ?? map.student
  return (
    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', padding: '3px 9px', borderRadius: 9999, background: style.bg, color: style.color, textTransform: 'uppercase' }}>
      {style.label}
    </span>
  )
}

function SectionHeader({ title, count, badge }: { title: string; count: number; badge?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.2px' }}>{title}</h2>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', borderRadius: 9999, padding: '2px 8px' }}>{count}</span>
      {badge && (
        <span style={{ fontSize: 11, fontWeight: 700, color: '#e9c176', background: 'rgba(233,193,118,0.1)', border: '1px solid rgba(233,193,118,0.2)', borderRadius: 9999, padding: '2px 8px' }}>{badge}</span>
      )}
    </div>
  )
}

function EmptyCard({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ padding: '32px 20px', textAlign: 'center', background: 'rgba(41,28,30,0.25)', border: '1px dashed rgba(87,65,68,0.25)', borderRadius: 14 }}>
      <div style={{ fontSize: 24, marginBottom: 10, opacity: 0.4 }}>{icon}</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>{text}</div>
    </div>
  )
}
