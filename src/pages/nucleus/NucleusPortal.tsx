import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

const KEY = 'nx_auth'
const PASS = 'synq@team2025'

type User = {
  id: string
  full_name: string | null
  username: string | null
  email: string | null
  university: { name: string } | null
  created_at: string
  karak_points: number | null
  avatar_url: string | null
  onboarded: boolean | null
}

type Club = {
  id: string
  name: string
  member_count: number | null
  created_at: string
}

type Post = {
  id: string
  content: string | null
  created_at: string
  user_id: string
}

function useNucleusAuth() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(KEY) === '1')
  const grant = () => { sessionStorage.setItem(KEY, '1'); setAuthed(true) }
  const revoke = () => { sessionStorage.removeItem(KEY); setAuthed(false) }
  return { authed, grant, revoke }
}

function GateScreen({ onUnlock }: { onUnlock: () => void }) {
  const [val, setVal] = useState('')
  const [err, setErr] = useState(false)
  const [shake, setShake] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { ref.current?.focus() }, [])

  function attempt() {
    if (val === PASS) { onUnlock() }
    else {
      setErr(true); setShake(true)
      setTimeout(() => setShake(false), 500)
      setTimeout(() => setErr(false), 2000)
      setVal('')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#050305', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`
        @keyframes nx-shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)} 60%{transform:translateX(-5px)} 80%{transform:translateX(5px)} }
        @keyframes nx-in { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
      <div style={{ animation: 'nx-in .3s ease both', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(248,113,113,0.5)' }} />
        <div style={{
          animation: shake ? 'nx-shake .5s ease' : 'none',
          display: 'flex', gap: 0,
          border: `1px solid ${err ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.07)'}`,
          borderRadius: 10,
          overflow: 'hidden',
          transition: 'border-color .2s',
        }}>
          <input
            ref={ref}
            type="password"
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && attempt()}
            placeholder="••••••••••••"
            autoComplete="off"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: 'none', outline: 'none',
              padding: '12px 16px',
              fontSize: 14,
              color: err ? '#f87171' : 'rgba(255,255,255,0.7)',
              width: 200,
              fontFamily: 'inherit',
              letterSpacing: err ? 'normal' : '0.15em',
            }}
          />
          <button
            onClick={attempt}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: 'none', borderLeft: '1px solid rgba(255,255,255,0.07)',
              padding: '12px 16px',
              color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer',
              fontSize: 12,
              fontFamily: 'inherit',
            }}
          >→</button>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '16px 20px' }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function Dashboard({ onRevoke }: { onRevoke: () => void }) {
  const [tab, setTab] = useState<'users' | 'clubs' | 'posts'>('users')
  const [users, setUsers] = useState<User[]>([])
  const [clubs, setClubs] = useState<Club[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: u }, { data: c }, { data: p }] = await Promise.all([
        supabase.from('profiles').select('id,full_name,username,email,university:universities(name),created_at,karak_points,avatar_url,onboarded').order('created_at', { ascending: false }),
        supabase.from('clubs').select('id,name,member_count,created_at').order('member_count', { ascending: false }),
        supabase.from('posts').select('id,content,created_at,user_id').order('created_at', { ascending: false }).limit(200),
      ])
      setUsers((u ?? []) as unknown as User[])
      setClubs((c ?? []) as unknown as Club[])
      setPosts((p ?? []) as unknown as Post[])
      setLoading(false)
    }
    load()
  }, [])

  const filteredUsers = users.filter(u =>
    !search || (u.full_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (u.username ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (u.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const onboardedCount = users.filter(u => u.onboarded).length
  const totalPoints = users.reduce((s, u) => s + (u.karak_points ?? 0), 0)

  return (
    <div style={{ minHeight: '100vh', background: '#050305', color: '#fff', fontFamily: 'inherit' }}>
      <style>{`
        @keyframes nx-fade { from{opacity:0} to{opacity:1} }
        .nx-row:hover { background: rgba(255,255,255,0.04) !important; }
        .nx-tab { background:none; border:none; cursor:pointer; font-family:inherit; transition: color .15s, border-color .15s; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:2px; }
      `}</style>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(10px)', position: 'sticky', top: 0, background: 'rgba(5,3,5,0.92)', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#f87171' }} />
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>Nucleus</span>
        </div>
        <button onClick={onRevoke} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, padding: '5px 14px', color: 'rgba(255,255,255,0.3)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
          lock
        </button>
      </div>

      <div style={{ padding: '28px 28px 0', animation: 'nx-fade .3s ease' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,160px),1fr))', gap: 12, marginBottom: 28 }}>
          <StatCard label="Total Users" value={users.length} sub={`${onboardedCount} onboarded`} />
          <StatCard label="Clubs" value={clubs.length} />
          <StatCard label="Posts" value={posts.length} sub="last 200" />
          <StatCard label="Total Points" value={totalPoints.toLocaleString()} />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 0 }}>
          {(['users', 'clubs', 'posts'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="nx-tab"
              style={{
                padding: '8px 18px',
                fontSize: 12,
                fontWeight: 600,
                color: tab === t ? '#fff' : 'rgba(255,255,255,0.3)',
                borderBottom: `2px solid ${tab === t ? '#f87171' : 'transparent'}`,
                marginBottom: -1,
                textTransform: 'capitalize',
              }}
            >{t}</button>
          ))}
        </div>

        {loading ? (
          <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>loading…</div>
        ) : (
          <div style={{ paddingBottom: 60 }}>
            {tab === 'users' && (
              <>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="search name, username, email…"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '9px 14px', fontSize: 12, color: 'rgba(255,255,255,0.7)', outline: 'none', width: '100%', boxSizing: 'border-box', marginBottom: 16, fontFamily: 'inherit' }}
                />
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: 'rgba(255,255,255,0.25)', textAlign: 'left' }}>
                        {['#', 'Name', 'Username', 'Email', 'University', 'Points', 'Joined'].map(h => (
                          <th key={h} style={{ padding: '6px 12px', fontWeight: 600, letterSpacing: '0.05em', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u, i) => (
                        <tr key={u.id} className="nx-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background .12s' }}>
                          <td style={{ padding: '10px 12px', color: 'rgba(255,255,255,0.2)' }}>{i + 1}</td>
                          <td style={{ padding: '10px 12px', color: 'rgba(255,255,255,0.85)', fontWeight: 600, whiteSpace: 'nowrap' }}>{u.full_name ?? '—'}</td>
                          <td style={{ padding: '10px 12px', color: 'rgba(255,255,255,0.4)' }}>@{u.username ?? '—'}</td>
                          <td style={{ padding: '10px 12px', color: 'rgba(255,255,255,0.4)' }}>{u.email ?? '—'}</td>
                          <td style={{ padding: '10px 12px', color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' }}>{u.university?.name ?? '—'}</td>
                          <td style={{ padding: '10px 12px', color: '#fcd34d', fontWeight: 700 }}>{u.karak_points ?? 0}</td>
                          <td style={{ padding: '10px 12px', color: 'rgba(255,255,255,0.25)', whiteSpace: 'nowrap' }}>{new Date(u.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredUsers.length === 0 && <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, padding: '30px 12px' }}>no results</div>}
                </div>
              </>
            )}

            {tab === 'clubs' && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: 'rgba(255,255,255,0.25)', textAlign: 'left' }}>
                      {['#', 'Club Name', 'Members', 'Created'].map(h => (
                        <th key={h} style={{ padding: '6px 12px', fontWeight: 600, letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clubs.map((c, i) => (
                      <tr key={c.id} className="nx-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background .12s' }}>
                        <td style={{ padding: '10px 12px', color: 'rgba(255,255,255,0.2)' }}>{i + 1}</td>
                        <td style={{ padding: '10px 12px', color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{c.name}</td>
                        <td style={{ padding: '10px 12px', color: 'rgba(255,255,255,0.55)' }}>{c.member_count ?? 0}</td>
                        <td style={{ padding: '10px 12px', color: 'rgba(255,255,255,0.25)' }}>{new Date(c.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'posts' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {posts.map(p => (
                  <div key={p.id} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 12 }}>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>{p.user_id.slice(0, 8)}…</span>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>{new Date(p.created_at).toLocaleString()}</span>
                    </div>
                    <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1.6, wordBreak: 'break-word' }}>{p.content ?? '(no text)'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function NucleusPortal() {
  const { authed, grant, revoke } = useNucleusAuth()
  if (!authed) return <GateScreen onUnlock={grant} />
  return <Dashboard onRevoke={revoke} />
}
