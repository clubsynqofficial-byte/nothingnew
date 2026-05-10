import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

// ── Data ──────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: '◈',
    label: 'Discovery',
    title: 'Find Your Community',
    description: 'Every club on campus, in one place. Search by interest, see who\'s joining, and become a member in seconds.',
    color: '#0ea5e9',
    bg: 'rgba(14,165,233,0.07)',
    border: 'rgba(14,165,233,0.18)',
    glow: 'rgba(14,165,233,0.2)',
  },
  {
    icon: '♛',
    label: 'Leadership Hub',
    title: 'Command Your Club',
    description: 'Build from the ground up. Create events, manage your team, broadcast announcements, and issue digital certificates — all from one command center.',
    color: '#e9c176',
    bg: 'rgba(233,193,118,0.07)',
    border: 'rgba(233,193,118,0.18)',
    glow: 'rgba(233,193,118,0.2)',
  },
  {
    icon: '⚡',
    label: 'Skill Souq',
    title: 'Trade What You Know',
    description: 'Have a skill. Need a skill. Trade it. Post your listing, connect with a match, and collaborate with built-in chat, whiteboard, and video.',
    color: '#a855f7',
    bg: 'rgba(168,85,247,0.07)',
    border: 'rgba(168,85,247,0.18)',
    glow: 'rgba(168,85,247,0.2)',
  },
  {
    icon: '◉',
    label: 'Co-Founder Match',
    title: 'Find Who Builds the Rest',
    description: 'Got an idea but missing a piece? Swipe through student founders, align on vision, and start building your startup together.',
    color: '#22c55e',
    bg: 'rgba(34,197,94,0.07)',
    border: 'rgba(34,197,94,0.18)',
    glow: 'rgba(34,197,94,0.2)',
  },
  {
    icon: '◎',
    label: 'Club Hub',
    title: 'Give Your Club a Home',
    description: 'Announcements, discussion threads, real updates. Give your members a proper home — not another group chat that gets buried.',
    color: '#f97316',
    bg: 'rgba(249,115,22,0.07)',
    border: 'rgba(249,115,22,0.18)',
    glow: 'rgba(249,115,22,0.2)',
  },
  {
    icon: '✦',
    label: 'Karak Points',
    title: 'Show Up. Get Rewarded.',
    description: 'Attend events, engage with your campus, and earn Karak Points that reflect your real contributions — not just your follower count.',
    color: '#ec4899',
    bg: 'rgba(236,72,153,0.07)',
    border: 'rgba(236,72,153,0.18)',
    glow: 'rgba(236,72,153,0.2)',
  },
]

const WHY_PILLARS = [
  {
    icon: '◈',
    title: 'Built for Qatar. Not Adapted.',
    body: 'Designed around how students actually live at Qatar\'s universities — not copied from a generic template and renamed.',
    color: '#c0255a',
  },
  {
    icon: '◎',
    title: 'One Place for Everything.',
    body: 'No more scattered group chats and Instagram pages. Your clubs, skills, events, and connections — all unified.',
    color: '#a855f7',
  },
  {
    icon: '✦',
    title: 'Every Action Means Something.',
    body: 'From joining a club to landing a skill trade — every move on CLUBSYNQ leads to a real, tangible outcome.',
    color: '#e9c176',
  },
]

const STEPS = [
  {
    num: '01',
    title: 'Create Your Profile',
    desc: 'Sign up with your university email in seconds. No fluff — just you and your campus.',
  },
  {
    num: '02',
    title: 'Explore & Connect',
    desc: 'Discover clubs, post skill listings, or swipe through co-founders. Your move.',
  },
  {
    num: '03',
    title: 'Lead & Leave a Mark',
    desc: 'Run your club, earn Karak Points, and build a reputation that goes beyond graduation.',
  },
]

// ── Hook ──────────────────────────────────────────────────────────────────────

function useScrollReveal(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref, visible }
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    if (!loading && session) navigate('/discovery', { replace: true })
  }, [session, loading, navigate])

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 48)
    window.addEventListener('scroll', h, { passive: true })
    return () => window.removeEventListener('scroll', h)
  }, [])

  if (loading || session) return null

  return (
    <div style={{ minHeight: '100vh', background: '#0a0607', color: '#f3dddf', fontFamily: "'Be Vietnam Pro', sans-serif", overflowX: 'hidden' }}>
      <LandingStyles />
      <LandingNav scrolled={scrolled} navigate={navigate} />
      <HeroSection navigate={navigate} />
      <WhySection />
      <FeaturesSection navigate={navigate} />
      <HowItWorksSection />
      <CTASection navigate={navigate} />
      <LandingFooter navigate={navigate} />
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

function LandingStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,700;1,800&display=swap');
      * { box-sizing: border-box; margin: 0; padding: 0; }

      @keyframes lFadeUp {
        from { opacity: 0; transform: translateY(28px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes lFadeIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes lWordIn {
        from { opacity: 0; transform: translateY(44px) skewY(4deg); filter: blur(6px); }
        to   { opacity: 1; transform: translateY(0) skewY(0deg); filter: blur(0); }
      }
      @keyframes lBadgePop {
        0%   { opacity: 0; transform: scale(0.75) translateY(10px); }
        70%  { transform: scale(1.03) translateY(-2px); }
        100% { opacity: 1; transform: scale(1) translateY(0); }
      }
      @keyframes lCardIn {
        from { opacity: 0; transform: translateY(36px) scale(0.96); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes lStepIn {
        from { opacity: 0; transform: translateX(-20px); }
        to   { opacity: 1; transform: translateX(0); }
      }
      @keyframes lOrb1 {
        0%,100% { transform: translate(0,0) scale(1); }
        33%     { transform: translate(30px,-25px) scale(1.08); }
        66%     { transform: translate(-18px,15px) scale(0.95); }
      }
      @keyframes lOrb2 {
        0%,100% { transform: translate(0,0) scale(1); }
        40%     { transform: translate(-22px,20px) scale(1.06); }
        70%     { transform: translate(16px,-12px) scale(0.97); }
      }
      @keyframes lOrb3 {
        0%,100% { transform: translate(0,0) scale(1); }
        50%     { transform: translate(14px,26px) scale(1.04); }
      }
      @keyframes lOrb4 {
        0%,100% { transform: translate(0,0) scale(1); }
        45%     { transform: translate(-20px,-18px) scale(1.05); }
        80%     { transform: translate(10px,8px) scale(0.98); }
      }
      @keyframes lGradientShift {
        0%,100% { background-position: 0% 50%; }
        50%     { background-position: 100% 50%; }
      }
      @keyframes lScroll {
        0%   { opacity: 0.6; transform: translateY(0); }
        60%  { opacity: 0.2; transform: translateY(8px); }
        100% { opacity: 0.6; transform: translateY(0); }
      }
      @keyframes lShimmer {
        0%   { background-position: 200% center; }
        100% { background-position: -200% center; }
      }
      @keyframes lDotPulse {
        0%,100% { opacity: 0.4; transform: scale(1); }
        50%     { opacity: 1; transform: scale(1.5); }
      }
      @keyframes lRing {
        0%   { transform: scale(0.8); opacity: 0.7; }
        100% { transform: scale(2.4); opacity: 0; }
      }
      @keyframes lPillarIn {
        from { opacity: 0; transform: translateY(20px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      .lnd-btn-primary {
        position: relative; overflow: hidden;
        background: linear-gradient(135deg, #6e1030 0%, #8a1538 40%, #c0255a 70%, #8a1538 100%);
        background-size: 300% auto;
        animation: lShimmer 6s linear infinite;
        border: none; border-radius: 14px;
        color: #fff; font-family: 'Be Vietnam Pro', sans-serif;
        font-size: 15px; font-weight: 700; letter-spacing: 0.04em;
        padding: 14px 32px; cursor: pointer;
        box-shadow: 0 8px 32px rgba(138,21,56,0.4), 0 0 0 1px rgba(192,37,90,0.25);
        transition: transform 0.2s, box-shadow 0.2s;
      }
      .lnd-btn-primary:hover {
        transform: translateY(-2px) scale(1.02);
        box-shadow: 0 16px 48px rgba(138,21,56,0.55), 0 0 0 1px rgba(192,37,90,0.45);
      }
      .lnd-btn-ghost {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 14px;
        color: rgba(243,221,223,0.75); font-family: 'Be Vietnam Pro', sans-serif;
        font-size: 15px; font-weight: 600;
        padding: 14px 32px; cursor: pointer;
        backdrop-filter: blur(12px);
        transition: all 0.2s;
      }
      .lnd-btn-ghost:hover {
        background: rgba(255,255,255,0.08);
        border-color: rgba(255,255,255,0.2);
        color: #fff; transform: translateY(-2px);
      }
      .lnd-feat-card {
        transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.3s ease, border-color 0.3s ease, background 0.3s ease;
        cursor: pointer;
      }
      .lnd-feat-card:hover { transform: translateY(-10px) scale(1.015); }
      .lnd-feat-icon { transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.3s ease; }
      .lnd-feat-card:hover .lnd-feat-icon { transform: scale(1.18) rotate(-5deg); }
      .lnd-nav-link {
        color: rgba(243,221,223,0.48); font-size: 14px; font-weight: 500;
        text-decoration: none; cursor: pointer; background: none; border: none;
        font-family: 'Be Vietnam Pro', sans-serif; padding: 0; transition: color 0.15s;
      }
      .lnd-nav-link:hover { color: rgba(243,221,223,0.88); }
      .lnd-gradient-text {
        background: linear-gradient(135deg, #f3dddf 0%, #c0255a 35%, #e9c176 75%, #f3dddf 100%);
        background-size: 200% auto;
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        background-clip: text; animation: lGradientShift 6s ease infinite;
      }
      .lnd-reveal { opacity: 0; }
      .lnd-reveal.visible { opacity: 1; }

      @media (max-width: 768px) {
        .lnd-hero-h1 { font-size: clamp(44px, 12vw, 80px) !important; letter-spacing: -2px !important; }
        .lnd-feat-grid { grid-template-columns: 1fr !important; }
        .lnd-why-grid { grid-template-columns: 1fr !important; }
        .lnd-steps-row { flex-direction: column !important; gap: 32px !important; }
        .lnd-step-conn { display: none !important; }
        .lnd-cta-inner { padding: 44px 24px !important; }
        .lnd-nav-links { display: none !important; }
      }
    `}</style>
  )
}

// ── Nav ───────────────────────────────────────────────────────────────────────

function LandingNav({ scrolled, navigate }: { scrolled: boolean; navigate: ReturnType<typeof useNavigate> }) {
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      padding: '0 32px', height: 64,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: scrolled ? 'rgba(10,6,7,0.88)' : 'transparent',
      backdropFilter: scrolled ? 'blur(24px)' : 'none',
      borderBottom: scrolled ? '1px solid rgba(87,65,68,0.16)' : '1px solid transparent',
      transition: 'background 0.4s, backdrop-filter 0.4s, border-color 0.4s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg, #8a1538, #c0255a)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(138,21,56,0.5)', fontSize: 13, fontWeight: 900, color: '#fff' }}>✦</div>
        <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: '0.22em', color: '#fff', textTransform: 'uppercase' }}>CLUBSYNQ</span>
      </div>

      <div className="lnd-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
        {[['Features', 'features'], ['How it Works', 'how-it-works']].map(([label, id]) => (
          <button key={label} className="lnd-nav-link" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })}>{label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="lnd-btn-ghost" style={{ padding: '9px 22px', fontSize: 13, borderRadius: 10 }} onClick={() => navigate('/signin')}>Sign In</button>
        <button className="lnd-btn-primary" style={{ padding: '9px 22px', fontSize: 13, borderRadius: 10 }} onClick={() => navigate('/signup')}>Get Started</button>
      </div>
    </nav>
  )
}

// ── Hero ──────────────────────────────────────────────────────────────────────

const HERO_WORDS = [{ w: 'Where', accent: false }, { w: 'Campus', accent: false }, { w: 'Life', accent: false }, { w: 'Comes', accent: true }, { w: 'Alive.', accent: true }]


function HeroSection({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  return (
    <section style={{ minHeight: '100vh', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '100px 24px 80px', overflow: 'hidden' }}>

      {/* Dot grid */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, backgroundImage: 'radial-gradient(rgba(87,65,68,0.26) 1px, transparent 1px)', backgroundSize: '28px 28px', maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 20%, transparent 100%)', WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 20%, transparent 100%)' }} />

      {/* Orbs */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '8%',  left: '4%',   width: 640, height: 380, background: 'radial-gradient(ellipse, rgba(138,21,56,0.28) 0%, transparent 65%)', animation: 'lOrb1 20s ease-in-out infinite',        filter: 'blur(2px)' }} />
        <div style={{ position: 'absolute', top: '55%', right: '-6%', width: 520, height: 320, background: 'radial-gradient(ellipse, rgba(100,10,40,0.2) 0%, transparent 65%)',  animation: 'lOrb2 26s ease-in-out 4s infinite',     filter: 'blur(2px)' }} />
        <div style={{ position: 'absolute', bottom: '-8%', left: '28%', width: 700, height: 300, background: 'radial-gradient(ellipse, rgba(138,21,56,0.1) 0%, transparent 65%)', animation: 'lOrb3 32s ease-in-out 8s infinite',    filter: 'blur(4px)' }} />
        <div style={{ position: 'absolute', top: '28%', right: '12%', width: 380, height: 280, background: 'radial-gradient(ellipse, rgba(168,85,247,0.06) 0%, transparent 65%)', animation: 'lOrb4 22s ease-in-out 11s infinite',   filter: 'blur(3px)' }} />
      </div>

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 900 }}>

        {/* Badge */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 36, animation: 'lBadgePop 0.65s ease both' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 20px', background: 'rgba(138,21,56,0.1)', border: '1px solid rgba(138,21,56,0.3)', borderRadius: 9999, backdropFilter: 'blur(12px)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#c0255a', display: 'inline-block', boxShadow: '0 0 10px rgba(192,37,90,0.9)', animation: 'lDotPulse 2.2s ease-in-out infinite' }} />
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', color: '#e0aab4', textTransform: 'uppercase' }}>
              Built for Qatar's Campus
            </span>
          </div>
        </div>

        {/* Headline */}
        <h1 className="lnd-hero-h1" style={{ fontSize: 'clamp(54px, 9.5vw, 100px)', fontWeight: 900, lineHeight: 1.0, letterSpacing: '-3.5px', marginBottom: 30 }}>
          {HERO_WORDS.map(({ w, accent }, i) => (
            <span key={w} style={{
              display: 'inline-block',
              marginRight: i < HERO_WORDS.length - 1 ? '0.26em' : 0,
              animation: `lWordIn 0.7s ${0.08 + i * 0.11}s cubic-bezier(0.22,1,0.36,1) both`,
              ...(accent ? {
                background: 'linear-gradient(135deg, #ff7096 0%, #c0255a 38%, #8a1538 65%, #e9c176 100%)',
                backgroundSize: '200% auto',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                animation: `lWordIn 0.7s ${0.08 + i * 0.11}s cubic-bezier(0.22,1,0.36,1) both, lGradientShift 5s ${0.08 + i * 0.11}s ease infinite`,
              } : { color: '#f3dddf' }),
            }}>{w}</span>
          ))}
        </h1>

        {/* Subline — precise and honest */}
        <p style={{ fontSize: 'clamp(15px, 2vw, 18px)', color: 'rgba(243,221,223,0.5)', lineHeight: 1.8, maxWidth: 500, margin: '0 auto 48px', animation: 'lFadeUp 0.6s 0.68s ease both' }}>
          One platform for your entire campus life — find your people, trade your skills, and build something that outlasts your degree.
        </p>

        {/* CTAs */}
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', animation: 'lFadeUp 0.6s 0.82s ease both', marginBottom: 68 }}>
          <button className="lnd-btn-primary" style={{ fontSize: 15, padding: '15px 40px', borderRadius: 14 }} onClick={() => navigate('/signup')}>
            Get Started — It's Free
          </button>
          <button className="lnd-btn-ghost" style={{ fontSize: 15, padding: '15px 40px', borderRadius: 14 }} onClick={() => navigate('/signin')}>
            Sign In →
          </button>
        </div>

      </div>

      {/* Scroll cue */}
      <div style={{ position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)', animation: 'lFadeIn 1s 1.5s ease both, lScroll 2.8s 2s ease-in-out infinite', zIndex: 1 }}>
        <div style={{ width: 24, height: 38, borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)', display: 'flex', justifyContent: 'center', paddingTop: 7 }}>
          <div style={{ width: 3, height: 8, borderRadius: 9999, background: 'rgba(255,255,255,0.45)' }} />
        </div>
      </div>
    </section>
  )
}

// ── Why CLUBSYNQ ──────────────────────────────────────────────────────────────

function WhySection() {
  const { ref, visible } = useScrollReveal(0.15)
  return (
    <section style={{ padding: 'clamp(60px, 7vw, 100px) 32px', borderTop: '1px solid rgba(87,65,68,0.12)', background: 'rgba(0,0,0,0.18)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Label */}
        <div ref={ref} className={`lnd-reveal${visible ? ' visible' : ''}`} style={{ textAlign: 'center', marginBottom: 56, transition: 'opacity 0.6s ease' }}>
          <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', color: '#c0255a', textTransform: 'uppercase', marginBottom: 14, animation: visible ? 'lFadeUp 0.5s ease both' : 'none' }}>
            Why CLUBSYNQ
          </p>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 900, letterSpacing: '-1.5px', color: '#f3dddf', lineHeight: 1.15, animation: visible ? 'lFadeUp 0.5s 0.08s ease both' : 'none' }}>
            Your campus has more to offer<br />
            <span className="lnd-gradient-text">than a notice board.</span>
          </h2>
        </div>

        {/* Pillars */}
        <div className="lnd-why-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {WHY_PILLARS.map((p, i) => (
            <div key={p.title} style={{
              padding: '32px 28px',
              background: 'rgba(27,16,18,0.55)',
              border: '1px solid rgba(87,65,68,0.18)',
              borderRadius: 20,
              backdropFilter: 'blur(12px)',
              animation: visible ? `lPillarIn 0.6s ${0.1 + i * 0.12}s ease both` : 'none',
              opacity: visible ? 1 : 0,
              position: 'relative', overflow: 'hidden',
            }}>
              {/* top accent */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${p.color}99 0%, ${p.color}11 100%)` }} />
              <div style={{ fontSize: 24, color: p.color, marginBottom: 18, opacity: 0.85 }}>{p.icon}</div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#f3dddf', letterSpacing: '-0.3px', marginBottom: 12, lineHeight: 1.25 }}>{p.title}</h3>
              <p style={{ fontSize: 14, color: 'rgba(243,221,223,0.48)', lineHeight: 1.78 }}>{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Features ──────────────────────────────────────────────────────────────────

function FeaturesSection({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const { ref, visible } = useScrollReveal()
  return (
    <section id="features" style={{ padding: 'clamp(64px, 8vw, 120px) 32px' }}>
      <div ref={ref} className={`lnd-reveal${visible ? ' visible' : ''}`} style={{ textAlign: 'center', marginBottom: 72, transition: 'opacity 0.6s ease' }}>
        <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', color: '#c0255a', textTransform: 'uppercase', marginBottom: 14, animation: visible ? 'lFadeUp 0.5s ease both' : 'none' }}>
          The Full Picture
        </p>
        <h2 style={{ fontSize: 'clamp(30px, 5vw, 52px)', fontWeight: 900, letterSpacing: '-2px', color: '#f3dddf', lineHeight: 1.1, marginBottom: 16, animation: visible ? 'lFadeUp 0.5s 0.08s ease both' : 'none' }}>
          Six features.<br />
          <span className="lnd-gradient-text">One campus life.</span>
        </h2>
        <p style={{ fontSize: 15, color: 'rgba(243,221,223,0.44)', maxWidth: 440, margin: '0 auto', lineHeight: 1.75, animation: visible ? 'lFadeUp 0.5s 0.16s ease both' : 'none' }}>
          Every part of CLUBSYNQ was built to solve a real problem students face — not to fill a product roadmap.
        </p>
      </div>

      <div className="lnd-feat-grid" style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
        {FEATURES.map((f, i) => (
          <FeatureCard key={f.label} feature={f} index={i} visible={visible} navigate={navigate} />
        ))}
      </div>
    </section>
  )
}

function FeatureCard({ feature: f, index, visible, navigate }: {
  feature: typeof FEATURES[0]; index: number; visible: boolean; navigate: ReturnType<typeof useNavigate>
}) {
  const [hov, setHov] = useState(false)
  return (
    <div
      className="lnd-feat-card"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => navigate('/signup')}
      style={{
        background: hov ? f.bg : 'rgba(22,12,14,0.7)',
        border: `1px solid ${hov ? f.border : 'rgba(87,65,68,0.16)'}`,
        borderRadius: 20, padding: '30px 26px',
        backdropFilter: 'blur(14px)',
        boxShadow: hov ? `0 28px 64px rgba(0,0,0,0.5), 0 0 56px ${f.glow}` : '0 4px 20px rgba(0,0,0,0.22)',
        animation: visible ? `lCardIn 0.55s ${0.04 + index * 0.08}s ease both` : 'none',
        opacity: visible ? 1 : 0,
        position: 'relative', overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${f.color}99 0%, ${f.color}11 100%)`, opacity: hov ? 1 : 0.35, transition: 'opacity 0.3s' }} />

      <div className="lnd-feat-icon" style={{ width: 50, height: 50, borderRadius: 13, marginBottom: 20, background: hov ? f.bg : 'rgba(255,255,255,0.04)', border: `1px solid ${hov ? f.border : 'rgba(255,255,255,0.07)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: f.color, boxShadow: hov ? `0 0 22px ${f.glow}` : 'none', transition: 'background 0.3s, border 0.3s, box-shadow 0.3s' }}>
        {f.icon}
      </div>

      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: f.color, textTransform: 'uppercase', marginBottom: 8, opacity: 0.8 }}>{f.label}</div>
      <h3 style={{ fontSize: 19, fontWeight: 800, color: '#f3dddf', letterSpacing: '-0.3px', marginBottom: 11, lineHeight: 1.2 }}>{f.title}</h3>
      <p style={{ fontSize: 13.5, color: 'rgba(243,221,223,0.48)', lineHeight: 1.75 }}>{f.description}</p>

      <div style={{ marginTop: 22, fontSize: 12, fontWeight: 700, color: f.color, display: 'flex', alignItems: 'center', gap: 5, opacity: hov ? 1 : 0, transform: hov ? 'translateX(0)' : 'translateX(-8px)', transition: 'opacity 0.2s, transform 0.2s' }}>
        Sign up to explore <span style={{ fontSize: 15 }}>→</span>
      </div>
    </div>
  )
}

// ── How It Works ──────────────────────────────────────────────────────────────

function HowItWorksSection() {
  const { ref, visible } = useScrollReveal(0.15)
  return (
    <section id="how-it-works" style={{ padding: 'clamp(64px, 8vw, 120px) 32px', background: 'rgba(0,0,0,0.18)', borderTop: '1px solid rgba(87,65,68,0.1)', borderBottom: '1px solid rgba(87,65,68,0.1)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div ref={ref} className={`lnd-reveal${visible ? ' visible' : ''}`} style={{ textAlign: 'center', marginBottom: 72, transition: 'opacity 0.6s ease' }}>
          <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', color: '#c0255a', textTransform: 'uppercase', marginBottom: 14, animation: visible ? 'lFadeUp 0.5s ease both' : 'none' }}>
            Simple by Design
          </p>
          <h2 style={{ fontSize: 'clamp(30px, 5vw, 50px)', fontWeight: 900, letterSpacing: '-2px', color: '#f3dddf', lineHeight: 1.12, animation: visible ? 'lFadeUp 0.5s 0.08s ease both' : 'none' }}>
            Zero learning curve.<br />
            <span className="lnd-gradient-text">Instant impact.</span>
          </h2>
        </div>

        <div className="lnd-steps-row" style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
          {STEPS.map((s, i) => (
            <>
              <div key={s.num} style={{ flex: 1, padding: '0 28px', textAlign: 'center', animation: visible ? `lStepIn 0.6s ${0.1 + i * 0.15}s ease both` : 'none', opacity: visible ? 1 : 0 }}>
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 26 }}>
                  <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'rgba(138,21,56,0.1)', border: '1px solid rgba(138,21,56,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 21, fontWeight: 900, color: '#c0255a', letterSpacing: '-1px' }}>{s.num}</span>
                  </div>
                  {visible && <div style={{ position: 'absolute', inset: -1, borderRadius: '50%', border: '1px solid rgba(138,21,56,0.28)', animation: `lRing 3.5s ${i * 0.8}s ease-out infinite` }} />}
                </div>
                <h3 style={{ fontSize: 19, fontWeight: 800, color: '#f3dddf', marginBottom: 12, letterSpacing: '-0.3px' }}>{s.title}</h3>
                <p style={{ fontSize: 14, color: 'rgba(243,221,223,0.45)', lineHeight: 1.78, maxWidth: 230, margin: '0 auto' }}>{s.desc}</p>
              </div>
              {i < STEPS.length - 1 && (
                <div key={`conn-${i}`} className="lnd-step-conn" style={{ display: 'flex', alignItems: 'center', paddingTop: 34, flexShrink: 0 }}>
                  <div style={{ width: 56, height: 1, background: 'linear-gradient(90deg, rgba(138,21,56,0.45) 0%, rgba(138,21,56,0.1) 100%)', position: 'relative', overflow: 'hidden' }}>
                    {visible && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent, rgba(192,37,90,0.9), transparent)', backgroundSize: '200% 100%', animation: `lShimmer 2.8s ${i * 0.5}s linear infinite` }} />}
                  </div>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(138,21,56,0.45)', flexShrink: 0 }} />
                </div>
              )}
            </>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── CTA ───────────────────────────────────────────────────────────────────────

function CTASection({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const { ref, visible } = useScrollReveal(0.2)
  const [hov, setHov] = useState(false)
  return (
    <section style={{ padding: 'clamp(64px, 8vw, 120px) 32px' }}>
      <div ref={ref} className={`lnd-reveal${visible ? ' visible' : ''}`} style={{ maxWidth: 860, margin: '0 auto', transition: 'opacity 0.8s ease' }}>
        <div
          className="lnd-cta-inner"
          onMouseEnter={() => setHov(true)}
          onMouseLeave={() => setHov(false)}
          style={{
            padding: '72px 64px', borderRadius: 28, textAlign: 'center',
            position: 'relative', overflow: 'hidden',
            background: 'linear-gradient(135deg, rgba(138,21,56,0.13) 0%, rgba(22,12,14,0.97) 55%, rgba(100,10,40,0.11) 100%)',
            border: '1px solid rgba(138,21,56,0.22)',
            boxShadow: hov ? '0 40px 100px rgba(0,0,0,0.6), 0 0 80px rgba(138,21,56,0.16)' : '0 20px 60px rgba(0,0,0,0.38)',
            transition: 'box-shadow 0.4s ease',
            animation: visible ? 'lFadeUp 0.7s ease both' : 'none',
          }}
        >
          <div style={{ position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)', width: 440, height: 200, background: 'radial-gradient(ellipse, rgba(138,21,56,0.22) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent 0%, rgba(192,37,90,0.55) 50%, transparent 100%)' }} />

          <div style={{ position: 'relative', zIndex: 1 }}>
            <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', color: '#c0255a', textTransform: 'uppercase', marginBottom: 20 }}>Your Campus Awaits</p>
            <h2 style={{ fontSize: 'clamp(30px, 5vw, 50px)', fontWeight: 900, letterSpacing: '-2px', color: '#f3dddf', lineHeight: 1.12, marginBottom: 18 }}>
              Be among the first to<br />
              <span className="lnd-gradient-text">claim your campus story.</span>
            </h2>
            <p style={{ fontSize: 15, color: 'rgba(243,221,223,0.44)', lineHeight: 1.75, maxWidth: 420, margin: '0 auto 40px' }}>
              Early access is open. Sign up now and help shape the platform that Qatar's students deserve.
            </p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="lnd-btn-primary" style={{ fontSize: 15, padding: '15px 44px', borderRadius: 14 }} onClick={() => navigate('/signup')}>
                Create Free Account
              </button>
              <button className="lnd-btn-ghost" style={{ fontSize: 15, padding: '15px 44px', borderRadius: 14 }} onClick={() => navigate('/signin')}>
                I have an account
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────────

function LandingFooter({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  return (
    <footer style={{ padding: '36px 32px', borderTop: '1px solid rgba(87,65,68,0.12)', background: 'rgba(0,0,0,0.25)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg, #8a1538, #c0255a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 900 }}>✦</div>
          <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>CLUBSYNQ</span>
        </div>

        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
          {([['Sign In', () => navigate('/signin')], ['Get Started', () => navigate('/signup')], ['Features', () => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })]] as [string, () => void][]).map(([label, action]) => (
            <button key={label} onClick={action} style={{ background: 'none', border: 'none', color: 'rgba(243,221,223,0.3)', fontSize: 13, fontWeight: 500, cursor: 'pointer', padding: 0, fontFamily: 'inherit', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(243,221,223,0.65)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(243,221,223,0.3)')}
            >{label}</button>
          ))}
        </div>

        <div style={{ fontSize: 12, color: 'rgba(243,221,223,0.18)' }}>
          © 2026 CLUBSYNQ · Qatar
        </div>
      </div>
    </footer>
  )
}
