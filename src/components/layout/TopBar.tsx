import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

interface Notification {
  id: string
  type: 'announcement' | 'message' | 'accepted' | 'match' | 'end_trade_request'
  title: string
  body: string | null
  link: string | null
  read: boolean
  created_at: string
}

interface ClubResult    { id: string; name: string; category: string | null; logo_url: string | null }
interface ProfileResult { id: string; full_name: string | null; avatar_url: string | null; school: string | null }
interface PostResult    { id: string; content: string | null; created_at: string; profile: { full_name: string | null } | null }

interface Toast {
  id: string
  notif: Notification
}

const NOTIF_META: Record<Notification['type'], { icon: string; color: string; bg: string }> = {
  match:             { icon: '🤝', color: '#4ade80', bg: 'rgba(34,197,94,0.1)'   },
  accepted:          { icon: '✓',  color: '#4ade80', bg: 'rgba(34,197,94,0.12)'  },
  message:           { icon: '💬', color: '#38bdf8', bg: 'rgba(14,165,233,0.1)'  },
  announcement:      { icon: '📢', color: '#e9c176', bg: 'rgba(233,193,118,0.1)' },
  end_trade_request: { icon: '⇄',  color: '#fb923c', bg: 'rgba(251,146,60,0.1)' },
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

interface Props {
  onMenuToggle?: () => void
}

export default function TopBar({ onMenuToggle }: Props) {
  const { profile, user, signOut } = useAuth()
  const navigate = useNavigate()
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const panelRef = useRef<HTMLDivElement>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  // Search state
  const [sq, setSq] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [srClubs, setSrClubs]   = useState<ClubResult[]>([])
  const [srPeople, setSrPeople] = useState<ProfileResult[]>([])
  const [srPosts, setSrPosts]   = useState<PostResult[]>([])
  const [srLoading, setSrLoading] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim() || !user) { setSrClubs([]); setSrPeople([]); setSrPosts([]); return }
    setSrLoading(true)
    const [cRes, pRes, posRes] = await Promise.all([
      supabase.from('clubs').select('id,name,category,logo_url').ilike('name', `%${q.trim()}%`).limit(4),
      supabase.from('profiles').select('id,full_name,avatar_url,school').ilike('full_name', `%${q.trim()}%`).limit(4),
      supabase.from('posts').select('id,content,created_at,profile:profiles!user_id(full_name)').ilike('content', `%${q.trim()}%`).order('created_at', { ascending: false }).limit(4),
    ])
    setSrClubs((cRes.data as ClubResult[]) ?? [])
    setSrPeople((pRes.data as unknown as ProfileResult[]) ?? [])
    setSrPosts((posRes.data as unknown as PostResult[]) ?? [])
    setSrLoading(false)
  }, [user])

  useEffect(() => {
    const t = setTimeout(() => runSearch(sq), 280)
    return () => clearTimeout(t)
  }, [sq, runSearch])

  useEffect(() => {
    if (!searchFocused) return
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchFocused(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [searchFocused])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSearchFocused(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const hasResults = srClubs.length + srPeople.length + srPosts.length > 0
  const showDropdown = searchFocused && sq.trim().length > 0

  const TYPE_TO_PREF: Partial<Record<Notification['type'], string>> = {
    message:           'direct_messages',
    announcement:      'club_announcements',
    match:             'skill_matches',
    accepted:          'skill_matches',
    end_trade_request: 'skill_matches',
  }

  function notifAllowed(n: Notification) {
    const prefKey = TYPE_TO_PREF[n.type]
    if (!prefKey) return true
    return profile?.notification_prefs?.[prefKey] !== false
  }

  const unread = notifs.filter(n => !n.read && notifAllowed(n)).length

  const fetchNotifs = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(40)
    setNotifs((data as Notification[]) ?? [])
  }, [user])

  // Initial load + realtime subscription
  useEffect(() => {
    if (!user) return
    fetchNotifs()

    const ch = supabase
      .channel(`notifs-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        fetchNotifs()
        const n = payload.new as Notification
        const prefKey = TYPE_TO_PREF[n.type]
        const allowed = !prefKey || profile?.notification_prefs?.[prefKey] !== false
        if (allowed) {
          const toast: Toast = { id: `t-${Date.now()}`, notif: n }
          setToasts(prev => [...prev, toast])
          setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toast.id)), 4500)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [user, fetchNotifs])

  // Close notification panel on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close profile dropdown on outside click
  useEffect(() => {
    if (!profileOpen) return
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [profileOpen])

  const handleSignOut = async () => {
    setProfileOpen(false)
    await signOut()
    navigate('/')
  }

  const markAllRead = async () => {
    if (!user) return
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false)
    setNotifs(prev => prev.map(n => ({ ...n, read: true })))
  }

  const markRead = async (n: Notification) => {
    if (!n.read) {
      await supabase.from('notifications').update({ read: true }).eq('id', n.id)
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
    }
    setOpen(false)
    if (n.link) navigate(n.link)
  }

  const toastPortal = createPortal(
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end', pointerEvents: 'none' }}>
      {toasts.map(t => {
        const meta = NOTIF_META[t.notif.type] ?? NOTIF_META.announcement
        return (
          <div
            key={t.id}
            className="notif-toast"
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              background: 'rgba(27,16,18,0.97)',
              border: '1px solid rgba(87,65,68,0.4)',
              borderLeft: `3px solid ${meta.color}`,
              borderRadius: 14, padding: '12px 16px',
              boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
              maxWidth: 320, pointerEvents: 'auto',
            }}
          >
            <div style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>
              {meta.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 3 }}>{t.notif.title}</div>
              {t.notif.body && (
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{t.notif.body}</div>
              )}
            </div>
          </div>
        )
      })}
    </div>,
    document.body
  )

  return (
    <>
    {toastPortal}
    <header className="top-bar" style={{
      background: 'rgba(18,18,18,0.7)',
      backdropFilter: 'blur(16px)',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
    }}>
      {/* ── Left: hamburger + logo ── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          className="hamburger"
          onClick={onMenuToggle}
          style={{ display: 'none', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, background: 'transparent', border: 'none', color: 'var(--text-primary)', borderRadius: 8, flexShrink: 0, padding: 0 }}
          aria-label="Open navigation"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <div
          className="top-bar-logo-space"
          onClick={() => navigate('/home')}
          style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none', transition: 'opacity 0.18s' }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          <img src="/clubsynqlogo.png" alt="ClubSynq" style={{ height: 32, width: 'auto', objectFit: 'contain', flexShrink: 0, borderRadius: 6, filter: 'drop-shadow(0 0 6px rgba(138,21,56,0.5))' }} />
          <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: '0.2em', color: '#fff', textTransform: 'uppercase', background: 'linear-gradient(135deg, #fff 0%, rgba(229,124,154,0.9) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            CLUBSYNQ
          </span>
        </div>
      </div>

      {/* ── Center: search bar ── */}
      <div ref={searchRef} className="tb-search" style={{ flex: '0 0 400px', position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          <svg style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: searchFocused ? 'var(--accent)' : 'var(--text-muted)', pointerEvents: 'none', transition: 'color .15s' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            ref={searchInputRef}
            value={sq}
            onChange={e => setSq(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            placeholder="Search clubs, people, posts…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 32px 8px 32px', background: searchFocused ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.04)', border: `1px solid ${searchFocused ? 'rgba(138,21,56,.45)' : 'rgba(255,255,255,.09)'}`, borderRadius: 10, color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit', transition: 'all .15s', caretColor: 'var(--accent)' }}
          />
          {srLoading && <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(138,21,56,.3)', borderTopColor: 'var(--accent)', animation: 'tbSpin .7s linear infinite' }} />}
          {!srLoading && sq && <button onClick={() => { setSq(''); searchInputRef.current?.focus() }} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '2px 3px' }}>✕</button>}
        </div>

        {/* Results dropdown */}
        {showDropdown && (
          <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, background: 'rgba(20,10,14,0.98)', backdropFilter: 'blur(24px)', border: '1px solid rgba(87,65,68,.35)', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.65)', overflow: 'hidden', zIndex: 9998, animation: 'tbDropIn .18s cubic-bezier(.22,1,.36,1) both', maxHeight: 480, overflowY: 'auto' }}>

            {!hasResults && !srLoading && (
              <div style={{ padding: '28px 18px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                No results for "<strong style={{ color: 'var(--text-primary)' }}>{sq}</strong>"
              </div>
            )}

            {/* Clubs */}
            {srClubs.length > 0 && (
              <div>
                <div style={{ padding: '10px 16px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '.1em', textTransform: 'uppercase' }}>Clubs</div>
                {srClubs.map(c => (
                  <div key={c.id} onClick={() => { navigate(`/clubs/${c.id}`); setSearchFocused(false); setSq('') }} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 16px', cursor: 'pointer', transition: 'background .1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.05)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: c.logo_url ? 'transparent' : 'rgba(138,21,56,.2)', border: '1px solid rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'var(--accent)', overflow: 'hidden', flexShrink: 0 }}>
                      {c.logo_url ? <img src={c.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : c.name[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                      {c.category && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.category}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* People */}
            {srPeople.length > 0 && (
              <div style={{ borderTop: srClubs.length > 0 ? '1px solid rgba(255,255,255,.06)' : 'none' }}>
                <div style={{ padding: '10px 16px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '.1em', textTransform: 'uppercase' }}>People</div>
                {srPeople.map(p => (
                  <div key={p.id} onClick={() => { navigate(`/profile/${p.id}`); setSearchFocused(false); setSq('') }} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 16px', cursor: 'pointer', transition: 'background .1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.05)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#c0185c,#8a1538)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#fff', overflow: 'hidden', flexShrink: 0 }}>
                      {p.avatar_url ? <img src={p.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (p.full_name?.[0] ?? '?')}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.full_name ?? 'User'}</div>
                      {p.school && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.school}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Posts */}
            {srPosts.length > 0 && (
              <div style={{ borderTop: (srClubs.length + srPeople.length) > 0 ? '1px solid rgba(255,255,255,.06)' : 'none' }}>
                <div style={{ padding: '10px 16px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '.1em', textTransform: 'uppercase' }}>Posts</div>
                {srPosts.map(p => (
                  <div key={p.id} onClick={() => { navigate('/home'); setSearchFocused(false); setSq('') }} style={{ padding: '9px 16px', cursor: 'pointer', transition: 'background .1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.05)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{p.profile?.full_name ?? 'User'}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.content}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right side */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>

        {/* ── Notification Bell ── */}
        <div ref={panelRef} style={{ position: 'relative' }}>
          <button
            onClick={() => { setOpen(o => { if (!o) markAllRead(); return !o }) }}
            style={{
              position: 'relative', width: 36, height: 36, borderRadius: '50%',
              background: open ? 'rgba(138,21,56,0.2)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${open ? 'rgba(138,21,56,0.4)' : 'rgba(255,255,255,0.1)'}`,
              color: 'var(--text-primary)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s', flexShrink: 0,
            }}
            aria-label="Notifications"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unread > 0 && (
              <span style={{
                position: 'absolute', top: -3, right: -3,
                minWidth: 17, height: 17, borderRadius: 9999,
                background: 'var(--accent)', color: '#fff',
                fontSize: 10, fontWeight: 800, lineHeight: '17px',
                textAlign: 'center', padding: '0 4px',
                boxShadow: '0 0 0 2px rgba(18,18,18,0.9)',
                animation: 'notifPop 0.25s ease',
              }}>
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          {/* ── Panel ── */}
          {open && (
            <div className="notif-panel" style={{
              position: 'absolute', top: 'calc(100% + 10px)', right: 0,
              width: 360, maxHeight: 500,
              background: 'rgba(27,16,18,0.98)', backdropFilter: 'blur(24px)',
              border: '1px solid rgba(87,65,68,0.35)', borderRadius: 16,
              boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              zIndex: 9999,
            }}>
              {/* Header */}
              <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid rgba(87,65,68,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Notifications</span>
                  {unread > 0 && (
                    <span style={{ fontSize: 10, background: 'var(--accent)', color: '#fff', borderRadius: 9999, padding: '1px 7px', fontWeight: 800 }}>{unread} new</span>
                  )}
                </div>
                {unread > 0 && (
                  <button onClick={markAllRead} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: '2px 0' }}>
                    Mark all read
                  </button>
                )}
              </div>

              {/* List */}
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {notifs.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.4 }}>🔔</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No notifications yet</div>
                  </div>
                ) : notifs.map((n, i) => {
                  const meta = NOTIF_META[n.type]
                  return (
                    <div
                      key={n.id}
                      onClick={() => markRead(n)}
                      style={{
                        display: 'flex', gap: 12, padding: '12px 16px',
                        cursor: n.link ? 'pointer' : 'default',
                        background: n.read ? 'transparent' : 'rgba(138,21,56,0.06)',
                        borderBottom: '1px solid rgba(87,65,68,0.12)',
                        transition: 'background 0.12s',
                        alignItems: 'flex-start',
                        animation: `notif-row 0.3s cubic-bezier(0.22,1,0.36,1) ${i * 0.045}s both`,
                      }}
                    >
                      {/* Icon */}
                      <div style={{
                        width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                        background: meta.bg, border: `1px solid ${meta.color}30`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 16, marginTop: 1,
                      }}>
                        {meta.icon}
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 13, fontWeight: n.read ? 500 : 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>{n.title}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, marginTop: 1 }}>{timeAgo(n.created_at)}</span>
                        </div>
                        {n.body && (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {n.body}
                          </div>
                        )}
                      </div>

                      {/* Unread dot */}
                      {!n.read && (
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 6, boxShadow: '0 0 6px var(--accent-glow)' }} />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* User avatar + profile dropdown */}
        <div ref={profileRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setProfileOpen(o => !o)}
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: profileOpen ? 'rgba(138,21,56,0.25)' : 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: '#fff',
              border: `2px solid ${profileOpen ? 'rgba(192,24,92,0.6)' : 'rgba(255,255,255,0.12)'}`,
              flexShrink: 0, cursor: 'pointer', padding: 0,
              transition: 'border-color 0.15s, box-shadow 0.15s',
              boxShadow: profileOpen ? '0 0 0 3px rgba(138,21,56,0.2)' : 'none',
              overflow: 'hidden',
            }}
            aria-label="Profile menu"
          >
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : profile?.full_name?.[0]?.toUpperCase() ?? '?'
            }
          </button>

          {/* Dropdown */}
          {profileOpen && (
            <div className="profile-dropdown" style={{
              position: 'absolute', top: 'calc(100% + 10px)', right: 0,
              width: 220,
              background: 'rgba(20,10,14,0.98)', backdropFilter: 'blur(24px)',
              border: '1px solid rgba(87,65,68,0.35)', borderRadius: 14,
              boxShadow: '0 20px 56px rgba(0,0,0,0.65)',
              overflow: 'hidden', zIndex: 9999,
            }}>
              {/* User info header */}
              <div style={{
                padding: '14px 16px 12px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg,#8a1538,#c0185c)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 800, color: '#fff', overflow: 'hidden',
                }}>
                  {profile?.avatar_url
                    ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : profile?.full_name?.[0]?.toUpperCase() ?? '?'
                  }
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {profile?.full_name ?? 'User'}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user?.email}
                  </div>
                </div>
              </div>

              {/* Menu items */}
              <div style={{ padding: '6px 0' }}>
                {/* Profile */}
                <button
                  className="pd-item"
                  onClick={() => { setProfileOpen(false); navigate('/profile') }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 11,
                    padding: '10px 16px', background: 'none', border: 'none',
                    cursor: 'pointer', color: 'rgba(255,255,255,0.8)',
                    fontSize: 13, fontFamily: 'inherit', textAlign: 'left',
                    transition: 'background 0.12s, color 0.12s',
                    borderRadius: 0,
                  }}
                >
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                  </div>
                  Profile
                </button>

                {/* Account Settings */}
                <button
                  className="pd-item"
                  onClick={() => { setProfileOpen(false); navigate('/settings') }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 11,
                    padding: '10px 16px', background: 'none', border: 'none',
                    cursor: 'pointer', color: 'rgba(255,255,255,0.8)',
                    fontSize: 13, fontFamily: 'inherit', textAlign: 'left',
                    transition: 'background 0.12s, color 0.12s',
                  }}
                >
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3"/>
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                    </svg>
                  </div>
                  Account Settings
                </button>

                {/* Divider */}
                <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />

                {/* Sign Out */}
                <button
                  className="pd-item pd-signout"
                  onClick={handleSignOut}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 11,
                    padding: '10px 16px', background: 'none', border: 'none',
                    cursor: 'pointer', color: 'rgba(255,90,90,0.85)',
                    fontSize: 13, fontFamily: 'inherit', textAlign: 'left',
                    transition: 'background 0.12s, color 0.12s',
                  }}
                >
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(255,80,80,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                      <polyline points="16 17 21 12 16 7"/>
                      <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                  </div>
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes notifPop {
          from { transform: scale(0.5); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
        @keyframes notif-panel {
          from { opacity: 0; transform: translateY(-10px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)     scale(1);    }
        }
        @keyframes notif-row {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0);    }
        }
        @keyframes notif-toast-in {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes notif-toast-out {
          from { opacity: 1; transform: translateY(0)    scale(1);    }
          to   { opacity: 0; transform: translateY(10px) scale(0.95); }
        }
        @keyframes tbSpin    { to { transform: translateY(-50%) rotate(360deg); } }
        @keyframes tbDropIn  { from { opacity:0; transform:translateY(-8px) scale(.97); } to { opacity:1; transform:none; } }
        .notif-panel { animation: notif-panel 0.22s cubic-bezier(0.22,1,0.36,1) both; }
        .notif-toast { animation: notif-toast-in 0.3s cubic-bezier(0.34,1.56,0.64,1) both; }
        .notif-toast.leaving { animation: notif-toast-out 0.25s ease forwards; }
        @media(max-width:600px) { .tb-search { display:none!important; } }
        @keyframes pd-in { from{opacity:0;transform:translateY(-8px) scale(0.96)} to{opacity:1;transform:none} }
        .profile-dropdown { animation: pd-in 0.2s cubic-bezier(0.22,1,0.36,1) both; }
        .pd-item:hover { background: rgba(255,255,255,0.05) !important; color: #fff !important; }
        .pd-signout:hover { background: rgba(255,60,60,0.08) !important; color: rgba(255,100,100,1) !important; }
      `}</style>

    </header>
    </>
  )
}
