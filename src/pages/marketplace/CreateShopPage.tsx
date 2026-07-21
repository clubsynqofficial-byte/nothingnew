import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// ── Category SVG icons ─────────────────────────────────────────────────────────
const CAT_ICONS: Record<string, React.ReactNode> = {
  'Food & Drinks': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
      <line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
    </svg>
  ),
  'Clothing': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.57a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.57a2 2 0 0 0-1.34-2.23z"/>
    </svg>
  ),
  'Electronics': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  ),
  'Books': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  ),
  'Art & Crafts': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
    </svg>
  ),
  'Beauty': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3c-1 3-4 4.5-4 8a4 4 0 0 0 8 0c0-3.5-3-5-4-8z"/><path d="M12 15v6"/><path d="M9 18h6"/>
    </svg>
  ),
  'Services': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14M12 2v2m0 16v2M2 12h2m16 0h2"/>
    </svg>
  ),
  'Other': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    </svg>
  ),
}

const DUMMY_ITEMS: Record<string, { name: string; price: number; img: string; rating: number; sold: number }[]> = {
  'Food & Drinks': [
    { name:'Homemade Biryani',  price:25, img:'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=400&h=300&fit=crop', rating:4.8, sold:34 },
    { name:'Karak Chai Box',    price:10, img:'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400&h=300&fit=crop', rating:4.9, sold:120 },
    { name:'Fresh Juice Pack',  price:15, img:'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop', rating:4.7, sold:56 },
    { name:'Samosa Platter',    price:18, img:'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=400&h=300&fit=crop', rating:4.6, sold:28 },
  ],
  'Clothing': [
    { name:'Campus Hoodie',     price:85,  img:'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400&h=300&fit=crop', rating:4.9, sold:67 },
    { name:'Vintage Tee',       price:45,  img:'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400&h=300&fit=crop', rating:4.7, sold:43 },
    { name:'Denim Jacket',      price:120, img:'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400&h=300&fit=crop', rating:4.8, sold:19 },
    { name:'Embroidered Cap',   price:35,  img:'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=400&h=300&fit=crop', rating:4.5, sold:88 },
  ],
  'Electronics': [
    { name:'USB-C Hub',         price:60, img:'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=400&h=300&fit=crop', rating:4.6, sold:31 },
    { name:'Phone Stand',       price:22, img:'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=400&h=300&fit=crop', rating:4.4, sold:74 },
    { name:'Cable Set',         price:30, img:'https://images.unsplash.com/photo-1526925539332-aa3b66e35444?w=400&h=300&fit=crop', rating:4.7, sold:52 },
    { name:'Laptop Sleeve',     price:50, img:'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400&h=300&fit=crop', rating:4.8, sold:22 },
  ],
  'Books': [
    { name:'Calculus Vol. 1',   price:40, img:'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400&h=300&fit=crop', rating:4.5, sold:15 },
    { name:'Design Thinking',   price:55, img:'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=400&h=300&fit=crop', rating:4.9, sold:38 },
    { name:'Novel Bundle ×3',   price:30, img:'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=400&h=300&fit=crop', rating:4.7, sold:61 },
    { name:'Study Planner',     price:20, img:'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=400&h=300&fit=crop', rating:4.8, sold:44 },
  ],
  'Art & Crafts': [
    { name:'Resin Keychain',    price:18, img:'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=400&h=300&fit=crop', rating:4.9, sold:92 },
    { name:'Custom Portrait',   price:80, img:'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=400&h=300&fit=crop', rating:5.0, sold:17 },
    { name:'Sticker Pack',      price:12, img:'https://images.unsplash.com/photo-1516383740770-fbcc5ccbece0?w=400&h=300&fit=crop', rating:4.6, sold:110 },
    { name:'Sketchbook A4',     price:28, img:'https://images.unsplash.com/photo-1455390582262-044cdead277a?w=400&h=300&fit=crop', rating:4.7, sold:29 },
  ],
  'Beauty': [
    { name:'Lip Gloss Set',     price:35, img:'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&h=300&fit=crop', rating:4.8, sold:76 },
    { name:'Face Serum',        price:65, img:'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400&h=300&fit=crop', rating:4.9, sold:41 },
    { name:'Scrunchie Bundle',  price:15, img:'https://images.unsplash.com/photo-1522338242992-e1a54906a8da?w=400&h=300&fit=crop', rating:4.7, sold:133 },
    { name:'Nail Kit',          price:40, img:'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=400&h=300&fit=crop', rating:4.5, sold:58 },
  ],
  'Services': [
    { name:'CV Review',         price:50,  img:'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=400&h=300&fit=crop', rating:4.9, sold:23 },
    { name:'Arabic Tutoring',   price:70,  img:'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=400&h=300&fit=crop', rating:5.0, sold:14 },
    { name:'Logo Design',       price:120, img:'https://images.unsplash.com/photo-1626785774573-4b799315345d?w=400&h=300&fit=crop', rating:4.8, sold:31 },
    { name:'Photo Editing',     price:45,  img:'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&h=300&fit=crop', rating:4.7, sold:48 },
  ],
  'Other': [
    { name:'Gift Box (S)',      price:30, img:'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=400&h=300&fit=crop', rating:4.6, sold:37 },
    { name:'Bundle Deal',       price:55, img:'https://images.unsplash.com/photo-1553729459-efe14ef6055d?w=400&h=300&fit=crop', rating:4.7, sold:19 },
    { name:'Mystery Box',       price:25, img:'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400&h=300&fit=crop', rating:4.5, sold:64 },
    { name:'Custom Order',      price:90, img:'https://images.unsplash.com/photo-1586769852836-bc069f19e1b6?w=400&h=300&fit=crop', rating:4.9, sold:11 },
  ],
}

const CATEGORIES: { label: string; color: string }[] = [
  { label: 'Food & Drinks', color: '#f59e0b' },
  { label: 'Clothing',      color: '#8b5cf6' },
  { label: 'Electronics',   color: '#3b82f6' },
  { label: 'Books',         color: '#10b981' },
  { label: 'Art & Crafts',  color: '#ec4899' },
  { label: 'Beauty',        color: '#f43f5e' },
  { label: 'Services',      color: '#06b6d4' },
  { label: 'Other',         color: '#6b7280' },
]

function extractHandle(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/^\/+|\/+$/g, '')
    const last = path.split('/').pop() ?? ''
    return '@' + (last.startsWith('@') ? last.slice(1) : last)
  } catch {
    return '@' + url.replace(/^@/, '')
  }
}

const sectionCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.025)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 16, padding: '22px 20px', marginBottom: 12,
}

const inputSt: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
  color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box', transition: 'border-color .15s, background .15s',
}

const labelSt: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700,
  color: 'rgba(255,255,255,0.35)', marginBottom: 8,
  letterSpacing: '0.08em', textTransform: 'uppercase',
}

export default function CreateShopPage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [name, setName]               = useState('')
  const [category, setCategory]       = useState(CATEGORIES[0].label)
  const [description, setDesc]        = useState('')
  const [logoFile, setLogoFile]       = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [instagram, setInstagram]     = useState('')
  const [website, setWebsite]         = useState('')
  const [whatsapp, setWhatsapp]       = useState('')
  const [saving, setSaving]           = useState(false)
  const [err, setErr]                 = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [checking, setChecking]       = useState(true)

  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!user) return
    supabase.from('shops').select('id').eq('owner_id', user.id).maybeSingle().then(({ data }) => {
      if (data) navigate('/marketplace?tab=manage', { replace: true })
      else setChecking(false)
    })
  }, [user, navigate])
  const activeCat = CATEGORIES.find(c => c.label === category) ?? CATEGORIES[0]

  function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setLogoFile(f)
    const r = new FileReader()
    r.onload = () => setLogoPreview(r.result as string)
    r.readAsDataURL(f)
  }

  if (checking) return null

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErr('Shop name is required'); return }
    setErr('')
    setShowPreview(true)
  }

  async function handleConfirm() {
    if (!user) return
    setSaving(true); setErr('')

    let logo_url: string | null = null
    if (logoFile) {
      const ext = logoFile.name.split('.').pop() ?? 'jpg'
      const path = `${user.id}/shop-logo-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('marketplace').upload(path, logoFile, { contentType: logoFile.type })
      if (!upErr)
        logo_url = supabase.storage.from('marketplace').getPublicUrl(path).data.publicUrl
    }

    const links: Record<string, string> = {}
    if (instagram.trim()) links.instagram = instagram.trim()
    if (website.trim())   links.website   = website.trim()
    if (whatsapp.trim())  links.whatsapp  = whatsapp.trim()

    const { error } = await supabase.from('shops').insert({
      owner_id: user.id, name: name.trim(), logo_url,
      category, description: description.trim() || null, links,
    })

    setSaving(false)
    if (error) { setErr(error.message); setShowPreview(false); return }
    navigate('/marketplace?tab=manage')
  }

  const col = activeCat.color
  const dummyItems = DUMMY_ITEMS[category] ?? DUMMY_ITEMS['Other']

  // ── Full-screen preview overlay ────────────────────────────────────────────
  if (showPreview) {
    return (
      <div style={{ minHeight:'100vh', background:'var(--bg-primary)', overflowY:'auto' }}>
        <style>{`
          @keyframes pvFadeIn { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
          @keyframes spin{to{transform:rotate(360deg)}}
          @media (max-width: 600px) {
            .cs-pv-top-bar { padding: 10px 14px !important; flex-wrap: wrap !important; gap: 8px !important; }
            .cs-pv-items-grid { grid-template-columns: repeat(2,1fr) !important; }
            .cs-pv-confirm { flex-direction: column !important; }
            .cs-pv-links { display: none !important; }
          }
        `}</style>

        {/* Sticky top bar */}
        <div className="cs-pv-top-bar" style={{ position:'sticky', top:0, zIndex:20, background:'rgba(12,8,10,0.92)', backdropFilter:'blur(20px)', borderBottom:'1px solid rgba(255,255,255,0.06)', padding:'12px 28px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <button onClick={() => setShowPreview(false)}
              style={{ display:'flex', alignItems:'center', gap:7, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.09)', borderRadius:9, padding:'7px 14px', color:'rgba(255,255,255,0.6)', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'inherit', transition:'all .15s' }}
              onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'}
              onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.05)'}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              Edit Details
            </button>
            <span style={{ fontSize:12, color:'rgba(255,255,255,0.25)', padding:'5px 10px', background:'rgba(255,255,255,0.04)', borderRadius:7, border:'1px solid rgba(255,255,255,0.07)' }}>Preview Mode</span>
          </div>
          <button onClick={handleConfirm} disabled={saving}
            style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 22px', borderRadius:10, border:'none', background:'linear-gradient(135deg,var(--accent),#c0294f)', color:'#fff', fontSize:14, fontWeight:700, cursor:saving?'not-allowed':'pointer', fontFamily:'inherit', opacity:saving?0.7:1, boxShadow:saving?'none':'0 4px 20px rgba(138,21,56,0.4)', transition:'all .2s' }}
            onMouseEnter={e => { if (!saving) e.currentTarget.style.boxShadow='0 6px 28px rgba(138,21,56,0.55)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow='0 4px 20px rgba(138,21,56,0.4)' }}>
            {saving
              ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation:'spin 0.8s linear infinite' }}><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" opacity=".25"/><path d="M21 12a9 9 0 0 0-9-9"/></svg> Creating…</>
              : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Confirm & Open Shop</>
            }
          </button>
        </div>

        <div style={{ maxWidth:900, margin:'0 auto', padding:'36px 24px', animation:'pvFadeIn 0.4s cubic-bezier(0.22,1,0.36,1) both' }}>

          {/* Prototype banner */}
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:24, padding:'11px 16px', borderRadius:12, background:'rgba(245,158,11,0.07)', border:'1px solid rgba(245,158,11,0.2)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <p style={{ fontSize:12.5, color:'rgba(245,158,11,0.85)', margin:0, fontWeight:500 }}>
              <strong style={{ fontWeight:800 }}>Prototype preview</strong> — this is how your shop will look. Listings shown are sample items only.
            </p>
          </div>

          {/* Shop card */}
          <div style={{ borderRadius:18, border:'1px solid rgba(255,255,255,0.08)', background:'#0c0a0b', overflow:'hidden', marginBottom:32, boxShadow:'0 16px 48px rgba(0,0,0,0.4)' }}>
            <div style={{ height:3, background:`linear-gradient(90deg,${col},${col}55,transparent)` }}/>
            <div style={{ display:'flex', alignItems:'center', gap:16, padding:'22px 22px 18px' }}>
              <div style={{ width:68, height:68, borderRadius:16, flexShrink:0, overflow:'hidden', background:`${col}14`, border:`1px solid ${col}30`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 4px 16px ${col}18` }}>
                {logoPreview ? <img src={logoPreview} style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <span style={{ color:col, opacity:0.5, display:'flex' }}>{CAT_ICONS[category]}</span>}
              </div>
              <div style={{ flex:1 }}>
                <h2 style={{ fontSize:22, fontWeight:900, color:'#fff', margin:'0 0 6px', letterSpacing:'-0.4px' }}>{name}</h2>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 10px', borderRadius:99, background:`${col}14`, border:`1px solid ${col}35`, fontSize:11, fontWeight:700, color:col }}>
                    <span style={{ display:'flex', transform:'scale(0.68)', transformOrigin:'center' }}>{CAT_ICONS[category]}</span>{category}
                  </span>
                  <span style={{ fontSize:12, color:'rgba(255,255,255,0.3)', display:'flex', alignItems:'center', gap:4 }}>
                    <div style={{ width:16, height:16, borderRadius:'50%', background:'rgba(255,255,255,0.08)', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {profile?.avatar_url ? <img src={profile.avatar_url} style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>}
                    </div>
                    {profile?.full_name ?? 'You'}
                  </span>
                </div>
              </div>
              <div className="cs-pv-links" style={{ display:'flex', gap:7, flexShrink:0 }}>
                {instagram && <div style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 11px', borderRadius:8, background:'rgba(225,48,108,0.08)', border:'1px solid rgba(225,48,108,0.18)', fontSize:11.5, fontWeight:600, color:'#e1306c' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="fs-ig" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#FCAF45"/><stop offset="100%" stopColor="#833AB4"/></linearGradient></defs><rect x="2" y="2" width="20" height="20" rx="5.5" stroke="url(#fs-ig)" strokeWidth="2.2"/><circle cx="12" cy="12" r="4.5" stroke="url(#fs-ig)" strokeWidth="2.2"/><circle cx="17.5" cy="6.5" r="1.2" fill="url(#fs-ig)"/></svg>
                  {extractHandle(instagram)}
                </div>}
                {website && <div style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 11px', borderRadius:8, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.09)', fontSize:11.5, fontWeight:600, color:'rgba(255,255,255,0.45)' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                  Website
                </div>}
                {whatsapp && <div style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 11px', borderRadius:8, background:'rgba(37,211,102,0.07)', border:'1px solid rgba(37,211,102,0.16)', fontSize:11.5, fontWeight:600, color:'#25D366' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
                  WhatsApp
                </div>}
              </div>
            </div>
            {description && (
              <div style={{ padding:'0 22px 18px' }}>
                <div style={{ height:1, background:'rgba(255,255,255,0.05)', marginBottom:14 }}/>
                <p style={{ fontSize:13.5, color:'rgba(255,255,255,0.45)', lineHeight:1.75, margin:0, whiteSpace:'pre-wrap', overflowWrap:'break-word' }}>{description}</p>
              </div>
            )}
          </div>

          {/* Listings section */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
            <div>
              <h3 style={{ fontSize:17, fontWeight:800, color:'var(--text-primary)', margin:'0 0 2px' }}>Listings</h3>
              <p style={{ fontSize:12, color:'rgba(255,255,255,0.25)', margin:0 }}>Sample items — yours will appear here after you add them</p>
            </div>
            <span style={{ fontSize:11, padding:'4px 10px', borderRadius:7, background:`${col}12`, border:`1px solid ${col}28`, color:col, fontWeight:600 }}>
              {dummyItems.length} items
            </span>
          </div>

          <div className="cs-pv-items-grid" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
            {dummyItems.map((item, i) => (
              <div key={i} style={{ borderRadius:14, overflow:'hidden', background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)', transition:'transform .18s, border-color .18s', cursor:'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform='translateY(-3px)'; (e.currentTarget as HTMLDivElement).style.borderColor=`${col}40` }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform='translateY(0)'; (e.currentTarget as HTMLDivElement).style.borderColor='rgba(255,255,255,0.07)' }}>
                {/* Product image */}
                <div style={{ height:150, position:'relative', overflow:'hidden', background:`${col}10` }}>
                  <img src={item.img} alt={item.name}
                    style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display='none' }}/>
                  <div style={{ position:'absolute', inset:0, background:'linear-gradient(180deg,transparent 55%,rgba(0,0,0,0.55) 100%)' }}/>
                  <div style={{ position:'absolute', top:8, left:8, fontSize:10, fontWeight:700, color:'#fff', background:'rgba(0,0,0,0.55)', backdropFilter:'blur(6px)', padding:'3px 8px', borderRadius:6 }}>
                    QAR {item.price}
                  </div>
                  {item.sold > 50 && (
                    <div style={{ position:'absolute', top:8, right:8, fontSize:9, fontWeight:800, color:'#fff', background:`${col}`, padding:'2px 7px', borderRadius:5, letterSpacing:'0.05em' }}>
                      HOT
                    </div>
                  )}
                </div>
                {/* Info */}
                <div style={{ padding:'11px 12px 13px' }}>
                  <p style={{ fontSize:12.5, fontWeight:600, color:'rgba(255,255,255,0.82)', margin:'0 0 7px', lineHeight:1.3 }}>{item.name}</p>
                  <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:10 }}>
                    <div style={{ display:'flex', gap:1 }}>
                      {[1,2,3,4,5].map(s => (
                        <svg key={s} width="9" height="9" viewBox="0 0 24 24" fill={s <= Math.round(item.rating) ? '#f59e0b' : 'rgba(255,255,255,0.15)'}>
                          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
                        </svg>
                      ))}
                    </div>
                    <span style={{ fontSize:10, color:'rgba(255,255,255,0.3)', fontWeight:500 }}>{item.rating.toFixed(1)}</span>
                    <span style={{ fontSize:10, color:'rgba(255,255,255,0.2)' }}>·</span>
                    <span style={{ fontSize:10, color:'rgba(255,255,255,0.28)' }}>{item.sold} sold</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span style={{ fontSize:15, fontWeight:800, color:'#fff' }}>QAR {item.price}</span>
                    <button style={{ fontSize:11, fontWeight:700, padding:'5px 12px', borderRadius:7, background:`${col}`, border:'none', color:'#fff', cursor:'pointer', fontFamily:'inherit', boxShadow:`0 2px 8px ${col}40` }}>
                      Buy
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom confirm */}
          <div className="cs-pv-confirm" style={{ marginTop:36, padding:'20px 24px', borderRadius:16, background:'rgba(138,21,56,0.07)', border:'1px solid rgba(138,21,56,0.18)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:16 }}>
            <div>
              <p style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)', margin:'0 0 3px' }}>Looks good?</p>
              <p style={{ fontSize:12.5, color:'rgba(255,255,255,0.35)', margin:0 }}>Once you confirm, your shop will go live and you can start adding real listings.</p>
            </div>
            <button onClick={handleConfirm} disabled={saving}
              style={{ flexShrink:0, padding:'11px 28px', borderRadius:11, border:'none', background:'linear-gradient(135deg,var(--accent),#c0294f)', color:'#fff', fontSize:14, fontWeight:700, cursor:saving?'not-allowed':'pointer', fontFamily:'inherit', opacity:saving?0.7:1, whiteSpace:'nowrap', boxShadow:'0 4px 20px rgba(138,21,56,0.35)', transition:'all .2s' }}
              onMouseEnter={e => { if (!saving) e.currentTarget.style.boxShadow='0 6px 28px rgba(138,21,56,0.55)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow='0 4px 20px rgba(138,21,56,0.35)' }}>
              {saving ? 'Creating…' : 'Confirm & Open Shop →'}
            </button>
          </div>
          {err && <p style={{ fontSize:13, color:'#f87171', marginTop:12, textAlign:'center' }}>{err}</p>}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <style>{`
        .cs-inp:focus { border-color: rgba(138,21,56,0.7) !important; background: rgba(255,255,255,0.07) !important; }
        .cs-inp::placeholder { color: rgba(255,255,255,0.18); }
        .cs-cat:hover { transform: translateY(-1px); }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes previewIn { from { opacity:0; transform:translateY(12px) scale(0.98); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0%,100% { opacity:.5 } 50% { opacity:1 } }
        @media (max-width: 800px) {
          .cs-main-grid { grid-template-columns: 1fr !important; padding: 24px 16px !important; }
          .cs-live-preview { display: none !important; }
          .cs-top-bar { padding: 12px 16px !important; }
          .cs-cat-grid { grid-template-columns: repeat(2,1fr) !important; }
        }
      `}</style>

      {/* Top bar */}
      <div className="cs-top-bar" style={{ borderBottom:'1px solid rgba(255,255,255,0.06)', padding:'14px 32px', display:'flex', alignItems:'center', gap:10, background:'rgba(12,8,10,0.85)', backdropFilter:'blur(20px)', position:'sticky', top:0, zIndex:20 }}>
        <button onClick={() => navigate('/marketplace')}
          style={{ display:'flex', alignItems:'center', justifyContent:'center', width:30, height:30, borderRadius:8, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', cursor:'pointer', color:'var(--text-muted)', transition:'background .15s', flexShrink:0 }}
          onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.1)'}
          onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.05)'}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ width:1, height:16, background:'rgba(255,255,255,0.08)' }}/>
        <span style={{ fontSize:13, color:'rgba(255,255,255,0.35)' }}>KaraQ Market</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        <span style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)' }}>Create Shop</span>
      </div>

      <div className="cs-main-grid" style={{ maxWidth:1100, margin:'0 auto', padding:'36px 28px', display:'grid', gridTemplateColumns:'minmax(0,1fr) 400px', gap:36, alignItems:'start' }}>

        {/* ── FORM ── */}
        <div style={{ animation:'fadeUp 0.4s cubic-bezier(0.22,1,0.36,1) both' }}>
          <div style={{ marginBottom:26 }}>
            <h1 style={{ fontSize:27, fontWeight:900, color:'var(--text-primary)', margin:'0 0 5px', letterSpacing:'-0.5px' }}>Open your shop</h1>
            <p style={{ fontSize:13.5, color:'var(--text-muted)', margin:0 }}>Sell to students across campus — takes under 2 minutes.</p>
          </div>

          <form onSubmit={handleSubmit}>

            {/* Identity */}
            <div style={sectionCard}>
              <p style={{ fontSize:11, fontWeight:700, color:'var(--accent)', letterSpacing:'0.07em', textTransform:'uppercase', margin:'0 0 18px' }}>Shop Identity</p>
              <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
                <div>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={onLogoChange}/>
                  <div onClick={() => fileRef.current?.click()}
                    style={{ width:76, height:76, borderRadius:18, cursor:'pointer', overflow:'hidden', flexShrink:0, position:'relative', background: logoPreview ? 'transparent' : `${col}15`, border:`2px dashed ${col}50`, display:'flex', alignItems:'center', justifyContent:'center', transition:'all .2s' }}
                    onMouseEnter={e => { if (!logoPreview) { const d = e.currentTarget as HTMLDivElement; d.style.borderColor=col+'99'; d.style.background=col+'25' }}}
                    onMouseLeave={e => { if (!logoPreview) { const d = e.currentTarget as HTMLDivElement; d.style.borderColor=col+'50'; d.style.background=col+'15' }}}>
                    {logoPreview
                      ? <img src={logoPreview} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                      : <div style={{ color:col, opacity:0.5, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                          </svg>
                          <span style={{ fontSize:8, fontWeight:800, letterSpacing:'0.06em' }}>LOGO</span>
                        </div>
                    }
                  </div>
                </div>
                <div style={{ flex:1 }}>
                  <label style={labelSt}>Shop Name <span style={{ color:'var(--accent)' }}>*</span></label>
                  <input className="cs-inp" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Noor's Kitchen, Gear Hub…" style={inputSt}/>
                  <p style={{ fontSize:11, color:'rgba(255,255,255,0.18)', margin:'6px 0 0' }}>Click the square to upload your logo</p>
                </div>
              </div>
            </div>

            {/* Category */}
            <div style={sectionCard}>
              <p style={{ fontSize:11, fontWeight:700, color:'var(--accent)', letterSpacing:'0.07em', textTransform:'uppercase', margin:'0 0 16px' }}>Category</p>
              <div className="cs-cat-grid" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
                {CATEGORIES.map(c => {
                  const active = category === c.label
                  return (
                    <button key={c.label} type="button" className="cs-cat"
                      onClick={() => setCategory(c.label)}
                      style={{ padding:'12px 6px', borderRadius:13, display:'flex', flexDirection:'column', alignItems:'center', gap:7, cursor:'pointer', fontFamily:'inherit', transition:'all .18s', background: active ? `${c.color}1a` : 'rgba(255,255,255,0.02)', border: active ? `1.5px solid ${c.color}55` : '1.5px solid rgba(255,255,255,0.06)', boxShadow: active ? `0 0 20px ${c.color}1a` : 'none', color: active ? c.color : 'rgba(255,255,255,0.3)' }}>
                      <span style={{ display:'flex', color: active ? c.color : 'rgba(255,255,255,0.28)', transition:'color .18s' }}>{CAT_ICONS[c.label]}</span>
                      <span style={{ fontSize:10, fontWeight: active ? 700 : 500, textAlign:'center', lineHeight:1.2 }}>{c.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* About */}
            <div style={sectionCard}>
              <p style={{ fontSize:11, fontWeight:700, color:'var(--accent)', letterSpacing:'0.07em', textTransform:'uppercase', margin:'0 0 16px' }}>About</p>
              <label style={labelSt}>Description</label>
              <textarea className="cs-inp" value={description} onChange={e => setDesc(e.target.value)} placeholder="What do you sell? What makes your shop special?" rows={4} style={{ ...inputSt, resize:'vertical', lineHeight:1.65 }}/>
            </div>

            {/* Links */}
            <div style={sectionCard}>
              <p style={{ fontSize:11, fontWeight:700, color:'var(--accent)', letterSpacing:'0.07em', textTransform:'uppercase', margin:'0 0 16px' }}>
                Links <span style={{ fontSize:10, color:'rgba(255,255,255,0.18)', fontWeight:400, textTransform:'none', letterSpacing:0 }}>optional</span>
              </p>
              <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, background:'rgba(225,48,108,0.04)', border:'1px solid rgba(225,48,108,0.1)', borderRadius:11, padding:'3px 12px 3px 10px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink:0 }}>
                    <defs><linearGradient id="lnk-ig" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#FCAF45"/><stop offset="35%" stopColor="#FD1D1D"/><stop offset="70%" stopColor="#C13584"/><stop offset="100%" stopColor="#833AB4"/></linearGradient></defs>
                    <rect x="2" y="2" width="20" height="20" rx="5.5" stroke="url(#lnk-ig)" strokeWidth="2"/>
                    <circle cx="12" cy="12" r="4.5" stroke="url(#lnk-ig)" strokeWidth="2"/>
                    <circle cx="17.5" cy="6.5" r="1.2" fill="url(#lnk-ig)"/>
                  </svg>
                  <input className="cs-inp" value={instagram} onChange={e => setInstagram(e.target.value)} placeholder="https://instagram.com/yourshop" style={{ ...inputSt, background:'transparent', border:'none', padding:'9px 0', flex:1 }}/>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:11, padding:'3px 12px 3px 10px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}>
                    <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                  <input className="cs-inp" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://yourwebsite.com" style={{ ...inputSt, background:'transparent', border:'none', padding:'9px 0', flex:1 }}/>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10, background:'rgba(37,211,102,0.04)', border:'1px solid rgba(37,211,102,0.1)', borderRadius:11, padding:'3px 12px 3px 10px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366" style={{ flexShrink:0 }}>
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
                  </svg>
                  <input className="cs-inp" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="+974 XXXX XXXX" style={{ ...inputSt, background:'transparent', border:'none', padding:'9px 0', flex:1 }}/>
                </div>
              </div>
            </div>

            {err && (
              <div style={{ display:'flex', alignItems:'center', gap:10, fontSize:13, color:'#fca5a5', background:'rgba(248,113,113,0.07)', border:'1px solid rgba(248,113,113,0.15)', borderRadius:12, padding:'12px 16px', marginBottom:12 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {err}
              </div>
            )}

            <div style={{ display:'flex', gap:10 }}>
              <button type="button" onClick={() => navigate('/marketplace')}
                style={{ flex:1, padding:'13px', borderRadius:12, background:'transparent', border:'1px solid rgba(255,255,255,0.09)', color:'var(--text-muted)', fontSize:14, fontWeight:500, cursor:'pointer', fontFamily:'inherit', transition:'all .15s' }}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.18)' }}
                onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor='rgba(255,255,255,0.09)' }}>
                Cancel
              </button>
              <button type="submit" disabled={saving}
                style={{ flex:2, padding:'13px', borderRadius:12, border:'none', color:'#fff', fontSize:14, fontWeight:700, cursor:saving?'not-allowed':'pointer', fontFamily:'inherit', transition:'all .2s', background:'linear-gradient(135deg,var(--accent) 0%,#c0294f 100%)', opacity:saving?0.65:1, boxShadow:saving?'none':'0 4px 20px rgba(138,21,56,0.4)' }}
                onMouseEnter={e => { if (!saving) { e.currentTarget.style.boxShadow='0 6px 28px rgba(138,21,56,0.55)'; e.currentTarget.style.transform='translateY(-1px)' }}}
                onMouseLeave={e => { e.currentTarget.style.boxShadow='0 4px 20px rgba(138,21,56,0.4)'; e.currentTarget.style.transform='translateY(0)' }}>
                {saving
                  ? <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation:'spin 0.8s linear infinite' }}><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" opacity=".25"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>
                      Creating…
                    </span>
                  : 'Open Shop →'
                }
              </button>
            </div>
          </form>
        </div>

        {/* ── LIVE PREVIEW ── */}
        <div className="cs-live-preview" style={{ position:'sticky', top:78, animation:'previewIn 0.5s cubic-bezier(0.22,1,0.36,1) 0.12s both' }}>

          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <span style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.22)', letterSpacing:'0.08em', textTransform:'uppercase' }}>Live Preview</span>
            <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'rgba(255,255,255,0.18)' }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e', display:'inline-block', animation:'shimmer 2s ease-in-out infinite' }}/>
              Updates as you type
            </span>
          </div>

          {/* Card — storefront style, no banner */}
          <div style={{ borderRadius:18, border:'1px solid rgba(255,255,255,0.08)', background:'#0c0a0b', boxShadow:'0 24px 60px rgba(0,0,0,0.55)', overflow:'hidden' }}>

            {/* Colored top accent line */}
            <div style={{ height:3, background:`linear-gradient(90deg, ${col}, ${col}55, transparent)` }}/>

            {/* Header row: logo + name + category */}
            <div style={{ display:'flex', alignItems:'center', gap:14, padding:'20px 18px 16px' }}>
              {/* Logo tile */}
              <div style={{ width:60, height:60, borderRadius:14, flexShrink:0, overflow:'hidden', background:`${col}14`, border:`1px solid ${col}30`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 4px 16px ${col}18` }}>
                {logoPreview
                  ? <img src={logoPreview} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                  : <span style={{ color:col, opacity:0.5, display:'flex' }}>{CAT_ICONS[category]}</span>
                }
              </div>

              {/* Name + meta */}
              <div style={{ flex:1, minWidth:0 }}>
                <h3 style={{ fontSize:17, fontWeight:800, color: name ? '#fff' : 'rgba(255,255,255,0.18)', margin:'0 0 5px', letterSpacing:'-0.3px', transition:'color .2s', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {name || 'Your Shop Name'}
                </h3>
                <div style={{ display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' }}>
                  {/* Category badge */}
                  <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 9px', borderRadius:99, background:`${col}14`, border:`1px solid ${col}35`, fontSize:10.5, fontWeight:700, color:col }}>
                    <span style={{ display:'flex', transform:'scale(0.7)', transformOrigin:'center', lineHeight:1 }}>{CAT_ICONS[category]}</span>
                    {category}
                  </span>
                  {/* Owner */}
                  <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, color:'rgba(255,255,255,0.28)' }}>
                    <div style={{ width:14, height:14, borderRadius:'50%', background:'rgba(255,255,255,0.08)', overflow:'hidden', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {profile?.avatar_url
                        ? <img src={profile.avatar_url} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                        : <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                      }
                    </div>
                    {profile?.full_name ?? 'You'}
                  </span>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div style={{ height:'1px', background:'rgba(255,255,255,0.05)', margin:'0 18px' }}/>

            {/* Description */}
            <div style={{ padding:'14px 18px' }}>
              {description
                ? <p style={{ fontSize:12.5, color:'rgba(255,255,255,0.45)', lineHeight:1.7, margin:0, whiteSpace:'pre-wrap', overflowWrap:'break-word' }}>{description}</p>
                : <p style={{ fontSize:12.5, color:'rgba(255,255,255,0.12)', lineHeight:1.7, margin:0, fontStyle:'italic' }}>Your description will appear here…</p>
              }
            </div>

            {/* Stats strip */}
            <div style={{ display:'flex', borderTop:'1px solid rgba(255,255,255,0.04)', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
              {[{ val:'0', lbl:'Listings' }, { val:'New', lbl:'Shop' }, { val:'★', lbl:'Featured' }].map((s, i) => (
                <div key={s.lbl} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', padding:'11px 0', borderRight: i < 2 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <span style={{ fontSize:14, fontWeight:800, color: i === 2 ? col : 'rgba(255,255,255,0.55)', lineHeight:1 }}>{s.val}</span>
                  <span style={{ fontSize:10, color:'rgba(255,255,255,0.22)', marginTop:3, letterSpacing:'0.03em' }}>{s.lbl}</span>
                </div>
              ))}
            </div>

            {/* Links */}
            <div style={{ padding:'14px 18px', display:'flex', gap:7, flexWrap:'wrap' }}>
              {instagram
                ? <div style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 11px', borderRadius:8, background:'rgba(225,48,108,0.08)', border:'1px solid rgba(225,48,108,0.18)', fontSize:11.5, fontWeight:600, color:'#e1306c' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                      <defs><linearGradient id="pv-ig" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#FCAF45"/><stop offset="100%" stopColor="#833AB4"/></linearGradient></defs>
                      <rect x="2" y="2" width="20" height="20" rx="5.5" stroke="url(#pv-ig)" strokeWidth="2.2"/>
                      <circle cx="12" cy="12" r="4.5" stroke="url(#pv-ig)" strokeWidth="2.2"/>
                      <circle cx="17.5" cy="6.5" r="1.2" fill="url(#pv-ig)"/>
                    </svg>
                    {extractHandle(instagram)}
                  </div>
                : <div style={{ padding:'5px 11px', borderRadius:8, border:'1px dashed rgba(255,255,255,0.07)', fontSize:11, color:'rgba(255,255,255,0.13)' }}>Instagram</div>
              }
              {website
                ? <div style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 11px', borderRadius:8, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.09)', fontSize:11.5, fontWeight:600, color:'rgba(255,255,255,0.45)' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                    Website
                  </div>
                : <div style={{ padding:'5px 11px', borderRadius:8, border:'1px dashed rgba(255,255,255,0.07)', fontSize:11, color:'rgba(255,255,255,0.13)' }}>Website</div>
              }
              {whatsapp
                ? <div style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 11px', borderRadius:8, background:'rgba(37,211,102,0.07)', border:'1px solid rgba(37,211,102,0.16)', fontSize:11.5, fontWeight:600, color:'#25D366' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
                    WhatsApp
                  </div>
                : <div style={{ padding:'5px 11px', borderRadius:8, border:'1px dashed rgba(255,255,255,0.07)', fontSize:11, color:'rgba(255,255,255,0.13)' }}>WhatsApp</div>
              }
            </div>
          </div>

          <p style={{ fontSize:11, color:'rgba(255,255,255,0.13)', textAlign:'center', marginTop:10 }}>
            How customers will see your shop
          </p>
        </div>

      </div>
    </div>
  )
}
