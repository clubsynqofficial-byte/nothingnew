import { useState, useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { parseTS } from '../../lib/time'
import { useAuth } from '../../contexts/AuthContext'

function linkify(text: string) {
  const re = /https?:\/\/[^\s<>"]+|www\.[^\s<>"]+/g
  const nodes: ReactNode[] = []
  let last = 0; let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const href = m[0].startsWith('http') ? m[0] : `https://${m[0]}`
    nodes.push(<a key={m.index} href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color:'var(--accent)', textDecoration:'underline', wordBreak:'break-all' }}>{m[0]}</a>)
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

interface PostRow {
  id: string; user_id: string; content: string | null
  image_url: string | null; image_urls: string[] | null
  repost_of: string | null; created_at: string; is_anonymous: boolean
  profile: { full_name: string | null; avatar_url: string | null } | null
}
interface FeedPost extends PostRow {
  likeCount: number; commentCount: number; repostCount: number
  isLiked: boolean; isReposted: boolean; repostSource: PostRow | null
}
interface AnnouncementRow {
  id: string; content: string | null; image_url: string | null
  created_at: string; club_id: string
  club: { id: string; name: string; logo_url: string | null } | null
  profile: { full_name: string | null; avatar_url: string | null } | null
}

interface CommentRow {
  id: string; post_id: string; user_id: string; content: string; created_at: string
  profile: { full_name: string | null; avatar_url: string | null } | null
}
interface PollOption { id: string; text: string; position: number; voteCount: number }
interface PollData { question: string; options: PollOption[]; userVote: string | null; pollId: string }

// ─── Icons ────────────────────────────────────────────────────────────────────
const Heart = ({ on }: { on?: boolean }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
)
const Bubble = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
)
const Repeat = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
    <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
  </svg>
)
const Img = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
)
const Trash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/>
  </svg>
)
const Dots = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
  </svg>
)

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const { user, profile } = useAuth()
  const nav = useNavigate()

  const [posts, setPosts]           = useState<FeedPost[]>([])
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([])
  const [userClubIds, setUserClubIds] = useState<string[]>([])
  const [loading, setLoading]       = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [txt, setTxt]               = useState('')
  const [imgs, setImgs]             = useState<File[]>([])
  const [previews, setPreviews]     = useState<string[]>([])
  const [posting, setPosting]       = useState(false)
  const [compErr, setCompErr]       = useState('')
  const [focused, setFocused]       = useState(false)
  const imgRef  = useRef<HTMLInputElement>(null)
  const taRef   = useRef<HTMLTextAreaElement>(null)

  const [threadId, setThreadId]     = useState<string | null>(null)
  const [comments, setComments]     = useState<Record<string, CommentRow[]>>({})
  const [cTxts, setCTxts]           = useState<Record<string, string>>({})
  const [postingC, setPostingC]     = useState<string | null>(null)
  const [reposting, setReposting]   = useState<string | null>(null)
  const [menuId, setMenuId]         = useState<string | null>(null)
  const [openPostId, setOpenPostId] = useState<string | null>(null)

  const [anon, setAnon]             = useState(false)

  // Poll compose state
  const [showPoll, setShowPoll]     = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState(['', ''])

  // AI writing assistant state
  const [showAI, setShowAI]       = useState(false)
  const [aiPrompt, setAiPrompt]   = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult]   = useState('')

  // Poll data per post: postId → { options with vote counts, userVote }
  const [pollData, setPollData] = useState<Record<string, PollData>>({})

  // Notification helper
  async function sendNotif(userId: string, type: string, title: string, body: string, link?: string) {
    if (userId === user?.id) return
    await supabase.from('notifications').insert({ user_id: userId, type, title, body, link: link ?? null })
  }

  const h = new Date().getHours()
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  useEffect(() => { fetchFeed() }, [user])
  useEffect(() => {
    const interval = setInterval(fetchFeed, 60000)
    return () => clearInterval(interval)
  }, [])
  useEffect(() => {
    if (!menuId) return
    const h = () => setMenuId(null)
    window.addEventListener('click', h)
    return () => window.removeEventListener('click', h)
  }, [menuId])

  useEffect(() => {
    if (!openPostId) return
    if (!comments[openPostId]) loadComments(openPostId)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenPostId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openPostId])

  async function fetchFeed() {
    setLoading(true)
    const { data: raw } = await supabase
      .from('posts').select('id,user_id,content,image_url,image_urls,repost_of,created_at,is_anonymous,profile:profiles!user_id(full_name,avatar_url)')
      .order('created_at', { ascending: false }).limit(60)
    if (!raw) { setLoading(false); return }

    // Exclude pure repost rows (no content, no images) from the display feed
    const displayRaw = (raw as unknown as PostRow[]).filter(p =>
      !p.repost_of || !!p.content || (p.image_urls?.length ?? 0) > 0 || !!p.image_url
    )
    const ids = displayRaw.map(p => p.id)
    const rids = displayRaw.flatMap(p => p.repost_of ? [p.repost_of as string] : [])

    const [lk, cm, rp, src] = await Promise.all([
      ids.length ? supabase.from('post_likes').select('post_id,user_id').in('post_id', ids) : { data: [] as any[] },
      ids.length ? supabase.from('post_comments').select('post_id').in('post_id', ids) : { data: [] as any[] },
      ids.length ? supabase.from('posts').select('repost_of,user_id').in('repost_of', ids).is('content', null).is('image_url', null) : { data: [] as any[] },
      rids.length ? supabase.from('posts').select('id,user_id,content,image_url,image_urls,repost_of,created_at,is_anonymous,profile:profiles!user_id(full_name,avatar_url)').in('id', rids) : { data: [] as any[] },
    ])
    const likeMap: Record<string, string[]> = {}
    for (const l of lk.data ?? []) { if (!likeMap[l.post_id]) likeMap[l.post_id] = []; likeMap[l.post_id].push(l.user_id) }
    const cmMap: Record<string, number> = {}
    for (const c of cm.data ?? []) cmMap[c.post_id] = (cmMap[c.post_id] ?? 0) + 1
    const rpMap: Record<string, number> = {}
    const myRepostSet = new Set<string>()
    for (const r of rp.data ?? []) {
      if (r.repost_of) {
        rpMap[r.repost_of] = (rpMap[r.repost_of] ?? 0) + 1
        if (user && r.user_id === user.id) myRepostSet.add(r.repost_of)
      }
    }
    const srcMap: Record<string, PostRow> = {}
    for (const s of (src.data ?? []) as unknown as PostRow[]) srcMap[s.id] = s

    setPosts(displayRaw.map(p => ({
      ...p,
      likeCount: (likeMap[p.id] ?? []).length,
      commentCount: cmMap[p.id] ?? 0,
      repostCount: rpMap[p.id] ?? 0,
      isLiked: user ? (likeMap[p.id] ?? []).includes(user.id) : false,
      isReposted: myRepostSet.has(p.id),
      repostSource: p.repost_of ? (srcMap[p.repost_of] ?? null) : null,
    })))

    // Fetch recent announcements from all clubs + user's membership list
    if (user) {
      const { data: memberships } = await supabase
        .from('club_memberships').select('club_id').eq('user_id', user.id)
      const clubIds = (memberships ?? []).map((m: { club_id: string }) => m.club_id)
      setUserClubIds(clubIds)
      const { data: annData } = await supabase
        .from('club_announcements')
        .select('id,content,image_url,created_at,club_id,club:clubs(id,name,logo_url),profile:profiles!user_id(full_name,avatar_url)')
        .order('created_at', { ascending: false })
        .limit(30)
      setAnnouncements((annData ?? []) as unknown as AnnouncementRow[])
    }

    setLoading(false)
  }

  function onTaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setTxt(e.target.value); setCompErr('')
    const t = e.target; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 260) + 'px'
  }
  function onImgSel(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []); e.target.value = ''
    if (!files.length) return
    const remaining = 4 - imgs.length
    if (remaining <= 0) { setCompErr('Max 4 images'); return }
    const toAdd = files.slice(0, remaining)
    for (const f of toAdd) {
      if (f.size > 15e6) { setCompErr('Max 15 MB per image'); return }
    }
    setCompErr('')
    setImgs(prev => [...prev, ...toAdd])
    toAdd.forEach(f => {
      const r = new FileReader(); r.onload = () => setPreviews(prev => [...prev, r.result as string]); r.readAsDataURL(f)
    })
  }
  function removeImg(idx: number) {
    setImgs(prev => prev.filter((_, i) => i !== idx))
    setPreviews(prev => prev.filter((_, i) => i !== idx))
  }
  async function generateAI(mode?: 'improve', instruction?: string) {
    if (aiLoading) return
    setAiLoading(true)
    setAiResult('')
    const prompt = instruction ?? aiPrompt.trim()
    const { data, error } = await supabase.functions.invoke('ai-write', {
      body: {
        prompt,
        draft: (mode === 'improve' || !prompt) ? txt.trim() : '',
      },
    })
    setAiLoading(false)
    if (error || !data?.text) { setAiResult('Could not generate — please try again.'); return }
    setAiResult(data.text)
  }

  function useAIResult() {
    setTxt(aiResult)
    if (taRef.current) {
      taRef.current.style.height = 'auto'
      taRef.current.style.height = Math.min(taRef.current.scrollHeight, 260) + 'px'
    }
    setShowAI(false); setAiResult(''); setAiPrompt('')
  }

  async function doPost() {
    if (!user || (!txt.trim() && imgs.length === 0 && !showPoll)) return
    if (txt.length > 500) { setCompErr('Max 500 chars'); return }
    if (showPoll) {
      if (!pollQuestion.trim()) { setCompErr('Poll needs a question'); return }
      const validOpts = pollOptions.filter(o => o.trim())
      if (validOpts.length < 2) { setCompErr('Add at least 2 poll options'); return }
    }
    setPosting(true); setCompErr('')
    let imageUrls: string[] = []
    if (imgs.length > 0) {
      const ts = Date.now()
      const uploads = await Promise.all(imgs.map(async (img, i) => {
        const ext = img.name.split('.').pop() ?? 'jpg'
        const path = `${user.id}/${ts}_${i}.${ext}`
        const { error } = await supabase.storage.from('post-media').upload(path, img)
        if (error) return null
        return supabase.storage.from('post-media').getPublicUrl(path).data.publicUrl
      }))
      imageUrls = uploads.filter(Boolean) as string[]
    }
    const { data: newPost } = await supabase.from('posts').insert({
      user_id: user.id, content: txt.trim() || null,
      image_url: imageUrls[0] ?? null,
      image_urls: imageUrls.length > 0 ? imageUrls : null,
      is_anonymous: anon,
    }).select('id').single()

    if (showPoll && newPost) {
      const validOpts = pollOptions.map(o => o.trim()).filter(Boolean)
      const { data: poll } = await supabase.from('post_polls').insert({ post_id: newPost.id, question: pollQuestion.trim() }).select('id').single()
      if (poll) {
        await supabase.from('poll_options').insert(validOpts.map((text, i) => ({ poll_id: poll.id, text, position: i })))
      }
    }

    setTxt(''); setImgs([]); setPreviews([]); setFocused(false)
    setShowPoll(false); setPollQuestion(''); setPollOptions(['', '']); setAnon(false)
    if (taRef.current) taRef.current.style.height = 'auto'
    setPosting(false); fetchFeed()
  }
  async function doLike(pid: string, liked: boolean) {
    if (!user) return
    setPosts(prev => prev.map(p => p.id === pid ? { ...p, isLiked: !liked, likeCount: p.likeCount + (liked ? -1 : 1) } : p))
    if (!liked) {
      await supabase.from('post_likes').insert({ post_id: pid, user_id: user.id })
      const post = posts.find(p => p.id === pid)
      if (post) sendNotif(post.user_id, 'match', `${profile?.full_name ?? 'Someone'} liked your post`, post.content?.slice(0, 60) ?? 'They liked your post', '/home')
    } else {
      await supabase.from('post_likes').delete().eq('post_id', pid).eq('user_id', user.id)
    }
  }
  async function doRepost(pid: string) {
    if (!user || reposting) return
    setReposting(pid)
    const already = posts.find(p => p.id === pid)?.isReposted ?? false
    if (already) {
      setPosts(prev => prev.map(p => p.id === pid ? { ...p, isReposted: false, repostCount: Math.max(0, p.repostCount - 1) } : p))
      await supabase.from('posts').delete().eq('repost_of', pid).eq('user_id', user.id).is('content', null).is('image_url', null)
    } else {
      setPosts(prev => prev.map(p => p.id === pid ? { ...p, isReposted: true, repostCount: p.repostCount + 1 } : p))
      await supabase.from('posts').insert({ user_id: user.id, content: null, repost_of: pid })
    }
    setReposting(null)
  }
  async function doDelete(pid: string) {
    if (!user || deletingId) return
    setDeletingId(pid); setMenuId(null)
    setPosts(prev => prev.filter(p => p.id !== pid))
    await supabase.from('posts').delete().eq('id', pid).eq('user_id', user.id)
    setDeletingId(null)
  }
  async function toggleThread(pid: string) {
    if (threadId === pid) { setThreadId(null); return }
    setThreadId(pid); if (!comments[pid]) await loadComments(pid)
  }
  async function loadComments(pid: string) {
    const { data } = await supabase.from('post_comments')
      .select('id,post_id,user_id,content,created_at,profile:profiles!user_id(full_name,avatar_url)')
      .eq('post_id', pid).order('created_at', { ascending: true }).limit(50)
    setComments(prev => ({ ...prev, [pid]: (data as unknown as CommentRow[]) ?? [] }))
  }
  async function doComment(pid: string) {
    if (!user) return
    const text = (cTxts[pid] ?? '').trim(); if (!text || postingC) return
    setPostingC(pid)
    await supabase.from('post_comments').insert({ post_id: pid, user_id: user.id, content: text })
    setCTxts(prev => ({ ...prev, [pid]: '' }))
    setPosts(prev => prev.map(p => p.id === pid ? { ...p, commentCount: p.commentCount + 1 } : p))
    const post = posts.find(p => p.id === pid)
    if (post) sendNotif(post.user_id, 'message', `${profile?.full_name ?? 'Someone'} replied to your post`, text.slice(0, 60), '/home')
    await loadComments(pid); setPostingC(null)
  }

  async function loadPoll(pid: string) {
    const { data: poll } = await supabase.from('post_polls').select('id, question').eq('post_id', pid).maybeSingle()
    if (!poll) return
    const [{ data: opts }, { data: votes }] = await Promise.all([
      supabase.from('poll_options').select('id, text, position').eq('poll_id', poll.id).order('position'),
      supabase.from('poll_votes').select('option_id, user_id').eq('poll_id', poll.id),
    ])
    const voteCounts: Record<string, number> = {}
    let userVote: string | null = null
    for (const v of votes ?? []) {
      voteCounts[v.option_id] = (voteCounts[v.option_id] ?? 0) + 1
      if (v.user_id === user?.id) userVote = v.option_id
    }
    setPollData(prev => ({ ...prev, [pid]: { pollId: poll.id, question: poll.question, userVote, options: (opts ?? []).map(o => ({ ...o, voteCount: voteCounts[o.id] ?? 0 })) } }))
  }

  async function doPollVote(pid: string, optionId: string) {
    if (!user) return
    const pd = pollData[pid]; if (!pd) return
    const wasVoted = pd.userVote === optionId
    setPollData(prev => ({ ...prev, [pid]: { ...pd, userVote: wasVoted ? null : optionId, options: pd.options.map(o => ({ ...o, voteCount: o.id === optionId ? o.voteCount + (wasVoted ? -1 : 1) : o.id === pd.userVote && !wasVoted ? o.voteCount - 1 : o.voteCount })) } }))
    if (wasVoted) {
      await supabase.from('poll_votes').delete().eq('poll_id', pd.pollId).eq('user_id', user.id)
    } else {
      await supabase.from('poll_votes').delete().eq('poll_id', pd.pollId).eq('user_id', user.id)
      await supabase.from('poll_votes').insert({ poll_id: pd.pollId, option_id: optionId, user_id: user.id })
    }
  }

  const canPost = !posting && (!!txt.trim() || imgs.length > 0 || (showPoll && !!pollQuestion.trim() && pollOptions.filter(o => o.trim()).length >= 2))
  const myPosts = posts.filter(p => p.user_id === user?.id)
  const myLikes = myPosts.reduce((s, p) => s + p.likeCount, 0)

  return (
    <>
    <style>{`
      @keyframes fadeUp { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:none } }
      @keyframes bannerOrb1 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(40px,-20px) scale(1.12)} 66%{transform:translate(-20px,30px) scale(0.92)} }
      @keyframes bannerOrb2 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(-35px,25px) scale(0.88)} 66%{transform:translate(25px,-15px) scale(1.08)} }
      @keyframes bannerOrb3 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-18px,12px)} }
      @keyframes bannerShimmer { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
      @keyframes bannerParticle { 0%{transform:translateY(0) scale(1);opacity:.7} 100%{transform:translateY(-80px) scale(0);opacity:0} }
      @keyframes bannerGlow { 0%,100%{opacity:.5} 50%{opacity:1} }
      @keyframes pop { 0%{transform:scale(1)} 40%{transform:scale(1.55)} 70%{transform:scale(0.88)} 100%{transform:scale(1)} }
      @keyframes shimmer { from{background-position:-200% 0} to{background-position:200% 0} }
      @keyframes menuIn { from{opacity:0;transform:scale(.9) translateY(-6px)} to{opacity:1;transform:none} }
      @keyframes ai-in { from{opacity:0;transform:translateY(-6px) scale(0.98)} to{opacity:1;transform:none} }
      @keyframes ai-gradient { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
      @keyframes ai-dot-1 { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }
      @keyframes ai-dot-2 { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }
      @keyframes ai-dot-3 { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }
      @keyframes ai-shimmer { from{background-position:-400px 0} to{background-position:400px 0} }
      @keyframes ai-result-in { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
      .ai-chip { display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:9999px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s;white-space:nowrap }
      .ai-chip:hover { transform:translateY(-1px); }
      .ai-send:hover:not(:disabled) { opacity:0.85!important; transform:scale(1.05); }
      .ai-use:hover { opacity:0.9!important; transform:translateY(-1px); }
      .hgrid { display:grid; grid-template-columns:1fr 300px; gap:22px; align-items:start }
      @media(max-width:860px){ .hgrid{grid-template-columns:1fr} .sidebar{display:none!important} }
      .card { background:#231518; border:1px solid rgba(255,255,255,0.08); border-radius:18px; overflow:hidden }
      .pcard { background:linear-gradient(145deg,#231518,#1e1214); border:1px solid rgba(255,255,255,0.07); border-radius:18px; overflow:hidden; transition:border-color .2s,box-shadow .2s,transform .18s }
      .pcard:hover { border-color:rgba(255,255,255,0.14); box-shadow:0 8px 36px rgba(0,0,0,.6); transform:translateY(-2px) }
      .abt { display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:9999px;border:none;background:transparent;font-size:12px;font-weight:700;cursor:pointer;transition:all .15s;font-family:inherit;user-select:none }
      .abt:hover:not(:disabled){transform:scale(1.07)}
      .dotbtn { display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;border:none;background:transparent;cursor:pointer;color:rgba(255,255,255,.15);transition:all .15s;flex-shrink:0 }
      .pcard:hover .dotbtn { color:rgba(255,255,255,.45) }
      .dotbtn:hover { background:rgba(255,255,255,.1)!important;color:#fff!important }
      .slink { display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:12px;color:var(--text-secondary);font-size:13px;font-weight:600;cursor:pointer;transition:all .15s;border:none;background:transparent;width:100%;text-align:left;font-family:inherit }
      .slink:hover { background:rgba(138,21,56,.15);color:#fff }
      @media(max-width:600px){
        .hero-banner { padding:18px 16px!important; border-radius:18px!important; margin-bottom:14px!important }
        .hero-title { font-size:20px!important }
        .hero-stats { display:none!important }
        .hero-sub { font-size:12px!important }
        .feed-label { padding-left:0!important }
        .compose-toolbar { padding-left:18px!important }
        .pcard-pad { padding:13px 14px 10px!important }
        .thread-pad { padding:13px 14px 14px!important }
      }
    `}</style>

    <div className="page-content" style={{ maxWidth: 1020, margin: '0 auto', paddingBottom: 80 }}>

      {/* ── Hero banner ─────────────────────────────────── */}
      <div className="hero-banner" style={{
        borderRadius: 24, marginBottom: 22, padding: '28px 32px',
        background: 'linear-gradient(135deg, #8a1538 0%, #6b1030 35%, #3d0a1c 70%, #1e0510 100%)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Animated orbs */}
        <div style={{ position:'absolute', top:'-30%', left:'-5%', width:280, height:280, borderRadius:'50%', background:'radial-gradient(circle,rgba(192,37,90,.55) 0%,transparent 70%)', animation:'bannerOrb1 12s ease-in-out infinite', pointerEvents:'none', filter:'blur(2px)' }}/>
        <div style={{ position:'absolute', top:'10%', right:'-8%', width:220, height:220, borderRadius:'50%', background:'radial-gradient(circle,rgba(138,21,56,.45) 0%,transparent 70%)', animation:'bannerOrb2 16s ease-in-out infinite', pointerEvents:'none', filter:'blur(1px)' }}/>
        <div style={{ position:'absolute', bottom:'-40%', left:'40%', width:180, height:180, borderRadius:'50%', background:'radial-gradient(circle,rgba(160,24,64,.3) 0%,transparent 70%)', animation:'bannerOrb3 20s ease-in-out infinite', pointerEvents:'none' }}/>

        {/* Animated aurora sweep */}
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg,transparent 0%,rgba(192,37,90,.08) 40%,rgba(224,100,140,.12) 60%,transparent 100%)', backgroundSize:'200% 100%', animation:'bannerShimmer 6s ease infinite', pointerEvents:'none' }}/>

        {/* Floating particles */}
        {[
          { left:'12%', bottom:'10%', delay:'0s',  dur:'4s',  size:3 },
          { left:'28%', bottom:'5%',  delay:'1.2s', dur:'5s',  size:2 },
          { left:'55%', bottom:'15%', delay:'0.6s', dur:'3.5s', size:4 },
          { left:'72%', bottom:'8%',  delay:'2s',   dur:'6s',  size:2 },
          { left:'88%', bottom:'12%', delay:'0.3s', dur:'4.5s', size:3 },
        ].map((p, i) => (
          <div key={i} style={{
            position:'absolute', left:p.left, bottom:p.bottom,
            width:p.size, height:p.size, borderRadius:'50%',
            background:'rgba(255,180,200,.8)',
            animation:`bannerParticle ${p.dur} ${p.delay} ease-in infinite`,
            pointerEvents:'none',
            boxShadow:`0 0 ${p.size*2}px rgba(192,37,90,.9)`,
          }}/>
        ))}

        {/* Glowing border top */}
        <div style={{ position:'absolute', top:0, left:0, right:0, height:1, background:'linear-gradient(90deg,transparent,rgba(192,37,90,.6),rgba(255,150,180,.8),rgba(192,37,90,.6),transparent)', animation:'bannerGlow 3s ease-in-out infinite', pointerEvents:'none' }}/>

        {/* Logo watermark */}
        <img src="/clubsynqlogo.png" alt="" style={{ position:'absolute', right:24, top:'50%', transform:'translateY(-50%)', width:72, height:72, borderRadius:18, objectFit:'contain', opacity:0.18, pointerEvents:'none', userSelect:'none' }} />

        <div style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:16 }}>
          <div>
            <div style={{ marginBottom:6 }}>
              <div className="hero-title" style={{ fontSize:28, fontWeight:900, color:'#fff', letterSpacing:'-0.7px' }}>
                {greeting}, {firstName}! 👋
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Two-column ──────────────────────────────────── */}
      <div className="hgrid">

        {/* ── Feed column ─ */}
        <div style={{ minWidth:0 }}>

          {/* Compose card */}
          <div className="card" style={{
            marginBottom:16,
            boxShadow: focused ? '0 0 0 2px rgba(138,21,56,.5),0 4px 24px rgba(0,0,0,.5)' : '0 4px 24px rgba(0,0,0,.35)',
            transition:'box-shadow .2s',
          }}>
            {/* gradient top strip */}
            <div style={{ height:3, background:'linear-gradient(90deg,#8a1538,#c0185c,#e57c9a,#c0185c,#8a1538)', backgroundSize:'200% 100%' }}/>
            <div style={{ padding:'16px 18px 0' }}>
              <div style={{ display:'flex', gap:13, alignItems:'flex-start' }}>
                <Av url={profile?.avatar_url??null} name={profile?.full_name??null} size={44}
                  onClick={() => nav('/profile')} ring />
                <div style={{ flex:1, minWidth:0 }}>
                  {!showPoll && (
                    <textarea ref={taRef} value={txt} onChange={onTaChange}
                      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
                      onKeyDown={e => { if (e.key==='Enter'&&(e.metaKey||e.ctrlKey)) doPost() }}
                      placeholder={`What's on your mind, ${firstName}?`}
                      maxLength={500}
                      style={{
                        width:'100%', background:'transparent', border:'none', outline:'none',
                        resize:'none', fontSize:15.5, color:'var(--text-primary)',
                        fontFamily:'inherit', lineHeight:1.72, overflow:'hidden',
                        minHeight: focused ? 72 : 46, paddingTop:4,
                        transition:'min-height .2s', caretColor:'var(--accent)',
                      }}/>
                  )}
                  {previews.length > 0 && (
                    <div style={{ marginTop:10, display:'grid', gridTemplateColumns: previews.length === 1 ? '1fr' : previews.length === 2 ? '1fr 1fr' : previews.length === 3 ? '1fr 1fr 1fr' : '1fr 1fr', gap:6 }}>
                      {previews.map((src, i) => (
                        <div key={i} style={{ position:'relative', borderRadius:12, overflow:'hidden', border:'1px solid rgba(255,255,255,.08)', lineHeight:0, aspectRatio: previews.length === 1 ? 'auto' : '1/1' }}>
                          <img src={src} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', maxHeight: previews.length === 1 ? 300 : 180 }}/>
                          <button onClick={() => removeImg(i)} style={{
                            position:'absolute', top:6, right:6, width:24, height:24, borderRadius:'50%',
                            background:'rgba(0,0,0,.8)', border:'1px solid rgba(255,255,255,.2)',
                            color:'#fff', fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                          }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {compErr && <div style={{ fontSize:12, color:'#f87171', marginTop:8, padding:'5px 10px', borderRadius:8, background:'rgba(248,113,113,.08)' }}>{compErr}</div>}
                </div>
              </div>
            </div>
            {/* Poll builder */}
            {showPoll && (
              <div style={{ padding: '0 18px 14px 74px' }}>
                <div style={{ background: 'rgba(138,21,56,.06)', border: '1px solid rgba(138,21,56,.22)', borderRadius: 14, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10 }}>Poll</div>
                  <input value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} placeholder="Ask a question…" style={{ width: '100%', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 9, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit', marginBottom: 10, boxSizing: 'border-box' }} />
                  {pollOptions.map((opt, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 7 }}>
                      <input value={opt} onChange={e => setPollOptions(prev => prev.map((o, j) => j === i ? e.target.value : o))} placeholder={`Option ${i + 1}`} style={{ flex: 1, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 8, padding: '7px 11px', color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
                      {pollOptions.length > 2 && <button onClick={() => setPollOptions(prev => prev.filter((_, j) => j !== i))} style={{ background: 'transparent', border: 'none', color: 'rgba(248,113,113,.6)', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>✕</button>}
                    </div>
                  ))}
                  {pollOptions.length < 4 && <button onClick={() => setPollOptions(prev => [...prev, ''])} style={{ fontSize: 12, color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontWeight: 600 }}>+ Add option</button>}
                </div>
              </div>
            )}
            {/* AI Writing Assistant */}
            {showAI && (
              <div style={{ padding: '0 18px 16px', animation: 'ai-in .18s ease both' }}>
                <div style={{ borderRadius: 14, border: '1px solid rgba(168,85,247,.22)', background: 'rgba(168,85,247,.04)', overflow: 'hidden' }}>

                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 10px 16px', borderBottom: '1px solid rgba(168,85,247,.1)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontSize: 15 }}>✨</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#c084fc' }}>Write with AI</span>
                    </div>
                    <button onClick={() => { setShowAI(false); setAiResult(''); setAiPrompt('') }}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 4px', borderRadius: 6, transition: 'color .12s' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}>✕</button>
                  </div>

                  <div style={{ padding: '12px 14px' }}>

                    {/* Result card — shown above input when we have a result */}
                    {aiResult && !aiLoading && (
                      <div style={{ animation: 'ai-result-in .2s ease both', marginBottom: 12, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(168,85,247,.18)', borderRadius: 10, padding: '12px 14px' }}>
                        <p style={{ fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.7, margin: '0 0 10px', whiteSpace: 'pre-wrap' }}>{aiResult}</p>
                        <div style={{ display: 'flex', gap: 7 }}>
                          <button className="ai-use" onClick={useAIResult}
                            style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s' }}>
                            Use this
                          </button>
                          <button className="ai-use" onClick={() => generateAI(txt.trim() ? 'improve' : undefined)}
                            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(168,85,247,.3)', background: 'transparent', color: '#a855f7', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s' }}>
                            Retry
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Loading */}
                    {aiLoading && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', marginBottom: 10 }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {(['ai-dot-1 1.2s ease infinite', 'ai-dot-2 1.2s ease .18s infinite', 'ai-dot-3 1.2s ease .36s infinite'] as const).map((anim, i) => (
                            <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#a855f7', display: 'block', animation: anim }} />
                          ))}
                        </div>
                        <span style={{ fontSize: 12.5, color: '#c084fc', fontWeight: 600 }}>Writing…</span>
                      </div>
                    )}

                    {/* Quick chips — hide while loading or after result */}
                    {!aiLoading && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                        {txt.trim() && (
                          <>
                            <button className="ai-chip" onClick={() => generateAI('improve', 'Polish the writing and fix any grammar')} disabled={aiLoading}
                              style={{ background: 'rgba(168,85,247,.1)', border: '1px solid rgba(168,85,247,.2)', color: '#c084fc' }}>✨ Polish</button>
                            <button className="ai-chip" onClick={() => generateAI('improve', 'Make this shorter and punchier')} disabled={aiLoading}
                              style={{ background: 'rgba(168,85,247,.1)', border: '1px solid rgba(168,85,247,.2)', color: '#c084fc' }}>Shorter</button>
                            <button className="ai-chip" onClick={() => generateAI('improve', 'Make this more engaging and exciting')} disabled={aiLoading}
                              style={{ background: 'rgba(168,85,247,.1)', border: '1px solid rgba(168,85,247,.2)', color: '#c084fc' }}>More engaging</button>
                            <button className="ai-chip" onClick={() => generateAI('improve', 'Fix grammar and improve clarity')} disabled={aiLoading}
                              style={{ background: 'rgba(168,85,247,.1)', border: '1px solid rgba(168,85,247,.2)', color: '#c084fc' }}>Fix grammar</button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Input with inline send */}
                    <div style={{ position: 'relative' }}>
                      <input
                        value={aiPrompt}
                        onChange={e => setAiPrompt(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !aiLoading && (aiPrompt.trim() || txt.trim())) generateAI(txt.trim() ? 'improve' : undefined) }}
                        placeholder={txt.trim() ? 'Any specific instructions? (optional)' : 'What do you want to write about?'}
                        style={{ width: '100%', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(168,85,247,.2)', borderRadius: 10, padding: '9px 44px 9px 13px', color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', caretColor: '#a855f7', transition: 'border-color .15s' }}
                        onFocus={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,.5)' }}
                        onBlur={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,.2)' }}
                      />
                      <button className="ai-send" onClick={() => generateAI(txt.trim() ? 'improve' : undefined)}
                        disabled={aiLoading || (!aiPrompt.trim() && !txt.trim())}
                        style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, borderRadius: '50%', border: 'none', background: (aiLoading || (!aiPrompt.trim() && !txt.trim())) ? 'rgba(168,85,247,.2)' : 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff', cursor: (aiLoading || (!aiPrompt.trim() && !txt.trim())) ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s', fontSize: 12, fontWeight: 700 }}>
                        ↑
                      </button>
                    </div>

                  </div>
                </div>
              </div>
            )}

            {/* toolbar */}
            <div className="compose-toolbar" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 18px 14px 74px', borderTop:'1px solid rgba(255,255,255,.05)', marginTop:10 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <input ref={imgRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple style={{ display:'none' }} onChange={onImgSel}/>
                <button onClick={() => imgs.length < 4 && imgRef.current?.click()} disabled={imgs.length >= 4} style={{
                  display:'inline-flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:9999,
                  border:'1px solid transparent', cursor: imgs.length >= 4 ? 'default' : 'pointer', fontFamily:'inherit', fontSize:13, fontWeight:600,
                  background: imgs.length > 0 ? 'rgba(138,21,56,.18)' : 'transparent',
                  color: imgs.length > 0 ? 'var(--accent)' : imgs.length >= 4 ? 'rgba(255,255,255,.2)' : 'var(--text-muted)', transition:'all .15s',
                  opacity: imgs.length >= 4 ? .4 : 1,
                }}
                  onMouseEnter={e => { if (imgs.length < 4) { e.currentTarget.style.background='rgba(138,21,56,.12)'; e.currentTarget.style.color='var(--accent)' } }}
                  onMouseLeave={e => { e.currentTarget.style.background=imgs.length>0?'rgba(138,21,56,.18)':'transparent'; e.currentTarget.style.color=imgs.length>0?'var(--accent)':'var(--text-muted)' }}
                >
                  <Img/>{imgs.length > 0 ? <span style={{ fontSize:11 }}>{imgs.length}/4</span> : <span>Photo</span>}
                </button>
                {/* Poll toggle */}
                <button onClick={() => setShowPoll(v => !v)} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:9999, border:'1px solid transparent', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:600, background: showPoll ? 'rgba(138,21,56,.2)' : 'transparent', color: showPoll ? 'var(--accent)' : 'var(--text-muted)', transition:'all .15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background='rgba(138,21,56,.14)'; e.currentTarget.style.color='var(--accent)' }}
                  onMouseLeave={e => { e.currentTarget.style.background=showPoll?'rgba(138,21,56,.2)':'transparent'; e.currentTarget.style.color=showPoll?'var(--accent)':'var(--text-muted)' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                  <span>Poll</span>
                </button>
                {/* Anonymous toggle */}
                <button onClick={() => setAnon(v => !v)} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:9999, border:'1px solid transparent', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:600, background: anon ? 'rgba(138,21,56,.2)' : 'transparent', color: anon ? 'var(--accent)' : 'var(--text-muted)', transition:'all .15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background='rgba(138,21,56,.14)'; e.currentTarget.style.color='var(--accent)' }}
                  onMouseLeave={e => { e.currentTarget.style.background=anon?'rgba(138,21,56,.2)':'transparent'; e.currentTarget.style.color=anon?'var(--accent)':'var(--text-muted)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  <span>Anon</span>
                </button>
                {/* AI button */}
                <button onClick={() => { setShowAI(v => !v); setAiResult(''); }}
                  style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:9999, cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:700, transition:'all .15s',
                    background: showAI ? 'rgba(168,85,247,.2)' : 'rgba(168,85,247,.08)',
                    border: `1px solid ${showAI ? 'rgba(168,85,247,.5)' : 'rgba(168,85,247,.25)'}`,
                    color: showAI ? '#a855f7' : 'rgba(168,85,247,.8)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background='rgba(168,85,247,.18)'; e.currentTarget.style.borderColor='rgba(168,85,247,.5)'; e.currentTarget.style.color='#a855f7' }}
                  onMouseLeave={e => { e.currentTarget.style.background=showAI?'rgba(168,85,247,.2)':'rgba(168,85,247,.08)'; e.currentTarget.style.borderColor=showAI?'rgba(168,85,247,.5)':'rgba(168,85,247,.25)'; e.currentTarget.style.color=showAI?'#a855f7':'rgba(168,85,247,.8)' }}>
                  <span style={{ fontSize: 13 }}>✨</span>
                  <span>AI</span>
                </button>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                {txt.length > 350 && (
                  <span style={{ fontSize:12, fontWeight:700, color: txt.length>480?'#f87171':'var(--text-muted)' }}>{500-txt.length}</span>
                )}
                <button onClick={doPost} disabled={!canPost} style={{
                  padding:'8px 22px', borderRadius:9999, border:'none', fontFamily:'inherit',
                  background: canPost ? 'linear-gradient(135deg,#8a1538,#c0185c)' : 'rgba(87,65,68,.25)',
                  color: canPost ? '#fff' : 'rgba(255,255,255,.2)',
                  fontSize:14, fontWeight:800, letterSpacing:'.02em',
                  cursor: canPost ? 'pointer' : 'default', opacity: posting ? .7 : 1,
                  boxShadow: canPost ? '0 4px 20px rgba(138,21,56,.5)' : 'none',
                  transition:'all .18s',
                }}>
                  {posting ? 'Posting…' : 'Post →'}
                </button>
              </div>
            </div>
          </div>

          {/* Feed label */}
          <div className="feed-label" style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12, paddingLeft:2 }}>
            <div style={{ fontSize:13, fontWeight:800, color:'var(--text-muted)', letterSpacing:'.06em', textTransform:'uppercase' }}>
              Campus Feed
            </div>
          </div>

          {/* Posts + Announcements merged feed */}
          {loading ? <Skeleton/> : (posts.length === 0 && announcements.length === 0) ? <Empty/> : (() => {
            type FeedItem = { kind: 'post'; post: FeedPost } | { kind: 'ann'; ann: AnnouncementRow }
            const items: FeedItem[] = [
              ...posts.map(p => ({ kind: 'post' as const, post: p })),
              ...announcements.map(a => ({ kind: 'ann' as const, ann: a })),
            ].sort((a, b) => {
              const ta = a.kind === 'post' ? a.post.created_at : a.ann.created_at
              const tb = b.kind === 'post' ? b.post.created_at : b.ann.created_at
              return new Date(tb).getTime() - new Date(ta).getTime()
            })
            return (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {items.map((item, i) =>
                  item.kind === 'ann'
                    ? <AnnouncementCard key={`ann-${item.ann.id}`} ann={item.ann} userId={user?.id ?? null} userClubIds={userClubIds} onJoined={clubId => setUserClubIds(prev => [...prev, clubId])} />
                    : <Card key={item.post.id} post={item.post} idx={i}
                        uid={user?.id??null} myProfile={profile}
                        threadOpen={threadId===item.post.id}
                        comments={comments[item.post.id]??[]}
                        cTxt={cTxts[item.post.id]??''}
                        postingC={postingC===item.post.id}
                        reposting={reposting===item.post.id}
                        menuOpen={menuId===item.post.id}
                        poll={pollData[item.post.id] ?? null}
                        onMenu={e=>{e.stopPropagation();setMenuId(menuId===item.post.id?null:item.post.id)}}
                        onLike={() => doLike(item.post.id, item.post.isLiked)}
                        onRepost={() => doRepost(item.post.id)}
                        onDelete={() => doDelete(item.post.id)}
                        onThread={() => toggleThread(item.post.id)}
                        onCChange={t => setCTxts(prev=>({...prev,[item.post.id]:t}))}
                        onComment={() => doComment(item.post.id)}
                        onProfile={uid => nav(`/profile/${uid}`)}
                        onOpen={() => setOpenPostId(item.post.id)}
                        onLoadPoll={() => loadPoll(item.post.id)}
                        onPollVote={optId => doPollVote(item.post.id, optId)}
                      />
                )}
              </div>
            )
          })()}
        </div>

        {/* ── Sidebar ─ */}
        <div className="sidebar" style={{ display:'flex', flexDirection:'column', gap:14, position:'sticky', top:80 }}>

          {/* Profile card */}
          <div className="card">
            {/* Banner */}
            <div style={{
              height:72, position:'relative', overflow:'hidden',
              background:'linear-gradient(135deg,#8a1538 0%,#5c0d26 55%,#2a0611 100%)',
            }}>
              <div style={{ position:'absolute',inset:0,background:'radial-gradient(ellipse at 30% 60%,rgba(192,24,92,.45) 0%,transparent 65%)' }}/>
              {/* dots pattern */}
              <svg style={{ position:'absolute',inset:0,width:'100%',height:'100%',opacity:.15 }}>
                {Array.from({length:30},(_,i)=>(
                  <circle key={i} cx={(i%6)*48+24} cy={Math.floor(i/6)*24+12} r="1.5" fill="white"/>
                ))}
              </svg>
            </div>
            <div style={{ padding:'0 18px 18px', position:'relative' }}>
              {/* Avatar overlapping banner */}
              <div style={{ marginTop:-28, marginBottom:10, display:'inline-block', borderRadius:'50%', border:'3px solid #231518' }}>
                <Av url={profile?.avatar_url??null} name={profile?.full_name??null} size={54} onClick={()=>nav('/profile')} ring/>
              </div>
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:16, fontWeight:900, color:'var(--text-primary)', marginBottom:1 }}>{profile?.full_name??'Your Name'}</div>

                {profile?.role && (
                  <div style={{
                    display:'inline-block', marginTop:6, padding:'2px 9px', borderRadius:9999, fontSize:11, fontWeight:700,
                    textTransform:'capitalize' as const, letterSpacing:'.03em',
                    background: profile.role==='admin'?'rgba(251,191,36,.15)':profile.role==='club_leader'?'rgba(138,21,56,.2)':'rgba(255,255,255,.06)',
                    border:`1px solid ${profile.role==='admin'?'rgba(251,191,36,.3)':profile.role==='club_leader'?'rgba(138,21,56,.3)':'rgba(255,255,255,.1)'}`,
                    color: profile.role==='admin'?'var(--gold)':profile.role==='club_leader'?'#e57c9a':'var(--text-muted)',
                  }}>{profile.role.replace('_',' ')}</div>
                )}
              </div>

              {/* Stat tiles */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6, marginBottom:14 }}>
                {[
                  { label:'Posts', val: loading?'…':myPosts.length, bg:'rgba(248,113,113,.1)', border:'rgba(248,113,113,.2)', color:'#fca5a5' },
                  { label:'Likes', val: loading?'…':myLikes, bg:'rgba(229,64,94,.1)', border:'rgba(229,64,94,.2)', color:'#f87171' },
                  { label:'Points', val: profile?.karak_points??0, bg:'rgba(233,193,118,.1)', border:'rgba(233,193,118,.2)', color:'var(--gold)' },
                ].map(s=>(
                  <div key={s.label} style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:12, padding:'10px 6px', textAlign:'center' }}>
                    <div style={{ fontSize:18, fontWeight:900, color:s.color }}>{s.val}</div>
                    <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:600, marginTop:1 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              <button onClick={()=>nav('/profile')} style={{
                width:'100%', padding:'9px', borderRadius:12, fontFamily:'inherit',
                background:'linear-gradient(135deg,rgba(138,21,56,.2),rgba(138,21,56,.08))',
                border:'1px solid rgba(138,21,56,.4)', color:'#e57c9a',
                fontSize:13, fontWeight:700, cursor:'pointer', transition:'all .15s',
              }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(138,21,56,.3)'}
                onMouseLeave={e=>e.currentTarget.style.background='linear-gradient(135deg,rgba(138,21,56,.2),rgba(138,21,56,.08))'}
              >View full profile →</button>
            </div>
          </div>

        </div>
      </div>
    </div>

    {/* ── Post modal ── */}
    {openPostId && (() => {
      const mp = posts.find(p => p.id === openPostId)
      if (!mp) return null
      return createPortal(
        <PostModal
          post={mp}
          uid={user?.id ?? null}
          myProfile={profile}
          comments={comments[openPostId] ?? []}
          cTxt={cTxts[openPostId] ?? ''}
          postingC={postingC === openPostId}
          reposting={reposting === openPostId}
          onClose={() => setOpenPostId(null)}
          onLike={() => doLike(openPostId, mp.isLiked)}
          onRepost={() => doRepost(openPostId)}
          onCChange={t => setCTxts(prev => ({ ...prev, [openPostId]: t }))}
          onComment={() => doComment(openPostId)}
          onProfile={uid => { setOpenPostId(null); nav(`/profile/${uid}`) }}
        />,
        document.body
      )
    })()}
    </>
  )
}

// ─── Image Carousel ───────────────────────────────────────────────────────────
function ImageCarousel({ urls }: { urls: string[] }) {
  const [cur, setCur] = useState(0)
  const [touchX, setTouchX] = useState<number | null>(null)
  if (urls.length === 0) return null
  if (urls.length === 1) return (
    <div style={{ borderRadius:14, overflow:'hidden', border:'1px solid rgba(255,255,255,.06)', lineHeight:0 }}>
      <img src={urls[0]} alt="" style={{ width:'100%', maxHeight:460, objectFit:'cover', display:'block' }}/>
    </div>
  )
  const prev = () => setCur(c => (c - 1 + urls.length) % urls.length)
  const next = () => setCur(c => (c + 1) % urls.length)
  return (
    <div style={{ position:'relative', borderRadius:14, overflow:'hidden', border:'1px solid rgba(255,255,255,.06)', lineHeight:0, userSelect:'none' }}
      onTouchStart={e => setTouchX(e.touches[0].clientX)}
      onTouchEnd={e => {
        if (touchX === null) return
        const dx = e.changedTouches[0].clientX - touchX
        if (dx < -40) next(); else if (dx > 40) prev()
        setTouchX(null)
      }}
    >
      {/* Slides */}
      <div style={{ display:'flex', transition:'transform .3s cubic-bezier(.22,1,.36,1)', transform:`translateX(-${cur * 100}%)` }}>
        {urls.map((u, i) => (
          <img key={i} src={u} alt="" style={{ width:'100%', flexShrink:0, maxHeight:460, objectFit:'cover', display:'block' }}/>
        ))}
      </div>

      {/* Arrows */}
      {cur > 0 && (
        <button onClick={e => { e.stopPropagation(); prev() }} style={{
          position:'absolute', left:10, top:'50%', transform:'translateY(-50%)',
          width:32, height:32, borderRadius:'50%', border:'none',
          background:'rgba(0,0,0,.65)', backdropFilter:'blur(6px)',
          color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1,
        }}>‹</button>
      )}
      {cur < urls.length - 1 && (
        <button onClick={e => { e.stopPropagation(); next() }} style={{
          position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
          width:32, height:32, borderRadius:'50%', border:'none',
          background:'rgba(0,0,0,.65)', backdropFilter:'blur(6px)',
          color:'#fff', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1,
        }}>›</button>
      )}

      {/* Dots */}
      <div style={{ position:'absolute', bottom:10, left:'50%', transform:'translateX(-50%)', display:'flex', gap:5 }}>
        {urls.map((_, i) => (
          <button key={i} onClick={e => { e.stopPropagation(); setCur(i) }} style={{
            width: i === cur ? 18 : 7, height:7, borderRadius:9999, border:'none',
            background: i === cur ? '#fff' : 'rgba(255,255,255,.45)',
            cursor:'pointer', padding:0, transition:'all .25s',
          }}/>
        ))}
      </div>

      {/* Counter badge */}
      <div style={{ position:'absolute', top:10, right:10, background:'rgba(0,0,0,.65)', backdropFilter:'blur(6px)', borderRadius:9999, padding:'3px 9px', fontSize:11, fontWeight:700, color:'#fff' }}>
        {cur + 1} / {urls.length}
      </div>
    </div>
  )
}

// ─── Announcement Card ────────────────────────────────────────────────────────
function AnnouncementCard({ ann, userId, userClubIds, onJoined }: {
  ann: AnnouncementRow
  userId: string | null
  userClubIds: string[]
  onJoined: (clubId: string) => void
}) {
  const [joining, setJoining] = useState(false)
  const isMember = userClubIds.includes(ann.club_id)

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }

  async function handleJoin() {
    if (!userId || joining || isMember) return
    setJoining(true)
    await supabase.from('club_memberships').insert({ club_id: ann.club_id, user_id: userId, role: 'member' })
    onJoined(ann.club_id)
    setJoining(false)
  }

  const initials = (ann.club?.name ?? 'C').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid rgba(138,21,56,0.2)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 16px 10px', background: 'rgba(138,21,56,0.06)' }}>
        {/* Club logo */}
        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(138,21,56,0.18)', border: '1px solid rgba(138,21,56,0.3)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: 'var(--accent)' }}>
          {ann.club?.logo_url ? <img src={ann.club.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ann.club?.name ?? 'Club'}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>
            {ann.profile?.full_name ?? 'Admin'} · {timeAgo(ann.created_at)}
          </div>
        </div>
        {/* Announcement badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', background: 'rgba(138,21,56,0.14)', border: '1px solid rgba(138,21,56,0.3)', borderRadius: 20, flexShrink: 0 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"><path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"/></svg>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.04em' }}>Announcement</span>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '12px 16px 14px' }}>
        {ann.content && (
          <div style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {linkify(ann.content)}
          </div>
        )}
        {ann.image_url && (
          <div style={{ marginTop: 10, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)' }}>
            <img src={ann.image_url} alt="" style={{ width: '100%', display: 'block', maxHeight: 400, objectFit: 'cover' }} />
          </div>
        )}
      </div>

      {/* Footer: join button */}
      {userId && (
        <div style={{ padding: '0 16px 14px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          {isMember ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              Joined
            </div>
          ) : (
            <button
              onClick={handleJoin}
              disabled={joining}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: 'var(--accent)', border: 'none', borderRadius: 20, color: '#fff', fontSize: 13, fontWeight: 700, cursor: joining ? 'default' : 'pointer', fontFamily: 'inherit', opacity: joining ? 0.7 : 1, boxShadow: '0 2px 12px rgba(138,21,56,0.35)', transition: 'all 0.15s' }}
            >
              {joining ? (
                <><div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Joining…</>
              ) : (
                <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Join Club</>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Post Card ────────────────────────────────────────────────────────────────
function Card({
  post, idx, uid, myProfile, threadOpen, comments, cTxt, postingC,
  reposting, menuOpen, poll, onMenu, onLike, onRepost, onDelete, onThread,
  onCChange, onComment, onProfile, onOpen, onLoadPoll, onPollVote,
}: {
  post: FeedPost; idx: number; uid: string | null
  myProfile: {full_name?:string|null;avatar_url?:string|null}|null
  threadOpen: boolean; comments: CommentRow[]; cTxt: string
  postingC: boolean; reposting: boolean; menuOpen: boolean
  poll: PollData | null
  onMenu:(e:React.MouseEvent)=>void
  onLike:()=>void; onRepost:()=>void; onDelete:()=>void; onThread:()=>void
  onCChange:(t:string)=>void; onComment:()=>void; onProfile:(uid:string)=>void
  onOpen:()=>void; onLoadPoll:()=>void; onPollVote:(optId:string)=>void
}) {
  const cinRef = useRef<HTMLInputElement>(null)
  const effectiveImgs = (p: PostRow) => (p.image_urls && p.image_urls.length > 0) ? p.image_urls : (p.image_url ? [p.image_url] : [])
  const isRO = !!post.repost_of && !post.content && effectiveImgs(post).length === 0
  const isOwn = post.user_id === uid

  const isAnon = !isRO && post.is_anonymous
  const dp = isRO ? post.repostSource?.profile : isAnon ? null : post.profile
  const dUid = isRO ? (post.repostSource?.user_id ?? post.user_id) : post.user_id
  const dTime = isRO ? (post.repostSource?.created_at ?? post.created_at) : post.created_at
  const dContent = isRO ? post.repostSource?.content : post.content
  const dImgs = isRO && post.repostSource ? effectiveImgs(post.repostSource) : effectiveImgs(post)

  const [lPop, setLPop] = useState(false)
  const prevLiked = useRef(post.isLiked)
  const pollLoaded = useRef(false)
  useEffect(() => {
    if (!prevLiked.current && post.isLiked) { setLPop(true); setTimeout(()=>setLPop(false),380) }
    prevLiked.current = post.isLiked
  }, [post.isLiked])

  useEffect(() => { if (threadOpen) setTimeout(()=>cinRef.current?.focus(),80) }, [threadOpen])
  useEffect(() => { if (!pollLoaded.current) { pollLoaded.current = true; onLoadPoll() } }, [])

  return (
    <div className="pcard" style={{ animation:`fadeUp .36s cubic-bezier(.22,1,.36,1) both`, animationDelay:`${Math.min(idx,6)*50}ms` }} onClick={onOpen}>
      <div className="pcard-pad" style={{ padding:'16px 18px 12px' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom: dContent||dImgs.length ? 11 : 0 }}>
          <Av url={isAnon ? null : dp?.avatar_url??null} name={isAnon ? 'A' : dp?.full_name??null} size={44} onClick={isAnon ? undefined : e=>{e.stopPropagation();onProfile(dUid)}}/>

          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
              {isAnon ? (
                <span style={{ fontSize:14.5, fontWeight:800, color:'var(--text-muted)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  Anonymous{isOwn && <span style={{ fontSize:11, fontWeight:600, color:'rgba(255,255,255,.3)', marginLeft:5 }}>(You)</span>}
                </span>
              ) : (
                <span onClick={e=>{e.stopPropagation();onProfile(dUid)}} style={{ fontSize:14.5, fontWeight:800, color:'var(--text-primary)', cursor:'pointer', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', transition:'color .15s' }}
                  onMouseEnter={e=>e.currentTarget.style.color='var(--accent)'} onMouseLeave={e=>e.currentTarget.style.color='var(--text-primary)'}>
                  {dp?.full_name??'User'}
                </span>
              )}
              <span style={{ fontSize:11, color:'var(--text-muted)', flexShrink:0, fontVariantNumeric:'tabular-nums' }}>{reltime(dTime)}</span>
            </div>
            {dContent && (
              <p style={{ fontSize:14.5, color:'var(--text-primary)', lineHeight:1.76, margin:0, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{dContent}</p>
            )}
          </div>

          {isOwn && (
            <div style={{ position:'relative', flexShrink:0 }}>
              <button className="dotbtn" onClick={onMenu}><Dots/></button>
              {menuOpen && (
                <div onClick={e=>e.stopPropagation()} style={{
                  position:'absolute', top:32, right:0, zIndex:100,
                  background:'#1a0f11', border:'1px solid rgba(255,255,255,.12)',
                  borderRadius:14, overflow:'hidden', minWidth:154,
                  boxShadow:'0 16px 48px rgba(0,0,0,.75)',
                  animation:'menuIn .15s cubic-bezier(.22,1,.36,1)',
                }}>
                  <button onClick={onDelete} style={{ display:'flex',alignItems:'center',gap:9,width:'100%',padding:'11px 16px',border:'none',background:'transparent',cursor:'pointer',color:'#f87171',fontSize:13,fontWeight:700,textAlign:'left',fontFamily:'inherit',transition:'background .1s' }}
                    onMouseEnter={e=>e.currentTarget.style.background='rgba(248,113,113,.1)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <Trash/> Delete post
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Image(s) */}
        {dImgs.length > 0 && (
          <div style={{ marginBottom:12 }}>
            <ImageCarousel urls={dImgs}/>
          </div>
        )}

        {/* Quoted repost */}
        {!isRO && post.repostSource && (
          <div style={{ marginBottom:12, border:'1px solid rgba(255,255,255,.09)', borderRadius:14, padding:'12px 14px', background:'rgba(0,0,0,.2)', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:0, left:0, bottom:0, width:3, background:'linear-gradient(180deg,var(--accent),rgba(138,21,56,.2))' }}/>
            <div style={{ display:'flex', gap:9, marginBottom:7 }}>
              <Av url={post.repostSource.profile?.avatar_url??null} name={post.repostSource.profile?.full_name??null} size={24} onClick={()=>onProfile(post.repostSource!.user_id)}/>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:'var(--text-primary)' }}>{post.repostSource.profile?.full_name??'User'}</div>
                <div style={{ fontSize:10, color:'var(--text-muted)' }}>{reltime(post.repostSource.created_at)}</div>
              </div>
            </div>
            {post.repostSource.content && <p style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.65, margin:0, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{post.repostSource.content}</p>}
            {effectiveImgs(post.repostSource).length > 0 && <div style={{ marginTop:8 }}><ImageCarousel urls={effectiveImgs(post.repostSource)}/></div>}
          </div>
        )}

        {/* Poll */}
        {poll && (
          <div onClick={e => e.stopPropagation()} style={{ marginBottom: 12, background: 'rgba(138,21,56,.05)', border: '1px solid rgba(138,21,56,.18)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>{poll.question}</div>
            {poll.options.map(opt => {
              const total = poll.options.reduce((s, o) => s + o.voteCount, 0)
              const pct = total > 0 ? Math.round((opt.voteCount / total) * 100) : 0
              const isVoted = poll.userVote === opt.id
              return (
                <div key={opt.id} onClick={() => onPollVote(opt.id)} style={{ marginBottom: 7, cursor: 'pointer', borderRadius: 8, overflow: 'hidden', position: 'relative', border: `1px solid ${isVoted ? 'rgba(192,37,90,.5)' : 'rgba(255,255,255,.08)'}`, transition: 'border-color .15s' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${pct}%`, background: isVoted ? 'rgba(138,21,56,.25)' : 'rgba(255,255,255,.05)', transition: 'width .4s ease' }} />
                  <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '7px 11px' }}>
                    <span style={{ fontSize: 12.5, fontWeight: isVoted ? 700 : 500, color: isVoted ? '#c0255a' : 'var(--text-primary)' }}>{opt.text}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
                  </div>
                </div>
              )
            })}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{poll.options.reduce((s, o) => s + o.voteCount, 0)} votes</div>
          </div>
        )}

        {/* Actions */}
        <div onClick={e => e.stopPropagation()} style={{ display:'flex', alignItems:'center', gap:2, paddingTop:8, borderTop:'1px solid rgba(255,255,255,.05)' }}>
          {/* Like */}
          <button className="abt" onClick={onLike} title="Like" style={{
            color: post.isLiked ? '#f87171' : 'rgba(248,113,113,.55)',
            background: post.isLiked ? 'rgba(248,113,113,.12)' : 'transparent',
          }}
            onMouseEnter={e=>{e.currentTarget.style.background='rgba(248,113,113,.14)';e.currentTarget.style.color='#f87171'}}
            onMouseLeave={e=>{e.currentTarget.style.background=post.isLiked?'rgba(248,113,113,.12)':'transparent';e.currentTarget.style.color=post.isLiked?'#f87171':'rgba(248,113,113,.55)'}}>
            <span style={{ display:'inline-flex', animation:lPop?'pop .38s ease':'none' }}><Heart on={post.isLiked}/></span>
            {post.likeCount > 0 && <span>{post.likeCount}</span>}
          </button>
          {/* Comment */}
          <button className="abt" onClick={onThread} title="Reply" style={{
            color: threadOpen ? '#60a5fa' : 'rgba(96,165,250,.55)',
            background: threadOpen ? 'rgba(96,165,250,.12)' : 'transparent',
          }}
            onMouseEnter={e=>{e.currentTarget.style.background='rgba(96,165,250,.14)';e.currentTarget.style.color='#60a5fa'}}
            onMouseLeave={e=>{e.currentTarget.style.background=threadOpen?'rgba(96,165,250,.12)':'transparent';e.currentTarget.style.color=threadOpen?'#60a5fa':'rgba(96,165,250,.55)'}}>
            <Bubble/>{post.commentCount > 0 && <span>{post.commentCount}</span>}
          </button>
          {/* Repost */}
          <button className="abt" onClick={onRepost} disabled={reposting||post.user_id===uid} title={post.isReposted ? 'Unrepost' : 'Repost'} style={{
            color: post.isReposted ? '#4ade80' : 'rgba(74,222,128,.5)',
            background: post.isReposted ? 'rgba(74,222,128,.12)' : 'transparent',
            opacity: reposting||post.user_id===uid ? .28 : 1,
            cursor: reposting||post.user_id===uid ? 'default' : 'pointer',
          }}
            onMouseEnter={e=>{ if(!(reposting||post.user_id===uid)){e.currentTarget.style.background='rgba(74,222,128,.12)';e.currentTarget.style.color='#4ade80'} }}
            onMouseLeave={e=>{ e.currentTarget.style.background=post.isReposted?'rgba(74,222,128,.12)':'transparent';e.currentTarget.style.color=post.isReposted?'#4ade80':'rgba(74,222,128,.5)' }}>
            <Repeat/>{post.repostCount > 0 && <span>{post.repostCount}</span>}
          </button>
        </div>
      </div>

      {/* Thread */}
      {threadOpen && (
        <div onClick={e => e.stopPropagation()} className="thread-pad" style={{ borderTop:'1px solid rgba(255,255,255,.07)', background:'rgba(0,0,0,.2)', padding:'15px 18px 18px' }}>
          <div style={{ display:'flex', gap:11, marginBottom:14 }}>
            <Av url={myProfile?.avatar_url??null} name={myProfile?.full_name??null} size={34}/>
            <div style={{ flex:1, display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.09)', borderRadius:9999, padding:'0 6px 0 14px', transition:'border-color .15s,box-shadow .15s' }}>
              <input ref={cinRef} value={cTxt}
                onChange={e=>onCChange(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();onComment()}}}
                placeholder="Write a reply…" maxLength={300}
                style={{ flex:1,background:'transparent',border:'none',outline:'none',fontSize:13.5,color:'var(--text-primary)',fontFamily:'inherit',padding:'9px 0' }}
                onFocus={e=>{const p=e.currentTarget.parentElement!;p.style.borderColor='rgba(138,21,56,.45)';p.style.boxShadow='0 0 0 3px rgba(138,21,56,.08)'}}
                onBlur={e=>{const p=e.currentTarget.parentElement!;p.style.borderColor='rgba(255,255,255,.09)';p.style.boxShadow='none'}}
              />
              <button onClick={onComment} disabled={postingC||!cTxt.trim()} style={{
                padding:'6px 14px', borderRadius:9999, border:'none', fontFamily:'inherit',
                background: cTxt.trim() ? 'linear-gradient(135deg,#8a1538,#c0185c)' : 'transparent',
                color: cTxt.trim() ? '#fff' : 'var(--text-muted)',
                fontSize:12, fontWeight:700, cursor: cTxt.trim()?'pointer':'default',
                opacity: postingC?.6:1, transition:'all .15s',
                boxShadow: cTxt.trim()?'0 2px 10px rgba(138,21,56,.4)':'none',
              }}>{postingC?'…':'Reply'}</button>
            </div>
          </div>

          {comments.length === 0 ? (
            <div style={{ fontSize:13,color:'var(--text-muted)',textAlign:'center',padding:'10px 0',fontStyle:'italic',opacity:.65 }}>
              No replies yet — start the thread.
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {comments.map((c,ci) => (
                <div key={c.id} style={{ display:'flex',gap:10,animation:'fadeUp .28s ease both',animationDelay:`${ci*30}ms` }}>
                  <Av url={c.profile?.avatar_url??null} name={c.profile?.full_name??null} size={32} onClick={()=>onProfile(c.user_id)}/>
                  <div style={{ flex:1, background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.06)', borderRadius:12, padding:'9px 13px' }}>
                    <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:3 }}>
                      <span onClick={()=>onProfile(c.user_id)} style={{ fontSize:12,fontWeight:700,color:'var(--text-primary)',cursor:'pointer',transition:'color .15s' }}
                        onMouseEnter={e=>e.currentTarget.style.color='var(--accent)'} onMouseLeave={e=>e.currentTarget.style.color='var(--text-primary)'}>
                        {c.profile?.full_name??'User'}
                      </span>
                      <span style={{ fontSize:10,color:'var(--text-muted)' }}>{reltime(c.created_at)}</span>
                    </div>
                    <div style={{ fontSize:13.5,color:'var(--text-secondary)',lineHeight:1.65,wordBreak:'break-word' }}>{c.content}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Post Modal ───────────────────────────────────────────────────────────────
function PostModal({
  post, uid, myProfile, comments, cTxt, postingC, reposting,
  onClose, onLike, onRepost, onCChange, onComment, onProfile,
}: {
  post: FeedPost; uid: string | null
  myProfile: { full_name?: string | null; avatar_url?: string | null } | null
  comments: CommentRow[]; cTxt: string; postingC: boolean; reposting: boolean
  onClose: () => void
  onLike: () => void; onRepost: () => void
  onCChange: (t: string) => void; onComment: () => void; onProfile: (uid: string) => void
}) {
  const cinRef = useRef<HTMLInputElement>(null)
  const effectiveImgs = (p: PostRow) => (p.image_urls && p.image_urls.length > 0) ? p.image_urls : (p.image_url ? [p.image_url] : [])
  const isRO = !!post.repost_of && !post.content && effectiveImgs(post).length === 0
  const isOwn = post.user_id === uid
  const isAnon = !isRO && post.is_anonymous
  const dp = isRO ? post.repostSource?.profile : isAnon ? null : post.profile
  const dUid = isRO ? (post.repostSource?.user_id ?? post.user_id) : post.user_id
  const dTime = isRO ? (post.repostSource?.created_at ?? post.created_at) : post.created_at
  const dContent = isRO ? post.repostSource?.content : post.content
  const dImgs = isRO && post.repostSource ? effectiveImgs(post.repostSource) : effectiveImgs(post)
  const [lPop, setLPop] = useState(false)
  const prevLiked = useRef(post.isLiked)
  useEffect(() => {
    if (!prevLiked.current && post.isLiked) { setLPop(true); setTimeout(() => setLPop(false), 380) }
    prevLiked.current = post.isLiked
  }, [post.isLiked])
  useEffect(() => { setTimeout(() => cinRef.current?.focus(), 160) }, [])

  const statNum = (n: number) => n > 999 ? `${(n/1000).toFixed(1)}k` : n

  return (
    <div className="pm-overlay" onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(4,1,3,0.88)', backdropFilter: 'blur(22px) saturate(160%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px 16px',
      animation: 'pmBgIn .2s ease both',
    }}>
      <style>{`
        @keyframes pmBgIn    { from{opacity:0}                                       to{opacity:1} }
        @keyframes pmCardIn  { from{opacity:0;transform:translateY(32px) scale(.96)} to{opacity:1;transform:none} }
        @keyframes pmSheetIn { from{transform:translateY(100%)}                      to{transform:translateY(0)} }
        .pm-comment-in { animation: fadeUp .26s cubic-bezier(.22,1,.36,1) both }
        .pm-reply-row:hover .pm-reply-name { color:var(--accent)!important }
        .pm-handle { display:none }
        @media(max-width:700px){
          .pm-overlay  { align-items:flex-end!important; padding:0!important }
          .pm-card     { border-radius:22px 22px 0 0!important; max-width:100%!important; max-height:94svh!important; max-height:94vh!important; animation:pmSheetIn .32s cubic-bezier(.22,1,.36,1) both!important }
          .pm-grid     { flex-direction:column!important }
          .pm-left     { width:100%!important; max-height:44vh!important; padding:16px 16px 12px!important }
          .pm-right    { border-left:none!important; border-top:1px solid rgba(255,255,255,.07)!important; min-height:0!important }
          .pm-handle   { display:block!important }
          .pm-close    { top:10px!important; right:12px!important; width:38px!important; height:38px!important }
        }
      `}</style>

      {/* Modal card */}
      <div className="pm-card" onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 860,
        maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        background: 'radial-gradient(ellipse at 20% 0%, rgba(138,21,56,.18) 0%, transparent 55%), linear-gradient(170deg,#16090d 0%,#0d050a 100%)',
        border: '1px solid rgba(138,21,56,.28)',
        borderRadius: 24,
        boxShadow: '0 0 0 1px rgba(138,21,56,.08), 0 50px 130px rgba(0,0,0,.92), inset 0 1px 0 rgba(255,255,255,.06)',
        overflow: 'hidden',
        animation: 'pmCardIn .26s cubic-bezier(.22,1,.36,1) both',
        position: 'relative',
      }}>

        {/* Drag handle — mobile only */}
        <div className="pm-handle" style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.18)', margin: '10px auto 2px', flexShrink: 0 }} />

        {/* Floating close */}
        <button className="pm-close" onClick={onClose} style={{
          position: 'absolute', top: 14, right: 14, zIndex: 10,
          width: 34, height: 34, borderRadius: '50%',
          background: 'rgba(255,255,255,.07)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,.12)',
          color: 'rgba(255,255,255,.6)', fontSize: 15, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all .15s', fontFamily: 'inherit',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.14)'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.07)'; e.currentTarget.style.color = 'rgba(255,255,255,.6)' }}
        >✕</button>

        {/* Two-column body */}
        <div className="pm-grid" style={{ display: 'flex', flex: 1, minHeight: 0 }}>

          {/* ── LEFT: Post ─────────────────────────────────── */}
          <div className="pm-left" style={{ flex: '0 0 auto', width: '50%', display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '28px 26px 24px' }}>

            {/* Author row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13, marginBottom: 16 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <Av url={isAnon ? null : dp?.avatar_url ?? null} name={isAnon ? 'A' : dp?.full_name ?? null} size={50}
                  onClick={isAnon ? undefined : e => { e.stopPropagation(); onProfile(dUid) }} />
                {/* connector dot */}
                {dContent && <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 54, width: 2, height: 'calc(100% + 12px)', background: 'linear-gradient(180deg,rgba(138,21,56,.4),transparent)', borderRadius: 1 }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
                  {isAnon ? (
                    <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '-.2px' }}>
                      Anonymous{isOwn && <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.3)', marginLeft: 6 }}>(You)</span>}
                    </span>
                  ) : (
                    <span onClick={() => onProfile(dUid)} style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', cursor: 'pointer', transition: 'color .15s', letterSpacing: '-.2px' }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-primary)'}>
                      {dp?.full_name ?? 'User'}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.32)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                  {parseTS(dTime).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · {parseTS(dTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                </div>
              </div>
            </div>

            {/* Content */}
            {dContent && (
              <p style={{ fontSize: 17.5, color: 'var(--text-primary)', lineHeight: 1.82, margin: '0 0 18px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontWeight: 450, letterSpacing: '.01em' }}>
                {dContent}
              </p>
            )}

            {/* Images */}
            {dImgs.length > 0 && (
              <div style={{ marginBottom: 18, borderRadius: 16, overflow: 'hidden' }}>
                <ImageCarousel urls={dImgs} />
              </div>
            )}

            {/* Quoted repost */}
            {!isRO && post.repostSource && (
              <div style={{ marginBottom: 18, borderRadius: 16, padding: '14px 16px', background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: 'linear-gradient(180deg,var(--accent),transparent)', borderRadius: '3px 0 0 3px' }} />
                <div style={{ display: 'flex', gap: 10, marginBottom: 8, paddingLeft: 6 }}>
                  <Av url={post.repostSource.profile?.avatar_url ?? null} name={post.repostSource.profile?.full_name ?? null} size={26}
                    onClick={e => { e.stopPropagation(); onProfile(post.repostSource!.user_id) }} />
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{post.repostSource.profile?.full_name ?? 'User'}</div>
                    <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.3)' }}>{reltime(post.repostSource.created_at)}</div>
                  </div>
                </div>
                {post.repostSource.content && <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.65, margin: '0 0 0 6px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{post.repostSource.content}</p>}
              </div>
            )}

            {/* Stats bar */}
            {(post.likeCount > 0 || post.commentCount > 0 || post.repostCount > 0) && (
              <div style={{ display: 'flex', gap: 20, padding: '13px 0', borderTop: '1px solid rgba(255,255,255,.06)', borderBottom: '1px solid rgba(255,255,255,.06)', marginBottom: 14 }}>
                {post.likeCount > 0 && <div style={{ fontSize: 13 }}><span style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: 15 }}>{statNum(post.likeCount)}</span><span style={{ color: 'rgba(255,255,255,.38)', marginLeft: 4 }}>Like{post.likeCount !== 1 ? 's' : ''}</span></div>}
                {post.commentCount > 0 && <div style={{ fontSize: 13 }}><span style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: 15 }}>{statNum(post.commentCount)}</span><span style={{ color: 'rgba(255,255,255,.38)', marginLeft: 4 }}>Repl{post.commentCount !== 1 ? 'ies' : 'y'}</span></div>}
                {post.repostCount > 0 && <div style={{ fontSize: 13 }}><span style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: 15 }}>{statNum(post.repostCount)}</span><span style={{ color: 'rgba(255,255,255,.38)', marginLeft: 4 }}>Repost{post.repostCount !== 1 ? 's' : ''}</span></div>}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 6 }}>
              {/* Like */}
              <button className="abt" onClick={onLike} title="Like" style={{
                color: post.isLiked ? '#f87171' : 'rgba(248,113,113,.5)',
                background: post.isLiked ? 'rgba(248,113,113,.13)' : 'rgba(255,255,255,.04)',
                border: `1px solid ${post.isLiked ? 'rgba(248,113,113,.3)' : 'rgba(255,255,255,.07)'}`,
                padding: '8px 16px', borderRadius: 12, gap: 7,
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,.18)'; e.currentTarget.style.color = '#f87171' }}
                onMouseLeave={e => { e.currentTarget.style.background = post.isLiked ? 'rgba(248,113,113,.13)' : 'rgba(255,255,255,.04)'; e.currentTarget.style.color = post.isLiked ? '#f87171' : 'rgba(248,113,113,.5)' }}>
                <span style={{ display: 'inline-flex', animation: lPop ? 'pop .38s ease' : 'none' }}><Heart on={post.isLiked} /></span>
                <span style={{ fontSize: 13 }}>{post.isLiked ? 'Liked' : 'Like'}</span>
              </button>
              {/* Repost */}
              <button className="abt" onClick={onRepost} disabled={reposting || post.user_id === uid}
                title={post.isReposted ? 'Unrepost' : 'Repost'} style={{
                  color: post.isReposted ? '#4ade80' : 'rgba(74,222,128,.5)',
                  background: post.isReposted ? 'rgba(74,222,128,.1)' : 'rgba(255,255,255,.04)',
                  border: `1px solid ${post.isReposted ? 'rgba(74,222,128,.28)' : 'rgba(255,255,255,.07)'}`,
                  opacity: reposting || post.user_id === uid ? .3 : 1,
                  cursor: reposting || post.user_id === uid ? 'default' : 'pointer',
                  padding: '8px 16px', borderRadius: 12, gap: 7,
                }}
                onMouseEnter={e => { if (!(reposting || post.user_id === uid)) { e.currentTarget.style.background = 'rgba(74,222,128,.16)'; e.currentTarget.style.color = '#4ade80' } }}
                onMouseLeave={e => { e.currentTarget.style.background = post.isReposted ? 'rgba(74,222,128,.1)' : 'rgba(255,255,255,.04)'; e.currentTarget.style.color = post.isReposted ? '#4ade80' : 'rgba(74,222,128,.5)' }}>
                <Repeat /><span style={{ fontSize: 13 }}>{post.isReposted ? 'Reposted' : 'Repost'}</span>
              </button>
            </div>
          </div>

          {/* ── RIGHT: Comments ─────────────────────────────── */}
          <div className="pm-right" style={{
            flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
            borderLeft: '1px solid rgba(255,255,255,.07)',
            maxHeight: '92vh',
          }}>
            {/* Replies header */}
            <div style={{ padding: '20px 22px 14px', borderBottom: '1px solid rgba(255,255,255,.06)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Bubble />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {comments.length === 0 ? 'Replies' : `${comments.length} Repl${comments.length === 1 ? 'y' : 'ies'}`}
                </span>
              </div>
            </div>

            {/* Comment list — scrollable */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 22px 10px' }}>
              {comments.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, opacity: .45, paddingBottom: 30 }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
                    No replies yet.<br/>Be the first to respond.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {comments.map((c, ci) => (
                    <div key={c.id} className="pm-comment-in pm-reply-row" style={{ display: 'flex', gap: 11, padding: '10px 8px', borderRadius: 14, transition: 'background .12s', animationDelay: `${Math.min(ci, 8) * 30}ms` }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.03)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      {/* Avatar + thread line */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                        <Av url={c.profile?.avatar_url ?? null} name={c.profile?.full_name ?? null} size={34}
                          onClick={e => { e.stopPropagation(); onProfile(c.user_id) }} />
                        {ci < comments.length - 1 && (
                          <div style={{ width: 2, flex: 1, marginTop: 5, background: 'linear-gradient(180deg,rgba(255,255,255,.1),transparent)', borderRadius: 1, minHeight: 16 }} />
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                          <span className="pm-reply-name" onClick={() => onProfile(c.user_id)} style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer', transition: 'color .15s' }}>
                            {c.profile?.full_name ?? 'User'}
                          </span>
                          <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,.28)' }}>{reltime(c.created_at)}</span>
                        </div>
                        <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,.72)', lineHeight: 1.68, wordBreak: 'break-word' }}>{c.content}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Reply input — sticky bottom */}
            <div style={{ flexShrink: 0, padding: '12px 18px 16px', borderTop: '1px solid rgba(255,255,255,.07)', background: 'rgba(0,0,0,.3)', backdropFilter: 'blur(8px)' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Av url={myProfile?.avatar_url ?? null} name={myProfile?.full_name ?? null} size={34} />
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 14, padding: '0 8px 0 14px', transition: 'border-color .15s, box-shadow .15s' }}>
                  <input ref={cinRef} value={cTxt}
                    onChange={e => onCChange(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onComment() } }}
                    placeholder="Add a reply…" maxLength={300}
                    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 13.5, color: 'var(--text-primary)', fontFamily: 'inherit', padding: '11px 0' }}
                    onFocus={e => { const p = e.currentTarget.parentElement!; p.style.borderColor = 'rgba(138,21,56,.5)'; p.style.boxShadow = '0 0 0 3px rgba(138,21,56,.1)' }}
                    onBlur={e => { const p = e.currentTarget.parentElement!; p.style.borderColor = 'rgba(255,255,255,.09)'; p.style.boxShadow = 'none' }}
                  />
                  {cTxt.length > 200 && <span style={{ fontSize: 11, color: cTxt.length > 280 ? '#f87171' : 'var(--text-muted)', flexShrink: 0 }}>{300 - cTxt.length}</span>}
                  <button onClick={onComment} disabled={postingC || !cTxt.trim()} style={{
                    padding: '7px 16px', borderRadius: 10, border: 'none', fontFamily: 'inherit', flexShrink: 0,
                    background: cTxt.trim() ? 'linear-gradient(135deg,#8a1538,#c0185c)' : 'transparent',
                    color: cTxt.trim() ? '#fff' : 'rgba(255,255,255,.25)',
                    fontSize: 12.5, fontWeight: 700, cursor: cTxt.trim() ? 'pointer' : 'default',
                    opacity: postingC ? .6 : 1, transition: 'all .15s',
                    boxShadow: cTxt.trim() ? '0 2px 12px rgba(138,21,56,.45)' : 'none',
                  }}>{postingC ? '…' : 'Reply'}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Av({ url, name, size, onClick, ring=false }: {
  url:string|null; name:string|null; size:number; onClick?:(e:React.MouseEvent)=>void; ring?:boolean
}) {
  const initials = (name??'?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase()
  return (
    <div onClick={onClick} style={{
      width:size, height:size, borderRadius:'50%', flexShrink:0,
      background:'linear-gradient(135deg,#c0185c,#8a1538)',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:Math.floor(size*.36), fontWeight:800, color:'#fff',
      cursor:onClick?'pointer':'default', overflow:'hidden',
      border:ring?'2.5px solid rgba(138,21,56,.55)':'none',
      boxShadow:ring?'0 0 0 2px rgba(138,21,56,.18)':'none',
      transition:onClick?'opacity .15s,transform .15s':undefined,
      userSelect:'none',
    }}
      onMouseEnter={e=>{if(onClick){e.currentTarget.style.opacity='.82';e.currentTarget.style.transform='scale(1.06)'}}}
      onMouseLeave={e=>{if(onClick){e.currentTarget.style.opacity='1';e.currentTarget.style.transform='scale(1)'}}}
    >
      {url ? <img src={url} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }}/> : initials}
    </div>
  )
}

// ─── Skeleton / Empty ─────────────────────────────────────────────────────────
function Skeleton() {
  const sh = { background:'linear-gradient(90deg,rgba(255,255,255,.04) 25%,rgba(255,255,255,.09) 50%,rgba(255,255,255,.04) 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.5s ease-in-out infinite', borderRadius:10 }
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      {[0,1,2,3].map(i=>(
        <div key={i} style={{ background:'#231518', border:'1px solid rgba(255,255,255,.07)', borderRadius:18, padding:'16px 18px', opacity:1-i*.18 }}>
          <div style={{ display:'flex', gap:13 }}>
            <div style={{ ...sh,width:44,height:44,borderRadius:'50%',flexShrink:0,animationDelay:`${i*.1}s` }}/>
            <div style={{ flex:1 }}>
              <div style={{ height:13,width:'28%',marginBottom:10,...sh,animationDelay:`${i*.1+.05}s` }}/>
              <div style={{ height:13,width:'85%',marginBottom:8,...sh,animationDelay:`${i*.1+.1}s` }}/>
              <div style={{ height:13,width:'60%',...sh,animationDelay:`${i*.1+.15}s` }}/>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function Empty() {
  return (
    <div style={{ textAlign:'center', padding:'60px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:18 }}>
      <div style={{ width:80,height:80,borderRadius:'50%',background:'linear-gradient(135deg,rgba(138,21,56,.25),rgba(138,21,56,.05))',border:'1px solid rgba(138,21,56,.25)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:34,boxShadow:'0 0 40px rgba(138,21,56,.15)' }}>✨</div>
      <div>
        <div style={{ fontSize:18,fontWeight:800,color:'var(--text-primary)',marginBottom:8 }}>Nothing here yet</div>
        <div style={{ fontSize:13,color:'var(--text-muted)',lineHeight:1.6,maxWidth:260 }}>Be the first to post something for your campus!</div>
      </div>
    </div>
  )
}

// ─── Util ─────────────────────────────────────────────────────────────────────
function reltime(iso: string): string {
  const d = Date.now()-parseTS(iso).getTime(), s=Math.floor(d/1000)
  if(s<60) return `${s}s`; const m=Math.floor(s/60)
  if(m<60) return `${m}m`; const h=Math.floor(m/60)
  if(h<24) return `${h}h`; const dy=Math.floor(h/24)
  if(dy<7) return `${dy}d`
  return parseTS(iso).toLocaleDateString('en-US',{month:'short',day:'numeric'})
}
