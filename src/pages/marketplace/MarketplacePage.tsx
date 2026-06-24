import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import CreateListingModalShared from './CreateListingModal'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Listing {
  id: string; seller_id: string; title: string; description: string | null
  price: number; images: string[]; category: string
  stock_quantity: number; karak_points_reward: number
  is_active: boolean; created_at: string
  seller?: { full_name: string | null; avatar_url: string | null } | null
}

interface Shop {
  id: string; owner_id: string; name: string; logo_url: string | null
  category: string | null; description: string | null
  links: Record<string, string>; created_at: string
  owner?: { full_name: string | null; avatar_url: string | null } | null
}

interface Order {
  id: string; listing_id: string | null; buyer_id: string; seller_id: string
  snapshot_title: string; snapshot_price: number; quantity: number; total_price: number
  status: 'pending' | 'confirmed' | 'out_for_delivery' | 'delivered' | 'cancelled'
  delivery_location: string | null; buyer_phone: string | null
  karak_points_reward: number; karak_awarded: boolean
  notes: string | null; created_at: string
  listing?: { images: string[] } | null
  buyer?: { full_name: string | null; avatar_url: string | null } | null
}

type MpTab = 'browse' | 'shop' | 'orders'

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = ['All', 'Clothing & Fashion', 'Art & Crafts', 'Electronics', 'Books & Notes', 'Services', 'Other']

const CAT_COLOR: Record<string, string> = {
  'Clothing & Fashion': '#a855f7', 'Art & Crafts': '#ec4899',
  'Electronics': '#0ea5e9', 'Books & Notes': '#22c55e', 'Services': '#8b5cf6', 'Other': '#6b7280',
}

const CAT_EMOJI: Record<string, string> = {
  'Clothing & Fashion': '👕', 'Art & Crafts': '🎨',
  'Electronics': '📱', 'Books & Notes': '📚', 'Services': '💼', 'Other': '🛍️',
}

const STATUS_META = {
  pending:          { label: 'Pending',          color: '#e9c176', bg: 'rgba(233,193,118,.12)', step: 0 },
  confirmed:        { label: 'Confirmed',        color: '#0ea5e9', bg: 'rgba(14,165,233,.12)',  step: 1 },
  out_for_delivery: { label: 'Out for Delivery', color: '#f97316', bg: 'rgba(249,115,22,.12)',  step: 2 },
  delivered:        { label: 'Delivered',        color: '#22c55e', bg: 'rgba(34,197,94,.12)',   step: 3 },
  cancelled:        { label: 'Cancelled',        color: '#ef4444', bg: 'rgba(239,68,68,.12)',   step: -1 },
} as const

const ORDER_STEPS = ['Ordered', 'Confirmed', 'On the Way', 'Delivered']

const initials = (name: string | null) =>
  (name ?? '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const GLOBAL_CSS = `
  @keyframes mp-up   { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }
  @keyframes mp-in   { from{opacity:0;transform:scale(.95) translateY(14px)} to{opacity:1;transform:none} }
  @keyframes mp-shimmer { from{background-position:-700px 0} to{background-position:700px 0} }
  @keyframes mp-glow { 0%,100%{opacity:.4;transform:scale(1)} 50%{opacity:.7;transform:scale(1.1)} }
  @keyframes mp-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(192,24,92,.45)} 70%{box-shadow:0 0 0 10px rgba(192,24,92,0)} }
  @keyframes mp-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }

  .mp-card {
    background: rgba(255,255,255,.028);
    border: 1px solid rgba(255,255,255,.065);
    border-radius: 18px;
    overflow: hidden;
    transition: border-color .22s, box-shadow .22s, transform .22s;
    cursor: pointer;
    position: relative;
  }
  .mp-card::after {
    content:''; position:absolute; inset:0; border-radius:18px;
    background: linear-gradient(135deg, rgba(255,255,255,.04) 0%, transparent 60%);
    pointer-events:none;
  }
  .mp-card:hover {
    border-color: rgba(192,24,92,.5);
    box-shadow: 0 20px 60px rgba(0,0,0,.7), 0 0 0 1px rgba(192,24,92,.15), inset 0 1px 0 rgba(255,255,255,.06);
    transform: translateY(-5px);
  }
  .mp-card:hover .mp-card-img { transform: scale(1.06); }
  .mp-card-img { transition: transform .4s cubic-bezier(.22,1,.36,1); width:100%; height:100%; object-fit:cover; display:block; }

  .mp-shimmer {
    background: linear-gradient(90deg,rgba(255,255,255,.025) 25%,rgba(255,255,255,.07) 50%,rgba(255,255,255,.025) 75%);
    background-size: 700px 100%;
    animation: mp-shimmer 1.6s ease-in-out infinite;
    border-radius: 10px;
  }
  .mp-btn { transition: all .15s; cursor: pointer; border:none; }
  .mp-btn:hover:not(:disabled) { filter: brightness(1.12); transform: translateY(-1px); }
  .mp-btn:disabled { opacity: .38; cursor: not-allowed; }
  .mp-btn:active:not(:disabled) { transform: translateY(0) scale(.97); }

  .mp-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(230px,1fr)); gap: 18px; }

  .mp-tab { transition: all .18s; cursor: pointer; border: none; }
  .mp-tab:hover { background: rgba(255,255,255,.06) !important; }

  .mp-input { outline: none; transition: border-color .18s, box-shadow .18s, background .18s; }
  .mp-input:focus { border-color: rgba(192,24,92,.7) !important; box-shadow: 0 0 0 3px rgba(192,24,92,.12) !important; background: rgba(255,255,255,.06) !important; }

  .mp-cats { display:flex; gap:7px; overflow-x:auto; padding-bottom:2px; scrollbar-width:none; }
  .mp-cats::-webkit-scrollbar { display:none; }

  .mp-cat-pill { flex-shrink:0; transition:all .18s; cursor:pointer; white-space:nowrap; }
  .mp-cat-pill:hover { transform:translateY(-2px); }

  .mp-status-step-line { flex:1; height:2px; border-radius:2px; }

  .mp-shop-card { transition: border-color .18s, transform .2s, box-shadow .2s; cursor:pointer; }
  .mp-shop-card:hover { transform:translateY(-4px); box-shadow:0 16px 48px rgba(0,0,0,.6); }

  @media(max-width:640px){ .mp-grid{grid-template-columns:repeat(2,1fr);gap:10px} }
`

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MarketplacePage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<MpTab>('browse')

  const [listings, setListings]             = useState<Listing[]>([])
  const [browseLoading, setBrowseLoading]   = useState(true)
  const [search, setSearch]                 = useState('')
  const [activeCat, setActiveCat]           = useState('All')

  const [myListings, setMyListings]         = useState<Listing[]>([])
  const [incomingOrders, setIncomingOrders] = useState<Order[]>([])
  const [shopLoading, setShopLoading]       = useState(false)
  const [shopSubTab, setShopSubTab]         = useState<'listings' | 'orders'>('listings')

  const [shops, setShops]                   = useState<Shop[]>([])
  const [shopsLoading, setShopsLoading]     = useState(true)

  const [myOrders, setMyOrders]             = useState<Order[]>([])
  const [ordersLoading, setOrdersLoading]   = useState(false)

  const [createOpen, setCreateOpen]         = useState(false)
  const [buyTarget, setBuyTarget]           = useState<Listing | null>(null)

  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam === 'create') {
      setTab('shop'); setShopSubTab('listings'); setCreateOpen(true)
      setSearchParams({}, { replace: true })
    } else if (tabParam === 'manage') {
      setTab('shop'); setShopSubTab('listings')
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null)

  const fetchShops = useCallback(async () => {
    setShopsLoading(true)
    const { data } = await supabase
      .from('shops')
      .select('*, owner:profiles!owner_id(full_name, avatar_url)')
      .order('created_at', { ascending: false })
    setShops((data ?? []) as unknown as Shop[])
    setShopsLoading(false)
  }, [])

  const fetchBrowse = useCallback(async () => {
    setBrowseLoading(true)
    const { data } = await supabase
      .from('marketplace_listings')
      .select('*, seller:profiles!seller_id(full_name, avatar_url)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(80)
    setListings((data ?? []) as unknown as Listing[])
    setBrowseLoading(false)
  }, [])

  const fetchShop = useCallback(async () => {
    if (!user) return
    setShopLoading(true)
    const [{ data: lData }, { data: oData }] = await Promise.all([
      supabase.from('marketplace_listings').select('*').eq('seller_id', user.id).order('created_at', { ascending: false }),
      supabase.from('marketplace_orders')
        .select('*, listing:marketplace_listings(images), buyer:profiles!buyer_id(full_name, avatar_url)')
        .eq('seller_id', user.id).not('status', 'eq', 'cancelled')
        .order('created_at', { ascending: false }).limit(50),
    ])
    setMyListings((lData ?? []) as unknown as Listing[])
    setIncomingOrders((oData ?? []) as unknown as Order[])
    setShopLoading(false)
  }, [user])

  const fetchOrders = useCallback(async () => {
    if (!user) return
    setOrdersLoading(true)
    const { data } = await supabase
      .from('marketplace_orders')
      .select('*, listing:marketplace_listings(images)')
      .eq('buyer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setMyOrders((data ?? []) as unknown as Order[])
    setOrdersLoading(false)
  }, [user])

  useEffect(() => { fetchBrowse(); fetchShops() }, [fetchBrowse, fetchShops])
  useEffect(() => { if (tab === 'shop')   fetchShop()   }, [tab, fetchShop])
  useEffect(() => { if (tab === 'orders') fetchOrders() }, [tab, fetchOrders])

  const filtered = listings.filter(l => {
    const q = search.toLowerCase()
    const matchSearch = !q || l.title.toLowerCase().includes(q) || (l.description?.toLowerCase().includes(q) ?? false) || l.category.toLowerCase().includes(q)
    const matchCat = activeCat === 'All' || l.category === activeCat
    return matchSearch && matchCat
  })

  async function updateOrderStatus(orderId: string, status: string) {
    if (updatingOrderId) return
    setUpdatingOrderId(orderId)
    await supabase.from('marketplace_orders').update({ status }).eq('id', orderId)
    await fetchShop()
    setUpdatingOrderId(null)
  }

  async function toggleListingActive(listing: Listing) {
    await supabase.from('marketplace_listings').update({ is_active: !listing.is_active }).eq('id', listing.id)
    setMyListings(prev => prev.map(l => l.id === listing.id ? { ...l, is_active: !l.is_active } : l))
  }

  async function deleteListing(id: string) {
    await supabase.from('marketplace_listings').delete().eq('id', id)
    setMyListings(prev => prev.filter(l => l.id !== id))
    fetchBrowse()
  }

  const incomingActive = incomingOrders.filter(o => o.status !== 'delivered').length

  return (
    <div className="page-content" style={{ maxWidth: 1100 }}>
      <style>{GLOBAL_CSS}</style>

      {/* ── Hero Header ── */}
      <div style={{ position: 'relative', marginBottom: 36, animation: 'mp-up .4s cubic-bezier(.22,1,.36,1) both' }}>
        {/* Ambient glows */}
        <div style={{ position:'absolute', top:-60, left:-80, width:420, height:260, background:'radial-gradient(ellipse,rgba(192,24,92,.14) 0%,transparent 70%)', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', top:-20, right:-40, width:280, height:180, background:'radial-gradient(ellipse,rgba(138,21,56,.08) 0%,transparent 70%)', pointerEvents:'none' }}/>

        <div style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:20 }}>
          <div>
            {/* Icon + wordmark */}
            <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:10 }}>
              <div style={{ width:48, height:48, borderRadius:14, background:'linear-gradient(135deg,#8a1538 0%,#c0185c 100%)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 8px 24px rgba(192,24,92,.45), inset 0 1px 0 rgba(255,255,255,.15)', flexShrink:0 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
                </svg>
              </div>
              <div>
                <h1 style={{ fontSize:'clamp(22px,4vw,32px)', fontWeight:900, color:'#fff', letterSpacing:'-0.8px', lineHeight:1, margin:0 }}>
                  KaraQ<span style={{ color:'#c0185c' }}> Market</span>
                </h1>
                <p style={{ fontSize:13, color:'rgba(255,255,255,.35)', margin:'4px 0 0', fontWeight:400 }}>
                  Buy &amp; sell from student businesses · Campus delivery
                </p>
              </div>
            </div>
            {/* Stats pills */}
            <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
              <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 11px', borderRadius:99, fontSize:11, fontWeight:700, background:'rgba(34,197,94,.07)', border:'1px solid rgba(34,197,94,.18)', color:'#4ade80' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                Cash on Delivery
              </span>
              {!shopsLoading && shops.length > 0 && (
                <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 11px', borderRadius:99, fontSize:11, fontWeight:700, background:'rgba(192,24,92,.07)', border:'1px solid rgba(192,24,92,.2)', color:'#f472b6' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  {shops.length} Shop{shops.length !== 1 ? 's' : ''}
                </span>
              )}
              {!browseLoading && listings.length > 0 && (
                <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 11px', borderRadius:99, fontSize:11, fontWeight:700, background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', color:'rgba(255,255,255,.45)' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                  {listings.length} Listing{listings.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
          {tab === 'shop' && shopSubTab === 'listings' && (
            <button onClick={() => setCreateOpen(true)} className="mp-btn"
              style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 22px', background:'linear-gradient(135deg,#8a1538,#c0185c)', borderRadius:14, color:'#fff', fontSize:14, fontWeight:800, fontFamily:'inherit', boxShadow:'0 6px 24px rgba(192,24,92,.45)', animation:'mp-pulse 2.5s ease-in-out infinite', border:'none' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              List Item
            </button>
          )}
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div style={{ display:'flex', gap:6, marginBottom:28, padding:'5px', background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.06)', borderRadius:16, width:'fit-content' }}>
        {([
          { key:'browse', label:'Browse', icon:(
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          )},
          { key:'shop', label:'My Shop', icon:(
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          )},
          { key:'orders', label:'My Orders', icon:(
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          )},
        ] as { key: MpTab; label: string; icon: React.ReactNode }[]).map(t => {
          const active = tab === t.key
          return (
            <button key={t.key} className="mp-tab" onClick={() => setTab(t.key)} style={{
              display:'flex', alignItems:'center', gap:7,
              padding:'9px 20px', borderRadius:12, fontFamily:'inherit',
              background: active ? 'rgba(192,24,92,.18)' : 'transparent',
              border: active ? '1px solid rgba(192,24,92,.35)' : '1px solid transparent',
              color: active ? '#fff' : 'rgba(255,255,255,.38)',
              fontSize:13.5, fontWeight: active ? 700 : 500,
              boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,.08)' : 'none',
            }}>
              {t.icon}{t.label}
            </button>
          )
        })}
      </div>

      {/* ── Browse Tab ── */}
      {tab === 'browse' && (
        <div style={{ animation: 'mp-up .28s ease both' }}>

          {/* ── Shops section ── */}
          {(shopsLoading || shops.length > 0) && (
            <div style={{ marginBottom: 36 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:3, height:16, borderRadius:2, background:'linear-gradient(180deg,#c0185c,#8a1538)' }}/>
                  <span style={{ fontSize:12, fontWeight:800, color:'rgba(255,255,255,.55)', letterSpacing:'.1em', textTransform:'uppercase' }}>Shops</span>
                  {!shopsLoading && <span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, background:'rgba(192,24,92,.1)', border:'1px solid rgba(192,24,92,.2)', color:'#f472b6', fontWeight:700 }}>{shops.length}</span>}
                </div>
              </div>
              <div style={{ display:'flex', gap:14, overflowX:'auto', paddingBottom:8, scrollbarWidth:'none' }}>
                {shopsLoading
                  ? [0,1,2,3,4].map(i => <div key={i} className="mp-shimmer" style={{ flexShrink:0, width:200, height:110, borderRadius:16 }}/>)
                  : shops.map((shop, i) => <ShopCard key={shop.id} shop={shop} index={i} isOwn={shop.owner_id === user?.id}/>)
                }
              </div>
              <div style={{ height:1, background:'linear-gradient(90deg,rgba(255,255,255,.08),transparent)', marginTop:28 }}/>
            </div>
          )}

          {/* Search + filter row */}
          <div style={{ display:'flex', gap:12, marginBottom:20, alignItems:'center' }}>
            <div style={{ position:'relative', flex:1 }}>
              <svg style={{ position:'absolute', left:16, top:'50%', transform:'translateY(-50%)', opacity:.3, pointerEvents:'none' }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input className="mp-input" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search listings…"
                style={{ width:'100%', boxSizing:'border-box', padding:'13px 16px 13px 46px', background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.09)', borderRadius:14, color:'#fff', fontSize:14, fontFamily:'inherit' }}/>
              {search && (
                <button onClick={() => setSearch('')} style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', background:'rgba(255,255,255,.1)', border:'none', borderRadius:'50%', width:24, height:24, color:'rgba(255,255,255,.5)', cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
              )}
            </div>
          </div>

          {/* Category pills */}
          <div className="mp-cats" style={{ marginBottom: 24 }}>
            {CATEGORIES.map(cat => {
              const active = cat === activeCat
              const color  = cat === 'All' ? '#c0185c' : (CAT_COLOR[cat] ?? '#6b7280')
              return (
                <button key={cat} onClick={() => setActiveCat(cat)} className="mp-cat-pill mp-btn" style={{
                  display:'flex', alignItems:'center', gap:6,
                  padding:'8px 16px', borderRadius:99, fontSize:12.5, fontWeight:700,
                  fontFamily:'inherit', border:`1px solid ${active ? color+'60' : 'rgba(255,255,255,.08)'}`,
                  background: active ? `${color}1e` : 'rgba(255,255,255,.03)',
                  color: active ? color : 'rgba(255,255,255,.4)',
                  boxShadow: active ? `0 2px 14px ${color}30, inset 0 1px 0 rgba(255,255,255,.06)` : 'none',
                }}>
                  {cat !== 'All' && <span style={{ fontSize:13 }}>{CAT_EMOJI[cat]}</span>}{cat}
                </button>
              )
            })}
          </div>

          {/* Result count */}
          {!browseLoading && filtered.length > 0 && (
            <div style={{ fontSize:12, color:'rgba(255,255,255,.22)', marginBottom:16, fontWeight:500, display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:5, height:5, borderRadius:'50%', background:'rgba(192,24,92,.6)' }}/>
              {filtered.length} listing{filtered.length !== 1 ? 's' : ''}
              {activeCat !== 'All' && ` in ${activeCat}`}
              {search && ` matching "${search}"`}
            </div>
          )}

          {/* Grid */}
          {browseLoading ? (
            <div className="mp-grid">
              {[0,1,2,3,4,5].map(i => (
                <div key={i} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 20, overflow: 'hidden' }}>
                  <div className="mp-shimmer" style={{ height: 210, borderRadius: 0 }} />
                  <div style={{ padding: '16px' }}>
                    <div className="mp-shimmer" style={{ width: '50%', height: 10, marginBottom: 10 }} />
                    <div className="mp-shimmer" style={{ width: '85%', height: 14, marginBottom: 6 }} />
                    <div className="mp-shimmer" style={{ width: '60%', height: 14, marginBottom: 16 }} />
                    <div className="mp-shimmer" style={{ height: 38, borderRadius: 11 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              emoji="🛍️"
              title={search ? `Nothing matches "${search}"` : activeCat !== 'All' ? `No ${activeCat} listings` : 'No listings yet'}
              sub={search ? 'Try a different keyword or clear the search' : 'Be the first to list something!'}
              action={{ label: 'List Something →', onClick: () => { setTab('shop'); setShopSubTab('listings'); setCreateOpen(true) } }}
            />
          ) : (
            <div className="mp-grid">
              {filtered.map((l, i) => (
                <ListingCard key={l.id} listing={l} index={i}
                  isOwn={l.seller_id === user?.id}
                  onBuy={() => setBuyTarget(l)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── My Shop Tab ── */}
      {tab === 'shop' && (
        <div style={{ animation: 'mp-up .28s ease both' }}>
          {/* Sub-tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
            {(['listings', 'orders'] as const).map(st => (
              <button key={st} onClick={() => setShopSubTab(st)} className="mp-btn" style={{
                padding: '8px 20px', borderRadius: 10, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: shopSubTab === st ? 'rgba(138,21,56,.2)' : 'rgba(255,255,255,.04)',
                border: `1px solid ${shopSubTab === st ? 'rgba(138,21,56,.4)' : 'rgba(255,255,255,.08)'}`,
                color: shopSubTab === st ? '#fff' : 'rgba(255,255,255,.45)',
              }}>
                {st === 'listings' ? `My Listings (${myListings.length})` : `Incoming Orders${incomingActive > 0 ? ` · ${incomingActive} active` : ''}`}
              </button>
            ))}
          </div>

          {shopLoading ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,.3)', fontSize: 14 }}>Loading…</div>
          ) : shopSubTab === 'listings' ? (
            myListings.length === 0 ? (
              <EmptyState
                emoji="📦"
                title="No listings yet"
                sub="Start selling to other students on campus"
                action={{ label: '+ Create First Listing', onClick: () => setCreateOpen(true) }}
              />
            ) : (
              <div className="mp-grid">
                {myListings.map((l, i) => (
                  <OwnListingCard key={l.id} listing={l} index={i}
                    onToggle={() => toggleListingActive(l)}
                    onDelete={() => deleteListing(l.id)} />
                ))}
              </div>
            )
          ) : (
            incomingOrders.length === 0 ? (
              <EmptyState emoji="📬" title="No incoming orders yet" sub="Orders from buyers will appear here" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {incomingOrders.map((o, i) => (
                  <IncomingOrderCard key={o.id} order={o} index={i}
                    updating={updatingOrderId === o.id}
                    onUpdate={status => updateOrderStatus(o.id, status)} />
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* ── My Orders Tab ── */}
      {tab === 'orders' && (
        <div style={{ animation: 'mp-up .28s ease both' }}>
          {ordersLoading ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,.3)', fontSize: 14 }}>Loading…</div>
          ) : myOrders.length === 0 ? (
            <EmptyState
              emoji="🧾"
              title="No orders yet"
              sub="Browse the market and place your first order"
              action={{ label: 'Browse Market →', onClick: () => setTab('browse') }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {myOrders.map((o, i) => (
                <BuyerOrderCard key={o.id} order={o} index={i} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {createOpen && user && (
        <CreateListingModalShared userId={user.id} onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); fetchShop(); fetchBrowse() }} />
      )}
      {buyTarget && user && (
        <BuyModal listing={buyTarget} buyerId={user.id} onClose={() => setBuyTarget(null)}
          onOrdered={() => { setBuyTarget(null); setTab('orders'); fetchOrders() }} />
      )}
    </div>
  )
}

// ── Shop Card (browse row) ────────────────────────────────────────────────────

const CAT_COLOR_CS: Record<string, string> = {
  'Food & Drinks':'#f59e0b','Clothing':'#8b5cf6','Electronics':'#3b82f6',
  'Books':'#10b981','Art & Crafts':'#ec4899','Beauty':'#f43f5e',
  'Services':'#06b6d4','Other':'#6b7280',
}

function ShopCard({ shop, index, isOwn }: { shop: Shop; index: number; isOwn: boolean }) {
  const navigate = useNavigate()
  const col = CAT_COLOR_CS[shop.category ?? ''] ?? '#8a1538'

  return (
    <div className="mp-shop-card" style={{
      flexShrink:0, width:210, borderRadius:18, overflow:'hidden',
      background:'rgba(255,255,255,.03)', border:`1px solid rgba(255,255,255,.07)`,
      animation:`mp-up .35s cubic-bezier(.22,1,.36,1) ${index * .05}s both`,
    }}
      onClick={() => navigate(`/marketplace/shop/${shop.id}`)}
      onMouseEnter={e => { const d = e.currentTarget as HTMLDivElement; d.style.borderColor=`${col}50`; }}
      onMouseLeave={e => { const d = e.currentTarget as HTMLDivElement; d.style.borderColor='rgba(255,255,255,.07)'; }}>

      {/* Color band + logo hero */}
      <div style={{ height:70, background:`linear-gradient(135deg,${col}35 0%,${col}10 100%)`, position:'relative', display:'flex', alignItems:'flex-end', padding:'0 14px 0' }}>
        <div style={{ position:'absolute', top:0, left:0, right:0, bottom:0, background:`linear-gradient(180deg,transparent 30%,rgba(12,8,10,1) 100%)` }}/>
        {isOwn && (
          <div style={{ position:'absolute', top:10, right:10, fontSize:9, fontWeight:800, color:col, background:`${col}20`, border:`1px solid ${col}40`, padding:'2px 7px', borderRadius:5, letterSpacing:'.06em' }}>YOUR SHOP</div>
        )}
      </div>

      <div style={{ padding:'0 14px 15px', marginTop:-22, position:'relative' }}>
        {/* Logo */}
        <div style={{ width:46, height:46, borderRadius:13, overflow:'hidden', background:`${col}18`, border:`2px solid rgba(12,8,10,1)`, boxShadow:`0 0 0 1px ${col}35`, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:9, flexShrink:0 }}>
          {shop.logo_url
            ? <img src={shop.logo_url} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
            : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>}
        </div>
        <div style={{ fontSize:14, fontWeight:800, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:5, lineHeight:1.2 }}>{shop.name}</div>
        {shop.category && (
          <span style={{ fontSize:10.5, fontWeight:700, color:col, background:`${col}14`, border:`1px solid ${col}28`, padding:'2px 8px', borderRadius:99, display:'inline-block', marginBottom:9 }}>{shop.category}</span>
        )}
        {/* Owner row */}
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <div style={{ width:18, height:18, borderRadius:'50%', background:'linear-gradient(135deg,#8a1538,#c0185c)', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            {shop.owner?.avatar_url
              ? <img src={shop.owner.avatar_url} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
              : <span style={{ fontSize:8, fontWeight:800, color:'#fff' }}>{(shop.owner?.full_name ?? '?').charAt(0)}</span>}
          </div>
          <span style={{ fontSize:11, color:'rgba(255,255,255,.28)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{shop.owner?.full_name ?? 'Seller'}</span>
        </div>
      </div>
    </div>
  )
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ emoji, title, sub, action }: {
  emoji: string; title: string; sub: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div style={{ textAlign:'center', padding:'80px 20px 60px', background:'rgba(255,255,255,.015)', borderRadius:20, border:'1px solid rgba(255,255,255,.05)' }}>
      <div style={{ position:'relative', display:'inline-block', marginBottom:22 }}>
        <div style={{ position:'absolute', inset:-30, borderRadius:'50%', background:'radial-gradient(circle,rgba(192,24,92,.2) 0%,transparent 70%)', animation:'mp-glow 3s ease-in-out infinite' }}/>
        <div style={{ fontSize:54, position:'relative', animation:'mp-float 4s ease-in-out infinite' }}>{emoji}</div>
      </div>
      <div style={{ fontSize:18, fontWeight:800, color:'#fff', marginBottom:8 }}>{title}</div>
      <div style={{ fontSize:13.5, color:'rgba(255,255,255,.35)', maxWidth:260, margin:'0 auto', lineHeight:1.65 }}>{sub}</div>
      {action && (
        <button onClick={action.onClick} className="mp-btn"
          style={{ marginTop:28, display:'inline-flex', alignItems:'center', gap:7, padding:'12px 28px', background:'linear-gradient(135deg,#8a1538,#c0185c)', borderRadius:13, color:'#fff', fontSize:14, fontWeight:800, fontFamily:'inherit', boxShadow:'0 6px 22px rgba(192,24,92,.4)', border:'none' }}>
          {action.label}
        </button>
      )}
    </div>
  )
}

// ── Listing Card ──────────────────────────────────────────────────────────────

function ListingCard({ listing: l, index, isOwn, onBuy }: {
  listing: Listing; index: number; isOwn: boolean; onBuy: () => void
}) {
  const catColor = CAT_COLOR[l.category] ?? '#6b7280'
  const img = l.images[0]
  const outOfStock = l.stock_quantity === 0

  return (
    <div className="mp-card" style={{ display:'flex', flexDirection:'column', animation:`mp-up .38s cubic-bezier(.22,1,.36,1) ${index * .04}s both` }}>

      {/* Image */}
      <div style={{ height:215, position:'relative', overflow:'hidden', background:`linear-gradient(145deg,${catColor}2e 0%,rgba(6,2,4,1) 100%)` }}>
        {img
          ? <img className="mp-card-img" src={img} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
          : <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <div style={{ fontSize:60, opacity:.1 }}>{CAT_EMOJI[l.category] ?? '🛍️'}</div>
            </div>}
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top, rgba(6,2,4,1) 0%, rgba(6,2,4,.55) 40%, transparent 68%)' }}/>

        {/* Category badge */}
        <div style={{ position:'absolute', top:11, left:11 }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:99, fontSize:10, fontWeight:800, background:'rgba(0,0,0,.6)', backdropFilter:'blur(10px)', color:catColor, border:`1px solid ${catColor}40` }}>
            <span style={{ fontSize:11 }}>{CAT_EMOJI[l.category] ?? '🛍️'}</span>{l.category}
          </div>
        </div>

        {/* Low stock badge */}
        {!outOfStock && l.stock_quantity <= 5 && (
          <div style={{ position:'absolute', top:11, right:11, padding:'3px 9px', borderRadius:99, fontSize:9.5, fontWeight:800, background:'rgba(249,115,22,.2)', border:'1px solid rgba(249,115,22,.4)', color:'#fb923c', backdropFilter:'blur(8px)' }}>
            🔥 {l.stock_quantity} left
          </div>
        )}

        {/* Bottom info */}
        <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'14px 14px 12px' }}>
          <div style={{ fontSize:15, fontWeight:800, color:'#fff', lineHeight:1.35, marginBottom:5, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{l.title}</div>
          <div style={{ fontSize:21, fontWeight:900, color:'#fff', letterSpacing:'-1px' }}>AED {l.price.toFixed(2)}</div>
        </div>

        {outOfStock && (
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.65)', backdropFilter:'blur(2px)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ padding:'8px 18px', borderRadius:99, background:'rgba(239,68,68,.18)', border:'1px solid rgba(239,68,68,.4)', color:'#f87171', fontSize:12, fontWeight:800, letterSpacing:'.06em' }}>SOLD OUT</div>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding:'13px 14px 14px', flex:1, display:'flex', flexDirection:'column', gap:10 }}>
        {/* Seller */}
        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
          <div style={{ width:22, height:22, borderRadius:'50%', background:'linear-gradient(135deg,#8a1538,#c0185c)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:800, color:'#fff', flexShrink:0, overflow:'hidden' }}>
            {l.seller?.avatar_url
              ? <img src={l.seller.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
              : initials(l.seller?.full_name ?? null)}
          </div>
          <span style={{ fontSize:11.5, color:'rgba(255,255,255,.4)', fontWeight:500, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.seller?.full_name ?? 'Seller'}</span>
          <span style={{ fontSize:10, color:'rgba(255,255,255,.18)', flexShrink:0 }}>{timeAgo(l.created_at)}</span>
        </div>
        <div style={{ flex:1 }}/>
        <button onClick={e => { e.stopPropagation(); onBuy() }} disabled={isOwn || outOfStock} className="mp-btn"
          style={{ width:'100%', padding:'11px', borderRadius:12, fontFamily:'inherit',
            background: isOwn || outOfStock ? 'rgba(255,255,255,.05)' : 'linear-gradient(135deg,#8a1538,#c0185c)',
            color: isOwn || outOfStock ? 'rgba(255,255,255,.28)' : '#fff',
            fontSize:13.5, fontWeight:800,
            boxShadow: !isOwn && !outOfStock ? '0 4px 18px rgba(192,24,92,.4)' : 'none',
            border: isOwn || outOfStock ? '1px solid rgba(255,255,255,.06)' : 'none' }}>
          {isOwn ? 'Your Listing' : outOfStock ? 'Out of Stock' : '🛒 Buy Now'}
        </button>
      </div>
    </div>
  )
}

// ── Own Listing Card ──────────────────────────────────────────────────────────

function OwnListingCard({ listing: l, index, onToggle, onDelete }: {
  listing: Listing; index: number; onToggle: () => void; onDelete: () => void
}) {
  const catColor = CAT_COLOR[l.category] ?? '#6b7280'
  const img = l.images[0]
  const [confirmDel, setConfirmDel] = useState(false)

  return (
    <div style={{
      background: 'rgba(255,255,255,.03)', border: `1px solid ${l.is_active ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.04)'}`,
      borderRadius: 20, overflow: 'hidden', display: 'flex', flexDirection: 'column',
      opacity: l.is_active ? 1 : .52, animation: `mp-up .38s cubic-bezier(.22,1,.36,1) ${index * .035}s both`,
    }}>
      <div style={{ height: 140, position: 'relative', overflow: 'hidden', background: `linear-gradient(145deg,${catColor}2a 0%,rgba(6,2,4,1) 100%)` }}>
        {img
          ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, opacity: .18 }}>{CAT_EMOJI[l.category] ?? '🛍️'}</div>
        }
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(6,2,4,.85) 0%, transparent 55%)' }} />

        <div style={{ position: 'absolute', top: 10, right: 10, padding: '3px 10px', borderRadius: 9999, fontSize: 10, fontWeight: 800,
          background: l.is_active ? 'rgba(34,197,94,.18)' : 'rgba(255,255,255,.08)',
          border: `1px solid ${l.is_active ? 'rgba(34,197,94,.35)' : 'rgba(255,255,255,.12)'}`,
          color: l.is_active ? '#4ade80' : 'rgba(255,255,255,.38)',
        }}>
          {l.is_active ? '● Active' : '○ Paused'}
        </div>

      </div>

      <div style={{ padding: '12px 14px 14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.38)', marginBottom: 12 }}>
          AED {l.price.toFixed(2)} · {l.stock_quantity} in stock
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 7 }}>
          <button onClick={onToggle} className="mp-btn"
            style={{ flex: 1, padding: '8px', borderRadius: 10, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.04)', color: 'rgba(255,255,255,.6)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
            {l.is_active ? 'Pause' : 'Activate'}
          </button>
          {confirmDel
            ? <button onClick={onDelete} className="mp-btn"
                style={{ flex: 1, padding: '8px', borderRadius: 10, border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.12)', color: '#f87171', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
                Confirm?
              </button>
            : <button onClick={() => setConfirmDel(true)} className="mp-btn"
                style={{ padding: '8px 13px', borderRadius: 10, border: '1px solid rgba(255,255,255,.06)', background: 'transparent', color: 'rgba(255,255,255,.28)', fontSize: 13, fontFamily: 'inherit' }}>
                🗑
              </button>
          }
        </div>
      </div>
    </div>
  )
}

// ── Incoming Order Card ───────────────────────────────────────────────────────

function IncomingOrderCard({ order: o, index, updating, onUpdate }: {
  order: Order; index: number; updating: boolean; onUpdate: (s: string) => void
}) {
  const meta = STATUS_META[o.status]
  const img = o.listing?.images?.[0]

  const nextAction: { label: string; status: string } | null =
    o.status === 'pending'          ? { label: 'Confirm Order',         status: 'confirmed'        } :
    o.status === 'confirmed'        ? { label: 'Out for Delivery →',    status: 'out_for_delivery' } :
    o.status === 'out_for_delivery' ? { label: '✓ Mark as Delivered',   status: 'delivered'        } : null

  return (
    <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 20, overflow: 'hidden', animation: `mp-up .3s ease ${index * .04}s both` }}>
      {/* Status bar */}
      <div style={{ height: 3, background: `linear-gradient(90deg,${meta.color},${meta.color}44)` }} />

      <div style={{ padding: '16px 18px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ width: 68, height: 68, borderRadius: 14, overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>
          {img ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🛍️'}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{o.snapshot_title}</div>
            <div style={{ padding: '4px 11px', borderRadius: 9999, fontSize: 10.5, fontWeight: 800, background: meta.bg, color: meta.color, border: `1px solid ${meta.color}44`, flexShrink: 0 }}>
              {meta.label}
            </div>
          </div>

          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.55)', marginBottom: 8 }}>
            {o.quantity} × AED {o.snapshot_price.toFixed(2)} = <strong style={{ color: '#fff' }}>AED {o.total_price.toFixed(2)}</strong>
          </div>

          {/* Buyer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, flexWrap: 'wrap' }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(138,21,56,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#c0185c', overflow: 'hidden' }}>
              {o.buyer?.avatar_url ? <img src={o.buyer.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(o.buyer?.full_name ?? null)}
            </div>
            <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,.55)', fontWeight: 600 }}>{o.buyer?.full_name ?? 'Buyer'}</span>
            {o.buyer_phone && <span style={{ fontSize: 12, color: 'rgba(255,255,255,.38)' }}>· 📞 {o.buyer_phone}</span>}
          </div>

          {o.delivery_location && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.38)', marginBottom: 5 }}>📍 {o.delivery_location}</div>
          )}
          {o.notes && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.3)', fontStyle: 'italic', marginBottom: 6 }}>"{o.notes}"</div>
          )}
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.2)', marginBottom: nextAction ? 12 : 0 }}>
            {new Date(o.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </div>

          {nextAction && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => onUpdate(nextAction.status)} disabled={updating} className="mp-btn"
                style={{ padding: '8px 20px', borderRadius: 10, background: 'linear-gradient(135deg,#8a1538,#c0185c)', color: '#fff', fontSize: 13, fontWeight: 800, fontFamily: 'inherit', boxShadow: '0 3px 12px rgba(138,21,56,.4)' }}>
                {updating ? '…' : nextAction.label}
              </button>
              {o.status === 'pending' && (
                <button onClick={() => onUpdate('cancelled')} disabled={updating} className="mp-btn"
                  style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(239,68,68,.22)', background: 'transparent', color: 'rgba(248,113,113,.6)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
                  Cancel
                </button>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Buyer Order Card ──────────────────────────────────────────────────────────

function BuyerOrderCard({ order: o, index }: { order: Order; index: number }) {
  const meta = STATUS_META[o.status]
  const img = o.listing?.images?.[0]
  const step = meta.step
  const cancelled = o.status === 'cancelled'

  return (
    <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 20, overflow: 'hidden', animation: `mp-up .3s ease ${index * .04}s both` }}>
      {/* Color top bar */}
      <div style={{ height: 3, background: cancelled ? 'rgba(239,68,68,.4)' : `linear-gradient(90deg,#8a1538,${meta.color})` }} />

      <div style={{ padding: '16px 18px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ width: 64, height: 64, borderRadius: 14, overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
          {img ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🛍️'}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{o.snapshot_title}</div>
            <div style={{ padding: '4px 11px', borderRadius: 9999, fontSize: 10.5, fontWeight: 800, background: meta.bg, color: meta.color, border: `1px solid ${meta.color}44`, flexShrink: 0 }}>
              {meta.label}
            </div>
          </div>

          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>
            {o.quantity} × AED {o.snapshot_price.toFixed(2)} = <strong style={{ color: '#fff' }}>AED {o.total_price.toFixed(2)}</strong>
          </div>

          {o.delivery_location && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', marginBottom: 10 }}>📍 {o.delivery_location}</div>
          )}

          {/* Order status stepper */}
          {!cancelled && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 5 }}>
                {ORDER_STEPS.map((_, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < ORDER_STEPS.length - 1 ? 1 : 'none' }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                      background: i <= step ? meta.color : 'rgba(255,255,255,.12)',
                      border: i === step ? `2px solid ${meta.color}` : '2px solid transparent',
                      boxShadow: i === step ? `0 0 8px ${meta.color}66` : 'none',
                      transition: 'all .3s',
                    }} />
                    {i < ORDER_STEPS.length - 1 && (
                      <div className="mp-status-step-line" style={{ background: i < step ? meta.color : 'rgba(255,255,255,.1)' }} />
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                {ORDER_STEPS.map((lbl, i) => (
                  <div key={i} style={{ fontSize: 9.5, fontWeight: i === step ? 700 : 400, color: i <= step ? meta.color : 'rgba(255,255,255,.2)', textAlign: i === 0 ? 'left' : i === ORDER_STEPS.length - 1 ? 'right' : 'center', flex: 1 }}>
                    {lbl}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.2)' }}>
              {new Date(o.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
            {!cancelled && o.status !== 'delivered' && (
              <span style={{ fontSize: 11.5, color: 'rgba(233,193,118,.7)', fontWeight: 700 }}>
                💵 Pay AED {o.total_price.toFixed(2)} cash on delivery
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Create Listing Modal ──────────────────────────────────────────────────────

function CreateListingModal({ userId, onClose, onCreated }: {
  userId: string; onClose: () => void; onCreated: () => void
}) {
  const [title, setTitle]         = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice]         = useState('')
  const [category, setCategory]   = useState('Other')
  const [stock, setStock]         = useState('1')
  const [karakPts, setKarakPts]   = useState('0')
  const [images, setImages]       = useState<File[]>([])
  const [previews, setPreviews]   = useState<string[]>([])
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function onImgChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 3 - images.length)
    e.target.value = ''
    if (!files.length) return
    setImages(prev => [...prev, ...files])
    files.forEach(f => {
      const r = new FileReader()
      r.onload = () => setPreviews(prev => [...prev, r.result as string])
      r.readAsDataURL(f)
    })
  }

  function removeImg(i: number) {
    setImages(p => p.filter((_, j) => j !== i))
    setPreviews(p => p.filter((_, j) => j !== i))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const p = parseFloat(price)
    if (!title.trim()) { setErr('Title is required'); return }
    if (isNaN(p) || p < 0) { setErr('Enter a valid price'); return }
    setSaving(true); setErr('')

    const imgUrls: string[] = []
    for (let i = 0; i < images.length; i++) {
      const f = images[i]
      const ext = f.name.split('.').pop() ?? 'jpg'
      const path = `${userId}/${Date.now()}_${i}.${ext}`
      const { error } = await supabase.storage.from('marketplace').upload(path, f, { contentType: f.type })
      if (!error) imgUrls.push(supabase.storage.from('marketplace').getPublicUrl(path).data.publicUrl)
    }

    const { error } = await supabase.from('marketplace_listings').insert({
      seller_id: userId, title: title.trim(), description: description.trim() || null,
      price: p, images: imgUrls, category,
      stock_quantity: Math.max(0, parseInt(stock) || 1),
      karak_points_reward: Math.max(0, parseInt(karakPts) || 0),
    })
    setSaving(false)
    if (error) { setErr(error.message); return }
    onCreated()
  }

  const iSt: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,.05)',
    border: '1.5px solid rgba(255,255,255,.1)', borderRadius: 12, padding: '11px 14px',
    color: '#fff', fontSize: 13.5, fontFamily: 'inherit',
  }
  const label = (txt: string) => (
    <label style={{ display: 'block', fontSize: 10.5, fontWeight: 800, color: 'rgba(255,255,255,.38)', letterSpacing: '.08em', textTransform: 'uppercase' as const, marginBottom: 7 }}>{txt}</label>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(3,1,2,.9)', backdropFilter: 'blur(22px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 520, background: 'linear-gradient(170deg,#180a0e,#0d050a)', border: '1px solid rgba(138,21,56,.3)', borderRadius: 24, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,.9)', maxHeight: '92vh', overflowY: 'auto', animation: 'mp-in .22s cubic-bezier(.22,1,.36,1) both' }}>
        <div style={{ height: 4, background: 'linear-gradient(90deg,#6b0f29,#c0185c,#e87ca0)' }} />
        <div style={{ padding: '24px 24px 28px' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 19, fontWeight: 900, color: '#fff', marginBottom: 2 }}>📦 List an Item</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.3)' }}>Fill in the details to start selling</div>
            </div>
            <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.1)', borderRadius: '50%', width: 34, height: 34, color: 'rgba(255,255,255,.55)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', flexShrink: 0 }}>✕</button>
          </div>

          {/* Photos */}
          <div style={{ marginBottom: 20 }}>
            {label('Photos (up to 3)')}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {previews.map((src, i) => (
                <div key={i} style={{ width: 88, height: 88, borderRadius: 14, overflow: 'hidden', position: 'relative', border: '1px solid rgba(255,255,255,.1)' }}>
                  <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button type="button" onClick={() => removeImg(i)} style={{ position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,.8)', border: 'none', color: '#fff', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>
              ))}
              {images.length < 3 && (
                <button type="button" onClick={() => fileRef.current?.click()}
                  style={{ width: 88, height: 88, borderRadius: 14, border: '1.5px dashed rgba(255,255,255,.15)', background: 'rgba(255,255,255,.03)', color: 'rgba(255,255,255,.28)', fontSize: 28, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <span>+</span>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.06em' }}>PHOTO</span>
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onImgChange} />
          </div>

          {/* Title */}
          <div style={{ marginBottom: 16 }}>
            {label('Title *')}
            <input className="mp-input" style={iSt} value={title} onChange={e => setTitle(e.target.value)} placeholder="What are you selling?" maxLength={100} />
          </div>

          {/* Description */}
          <div style={{ marginBottom: 16 }}>
            {label('Description')}
            <textarea className="mp-input" style={{ ...iSt, resize: 'vertical', minHeight: 72, lineHeight: 1.6 }} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe your item or service…" maxLength={500} />
          </div>

          {/* Price + Stock */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>{label('Price (AED) *')}<input className="mp-input" style={iSt} type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" /></div>
            <div>{label('Stock Qty')}<input className="mp-input" style={iSt} type="number" min="0" value={stock} onChange={e => setStock(e.target.value)} placeholder="1" /></div>
          </div>

          {/* Category */}
          <div style={{ marginBottom: 16 }}>
            {label('Category')}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {CATEGORIES.filter(c => c !== 'All').map(cat => {
                const sel = category === cat
                const cc = CAT_COLOR[cat] ?? '#6b7280'
                return (
                  <button type="button" key={cat} onClick={() => setCategory(cat)} className="mp-btn mp-cat-pill" style={{
                    padding: '6px 14px', borderRadius: 9999, fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                    background: sel ? `${cc}22` : 'rgba(255,255,255,.04)',
                    border: `1px solid ${sel ? cc + '55' : 'rgba(255,255,255,.08)'}`,
                    color: sel ? cc : 'rgba(255,255,255,.45)',
                    boxShadow: sel ? `0 2px 10px ${cc}33` : 'none',
                  }}>
                    {CAT_EMOJI[cat]} {cat}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Karak Points */}
          <div style={{ marginBottom: 22 }}>
            {label('⭐ Karak Points Reward')}
            <input className="mp-input" style={iSt} type="number" min="0" max="500" value={karakPts} onChange={e => setKarakPts(e.target.value)} placeholder="0" />
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.22)', marginTop: 6, lineHeight: 1.55 }}>
              Points awarded to buyer when you mark as delivered. Leave 0 for none.
            </div>
          </div>

          {err && <div style={{ padding: '10px 14px', borderRadius: 11, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.22)', color: '#f87171', fontSize: 12.5, marginBottom: 16 }}>{err}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '12px', borderRadius: 13, background: 'transparent', border: '1px solid rgba(255,255,255,.1)', color: 'rgba(255,255,255,.45)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button type="submit" disabled={saving} className="mp-btn"
              style={{ flex: 2, padding: '12px', borderRadius: 13, background: 'linear-gradient(135deg,#8a1538,#c0185c)', color: '#fff', fontSize: 14, fontWeight: 900, fontFamily: 'inherit', boxShadow: '0 4px 20px rgba(138,21,56,.55)' }}>
              {saving ? 'Listing…' : '🛍️ List Item'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

// ── Buy Modal ─────────────────────────────────────────────────────────────────

function BuyModal({ listing: l, buyerId, onClose, onOrdered }: {
  listing: Listing; buyerId: string; onClose: () => void; onOrdered: () => void
}) {
  const [qty, setQty]           = useState(1)
  const [location, setLocation] = useState('')
  const [phone, setPhone]       = useState('')
  const [notes, setNotes]       = useState('')
  const [placing, setPlacing]   = useState(false)
  const [err, setErr]           = useState('')
  const [done, setDone]         = useState(false)

  const maxQty = Math.min(l.stock_quantity, 10)
  const total = qty * l.price

  async function placeOrder(e: React.FormEvent) {
    e.preventDefault()
    if (!location.trim()) { setErr('Please enter your delivery location'); return }
    setPlacing(true); setErr('')
    const { error } = await supabase.from('marketplace_orders').insert({
      listing_id: l.id, buyer_id: buyerId, seller_id: l.seller_id,
      snapshot_title: l.title, snapshot_price: l.price, quantity: qty, total_price: total,
      delivery_location: location.trim(), buyer_phone: phone.trim() || null,
      notes: notes.trim() || null, karak_points_reward: l.karak_points_reward, status: 'pending',
    })
    setPlacing(false)
    if (error) { setErr(error.message); return }
    setDone(true)
  }

  const iSt: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,.05)',
    border: '1.5px solid rgba(255,255,255,.1)', borderRadius: 12, padding: '11px 14px',
    color: '#fff', fontSize: 13.5, fontFamily: 'inherit',
  }
  const label = (txt: string) => (
    <label style={{ display: 'block', fontSize: 10.5, fontWeight: 800, color: 'rgba(255,255,255,.38)', letterSpacing: '.08em', textTransform: 'uppercase' as const, marginBottom: 7 }}>{txt}</label>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(3,1,2,.9)', backdropFilter: 'blur(22px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 440, background: 'linear-gradient(170deg,#180a0e,#0d050a)', border: '1px solid rgba(138,21,56,.3)', borderRadius: 24, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,.9)', animation: 'mp-in .22s cubic-bezier(.22,1,.36,1) both' }}>
        <div style={{ height: 4, background: 'linear-gradient(90deg,#6b0f29,#c0185c,#e87ca0)' }} />

        {done ? (
          <div style={{ padding: '44px 28px', textAlign: 'center' }}>
            <div style={{ position: 'relative', display: 'inline-block', marginBottom: 20 }}>
              <div style={{ position: 'absolute', inset: -20, borderRadius: '50%', background: 'radial-gradient(circle,rgba(34,197,94,.2) 0%,transparent 70%)' }} />
              <div style={{ fontSize: 56, position: 'relative' }}>🎉</div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 8 }}>Order Placed!</div>
            <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,.5)', lineHeight: 1.7, marginBottom: 20 }}>
              Your order for <strong style={{ color: '#fff' }}>{l.title}</strong> was sent to the seller.
            </div>
            <div style={{ padding: '14px 18px', borderRadius: 16, background: 'rgba(233,193,118,.07)', border: '1px solid rgba(233,193,118,.2)', marginBottom: 24, textAlign: 'left' }}>
              <div style={{ fontSize: 13, color: '#e9c176', fontWeight: 800, marginBottom: 5 }}>💵 Cash on Delivery</div>
              <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.5)' }}>Pay <strong style={{ color: '#fff' }}>AED {total.toFixed(2)}</strong> in cash when your order arrives.</div>
            </div>
            <button onClick={onOrdered} style={{ width: '100%', padding: '13px', borderRadius: 13, border: 'none', background: 'linear-gradient(135deg,#8a1538,#c0185c)', color: '#fff', fontSize: 14, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 20px rgba(138,21,56,.5)' }}>
              View My Orders →
            </button>
          </div>
        ) : (
          <form onSubmit={placeOrder}>
            <div style={{ padding: '22px 24px 8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ fontSize: 17, fontWeight: 900, color: '#fff' }}>🛒 Place Order</div>
                <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.1)', borderRadius: '50%', width: 32, height: 32, color: 'rgba(255,255,255,.55)', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>✕</button>
              </div>

              {/* Listing summary */}
              <div style={{ display: 'flex', gap: 12, padding: '13px 14px', borderRadius: 16, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', marginBottom: 20 }}>
                <div style={{ width: 54, height: 54, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                  {l.images[0] ? <img src={l.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (CAT_EMOJI[l.category] ?? '🛍️')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)' }}>by {l.seller?.full_name ?? 'Seller'}</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', marginTop: 4 }}>AED {l.price.toFixed(2)} each</div>
                </div>
              </div>

              {/* Quantity */}
              <div style={{ marginBottom: 16 }}>
                {label('Quantity')}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <button type="button" onClick={() => setQty(q => Math.max(1, q - 1))}
                    style={{ width: 38, height: 38, borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', flexShrink: 0 }}>−</button>
                  <span style={{ fontSize: 20, fontWeight: 900, color: '#fff', minWidth: 28, textAlign: 'center' }}>{qty}</span>
                  <button type="button" onClick={() => setQty(q => Math.min(maxQty, q + 1))}
                    style={{ width: 38, height: 38, borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: '#fff', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', flexShrink: 0 }}>+</button>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,.4)', flex: 1 }}>
                    Total: <strong style={{ color: '#fff', fontSize: 15 }}>AED {total.toFixed(2)}</strong>
                  </span>
                </div>
              </div>

              {/* Location */}
              <div style={{ marginBottom: 14 }}>
                {label('Delivery Location *')}
                <input className="mp-input" style={iSt} value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Block C Room 204, Main Gate…" maxLength={200} />
              </div>

              {/* Phone */}
              <div style={{ marginBottom: 14 }}>
                {label('Phone (optional)')}
                <input className="mp-input" style={iSt} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+971 ···" />
              </div>

              {/* Notes */}
              <div style={{ marginBottom: 16 }}>
                {label('Notes (optional)')}
                <textarea className="mp-input" style={{ ...iSt, resize: 'none', height: 58, lineHeight: 1.55 }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any special instructions…" maxLength={300} />
              </div>

              {/* COD reminder */}
              <div style={{ padding: '12px 15px', borderRadius: 14, background: 'rgba(233,193,118,.06)', border: '1px solid rgba(233,193,118,.18)', marginBottom: 16, display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>💵</span>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: '#e9c176', marginBottom: 3 }}>Cash on Delivery</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', lineHeight: 1.55 }}>Pay AED {total.toFixed(2)} in cash when your order arrives.</div>
                </div>
              </div>

              {err && <div style={{ padding: '10px 14px', borderRadius: 11, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.22)', color: '#f87171', fontSize: 12.5, marginBottom: 14 }}>{err}</div>}
            </div>

            <div style={{ padding: '0 24px 24px', display: 'flex', gap: 10 }}>
              <button type="button" onClick={onClose} style={{ flex: 1, padding: '12px', borderRadius: 13, background: 'transparent', border: '1px solid rgba(255,255,255,.1)', color: 'rgba(255,255,255,.45)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button type="submit" disabled={placing} className="mp-btn"
                style={{ flex: 2, padding: '12px', borderRadius: 13, background: 'linear-gradient(135deg,#8a1538,#c0185c)', color: '#fff', fontSize: 14, fontWeight: 900, fontFamily: 'inherit', boxShadow: '0 4px 20px rgba(138,21,56,.55)' }}>
                {placing ? 'Placing…' : `Place Order · AED ${total.toFixed(2)}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
