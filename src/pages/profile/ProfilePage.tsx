import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { filterText } from '../../lib/contentFilter'

interface ClubMem {
  club_id: string
  role: string
  club: { name: string; logo_url: string | null; category: string | null } | null
}
interface Listing {
  id: string; title: string; skill_offered: string; skill_wanted: string
  category: string | null; is_active: boolean; created_at: string
}
interface Review {
  id: string; rating: number; comment: string | null; created_at: string
  reviewer: { full_name: string | null } | null
}
interface ProfilePost {
  id: string; content: string | null; image_url: string | null; image_urls: string[] | null
  repost_of: string | null; created_at: string
  likeCount: number; commentCount: number; repostCount: number
  pollQuestion: string | null
  pollOptions: string[]
  repostSource: { content: string | null; image_url: string | null; profile: { full_name: string | null } | null } | null
}
interface ViewedProfile {
  id: string; full_name: string | null; avatar_url: string | null
  bio: string | null; skills: string[]; karak_points: number
  role: string; university: { name: string } | null; username: string | null
}

const CAT_COLORS: Record<string, string> = {
  Technology:'#0ea5e9','Arts & Culture':'#a855f7',Sports:'#e9c176',
  Entrepreneurship:'#f97316',Engineering:'#22c55e',Business:'#ec4899',
  Tech:'#0ea5e9',Design:'#a855f7',Languages:'#22c55e',
  Marketing:'#f97316',Finance:'#e9c176',Other:'#6b7280',
}
const catColor = (c: string | null) => CAT_COLORS[c ?? ''] ?? '#6b7280'

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
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ color: i <= rating ? '#e9c176' : 'rgba(255,255,255,0.12)' }}>★</span>
      ))}
    </span>
  )
}

const inputSt: React.CSSProperties = {
  width:'100%', background:'rgba(22,12,16,0.85)', border:'1px solid rgba(87,65,68,0.35)',
  borderRadius:11, padding:'11px 15px', color:'var(--text-primary)',
  fontSize:14, outline:'none', fontFamily:'inherit',
}

const CSS = `
  @keyframes pf-up {
    from { opacity:0; transform:translateY(22px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes pf-in  { from { opacity:0; } to { opacity:1; } }
  @keyframes pf-pop {
    from { opacity:0; transform:scale(0.96) translateY(12px); }
    to   { opacity:1; transform:scale(1)    translateY(0); }
  }
  @keyframes pf-spin    { to { transform:rotate(360deg); } }
  @keyframes pf-shimmer {
    from { background-position:-700px 0; }
    to   { background-position: 700px 0; }
  }
  @keyframes pf-glow {
    0%,100% { opacity:.7; } 50% { opacity:1; }
  }

  .pf-0  { animation: pf-up 0.5s cubic-bezier(0.22,1,0.36,1) both; }
  .pf-1  { animation: pf-up 0.5s cubic-bezier(0.22,1,0.36,1) 0.07s both; }
  .pf-2  { animation: pf-up 0.5s cubic-bezier(0.22,1,0.36,1) 0.14s both; }

  .pf-shimmer {
    background: linear-gradient(90deg,
      rgba(45,28,34,0.6) 25%, rgba(72,46,54,0.8) 50%, rgba(45,28,34,0.6) 75%);
    background-size:700px 100%;
    animation:pf-shimmer 1.4s ease-in-out infinite;
  }

  .pf-panel  { animation: pf-pop 0.28s cubic-bezier(0.22,1,0.36,1) both; }

  .pf-stat   { transition: transform 0.2s, border-color 0.2s, background 0.2s, box-shadow 0.2s; cursor:pointer; }
  .pf-stat:hover { transform:translateY(-3px); }

  .pf-club   { transition: transform 0.2s, box-shadow 0.2s; }
  .pf-club:hover { transform:translateY(-3px); box-shadow:0 10px 28px rgba(0,0,0,0.35) !important; }

  .pf-card   { transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s; }
  .pf-card:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,0.3) !important; border-color:rgba(138,21,56,0.3) !important; }

  .pf-review { transition: transform 0.2s, border-color 0.2s; }
  .pf-review:hover { transform:translateY(-2px); border-color:rgba(87,65,68,0.38) !important; }

  .pf-av-wrap { position:relative; }
  .pf-av-ov   { opacity:0; transition:opacity 0.2s; }
  .pf-av-wrap:hover .pf-av-ov { opacity:1 !important; }

  .pf-btn  { font-family:inherit; cursor:pointer; transition:all 0.15s; }
  .pf-back { font-family:inherit; cursor:pointer; transition:all 0.18s; }
  .pf-back:hover { transform:translateX(-2px); color:#fff !important; border-color:rgba(255,255,255,0.28) !important; background:rgba(0,0,0,0.35) !important; }

  .pf-tog  { font-family:inherit; cursor:pointer; transition:all 0.15s; }
  .pf-tog:hover { opacity:0.8; }

  .pf-tab  { font-family:inherit; cursor:pointer; transition:all 0.18s; border:none; }
  .pf-tab:hover { color:var(--text-primary) !important; }

  .pf-post { transition: transform 0.18s, border-color 0.18s, box-shadow 0.18s; }
  .pf-post:hover { transform:translateY(-2px); border-color:rgba(138,21,56,0.3) !important; box-shadow:0 8px 24px rgba(0,0,0,0.3) !important; }

  input:focus, textarea:focus { border-color:rgba(138,21,56,0.55) !important; outline:none; }
`

export default function ProfilePage() {
  const { userId: paramUserId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const { user, profile, refreshProfile, signOut } = useAuth()

  const isOwnProfile = !paramUserId || paramUserId === user?.id

  const [clubs, setClubs]                     = useState<ClubMem[]>([])
  const [listings, setListings]               = useState<Listing[]>([])
  const [reviews, setReviews]                 = useState<Review[]>([])
  const [completedTrades, setCompletedTrades] = useState(0)
  const [loading, setLoading]                 = useState(true)
  const [viewedProfile, setViewedProfile]     = useState<ViewedProfile | null>(null)
  const [notFound, setNotFound]               = useState(false)

  const [editing, setEditing]         = useState(false)
  const [editName, setEditName]       = useState('')
  const [editBio, setEditBio]         = useState('')
  const [editSkillsRaw, setEditSkillsRaw] = useState('')
  const [saving, setSaving]           = useState(false)
  const [editError, setEditError]     = useState('')

  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError]         = useState('')

  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [tab, setTab] = useState<'clubs' | 'listings' | 'reviews' | 'posts'>('posts')

  // Messaging
  type MsgReqStatus = 'none' | 'sent' | 'received' | 'accepted'
  const [msgStatus,  setMsgStatus]  = useState<MsgReqStatus>('none')
  const [msgReqId,   setMsgReqId]   = useState<string | null>(null)
  const [_convId,    setConvId]     = useState<string | null>(null)
  const [msgLoading, setMsgLoading] = useState(false)
  const [profilePosts, setProfilePosts] = useState<ProfilePost[]>([])
  const [loadingPosts, setLoadingPosts] = useState(false)

  const fetchAll = useCallback(async (targetId: string) => {
    setLoading(true)
    const [clubsRes, listingsRes, reviewsRes, asRequester, targetListingsRes] = await Promise.all([
      supabase.from('club_memberships').select('club_id, role, club:clubs(name, logo_url, category)').eq('user_id', targetId),
      supabase.from('skill_listings').select('id, title, skill_offered, skill_wanted, category, is_active, created_at').eq('user_id', targetId).order('created_at', { ascending: false }),
      supabase.from('skill_trade_reviews').select('id, rating, comment, created_at, reviewer:profiles!reviewer_id(full_name)').eq('reviewee_id', targetId).order('created_at', { ascending: false }).limit(20),
      supabase.from('skill_requests').select('id', { count: 'exact', head: true }).eq('status', 'completed').eq('requester_id', targetId),
      supabase.from('skill_listings').select('id').eq('user_id', targetId),
    ])
    setClubs((clubsRes.data as unknown as ClubMem[]) ?? [])
    setListings((listingsRes.data as Listing[]) ?? [])
    setReviews((reviewsRes.data as unknown as Review[]) ?? [])
    const ids = (targetListingsRes.data ?? []).map(l => l.id)
    let ownerCount = 0
    if (ids.length > 0) {
      const { count } = await supabase.from('skill_requests').select('id', { count: 'exact', head: true }).eq('status', 'completed').in('listing_id', ids)
      ownerCount = count ?? 0
    }
    setCompletedTrades((asRequester.count ?? 0) + ownerCount)
    setLoading(false)
  }, [])

  const fetchProfilePosts = useCallback(async (targetId: string) => {
    setLoadingPosts(true)
    const { data: raw } = await supabase
      .from('posts')
      .select('id, content, image_url, image_urls, repost_of, created_at')
      .eq('user_id', targetId)
      .order('created_at', { ascending: false })
      .limit(40)
    if (!raw?.length) { setProfilePosts([]); setLoadingPosts(false); return }

    const ids = raw.map(p => p.id)
    const repostIds = raw.flatMap(p => p.repost_of ? [p.repost_of as string] : [])

    const [lk, cm, rp, src, polls] = await Promise.all([
      supabase.from('post_likes').select('post_id').in('post_id', ids),
      supabase.from('post_comments').select('post_id').in('post_id', ids),
      supabase.from('posts').select('repost_of').in('repost_of', ids).is('content', null).is('image_url', null),
      repostIds.length
        ? supabase.from('posts').select('id, content, image_url, profile:profiles!user_id(full_name)').in('id', repostIds)
        : { data: [] as any[] },
      supabase.from('post_polls').select('id, post_id, question').in('post_id', ids),
    ])

    const likeMap: Record<string, number> = {}
    for (const l of lk.data ?? []) likeMap[l.post_id] = (likeMap[l.post_id] ?? 0) + 1
    const cmMap: Record<string, number> = {}
    for (const c of cm.data ?? []) cmMap[c.post_id] = (cmMap[c.post_id] ?? 0) + 1
    const rpMap: Record<string, number> = {}
    for (const r of rp.data ?? []) { if (r.repost_of) rpMap[r.repost_of] = (rpMap[r.repost_of] ?? 0) + 1 }
    const srcMap: Record<string, any> = {}
    for (const s of src.data ?? []) srcMap[s.id] = s
    const pollIdMap: Record<string, { id: string; question: string }> = {}
    for (const poll of polls.data ?? []) if (poll.post_id) pollIdMap[poll.post_id] = { id: poll.id, question: poll.question }

    const pollIds = Object.values(pollIdMap).map(p => p.id)
    let optionsMap: Record<string, string[]> = {}
    if (pollIds.length > 0) {
      const { data: opts } = await supabase
        .from('poll_options').select('poll_id, text, position').in('poll_id', pollIds).order('position')
      for (const o of opts ?? []) {
        if (!optionsMap[o.poll_id]) optionsMap[o.poll_id] = []
        optionsMap[o.poll_id].push(o.text)
      }
    }

    setProfilePosts(raw.map(p => {
      const pollEntry = pollIdMap[p.id] ?? null
      return {
        ...p,
        likeCount: likeMap[p.id] ?? 0,
        commentCount: cmMap[p.id] ?? 0,
        repostCount: rpMap[p.id] ?? 0,
        pollQuestion: pollEntry?.question ?? null,
        pollOptions: pollEntry ? (optionsMap[pollEntry.id] ?? []) : [],
        repostSource: p.repost_of ? (srcMap[p.repost_of] ?? null) : null,
      }
    }))
    setLoadingPosts(false)
  }, [])

  useEffect(() => {
    if (isOwnProfile) {
      if (user) { fetchAll(user.id); fetchProfilePosts(user.id) }
    } else if (paramUserId) {
      supabase.from('profiles').select('id, full_name, avatar_url, bio, skills, karak_points, role, username, university:universities(name)').eq('id', paramUserId).maybeSingle()
        .then(({ data }) => {
          if (!data) { setNotFound(true); setLoading(false); return }
          setViewedProfile(data as unknown as ViewedProfile)
          fetchAll(paramUserId)
          fetchProfilePosts(paramUserId)
        })
    }
  }, [user, paramUserId, isOwnProfile, fetchAll, fetchProfilePosts])

  // Realtime: refetch completed trade count + reviews when trades finish or reviews are posted
  useEffect(() => {
    const targetId = isOwnProfile ? user?.id : paramUserId
    if (!targetId) return
    const ch = supabase.channel(`profile-rt-${targetId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'skill_requests' }, payload => {
        if (payload.new.status === 'completed') fetchAll(targetId)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'skill_trade_reviews' }, () => {
        fetchAll(targetId)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user, paramUserId, isOwnProfile, fetchAll])

  useEffect(() => {
    if (isOwnProfile || !user || !paramUserId) return
    async function fetchMsgStatus() {
      const { data } = await supabase
        .from('message_requests')
        .select('id, from_user_id, to_user_id, status')
        .or(`and(from_user_id.eq.${user!.id},to_user_id.eq.${paramUserId}),and(from_user_id.eq.${paramUserId},to_user_id.eq.${user!.id})`)
        .maybeSingle()
      if (!data) { setMsgStatus('none'); return }
      setMsgReqId(data.id)
      if (data.status === 'accepted') {
        const { data: conv } = await supabase
          .from('conversations')
          .select('id')
          .eq('type', 'dm')
          .or(`and(participant_1.eq.${user!.id},participant_2.eq.${paramUserId}),and(participant_1.eq.${paramUserId},participant_2.eq.${user!.id})`)
          .maybeSingle()
        setConvId(conv?.id ?? null)
        setMsgStatus('accepted')
      } else if (data.from_user_id === user!.id) {
        setMsgStatus('sent')
      } else {
        setMsgStatus('received')
      }
    }
    fetchMsgStatus()
  }, [isOwnProfile, user, paramUserId])

  async function handleMessageAction() {
    if (!user || !paramUserId) return
    setMsgLoading(true)
    if (msgStatus === 'none') {
      await supabase.from('message_requests').insert({ from_user_id: user.id, to_user_id: paramUserId })
      setMsgStatus('sent')
    } else if (msgStatus === 'received' && msgReqId) {
      await supabase.from('message_requests').update({ status: 'accepted' }).eq('id', msgReqId)
      const { data: conv } = await supabase
        .from('conversations')
        .insert({ participant_1: user.id, participant_2: paramUserId, type: 'dm' })
        .select('id')
        .single()
      setConvId(conv?.id ?? null)
      setMsgStatus('accepted')
    } else if (msgStatus === 'accepted') {
      navigate('/messages')
    }
    setMsgLoading(false)
  }

  async function declineRequest() {
    if (!msgReqId) return
    await supabase.from('message_requests').update({ status: 'declined' }).eq('id', msgReqId)
    setMsgStatus('none')
    setMsgReqId(null)
  }

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
    await supabase.from('profiles').update({ full_name: name, bio: editBio.trim() || null, skills }).eq('id', user.id)
    await refreshProfile()
    setSaving(false)
    setEditing(false)
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    if (!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)) { setAvatarError('Only JPEG, PNG, WebP, or GIF allowed.'); return }
    if (file.size > 5 * 1024 * 1024) { setAvatarError('Image must be under 5 MB.'); return }
    setAvatarError(''); setUploadingAvatar(true)
    const ext = file.name.split('.').pop()
    const path = `${user.id}/avatar.${ext}`
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) { setAvatarError('Upload failed. Please try again.'); setUploadingAvatar(false); return }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    await supabase.from('profiles').update({ avatar_url: `${publicUrl}?t=${Date.now()}` }).eq('id', user.id)
    await refreshProfile()
    setUploadingAvatar(false)
    if (avatarInputRef.current) avatarInputRef.current.value = ''
  }

  async function toggleListing(id: string, isActive: boolean) {
    setTogglingId(id)
    await supabase.from('skill_listings').update({ is_active: !isActive }).eq('id', id)
    setListings(prev => prev.map(l => l.id === id ? { ...l, is_active: !isActive } : l))
    setTogglingId(null)
  }

  const avgRating = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null
  const initials = (n: string | null) => (n ?? '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  const dp = isOwnProfile ? profile : viewedProfile

  // ── Loading skeleton ──────────────────────────────────────────────────────────
  if (loading) return (
    <div className="page-content" style={{ maxWidth: 860 }}>
      <style>{CSS}</style>
      <div style={{ background:'rgba(27,16,18,0.7)', border:'1px solid rgba(87,65,68,0.2)', borderRadius:22, overflow:'hidden', marginBottom:18, boxShadow:'0 4px 40px rgba(0,0,0,0.3)' }}>
        <div className="pf-shimmer" style={{ height:118, borderRadius:0 }} />
        <div style={{ padding:'0 28px 28px', marginTop:-44 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:20 }}>
            <div className="pf-shimmer" style={{ width:88, height:88, borderRadius:22, border:'4px solid rgba(18,10,14,0.95)' }} />
            <div style={{ display:'flex', gap:10 }}>
              <div className="pf-shimmer" style={{ width:130, height:40, borderRadius:99 }} />
              <div className="pf-shimmer" style={{ width:95, height:40, borderRadius:11 }} />
            </div>
          </div>
          <div className="pf-shimmer" style={{ width:210, height:27, borderRadius:8, marginBottom:10 }} />
          <div className="pf-shimmer" style={{ width:145, height:14, borderRadius:6, marginBottom:16 }} />
          <div className="pf-shimmer" style={{ width:'72%', height:14, borderRadius:6, marginBottom:8 }} />
          <div className="pf-shimmer" style={{ width:'55%', height:14, borderRadius:6, marginBottom:24 }} />
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
            {[0,1,2,3].map(i => <div key={i} className="pf-shimmer" style={{ height:80, borderRadius:14 }} />)}
          </div>
        </div>
      </div>
      <div className="pf-shimmer" style={{ height:50, borderRadius:14, marginBottom:14 }} />
      {[0,1,2].map(i => <div key={i} className="pf-shimmer" style={{ height:74, borderRadius:14, marginBottom:10 }} />)}
    </div>
  )

  // ── Not found ─────────────────────────────────────────────────────────────────
  if (notFound) return (
    <div className="page-content" style={{ maxWidth:860, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'60vh', textAlign:'center', gap:14 }}>
      <style>{CSS}</style>
      <div className="pf-0" style={{ fontSize:54, opacity:0.4 }}>👤</div>
      <h2 className="pf-1" style={{ fontSize:22, fontWeight:800, color:'var(--text-primary)' }}>Profile not found</h2>
      <p className="pf-1" style={{ fontSize:14, color:'var(--text-muted)' }}>This user doesn't exist or their profile is unavailable.</p>
      <button className="pf-btn pf-2" onClick={() => navigate(-1)}
        style={{ padding:'10px 26px', background:'var(--accent)', border:'none', borderRadius:11, color:'#fff', fontSize:14, fontWeight:700 }}
        onMouseEnter={e => e.currentTarget.style.background='#b01d4d'}
        onMouseLeave={e => e.currentTarget.style.background='var(--accent)'}
      >Go back</button>
    </div>
  )

  // ── Main ──────────────────────────────────────────────────────────────────────
  return (
    <div className="page-content" style={{ maxWidth: 860 }}>
      <style>{CSS}</style>

      {/* ── Header card ── */}
      <div className="pf-0" style={{
        background:'rgba(22,13,17,0.75)', border:'1px solid rgba(87,65,68,0.22)',
        borderRadius:22, marginBottom:16, overflow:'hidden',
        backdropFilter:'blur(16px)', boxShadow:'0 4px 48px rgba(0,0,0,0.35)',
      }}>

        {/* Banner */}
        <div style={{
          height:118, position:'relative', overflow:'hidden',
          background:'linear-gradient(135deg, rgba(155,22,65,0.65) 0%, rgba(95,12,42,0.5) 45%, rgba(22,8,16,0.3) 100%)',
        }}>
          <div style={{ position:'absolute', top:-55, right:-55, width:240, height:240, borderRadius:'50%', background:'rgba(138,21,56,0.15)', pointerEvents:'none' }} />
          <div style={{ position:'absolute', top:10, left:'40%', width:260, height:80, background:'radial-gradient(ellipse, rgba(255,255,255,0.04) 0%, transparent 70%)', pointerEvents:'none' }} />
          <div style={{ position:'absolute', bottom:-35, left:100, width:150, height:150, borderRadius:'50%', background:'rgba(200,40,100,0.07)', pointerEvents:'none' }} />

          {/* Back button — other user */}
          {!isOwnProfile && (
            <button className="pf-back" onClick={() => navigate(-1)} style={{
              position:'absolute', top:14, left:16, zIndex:2,
              background:'rgba(0,0,0,0.45)', backdropFilter:'blur(10px)',
              border:'1px solid rgba(255,255,255,0.15)', borderRadius:10,
              padding:'7px 15px', color:'rgba(255,255,255,0.72)', fontSize:13,
              display:'flex', alignItems:'center', gap:6,
            }}>← Back</button>
          )}

          {/* Action buttons — own profile, pinned top-right of banner */}
          {isOwnProfile && (
            <div style={{ position:'absolute', top:14, right:16, zIndex:2, display:'flex', gap:8 }}>
              <button className="pf-btn" onClick={openEdit}
                style={{ padding:'7px 16px', background:'rgba(0,0,0,0.4)', backdropFilter:'blur(10px)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:10, color:'rgba(255,255,255,0.8)', fontSize:13, fontWeight:600 }}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(138,21,56,0.55)'; e.currentTarget.style.borderColor='rgba(138,21,56,0.6)'; e.currentTarget.style.color='#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background='rgba(0,0,0,0.4)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.15)'; e.currentTarget.style.color='rgba(255,255,255,0.8)'; }}
              >Edit Profile</button>
              <button className="pf-btn" onClick={signOut}
                style={{ padding:'7px 16px', background:'rgba(0,0,0,0.4)', backdropFilter:'blur(10px)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:10, color:'rgba(255,255,255,0.6)', fontSize:13, fontWeight:600 }}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(248,113,113,0.2)'; e.currentTarget.style.borderColor='rgba(248,113,113,0.4)'; e.currentTarget.style.color='#f87171'; }}
                onMouseLeave={e => { e.currentTarget.style.background='rgba(0,0,0,0.4)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.12)'; e.currentTarget.style.color='rgba(255,255,255,0.6)'; }}
              >Sign Out</button>
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ padding:'0 28px 28px', marginTop:-44 }}>
          {!editing ? (
            <>
              {/* Avatar */}
              <div style={{ marginBottom:16, position:'relative', display:'inline-block' }}>
                <div
                  onClick={() => isOwnProfile && avatarInputRef.current?.click()}
                  title={isOwnProfile ? 'Change photo' : undefined}
                  className={isOwnProfile ? 'pf-av-wrap' : ''}
                  style={{
                    width:88, height:88, borderRadius:22,
                    background:'linear-gradient(135deg, var(--accent) 0%, #c0255a 100%)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:30, fontWeight:900, color:'#fff',
                    border:'4px solid rgba(16,9,13,0.97)',
                    overflow:'hidden', position:'relative',
                    boxShadow:'0 0 0 1.5px rgba(138,21,56,0.45), 0 14px 40px rgba(0,0,0,0.6)',
                    cursor: isOwnProfile ? 'pointer' : 'default',
                  }}
                >
                  {dp?.avatar_url
                    ? <img src={dp.avatar_url} alt="avatar" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                    : initials(dp?.full_name ?? null)
                  }
                  {isOwnProfile && (
                    <div className="pf-av-ov" style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.62)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {uploadingAvatar
                        ? <div style={{ width:22, height:22, border:'2.5px solid rgba(255,255,255,0.35)', borderTopColor:'#fff', borderRadius:'50%', animation:'pf-spin 0.7s linear infinite' }} />
                        : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      }
                    </div>
                  )}
                </div>
                {isOwnProfile && <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display:'none' }} onChange={handleAvatarChange} />}
                {avatarError && (
                  <div style={{ position:'absolute', top:'calc(100% + 8px)', left:0, width:215, fontSize:11, color:'#f87171', background:'rgba(16,8,12,0.97)', border:'1px solid rgba(248,113,113,0.22)', borderRadius:9, padding:'7px 11px', zIndex:20, lineHeight:1.5 }}>
                    {avatarError}
                  </div>
                )}
              </div>

              {/* Name + badge */}
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4, flexWrap:'wrap' }}>
                <h1 style={{ fontSize:26, fontWeight:900, color:'var(--text-primary)', letterSpacing:'-0.6px', lineHeight:1.15 }}>
                  {dp?.full_name ?? 'Student'}
                </h1>
                <RoleBadge role={dp?.role ?? 'student'} />
              </div>
              {(isOwnProfile ? profile?.username : viewedProfile?.username) && (
                <div style={{ fontSize:13, color:'rgba(192,37,90,.7)', fontWeight:600, marginBottom:4 }}>
                  @{isOwnProfile ? profile?.username : viewedProfile?.username}
                </div>
              )}

              {/* Karak Points — inline below name */}
              <div style={{ display:'inline-flex', alignItems:'center', gap:7, background:'rgba(233,193,118,0.07)', border:'1px solid rgba(233,193,118,0.17)', borderRadius:99, padding:'5px 14px', marginBottom:10 }}>
                <span style={{ fontSize:12, color:'rgba(233,193,118,0.7)' }}>✦</span>
                <span style={{ fontSize:15, fontWeight:900, color:'var(--gold)', letterSpacing:'-0.3px' }}>
                  {(dp?.karak_points ?? 0).toLocaleString()}
                </span>
                <span style={{ fontSize:10, fontWeight:700, color:'rgba(233,193,118,0.45)', letterSpacing:'0.08em', textTransform:'uppercase' }}>Karak Pts</span>
              </div>

              {dp?.university && (
                <div style={{ fontSize:13, color:'var(--text-muted)', marginBottom:12, display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ fontSize:11, opacity:0.6 }}>📍</span>{dp.university.name}
                </div>
              )}

              {dp?.bio && (
                <p style={{ fontSize:14, color:'var(--text-secondary)', lineHeight:1.78, maxWidth:560, marginBottom:14 }}>
                  {dp.bio}
                </p>
              )}

              {dp?.skills && dp.skills.length > 0 && (
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:22 }}>
                  {dp.skills.map((s, i) => (
                    <span key={s} style={{
                      fontSize:11, fontWeight:700, padding:'4px 12px', borderRadius:99,
                      background:'rgba(138,21,56,0.1)', color:'var(--accent)',
                      border:'1px solid rgba(138,21,56,0.22)',
                      animation:`pf-up 0.35s cubic-bezier(0.22,1,0.36,1) ${0.04*i}s both`,
                    }}>{s}</span>
                  ))}
                </div>
              )}

              {!dp?.bio && (!dp?.skills || dp.skills.length === 0) && (
                <div style={{ fontSize:13, color:'var(--text-muted)', fontStyle:'italic', marginBottom:22 }}>
                  {isOwnProfile ? 'No bio yet — add one to introduce yourself.' : "This user hasn't added a bio yet."}
                </div>
              )}

              {/* Message button — other users only */}
              {!isOwnProfile && (
                <div style={{ display:'flex', gap:8, marginBottom:20 }}>
                  {msgStatus === 'received' && (
                    <button className="pf-btn" onClick={declineRequest}
                      style={{ padding:'10px 18px', background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.25)', borderRadius:11, color:'#f87171', fontSize:13.5, fontWeight:600, fontFamily:'inherit' }}
                      onMouseEnter={e => e.currentTarget.style.background='rgba(239,68,68,.18)'}
                      onMouseLeave={e => e.currentTarget.style.background='rgba(239,68,68,.08)'}>
                      Decline
                    </button>
                  )}
                  <button className="pf-btn" onClick={handleMessageAction}
                    disabled={msgLoading || msgStatus === 'sent'}
                    style={{
                      padding:'10px 22px', borderRadius:11, fontSize:13.5, fontWeight:700, fontFamily:'inherit',
                      border: msgStatus === 'accepted' ? '1px solid rgba(138,21,56,.6)' : '1px solid rgba(255,255,255,.15)',
                      background: msgStatus === 'accepted' ? 'linear-gradient(135deg,#8a1538,#c0185c)' : msgStatus === 'received' ? 'rgba(34,197,94,.12)' : 'rgba(138,21,56,.15)',
                      color: msgStatus === 'received' ? '#4ade80' : '#fff',
                      opacity: msgStatus === 'sent' ? 0.55 : 1,
                      boxShadow: msgStatus === 'accepted' ? '0 4px 18px rgba(138,21,56,.35)' : 'none',
                      display:'flex', alignItems:'center', gap:7, cursor: msgStatus === 'sent' ? 'default' : 'pointer',
                    }}
                    onMouseEnter={e => { if (msgStatus !== 'sent') e.currentTarget.style.opacity = '0.85' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = msgStatus === 'sent' ? '0.55' : '1' }}>
                    {msgLoading
                      ? <span style={{ width:14, height:14, border:'2px solid rgba(255,255,255,.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'pf-spin .7s linear infinite', display:'inline-block' }} />
                      : msgStatus === 'none'     ? '✉'
                      : msgStatus === 'sent'     ? '✓'
                      : msgStatus === 'received' ? '✓'
                      : '💬'}
                    {msgLoading
                      ? 'Loading…'
                      : msgStatus === 'none'     ? 'Send Message Request'
                      : msgStatus === 'sent'     ? 'Request Sent'
                      : msgStatus === 'received' ? 'Accept Request'
                      : 'Open Chat'}
                  </button>
                </div>
              )}

              {/* Stats grid */}
              <div style={{ borderTop:'1px solid rgba(255,255,255,0.055)', paddingTop:20, display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
                {([
                  { label:'Clubs Joined',    value:clubs.length,                           color:'#0ea5e9', icon:'🏛️', t:'clubs'    },
                  { label:'Active Listings', value:listings.filter(l=>l.is_active).length, color:'#a855f7', icon:'⚡', t:'listings' },
                  { label:'Trades Done',     value:completedTrades,                         color:'#22c55e', icon:'🤝', t:'reviews'  },
                  { label:'Avg Rating',      value:avgRating ? `★ ${avgRating}` : '—',    color:'#e9c176', icon:'⭐', t:'reviews'  },
                ] as const).map(s => {
                  const on = tab === s.t
                  return (
                    <div key={s.label} className="pf-stat" onClick={() => setTab(s.t)} style={{
                      background: on ? `${s.color}13` : 'rgba(0,0,0,0.22)',
                      border: `1px solid ${on ? `${s.color}42` : 'rgba(255,255,255,0.055)'}`,
                      borderRadius:14, padding:'15px 10px', textAlign:'center',
                      boxShadow: on ? `0 0 22px ${s.color}1a` : 'none',
                    }}>
                      <div style={{ fontSize:20, marginBottom:5, lineHeight:1 }}>{s.icon}</div>
                      <div style={{ fontSize:19, fontWeight:900, color: on ? s.color : 'var(--text-primary)', letterSpacing:'-0.4px', marginBottom:3, transition:'color 0.2s' }}>
                        {s.value}
                      </div>
                      <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:600, letterSpacing:'0.03em', lineHeight:1.3 }}>
                        {s.label}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            /* Edit form */
            <div style={{ animation:'pf-in 0.22s ease both' }}>
              <div style={{ fontSize:11, fontWeight:800, color:'var(--accent)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:20 }}>
                Edit Profile
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                <div>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-muted)', marginBottom:7, letterSpacing:'0.07em', textTransform:'uppercase' }}>Full Name</label>
                  <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Your name" style={inputSt} />
                </div>
                <div>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-muted)', marginBottom:7, letterSpacing:'0.07em', textTransform:'uppercase' }}>Bio</label>
                  <textarea value={editBio} onChange={e => setEditBio(e.target.value)} placeholder="Tell people who you are and what you're about…" rows={3} maxLength={300} style={{ ...inputSt, resize:'vertical', lineHeight:1.65 }} />
                  <div style={{ textAlign:'right', fontSize:11, color:'var(--text-muted)', marginTop:4 }}>{editBio.length} / 300</div>
                </div>
                <div>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-muted)', marginBottom:7, letterSpacing:'0.07em', textTransform:'uppercase' }}>
                    Skills <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0 }}>(comma-separated)</span>
                  </label>
                  <input value={editSkillsRaw} onChange={e => setEditSkillsRaw(e.target.value)} placeholder="e.g. React, Figma, Python, Marketing" style={inputSt} />
                </div>
              </div>
              {editError && (
                <div style={{ fontSize:12, color:'#f87171', background:'rgba(248,113,113,0.07)', border:'1px solid rgba(248,113,113,0.2)', borderRadius:9, padding:'9px 13px', marginTop:14 }}>
                  {editError}
                </div>
              )}
              <div style={{ display:'flex', gap:10, marginTop:22 }}>
                <button className="pf-btn" onClick={() => setEditing(false)}
                  style={{ flex:1, padding:'11px', background:'transparent', border:'1px solid rgba(87,65,68,0.3)', borderRadius:11, color:'var(--text-muted)', fontSize:14 }}
                  onMouseEnter={e => e.currentTarget.style.borderColor='rgba(87,65,68,0.6)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor='rgba(87,65,68,0.3)'}
                >Cancel</button>
                <button className="pf-btn" onClick={saveEdit} disabled={saving}
                  style={{ flex:2, padding:'11px', background:saving?'rgba(138,21,56,0.45)':'var(--accent)', border:'none', borderRadius:11, color:'#fff', fontSize:14, fontWeight:700, opacity:saving?0.75:1 }}
                  onMouseEnter={e => { if (!saving) e.currentTarget.style.background='#b01d4d' }}
                  onMouseLeave={e => { if (!saving) e.currentTarget.style.background='var(--accent)' }}
                >{saving ? 'Saving…' : 'Save Changes'}</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="pf-1" style={{
        display:'flex', gap:3, background:'rgba(0,0,0,0.22)',
        border:'1px solid rgba(255,255,255,0.055)', borderRadius:15, padding:4, marginBottom:14,
      }}>
        {([
          { key:'posts',    label:'Posts',             count:profilePosts.length },
          { key:'clubs',    label:'Clubs Joined',      count:clubs.length },
          { key:'listings', label:'Skill Listings',    count:listings.length },
          { key:'reviews',  label:'Reviews Received',  count:reviews.length },
        ] as const).map(t => (
          <button key={t.key} className="pf-tab" onClick={() => setTab(t.key)} style={{
            flex:1, padding:'9px 10px', borderRadius:12, fontSize:13,
            fontWeight: tab === t.key ? 700 : 500,
            color: tab === t.key ? '#fff' : 'var(--text-muted)',
            background: tab === t.key ? 'rgba(138,21,56,0.22)' : 'transparent',
            border: tab === t.key ? '1px solid rgba(138,21,56,0.32)' : '1px solid transparent',
            display:'flex', alignItems:'center', justifyContent:'center', gap:7,
          }}>
            {t.label}
            <span style={{
              fontSize:11, fontWeight:700, padding:'1px 7px', borderRadius:99, minWidth:20,
              background: tab === t.key ? 'rgba(138,21,56,0.35)' : 'rgba(255,255,255,0.06)',
              color: tab === t.key ? '#f08' : 'var(--text-muted)',
              transition:'all 0.18s',
            }}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* ── Tab panel (key forces remount → animation plays) ── */}
      <div key={tab} className="pf-panel" style={{ marginBottom:36 }}>

        {/* Posts */}
        {tab === 'posts' && (
          loadingPosts
            ? (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {[0,1,2].map(i => <div key={i} className="pf-shimmer" style={{ height:90, borderRadius:14 }} />)}
              </div>
            )
            : profilePosts.length === 0
              ? <EmptyCard icon="✏️" text="No posts yet." />
              : (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {profilePosts.map((p, i) => {
                    const isRepost = !!p.repost_of && !p.content && !p.image_url && !(p.image_urls?.length)
                    const imgs = p.image_urls?.length ? p.image_urls : p.image_url ? [p.image_url] : []
                    return (
                      <div key={p.id} className="pf-post" style={{
                        background:'rgba(22,13,17,0.7)', border:'1px solid rgba(87,65,68,0.18)',
                        borderRadius:14, padding:'16px 18px',
                        boxShadow:'0 2px 14px rgba(0,0,0,0.2)',
                        animation:`pf-up 0.38s cubic-bezier(0.22,1,0.36,1) ${Math.min(i,8)*0.045}s both`,
                      }}>
                        {/* Repost badge */}
                        {p.repost_of && (
                          <div style={{ fontSize:11, color:'#4ade80', fontWeight:700, marginBottom:8, display:'flex', alignItems:'center', gap:5, opacity:0.75 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                              <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                            </svg>
                            Repost
                          </div>
                        )}

                        {/* Content */}
                        {p.content && (
                          <p style={{ fontSize:14, color:'var(--text-primary)', lineHeight:1.72, margin:'0 0 10px', whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
                            {p.content}
                          </p>
                        )}

                        {/* Poll */}
                        {p.pollQuestion && (
                          <div style={{ background:'rgba(96,165,250,0.05)', border:'1px solid rgba(96,165,250,0.18)', borderRadius:12, padding:'12px 14px', marginBottom:10 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:10 }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}>
                                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                              </svg>
                              <span style={{ fontSize:11, fontWeight:800, color:'#60a5fa', letterSpacing:'0.06em', textTransform:'uppercase' }}>Poll</span>
                            </div>
                            <div style={{ fontSize:13.5, fontWeight:700, color:'var(--text-primary)', marginBottom:10, lineHeight:1.4 }}>{p.pollQuestion}</div>
                            {p.pollOptions.map((opt, oi) => (
                              <div key={oi} style={{ marginBottom:6, borderRadius:8, border:'1px solid rgba(255,255,255,0.08)', padding:'7px 11px', background:'rgba(255,255,255,0.03)', fontSize:12.5, color:'var(--text-secondary)' }}>
                                {opt}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Images */}
                        {imgs.length > 0 && (
                          <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap' }}>
                            {imgs.slice(0,4).map((url, j) => (
                              <div key={j} style={{ width:72, height:72, borderRadius:10, overflow:'hidden', flexShrink:0, border:'1px solid rgba(255,255,255,0.08)' }}>
                                <img src={url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Quoted repost source */}
                        {isRepost && p.repostSource && (
                          <div style={{ background:'rgba(0,0,0,0.25)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:10, padding:'10px 13px', marginBottom:10, borderLeft:'3px solid rgba(138,21,56,0.4)' }}>
                            <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', marginBottom:5 }}>
                              {p.repostSource.profile?.full_name ?? 'User'}
                            </div>
                            {p.repostSource.content && (
                              <p style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.65, margin:0, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical' }}>
                                {p.repostSource.content}
                              </p>
                            )}
                            {p.repostSource.image_url && (
                              <div style={{ width:60, height:60, borderRadius:8, overflow:'hidden', marginTop:7, border:'1px solid rgba(255,255,255,0.07)' }}>
                                <img src={p.repostSource.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                              </div>
                            )}
                          </div>
                        )}

                        {/* Footer: stats + time */}
                        <div style={{ display:'flex', alignItems:'center', gap:16, marginTop: (p.content || imgs.length || isRepost) ? 6 : 0 }}>
                          <span style={{ fontSize:11, color:'var(--text-muted)', marginRight:'auto' }}>{timeAgo(p.created_at)}</span>
                          <span style={{ fontSize:12, color:'rgba(248,113,113,0.6)', display:'flex', alignItems:'center', gap:4 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill={p.likeCount>0?'currentColor':'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                            {p.likeCount}
                          </span>
                          <span style={{ fontSize:12, color:'rgba(96,165,250,0.6)', display:'flex', alignItems:'center', gap:4 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                            {p.commentCount}
                          </span>
                          <span style={{ fontSize:12, color:'rgba(74,222,128,0.6)', display:'flex', alignItems:'center', gap:4 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                            {p.repostCount}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
        )}

        {/* Clubs */}
        {tab === 'clubs' && (
          clubs.length === 0
            ? <EmptyCard icon="🏛️" text="No clubs joined yet." />
            : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(210px, 1fr))', gap:10 }}>
                {clubs.map((m, i) => {
                  const c = catColor(m.club?.category ?? null)
                  return (
                    <div key={m.club_id} className="pf-club" style={{
                      background:'rgba(22,13,17,0.7)', borderRadius:14, padding:'16px',
                      display:'flex', alignItems:'center', gap:13,
                      border:`1px solid rgba(87,65,68,0.18)`,
                      borderLeft:`3px solid ${c}70`,
                      boxShadow:'0 2px 14px rgba(0,0,0,0.22)',
                      animation:`pf-up 0.38s cubic-bezier(0.22,1,0.36,1) ${0.045*i}s both`,
                    }}>
                      <div style={{ width:40, height:40, borderRadius:12, background:m.club?.logo_url?'var(--bg-muted)':`${c}18`, border:`1px solid ${c}38`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:c, flexShrink:0, overflow:'hidden' }}>
                        {m.club?.logo_url
                          ? <img src={m.club.logo_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                          : (m.club?.name ?? '?')[0].toUpperCase()}
                      </div>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginBottom:2 }}>
                          {m.club?.name ?? '—'}
                        </div>
                        <div style={{ fontSize:11, color:'var(--text-muted)', textTransform:'capitalize' }}>{m.role}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
        )}

        {/* Listings */}
        {tab === 'listings' && (
          listings.length === 0
            ? <EmptyCard icon="⚡" text="No skill listings yet. Head to Skill Souq to post one." />
            : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {listings.map((l, i) => {
                  const c = catColor(l.category)
                  return (
                    <div key={l.id} className="pf-card" style={{
                      background:'rgba(22,13,17,0.7)', border:'1px solid rgba(87,65,68,0.18)',
                      borderRadius:14, padding:'17px 20px', display:'flex', alignItems:'center', gap:16,
                      boxShadow:'0 2px 14px rgba(0,0,0,0.2)',
                      animation:`pf-up 0.38s cubic-bezier(0.22,1,0.36,1) ${0.045*i}s both`,
                    }}>
                      <div style={{ width:9, height:9, borderRadius:'50%', background:l.is_active?'#22c55e':'rgba(255,255,255,0.14)', flexShrink:0, boxShadow:l.is_active?'0 0 9px rgba(34,197,94,0.75)':'none', transition:'all 0.25s' }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', marginBottom:7, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          {l.title}
                        </div>
                        <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                          <span style={{ fontSize:11, fontWeight:700, color:'#4ade80', background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.2)', borderRadius:7, padding:'2px 9px' }}>
                            {l.skill_offered}
                          </span>
                          <span style={{ color:'var(--text-muted)', fontSize:14 }}>⇄</span>
                          <span style={{ fontSize:11, fontWeight:700, color:'var(--text-secondary)', background:'rgba(138,21,56,0.1)', border:'1px solid rgba(138,21,56,0.2)', borderRadius:7, padding:'2px 9px' }}>
                            {l.skill_wanted}
                          </span>
                          {l.category && (
                            <span style={{ fontSize:10, fontWeight:700, color:c, background:`${c}12`, border:`1px solid ${c}28`, borderRadius:6, padding:'2px 8px' }}>
                              {l.category}
                            </span>
                          )}
                        </div>
                      </div>
                      {isOwnProfile ? (
                        <button className="pf-tog" onClick={() => toggleListing(l.id, l.is_active)} disabled={togglingId===l.id}
                          style={{ padding:'6px 14px', borderRadius:9, background:l.is_active?'rgba(34,197,94,0.1)':'rgba(255,255,255,0.04)', border:`1px solid ${l.is_active?'rgba(34,197,94,0.28)':'rgba(87,65,68,0.28)'}`, color:l.is_active?'#4ade80':'var(--text-muted)', fontSize:12, fontWeight:700, flexShrink:0 }}>
                          {togglingId===l.id ? '…' : l.is_active ? 'Active' : 'Paused'}
                        </button>
                      ) : (
                        <span style={{ fontSize:11, fontWeight:700, padding:'4px 11px', borderRadius:9, background:l.is_active?'rgba(34,197,94,0.1)':'rgba(255,255,255,0.04)', border:`1px solid ${l.is_active?'rgba(34,197,94,0.28)':'rgba(87,65,68,0.28)'}`, color:l.is_active?'#4ade80':'var(--text-muted)', flexShrink:0 }}>
                          {l.is_active ? 'Active' : 'Paused'}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )
        )}

        {/* Reviews */}
        {tab === 'reviews' && (
          reviews.length === 0
            ? <EmptyCard icon="★" text="No reviews yet. Complete a skill trade to start earning them." />
            : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {avgRating && (
                  <div style={{ display:'flex', alignItems:'center', gap:10, padding:'13px 18px', background:'rgba(233,193,118,0.055)', border:'1px solid rgba(233,193,118,0.14)', borderRadius:13, marginBottom:2 }}>
                    <Stars rating={Math.round(parseFloat(avgRating))} size={15} />
                    <span style={{ fontSize:17, fontWeight:900, color:'var(--gold)', letterSpacing:'-0.3px' }}>{avgRating}</span>
                    <span style={{ fontSize:12, color:'var(--text-muted)' }}>avg · {reviews.length} review{reviews.length !== 1 ? 's' : ''}</span>
                  </div>
                )}
                {reviews.map((r, i) => (
                  <div key={r.id} className="pf-review" style={{
                    background:'rgba(22,13,17,0.7)', border:'1px solid rgba(87,65,68,0.18)',
                    borderRadius:14, padding:'18px 20px',
                    animation:`pf-up 0.38s cubic-bezier(0.22,1,0.36,1) ${0.045*i}s both`,
                  }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom: r.comment ? 13 : 0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:11 }}>
                        <div style={{ width:34, height:34, borderRadius:10, background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:'#fff', flexShrink:0 }}>
                          {(r.reviewer?.full_name ?? '?')[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', marginBottom:3 }}>
                            {r.reviewer?.full_name ?? 'Anonymous'}
                          </div>
                          <Stars rating={r.rating} size={12} />
                        </div>
                      </div>
                      <span style={{ fontSize:11, color:'var(--text-muted)' }}>{timeAgo(r.created_at)}</span>
                    </div>
                    {r.comment && (
                      <div style={{ marginLeft:45, position:'relative', paddingLeft:10 }}>
                        <div style={{ position:'absolute', left:-2, top:-4, fontSize:28, color:'rgba(255,255,255,0.06)', lineHeight:1, fontFamily:'Georgia, serif' }}>"</div>
                        <p style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.72, fontStyle:'italic' }}>
                          {r.comment}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
        )}
      </div>
    </div>
  )
}

// ── Small components ──────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    admin:       { label:'Admin',       color:'#f97316', bg:'rgba(249,115,22,0.12)' },
    club_leader: { label:'Club Leader', color:'#e9c176', bg:'rgba(233,193,118,0.12)' },
    student:     { label:'Student',     color:'#6b7280', bg:'rgba(107,114,128,0.1)' },
  }
  const s = map[role] ?? map.student
  return (
    <span style={{ fontSize:10, fontWeight:800, letterSpacing:'0.08em', padding:'3px 10px', borderRadius:99, background:s.bg, color:s.color, textTransform:'uppercase' }}>
      {s.label}
    </span>
  )
}

function EmptyCard({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ padding:'52px 24px', textAlign:'center', background:'rgba(22,13,17,0.5)', border:'1px dashed rgba(87,65,68,0.2)', borderRadius:16, animation:'pf-in 0.3s ease both' }}>
      <div style={{ fontSize:34, marginBottom:12, opacity:0.3 }}>{icon}</div>
      <div style={{ fontSize:13, color:'var(--text-muted)', lineHeight:1.65 }}>{text}</div>
    </div>
  )
}
