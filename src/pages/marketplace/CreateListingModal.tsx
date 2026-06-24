import { useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'

const CATEGORIES = ['Clothing & Fashion', 'Art & Crafts', 'Electronics', 'Books & Notes', 'Services', 'Other']

const CAT_COLOR: Record<string, string> = {
  'Clothing & Fashion': '#a855f7', 'Art & Crafts': '#ec4899',
  'Electronics': '#0ea5e9', 'Books & Notes': '#22c55e', 'Services': '#8b5cf6', 'Other': '#6b7280',
}

const CAT_EMOJI: Record<string, string> = {
  'Clothing & Fashion': '👕', 'Art & Crafts': '🎨',
  'Electronics': '📱', 'Books & Notes': '📚', 'Services': '💼', 'Other': '🛍️',
}

export default function CreateListingModal({ userId, onClose, onCreated }: {
  userId: string; onClose: () => void; onCreated: () => void
}) {
  const [title, setTitle]           = useState('')
  const [description, setDesc]      = useState('')
  const [price, setPrice]           = useState('')
  const [category, setCategory]     = useState('Other')
  const [stock, setStock]           = useState('1')
  const [karakPts, setKarakPts]     = useState('0')
  const [images, setImages]         = useState<File[]>([])
  const [previews, setPreviews]     = useState<string[]>([])
  const [saving, setSaving]         = useState(false)
  const [err, setErr]               = useState('')
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
    color: '#fff', fontSize: 13.5, fontFamily: 'inherit', outline: 'none',
  }
  const lbl = (txt: string) => (
    <label style={{ display: 'block', fontSize: 10.5, fontWeight: 800, color: 'rgba(255,255,255,.38)', letterSpacing: '.08em', textTransform: 'uppercase' as const, marginBottom: 7 }}>{txt}</label>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(3,1,2,.9)', backdropFilter: 'blur(22px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 520, background: 'linear-gradient(170deg,#180a0e,#0d050a)', border: '1px solid rgba(138,21,56,.3)', borderRadius: 24, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,.9)', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ height: 4, background: 'linear-gradient(90deg,#6b0f29,#c0185c,#e87ca0)' }} />
        <div style={{ padding: '24px 24px 28px' }}>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 19, fontWeight: 900, color: '#fff', marginBottom: 2 }}>📦 List an Item</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.3)' }}>Fill in the details to start selling</div>
            </div>
            <button type="button" onClick={onClose}
              style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.1)', borderRadius: '50%', width: 34, height: 34, color: 'rgba(255,255,255,.55)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', flexShrink: 0 }}>✕</button>
          </div>

          {/* Photos */}
          <div style={{ marginBottom: 20 }}>
            {lbl('Photos (up to 3)')}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {previews.map((src, i) => (
                <div key={i} style={{ width: 88, height: 88, borderRadius: 14, overflow: 'hidden', position: 'relative', border: '1px solid rgba(255,255,255,.1)' }}>
                  <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button type="button" onClick={() => removeImg(i)}
                    style={{ position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,.8)', border: 'none', color: '#fff', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
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
            {lbl('Title *')}
            <input style={iSt} value={title} onChange={e => setTitle(e.target.value)} placeholder="What are you selling?" maxLength={100} />
          </div>

          {/* Description */}
          <div style={{ marginBottom: 16 }}>
            {lbl('Description')}
            <textarea style={{ ...iSt, resize: 'vertical', minHeight: 72, lineHeight: 1.6 }} value={description} onChange={e => setDesc(e.target.value)} placeholder="Describe your item or service…" maxLength={500} />
          </div>

          {/* Price + Stock */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div>{lbl('Price (AED) *')}<input style={iSt} type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" /></div>
            <div>{lbl('Stock Qty')}<input style={iSt} type="number" min="0" value={stock} onChange={e => setStock(e.target.value)} placeholder="1" /></div>
          </div>

          {/* Category */}
          <div style={{ marginBottom: 16 }}>
            {lbl('Category')}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {CATEGORIES.map(cat => {
                const sel = category === cat
                const cc = CAT_COLOR[cat] ?? '#6b7280'
                return (
                  <button type="button" key={cat} onClick={() => setCategory(cat)}
                    style={{ padding: '6px 14px', borderRadius: 9999, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                      background: sel ? `${cc}22` : 'rgba(255,255,255,.04)',
                      border: `1px solid ${sel ? cc + '55' : 'rgba(255,255,255,.08)'}`,
                      color: sel ? cc : 'rgba(255,255,255,.45)',
                    }}>
                    {CAT_EMOJI[cat]} {cat}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Karak Points */}
          <div style={{ marginBottom: 22 }}>
            {lbl('⭐ Karak Points Reward')}
            <input style={iSt} type="number" min="0" max="500" value={karakPts} onChange={e => setKarakPts(e.target.value)} placeholder="0" />
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.22)', marginTop: 6, lineHeight: 1.55 }}>
              Points awarded to buyer when you mark as delivered. Leave 0 for none.
            </div>
          </div>

          {err && <div style={{ padding: '10px 14px', borderRadius: 11, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.22)', color: '#f87171', fontSize: 12.5, marginBottom: 16 }}>{err}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, padding: '12px', borderRadius: 13, background: 'transparent', border: '1px solid rgba(255,255,255,.1)', color: 'rgba(255,255,255,.45)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button type="submit" disabled={saving}
              style={{ flex: 2, padding: '12px', borderRadius: 13, background: saving ? 'rgba(138,21,56,.5)' : 'linear-gradient(135deg,#8a1538,#c0185c)', color: '#fff', fontSize: 14, fontWeight: 900, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', border: 'none', boxShadow: '0 4px 20px rgba(138,21,56,.55)' }}>
              {saving ? 'Listing…' : '🛍️ List Item'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
