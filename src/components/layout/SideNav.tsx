import { useState, useEffect, useCallback, useRef } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { usePresence, type PresenceStatus } from '../../contexts/PresenceContext'
import { supabase } from '../../lib/supabase'

const STATUS_OPTIONS: { value: PresenceStatus; label: string; color: string }[] = [
  { value: 'online',  label: 'Online',  color: '#22c55e' },
  { value: 'away',    label: 'Away',    color: '#f59e0b' },
  { value: 'offline', label: 'Offline', color: '#6b7280' },
]

const NAV_ITEMS = [
  { path: '/home', label: 'Home' },
  { path: '/discovery', label: 'Discovery' },
  { path: '/positions', label: 'Positions' },
  { path: '/leadership', label: 'Leadership' },
  { path: '/collaboration', label: 'Collaboration' },
  { path: '/talent', label: 'Talent' },
  { path: '/clubs', label: 'Clubs' },
  { path: '/messages', label: 'Messages' },
]

interface Props {
  open?: boolean
  onClose?: () => void
}

export default function SideNav({ open = false, onClose }: Props) {
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const { myStatus, setMyStatus } = usePresence()
  const [msgUnread, setMsgUnread] = useState(0)
  const [statusOpen, setStatusOpen] = useState(false)
  const statusRef = useRef<HTMLDivElement>(null)

  // Close status dropdown on outside click
  useEffect(() => {
    if (!statusOpen) return
    const handler = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [statusOpen])

  const fetchUnread = useCallback(async () => {
    if (!user) return
    // DM unread: messages in my conversations not sent by me, unread
    const { data: convs } = await supabase
      .from('conversations')
      .select('id')
      .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
    const convIds = (convs ?? []).map((c: { id: string }) => c.id)

    const dmCount = convIds.length > 0
      ? (await supabase.from('direct_messages').select('*', { count: 'exact', head: true })
          .in('conversation_id', convIds).neq('sender_id', user.id).is('read_at', null)
        ).count ?? 0
      : 0

    // Trade unread: count messages from others after each request's lastRead timestamp
    const { data: myReqs } = await supabase
      .from('skill_requests')
      .select('id')
      .in('status', ['accepted', 'completed'])
      .eq('requester_id', user.id)
    const { data: myListingReqs } = await supabase
      .from('skill_requests')
      .select('id, listing:skill_listings!inner(user_id)')
      .in('status', ['accepted', 'completed'])
      .eq('skill_listings.user_id', user.id)
    const reqIds = [
      ...((myReqs ?? []) as { id: string }[]).map(r => r.id),
      ...((myListingReqs ?? []) as { id: string }[]).map(r => r.id),
    ]
    let tradeCount = 0
    if (reqIds.length > 0) {
      const { data: tradeMsgs } = await supabase
        .from('skill_trade_messages')
        .select('request_id, sender_id, created_at')
        .in('request_id', reqIds)
        .neq('sender_id', user.id)
      for (const msg of tradeMsgs ?? []) {
        const lastRead = localStorage.getItem(`lastRead_${msg.request_id}`) ?? '1970-01-01'
        if (msg.created_at > lastRead) tradeCount++
      }
    }

    setMsgUnread(dmCount + tradeCount)
  }, [user])

  useEffect(() => {
    if (!user) return
    fetchUnread()
    const interval = setInterval(fetchUnread, 15000)
    const ch = supabase.channel(`sidenav-unread-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, fetchUnread)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_messages' }, fetchUnread)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'skill_trade_messages' }, fetchUnread)
      .subscribe()
    return () => { clearInterval(interval); supabase.removeChannel(ch) }
  }, [user, fetchUnread])

  return (
    <>
      <style>{`@keyframes notifPop { from { transform:scale(0.5); opacity:0; } to { transform:scale(1); opacity:1; } }`}</style>
      {/* Backdrop overlay — shown on mobile when nav is open */}
      <div
        className={`nav-backdrop${open ? ' open' : ''}`}
        onClick={onClose}
      />

      <aside
        className={`side-nav${open ? ' open' : ''}`}
        style={{
          width: 240,
          minHeight: '100vh',
          background: 'rgba(18,18,18,0.95)',
          backdropFilter: 'blur(20px)',
          borderRight: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          flexDirection: 'column',
          paddingTop: 72,
        }}
      >
        {/* Nav links */}
        <nav style={{ flex: 1, padding: '16px 8px', overflowY: 'auto' }}>
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/discovery'}
              onClick={onClose}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '11px 16px',
                borderRadius: 8,
                textDecoration: 'none',
                fontSize: 15,
                fontWeight: isActive ? 500 : 400,
                color: isActive ? '#fff' : 'var(--text-muted)',
                background: isActive ? 'rgba(138,21,56,0.2)' : 'transparent',
                borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                marginBottom: 2,
                transition: 'color 0.15s, background 0.15s',
                justifyContent: 'space-between',
              })}
            >
              {item.label}
              {item.path === '/messages' && msgUnread > 0 && (
                <span style={{
                  minWidth: 18, height: 18, borderRadius: 9999,
                  background: 'var(--accent)', color: '#fff',
                  fontSize: 10, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 5px', lineHeight: 1,
                  animation: 'notifPop 0.25s ease',
                }}>
                  {msgUnread > 99 ? '99+' : msgUnread}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom */}
        <div style={{ padding: '12px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          {profile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Avatar → profile */}
              <div
                onClick={() => { navigate('/profile'); onClose?.() }}
                style={{ position: 'relative', flexShrink: 0, cursor: 'pointer' }}
              >
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', overflow: 'hidden' }}>
                  {profile.avatar_url
                    ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : profile.full_name?.[0]?.toUpperCase() ?? '?'
                  }
                </div>
                {/* Status dot on avatar */}
                <div style={{
                  position: 'absolute', bottom: 0, right: 0,
                  width: 10, height: 10, borderRadius: '50%',
                  background: STATUS_OPTIONS.find(s => s.value === myStatus)?.color ?? '#6b7280',
                  border: '2px solid rgba(18,18,18,0.95)',
                  transition: 'background 0.3s',
                }} />
              </div>

              {/* Name + pts */}
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {profile.full_name ?? 'Student'}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{profile.karak_points} pts</div>
              </div>

              {/* Status picker */}
              <div ref={statusRef} style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  onClick={() => setStatusOpen(o => !o)}
                  title="Set status"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: statusOpen ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.09)',
                    borderRadius: 8, padding: '4px 8px',
                    cursor: 'pointer', transition: 'background 0.15s',
                  }}
                >
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_OPTIONS.find(s => s.value === myStatus)?.color, flexShrink: 0, transition: 'background 0.3s' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                    {STATUS_OPTIONS.find(s => s.value === myStatus)?.label}
                  </span>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ color: 'var(--text-muted)', opacity: 0.5, flexShrink: 0 }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>

                {statusOpen && (
                  <div style={{
                    position: 'absolute', bottom: 'calc(100% + 8px)', right: 0,
                    background: 'rgba(22,12,16,0.98)', backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(87,65,68,0.35)', borderRadius: 12,
                    padding: '6px', minWidth: 140,
                    boxShadow: '0 -16px 40px rgba(0,0,0,0.5)',
                    animation: 'statusMenuIn 0.18s cubic-bezier(0.22,1,0.36,1) both',
                    zIndex: 999,
                  }}>
                    {STATUS_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => { setMyStatus(opt.value); setStatusOpen(false) }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 9,
                          width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none',
                          background: myStatus === opt.value ? 'rgba(255,255,255,0.07)' : 'transparent',
                          cursor: 'pointer', transition: 'background 0.12s', textAlign: 'left',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                        onMouseLeave={e => (e.currentTarget.style.background = myStatus === opt.value ? 'rgba(255,255,255,0.07)' : 'transparent')}
                      >
                        <div style={{ width: 9, height: 9, borderRadius: '50%', background: opt.color, flexShrink: 0, boxShadow: opt.value === 'online' ? `0 0 5px ${opt.color}90` : 'none' }} />
                        <span style={{ fontSize: 12.5, color: myStatus === opt.value ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: myStatus === opt.value ? 600 : 400 }}>
                          {opt.label}
                        </span>
                        {myStatus === opt.value && (
                          <svg style={{ marginLeft: 'auto', color: opt.color }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <style>{`
          @keyframes statusMenuIn {
            from { opacity:0; transform:translateY(8px) scale(0.96); }
            to   { opacity:1; transform:translateY(0) scale(1); }
          }
        `}</style>
      </aside>
    </>
  )
}
