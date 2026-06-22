import { useState, useEffect, useCallback, useRef } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { usePresence, type PresenceStatus } from '../../contexts/PresenceContext'
import { supabase } from '../../lib/supabase'
import UserQRModal from '../UserQRModal'

const STATUS_OPTIONS: { value: PresenceStatus; label: string; color: string }[] = [
  { value: 'online',  label: 'Online',  color: '#22c55e' },
  { value: 'away',    label: 'Away',    color: '#f59e0b' },
  { value: 'offline', label: 'Offline', color: '#6b7280' },
]

const NAV_ICONS: Record<string, React.ReactNode> = {
  '/home': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
      <polyline points="9 21 9 12 15 12 15 21"/>
    </svg>
  ),
  '/discovery': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ),
  '/events': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  '/positions': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/>
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
      <line x1="12" y1="12" x2="12" y2="16"/>
      <line x1="10" y1="14" x2="14" y2="14"/>
    </svg>
  ),
  '/leadership': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L8.5 8.5 2 9.27l5 4.87L5.82 21 12 17.77 18.18 21l-1.18-6.86L22 9.27l-6.5-.77L12 2z"/>
    </svg>
  ),
  '/collaboration': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  '/talent': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/>
      <path d="M6 20v-2a6 6 0 0 1 12 0v2"/>
      <polyline points="16 11 18 13 22 9"/>
    </svg>
  ),
  '/clubs': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  '/messages': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  '/tournaments': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
      <path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/>
    </svg>
  ),
  '/marketplace': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
      <line x1="3" y1="6" x2="21" y2="6"/>
      <path d="M16 10a4 4 0 0 1-8 0"/>
    </svg>
  ),
}

const NAV_PRIMARY = [
  { path: '/home',      label: 'Home'     },
  { path: '/discovery', label: 'Discover' },
  { path: '/events',    label: 'Events'   },
  { path: '/messages',  label: 'Messages' },
]

const NAV_SECONDARY = [
  { path: '/talent',        label: 'Skill Souq'       },
  { path: '/marketplace',   label: 'Campus Market'    },
  { path: '/collaboration', label: 'Co-Founder Match' },
  { path: '/tournaments',   label: 'Tournaments'      },
  { path: '/positions',     label: 'Open Positions'   },
]

interface Props {
  open?: boolean
  onClose?: () => void
}

export default function SideNav({ open = false, onClose }: Props) {
  const { profile, user } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { myStatus, setMyStatus } = usePresence()
  const [clubsOpen, setClubsOpen] = useState(
    pathname === '/clubs' || pathname === '/leadership'
  )
  const [msgUnread, setMsgUnread] = useState(0)
  const [msgRequests, setMsgRequests] = useState(0)
  const [statusOpen, setStatusOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
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

    // Group chat unread: messages from others after localStorage lastRead timestamp
    const { data: groupMems } = await supabase
      .from('group_chat_members')
      .select('group_id')
      .eq('user_id', user.id)
    const groupIds = (groupMems ?? []).map((m: { group_id: string }) => m.group_id)
    let groupCount = 0
    if (groupIds.length > 0) {
      const { data: groupMsgs } = await supabase
        .from('group_messages')
        .select('group_id, sender_id, created_at')
        .in('group_id', groupIds)
        .neq('sender_id', user.id)
      for (const msg of groupMsgs ?? []) {
        const lastRead = localStorage.getItem(`lastRead_group-${msg.group_id}`) ?? '1970-01-01'
        if (msg.created_at > lastRead) groupCount++
      }
    }

    // Pending DM requests sent to me
    const { count: requestCount } = await supabase
      .from('message_requests')
      .select('*', { count: 'exact', head: true })
      .eq('to_user_id', user.id)
      .eq('status', 'pending')

    setMsgRequests(requestCount ?? 0)
    setMsgUnread(dmCount + tradeCount + groupCount)
  }, [user])

  useEffect(() => {
    if (!user) return
    fetchUnread()
    const interval = setInterval(fetchUnread, 15000)
    return () => { clearInterval(interval) }
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
          {/* ── Primary ── */}
          {NAV_PRIMARY.map(item => (
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
                fontWeight: isActive ? 600 : 400,
                color: isActive ? '#fff' : 'var(--text-muted)',
                background: isActive ? 'rgba(138,21,56,0.2)' : 'transparent',
                borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                marginBottom: 2,
                transition: 'color 0.15s, background 0.15s',
                justifyContent: 'space-between',
              })}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ opacity: 0.75, display: 'flex', flexShrink: 0 }}>
                  {NAV_ICONS[item.path]}
                </span>
                {item.label}
              </span>
              {item.path === '/messages' && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {msgRequests > 0 && (
                    <span style={{
                      minWidth: 18, height: 18, borderRadius: 9999,
                      background: '#22c55e', color: '#fff',
                      fontSize: 10, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0 5px', lineHeight: 1,
                      animation: 'notifPop 0.25s ease',
                    }}>
                      {msgRequests > 99 ? '99+' : msgRequests}
                    </span>
                  )}
                  {msgUnread > 0 && profile?.notification_prefs?.direct_messages !== false && (
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
                </span>
              )}
            </NavLink>
          ))}

          {/* ── Clubs accordion ── */}
          <div style={{ marginBottom: 2 }}>
            <button
              onClick={() => setClubsOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 16px', borderRadius: 8, width: '100%',
                background: (pathname === '/clubs' || pathname === '/leadership') ? 'rgba(138,21,56,0.2)' : 'transparent',
                borderLeft: (pathname === '/clubs' || pathname === '/leadership') ? '3px solid var(--accent)' : '3px solid transparent',
                color: (pathname === '/clubs' || pathname === '/leadership') ? '#fff' : 'var(--text-muted)',
                fontSize: 15, fontWeight: (pathname === '/clubs' || pathname === '/leadership') ? 600 : 400,
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                transition: 'color 0.15s, background 0.15s',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ opacity: 0.75, display: 'flex', flexShrink: 0 }}>
                  {NAV_ICONS['/clubs']}
                </span>
                Clubs
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                style={{ transform: clubsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0, opacity: 0.4 }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {clubsOpen && (
              <div style={{ marginLeft: 14, borderLeft: '1px solid rgba(255,255,255,0.07)', paddingLeft: 6, marginBottom: 4 }}>
                <NavLink to="/clubs" onClick={onClose} style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '8px 14px', borderRadius: 7, textDecoration: 'none',
                  fontSize: 13.5, fontWeight: isActive ? 500 : 400,
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.42)',
                  background: isActive ? 'rgba(138,21,56,0.16)' : 'transparent',
                  marginBottom: 1, transition: 'color 0.15s, background 0.15s',
                })}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.55, flexShrink: 0 }}>
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  My Clubs
                </NavLink>
                <NavLink to="/leadership" onClick={onClose} style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '8px 14px', borderRadius: 7, textDecoration: 'none',
                  fontSize: 13.5, fontWeight: isActive ? 500 : 400,
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.42)',
                  background: isActive ? 'rgba(138,21,56,0.16)' : 'transparent',
                  marginBottom: 1, transition: 'color 0.15s, background 0.15s',
                })}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.55, flexShrink: 0 }}>
                    <path d="M12 2L8.5 8.5 2 9.27l5 4.87L5.82 21 12 17.77 18.18 21l-1.18-6.86L22 9.27l-6.5-.77L12 2z"/>
                  </svg>
                  Manage Clubs
                </NavLink>
              </div>
            )}
          </div>

          {/* ── Divider ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 8px 10px' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>More</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
          </div>

          {/* ── Secondary ── */}
          {NAV_SECONDARY.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 16px',
                borderRadius: 8,
                textDecoration: 'none',
                fontSize: 13.5,
                fontWeight: isActive ? 500 : 400,
                color: isActive ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.32)',
                background: isActive ? 'rgba(138,21,56,0.15)' : 'transparent',
                borderLeft: isActive ? '3px solid rgba(138,21,56,0.6)' : '3px solid transparent',
                marginBottom: 1,
                transition: 'color 0.15s, background 0.15s',
              })}
            >
              <span style={{ opacity: 0.55, display: 'flex', flexShrink: 0 }}>
                {NAV_ICONS[item.path]}
              </span>
              {item.label}
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
              <div
                onClick={() => { navigate('/profile'); onClose?.() }}
                style={{ flex: 1, minWidth: 0, overflow: 'hidden', cursor: 'pointer' }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {profile.full_name ?? 'Student'}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{profile.karak_points} pts</div>
              </div>

              {/* QR code button */}
              <button
                onClick={() => setQrOpen(true)}
                title="My QR Code"
                style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'var(--text-muted)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
                  <rect x="14" y="14" width="3" height="3" rx="0.5"/><rect x="18" y="14" width="3" height="3" rx="0.5"/><rect x="14" y="18" width="3" height="3" rx="0.5"/><rect x="18" y="18" width="3" height="3" rx="0.5"/>
                </svg>
              </button>

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

      {qrOpen && <UserQRModal onClose={() => setQrOpen(false)} />}
    </>
  )
}
