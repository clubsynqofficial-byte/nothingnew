import { useState, useEffect, useCallback, useRef, useMemo } from 'react'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
import rawEmojiData from '@emoji-mart/data'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { parseTS } from '../../lib/time'
import { useAuth } from '../../contexts/AuthContext'
import { usePresence, type PresenceStatus } from '../../contexts/PresenceContext'
import { filterText } from '../../lib/contentFilter'

// ── Types ──────────────────────────────────────────────────────────────────

type MsgTab = 'dms' | 'collabs' | 'trades' | 'leaders'

interface MsgRequest {
  id: string; from_user_id: string; to_user_id: string; status: string; created_at: string
  from_profile: { full_name: string | null; avatar_url: string | null; username: string | null } | null
}

interface DMConv {
  convId: string; otherId: string; otherName: string | null; otherAvatar: string | null
  otherUsername: string | null; otherLastSeen: string | null
  lastMsg: string | null; lastAt: string; unread: number
}

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

interface ReplyTo { id: string; content: string; sender_name: string }

interface DM {
  id: string; conversation_id: string; sender_id: string
  content: string; read_at: string | null; created_at: string
  reactions?: Record<string, string[]>
  reply_to?: ReplyTo | null
}

interface TradeDM {
  id: string; request_id: string; sender_id: string
  content: string; created_at: string
  profile?: { full_name: string | null } | null
  reactions?: Record<string, string[]>
  reply_to?: ReplyTo | null
}

interface GroupMessage {
  id: string; group_id: string; sender_id: string; content: string; created_at: string
  profile?: { full_name: string | null; avatar_url: string | null } | null
  reactions?: Record<string, string[]>
  reply_to?: ReplyTo | null
}

// ── Helpers ────────────────────────────────────────────────────────────────

function reltime(iso: string) {
  const diff = Date.now() - parseTS(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return parseTS(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtDate(iso: string) {
  const d = parseTS(iso), now = new Date()
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

// ── Emoji Picker ─────────────────────────────────────────────────────────

interface EmojiMartData {
  categories: { id: string; emojis: string[] }[]
  emojis: Record<string, { id: string; name: string; keywords: string[]; skins: { unified: string; native: string }[] }>
}

const emojiData = rawEmojiData as EmojiMartData

const CAT_ICONS: Record<string, string> = { people:'😀', nature:'🐶', foods:'🍕', activity:'⚽', places:'✈️', objects:'💡', symbols:'🔣', flags:'🏳️' }
const CAT_LABELS: Record<string, string> = { people:'Smileys & People', nature:'Animals & Nature', foods:'Food & Drink', activity:'Activities', places:'Travel & Places', objects:'Objects', symbols:'Symbols', flags:'Flags' }

const RECENT_KEY = 'emoji_recents'
const MAX_RECENTS = 32

function getRecents(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') } catch { return [] }
}
function addRecent(native: string) {
  const list = [native, ...getRecents().filter(e => e !== native)].slice(0, MAX_RECENTS)
  localStorage.setItem(RECENT_KEY, JSON.stringify(list))
}

function EmojiPicker({ onSelect, isMine, openUpward }: { onSelect: (emoji: string) => void; isMine: boolean; openUpward: boolean }) {
  const [search, setSearch] = useState('')
  const [activeCat, setActiveCat] = useState('recent')
  const [recents, setRecents] = useState<string[]>(getRecents)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const r = getRecents()
    setRecents(r)
    if (r.length === 0) setActiveCat('people')
  }, [])
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50) }, [])

  function handleSelect(native: string) {
    addRecent(native)
    setRecents(getRecents())
    onSelect(native)
  }

  const nativeToEmoji = (native: string) =>
    Object.values(emojiData.emojis).find(e => e.skins[0].native === native) ?? null

  const searchResults = search.length >= 1
    ? Object.values(emojiData.emojis).filter(e =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.keywords.some(k => k.startsWith(search.toLowerCase()))
      ).slice(0, 80)
    : null

  const displayEmojis = searchResults ?? (
    activeCat === 'recent'
      ? recents.map(nativeToEmoji).filter(Boolean)
      : (emojiData.categories.find(c => c.id === activeCat)?.emojis.map(id => emojiData.emojis[id]).filter(Boolean) ?? [])
  )

  const allTabs = [
    { id: 'recent', icon: '🕐', label: 'Recently Used' },
    ...emojiData.categories.map(c => ({ id: c.id, icon: CAT_ICONS[c.id] ?? '•', label: CAT_LABELS[c.id] ?? c.id })),
  ]

  return (
    <div style={{ position: 'absolute', [isMine ? 'right' : 'left']: 0, ...(openUpward ? { bottom: 34 } : { top: 34 }), zIndex: 1000, width: 320, background: 'rgba(18,12,15,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, boxShadow: '0 8px 40px rgba(0,0,0,0.7)', backdropFilter: 'blur(20px)', overflow: 'hidden' }} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
      {/* Search */}
      <div style={{ padding: '10px 10px 6px' }}>
        <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search emoji…" style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 10px', color: '#fff', fontSize: 13, outline: 'none' }} />
      </div>
      {/* Category tabs */}
      {!search && (
        <div style={{ display: 'flex', padding: '0 6px 4px', gap: 2, overflowX: 'auto' }}>
          {allTabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveCat(tab.id)} title={tab.label} style={{ flexShrink: 0, background: activeCat === tab.id ? 'rgba(255,255,255,0.12)' : 'none', border: 'none', borderRadius: 8, padding: '4px 7px', cursor: 'pointer', fontSize: 16, opacity: activeCat === tab.id ? 1 : 0.55, transition: 'opacity .15s, background .15s' }}>
              {tab.icon}
            </button>
          ))}
        </div>
      )}
      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 1, padding: '2px 6px 8px', maxHeight: 220, overflowY: 'auto' }}>
        {(displayEmojis ?? []).map(emoji => (
          <button key={emoji!.id} onClick={() => handleSelect(emoji!.skins[0].native)} title={emoji!.name} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: 4, borderRadius: 6, transition: 'background .1s' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
            {emoji!.skins[0].native}
          </button>
        ))}
        {(displayEmojis ?? []).length === 0 && (
          <span style={{ gridColumn: '1/-1', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, padding: '16px 0' }}>
            {activeCat === 'recent' ? 'No recent emojis yet' : 'No results'}
          </span>
        )}
      </div>
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
@keyframes ic-glow    { 0%,100%{filter:drop-shadow(0 0 2px currentColor)} 50%{filter:drop-shadow(0 0 8px currentColor)} }
@keyframes ic-draw    { 0%{stroke-dasharray:0 300;opacity:0.2} 100%{stroke-dasharray:300 0;opacity:1} }
@keyframes ic-spin    { from{transform:rotate(-8deg)} to{transform:rotate(8deg)} }
@keyframes ic-zap     { 0%,100%{opacity:1;transform:scale(1)} 45%{opacity:0.6;transform:scale(0.88)} 55%{opacity:1;transform:scale(1.15)} }
@keyframes ic-crown   { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-3px) scale(1.08)} }

.ic-glow-anim  { animation: ic-glow 2.5s ease-in-out infinite; }
.ic-zap-anim   { animation: ic-zap  1.8s ease-in-out infinite; }
.ic-crown-anim { animation: ic-crown 3s ease-in-out infinite; }
.ic-float-anim { animation: mp-float 3.5s ease-in-out infinite; }
.ic-draw-anim  { stroke-dasharray:300; stroke-dashoffset:0; animation: ic-draw 0.7s cubic-bezier(0.22,1,0.36,1) both; }

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
@media (max-width: 768px) {
  .mobile-back-btn { display: flex !important; }
  .mp-panel {
    position: fixed !important;
    inset: 0 !important;
    top: var(--topbar-height) !important;
    z-index: 30 !important;
    height: calc(100dvh - var(--topbar-height)) !important;
  }
}

@keyframes reply-in { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:none; } }

@keyframes vc-fade  { from { opacity:0; } to { opacity:1; } }
@keyframes spin     { to { transform:rotate(360deg); } }
@keyframes vc-ring  { 0% { transform:scale(1); opacity:.7; } 100% { transform:scale(2.2); opacity:0; } }
@keyframes vc-dot   { 0%,80%,100% { transform:scale(0.6); opacity:.3; } 40% { transform:scale(1); opacity:1; } }
@keyframes vc-pulse { 0%,100% { opacity:1; box-shadow:0 0 8px rgba(74,222,128,.8); } 50% { opacity:.5; box-shadow:0 0 18px rgba(74,222,128,.4); } }

.vc-ring { position:absolute; inset:0; border-radius:50%; border:2px solid rgba(74,222,128,.45); animation:vc-ring 2.4s ease-out infinite; pointer-events:none; }
.vc-dot  { display:inline-block; width:6px; height:6px; border-radius:50%; background:rgba(255,255,255,.55); animation:vc-dot 1.4s ease-in-out infinite; }
.vc-btn:hover { background:rgba(34,197,94,0.22) !important; border-color:rgba(34,197,94,0.5) !important; transform:scale(1.08); }
`

// ── SVG Icons ────────────────────────────────────────────────────────────────

function IcHandshake({ size = 14, active = false }: { size?: number; active?: boolean }) {
  return (
    <svg className={active ? 'ic-glow-anim' : ''} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0l-.77.78-.77-.78a5.4 5.4 0 0 0-7.65 7.65l1.06 1.06L12 21.23l7.77-7.77 1.06-1.06a5.4 5.4 0 0 0 -.41-7.82z"/>
      <path d="M9 11l1.5 1.5L15 8"/>
    </svg>
  )
}

function IcUsers({ size = 14, active = false }: { size?: number; active?: boolean }) {
  return (
    <svg className={active ? 'ic-glow-anim' : ''} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}

function IcZap({ size = 14, active = false }: { size?: number; active?: boolean }) {
  return (
    <svg className={active ? 'ic-zap-anim' : ''} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  )
}

function IcCrown({ size = 14, active = false }: { size?: number; active?: boolean }) {
  return (
    <svg className={active ? 'ic-crown-anim' : ''} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/>
      <line x1="5" y1="20" x2="19" y2="20"/>
    </svg>
  )
}

function IcStar({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  )
}


function IcMessageBig({ size = 56, animated = false }: { size?: number; animated?: boolean }) {
  return (
    <svg className={animated ? 'ic-float-anim ic-draw-anim' : ''} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)', opacity: 0.7 }}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      <line x1="9" y1="10" x2="15" y2="10" strokeOpacity="0.5"/>
      <line x1="9" y1="13" x2="13" y2="13" strokeOpacity="0.35"/>
    </svg>
  )
}

function IcUsersBig({ size = 56, animated = false }: { size?: number; animated?: boolean }) {
  return (
    <svg className={animated ? 'ic-float-anim ic-draw-anim' : ''} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)', opacity: 0.7 }}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const { user, session, consumeIncomingCall } = useAuth()
  const consumeIncomingCallRef = useRef(consumeIncomingCall)
  consumeIncomingCallRef.current = consumeIncomingCall
  const navigate = useNavigate()
  const location = useLocation()
  const { connectedSet, statusMap } = usePresence()

  const [tab, setTab] = useState<MsgTab>('dms')
  const [dmSubTab, setDmSubTab] = useState<'dms' | 'groups' | 'requests'>('dms')

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

  // DM state
  const [dmRequests,    setDmRequests]    = useState<MsgRequest[]>([])
  const [dmConvs,       setDmConvs]       = useState<DMConv[]>([])
  const [loadingDms,    setLoadingDms]    = useState(true)
  const [activeDm,      setActiveDm]      = useState<DMConv | null>(null)
  const [dmMsgs,        setDmMsgs]        = useState<DM[]>([])
  const [loadingDmMsgs, setLoadingDmMsgs] = useState(false)

  // New group creation
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [groupContext, setGroupContext] = useState<'connections' | 'leaders'>('connections')
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
      supabase.from('conversations').select('id, participant_1, participant_2, last_message_at').eq('type','collab').or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`).order('last_message_at', { ascending: false }),
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
      .neq('user_id', user.id)
    const leaderUserIds = [...new Set((leaderMems ?? []).map(m => m.user_id as string))]
    const { data: convs } = leaderUserIds.length > 0
      ? await supabase.from('conversations').select('id, participant_1, participant_2, last_message_at').eq('type','leader').or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
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
      supabase.from('group_chats').select('id, name, created_by, last_message_at, created_at').in('id', groupIds).order('last_message_at', { ascending: false }),
      supabase.from('group_chat_members').select('group_id, user_id, profile:profiles!group_chat_members_user_profile_fkey(id,full_name,avatar_url)').in('group_id', groupIds),
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

  // ── DM fetch ──
  const fetchDms = useCallback(async () => {
    if (!user) return
    setLoadingDms(true)
    const [{ data: reqs }, { data: convs }] = await Promise.all([
      supabase.from('message_requests').select('id, from_user_id, to_user_id, status, created_at, from_profile:profiles!from_user_id(full_name, avatar_url, username)').eq('to_user_id', user.id).eq('status', 'pending'),
      supabase.from('conversations').select('id, participant_1, participant_2, last_message_at').eq('type','dm').or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`).order('last_message_at', { ascending: false, nullsFirst: false }),
    ])
    setDmRequests((reqs ?? []) as unknown as MsgRequest[])
    if (!convs?.length) { setDmConvs([]); setLoadingDms(false); return }
    const otherIds = convs.map(c => c.participant_1 === user.id ? c.participant_2 : c.participant_1)
    const convIds  = convs.map(c => c.id)
    const [{ data: profiles }, { data: lastMsgs }, { data: unreadMsgs }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, avatar_url, username, last_seen_at').in('id', otherIds),
      supabase.from('direct_messages').select('conversation_id, content, created_at').in('conversation_id', convIds).order('created_at', { ascending: false }),
      supabase.from('direct_messages').select('conversation_id').in('conversation_id', convIds).neq('sender_id', user.id).is('read_at', null),
    ])
    const profileMap: Record<string, { full_name: string | null; avatar_url: string | null; username: string | null; last_seen_at: string | null }> = {}
    for (const p of profiles ?? []) profileMap[p.id] = p as any
    const lastMsgMap: Record<string, string> = {}
    for (const m of lastMsgs ?? []) { if (!lastMsgMap[m.conversation_id]) lastMsgMap[m.conversation_id] = m.content }
    const unreadMap: Record<string, number> = {}
    for (const m of unreadMsgs ?? []) { unreadMap[m.conversation_id] = (unreadMap[m.conversation_id] ?? 0) + 1 }
    setDmConvs(convs.map(c => {
      const otherId = c.participant_1 === user.id ? c.participant_2 : c.participant_1
      const p = profileMap[otherId]
      return { convId: c.id, otherId, otherName: p?.full_name ?? null, otherAvatar: p?.avatar_url ?? null, otherUsername: p?.username ?? null, otherLastSeen: p?.last_seen_at ?? null, lastMsg: lastMsgMap[c.id] ?? null, lastAt: c.last_message_at ?? c.id, unread: unreadMap[c.id] ?? 0 }
    }))
    setLoadingDms(false)
  }, [user])

  const openDm = async (conv: DMConv) => {
    setActiveDm(conv); setActiveCollab(null); setActiveTrade(null); setActiveLeader(null); setActiveGroup(null)
    setInput(''); setSendErr(''); setReplyingTo(null); setMobileView('chat'); setLoadingDmMsgs(true)
    const { data } = await supabase.from('direct_messages').select('*').eq('conversation_id', conv.convId).order('created_at', { ascending: true })
    setDmMsgs((data as DM[]) ?? [])
    setLoadingDmMsgs(false)
    await supabase.from('direct_messages').update({ read_at: new Date().toISOString() }).eq('conversation_id', conv.convId).neq('sender_id', user!.id).is('read_at', null)
    setDmConvs(prev => prev.map(c => c.convId === conv.convId ? { ...c, unread: 0 } : c))
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    channelRef.current = supabase.channel(`dm-${conv.convId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `conversation_id=eq.${conv.convId}` }, payload => {
        const msg = payload.new as DM
        setDmMsgs(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg])
        setDmConvs(prev => prev.map(c => c.convId === conv.convId ? { ...c, lastMsg: msg.content, lastAt: msg.created_at } : c))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_messages', filter: `conversation_id=eq.${conv.convId}` }, payload => {
        const msg = payload.new as DM
        setDmMsgs(prev => prev.map(m => m.id === msg.id ? { ...m, reactions: msg.reactions } : m))
      }).subscribe()
    setTimeout(() => inputRef.current?.focus(), 80)
  }

  async function acceptRequest(req: MsgRequest) {
    await supabase.from('message_requests').update({ status: 'accepted' }).eq('id', req.id)
    const { data: conv } = await supabase.from('conversations').insert({ participant_1: user!.id, participant_2: req.from_user_id, type: 'dm' }).select('id').single()
    setDmRequests(prev => prev.filter(r => r.id !== req.id))
    if (conv) {
      const newConv: DMConv = { convId: conv.id, otherId: req.from_user_id, otherName: req.from_profile?.full_name ?? null, otherAvatar: req.from_profile?.avatar_url ?? null, otherUsername: req.from_profile?.username ?? null, otherLastSeen: null, lastMsg: null, lastAt: new Date().toISOString(), unread: 0 }
      setDmConvs(prev => [newConv, ...prev])
      openDm(newConv)
    }
  }

  async function declineRequest(req: MsgRequest) {
    await supabase.from('message_requests').update({ status: 'declined' }).eq('id', req.id)
    setDmRequests(prev => prev.filter(r => r.id !== req.id))
  }

  useEffect(() => { fetchCollabs(); fetchTrades(); fetchLeaders(); fetchGroupChats(); fetchDms() }, [fetchCollabs, fetchTrades, fetchLeaders, fetchGroupChats, fetchDms])

  // Mark all DMs as read when Messages page is opened
  useEffect(() => {
    if (!user) return
    supabase.from('conversations').select('id').or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
      .then(({ data: convs }) => {
        const ids = (convs ?? []).map((c: { id: string }) => c.id)
        if (ids.length > 0)
          supabase.from('direct_messages').update({ read_at: new Date().toISOString() }).in('conversation_id', ids).neq('sender_id', user.id).is('read_at', null).then(() => {})
      })
    // Also reset trade lastRead timestamps
    supabase.from('skill_requests').select('id').in('status', ['accepted', 'completed']).then(({ data }) => {
      for (const r of data ?? []) localStorage.setItem(`lastRead_${r.id}`, new Date().toISOString())
    })
  }, [user])

  // ── Realtime: refresh DMs when a message_request is accepted (sender side) ──
  useEffect(() => {
    if (!user) return
    const ch = supabase.channel('dm-req-watch')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'message_requests', filter: `from_user_id=eq.${user.id}` }, payload => {
        if ((payload.new as { status: string }).status === 'accepted') fetchDms()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'message_requests', filter: `to_user_id=eq.${user.id}` }, payload => {
        if ((payload.new as { status: string }).status === 'accepted') fetchDms()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_requests', filter: `to_user_id=eq.${user.id}` }, () => {
        fetchDms()
        setTab('dms')
        setDmSubTab('requests')
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user, fetchDms])

  // ── Auto-open DM or auto-answer call from navigation state ──
  useEffect(() => {
    const state = location.state as {
      dmConvId?: string; dmOtherId?: string
      dmOtherName?: string | null; dmOtherAvatar?: string | null; dmOtherUsername?: string | null
      autoAnswer?: boolean
    } | null
    window.history.replaceState({}, '')
    if (state?.autoAnswer) { answerCall(); return }
    if (!state?.dmConvId || !state?.dmOtherId) return
    const conv: DMConv = {
      convId: state.dmConvId, otherId: state.dmOtherId,
      otherName: state.dmOtherName ?? null, otherAvatar: state.dmOtherAvatar ?? null,
      otherUsername: state.dmOtherUsername ?? null, otherLastSeen: null,
      lastMsg: null, lastAt: new Date().toISOString(), unread: 0,
    }
    openDm(conv)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Open collab chat ──
  const openCollab = async (thread: CollabThread) => {
    setActiveCollab(thread); setActiveTrade(null); setActiveLeader(null); setActiveGroup(null)
    setInput(''); setSendErr(''); setReplyingTo(null); setMobileView('chat'); setLoadingCollabMsgs(true)
    let convId = thread.convId
    if (!convId) {
      const { data } = await supabase.from('conversations').insert({ participant_1: user!.id, participant_2: thread.matchUserId, type: 'collab' }).select('id').single()
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
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_messages', filter: `conversation_id=eq.${convId}` }, payload => {
        const msg = payload.new as DM
        setCollabMsgs(prev => prev.map(m => m.id === msg.id ? { ...m, reactions: msg.reactions } : m))
      }).subscribe()
    setTimeout(() => inputRef.current?.focus(), 80)
  }

  // ── Open trade chat ──
  const openTrade = async (thread: TradeThread) => {
    setActiveTrade(thread); setActiveCollab(null); setActiveLeader(null); setActiveGroup(null)
    setInput(''); setSendErr(''); setReplyingTo(null); setMobileView('chat'); setLoadingTradeMsgs(true)
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
    setInput(''); setSendErr(''); setReplyingTo(null); setMobileView('chat'); setLoadingLeaderMsgs(true)
    let convId = leader.convId
    if (!convId) {
      const { data: existing } = await supabase.from('conversations').select('id').eq('type','leader').or(`and(participant_1.eq.${user!.id},participant_2.eq.${leader.userId}),and(participant_1.eq.${leader.userId},participant_2.eq.${user!.id})`).maybeSingle()
      if (existing) { convId = existing.id }
      else {
        const { data } = await supabase.from('conversations').insert({ participant_1: user!.id, participant_2: leader.userId, type: 'leader' }).select('id').single()
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
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_messages', filter: `conversation_id=eq.${convId}` }, payload => {
        const msg = payload.new as DM
        setLeaderMsgs(prev => prev.map(m => m.id === msg.id ? { ...m, reactions: msg.reactions } : m))
      }).subscribe()
    setTimeout(() => inputRef.current?.focus(), 80)
  }

  // ── Open group chat ──
  const openGroup = async (group: GroupChat) => {
    setActiveGroup(group); setActiveCollab(null); setActiveTrade(null); setActiveLeader(null)
    setInput(''); setSendErr(''); setReplyingTo(null); setMobileView('chat'); setLoadingGroupMsgs(true)
    const { data } = await supabase.from('group_messages').select('*, profile:profiles!group_messages_sender_profile_fkey(full_name, avatar_url)').eq('group_id', group.id).order('created_at', { ascending: true })
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
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'group_messages', filter: `group_id=eq.${group.id}` }, payload => {
        const msg = payload.new as GroupMessage
        setGroupMsgs(prev => prev.map(m => m.id === msg.id ? { ...m, reactions: msg.reactions } : m))
      }).subscribe()
    setTimeout(() => inputRef.current?.focus(), 80)
  }

  // ── Create group ──
  // Members = anyone you're connected with via DMs, Collabs, or Trades (deduplicated)
  const taggedLeaders = useMemo(() => {
    const seen = new Set<string>()
    const list: { userId: string; profile: { id: string; full_name: string | null; avatar_url: string | null; last_seen_at: string | null }; source: string }[] = []
    for (const c of dmConvs) {
      if (!seen.has(c.otherId)) { seen.add(c.otherId); list.push({ userId: c.otherId, profile: { id: c.otherId, full_name: c.otherName, avatar_url: c.otherAvatar, last_seen_at: c.otherLastSeen }, source: 'DM' }) }
    }
    for (const t of collabThreads) {
      if (!seen.has(t.matchUserId)) { seen.add(t.matchUserId); list.push({ userId: t.matchUserId, profile: { id: t.matchUserId, full_name: t.matchProfile.full_name, avatar_url: t.matchProfile.avatar_url, last_seen_at: t.matchProfile.last_seen_at ?? null }, source: 'Collab' }) }
    }
    for (const t of tradeThreads) {
      if (!seen.has(t.otherUserId)) { seen.add(t.otherUserId); list.push({ userId: t.otherUserId, profile: { id: t.otherUserId, full_name: t.otherProfile.full_name, avatar_url: t.otherProfile.avatar_url, last_seen_at: t.otherProfile.last_seen_at ?? null }, source: 'Trade' }) }
    }
    return list
  }, [dmConvs, collabThreads, tradeThreads])

  const createGroup = async () => {
    if (!user || !newGroupName.trim() || selectedMemberIds.size === 0 || savingGroup) return
    setSavingGroup(true)
    const { data: grp, error: grpErr } = await supabase.from('group_chats').insert({ name: newGroupName.trim(), created_by: user.id }).select('id').single()
    if (grpErr || !grp) { setSavingGroup(false); return }
    const members = [user.id, ...Array.from(selectedMemberIds)].map(uid => ({ group_id: grp.id, user_id: uid }))
    const { error: memErr } = await supabase.from('group_chat_members').insert(members)
    if (memErr) { setSavingGroup(false); return }
    setSavingGroup(false)
    setCreatingGroup(false)
    setNewGroupName('')
    setSelectedMemberIds(new Set())
    await fetchGroupChats()
    const { data: newGrp } = await supabase.from('group_chats').select('id, name, created_by, last_message_at').eq('id', grp.id).single()
    const pool = groupContext === 'leaders'
      ? clubLeaders.map(l => ({ userId: l.userId, profile: l.profile }))
      : taggedLeaders
    if (newGrp) openGroup({ id: newGrp.id, name: newGrp.name, createdBy: newGrp.created_by, lastMsg: null, lastAt: newGrp.last_message_at, unread: 0, memberProfiles: pool.filter(l => selectedMemberIds.has(l.userId)).map(l => l.profile) })
  }

  useEffect(() => () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }, [])

  // ── Send ──
  const sendMessage = async () => {
    const text = input.trim()
    if (!user || !text || sending) return
    const check = filterText(text)
    if (!check.ok) { setSendErr(check.reason!); return }
    setSendErr(''); setSending(true); setInput('')

    const replyTo: ReplyTo | null = replyingTo
      ? { id: replyingTo.id, content: replyingTo.content, sender_name: replyingSenderName(replyingTo) }
      : null
    setReplyingTo(null)

    const senderName = (user.user_metadata as Record<string, string> | null)?.full_name ?? 'Someone'

    function notifyRecipient(recipientId: string, conversationId?: string) {
      fetch(`${SUPABASE_URL}/functions/v1/send-dm-notification`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId, senderName, messagePreview: text, conversationId }),
      }).catch(() => {})
    }

    if (activeCollab?.convId) {
      const optId = `opt-${Date.now()}`
      setCollabMsgs(prev => [...prev, { id: optId, conversation_id: activeCollab.convId!, sender_id: user.id, content: text, read_at: null, created_at: new Date().toISOString(), reply_to: replyTo }])
      const { data: saved } = await supabase.from('direct_messages').insert({ conversation_id: activeCollab.convId, sender_id: user.id, content: text, reply_to: replyTo }).select().single()
      setCollabMsgs(prev => saved ? prev.map(m => m.id === optId ? (saved as DM) : m) : prev.filter(m => m.id !== optId))
      if (saved) notifyRecipient(activeCollab.matchUserId, activeCollab.convId)
    } else if (activeTrade) {
      const optId = `opt-${Date.now()}`
      setTradeMsgs(prev => [...prev, { id: optId, request_id: activeTrade.requestId, sender_id: user.id, content: text, created_at: new Date().toISOString(), reply_to: replyTo }])
      const { data: saved } = await supabase.from('skill_trade_messages').insert({ request_id: activeTrade.requestId, sender_id: user.id, content: text, reply_to: replyTo }).select().single()
      setTradeMsgs(prev => saved ? prev.map(m => m.id === optId ? (saved as TradeDM) : m) : prev.filter(m => m.id !== optId))
      if (saved) notifyRecipient(activeTrade.otherUserId)
    } else if (activeLeader) {
      const currentConvId = activeLeader.convId
      if (!currentConvId) { setSending(false); return }
      const optId = `opt-${Date.now()}`
      setLeaderMsgs(prev => [...prev, { id: optId, conversation_id: currentConvId, sender_id: user.id, content: text, read_at: null, created_at: new Date().toISOString(), reply_to: replyTo }])
      const { data: saved } = await supabase.from('direct_messages').insert({ conversation_id: currentConvId, sender_id: user.id, content: text, reply_to: replyTo }).select().single()
      setLeaderMsgs(prev => saved ? prev.map(m => m.id === optId ? (saved as DM) : m) : prev.filter(m => m.id !== optId))
      setClubLeaders(prev => prev.map(l => l.userId === activeLeader.userId ? { ...l, lastMsg: text, lastAt: new Date().toISOString() } : l))
      if (saved) notifyRecipient(activeLeader.userId, currentConvId)
    } else if (activeGroup) {
      const optId = `opt-${Date.now()}`
      setGroupMsgs(prev => [...prev, { id: optId, group_id: activeGroup.id, sender_id: user.id, content: text, created_at: new Date().toISOString(), reply_to: replyTo }])
      const { data: saved } = await supabase.from('group_messages').insert({ group_id: activeGroup.id, sender_id: user.id, content: text, reply_to: replyTo }).select().single()
      if (saved) await supabase.from('group_chats').update({ last_message_at: new Date().toISOString() }).eq('id', activeGroup.id)
      setGroupMsgs(prev => {
        if (!saved) return prev.filter(m => m.id !== optId)
        // Remove any duplicate already added by realtime before replacing the opt entry
        const deduped = prev.filter(m => m.id !== saved.id)
        return deduped.map(m => m.id === optId ? (saved as GroupMessage) : m)
      })
      setGroupChats(prev => prev.map(g => g.id === activeGroup.id ? { ...g, lastMsg: text, lastAt: new Date().toISOString() } : g))
    } else if (activeDm) {
      const optId = `opt-${Date.now()}`
      setDmMsgs(prev => [...prev, { id: optId, conversation_id: activeDm.convId, sender_id: user.id, content: text, read_at: null, created_at: new Date().toISOString(), reply_to: replyTo }])
      const { data: saved } = await supabase.from('direct_messages').insert({ conversation_id: activeDm.convId, sender_id: user.id, content: text, reply_to: replyTo }).select().single()
      setDmMsgs(prev => saved ? prev.map(m => m.id === optId ? (saved as DM) : m) : prev.filter(m => m.id !== optId))
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', activeDm.convId)
      setDmConvs(prev => prev.map(c => c.convId === activeDm.convId ? { ...c, lastMsg: text, lastAt: new Date().toISOString() } : c))
      if (saved) notifyRecipient(activeDm.otherId, activeDm.convId)
    }
    setSending(false)
  }

  // ── Derived ──
  const totalDmUnread     = dmConvs.reduce((s, c) => s + c.unread, 0)
  const totalGroupUnread  = groupChats.reduce((s, g) => s + g.unread, 0)
  const totalRequestCount = dmRequests.length
  const totalCollabUnread = collabThreads.reduce((s, t) => s + t.unread, 0)
  const totalTradeUnread  = tradeThreads.reduce((s, t) => s + t.unread, 0)
  const totalLeaderUnread = clubLeaders.reduce((s, l) => s + l.unread, 0)
  const q = search.trim().toLowerCase()
  const shownCollabs  = q ? collabThreads.filter(t => (t.matchProfile.full_name ?? '').toLowerCase().includes(q)) : collabThreads
  const shownTrades   = q ? tradeThreads.filter(t => (t.otherProfile.full_name ?? '').toLowerCase().includes(q) || t.listingTitle.toLowerCase().includes(q)) : tradeThreads
  const shownGroups   = q ? groupChats.filter(g => g.name.toLowerCase().includes(q)) : groupChats
  const shownLeaders  = q ? clubLeaders.filter(l => (l.profile.full_name ?? '').toLowerCase().includes(q) || l.clubName.toLowerCase().includes(q)) : clubLeaders
  const shownDmConvs  = q ? dmConvs.filter(c => (c.otherName ?? '').toLowerCase().includes(q) || (c.otherUsername ?? '').toLowerCase().includes(q)) : dmConvs

  const activeAny = activeCollab ?? activeTrade ?? activeLeader ?? activeGroup ?? activeDm
  const activeProfile = activeCollab?.matchProfile ?? activeTrade?.otherProfile ?? activeLeader?.profile ?? (activeDm ? { id: activeDm.otherId, full_name: activeDm.otherName, avatar_url: activeDm.otherAvatar, last_seen_at: activeDm.otherLastSeen } : null)

  // ── Messages for right panel ──
  const messages: (DM | TradeDM | GroupMessage)[] = activeCollab ? collabMsgs : activeTrade ? tradeMsgs : activeLeader ? leaderMsgs : activeDm ? dmMsgs : groupMsgs
  const loadingMsgs = activeCollab ? loadingCollabMsgs : activeTrade ? loadingTradeMsgs : activeLeader ? loadingLeaderMsgs : activeDm ? loadingDmMsgs : loadingGroupMsgs

  const msgCountRef = useRef(0)
  useEffect(() => {
    const count = messages.length
    if (count > msgCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    msgCountRef.current = count
  }, [messages])

  const [pickerState, setPickerState] = useState<{ msgId: string; openUpward: boolean } | null>(null)
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [replyingTo, setReplyingTo] = useState<DM | TradeDM | GroupMessage | null>(null)
  useEffect(() => {
    if (!pickerState) return
    function handleClick() { setPickerState(null) }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [pickerState])

  async function toggleReaction(msgId: string, emoji: string) {
    if (!user) return
    const msg = messages.find(m => m.id === msgId)
    if (!msg) return
    const current = msg.reactions ?? {}
    // Remove user from any existing emoji first (one reaction per user per message)
    const newReactions: Record<string, string[]> = {}
    for (const [e, ids] of Object.entries(current)) {
      const filtered = ids.filter(id => id !== user.id)
      if (filtered.length > 0) newReactions[e] = filtered
    }
    // Toggle: if same emoji was already theirs, just clear it; otherwise add new one
    const wasAlreadyThis = (current[emoji] ?? []).includes(user.id)
    if (!wasAlreadyThis) newReactions[emoji] = [...(newReactions[emoji] ?? []), user.id]
    const patch = (arr: { id: string; reactions?: Record<string, string[]> }[]) =>
      arr.map(m => m.id === msgId ? { ...m, reactions: newReactions } : m)
    if (activeGroup) {
      setGroupMsgs(p => patch(p) as GroupMessage[])
      await supabase.from('group_messages').update({ reactions: newReactions }).eq('id', msgId)
    } else if (activeCollab) {
      setCollabMsgs(p => patch(p) as DM[])
      await supabase.from('direct_messages').update({ reactions: newReactions }).eq('id', msgId)
    } else if (activeLeader) {
      setLeaderMsgs(p => patch(p) as DM[])
      await supabase.from('direct_messages').update({ reactions: newReactions }).eq('id', msgId)
    } else if (activeDm) {
      setDmMsgs(p => patch(p) as DM[])
      await supabase.from('direct_messages').update({ reactions: newReactions }).eq('id', msgId)
    }
  }

  function replyingSenderName(msg: DM | TradeDM | GroupMessage): string {
    if (msg.sender_id === user?.id) return 'You'
    if (activeGroup) {
      const p = 'profile' in msg ? msg.profile : null
      return p?.full_name ?? activeGroup.memberProfiles.find(m => m.id === msg.sender_id)?.full_name ?? 'User'
    }
    return activeProfile?.full_name ?? 'User'
  }

  async function saveEdit(msgId: string) {
    const text = editingText.trim()
    if (!text) return
    const update = { content: text }
    if (activeGroup) {
      await supabase.from('group_messages').update(update).eq('id', msgId)
      setGroupMsgs(prev => prev.map(m => m.id === msgId ? { ...m, content: text } : m))
    } else {
      await supabase.from('direct_messages').update(update).eq('id', msgId)
      const patchDm = (arr: DM[]) => arr.map(m => m.id === msgId ? { ...m, content: text } : m)
      setDmMsgs(patchDm); setCollabMsgs(patchDm); setLeaderMsgs(patchDm)
    }
    setEditingMsgId(null)
    setEditingText('')
  }

  // ── Video call (WebRTC) ──
  const [callState, setCallState]           = useState<'idle' | 'calling' | 'active'>('idle')
  const [callError, setCallError]           = useState<string | null>(null)
  const [micOn, setMicOn]                   = useState(true)
  const [camOn, setCamOn]                   = useState(true)
  const [screenSharing, setScreenSharing]   = useState(false)
  const [connQuality, setConnQuality]       = useState<RTCPeerConnectionState>('new')
  const localVideoRef    = useRef<HTMLVideoElement>(null)
  const remoteVideoRef   = useRef<HTMLVideoElement>(null)
  const pcRef            = useRef<RTCPeerConnection | null>(null)
  const localStreamRef   = useRef<MediaStream | null>(null)
  const screenStreamRef  = useRef<MediaStream | null>(null)
  const peerChRef        = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const isCallerRef      = useRef(false)
  const callStartRef     = useRef<Date | null>(null)
  const callTimeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ref mirrors so event callbacks always read current values (no stale closures)
  const camOnRef           = useRef(true)
  const screenSharingRef   = useRef(false)
  const callStateRef       = useRef<'idle' | 'calling' | 'active'>('idle')
  camOnRef.current         = camOn
  screenSharingRef.current = screenSharing
  callStateRef.current     = callState

  const callRoomId = activeCollab?.convId ?? activeLeader?.convId ?? activeGroup?.id ?? activeDm?.convId ?? null
  const ICE = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80',      username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443',     username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  ]

  // Request browser notification permission once
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
  }, [])

  // Attach local stream to video element after overlay mounts
  useEffect(() => {
    if ((callState === 'calling' || callState === 'active') && localStreamRef.current && localVideoRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current
    }
  }, [callState])

  // Insert "call started" when the call connects (caller side only to avoid duplicates)
  useEffect(() => {
    if (callState === 'active') {
      // Cancel the unanswered-call timeout as soon as the call is live
      if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null }
      if (isCallerRef.current) {
        callStartRef.current = new Date()
        insertCallEvent('📹 Video call started')
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState])

  // ── Window event listeners — WebRTC signals relayed from AuthContext's personal channel ──
  useEffect(() => {
    async function onAnswer(e: Event) {
      const payload = (e as CustomEvent).detail
      const pc = pcRef.current; if (!pc) return
      await pc.setRemoteDescription(new RTCSessionDescription(payload.answer))
      setCallState('active')
    }
    function onEnd()    { doCleanup() }
    function onReject() { doCleanup() }
    function onUserAccept() { answerCall() }
    window.addEventListener('vc:answer',      onAnswer)
    window.addEventListener('vc:end',         onEnd)
    window.addEventListener('vc:reject',      onReject)
    window.addEventListener('vc:user-accept', onUserAccept)
    return () => {
      window.removeEventListener('vc:answer',      onAnswer)
      window.removeEventListener('vc:end',         onEnd)
      window.removeEventListener('vc:reject',      onReject)
      window.removeEventListener('vc:user-accept', onUserAccept)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Error toast auto-dismiss ──
  useEffect(() => {
    if (!callError) return
    const t = setTimeout(() => setCallError(null), 5000)
    return () => clearTimeout(t)
  }, [callError])

  function waitForIceComplete(pc: RTCPeerConnection): Promise<void> {
    return new Promise<void>(resolve => {
      if (pc.iceGatheringState === 'complete') { resolve(); return }
      const timeout = setTimeout(resolve, 4000)
      const check = () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timeout)
          pc.removeEventListener('icegatheringstatechange', check)
          resolve()
        }
      }
      pc.addEventListener('icegatheringstatechange', check)
    })
  }

  function makePC() {
    const pc = new RTCPeerConnection({ iceServers: ICE })
    pc.ontrack = ({ streams }) => {
      if (remoteVideoRef.current && streams[0]) remoteVideoRef.current.srcObject = streams[0]
    }
    pc.onconnectionstatechange = () => {
      setConnQuality(pc.connectionState)
      if (pc.connectionState === 'failed') {
        // Unrecoverable without full renegotiation — end immediately
        if (reconTimerRef.current) { clearTimeout(reconTimerRef.current); reconTimerRef.current = null }
        doCleanup()
      } else if (pc.connectionState === 'disconnected') {
        // Give WebRTC 8s to self-recover before tearing down
        reconTimerRef.current = setTimeout(() => {
          if (pcRef.current?.connectionState !== 'connected') doCleanup()
        }, 8000)
      } else if (pc.connectionState === 'connected') {
        if (reconTimerRef.current) { clearTimeout(reconTimerRef.current); reconTimerRef.current = null }
      }
    }
    pcRef.current = pc
    return pc
  }

  async function getMedia() {
    let stream: MediaStream
    try { stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }) }
    catch { stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true }) }
    localStreamRef.current = stream
    return stream
  }

  async function insertCallEvent(text: string) {
    if (!user) return
    if (activeCollab?.convId) { await supabase.from('direct_messages').insert({ conversation_id: activeCollab.convId, sender_id: user.id, content: text }); return }
    if (activeLeader?.convId) { await supabase.from('direct_messages').insert({ conversation_id: activeLeader.convId, sender_id: user.id, content: text }); return }
    if (activeDm?.convId)     { await supabase.from('direct_messages').insert({ conversation_id: activeDm.convId,    sender_id: user.id, content: text }); return }
    if (activeGroup)          { await supabase.from('group_messages').insert({ group_id: activeGroup.id,             sender_id: user.id, content: text }); return }
  }

  async function startCall() {
    if (!callRoomId || !user) return
    const peerId = activeDm?.otherId ?? activeCollab?.matchUserId ?? activeLeader?.userId ?? null
    if (!peerId) return
    isCallerRef.current = true
    setCallError(null)
    try {
      const stream = await getMedia()
      setCallState('calling')
      // Auto-cancel if unanswered after 60s
      callTimeoutRef.current = setTimeout(() => {
        if (callStateRef.current === 'calling') {
          peerChRef.current?.send({ type: 'broadcast', event: 'end', payload: { from: user?.id } })
          insertCallEvent('📹 Video call — no answer')
          doCleanup()
        }
      }, 60_000)
      // Subscribe to peer's personal channel so we can send them signals
      const peerCh = supabase.channel(`user-vc-${peerId}`)
      peerChRef.current = peerCh
      await new Promise<void>(res => peerCh.subscribe(s => { if (s === 'SUBSCRIBED') res() }))
      const pc = makePC()
      stream.getTracks().forEach(t => pc.addTrack(t, stream))
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await waitForIceComplete(pc)
      const callerName = (user.user_metadata as Record<string, string> | null)?.full_name ?? null
      await peerCh.send({ type: 'broadcast', event: 'offer', payload: { offer: pc.localDescription, from: user.id, callerName } })
    } catch (e: unknown) {
      doCleanup()
      const msg = e instanceof Error ? e.message : String(e)
      setCallError(msg.includes('Permission') || msg.includes('NotAllowed') ? 'Camera/microphone access denied. Check your browser permissions.' : `Call failed: ${msg}`)
    }
  }

  async function answerCall() {
    const consumed = consumeIncomingCallRef.current()
    if (!consumed || !user) return
    const { data: callData, peerCh } = consumed
    peerChRef.current = peerCh
    isCallerRef.current = false
    setCallError(null)
    try {
      const stream = await getMedia()
      setCallState('active')
      const pc = makePC()
      stream.getTracks().forEach(t => pc.addTrack(t, stream))
      await pc.setRemoteDescription(new RTCSessionDescription(callData.offer))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await waitForIceComplete(pc)
      await peerCh.send({ type: 'broadcast', event: 'answer', payload: { answer: pc.localDescription, from: user.id } })
    } catch (e: unknown) {
      doCleanup()
      const msg = e instanceof Error ? e.message : String(e)
      setCallError(msg.includes('Permission') || msg.includes('NotAllowed') ? 'Camera/microphone access denied.' : `Call failed: ${msg}`)
    }
  }

  function endCall() {
    peerChRef.current?.send({ type: 'broadcast', event: 'end', payload: { from: user?.id } })
    if (callState === 'active' && callStartRef.current) {
      const secs = Math.floor((Date.now() - callStartRef.current.getTime()) / 1000)
      const dur  = secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`
      insertCallEvent(`📹 Video call ended · ${dur}`)
    } else if (callState === 'calling') {
      insertCallEvent('📹 Video call — no answer')
    }
    doCleanup()
  }

  function doCleanup() {
    if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null }
    if (reconTimerRef.current)  { clearTimeout(reconTimerRef.current);  reconTimerRef.current  = null }
    pcRef.current?.close(); pcRef.current = null
    localStreamRef.current?.getTracks().forEach(t => t.stop()); localStreamRef.current = null
    screenStreamRef.current?.getTracks().forEach(t => t.stop()); screenStreamRef.current = null
    if (localVideoRef.current)  localVideoRef.current.srcObject  = null
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
    if (peerChRef.current) { supabase.removeChannel(peerChRef.current); peerChRef.current = null }
    setCallState('idle'); setMicOn(true); setCamOn(true); setScreenSharing(false); setConnQuality('new')
  }

  function toggleMic() {
    const on = !micOn
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = on }); setMicOn(on)
  }

  function toggleCam() {
    const on = !camOn
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = on }); setCamOn(on)
  }

  // Stable stop function — safe to use in onended without stale closure risk
  async function stopScreenShare() {
    screenStreamRef.current?.getTracks().forEach(t => t.stop())
    screenStreamRef.current = null
    const camTrack = localStreamRef.current?.getVideoTracks()[0] ?? null
    if (camTrack) {
      camTrack.enabled = camOnRef.current  // restore whatever camera state was before sharing
      if (pcRef.current) {
        const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video')
        if (sender) await sender.replaceTrack(camTrack)
      }
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current
    setScreenSharing(false)
  }

  async function toggleScreenShare() {
    if (screenSharingRef.current) {
      await stopScreenShare()
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
        screenStreamRef.current = screenStream
        const screenTrack = screenStream.getVideoTracks()[0]
        if (pcRef.current) {
          const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video')
          if (sender) await sender.replaceTrack(screenTrack)
        }
        if (localVideoRef.current) localVideoRef.current.srcObject = screenStream
        setScreenSharing(true)
        // Use stopScreenShare (not toggleScreenShare) so onended never has a stale closure
        screenTrack.onended = stopScreenShare
      } catch {
        // User cancelled or permission denied — do nothing
      }
    }
  }

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
              { key: 'dms'     as MsgTab, label: 'DMs',     badge: totalDmUnread + totalGroupUnread + totalRequestCount },
              { key: 'collabs' as MsgTab, label: 'Collabs', badge: totalCollabUnread },
              { key: 'trades'  as MsgTab, label: 'Trades',  badge: totalTradeUnread  },
              { key: 'leaders' as MsgTab, label: 'Leaders', badge: totalLeaderUnread  },
            ]).map(({ key, label, badge }) => (
              <button key={key} className={`mp-tab${tab === key ? ' active' : ''}`} onClick={() => { setTab(key); setSearch(''); setCreatingGroup(false) }} style={{ flex: 1, padding: '7px 4px', borderRadius: 10, border: 'none', background: 'transparent', color: tab === key ? '#fff' : 'var(--text-muted)', fontSize: 10.5, fontWeight: tab === key ? 700 : 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                {key === 'dms'     && <IcMessageBig size={13} />}
                {key === 'collabs' && <IcUsers size={13} active={tab === 'collabs'} />}
                {key === 'trades'  && <IcZap   size={13} active={tab === 'trades'}  />}
                {key === 'leaders' && <IcCrown size={13} active={tab === 'leaders'} />}
                {label}
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
          {tab === 'dms' && (
            <>
              {/* Sub-tabs: DMs / Groups / Requests */}
              <div style={{ display: 'flex', gap: 2, padding: '0 12px 10px', flexShrink: 0 }}>
                {([
                  { key: 'dms' as const, label: 'DMs', badge: totalDmUnread, badgeColor: 'var(--accent)' },
                  { key: 'groups' as const, label: 'Groups', badge: totalGroupUnread, badgeColor: 'var(--accent)' },
                  { key: 'requests' as const, label: 'Requests', badge: totalRequestCount, badgeColor: '#22c55e' },
                ]).map(({ key, label, badge, badgeColor }) => (
                  <button key={key} onClick={() => setDmSubTab(key)} style={{ flex: 1, padding: '6px 4px', borderRadius: 8, border: 'none', background: dmSubTab === key ? 'rgba(138,21,56,0.2)' : 'transparent', color: dmSubTab === key ? '#fff' : 'var(--text-muted)', fontSize: 11.5, fontWeight: dmSubTab === key ? 700 : 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, transition: 'all 0.15s', borderBottom: dmSubTab === key ? '2px solid var(--accent)' : '2px solid transparent' }}>
                    {label}
                    {badge > 0 && <span style={{ minWidth: 16, height: 16, fontSize: 9, fontWeight: 900, background: badgeColor, color: '#fff', borderRadius: 9999, padding: '0 4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{badge}</span>}
                  </button>
                ))}
              </div>

              {/* DMs sub-tab */}
              {dmSubTab === 'dms' && (
                loadingDms ? <ShimmerList /> : shownDmConvs.length === 0
                  ? <EmptyList icon={<IcMessageBig size={38} />} title="No direct messages yet" sub="Visit someone's profile and send them a message request." />
                  : shownDmConvs.map((c, i) => (
                    <div key={c.convId} className={`thread-row${activeDm?.convId === c.convId ? ' active' : ''}`} onClick={() => openDm(c)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', animationDelay: `${i * 0.04}s` }}>
                      <Av url={c.otherAvatar} name={c.otherName} size={46} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                          <span style={{ fontSize: 13.5, fontWeight: c.unread > 0 ? 700 : 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{c.otherName ?? 'User'}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 6, opacity: 0.7 }}>{reltime(c.lastAt)}</span>
                        </div>
                        {c.otherUsername && <div style={{ fontSize: 10.5, color: 'var(--accent)', opacity: 0.6, marginBottom: 2 }}>@{c.otherUsername}</div>}
                        <div style={{ fontSize: 12, color: c.unread > 0 ? 'var(--text-secondary)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: c.unread > 0 ? 500 : 400 }}>{c.lastMsg ?? <span style={{ fontStyle: 'italic', opacity: 0.5 }}>Say hello →</span>}</div>
                      </div>
                      {c.unread > 0 && <span style={{ minWidth: 18, height: 18, fontSize: 10, fontWeight: 900, background: 'var(--accent)', color: '#fff', borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', flexShrink: 0 }}>{c.unread}</span>}
                    </div>
                  ))
              )}

              {/* Groups sub-tab */}
              {dmSubTab === 'groups' && (
                <>
                  <div style={{ padding: '0 12px 8px' }}>
                    {!creatingGroup ? (
                      <button onClick={() => { setGroupContext('connections'); setCreatingGroup(true) }} style={{ width: '100%', padding: '9px 14px', borderRadius: 10, border: '1px dashed rgba(138,21,56,0.45)', background: 'rgba(138,21,56,0.06)', color: 'var(--accent)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, transition: 'all 0.15s' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        New Group Chat
                      </button>
                    ) : (
                      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(138,21,56,0.25)', borderRadius: 12, padding: '14px' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>New Group</div>
                        <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Group name…" style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', fontSize: 12.5, outline: 'none', marginBottom: 10 }} />
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Select members:</div>
                        <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                          {taggedLeaders.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>No connections yet — accept a DM request, collab match, or trade first.</div>}
                          {taggedLeaders.map(l => (
                            <label key={l.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '5px 4px', borderRadius: 7, background: selectedMemberIds.has(l.userId) ? 'rgba(138,21,56,0.12)' : 'transparent', transition: 'background 0.12s' }}>
                              <input type="checkbox" checked={selectedMemberIds.has(l.userId)} onChange={e => { const s = new Set(selectedMemberIds); e.target.checked ? s.add(l.userId) : s.delete(l.userId); setSelectedMemberIds(s) }} style={{ accentColor: 'var(--accent)', flexShrink: 0 }} />
                              <Av url={l.profile.avatar_url} name={l.profile.full_name} size={24} />
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.profile.full_name ?? 'User'}</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.6 }}>{l.source}</div>
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
                  {loadingGroups ? <ShimmerList /> : shownGroups.length === 0 && !creatingGroup
                    ? <EmptyList icon={<IcUsers size={38} />} title="No group chats yet" sub="Create a group to chat with multiple people at once." />
                    : shownGroups.map((g, i) => (
                      <div key={g.id} className={`thread-row${activeGroup?.id === g.id ? ' active' : ''}`} onClick={() => openGroup(g)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', animationDelay: `${i * 0.04}s` }}>
                        <GroupAv members={g.memberProfiles} size={44} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}><span style={{ fontSize: 13, fontWeight: g.unread > 0 ? 700 : 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{g.name}</span><span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.7 }}>{reltime(g.lastAt)}</span></div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{g.memberProfiles.length + 1} members</div>
                          <div style={{ fontSize: 12, color: g.unread > 0 ? 'var(--text-secondary)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.lastMsg ?? <span style={{ fontStyle: 'italic', opacity: 0.5 }}>No messages yet</span>}</div>
                        </div>
                        {g.unread > 0 && <span style={{ minWidth: 18, height: 18, fontSize: 10, fontWeight: 900, background: 'var(--accent)', color: '#fff', borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', flexShrink: 0 }}>{g.unread}</span>}
                      </div>
                    ))
                  }
                </>
              )}

              {/* Requests sub-tab */}
              {dmSubTab === 'requests' && (
                loadingDms ? <ShimmerList /> : dmRequests.length === 0
                  ? <EmptyList icon={<IcMessageBig size={38} />} title="No message requests" sub="When someone wants to DM you, their request will appear here." />
                  : dmRequests.map(req => (
                    <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                      <Av url={req.from_profile?.avatar_url} name={req.from_profile?.full_name} size={44} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {req.from_profile?.full_name ?? 'Someone'}
                        </div>
                        {req.from_profile?.username && <div style={{ fontSize: 11, color: 'var(--accent)', opacity: 0.7, marginBottom: 2 }}>@{req.from_profile.username}</div>}
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Wants to message you · {reltime(req.created_at)}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
                        <button onClick={() => acceptRequest(req)} style={{ padding: '6px 12px', background: '#22c55e', border: 'none', borderRadius: 8, color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Accept</button>
                        <button onClick={() => declineRequest(req)} style={{ padding: '5px 12px', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, color: 'rgba(255,255,255,.4)', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}>Decline</button>
                      </div>
                    </div>
                  ))
              )}
            </>
          )}

          {tab === 'collabs' && (
            loadingCollabs ? <ShimmerList /> :
            shownCollabs.length === 0 ? <EmptyList icon={<IcUsers size={38} />} title={q ? 'No matches' : 'No collaborator matches yet'} sub={q ? `Nothing for "${search}"` : 'Match with founders in Collaboration.'} /> :
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
            shownTrades.length === 0 ? <EmptyList icon={<IcZap size={38} />} title={q ? 'No trades found' : 'No active trades yet'} sub={q ? `Nothing for "${search}"` : 'Accept a skill trade in Talent.'} /> :
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
              {/* New Group inline form for leaders */}
              <div style={{ padding: '12px 16px 4px' }}>
                {!(creatingGroup && groupContext === 'leaders') ? (
                  <button onClick={() => { setGroupContext('leaders'); setCreatingGroup(true); setNewGroupName(''); setSelectedMemberIds(new Set()) }} style={{ width: '100%', padding: '9px 14px', borderRadius: 10, border: '1px dashed rgba(138,21,56,0.45)', background: 'rgba(138,21,56,0.06)', color: 'var(--accent)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, transition: 'all 0.15s' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    New Group Chat
                  </button>
                ) : (
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(138,21,56,0.25)', borderRadius: 12, padding: '14px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>New Group</div>
                    <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Group name…" style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', fontSize: 12.5, outline: 'none', marginBottom: 10 }} />
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Select members:</div>
                    <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                      {clubLeaders.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>No club members to add</div>}
                      {clubLeaders.map(l => (
                        <label key={l.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '5px 4px', borderRadius: 7, background: selectedMemberIds.has(l.userId) ? 'rgba(138,21,56,0.12)' : 'transparent', transition: 'background 0.12s' }}>
                          <input type="checkbox" checked={selectedMemberIds.has(l.userId)} onChange={e => { const s = new Set(selectedMemberIds); e.target.checked ? s.add(l.userId) : s.delete(l.userId); setSelectedMemberIds(s) }} style={{ accentColor: 'var(--accent)', flexShrink: 0 }} />
                          <Av url={l.profile.avatar_url} name={l.profile.full_name} size={24} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.profile.full_name ?? 'Member'}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>{l.role === 'president' ? <IcCrown size={9} /> : l.customRole ? <IcStar size={9} /> : null} {l.role === 'president' ? 'President' : l.customRole ?? 'Member'} · {l.clubName}</div>
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
              {/* Club leaders */}
              {(loadingLeaders ? false : shownLeaders.length > 0) && (
                <div style={{ padding: '12px 16px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Club Members</div>
              )}
              {loadingLeaders ? <ShimmerList /> : shownLeaders.length === 0 && !(creatingGroup && groupContext === 'leaders') ? (
                <EmptyList icon={<IcCrown size={38} />} title={q ? 'No results' : 'No members found'} sub={q ? `Nothing for "${search}"` : 'This shows all members of your club once you become a president or officer.'} />
              ) : shownLeaders.map((l, i) => (
                <div key={l.userId} className={`thread-row${activeLeader?.userId === l.userId ? ' active' : ''}`} onClick={() => openLeader(l)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', animationDelay: `${i * 0.04}s` }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}><Av url={l.profile.avatar_url} name={l.profile.full_name} size={44} /><div style={{ position: 'absolute', bottom: 1, right: 1 }}><StatusDot userId={l.userId} lastSeenAt={l.profile.last_seen_at} connectedSet={connectedSet} statusMap={statusMap} size={12} /></div></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}><span style={{ fontSize: 13, fontWeight: l.unread > 0 ? 700 : 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>{l.profile.full_name ?? 'Leader'}</span>{l.lastAt && <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.7 }}>{reltime(l.lastAt)}</span>}</div>
                    <div style={{ fontSize: 10.5, color: l.role === 'president' ? 'var(--gold)' : l.customRole ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>{l.role === 'president' ? <IcCrown size={10} /> : l.customRole ? <IcStar size={10} /> : null}{l.role === 'president' ? 'President' : l.customRole ?? 'Member'} · {l.clubName}</div>
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
                  {activeGroup ? activeGroup.name : <span onClick={() => activeProfile && navigate(`/profile/${activeProfile.id}`)} style={{ cursor: activeProfile ? 'pointer' : 'default' }}>{activeProfile?.full_name ?? 'User'}</span>}
                  {!activeGroup && activeProfile && (() => {
                    const uid = activeCollab?.matchUserId ?? activeTrade?.otherUserId ?? activeLeader?.userId ?? activeDm?.otherId ?? ''
                    const st = getStatus(uid, connectedSet, statusMap, activeProfile.last_seen_at)
                    return <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 500, color: STATUS_COLOR[st] }}><StatusDot userId={uid} lastSeenAt={activeProfile.last_seen_at} connectedSet={connectedSet} statusMap={statusMap} size={8} />{STATUS_LABEL[st]}</span>
                  })()}
                </div>
                {activeGroup && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {[...activeGroup.memberProfiles.map(m => m.full_name?.split(' ')[0]).filter(Boolean)].join(', ')}{activeGroup.memberProfiles.length > 0 ? ' + you' : 'Just you'}
                  </div>
                )}
                {activeCollab && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent)', background: 'rgba(138,21,56,0.15)', border: '1px solid rgba(138,21,56,0.25)', borderRadius: 6, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 5 }}><IcHandshake size={11} /> Collaborator</span>{activeCollab.projectTitle && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{activeCollab.projectTitle}</span>}</div>}
                {activeTrade && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 10.5, fontWeight: 700, color: '#4ade80', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 6, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 5 }}><IcZap size={11} /> {activeTrade.skillOffered}</span><span style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.5 }}>→</span><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{activeTrade.skillWanted}</span>{activeTrade.status === 'completed' && <span style={{ fontSize: 9.5, fontWeight: 700, color: '#a5b4fc', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.22)', borderRadius: 6, padding: '2px 7px' }}>COMPLETED</span>}</div>}
                {activeLeader && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 10.5, fontWeight: 700, color: activeLeader.role === 'president' ? 'var(--gold)' : activeLeader.customRole ? 'var(--accent)' : 'var(--text-muted)', background: activeLeader.role === 'president' || activeLeader.customRole ? 'rgba(138,21,56,0.12)' : 'rgba(255,255,255,0.05)', border: `1px solid ${activeLeader.role === 'president' || activeLeader.customRole ? 'rgba(138,21,56,0.2)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 6, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 5 }}>{activeLeader.role === 'president' ? <IcCrown size={11} /> : activeLeader.customRole ? <IcStar size={11} /> : null}{activeLeader.role === 'president' ? 'President' : activeLeader.customRole ?? 'Member'}</span><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{activeLeader.clubName}</span></div>}
                {activeDm && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent)', background: 'rgba(138,21,56,0.12)', border: '1px solid rgba(138,21,56,0.22)', borderRadius: 6, padding: '2px 8px' }}>Direct Message</span>{activeDm.otherUsername && <span style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.7 }}>@{activeDm.otherUsername}</span>}</div>}
              </div>

              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                {/* Video Call button — groups not supported */}
                {callRoomId && !activeGroup && (
                  <button
                    onClick={startCall}
                    title="Start video call"
                    className="vc-btn"
                    style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.28)', color: '#4ade80', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .18s' }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
                  </button>
                )}
                {!activeGroup && (
                  <button onClick={() => navigate(`/profile/${activeProfile?.id}`)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 9, padding: '7px 14px', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }} onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.09)' }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}>
                    View Profile
                  </button>
                )}
              </div>
            </div>

            {/* Messages area */}
            <div className="mp-scroll" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 12px' }}>
              {loadingMsgs ? <MsgSkeleton /> : messages.length === 0 ? (
                <div className="mp-enter" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', color: 'var(--text-muted)', paddingBottom: 40 }}>
                  <div style={{ marginBottom: 16 }}>{activeGroup ? <IcUsersBig size={56} animated /> : <IcMessageBig size={56} animated />}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{activeGroup ? `Welcome to ${activeGroup.name}!` : `Say hello to ${activeProfile?.full_name?.split(' ')[0] ?? 'them'}!`}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.65, maxWidth: 240 }}>{activeGroup ? 'Start the conversation.' : 'Send the first message.'}</div>
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

                      // Call event messages render as centered pills
                      if (msg.content.startsWith('📹')) {
                        els.push(
                          <div key={msg.id} style={{ display: 'flex', justifyContent: 'center', margin: '10px 0', animation: 'mp-msg-in 0.22s ease both' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 14px', background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.18)', borderRadius: 9999, fontSize: 12, color: 'rgba(74,222,128,0.85)', fontWeight: 500 }}>
                              {msg.content}
                              <span style={{ fontSize: 10, opacity: 0.5, marginLeft: 2 }}>{parseTS(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                            </div>
                          </div>
                        )
                        return
                      }

                      // For group messages, show sender info when not mine
                      // Realtime messages don't have the profile join — fall back to memberProfiles
                      const senderProfile = activeGroup && !isMine
                        ? (('profile' in msg && msg.profile)
                            ? msg.profile
                            : activeGroup.memberProfiles.find(m => m.id === msg.sender_id) ?? null)
                        : null

                      const reactions = msg.reactions ?? {}
                      const reactionEntries = Object.entries(reactions).filter(([, ids]) => ids.length > 0)
                      const pickerOpen = pickerState?.msgId === msg.id
                      els.push(
                        <div key={msg.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 8, marginBottom: sameAsNext && reactionEntries.length === 0 ? 3 : 12, animation: isOpt ? 'mp-msg-in 0.2s ease both' : 'mp-msg-in 0.22s cubic-bezier(0.22,1,0.36,1) both', position: 'relative' }}>
                          {!isMine && (
                            <div style={{ width: 28, flexShrink: 0, marginBottom: 2 }}>
                              {!sameAsNext && (senderProfile ? <Av url={(senderProfile as any).avatar_url ?? null} name={senderProfile.full_name} size={28} /> : <Av url={activeProfile?.avatar_url} name={activeProfile?.full_name} size={28} />)}
                            </div>
                          )}
                          <div style={{ maxWidth: '68%', display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', gap: 2 }}>
                            {!isMine && !sameAsPrev && <span style={{ fontSize: 10.5, color: 'var(--text-muted)', paddingLeft: 6, marginBottom: 2, fontWeight: 500 }}>{senderProfile?.full_name?.split(' ')[0] ?? activeProfile?.full_name?.split(' ')[0] ?? 'User'}</span>}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexDirection: isMine ? 'row-reverse' : 'row' }}>
                              {editingMsgId === msg.id ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180, maxWidth: '100%' }}>
                                  <textarea
                                    autoFocus
                                    value={editingText}
                                    onChange={e => setEditingText(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(msg.id) } if (e.key === 'Escape') { setEditingMsgId(null) } }}
                                    style={{ fontFamily: 'inherit', fontSize: 14, lineHeight: 1.55, padding: '10px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(138,21,56,0.5)', color: 'var(--text-primary)', outline: 'none', resize: 'none', minHeight: 40, maxHeight: 120, overflowY: 'auto', width: '100%', boxSizing: 'border-box' }}
                                  />
                                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                    <button onClick={() => setEditingMsgId(null)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                                    <button onClick={() => saveEdit(msg.id)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 8, background: 'var(--accent)', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>Save</button>
                                  </div>
                                </div>
                              ) : (
                                <div className="msg-bubble" style={{ padding: msg.reply_to ? '8px 14px 10px' : '10px 14px', wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.55, background: isMine ? 'linear-gradient(135deg, var(--accent) 0%, #c42057 100%)' : 'rgba(255,255,255,0.07)', color: isMine ? '#fff' : 'var(--text-primary)', border: isMine ? 'none' : '1px solid rgba(255,255,255,0.08)', borderRadius: isMine ? (sameAsPrev && sameAsNext ? '20px 6px 6px 20px' : sameAsPrev ? '20px 6px 20px 20px' : sameAsNext ? '20px 20px 6px 20px' : '20px 6px 20px 20px') : (sameAsPrev && sameAsNext ? '6px 20px 20px 6px' : sameAsPrev ? '6px 20px 20px 20px' : sameAsNext ? '20px 20px 20px 6px' : '6px 20px 20px 20px'), boxShadow: isMine ? '0 4px 16px rgba(138,21,56,0.3)' : '0 2px 8px rgba(0,0,0,0.2)', opacity: isOpt ? 0.75 : 1 }}>
                                  {msg.reply_to && (
                                    <div style={{ borderLeft: `3px solid ${isMine ? 'rgba(255,255,255,0.5)' : 'rgba(138,21,56,0.7)'}`, paddingLeft: 8, marginBottom: 8, opacity: 0.75 }}>
                                      <div style={{ fontSize: 10.5, fontWeight: 700, color: isMine ? 'rgba(255,255,255,0.8)' : 'var(--accent)', marginBottom: 2 }}>{msg.reply_to.sender_name}</div>
                                      <div style={{ fontSize: 12, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', color: isMine ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{msg.reply_to.content}</div>
                                    </div>
                                  )}
                                  {msg.content}
                                </div>
                              )}
                              {!isOpt && editingMsgId !== msg.id && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                                  <button
                                    onClick={e => { e.stopPropagation(); setReplyingTo(msg); setPickerState(null); setTimeout(() => inputRef.current?.focus(), 50) }}
                                    style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.12)', background: replyingTo?.id === msg.id ? 'rgba(138,21,56,0.25)' : 'rgba(255,255,255,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s' }}
                                    title="Reply"
                                  >
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                                  </button>
                                  {isMine && (
                                    <button
                                      onClick={e => { e.stopPropagation(); setEditingMsgId(msg.id); setEditingText(msg.content); setPickerState(null) }}
                                      style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s' }}
                                      title="Edit"
                                    >
                                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                    </button>
                                  )}
                                  <div style={{ position: 'relative' }}>
                                    <button
                                      onClick={e => { e.stopPropagation(); if (pickerOpen) { setPickerState(null) } else { const top = (e.currentTarget as HTMLElement).getBoundingClientRect().top; setPickerState({ msgId: msg.id, openUpward: top > 360 }) } }}
                                      style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.12)', background: pickerOpen ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'rgba(255,255,255,0.5)', transition: 'background .15s, color .15s' }}
                                      title="React"
                                    >☺</button>
                                    {pickerOpen && (
                                      <EmojiPicker isMine={isMine} openUpward={pickerState!.openUpward} onSelect={emoji => { toggleReaction(msg.id, emoji); setPickerState(null) }} />
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                            {reactionEntries.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4, paddingInline: 2 }}>
                                {reactionEntries.map(([emoji, ids]) => (
                                  <button key={emoji} onClick={e => { e.stopPropagation(); toggleReaction(msg.id, emoji) }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 9999, background: ids.includes(user?.id ?? '') ? 'rgba(138,21,56,0.25)' : 'rgba(255,255,255,0.07)', border: `1px solid ${ids.includes(user?.id ?? '') ? 'rgba(192,37,90,0.4)' : 'rgba(255,255,255,0.1)'}`, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)', transition: 'background .15s' }}>
                                    <span>{emoji}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                            {showTime && <span style={{ fontSize: 10, color: 'var(--text-muted)', paddingInline: 6, opacity: 0.6, marginTop: 1 }}>{parseTS(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}{isMine && <span style={{ marginLeft: 3, opacity: 0.8 }}>{isOpt ? '·' : '✓'}</span>}</span>}
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
              {replyingTo && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'rgba(138,21,56,0.1)', border: '1px solid rgba(138,21,56,0.25)', borderRadius: 10, padding: '8px 12px', marginBottom: 8, animation: 'reply-in 0.2s ease both' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 2 }}>Replying to {replyingSenderName(replyingTo)}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{replyingTo.content}</div>
                  </div>
                  <button onClick={() => setReplyingTo(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, flexShrink: 0, lineHeight: 1, fontSize: 14 }}>✕</button>
                </div>
              )}
              {sendErr && <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.16)', borderRadius: 8, padding: '6px 12px', marginBottom: 10 }}>{sendErr}</div>}
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <textarea ref={inputRef} value={input} onChange={e => { setInput(e.target.value); setSendErr('') }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } if (e.key === 'Escape') { setReplyingTo(null) } }} placeholder={activeGroup ? `Message ${activeGroup.name}…` : `Message ${activeProfile?.full_name?.split(' ')[0] ?? 'them'}…`} rows={1} maxLength={2000} style={{ flex: 1, resize: 'none', fontFamily: 'inherit', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, padding: '11px 16px', color: 'var(--text-primary)', fontSize: 14, outline: 'none', lineHeight: 1.55, maxHeight: 120, overflowY: 'auto' }} />
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

      {/* ── Call error toast ── */}
      {callError && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 10000, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 12, padding: '12px 18px', color: '#f87171', fontSize: 13, fontWeight: 500, backdropFilter: 'blur(16px)', boxShadow: '0 4px 24px rgba(0,0,0,0.5)', animation: 'vc-fade .2s ease both', display: 'flex', alignItems: 'center', gap: 10, maxWidth: 380 }}>
          <span style={{ flexShrink: 0 }}>⚠</span>
          <span>{callError}</span>
          <button onClick={() => setCallError(null)} style={{ marginLeft: 4, background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14, opacity: 0.6, padding: 0 }}>✕</button>
        </div>
      )}

      {/* ── Active / Calling call overlay ── */}
      {(callState === 'calling' || callState === 'active') && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', background: '#0a0a0a', animation: 'vc-fade .22s ease both' }}>

          {/* Remote video (full bg) */}
          <video ref={remoteVideoRef} autoPlay playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#0a0a0a' }} />

          {/* Calling state placeholder (shown until remote connects) */}
          {callState === 'calling' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at 50% 40%, rgba(20,40,20,0.97) 0%, rgba(8,4,7,0.99) 100%)', zIndex: 1 }}>
              <div style={{ position: 'relative', marginBottom: 32 }}>
                <div className="vc-ring" style={{ animationDelay: '0s' }} />
                <div className="vc-ring" style={{ animationDelay: '.5s' }} />
                <div className="vc-ring" style={{ animationDelay: '1s' }} />
                <div style={{ position: 'relative', zIndex: 2, width: 96, height: 96, borderRadius: '50%', background: 'linear-gradient(135deg,#166534,#15803d)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 900, color: '#fff', border: '3px solid rgba(74,222,128,0.4)', boxShadow: '0 0 40px rgba(34,197,94,0.2)' }}>
                  {(activeProfile?.full_name ?? activeGroup?.name ?? '?').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                </div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 10 }}>{activeProfile?.full_name ?? activeGroup?.name ?? 'Video Call'}</div>
              <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="vc-dot" /><span className="vc-dot" style={{ animationDelay: '.3s' }} /><span className="vc-dot" style={{ animationDelay: '.6s' }} />
                <span>Calling…</span>
              </div>
            </div>
          )}

          {/* Local video PiP */}
          <video ref={localVideoRef} autoPlay playsInline muted style={{ position: 'absolute', bottom: 90, right: 20, width: 160, height: 90, borderRadius: 12, objectFit: 'cover', border: `2px solid ${screenSharing ? 'rgba(74,222,128,0.5)' : 'rgba(255,255,255,0.15)'}`, boxShadow: '0 4px 24px rgba(0,0,0,0.6)', zIndex: 10, background: '#111', display: (camOn || screenSharing) ? 'block' : 'none' }} />

          {/* Top bar */}
          <div style={{ position: 'relative', zIndex: 11, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {callState === 'active' && <div style={{ width: 7, height: 7, borderRadius: '50%', background: connQuality === 'disconnected' ? '#fbbf24' : '#4ade80', boxShadow: connQuality === 'disconnected' ? '0 0 8px rgba(251,191,36,0.8)' : '0 0 8px rgba(74,222,128,0.8)', animation: 'vc-pulse 2s ease-in-out infinite' }} />}
              <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{activeProfile?.full_name ?? activeGroup?.name ?? 'Video Call'}</span>
              {callState === 'active' && (
                connQuality === 'disconnected'
                  ? <span style={{ fontSize: 10.5, color: 'rgba(251,191,36,0.9)', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 9999, padding: '1px 7px' }}>Reconnecting…</span>
                  : <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.5)', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 9999, padding: '1px 7px' }}>Live</span>
              )}
            </div>
          </div>

          {/* Bottom controls */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '20px 0 28px', background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)' }}>
            <button onClick={toggleMic} title={micOn ? 'Mute' : 'Unmute'} style={{ width: 52, height: 52, borderRadius: '50%', background: micOn ? 'rgba(255,255,255,0.15)' : 'rgba(239,68,68,0.25)', border: `1.5px solid ${micOn ? 'rgba(255,255,255,0.2)' : 'rgba(239,68,68,0.5)'}`, color: micOn ? '#fff' : '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)', transition: 'all .18s' }}>
              {micOn
                ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>
                : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/></svg>
              }
            </button>
            <button onClick={toggleScreenShare} title={screenSharing ? 'Stop sharing' : 'Share screen'} style={{ width: 52, height: 52, borderRadius: '50%', background: screenSharing ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.15)', border: `1.5px solid ${screenSharing ? 'rgba(74,222,128,0.6)' : 'rgba(255,255,255,0.2)'}`, color: screenSharing ? '#4ade80' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)', transition: 'all .18s' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6zm8 9l-4-4h3V8h2v3h3l-4 4z"/></svg>
            </button>
            <button onClick={endCall} title="End call" style={{ width: 60, height: 60, borderRadius: '50%', background: 'linear-gradient(135deg,#dc2626,#ef4444)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 28px rgba(239,68,68,0.55)', transition: 'all .18s' }} onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)' }} onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style={{ transform: 'rotate(135deg)' }}><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
            </button>
            <button onClick={toggleCam} title={camOn ? 'Camera off' : 'Camera on'} style={{ width: 52, height: 52, borderRadius: '50%', background: camOn ? 'rgba(255,255,255,0.15)' : 'rgba(239,68,68,0.25)', border: `1.5px solid ${camOn ? 'rgba(255,255,255,0.2)' : 'rgba(239,68,68,0.5)'}`, color: camOn ? '#fff' : '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)', transition: 'all .18s' }}>
              {camOn
                ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
                : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M21 6.5l-4-4-9.28 9.28-1.23 1.23L2 18.5V21h2.5l4.78-4.78 1.22-1.22L21 6.5zM3.5 19l1-1L19 3.5l1 1-16.5 16.5-1-1z"/><path d="M17 10.5V7c0-.55-.45-1-1-1h-3L9 10h5v3.5l4-3.5 2 2V7l-3 3.5z"/></svg>
              }
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────

function EmptyChat() {
  return (
    <div className="mp-enter" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 48 }}>
      <div style={{ width: 84, height: 84, borderRadius: 26, background: 'rgba(138,21,56,0.08)', border: '1px solid rgba(138,21,56,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22, animation: 'mp-float 3.5s ease-in-out infinite', boxShadow: '0 0 40px rgba(138,21,56,0.1)' }}>
        <IcMessageBig size={44} />
      </div>
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

function EmptyList({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="mp-enter" style={{ textAlign: 'center', padding: '48px 22px', color: 'var(--text-muted)' }}>
      <div style={{ marginBottom: 14, opacity: 0.6, display: 'flex', justifyContent: 'center', animation: 'mp-float 3.5s ease-in-out infinite' }}>{icon}</div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, lineHeight: 1.7, maxWidth: 220, margin: '0 auto' }}>{sub}</div>
    </div>
  )
}
