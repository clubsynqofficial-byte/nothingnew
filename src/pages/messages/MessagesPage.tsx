import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { usePresence, type PresenceStatus } from '../../contexts/PresenceContext'
import { filterText } from '../../lib/contentFilter'

// ── Types ──────────────────────────────────────────────────────────────────

type MsgTab = 'collabs' | 'trades' | 'leaders'

interface Profile { id: string; full_name: string | null; avatar_url: string | null; last_seen_at?: string | null }

interface CollabThread {
  convId: string | null; matchUserId: string; matchProfile: Profile
  projectTitle: string | null; lastMsg: string | null; unread: number; lastAt: string
}

interface TradeThread {
  requestId: string; listingTitle: string; skillOffered: string; skillWanted: string
  otherUserId: string; otherProfile: Profile; status: 'accepted' | 'completed'
  lastMsg: string | null; unread: number; lastAt: string; iAmOwner: boolean
}

interface ClubLeader {
  userId: string; clubId: string; clubName: string; role: string; customRole: string | null
  profile: Profile; convId: string | null; lastMsg: string | null; lastAt: string | null; unread: number
}

interface GroupChat {
  id: string; name: string; createdBy: string
  lastMsg: string | null; lastAt: string; unread: number; memberProfiles: Profile[]
}

interface DM {
  id: string; conversation_id: string; sender_id: string
  content: string; read_at: string | null; created_at: string
}

interface TradeDM {
  id: string; request_id: string; sender_id: string
  content: string; created_at: string
  profile?: { full_name: string | null } | null
}

interface GroupMessage {
  id: string; group_id: string; sender_id: string; content: string; created_at: string
  profile?: { full_name: string | null; avatar_url: string | null } | null
}

// ── Helpers ────────────────────────────────────────────────────────────────

function reltime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtDate(iso: string) {
  const d = new Date(iso), now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Today'
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}

function getLastRead(id: string) { return localStorage.getItem(`lastRead_${id}`) ?? '1970-01-01' }
function markLastRead(id: string) { localStorage.setItem(`lastRead_${id}`, new Date().toISOString()) }

// ── Avatar ────────────────────────────────────────────────────────────────

function Av({ url, name, size = 40 }: { url?: string | null; name?: string | null; size?: number }) {
  const initials = (name ?? '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, var(--accent) 0%, #c42057 100%)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 800, color: '#fff', boxShadow: '0 2px 8px rgba(138,21,56,0.35)' }}>
      {url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
    </div>
  )
}

function GroupAv({ members, size = 40 }: { members: Profile[]; size?: number }) {
  const shown = members.slice(0, 3)
  if (shown.length === 0) return <Av name="?" size={size} />
  if (shown.length === 1) return <Av url={shown[0].avatar_url} name={shown[0].full_name} size={size} />
  return (
    <div style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
      {shown.slice(0, 2).map((m, i) => {
        const half = size * 0.62
        return (
          <div key={m.id} style={{ position: 'absolute', width: half, height: half, borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(14,8,11,0.9)', background: 'linear-gradient(135deg, var(--accent) 0%, #c42057 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: half * 0.38, fontWeight: 800, color: '#fff', top: i === 0 ? 0 : 'auto', bottom: i === 1 ? 0 : 'auto', left: i === 0 ? 0 : 'auto', right: i === 1 ? 0 : 'auto' }}>
            {m.avatar_url ? <img src={m.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (m.full_name?.[0] ?? '?').toUpperCase()}
          </div>
        )
      })}
    </div>
  )
}

// ── Presence ─────────────────────────────────────────────────────────────

function getStatus(userId: string, connectedSet: Set<string>, statusMap: Record<string, PresenceStatus>, lastSeenAt?: string | null): PresenceStatus {
  if (connectedSet.has(userId)) return statusMap[userId] ?? 'online'
  if (!lastSeenAt) return 'offline'
  return (Date.now() - new Date(lastSeenAt).getTime()) / 60000 < 10 ? 'away' : 'offline'
}

const STATUS_COLOR: Record<PresenceStatus, string> = { online: '#22c55e', away: '#f59e0b', offline: '#6b7280' }
const STATUS_LABEL: Record<PresenceStatus, string> = { online: 'Online', away: 'Away', offline: 'Offline' }

function StatusDot({ userId, lastSeenAt, connectedSet, statusMap, size = 11 }: { userId: string; lastSeenAt?: string | null; connectedSet: Set<string>; statusMap: Record<string, PresenceStatus>; size?: number }) {
  const status = getStatus(userId, connectedSet, statusMap, lastSeenAt)
  return <div title={STATUS_LABEL[status]} style={{ width: size, height: size, borderRadius: '50%', background: STATUS_COLOR[status], border: '2px solid rgba(14,8,11,0.95)', boxShadow: status === 'online' ? `0 0 6px ${STATUS_COLOR.online}99` : 'none', flexShrink: 0, transition: 'background 0.4s' }} />
}

// ── CSS ───────────────────────────────────────────────────────────────────

const CSS = `
@keyframes mp-up      { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
@keyframes mp-pop     { from { opacity:0; transform:scale(0.94) translateY(6px); } to { opacity:1; transform:scale(1) translateY(0); } }
@keyframes mp-msg-in  { from { opacity:0; transform:translateY(10px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
@keyframes mp-shimmer { from{background-position:-600px 0} to{background-position:600px 0} }
@keyframes mp-float   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }

.mp-shimmer { background:linear-gradient(90deg,rgba(41,28,30,.55) 25%,rgba(72,46,54,.8) 50%,rgba(41,28,30,.55) 75%); background-size:600px 100%; animation:mp-shimmer 1.4s ease-in-out infinite; border-radius:8px; }
.mp-panel   { animation: mp-pop 0.28s cubic-bezier(0.22,1,0.36,1) both; }
.mp-enter   { animation: mp-up 0.45s cubic-bezier(0.22,1,0.36,1) both; }

.thread-row { transition: background 0.16s, border-color 0.16s; cursor: pointer; border-left: 3px solid transparent; animation: mp-up 0.35s cubic-bezier(0.22,1,0.36,1) both; }
.thread-row:hover { background: rgba(255,255,255,0.04) !important; }
.thread-row.active { background: rgba(138,21,56,0.12) !important; border-left-color: var(--accent) !important; }

.mp-tab { transition: color 0.15s, background 0.15s, box-shadow 0.15s; cursor: pointer; font-family: inherit; }
.mp-tab.active { background: rgba(138,21,56,0.2) !important; color: #fff !important; box-shadow: inset 0 0 0 1px rgba(138,21,56,0.35); }

.msg-bubble { transition: opacity 0.15s; }
.send-btn { transition: transform 0.15s, background 0.15s, box-shadow 0.15s; }
.send-btn:hover:not(:disabled) { transform: scale(1.07); box-shadow: 0 4px 16px rgba(138,21,56,0.45); }
.send-btn:active:not(:disabled) { transform: scale(0.95); }

.mp-input textarea { transition: border-color 0.18s, background 0.18s; }
.mp-input textarea:focus { border-color: rgba(138,21,56,0.55) !important; background: rgba(255,255,255,0.08) !important; }

.mp-scroll::-webkit-scrollbar { width: 4px; }
.mp-scroll::-webkit-scrollbar-track { background: transparent; }
.mp-scroll::-webkit-scrollbar-thumb { background: rgba(138,21,56,0.25); border-radius: 4px; }
.mp-scroll::-webkit-scrollbar-thumb:hover { background: rgba(138,21,56,0.4); }

@media (min-width: 769px) { .left-panel { display: flex !important; } .right-panel { display: flex !important; } .mobile-back-btn { display: none !important; } }
@media (max-width: 768px) { .mobile-back-btn { display: flex !important; } }
`

// ── Page ──────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { connectedSet, statusMap } = usePresence()

  const [tab, setTab] = useState<MsgTab>('collabs')

  // Collab state
  const [collabThreads, setCollabThreads] = useState<CollabThread[]>([])
  const [loadingCollabs, setLoadingCollabs] = useState(true)
  const [activeCollab, setActiveCollab] = useState<CollabThread | null>(null)
  const [collabMsgs, setCollabMsgs] = useState<DM[]>([])
  const [loadingCollabMsgs, setLoadingCollabMsgs] = useState(false)

  // Trade state
  const [tradeThreads, setTradeThreads] = useState<TradeThread[]>([])
  const [loadingTrades, setLoadingTrades] = useState(true)
  const [activeTrade, setActiveTrade] = useState<TradeThread | null>(null)
  const [tradeMsgs, setTradeMsgs] = useState<TradeDM[]>([])
  const [loadingTradeMsgs, setLoadingTradeMsgs] = useState(false)

  // Leaders + group state
  const [clubLeaders, setClubLeaders] = useState<ClubLeader[]>([])
  const [loadingLeaders, setLoadingLeaders] = useState(true)
  const [groupChats, setGroupChats] = useState<GroupChat[]>([])
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [activeLeader, setActiveLeader] = useState<ClubLeader | null>(null)
  const [leaderMsgs, setLeaderMsgs] = useState<DM[]>([])
  const [loadingLeaderMsgs, setLoadingLeaderMsgs] = useState(false)
  const [activeGroup, setActiveGroup] = useState<GroupChat | null>(null)
  const [groupMsgs, setGroupMsgs] = useState<GroupMessage[]>([])
  const [loadingGroupMsgs, setLoadingGroupMsgs] = useState(false)

  // New group creation
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set())
  const [savingGroup, setSavingGroup] = useState(false)

  // Shared
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sendErr, setSendErr] = useState('')
  const [search, setSearch] = useState('')
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list')

  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLTextAreaElement>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // ── Presence refresh ──
  useEffect(() => {
    const id = setInterval(async () => {
      const ids = [...collabThreads.map(t => t.matchUserId), ...tradeThreads.map(t => t.otherUserId), ...clubLeaders.map(l => l.userId)]
      if (!ids.length) return
      const { data } = await supabase.from('profiles').select('id, last_seen_at').in('id', ids)
      if (!data) return
      const map: Record<string, string | null> = {}
      for (const p of data) map[p.id] = p.last_seen_at
      setCollabThreads(prev => prev.map(t => ({ ...t, matchProfile: { ...t.matchProfile, last_seen_at: map[t.matchUserId] ?? t.matchProfile.last_seen_at } })))
      setTradeThreads(prev => prev.map(t => ({ ...t, otherProfile: { ...t.otherProfile, last_seen_at: map[t.otherUserId] ?? t.otherProfile.last_seen_at } })))
      setClubLeaders(prev => prev.map(l => ({ ...l, profile: { ...l.profile, last_seen_at: map[l.userId] ?? l.profile.last_seen_at } })))
    }, 30_000)
    return () => clearInterval(id)
  }, [collabThreads, tradeThreads, clubLeaders])

  // ── Collab fetch ──
  const fetchCollabs = useCallback(async () => {
    if (!user) return
    setLoadingCollabs(true)
    const { data: swipes } = await supabase.from('founder_swipes').select('swiped_id').eq('swiper_id', user.id).eq('direction', 'right')
    const swipedIds = (swipes ?? []).map(s => s.swiped_id as string)
    if (!swipedIds.length) { setCollabThreads([]); setLoadingCollabs(false); return }
    const { data: mutual } = await supabase.from('founder_swipes').select('swiper_id').in('swiper_id', swipedIds).eq('swiped_id', user.id).eq('direction', 'right')
    const matchIds = (mutual ?? []).map(m => m.swiper_id as string)
    if (!matchIds.length) { setCollabThreads([]); setLoadingCollabs(false); return }
    const [{ data: profiles }, { data: founderCards }, { data: convs }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, avatar_url, last_seen_at').in('id', matchIds),
      supabase.from('founder_profiles').select('user_id, project_title').in('user_id', matchIds),
      supabase.from('conversations').select('id, participant_1, participant_2, last_message_at').or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`).order('last_message_at', { ascending: false }),
    ])
    const profileMap: Record<string, Profile> = {}
    for (const p of profiles ?? []) profileMap[p.id] = p as Profile
    const founderMap: Record<string, string | null> = {}
    for (const f of founderCards ?? []) founderMap[f.user_id] = f.project_title
    const convMap: Record<string, { id: string; last_message_at: string }> = {}
    for (const c of convs ?? []) {
      const other = c.participant_1 === user.id ? c.participant_2 : c.participant_1
      if (matchIds.includes(other)) convMap[other] = { id: c.id, last_message_at: c.last_message_at }
    }
    const convIds = Object.values(convMap).map(c => c.id)
    const [{ data: lastMsgs }, { data: unreadMsgs }] = convIds.length > 0 ? await Promise.all([
      supabase.from('direct_messages').select('conversation_id, content, created_at').in('conversation_id', convIds).order('created_at', { ascending: false }),
      supabase.from('direct_messages').select('conversation_id').in('conversation_id', convIds).neq('sender_id', user.id).is('read_at', null),
    ]) : [{ data: [] }, { data: [] }]
    const lastMsgMap: Record<string, string> = {}
    for (const m of lastMsgs ?? []) { if (!lastMsgMap[m.conversation_id]) lastMsgMap[m.conversation_id] = m.content }
    const unreadMap: Record<string, number> = {}
    for (const m of unreadMsgs ?? []) { unreadMap[m.conversation_id] = (unreadMap[m.conversation_id] ?? 0) + 1 }
    setCollabThreads(matchIds.map(id => {
      const conv = convMap[id]
      return { convId: conv?.id ?? null, matchUserId: id, matchProfile: profileMap[id] ?? { id, full_name: null, avatar_url: null }, projectTitle: founderMap[id] ?? null, lastMsg: conv ? (lastMsgMap[conv.id] ?? null) : null, unread: conv ? (unreadMap[conv.id] ?? 0) : 0, lastAt: conv?.last_message_at ?? new Date(0).toISOString() }
    }).sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()))
    setLoadingCollabs(false)
  }, [user])

  // ── Trade fetch ──
  const fetchTrades = useCallback(async () => {
    if (!user) return
    setLoadingTrades(true)
    const { data: requests } = await supabase.from('skill_requests').select('id, listing_id, requester_id, status, created_at, listing:skill_listings(title, skill_offered, skill_wanted, user_id, profile:profiles!user_id(id, full_name, avatar_url, last_seen_at))').in('status', ['accepted', 'completed']).or(`requester_id.eq.${user.id}`).order('created_at', { ascending: false })
    const { data: ownedListings } = await supabase.from('skill_requests').select('id, listing_id, requester_id, status, created_at, listing:skill_listings(title, skill_offered, skill_wanted, user_id), requester:profiles!requester_id(id, full_name, avatar_url, last_seen_at)').in('status', ['accepted', 'completed'])
    const owned = ((ownedListings ?? []) as any[]).filter(r => r.listing?.user_id === user.id && r.requester_id !== user.id)
    const allRequests = [...((requests ?? []) as any[]).filter(r => r.listing?.user_id !== user.id), ...owned]
    if (!allRequests.length) { setTradeThreads([]); setLoadingTrades(false); return }
    const reqIds = allRequests.map(r => r.id as string)
    const { data: lastMsgs } = await supabase.from('skill_trade_messages').select('request_id, content, created_at').in('request_id', reqIds).order('created_at', { ascending: false })
    const lastMsgMap: Record<string, string> = {}; const lastAtMap: Record<string, string> = {}
    for (const m of lastMsgs ?? []) { if (!lastMsgMap[m.request_id]) { lastMsgMap[m.request_id] = m.content; lastAtMap[m.request_id] = m.created_at } }
    const { data: unreadMsgs } = await supabase.from('skill_trade_messages').select('request_id, sender_id, created_at').in('request_id', reqIds).neq('sender_id', user.id)
    const unreadMap: Record<string, number> = {}
    for (const m of unreadMsgs ?? []) { if (m.created_at > getLastRead(m.request_id)) unreadMap[m.request_id] = (unreadMap[m.request_id] ?? 0) + 1 }
    setTradeThreads(allRequests.map(r => {
      const iAmOwner = r.listing?.user_id === user.id
      const otherProfile: Profile = iAmOwner ? (r.requester ?? { id: r.requester_id, full_name: null, avatar_url: null }) : (r.listing?.profile ?? { id: r.listing?.user_id, full_name: null, avatar_url: null })
      return { requestId: r.id, listingTitle: r.listing?.title ?? 'Trade', skillOffered: r.listing?.skill_offered ?? '', skillWanted: r.listing?.skill_wanted ?? '', otherUserId: otherProfile.id, otherProfile, status: r.status, lastMsg: lastMsgMap[r.id] ?? null, unread: unreadMap[r.id] ?? 0, lastAt: lastAtMap[r.id] ?? r.created_at, iAmOwner }
    }).sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()))
    setLoadingTrades(false)
  }, [user])

  // ── Leaders fetch ──
  const fetchLeaders = useCallback(async () => {
    if (!user) return
    setLoadingLeaders(true)
    const { data: myLeaderMems } = await supabase.from('club_memberships').select('club_id').eq('user_id', user.id).or('role.eq.president,custom_role.not.is.null')
    const myLeaderClubIds = (myLeaderMems ?? []).map(m => m.club_id as string)
    if (!myLeaderClubIds.length) { setClubLeaders([]); setLoadingLeaders(false); return }
    const { data: leaderMems } = await supabase
      .from('club_memberships')
      .select('user_id, role, custom_role, club_id, club:clubs(id,name), profile:profiles(id,full_name,avatar_url,last_seen_at)')
      .in('club_id', myLeaderClubIds)
      .or('role.eq.president,custom_role.not.is.null')
      .neq('user_id', user.id)
    const leaderUserIds = [...new Set((leaderMems ?? []).map(m => m.user_id as string))]
    const { data: convs } = leaderUserIds.length > 0
      ? await supabase.from('conversations').select('id, participant_1, participant_2, last_message_at').or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
      : { data: [] }
    const convMap: Record<string, { id: string; last_message_at: string }> = {}
    for (const c of convs ?? []) {
      const other = c.participant_1 === user.id ? c.participant_2 : c.participant_1
      if (leaderUserIds.includes(other)) convMap[other] = { id: c.id, last_message_at: c.last_message_at }
    }
    const convIds = Object.values(convMap).map(c => c.id)
    const [{ data: lastMsgs }, { data: unreadMsgs }] = convIds.length > 0 ? await Promise.all([
      supabase.from('direct_messages').select('conversation_id, content').in('conversation_id', convIds).order('created_at', { ascending: false }),
      supabase.from('direct_messages').select('conversation_id').in('conversation_id', convIds).neq('sender_id', user.id).is('read_at', null),
    ]) : [{ data: [] }, { data: [] }]
    const lastMsgMap: Record<string, string> = {}
    for (const m of lastMsgs ?? []) { if (!lastMsgMap[m.conversation_id]) lastMsgMap[m.conversation_id] = m.content }
    const unreadMap: Record<string, number> = {}
    for (const m of unreadMsgs ?? []) { unreadMap[m.conversation_id] = (unreadMap[m.conversation_id] ?? 0) + 1 }
    const seen = new Set<string>()
    const leaders: ClubLeader[] = []
    for (const m of leaderMems ?? []) {
      if (seen.has(m.user_id)) continue
      seen.add(m.user_id)
      const conv = convMap[m.user_id]
      leaders.push({ userId: m.user_id, clubId: m.club_id, clubName: (m.club as any)?.name ?? 'Club', role: m.role as string, customRole: (m as any).custom_role ?? null, profile: (m.profile as any) ?? { id: m.user_id, full_name: null, avatar_url: null }, convId: conv?.id ?? null, lastMsg: conv ? (lastMsgMap[conv.id] ?? null) : null, lastAt: conv?.last_message_at ?? null, unread: conv ? (unreadMap[conv.id] ?? 0) : 0 })
    }
    leaders.sort((a, b) => { if (a.lastAt && !b.lastAt) return -1; if (!a.lastAt && b.lastAt) return 1; if (a.lastAt && b.lastAt) return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime(); return 0 })
    setClubLeaders(leaders)
    setLoadingLeaders(false)
  }, [user])

  // ── Group chats fetch ──
  const fetchGroupChats = useCallback(async () => {
    if (!user) return
    setLoadingGroups(true)
    const { data: memberships } = await supabase.from('group_chat_members').select('group_id').eq('user_id', user.id)
    const groupIds = (memberships ?? []).map(m => m.group_id as string)
    if (!groupIds.length) { setGroupChats([]); setLoadingGroups(false); return }
    const [{ data: groups }, { data: allMembers }, { data: lastMsgs }] = await Promise.all([
      supabase.from('group_chats').select('id, name, created_by, last_message_at').in('id', groupIds).order('last_message_at', { ascending: false }),
      supabase.from('group_chat_members').select('group_id, user_id, profile:profiles(id,full_name,avatar_url)').in('group_id', groupIds),
      supabase.from('group_messages').select('group_id, content, created_at, sender_id').in('group_id', groupIds).order('created_at', { ascending: false }),
    ])
    const lastMsgMap: Record<string, string> = {}; const lastAtMap: Record<string, string> = {}
    for (const m of lastMsgs ?? []) { if (!lastMsgMap[m.group_id]) { lastMsgMap[m.group_id] = m.content; lastAtMap[m.group_id] = m.created_at } }
    const unreadMap: Record<string, number> = {}
    for (const m of lastMsgs ?? []) {
      const lastRead = getLastRead(`group-${m.group_id}`)
      if (m.created_at > lastRead && m.sender_id !== user.id) unreadMap[m.group_id] = (unreadMap[m.group_id] ?? 0) + 1
    }
    const membersByGroup: Record<string, Profile[]> = {}
    for (const m of allMembers ?? []) {
      if (!membersByGroup[m.group_id]) membersByGroup[m.group_id] = []
      membersByGroup[m.group_id].push((m.profile as any) ?? { id: m.user_id, full_name: null, avatar_url: null })
    }
    setGroupChats((groups ?? []).map(g => ({ id: g.id, name: g.name, createdBy: g.created_by, lastMsg: lastMsgMap[g.id] ?? null, lastAt: lastAtMap[g.id] ?? g.last_message_at ?? g.created_at, unread: unreadMap[g.id] ?? 0, memberProfiles: (membersByGroup[g.id] ?? []).filter(m => m.id !== user.id) })))
    setLoadingGroups(false)
  }, [user])

  useEffect(() => { fetchCollabs(); fetchTrades(); fetchLeaders(); fetchGroupChats() }, [fetchCollabs, fetchTrades, fetchLeaders, fetchGroupChats])

  // ── Open collab chat ──
  const openCollab = async (thread: CollabThread) => {
    setActiveCollab(thread); setActiveTrade(null); setActiveLeader(null); setActiveGroup(null)
    setInput(''); setSendErr(''); setMobileView('chat'); setLoadingCollabMsgs(true)
    let convId = thread.convId
    if (!convId) {
      const { data } = await supabase.from('conversations').insert({ participant_1: user!.id, participant_2: thread.matchUserId }).select('id').single()
      convId = data?.id ?? null
      if (convId) { setCollabThreads(prev => prev.map(t => t.matchUserId === thread.matchUserId ? { ...t, convId } : t)); setActiveCollab(prev => prev ? { ...prev, convId } : prev) }
    }
    if (!convId) { setLoadingCollabMsgs(false); return }
    const { data } = await supabase.from('direct_messages').select('*').eq('conversation_id', convId).order('created_at', { ascending: true })
    setCollabMsgs((data as DM[]) ?? [])
    setLoadingCollabMsgs(false)
    await supabase.from('direct_messages').update({ read_at: new Date().toISOString() }).eq('conversation_id', convId).neq('sender_id', user!.id).is('read_at', null)
    setCollabThreads(prev => prev.map(t => t.matchUserId === thread.matchUserId ? { ...t, unread: 0 } : t))
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    channelRef.current = supabase.channel(`dm-${convId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `conversation_id=eq.${convId}` }, payload => {
        const msg = payload.new as DM
        setCollabMsgs(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg])
        setCollabThreads(prev => prev.map(t => t.matchUserId === thread.matchUserId ? { ...t, lastMsg: msg.content, lastAt: msg.created_at } : t))
      }).subscribe()
    setTimeout(() => inputRef.current?.focus(), 80)
  }

  // ── Open trade chat ──
  const openTrade = async (thread: TradeThread) => {
    setActiveTrade(thread); setActiveCollab(null); setActiveLeader(null); setActiveGroup(null)
    setInput(''); setSendErr(''); setMobileView('chat'); setLoadingTradeMsgs(true)
    const { data } = await supabase.from('skill_trade_messages').select('*, profile:profiles!sender_id(full_name)').eq('request_id', thread.requestId).order('created_at', { ascending: true })
    setTradeMsgs((data as TradeDM[]) ?? [])
    setLoadingTradeMsgs(false)
    markLastRead(thread.requestId)
    setTradeThreads(prev => prev.map(t => t.requestId === thread.requestId ? { ...t, unread: 0 } : t))
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    channelRef.current = supabase.channel(`trade-${thread.requestId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'skill_trade_messages', filter: `request_id=eq.${thread.requestId}` }, payload => {
        const msg = payload.new as TradeDM
        setTradeMsgs(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg])
        markLastRead(thread.requestId)
        setTradeThreads(prev => prev.map(t => t.requestId === thread.requestId ? { ...t, lastMsg: msg.content, lastAt: msg.created_at } : t))
      }).subscribe()
    setTimeout(() => inputRef.current?.focus(), 80)
  }

  // ── Open leader DM ──
  const openLeader = async (leader: ClubLeader) => {
    setActiveLeader(leader); setActiveCollab(null); setActiveTrade(null); setActiveGroup(null)
    setInput(''); setSendErr(''); setMobileView('chat'); setLoadingLeaderMsgs(true)
    let convId = leader.convId
    if (!convId) {
      const { data: existing } = await supabase.from('conversations').select('id').or(`and(participant_1.eq.${user!.id},participant_2.eq.${leader.userId}),and(participant_1.eq.${leader.userId},participant_2.eq.${user!.id})`).maybeSingle()
      if (existing) { convId = existing.id }
      else {
        const { data } = await supabase.from('conversations').insert({ participant_1: user!.id, participant_2: leader.userId }).select('id').single()
        convId = data?.id ?? null
      }
      if (convId) { setClubLeaders(prev => prev.map(l => l.userId === leader.userId ? { ...l, convId } : l)); setActiveLeader(prev => prev ? { ...prev, convId } : prev) }
    }
    if (!convId) { setLoadingLeaderMsgs(false); return }
    const { data } = await supabase.from('direct_messages').select('*').eq('conversation_id', convId).order('created_at', { ascending: true })
    setLeaderMsgs((data as DM[]) ?? [])
    setLoadingLeaderMsgs(false)
    await supabase.from('direct_messages').update({ read_at: new Date().toISOString() }).eq('conversation_id', convId).neq('sender_id', user!.id).is('read_at', null)
    setClubLeaders(prev => prev.map(l => l.userId === leader.userId ? { ...l, unread: 0 } : l))
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    channelRef.current = supabase.channel(`ldr-dm-${convId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `conversation_id=eq.${convId}` }, payload => {
        const msg = payload.new as DM
        setLeaderMsgs(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg])
        setClubLeaders(prev => prev.map(l => l.userId === leader.userId ? { ...l, lastMsg: msg.content, lastAt: msg.created_at } : l))
      }).subscribe()
    setTimeout(() => inputRef.current?.focus(), 80)
  }

  // ── Open group chat ──
  const openGroup = async (group: GroupChat) => {
    setActiveGroup(group); setActiveCollab(null); setActiveTrade(null); setActiveLeader(null)
    setInput(''); setSendErr(''); setMobileView('chat'); setLoadingGroupMsgs(true)
    const { data } = await supabase.from('group_messages').select('*, profile:profiles!sender_id(full_name, avatar_url)').eq('group_id', group.id).order('created_at', { ascending: true })
    setGroupMsgs((data as GroupMessage[]) ?? [])
    setLoadingGroupMsgs(false)
    markLastRead(`group-${group.id}`)
    setGroupChats(prev => prev.map(g => g.id === group.id ? { ...g, unread: 0 } : g))
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    channelRef.current = supabase.channel(`group-${group.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${group.id}` }, payload => {
        const msg = payload.new as GroupMessage
        setGroupMsgs(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg])
        markLastRead(`group-${group.id}`)
        setGroupChats(prev => prev.map(g => g.id === group.id ? { ...g, lastMsg: msg.content, lastAt: msg.created_at } : g))
      }).subscribe()
    setTimeout(() => inputRef.current?.focus(), 80)
  }

  // ── Create group ──
  const createGroup = async () => {
    if (!user || !newGroupName.trim() || selectedMemberIds.size === 0 || savingGroup) return
    setSavingGroup(true)
    const { data: grp } = await supabase.from('group_chats').insert({ name: newGroupName.trim(), created_by: user.id }).select('id').single()
    if (!grp) { setSavingGroup(false); return }
    const members = [user.id, ...Array.from(selectedMemberIds)].map(uid => ({ group_id: grp.id, user_id: uid }))
    await supabase.from('group_chat_members').insert(members)
    setSavingGroup(false)
    setCreatingGroup(false)
    setNewGroupName('')
    setSelectedMemberIds(new Set())
    await fetchGroupChats()
    // Open the new group
    const { data: newGrp } = await supabase.from('group_chats').select('id, name, created_by, last_message_at').eq('id', grp.id).single()
    if (newGrp) openGroup({ id: newGrp.id, name: newGrp.name, createdBy: newGrp.created_by, lastMsg: null, lastAt: newGrp.last_message_at, unread: 0, memberProfiles: clubLeaders.filter(l => selectedMemberIds.has(l.userId)).map(l => l.profile) })
  }

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [collabMsgs, tradeMsgs, leaderMsgs, groupMsgs])
  useEffect(() => () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }, [])

  // ── Send ──
  const sendMessage = async () => {
    const text = input.trim()
    if (!user || !text || sending) return
    const check = filterText(text)
    if (!check.ok) { setSendErr(check.reason!); return }
    setSendErr(''); setSending(true); setInput('')

    if (activeCollab?.convId) {
      const optId = `opt-${Date.now()}`
      setCollabMsgs(prev => [...prev, { id: optId, conversation_id: activeCollab.convId!, sender_id: user.id, content: text, read_at: null, created_at: new Date().toISOString() }])
      const { data: saved } = await supabase.from('direct_messages').insert({ conversation_id: activeCollab.convId, sender_id: user.id, content: text }).select().single()
      setCollabMsgs(prev => saved ? prev.map(m => m.id === optId ? (saved as DM) : m) : prev.filter(m => m.id !== optId))
    } else if (activeTrade) {
      const optId = `opt-${Date.now()}`
      setTradeMsgs(prev => [...prev, { id: optId, request_id: activeTrade.requestId, sender_id: user.id, content: text, created_at: new Date().toISOString() }])
      const { data: saved } = await supabase.from('skill_trade_messages').insert({ request_id: activeTrade.requestId, sender_id: user.id, content: text }).select().single()
      setTradeMsgs(prev => saved ? prev.map(m => m.id === optId ? (saved as TradeDM) : m) : prev.filter(m => m.id !== optId))
    } else if (activeLeader) {
      const currentConvId = activeLeader.convId
      if (!currentConvId) { setSending(false); return }
      const optId = `opt-${Date.now()}`
      setLeaderMsgs(prev => [...prev, { id: optId, conversation_id: currentConvId, sender_id: user.id, content: text, read_at: null, created_at: new Date().toISOString() }])
      const { data: saved } = await supabase.from('direct_messages').insert({ conversation_id: currentConvId, sender_id: user.id, content: text }).select().single()
      setLeaderMsgs(prev => saved ? prev.map(m => m.id === optId ? (saved as DM) : m) : prev.filter(m => m.id !== optId))
      setClubLeaders(prev => prev.map(l => l.userId === activeLeader.userId ? { ...l, lastMsg: text, lastAt: new Date().toISOString() } : l))
    } else if (activeGroup) {
      const optId = `opt-${Date.now()}`
      setGroupMsgs(prev => [...prev, { id: optId, group_id: activeGroup.id, sender_id: user.id, content: text, created_at: new Date().toISOString() }])
      const { data: saved } = await supabase.from('group_messages').insert({ group_id: activeGroup.id, sender_id: user.id, content: text }).select().single()
      if (saved) await supabase.from('group_chats').update({ last_message_at: new Date().toISOString() }).eq('id', activeGroup.id)
      setGroupMsgs(prev => saved ? prev.map(m => m.id === optId ? (saved as GroupMessage) : m) : prev.filter(m => m.id !== optId))
      setGroupChats(prev => prev.map(g => g.id === activeGroup.id ? { ...g, lastMsg: text, lastAt: new Date().toISOString() } : g))
    }
    setSending(false)
  }

  // ── Derived ──
  const totalCollabUnread = collabThreads.reduce((s, t) => s + t.unread, 0)
  const totalTradeUnread  = tradeThreads.reduce((s, t) => s + t.unread, 0)
  const totalLeaderUnread = clubLeaders.reduce((s, l) => s + l.unread, 0) + groupChats.reduce((s, g) => s + g.unread, 0)
  const q = search.trim().toLowerCase()
  const shownCollabs  = q ? collabThreads.filter(t => (t.matchProfile.full_name ?? '').toLowerCase().includes(q)) : collabThreads
  const shownTrades   = q ? tradeThreads.filter(t => (t.otherProfile.full_name ?? '').toLowerCase().includes(q) || t.listingTitle.toLowerCase().includes(q)) : tradeThreads
  const shownGroups   = q ? groupChats.filter(g => g.name.toLowerCase().includes(q)) : groupChats
  const shownLeaders  = q ? clubLeaders.filter(l => (l.profile.full_name ?? '').toLowerCase().includes(q) || l.clubName.toLowerCase().includes(q)) : clubLeaders

  const activeAny = activeCollab ?? activeTrade ?? activeLeader ?? activeGroup
  const activeProfile = activeCollab?.matchProfile ?? activeTrade?.otherProfile ?? activeLeader?.profile ?? null

  // ── Messages for right panel ──
  const messages: (DM | TradeDM | GroupMessage)[] = activeCollab ? collabMsgs : activeTrade ? tradeMsgs : activeLeader ? leaderMsgs : groupMsgs
  const loadingMsgs = activeCollab ? loadingCollabMsgs : activeTrade ? loadingTradeMsgs : activeLeader ? loadingLeaderMsgs : loadingGroupMsgs

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden', background: 'var(--bg-dark)' }}>
      <style>{CSS}</style>

      {/* ════════ LEFT PANEL ════════ */}
      <div className="left-panel" style={{ width: 320, flexShrink: 0, display: mobileView === 'chat' ? 'none' : 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.06)', background: 'rgba(14,8,11,0.85)', backdropFilter: 'blur(20px)' }}>

        <div style={{ padding: '20px 18px 14px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.5px' }}>Messages</h2>
            {(totalCollabUnread + totalTradeUnread + totalLeaderUnread) > 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{totalCollabUnread + totalTradeUnread + totalLeaderUnread} unread</span>
            )}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 3, marginBottom: 12, gap: 3 }}>
            {([
              { key: 'collabs' as MsgTab, label: 'Collabs',  icon: '🤝', badge: totalCollabUnread },
              { key: 'trades'  as MsgTab, label: 'Trades',   icon: '⚡', badge: totalTradeUnread  },
              { key: 'leaders' as MsgTab, label: 'Leaders',  icon: '🏛️', badge: totalLeaderUnread  },
            ]).map(({ key, label, icon, badge }) => (
              <button key={key} className={`mp-tab${tab === key ? ' active' : ''}`} onClick={() => { setTab(key); setSearch(''); setCreatingGroup(false) }} style={{ flex: 1, padding: '7px 4px', borderRadius: 10, border: 'none', background: 'transparent', color: tab === key ? '#fff' : 'var(--text-muted)', fontSize: 10.5, fontWeight: tab === key ? 700 : 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <span>{icon}</span>{label}
                {badge > 0 && <span style={{ minWidth: 16, height: 16, fontSize: 9, fontWeight: 900, background: 'var(--accent)', color: '#fff', borderRadius: 9999, padding: '0 4px', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>{badge}</span>}
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <svg style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', opacity: 0.3, pointerEvents: 'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input placeholder={tab === 'collabs' ? 'Search collaborators…' : tab === 'trades' ? 'Search trades…' : 'Search leaders, groups…'} value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '8px 12px 8px 32px', color: 'var(--text-primary)', fontSize: 12.5, outline: 'none' }} onFocus={e => (e.target.style.borderColor = 'rgba(138,21,56,0.4)')} onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.07)')} />
          </div>
        </div>

        <div style={{ height: 1, background: 'linear-gradient(90deg,rgba(138,21,56,0.25),rgba(255,255,255,0.04),transparent)', marginBottom: 4 }} />

        {/* Thread list */}
        <div className="mp-scroll" style={{ flex: 1, overflowY: 'auto' }}>
          {tab === 'collabs' && (
            loadingCollabs ? <ShimmerList /> :
            shownCollabs.length === 0 ? <EmptyList icon="🤝" title={q ? 'No matches' : 'No collaborator matches yet'} sub={q ? `Nothing for "${search}"` : 'Match with founders in Collaboration.'} /> :
            shownCollabs.map((t, i) => (
              <div key={t.matchUserId} className={`thread-row${activeCollab?.matchUserId === t.matchUserId ? ' active' : ''}`} onClick={() => openCollab(t)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', animationDelay: `${i * 0.04}s` }}>
                <div style={{ position: 'relative', flexShrink: 0 }}><Av url={t.matchProfile.avatar_url} name={t.matchProfile.full_name} size={46} /><div style={{ position: 'absolute', bottom: 1, right: 1 }}><StatusDot userId={t.matchUserId} lastSeenAt={t.matchProfile.last_seen_at} connectedSet={connectedSet} statusMap={statusMap} size={12} /></div></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}><span style={{ fontSize: 13.5, fontWeight: t.unread > 0 ? 700 : 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{t.matchProfile.full_name ?? 'Founder'}</span><span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 6, opacity: 0.7 }}>{t.lastAt && t.lastAt !== new Date(0).toISOString() ? reltime(t.lastAt) : ''}</span></div>
                  {t.projectTitle && <div style={{ fontSize: 10.5, color: 'var(--accent)', fontWeight: 600, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.85 }}>{t.projectTitle}</div>}
                  <div style={{ fontSize: 12, color: t.unread > 0 ? 'var(--text-secondary)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: t.unread > 0 ? 500 : 400 }}>{t.lastMsg ?? <span style={{ fontStyle: 'italic', opacity: 0.5 }}>Say hello →</span>}</div>
                </div>
                {t.unread > 0 && <span style={{ minWidth: 18, height: 18, fontSize: 10, fontWeight: 900, background: 'var(--accent)', color: '#fff', borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', flexShrink: 0 }}>{t.unread}</span>}
              </div>
            ))
          )}

          {tab === 'trades' && (
            loadingTrades ? <ShimmerList /> :
            shownTrades.length === 0 ? <EmptyList icon="⚡" title={q ? 'No trades found' : 'No active trades yet'} sub={q ? `Nothing for "${search}"` : 'Accept a skill trade in Talent.'} /> :
            shownTrades.map((t, i) => (
              <div key={t.requestId} className={`thread-row${activeTrade?.requestId === t.requestId ? ' active' : ''}`} onClick={() => openTrade(t)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', animationDelay: `${i * 0.04}s` }}>
                <div style={{ position: 'relative', flexShrink: 0 }}><Av url={t.otherProfile.avatar_url} name={t.otherProfile.full_name} size={46} /><div style={{ position: 'absolute', bottom: 1, right: 1 }}><StatusDot userId={t.otherUserId} lastSeenAt={t.otherProfile.last_seen_at} connectedSet={connectedSet} statusMap={statusMap} size={12} /></div></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}><span style={{ fontSize: 13.5, fontWeight: t.unread > 0 ? 700 : 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{t.otherProfile.full_name ?? 'Trader'}</span><span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 6, opacity: 0.7 }}>{reltime(t.lastAt)}</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}><span style={{ fontSize: 10, fontWeight: 700, color: '#4ade80', background: 'rgba(34,197,94,0.1)', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>{t.skillOffered}</span><span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.4 }}>→</span><span style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.skillWanted}</span></div>
                  <div style={{ fontSize: 12, color: t.unread > 0 ? 'var(--text-secondary)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.lastMsg ?? <span style={{ fontStyle: 'italic', opacity: 0.5 }}>No messages yet</span>}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  {t.status === 'completed' && <span style={{ fontSize: 8.5, fontWeight: 700, background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', borderRadius: 5, padding: '2px 5px' }}>DONE</span>}
                  {t.unread > 0 && <span style={{ minWidth: 18, height: 18, fontSize: 10, fontWeight: 900, background: '#22c55e', color: '#fff', borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{t.unread}</span>}
                </div>
              </div>
            ))
          )}

          {tab === 'leaders' && (
            <>
              {/* New Group button */}
              <div style={{ padding: '12px 16px 4px' }}>
                {!creatingGroup ? (
                  <button onClick={() => setCreatingGroup(true)} style={{ width: '100%', padding: '9px 14px', borderRadius: 10, border: '1px dashed rgba(138,21,56,0.45)', background: 'rgba(138,21,56,0.06)', color: 'var(--accent)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, transition: 'all 0.15s' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    New Group Chat
                  </button>
                ) : (
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(138,21,56,0.25)', borderRadius: 12, padding: '14px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>New Group</div>
                    <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Group name…" style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', fontSize: 12.5, outline: 'none', marginBottom: 10 }} />
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Select members:</div>
                    <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                      {clubLeaders.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>No co-leaders to add</div>}
                      {clubLeaders.map(l => (
                        <label key={l.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '5px 4px', borderRadius: 7, background: selectedMemberIds.has(l.userId) ? 'rgba(138,21,56,0.12)' : 'transparent', transition: 'background 0.12s' }}>
                          <input type="checkbox" checked={selectedMemberIds.has(l.userId)} onChange={e => { const s = new Set(selectedMemberIds); e.target.checked ? s.add(l.userId) : s.delete(l.userId); setSelectedMemberIds(s) }} style={{ accentColor: 'var(--accent)', flexShrink: 0 }} />
                          <Av url={l.profile.avatar_url} name={l.profile.full_name} size={24} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.profile.full_name ?? 'Leader'}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{l.role === 'president' ? '👑' : '⭐'} {l.customRole ?? (l.role === 'president' ? 'President' : 'Officer')} · {l.clubName}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 7 }}>
                      <button onClick={createGroup} disabled={!newGroupName.trim() || selectedMemberIds.size === 0 || savingGroup} style={{ flex: 1, padding: '7px', borderRadius: 8, background: 'var(--accent)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: !newGroupName.trim() || selectedMemberIds.size === 0 ? 'default' : 'pointer', opacity: !newGroupName.trim() || selectedMemberIds.size === 0 || savingGroup ? 0.5 : 1 }}>
                        {savingGroup ? 'Creating…' : `Create (${selectedMemberIds.size + 1})`}
                      </button>
                      <button onClick={() => { setCreatingGroup(false); setNewGroupName(''); setSelectedMemberIds(new Set()) }} style={{ padding: '7px 12px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(87,65,68,0.3)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Group chats */}
              {(loadingGroups ? false : shownGroups.length > 0) && (
                <div style={{ padding: '12px 16px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Group Chats</div>
              )}
              {loadingGroups ? null : shownGroups.map((g, i) => (
                <div key={g.id} className={`thread-row${activeGroup?.id === g.id ? ' active' : ''}`} onClick={() => openGroup(g)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', animationDelay: `${i * 0.04}s` }}>
                  <GroupAv members={g.memberProfiles} size={44} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}><span style={{ fontSize: 13, fontWeight: g.unread > 0 ? 700 : 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{g.name}</span><span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.7 }}>{reltime(g.lastAt)}</span></div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{g.memberProfiles.length + 1} members</div>
                    <div style={{ fontSize: 12, color: g.unread > 0 ? 'var(--text-secondary)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.lastMsg ?? <span style={{ fontStyle: 'italic', opacity: 0.5 }}>No messages yet</span>}</div>
                  </div>
                  {g.unread > 0 && <span style={{ minWidth: 18, height: 18, fontSize: 10, fontWeight: 900, background: 'var(--accent)', color: '#fff', borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', flexShrink: 0 }}>{g.unread}</span>}
                </div>
              ))}

              {/* Club leaders */}
              {(loadingLeaders ? false : shownLeaders.length > 0) && (
                <div style={{ padding: '12px 16px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Club Leaders</div>
              )}
              {loadingLeaders ? <ShimmerList /> : shownLeaders.length === 0 && shownGroups.length === 0 && !creatingGroup ? (
                <EmptyList icon="🏛️" title={q ? 'No results' : 'No co-leaders found'} sub={q ? `Nothing for "${search}"` : 'This shows your fellow officers once you become a president or officer of a club.'} />
              ) : shownLeaders.map((l, i) => (
                <div key={l.userId} className={`thread-row${activeLeader?.userId === l.userId ? ' active' : ''}`} onClick={() => openLeader(l)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', animationDelay: `${i * 0.04}s` }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}><Av url={l.profile.avatar_url} name={l.profile.full_name} size={44} /><div style={{ position: 'absolute', bottom: 1, right: 1 }}><StatusDot userId={l.userId} lastSeenAt={l.profile.last_seen_at} connectedSet={connectedSet} statusMap={statusMap} size={12} /></div></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}><span style={{ fontSize: 13, fontWeight: l.unread > 0 ? 700 : 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>{l.profile.full_name ?? 'Leader'}</span>{l.lastAt && <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.7 }}>{reltime(l.lastAt)}</span>}</div>
                    <div style={{ fontSize: 10.5, color: l.role === 'president' ? 'var(--gold)' : 'var(--accent)', fontWeight: 600, marginBottom: 2 }}>{l.role === 'president' ? '👑 President' : l.customRole ? `⭐ ${l.customRole}` : '⭐ Officer'} · {l.clubName}</div>
                    <div style={{ fontSize: 12, color: l.unread > 0 ? 'var(--text-secondary)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.lastMsg ?? <span style={{ fontStyle: 'italic', opacity: 0.5 }}>Send a message</span>}</div>
                  </div>
                  {l.unread > 0 && <span style={{ minWidth: 18, height: 18, fontSize: 10, fontWeight: 900, background: 'var(--accent)', color: '#fff', borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', flexShrink: 0 }}>{l.unread}</span>}
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ════════ RIGHT PANEL ════════ */}
      <div className={`right-panel${mobileView === 'chat' ? ' mp-panel' : ''}`} style={{ flex: 1, display: mobileView === 'list' ? 'none' : 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg-dark)' }}>
        {!activeAny ? <EmptyChat /> : (
          <>
            {/* Chat header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, background: 'rgba(14,8,11,0.7)', backdropFilter: 'blur(16px)', animation: 'mp-up 0.25s cubic-bezier(0.22,1,0.36,1) both' }}>
              <button onClick={() => setMobileView('list')} className="mobile-back-btn" style={{ display: 'none', background: 'rgba(255,255,255,0.06)', border: 'none', color: 'var(--text-primary)', fontSize: 18, cursor: 'pointer', borderRadius: 8, padding: '4px 10px' }}>‹</button>

              {activeGroup ? <GroupAv members={activeGroup.memberProfiles} size={42} /> : <Av url={activeProfile?.avatar_url} name={activeProfile?.full_name} size={42} />}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {activeGroup ? activeGroup.name : (activeProfile?.full_name ?? 'User')}
                  {!activeGroup && activeProfile && (() => {
                    const uid = activeCollab?.matchUserId ?? activeTrade?.otherUserId ?? activeLeader?.userId ?? ''
                    const st = getStatus(uid, connectedSet, statusMap, activeProfile.last_seen_at)
                    return <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 500, color: STATUS_COLOR[st] }}><StatusDot userId={uid} lastSeenAt={activeProfile.last_seen_at} connectedSet={connectedSet} statusMap={statusMap} size={8} />{STATUS_LABEL[st]}</span>
                  })()}
                </div>
                {activeGroup && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {[...activeGroup.memberProfiles.map(m => m.full_name?.split(' ')[0]).filter(Boolean)].join(', ')}{activeGroup.memberProfiles.length > 0 ? ' + you' : 'Just you'}
                  </div>
                )}
                {activeCollab && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent)', background: 'rgba(138,21,56,0.15)', border: '1px solid rgba(138,21,56,0.25)', borderRadius: 6, padding: '2px 8px' }}>🤝 Collaborator</span>{activeCollab.projectTitle && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{activeCollab.projectTitle}</span>}</div>}
                {activeTrade && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 10.5, fontWeight: 700, color: '#4ade80', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 6, padding: '2px 8px' }}>⚡ {activeTrade.skillOffered}</span><span style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.5 }}>→</span><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{activeTrade.skillWanted}</span>{activeTrade.status === 'completed' && <span style={{ fontSize: 9.5, fontWeight: 700, color: '#a5b4fc', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.22)', borderRadius: 6, padding: '2px 7px' }}>COMPLETED</span>}</div>}
                {activeLeader && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 10.5, fontWeight: 700, color: activeLeader.role === 'president' ? 'var(--gold)' : 'var(--accent)', background: 'rgba(138,21,56,0.12)', border: '1px solid rgba(138,21,56,0.2)', borderRadius: 6, padding: '2px 8px' }}>{activeLeader.role === 'president' ? '👑 President' : activeLeader.customRole ? `⭐ ${activeLeader.customRole}` : '⭐ Officer'}</span><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{activeLeader.clubName}</span></div>}
              </div>

              {!activeGroup && (
                <button onClick={() => navigate(`/profile/${activeProfile?.id}`)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 9, padding: '7px 14px', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }} onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.09)' }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}>
                  View Profile
                </button>
              )}
            </div>

            {/* Messages area */}
            <div className="mp-scroll" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 12px' }}>
              {loadingMsgs ? <MsgSkeleton /> : messages.length === 0 ? (
                <div className="mp-enter" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', color: 'var(--text-muted)', paddingBottom: 40 }}>
                  <div style={{ fontSize: 52, marginBottom: 16, animation: 'mp-float 3s ease-in-out infinite' }}>{activeGroup ? '👥' : '👋'}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{activeGroup ? `Welcome to ${activeGroup.name}!` : `Say hello to ${activeProfile?.full_name?.split(' ')[0] ?? 'them'}!`}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.65, maxWidth: 240 }}>{activeGroup ? 'Start the conversation.' : 'Break the ice 🔥'}</div>
                </div>
              ) : (
                <>
                  {(() => {
                    const els: React.ReactNode[] = []
                    let lastDate = ''
                    messages.forEach((msg, i) => {
                      const isMine = msg.sender_id === user?.id
                      const isOpt  = msg.id.startsWith('opt-')
                      const prev   = i > 0 ? messages[i - 1] : null
                      const next   = i < messages.length - 1 ? messages[i + 1] : null
                      const sameAsPrev = prev?.sender_id === msg.sender_id
                      const sameAsNext = next?.sender_id === msg.sender_id
                      const showTime   = !sameAsNext || i === messages.length - 1
                      const msgDate    = fmtDate(msg.created_at)
                      if (msgDate !== lastDate) {
                        lastDate = msgDate
                        els.push(<div key={`sep-${msg.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 12px' }}><div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} /><span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', padding: '2px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.06)' }}>{msgDate}</span><div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} /></div>)
                      }

                      // For group messages, show sender info when not mine
                      const senderProfile = activeGroup && !isMine ? ('profile' in msg ? msg.profile : null) : null

                      els.push(
                        <div key={msg.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 8, marginBottom: sameAsNext ? 3 : 12, animation: isOpt ? 'mp-msg-in 0.2s ease both' : 'mp-msg-in 0.22s cubic-bezier(0.22,1,0.36,1) both' }}>
                          {!isMine && (
                            <div style={{ width: 28, flexShrink: 0, marginBottom: 2 }}>
                              {!sameAsNext && (senderProfile ? <Av url={senderProfile.avatar_url} name={senderProfile.full_name} size={28} /> : <Av url={activeProfile?.avatar_url} name={activeProfile?.full_name} size={28} />)}
                            </div>
                          )}
                          <div style={{ maxWidth: '68%', display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', gap: 2 }}>
                            {!isMine && !sameAsPrev && <span style={{ fontSize: 10.5, color: 'var(--text-muted)', paddingLeft: 6, marginBottom: 2, fontWeight: 500 }}>{senderProfile?.full_name?.split(' ')[0] ?? activeProfile?.full_name?.split(' ')[0] ?? 'User'}</span>}
                            <div className="msg-bubble" style={{ padding: '10px 14px', wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.55, background: isMine ? 'linear-gradient(135deg, var(--accent) 0%, #c42057 100%)' : 'rgba(255,255,255,0.07)', color: isMine ? '#fff' : 'var(--text-primary)', border: isMine ? 'none' : '1px solid rgba(255,255,255,0.08)', borderRadius: isMine ? (sameAsPrev && sameAsNext ? '20px 6px 6px 20px' : sameAsPrev ? '20px 6px 20px 20px' : sameAsNext ? '20px 20px 6px 20px' : '20px 6px 20px 20px') : (sameAsPrev && sameAsNext ? '6px 20px 20px 6px' : sameAsPrev ? '6px 20px 20px 20px' : sameAsNext ? '20px 20px 20px 6px' : '6px 20px 20px 20px'), boxShadow: isMine ? '0 4px 16px rgba(138,21,56,0.3)' : '0 2px 8px rgba(0,0,0,0.2)', opacity: isOpt ? 0.75 : 1 }}>
                              {msg.content}
                            </div>
                            {showTime && <span style={{ fontSize: 10, color: 'var(--text-muted)', paddingInline: 6, opacity: 0.6, marginTop: 1 }}>{new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}{isMine && <span style={{ marginLeft: 3, opacity: 0.8 }}>{isOpt ? '·' : '✓'}</span>}</span>}
                          </div>
                        </div>
                      )
                    })
                    return els
                  })()}
                  <div ref={bottomRef} />
                </>
              )}
            </div>

            {/* Input */}
            <div className="mp-input" style={{ padding: '12px 18px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, background: 'rgba(14,8,11,0.6)', backdropFilter: 'blur(12px)' }}>
              {sendErr && <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.16)', borderRadius: 8, padding: '6px 12px', marginBottom: 10 }}>{sendErr}</div>}
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <textarea ref={inputRef} value={input} onChange={e => { setInput(e.target.value); setSendErr('') }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }} placeholder={activeGroup ? `Message ${activeGroup.name}…` : `Message ${activeProfile?.full_name?.split(' ')[0] ?? 'them'}…`} rows={1} maxLength={2000} style={{ flex: 1, resize: 'none', fontFamily: 'inherit', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, padding: '11px 16px', color: 'var(--text-primary)', fontSize: 14, outline: 'none', lineHeight: 1.55, maxHeight: 120, overflowY: 'auto' }} />
                <button className="send-btn" onClick={sendMessage} disabled={!input.trim() || sending} style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, border: 'none', background: input.trim() ? 'linear-gradient(135deg, var(--accent) 0%, #c42057 100%)' : 'rgba(138,21,56,0.18)', color: '#fff', cursor: input.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: input.trim() ? '0 4px 16px rgba(138,21,56,0.35)' : 'none' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingInline: 4 }}>
                <span style={{ fontSize: 10.5, color: 'var(--text-muted)', opacity: 0.4 }}>Enter to send · Shift+Enter for newline</span>
                {input.length > 0 && <span style={{ fontSize: 10.5, color: input.length > 1800 ? '#f87171' : 'var(--text-muted)', opacity: 0.55 }}>{input.length}/2000</span>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────

function EmptyChat() {
  return (
    <div className="mp-enter" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 48 }}>
      <div style={{ width: 80, height: 80, borderRadius: 24, background: 'rgba(138,21,56,0.08)', border: '1px solid rgba(138,21,56,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, marginBottom: 22, animation: 'mp-float 3.5s ease-in-out infinite', boxShadow: '0 0 40px rgba(138,21,56,0.1)' }}>💬</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10, letterSpacing: '-0.4px' }}>Your conversations</div>
      <div style={{ fontSize: 13.5, lineHeight: 1.8, maxWidth: 280, color: 'var(--text-muted)' }}>
        Pick a <span style={{ color: 'var(--accent)', fontWeight: 700 }}>Collaboration</span> match, an active <span style={{ color: '#4ade80', fontWeight: 700 }}>Trade</span>, or message a <span style={{ color: 'var(--gold)', fontWeight: 700 }}>Club Leader</span>.
      </div>
    </div>
  )
}

function MsgSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 8 }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{ display: 'flex', justifyContent: i % 2 ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 10 }}>
          {!(i % 2) && <div className="mp-shimmer" style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0 }} />}
          <div className="mp-shimmer" style={{ width: `${[45, 58, 38, 52][i]}%`, height: i === 1 ? 58 : 40, borderRadius: 16 }} />
        </div>
      ))}
    </div>
  )
}

function ShimmerList() {
  return (
    <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px' }}>
          <div className="mp-shimmer" style={{ width: 46, height: 46, borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="mp-shimmer" style={{ height: 12, width: `${[50, 65, 45, 60][i]}%`, marginBottom: 8, borderRadius: 6 }} />
            <div className="mp-shimmer" style={{ height: 10, width: `${[75, 85, 70, 80][i]}%`, borderRadius: 6 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyList({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="mp-enter" style={{ textAlign: 'center', padding: '48px 22px', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.7 }}>{icon}</div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, lineHeight: 1.7, maxWidth: 220, margin: '0 auto' }}>{sub}</div>
    </div>
  )
}
