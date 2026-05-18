import { type ReactNode } from 'react'

const FEATURES = [
  { icon:'◈', label:'Social Feed',      sub:'Your network, in real time',   color:'#0ea5e9' },
  { icon:'⚡', label:'Skill Souq',       sub:'Trade skills, not money',       color:'#a855f7' },
  { icon:'♛', label:'Leadership Hub',   sub:'Run your club the right way',   color:'#e9c176' },
  { icon:'◉', label:'Co-Founder Match', sub:'Find your perfect partner',     color:'#22c55e' },
  { icon:'✦', label:'Karak Points',     sub:'Every action rewarded',         color:'#ec4899' },
]

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display:'flex', minHeight:'100vh', fontFamily:"'Be Vietnam Pro', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@300;400;500;600;700;800;900&display=swap');

        /* ─ Inputs ─ */
        .auth-input {
          width:100%; background:rgba(255,255,255,.038); border:1px solid rgba(87,65,68,.2);
          border-radius:12px; padding:13px 16px; color:#f3dddf; font-size:14.5px;
          font-family:'Be Vietnam Pro',sans-serif; outline:none;
          transition:border-color .2s,box-shadow .2s,background .2s; box-sizing:border-box;
          box-shadow:inset 0 1px 0 rgba(255,255,255,.03);
        }
        .auth-input:hover  { border-color:rgba(87,65,68,.38); background:rgba(255,255,255,.05); }
        .auth-input:focus  { border-color:rgba(192,37,90,.6); background:rgba(192,37,90,.04); box-shadow:0 0 0 3px rgba(192,37,90,.11),inset 0 1px 0 rgba(255,255,255,.04); }
        .auth-input::placeholder { color:rgba(243,221,223,.17); }

        /* ─ Primary button ─ */
        .auth-btn {
          position:relative; overflow:hidden; width:100%;
          background:linear-gradient(135deg,#6e1030 0%,#8a1538 40%,#c0255a 70%,#8a1538 100%);
          background-size:300% auto; border:none; border-radius:12px; color:#fff;
          font-family:'Be Vietnam Pro',sans-serif; font-size:15px; font-weight:700; letter-spacing:.04em;
          padding:14px 20px; cursor:pointer;
          box-shadow:0 8px 36px rgba(138,21,56,.48),0 0 0 1px rgba(192,37,90,.32),inset 0 1px 0 rgba(255,255,255,.16);
          transition:transform .2s,box-shadow .2s; animation:authShimmer 7s linear infinite;
        }
        .auth-btn::after {
          content:''; position:absolute; top:0; left:0; right:0; height:50%;
          background:linear-gradient(to bottom,rgba(255,255,255,.14),transparent);
          pointer-events:none; border-radius:12px 12px 0 0;
        }
        .auth-btn:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 24px 60px rgba(138,21,56,.68),0 0 0 1px rgba(192,37,90,.58),inset 0 1px 0 rgba(255,255,255,.22); }
        .auth-btn:disabled { opacity:.55; cursor:not-allowed; }

        /* ─ Google button ─ */
        .auth-google-btn {
          width:100%; display:flex; align-items:center; justify-content:center; gap:10px;
          background:rgba(255,255,255,.04); border:1px solid rgba(87,65,68,.22); border-radius:12px;
          padding:12px 20px; color:rgba(243,221,223,.68); font-family:'Be Vietnam Pro',sans-serif;
          font-size:14px; font-weight:600; cursor:pointer; transition:all .2s;
          box-shadow:inset 0 1px 0 rgba(255,255,255,.05);
        }
        .auth-google-btn:hover { background:rgba(255,255,255,.08); border-color:rgba(87,65,68,.4); color:#f3dddf; transform:translateY(-1px); box-shadow:0 8px 24px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.07); }

        /* ─ Misc ─ */
        .auth-link { color:#c0255a; text-decoration:none; font-weight:700; transition:color .15s; }
        .auth-link:hover { color:#e0356e; }
        .auth-pw-toggle { position:absolute; right:14px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:rgba(243,221,223,.28); font-size:12px; font-weight:600; padding:4px 6px; transition:color .15s; font-family:'Be Vietnam Pro',sans-serif; letter-spacing:.04em; }
        .auth-pw-toggle:hover { color:rgba(243,221,223,.65); }

        /* ─ Responsive ─ */
        .auth-left  { flex:0 0 46%; }
        .auth-right { flex:1; }
        .auth-mobile-logo { display:none; }
        @media (max-width:800px) {
          .auth-left  { display:none !important; }
          .auth-right { min-height:100vh; padding:32px 20px !important; }
          .auth-mobile-logo { display:block !important; }
        }

        /* ─ Keyframes ─ */
        @keyframes authShimmer  { 0%{background-position:200% center} 100%{background-position:-200% center} }
        @keyframes authOrb1     { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(26px,-18px) scale(1.06)} }
        @keyframes authOrb2     { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-16px,14px) scale(.95)} }
        @keyframes authFadeUp   { from{opacity:0;transform:translateY(22px)} to{opacity:1;transform:none} }
        @keyframes authFeatIn   { from{opacity:0;transform:translateX(-14px)} to{opacity:1;transform:none} }
        @keyframes authFloat1   { 0%,100%{transform:translateY(0) rotate(-.6deg)} 50%{transform:translateY(-11px) rotate(.6deg)} }
        @keyframes authFloat2   { 0%,100%{transform:translateY(0) rotate(.5deg)} 50%{transform:translateY(-9px) rotate(-.5deg)} }
        @keyframes authPulse    { 0%,100%{opacity:.38;transform:scale(1)} 50%{opacity:1;transform:scale(1.55)} }
        @keyframes authCardIn   { from{opacity:0;transform:translateY(16px) scale(.97)} to{opacity:1;transform:none} }
      `}</style>

      {/* ══════════════ LEFT PANEL ══════════════ */}
      <div className="auth-left" style={{ background:'#05020a', position:'relative', overflow:'hidden', display:'flex', flexDirection:'column', padding:'52px 52px 48px' }}>

        {/* Dot grid */}
        <div style={{ position:'absolute', inset:0, backgroundImage:'radial-gradient(rgba(192,37,90,.09) 1px,transparent 1px)', backgroundSize:'26px 26px', maskImage:'radial-gradient(ellipse 90% 90% at 40% 50%,black 10%,transparent 100%)', WebkitMaskImage:'radial-gradient(ellipse 90% 90% at 40% 50%,black 10%,transparent 100%)' }} />

        {/* Orbs */}
        <div style={{ position:'absolute', top:'-12%', right:'-14%', width:500, height:420, background:'radial-gradient(ellipse,rgba(160,24,64,.38) 0%,transparent 65%)', animation:'authOrb1 22s ease-in-out infinite', filter:'blur(1px)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:'-8%', left:'-12%', width:380, height:340, background:'radial-gradient(ellipse,rgba(100,10,48,.26) 0%,transparent 65%)', animation:'authOrb2 28s ease-in-out 4s infinite', filter:'blur(1px)', pointerEvents:'none' }} />

        {/* Floating card: Karak points */}
        <div style={{ position:'absolute', top:'38%', right:-18, background:'rgba(8,4,11,.97)', border:'1px solid rgba(236,72,153,.3)', borderRadius:18, padding:'15px 18px', backdropFilter:'blur(24px)', boxShadow:'0 24px 64px rgba(0,0,0,.85),0 0 28px rgba(236,72,153,.07)', animation:'authFloat1 6s ease-in-out 0.5s infinite, authCardIn .8s .4s ease both', width:176, zIndex:5 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
            <div style={{ width:26, height:26, borderRadius:8, background:'rgba(236,72,153,.16)', border:'1px solid rgba(236,72,153,.28)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>✦</div>
            <span style={{ fontSize:11, fontWeight:700, color:'#f472b6' }}>Karak Points</span>
          </div>
          <div style={{ display:'flex', alignItems:'baseline', gap:5, marginBottom:5 }}>
            <span style={{ fontSize:32, fontWeight:900, color:'#fff', letterSpacing:'-2px', lineHeight:1 }}>+50</span>
            <span style={{ fontSize:11, color:'rgba(243,221,223,.28)', fontWeight:500 }}>pts</span>
          </div>
          <div style={{ fontSize:10.5, color:'rgba(243,221,223,.28)' }}>Skill trade completed</div>
        </div>

        {/* Floating card: Skill match */}
        <div style={{ position:'absolute', bottom:'26%', left:-14, background:'rgba(8,4,11,.97)', border:'1px solid rgba(168,85,247,.32)', borderRadius:18, padding:'14px 16px', backdropFilter:'blur(24px)', boxShadow:'0 24px 64px rgba(0,0,0,.85),0 0 28px rgba(168,85,247,.07)', animation:'authFloat2 7.5s ease-in-out 1.8s infinite, authCardIn .8s .7s ease both', width:186, zIndex:5 }}>
          <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:11 }}>
            <div style={{ width:24, height:24, borderRadius:7, background:'rgba(168,85,247,.16)', border:'1px solid rgba(168,85,247,.28)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11 }}>⚡</div>
            <span style={{ fontSize:11, fontWeight:700, color:'#c084fc' }}>Skill Match</span>
          </div>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <div style={{ flex:1, background:'rgba(168,85,247,.1)', border:'1px solid rgba(168,85,247,.2)', borderRadius:7, padding:'5px 0', textAlign:'center', fontSize:10.5, fontWeight:700, color:'#c084fc' }}>Python</div>
            <span style={{ fontSize:13, color:'rgba(168,85,247,.45)', fontWeight:900 }}>↔</span>
            <div style={{ flex:1, background:'rgba(168,85,247,.1)', border:'1px solid rgba(168,85,247,.2)', borderRadius:7, padding:'5px 0', textAlign:'center', fontSize:10.5, fontWeight:700, color:'#c084fc' }}>Design</div>
          </div>
        </div>

        <div style={{ position:'relative', zIndex:1, display:'flex', flexDirection:'column', height:'100%' }}>

          {/* Logo */}
          <div style={{ display:'flex', alignItems:'center', gap:11 }}>
            <img src="/clubsynqlogo.png" alt="ClubSynq" style={{ width:38, height:38, borderRadius:11, objectFit:'contain', filter:'drop-shadow(0 2px 14px rgba(192,37,90,.5))' }} />
            <span style={{ fontSize:14, fontWeight:900, letterSpacing:'.22em', color:'rgba(255,255,255,.8)', textTransform:'uppercase' }}>CLUBSYNQ</span>
          </div>

          {/* Headline */}
          <div style={{ marginTop:56 }}>
            <h1 style={{ fontSize:'clamp(26px,2.8vw,40px)', fontWeight:900, lineHeight:.97, letterSpacing:'-2.5px', color:'#f3dddf', margin:'0 0 18px' }}>
              Your network.<br/>
              Your skills.<br/>
              <span style={{ background:'linear-gradient(135deg,#ff8fab 0%,#c0255a 38%,#9d1b4a 62%,#e9c176 100%)', backgroundSize:'200% auto', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>Your future.</span>
            </h1>
            <p style={{ fontSize:13.5, color:'rgba(243,221,223,.35)', lineHeight:1.75, maxWidth:260, margin:0 }}>
              One place for your social life, clubs, skills, and reputation.
            </p>
          </div>

          {/* Feature list */}
          <div style={{ marginTop:44, display:'flex', flexDirection:'column', gap:16 }}>
            {FEATURES.map((f, i) => (
              <div key={f.label} style={{ display:'flex', alignItems:'center', gap:13, animation:`authFeatIn .5s ${.1 + i * .08}s ease both`, opacity:0 }}>
                <div style={{ width:34, height:34, borderRadius:10, background:`${f.color}12`, border:`1px solid ${f.color}26`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, color:f.color, flexShrink:0 }}>{f.icon}</div>
                <div>
                  <div style={{ fontSize:12.5, fontWeight:700, color:'rgba(243,221,223,.68)', lineHeight:1.2 }}>{f.label}</div>
                  <div style={{ fontSize:11, color:'rgba(243,221,223,.25)', marginTop:2 }}>{f.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Badge */}
          <div style={{ marginTop:'auto', paddingTop:40, display:'inline-flex', alignItems:'center', gap:8, padding:'8px 16px', background:'rgba(138,21,56,.1)', border:'1px solid rgba(192,37,90,.2)', borderRadius:9999 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'#c0255a', display:'inline-block', boxShadow:'0 0 10px rgba(192,37,90,1)', animation:'authPulse 2s ease-in-out infinite', flexShrink:0 }} />
            <span style={{ fontSize:10.5, fontWeight:700, letterSpacing:'.12em', color:'rgba(243,221,223,.4)', textTransform:'uppercase' }}>Early Access Open</span>
          </div>
        </div>
      </div>

      {/* ══════════════ RIGHT PANEL ══════════════ */}
      <div className="auth-right" style={{ background:'#070311', display:'flex', alignItems:'center', justifyContent:'center', padding:'48px 40px', position:'relative', overflowY:'auto' }}>
        {/* Left separator */}
        <div style={{ position:'absolute', left:0, top:'10%', bottom:'10%', width:1, background:'linear-gradient(to bottom,transparent,rgba(87,65,68,.18) 30%,rgba(87,65,68,.18) 70%,transparent)' }} />

        {/* Subtle radial glow */}
        <div style={{ position:'absolute', top:'40%', left:'50%', transform:'translate(-50%,-50%)', width:500, height:400, background:'radial-gradient(ellipse,rgba(138,21,56,.08) 0%,transparent 70%)', pointerEvents:'none' }} />

        <div style={{ width:'100%', maxWidth:400, position:'relative', zIndex:1, animation:'authFadeUp .65s ease both' }}>
          {/* Mobile logo */}
          <div className="auth-mobile-logo" style={{ textAlign:'center', marginBottom:36 }}>
            <img src="/clubsynqlogo.png" alt="ClubSynq" style={{ width:52, height:52, borderRadius:15, objectFit:'contain', filter:'drop-shadow(0 4px 20px rgba(192,37,90,.5))' }} />
          </div>

          {/* Card */}
          <div style={{ padding:1, borderRadius:22, background:'linear-gradient(145deg,rgba(192,37,90,.26),rgba(138,21,56,.07) 50%,rgba(192,37,90,.16))' }}>
            <div style={{ background:'rgba(9,3,15,.98)', borderRadius:21, overflow:'hidden', boxShadow:'0 48px 96px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.04)' }}>
              {/* Top accent line */}
              <div style={{ height:2, background:'linear-gradient(90deg,transparent,rgba(192,37,90,.7) 30%,rgba(192,37,90,.7) 70%,transparent)' }} />
              <div style={{ padding:'34px 32px' }}>
                {children}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
