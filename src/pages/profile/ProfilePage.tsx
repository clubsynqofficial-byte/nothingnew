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
interface SocialLinks {
  instagram?: string; x?: string; facebook?: string; youtube?: string; discord?: string
}

function extractHandle(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/^\/+|\/+$/g, '')
    const last = path.split('/').pop() ?? ''
    return last.startsWith('@') ? last.slice(1) : last
  } catch {
    return url.replace(/^@/, '')
  }
}

interface ProfileTheme {
  accent: string
  bg: string
  pill: string
  glow: boolean
}

interface ViewedProfile {
  id: string; full_name: string | null; avatar_url: string | null
  bio: string | null; skills: string[]; karak_points: number
  role: string; university: { name: string } | null; username: string | null
  banner_url: string | null; banner_position: number | null; banner_zoom: number | null
  social_links?: SocialLinks | null
  profile_theme?: ProfileTheme | null
}

const DEFAULT_THEME: ProfileTheme = { accent: '#8a1538', bg: 'dark', pill: 'filled', glow: false }

const ACCENT_PRESETS = [
  '#8a1538','#e11d48','#ec4899','#d946ef','#a855f7',
  '#6366f1','#3b82f6','#06b6d4','#22c55e','#f97316',
  '#e9c176','#ffffff',
]

const BG_THEMES: Record<string, { label: string; emoji: string; card: string; banner: string }> = {
  dark:     { label:'Dark',     emoji:'🌑', card:'rgba(22,13,17,0.75)', banner:'135deg,rgba(155,22,65,.65) 0%,rgba(95,12,42,.5) 45%,rgba(22,8,16,.3) 100%' },
  midnight: { label:'Midnight', emoji:'🌌', card:'rgba(8,8,20,0.9)',    banner:'135deg,rgba(30,20,80,.8) 0%,rgba(10,5,40,.7) 50%,rgba(4,2,20,.4) 100%' },
  space:    { label:'Space',    emoji:'🚀', card:'rgba(4,8,16,0.92)',   banner:'135deg,rgba(8,40,100,.7) 0%,rgba(4,15,50,.6) 50%,rgba(2,5,20,.4) 100%' },
  forest:   { label:'Forest',   emoji:'🌲', card:'rgba(4,18,8,0.88)',   banner:'135deg,rgba(10,60,20,.7) 0%,rgba(4,30,10,.6) 50%,rgba(2,12,4,.4) 100%' },
  ocean:    { label:'Ocean',    emoji:'🌊', card:'rgba(4,12,22,0.9)',   banner:'135deg,rgba(8,50,120,.7) 0%,rgba(4,20,70,.6) 50%,rgba(2,8,30,.4) 100%' },
  dusk:     { label:'Dusk',     emoji:'🌅', card:'rgba(18,10,4,0.9)',   banner:'135deg,rgba(120,40,0,.7) 0%,rgba(80,15,0,.6) 50%,rgba(30,5,0,.4) 100%' },
  void:     { label:'Void',     emoji:'⬛', card:'rgba(2,2,2,0.97)',    banner:'135deg,rgba(15,15,15,.9) 0%,rgba(5,5,5,.8) 50%,rgba(0,0,0,.7) 100%' },
}

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '')
  return [parseInt(c.slice(0,2),16), parseInt(c.slice(2,4),16), parseInt(c.slice(4,6),16)]
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

function buildCSS(r: number, g: number, b: number) {
  return `
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
  @keyframes pf-custIn {
    from { opacity:0; transform:translateY(30px) scale(0.97); }
    to   { opacity:1; transform:translateY(0) scale(1); }
  }
  @keyframes pf-bdIn { from { opacity:0; } to { opacity:1; } }

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
  .pf-card:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,0.3) !important; border-color:rgba(${r},${g},${b},0.3) !important; }

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
  .pf-post:hover { transform:translateY(-2px); border-color:rgba(${r},${g},${b},0.3) !important; box-shadow:0 8px 24px rgba(0,0,0,0.3) !important; }

  .pf-cust-btn { font-family:inherit; cursor:pointer; transition:all 0.2s; }
  .pf-cust-btn:hover { transform:translateY(-2px); box-shadow:0 8px 28px rgba(${r},${g},${b},0.5) !important; }

  .pf-swatch { cursor:pointer; transition:all 0.15s; }
  .pf-swatch:hover { transform:scale(1.12); }

  .pf-bg-opt { cursor:pointer; transition:all 0.15s; }
  .pf-bg-opt:hover { transform:translateY(-2px); }

  @media(max-width:600px) {
    .pf-inner-pad { padding: 0 14px 20px !important; }
    .pf-stats-grid { grid-template-columns: repeat(2,1fr) !important; }
    .pf-clubs-grid { grid-template-columns: repeat(2,1fr) !important; }
    .pf-action-row { flex-wrap: wrap !important; gap: 8px !important; }
    .pf-tabs-row { overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
    .pf-tabs-row::-webkit-scrollbar { display: none; }
    .pf-tab { white-space: nowrap; flex-shrink: 0; }
    .pf-msg-btn span.pf-msg-label { display: none; }
    .pf-btn-theme-label { display: none; }
  }
  @media(max-width:400px) {
    .pf-tab { padding: 8px 7px !important; font-size: 11px !important; }
  }

  input:focus, textarea:focus { border-color:rgba(${r},${g},${b},0.55) !important; outline:none; }
`
}

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
  const [editSocial, setEditSocial]   = useState<SocialLinks>({})
  const [saving, setSaving]           = useState(false)
  const [editError, setEditError]     = useState('')

  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError]         = useState('')

  const bannerInputRef = useRef<HTMLInputElement>(null)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [bannerError, setBannerError]         = useState('')
  const [bannerPosition, setBannerPosition]   = useState(50)
  const [bannerZoom, setBannerZoom]           = useState(1.0)
  const [adjustingBanner, setAdjustingBanner] = useState(false)
  const [savingPosition, setSavingPosition]   = useState(false)

  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [tab, setTab] = useState<'clubs' | 'listings' | 'reviews' | 'posts'>('posts')

  // Messaging
  type MsgReqStatus = 'none' | 'sent' | 'received' | 'accepted'
  const [msgStatus,  setMsgStatus]  = useState<MsgReqStatus>('none')
  const [msgReqId,   setMsgReqId]   = useState<string | null>(null)
  const [convId,     setConvId]     = useState<string | null>(null)
  const [msgLoading, setMsgLoading] = useState(false)
  const [profilePosts, setProfilePosts] = useState<ProfilePost[]>([])
  const [loadingPosts, setLoadingPosts] = useState(false)

  const [theme, setTheme]           = useState<ProfileTheme>(DEFAULT_THEME)
  const [editTheme, setEditTheme]   = useState<ProfileTheme>(DEFAULT_THEME)
  const [customizing, setCustomizing] = useState(false)
  const [savingTheme, setSavingTheme] = useState(false)

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
      if (user) {
        fetchAll(user.id)
        fetchProfilePosts(user.id)
        supabase.from('profiles').select('profile_theme').eq('id', user.id).single()
          .then(({ data }) => {
            if (data?.profile_theme) setTheme({ ...DEFAULT_THEME, ...(data.profile_theme as ProfileTheme) })
          })
      }
    } else if (paramUserId) {
      supabase.from('profiles').select('id, full_name, avatar_url, bio, skills, karak_points, role, username, university:universities(name), banner_url, banner_position, banner_zoom, social_links, profile_theme').eq('id', paramUserId).maybeSingle()
        .then(({ data }) => {
          if (!data) { setNotFound(true); setLoading(false); return }
          setViewedProfile(data as unknown as ViewedProfile)
          if ((data as any).profile_theme) setTheme({ ...DEFAULT_THEME, ...((data as any).profile_theme as ProfileTheme) })
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
      } else if (data.status === 'declined') {
        // Treat declined as none so either side can re-initiate
        setMsgStatus('none')
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
      await supabase.from('message_requests').delete().eq('from_user_id', user.id).eq('to_user_id', paramUserId).eq('status', 'declined')
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
      let resolvedConvId = convId
      if (!resolvedConvId) {
        const { data: c } = await supabase.from('conversations').select('id').eq('type', 'dm')
          .or(`and(participant_1.eq.${user.id},participant_2.eq.${paramUserId}),and(participant_1.eq.${paramUserId},participant_2.eq.${user.id})`)
          .maybeSingle()
        resolvedConvId = c?.id ?? null
        if (resolvedConvId) setConvId(resolvedConvId)
      }
      navigate('/messages', {
        state: {
          dmConvId: resolvedConvId,
          dmOtherId: paramUserId,
          dmOtherName: viewedProfile?.full_name ?? null,
          dmOtherAvatar: viewedProfile?.avatar_url ?? null,
          dmOtherUsername: viewedProfile?.username ?? null,
        }
      })
    }
    setMsgLoading(false)
  }

  async function declineRequest() {
    if (!msgReqId) return
    await supabase.from('message_requests').update({ status: 'declined' }).eq('id', msgReqId)
    setMsgStatus('none')
    setMsgReqId(null)
  }

  async function saveTheme() {
    if (!user) return
    setSavingTheme(true)
    await supabase.from('profiles').update({ profile_theme: editTheme }).eq('id', user.id)
    setTheme(editTheme)
    setSavingTheme(false)
    setCustomizing(false)
  }

  function openEdit() {
    setEditName(profile?.full_name ?? '')
    setEditBio(profile?.bio ?? '')
    setEditSkillsRaw((profile?.skills ?? []).join(', '))
    setEditSocial(profile?.social_links ?? {})
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
    const socialLinks: SocialLinks = {}
    if (editSocial.instagram?.trim()) socialLinks.instagram = editSocial.instagram.trim()
    if (editSocial.x?.trim()) socialLinks.x = editSocial.x.trim()
    if (editSocial.facebook?.trim()) socialLinks.facebook = editSocial.facebook.trim()
    if (editSocial.youtube?.trim()) socialLinks.youtube = editSocial.youtube.trim()
    if (editSocial.discord?.trim()) socialLinks.discord = editSocial.discord.trim()
    await supabase.from('profiles').update({ full_name: name, bio: editBio.trim() || null, skills, social_links: socialLinks }).eq('id', user.id)
    await refreshProfile()
    setSaving(false)
    setEditing(false)
  }

  useEffect(() => {
    setBannerPosition(profile?.banner_position ?? 50)
    setBannerZoom(profile?.banner_zoom ?? 1.0)
  }, [profile?.banner_position, profile?.banner_zoom])

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

  async function handleBannerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    if (!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)) { setBannerError('Only JPEG, PNG, WebP, or GIF allowed.'); return }
    if (file.size > 8 * 1024 * 1024) { setBannerError('Image must be under 8 MB.'); return }
    setBannerError(''); setUploadingBanner(true)
    const ext = file.name.split('.').pop()
    const path = `${user.id}/banner.${ext}`
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) { setBannerError('Upload failed. Please try again.'); setUploadingBanner(false); return }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    await supabase.from('profiles').update({ banner_url: `${publicUrl}?t=${Date.now()}` }).eq('id', user.id)
    await refreshProfile()
    setUploadingBanner(false)
    if (bannerInputRef.current) bannerInputRef.current.value = ''
  }

  async function removeAvatar() {
    if (!user) return
    await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id)
    await refreshProfile()
  }

  async function removeBanner() {
    if (!user) return
    await supabase.from('profiles').update({ banner_url: null, banner_position: 50, banner_zoom: 1.0 }).eq('id', user.id)
    setBannerPosition(50)
    setBannerZoom(1.0)
    setAdjustingBanner(false)
    await refreshProfile()
  }

  async function saveBannerPosition() {
    if (!user) return
    setSavingPosition(true)
    await supabase.from('profiles').update({
      banner_position: Math.round(bannerPosition),
      banner_zoom: Math.round(bannerZoom * 100) / 100,
    }).eq('id', user.id)
    await refreshProfile()
    setSavingPosition(false)
    setAdjustingBanner(false)
  }

  function startBannerDrag(clientY: number) {
    const startPos = bannerPosition
    const onMove = (e: MouseEvent | TouchEvent) => {
      const y = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY
      const delta = (y - clientY) * 0.7
      setBannerPosition(_p => Math.max(0, Math.min(100, startPos - delta)))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onUp)
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

  // Theme-derived values
  const activeTheme = customizing ? editTheme : theme
  const [tr, tg, tb] = hexToRgb(activeTheme.accent)
  const ta = (a: number) => `rgba(${tr},${tg},${tb},${a})`
  const bgTheme = BG_THEMES[activeTheme.bg] ?? BG_THEMES.dark
  const CSS = buildCSS(tr, tg, tb)

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
    <div className="page-content" style={{ maxWidth: 860, '--accent': activeTheme.accent } as React.CSSProperties}>
      <style>{CSS}</style>

      {/* ── Header card ── */}
      <div className="pf-0" style={{
        background: bgTheme.card,
        border:`1px solid ${ta(0.22)}`,
        borderRadius:22, marginBottom:16, overflow:'hidden',
        backdropFilter:'blur(16px)',
        boxShadow: activeTheme.glow
          ? `0 4px 48px rgba(0,0,0,0.35), 0 0 60px ${ta(0.15)}`
          : '0 4px 48px rgba(0,0,0,0.35)',
        transition:'box-shadow 0.4s, border-color 0.4s',
      }}>

        {/* Banner */}
        <div style={{
          height:118, position:'relative', overflow:'hidden',
          background:`linear-gradient(${bgTheme.banner})`,
          transition:'background 0.5s',
        }}>
          {/* Banner image */}
          {dp?.banner_url && (
            <div style={{
              position:'absolute', inset:0, pointerEvents:'none',
              backgroundImage:`url("${dp.banner_url}")`,
              backgroundRepeat:'no-repeat',
              backgroundPosition:`center ${isOwnProfile ? bannerPosition : (dp.banner_position ?? 50)}%`,
              backgroundSize: (isOwnProfile ? bannerZoom : (dp.banner_zoom ?? 1)) <= 1 ? 'cover' : `${((isOwnProfile ? bannerZoom : (dp.banner_zoom ?? 1)) * 100).toFixed(1)}%`,
            }} />
          )}
          {/* Drag-to-reposition overlay */}
          {adjustingBanner && dp?.banner_url && (
            <div
              onMouseDown={e => { e.preventDefault(); startBannerDrag(e.clientY) }}
              onTouchStart={e => startBannerDrag(e.touches[0].clientY)}
              style={{ position:'absolute', inset:0, zIndex:2, cursor:'ns-resize', userSelect:'none', background:'rgba(0,0,0,0.35)' }}
            >
              {/* Reposition hint — centre */}
              <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', background:'rgba(0,0,0,0.65)', backdropFilter:'blur(8px)', borderRadius:9999, padding:'7px 18px', display:'flex', alignItems:'center', gap:8, color:'rgba(255,255,255,0.9)', fontSize:12, fontWeight:600, border:'1px solid rgba(255,255,255,0.15)', pointerEvents:'none' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 5 5 12"/></svg>
                Drag to reposition
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
              </div>
              {/* Zoom slider — bottom centre, stops drag propagation */}
              <div
                onMouseDown={e => e.stopPropagation()}
                onTouchStart={e => e.stopPropagation()}
                style={{ position:'absolute', bottom:10, left:'50%', transform:'translateX(-50%)', display:'flex', alignItems:'center', gap:10, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(8px)', borderRadius:9999, padding:'6px 16px', border:'1px solid rgba(255,255,255,0.15)', cursor:'default' }}
              >
                <button onMouseDown={e => e.stopPropagation()} onClick={() => setBannerZoom(z => Math.max(1.0, +(z - 0.1).toFixed(2)))} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.8)', fontSize:16, lineHeight:1, cursor:'pointer', padding:'0 2px', fontWeight:300 }}>−</button>
                <input
                  type="range" min={1.0} max={2.5} step={0.01}
                  value={bannerZoom}
                  onChange={e => setBannerZoom(parseFloat(e.target.value))}
                  style={{ width:110, accentColor:'var(--accent)', cursor:'pointer' }}
                />
                <button onMouseDown={e => e.stopPropagation()} onClick={() => setBannerZoom(z => Math.min(2.5, +(z + 0.1).toFixed(2)))} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.8)', fontSize:16, lineHeight:1, cursor:'pointer', padding:'0 2px', fontWeight:300 }}>+</button>
                <span style={{ fontSize:10, color:'rgba(255,255,255,0.5)', minWidth:30, textAlign:'right' }}>{Math.round(bannerZoom * 100)}%</span>
              </div>
            </div>
          )}
          {!dp?.banner_url && (
            <>
              <div style={{ position:'absolute', top:-55, right:-55, width:240, height:240, borderRadius:'50%', background:ta(0.15), pointerEvents:'none', transition:'background 0.5s' }} />
              <div style={{ position:'absolute', top:10, left:'40%', width:260, height:80, background:'radial-gradient(ellipse, rgba(255,255,255,0.04) 0%, transparent 70%)', pointerEvents:'none' }} />
              <div style={{ position:'absolute', bottom:-35, left:100, width:150, height:150, borderRadius:'50%', background:ta(0.07), pointerEvents:'none', transition:'background 0.5s' }} />
            </>
          )}

          {/* Banner controls — own profile */}
          {isOwnProfile && (
            <>
              <input ref={bannerInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display:'none' }} onChange={handleBannerChange} />
              {bannerError && (
                <div style={{ position:'absolute', bottom:44, right:16, zIndex:4, whiteSpace:'nowrap', fontSize:11, color:'#f87171', background:'rgba(16,8,12,0.95)', border:'1px solid rgba(248,113,113,0.22)', borderRadius:8, padding:'4px 10px' }}>{bannerError}</div>
              )}
              <div style={{ position:'absolute', bottom:10, right:16, zIndex:3, display:'flex', gap:6 }}>
                {adjustingBanner ? (
                  <>
                    <button
                      onClick={() => { setAdjustingBanner(false); setBannerPosition(profile?.banner_position ?? 50); setBannerZoom(profile?.banner_zoom ?? 1.0) }}
                      style={{ padding:'5px 13px', background:'rgba(0,0,0,0.55)', backdropFilter:'blur(10px)', border:'1px solid rgba(255,255,255,0.18)', borderRadius:9999, color:'rgba(255,255,255,0.75)', fontSize:12, fontWeight:600, cursor:'pointer' }}
                    >Cancel</button>
                    <button
                      onClick={saveBannerPosition}
                      disabled={savingPosition}
                      style={{ padding:'5px 14px', background: savingPosition ? 'rgba(138,21,56,0.4)' : 'var(--accent)', border:'none', borderRadius:9999, color:'#fff', fontSize:12, fontWeight:700, cursor: savingPosition ? 'default' : 'pointer', opacity: savingPosition ? 0.7 : 1, display:'flex', alignItems:'center', gap:6 }}
                    >
                      {savingPosition ? <><span style={{ width:10, height:10, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', display:'inline-block', animation:'pf-spin .7s linear infinite' }} /> Saving…</> : 'Save'}
                    </button>
                  </>
                ) : (
                  <>
                    {/* Swap photo icon — always visible */}
                    <button
                      onClick={() => bannerInputRef.current?.click()}
                      disabled={uploadingBanner}
                      title={profile?.banner_url ? 'Change banner' : 'Add banner'}
                      style={{ width:32, height:32, padding:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(10px)', border:'1px solid rgba(255,255,255,0.18)', borderRadius:'50%', color:'rgba(255,255,255,0.8)', cursor:uploadingBanner?'default':'pointer', display:'flex', alignItems:'center', justifyContent:'center', opacity:uploadingBanner?0.5:1, transition:'opacity .15s,background .15s' }}
                      onMouseEnter={e => { if (!uploadingBanner) e.currentTarget.style.background='rgba(0,0,0,0.75)' }}
                      onMouseLeave={e => { e.currentTarget.style.background='rgba(0,0,0,0.5)' }}
                    >
                      {uploadingBanner
                        ? <span style={{ width:13, height:13, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', display:'inline-block', animation:'pf-spin .7s linear infinite' }} />
                        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                      }
                    </button>
                    {/* Adjust position — only if banner exists */}
                    {profile?.banner_url && (
                      <button
                        onClick={() => setAdjustingBanner(true)}
                        title="Adjust position"
                        style={{ width:32, height:32, padding:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(10px)', border:'1px solid rgba(255,255,255,0.18)', borderRadius:'50%', color:'rgba(255,255,255,0.8)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'background .15s' }}
                        onMouseEnter={e => e.currentTarget.style.background='rgba(0,0,0,0.75)'}
                        onMouseLeave={e => e.currentTarget.style.background='rgba(0,0,0,0.5)'}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><line x1="2" y1="12" x2="22" y2="12"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/></svg>
                      </button>
                    )}
                    {/* Remove banner — only if banner exists */}
                    {profile?.banner_url && (
                      <button
                        onClick={removeBanner}
                        title="Remove banner"
                        style={{ width:32, height:32, padding:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(10px)', border:'1px solid rgba(248,113,113,0.25)', borderRadius:'50%', color:'rgba(248,113,113,0.7)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'background .15s' }}
                        onMouseEnter={e => e.currentTarget.style.background='rgba(248,113,113,0.18)'}
                        onMouseLeave={e => e.currentTarget.style.background='rgba(0,0,0,0.5)'}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          )}

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

          {/* Edit Profile button — own profile, top-right of banner */}
          {isOwnProfile && (
            <div style={{ position:'absolute', top:10, right:12, zIndex:2, display:'flex', gap:6 }}>
              {/* 🎨 Theme — icon-only on mobile */}
              <button className="pf-btn pf-btn-theme" onClick={() => { setEditTheme({ ...theme }); setCustomizing(true) }}
                style={{ padding:'7px 12px', background:'rgba(0,0,0,0.4)', backdropFilter:'blur(10px)', border:`1px solid ${ta(0.3)}`, borderRadius:10, color:activeTheme.accent, fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:5 }}
                onMouseEnter={e => { e.currentTarget.style.background=ta(0.25); e.currentTarget.style.color='#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background='rgba(0,0,0,0.4)'; e.currentTarget.style.color=activeTheme.accent; }}
                title="Customize Theme"
              >
                <span>🎨</span>
                <span className="pf-btn-theme-label">Theme</span>
              </button>
              <button className="pf-btn" onClick={openEdit}
                style={{ padding:'7px 14px', background:'rgba(0,0,0,0.4)', backdropFilter:'blur(10px)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:10, color:'rgba(255,255,255,0.8)', fontSize:13, fontWeight:600, whiteSpace:'nowrap' }}
                onMouseEnter={e => { e.currentTarget.style.background=ta(0.55); e.currentTarget.style.borderColor=ta(0.6); e.currentTarget.style.color='#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background='rgba(0,0,0,0.4)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.15)'; e.currentTarget.style.color='rgba(255,255,255,0.8)'; }}
              >Edit</button>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="pf-inner-pad" style={{ padding:'0 28px 28px', marginTop: editing ? 12 : -44 }}>
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
                    background:`linear-gradient(135deg, ${activeTheme.accent} 0%, ${ta(0.9)} 100%)`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:30, fontWeight:900, color:'#fff',
                    border:'4px solid rgba(16,9,13,0.97)',
                    overflow:'hidden', position:'relative',
                    boxShadow: activeTheme.glow
                      ? `0 0 0 1.5px ${ta(0.45)}, 0 14px 40px rgba(0,0,0,0.6), 0 0 30px ${ta(0.4)}`
                      : `0 0 0 1.5px ${ta(0.45)}, 0 14px 40px rgba(0,0,0,0.6)`,
                    cursor: isOwnProfile ? 'pointer' : 'default',
                    transition:'box-shadow 0.4s',
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
                {isOwnProfile && profile?.avatar_url && (
                  <button
                    onClick={removeAvatar}
                    title="Remove photo"
                    style={{ position:'absolute', bottom:-10, left:'50%', transform:'translateX(-50%)', whiteSpace:'nowrap', fontSize:10, fontWeight:700, color:'rgba(248,113,113,0.7)', background:'rgba(16,8,12,0.92)', border:'1px solid rgba(248,113,113,0.2)', borderRadius:99, padding:'3px 9px', cursor:'pointer', fontFamily:'inherit' }}
                  >remove</button>
                )}
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
                <p style={{ fontSize:14, color:'var(--text-secondary)', lineHeight:1.78, maxWidth:560, marginBottom:14, whiteSpace:'pre-wrap', overflowWrap:'break-word' }}>
                  {dp.bio}
                </p>
              )}

              {dp?.skills && dp.skills.length > 0 && (
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:22 }}>
                  {dp.skills.map((s, i) => {
                    const pillStyle: React.CSSProperties =
                      activeTheme.pill === 'outlined'
                        ? { fontSize:11, fontWeight:700, padding:'4px 12px', borderRadius:99, background:'transparent', color:activeTheme.accent, border:`1.5px solid ${ta(0.55)}`, animation:`pf-up 0.35s cubic-bezier(0.22,1,0.36,1) ${0.04*i}s both` }
                        : activeTheme.pill === 'glow'
                        ? { fontSize:11, fontWeight:700, padding:'4px 12px', borderRadius:99, background:ta(0.15), color:activeTheme.accent, border:`1px solid ${ta(0.35)}`, boxShadow:`0 0 10px ${ta(0.3)}`, animation:`pf-up 0.35s cubic-bezier(0.22,1,0.36,1) ${0.04*i}s both` }
                        : { fontSize:11, fontWeight:700, padding:'4px 12px', borderRadius:99, background:ta(0.1), color:activeTheme.accent, border:`1px solid ${ta(0.22)}`, animation:`pf-up 0.35s cubic-bezier(0.22,1,0.36,1) ${0.04*i}s both` }
                    return <span key={s} style={pillStyle}>{s}</span>
                  })}
                </div>
              )}

              {dp?.social_links && Object.values(dp.social_links).some(v => v) && (
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:18 }}>
                  {dp.social_links.instagram && (
                    <a href={dp.social_links.instagram} target="_blank" rel="noopener noreferrer"
                      style={{ display:'flex', alignItems:'center', gap:7, height:36, padding:'0 12px', borderRadius:10, background:'rgba(225,48,108,0.08)', border:'1px solid rgba(225,48,108,0.22)', textDecoration:'none', transition:'background .15s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.background='rgba(225,48,108,0.18)'}
                      onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.background='rgba(225,48,108,0.08)'}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                          <linearGradient id="ig-g" x1="0%" y1="100%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#FCAF45"/>
                            <stop offset="35%" stopColor="#FD1D1D"/>
                            <stop offset="70%" stopColor="#C13584"/>
                            <stop offset="100%" stopColor="#833AB4"/>
                          </linearGradient>
                        </defs>
                        <rect x="2" y="2" width="20" height="20" rx="5.5" stroke="url(#ig-g)" strokeWidth="2"/>
                        <circle cx="12" cy="12" r="4.5" stroke="url(#ig-g)" strokeWidth="2"/>
                        <circle cx="17.5" cy="6.5" r="1.2" fill="url(#ig-g)"/>
                      </svg>
                      <span style={{ fontSize:12, fontWeight:600, color:'#e1306c' }}>@{extractHandle(dp.social_links.instagram)}</span>
                    </a>
                  )}
                  {dp.social_links.x && (
                    <a href={dp.social_links.x} target="_blank" rel="noopener noreferrer"
                      style={{ display:'flex', alignItems:'center', gap:7, height:36, padding:'0 12px', borderRadius:10, background:'#0f0f0f', border:'1px solid rgba(255,255,255,0.08)', textDecoration:'none', transition:'opacity .15s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.opacity='0.8'}
                      onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.opacity='1'}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="#ffffff" xmlns="http://www.w3.org/2000/svg">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.732-8.855L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                      </svg>
                      <span style={{ fontSize:12, fontWeight:600, color:'#ffffff' }}>@{extractHandle(dp.social_links.x)}</span>
                    </a>
                  )}
                  {dp.social_links.facebook && (
                    <a href={dp.social_links.facebook} target="_blank" rel="noopener noreferrer" title="Facebook"
                      style={{ display:'flex', alignItems:'center', justifyContent:'center', width:36, height:36, borderRadius:10, background:'rgba(24,119,242,0.08)', border:'1px solid rgba(24,119,242,0.22)', textDecoration:'none', transition:'background .15s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.background='rgba(24,119,242,0.18)'}
                      onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.background='rgba(24,119,242,0.08)'}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2" xmlns="http://www.w3.org/2000/svg">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                      </svg>
                    </a>
                  )}
                  {dp.social_links.youtube && (
                    <a href={dp.social_links.youtube} target="_blank" rel="noopener noreferrer"
                      style={{ display:'flex', alignItems:'center', gap:7, height:36, padding:'0 12px', borderRadius:10, background:'rgba(255,0,0,0.07)', border:'1px solid rgba(255,0,0,0.2)', textDecoration:'none', transition:'background .15s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.background='rgba(255,0,0,0.15)'}
                      onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.background='rgba(255,0,0,0.07)'}>
                      <svg width="20" height="18" viewBox="0 0 24 24" fill="#ff0000" xmlns="http://www.w3.org/2000/svg">
                        <path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/>
                      </svg>
                      <span style={{ fontSize:12, fontWeight:600, color:'#ff0000' }}>@{extractHandle(dp.social_links.youtube)}</span>
                    </a>
                  )}
                  {dp.social_links.discord && (
                    <a href={dp.social_links.discord.startsWith('http') ? dp.social_links.discord : `https://discord.com/users/${dp.social_links.discord}`} target="_blank" rel="noopener noreferrer" title="Discord"
                      style={{ display:'flex', alignItems:'center', justifyContent:'center', width:36, height:36, borderRadius:10, background:'rgba(88,101,242,0.08)', border:'1px solid rgba(88,101,242,0.22)', textDecoration:'none', transition:'background .15s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.background='rgba(88,101,242,0.18)'}
                      onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.background='rgba(88,101,242,0.08)'}>
                      <svg width="20" height="18" viewBox="0 0 24 24" fill="#5865F2" xmlns="http://www.w3.org/2000/svg">
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.001.022.01.043.02.063a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                      </svg>
                    </a>
                  )}
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
                      style={{ padding:'9px 18px', background:'rgba(239,68,68,.07)', border:'1px solid rgba(239,68,68,.22)', borderRadius:10, color:'#f87171', fontSize:13, fontWeight:600, fontFamily:'inherit', display:'flex', alignItems:'center', gap:6, cursor:'pointer', transition:'background .15s' }}
                      onMouseEnter={e => e.currentTarget.style.background='rgba(239,68,68,.15)'}
                      onMouseLeave={e => e.currentTarget.style.background='rgba(239,68,68,.07)'}>
                      Decline
                    </button>
                  )}
                  <button className="pf-btn" onClick={handleMessageAction}
                    disabled={msgLoading || msgStatus === 'sent'}
                    style={{
                      padding:'9px 20px', borderRadius:10, fontSize:13, fontWeight:600, fontFamily:'inherit',
                      display:'flex', alignItems:'center', gap:7,
                      cursor: msgStatus === 'sent' ? 'default' : 'pointer',
                      transition:'opacity .15s, box-shadow .15s',
                      ...(msgStatus === 'accepted'
                        ? { background:'linear-gradient(135deg,#8a1538,#b01550)', border:'1px solid rgba(138,21,56,.5)', color:'#fff', boxShadow:'0 2px 14px rgba(138,21,56,.3)' }
                        : msgStatus === 'received'
                        ? { background:'rgba(34,197,94,.1)', border:'1px solid rgba(34,197,94,.25)', color:'#4ade80', boxShadow:'none' }
                        : msgStatus === 'sent'
                        ? { background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.1)', color:'rgba(255,255,255,.4)', boxShadow:'none' }
                        : { background:'rgba(138,21,56,.12)', border:'1px solid rgba(138,21,56,.3)', color:'rgba(255,255,255,.85)', boxShadow:'none' }),
                    }}
                    onMouseEnter={e => { if (msgStatus !== 'sent') e.currentTarget.style.opacity = '0.8' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}>
                    {msgLoading ? (
                      <span style={{ width:13, height:13, border:'2px solid rgba(255,255,255,.25)', borderTopColor:'currentColor', borderRadius:'50%', animation:'pf-spin .7s linear infinite', display:'inline-block', flexShrink:0 }} />
                    ) : msgStatus === 'accepted' ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    ) : msgStatus === 'received' ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : msgStatus === 'sent' ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    )}
                    {msgLoading ? 'Loading…'
                      : msgStatus === 'none'     ? 'Send Message Request'
                      : msgStatus === 'sent'     ? 'Request Sent'
                      : msgStatus === 'received' ? 'Accept Request'
                      : 'Open Chat'}
                  </button>
                </div>
              )}

              {/* Stats grid */}
              <div className="pf-stats-grid" style={{ borderTop:'1px solid rgba(255,255,255,0.055)', paddingTop:20, display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
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

                {/* Social Links */}
                <div>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-muted)', marginBottom:10, letterSpacing:'0.07em', textTransform:'uppercase' }}>Social Links</label>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {/* Instagram */}
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ width:24, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <defs>
                            <linearGradient id="ig-edit" x1="0%" y1="100%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#FCAF45"/>
                              <stop offset="35%" stopColor="#FD1D1D"/>
                              <stop offset="70%" stopColor="#C13584"/>
                              <stop offset="100%" stopColor="#833AB4"/>
                            </linearGradient>
                          </defs>
                          <rect x="2" y="2" width="20" height="20" rx="5.5" stroke="url(#ig-edit)" strokeWidth="2"/>
                          <circle cx="12" cy="12" r="4.5" stroke="url(#ig-edit)" strokeWidth="2"/>
                          <circle cx="17.5" cy="6.5" r="1.2" fill="url(#ig-edit)"/>
                        </svg>
                      </span>
                      <input value={editSocial.instagram ?? ''} onChange={e => setEditSocial(prev => ({ ...prev, instagram: e.target.value }))} placeholder="https://instagram.com/yourhandle" style={{ ...inputSt, flex:1, fontSize:12.5 }}/>
                    </div>
                    {/* X */}
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ width:24, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style={{ color:'var(--text-primary)' }}>
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.732-8.855L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                        </svg>
                      </span>
                      <input value={editSocial.x ?? ''} onChange={e => setEditSocial(prev => ({ ...prev, x: e.target.value }))} placeholder="https://x.com/yourhandle" style={{ ...inputSt, flex:1, fontSize:12.5 }}/>
                    </div>
                    {/* Facebook */}
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ width:24, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2" xmlns="http://www.w3.org/2000/svg">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                        </svg>
                      </span>
                      <input value={editSocial.facebook ?? ''} onChange={e => setEditSocial(prev => ({ ...prev, facebook: e.target.value }))} placeholder="https://facebook.com/yourprofile" style={{ ...inputSt, flex:1, fontSize:12.5 }}/>
                    </div>
                    {/* YouTube */}
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ width:24, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <svg width="20" height="18" viewBox="0 0 24 24" fill="#ff0000" xmlns="http://www.w3.org/2000/svg">
                          <path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/>
                        </svg>
                      </span>
                      <input value={editSocial.youtube ?? ''} onChange={e => setEditSocial(prev => ({ ...prev, youtube: e.target.value }))} placeholder="https://youtube.com/@yourchannel" style={{ ...inputSt, flex:1, fontSize:12.5 }}/>
                    </div>
                    {/* Discord */}
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ width:24, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <svg width="20" height="18" viewBox="0 0 24 24" fill="#5865F2" xmlns="http://www.w3.org/2000/svg">
                          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.001.022.01.043.02.063a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                        </svg>
                      </span>
                      <input value={editSocial.discord ?? ''} onChange={e => setEditSocial(prev => ({ ...prev, discord: e.target.value }))} placeholder="yourhandle or server invite" style={{ ...inputSt, flex:1, fontSize:12.5 }}/>
                    </div>
                  </div>
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
              <button className="pf-btn" onClick={signOut}
                style={{ width:'100%', marginTop:10, padding:'10px', background:'transparent', border:'1px solid rgba(248,113,113,0.18)', borderRadius:11, color:'rgba(248,113,113,0.55)', fontSize:13, fontWeight:600 }}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(248,113,113,0.07)'; e.currentTarget.style.color='#f87171'; e.currentTarget.style.borderColor='rgba(248,113,113,0.35)'; }}
                onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='rgba(248,113,113,0.55)'; e.currentTarget.style.borderColor='rgba(248,113,113,0.18)'; }}
              >Sign Out</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="pf-1 pf-tabs-row" style={{
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
            background: tab === t.key ? ta(0.22) : 'transparent',
            border: tab === t.key ? `1px solid ${ta(0.32)}` : '1px solid transparent',
            display:'flex', alignItems:'center', justifyContent:'center', gap:7,
            transition:'all 0.18s',
          }}>
            {t.label}
            <span style={{
              fontSize:11, fontWeight:700, padding:'1px 7px', borderRadius:99, minWidth:20,
              background: tab === t.key ? ta(0.35) : 'rgba(255,255,255,0.06)',
              color: tab === t.key ? activeTheme.accent : 'var(--text-muted)',
              transition:'all 0.18s',
            }}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* ── Theme Customizer ── */}
      {customizing && isOwnProfile && (
        <ThemeCustomizer
          editTheme={editTheme}
          setEditTheme={setEditTheme}
          onClose={() => { setCustomizing(false); setEditTheme(theme) }}
          onSave={saveTheme}
          saving={savingTheme}
        />
      )}

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
                          <div style={{ background:'rgba(0,0,0,0.25)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:10, padding:'10px 13px', marginBottom:10, borderLeft:`3px solid ${ta(0.4)}` }}>
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
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(min(100%, 210px), 1fr))', gap:10 }}>
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

// ── Theme Customizer ──────────────────────────────────────────────────────────

interface ThemeCustomizerProps {
  editTheme: ProfileTheme
  setEditTheme: (t: ProfileTheme) => void
  onClose: () => void
  onSave: () => void
  saving: boolean
}

function ThemeCustomizer({ editTheme, setEditTheme, onClose, onSave, saving }: ThemeCustomizerProps) {
  const [tr, tg, tb] = hexToRgb(editTheme.accent)
  const ta = (a: number) => `rgba(${tr},${tg},${tb},${a})`
  const [customHex, setCustomHex] = useState(editTheme.accent)
  const [hexError, setHexError]   = useState(false)

  function applyHex(val: string) {
    setCustomHex(val)
    const valid = /^#[0-9a-fA-F]{6}$/.test(val)
    setHexError(!valid)
    if (valid) setEditTheme({ ...editTheme, accent: val })
  }

  const sec: React.CSSProperties = { marginBottom: 26 }
  const secLabel: React.CSSProperties = { fontSize:10, fontWeight:800, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(255,255,255,0.35)', marginBottom:12 }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(6px)', animation:'pf-bdIn 0.2s ease both' }}
      />
      {/* Panel */}
      <div style={{
        position:'fixed', bottom:0, left:0, right:0,
        width:'min(680px,100vw)', maxHeight:'88vh', margin:'0 auto',
        background:'rgba(14,8,11,0.97)', backdropFilter:'blur(24px)',
        borderRadius:'22px 22px 0 0', border:`1px solid ${ta(0.28)}`,
        borderBottom:'none', zIndex:401, overflow:'hidden',
        display:'flex', flexDirection:'column',
        boxShadow:`0 -8px 60px rgba(0,0,0,0.7), 0 -2px 0 ${ta(0.5)}`,
        animation:'pf-custIn 0.32s cubic-bezier(0.22,1,0.36,1) both',
        paddingBottom:'env(safe-area-inset-bottom)',
      }}>
        {/* Handle */}
        <div style={{ display:'flex', justifyContent:'center', padding:'12px 0 0' }}>
          <div style={{ width:36, height:4, borderRadius:99, background:'rgba(255,255,255,0.12)' }} />
        </div>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 24px 0' }}>
          <div>
            <div style={{ fontSize:17, fontWeight:900, color:'var(--text-primary)', letterSpacing:'-0.3px' }}>
              🎨 Customize Profile
            </div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.35)', marginTop:2 }}>Changes preview live — save when happy</div>
          </div>
          <button
            onClick={onClose}
            style={{ width:32, height:32, borderRadius:'50%', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.5)', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'inherit', lineHeight:1 }}
            onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.12)'}
            onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.06)'}
          >✕</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px', scrollbarWidth:'thin' }}>

          {/* Accent Color */}
          <div style={sec}>
            <div style={secLabel}>Accent Color</div>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
              {ACCENT_PRESETS.map(hex => {
                const active = editTheme.accent === hex
                const [r,g,b] = hexToRgb(hex)
                return (
                  <button
                    key={hex}
                    className="pf-swatch"
                    onClick={() => { setEditTheme({ ...editTheme, accent: hex }); setCustomHex(hex); setHexError(false) }}
                    title={hex}
                    style={{
                      width:42, height:42, borderRadius:12,
                      background: hex === '#ffffff' ? 'linear-gradient(135deg,#e5e7eb,#ffffff)' : `linear-gradient(135deg,${hex},rgba(${r},${g},${b},0.7))`,
                      border: active ? `3px solid #fff` : '2px solid rgba(255,255,255,0.08)',
                      boxShadow: active ? `0 0 0 2px ${hex}, 0 4px 16px rgba(${r},${g},${b},0.5)` : 'none',
                      cursor:'pointer', outline:'none', padding:0, flexShrink:0,
                      transition:'all 0.15s',
                    }}
                  />
                )
              })}
            </div>
            {/* Custom hex input */}
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:editTheme.accent, border:'2px solid rgba(255,255,255,0.15)', flexShrink:0 }} />
              <input
                value={customHex}
                onChange={e => applyHex(e.target.value)}
                placeholder="#8a1538"
                maxLength={7}
                style={{ background:'rgba(255,255,255,0.05)', border:`1.5px solid ${hexError ? '#f87171' : 'rgba(255,255,255,0.1)'}`, borderRadius:9, padding:'8px 12px', color:'var(--text-primary)', fontSize:13, fontFamily:'monospace', outline:'none', width:120, transition:'border-color 0.15s' }}
              />
              <span style={{ fontSize:11, color:'rgba(255,255,255,0.35)' }}>Custom hex (e.g. #ff6b00)</span>
            </div>
          </div>

          {/* Background Theme */}
          <div style={sec}>
            <div style={secLabel}>Page Theme</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(88px,1fr))', gap:8 }}>
              {Object.entries(BG_THEMES).map(([key, bt]) => {
                const active = editTheme.bg === key
                return (
                  <button
                    key={key}
                    className="pf-bg-opt"
                    onClick={() => setEditTheme({ ...editTheme, bg: key })}
                    style={{
                      padding:'10px 8px', borderRadius:12, cursor:'pointer', fontFamily:'inherit',
                      background: active ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
                      border: active ? `1.5px solid ${ta(0.55)}` : '1.5px solid rgba(255,255,255,0.08)',
                      display:'flex', flexDirection:'column', alignItems:'center', gap:6,
                      boxShadow: active ? `0 0 16px ${ta(0.25)}` : 'none',
                      transition:'all 0.15s',
                    }}
                  >
                    {/* Mini preview */}
                    <div style={{ width:52, height:30, borderRadius:7, background:`linear-gradient(${bt.banner})`, border:'1px solid rgba(255,255,255,0.08)', flexShrink:0 }} />
                    <span style={{ fontSize:10, fontWeight:700, color: active ? editTheme.accent : 'rgba(255,255,255,0.5)', letterSpacing:'0.02em', lineHeight:1 }}>{bt.emoji} {bt.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Skill Pill Style */}
          <div style={sec}>
            <div style={secLabel}>Skill Pill Style</div>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              {([
                { key:'filled',   label:'Filled',   preview: (r:number,g:number,b:number) => ({ background:`rgba(${r},${g},${b},0.12)`, border:`1px solid rgba(${r},${g},${b},0.28)` }) },
                { key:'outlined', label:'Outlined', preview: (r:number,g:number,b:number) => ({ background:'transparent', border:`1.5px solid rgba(${r},${g},${b},0.6)` }) },
                { key:'glow',     label:'Glow ✨',   preview: (r:number,g:number,b:number) => ({ background:`rgba(${r},${g},${b},0.15)`, border:`1px solid rgba(${r},${g},${b},0.4)`, boxShadow:`0 0 10px rgba(${r},${g},${b},0.35)` }) },
              ] as const).map(opt => {
                const [r,g,b] = hexToRgb(editTheme.accent)
                const active = editTheme.pill === opt.key
                const pv = opt.preview(r,g,b)
                return (
                  <button
                    key={opt.key}
                    onClick={() => setEditTheme({ ...editTheme, pill: opt.key })}
                    style={{
                      padding:'10px 16px', borderRadius:11, cursor:'pointer', fontFamily:'inherit',
                      background: active ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)',
                      border: active ? `1.5px solid ${ta(0.5)}` : '1.5px solid rgba(255,255,255,0.07)',
                      display:'flex', flexDirection:'column', alignItems:'center', gap:8,
                      transition:'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize:11, fontWeight:700, padding:'3px 11px', borderRadius:99, color:editTheme.accent, ...pv }}>
                      Skill
                    </span>
                    <span style={{ fontSize:11, color: active ? 'var(--text-primary)' : 'rgba(255,255,255,0.4)', fontWeight: active ? 700 : 500 }}>
                      {opt.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Card Glow */}
          <div style={{ ...sec, marginBottom:8 }}>
            <div style={secLabel}>Card Glow Effect</div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:13 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', marginBottom:3 }}>
                  Ambient glow {editTheme.glow ? '🌟' : ''}
                </div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)' }}>
                  Adds a coloured aura to cards and the avatar
                </div>
              </div>
              <button
                onClick={() => setEditTheme({ ...editTheme, glow: !editTheme.glow })}
                style={{
                  width:48, height:26, borderRadius:99,
                  background: editTheme.glow ? ta(0.8) : 'rgba(255,255,255,0.1)',
                  border:'none', cursor:'pointer', position:'relative', flexShrink:0,
                  transition:'background 0.25s',
                  boxShadow: editTheme.glow ? `0 0 16px ${ta(0.5)}` : 'none',
                }}
              >
                <div style={{
                  position:'absolute', top:3, left: editTheme.glow ? 25 : 3,
                  width:20, height:20, borderRadius:'50%', background:'#fff',
                  transition:'left 0.25s', boxShadow:'0 1px 4px rgba(0,0,0,0.4)',
                }} />
              </button>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div style={{ padding:'14px 24px 20px', borderTop:'1px solid rgba(255,255,255,0.06)', display:'flex', gap:10 }}>
          <button
            onClick={onClose}
            style={{ flex:1, padding:'12px', background:'transparent', border:'1px solid rgba(255,255,255,0.1)', borderRadius:12, color:'rgba(255,255,255,0.5)', fontSize:14, fontFamily:'inherit', cursor:'pointer', fontWeight:600, transition:'all 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor='rgba(255,255,255,0.2)'}
            onMouseLeave={e => e.currentTarget.style.borderColor='rgba(255,255,255,0.1)'}
          >Cancel</button>
          <button
            onClick={onSave}
            disabled={saving || hexError}
            style={{ flex:2, padding:'12px', background: saving || hexError ? ta(0.4) : `linear-gradient(135deg,${editTheme.accent},${ta(0.7)})`, border:'none', borderRadius:12, color:'#fff', fontSize:14, fontFamily:'inherit', cursor: saving || hexError ? 'default' : 'pointer', fontWeight:800, opacity: saving || hexError ? 0.6 : 1, transition:'all 0.2s', display:'flex', alignItems:'center', justifyContent:'center', gap:8, boxShadow: saving || hexError ? 'none' : `0 4px 24px ${ta(0.45)}` }}
            onMouseEnter={e => { if (!saving && !hexError) e.currentTarget.style.opacity='0.9' }}
            onMouseLeave={e => { e.currentTarget.style.opacity='1' }}
          >
            {saving
              ? <><span style={{ width:14, height:14, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'pf-spin .7s linear infinite', display:'inline-block' }} /> Saving…</>
              : '✓ Save Theme'
            }
          </button>
        </div>
      </div>
    </>
  )
}
