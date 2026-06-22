import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

interface AttendedEvent {
  event_id: string
  title: string
  start_time: string | null
  karak_points_reward: number
  checked_in_at: string | null
}

export default function QRPage() {
  const { user, profile } = useAuth()
  const nav = useNavigate()
  const [events, setEvents] = useState<AttendedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)
  const [contentReady, setContentReady] = useState(false)

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 20)
    const t2 = setTimeout(() => setContentReady(true), 200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  useEffect(() => {
    if (!user) return
    supabase
      .from('event_attendees')
      .select('event_id, checked_in_at, event:events(title, start_time, karak_points_reward)')
      .eq('user_id', user.id)
      .order('checked_in_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setEvents(data.map((r: any) => ({
          event_id: r.event_id,
          title: r.event?.title ?? 'Event',
          start_time: r.event?.start_time ?? null,
          karak_points_reward: r.event?.karak_points_reward ?? 0,
          checked_in_at: r.checked_in_at,
        })))
        setLoading(false)
      })
  }, [user])

  function goBack() {
    setVisible(false)
    setContentReady(false)
    setTimeout(() => nav(-1), 340)
  }

  if (!user) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9990,
        background: visible ? 'rgba(0,0,0,0.82)' : 'rgba(0,0,0,0)',
        transition: 'background 0.35s ease',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}
      onClick={goBack}
    >
      <style>{`
        @keyframes sheetUp     { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes sheetDown   { from{transform:translateY(0)} to{transform:translateY(100%)} }
        @keyframes qrPop       { 0%{opacity:0;transform:scale(.8) translateY(20px)} 65%{transform:scale(1.04) translateY(-3px)} 100%{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes avatarDrop  { 0%{opacity:0;transform:translateY(-28px) scale(.85)} 60%{transform:translateY(4px) scale(1.05)} 100%{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes badgeIn     { 0%{opacity:0;transform:scale(.7)} 70%{transform:scale(1.08)} 100%{opacity:1;transform:scale(1)} }
        @keyframes badgePulse  { 0%,100%{box-shadow:0 0 0 0 rgba(233,193,118,.0)} 50%{box-shadow:0 0 0 6px rgba(233,193,118,.15)} }
        @keyframes scanLine    { 0%{top:8px;opacity:.9} 48%{opacity:.9} 50%{top:calc(100% - 8px);opacity:.7} 52%{opacity:.7} 100%{top:8px;opacity:.9} }
        @keyframes cornerPulse { 0%,100%{opacity:.5} 50%{opacity:1} }
        @keyframes handlePulse { 0%,100%{width:40px;opacity:.3} 50%{width:52px;opacity:.5} }
        @keyframes eventIn     { from{opacity:0;transform:translateX(-16px)} to{opacity:1;transform:translateX(0)} }
        @keyframes glowOrb     { 0%,100%{transform:scale(1);opacity:.18} 50%{transform:scale(1.2);opacity:.28} }
        @keyframes shimmer     { from{background-position:-400px 0} to{background-position:400px 0} }
        @keyframes spinIn      { from{opacity:0;transform:rotate(-90deg) scale(.7)} to{opacity:1;transform:rotate(0deg) scale(1)} }
        @keyframes closeIn     { from{opacity:0;transform:scale(.6)} to{opacity:1;transform:scale(1)} }
      `}</style>

      {/* Sheet */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg,#1c0e14 0%,#120810 60%,#0e0610 100%)',
          borderTop: '1px solid rgba(255,255,255,0.09)',
          borderRadius: '28px 28px 0 0',
          maxHeight: '93vh',
          display: 'flex', flexDirection: 'column',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.4s cubic-bezier(0.22,1,0.36,1)',
          boxShadow: '0 -24px 80px rgba(138,21,56,0.2), 0 -4px 40px rgba(0,0,0,0.8)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Ambient orbs */}
        <div style={{ position:'absolute', top:'-10%', left:'20%', width:240, height:240, borderRadius:'50%', background:'radial-gradient(circle,rgba(138,21,56,.22) 0%,transparent 70%)', animation:'glowOrb 8s ease-in-out infinite', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', top:'5%', right:'-5%', width:180, height:180, borderRadius:'50%', background:'radial-gradient(circle,rgba(192,37,90,.14) 0%,transparent 70%)', animation:'glowOrb 11s ease-in-out infinite .5s', pointerEvents:'none' }}/>

        {/* Drag handle */}
        <div style={{ display:'flex', justifyContent:'center', padding:'14px 0 6px', position:'relative', zIndex:1 }}>
          <div style={{ height:4, borderRadius:99, background:'rgba(255,255,255,0.18)', animation:'handlePulse 2.5s ease-in-out infinite' }}/>
        </div>

        {/* Scrollable content */}
        <div style={{ flex:1, overflowY:'auto', padding:'6px 24px 44px', position:'relative', zIndex:1 }}>

          {/* Header */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:22 }}>
            <div style={{ animation: contentReady ? 'eventIn 0.4s ease both' : 'none' }}>
              <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'rgba(255,255,255,0.3)', marginBottom:3 }}>My QR Code</div>
              <div style={{ fontSize:21, fontWeight:800, color:'#fff', background:'linear-gradient(90deg,#fff 60%,rgba(229,124,154,.8))', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
                {profile?.full_name ?? 'Student'}
              </div>
            </div>
            <button
              onClick={goBack}
              style={{ width:36, height:36, borderRadius:'50%', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.55)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0, animation: contentReady ? 'closeIn 0.35s cubic-bezier(0.22,1,0.36,1) .1s both' : 'none' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          {/* Avatar + badge */}
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', marginBottom:24 }}>
            <div style={{
              width:68, height:68, borderRadius:'50%',
              background:'linear-gradient(135deg,#8a1538,#c0185c)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:24, fontWeight:800, color:'#fff', overflow:'hidden',
              border:'3px solid rgba(192,37,90,0.5)',
              boxShadow:'0 0 0 6px rgba(138,21,56,0.12), 0 8px 32px rgba(138,21,56,0.4)',
              marginBottom:12,
              animation: contentReady ? 'avatarDrop 0.55s cubic-bezier(0.22,1,0.36,1) .05s both' : 'none',
            }}>
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                : initials}
            </div>

            <div style={{
              display:'inline-flex', alignItems:'center', gap:6,
              background:'rgba(233,193,118,0.1)', border:'1px solid rgba(233,193,118,0.28)',
              borderRadius:9999, padding:'5px 16px',
              fontSize:13, fontWeight:700, color:'var(--gold)',
              animation: contentReady ? 'badgeIn 0.5s cubic-bezier(0.22,1,0.36,1) .18s both, badgePulse 3s ease-in-out 1.5s infinite' : 'none',
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="var(--gold)"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              {profile?.karak_points ?? 0} Karak Points
            </div>
          </div>

          {/* QR Code with scan line + corner brackets */}
          <div style={{ display:'flex', justifyContent:'center', marginBottom:20,
            animation: contentReady ? 'qrPop 0.6s cubic-bezier(0.22,1,0.36,1) 0.28s both' : 'none' }}>
            <div style={{ position:'relative', display:'inline-block' }}>
              {/* White QR tile */}
              <div style={{ background:'#fff', borderRadius:20, padding:18, boxShadow:'0 12px 48px rgba(138,21,56,0.3), 0 4px 16px rgba(0,0,0,0.5)', position:'relative', overflow:'hidden' }}>
                <QRCodeSVG value={user.id} size={200} level="M"/>
                {/* Scan line */}
                <div style={{ position:'absolute', left:8, right:8, height:2, background:'linear-gradient(90deg,transparent,rgba(138,21,56,.9),rgba(192,37,90,1),rgba(138,21,56,.9),transparent)', borderRadius:99, animation:'scanLine 2.4s ease-in-out infinite', boxShadow:'0 0 10px rgba(192,37,90,.8)' }}/>
              </div>

              {/* Animated corner brackets */}
              {[
                { top:-6, left:-6, borderRight:'none', borderBottom:'none' },
                { top:-6, right:-6, borderLeft:'none', borderBottom:'none' },
                { bottom:-6, left:-6, borderRight:'none', borderTop:'none' },
                { bottom:-6, right:-6, borderLeft:'none', borderTop:'none' },
              ].map((s, i) => (
                <div key={i} style={{ position:'absolute', width:18, height:18, border:'2.5px solid #c0185c', borderRadius:3, animation:`cornerPulse 2s ease-in-out ${i*0.2}s infinite`, ...s }}/>
              ))}
            </div>
          </div>

          <p style={{ fontSize:12.5, color:'rgba(255,255,255,0.3)', textAlign:'center', lineHeight:1.55, marginBottom:28,
            animation: contentReady ? 'eventIn 0.4s ease .45s both' : 'none' }}>
            Show this to the event organiser to check in and earn Karak Points
          </p>

          {/* Registered events */}
          {(loading || events.length > 0) && (
            <div>
              <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(255,255,255,0.22)', marginBottom:12,
                animation: contentReady ? 'eventIn 0.4s ease .5s both' : 'none' }}>
                Registered Events
              </div>

              {loading ? (
                <div style={{ display:'flex', justifyContent:'center', padding:'20px 0' }}>
                  <div style={{ width:22, height:22, borderRadius:'50%', border:'2px solid rgba(138,21,56,.25)', borderTopColor:'var(--accent)', animation:'spinIn .3s ease both, qrSpin .7s linear .3s infinite' }}/>
                  <style>{`@keyframes qrSpin{to{transform:rotate(360deg)}}`}</style>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {events.map((ev, i) => (
                    <div key={ev.event_id} style={{
                      display:'flex', alignItems:'center', gap:12,
                      padding:'12px 14px', borderRadius:14,
                      background:'rgba(255,255,255,0.04)',
                      border:'1px solid rgba(255,255,255,0.07)',
                      animation: contentReady ? `eventIn 0.38s cubic-bezier(0.22,1,0.36,1) ${0.55 + i * 0.07}s both` : 'none',
                      backgroundImage:'linear-gradient(90deg,rgba(255,255,255,.015) 0%,transparent 100%)',
                    }}>
                      <div style={{ width:34, height:34, borderRadius:10, flexShrink:0, background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.22)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13.5, fontWeight:600, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ev.title}</div>
                        <div style={{ fontSize:11.5, color:'rgba(255,255,255,0.3)', marginTop:2 }}>
                          {ev.start_time && <span>{new Date(ev.start_time).toLocaleDateString('en-US',{month:'short',day:'numeric'})} · </span>}
                          {ev.checked_in_at && <span style={{ color:'rgba(74,222,128,0.55)' }}>Checked in {new Date(ev.checked_in_at).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}</span>}
                        </div>
                      </div>
                      {ev.karak_points_reward > 0 && (
                        <div style={{ fontSize:12, fontWeight:700, color:'var(--gold)', flexShrink:0 }}>+{ev.karak_points_reward} pts</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
