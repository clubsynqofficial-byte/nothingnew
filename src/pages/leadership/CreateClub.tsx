import { useState, useRef, type FormEvent, type DragEvent, type ChangeEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const CATEGORIES = [
  'Technology', 'Arts & Culture', 'Sports', 'Entrepreneurship',
  'Engineering', 'Business', 'Science', 'Community', 'Media', 'Other',
]

interface Props {
  onCreated: () => void
}

export default function CreateClub({ onCreated }: Props) {
  const { user } = useAuth()

  // Form fields
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])

  // File state
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const [bannerPreview, setBannerPreview] = useState<string | null>(null)
  const [bannerDragging, setBannerDragging] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  const bannerInputRef = useRef<HTMLInputElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  // Submission
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // ── file helpers ──────────────────────────────────────────────────────────

  function readPreview(file: File, setPreview: (url: string) => void) {
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  function pickBanner(file: File) {
    setBannerFile(file)
    readPreview(file, setBannerPreview)
  }

  function pickLogo(file: File) {
    setLogoFile(file)
    readPreview(file, setLogoPreview)
  }

  function onBannerInput(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) pickBanner(f)
  }

  function onLogoInput(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) pickLogo(f)
  }

  function onBannerDrop(e: DragEvent) {
    e.preventDefault()
    setBannerDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f && f.type.startsWith('image/')) pickBanner(f)
  }

  async function uploadImage(file: File, path: string): Promise<string | null> {
    const { error } = await supabase.storage.from('clubs').upload(path, file, { upsert: true })
    if (error) return null
    const { data } = supabase.storage.from('clubs').getPublicUrl(path)
    return data.publicUrl
  }

  // ── tags ──────────────────────────────────────────────────────────────────

  function addTag() {
    const t = tagInput.trim().toUpperCase()
    if (t && !tags.includes(t) && tags.length < 8) setTags(p => [...p, t])
    setTagInput('')
  }

  // ── submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setError('')
    setLoading(true)

    const prefix = `${user.id}/${Date.now()}`
    let bannerUrl: string | null = null
    let logoUrl: string | null = null

    if (bannerFile) bannerUrl = await uploadImage(bannerFile, `${prefix}/banner`)
    if (logoFile)   logoUrl   = await uploadImage(logoFile,   `${prefix}/logo`)

    const { data: club, error: clubErr } = await supabase
      .from('clubs')
      .insert({
        name,
        category: category || null,
        description: description || null,
        president_id: user.id,
        member_count: 1,
        banner_url: bannerUrl,
        logo_url: logoUrl,
      })
      .select()
      .single()

    if (clubErr || !club) {
      setError(clubErr?.message ?? 'Failed to create club.')
      setLoading(false)
      return
    }

    await supabase.from('club_memberships').insert({
      club_id: club.id,
      user_id: user.id,
      role: 'president',
    })

    setLoading(false)
    onCreated()
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="page-content" style={{ maxWidth: 860, position: 'relative', overflowX: 'hidden' }}>
      {/* Background glow */}
      <div style={{ position: 'fixed', top: -150, right: -120, width: 640, height: 640, borderRadius: '50%', background: 'radial-gradient(circle, rgba(138,21,56,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ marginBottom: 36 }}>
        <h1 style={{ fontSize: 44, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-1px', lineHeight: 1.15, marginBottom: 12 }}>
          Establish Your{' '}
          <em style={{ color: '#ffb2bd', fontStyle: 'italic' }}>Legacy</em>
        </h1>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)', lineHeight: 1.65 }}>
          Design a space for innovation, community engagement, and transformative leadership at Education City.
        </p>
      </div>

      {/* Form card */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(138,21,56,0.09) 0%, #24181a 100%)',
        border: '1px solid rgba(87,65,68,0.35)',
        borderRadius: 24,
        padding: '40px 40px 36px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Glow accents */}
        <div style={{ position: 'absolute', top: -80, right: -80, width: 320, height: 320, borderRadius: '50%', background: 'rgba(255,178,189,0.04)', filter: 'blur(50px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -80, left: -80, width: 320, height: 320, borderRadius: '50%', background: 'rgba(233,193,118,0.04)', filter: 'blur(50px)', pointerEvents: 'none' }} />

        <form onSubmit={handleSubmit} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 36 }}>

          {/* ── CLUB BANNER ── */}
          <div>
            <SectionLabel>Club Banner</SectionLabel>
            <input ref={bannerInputRef} type="file" accept="image/*" onChange={onBannerInput} style={{ display: 'none' }} />
            <div
              onClick={() => bannerInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setBannerDragging(true) }}
              onDragLeave={() => setBannerDragging(false)}
              onDrop={onBannerDrop}
              style={{
                height: 200,
                borderRadius: 18,
                border: `2px dashed ${bannerDragging ? 'rgba(138,21,56,0.7)' : 'rgba(255,255,255,0.12)'}`,
                background: bannerDragging ? 'rgba(138,21,56,0.06)' : 'rgba(255,255,255,0.02)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                position: 'relative',
                transition: 'border-color 0.2s, background 0.2s',
              }}
            >
              {bannerPreview ? (
                <>
                  <img src={bannerPreview} alt="Banner preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s' }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
                  >
                    <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, background: 'rgba(0,0,0,0.5)', padding: '6px 14px', borderRadius: 8 }}>Change Banner</span>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.4 }}>🖼</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
                    Drag and drop banner or click to browse
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
                    High-resolution PNG or JPG recommended (1200 × 400px)
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── LOGO + NAME + SECTOR grid ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 28, alignItems: 'start' }}>

            {/* Logo upload */}
            <div>
              <SectionLabel>Club Logo</SectionLabel>
              <input ref={logoInputRef} type="file" accept="image/*" onChange={onLogoInput} style={{ display: 'none' }} />
              <div
                onClick={() => logoInputRef.current?.click()}
                style={{
                  height: 160,
                  borderRadius: 18,
                  border: '2px dashed rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.02)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  position: 'relative',
                  transition: 'border-color 0.2s',
                }}
              >
                {logoPreview ? (
                  <>
                    <img src={logoPreview} alt="Logo preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s' }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
                    >
                      <span style={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>Change</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 22, opacity: 0.35, marginBottom: 8 }}>🏷</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      Upload Logo
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Name + Sector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              <div>
                <SectionLabel>Club Name</SectionLabel>
                <input
                  type="text"
                  required
                  placeholder="Enter an inspiring name..."
                  value={name}
                  onChange={e => setName(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <SectionLabel>Primary Sector</SectionLabel>
                <select
                  required
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer', appearance: 'none' }}
                >
                  <option value="">Select club category...</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* ── MISSION & VISION ── */}
          <div>
            <SectionLabel>Club Mission &amp; Vision</SectionLabel>
            <textarea
              placeholder="Define your goals, values, and the impact you aim to make in the Education City community..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={5}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.7 }}
            />
          </div>

          {/* ── TAGS ── */}
          <div>
            <SectionLabel>Tags</SectionLabel>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {tags.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTags(p => p.filter(t => t !== tag))}
                  style={{
                    padding: '6px 16px',
                    borderRadius: 9999,
                    border: '1px solid rgba(255,178,189,0.35)',
                    background: 'rgba(255,178,189,0.08)',
                    color: '#ffb2bd',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    cursor: 'pointer',
                  }}
                >
                  {tag} ×
                </button>
              ))}
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  placeholder="Add tag..."
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 9999,
                    padding: '6px 16px',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    outline: 'none',
                    width: 130,
                    fontFamily: 'inherit',
                  }}
                />
                <button
                  type="button"
                  onClick={addTag}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 9999,
                    padding: '6px 14px',
                    color: 'rgba(255,255,255,0.4)',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    cursor: 'pointer',
                  }}
                >
                  + ADD TAG
                </button>
              </div>
            </div>
          </div>

          {/* ── FOOTER ── */}
          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.06)',
            paddingTop: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', lineHeight: 1.6 }}>
              Pending 24-hour verification by Student Affairs
            </p>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => { setName(''); setCategory(''); setDescription(''); setTags([]); setBannerFile(null); setBannerPreview(null); setLogoFile(null); setLogoPreview(null) }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255,255,255,0.3)',
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  cursor: 'pointer',
                  padding: '12px 20px',
                  textTransform: 'uppercase',
                }}
              >
                Save Draft
              </button>
              <button
                type="submit"
                disabled={loading}
                style={{
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: 16,
                  padding: '14px 44px',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  cursor: loading ? 'default' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  boxShadow: '0 0 30px rgba(138,21,56,0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                {loading ? 'Creating…' : <>Create Club <span style={{ fontSize: 16 }}>🚀</span></>}
              </button>
            </div>
          </div>

          {error && <p style={{ color: '#ff6b6b', fontSize: 13, marginTop: -20 }}>{error}</p>}
        </form>
      </div>

      <p style={{ textAlign: 'center', marginTop: 28, fontSize: 10, color: 'rgba(255,255,255,0.08)', letterSpacing: '0.3em', textTransform: 'uppercase' }}>
        Powered by Qatar Foundation Student Affairs
      </p>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.15em',
      color: 'rgba(255,255,255,0.38)',
      textTransform: 'uppercase',
      marginBottom: 10,
    }}>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#1e1214',
  border: '1px solid #574144',
  borderRadius: 16,
  padding: '16px 20px',
  color: 'var(--text-primary)',
  fontSize: 16,
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}
