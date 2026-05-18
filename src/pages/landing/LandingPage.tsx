import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

// ── Data ──────────────────────────────────────────────────────────────────────

const FEATURES = [
  { icon:'◈', label:'Social Feed',      color:'#0ea5e9', tagline:'Your network, in real time',    desc:'Share updates, projects, and ideas publicly. Build your presence and connect with students who share your ambition.' },
  { icon:'⚡', label:'Skill Souq',       color:'#a855f7', tagline:'Trade skills, not money',        desc:'Offer what you know, get what you need. Python for design. Photography for dev. Real learning through real exchange.' },
  { icon:'♛', label:'Leadership Hub',   color:'#e9c176', tagline:'Run your club the right way',    desc:'Manage members, post announcements, plan events — all in one dashboard. Replace ten group chats with one tool.' },
  { icon:'◎', label:'Club Discovery',   color:'#38bdf8', tagline:'Find where you belong',          desc:'Browse every active student club. Filter by interest, skill, or field. Apply and join in seconds.' },
  { icon:'◉', label:'Co-Founder Match', color:'#22c55e', tagline:'Build something together',       desc:'Have the idea but need the tech? Have the skills but need a vision? Find the person who completes the equation.' },
  { icon:'✦', label:'Karak Points',     color:'#ec4899', tagline:'Every action rewarded',          desc:'Earn points for events, skill trades, and contributions. Build a public record that reflects your real impact.' },
]


const STEPS = [
  { num:'01', icon:'◉', title:'Create your profile',   sub:'List your skills. Show who you are beyond your grades.' },
  { num:'02', icon:'⚡', title:'Post, trade & join',    sub:'Share on the feed. Trade skills. Join clubs that matter.' },
  { num:'03', icon:'✦', title:'Build your reputation', sub:'Earn Karak Points. Leave a record that means something.' },
]

const FAQS = [
  { q:'Is ClubSynq free to use?',                   a:"Yes — completely free for students. Sign up, build your profile, join clubs, and start trading skills with zero cost. No hidden tiers." },
  { q:'What exactly is Skill Souq?',                a:'A peer-to-peer skill trading marketplace. Offer what you know, get what you need — Python for design, photography for video editing. No money changes hands, just knowledge.' },
  { q:'How do Karak Points work?',                  a:'You earn Karak Points for meaningful activity: attending events, completing skill trades, joining clubs, and contributing to your community. Points build a public reputation score that actually means something.' },
  { q:'Can I manage my club on ClubSynq?',          a:'Yes. The Leadership Hub gives club officers a full dashboard — post announcements, track members, plan events, and handle applications. Replace your WhatsApp groups and Google Forms for good.' },
  { q:'What is Co-Founder Match?',                  a:"A matching system for student builders. Have an idea but need a tech partner? Have skills but need a vision? We connect you based on complementary strengths and shared ambition." },
  { q:'Is there a mobile app?',                     a:'ClubSynq is fully responsive and works in any mobile browser right now. A native iOS and Android app is on the roadmap — early access members get notified first.' },
]

const MARQUEE_ITEMS = [
  { icon:'◈', label:'Social Feed', color:'#0ea5e9' },
  { icon:'⚡', label:'Skill Souq', color:'#a855f7' },
  { icon:'♛', label:'Leadership Hub', color:'#e9c176' },
  { icon:'◎', label:'Club Discovery', color:'#38bdf8' },
  { icon:'◉', label:'Co-Founder Match', color:'#22c55e' },
  { icon:'✦', label:'Karak Points', color:'#ec4899' },
]

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useMouseParallax() {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  useEffect(() => {
    const h = (e: MouseEvent) => setPos({
      x: e.clientX / window.innerWidth - 0.5,
      y: e.clientY / window.innerHeight - 0.5,
    })
    window.addEventListener('mousemove', h, { passive: true })
    return () => window.removeEventListener('mousemove', h)
  }, [])
  return pos
}

function useScrollReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } }, { threshold })
    obs.observe(el); return () => obs.disconnect()
  }, [threshold])
  return { ref, visible }
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => { if (!loading && session) navigate('/discovery', { replace: true }) }, [session, loading, navigate])
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 48)
    window.addEventListener('scroll', h, { passive: true }); return () => window.removeEventListener('scroll', h)
  }, [])

  if (loading || session) return null

  return (
    <div className="lnd-root" style={{ minHeight:'100vh', background:'#05020a', color:'#f3dddf', fontFamily:"'Be Vietnam Pro', sans-serif", overflowX:'hidden' }}>
      <LandingStyles />
      <LandingNav scrolled={scrolled} />
      <HeroSection />
      <FeatureMarquee />
      <MockShowcaseSection />
      <ProblemSection />
      <FeaturesSection />
      <HowItWorksSection />
      <FAQSection />
      <ContactSection />
      <CTASection />
      <LandingFooter />
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

function LandingStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,700&display=swap');
      *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }

      /* Grain noise overlay */
      .lnd-root { position:relative; isolation:isolate; }
      .lnd-root::before {
        content:''; position:fixed; inset:0; pointer-events:none; z-index:8000;
        opacity:.038; mix-blend-mode:soft-light;
        background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
      }

      @keyframes lFadeUp    { from{opacity:0;transform:translateY(32px)} to{opacity:1;transform:none} }
      @keyframes lWordIn    { from{opacity:0;transform:translateY(60px) skewY(6deg);filter:blur(10px)} to{opacity:1;transform:none;filter:blur(0)} }
      @keyframes lBadgePop  { 0%{opacity:0;transform:scale(.72) translateY(12px)} 72%{transform:scale(1.04) translateY(-2px)} 100%{opacity:1;transform:scale(1)} }
      @keyframes lCardIn    { from{opacity:0;transform:translateY(32px) scale(.97)} to{opacity:1;transform:none} }
      @keyframes lGradient  { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
      @keyframes lShimmer   { 0%{background-position:200% center} 100%{background-position:-200% center} }
      @keyframes lPulse     { 0%,100%{opacity:.35;transform:scale(1)} 50%{opacity:1;transform:scale(1.6)} }
      @keyframes lRing      { 0%{transform:scale(.8);opacity:.7} 100%{transform:scale(2.6);opacity:0} }
      @keyframes lFloat     { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
      @keyframes lFloatSlow { 0%,100%{transform:translateY(0) rotate(-1.5deg)} 50%{transform:translateY(-8px) rotate(1.5deg)} }
      @keyframes lOrb1      { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(40px,-30px) scale(1.1)} 66%{transform:translate(-20px,18px) scale(.93)} }
      @keyframes lOrb2      { 0%,100%{transform:translate(0,0) scale(1)} 45%{transform:translate(-28px,22px) scale(1.07)} 75%{transform:translate(18px,-14px) scale(.96)} }
      @keyframes lMarquee   { from{transform:translateX(0)} to{transform:translateX(-50%)} }
      @keyframes lStepIn    { from{opacity:0;transform:translateX(-24px)} to{opacity:1;transform:none} }
      @keyframes lMockIn    { from{opacity:0;transform:translateY(40px) scale(.97)} to{opacity:1;transform:none} }
      @keyframes lProbIn    { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }
      @keyframes lGlow      { 0%,100%{opacity:.48} 50%{opacity:.9} }
      @keyframes lSpotlight { 0%,100%{opacity:.6;transform:translateX(-50%) scale(1)} 50%{opacity:.85;transform:translateX(-50%) scale(1.08)} }

      .lnd-btn-primary {
        position:relative; overflow:hidden;
        background:linear-gradient(135deg,#6e1030 0%,#8a1538 40%,#c0255a 70%,#8a1538 100%);
        background-size:300% auto; animation:lShimmer 7s linear infinite;
        border:none; border-radius:14px; color:#fff;
        font-family:'Be Vietnam Pro',sans-serif; font-size:15px; font-weight:700; letter-spacing:.04em;
        padding:14px 34px; cursor:pointer;
        box-shadow:0 8px 40px rgba(138,21,56,.5),0 0 0 1px rgba(192,37,90,.35),inset 0 1px 0 rgba(255,255,255,.15);
        transition:transform .22s,box-shadow .22s;
      }
      .lnd-btn-primary::after {
        content:''; position:absolute; top:0; left:0; right:0; height:50%;
        background:linear-gradient(to bottom,rgba(255,255,255,.13),transparent);
        pointer-events:none; border-radius:14px 14px 0 0;
      }
      .lnd-btn-primary:hover { transform:translateY(-3px) scale(1.025); box-shadow:0 28px 72px rgba(138,21,56,.75),0 0 0 1px rgba(192,37,90,.6),inset 0 1px 0 rgba(255,255,255,.2); }

      .lnd-btn-ghost {
        position:relative; overflow:hidden;
        background:rgba(255,255,255,.045); border:1px solid rgba(255,255,255,.12); border-radius:14px;
        color:rgba(243,221,223,.72); font-family:'Be Vietnam Pro',sans-serif; font-size:15px; font-weight:600;
        padding:14px 34px; cursor:pointer; backdrop-filter:blur(20px); transition:all .22s;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.08);
      }
      .lnd-btn-ghost:hover { background:rgba(255,255,255,.1); border-color:rgba(255,255,255,.25); color:#fff; transform:translateY(-3px); box-shadow:0 16px 48px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.12); }

      .lnd-nav-link { color:rgba(243,221,223,.42); font-size:13.5px; font-weight:500; cursor:pointer; background:none; border:none; font-family:'Be Vietnam Pro',sans-serif; padding:0; transition:color .15s; letter-spacing:.01em; }
      .lnd-nav-link:hover { color:rgba(243,221,223,.92); }

      .lnd-gradient-text {
        background:linear-gradient(135deg,#ffb3c8 0%,#e0356e 30%,#9d1b4a 58%,#f0c874 100%);
        background-size:220% auto; -webkit-background-clip:text; -webkit-text-fill-color:transparent;
        background-clip:text; animation:lGradient 5s ease infinite;
      }

      .lnd-feat-card { transition:box-shadow .28s,border-color .28s,background .28s; will-change:transform; }

      .lnd-marquee-pill {
        display:inline-flex; align-items:center; gap:9px;
        padding:9px 22px; border-right:1px solid rgba(87,65,68,.12);
        transition:background .2s;
      }
      .lnd-marquee-pill:hover { background:rgba(255,255,255,.03); }

      .lnd-input::placeholder, .lnd-textarea::placeholder { color:rgba(243,221,223,.2); }
      .lnd-input, .lnd-textarea { color-scheme:dark; }
      .lnd-contact-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }

      .lnd-faq-item { border-bottom:1px solid rgba(87,65,68,.12); }
      .lnd-faq-btn  { width:100%; display:flex; align-items:center; justify-content:space-between; padding:22px 0; background:none; border:none; cursor:pointer; font-family:'Be Vietnam Pro',sans-serif; text-align:left; }
      .lnd-faq-body { overflow:hidden; transition:max-height .38s cubic-bezier(.4,0,.2,1), opacity .28s; }

      /* ── Tablet (≤ 960px) ── */
      @media (max-width:960px) {
        .lnd-hero-h1           { font-size:clamp(44px,10vw,72px) !important; letter-spacing:-2.5px !important; }
        .lnd-feat-grid         { grid-template-columns:1fr 1fr !important; }
        .lnd-prob-compare      { grid-template-columns:1fr !important; }
        .lnd-prob-divider      { display:none !important; }
        .lnd-steps-row         { flex-direction:column !important; gap:36px !important; }
        .lnd-step-conn         { display:none !important; }
        .lnd-cta-inner         { padding:48px 28px !important; }
        .lnd-nav-links         { display:none !important; }
        .lnd-mock-float        { display:none !important; }
        .lnd-mock-tilt         { transform:none !important; }
        .lnd-mock-rsidebar     { display:none !important; }
        .lnd-mock-frame        { height:520px !important; }
        .lnd-mock-topbar-create{ display:none !important; }
      }

      /* ── Phone (≤ 600px) ── */
      @media (max-width:600px) {
        .lnd-contact-grid { grid-template-columns:1fr !important; }
        .lnd-hero-h1           { font-size:clamp(34px,9vw,52px) !important; letter-spacing:-1.8px !important; }
        .lnd-feat-grid         { grid-template-columns:1fr !important; }
        .lnd-prob-grid         { grid-template-columns:1fr 1fr !important; }
        .lnd-cta-inner         { padding:36px 20px !important; }
        .lnd-hero-btns         { flex-direction:column !important; align-items:stretch !important; }
        .lnd-hero-btns button  { width:100% !important; }
        .lnd-nav-signin        { display:none !important; }
        .lnd-nav               { padding:0 20px !important; }
        .lnd-mock-lsidebar     { width:48px !important; }
        .lnd-mock-nav-label    { display:none !important; }
        .lnd-mock-topbar-search{ display:none !important; }
        .lnd-mock-tab2         { display:none !important; }
        .lnd-mock-frame        { height:460px !important; }
        .lnd-mock-outer        { margin:0 -12px !important; }
      }
    `}</style>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function SectionEyebrow({ text, mb = 12 }: { text: string; mb?: number }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:14, justifyContent:'center', marginBottom:mb }}>
      <div style={{ flex:1, maxWidth:52, height:1, background:'linear-gradient(90deg,transparent,rgba(192,37,90,.45))' }} />
      <p style={{ fontSize:11, fontWeight:800, letterSpacing:'.16em', color:'rgba(192,37,90,.65)', textTransform:'uppercase', whiteSpace:'nowrap' }}>{text}</p>
      <div style={{ flex:1, maxWidth:52, height:1, background:'linear-gradient(90deg,rgba(192,37,90,.45),transparent)' }} />
    </div>
  )
}

// ── Nav ───────────────────────────────────────────────────────────────────────

function LandingNav({ scrolled }: { scrolled:boolean }) {
  return (
    <nav className="lnd-nav" style={{ position:'fixed', top:0, left:0, right:0, zIndex:200, padding:'0 36px', height:64, display:'flex', alignItems:'center', justifyContent:'space-between', background:scrolled?'rgba(5,2,10,0.86)':'transparent', backdropFilter:scrolled?'blur(32px) saturate(200%)':'none', borderBottom:scrolled?'1px solid rgba(192,37,90,.14)':'1px solid transparent', boxShadow:scrolled?'0 1px 0 rgba(192,37,90,.06),0 8px 32px rgba(0,0,0,.24)':'none', transition:'all .4s' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }} onClick={() => window.scrollTo({ top:0, behavior:'smooth' })}>
        <img src="/clubsynqlogo.png" alt="ClubSynq" style={{ width:44, height:44, borderRadius:10, objectFit:'contain' }} />
      </div>
      <div className="lnd-nav-links" style={{ display:'flex', alignItems:'center', gap:36 }}>
        {[['Features','features'],['How it Works','how-it-works'],['FAQ','faq']].map(([label,id]) => (
          <button key={label} className="lnd-nav-link" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior:'smooth' })}>{label}</button>
        ))}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 16px', background:'rgba(192,37,90,.08)', border:'1px solid rgba(192,37,90,.28)', borderRadius:9999 }}>
        <span style={{ width:7, height:7, borderRadius:'50%', background:'#c0255a', display:'inline-block', boxShadow:'0 0 8px rgba(192,37,90,1)', animation:'lPulse 2s ease-in-out infinite', flexShrink:0 }} />
        <span style={{ fontSize:12.5, fontWeight:700, letterSpacing:'.08em', color:'rgba(243,221,223,.75)', whiteSpace:'nowrap' }}>Launching May 22</span>
      </div>
    </nav>
  )
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function HeroSection() {
  const mouse = useMouseParallax()
  return (
    <section style={{ minHeight:'100vh', position:'relative', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', textAlign:'center', padding:'120px clamp(20px,5vw,64px) 80px', overflow:'hidden' }}>
      {/* Dot grid - subtle parallax */}
      <div style={{ position:'absolute', inset:0, backgroundImage:'radial-gradient(rgba(192,37,90,.12) 1px,transparent 1px)', backgroundSize:'30px 30px', maskImage:'radial-gradient(ellipse 70% 70% at 50% 50%,black 20%,transparent 100%)', WebkitMaskImage:'radial-gradient(ellipse 70% 70% at 50% 50%,black 20%,transparent 100%)', zIndex:0, transform:`translate(${mouse.x * 12}px, ${mouse.y * 12}px)`, transition:'transform 1.2s cubic-bezier(.22,1,.36,1)' }} />
      {/* Orbs - each layer moves at different speed for depth */}
      <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none', zIndex:0 }}>
        <div style={{ position:'absolute', top:'-12%', left:'5%', transition:'transform 1s cubic-bezier(.22,1,.36,1)', transform:`translate(${mouse.x * 55}px, ${mouse.y * 40}px)` }}>
          <div style={{ width:900, height:580, background:'radial-gradient(ellipse,rgba(160,24,64,.46) 0%,transparent 60%)', animation:'lOrb1 24s ease-in-out infinite', filter:'blur(1px)' }} />
        </div>
        <div style={{ position:'absolute', top:'38%', right:'2%', transition:'transform 1.4s cubic-bezier(.22,1,.36,1)', transform:`translate(${mouse.x * -38}px, ${mouse.y * -28}px)` }}>
          <div style={{ width:620, height:480, background:'radial-gradient(ellipse,rgba(100,10,48,.28) 0%,transparent 60%)', animation:'lOrb2 30s ease-in-out 5s infinite', filter:'blur(1px)' }} />
        </div>
        <div style={{ position:'absolute', bottom:'-10%', left:'35%', width:500, height:280, background:'radial-gradient(ellipse,rgba(138,21,56,.14) 0%,transparent 65%)', transition:'transform 1.8s cubic-bezier(.22,1,.36,1)', transform:`translate(${mouse.x * 22}px, ${mouse.y * 18}px)` }} />
      </div>
      {/* Center spotlight behind headline */}
      <div style={{ position:'absolute', top:'18%', left:'50%', width:800, height:380, background:'radial-gradient(ellipse,rgba(138,21,56,.3) 0%,transparent 68%)', transform:'translateX(-50%)', pointerEvents:'none', animation:'lSpotlight 8s ease-in-out infinite', zIndex:0, filter:'blur(4px)' }} />

      <div style={{ position:'relative', zIndex:1, maxWidth:860, width:'100%' }}>
        {/* Badge */}
        <div style={{ marginBottom:40, animation:'lBadgePop .7s ease both' }}>
          <div style={{ display:'inline-block', padding:1, borderRadius:9999, background:'linear-gradient(135deg,rgba(192,37,90,.7) 0%,rgba(138,21,56,.25) 50%,rgba(192,37,90,.5) 100%)' }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:9, padding:'8px 22px', background:'rgba(5,2,10,.93)', borderRadius:9999, backdropFilter:'blur(16px)' }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background:'#c0255a', display:'inline-block', boxShadow:'0 0 14px rgba(192,37,90,1)', animation:'lPulse 2s ease-in-out infinite' }} />
              <span style={{ fontSize:12, fontWeight:800, letterSpacing:'.14em', color:'#e0aab4', textTransform:'uppercase' }}>Early Access Now Open</span>
            </div>
          </div>
        </div>

        {/* Headline */}
        <h1 className="lnd-hero-h1" style={{ fontSize:'clamp(52px,8.5vw,112px)', fontWeight:900, lineHeight:.93, letterSpacing:'-0.04em', marginBottom:32 }}>
          {([
            { w:'Your network.',  accent:false, delay:.08 },
            { w:'Your skills.',   accent:false, delay:.20 },
            { w:'Your future.',   accent:true,  delay:.33 },
          ] as {w:string;accent:boolean;delay:number}[]).map(({ w, accent, delay }) => (
            <span key={w} style={{ display:'block', animation:`lWordIn .8s ${delay}s cubic-bezier(.22,1,.36,1) both` }}>
              <span style={accent ? { background:'linear-gradient(135deg,#ff8fab 0%,#c0255a 38%,#9d1b4a 62%,#e9c176 100%)', backgroundSize:'200% auto', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text', animation:'lGradient 5s ease infinite' } : { color:'#f3dddf' }}>{w}</span>
            </span>
          ))}
        </h1>

        {/* Subline */}
        <p style={{ fontSize:'clamp(15px,1.8vw,19px)', color:'rgba(243,221,223,.42)', lineHeight:1.8, maxWidth:580, margin:'0 auto 52px', animation:'lFadeUp .7s .5s ease both' }}>
          ClubSynq is the first platform built for the full student experience — social network, skill trading, club management, co-founder matching, and gamified reputation. All in one place.
        </p>

        {/* Launch badge */}
        <div style={{ display:'inline-flex', alignItems:'center', gap:12, padding:'14px 32px', background:'rgba(192,37,90,.07)', border:'1px solid rgba(192,37,90,.25)', borderRadius:16, animation:'lFadeUp .7s .65s ease both', backdropFilter:'blur(8px)' }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:'#c0255a', display:'inline-block', boxShadow:'0 0 10px rgba(192,37,90,1)', animation:'lPulse 2s ease-in-out infinite', flexShrink:0 }} />
          <span style={{ fontSize:16, fontWeight:700, color:'rgba(243,221,223,.8)', letterSpacing:'.04em' }}>Launching May 22nd — Stay tuned</span>
        </div>
      </div>
    </section>
  )
}

// ── Feature Marquee ───────────────────────────────────────────────────────────

function FeatureMarquee() {
  const doubled = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS, ...MARQUEE_ITEMS, ...MARQUEE_ITEMS]
  return (
    <div style={{ position:'relative', overflow:'hidden', padding:'20px 0', borderTop:'1px solid rgba(87,65,68,.1)', borderBottom:'1px solid rgba(87,65,68,.1)', background:'rgba(0,0,0,.25)', maskImage:'linear-gradient(90deg,transparent,black 10%,black 90%,transparent)', WebkitMaskImage:'linear-gradient(90deg,transparent,black 10%,black 90%,transparent)' }}>
      <div style={{ display:'inline-flex', gap:0, animation:'lMarquee 28s linear infinite', whiteSpace:'nowrap' }}>
        {doubled.map((item, i) => (
          <div key={i} className="lnd-marquee-pill">
            <span style={{ width:6, height:6, borderRadius:'50%', background:item.color, display:'inline-block', boxShadow:`0 0 8px ${item.color}` }} />
            <span style={{ fontSize:11, fontWeight:700, letterSpacing:'.12em', color:'rgba(243,221,223,.35)', textTransform:'uppercase' }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Mock UI Components ────────────────────────────────────────────────────────

function MockPost({ initials, name, sub, badge, time, content, color, liked=false, round=true }: {
  initials:string; name:string; sub?:string; badge?:string; time:string; content:string; color:string; liked?:boolean; round?:boolean
}) {
  return (
    <div style={{ display:'flex', gap:11, padding:'14px 18px' }}>
      <div style={{ width:36, height:36, borderRadius:round?'50%':10, background:`${color}18`, border:`1.5px solid ${color}35`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color, flexShrink:0 }}>{initials}</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:5 }}>
          <span style={{ fontSize:12.5, fontWeight:700, color:'#f3dddf' }}>{name}</span>
          {sub && <span style={{ fontSize:10.5, color:'rgba(243,221,223,.24)' }}>{sub}</span>}
          {badge && <span style={{ fontSize:8.5, fontWeight:800, color, background:`${color}16`, border:`1px solid ${color}28`, borderRadius:9999, padding:'2px 7px', letterSpacing:'.07em', textTransform:'uppercase' }}>{badge}</span>}
          <span style={{ fontSize:10, color:'rgba(243,221,223,.16)', marginLeft:'auto', flexShrink:0 }}>{time}</span>
        </div>
        <p style={{ fontSize:12, color:'rgba(243,221,223,.55)', lineHeight:1.68, margin:'0 0 10px', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{content}</p>
        <div style={{ display:'flex', alignItems:'center', gap:18 }}>
          <span style={{ fontSize:10.5, color:liked?'#c0255a':'rgba(243,221,223,.22)', fontWeight:600, display:'flex', alignItems:'center', gap:4 }}><span>{liked?'♥':'♡'}</span><span>Like</span></span>
          <span style={{ fontSize:10.5, color:'rgba(243,221,223,.22)', fontWeight:600, display:'flex', alignItems:'center', gap:4 }}><span>◻</span><span>Comment</span></span>
          <span style={{ fontSize:10.5, color:'rgba(243,221,223,.22)', fontWeight:600, display:'flex', alignItems:'center', gap:4 }}><span>↺</span><span>Repost</span></span>
          <span style={{ fontSize:10.5, color:'rgba(243,221,223,.22)', fontWeight:600, marginLeft:'auto' }}>📤</span>
        </div>
      </div>
    </div>
  )
}

function MockUI() {
  const NAV = [
    { icon:'⌂', label:'Feed',        active:true,  notif:false },
    { icon:'◎', label:'Discover',    active:false, notif:false },
    { icon:'⚡', label:'Skill Souq', active:false, notif:true  },
    { icon:'♛', label:'Clubs',       active:false, notif:false },
    { icon:'✉', label:'Messages',   active:false, notif:true  },
    { icon:'◉', label:'Match',       active:false, notif:false },
  ]
  return (
    <div style={{ width:'100%', height:'100%', background:'#080508', display:'flex', flexDirection:'column', overflow:'hidden' }}>

      {/* Browser chrome */}
      <div style={{ display:'flex', alignItems:'center', padding:'10px 18px', gap:14, background:'rgba(3,1,4,.97)', borderBottom:'1px solid rgba(87,65,68,.14)', flexShrink:0 }}>
        <div style={{ display:'flex', gap:6 }}>
          {['#ff5f57','#febc2e','#28c840'].map(c => <div key={c} style={{ width:11, height:11, borderRadius:'50%', background:c, opacity:.9 }} />)}
        </div>
        {/* Tabs */}
        <div style={{ display:'flex', gap:2, flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,.075)', borderRadius:'8px 8px 0 0', padding:'6px 18px', border:'1px solid rgba(255,255,255,.085)', borderBottom:'none' }}>
            <img src="/clubsynqlogo.png" alt="" style={{ width:13, height:13, borderRadius:3, objectFit:'contain' }} />
            <span style={{ fontSize:10.5, color:'rgba(243,221,223,.52)', fontWeight:500 }}>CLUBSYNQ · Feed</span>
            <span style={{ fontSize:9, color:'rgba(243,221,223,.18)', marginLeft:4 }}>✕</span>
          </div>
          <div className="lnd-mock-tab2" style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,.025)', borderRadius:'8px 8px 0 0', padding:'6px 16px', border:'1px solid rgba(255,255,255,.04)', borderBottom:'none' }}>
            <span style={{ fontSize:10.5, color:'rgba(243,221,223,.2)', fontWeight:500 }}>CLUBSYNQ · Clubs</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', width:28, height:28, alignSelf:'flex-end', color:'rgba(243,221,223,.2)', fontSize:15, borderRadius:6, background:'rgba(255,255,255,.03)', marginBottom:2 }}>+</div>
        </div>
        {/* URL bar */}
        <div style={{ display:'flex', alignItems:'center', gap:7, background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.07)', borderRadius:7, padding:'5px 16px', width:220 }}>
          <span style={{ fontSize:9.5, opacity:.35 }}>🔒</span>
          <span style={{ fontSize:10.5, color:'rgba(243,221,223,.28)' }}>clubsynq.com/feed</span>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {['←','→','↻'].map(a => <span key={a} style={{ fontSize:12, color:'rgba(243,221,223,.2)', cursor:'default' }}>{a}</span>)}
        </div>
      </div>

      {/* App topbar */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 20px', background:'rgba(6,3,8,.99)', borderBottom:'1px solid rgba(87,65,68,.13)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:9 }}>
          <img src="/clubsynqlogo.png" alt="ClubSynq" style={{ width:28, height:28, borderRadius:8, objectFit:'contain', boxShadow:'0 2px 14px rgba(138,21,56,.5)' }} />
          <span style={{ fontSize:13, fontWeight:900, letterSpacing:'.2em', color:'rgba(255,255,255,.82)', textTransform:'uppercase' }}>CLUBSYNQ</span>
        </div>
        {/* Search */}
        <div className="lnd-mock-topbar-search" style={{ flex:1, display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.07)', borderRadius:10, padding:'7px 14px', maxWidth:280 }}>
          <span style={{ fontSize:10, opacity:.3 }}>🔍</span>
          <span style={{ fontSize:11, color:'rgba(243,221,223,.22)' }}>Search students, clubs, skills…</span>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:10 }}>
          {/* Create */}
          <div className="lnd-mock-topbar-create" style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(138,21,56,.3)', border:'1px solid rgba(192,37,90,.22)', borderRadius:9, padding:'6px 14px', cursor:'default' }}>
            <span style={{ fontSize:12, color:'rgba(192,37,90,.8)', fontWeight:900 }}>+</span>
            <span style={{ fontSize:11, color:'rgba(243,221,223,.5)', fontWeight:600 }}>Create</span>
          </div>
          {/* Bell */}
          <div style={{ position:'relative', width:32, height:32, borderRadius:9, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.07)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>
            🔔
            <div style={{ position:'absolute', top:5, right:5, width:7, height:7, borderRadius:'50%', background:'#c0255a', border:'2px solid rgba(6,3,8,.99)', boxShadow:'0 0 10px rgba(192,37,90,1)' }} />
          </div>
          {/* Avatar */}
          <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,rgba(138,21,56,.8),rgba(192,37,90,.5))', border:'2px solid rgba(192,37,90,.45)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:800, color:'#f3dddf' }}>AK</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

        {/* Left sidebar */}
        <div className="lnd-mock-lsidebar" style={{ width:76, background:'rgba(4,2,6,.95)', borderRight:'1px solid rgba(87,65,68,.09)', display:'flex', flexDirection:'column', alignItems:'center', padding:'14px 0 12px', gap:2, flexShrink:0 }}>
          <img src="/clubsynqlogo.png" alt="" style={{ width:32, height:32, borderRadius:9, objectFit:'contain', marginBottom:14, opacity:.65 }} />
          {NAV.map((item,i) => (
            <div key={i} style={{ position:'relative', width:52, marginBottom:2, borderRadius:12, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'7px 4px', gap:4, background:item.active?'rgba(138,21,56,.2)':'transparent', cursor:'default' }}>
              <span style={{ fontSize:item.icon==='⌂'?18:14, color:item.active?'#c0255a':'rgba(243,221,223,.2)', lineHeight:1 }}>{item.icon}</span>
              <span className="lnd-mock-nav-label" style={{ fontSize:8.5, fontWeight:600, color:item.active?'rgba(192,37,90,.75)':'rgba(243,221,223,.16)', letterSpacing:'.03em', lineHeight:1 }}>{item.label}</span>
              {item.active && <div style={{ position:'absolute', left:0, top:'22%', bottom:'22%', width:3, borderRadius:'0 2px 2px 0', background:'#c0255a' }} />}
              {item.notif && <div style={{ position:'absolute', top:7, right:8, width:6, height:6, borderRadius:'50%', background:'#c0255a', border:'1.5px solid rgba(4,2,6,.95)', boxShadow:'0 0 6px rgba(192,37,90,.8)' }} />}
            </div>
          ))}
          <div style={{ flex:1 }} />
          <div style={{ width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg,rgba(138,21,56,.55),rgba(192,37,90,.35))', border:'2px solid rgba(138,21,56,.45)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:800, color:'#f3dddf' }}>AK</div>
        </div>

        {/* Feed column */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
          {/* Feed tabs */}
          <div style={{ display:'flex', alignItems:'center', borderBottom:'1px solid rgba(87,65,68,.1)', flexShrink:0, paddingLeft:4 }}>
            {['For You','Following','Clubs','Events'].map((tab,i) => (
              <div key={tab} style={{ padding:'11px 16px', fontSize:12, fontWeight:i===0?700:500, color:i===0?'#f3dddf':'rgba(243,221,223,.28)', borderBottom:`2px solid ${i===0?'#c0255a':'transparent'}`, cursor:'default', whiteSpace:'nowrap', marginBottom:-1 }}>{tab}</div>
            ))}
          </div>

          {/* Compose */}
          <div style={{ padding:'13px 18px 11px', borderBottom:'1px solid rgba(87,65,68,.09)', flexShrink:0 }}>
            <div style={{ display:'flex', gap:10 }}>
              <div style={{ width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg,rgba(138,21,56,.55),rgba(192,37,90,.35))', border:'2px solid rgba(138,21,56,.42)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:800, color:'#f3dddf', flexShrink:0 }}>AK</div>
              <div style={{ flex:1 }}>
                <div style={{ background:'rgba(255,255,255,.04)', border:'1px solid rgba(87,65,68,.14)', borderRadius:12, padding:'9px 14px', fontSize:12, color:'rgba(243,221,223,.2)', marginBottom:10 }}>What's on your mind?</div>
                <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                  {[['🖼','Photo'],['📊','Poll'],['⚡','Skill']].map(([ic,lb]) => (
                    <span key={lb} style={{ fontSize:10.5, color:'rgba(243,221,223,.24)', display:'flex', alignItems:'center', gap:4 }}><span>{ic}</span><span>{lb}</span></span>
                  ))}
                  <span style={{ fontSize:10.5, color:'rgba(168,85,247,.6)', display:'flex', alignItems:'center', gap:4 }}><span>✨</span><span>AI Write</span></span>
                  <div style={{ marginLeft:'auto', background:'linear-gradient(135deg,#8a1538,#c0255a)', borderRadius:9, padding:'5px 16px', fontSize:11, fontWeight:700, color:'rgba(255,255,255,.65)' }}>Post</div>
                </div>
              </div>
            </div>
          </div>

          {/* Posts */}
          <div style={{ flex:1, position:'relative', overflow:'hidden' }}>
            <MockPost initials="AK" name="Ahmad K." sub="Computer Science" time="2m ago" liked content="Just finished a Python skill trade with Sara — she helped me build my first React app, I helped with her ML project 🔥 The Skill Souq literally works." color="#c0255a" />
            <div style={{ height:1, background:'rgba(87,65,68,.08)', margin:'0 18px' }} />
            <MockPost initials="PC" name="Photography Club" badge="Official Club" time="18m ago" content="📸 Rooftop golden hour shoot this Friday 6PM. All levels welcome — RSVP in the club hub to get the location pin and packing list." color="#0ea5e9" round={false} />
            <div style={{ height:1, background:'rgba(87,65,68,.08)', margin:'0 18px' }} />
            <MockPost initials="NR" name="Noura R." sub="Business · Finance" time="1h ago" content="Looking for a technical co-founder for my FinTech idea. I have the deck, the research, and the drive — DM me if you're in." color="#22c55e" />
            <div style={{ height:1, background:'rgba(87,65,68,.08)', margin:'0 18px' }} />
            <MockPost initials="FA" name="Fahad A." sub="Engineering · Year 3" time="3h ago" content="Earned 120 Karak Points this week from two skill trades and the robotics workshop. Grind never stops 🏆" color="#e9c176" />
            <div style={{ position:'absolute', bottom:0, left:0, right:0, height:100, background:'linear-gradient(to bottom,transparent,#080508)', pointerEvents:'none' }} />
          </div>
        </div>

        {/* Right sidebar */}
        <div className="lnd-mock-rsidebar" style={{ width:196, borderLeft:'1px solid rgba(87,65,68,.09)', padding:'16px 13px', display:'flex', flexDirection:'column', gap:14, flexShrink:0, overflow:'hidden' }}>

          {/* Trending Clubs */}
          <div>
            <div style={{ fontSize:9.5, fontWeight:800, color:'rgba(243,221,223,.22)', letterSpacing:'.12em', textTransform:'uppercase', marginBottom:11 }}>Trending Clubs</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {[{name:'Robotics Society',members:'48 members',color:'#0ea5e9'},{name:'Debate Club',members:'32 members',color:'#a855f7'},{name:'FinTech Circle',members:'29 members',color:'#e9c176'}].map(c => (
                <div key={c.name} style={{ display:'flex', alignItems:'center', gap:9 }}>
                  <div style={{ width:28, height:28, borderRadius:8, background:`${c.color}14`, border:`1px solid ${c.color}28`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:c.color, flexShrink:0 }}>♛</div>
                  <div>
                    <div style={{ fontSize:11, color:'rgba(243,221,223,.45)', fontWeight:600, lineHeight:1.2 }}>{c.name}</div>
                    <div style={{ fontSize:9.5, color:'rgba(243,221,223,.2)', marginTop:2 }}>{c.members}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ height:1, background:'rgba(87,65,68,.09)' }} />

          {/* Skill Souq */}
          <div>
            <div style={{ fontSize:9.5, fontWeight:800, color:'rgba(243,221,223,.22)', letterSpacing:'.12em', textTransform:'uppercase', marginBottom:11 }}>Skill Souq</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {[{skill:'UI Design',want:'Python',user:'Sara M.'},{skill:'Video Editing',want:'Web Dev',user:'Omar K.'},{skill:'Photography',want:'Marketing',user:'Lina R.'}].map(s => (
                <div key={s.skill} style={{ background:'rgba(168,85,247,.055)', border:'1px solid rgba(168,85,247,.14)', borderRadius:9, padding:'8px 10px' }}>
                  <div style={{ fontSize:11, color:'#c084fc', fontWeight:700 }}>{s.skill} → {s.want}</div>
                  <div style={{ fontSize:9.5, color:'rgba(243,221,223,.25)', marginTop:3 }}>by {s.user}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ height:1, background:'rgba(87,65,68,.09)' }} />

          {/* Co-Founder Match */}
          <div>
            <div style={{ fontSize:9.5, fontWeight:800, color:'rgba(243,221,223,.22)', letterSpacing:'.12em', textTransform:'uppercase', marginBottom:11 }}>Co-Founder Match</div>
            <div style={{ background:'rgba(34,197,94,.055)', border:'1px solid rgba(34,197,94,.18)', borderRadius:10, padding:'11px' }}>
              <div style={{ fontSize:10.5, color:'rgba(34,197,94,.9)', fontWeight:700, marginBottom:5 }}>◉ New match ready</div>
              <div style={{ fontSize:11, color:'rgba(243,221,223,.42)', lineHeight:1.55 }}>Noura R. is looking for a tech co-founder for her FinTech concept</div>
              <div style={{ marginTop:8, fontSize:10, color:'rgba(34,197,94,.75)', fontWeight:600 }}>View profile →</div>
            </div>
          </div>

          <div style={{ height:1, background:'rgba(87,65,68,.09)' }} />

          {/* Karak Leaderboard */}
          <div>
            <div style={{ fontSize:9.5, fontWeight:800, color:'rgba(243,221,223,.22)', letterSpacing:'.12em', textTransform:'uppercase', marginBottom:11 }}>Karak Leaders</div>
            {[{init:'FA',name:'Fahad A.',pts:'840 pts',rank:'1',color:'#e9c176'},{init:'NR',name:'Noura R.',pts:'720 pts',rank:'2',color:'#f3dddf'},{init:'AK',name:'Ahmad K.',pts:'680 pts',rank:'3',color:'#cd7c3a'}].map(u => (
              <div key={u.init} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <span style={{ fontSize:10, fontWeight:800, color:u.color, width:14, textAlign:'center' }}>{u.rank}</span>
                <div style={{ width:24, height:24, borderRadius:'50%', background:`${u.color}16`, border:`1px solid ${u.color}28`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:800, color:u.color }}>{u.init}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:10.5, color:'rgba(243,221,223,.45)', fontWeight:600, lineHeight:1 }}>{u.name}</div>
                  <div style={{ fontSize:9.5, color:'rgba(243,221,223,.22)', marginTop:2 }}>{u.pts}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Mock Showcase Section ─────────────────────────────────────────────────────

function MockShowcaseSection() {
  const { ref, visible } = useScrollReveal(.06)
  const sectionRef = useRef<HTMLElement>(null)
  const [mockTilt, setMockTilt] = useState({ rx: 5, ry: 0 })

  const onSectionMove = (e: React.MouseEvent<HTMLElement>) => {
    const el = sectionRef.current; if (!el) return
    const r = el.getBoundingClientRect()
    const nx = (e.clientX - r.left) / r.width - 0.5
    const ny = (e.clientY - r.top) / r.height - 0.5
    setMockTilt({ rx: 5 + ny * -5, ry: nx * 8 })
  }
  const onSectionLeave = () => setMockTilt({ rx: 5, ry: 0 })

  return (
    <section ref={sectionRef} onMouseMove={onSectionMove} onMouseLeave={onSectionLeave} style={{ padding:'80px 40px 120px', background:'rgba(0,0,0,.22)', borderTop:'1px solid rgba(87,65,68,.1)', position:'relative', overflow:'hidden' }}>
      {/* Background glow */}
      <div style={{ position:'absolute', bottom:-40, left:'50%', transform:'translateX(-50%)', width:1200, height:320, background:'radial-gradient(ellipse,rgba(138,21,56,.36) 0%,transparent 65%)', animation:'lGlow 6s ease-in-out infinite', filter:'blur(12px)', pointerEvents:'none' }} />
      <div style={{ position:'absolute', top:'20%', left:'50%', transform:'translateX(-50%)', width:900, height:240, background:'radial-gradient(ellipse,rgba(138,21,56,.1) 0%,transparent 70%)', pointerEvents:'none' }} />

      <div style={{ maxWidth:1240, margin:'0 auto' }}>
        <SectionEyebrow text="The product" mb={12} />
        <h2 style={{ textAlign:'center', fontSize:'clamp(26px,4vw,44px)', fontWeight:900, letterSpacing:'-1.8px', color:'#f3dddf', marginBottom:60 }}>
          See it <span className="lnd-gradient-text">for yourself.</span>
        </h2>

        <div ref={ref} className="lnd-mock-outer" style={{ position:'relative', opacity:visible?1:0, animation:visible?'lMockIn 1s ease both':'none' }}>
          {/* Perspective tilt */}
          <div style={{ perspective:1600, perspectiveOrigin:'50% 0' }}>
            <div className="lnd-mock-tilt" style={{ transform:`rotateX(${mockTilt.rx}deg) rotateY(${mockTilt.ry}deg)`, transformOrigin:'top center', transition:'transform 0.55s cubic-bezier(.22,1,.36,1)' }}>
              <div className="lnd-mock-frame" style={{ height:720, borderRadius:20, overflow:'hidden', boxShadow:'0 80px 160px rgba(0,0,0,.95),0 0 0 1px rgba(87,65,68,.15),0 0 100px rgba(138,21,56,.1)', position:'relative', zIndex:1 }}>
                <MockUI />
              </div>
            </div>
          </div>

          {/* Floating: Skill Match — bottom-right */}
          <div className="lnd-mock-float" style={{ position:'absolute', bottom:80, right:-28, background:'rgba(8,4,11,.96)', border:'1px solid rgba(168,85,247,.4)', borderRadius:18, padding:'16px 18px', backdropFilter:'blur(32px)', boxShadow:'0 28px 72px rgba(0,0,0,.85),0 0 32px rgba(168,85,247,.1)', animation:visible?'lFloat 5.5s ease-in-out infinite,lCardIn .7s .55s ease both':'none', width:216, zIndex:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:13 }}>
              <div style={{ width:26, height:26, borderRadius:8, background:'rgba(168,85,247,.22)', border:'1px solid rgba(168,85,247,.35)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>⚡</div>
              <span style={{ fontSize:11, fontWeight:700, color:'#c084fc' }}>Skill Match Found</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <div style={{ flex:1, background:'rgba(168,85,247,.13)', border:'1px solid rgba(168,85,247,.24)', borderRadius:9, padding:'7px 0', textAlign:'center', fontSize:11, fontWeight:700, color:'#c084fc' }}>Python</div>
              <div style={{ fontSize:14, color:'rgba(168,85,247,.55)', fontWeight:900 }}>↔</div>
              <div style={{ flex:1, background:'rgba(168,85,247,.13)', border:'1px solid rgba(168,85,247,.24)', borderRadius:9, padding:'7px 0', textAlign:'center', fontSize:11, fontWeight:700, color:'#c084fc' }}>UI Design</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:9 }}>
              <div style={{ width:22, height:22, borderRadius:'50%', background:'rgba(192,37,90,.22)', border:'1px solid rgba(192,37,90,.32)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:800, color:'#f3dddf' }}>SM</div>
              <span style={{ fontSize:10.5, color:'rgba(243,221,223,.38)' }}>Sara M. wants to connect</span>
            </div>
          </div>

          {/* Floating: Karak — top-right */}
          <div className="lnd-mock-float" style={{ position:'absolute', top:-24, right:-20, background:'rgba(8,4,11,.96)', border:'1px solid rgba(236,72,153,.32)', borderRadius:17, padding:'15px 18px', backdropFilter:'blur(32px)', boxShadow:'0 24px 60px rgba(0,0,0,.8),0 0 28px rgba(236,72,153,.08)', animation:visible?'lFloatSlow 7.5s ease-in-out 1.4s infinite,lCardIn .7s .8s ease both':'none', width:174, zIndex:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:10 }}>
              <div style={{ width:26, height:26, borderRadius:8, background:'rgba(236,72,153,.18)', border:'1px solid rgba(236,72,153,.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>✦</div>
              <span style={{ fontSize:11, fontWeight:700, color:'#f472b6' }}>Karak Points</span>
            </div>
            <div style={{ display:'flex', alignItems:'baseline', gap:5, marginBottom:6 }}>
              <span style={{ fontSize:34, fontWeight:900, color:'#fff', letterSpacing:'-2px', lineHeight:1 }}>+50</span>
              <span style={{ fontSize:12, color:'rgba(243,221,223,.3)', fontWeight:500 }}>pts</span>
            </div>
            <div style={{ fontSize:10.5, color:'rgba(243,221,223,.28)' }}>Awarded for event attendance</div>
          </div>

          {/* Floating: New club — left */}
          <div className="lnd-mock-float" style={{ position:'absolute', top:100, left:-32, background:'rgba(8,4,11,.96)', border:'1px solid rgba(14,165,233,.32)', borderRadius:16, padding:'14px 16px', backdropFilter:'blur(32px)', boxShadow:'0 24px 60px rgba(0,0,0,.8),0 0 28px rgba(14,165,233,.08)', animation:visible?'lFloat 6.5s ease-in-out 0.7s infinite,lCardIn .7s 1s ease both':'none', width:188, zIndex:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:9, marginBottom:10 }}>
              <div style={{ width:26, height:26, borderRadius:8, background:'rgba(14,165,233,.18)', border:'1px solid rgba(14,165,233,.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:'#38bdf8' }}>◎</div>
              <div>
                <div style={{ fontSize:9, fontWeight:800, color:'rgba(56,189,248,.7)', letterSpacing:'.1em', textTransform:'uppercase' }}>New Club</div>
                <div style={{ fontSize:12, fontWeight:700, color:'#f3dddf', marginTop:1 }}>Robotics Society</div>
              </div>
            </div>
            <div style={{ fontSize:10.5, color:'rgba(243,221,223,.32)', marginBottom:9 }}>Accepting applications now</div>
            <div style={{ background:'rgba(14,165,233,.12)', border:'1px solid rgba(14,165,233,.22)', borderRadius:7, padding:'5px 10px', fontSize:10, fontWeight:700, color:'rgba(56,189,248,.8)', textAlign:'center' }}>Join Club →</div>
          </div>

          {/* Floating: Co-founder match — bottom-left */}
          <div className="lnd-mock-float" style={{ position:'absolute', bottom:40, left:-24, background:'rgba(8,4,11,.96)', border:'1px solid rgba(34,197,94,.3)', borderRadius:16, padding:'14px 16px', backdropFilter:'blur(32px)', boxShadow:'0 24px 60px rgba(0,0,0,.8),0 0 28px rgba(34,197,94,.07)', animation:visible?'lFloatSlow 8s ease-in-out 2s infinite,lCardIn .7s 1.2s ease both':'none', width:192, zIndex:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:9 }}>
              <div style={{ width:26, height:26, borderRadius:8, background:'rgba(34,197,94,.16)', border:'1px solid rgba(34,197,94,.28)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:'#4ade80' }}>◉</div>
              <span style={{ fontSize:11, fontWeight:700, color:'#4ade80' }}>Co-Founder Match</span>
            </div>
            <div style={{ fontSize:11, color:'rgba(243,221,223,.42)', lineHeight:1.55, marginBottom:9 }}>Noura R. is looking for a tech partner for her FinTech idea</div>
            <div style={{ fontSize:10, fontWeight:600, color:'rgba(74,222,128,.75)' }}>View profile →</div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Problem Section ───────────────────────────────────────────────────────────

function ProblemSection() {
  const { ref, visible } = useScrollReveal(.12)
  const before = [
    { icon:'💬', label:'WhatsApp groups for announcements' },
    { icon:'📸', label:'Instagram pages for club presence' },
    { icon:'🤷', label:'Skills going unused and untraded' },
    { icon:'📋', label:'Google Forms for everything' },
    { icon:'📅', label:'Three separate calendar apps' },
  ]
  const after = [
    { icon:'♛', label:'Club Hub — professional management', color:'#e9c176' },
    { icon:'◈', label:'Social Feed — your public presence', color:'#0ea5e9' },
    { icon:'⚡', label:'Skill Souq — trade what you know', color:'#a855f7' },
    { icon:'✦', label:'Karak System — gamified reputation', color:'#ec4899' },
    { icon:'◎', label:'Club Discovery — find your people', color:'#22c55e' },
  ]
  return (
    <section style={{ padding:'clamp(64px,8vw,100px) 32px', borderTop:'1px solid rgba(87,65,68,.1)' }}>
      <div style={{ maxWidth:1100, margin:'0 auto' }}>
        <SectionEyebrow text="The problem" mb={12} />
        <h2 style={{ textAlign:'center', fontSize:'clamp(26px,4vw,46px)', fontWeight:900, letterSpacing:'-2px', color:'#f3dddf', lineHeight:1.1, marginBottom:16 }}>
          Student life runs on <span className="lnd-gradient-text">the wrong tools.</span>
        </h2>
        <p style={{ textAlign:'center', fontSize:15, color:'rgba(243,221,223,.35)', maxWidth:480, margin:'0 auto 64px', lineHeight:1.7 }}>
          You're managing a club through WhatsApp, posting on Instagram, filling Google Forms, and watching your skills go nowhere. There's a better way.
        </p>

        <div ref={ref} className="lnd-prob-compare" style={{ display:'grid', gridTemplateColumns:'1fr auto 1fr', gap:24, alignItems:'stretch', opacity:visible?1:0, animation:visible?'lCardIn .7s ease both':'none' }}>
          {/* Before */}
          <div style={{ borderRadius:24, border:'1px solid rgba(87,65,68,.2)', background:'rgba(255,255,255,.015)', padding:'32px 28px' }}>
            <div style={{ fontSize:11, fontWeight:800, letterSpacing:'.14em', color:'rgba(243,221,223,.28)', textTransform:'uppercase', marginBottom:24 }}>The old way</div>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {before.map((b,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:36, height:36, borderRadius:10, background:'rgba(255,255,255,.03)', border:'1px solid rgba(87,65,68,.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0, opacity:.45 }}>{b.icon}</div>
                  <span style={{ fontSize:13, color:'rgba(243,221,223,.25)', textDecoration:'line-through', textDecorationColor:'rgba(243,221,223,.12)', lineHeight:1.4 }}>{b.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="lnd-prob-divider" style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, padding:'0 8px' }}>
            <div style={{ width:1, flex:1, background:'linear-gradient(to bottom,transparent,rgba(192,37,90,.5),transparent)' }} />
            <div style={{ width:40, height:40, borderRadius:'50%', background:'rgba(138,21,56,.15)', border:'1px solid rgba(192,37,90,.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, color:'#c0255a', flexShrink:0 }}>→</div>
            <div style={{ width:1, flex:1, background:'linear-gradient(to bottom,rgba(192,37,90,.5),transparent)' }} />
          </div>

          {/* After */}
          <div style={{ borderRadius:24, border:'1px solid rgba(138,21,56,.3)', background:'linear-gradient(145deg,rgba(160,24,64,.1),rgba(8,3,12,.97))', padding:'32px 28px', boxShadow:'0 0 80px rgba(138,21,56,.12),inset 0 1px 0 rgba(255,255,255,.04)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:24 }}>
              <div style={{ width:20, height:20, borderRadius:5, background:'linear-gradient(135deg,#8a1538,#c0255a)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, color:'#fff', fontWeight:900 }}>✦</div>
              <div style={{ fontSize:11, fontWeight:800, letterSpacing:'.14em', color:'#e0aab4', textTransform:'uppercase' }}>ClubSynq</div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {after.map((a,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:36, height:36, borderRadius:10, background:`${a.color}14`, border:`1px solid ${a.color}28`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, color:a.color, flexShrink:0 }}>{a.icon}</div>
                  <span style={{ fontSize:13, color:'rgba(243,221,223,.65)', lineHeight:1.4, fontWeight:500 }}>{a.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Features ──────────────────────────────────────────────────────────────────

function FeaturesSection() {
  const { ref, visible } = useScrollReveal(.08)
  return (
    <section id="features" style={{ padding:'clamp(64px,8vw,100px) 32px', background:'rgba(0,0,0,.18)', borderTop:'1px solid rgba(87,65,68,.1)', position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:'30%', left:'50%', transform:'translateX(-50%)', width:900, height:400, background:'radial-gradient(ellipse,rgba(138,21,56,.07) 0%,transparent 65%)', pointerEvents:'none' }} />
      <div style={{ maxWidth:1100, margin:'0 auto', position:'relative', zIndex:1 }}>
        <SectionEyebrow text="What's inside" mb={14} />
        <h2 style={{ textAlign:'center', fontSize:'clamp(28px,4.5vw,48px)', fontWeight:900, letterSpacing:'-2px', color:'#f3dddf', lineHeight:1.1, marginBottom:64 }}>
          Six tools. <span className="lnd-gradient-text">One platform.</span>
        </h2>
        <div ref={ref} className="lnd-feat-grid" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.label} f={f} delay={i * .07} visible={visible} />
          ))}
        </div>
      </div>
    </section>
  )
}

function FeatureCard({ f, delay, visible }: { f: typeof FEATURES[0]; delay: number; visible: boolean }) {
  const [hov, setHov] = useState(false)
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 50 })
  const cardRef = useRef<HTMLDivElement>(null)

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current; if (!el) return
    const r = el.getBoundingClientRect()
    const nx = (e.clientX - r.left) / r.width
    const ny = (e.clientY - r.top) / r.height
    setTilt({ rx: (ny - 0.5) * -22, ry: (nx - 0.5) * 22, gx: nx * 100, gy: ny * 100 })
  }
  const onLeave = () => { setHov(false); setTilt({ rx:0, ry:0, gx:50, gy:50 }) }

  return (
    <div
      ref={cardRef}
      className="lnd-feat-card"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={onLeave}
      onMouseMove={onMove}
      style={{
        borderRadius:22, padding:'28px 26px 26px', position:'relative', overflow:'hidden',
        background: hov ? `linear-gradient(150deg,${f.color}16,rgba(10,4,8,.98))` : 'rgba(10,4,8,.82)',
        border:`1px solid ${hov ? `${f.color}55` : 'rgba(87,65,68,.14)'}`,
        boxShadow: hov ? `0 48px 96px rgba(0,0,0,.7),0 0 0 1px ${f.color}22,0 0 80px ${f.color}22,inset 0 1px 0 rgba(255,255,255,.06)` : '0 2px 20px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.03)',
        opacity:visible?1:0, animation:visible?`lCardIn .6s ${delay}s ease both`:'none',
        transform: hov
          ? `perspective(900px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) scale(1.05)`
          : 'perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)',
        transition: hov
          ? 'background .3s,border-color .3s,box-shadow .3s'
          : 'background .3s,border-color .3s,box-shadow .3s,transform .55s cubic-bezier(.22,1,.36,1)',
      }}
    >
      {/* Holographic glare that follows cursor */}
      <div style={{ position:'absolute', inset:0, borderRadius:22, pointerEvents:'none', background:`radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, rgba(255,255,255,.13) 0%, rgba(255,255,255,.04) 35%, transparent 65%)`, opacity:hov?1:0, transition:'opacity .35s' }} />
      {/* Edge shine from cursor side */}
      <div style={{ position:'absolute', inset:0, borderRadius:22, pointerEvents:'none', background:`linear-gradient(${tilt.ry * 3 + 135}deg, rgba(255,255,255,.07) 0%, transparent 40%)`, opacity:hov?1:0, transition:'opacity .35s' }} />
      <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:`linear-gradient(90deg,${f.color}dd,${f.color}11)`, opacity:hov?1:.22, transition:'opacity .3s' }} />
      <div style={{ position:'absolute', top:10, right:14, fontSize:88, color:f.color, opacity:.045, lineHeight:1, pointerEvents:'none', userSelect:'none' }}>{f.icon}</div>
      <div style={{ width:52, height:52, borderRadius:15, background:`linear-gradient(135deg,${f.color}22,${f.color}0a)`, border:`1px solid ${f.color}32`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, color:f.color, marginBottom:22, transition:'transform .3s,box-shadow .3s,background .3s', transform:hov?'scale(1.12)':'scale(1)', boxShadow:hov?`0 0 32px ${f.color}40,0 0 0 1px ${f.color}28`:`0 0 0 1px ${f.color}18` }}>
        {f.icon}
      </div>
      <div style={{ fontSize:10, fontWeight:800, letterSpacing:'.14em', color:f.color, textTransform:'uppercase', marginBottom:8, opacity:.8 }}>{f.label}</div>
      <h3 style={{ fontSize:17, fontWeight:800, color:'#f3dddf', letterSpacing:'-0.3px', lineHeight:1.25, marginBottom:11 }}>{f.tagline}</h3>
      <p style={{ fontSize:13, color:'rgba(243,221,223,.36)', lineHeight:1.8 }}>{f.desc}</p>
    </div>
  )
}


// ── How It Works ──────────────────────────────────────────────────────────────

function HowItWorksSection() {
  const { ref, visible } = useScrollReveal(.15)
  return (
    <section id="how-it-works" style={{ padding:'clamp(64px,8vw,100px) 32px', background:'rgba(0,0,0,.18)', borderTop:'1px solid rgba(87,65,68,.1)', borderBottom:'1px solid rgba(87,65,68,.1)' }}>
      <div style={{ maxWidth:960, margin:'0 auto' }}>
        <SectionEyebrow text="Simple by design" mb={12} />
        <h2 style={{ textAlign:'center', fontSize:'clamp(28px,4.5vw,48px)', fontWeight:900, letterSpacing:'-2px', color:'#f3dddf', marginBottom:64 }}>
          Three steps. <span className="lnd-gradient-text">That's it.</span>
        </h2>
        <div ref={ref} className="lnd-steps-row" style={{ display:'flex', alignItems:'stretch', gap:20 }}>
          {STEPS.map((s, i) => (
            <>
              <div key={s.num} style={{ flex:1, borderRadius:22, background:'rgba(10,4,8,.88)', border:'1px solid rgba(87,65,68,.16)', padding:'32px 28px', position:'relative', overflow:'hidden', opacity:visible?1:0, animation:visible?`lCardIn .65s ${i*.14}s ease both`:'none' }}>
                <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'linear-gradient(90deg,rgba(192,37,90,.85) 0%,rgba(138,21,56,.35) 50%,transparent 100%)' }} />
                <div style={{ position:'absolute', top:-8, right:16, fontSize:96, fontWeight:900, color:'rgba(192,37,90,.07)', lineHeight:1, letterSpacing:'-4px', userSelect:'none', pointerEvents:'none' }}>{s.num}</div>
                <div style={{ position:'relative', width:48, height:48, borderRadius:16, background:'rgba(138,21,56,.18)', border:'1px solid rgba(138,21,56,.38)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, color:'#c0255a', marginBottom:24, flexShrink:0 }}>
                  {s.icon}
                  {visible && <div style={{ position:'absolute', inset:-3, borderRadius:18, border:'1px solid rgba(138,21,56,.22)', animation:`lRing 3.8s ${i*.85}s ease-out infinite` }} />}
                </div>
                <h3 style={{ fontSize:18, fontWeight:800, color:'#f3dddf', marginBottom:11, letterSpacing:'-0.3px' }}>{s.title}</h3>
                <p style={{ fontSize:13.5, color:'rgba(243,221,223,.36)', lineHeight:1.78 }}>{s.sub}</p>
              </div>
              {i < STEPS.length-1 && (
                <div key={`c${i}`} className="lnd-step-conn" style={{ display:'flex', alignItems:'center', flexShrink:0 }}>
                  <div style={{ width:44, height:1, background:'linear-gradient(90deg,rgba(138,21,56,.4),rgba(138,21,56,.1))', position:'relative', overflow:'hidden' }}>
                    {visible && <div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg,transparent,rgba(192,37,90,.95),transparent)', backgroundSize:'200% 100%', animation:`lShimmer 2.6s ${i*.5}s linear infinite` }} />}
                  </div>
                  <div style={{ width:5, height:5, borderRadius:'50%', background:'rgba(138,21,56,.4)' }} />
                </div>
              )}
            </>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── FAQ ───────────────────────────────────────────────────────────────────────

function FAQItem({ q, a, open, onClick }: { q:string; a:string; open:boolean; onClick:()=>void }) {
  return (
    <div className="lnd-faq-item">
      <button className="lnd-faq-btn" onClick={onClick}>
        <span style={{ fontSize:16, fontWeight:700, color:open?'#f3dddf':'rgba(243,221,223,.62)', letterSpacing:'-.2px', transition:'color .2s', paddingRight:20 }}>{q}</span>
        <span style={{ width:30, height:30, borderRadius:10, background:open?'rgba(138,21,56,.3)':'rgba(255,255,255,.04)', border:`1px solid ${open?'rgba(192,37,90,.38)':'rgba(255,255,255,.09)'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, color:open?'#c0255a':'rgba(243,221,223,.25)', transition:'all .25s', flexShrink:0, transform:open?'rotate(45deg)':'none' }}>+</span>
      </button>
      <div className="lnd-faq-body" style={{ maxHeight:open?'260px':'0px', opacity:open?1:0 }}>
        <p style={{ fontSize:14.5, color:'rgba(243,221,223,.48)', lineHeight:1.88, paddingBottom:24, maxWidth:680 }}>{a}</p>
      </div>
    </div>
  )
}

function FAQSection() {
  const { ref, visible } = useScrollReveal(.1)
  const [open, setOpen] = useState<number | null>(null)
  return (
    <section id="faq" style={{ padding:'clamp(64px,8vw,100px) 32px', borderTop:'1px solid rgba(87,65,68,.1)', position:'relative' }}>
      <div style={{ position:'absolute', top:'40%', left:'50%', transform:'translateX(-50%)', width:700, height:260, background:'radial-gradient(ellipse,rgba(138,21,56,.06) 0%,transparent 70%)', pointerEvents:'none' }} />
      <div style={{ maxWidth:760, margin:'0 auto', position:'relative', zIndex:1 }}>
        <SectionEyebrow text="FAQ" mb={12} />
        <h2 style={{ textAlign:'center', fontSize:'clamp(28px,4.5vw,48px)', fontWeight:900, letterSpacing:'-2px', color:'#f3dddf', marginBottom:64 }}>
          Questions? <span className="lnd-gradient-text">Answered.</span>
        </h2>
        <div ref={ref} style={{ opacity:visible?1:0, animation:visible?'lFadeUp .7s ease both':'none' }}>
          {FAQS.map((faq, i) => (
            <FAQItem key={i} q={faq.q} a={faq.a} open={open===i} onClick={() => setOpen(open===i ? null : i)} />
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Contact ───────────────────────────────────────────────────────────────────

function ContactField({ label, type='text', value, onChange, placeholder, multiline=false }: {
  label:string; type?:string; value:string; onChange:(v:string)=>void; placeholder:string; multiline?:boolean
}) {
  const [focused, setFocused] = useState(false)
  const base: React.CSSProperties = {
    width:'100%', background:'rgba(255,255,255,.035)', fontFamily:"'Be Vietnam Pro',sans-serif",
    border:`1px solid ${focused?'rgba(192,37,90,.52)':'rgba(87,65,68,.22)'}`,
    borderRadius:13, padding:'13px 17px', fontSize:14, color:'#f3dddf', outline:'none',
    boxShadow:focused?'0 0 0 3px rgba(192,37,90,.1),inset 0 1px 0 rgba(255,255,255,.04)':'inset 0 1px 0 rgba(255,255,255,.03)',
    transition:'border-color .2s,box-shadow .2s',
  }
  return (
    <div>
      <label style={{ display:'block', fontSize:10.5, fontWeight:800, letterSpacing:'.12em', color:'rgba(243,221,223,.3)', textTransform:'uppercase', marginBottom:9 }}>{label}</label>
      {multiline
        ? <textarea className="lnd-textarea" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} rows={5} required style={{...base, resize:'vertical'}} />
        : <input   className="lnd-input"    type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} required style={base} />
      }
    </div>
  )
}

function ContactSection() {
  const { ref, visible } = useScrollReveal(.1)
  const [form, setForm]     = useState({ name:'', email:'', message:'' })
  const [status, setStatus] = useState<'idle'|'sending'|'sent'|'error'>('idle')
  const f = (k: keyof typeof form) => (v: string) => setForm(p => ({...p, [k]:v}))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('sending')
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-contact-email`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name, email: form.email, message: form.message }),
        }
      )
      if (!res.ok) throw new Error()
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  return (
    <section style={{ padding:'clamp(64px,8vw,100px) 32px', background:'rgba(0,0,0,.18)', borderTop:'1px solid rgba(87,65,68,.1)', position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', bottom:-40, left:'50%', transform:'translateX(-50%)', width:700, height:240, background:'radial-gradient(ellipse,rgba(138,21,56,.12) 0%,transparent 65%)', pointerEvents:'none' }} />
      <div style={{ maxWidth:680, margin:'0 auto', position:'relative', zIndex:1 }}>
        <SectionEyebrow text="Contact" mb={12} />
        <h2 style={{ textAlign:'center', fontSize:'clamp(28px,4.5vw,48px)', fontWeight:900, letterSpacing:'-2px', color:'#f3dddf', marginBottom:16 }}>
          Let's <span className="lnd-gradient-text">talk.</span>
        </h2>
        <p style={{ textAlign:'center', fontSize:15, color:'rgba(243,221,223,.33)', marginBottom:56, lineHeight:1.75 }}>
          Questions, feedback, or partnership ideas — we're listening.
        </p>
        <div ref={ref} style={{ opacity:visible?1:0, animation:visible?'lFadeUp .7s ease both':'none' }}>
          {status === 'sent' ? (
            <div style={{ textAlign:'center', padding:'64px 40px', borderRadius:26, background:'rgba(138,21,56,.07)', border:'1px solid rgba(192,37,90,.2)', boxShadow:'0 0 60px rgba(138,21,56,.1)' }}>
              <div style={{ width:56, height:56, borderRadius:18, background:'rgba(138,21,56,.2)', border:'1px solid rgba(192,37,90,.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, color:'#c0255a', margin:'0 auto 20px' }}>✦</div>
              <h3 style={{ fontSize:22, fontWeight:900, color:'#f3dddf', letterSpacing:'-.5px', marginBottom:12 }}>Message received.</h3>
              <p style={{ fontSize:14, color:'rgba(243,221,223,.38)', lineHeight:1.75 }}>We'll be in touch at {form.email}. While you wait — get started with your profile.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div className="lnd-contact-grid">
                <ContactField label="Name"  value={form.name}  onChange={f('name')}  placeholder="Ahmad Khalil" />
                <ContactField label="Email" type="email" value={form.email} onChange={f('email')} placeholder="you@university.edu" />
              </div>
              <ContactField label="Message" value={form.message} onChange={f('message')} placeholder="Tell us what's on your mind…" multiline />
              {status === 'error' && (
                <p style={{ fontSize:13, color:'rgba(239,68,68,.75)', textAlign:'right' }}>Something went wrong — please try again.</p>
              )}
              <div style={{ display:'flex', justifyContent:'flex-end', marginTop:4 }}>
                <button type="submit" disabled={status==='sending'} className="lnd-btn-primary" style={{ fontSize:15, padding:'14px 48px', borderRadius:13, opacity:status==='sending'?.6:1, cursor:status==='sending'?'wait':'pointer' }}>
                  {status === 'sending' ? 'Sending…' : 'Send Message'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}

// ── CTA ───────────────────────────────────────────────────────────────────────

function CTASection() {
  const { ref, visible } = useScrollReveal(.18)
  return (
    <section style={{ padding:'clamp(72px,9vw,110px) 32px', position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', inset:0, backgroundImage:'radial-gradient(rgba(138,21,56,.12) 1px,transparent 1px)', backgroundSize:'28px 28px', maskImage:'radial-gradient(ellipse 80% 80% at 50% 50%,black 20%,transparent 100%)', WebkitMaskImage:'radial-gradient(ellipse 80% 80% at 50% 50%,black 20%,transparent 100%)' }} />
      <div style={{ position:'absolute', top:'20%', left:'50%', transform:'translateX(-50%)', width:800, height:360, background:'radial-gradient(ellipse,rgba(138,21,56,.26) 0%,transparent 70%)', pointerEvents:'none' }} />
      <div ref={ref} style={{ maxWidth:860, margin:'0 auto', position:'relative', zIndex:1, opacity:visible?1:0, transition:'opacity .9s' }}>
        <div className="lnd-cta-inner" style={{ padding:'80px 72px', borderRadius:36, textAlign:'center', position:'relative', overflow:'hidden', background:'linear-gradient(145deg,rgba(160,24,64,.2) 0%,rgba(6,2,10,.99) 52%,rgba(110,10,48,.16) 100%)', border:'1px solid rgba(138,21,56,.28)', boxShadow:'0 40px 100px rgba(0,0,0,.6),0 0 0 1px rgba(192,37,90,.06)', animation:visible?'lFadeUp .8s ease both':'none' }}>
          <div style={{ position:'absolute', top:0, left:0, right:0, height:1, background:'linear-gradient(90deg,transparent,rgba(192,37,90,.8),transparent)' }} />
          <div style={{ position:'absolute', bottom:0, left:0, right:0, height:1, background:'linear-gradient(90deg,transparent,rgba(138,21,56,.4),transparent)' }} />
          <div style={{ position:'absolute', top:-100, left:'50%', transform:'translateX(-50%)', width:640, height:260, background:'radial-gradient(ellipse,rgba(192,37,90,.26) 0%,transparent 70%)', pointerEvents:'none' }} />
          <div style={{ position:'absolute', bottom:-60, left:'50%', transform:'translateX(-50%)', width:480, height:160, background:'radial-gradient(ellipse,rgba(138,21,56,.16) 0%,transparent 70%)', pointerEvents:'none' }} />
          <div style={{ marginBottom:28, display:'inline-flex', alignItems:'center', gap:8, padding:'7px 22px', background:'rgba(138,21,56,.1)', border:'1px solid rgba(192,37,90,.28)', borderRadius:9999 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'#c0255a', display:'inline-block', boxShadow:'0 0 12px rgba(192,37,90,1)', animation:'lPulse 2s ease-in-out infinite' }} />
            <span style={{ fontSize:11, fontWeight:800, letterSpacing:'.14em', color:'#e0aab4', textTransform:'uppercase' }}>Free to Join</span>
          </div>
          <h2 style={{ fontSize:'clamp(32px,5.5vw,58px)', fontWeight:900, letterSpacing:'-2.5px', color:'#f3dddf', lineHeight:1.06, marginBottom:22 }}>
            Ready to build<br />
            <span className="lnd-gradient-text">something that lasts?</span>
          </h2>
          <p style={{ fontSize:16, color:'rgba(243,221,223,.38)', lineHeight:1.78, maxWidth:420, margin:'0 auto 48px' }}>
            Something big is coming. ClubSynq launches May 22nd — your network, your skills, your future.
          </p>
          <div style={{ display:'inline-flex', alignItems:'center', gap:12, padding:'16px 40px', background:'rgba(192,37,90,.08)', border:'1px solid rgba(192,37,90,.3)', borderRadius:16, backdropFilter:'blur(8px)' }}>
            <span style={{ width:9, height:9, borderRadius:'50%', background:'#c0255a', display:'inline-block', boxShadow:'0 0 12px rgba(192,37,90,1)', animation:'lPulse 2s ease-in-out infinite', flexShrink:0 }} />
            <span style={{ fontSize:17, fontWeight:800, color:'rgba(243,221,223,.85)', letterSpacing:'.04em' }}>Launching May 22nd</span>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────────

function LandingFooter() {
  return (
    <footer style={{ padding:'32px 36px', borderTop:'1px solid rgba(87,65,68,.1)', background:'rgba(0,0,0,.32)' }}>
      <div style={{ maxWidth:1200, margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <img src="/clubsynqlogo.png" alt="ClubSynq" style={{ width:26, height:26, borderRadius:7, objectFit:'contain' }} />
          <span style={{ fontSize:13, fontWeight:900, letterSpacing:'.22em', color:'rgba(255,255,255,.35)', textTransform:'uppercase' }}>CLUBSYNQ</span>
        </div>
        <div style={{ display:'flex', gap:28, flexWrap:'wrap' }}>
          {([['Features', () => document.getElementById('features')?.scrollIntoView({ behavior:'smooth' })], ['How it Works', () => document.getElementById('how-it-works')?.scrollIntoView({ behavior:'smooth' })], ['FAQ', () => document.getElementById('faq')?.scrollIntoView({ behavior:'smooth' })]] as [string,()=>void][]).map(([label, action]) => (
            <button key={label} onClick={action} style={{ background:'none', border:'none', color:'rgba(243,221,223,.24)', fontSize:13, fontWeight:500, cursor:'pointer', padding:0, fontFamily:'inherit', transition:'color .15s' }}
              onMouseEnter={e => (e.currentTarget.style.color='rgba(243,221,223,.6)')}
              onMouseLeave={e => (e.currentTarget.style.color='rgba(243,221,223,.24)')}>{label}</button>
          ))}
        </div>
        <div style={{ fontSize:12, color:'rgba(243,221,223,.14)' }}>© 2026 CLUBSYNQ</div>
      </div>
    </footer>
  )
}
