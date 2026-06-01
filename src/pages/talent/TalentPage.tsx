import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { filterText, validateImage } from '../../lib/contentFilter'

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
  end_requested_by: string | null
  created_at: string
  listing?: ListingRow | null
  requester?: { full_name: string | null; avatar_url: string | null } | null
}

interface TradeMessage {
  id: string
  request_id: string
  sender_id: string
  content: string
  media_url: string | null
  media_type: 'image' | 'video' | 'file' | null
  created_at: string
  profile?: { full_name: string | null } | null
}

type Pt = { x: number; y: number }
type WBTool = 'pen' | 'marker' | 'highlighter' | 'eraser' | 'line' | 'rect' | 'circle' | 'arrow' | 'laser' | 'text'

interface Stroke {
  id: string
  points: Pt[]
  color: string
  width: number
  tool: WBTool
}

interface ReviewRow {
  id: string
  request_id: string
  reviewer_id: string
  reviewee_id: string
  rating: number
  comment: string | null
  created_at: string
  profile?: { full_name: string | null } | null
}

type Tab = 'browse' | 'my-listings' | 'requests' | 'ongoing-trades'

const CATEGORIES = ['All', 'Tech', 'Design', 'Business', 'Marketing', 'Finance', 'Writing', 'Arts', 'Other']

const CATEGORY_COLORS: Record<string, string> = {
  Tech: '#0ea5e9', Design: '#a855f7', Business: '#f97316',
  Marketing: '#ec4899', Finance: '#22c55e', Writing: '#e9c176',
  Arts: '#f43f5e', Other: '#6b7280',
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

function getLastRead(requestId: string): string {
  return localStorage.getItem(`lastRead_${requestId}`) ?? '1970-01-01'
}
function markRead(requestId: string) {
  localStorage.setItem(`lastRead_${requestId}`, new Date().toISOString())
}

function Avatar({ name, size = 36, onClick }: { name?: string | null; size?: number; onClick?: () => void }) {
  const letters = (name ?? '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div onClick={onClick} style={{
      width: size, height: size, borderRadius: '50%', background: 'var(--accent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.37, fontWeight: 800, color: '#fff', flexShrink: 0,
      border: '2px solid rgba(255,255,255,0.1)',
      cursor: onClick ? 'pointer' : 'default',
    }}>
      {letters}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
        color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase',
      }}>{label}</label>
      {children}
    </div>
  )
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0)
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
          style={{ fontSize: 30, cursor: 'pointer', lineHeight: 1,
            color: n <= (hover || value) ? '#e9c176' : 'rgba(255,255,255,0.12)',
            transition: 'color 0.1s' }}>★</span>
      ))}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function TalentPage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
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
  const [form, setForm] = useState({ title: '', description: '', skill_offered: '', skill_wanted: '', category: 'Tech' })
  const [saving, setSaving] = useState(false)
  const [listingError, setListingError] = useState('')
  const [requestError, setRequestError] = useState('')
  const [ratingError, setRatingError] = useState('')

  // Collaboration state
  const [chatTrade, setChatTrade] = useState<RequestRow | null>(null)
  const [ratingTrade, setRatingTrade] = useState<RequestRow | null>(null)
  const [ratingValue, setRatingValue] = useState(5)
  const [ratingComment, setRatingComment] = useState('')
  const [submittingRating, setSubmittingRating] = useState(false)
  const [myReviews, setMyReviews] = useState<ReviewRow[]>([])

  const [unreadCount, setUnreadCount] = useState(0)

  // ── Fetchers ──

  const fetchListings = useCallback(async () => {
    if (!user) return
    setLoading(true)
    let query = supabase
      .from('skill_listings')
      .select('*, profile:profiles(full_name, avatar_url)')
      .eq('is_active', true).neq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (search) query = query.ilike('title', `%${search}%`)
    if (activeCategory !== 'All') query = query.eq('category', activeCategory)
    const { data } = await query
    setListings(data ?? [])
    setLoading(false)
  }, [user, search, activeCategory])

  const fetchMyListings = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('skill_listings').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    setMyListings(data ?? [])
  }, [user])

  const fetchRequests = useCallback(async () => {
    if (!user) return
    const { data: myListingIds } = await supabase.from('skill_listings').select('id').eq('user_id', user.id)
    const ids = myListingIds?.map(l => l.id) ?? []
    if (ids.length > 0) {
      const { data: inc } = await supabase
        .from('skill_requests')
        .select('*, end_requested_by, listing:skill_listings(*, profile:profiles(full_name, avatar_url)), requester:profiles(full_name, avatar_url)')
        .in('listing_id', ids).order('created_at', { ascending: false })
      setIncoming((inc as unknown as RequestRow[]) ?? [])
    } else {
      setIncoming([])
    }
    const { data: out } = await supabase
      .from('skill_requests')
      .select('*, end_requested_by, listing:skill_listings(*, profile:profiles(full_name, avatar_url))')
      .eq('requester_id', user.id).order('created_at', { ascending: false })
    setOutgoing((out as unknown as RequestRow[]) ?? [])
  }, [user])

  const fetchMyReviews = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('skill_trade_reviews').select('*').eq('reviewer_id', user.id)
    setMyReviews((data as ReviewRow[]) ?? [])
  }, [user])

  const computeUnread = useCallback(async (inc: RequestRow[], out: RequestRow[]) => {
    if (!user) return
    const accepted = [...inc, ...out].filter(r => r.status === 'accepted')
    if (!accepted.length) { setUnreadCount(0); return }
    let total = 0
    for (const t of accepted) {
      const { count } = await supabase
        .from('skill_trade_messages').select('id', { count: 'exact', head: true })
        .eq('request_id', t.id).neq('sender_id', user.id).gt('created_at', getLastRead(t.id))
      total += count ?? 0
    }
    setUnreadCount(total)
  }, [user])

  useEffect(() => { fetchListings(); fetchMyListings(); fetchRequests(); fetchMyReviews() }, [fetchListings, fetchMyListings, fetchRequests, fetchMyReviews])
  useEffect(() => { computeUnread(incoming, outgoing) }, [incoming, outgoing, computeUnread])

  // Realtime: patch scalar fields only — preserve joined listing/requester objects
  useEffect(() => {
    if (!user) return
    const ch = supabase.channel(`talent-requests-rt-${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'skill_requests' }, payload => {
        const p = payload.new as { id: string; status: string; end_requested_by: string | null }
        const patch = (r: RequestRow): RequestRow =>
          r.id === p.id
            ? { ...r, status: p.status as RequestRow['status'], end_requested_by: p.end_requested_by }
            : r
        setIncoming(prev => prev.map(patch))
        setOutgoing(prev => prev.map(patch))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user])

  // ── Actions ──

  const handleRequest = async () => {
    if (!user || !requestPrompt || !requestMessage.trim()) return
    const check = filterText(requestMessage)
    if (!check.ok) { setRequestError(check.reason!); return }
    setRequestError('')
    setRequestingId(requestPrompt.id)
    await supabase.from('skill_requests').insert({ listing_id: requestPrompt.id, requester_id: user.id, message: requestMessage.trim(), status: 'pending' })
    setRequestingId(null); setRequestPrompt(null); setRequestMessage('')
    fetchRequests()
  }

  const handleRequestAction = async (requestId: string, status: 'accepted' | 'rejected') => {
    if (actionId) return
    setActionId(requestId)
    await supabase.from('skill_requests').update({ status }).eq('id', requestId)
    setActionId(null); fetchRequests()
  }

  const handleRequestEnd = async (tradeId: string, partnerId: string, listingTitle: string) => {
    if (!user) return
    await supabase.from('skill_requests').update({ end_requested_by: user.id }).eq('id', tradeId)
    setIncoming(prev => prev.map(r => r.id === tradeId ? { ...r, end_requested_by: user.id } : r))
    setOutgoing(prev => prev.map(r => r.id === tradeId ? { ...r, end_requested_by: user.id } : r))
    const myName = profile?.full_name ?? 'Your trade partner'
    await supabase.from('notifications').insert({
      user_id: partnerId,
      type: 'end_trade_request',
      title: 'Trade End Requested',
      body: `${myName} wants to end the trade on "${listingTitle}". Open Ongoing Trades to respond.`,
      link: '/talent',
    })
  }

  const handleCancelEnd = async (tradeId: string) => {
    await supabase.from('skill_requests').update({ end_requested_by: null }).eq('id', tradeId)
    setIncoming(prev => prev.map(r => r.id === tradeId ? { ...r, end_requested_by: null } : r))
    setOutgoing(prev => prev.map(r => r.id === tradeId ? { ...r, end_requested_by: null } : r))
  }

  const handleConfirmEnd = async (trade: RequestRow) => {
    await supabase.from('skill_requests').update({ status: 'completed', end_requested_by: null }).eq('id', trade.id)
    // notify the person who originally requested the end
    if (trade.end_requested_by && trade.end_requested_by !== user?.id) {
      const listing = trade.listing as ListingRow | null
      const myName = profile?.full_name ?? 'Your trade partner'
      await supabase.from('notifications').insert({
        user_id: trade.end_requested_by,
        type: 'end_trade_request',
        title: 'Trade Ended',
        body: `${myName} agreed to end the trade on "${listing?.title ?? 'your listing'}". The trade is now complete.`,
        link: '/talent',
      })
    }
    await fetchRequests()
    setRatingValue(5); setRatingComment(''); setRatingTrade({ ...trade, status: 'completed' })
  }

  const handleMarkComplete = async (requestId: string) => {
    await supabase.from('skill_requests').update({ status: 'completed' }).eq('id', requestId)
    setChatTrade(null)
    await fetchRequests()
    const req = [...incoming, ...outgoing].find(r => r.id === requestId)
    if (req) { setRatingValue(5); setRatingComment(''); setRatingTrade({ ...req, status: 'completed' }) }
  }

  const submitRating = async () => {
    if (!user || !ratingTrade) return
    const check = filterText(ratingComment)
    if (!check.ok) { setRatingError(check.reason!); return }
    setRatingError('')
    setSubmittingRating(true)
    const revieweeId = ratingTrade.requester_id === user.id
      ? (ratingTrade.listing as ListingRow)?.user_id
      : ratingTrade.requester_id
    if (revieweeId) {
      await supabase.from('skill_trade_reviews').insert({
        request_id: ratingTrade.id, reviewer_id: user.id, reviewee_id: revieweeId,
        rating: ratingValue, comment: ratingComment.trim() || null,
      })
    }
    setSubmittingRating(false); setRatingTrade(null); fetchMyReviews()
  }

  const handleSave = async () => {
    if (!user || !form.title.trim() || !form.skill_offered.trim() || !form.skill_wanted.trim()) return
    const check = filterText(form.title, form.description, form.skill_offered, form.skill_wanted)
    if (!check.ok) { setListingError(check.reason!); return }
    setListingError('')
    setSaving(true)
    const payload = { user_id: user.id, title: form.title.trim(), description: form.description.trim() || null, skill_offered: form.skill_offered.trim(), skill_wanted: form.skill_wanted.trim(), category: form.category, is_active: true }
    if (editTarget) await supabase.from('skill_listings').update(payload).eq('id', editTarget.id)
    else await supabase.from('skill_listings').insert(payload)
    setSaving(false); setShowModal(false); fetchMyListings(); fetchListings()
  }

  const handleToggle = async (id: string, isActive: boolean) => {
    await supabase.from('skill_listings').update({ is_active: !isActive }).eq('id', id)
    fetchMyListings(); fetchListings()
  }

  const openCreate = () => { setEditTarget(null); setForm({ title: '', description: '', skill_offered: '', skill_wanted: '', category: 'Tech' }); setShowModal(true) }
  const openEdit = (l: ListingRow) => { setEditTarget(l); setForm({ title: l.title, description: l.description ?? '', skill_offered: l.skill_offered, skill_wanted: l.skill_wanted, category: l.category ?? 'Tech' }); setShowModal(true) }

  const alreadyRequestedIds = new Set(outgoing.map(r => r.listing_id))
  const pendingIncoming = incoming.filter(r => r.status === 'pending').length
  const reviewedIds = new Set(myReviews.map(r => r.request_id))

  const requestsBadge = pendingIncoming > 0 ? { label: String(pendingIncoming), color: 'var(--accent)' }
    : unreadCount > 0 ? { label: '●', color: '#ef4444' } : null

  const activeTrades = [...incoming, ...outgoing].filter(r => r.status === 'accepted')

  return (
    <div className="page-content" style={{ maxWidth: 1100 }}>
      <style>{`
        @keyframes spinTalent { to { transform: rotate(360deg); } }
        @keyframes tp-up { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes tp-pop { from { opacity:0; transform:translateY(10px) scale(0.99); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes tp-shimmer { from { background-position:-700px 0; } to { background-position:700px 0; } }
        .tp-0 { animation: tp-up 0.5s cubic-bezier(0.22,1,0.36,1) both; }
        .tp-1 { animation: tp-up 0.5s cubic-bezier(0.22,1,0.36,1) 0.08s both; }
        .tp-2 { animation: tp-up 0.5s cubic-bezier(0.22,1,0.36,1) 0.15s both; }
        .tp-panel { animation: tp-pop 0.3s cubic-bezier(0.22,1,0.36,1) both; }
        .tp-shimmer { background: linear-gradient(90deg, rgba(41,28,30,0.6) 25%, rgba(72,46,54,0.85) 50%, rgba(41,28,30,0.6) 75%); background-size:700px 100%; animation:tp-shimmer 1.4s ease-in-out infinite; border-radius:8px; }
        .listing-card:hover { border-color: rgba(138,21,56,0.55) !important; box-shadow: 0 8px 32px rgba(0,0,0,0.3) !important; transform: translateY(-2px); }
        .listing-card { transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s !important; }
        .req-btn:hover:not(:disabled) { background: var(--accent) !important; color: #fff !important; border-color: var(--accent) !important; }
        .action-btn:hover:not(:disabled) { opacity: 0.85; }
        .tp-tabs { display: flex; gap: 2px; background: rgba(0,0,0,0.3); border-radius: 12px; padding: 4px; border: 1px solid rgba(87,65,68,0.2); width: 100%; box-sizing: border-box; }
        .tp-tab-btn { white-space: nowrap; }
        .tp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: 20px; }
        @media (max-width: 640px) {
          .tp-tabs { flex-wrap: wrap; }
          .tp-tab-btn { flex: 1 1 calc(50% - 2px); min-width: 0; padding: 8px 8px !important; font-size: 11px !important; justify-content: center; }
          .tp-tab-btn span:first-child { display: none; }
          .tp-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
        <div className="tp-0">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 8px var(--accent-glow)' }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--accent)', textTransform: 'uppercase' }}>Skill Souq</span>
          </div>
          <h1 style={{ fontSize: 'clamp(20px, 5vw, 32px)', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px', lineHeight: 1.1 }}>Trade Skills. Grow Together.</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>Offer what you know. Get what you need. No money required.</p>
        </div>
        <button className="tp-1" onClick={openCreate} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '11px 22px', background: 'var(--accent)', border: 'none', borderRadius: 10,
          color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
          boxShadow: '0 4px 20px rgba(138,21,56,0.45)',
        }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> List a Skill
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="tp-2 tp-tabs" style={{ marginBottom: 32 }}>
        {([
          { key: 'browse' as Tab, label: 'Browse', icon: '⊞' },
          { key: 'my-listings' as Tab, label: 'My Listings', icon: '◫', count: myListings.length },
          { key: 'requests' as Tab, label: 'Requests', icon: '⟳' },
          { key: 'ongoing-trades' as Tab, label: 'Ongoing Trades', icon: '⇄', count: activeTrades.length },
        ] as { key: Tab; label: string; icon: string; count?: number }[]).map(({ key, label, icon, count }) => (
          <button key={key} className="tp-tab-btn" onClick={() => setTab(key)} style={{
            padding: '8px 20px', background: tab === key ? 'var(--bg-card)' : 'transparent',
            border: tab === key ? '1px solid rgba(87,65,68,0.35)' : '1px solid transparent',
            borderRadius: 9, color: tab === key ? 'var(--text-primary)' : 'var(--text-muted)',
            fontSize: 13, fontWeight: tab === key ? 700 : 500, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 7,
            boxShadow: tab === key ? '0 1px 8px rgba(0,0,0,0.3)' : 'none',
            transition: 'all 0.15s', fontFamily: 'inherit',
          }}>
            <span style={{ fontSize: 14, opacity: tab === key ? 1 : 0.5 }}>{icon}</span>
            {label}
            {key === 'requests' && requestsBadge && (
              <span style={{ fontSize: 10, background: requestsBadge.color, color: '#fff', borderRadius: 9999, padding: '1px 8px', fontWeight: 800, lineHeight: 1.6 }}>
                {requestsBadge.label}
              </span>
            )}
            {key === 'my-listings' && count !== undefined && count > 0 && (
              <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)', borderRadius: 9999, padding: '1px 7px', fontWeight: 700, lineHeight: 1.6 }}>
                {count}
              </span>
            )}
            {key === 'ongoing-trades' && count !== undefined && count > 0 && (
              <span style={{ fontSize: 10, background: 'rgba(34,197,94,0.2)', color: '#4ade80', borderRadius: 9999, padding: '1px 7px', fontWeight: 700, lineHeight: 1.6, border: '1px solid rgba(34,197,94,0.3)' }}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── BROWSE ── */}
      {tab === 'browse' && (
        <div className="tp-panel">
          {/* Search + filters */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ position: 'relative' }}>
              <svg style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', opacity: 0.35, pointerEvents: 'none' }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input type="text" placeholder="Search by skill, title, or keyword…" value={search} onChange={e => setSearch(e.target.value)}
                style={{ ...inputStyle, paddingLeft: 40, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(87,65,68,0.2)', borderRadius: 9 }} />
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setActiveCategory(cat)} style={{
                  padding: '5px 14px', borderRadius: 9999, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
                  cursor: 'pointer', transition: 'all 0.12s', border: 'none',
                  background: cat === activeCategory ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                  color: cat === activeCategory ? '#fff' : 'var(--text-muted)',
                  boxShadow: cat === activeCategory ? '0 2px 12px rgba(138,21,56,0.4)' : 'none',
                }}>{cat}</button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="tp-grid">
              {[0,1,2,3,4,5].map(i => (
                <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', animationDelay: `${i * 0.05}s` }}>
                  <div className="tp-shimmer" style={{ height: 4, borderRadius: 0 }} />
                  <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className="tp-shimmer" style={{ width: 56, height: 11, borderRadius: 6 }} />
                      <div className="tp-shimmer" style={{ width: 26, height: 26, borderRadius: '50%' }} />
                    </div>
                    <div className="tp-shimmer" style={{ width: '75%', height: 17, borderRadius: 7 }} />
                    <div className="tp-shimmer" style={{ height: 58, borderRadius: 10 }} />
                    <div className="tp-shimmer" style={{ width: '55%', height: 12, borderRadius: 6 }} />
                  </div>
                  <div style={{ padding: '0 18px 16px' }}>
                    <div className="tp-shimmer" style={{ height: 36, borderRadius: 9 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : listings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 20px' }}>🏪</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>No listings found</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>{search ? `Nothing matches "${search}" — try a different keyword.` : 'Be the first to post a skill trade!'}</div>
              {!search && <button onClick={openCreate} style={{ padding: '10px 24px', background: 'var(--accent)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>+ List a Skill</button>}
            </div>
          ) : (
            <div className="tp-grid">
              {listings.map((l, i) => {
                const already = alreadyRequestedIds.has(l.id)
                return (
                  <ListingCard key={l.id} listing={l} index={i} onViewUser={() => navigate(`/profile/${l.user_id}`)} action={
                    <button className="req-btn" onClick={() => !already && setRequestPrompt(l)} disabled={!!requestingId || already}
                      style={{ width: '100%', padding: '10px', background: already ? 'rgba(138,21,56,0.08)' : 'rgba(138,21,56,0.12)', border: '1px solid rgba(138,21,56,0.3)', borderRadius: 9, color: already ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: already || requestingId ? 'default' : 'pointer', opacity: requestingId === l.id ? 0.6 : 1, transition: 'all 0.15s' }}>
                      {requestingId === l.id ? 'Sending…' : already ? '✓ Requested' : 'Request Trade'}
                    </button>
                  } />
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MY LISTINGS ── */}
      {tab === 'my-listings' && (
        <div className="tp-panel">
          {myListings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 20px' }}>✨</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>No listings yet</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>Share what you can offer, and what skill you're looking for in return.</div>
              <button onClick={openCreate} style={{ padding: '10px 24px', background: 'var(--accent)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>+ Create Your First Listing</button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}><span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{myListings.filter(l => l.is_active).length}</span> active · <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{myListings.filter(l => !l.is_active).length}</span> paused</div>
              </div>
              <div className="tp-grid">
                {myListings.map((l, i) => (
                  <ListingCard key={l.id} listing={l} index={i} dimmed={!l.is_active} action={
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => openEdit(l)} style={{ flex: 1, padding: '9px', background: 'transparent', border: '1px solid rgba(87,65,68,0.35)', borderRadius: 9, color: 'var(--text-muted)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Edit</button>
                      <button onClick={() => handleToggle(l.id, l.is_active)} style={{ flex: 1, padding: '9px', background: l.is_active ? 'transparent' : 'rgba(138,21,56,0.12)', border: l.is_active ? '1px solid rgba(87,65,68,0.35)' : '1px solid var(--accent)', borderRadius: 9, color: l.is_active ? 'var(--text-muted)' : 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        {l.is_active ? 'Pause' : 'Activate'}
                      </button>
                    </div>
                  } />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── REQUESTS ── */}
      {tab === 'requests' && (
        <div className="tp-panel" style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Incoming Requests</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>People who want to trade with you</div>
              </div>
              {incoming.length > 0 && <span style={{ fontSize: 11, background: 'var(--accent)', color: '#fff', borderRadius: 9999, padding: '3px 10px', fontWeight: 800 }}>{incoming.length}</span>}
            </div>
            {incoming.length === 0
              ? <div style={{ padding: '28px 24px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No incoming requests yet — share your listings to attract trade partners.</div>
                </div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {incoming.map((req, i) => (
                    <ReqCard key={req.id} req={req} index={i} mode="incoming" currentUserId={user?.id ?? ''} actionId={actionId} hasReviewed={reviewedIds.has(req.id)}
                      onAccept={() => handleRequestAction(req.id, 'accepted')}
                      onReject={() => handleRequestAction(req.id, 'rejected')}
                      onOpenChat={() => req.status === 'accepted' && setChatTrade(req)}
                      onLeaveReview={() => { setRatingValue(5); setRatingComment(''); setRatingTrade(req) }}
                      onViewUser={uid => navigate(`/profile/${uid}`)}
                    />
                  ))}
                </div>
            }
          </section>
          <section>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Sent Requests</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Trades you've initiated</div>
            </div>
            {outgoing.length === 0
              ? <div style={{ padding: '28px 24px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>You haven't sent any requests yet. Browse listings and find a skill to trade for.</div>
                </div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {outgoing.map((req, i) => (
                    <ReqCard key={req.id} req={req} index={i} mode="outgoing" currentUserId={user?.id ?? ''} actionId={actionId} hasReviewed={reviewedIds.has(req.id)}
                      onOpenChat={() => req.status === 'accepted' && setChatTrade(req)}
                      onLeaveReview={() => { setRatingValue(5); setRatingComment(''); setRatingTrade(req) }}
                      onViewUser={uid => navigate(`/profile/${uid}`)}
                    />
                  ))}
                </div>
            }
          </section>
        </div>
      )}

      {/* ── ONGOING TRADES ── */}
      {tab === 'ongoing-trades' && (
        <div className="tp-panel">
          {activeTrades.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 20px' }}>⇄</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>No active trades</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>Once a request is accepted on either side, the trade will appear here.</div>
              <button onClick={() => setTab('browse')} style={{ padding: '10px 24px', background: 'var(--accent)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Browse Skills</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 8px rgba(74,222,128,0.6)' }} />
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}><span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{activeTrades.length}</span> active trade{activeTrades.length !== 1 ? 's' : ''} in progress</span>
              </div>
              {activeTrades.map((trade, i) => {
                const listing = trade.listing as ListingRow | null
                const isRequester = trade.requester_id === user?.id
                const partnerName = isRequester
                  ? (listing?.profile?.full_name ?? 'Partner')
                  : (trade.requester?.full_name ?? 'Partner')
                const partnerId = isRequester ? (listing?.user_id ?? '') : trade.requester_id
                const mySkill = isRequester ? listing?.skill_wanted : listing?.skill_offered
                const theirSkill = isRequester ? listing?.skill_offered : listing?.skill_wanted
                const iAskedToEnd = trade.end_requested_by === user?.id
                const partnerAskedToEnd = !!trade.end_requested_by && trade.end_requested_by !== user?.id
                const endPending = !!trade.end_requested_by
                const borderColor = endPending ? 'rgba(251,146,60,0.35)' : 'rgba(34,197,94,0.2)'
                return (
                  <div key={trade.id} style={{
                    background: 'var(--bg-card)', border: `1px solid ${borderColor}`,
                    borderRadius: 16, padding: '20px 22px',
                    animation: `tp-up 0.4s cubic-bezier(0.22,1,0.36,1) ${i * 0.05}s both`,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                    transition: 'border-color 0.3s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                        <div onClick={() => partnerId && navigate(`/profile/${partnerId}`)} style={{ position: 'relative', flexShrink: 0, cursor: partnerId ? 'pointer' : 'default' }}>
                          <Avatar name={partnerName} size={44} />
                          <div style={{ position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, borderRadius: '50%', background: '#4ade80', border: '2px solid var(--bg-card)', boxShadow: '0 0 6px rgba(74,222,128,0.5)' }} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div onClick={() => partnerId && navigate(`/profile/${partnerId}`)} style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2, cursor: partnerId ? 'pointer' : 'default' }}>{partnerName}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {listing?.title ?? 'Skill Trade'}
                          </div>
                        </div>
                      </div>
                      {endPending ? (
                        <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(251,146,60,0.15)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.3)', borderRadius: 9999, padding: '4px 10px', flexShrink: 0 }}>
                          Ending…
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 9999, padding: '4px 10px', flexShrink: 0 }}>
                          Active
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0', background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '10px 14px' }}>
                      <div style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>You bring</div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#4ade80', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 9999, padding: '4px 12px' }}>
                          {mySkill ?? '—'}
                        </span>
                      </div>
                      <div style={{ fontSize: 16, color: 'var(--text-muted)', opacity: 0.5, flexShrink: 0 }}>⇄</div>
                      <div style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>They bring</div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', background: 'rgba(138,21,56,0.12)', border: '1px solid rgba(138,21,56,0.3)', borderRadius: 9999, padding: '4px 12px' }}>
                          {theirSkill ?? '—'}
                        </span>
                      </div>
                    </div>

                    {/* End-trade banner — shown when one side has requested to end */}
                    {iAskedToEnd && (
                      <div style={{ background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ fontSize: 12, color: '#fb923c' }}>
                          <strong>You requested to end this trade.</strong> Waiting for {partnerName} to confirm.
                        </div>
                        <button
                          onClick={() => handleCancelEnd(trade.id)}
                          style={{ flexShrink: 0, padding: '5px 12px', background: 'transparent', border: '1px solid rgba(251,146,60,0.4)', borderRadius: 7, color: '#fb923c', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                    {partnerAskedToEnd && (
                      <div style={{ background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
                        <div style={{ fontSize: 12, color: '#fb923c', marginBottom: 10 }}>
                          <strong>{partnerName} wants to end this trade.</strong> Do you agree?
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => handleCancelEnd(trade.id)}
                            style={{ flex: 1, padding: '7px', background: 'transparent', border: '1px solid rgba(87,65,68,0.35)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                          >
                            Decline
                          </button>
                          <button
                            onClick={() => handleConfirmEnd(trade)}
                            style={{ flex: 2, padding: '7px', background: 'rgba(251,146,60,0.2)', border: '1px solid rgba(251,146,60,0.45)', borderRadius: 8, color: '#fb923c', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                          >
                            Yes, End Trade
                          </button>
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => setChatTrade(trade)}
                        style={{
                          flex: 1, padding: '10px', background: 'rgba(138,21,56,0.12)',
                          border: '1px solid rgba(138,21,56,0.3)', borderRadius: 9,
                          color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600,
                          cursor: 'pointer', transition: 'all 0.15s', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', gap: 7,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'var(--accent)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(138,21,56,0.12)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'rgba(138,21,56,0.3)' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                        Open Chat
                      </button>
                      {!endPending && (
                        <button
                          onClick={() => {
                            const listing = trade.listing as ListingRow | null
                            const isReq = trade.requester_id === user?.id
                            const partnerId = isReq ? (listing?.user_id ?? '') : trade.requester_id
                            handleRequestEnd(trade.id, partnerId, listing?.title ?? 'this trade')
                          }}
                          style={{
                            padding: '10px 14px', background: 'transparent',
                            border: '1px solid rgba(87,65,68,0.35)', borderRadius: 9,
                            color: 'var(--text-muted)', fontSize: 12, fontWeight: 600,
                            cursor: 'pointer', transition: 'all 0.15s', display: 'flex',
                            alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(251,146,60,0.5)'; e.currentTarget.style.color = '#fb923c'; e.currentTarget.style.background = 'rgba(251,146,60,0.08)' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(87,65,68,0.35)'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}
                          title="Request to end trade (partner must confirm)"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                          End Trade
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* REQUEST PROMPT MODAL */}
      {requestPrompt && (
        <div onClick={e => { if (e.target === e.currentTarget) setRequestPrompt(null) }} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: '100%', maxWidth: 480, background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 'clamp(18px, 4vw, 28px) clamp(16px, 4vw, 32px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--accent)', textTransform: 'uppercase' }}>Trade Request</div>
              <button onClick={() => setRequestPrompt(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <h2 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6, lineHeight: 1.3 }}>{requestPrompt.title}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 22 }}>
              <span style={{ fontSize: 12, color: '#4ade80', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 9999, padding: '3px 10px' }}>{requestPrompt.skill_offered}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>⇄</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'rgba(138,21,56,0.12)', border: '1px solid rgba(138,21,56,0.3)', borderRadius: 9999, padding: '3px 10px' }}>{requestPrompt.skill_wanted}</span>
            </div>
            <div style={{ marginBottom: 22 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10, lineHeight: 1.5 }}>What makes you the right fit for this trade?</label>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>Give the listing owner a reason to say yes — share your experience, what you bring to the table, or why this exchange excites you.</p>
              <textarea autoFocus value={requestMessage} onChange={e => setRequestMessage(e.target.value)} placeholder="e.g. I've shipped three React projects and have been looking for someone to level up my design eye…" rows={4} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.65 }} />
              <div style={{ textAlign: 'right', fontSize: 11, color: requestMessage.length > 400 ? '#f87171' : 'var(--text-muted)', marginTop: 5 }}>{requestMessage.length} / 400</div>
            </div>
            {requestError && <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>{requestError}</div>}
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => { setRequestPrompt(null); setRequestError('') }} style={{ flex: 1, padding: '11px', background: 'transparent', border: '1px solid rgba(87,65,68,0.3)', borderRadius: 10, color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleRequest} disabled={!requestMessage.trim() || requestMessage.length > 400 || !!requestingId}
                style={{ flex: 2, padding: '11px', background: !requestMessage.trim() || requestMessage.length > 400 || !!requestingId ? 'rgba(138,21,56,0.3)' : 'var(--accent)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 600, cursor: !requestMessage.trim() || !!requestingId ? 'default' : 'pointer', transition: 'background 0.15s' }}>
                {requestingId ? 'Sending…' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {showModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: '100%', maxWidth: 520, background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 'clamp(18px, 4vw, 28px) clamp(16px, 4vw, 32px)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{editTarget ? 'Edit Listing' : 'List a Skill'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <Field label="Listing Title *"><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Trade React dev for logo design" style={inputStyle} /></Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Skill I Offer *"><input value={form.skill_offered} onChange={e => setForm(f => ({ ...f, skill_offered: e.target.value }))} placeholder="e.g. React Dev" style={inputStyle} /></Field>
                <Field label="Skill I Need *"><input value={form.skill_wanted} onChange={e => setForm(f => ({ ...f, skill_wanted: e.target.value }))} placeholder="e.g. Logo Design" style={inputStyle} /></Field>
              </div>
              <Field label="Category">
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                  {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Description"><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="More detail about the trade, experience level, timeline…" rows={3} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} /></Field>
            </div>
            {listingError && <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '8px 12px', marginTop: 12 }}>{listingError}</div>}
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button onClick={() => { setShowModal(false); setListingError('') }} style={{ flex: 1, padding: '11px', background: 'transparent', border: '1px solid rgba(87,65,68,0.3)', borderRadius: 10, color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.title.trim() || !form.skill_offered.trim() || !form.skill_wanted.trim()}
                style={{ flex: 2, padding: '11px', background: saving || !form.title.trim() || !form.skill_offered.trim() || !form.skill_wanted.trim() ? 'rgba(138,21,56,0.3)' : 'var(--accent)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1, transition: 'background 0.15s' }}>
                {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Post Listing'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TRADE CHAT MODAL */}
      {chatTrade && createPortal(
        <TradeChatModal trade={chatTrade} currentUserId={user?.id ?? ''}
          onClose={() => { setChatTrade(null); computeUnread(incoming, outgoing) }}
          onMarkComplete={handleMarkComplete}
        />,
        document.body
      )}

      {/* RATING MODAL */}
      {ratingTrade && createPortal(
        <div onClick={e => { if (e.target === e.currentTarget) setRatingTrade(null) }} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: '100%', maxWidth: 420, background: 'var(--bg-card)', border: '1px solid rgba(233,193,118,0.2)', borderRadius: 22, padding: 'clamp(20px, 4vw, 32px) clamp(16px, 4vw, 32px) clamp(18px, 3vw, 28px)' }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>⭐</div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Rate your collaborator</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                How was your trade on <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>"{(ratingTrade.listing as ListingRow | null)?.title ?? 'this listing'}"</span>?
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <StarPicker value={ratingValue} onChange={setRatingValue} />
            </div>
            <textarea value={ratingComment} onChange={e => setRatingComment(e.target.value)} placeholder="Add a short review (optional)…" rows={3} maxLength={200} style={{ ...inputStyle, resize: 'none', lineHeight: 1.6, marginBottom: 6 }} />
            <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>{ratingComment.length} / 200</div>
            {ratingError && <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>{ratingError}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setRatingTrade(null); setRatingError('') }} style={{ flex: 1, padding: '11px', background: 'transparent', border: '1px solid rgba(87,65,68,0.3)', borderRadius: 10, color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }}>Skip</button>
              <button onClick={submitRating} disabled={submittingRating} style={{ flex: 2, padding: '11px', background: 'var(--accent)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 600, cursor: submittingRating ? 'default' : 'pointer', opacity: submittingRating ? 0.7 : 1 }}>
                {submittingRating ? 'Submitting…' : 'Submit Review'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  )
}

// ── TradeChatModal ─────────────────────────────────────────────────────────

function TradeChatModal({ trade, currentUserId, onClose, onMarkComplete }: {
  trade: RequestRow
  currentUserId: string
  onClose: () => void
  onMarkComplete: (id: string) => void
}) {
  const [messages, setMessages] = useState<TradeMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [whiteboardOpen, setWhiteboardOpen] = useState(false)
  const [sendError, setSendError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const listing = trade.listing as ListingRow | null
  const listingTitle = listing?.title ?? 'Trade'
  const otherName = trade.requester_id === currentUserId
    ? (listing?.profile?.full_name ?? 'Partner')
    : (trade.requester?.full_name ?? 'Partner')

  // Stable Jitsi room per trade
  const callUrl = `https://meet.jit.si/SPAP-${trade.id.replace(/-/g, '').slice(0, 20)}`

  const loadMessages = useCallback(async () => {
    const { data } = await supabase
      .from('skill_trade_messages')
      .select('*, profile:profiles(full_name)')
      .eq('request_id', trade.id)
      .order('created_at', { ascending: true })
    setMessages((data as TradeMessage[]) ?? [])
    markRead(trade.id)
  }, [trade.id])

  useEffect(() => {
    loadMessages()
    const ch = supabase.channel(`chat-${trade.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'skill_trade_messages', filter: `request_id=eq.${trade.id}` }, () => loadMessages())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [trade.id, loadMessages])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const sendMessage = async (extraPayload?: { media_url: string; media_type: string; content?: string }) => {
    const text = extraPayload ? (extraPayload.content ?? '') : input.trim()
    if (!extraPayload && !text) return
    if (sending) return
    if (!extraPayload && text) {
      const check = filterText(text)
      if (!check.ok) { setSendError(check.reason!); return }
    }
    setSendError('')
    setSending(true)
    if (!extraPayload) setInput('')
    await supabase.from('skill_trade_messages').insert({
      request_id: trade.id,
      sender_id: currentUserId,
      content: text || '',
      ...(extraPayload ? { media_url: extraPayload.media_url, media_type: extraPayload.media_type } : {}),
    })
    setSending(false)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!fileInputRef.current) return
    fileInputRef.current.value = ''
    if (!file) return

    const mime = file.type
    let mediaType: 'image' | 'video' | 'file' = 'file'
    if (mime.startsWith('image/')) mediaType = 'image'
    else if (mime.startsWith('video/')) mediaType = 'video'

    if (mime.startsWith('image/')) {
      const imgCheck = validateImage(file)
      if (!imgCheck.ok) { setSendError(imgCheck.reason!); return }
    }

    if (file.size > 500 * 1024 * 1024) {
      setSendError('File too large. Max 500 MB.')
      return
    }

    setUploading(true)
    setUploadProgress(10)
    const ext = file.name.split('.').pop() ?? 'bin'
    const path = `${currentUserId}/${trade.id}/${Date.now()}.${ext}`

    const { data: uploaded, error } = await supabase.storage
      .from('trade-media')
      .upload(path, file, { contentType: mime, upsert: false })

    setUploadProgress(80)
    if (error || !uploaded) { setUploading(false); setUploadProgress(0); alert('Upload failed.'); return }

    const { data: { publicUrl } } = supabase.storage.from('trade-media').getPublicUrl(uploaded.path)
    setUploadProgress(100)
    await sendMessage({ media_url: publicUrl, media_type: mediaType, content: file.name })
    setUploading(false)
    setUploadProgress(0)
  }

  return (
    <>
      <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 560, height: '82vh', background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 22, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(41,28,30,0.5)', flexShrink: 0 }}>
            <Avatar name={otherName} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 1 }}>{otherName}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{listingTitle}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
              {/* Video call */}
              <a href={callUrl} target="_blank" rel="noopener noreferrer"
                style={{ padding: '5px 11px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, color: '#a5b4fc', fontSize: 12, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                📹 Call
              </a>
              {/* Whiteboard */}
              <button onClick={() => setWhiteboardOpen(true)}
                style={{ padding: '5px 11px', background: 'rgba(233,193,118,0.1)', border: '1px solid rgba(233,193,118,0.25)', borderRadius: 8, color: 'var(--gold)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                🖊️ Board
              </button>
              {!confirmComplete ? (
                <button onClick={() => setConfirmComplete(true)} style={{ padding: '5px 11px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, color: '#4ade80', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✓ Done</button>
              ) : (
                <>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Mark done?</span>
                  <button onClick={() => onMarkComplete(trade.id)} style={{ padding: '4px 9px', background: '#22c55e', border: 'none', borderRadius: 7, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Yes</button>
                  <button onClick={() => setConfirmComplete(false)} style={{ padding: '4px 9px', background: 'transparent', border: '1px solid rgba(87,65,68,0.3)', borderRadius: 7, color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>No</button>
                </>
              )}
              <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
            </div>
          </div>

          {/* Upload progress */}
          {uploading && (
            <div style={{ padding: '6px 18px', background: 'rgba(99,102,241,0.08)', borderBottom: '1px solid rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 9999, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${uploadProgress}%`, background: '#a5b4fc', borderRadius: 9999, transition: 'width 0.2s' }} />
              </div>
              <span style={{ fontSize: 10, color: '#a5b4fc', whiteSpace: 'nowrap' }}>Uploading…</span>
            </div>
          )}

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>💬</div>
                Say hi to {otherName}! This is the start of your trade.
              </div>
            ) : messages.map(msg => {
              const isMe = msg.sender_id === currentUserId
              return (
                <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                  {!isMe && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, paddingLeft: 4 }}>{msg.profile?.full_name ?? 'Partner'}</div>}

                  {msg.media_type === 'image' && msg.media_url ? (
                    <div style={{ maxWidth: '72%', borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px', overflow: 'hidden', cursor: 'zoom-in', border: '1px solid rgba(255,255,255,0.1)' }}
                      onClick={() => setLightboxUrl(msg.media_url!)}>
                      <img src={msg.media_url} alt="media" style={{ display: 'block', maxWidth: '100%', maxHeight: 260, objectFit: 'cover' }} />
                    </div>
                  ) : msg.media_type === 'video' && msg.media_url ? (
                    <div style={{ maxWidth: '72%', borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <video src={msg.media_url} controls style={{ display: 'block', maxWidth: '100%', maxHeight: 260 }} />
                    </div>
                  ) : msg.media_type === 'file' && msg.media_url ? (
                    <a href={msg.media_url} target="_blank" rel="noopener noreferrer"
                      style={{ maxWidth: '72%', padding: '10px 14px', borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px', background: isMe ? 'var(--accent)' : 'rgba(255,255,255,0.07)', border: isMe ? 'none' : '1px solid rgba(255,255,255,0.08)', fontSize: 13, color: isMe ? '#fff' : 'var(--text-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 18 }}>📎</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.content || 'File'}</span>
                    </a>
                  ) : (
                    <div style={{ maxWidth: '72%', padding: '10px 14px', borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px', background: isMe ? 'var(--accent)' : 'rgba(255,255,255,0.07)', border: isMe ? 'none' : '1px solid rgba(255,255,255,0.08)', fontSize: 14, color: isMe ? '#fff' : 'var(--text-primary)', lineHeight: 1.55, wordBreak: 'break-word' }}>
                      {msg.content}
                    </div>
                  )}

                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, paddingLeft: 4, paddingRight: 4 }}>
                    {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          {sendError && (
            <div style={{ padding: '6px 16px', background: 'rgba(248,113,113,0.1)', borderTop: '1px solid rgba(248,113,113,0.2)', fontSize: 12, color: '#f87171', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <span>{sendError}</span>
              <button onClick={() => setSendError('')} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>✕</button>
            </div>
          )}
          <div style={{ padding: '10px 16px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
            <input ref={fileInputRef} type="file" accept="image/*,video/*,application/pdf" style={{ display: 'none' }} onChange={handleFileChange} />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              title="Attach image, video, or file"
              style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', fontSize: 16, cursor: uploading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: uploading ? 0.4 : 1 }}>
              📎
            </button>
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              placeholder="Message… (Enter to send)" rows={1} maxLength={1000}
              style={{ flex: 1, background: 'rgba(41,28,30,0.8)', border: '1px solid rgba(87,65,68,0.35)', borderRadius: 12, padding: '9px 14px', color: 'var(--text-primary)', fontSize: 14, outline: 'none', resize: 'none', lineHeight: 1.5 }}
            />
            <button onClick={() => sendMessage()} disabled={!input.trim() || sending}
              style={{ width: 36, height: 36, borderRadius: '50%', background: input.trim() ? 'var(--accent)' : 'rgba(87,65,68,0.2)', border: 'none', color: '#fff', fontSize: 18, cursor: input.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s' }}>
              ↑
            </button>
          </div>
        </div>
      </div>

      {/* Image lightbox inside portal */}
      {lightboxUrl && (
        <div onClick={() => setLightboxUrl(null)} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(18px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, cursor: 'zoom-out' }}>
          <img src={lightboxUrl} alt="" onClick={e => e.stopPropagation()} style={{ maxWidth: '92vw', maxHeight: '88vh', objectFit: 'contain', borderRadius: 12, boxShadow: '0 32px 80px rgba(0,0,0,0.7)', cursor: 'default' }} />
          <button onClick={() => setLightboxUrl(null)} style={{ position: 'absolute', top: 18, right: 18, width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
      )}

      {/* Whiteboard */}
      {whiteboardOpen && (
        <WhiteboardModal
          trade={trade}
          currentUserId={currentUserId}
          myName={trade.requester_id === currentUserId
            ? (trade.requester?.full_name ?? 'Me')
            : ((trade.listing as ListingRow | null)?.profile?.full_name ?? 'Me')}
          otherName={otherName}
          onClose={() => setWhiteboardOpen(false)}
        />
      )}
    </>
  )
}

// ── Listing Card ───────────────────────────────────────────────────────────

function ListingCard({ listing, action, dimmed, onViewUser, index = 0 }: { listing: ListingRow; action?: React.ReactNode; dimmed?: boolean; onViewUser?: () => void; index?: number }) {
  const catColor = CATEGORY_COLORS[listing.category ?? ''] ?? '#6b7280'
  return (
    <div className="listing-card" style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderTop: `3px solid ${catColor}`,
      borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column',
      opacity: dimmed ? 0.52 : 1,
      animation: `tp-up 0.42s cubic-bezier(0.22,1,0.36,1) ${index * 0.045}s both`,
    }}>
      <div style={{ padding: '16px 18px', flex: 1, display: 'flex', flexDirection: 'column', gap: 13 }}>
        {/* Category + author */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {listing.category
            ? <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: catColor, textTransform: 'uppercase' }}>{listing.category}</span>
            : <span />}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: onViewUser ? 'pointer' : 'default', flexShrink: 0 }} onClick={onViewUser}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{listing.profile?.full_name ?? 'Anonymous'}</span>
            <Avatar name={listing.profile?.full_name} size={26} />
          </div>
        </div>

        {/* Title */}
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>{listing.title}</div>

        {/* Skill exchange */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 28px 1fr', alignItems: 'center', background: 'rgba(0,0,0,0.22)', borderRadius: 10, padding: '11px 14px', gap: 4 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', color: 'rgba(74,222,128,0.65)', textTransform: 'uppercase', marginBottom: 4 }}>Offers</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#4ade80', wordBreak: 'break-word' }}>{listing.skill_offered}</div>
          </div>
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.15)', fontSize: 18, lineHeight: 1 }}>⇄</div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Wants</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', wordBreak: 'break-word' }}>{listing.skill_wanted}</div>
          </div>
        </div>

        {listing.description && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{listing.description}</div>
        )}
      </div>

      {action && <div style={{ padding: '0 18px 16px' }}>{action}</div>}
    </div>
  )
}

// ── Request Row ────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { bg: string; border: string; color: string; label: string; dot: string }> = {
  pending:   { bg: 'rgba(233,193,118,0.07)', border: 'rgba(233,193,118,0.2)', color: 'var(--gold)',  label: 'Awaiting Response', dot: '#e9c176' },
  accepted:  { bg: 'rgba(34,197,94,0.07)',   border: 'rgba(34,197,94,0.2)',   color: '#4ade80',      label: 'Accepted',          dot: '#4ade80' },
  rejected:  { bg: 'rgba(239,68,68,0.07)',   border: 'rgba(239,68,68,0.2)',   color: '#f87171',      label: 'Declined',          dot: '#f87171' },
  completed: { bg: 'rgba(99,102,241,0.07)',  border: 'rgba(99,102,241,0.2)',  color: '#a5b4fc',      label: 'Completed',         dot: '#a5b4fc' },
}

function ReqCard({ req, mode, currentUserId: _currentUserId, actionId, hasReviewed, onAccept, onReject, onOpenChat, onLeaveReview, onViewUser, index = 0 }: {
  req: RequestRow
  mode: 'incoming' | 'outgoing'
  currentUserId: string
  actionId: string | null
  hasReviewed?: boolean
  onAccept?: () => void
  onReject?: () => void
  onOpenChat?: () => void
  onLeaveReview?: () => void
  onViewUser?: (uid: string) => void
  index?: number
}) {
  const st = STATUS_STYLES[req.status] ?? STATUS_STYLES.pending
  const busy = actionId === req.id
  const listing = req.listing as ListingRow | null
  const listingTitle = listing?.title ?? '—'
  const skillOffered = listing?.skill_offered
  const skillWanted = listing?.skill_wanted
  const otherUserId = mode === 'incoming' ? req.requester_id : listing?.user_id
  const personName = mode === 'incoming'
    ? (req.requester?.full_name ?? 'Someone')
    : (listing?.profile?.full_name ?? 'Someone')

  return (
    <div style={{ background: 'var(--bg-card)', border: `1px solid ${st.border}`, borderRadius: 14, overflow: 'hidden', animation: `tp-up 0.4s cubic-bezier(0.22,1,0.36,1) ${index * 0.055}s both` }}>
      {/* Status bar + context */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Avatar name={mode === 'incoming' ? personName : undefined} size={34} onClick={otherUserId ? () => onViewUser?.(otherUserId) : undefined} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span onClick={otherUserId ? () => onViewUser?.(otherUserId) : undefined}
              style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', cursor: otherUserId ? 'pointer' : 'default' }}>
              {mode === 'incoming' ? personName : listingTitle}
            </span>
            {mode === 'incoming' && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>on <span style={{ color: 'var(--text-secondary)' }}>"{listingTitle}"</span></span>
            )}
          </div>
          {mode === 'outgoing' && skillOffered && skillWanted && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              <span style={{ color: '#4ade80' }}>{skillOffered}</span>
              <span style={{ margin: '0 5px', opacity: 0.4 }}>→</span>
              <span style={{ color: 'var(--text-secondary)' }}>{skillWanted}</span>
            </div>
          )}
        </div>
        {/* Status badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 9999, background: st.bg, border: `1px solid ${st.border}`, flexShrink: 0 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: st.color, letterSpacing: '0.05em' }}>{st.label}</span>
        </div>
      </div>

      {/* Message (incoming only) */}
      {mode === 'incoming' && req.message && (
        <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.15)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Their message</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{req.message}</div>
        </div>
      )}

      {/* Actions */}
      <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
        {mode === 'incoming' && req.status === 'pending' && (
          <>
            <button className="action-btn" onClick={onReject} disabled={busy} style={{ padding: '7px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1, transition: 'opacity 0.15s' }}>Decline</button>
            <button className="action-btn" onClick={onAccept} disabled={busy} style={{ padding: '7px 18px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1, boxShadow: '0 2px 12px rgba(138,21,56,0.4)', transition: 'opacity 0.15s' }}>Accept Trade</button>
          </>
        )}
        {req.status === 'accepted' && (
          <button className="action-btn" onClick={onOpenChat} style={{ padding: '7px 18px', background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.3)', borderRadius: 8, color: '#38bdf8', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'opacity 0.15s' }}>Open Chat</button>
        )}
        {req.status === 'completed' && !hasReviewed && (
          <button className="action-btn" onClick={onLeaveReview} style={{ padding: '7px 18px', background: 'rgba(233,193,118,0.1)', border: '1px solid rgba(233,193,118,0.3)', borderRadius: 8, color: 'var(--gold)', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'opacity 0.15s' }}>Leave a Review</button>
        )}
        {req.status === 'completed' && hasReviewed && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: '#4ade80' }}>✓</span> Review submitted
          </span>
        )}
        {req.status === 'rejected' && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{mode === 'outgoing' ? 'Your request was declined.' : 'You declined this request.'}</span>
        )}
        {req.status === 'pending' && mode === 'outgoing' && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Waiting for a response…</span>
        )}
      </div>
    </div>
  )
}

// ── WhiteboardModal ────────────────────────────────────────────────────────

const WB_PALETTE = ['#f3dddf','#ffffff','#ef4444','#f97316','#e9c176','#22c55e','#3b82f6','#a855f7','#ec4899','#000000']
const WB_SIZES   = [2, 4, 8, 16, 28]
const WB_TOOLS: { id: WBTool; icon: string; label: string; key: string }[] = [
  { id:'pen',         icon:'✏️', label:'Pen',       key:'p' },
  { id:'marker',      icon:'🖊',  label:'Marker',    key:'m' },
  { id:'highlighter', icon:'🖍',  label:'Highlight', key:'h' },
  { id:'eraser',      icon:'◻',  label:'Eraser',    key:'e' },
  { id:'line',        icon:'╱',  label:'Line',      key:'l' },
  { id:'rect',        icon:'▭',  label:'Rect',      key:'r' },
  { id:'circle',      icon:'◯',  label:'Circle',    key:'c' },
  { id:'arrow',       icon:'→',  label:'Arrow',     key:'a' },
  { id:'laser',       icon:'🔴', label:'Laser',     key:'z' },
  { id:'text',        icon:'T',  label:'Text',      key:'t' },
]

function wbArrow(ctx: CanvasRenderingContext2D, a: Pt, b: Pt) {
  const len = 18, ang = Math.atan2(b.y - a.y, b.x - a.x)
  ctx.beginPath()
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
  ctx.moveTo(b.x, b.y)
  ctx.lineTo(b.x - len * Math.cos(ang - Math.PI/6), b.y - len * Math.sin(ang - Math.PI/6))
  ctx.moveTo(b.x, b.y)
  ctx.lineTo(b.x - len * Math.cos(ang + Math.PI/6), b.y - len * Math.sin(ang + Math.PI/6))
  ctx.stroke()
}

function wbPaintStroke(ctx: CanvasRenderingContext2D, s: Stroke, glowOn: boolean) {
  if (!s.points.length) return
  ctx.save()
  const isErase  = s.tool === 'eraser'
  const isMark   = s.tool === 'marker'
  const isHl     = s.tool === 'highlighter'
  const isShape  = ['line','rect','circle','arrow'].includes(s.tool)
  ctx.globalCompositeOperation = isErase ? 'destination-out' : 'source-over'
  ctx.globalAlpha = isHl ? 0.28 : isMark ? 0.55 : 1
  ctx.strokeStyle = isErase ? 'rgba(0,0,0,1)' : s.color
  ctx.fillStyle   = s.color
  ctx.lineWidth   = isHl ? s.width * 3 : s.width
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  if (glowOn && !isErase && !isHl) { ctx.shadowBlur = s.width * 5; ctx.shadowColor = s.color }

  const p = s.points
  if (isShape) {
    const a = p[0], b = p[p.length - 1]
    if (s.tool === 'line')   { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke() }
    if (s.tool === 'rect')   { ctx.beginPath(); ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y) }
    if (s.tool === 'circle') {
      const rx = Math.abs(b.x - a.x)/2, ry = Math.abs(b.y - a.y)/2
      ctx.beginPath(); ctx.ellipse((a.x+b.x)/2, (a.y+b.y)/2, rx||1, ry||1, 0, 0, Math.PI*2); ctx.stroke()
    }
    if (s.tool === 'arrow')  { ctx.shadowBlur = 0; wbArrow(ctx, a, b) }
  } else if (p.length === 1) {
    ctx.beginPath(); ctx.arc(p[0].x, p[0].y, ctx.lineWidth/2, 0, Math.PI*2)
    ctx.fillStyle = isErase ? 'rgba(0,0,0,1)' : s.color; ctx.fill()
  } else {
    ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y)
    for (let i = 1; i < p.length - 1; i++) {
      ctx.quadraticCurveTo(p[i].x, p[i].y, (p[i].x+p[i+1].x)/2, (p[i].y+p[i+1].y)/2)
    }
    ctx.lineTo(p[p.length-1].x, p[p.length-1].y); ctx.stroke()
  }
  ctx.restore()
}

function WhiteboardModal({ trade, currentUserId: _currentUserId, myName: _myName, otherName, onClose }: {
  trade: RequestRow; currentUserId: string; myName: string; otherName: string; onClose: () => void
}) {
  const mainRef    = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const wrapRef    = useRef<HTMLDivElement>(null)
  const textRef    = useRef<HTMLInputElement>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const allStrokes = useRef<Stroke[]>([])
  const undoStack  = useRef<ImageData[]>([])
  const redoStack  = useRef<ImageData[]>([])
  const isDrawing  = useRef(false)
  const startPt    = useRef<Pt | null>(null)
  const lastPt     = useRef<Pt | null>(null)
  const curPts     = useRef<Pt[]>([])
  const laserSegs    = useRef<{ pts: Pt[]; ts: number }[]>([])
  const rafRef       = useRef(0)
  const strokeRafRef = useRef(0)
  const cursorMs   = useRef(0)
  const cursorTmo  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [tool, setTool]           = useState<WBTool>('pen')
  const [color, setColor]         = useState('#f3dddf')
  const [size, setSize]           = useState(4)
  const [glow, setGlow]           = useState(true)
  const [grid, setGrid]           = useState(true)
  const [loading, setLoading]     = useState(true)
  const [canUndo, setCanUndo]     = useState(false)
  const [canRedo, setCanRedo]     = useState(false)
  const [partner, setPartner]     = useState<Pt | null>(null)
  const [textPos, setTextPos]     = useState<Pt | null>(null)
  const [textVal, setTextVal]     = useState('')

  // Refs to avoid stale closures in RAF / event handlers
  const toolRef  = useRef(tool);  useEffect(() => { toolRef.current = tool },  [tool])
  const colorRef = useRef(color); useEffect(() => { colorRef.current = color }, [color])
  const sizeRef  = useRef(size);  useEffect(() => { sizeRef.current = size },  [size])
  const glowRef  = useRef(glow);  useEffect(() => { glowRef.current = glow },  [glow])

  const mc  = () => mainRef.current
  const mct = () => mainRef.current?.getContext('2d') ?? null
  const oct = () => overlayRef.current?.getContext('2d') ?? null

  const saveUndo = useCallback(() => {
    const c = mc(); const ctx = mct(); if (!c || !ctx) return
    undoStack.current.push(ctx.getImageData(0, 0, c.width, c.height))
    if (undoStack.current.length > 15) undoStack.current.shift()
    redoStack.current = []; setCanUndo(true); setCanRedo(false)
  }, [])

  const doUndo = useCallback(() => {
    const c = mc(); const ctx = mct(); if (!c || !ctx || !undoStack.current.length) return
    redoStack.current.push(ctx.getImageData(0, 0, c.width, c.height))
    ctx.putImageData(undoStack.current.pop()!, 0, 0)
    setCanUndo(undoStack.current.length > 0); setCanRedo(true)
  }, [])

  const doRedo = useCallback(() => {
    const c = mc(); const ctx = mct(); if (!c || !ctx || !redoStack.current.length) return
    undoStack.current.push(ctx.getImageData(0, 0, c.width, c.height))
    ctx.putImageData(redoStack.current.pop()!, 0, 0)
    setCanUndo(true); setCanRedo(redoStack.current.length > 0)
  }, [])

  const replayAll = useCallback((strokes: Stroke[]) => {
    const c = mc(); const ctx = mct(); if (!c || !ctx) return
    ctx.clearRect(0, 0, c.width, c.height)
    strokes.forEach(s => wbPaintStroke(ctx, s, glowRef.current))
  }, [])

  const initCanvases = useCallback(() => {
    const wrap = wrapRef.current; if (!wrap) return
    const d = window.devicePixelRatio || 1
    const w = wrap.offsetWidth || wrap.clientWidth
    const h = wrap.offsetHeight || wrap.clientHeight
    if (!w || !h) return
    ;[mainRef.current, overlayRef.current].forEach(cv => {
      if (!cv) return
      cv.width = w * d; cv.height = h * d
      // Setting .width resets all context state, so we just apply scale fresh
      const ctx = cv.getContext('2d')
      if (ctx) ctx.scale(d, d)
    })
  }, [])

  // Laser fade RAF — only runs while laserSegs has entries
  const runLaser = useCallback(() => {
    const oc = overlayRef.current; const octx = oct(); if (!oc || !octx) { rafRef.current = requestAnimationFrame(runLaser); return }
    const now = Date.now()
    laserSegs.current = laserSegs.current.filter(s => now - s.ts < 2200)
    if (!laserSegs.current.length && !isDrawing.current) { rafRef.current = 0; return }
    const d = window.devicePixelRatio || 1
    octx.clearRect(0, 0, oc.width/d, oc.height/d)
    for (const seg of laserSegs.current) {
      const age = (now - seg.ts) / 2200
      const alpha = Math.max(0, 1 - age)
      if (seg.pts.length < 2) continue
      octx.save()
      octx.globalAlpha = alpha
      octx.strokeStyle = '#ff2d55'; octx.lineWidth = 4; octx.lineCap = 'round'
      octx.shadowBlur = 14; octx.shadowColor = '#ff2d55'
      octx.beginPath(); octx.moveTo(seg.pts[0].x, seg.pts[0].y)
      for (let i = 1; i < seg.pts.length-1; i++)
        octx.quadraticCurveTo(seg.pts[i].x, seg.pts[i].y, (seg.pts[i].x+seg.pts[i+1].x)/2, (seg.pts[i].y+seg.pts[i+1].y)/2)
      octx.lineTo(seg.pts[seg.pts.length-1].x, seg.pts[seg.pts.length-1].y); octx.stroke(); octx.restore()
    }
    rafRef.current = requestAnimationFrame(runLaser)
  }, [])

  // Init canvases synchronously after layout so dimensions are ready before any drawing
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { initCanvases() }, [])

  useEffect(() => {
    // Load saved strokes (non-blocking — canvas is already usable before this resolves)
    Promise.resolve(
      supabase.from('skill_trade_whiteboards').select('strokes').eq('request_id', trade.id).maybeSingle()
    ).then(({ data }) => {
      if (data?.strokes) { allStrokes.current = data.strokes as Stroke[]; replayAll(allStrokes.current) }
    }).catch(() => {}).finally(() => setLoading(false))

    const ch = supabase.channel(`whiteboard-${trade.id}`)
      .on('broadcast', { event: 'stroke' }, ({ payload }) => {
        const s = payload as Stroke; allStrokes.current.push(s)
        const ctx = mct(); if (ctx) wbPaintStroke(ctx, s, glowRef.current)
      })
      .on('broadcast', { event: 'clear' }, () => {
        allStrokes.current = []; replayAll([])
        undoStack.current = []; redoStack.current = []; setCanUndo(false); setCanRedo(false)
      })
      .on('broadcast', { event: 'cursor' }, ({ payload }) => {
        setPartner({ x: payload.x, y: payload.y })
        if (cursorTmo.current) clearTimeout(cursorTmo.current)
        cursorTmo.current = setTimeout(() => setPartner(null), 3000)
      })
      .subscribe()
    channelRef.current = ch

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if ((e.ctrlKey||e.metaKey) && e.key==='z' && !e.shiftKey) { e.preventDefault(); doUndo() }
      if ((e.ctrlKey||e.metaKey) && (e.key==='y' || (e.key==='z'&&e.shiftKey))) { e.preventDefault(); doRedo() }
      const map: Partial<Record<string,WBTool>> = { p:'pen',m:'marker',h:'highlighter',e:'eraser',l:'line',r:'rect',c:'circle',a:'arrow',z:'laser',t:'text' }
      if (!e.ctrlKey && !e.metaKey && map[e.key]) setTool(map[e.key]!)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      supabase.removeChannel(ch)
      window.removeEventListener('keydown', onKey)
      cancelAnimationFrame(rafRef.current)
      if (cursorTmo.current) clearTimeout(cursorTmo.current)
    }
  }, [trade.id, replayAll, doUndo, doRedo, runLaser])

  const getPos = (e: React.PointerEvent): Pt => {
    const r = mainRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Safety: re-init if canvas has 0 dimensions (can happen when flex layout runs after first effect)
    if ((mainRef.current?.width ?? 0) === 0) initCanvases()

    if (tool === 'text') {
      setTextPos(getPos(e)); setTextVal(''); setTimeout(() => textRef.current?.focus(), 40); return
    }
    // Stop laser RAF if switching to shape tool
    if (['line','rect','circle','arrow'].includes(tool)) {
      cancelAnimationFrame(rafRef.current); rafRef.current = 0; laserSegs.current = []
      const oc = overlayRef.current; const octx = oct()
      if (oc && octx) { const d=window.devicePixelRatio||1; octx.clearRect(0,0,oc.width/d,oc.height/d) }
    }
    isDrawing.current = true
    const pos = getPos(e); startPt.current = pos; lastPt.current = pos; curPts.current = [pos]
    ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = getPos(e)
    // Broadcast cursor position (~40ms throttle)
    const now = Date.now()
    if (now - cursorMs.current > 40) {
      cursorMs.current = now
      channelRef.current?.send({ type:'broadcast', event:'cursor', payload: { x:pos.x, y:pos.y } })
    }
    if (!isDrawing.current) return
    curPts.current.push(pos)

    if (['pen','marker','highlighter','eraser','laser'].includes(tool)) {
      if (tool === 'eraser') {
        // Eraser draws directly to main — use lineTo (not quadraticCurveTo) so every pixel
        // from lastPt to pos is fully covered; quadraticCurveTo to midpoint left gaps
        const ctx = mct()
        if (ctx && lastPt.current) {
          ctx.save()
          ctx.globalCompositeOperation = 'destination-out'
          ctx.strokeStyle = 'rgba(0,0,0,1)'; ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
          ctx.beginPath(); ctx.moveTo(lastPt.current.x, lastPt.current.y)
          ctx.lineTo(pos.x, pos.y)
          ctx.stroke(); ctx.restore()
        }
      } else if (tool === 'laser') {
        // Laser draws on overlay incrementally (fades via RAF)
        const ctx = oct()
        if (ctx && lastPt.current) {
          ctx.save()
          ctx.strokeStyle = '#ff2d55'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
          ctx.shadowBlur = 14; ctx.shadowColor = '#ff2d55'
          const mid = { x:(lastPt.current.x+pos.x)/2, y:(lastPt.current.y+pos.y)/2 }
          ctx.beginPath(); ctx.moveTo(lastPt.current.x, lastPt.current.y)
          ctx.quadraticCurveTo(lastPt.current.x, lastPt.current.y, mid.x, mid.y)
          ctx.stroke(); ctx.restore()
        }
        const last = laserSegs.current[laserSegs.current.length-1]
        if (last && now - last.ts < 150) last.pts.push(pos)
        else laserSegs.current.push({ pts: [lastPt.current ?? pos, pos], ts: now })
      } else {
        // pen/marker/highlighter: preview on overlay, RAF-batched so the drawer sees the same
        // smooth bezier path the observer will see (fixes dashed-line appearance at speed)
        if (!strokeRafRef.current) {
          strokeRafRef.current = requestAnimationFrame(() => {
            strokeRafRef.current = 0
            const oc = overlayRef.current; const octx = oct()
            if (!oc || !octx || !curPts.current.length) return
            const d = window.devicePixelRatio || 1
            octx.clearRect(0, 0, oc.width / d, oc.height / d)
            wbPaintStroke(octx, {
              id: 'preview', points: [...curPts.current],
              color: colorRef.current, width: sizeRef.current, tool: toolRef.current as WBTool
            }, glowRef.current)
          })
        }
      }
    } else if (['line','rect','circle','arrow'].includes(tool)) {
      // Shape preview on overlay
      const oc = overlayRef.current; const octx = oct(); const sp = startPt.current
      if (!oc || !octx || !sp) { lastPt.current = pos; return }
      const d = window.devicePixelRatio || 1; octx.clearRect(0, 0, oc.width/d, oc.height/d)
      octx.save(); octx.strokeStyle = color; octx.lineWidth = size; octx.lineCap = 'round'
      if (glowRef.current) { octx.shadowBlur = size*5; octx.shadowColor = color }
      if (tool==='line')   { octx.beginPath(); octx.moveTo(sp.x,sp.y); octx.lineTo(pos.x,pos.y); octx.stroke() }
      if (tool==='rect')   { octx.beginPath(); octx.strokeRect(sp.x,sp.y,pos.x-sp.x,pos.y-sp.y) }
      if (tool==='circle') {
        const rx=Math.abs(pos.x-sp.x)/2, ry=Math.abs(pos.y-sp.y)/2
        octx.beginPath(); octx.ellipse((sp.x+pos.x)/2,(sp.y+pos.y)/2,rx||1,ry||1,0,0,Math.PI*2); octx.stroke()
      }
      if (tool==='arrow')  { octx.shadowBlur=0; wbArrow(octx,sp,pos) }
      octx.restore()
    }
    lastPt.current = pos
  }

  const onPointerUp = () => {
    if (!isDrawing.current) return; isDrawing.current = false
    // Cancel any pending overlay preview RAF
    if (strokeRafRef.current) { cancelAnimationFrame(strokeRafRef.current); strokeRafRef.current = 0 }
    const sp = startPt.current ?? curPts.current[0]; if (!sp) return
    const end = curPts.current[curPts.current.length-1] ?? sp
    const pts = [...curPts.current]; curPts.current = []; startPt.current = null; lastPt.current = null

    // Commit shape to main canvas & clear overlay
    if (['line','rect','circle','arrow'].includes(tool)) {
      const ctx = mct(); const oc = overlayRef.current; const octx = oct()
      if (oc && octx) { const d=window.devicePixelRatio||1; octx.clearRect(0,0,oc.width/d,oc.height/d) }
      if (ctx) {
        ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=size; ctx.lineCap='round'
        if (glow) { ctx.shadowBlur=size*5; ctx.shadowColor=color }
        if (tool==='line')   { ctx.beginPath();ctx.moveTo(sp.x,sp.y);ctx.lineTo(end.x,end.y);ctx.stroke() }
        if (tool==='rect')   { ctx.beginPath();ctx.strokeRect(sp.x,sp.y,end.x-sp.x,end.y-sp.y) }
        if (tool==='circle') {
          const rx=Math.abs(end.x-sp.x)/2, ry=Math.abs(end.y-sp.y)/2
          ctx.beginPath();ctx.ellipse((sp.x+end.x)/2,(sp.y+end.y)/2,rx||1,ry||1,0,0,Math.PI*2);ctx.stroke()
        }
        if (tool==='arrow')  { ctx.shadowBlur=0; wbArrow(ctx,sp,end) }
        ctx.restore()
      }
    }

    if (tool === 'laser') {
      if (!rafRef.current) rafRef.current = requestAnimationFrame(runLaser)
      return
    }

    const stroke: Stroke = {
      id: crypto.randomUUID(),
      points: ['line','rect','circle','arrow'].includes(tool) ? [sp, end] : pts,
      color, width: size, tool,
    }
    // pen/marker/highlighter were drawn on overlay — clear overlay and commit to main now
    if (['pen','marker','highlighter'].includes(tool)) {
      const oc = overlayRef.current; const octx = oct()
      if (oc && octx) { const d = window.devicePixelRatio || 1; octx.clearRect(0, 0, oc.width/d, oc.height/d) }
      saveUndo()
      const ctx = mct(); if (ctx) wbPaintStroke(ctx, stroke, glow)
    } else {
      saveUndo()
    }
    allStrokes.current.push(stroke)
    channelRef.current?.send({ type:'broadcast', event:'stroke', payload: stroke })
    supabase.from('skill_trade_whiteboards').upsert({ request_id:trade.id, strokes:allStrokes.current, updated_at:new Date().toISOString() })
  }

  const handleClear = () => {
    saveUndo()
    const c=mc();const ctx=mct();if(c&&ctx) ctx.clearRect(0,0,c.width,c.height)
    allStrokes.current=[]
    channelRef.current?.send({type:'broadcast',event:'clear',payload:{}})
    supabase.from('skill_trade_whiteboards').upsert({request_id:trade.id,strokes:[],updated_at:new Date().toISOString()})
  }

  const handleDownload = () => {
    const c = mc(); if (!c) return
    const tmp = document.createElement('canvas'); tmp.width=c.width; tmp.height=c.height
    const ctx = tmp.getContext('2d')!; ctx.fillStyle='#0d0809'; ctx.fillRect(0,0,tmp.width,tmp.height); ctx.drawImage(c,0,0)
    const a = document.createElement('a'); a.href=tmp.toDataURL('image/png'); a.download=`whiteboard-${trade.id.slice(0,8)}.png`; a.click()
  }

  const commitText = () => {
    if (!textPos || !textVal.trim()) { setTextPos(null); return }
    const ctx = mct(); if (ctx) {
      saveUndo()
      ctx.save(); ctx.font=`${size*5+10}px 'Be Vietnam Pro',sans-serif`; ctx.fillStyle=color; ctx.globalAlpha=1
      if (glow) { ctx.shadowBlur=10; ctx.shadowColor=color }
      ctx.fillText(textVal, textPos.x, textPos.y); ctx.restore()
    }
    setTextPos(null); setTextVal('')
  }

  const TOOL_GROUPS: WBTool[][] = [
    ['pen','marker','highlighter','eraser'],
    ['line','rect','circle','arrow'],
    ['laser','text'],
  ]
  const cursorStyle: React.CSSProperties['cursor'] =
    tool==='eraser' ? 'cell' : tool==='text' ? 'text' : 'crosshair'

  return (
    <div style={{ position:'fixed',inset:0,zIndex:10001,background:'rgba(0,0,0,0.97)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:12 }}>
      <div style={{ width:'100%',maxWidth:1100,height:'92vh',background:'#131010',border:'1px solid rgba(255,255,255,0.07)',borderRadius:24,display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 40px 120px rgba(0,0,0,0.9)' }}>

        {/* ── Toolbar ── */}
        <div style={{ padding:'8px 14px',borderBottom:'1px solid rgba(255,255,255,0.05)',background:'rgba(20,12,13,0.95)',display:'flex',alignItems:'center',gap:8,flexShrink:0,flexWrap:'wrap' }}>
          <span style={{ fontSize:12,fontWeight:800,color:'var(--gold)',letterSpacing:'0.06em',marginRight:4 }}>🖊️ WHITEBOARD</span>
          <div style={{ width:1,height:22,background:'rgba(255,255,255,0.07)' }} />

          {/* Tool groups */}
          {TOOL_GROUPS.map((group, gi) => (
            <Fragment key={gi}>
              <div style={{ display:'flex',gap:3 }}>
                {group.map(t => {
                  const info = WB_TOOLS.find(x=>x.id===t)!
                  const active = tool===t
                  return (
                    <button key={t} onClick={()=>setTool(t)} title={`${info.label} [${info.key.toUpperCase()}]`}
                      style={{ width:32,height:30,borderRadius:7,fontSize:13,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.1s',
                        border:`1px solid ${active?'var(--accent)':'rgba(87,65,68,0.2)'}`,
                        background:active?'rgba(138,21,56,0.28)':'transparent',
                        color:active?'#fff':'rgba(255,255,255,0.45)',
                        boxShadow:active?'0 0 10px rgba(138,21,56,0.4)':undefined }}>
                      {info.icon}
                    </button>
                  )
                })}
              </div>
              {gi < TOOL_GROUPS.length-1 && <div style={{ width:1,height:22,background:'rgba(255,255,255,0.07)' }} />}
            </Fragment>
          ))}

          <div style={{ width:1,height:22,background:'rgba(255,255,255,0.07)' }} />

          {/* Palette + custom picker */}
          <div style={{ display:'flex',gap:4,alignItems:'center' }}>
            {WB_PALETTE.map(c=>(
              <div key={c} onClick={()=>{setColor(c);if(tool==='eraser')setTool('pen')}} style={{
                width:16,height:16,borderRadius:'50%',background:c,cursor:'pointer',flexShrink:0,transition:'transform 0.1s',
                outline:color===c&&tool!=='eraser'?'2px solid #fff':'2px solid transparent',outlineOffset:2,
                transform:color===c&&tool!=='eraser'?'scale(1.3)':'scale(1)',
                border:c==='#000000'?'1px solid rgba(255,255,255,0.2)':undefined
              }} />
            ))}
            <label title="Custom color" style={{ width:16,height:16,borderRadius:'50%',overflow:'hidden',cursor:'pointer',border:'1px dashed rgba(255,255,255,0.3)',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center' }}>
              <input type="color" value={color} onChange={e=>{setColor(e.target.value);if(tool==='eraser')setTool('pen')}} style={{ width:24,height:24,border:'none',padding:0,cursor:'pointer',opacity:0,position:'absolute' }} />
              <span style={{ fontSize:9,color:'rgba(255,255,255,0.5)' }}>+</span>
            </label>
          </div>

          <div style={{ width:1,height:22,background:'rgba(255,255,255,0.07)' }} />

          {/* Sizes */}
          <div style={{ display:'flex',gap:4,alignItems:'center' }}>
            {WB_SIZES.map(s=>(
              <div key={s} onClick={()=>setSize(s)} style={{
                width:26,height:26,borderRadius:7,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.1s',
                border:`1px solid ${size===s?'var(--accent)':'rgba(87,65,68,0.2)'}`,
                background:size===s?'rgba(138,21,56,0.18)':'transparent',
              }}>
                <div style={{ borderRadius:'50%',background:tool==='eraser'?'rgba(255,255,255,0.2)':color,width:Math.max(3,Math.min(s,18)),height:Math.max(3,Math.min(s,18)) }} />
              </div>
            ))}
          </div>

          <div style={{ width:1,height:22,background:'rgba(255,255,255,0.07)' }} />

          {/* Toggles */}
          <button onClick={()=>setGlow(g=>!g)} style={{ padding:'3px 9px',borderRadius:7,fontSize:10,fontWeight:700,cursor:'pointer',transition:'all 0.12s',
            border:`1px solid ${glow?'rgba(233,193,118,0.5)':'rgba(87,65,68,0.2)'}`,
            background:glow?'rgba(233,193,118,0.1)':'transparent',
            color:glow?'var(--gold)':'rgba(255,255,255,0.3)' }}>✦ GLOW</button>
          <button onClick={()=>setGrid(g=>!g)} style={{ padding:'3px 9px',borderRadius:7,fontSize:10,fontWeight:700,cursor:'pointer',transition:'all 0.12s',
            border:`1px solid ${grid?'rgba(99,102,241,0.5)':'rgba(87,65,68,0.2)'}`,
            background:grid?'rgba(99,102,241,0.1)':'transparent',
            color:grid?'#a5b4fc':'rgba(255,255,255,0.3)' }}>⊞ GRID</button>

          <div style={{ width:1,height:22,background:'rgba(255,255,255,0.07)' }} />

          {/* Undo / Redo */}
          <button onClick={doUndo} disabled={!canUndo} title="Undo (Ctrl+Z)"
            style={{ width:28,height:28,borderRadius:7,border:'1px solid rgba(87,65,68,0.2)',background:'transparent',cursor:canUndo?'pointer':'default',fontSize:14,color:canUndo?'rgba(255,255,255,0.65)':'rgba(255,255,255,0.18)',display:'flex',alignItems:'center',justifyContent:'center' }}>↩</button>
          <button onClick={doRedo} disabled={!canRedo} title="Redo (Ctrl+Y)"
            style={{ width:28,height:28,borderRadius:7,border:'1px solid rgba(87,65,68,0.2)',background:'transparent',cursor:canRedo?'pointer':'default',fontSize:14,color:canRedo?'rgba(255,255,255,0.65)':'rgba(255,255,255,0.18)',display:'flex',alignItems:'center',justifyContent:'center' }}>↪</button>

          <div style={{ flex:1 }} />

          {/* Partner indicator */}
          {partner && (
            <div style={{ display:'flex',alignItems:'center',gap:5,padding:'3px 10px',background:'rgba(59,130,246,0.1)',border:'1px solid rgba(59,130,246,0.25)',borderRadius:20,fontSize:10,fontWeight:700,color:'#60a5fa' }}>
              <div style={{ width:6,height:6,borderRadius:'50%',background:'#3b82f6',animation:'wbPulse 1s ease-in-out infinite' }} />
              {otherName}
            </div>
          )}

          <button onClick={handleClear} style={{ padding:'3px 10px',background:'transparent',border:'1px solid rgba(239,68,68,0.3)',borderRadius:7,color:'#f87171',fontSize:10,fontWeight:700,cursor:'pointer' }}>🗑 CLEAR</button>
          <button onClick={handleDownload} style={{ padding:'3px 10px',background:'transparent',border:'1px solid rgba(99,102,241,0.3)',borderRadius:7,color:'#a5b4fc',fontSize:10,fontWeight:700,cursor:'pointer' }}>⬇ SAVE</button>
          <button onClick={onClose} style={{ width:26,height:26,borderRadius:'50%',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',color:'rgba(255,255,255,0.4)',fontSize:12,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center' }}>✕</button>
        </div>

        {/* ── Canvas area ── */}
        <div ref={wrapRef} style={{ flex:1,position:'relative',overflow:'hidden',
          background: grid
            ? 'radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px) 0 0 / 28px 28px, #0d0809'
            : '#0d0809'
        }}>
          <style>{`@keyframes wbPulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
          {loading && (
            <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',color:'rgba(255,255,255,0.25)',fontSize:13 }}>Loading…</div>
          )}

          {/* Main canvas — receives all pointer events */}
          <canvas ref={mainRef}
            style={{ position:'absolute',inset:0,width:'100%',height:'100%',display:'block',touchAction:'none',cursor:cursorStyle }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
            onPointerLeave={()=>{
              isDrawing.current=false; lastPt.current=null; startPt.current=null
              if (strokeRafRef.current) { cancelAnimationFrame(strokeRafRef.current); strokeRafRef.current=0 }
              const oc=overlayRef.current; const octx=oct()
              if (oc&&octx) { const d=window.devicePixelRatio||1; octx.clearRect(0,0,oc.width/d,oc.height/d) }
            }}
          />

          {/* Overlay canvas — shape preview + laser (no pointer events) */}
          <canvas ref={overlayRef}
            style={{ position:'absolute',inset:0,width:'100%',height:'100%',display:'block',pointerEvents:'none' }} />

          {/* Partner cursor */}
          {partner && (
            <div style={{ position:'absolute',left:partner.x,top:partner.y,transform:'translate(-4px,-4px)',pointerEvents:'none',zIndex:20,transition:'left 0.04s linear,top 0.04s linear' }}>
              <div style={{ width:10,height:10,background:'#3b82f6',borderRadius:'50% 50% 50% 0',transform:'rotate(-45deg)',boxShadow:'0 0 10px #3b82f6,0 0 20px rgba(59,130,246,0.4)' }} />
              <div style={{ position:'absolute',top:12,left:8,background:'#3b82f6',borderRadius:'0 8px 8px 8px',padding:'2px 8px',fontSize:10,fontWeight:700,color:'#fff',whiteSpace:'nowrap',boxShadow:'0 2px 12px rgba(59,130,246,0.5)' }}>{otherName}</div>
            </div>
          )}

          {/* Floating text input */}
          {textPos && (
            <div style={{ position:'absolute',left:textPos.x,top:textPos.y-20,zIndex:30,pointerEvents:'auto' }}>
              <input ref={textRef} value={textVal} onChange={e=>setTextVal(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter'){e.preventDefault();commitText()} if(e.key==='Escape'){setTextPos(null);setTextVal('')} }}
                onBlur={commitText}
                style={{ background:'transparent',border:'none',borderBottom:`2px solid ${color}`,outline:'none',color,fontSize:size*5+10,fontFamily:"'Be Vietnam Pro',sans-serif",minWidth:100,caretColor:color,padding:'0 2px' }}
                placeholder="Type…"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
