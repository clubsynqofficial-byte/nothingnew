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
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const panelRef = useRef<HTMLDivElement>(null)

  const unread = notifs.filter(n => !n.read).length

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
        const toast: Toast = { id: `t-${Date.now()}`, notif: n }
        setToasts(prev => [...prev, toast])
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toast.id)), 4500)
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [user, fetchNotifs])

  // Close panel on outside click
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
      gap: 12,
    }}>
      {/* Hamburger */}
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

      {/* Logo */}
      <div
        className="top-bar-logo-space"
        onClick={() => navigate('/home')}
        style={{
          width: 216, flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 10,
          cursor: 'pointer', userSelect: 'none',
          transition: 'opacity 0.18s',
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      >
        <img
          src="/clubsynqlogo.png"
          alt="ClubSynq"
          style={{
            height: 32, width: 'auto', objectFit: 'contain', flexShrink: 0,
            borderRadius: 6,
            filter: 'drop-shadow(0 0 6px rgba(138,21,56,0.5))',
          }}
        />
        <span style={{
          fontSize: 17, fontWeight: 900, letterSpacing: '0.2em',
          color: '#fff', textTransform: 'uppercase',
          background: 'linear-gradient(135deg, #fff 0%, rgba(229,124,154,0.9) 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          CLUBSYNQ
        </span>
      </div>

      {/* Right side */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>

        {/* ── Notification Bell ── */}
        <div ref={panelRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setOpen(o => !o)}
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

        {/* User avatar */}
        <div
          onClick={() => navigate('/profile')}
          title="View profile"
          style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0, cursor: 'pointer', transition: 'opacity 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          {profile?.avatar_url
            ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
            : profile?.full_name?.[0]?.toUpperCase() ?? '?'
          }
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
        .notif-panel { animation: notif-panel 0.22s cubic-bezier(0.22,1,0.36,1) both; }
        .notif-toast { animation: notif-toast-in 0.3s cubic-bezier(0.34,1.56,0.64,1) both; }
        .notif-toast.leaving { animation: notif-toast-out 0.25s ease forwards; }
      `}</style>

    </header>
    </>
  )
}
