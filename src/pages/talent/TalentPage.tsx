import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// ── Types ──────────────────────────────────────────────────────────────────

interface ListingRow {
  id: string
  user_id: string
  title: string
  description: string | null
  skill_offered: string
  skill_wanted: string
  category: string | null
  is_active: boolean
  created_at: string
  profile?: { full_name: string | null; avatar_url: string | null } | null
  university?: { name: string; short_name: string | null } | null
}

interface RequestRow {
  id: string
  listing_id: string
  requester_id: string
  message: string | null
  status: 'pending' | 'accepted' | 'rejected' | 'completed'
  created_at: string
  listing?: ListingRow | null
  requester?: { full_name: string | null; avatar_url: string | null } | null
}

type Tab = 'browse' | 'my-listings' | 'requests'

const CATEGORIES = ['All', 'Tech', 'Design', 'Business', 'Marketing', 'Finance', 'Writing', 'Arts', 'Other']

const CATEGORY_COLORS: Record<string, string> = {
  Tech: '#0ea5e9',
  Design: '#a855f7',
  Business: '#f97316',
  Marketing: '#ec4899',
  Finance: '#22c55e',
  Writing: '#e9c176',
  Arts: '#f43f5e',
  Other: '#6b7280',
}

// ── Helpers ────────────────────────────────────────────────────────────────

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

function Avatar({ name, size = 36 }: { name: string | null | undefined; size?: number }) {
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
        fontSize: size * 0.37,
        fontWeight: 800,
        color: '#fff',
        flexShrink: 0,
        border: '2px solid rgba(255,255,255,0.1)',
      }}
    >
      {letters}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: 'var(--text-muted)',
          marginBottom: 6,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </label>
      {children}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function TalentPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('browse')
  const [listings, setListings] = useState<ListingRow[]>([])
  const [myListings, setMyListings] = useState<ListingRow[]>([])
  const [incoming, setIncoming] = useState<RequestRow[]>([])
  const [outgoing, setOutgoing] = useState<RequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [requestingId, setRequestingId] = useState<string | null>(null)
  const [actionId, setActionId] = useState<string | null>(null)
  const [requestPrompt, setRequestPrompt] = useState<ListingRow | null>(null)
  const [requestMessage, setRequestMessage] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editTarget, setEditTarget] = useState<ListingRow | null>(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    skill_offered: '',
    skill_wanted: '',
    category: 'Tech',
  })
  const [saving, setSaving] = useState(false)

  // ── Fetchers ──

  const fetchListings = useCallback(async () => {
    if (!user) return
    setLoading(true)

    let query = supabase
      .from('skill_listings')
      .select('*, profile:profiles(full_name, avatar_url), university:profiles(university_id)')
      .eq('is_active', true)
      .neq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (search) query = query.ilike('title', `%${search}%`)
    if (activeCategory !== 'All') query = query.eq('category', activeCategory)

    const { data } = await query
    setListings(data ?? [])
    setLoading(false)
  }, [user, search, activeCategory])

  const fetchMyListings = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('skill_listings')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setMyListings(data ?? [])
  }, [user])

  const fetchRequests = useCallback(async () => {
    if (!user) return

    // Incoming: requests on my listings
    const { data: myListingIds } = await supabase
      .from('skill_listings')
      .select('id')
      .eq('user_id', user.id)

    const ids = myListingIds?.map((l) => l.id) ?? []
    if (ids.length > 0) {
      const { data: inc } = await supabase
        .from('skill_requests')
        .select('*, listing:skill_listings(title, skill_offered, skill_wanted), requester:profiles(full_name, avatar_url)')
        .in('listing_id', ids)
        .order('created_at', { ascending: false })
      setIncoming(inc ?? [])
    } else {
      setIncoming([])
    }

    // Outgoing: requests I sent
    const { data: out } = await supabase
      .from('skill_requests')
      .select('*, listing:skill_listings(title, skill_offered, skill_wanted, profile:profiles(full_name))')
      .eq('requester_id', user.id)
      .order('created_at', { ascending: false })
    setOutgoing(out ?? [])
  }, [user])

  useEffect(() => {
    fetchListings()
    fetchMyListings()
    fetchRequests()
  }, [fetchListings, fetchMyListings, fetchRequests])

  // ── Actions ──

  const openRequestPrompt = (listing: ListingRow) => {
    setRequestPrompt(listing)
    setRequestMessage('')
  }

  const handleRequest = async () => {
    if (!user || !requestPrompt || !requestMessage.trim()) return
    setRequestingId(requestPrompt.id)
    await supabase.from('skill_requests').insert({
      listing_id: requestPrompt.id,
      requester_id: user.id,
      message: requestMessage.trim(),
      status: 'pending',
    })
    setRequestingId(null)
    setRequestPrompt(null)
    setRequestMessage('')
    fetchRequests()
  }

  const handleRequestAction = async (requestId: string, status: 'accepted' | 'rejected') => {
    if (actionId) return
    setActionId(requestId)
    await supabase.from('skill_requests').update({ status }).eq('id', requestId)
    setActionId(null)
    fetchRequests()
  }

  const openCreate = () => {
    setEditTarget(null)
    setForm({ title: '', description: '', skill_offered: '', skill_wanted: '', category: 'Tech' })
    setShowModal(true)
  }

  const openEdit = (listing: ListingRow) => {
    setEditTarget(listing)
    setForm({
      title: listing.title,
      description: listing.description ?? '',
      skill_offered: listing.skill_offered,
      skill_wanted: listing.skill_wanted,
      category: listing.category ?? 'Tech',
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!user || !form.title.trim() || !form.skill_offered.trim() || !form.skill_wanted.trim()) return
    setSaving(true)
    const payload = {
      user_id: user.id,
      title: form.title.trim(),
      description: form.description.trim() || null,
      skill_offered: form.skill_offered.trim(),
      skill_wanted: form.skill_wanted.trim(),
      category: form.category,
      is_active: true,
    }
    if (editTarget) {
      await supabase.from('skill_listings').update(payload).eq('id', editTarget.id)
    } else {
      await supabase.from('skill_listings').insert(payload)
    }
    setSaving(false)
    setShowModal(false)
    fetchMyListings()
    fetchListings()
  }

  const handleToggle = async (id: string, isActive: boolean) => {
    await supabase.from('skill_listings').update({ is_active: !isActive }).eq('id', id)
    fetchMyListings()
    fetchListings()
  }

  // Requests already sent by me (to avoid duplicate request buttons)
  const alreadyRequestedIds = new Set(outgoing.map((r) => r.listing_id))

  const pendingIncoming = incoming.filter((r) => r.status === 'pending').length

  return (
    <div style={{ padding: '32px 28px', maxWidth: 1100 }}>
      <style>{`
        @keyframes spinTalent { to { transform: rotate(360deg); } }
        .listing-card:hover { border-color: rgba(138,21,56,0.4) !important; }
        .req-btn:hover:not(:disabled) { background: var(--accent-hover) !important; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--accent)', marginBottom: 6, textTransform: 'uppercase' }}>
            Talent
          </div>
          <h1 style={{ fontSize: 38, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.5px', marginBottom: 8 }}>
            The Skill Souq
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Trade skills, find collaborators, and grow your craft across Qatar's campuses.
          </p>
        </div>
        <button
          onClick={openCreate}
          style={{
            padding: '10px 20px',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 10,
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
            marginTop: 8,
          }}
        >
          + List a Skill
        </button>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(87,65,68,0.3)', marginBottom: 32 }}>
        {([
          { key: 'browse', label: 'Browse' },
          { key: 'my-listings', label: 'My Listings' },
          { key: 'requests', label: `Requests${pendingIncoming > 0 ? ` (${pendingIncoming})` : ''}` },
        ] as { key: Tab; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '10px 22px',
              background: 'transparent',
              border: 'none',
              borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === key ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: 15,
              fontWeight: tab === key ? 600 : 400,
              cursor: 'pointer',
              marginBottom: -1,
              transition: 'color 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── BROWSE ── */}
      {tab === 'browse' && (
        <>
          {/* Search + filters */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 480 }}>
              <svg
                style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}
                width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search skills, titles…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  ...inputStyle,
                  paddingLeft: 40,
                  borderRadius: 9999,
                  background: 'rgba(41,28,30,0.6)',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
            {CATEGORIES.map((cat) => {
              const active = cat === activeCategory
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  style={{
                    padding: '6px 16px',
                    borderRadius: 9999,
                    border: active ? '1px solid var(--accent)' : '1px solid rgba(87,65,68,0.3)',
                    background: active ? 'rgba(138,21,56,0.2)' : 'rgba(41,28,30,0.5)',
                    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {cat.toUpperCase()}
                </button>
              )
            })}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-muted)' }}>
              <div style={{
                width: 32, height: 32, border: '3px solid rgba(87,65,68,0.3)',
                borderTopColor: 'var(--accent)', borderRadius: '50%',
                animation: 'spinTalent 0.8s linear infinite', margin: '0 auto 16px',
              }} />
              Loading the Souq…
            </div>
          ) : listings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 40, marginBottom: 14 }}>🏪</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>No listings found</div>
              <div style={{ fontSize: 13 }}>
                {search ? `No skills match "${search}".` : 'Be the first to list a skill!'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
              {listings.map((l) => {
                const alreadyRequested = alreadyRequestedIds.has(l.id)
                return (
                  <ListingCard
                    key={l.id}
                    listing={l}
                    action={
                      <button
                        className="req-btn"
                        onClick={() => !alreadyRequested && openRequestPrompt(l)}
                        disabled={!!requestingId || alreadyRequested}
                        style={{
                          width: '100%',
                          padding: '9px',
                          background: alreadyRequested ? 'transparent' : 'rgba(52,39,40,0.8)',
                          border: alreadyRequested ? '1px solid var(--accent)' : '1px solid rgba(87,65,68,0.25)',
                          borderRadius: 8,
                          color: alreadyRequested ? 'var(--accent)' : 'var(--text-primary)',
                          fontSize: 13,
                          fontWeight: 500,
                          cursor: alreadyRequested || requestingId ? 'default' : 'pointer',
                          opacity: requestingId === l.id ? 0.6 : 1,
                          transition: 'all 0.15s',
                        }}
                      >
                        {requestingId === l.id ? '…' : alreadyRequested ? 'Requested ✓' : 'Request Trade'}
                      </button>
                    }
                  />
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── MY LISTINGS ── */}
      {tab === 'my-listings' && (
        <>
          {myListings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 40, marginBottom: 14 }}>✨</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>No listings yet</div>
              <div style={{ fontSize: 13, marginBottom: 20 }}>Share what you can offer and what you're looking for.</div>
              <button
                onClick={openCreate}
                style={{
                  padding: '10px 24px',
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: 9999,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                + List a Skill
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
              {myListings.map((l) => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  dimmed={!l.is_active}
                  action={
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => openEdit(l)}
                        style={{
                          flex: 1,
                          padding: '8px',
                          background: 'transparent',
                          border: '1px solid rgba(87,65,68,0.3)',
                          borderRadius: 8,
                          color: 'var(--text-muted)',
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggle(l.id, l.is_active)}
                        style={{
                          flex: 1,
                          padding: '8px',
                          background: l.is_active ? 'transparent' : 'rgba(138,21,56,0.15)',
                          border: l.is_active ? '1px solid rgba(87,65,68,0.3)' : '1px solid var(--accent)',
                          borderRadius: 8,
                          color: l.is_active ? 'var(--text-muted)' : 'var(--accent)',
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                      >
                        {l.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── REQUESTS ── */}
      {tab === 'requests' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
          {/* Incoming */}
          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
              Incoming Requests
              {incoming.length > 0 && (
                <span style={{ marginLeft: 8, fontSize: 12, background: 'var(--accent)', color: '#fff', borderRadius: 9999, padding: '2px 8px', fontWeight: 600 }}>
                  {incoming.length}
                </span>
              )}
            </h2>
            {incoming.length === 0 ? (
              <p style={{ fontSize: 14, color: 'var(--text-muted)', padding: '16px 0' }}>No incoming requests yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {incoming.map((req) => (
                  <RequestRow
                    key={req.id}
                    req={req}
                    mode="incoming"
                    actionId={actionId}
                    onAccept={() => handleRequestAction(req.id, 'accepted')}
                    onReject={() => handleRequestAction(req.id, 'rejected')}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Outgoing */}
          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
              Sent Requests
            </h2>
            {outgoing.length === 0 ? (
              <p style={{ fontSize: 14, color: 'var(--text-muted)', padding: '16px 0' }}>You haven't sent any requests yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {outgoing.map((req) => (
                  <RequestRow key={req.id} req={req} mode="outgoing" actionId={actionId} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── REQUEST PROMPT MODAL ── */}
      {requestPrompt && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setRequestPrompt(null) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div style={{
            width: '100%', maxWidth: 480,
            background: 'var(--bg-card)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 20,
            padding: '28px 32px',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--accent)', textTransform: 'uppercase' }}>
                Trade Request
              </div>
              <button
                onClick={() => setRequestPrompt(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            <h2 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, lineHeight: 1.3 }}>
              {requestPrompt.title}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 22 }}>
              <span style={{ fontSize: 12, color: '#4ade80', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 9999, padding: '3px 10px' }}>
                {requestPrompt.skill_offered}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>⇄</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(138,21,56,0.12)', border: '1px solid rgba(138,21,56,0.3)', borderRadius: 9999, padding: '3px 10px' }}>
                {requestPrompt.skill_wanted}
              </span>
            </div>

            <div style={{ marginBottom: 22 }}>
              <label style={{
                display: 'block', fontSize: 14, fontWeight: 600,
                color: 'var(--text-primary)', marginBottom: 10, lineHeight: 1.5,
              }}>
                What makes you the right fit for this trade?
              </label>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
                Give the listing owner a reason to say yes — share your experience, what you bring to the table, or why this exchange excites you.
              </p>
              <textarea
                autoFocus
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value)}
                placeholder="e.g. I've shipped three React projects and have been looking for someone to level up my design eye — your portfolio immediately stood out…"
                rows={4}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.65 }}
              />
              <div style={{ textAlign: 'right', fontSize: 11, color: requestMessage.length > 400 ? '#f87171' : 'var(--text-muted)', marginTop: 5 }}>
                {requestMessage.length} / 400
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setRequestPrompt(null)}
                style={{
                  flex: 1, padding: '11px',
                  background: 'transparent',
                  border: '1px solid rgba(87,65,68,0.3)',
                  borderRadius: 10, color: 'var(--text-muted)',
                  fontSize: 14, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRequest}
                disabled={!requestMessage.trim() || requestMessage.length > 400 || !!requestingId}
                style={{
                  flex: 2, padding: '11px',
                  background: !requestMessage.trim() || requestMessage.length > 400 || !!requestingId
                    ? 'rgba(138,21,56,0.3)'
                    : 'var(--accent)',
                  border: 'none', borderRadius: 10,
                  color: '#fff', fontSize: 14, fontWeight: 600,
                  cursor: !requestMessage.trim() || !!requestingId ? 'default' : 'pointer',
                  opacity: requestingId === requestPrompt.id ? 0.6 : 1,
                  transition: 'background 0.15s',
                }}
              >
                {requestingId === requestPrompt.id ? 'Sending…' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CREATE / EDIT MODAL ── */}
      {showModal && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div style={{
            width: '100%', maxWidth: 520,
            background: 'var(--bg-card)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 20,
            padding: '28px 32px',
            maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
                {editTarget ? 'Edit Listing' : 'List a Skill'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <Field label="Listing Title *">
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Trade React dev for logo design"
                  style={inputStyle}
                />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Skill I Offer *">
                  <input
                    value={form.skill_offered}
                    onChange={(e) => setForm((f) => ({ ...f, skill_offered: e.target.value }))}
                    placeholder="e.g. React Dev"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Skill I Need *">
                  <input
                    value={form.skill_wanted}
                    onChange={(e) => setForm((f) => ({ ...f, skill_wanted: e.target.value }))}
                    placeholder="e.g. Logo Design"
                    style={inputStyle}
                  />
                </Field>
              </div>

              <Field label="Category">
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>

              <Field label="Description">
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="More detail about the trade, your experience level, timeline…"
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                />
              </Field>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  flex: 1, padding: '11px',
                  background: 'transparent',
                  border: '1px solid rgba(87,65,68,0.3)',
                  borderRadius: 10, color: 'var(--text-muted)',
                  fontSize: 14, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.title.trim() || !form.skill_offered.trim() || !form.skill_wanted.trim()}
                style={{
                  flex: 2, padding: '11px',
                  background: saving || !form.title.trim() || !form.skill_offered.trim() || !form.skill_wanted.trim()
                    ? 'rgba(138,21,56,0.3)'
                    : 'var(--accent)',
                  border: 'none', borderRadius: 10,
                  color: '#fff', fontSize: 14, fontWeight: 600,
                  cursor: saving ? 'default' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                  transition: 'background 0.15s',
                }}
              >
                {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Post Listing'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Listing Card ───────────────────────────────────────────────────────────

function ListingCard({
  listing,
  action,
  dimmed,
}: {
  listing: ListingRow
  action?: React.ReactNode
  dimmed?: boolean
}) {
  const catColor = CATEGORY_COLORS[listing.category ?? ''] ?? 'var(--text-muted)'

  return (
    <div
      className="listing-card"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 18,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        opacity: dimmed ? 0.5 : 1,
        transition: 'border-color 0.2s, opacity 0.2s',
      }}
    >
      {/* Card header */}
      <div style={{
        padding: '18px 20px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(41,28,30,0.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Avatar name={listing.profile?.full_name} size={34} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {listing.profile?.full_name ?? 'Someone'}
            </div>
          </div>
          {listing.category && (
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              color: catColor,
              background: `${catColor}18`,
              border: `1px solid ${catColor}40`,
              borderRadius: 6,
              padding: '3px 8px',
              flexShrink: 0,
            }}>
              {listing.category.toUpperCase()}
            </span>
          )}
        </div>

        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.35, marginBottom: 2 }}>
          {listing.title}
        </div>
      </div>

      {/* Skill exchange */}
      <div style={{ padding: '14px 20px', display: 'flex', gap: 0, alignItems: 'stretch' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase' }}>
            Offers
          </div>
          <div style={{
            display: 'inline-block',
            padding: '5px 12px',
            background: 'rgba(34,197,94,0.1)',
            border: '1px solid rgba(34,197,94,0.25)',
            borderRadius: 9999,
            fontSize: 13,
            fontWeight: 600,
            color: '#4ade80',
          }}>
            {listing.skill_offered}
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', padding: '0 12px',
          color: 'var(--text-muted)', fontSize: 16,
        }}>
          ⇄
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 5, textTransform: 'uppercase' }}>
            Seeks
          </div>
          <div style={{
            display: 'inline-block',
            padding: '5px 12px',
            background: 'rgba(138,21,56,0.12)',
            border: '1px solid rgba(138,21,56,0.3)',
            borderRadius: 9999,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-secondary)',
          }}>
            {listing.skill_wanted}
          </div>
        </div>
      </div>

      {/* Description */}
      {listing.description && (
        <div style={{
          padding: '0 20px 14px',
          fontSize: 13,
          color: 'var(--text-muted)',
          lineHeight: 1.55,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {listing.description}
        </div>
      )}

      {/* Action */}
      {action && (
        <div style={{ padding: '0 20px 18px', marginTop: 'auto' }}>
          {action}
        </div>
      )}
    </div>
  )
}

// ── Request Row ────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pending:   { bg: 'rgba(233,193,118,0.12)', color: 'var(--gold)',    label: 'Pending'   },
  accepted:  { bg: 'rgba(34,197,94,0.12)',   color: '#4ade80',        label: 'Accepted'  },
  rejected:  { bg: 'rgba(239,68,68,0.12)',   color: '#f87171',        label: 'Rejected'  },
  completed: { bg: 'rgba(99,102,241,0.12)',  color: '#a5b4fc',        label: 'Completed' },
}

function RequestRow({
  req,
  mode,
  actionId,
  onAccept,
  onReject,
}: {
  req: RequestRow
  mode: 'incoming' | 'outgoing'
  actionId: string | null
  onAccept?: () => void
  onReject?: () => void
}) {
  const style = STATUS_STYLES[req.status] ?? STATUS_STYLES.pending
  const busy = actionId === req.id

  const listingTitle = (req.listing as ListingRow | null | undefined)?.title ?? '—'
  const skillOffered = (req.listing as ListingRow | null | undefined)?.skill_offered
  const skillWanted = (req.listing as ListingRow | null | undefined)?.skill_wanted
  const personName = mode === 'incoming'
    ? (req.requester as { full_name: string | null } | null | undefined)?.full_name ?? 'Someone'
    : ((req.listing as { profile?: { full_name: string | null } | null } | null | undefined)?.profile?.full_name ?? 'Someone')

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12,
      padding: '14px 18px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      flexWrap: 'wrap',
    }}>
      <Avatar name={mode === 'incoming' ? personName : undefined} size={36} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
          {mode === 'incoming' ? personName : listingTitle}
        </div>
        {mode === 'incoming' && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: req.message ? 8 : 0 }}>
            on listing: <span style={{ color: 'var(--text-secondary)' }}>{listingTitle}</span>
          </div>
        )}
        {mode === 'incoming' && req.message && (
          <div style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            lineHeight: 1.55,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderLeft: '3px solid var(--accent)',
            borderRadius: 8,
            padding: '9px 12px',
            marginTop: 4,
          }}>
            {req.message}
          </div>
        )}
        {mode === 'outgoing' && skillOffered && skillWanted && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            <span style={{ color: '#4ade80' }}>{skillOffered}</span>
            <span style={{ margin: '0 6px', opacity: 0.5 }}>⇄</span>
            <span style={{ color: 'var(--text-secondary)' }}>{skillWanted}</span>
          </div>
        )}
      </div>

      {/* Status badge */}
      <span style={{
        padding: '4px 12px',
        borderRadius: 9999,
        background: style.bg,
        color: style.color,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.06em',
        flexShrink: 0,
      }}>
        {style.label.toUpperCase()}
      </span>

      {/* Incoming actions */}
      {mode === 'incoming' && req.status === 'pending' && (
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={onReject}
            disabled={busy}
            style={{
              padding: '6px 14px',
              background: 'transparent',
              border: '1px solid rgba(87,65,68,0.3)',
              borderRadius: 7,
              color: 'var(--text-muted)',
              fontSize: 12,
              fontWeight: 500,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.5 : 1,
            }}
          >
            Decline
          </button>
          <button
            onClick={onAccept}
            disabled={busy}
            style={{
              padding: '6px 14px',
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 7,
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.5 : 1,
            }}
          >
            Accept
          </button>
        </div>
      )}
    </div>
  )
}
