import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useFeedScope } from '../../contexts/FeedScopeContext'

interface Position {
  id: string
  club_id: string
  title: string
  description: string | null
  requirements: string | null
  type: 'Full-time' | 'Part-time' | 'Volunteer' | 'Internship'
  deadline: string | null
  is_open: boolean
  created_at: string
  club: { name: string; logo_url: string | null; category: string | null } | null
}

const TYPE_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  'Full-time':  { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.25)'  },
  'Part-time':  { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.25)'  },
  'Volunteer':  { color: '#c084fc', bg: 'rgba(192,132,252,0.1)', border: 'rgba(192,132,252,0.25)' },
  'Internship': { color: '#fb923c', bg: 'rgba(251,146,60,0.1)',  border: 'rgba(251,146,60,0.25)'  },
}

const TYPES = ['All', 'Full-time', 'Part-time', 'Volunteer', 'Internship']

function timeLeft(deadline: string | null) {
  if (!deadline) return null
  const d = new Date(deadline)
  const now = new Date()
  const diff = Math.ceil((d.getTime() - now.getTime()) / 86400000)
  if (diff < 0) return 'Expired'
  if (diff === 0) return 'Due today'
  if (diff === 1) return '1 day left'
  if (diff <= 7) return `${diff} days left`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function PositionsPage() {
  const { user, profile } = useAuth()
  const { feedScope } = useFeedScope()
  const navigate = useNavigate()

  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeType, setActiveType] = useState('All')

  // Detail + apply modal state
  const [selected, setSelected] = useState<Position | null>(null)
  const [applying, setApplying] = useState<Position | null>(null)
  const [coverLetter, setCoverLetter] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [applyError, setApplyError] = useState('')
  const [applicationStatus, setApplicationStatus] = useState<Map<string, 'pending' | 'accepted' | 'rejected'>>(new Map())

  const fetchPositions = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('club_positions')
      .select('*, club:clubs!inner(name, logo_url, category, country)')
      .eq('is_open', true)
      .order('created_at', { ascending: false })

    if (feedScope === 'local' && profile?.country) q = q.eq('club.country', profile.country)
    if (search) q = q.ilike('title', `%${search}%`)
    if (activeType !== 'All') q = q.eq('type', activeType)

    const { data } = await q
    setPositions((data as unknown as Position[]) ?? [])
    setLoading(false)
  }, [search, activeType, profile?.country, feedScope])

  useEffect(() => { fetchPositions() }, [fetchPositions])

  useEffect(() => {
    if (!user) return
    supabase
      .from('club_position_applications')
      .select('position_id, status')
      .eq('user_id', user.id)
      .then(({ data }) => {
        const map = new Map<string, 'pending' | 'accepted' | 'rejected'>()
        ;(data ?? []).forEach(r => map.set(r.position_id, r.status))
        setApplicationStatus(map)
      })
  }, [user])

  async function handleApply() {
    if (!user || !applying) return
    setSubmitting(true)
    setApplyError('')
    const { error } = await supabase.from('club_position_applications').insert({
      position_id: applying.id,
      club_id: applying.club_id,
      user_id: user.id,
      cover_letter: coverLetter.trim() || null,
    })
    if (error) {
      setApplyError(error.code === '23505' ? 'You already applied for this position.' : error.message)
      setSubmitting(false)
      return
    }
    setApplicationStatus(prev => new Map(prev).set(applying.id, 'pending'))
    setApplying(null)
    setCoverLetter('')
    setSubmitting(false)
  }

  const initials = (name: string) => name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <>
      <style>{`
        @keyframes pos-fade-up { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pos-modal-in { from { opacity:0; transform:scale(0.95) translateY(12px); } to { opacity:1; transform:scale(1) translateY(0); } }
        .pos-card {
          transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.25s ease, border-color 0.2s;
        }
        .pos-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 20px 48px rgba(0,0,0,0.5) !important;
          border-color: rgba(138,21,56,0.35) !important;
        }
        .pos-apply-btn { transition: all 0.15s; }
        .pos-apply-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(138,21,56,0.4) !important;
          filter: brightness(1.08);
        }
        .pos-filter-btn { transition: all 0.15s; }
        .pos-filter-btn:hover { opacity: 0.85; }
        .pos-search:focus { outline:none; border-color:rgba(138,21,56,0.55) !important; box-shadow:0 0 0 3px rgba(138,21,56,0.12) !important; }
        @keyframes pos-backdrop-in { from { opacity:0; } to { opacity:1; } }
      `}</style>

      <div className="page-content" style={{ maxWidth: 1000 }}>
        {/* Header */}
        <div style={{ marginBottom: 32, animation: 'pos-fade-up 0.4s ease both' }}>
          <h1 style={{ fontSize: 'clamp(22px, 5vw, 32px)', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.8px', marginBottom: 8 }}>
            Club Positions
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Find open roles in student clubs and apply to make an impact.
          </p>
        </div>

        {/* Search + Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-start', animation: 'pos-fade-up 0.4s 0.06s ease both' }}>
          <input
            className="pos-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search positions…"
            style={{
              flex: 1, minWidth: 200,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 11, padding: '10px 15px',
              color: 'var(--text-primary)', fontSize: 14,
              fontFamily: 'inherit', transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
          />
          <div className="pill-scroll" style={{ minWidth: 0 }}>
            {TYPES.map(t => (
              <button
                key={t}
                className="pos-filter-btn"
                onClick={() => setActiveType(t)}
                style={{
                  padding: '9px 16px', borderRadius: 9999, fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit', border: 'none',
                  background: activeType === t ? 'var(--accent)' : 'rgba(255,255,255,0.07)',
                  color: activeType === t ? '#fff' : 'var(--text-muted)',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
            {[0,1,2,3,4,5].map(i => (
              <div key={i} style={{ height: 200, borderRadius: 18, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', animation: 'pos-fade-up 0.4s ease both', animationDelay: `${i*0.05}s` }} />
            ))}
          </div>
        ) : positions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>📋</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No open positions</div>
            <div style={{ fontSize: 13 }}>Check back later or try a different filter.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
            {positions.map((pos, i) => {
              const tc = TYPE_COLORS[pos.type]
              const appStatus = applicationStatus.get(pos.id)
              const applied = !!appStatus
              const tl = timeLeft(pos.deadline)
              const expired = tl === 'Expired'

              return (
                <div
                  key={pos.id}
                  className="pos-card"
                  onClick={() => setSelected(pos)}
                  style={{
                    background: 'linear-gradient(145deg, #231518, #1e1214)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 18,
                    padding: '20px 22px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    cursor: 'pointer',
                    animation: 'pos-fade-up 0.4s ease both',
                    animationDelay: `${Math.min(i, 8) * 0.04}s`,
                  }}
                >
                  {/* Club info */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      onClick={e => { e.stopPropagation(); navigate(`/clubs/${pos.club_id}`) }}
                      style={{
                        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                        background: pos.club?.logo_url ? 'transparent' : 'rgba(138,21,56,0.2)',
                        border: '1px solid rgba(138,21,56,0.25)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 800, color: 'var(--accent)',
                        cursor: 'pointer', overflow: 'hidden',
                      }}
                    >
                      {pos.club?.logo_url
                        ? <img src={pos.club.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : initials(pos.club?.name ?? '?')}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        onClick={e => { e.stopPropagation(); navigate(`/clubs/${pos.club_id}`) }}
                        style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'color 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
                      >
                        {pos.club?.name ?? 'Unknown Club'}
                      </div>
                      {pos.club?.category && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{pos.club.category}</div>
                      )}
                    </div>
                    <span style={{
                      marginLeft: 'auto', flexShrink: 0,
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                      padding: '3px 9px', borderRadius: 9999,
                      background: tc.bg, border: `1px solid ${tc.border}`, color: tc.color,
                    }}>
                      {pos.type}
                    </span>
                  </div>

                  {/* Title */}
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.2px', marginBottom: 6, lineHeight: 1.3 }}>
                      {pos.title}
                    </div>
                    {pos.description && (
                      <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.65, margin: 0, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}>
                        {pos.description}
                      </p>
                    )}
                  </div>

                  {/* Requirements */}
                  {pos.requirements && (
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '9px 12px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Requirements</div>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}>
                        {pos.requirements}
                      </p>
                    </div>
                  )}

                  {/* Footer */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto' }}>
                    {tl && (
                      <span style={{
                        fontSize: 11, fontWeight: 600,
                        color: expired ? '#f87171' : tl.includes('day') && parseInt(tl) <= 3 ? '#fb923c' : 'var(--text-muted)',
                      }}>
                        {expired ? '⛔ ' : '📅 '}{tl}
                      </span>
                    )}
                    <button
                      className="pos-apply-btn"
                      disabled={applied || expired || !user}
                      onClick={e => { e.stopPropagation(); setApplying(pos); setCoverLetter(''); setApplyError('') }}
                      style={{
                        marginLeft: 'auto', padding: '8px 18px',
                        borderRadius: 10, border: 'none',
                        fontSize: 13, fontWeight: 700, cursor: (applied || expired) ? 'default' : 'pointer',
                        fontFamily: 'inherit',
                        background: appStatus === 'accepted'
                          ? 'rgba(74,222,128,0.12)'
                          : appStatus === 'rejected'
                          ? 'rgba(248,113,113,0.1)'
                          : appStatus === 'pending'
                          ? 'rgba(233,193,118,0.1)'
                          : expired
                          ? 'rgba(255,255,255,0.05)'
                          : 'var(--accent)',
                        color: appStatus === 'accepted'
                          ? '#4ade80'
                          : appStatus === 'rejected'
                          ? '#f87171'
                          : appStatus === 'pending'
                          ? 'rgba(233,193,118,0.85)'
                          : expired ? 'var(--text-muted)' : '#fff',
                        boxShadow: applied || expired ? 'none' : '0 4px 16px rgba(138,21,56,0.3)',
                      }}
                    >
                      {appStatus === 'accepted'
                        ? '✓ Accepted'
                        : appStatus === 'rejected'
                        ? '✕ Rejected'
                        : appStatus === 'pending'
                        ? '⏳ Applied'
                        : expired ? 'Closed' : 'Apply'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selected && (() => {
        const tc = TYPE_COLORS[selected.type]
        const appStatus = applicationStatus.get(selected.id)
        const applied = !!appStatus
        const tl = timeLeft(selected.deadline)
        const expired = tl === 'Expired'
        return (
          <div
            onClick={() => setSelected(null)}
            style={{ position:'fixed', inset:0, zIndex:9998, background:'rgba(0,0,0,0.78)', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px 16px', animation:'pos-backdrop-in 0.2s ease' }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{ background:'var(--bg-card)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:24, width:'100%', maxWidth:560, maxHeight:'88vh', overflow:'hidden', display:'flex', flexDirection:'column', animation:'pos-modal-in 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}
            >
              {/* Scrollable body */}
              <div style={{ overflowY:'auto', padding:'clamp(20px,4vw,32px)', flex:1 }}>
                {/* Club row */}
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
                  <div
                    onClick={e => { e.stopPropagation(); navigate(`/clubs/${selected.club_id}`); setSelected(null) }}
                    style={{ width:36, height:36, borderRadius:10, flexShrink:0, background: selected.club?.logo_url ? 'transparent' : 'rgba(138,21,56,0.2)', border:'1px solid rgba(138,21,56,0.25)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'var(--accent)', cursor:'pointer', overflow:'hidden' }}
                  >
                    {selected.club?.logo_url ? <img src={selected.club.logo_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : initials(selected.club?.name ?? '?')}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'var(--text-secondary)' }}>{selected.club?.name}</div>
                    {selected.club?.category && <div style={{ fontSize:10, color:'var(--text-muted)' }}>{selected.club.category}</div>}
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:9999, background:tc.bg, border:`1px solid ${tc.border}`, color:tc.color, flexShrink:0 }}>{selected.type}</span>
                  <button onClick={() => setSelected(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:20, lineHeight:1, padding:4, flexShrink:0 }}>✕</button>
                </div>

                {/* Title */}
                <h2 style={{ fontSize:'clamp(20px,4vw,26px)', fontWeight:900, color:'var(--text-primary)', letterSpacing:'-0.5px', marginBottom:16, lineHeight:1.25 }}>{selected.title}</h2>

                {/* Deadline */}
                {tl && (
                  <div style={{ fontSize:12, fontWeight:600, color: expired ? '#f87171' : 'var(--text-muted)', marginBottom:16 }}>
                    {expired ? '⛔ Closed' : `📅 ${tl}`}
                  </div>
                )}

                {/* Description */}
                {selected.description && (
                  <div style={{ marginBottom:20 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>About this role</div>
                    <p style={{ fontSize:14, color:'var(--text-secondary)', lineHeight:1.75, margin:0, whiteSpace:'pre-wrap' }}>{selected.description}</p>
                  </div>
                )}

                {/* Requirements */}
                {selected.requirements && (
                  <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:'16px 18px' }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Requirements</div>
                    <p style={{ fontSize:13.5, color:'var(--text-secondary)', lineHeight:1.75, margin:0, whiteSpace:'pre-wrap' }}>{selected.requirements}</p>
                  </div>
                )}
              </div>

              {/* Sticky footer with apply button */}
              <div style={{ padding:'16px clamp(20px,4vw,32px)', borderTop:'1px solid rgba(255,255,255,0.07)', background:'var(--bg-card)', display:'flex', gap:10 }}>
                <button
                  onClick={() => setSelected(null)}
                  style={{ flex:1, padding:'12px', background:'transparent', border:'1px solid rgba(255,255,255,0.1)', borderRadius:12, color:'var(--text-muted)', fontSize:14, cursor:'pointer', fontFamily:'inherit' }}
                >Close</button>
                <button
                  disabled={applied || expired || !user}
                  onClick={() => { setSelected(null); setApplying(selected); setCoverLetter(''); setApplyError('') }}
                  style={{
                    flex:2, padding:'12px', border:'none', borderRadius:12,
                    fontSize:14, fontWeight:700, fontFamily:'inherit',
                    cursor: (applied || expired) ? 'default' : 'pointer',
                    background: appStatus === 'accepted' ? 'rgba(74,222,128,0.12)' : appStatus === 'rejected' ? 'rgba(248,113,113,0.1)' : appStatus === 'pending' ? 'rgba(233,193,118,0.1)' : expired ? 'rgba(255,255,255,0.05)' : 'var(--accent)',
                    color: appStatus === 'accepted' ? '#4ade80' : appStatus === 'rejected' ? '#f87171' : appStatus === 'pending' ? 'rgba(233,193,118,0.85)' : expired ? 'var(--text-muted)' : '#fff',
                    boxShadow: applied || expired ? 'none' : '0 4px 18px rgba(138,21,56,0.35)',
                  }}
                >
                  {appStatus === 'accepted' ? '✓ Accepted' : appStatus === 'rejected' ? '✕ Rejected' : appStatus === 'pending' ? '⏳ Applied' : expired ? 'Closed' : 'Apply Now'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Apply Modal */}
      {applying && (
        <div
          onClick={() => setApplying(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px 16px', animation: 'pos-backdrop-in 0.2s ease',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 22, padding: 'clamp(18px, 4vw, 30px)', width: '100%', maxWidth: 500,
              animation: 'pos-modal-in 0.3s cubic-bezier(0.34,1.56,0.64,1)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  Applying to {applying.club?.name}
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
                  {applying.title}
                </h2>
              </div>
              <button
                onClick={() => setApplying(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 20, lineHeight: 1, padding: 4, flexShrink: 0 }}
              >✕</button>
            </div>

            {/* Type badge */}
            <div style={{ marginBottom: 20 }}>
              {(() => { const tc = TYPE_COLORS[applying.type]; return (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 9999, background: tc.bg, border: `1px solid ${tc.border}`, color: tc.color }}>
                  {applying.type}
                </span>
              )})()}
            </div>

            {/* Cover letter */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Cover Letter <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--text-muted)', opacity: 0.6 }}>(optional)</span>
              </label>
              <textarea
                value={coverLetter}
                onChange={e => setCoverLetter(e.target.value)}
                placeholder={`Tell ${applying.club?.name ?? 'the club'} why you'd be a great fit for this role…`}
                rows={5}
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
                  padding: '12px 14px', color: 'var(--text-primary)',
                  fontSize: 14, fontFamily: 'inherit', resize: 'vertical',
                  outline: 'none', boxSizing: 'border-box', lineHeight: 1.65,
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'rgba(138,21,56,0.5)'}
                onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
            </div>

            {applyError && (
              <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 10, fontSize: 13, color: '#f87171' }}>
                {applyError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setApplying(null)}
                style={{ flex: 1, padding: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={submitting}
                style={{
                  flex: 2, padding: '12px',
                  background: submitting ? 'rgba(138,21,56,0.4)' : 'var(--accent)',
                  border: 'none', borderRadius: 12,
                  color: '#fff', fontSize: 14, fontWeight: 700,
                  cursor: submitting ? 'default' : 'pointer', fontFamily: 'inherit',
                  boxShadow: submitting ? 'none' : '0 4px 18px rgba(138,21,56,0.35)',
                  transition: 'all 0.15s',
                }}
              >
                {submitting ? 'Submitting…' : 'Submit Application'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
