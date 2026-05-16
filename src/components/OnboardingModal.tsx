import { useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const INTERESTS = [
  { key: 'tech',      label: 'Technology',       icon: '💻' },
  { key: 'arts',      label: 'Arts & Culture',   icon: '🎨' },
  { key: 'sports',    label: 'Sports',            icon: '⚽' },
  { key: 'business',  label: 'Business',          icon: '📈' },
  { key: 'social',    label: 'Social',            icon: '🎉' },
  { key: 'academic',  label: 'Academic',          icon: '📚' },
  { key: 'gaming',    label: 'Gaming',            icon: '🎮' },
  { key: 'music',     label: 'Music',             icon: '🎵' },
  { key: 'health',    label: 'Health & Fitness',  icon: '💪' },
  { key: 'volunteer', label: 'Volunteering',      icon: '🤝' },
  { key: 'science',   label: 'Science',           icon: '🔬' },
  { key: 'food',      label: 'Food & Cooking',    icon: '🍳' },
]

interface Props { onDone: () => void }

export default function OnboardingModal({ onDone }: Props) {
  const { user, refreshProfile } = useAuth()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<'interests' | 'done'>('interests')

  function toggle(key: string) {
    setSelected(prev => {
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      return s
    })
  }

  async function handleFinish() {
    if (!user) return
    setSaving(true)
    await supabase.from('profiles').update({ interests: [...selected], onboarded: true }).eq('id', user.id)
    await refreshProfile()
    setSaving(false)
    setStep('done')
  }

  async function handleSkip() {
    if (!user) return
    await supabase.from('profiles').update({ onboarded: true }).eq('id', user.id)
    await refreshProfile()
    onDone()
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(4,1,3,0.92)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 16px' }}>
      <style>{`
        @keyframes obIn { from{opacity:0;transform:translateY(28px) scale(.97)} to{opacity:1;transform:none} }
        .ob-chip { transition: all .15s; cursor: pointer; }
        .ob-chip:hover { transform: translateY(-1px); }
      `}</style>

      <div style={{ width: '100%', maxWidth: 520, background: 'linear-gradient(170deg,#16090d,#0d050a)', border: '1px solid rgba(138,21,56,.3)', borderRadius: 24, overflow: 'hidden', animation: 'obIn .3s cubic-bezier(.22,1,.36,1) both', boxShadow: '0 40px 100px rgba(0,0,0,.85)' }}>
        {/* Top gradient strip */}
        <div style={{ height: 4, background: 'linear-gradient(90deg,#8a1538,#c0185c,#e57c9a,#c0185c,#8a1538)' }} />

        {step === 'interests' ? (
          <div style={{ padding: '32px 28px 28px' }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>👋</div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-.5px', marginBottom: 8 }}>Welcome to ClubSynq!</h2>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,.55)', lineHeight: 1.65 }}>
                Pick your interests and we'll recommend clubs that match you.
              </p>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 28, justifyContent: 'center' }}>
              {INTERESTS.map(it => {
                const on = selected.has(it.key)
                return (
                  <button key={it.key} className="ob-chip" onClick={() => toggle(it.key)} style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '9px 16px', borderRadius: 9999,
                    border: `1px solid ${on ? 'rgba(138,21,56,.55)' : 'rgba(255,255,255,.1)'}`,
                    background: on ? 'rgba(138,21,56,.22)' : 'rgba(255,255,255,.04)',
                    color: on ? '#fff' : 'rgba(255,255,255,.6)',
                    fontSize: 13, fontWeight: on ? 700 : 500,
                    fontFamily: 'inherit',
                  }}>
                    <span>{it.icon}</span>
                    <span>{it.label}</span>
                    {on && <span style={{ fontSize: 11, color: 'var(--accent)' }}>✓</span>}
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleSkip} style={{ flex: 1, padding: '11px', borderRadius: 12, background: 'transparent', border: '1px solid rgba(255,255,255,.1)', color: 'rgba(255,255,255,.4)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Skip for now
              </button>
              <button onClick={handleFinish} disabled={saving} style={{ flex: 2, padding: '11px', borderRadius: 12, background: selected.size > 0 ? 'linear-gradient(135deg,#8a1538,#c0185c)' : 'rgba(87,65,68,.3)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 800, cursor: selected.size > 0 && !saving ? 'pointer' : 'default', fontFamily: 'inherit', boxShadow: selected.size > 0 ? '0 4px 20px rgba(138,21,56,.5)' : 'none', opacity: saving ? .7 : 1 }}>
                {saving ? 'Saving…' : `Continue${selected.size > 0 ? ` (${selected.size} selected)` : ''}`}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: '40px 28px', textAlign: 'center' }}>
            <div style={{ fontSize: 52, marginBottom: 14 }}>🎉</div>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 10 }}>You're all set!</h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,.55)', lineHeight: 1.65, marginBottom: 24 }}>
              Head to <strong style={{ color: '#fff' }}>Clubs</strong> to discover communities that match your interests.
            </p>
            <button onClick={onDone} style={{ padding: '12px 32px', borderRadius: 12, background: 'linear-gradient(135deg,#8a1538,#c0185c)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 20px rgba(138,21,56,.5)' }}>
              Explore ClubSynq →
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
