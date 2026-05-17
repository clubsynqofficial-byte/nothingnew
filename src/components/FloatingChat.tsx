import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConvRow {
  id: string
  participant_1: string
  participant_2: string
  last_message_at: string
  otherProfile: { id: string; full_name: string | null; avatar_url: string | null }
  lastMsg: string | null
  unread: number
}

interface MsgRow {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  read_at: string | null
  created_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function reltime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function initials(name: string | null) {
  return (name ?? '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function Av({ url, name, size = 36 }: { url?: string | null; name?: string | null; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg,#8a1538,#c0185c)',
      overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 800, color: '#fff',
      boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
    }}>
      {url
        ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initials(name ?? null)
      }
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FloatingChat() {
  const { user, profile } = useAuth()
  const [open, setOpen]               = useState(false)
  const [convs, setConvs]             = useState<ConvRow[]>([])
  const [loadingConvs, setLoadingConvs] = useState(false)
  const [activeConv, setActiveConv]   = useState<ConvRow | null>(null)
  const [msgs, setMsgs]               = useState<MsgRow[]>([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [draft, setDraft]             = useState('')
  const [sending, setSending]         = useState(false)
  const [totalUnread, setTotalUnread] = useState(0)
  const msgsEndRef = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLTextAreaElement>(null)

  // ── Fetch conversations ───────────────────────────────────────────────────

  const fetchConvs = useCallback(async () => {
    if (!user) return
    setLoadingConvs(true)
    const { data: rawConvs } = await supabase
      .from('conversations')
      .select('id, participant_1, participant_2, last_message_at')
      .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
      .order('last_message_at', { ascending: false })
      .limit(30)

    if (!rawConvs?.length) { setConvs([]); setLoadingConvs(false); return }

    const otherIds = rawConvs.map(c => c.participant_1 === user.id ? c.participant_2 : c.participant_1)
    const convIds  = rawConvs.map(c => c.id)

    const [{ data: profiles }, { data: lastMsgs }, { data: unreadMsgs }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, avatar_url').in('id', otherIds),
      supabase.from('direct_messages').select('conversation_id, content, created_at')
        .in('conversation_id', convIds).order('created_at', { ascending: false }),
      supabase.from('direct_messages').select('conversation_id')
        .in('conversation_id', convIds).neq('sender_id', user.id).is('read_at', null),
    ])

    const profileMap: Record<string, { id: string; full_name: string | null; avatar_url: string | null }> = {}
    for (const p of profiles ?? []) profileMap[p.id] = p

    const lastMsgMap: Record<string, string> = {}
    for (const m of lastMsgs ?? []) { if (!lastMsgMap[m.conversation_id]) lastMsgMap[m.conversation_id] = m.content }

    const unreadMap: Record<string, number> = {}
    for (const m of unreadMsgs ?? []) { unreadMap[m.conversation_id] = (unreadMap[m.conversation_id] ?? 0) + 1 }

    const result: ConvRow[] = rawConvs.map(c => {
      const otherId = c.participant_1 === user.id ? c.participant_2 : c.participant_1
      return {
        id: c.id,
        participant_1: c.participant_1,
        participant_2: c.participant_2,
        last_message_at: c.last_message_at,
        otherProfile: profileMap[otherId] ?? { id: otherId, full_name: null, avatar_url: null },
        lastMsg: lastMsgMap[c.id] ?? null,
        unread: unreadMap[c.id] ?? 0,
      }
    })

    setConvs(result)
    setTotalUnread(result.reduce((s, c) => s + c.unread, 0))
    setLoadingConvs(false)
  }, [user])

  useEffect(() => { fetchConvs() }, [fetchConvs])

  // ── Realtime: new / updated messages refresh badge ───────────────────────

  useEffect(() => {
    if (!user) return
    const ch = supabase.channel(`fc-badge-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, () => fetchConvs())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_messages' }, () => fetchConvs())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user, fetchConvs])

  // ── Open a conversation ───────────────────────────────────────────────────

  async function openConv(conv: ConvRow) {
    setActiveConv(conv)
    setLoadingMsgs(true)
    const { data } = await supabase
      .from('direct_messages')
      .select('*')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true })
    setMsgs((data as MsgRow[]) ?? [])
    setLoadingMsgs(false)

    await supabase.from('direct_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', conv.id)
      .neq('sender_id', user!.id)
      .is('read_at', null)

    setConvs(prev => prev.map(c => c.id === conv.id ? { ...c, unread: 0 } : c))
    setTotalUnread(prev => Math.max(0, prev - conv.unread))
  }

  // ── Realtime: in-conversation messages ───────────────────────────────────

  useEffect(() => {
    if (!activeConv) return
    const ch = supabase.channel(`fc-msgs-${activeConv.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages',
        filter: `conversation_id=eq.${activeConv.id}` },
        payload => {
          const msg = payload.new as MsgRow
          setMsgs(prev => [...prev, msg])
          if (msg.sender_id !== user?.id) {
            supabase.from('direct_messages').update({ read_at: new Date().toISOString() }).eq('id', msg.id)
          }
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [activeConv?.id, user?.id])

  // ── Auto-scroll & focus ───────────────────────────────────────────────────

  useEffect(() => { msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])
  useEffect(() => { if (activeConv) setTimeout(() => inputRef.current?.focus(), 80) }, [activeConv])

  // ── Send message ──────────────────────────────────────────────────────────

  async function sendMsg() {
    if (!user || !activeConv || !draft.trim() || sending) return
    const content = draft.trim()
    setDraft('')
    setSending(true)

    const optimistic: MsgRow = {
      id: `tmp-${Date.now()}`,
      conversation_id: activeConv.id,
      sender_id: user.id,
      content,
      read_at: null,
      created_at: new Date().toISOString(),
    }
    setMsgs(prev => [...prev, optimistic])

    const { data: newMsg } = await supabase.from('direct_messages').insert({
      conversation_id: activeConv.id,
      sender_id: user.id,
      content,
    }).select('*').single()

    if (newMsg) setMsgs(prev => prev.map(m => m.id === optimistic.id ? (newMsg as MsgRow) : m))

    await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', activeConv.id)
    fetchConvs()
    setSending(false)
  }

  if (!user) return null

  const canSend = draft.trim().length > 0 && !sending

  return createPortal(
    <>
      <style>{`
        @keyframes fc-pop    { from{opacity:0;transform:scale(0.88) translateY(18px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes fc-slide  { from{opacity:0;transform:translateX(16px)} to{opacity:1;transform:translateX(0)} }
        @keyframes fc-msg    { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fc-pulse  { 0%,100%{box-shadow:0 4px 24px rgba(138,21,56,0.45)} 50%{box-shadow:0 4px 36px rgba(192,24,92,0.7)} }
        @keyframes fc-spin   { to{transform:rotate(360deg)} }
        @keyframes fc-row-in { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }

        .fc-panel  { animation: fc-pop   0.26s cubic-bezier(0.22,1,0.36,1) both; }
        .fc-chat   { animation: fc-slide 0.22s cubic-bezier(0.22,1,0.36,1) both; }
        .fc-msg    { animation: fc-msg   0.18s ease both; }

        .fc-fab { animation: fc-pulse 2.8s ease-in-out infinite; transition: transform 0.18s, box-shadow 0.18s; }
        .fc-fab:hover { transform: translateY(-3px) !important; }

        .fc-row { transition: background 0.14s; cursor: pointer; }
        .fc-row:hover { background: rgba(255,255,255,0.06) !important; }

        .fc-scroll::-webkit-scrollbar { width: 3px; }
        .fc-scroll::-webkit-scrollbar-track { background: transparent; }
        .fc-scroll::-webkit-scrollbar-thumb { background: rgba(138,21,56,0.35); border-radius: 99px; }

        .fc-send { transition: background 0.15s, transform 0.12s, box-shadow 0.15s; }
        .fc-send:hover:not(:disabled) { transform: scale(1.1); }

        .fc-input:focus { border-color: rgba(192,24,92,0.6) !important; box-shadow: 0 0 0 3px rgba(138,21,56,0.12) !important; }

        .fc-back { transition: background 0.13s, color 0.13s; }
        .fc-back:hover { background: rgba(255,255,255,0.08) !important; color: #fff !important; }

        .fc-close { transition: background 0.13s, color 0.13s; }
        .fc-close:hover { background: rgba(255,255,255,0.08) !important; color: #fff !important; }

        .fc-row-item { animation: fc-row-in 0.22s ease both; }
      `}</style>

      {/* ── FAB ────────────────────────────────────────────────────────────── */}
      <button
        className="fc-fab"
        onClick={() => { setOpen(o => !o); if (!open) { setActiveConv(null); fetchConvs() } }}
        style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 9000,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '11px 20px 11px 16px',
          background: 'linear-gradient(135deg,#8a1538 0%,#c0185c 100%)',
          border: '1.5px solid rgba(255,255,255,0.12)',
          borderRadius: 9999, color: '#fff', fontSize: 14, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
          boxShadow: '0 4px 24px rgba(138,21,56,0.45)',
          letterSpacing: '-0.1px',
        }}
      >
        {/* chat icon */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span>Messages</span>
        {totalUnread > 0 && profile?.notification_prefs?.direct_messages !== false && (
          <span style={{
            minWidth: 20, height: 20, borderRadius: 9999,
            background: '#fff', color: '#8a1538',
            fontSize: 10, fontWeight: 900,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 5px', lineHeight: 1, marginLeft: 2,
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          }}>
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {/* ── Panel ──────────────────────────────────────────────────────────── */}
      {open && (
        <div
          className="fc-panel"
          style={{
            position: 'fixed', bottom: 84, right: 28, zIndex: 8999,
            width: 370, height: 520,
            background: '#0e0810',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 22,
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 32px 72px rgba(0,0,0,0.75), 0 0 0 1px rgba(138,21,56,0.18), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          {/* gradient accent strip */}
          <div style={{
            height: 3, flexShrink: 0,
            background: 'linear-gradient(90deg,#8a1538,#c0185c,#ff6b9d,#c0185c,#8a1538)',
            backgroundSize: '200% 100%',
          }} />

          {/* ── Header ── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
            background: 'rgba(255,255,255,0.02)',
          }}>
            {activeConv ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                <button
                  className="fc-back"
                  onClick={() => setActiveConv(null)}
                  style={{
                    background: 'rgba(255,255,255,0.05)', border: 'none', cursor: 'pointer',
                    color: 'rgba(255,255,255,0.55)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12"/>
                    <polyline points="12 19 5 12 12 5"/>
                  </svg>
                </button>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <Av url={activeConv.otherProfile.avatar_url} name={activeConv.otherProfile.full_name} size={34} />
                  <div style={{
                    position: 'absolute', bottom: 0, right: 0,
                    width: 9, height: 9, borderRadius: '50%',
                    background: '#22c55e',
                    border: '1.5px solid #0e0810',
                  }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.2, letterSpacing: '-0.1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {activeConv.otherProfile.full_name ?? 'User'}
                  </div>
                  <div style={{ fontSize: 10.5, color: '#22c55e', fontWeight: 600, marginTop: 1 }}>Online</div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  background: 'linear-gradient(135deg,#8a1538,#c0185c)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>Messages</div>
                  {totalUnread > 0 && (
                    <div style={{ fontSize: 10.5, color: 'rgba(192,24,92,0.9)', fontWeight: 600 }}>
                      {totalUnread} unread
                    </div>
                  )}
                </div>
              </div>
            )}

            <button
              className="fc-close"
              onClick={() => setOpen(false)}
              style={{
                background: 'rgba(255,255,255,0.05)', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, borderRadius: 9, flexShrink: 0,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* ── Body ── */}
          {activeConv ? (
            /* Chat view */
            <div className="fc-chat" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Messages */}
              <div
                className="fc-scroll"
                style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}
              >
                {loadingMsgs ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, flexDirection: 'column', gap: 10 }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', border: '2.5px solid rgba(138,21,56,0.18)', borderTopColor: '#c0185c', animation: 'fc-spin 0.8s linear infinite' }} />
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Loading messages…</div>
                  </div>
                ) : msgs.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12 }}>
                    <div style={{
                      width: 54, height: 54, borderRadius: '50%',
                      background: 'rgba(138,21,56,0.12)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(192,24,92,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                      </svg>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.35)', textAlign: 'center', lineHeight: 1.55 }}>
                      No messages yet.<br/>Start the conversation!
                    </div>
                  </div>
                ) : (
                  msgs.map((m, i) => {
                    const isMine = m.sender_id === user.id
                    const prevMsg = msgs[i - 1]
                    const nextMsg = msgs[i + 1]
                    const sameAsPrev = prevMsg?.sender_id === m.sender_id
                    const sameAsNext = nextMsg?.sender_id === m.sender_id
                    // spacing: larger gap when sender changes
                    const marginTop = sameAsPrev ? 2 : (i === 0 ? 0 : 10)

                    return (
                      <div
                        key={m.id}
                        className="fc-msg"
                        style={{
                          display: 'flex',
                          justifyContent: isMine ? 'flex-end' : 'flex-start',
                          marginTop,
                          animationDelay: `${Math.min(i * 0.03, 0.2)}s`,
                        }}
                      >
                        {/* received: avatar placeholder for alignment */}
                        {!isMine && (
                          <div style={{ width: 26, flexShrink: 0, alignSelf: 'flex-end', marginRight: 6 }}>
                            {!sameAsNext && (
                              <Av
                                url={activeConv.otherProfile.avatar_url}
                                name={activeConv.otherProfile.full_name}
                                size={26}
                              />
                            )}
                          </div>
                        )}
                        <div style={{
                          maxWidth: '72%',
                          padding: '8px 12px',
                          borderRadius: isMine
                            ? (sameAsPrev ? '16px 6px 6px 16px' : '18px 18px 6px 18px')
                            : (sameAsPrev ? '6px 16px 16px 6px' : '18px 18px 18px 6px'),
                          ...(sameAsNext && { borderBottomRightRadius: isMine ? 6 : undefined, borderBottomLeftRadius: !isMine ? 6 : undefined }),
                          background: isMine
                            ? 'linear-gradient(135deg,#8a1538 0%,#c0185c 100%)'
                            : 'rgba(255,255,255,0.07)',
                          border: isMine ? 'none' : '1px solid rgba(255,255,255,0.08)',
                          color: '#fff',
                          fontSize: 13, lineHeight: 1.5,
                          wordBreak: 'break-word',
                          boxShadow: isMine
                            ? '0 2px 12px rgba(138,21,56,0.35)'
                            : '0 1px 4px rgba(0,0,0,0.2)',
                        }}>
                          {m.content}
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={msgsEndRef} />
              </div>

              {/* Input bar */}
              <div style={{
                padding: '10px 12px 12px',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.02)',
                display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0,
              }}>
                <textarea
                  ref={inputRef}
                  className="fc-input"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg() } }}
                  placeholder="Type a message…"
                  rows={1}
                  style={{
                    flex: 1,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1.5px solid rgba(255,255,255,0.09)',
                    borderRadius: 14, padding: '9px 13px',
                    color: '#fff', fontSize: 13, outline: 'none',
                    fontFamily: 'inherit', resize: 'none', lineHeight: 1.5,
                    maxHeight: 96, overflowY: 'auto',
                    transition: 'border-color .15s, box-shadow .15s',
                    caretColor: '#c0185c',
                  }}
                />
                <button
                  className="fc-send"
                  onClick={sendMsg}
                  disabled={!canSend}
                  style={{
                    width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                    background: canSend
                      ? 'linear-gradient(135deg,#8a1538,#c0185c)'
                      : 'rgba(255,255,255,0.06)',
                    border: canSend ? 'none' : '1px solid rgba(255,255,255,0.07)',
                    cursor: canSend ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: canSend ? '#fff' : 'rgba(255,255,255,0.25)',
                    boxShadow: canSend ? '0 2px 12px rgba(138,21,56,0.4)' : 'none',
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
            </div>
          ) : (
            /* Conversation list */
            <div className="fc-scroll" style={{ flex: 1, overflowY: 'auto' }}>
              {loadingConvs ? (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px' }}>
                      <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', flexShrink: 0 }} />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
                        <div style={{ width: '48%', height: 11, borderRadius: 6, background: 'rgba(255,255,255,0.05)' }} />
                        <div style={{ width: '72%', height: 9, borderRadius: 5, background: 'rgba(255,255,255,0.03)' }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : convs.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '32px 24px', textAlign: 'center', gap: 14 }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: '50%',
                    background: 'rgba(138,21,56,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(192,24,92,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: 5 }}>No conversations yet</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6 }}>
                      Connect with people across<br/>your clubs to start messaging.
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ paddingTop: 4 }}>
                  {convs.map((conv, i) => (
                    <div
                      key={conv.id}
                      className="fc-row fc-row-item"
                      onClick={() => openConv(conv)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '11px 14px 11px 12px',
                        background: conv.unread > 0 ? 'rgba(138,21,56,0.08)' : 'transparent',
                        borderLeft: `3px solid ${conv.unread > 0 ? '#c0185c' : 'transparent'}`,
                        borderBottom: i < convs.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                        animationDelay: `${i * 0.04}s`,
                      }}
                    >
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <Av url={conv.otherProfile.avatar_url} name={conv.otherProfile.full_name} size={42} />
                        {conv.unread > 0 && (
                          <div style={{
                            position: 'absolute', bottom: 0, right: 0,
                            width: 11, height: 11, borderRadius: '50%',
                            background: '#c0185c',
                            border: '2px solid #0e0810',
                          }} />
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                          <div style={{
                            fontSize: 13, fontWeight: conv.unread > 0 ? 700 : 500,
                            color: conv.unread > 0 ? '#fff' : 'rgba(255,255,255,0.8)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            maxWidth: 175, letterSpacing: '-0.1px',
                          }}>
                            {conv.otherProfile.full_name ?? 'User'}
                          </div>
                          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.3)', flexShrink: 0, marginLeft: 6 }}>
                            {reltime(conv.last_message_at)}
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                          <div style={{
                            fontSize: 12,
                            color: conv.unread > 0 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.28)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            fontWeight: conv.unread > 0 ? 500 : 400,
                          }}>
                            {conv.lastMsg ?? 'No messages yet'}
                          </div>
                          {conv.unread > 0 && (
                            <span style={{
                              minWidth: 18, height: 18, borderRadius: 9999,
                              background: 'linear-gradient(135deg,#8a1538,#c0185c)',
                              color: '#fff', fontSize: 9.5, fontWeight: 800,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              padding: '0 5px', flexShrink: 0,
                              boxShadow: '0 1px 6px rgba(138,21,56,0.4)',
                            }}>
                              {conv.unread > 99 ? '99+' : conv.unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>,
    document.body
  )
}
