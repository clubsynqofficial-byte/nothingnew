import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import CreateListingModal from './CreateListingModal'

interface Shop {
  id: string; owner_id: string; name: string; logo_url: string | null
  category: string | null; description: string | null
  links: Record<string, string>; created_at: string
  owner?: { full_name: string | null; avatar_url: string | null; id: string } | null
}

interface Listing {
  id: string; seller_id: string; title: string; description: string | null
  price: number; images: string[]; category: string
  stock_quantity: number; karak_points_reward: number; is_active: boolean; created_at: string
}

const CAT_COLOR: Record<string, string> = {
  'Food & Drinks':'#f59e0b','Clothing':'#8b5cf6','Electronics':'#3b82f6',
  'Books':'#10b981','Art & Crafts':'#ec4899','Beauty':'#f43f5e',
  'Services':'#06b6d4','Other':'#6b7280',
  'Clothing & Fashion':'#a855f7','Books & Notes':'#22c55e',
}

const CSS = `
  @keyframes sd-up { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:none} }
  @keyframes sd-in { from{opacity:0;transform:scale(.96) translateY(12px)} to{opacity:1;transform:none} }
  @keyframes sd-spin { to{transform:rotate(360deg)} }
  @keyframes sd-shimmer { from{background-position:-500px 0} to{background-position:500px 0} }
  .sd-card { background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07); border-radius:18px; overflow:hidden; cursor:pointer; transition:border-color .18s,transform .18s,box-shadow .18s; }
  .sd-card:hover { border-color:rgba(138,21,56,.45); transform:translateY(-4px); box-shadow:0 12px 40px rgba(0,0,0,.6); }
  .sd-card:hover .sd-img { transform:scale(1.04); }
  .sd-img { transition:transform .35s cubic-bezier(.22,1,.36,1); width:100%; height:100%; object-fit:cover; display:block; }
  .sd-shimmer { background:linear-gradient(90deg,rgba(255,255,255,.03) 25%,rgba(255,255,255,.08) 50%,rgba(255,255,255,.03) 75%); background-size:500px 100%; animation:sd-shimmer 1.5s ease-in-out infinite; border-radius:10px; }
  .sd-btn { border:none; cursor:pointer; transition:all .15s; }
  .sd-btn:hover:not(:disabled) { filter:brightness(1.1); transform:translateY(-1px); }
  .sd-btn:disabled { opacity:.4; cursor:not-allowed; }
  .sd-inp { outline:none; transition:border-color .15s; }
  .sd-inp:focus { border-color:rgba(138,21,56,.65) !important; }
  .sd-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:18px; }
`

function extractHandle(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/^\/+|\/+$/g, '')
    const last = path.split('/').pop() ?? ''
    return '@' + (last.startsWith('@') ? last.slice(1) : last)
  } catch {
    return '@' + url.replace(/^@/, '')
  }
}

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 30) return `${d}d ago`
  const m = Math.floor(d / 30)
  return m === 1 ? '1 month ago' : `${m} months ago`
}

export default function ShopDetailPage() {
  const { shopId } = useParams<{ shopId: string }>()
  const navigate   = useNavigate()
  const { user }   = useAuth()

  const [shop, setShop]           = useState<Shop | null>(null)
  const [listings, setListings]   = useState<Listing[]>([])
  const [loading, setLoading]     = useState(true)
  const [buyTarget, setBuyTarget]   = useState<Listing | null>(null)
  const [listOpen, setListOpen]     = useState(false)
  const [editOpen, setEditOpen]     = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]     = useState(false)

  async function fetchListings(ownerId: string) {
    const { data } = await supabase
      .from('marketplace_listings')
      .select('*')
      .eq('seller_id', ownerId)
      .order('created_at', { ascending: false })
    setListings((data ?? []) as unknown as Listing[])
  }

  useEffect(() => {
    if (!shopId) return
    setLoading(true)
    supabase.from('shops').select('*, owner:profiles!owner_id(id,full_name,avatar_url)').eq('id', shopId).maybeSingle()
      .then(async ({ data: shopData }) => {
        if (!shopData) { setLoading(false); return }
        setShop(shopData as unknown as Shop)
        await fetchListings((shopData as any).owner_id)
        setLoading(false)
      })
  }, [shopId])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh' }}>
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="2.5" style={{ animation:'sd-spin 0.8s linear infinite' }}><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" opacity=".2"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>
      <style>{CSS}</style>
    </div>
  )

  if (!shop) return (
    <div style={{ textAlign:'center', padding:'80px 20px' }}>
      <style>{CSS}</style>
      <div style={{ fontSize:40, marginBottom:16 }}>🏪</div>
      <div style={{ fontSize:18, fontWeight:800, color:'#fff', marginBottom:8 }}>Shop not found</div>
      <button onClick={() => navigate('/marketplace')} className="sd-btn"
        style={{ marginTop:16, padding:'10px 22px', borderRadius:12, background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.1)', color:'rgba(255,255,255,.7)', fontSize:13, fontWeight:600, fontFamily:'inherit' }}>
        ← Back to Market
      </button>
    </div>
  )

  const col = CAT_COLOR[shop.category ?? ''] ?? '#8a1538'
  const isOwn = user?.id === shop.owner_id

  async function handleDeleteShop() {
    if (!shop) return
    setDeleting(true)
    await supabase.from('shops').delete().eq('id', shop.id)
    navigate('/marketplace', { replace: true })
  }

  return (
    <div className="page-content" style={{ maxWidth:1000 }}>
      <style>{CSS}</style>

      {/* Back bar */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:24, animation:'sd-up .3s ease both' }}>
        <button onClick={() => navigate('/marketplace')} className="sd-btn"
          style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:9, background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.08)', color:'rgba(255,255,255,.55)', fontSize:13, fontWeight:500, fontFamily:'inherit' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          KaraQ Market
        </button>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        <span style={{ fontSize:13, color:'rgba(255,255,255,.4)' }}>{shop.name}</span>
      </div>

      {/* Shop header card */}
      <div style={{ borderRadius:20, border:'1px solid rgba(255,255,255,.08)', background:'#0c0a0b', overflow:'hidden', marginBottom:32, boxShadow:'0 16px 48px rgba(0,0,0,.45)', animation:'sd-up .35s cubic-bezier(.22,1,.36,1) .05s both' }}>
        <div style={{ height:4, background:`linear-gradient(90deg,${col},${col}60,transparent)` }}/>

        <div style={{ padding:'28px 28px 22px' }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap:20, flexWrap:'wrap' }}>
            {/* Logo */}
            <div style={{ width:80, height:80, borderRadius:20, flexShrink:0, overflow:'hidden', background:`${col}15`, border:`1.5px solid ${col}35`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 6px 24px ${col}20` }}>
              {shop.logo_url
                ? <img src={shop.logo_url} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                : <span style={{ fontSize:32 }}>🛍️</span>}
            </div>

            {/* Main info */}
            <div style={{ flex:1, minWidth:200 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:8 }}>
                <h1 style={{ fontSize:26, fontWeight:900, color:'#fff', margin:0, letterSpacing:'-0.5px' }}>{shop.name}</h1>
                {isOwn && (
                  <>
                    <span style={{ fontSize:10, fontWeight:800, color:col, background:`${col}15`, border:`1px solid ${col}35`, padding:'3px 9px', borderRadius:99, letterSpacing:'.06em' }}>YOUR SHOP</span>
                    <button onClick={() => setEditOpen(true)}
                      style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 13px', borderRadius:9, background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', color:'rgba(255,255,255,.6)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', transition:'all .15s' }}
                      onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,.1)'; e.currentTarget.style.color='#fff' }}
                      onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,.06)'; e.currentTarget.style.color='rgba(255,255,255,.6)' }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      Edit Shop
                    </button>
                    {confirmDelete ? (
                      <button onClick={handleDeleteShop} disabled={deleting}
                        style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 13px', borderRadius:9, background:'rgba(239,68,68,.15)', border:'1px solid rgba(239,68,68,.4)', color:'#f87171', fontSize:12, fontWeight:700, cursor:deleting?'not-allowed':'pointer', fontFamily:'inherit', transition:'all .15s' }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                        {deleting ? 'Deleting…' : 'Confirm Delete'}
                      </button>
                    ) : (
                      <button onClick={() => { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 4000) }}
                        style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 13px', borderRadius:9, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', color:'rgba(255,255,255,.35)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', transition:'all .15s' }}
                        onMouseEnter={e => { e.currentTarget.style.background='rgba(239,68,68,.1)'; e.currentTarget.style.borderColor='rgba(239,68,68,.3)'; e.currentTarget.style.color='#f87171' }}
                        onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,.04)'; e.currentTarget.style.borderColor='rgba(255,255,255,.08)'; e.currentTarget.style.color='rgba(255,255,255,.35)' }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                        Delete Shop
                      </button>
                    )}
                  </>
                )}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:12 }}>
                {shop.category && (
                  <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 12px', borderRadius:99, background:`${col}14`, border:`1px solid ${col}35`, fontSize:12, fontWeight:700, color:col }}>
                    {shop.category}
                  </span>
                )}
                <span style={{ fontSize:12, color:'rgba(255,255,255,.3)' }}>Opened {timeAgo(shop.created_at)}</span>
              </div>
              {/* Owner */}
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:26, height:26, borderRadius:'50%', background:'linear-gradient(135deg,#8a1538,#c0185c)', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:'0 2px 8px rgba(138,21,56,.4)' }}>
                  {shop.owner?.avatar_url
                    ? <img src={shop.owner.avatar_url} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                    : <span style={{ fontSize:10, fontWeight:800, color:'#fff' }}>{(shop.owner?.full_name ?? '?').charAt(0)}</span>}
                </div>
                <span style={{ fontSize:13, color:'rgba(255,255,255,.45)', fontWeight:500 }}>{shop.owner?.full_name ?? 'Seller'}</span>
              </div>
            </div>

            {/* Links */}
            <div style={{ display:'flex', flexDirection:'column', gap:8, flexShrink:0 }}>
              {shop.links?.instagram && (
                <a href={shop.links.instagram.startsWith('http') ? shop.links.instagram : `https://instagram.com/${shop.links.instagram.replace(/^@/,'')}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 13px', borderRadius:10, background:'rgba(225,48,108,.07)', border:'1px solid rgba(225,48,108,.2)', fontSize:12, fontWeight:600, color:'#e1306c', textDecoration:'none' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ig-sd" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#FCAF45"/><stop offset="100%" stopColor="#833AB4"/></linearGradient></defs><rect x="2" y="2" width="20" height="20" rx="5.5" stroke="url(#ig-sd)" strokeWidth="2.2"/><circle cx="12" cy="12" r="4.5" stroke="url(#ig-sd)" strokeWidth="2.2"/><circle cx="17.5" cy="6.5" r="1.2" fill="url(#ig-sd)"/></svg>
                  {extractHandle(shop.links.instagram)}
                </a>
              )}
              {shop.links?.website && (
                <a href={shop.links.website.startsWith('http') ? shop.links.website : `https://${shop.links.website}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 13px', borderRadius:10, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.1)', fontSize:12, fontWeight:600, color:'rgba(255,255,255,.5)', textDecoration:'none' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                  Website
                </a>
              )}
              {shop.links?.whatsapp && (
                <a href={`https://wa.me/${shop.links.whatsapp.replace(/\D/g,'')}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 13px', borderRadius:10, background:'rgba(37,211,102,.06)', border:'1px solid rgba(37,211,102,.18)', fontSize:12, fontWeight:600, color:'#25D366', textDecoration:'none' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
                  WhatsApp
                </a>
              )}
            </div>
          </div>

          {/* Description */}
          {shop.description && (
            <div style={{ marginTop:20, paddingTop:18, borderTop:'1px solid rgba(255,255,255,.06)' }}>
              <p style={{ fontSize:14, color:'rgba(255,255,255,.5)', lineHeight:1.75, margin:0, whiteSpace:'pre-wrap', overflowWrap:'break-word' }}>{shop.description}</p>
            </div>
          )}
        </div>

        {/* Stats strip */}
        <div style={{ borderTop:'1px solid rgba(255,255,255,.05)', display:'flex', gap:0 }}>
          {[
            { label:'Listings', value: listings.length.toString() },
            { label:'Status',   value: 'Active' },
            { label:'Delivery', value: 'On Campus' },
          ].map((s, i) => (
            <div key={i} style={{ flex:1, padding:'13px 20px', borderRight: i < 2 ? '1px solid rgba(255,255,255,.05)' : 'none', textAlign:'center' }}>
              <div style={{ fontSize:16, fontWeight:900, color:'#fff', marginBottom:2 }}>{s.value}</div>
              <div style={{ fontSize:10.5, color:'rgba(255,255,255,.3)', fontWeight:600, letterSpacing:'.04em', textTransform:'uppercase' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Listings */}
      <div style={{ animation:'sd-up .4s cubic-bezier(.22,1,.36,1) .12s both' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
          <h2 style={{ fontSize:17, fontWeight:800, color:'var(--text-primary)', margin:0 }}>
            Listings
            {listings.length > 0 && <span style={{ marginLeft:8, fontSize:12, padding:'3px 9px', borderRadius:7, background:`${col}14`, border:`1px solid ${col}28`, color:col, fontWeight:700 }}>{listings.length}</span>}
          </h2>
          {isOwn && (
            <button onClick={() => setListOpen(true)}
              style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 18px', borderRadius:11, border:'none', background:'linear-gradient(135deg,#8a1538,#c0185c)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', boxShadow:'0 4px 16px rgba(138,21,56,.4)', transition:'all .15s' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow='0 6px 24px rgba(138,21,56,.6)'; e.currentTarget.style.transform='translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow='0 4px 16px rgba(138,21,56,.4)'; e.currentTarget.style.transform='translateY(0)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              List Item
            </button>
          )}
        </div>

        {isOwn && listings.length > 0 && (
          <div style={{ fontSize:12, color:'rgba(255,255,255,.25)', marginBottom:14, display:'flex', alignItems:'center', gap:6 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            You're the owner — you can pause or delete your listings below.
          </div>
        )}
        {listings.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 20px', background:'rgba(255,255,255,.02)', borderRadius:16, border:'1px solid rgba(255,255,255,.06)' }}>
            <div style={{ fontSize:36, marginBottom:12 }}>📦</div>
            <div style={{ fontSize:16, fontWeight:700, color:'rgba(255,255,255,.5)', marginBottom:6 }}>No listings yet</div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,.25)', marginBottom: isOwn ? 20 : 0 }}>
              {isOwn ? 'Add your first item to start selling.' : "This shop hasn't added any items yet."}
            </div>
            {isOwn && (
              <button onClick={() => setListOpen(true)}
                style={{ padding:'10px 22px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#8a1538,#c0185c)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', boxShadow:'0 4px 14px rgba(138,21,56,.4)' }}>
                + List First Item
              </button>
            )}
          </div>
        ) : (
          <div className="sd-grid">
            {listings.map((l, i) => (
              <ShopListingCard key={l.id} listing={l} index={i}
                isOwn={isOwn}
                onBuy={() => setBuyTarget(l)}
                onToggle={async () => {
                  await supabase.from('marketplace_listings').update({ is_active: !l.is_active }).eq('id', l.id)
                  setListings(prev => prev.map(x => x.id === l.id ? { ...x, is_active: !x.is_active } : x))
                }}
                onDelete={async () => {
                  await supabase.from('marketplace_listings').delete().eq('id', l.id)
                  setListings(prev => prev.filter(x => x.id !== l.id))
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Buy modal */}
      {buyTarget && user && (
        <BuyModal listing={buyTarget} buyerId={user.id}
          onClose={() => setBuyTarget(null)}
          onOrdered={() => { setBuyTarget(null); navigate('/marketplace?tab=orders') }} />
      )}

      {/* List item modal */}
      {listOpen && user && (
        <CreateListingModal userId={user.id}
          onClose={() => setListOpen(false)}
          onCreated={() => { setListOpen(false); if (shop) fetchListings(shop.owner_id) }} />
      )}

      {/* Edit shop modal */}
      {editOpen && shop && (
        <EditShopModal shop={shop}
          onClose={() => setEditOpen(false)}
          onSaved={updated => { setShop(updated); setEditOpen(false) }} />
      )}
    </div>
  )
}

// ── Edit shop modal ───────────────────────────────────────────────────────────

const SHOP_CATEGORIES = ['Food & Drinks','Clothing','Electronics','Books','Art & Crafts','Beauty','Services','Other']

function EditShopModal({ shop, onClose, onSaved }: {
  shop: Shop; onClose: () => void; onSaved: (updated: Shop) => void
}) {
  const [name, setName]           = useState(shop.name)
  const [category, setCategory]   = useState(shop.category ?? 'Other')
  const [description, setDesc]    = useState(shop.description ?? '')
  const [instagram, setInstagram] = useState(shop.links?.instagram ?? '')
  const [website, setWebsite]     = useState(shop.links?.website ?? '')
  const [whatsapp, setWhatsapp]   = useState(shop.links?.whatsapp ?? '')
  const [logoFile, setLogoFile]   = useState<File | null>(null)
  const [logoPreview, setLogoPrev]= useState<string | null>(shop.logo_url)
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setLogoFile(f)
    const r = new FileReader()
    r.onload = () => setLogoPrev(r.result as string)
    r.readAsDataURL(f)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErr('Shop name is required'); return }
    setSaving(true); setErr('')

    let logo_url = shop.logo_url
    if (logoFile) {
      const ext = logoFile.name.split('.').pop() ?? 'jpg'
      const path = `${shop.owner_id}/shop-logo-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('marketplace').upload(path, logoFile, { contentType: logoFile.type })
      if (upErr) { setSaving(false); setErr('Logo upload failed: ' + upErr.message); return }
      logo_url = supabase.storage.from('marketplace').getPublicUrl(path).data.publicUrl
    }

    const links: Record<string, string> = {}
    if (instagram.trim()) links.instagram = instagram.trim()
    if (website.trim())   links.website   = website.trim()
    if (whatsapp.trim())  links.whatsapp  = whatsapp.trim()

    const { data, error } = await supabase.from('shops')
      .update({ name: name.trim(), category, description: description.trim() || null, logo_url, links })
      .eq('id', shop.id)
      .select('*, owner:profiles!owner_id(id,full_name,avatar_url)')
      .maybeSingle()

    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved(data as unknown as Shop)
  }

  const iSt: React.CSSProperties = {
    width:'100%', boxSizing:'border-box', background:'rgba(255,255,255,.05)',
    border:'1.5px solid rgba(255,255,255,.1)', borderRadius:12, padding:'11px 14px',
    color:'#fff', fontSize:13.5, fontFamily:'inherit', outline:'none',
  }
  const lbl = (txt: string) => (
    <label style={{ display:'block', fontSize:10.5, fontWeight:800, color:'rgba(255,255,255,.38)', letterSpacing:'.08em', textTransform:'uppercase' as const, marginBottom:7 }}>{txt}</label>
  )
  const col = CAT_COLOR[category] ?? '#8a1538'

  return (
    <div style={{ position:'fixed', inset:0, zIndex:9000, background:'rgba(3,1,2,.9)', backdropFilter:'blur(22px)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <form onSubmit={handleSave} style={{ width:'100%', maxWidth:500, background:'linear-gradient(170deg,#180a0e,#0d050a)', border:'1px solid rgba(138,21,56,.3)', borderRadius:24, overflow:'hidden', boxShadow:'0 40px 100px rgba(0,0,0,.9)', maxHeight:'92vh', overflowY:'auto', animation:'sd-in .22s cubic-bezier(.22,1,.36,1) both' }}>
        <div style={{ height:4, background:'linear-gradient(90deg,#6b0f29,#c0185c,#e87ca0)' }}/>
        <div style={{ padding:'24px 24px 28px' }}>

          {/* Header */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
            <div>
              <div style={{ fontSize:18, fontWeight:900, color:'#fff', marginBottom:2 }}>Edit Shop</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,.3)' }}>Changes go live immediately</div>
            </div>
            <button type="button" onClick={onClose}
              style={{ width:34, height:34, borderRadius:'50%', background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.1)', color:'rgba(255,255,255,.55)', fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'inherit' }}>✕</button>
          </div>

          {/* Logo */}
          <div style={{ marginBottom:20 }}>
            {lbl('Shop Logo')}
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={onLogoChange}/>
              <div onClick={() => fileRef.current?.click()}
                style={{ width:72, height:72, borderRadius:16, cursor:'pointer', overflow:'hidden', flexShrink:0, background: logoPreview ? 'transparent' : `${col}15`, border:`2px dashed ${col}45`, display:'flex', alignItems:'center', justifyContent:'center', transition:'all .2s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor=col }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor=`${col}45` }}>
                {logoPreview
                  ? <img src={logoPreview} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                  : <span style={{ fontSize:26 }}>🛍️</span>}
              </div>
              <div>
                <button type="button" onClick={() => fileRef.current?.click()}
                  style={{ padding:'7px 14px', borderRadius:9, background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', color:'rgba(255,255,255,.6)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', display:'block', marginBottom:6 }}>
                  Change Logo
                </button>
                <span style={{ fontSize:11, color:'rgba(255,255,255,.22)' }}>PNG, JPG — max 5MB</span>
              </div>
            </div>
          </div>

          {/* Name */}
          <div style={{ marginBottom:16 }}>
            {lbl('Shop Name *')}
            <input className="sd-inp" style={iSt} value={name} onChange={e => setName(e.target.value)} placeholder="Your shop name" maxLength={60}/>
          </div>

          {/* Category */}
          <div style={{ marginBottom:16 }}>
            {lbl('Category')}
            <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>
              {SHOP_CATEGORIES.map(cat => {
                const sel = category === cat
                const cc  = CAT_COLOR[cat] ?? '#6b7280'
                return (
                  <button type="button" key={cat} onClick={() => setCategory(cat)}
                    style={{ padding:'6px 14px', borderRadius:99, fontSize:12, fontWeight:600, fontFamily:'inherit', cursor:'pointer',
                      background: sel ? `${cc}22` : 'rgba(255,255,255,.04)',
                      border: `1px solid ${sel ? cc+'55' : 'rgba(255,255,255,.08)'}`,
                      color: sel ? cc : 'rgba(255,255,255,.4)',
                    }}>
                    {cat}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Description */}
          <div style={{ marginBottom:16 }}>
            {lbl('Description')}
            <textarea className="sd-inp" style={{ ...iSt, resize:'vertical', minHeight:80, lineHeight:1.6 }}
              value={description} onChange={e => setDesc(e.target.value)} placeholder="Tell people what your shop is about…" maxLength={400}/>
          </div>

          {/* Links */}
          <div style={{ marginBottom:8 }}>
            {lbl('Links')}
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ position:'relative' }}>
                <div style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', display:'flex' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ig-ed" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#FCAF45"/><stop offset="100%" stopColor="#833AB4"/></linearGradient></defs><rect x="2" y="2" width="20" height="20" rx="5.5" stroke="url(#ig-ed)" strokeWidth="2.2"/><circle cx="12" cy="12" r="4.5" stroke="url(#ig-ed)" strokeWidth="2.2"/><circle cx="17.5" cy="6.5" r="1.2" fill="url(#ig-ed)"/></svg>
                </div>
                <input className="sd-inp" style={{ ...iSt, paddingLeft:34 }} value={instagram} onChange={e => setInstagram(e.target.value)} placeholder="instagram.com/yourshop or @handle"/>
              </div>
              <div style={{ position:'relative' }}>
                <div style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', display:'flex' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                </div>
                <input className="sd-inp" style={{ ...iSt, paddingLeft:34 }} value={website} onChange={e => setWebsite(e.target.value)} placeholder="yourwebsite.com"/>
              </div>
              <div style={{ position:'relative' }}>
                <div style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', display:'flex' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
                </div>
                <input className="sd-inp" style={{ ...iSt, paddingLeft:34 }} value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="+971 50 123 4567"/>
              </div>
            </div>
          </div>

          {err && <div style={{ padding:'10px 14px', borderRadius:11, background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.22)', color:'#f87171', fontSize:12.5, margin:'16px 0' }}>{err}</div>}

          <div style={{ display:'flex', gap:10, marginTop:22 }}>
            <button type="button" onClick={onClose}
              style={{ flex:1, padding:'12px', borderRadius:13, background:'transparent', border:'1px solid rgba(255,255,255,.1)', color:'rgba(255,255,255,.45)', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              style={{ flex:2, padding:'12px', borderRadius:13, border:'none', background: saving ? 'rgba(138,21,56,.5)' : 'linear-gradient(135deg,#8a1538,#c0185c)', color:'#fff', fontSize:14, fontWeight:900, cursor: saving ? 'not-allowed' : 'pointer', fontFamily:'inherit', boxShadow:'0 4px 20px rgba(138,21,56,.5)' }}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

// ── Listing card ──────────────────────────────────────────────────────────────

function ShopListingCard({ listing: l, index, isOwn, onBuy, onToggle, onDelete }: {
  listing: Listing; index: number; isOwn: boolean
  onBuy: () => void; onToggle: () => void; onDelete: () => void
}) {
  const catColor = CAT_COLOR[l.category] ?? '#6b7280'
  const img        = l.images[0]
  const outOfStock = l.stock_quantity === 0
  const [confirmDel, setConfirmDel] = useState(false)

  return (
    <div className="sd-card" style={{ display:'flex', flexDirection:'column', opacity: isOwn && !l.is_active ? 0.55 : 1, animation:`sd-up .38s cubic-bezier(.22,1,.36,1) ${index * .04}s both` }}>
      <div style={{ height:200, position:'relative', overflow:'hidden', background:`linear-gradient(145deg,${catColor}33 0%,rgba(6,2,4,1) 100%)` }}>
        {img
          ? <img className="sd-img" src={img} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
          : <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:60, opacity:.15 }}>🛍️</div>}
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top,rgba(6,2,4,1) 0%,rgba(6,2,4,.5) 35%,transparent 65%)' }}/>
        <div style={{ position:'absolute', top:10, left:10, padding:'3px 9px', borderRadius:99, fontSize:10, fontWeight:800, background:'rgba(0,0,0,.55)', backdropFilter:'blur(8px)', color:catColor, border:`1px solid ${catColor}44` }}>
          {l.category}
        </div>
        {isOwn && (
          <div style={{ position:'absolute', top:10, right:10, padding:'3px 9px', borderRadius:99, fontSize:10, fontWeight:800,
            background: l.is_active ? 'rgba(34,197,94,.18)' : 'rgba(255,255,255,.08)',
            border: `1px solid ${l.is_active ? 'rgba(34,197,94,.35)' : 'rgba(255,255,255,.12)'}`,
            color: l.is_active ? '#4ade80' : 'rgba(255,255,255,.38)' }}>
            {l.is_active ? '● Active' : '○ Paused'}
          </div>
        )}
        {outOfStock && !isOwn && (
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ padding:'7px 16px', borderRadius:99, background:'rgba(239,68,68,.2)', border:'1px solid rgba(239,68,68,.4)', color:'#f87171', fontSize:12, fontWeight:800 }}>SOLD OUT</div>
          </div>
        )}
        <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'10px 13px' }}>
          <div style={{ fontSize:14, fontWeight:800, color:'#fff', lineHeight:1.3, marginBottom:3, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{l.title}</div>
          <div style={{ fontSize:19, fontWeight:900, color:'#fff', letterSpacing:'-0.5px' }}>AED {l.price.toFixed(2)}</div>
        </div>
      </div>
      <div style={{ padding:'12px 14px 14px', flex:1, display:'flex', flexDirection:'column', gap:8 }}>
        {l.description && (
          <p style={{ fontSize:12.5, color:'rgba(255,255,255,.4)', margin:0, lineHeight:1.5, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', whiteSpace:'pre-wrap', overflowWrap:'break-word' }}>{l.description}</p>
        )}
        {!outOfStock && l.stock_quantity <= 5 && !isOwn && (
          <div style={{ fontSize:11.5, color:'#fb923c', fontWeight:700 }}>🔥 Only {l.stock_quantity} left</div>
        )}
        {isOwn && (
          <div style={{ fontSize:11.5, color:'rgba(255,255,255,.28)' }}>
            {l.stock_quantity} in stock
          </div>
        )}
        <div style={{ flex:1 }}/>
        {isOwn ? (
          <div style={{ display:'flex', gap:7 }}>
            <button onClick={e => { e.stopPropagation(); onToggle() }} className="sd-btn"
              style={{ flex:1, padding:'9px', borderRadius:10, fontFamily:'inherit', fontSize:12, fontWeight:700,
                background: l.is_active ? 'rgba(255,255,255,.06)' : 'rgba(34,197,94,.1)',
                border: `1px solid ${l.is_active ? 'rgba(255,255,255,.1)' : 'rgba(34,197,94,.25)'}`,
                color: l.is_active ? 'rgba(255,255,255,.45)' : '#4ade80' }}>
              {l.is_active ? 'Pause' : 'Activate'}
            </button>
            {confirmDel ? (
              <button onClick={e => { e.stopPropagation(); onDelete() }} className="sd-btn"
                style={{ flex:1, padding:'9px', borderRadius:10, fontFamily:'inherit', fontSize:12, fontWeight:700, background:'rgba(239,68,68,.15)', border:'1px solid rgba(239,68,68,.35)', color:'#f87171' }}>
                Confirm?
              </button>
            ) : (
              <button onClick={e => { e.stopPropagation(); setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3000) }} className="sd-btn"
                style={{ padding:'9px 12px', borderRadius:10, fontFamily:'inherit', fontSize:12, fontWeight:700, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', color:'rgba(255,255,255,.3)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              </button>
            )}
          </div>
        ) : (
          <button onClick={e => { e.stopPropagation(); onBuy() }} disabled={outOfStock} className="sd-btn"
            style={{ width:'100%', padding:'11px', borderRadius:12, fontFamily:'inherit',
              background: outOfStock ? 'rgba(255,255,255,.05)' : 'linear-gradient(135deg,#8a1538,#c0185c)',
              color: outOfStock ? 'rgba(255,255,255,.3)' : '#fff', fontSize:13.5, fontWeight:800,
              boxShadow: !outOfStock ? '0 4px 16px rgba(138,21,56,.45)' : 'none',
              border: outOfStock ? '1px solid rgba(255,255,255,.07)' : 'none' }}>
            {outOfStock ? 'Out of Stock' : '🛒 Buy Now'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Buy modal ─────────────────────────────────────────────────────────────────

function BuyModal({ listing: l, buyerId, onClose, onOrdered }: {
  listing: Listing; buyerId: string; onClose: () => void; onOrdered: () => void
}) {
  const [qty, setQty]         = useState(1)
  const [location, setLoc]    = useState('')
  const [phone, setPhone]     = useState('')
  const [notes, setNotes]     = useState('')
  const [placing, setPlacing] = useState(false)
  const [err, setErr]         = useState('')
  const [done, setDone]       = useState(false)

  const maxQty = Math.min(l.stock_quantity, 10)
  const total  = qty * l.price

  const iSt: React.CSSProperties = {
    width:'100%', boxSizing:'border-box', background:'rgba(255,255,255,.05)',
    border:'1.5px solid rgba(255,255,255,.1)', borderRadius:12, padding:'11px 14px',
    color:'#fff', fontSize:13.5, fontFamily:'inherit',
  }

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

  return (
    <div style={{ position:'fixed', inset:0, zIndex:9000, background:'rgba(3,1,2,.9)', backdropFilter:'blur(22px)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width:'100%', maxWidth:440, background:'linear-gradient(170deg,#180a0e,#0d050a)', border:'1px solid rgba(138,21,56,.3)', borderRadius:24, overflow:'hidden', boxShadow:'0 40px 100px rgba(0,0,0,.9)', animation:'sd-in .22s cubic-bezier(.22,1,.36,1) both' }}>
        <div style={{ height:4, background:'linear-gradient(90deg,#6b0f29,#c0185c,#e87ca0)' }}/>
        {done ? (
          <div style={{ padding:'44px 28px', textAlign:'center' }}>
            <div style={{ fontSize:52, marginBottom:16 }}>🎉</div>
            <div style={{ fontSize:22, fontWeight:900, color:'#fff', marginBottom:8 }}>Order Placed!</div>
            <div style={{ fontSize:13.5, color:'rgba(255,255,255,.5)', lineHeight:1.7, marginBottom:20 }}>
              Your order for <strong style={{ color:'#fff' }}>{l.title}</strong> was sent to the seller.
            </div>
            <div style={{ padding:'13px 16px', borderRadius:14, background:'rgba(233,193,118,.07)', border:'1px solid rgba(233,193,118,.2)', marginBottom:24, textAlign:'left' }}>
              <div style={{ fontSize:12.5, fontWeight:800, color:'#e9c176', marginBottom:4 }}>💵 Cash on Delivery</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,.5)' }}>Pay <strong style={{ color:'#fff' }}>AED {total.toFixed(2)}</strong> when your order arrives.</div>
            </div>
            <button onClick={onOrdered} className="sd-btn"
              style={{ width:'100%', padding:'13px', borderRadius:13, background:'linear-gradient(135deg,#8a1538,#c0185c)', color:'#fff', fontSize:14, fontWeight:900, fontFamily:'inherit', boxShadow:'0 4px 20px rgba(138,21,56,.5)' }}>
              View My Orders →
            </button>
          </div>
        ) : (
          <form onSubmit={placeOrder}>
            <div style={{ padding:'22px 24px 20px' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
                <div style={{ fontSize:17, fontWeight:900, color:'#fff' }}>🛒 Place Order</div>
                <button type="button" onClick={onClose} className="sd-btn"
                  style={{ width:32, height:32, borderRadius:'50%', background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.1)', color:'rgba(255,255,255,.55)', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'inherit' }}>✕</button>
              </div>
              {/* Listing summary */}
              <div style={{ display:'flex', gap:12, padding:'12px 13px', borderRadius:14, background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.08)', marginBottom:18 }}>
                <div style={{ width:52, height:52, borderRadius:11, overflow:'hidden', flexShrink:0, background:'rgba(255,255,255,.07)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>
                  {l.images[0] ? <img src={l.images[0]} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : '🛍️'}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:800, color:'#fff', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.title}</div>
                  <div style={{ fontSize:15, fontWeight:900, color:'#fff', marginTop:4 }}>AED {l.price.toFixed(2)} each</div>
                </div>
              </div>
              {/* Qty */}
              <div style={{ marginBottom:14 }}>
                <label style={{ display:'block', fontSize:10.5, fontWeight:800, color:'rgba(255,255,255,.38)', letterSpacing:'.08em', textTransform:'uppercase', marginBottom:7 }}>Quantity</label>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <button type="button" onClick={() => setQty(q => Math.max(1, q-1))} className="sd-btn"
                    style={{ width:36, height:36, borderRadius:10, border:'1px solid rgba(255,255,255,.12)', background:'rgba(255,255,255,.06)', color:'#fff', fontSize:20, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'inherit' }}>−</button>
                  <span style={{ fontSize:20, fontWeight:900, color:'#fff', minWidth:26, textAlign:'center' }}>{qty}</span>
                  <button type="button" onClick={() => setQty(q => Math.min(maxQty, q+1))} className="sd-btn"
                    style={{ width:36, height:36, borderRadius:10, border:'1px solid rgba(255,255,255,.12)', background:'rgba(255,255,255,.06)', color:'#fff', fontSize:20, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'inherit' }}>+</button>
                  <span style={{ fontSize:13, color:'rgba(255,255,255,.4)', flex:1 }}>Total: <strong style={{ color:'#fff', fontSize:15 }}>AED {total.toFixed(2)}</strong></span>
                </div>
              </div>
              {/* Location */}
              <div style={{ marginBottom:12 }}>
                <label style={{ display:'block', fontSize:10.5, fontWeight:800, color:'rgba(255,255,255,.38)', letterSpacing:'.08em', textTransform:'uppercase', marginBottom:7 }}>Delivery Location *</label>
                <input className="sd-inp" style={iSt} value={location} onChange={e => setLoc(e.target.value)} placeholder="e.g. Block C Room 204, Main Gate…" maxLength={200}/>
              </div>
              {/* Phone */}
              <div style={{ marginBottom:12 }}>
                <label style={{ display:'block', fontSize:10.5, fontWeight:800, color:'rgba(255,255,255,.38)', letterSpacing:'.08em', textTransform:'uppercase', marginBottom:7 }}>Phone (optional)</label>
                <input className="sd-inp" style={iSt} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+971 ···"/>
              </div>
              {/* Notes */}
              <div style={{ marginBottom:16 }}>
                <label style={{ display:'block', fontSize:10.5, fontWeight:800, color:'rgba(255,255,255,.38)', letterSpacing:'.08em', textTransform:'uppercase', marginBottom:7 }}>Notes (optional)</label>
                <textarea className="sd-inp" style={{ ...iSt, resize:'none', height:56, lineHeight:1.55 }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any special instructions…" maxLength={300}/>
              </div>
              {/* COD note */}
              <div style={{ padding:'11px 14px', borderRadius:12, background:'rgba(233,193,118,.06)', border:'1px solid rgba(233,193,118,.18)', marginBottom:16, display:'flex', gap:10 }}>
                <span style={{ fontSize:17, flexShrink:0 }}>💵</span>
                <div>
                  <div style={{ fontSize:12, fontWeight:800, color:'#e9c176', marginBottom:2 }}>Cash on Delivery</div>
                  <div style={{ fontSize:11.5, color:'rgba(255,255,255,.4)' }}>Pay in cash when your order arrives on campus.</div>
                </div>
              </div>
              {err && <p style={{ fontSize:12.5, color:'#f87171', marginBottom:10 }}>{err}</p>}
              <button type="submit" disabled={placing} className="sd-btn"
                style={{ width:'100%', padding:'13px', borderRadius:13, background:'linear-gradient(135deg,#8a1538,#c0185c)', color:'#fff', fontSize:14, fontWeight:900, fontFamily:'inherit', boxShadow:'0 4px 18px rgba(138,21,56,.45)' }}>
                {placing ? 'Placing…' : `Confirm Order · AED ${total.toFixed(2)}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
