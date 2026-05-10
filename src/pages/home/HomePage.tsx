import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// ── Types ────────────────────────────────────────────────────────────────────

interface PostRow {
  id: string
  user_id: string
  content: string | null
  image_url: string | null
  repost_of: string | null
  created_at: string
  profile: { full_name: string | null; avatar_url: string | null } | null
}

interface FeedPost extends PostRow {
  likeCount: number
  commentCount: number
  repostCount: number
  isLiked: boolean
  repostSource: PostRow | null
}

interface CommentRow {
  id: string
  post_id: string
  user_id: string
  content: string
  created_at: string
  profile: { full_name: string | null; avatar_url: string | null } | null
}

// ── SVG Icons ────────────────────────────────────────────────────────────────

const HeartIcon = ({ filled = false }: { filled?: boolean }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor" strokeWidth={filled ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
)

const ChatIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)

const RepeatIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
)

const ImageIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
)

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [posts, setPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)

  const [composeText, setComposeText] = useState('')
  const [composeImage, setComposeImage] = useState<File | null>(null)
  const [composePreview, setComposePreview] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  const [composeError, setComposeError] = useState('')
  const [composeFocused, setComposeFocused] = useState(false)
  const composeImgRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [openThreadId, setOpenThreadId] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, CommentRow[]>>({})
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({})
  const [postingComment, setPostingComment] = useState<string | null>(null)
  const [repostingId, setRepostingId] = useState<string | null>(null)

  useEffect(() => { fetchFeed() }, [user])

  useEffect(() => {
    const channel = supabase
      .channel('home-feed-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => fetchFeed())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  async function fetchFeed() {
    setLoading(true)
    const { data: rawPosts } = await supabase
      .from('posts')
      .select('id, user_id, content, image_url, repost_of, created_at, profile:profiles!user_id(full_name, avatar_url)')
      .order('created_at', { ascending: false })
      .limit(60)

    if (!rawPosts) { setLoading(false); return }

    const postIds = rawPosts.map(p => p.id)
    const repostSourceIds = rawPosts.flatMap(p => p.repost_of ? [p.repost_of as string] : [])

    const [likesRes, commentIdsRes, repostIdsRes, sourcesRes] = await Promise.all([
      postIds.length > 0
        ? supabase.from('post_likes').select('post_id, user_id').in('post_id', postIds)
        : Promise.resolve({ data: [] as { post_id: string; user_id: string }[] }),
      postIds.length > 0
        ? supabase.from('post_comments').select('post_id').in('post_id', postIds)
        : Promise.resolve({ data: [] as { post_id: string }[] }),
      postIds.length > 0
        ? supabase.from('posts').select('repost_of').in('repost_of', postIds)
        : Promise.resolve({ data: [] as { repost_of: string | null }[] }),
      repostSourceIds.length > 0
        ? supabase.from('posts').select('id, user_id, content, image_url, repost_of, created_at, profile:profiles!user_id(full_name, avatar_url)').in('id', repostSourceIds)
        : Promise.resolve({ data: [] as PostRow[] }),
    ])

    const likesByPost: Record<string, string[]> = {}
    for (const l of (likesRes.data ?? [])) {
      if (!likesByPost[l.post_id]) likesByPost[l.post_id] = []
      likesByPost[l.post_id].push(l.user_id)
    }
    const commentCountByPost: Record<string, number> = {}
    for (const c of (commentIdsRes.data ?? [])) {
      commentCountByPost[c.post_id] = (commentCountByPost[c.post_id] ?? 0) + 1
    }
    const repostCountByPost: Record<string, number> = {}
    for (const r of (repostIdsRes.data ?? [])) {
      if (r.repost_of) repostCountByPost[r.repost_of] = (repostCountByPost[r.repost_of] ?? 0) + 1
    }
    const sourceById: Record<string, PostRow> = {}
    for (const s of ((sourcesRes.data ?? []) as unknown as PostRow[])) {
      sourceById[s.id] = s
    }

    setPosts(
      (rawPosts as unknown as PostRow[]).map(p => ({
        ...p,
        likeCount: (likesByPost[p.id] ?? []).length,
        commentCount: commentCountByPost[p.id] ?? 0,
        repostCount: repostCountByPost[p.id] ?? 0,
        isLiked: user ? (likesByPost[p.id] ?? []).includes(user.id) : false,
        repostSource: p.repost_of ? (sourceById[p.repost_of] ?? null) : null,
      }))
    )
    setLoading(false)
  }

  function handleComposeChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setComposeText(e.target.value)
    setComposeError('')
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 260) + 'px'
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (file.size > 15 * 1024 * 1024) { setComposeError('File must be under 15 MB'); return }
    setComposeImage(file)
    const reader = new FileReader()
    reader.onload = () => setComposePreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function handlePost() {
    if (!user || (!composeText.trim() && !composeImage)) return
    if (composeText.length > 500) { setComposeError('Max 500 characters'); return }
    setPosting(true)
    setComposeError('')

    let imageUrl: string | null = null
    if (composeImage) {
      const ext = composeImage.name.split('.').pop() ?? 'jpg'
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('post-media').upload(path, composeImage)
      if (!upErr) {
        const { data } = supabase.storage.from('post-media').getPublicUrl(path)
        imageUrl = data.publicUrl
      }
    }

    await supabase.from('posts').insert({
      user_id: user.id,
      content: composeText.trim() || null,
      image_url: imageUrl,
    })

    setComposeText('')
    setComposeImage(null)
    setComposePreview(null)
    setComposeFocused(false)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setPosting(false)
    fetchFeed()
  }

  async function handleLike(postId: string, isLiked: boolean) {
    if (!user) return
    setPosts(prev => prev.map(p => p.id === postId
      ? { ...p, isLiked: !isLiked, likeCount: p.likeCount + (isLiked ? -1 : 1) }
      : p
    ))
    if (isLiked) {
      await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', user.id)
    } else {
      await supabase.from('post_likes').insert({ post_id: postId, user_id: user.id })
    }
  }

  async function handleRepost(postId: string) {
    if (!user || repostingId) return
    setRepostingId(postId)
    await supabase.from('posts').insert({ user_id: user.id, content: null, repost_of: postId })
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, repostCount: p.repostCount + 1 } : p))
    setRepostingId(null)
    fetchFeed()
  }

  async function toggleThread(postId: string) {
    if (openThreadId === postId) { setOpenThreadId(null); return }
    setOpenThreadId(postId)
    if (!comments[postId]) await fetchComments(postId)
  }

  async function fetchComments(postId: string) {
    const { data } = await supabase
      .from('post_comments')
      .select('id, post_id, user_id, content, created_at, profile:profiles!user_id(full_name, avatar_url)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .limit(50)
    setComments(prev => ({ ...prev, [postId]: (data as unknown as CommentRow[]) ?? [] }))
  }

  async function handlePostComment(postId: string) {
    if (!user) return
    const text = (commentTexts[postId] ?? '').trim()
    if (!text || postingComment) return
    setPostingComment(postId)
    await supabase.from('post_comments').insert({ post_id: postId, user_id: user.id, content: text })
    setCommentTexts(prev => ({ ...prev, [postId]: '' }))
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p))
    await fetchComments(postId)
    setPostingComment(null)
  }

  const canPost = !posting && (!!composeText.trim() || !!composeImage)

  return (
    <div className="page-content" style={{ maxWidth: 980, margin: '0 auto', paddingBottom: 64 }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px', marginBottom: 3 }}>
          Home
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          What's happening on campus
        </p>
      </div>

      {/* ── Compose box ── */}
      <div style={{
        background: composeFocused
          ? 'rgba(255,255,255,0.04)'
          : 'rgba(255,255,255,0.025)',
        border: `1px solid ${composeFocused ? 'rgba(138,21,56,0.35)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 20,
        padding: '18px 20px',
        marginBottom: 24,
        transition: 'background 0.2s, border-color 0.2s',
        boxShadow: composeFocused ? '0 0 0 3px rgba(138,21,56,0.07)' : 'none',
      }}>
        <div style={{ display: 'flex', gap: 14 }}>
          {/* Avatar */}
          <div style={{ flexShrink: 0, paddingTop: 2 }}>
            <Av
              url={profile?.avatar_url ?? null}
              name={profile?.full_name ?? null}
              size={42}
              onClick={() => navigate('/profile')}
              ring
            />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <textarea
              ref={textareaRef}
              value={composeText}
              onChange={handleComposeChange}
              onFocus={() => setComposeFocused(true)}
              onBlur={() => setComposeFocused(false)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePost() }}
              placeholder="What's on your mind?"
              maxLength={500}
              rows={composeFocused ? 3 : 2}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                resize: 'none',
                fontSize: 16,
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
                lineHeight: 1.7,
                overflow: 'hidden',
                minHeight: composeFocused ? 72 : 48,
                transition: 'min-height 0.2s',
                caretColor: 'var(--accent)',
              }}
            />

            {/* Image preview */}
            {composePreview && (
              <div style={{
                position: 'relative', marginTop: 10,
                borderRadius: 14, overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.08)',
                lineHeight: 0,
              }}>
                <img src={composePreview} alt="" style={{ width: '100%', maxHeight: 360, objectFit: 'cover', display: 'block' }} />
                <button
                  onClick={() => { setComposeImage(null); setComposePreview(null) }}
                  style={{
                    position: 'absolute', top: 10, right: 10,
                    width: 32, height: 32, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    color: '#fff', fontSize: 13, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >✕</button>
              </div>
            )}

            {composeError && (
              <div style={{ fontSize: 12, color: '#f87171', marginTop: 8 }}>{composeError}</div>
            )}

            {/* Bottom toolbar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginTop: 14, paddingTop: 12,
              borderTop: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  ref={composeImgRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  style={{ display: 'none' }}
                  onChange={handleImageSelect}
                />
                <ComposeToolBtn
                  title="Image / GIF"
                  active={!!composeImage}
                  onClick={() => composeImgRef.current?.click()}
                >
                  <ImageIcon />
                </ComposeToolBtn>
                {composeImage && (
                  <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginLeft: 4 }}>
                    {composeImage.name.split('.').pop()?.toUpperCase()}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {composeText.length > 380 && (
                  <span style={{
                    fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                    color: composeText.length > 480 ? '#f87171' : 'rgba(255,255,255,0.3)',
                  }}>
                    {500 - composeText.length}
                  </span>
                )}
                <button
                  onClick={handlePost}
                  disabled={!canPost}
                  style={{
                    padding: '9px 24px',
                    borderRadius: 9999,
                    background: canPost
                      ? 'var(--accent)'
                      : 'rgba(87,65,68,0.18)',
                    border: 'none',
                    color: canPost ? '#fff' : 'rgba(255,255,255,0.25)',
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: '0.01em',
                    cursor: canPost ? 'pointer' : 'default',
                    opacity: posting ? 0.7 : 1,
                    transition: 'all 0.18s',
                    boxShadow: canPost ? '0 2px 16px rgba(138,21,56,0.35)' : 'none',
                  }}
                >
                  {posting ? 'Posting…' : 'Post'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Feed ── */}
      {loading ? (
        <LoadingSkeleton />
      ) : posts.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '80px 0',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'rgba(138,21,56,0.1)',
            border: '1px solid rgba(138,21,56,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 30,
          }}>✨</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
              Nothing here yet
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Be the first to post something for your campus!
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {posts.map((post, idx) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={user?.id ?? null}
              isThreadOpen={openThreadId === post.id}
              comments={comments[post.id] ?? []}
              commentText={commentTexts[post.id] ?? ''}
              postingComment={postingComment === post.id}
              reposting={repostingId === post.id}
              isLast={idx === posts.length - 1}
              onLike={() => handleLike(post.id, post.isLiked)}
              onRepost={() => handleRepost(post.id)}
              onToggleThread={() => toggleThread(post.id)}
              onCommentChange={text => setCommentTexts(prev => ({ ...prev, [post.id]: text }))}
              onPostComment={() => handlePostComment(post.id)}
              onNavigateProfile={uid => navigate(`/profile/${uid}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── PostCard ─────────────────────────────────────────────────────────────────

function PostCard({
  post, currentUserId, isThreadOpen, comments, commentText,
  postingComment, reposting, isLast, onLike, onRepost, onToggleThread,
  onCommentChange, onPostComment, onNavigateProfile,
}: {
  post: FeedPost
  currentUserId: string | null
  isThreadOpen: boolean
  comments: CommentRow[]
  commentText: string
  postingComment: boolean
  reposting: boolean
  isLast: boolean
  onLike: () => void
  onRepost: () => void
  onToggleThread: () => void
  onCommentChange: (t: string) => void
  onPostComment: () => void
  onNavigateProfile: (uid: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  const commentInputRef = useRef<HTMLInputElement>(null)
  const isRepostOnly = !!post.repost_of && !post.content && !post.image_url

  useEffect(() => {
    if (isThreadOpen) setTimeout(() => commentInputRef.current?.focus(), 80)
  }, [isThreadOpen])

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'rgba(255,255,255,0.027)' : 'rgba(255,255,255,0.015)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        borderBottom: isLast ? '1px solid rgba(255,255,255,0.06)' : 'none',
        transition: 'background 0.15s',
        cursor: 'default',
      }}
    >
      <div style={{ padding: '18px 20px 14px' }}>

        {/* Repost attribution */}
        {isRepostOnly && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 10, marginLeft: 52,
            fontSize: 12, color: 'var(--text-muted)', fontWeight: 500,
          }}>
            <span style={{ opacity: 0.7 }}><RepeatIcon /></span>
            <span
              onClick={() => onNavigateProfile(post.user_id)}
              style={{ cursor: 'pointer', color: 'var(--text-muted)', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              {post.profile?.full_name ?? 'Someone'} reposted
            </span>
          </div>
        )}

        {/* Header row */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 12 }}>
          <div style={{ flexShrink: 0 }}>
            <Av
              url={isRepostOnly ? (post.repostSource?.profile?.avatar_url ?? null) : (post.profile?.avatar_url ?? null)}
              name={isRepostOnly ? (post.repostSource?.profile?.full_name ?? null) : (post.profile?.full_name ?? null)}
              size={42}
              onClick={() => onNavigateProfile(isRepostOnly ? (post.repostSource?.user_id ?? post.user_id) : post.user_id)}
            />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 1 }}>
              <span
                onClick={() => onNavigateProfile(isRepostOnly ? (post.repostSource?.user_id ?? post.user_id) : post.user_id)}
                style={{
                  fontSize: 15, fontWeight: 700, color: 'var(--text-primary)',
                  cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-primary)')}
              >
                {isRepostOnly
                  ? (post.repostSource?.profile?.full_name ?? 'User')
                  : (post.profile?.full_name ?? 'User')
                }
              </span>
              <span style={{
                fontSize: 12, color: 'var(--text-muted)', flexShrink: 0,
                fontVariantNumeric: 'tabular-nums', letterSpacing: '0.01em',
              }}>
                {relativeTime(isRepostOnly ? (post.repostSource?.created_at ?? post.created_at) : post.created_at)}
              </span>
            </div>

            {/* Content */}
            {(isRepostOnly ? post.repostSource?.content : post.content) && (
              <p style={{
                fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.72,
                margin: '6px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {isRepostOnly ? post.repostSource?.content : post.content}
              </p>
            )}
          </div>
        </div>

        {/* Image / GIF — outside the header row, indented to align with content */}
        {((isRepostOnly ? post.repostSource?.image_url : post.image_url)) && (
          <div style={{
            marginLeft: 56, marginBottom: 12,
            borderRadius: 16, overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.07)',
            lineHeight: 0,
          }}>
            <img
              src={(isRepostOnly ? post.repostSource?.image_url : post.image_url)!}
              alt=""
              style={{ width: '100%', maxHeight: 520, objectFit: 'cover', display: 'block' }}
            />
          </div>
        )}

        {/* Repost embed (when post has own content AND is a repost) */}
        {!isRepostOnly && post.repostSource && (
          <div style={{
            marginLeft: 56, marginBottom: 12,
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 14,
            padding: '14px 16px',
            background: 'rgba(255,255,255,0.025)',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, bottom: 0, width: 3,
              background: 'rgba(138,21,56,0.5)', borderRadius: '14px 0 0 14px',
            }} />
            <div style={{ display: 'flex', gap: 10, marginBottom: post.repostSource.content || post.repostSource.image_url ? 10 : 0 }}>
              <Av
                url={post.repostSource.profile?.avatar_url ?? null}
                name={post.repostSource.profile?.full_name ?? null}
                size={26}
                onClick={() => onNavigateProfile(post.repostSource!.user_id)}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {post.repostSource.profile?.full_name ?? 'User'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{relativeTime(post.repostSource.created_at)}</div>
              </div>
            </div>
            {post.repostSource.content && (
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65, margin: '0 0 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {post.repostSource.content}
              </p>
            )}
            {post.repostSource.image_url && (
              <div style={{ borderRadius: 10, overflow: 'hidden', lineHeight: 0, marginTop: 6 }}>
                <img src={post.repostSource.image_url} alt="" style={{ width: '100%', maxHeight: 280, objectFit: 'cover' }} />
              </div>
            )}
          </div>
        )}

        {/* Action bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 54, marginTop: 4 }}>
          <FeedAction
            icon={<HeartIcon filled={post.isLiked} />}
            count={post.likeCount}
            active={post.isLiked}
            onClick={onLike}
            activeColor="#e5405e"
            hoverColor="rgba(229,64,94,0.1)"
            label="Like"
          />
          <FeedAction
            icon={<ChatIcon />}
            count={post.commentCount}
            active={isThreadOpen}
            onClick={onToggleThread}
            activeColor="#60a5fa"
            hoverColor="rgba(96,165,250,0.1)"
            label="Reply"
          />
          <FeedAction
            icon={<RepeatIcon />}
            count={post.repostCount}
            active={false}
            onClick={onRepost}
            activeColor="#4ade80"
            hoverColor="rgba(74,222,128,0.1)"
            label="Repost"
            disabled={reposting || post.user_id === currentUserId}
          />
        </div>
      </div>

      {/* ── Thread / Replies ── */}
      {isThreadOpen && (
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.05)',
          background: 'rgba(0,0,0,0.15)',
          padding: '16px 20px 20px',
        }}>
          {/* Reply input */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <div style={{ flexShrink: 0, paddingTop: 2 }}>
              <Av url={null} name={null} size={34} />
            </div>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 9999, padding: '0 6px 0 16px',
              transition: 'border-color 0.15s',
            }}>
              <input
                ref={commentInputRef}
                value={commentText}
                onChange={e => onCommentChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onPostComment() } }}
                placeholder="Write a reply…"
                maxLength={300}
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  fontSize: 14, color: 'var(--text-primary)', fontFamily: 'inherit',
                  padding: '10px 0',
                }}
                onFocus={e => (e.currentTarget.parentElement!.style.borderColor = 'rgba(138,21,56,0.4)')}
                onBlur={e => (e.currentTarget.parentElement!.style.borderColor = 'rgba(255,255,255,0.09)')}
              />
              <button
                onClick={onPostComment}
                disabled={postingComment || !commentText.trim()}
                style={{
                  padding: '7px 16px', borderRadius: 9999, flexShrink: 0,
                  background: commentText.trim() ? 'var(--accent)' : 'transparent',
                  border: 'none',
                  color: commentText.trim() ? '#fff' : 'var(--text-muted)',
                  fontSize: 13, fontWeight: 700,
                  cursor: commentText.trim() ? 'pointer' : 'default',
                  opacity: postingComment ? 0.6 : 1, transition: 'all 0.15s',
                }}
              >
                {postingComment ? '…' : 'Reply'}
              </button>
            </div>
          </div>

          {/* Comments list */}
          {comments.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0 4px', fontStyle: 'italic' }}>
              No replies yet — start the thread.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {comments.map(c => (
                <div key={c.id} style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flexShrink: 0, paddingTop: 2 }}>
                    <Av url={c.profile?.avatar_url ?? null} name={c.profile?.full_name ?? null} size={34} />
                  </div>
                  <div>
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {c.profile?.full_name ?? 'User'}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                        {relativeTime(c.created_at)}
                      </span>
                    </div>
                    <div style={{
                      fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6,
                      wordBreak: 'break-word',
                    }}>
                      {c.content}
                    </div>
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

// ── Shared atoms ─────────────────────────────────────────────────────────────

function Av({
  url, name, size, onClick, ring = false,
}: {
  url: string | null; name: string | null; size: number
  onClick?: () => void; ring?: boolean
}) {
  const initials = (name ?? '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div
      onClick={onClick}
      style={{
        width: size, height: size, borderRadius: '50%',
        background: 'var(--accent)', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.floor(size * 0.36), fontWeight: 700, color: '#fff',
        cursor: onClick ? 'pointer' : 'default',
        overflow: 'hidden',
        border: ring ? '2px solid rgba(255,255,255,0.08)' : 'none',
        transition: onClick ? 'opacity 0.15s' : undefined,
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.opacity = '0.85' }}
      onMouseLeave={e => { if (onClick) e.currentTarget.style.opacity = '1' }}
    >
      {url
        ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initials
      }
    </div>
  )
}

function FeedAction({
  icon, count, active, onClick, activeColor, hoverColor, label, disabled = false,
}: {
  icon: React.ReactNode; count: number; active: boolean; onClick: () => void
  activeColor: string; hoverColor: string; label: string; disabled?: boolean
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 9999, border: 'none',
        background: hov && !disabled ? hoverColor : active ? `${activeColor}14` : 'transparent',
        color: active ? activeColor : hov && !disabled ? activeColor : 'var(--text-muted)',
        fontSize: 13, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
        transition: 'all 0.15s',
        opacity: disabled ? 0.35 : 1,
        userSelect: 'none',
      }}
      onMouseEnter={() => !disabled && setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {icon}
      {count > 0 && (
        <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      )}
    </button>
  )
}

function ComposeToolBtn({
  title, onClick, active, children,
}: {
  title: string; onClick: () => void; active?: boolean; children: React.ReactNode
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 36, height: 36, borderRadius: '50%', border: 'none',
        background: hov ? 'rgba(138,21,56,0.12)' : active ? 'rgba(138,21,56,0.1)' : 'transparent',
        color: active ? 'var(--accent)' : hov ? 'var(--accent)' : 'var(--text-muted)',
        cursor: 'pointer', transition: 'all 0.15s',
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {children}
    </button>
  )
}

function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          padding: '18px 20px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          opacity: 1 - i * 0.25,
        }}>
          <div style={{ display: 'flex', gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 14, width: '30%', background: 'rgba(255,255,255,0.07)', borderRadius: 7, marginBottom: 10 }} />
              <div style={{ height: 13, width: '90%', background: 'rgba(255,255,255,0.05)', borderRadius: 7, marginBottom: 7 }} />
              <div style={{ height: 13, width: '70%', background: 'rgba(255,255,255,0.04)', borderRadius: 7 }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
