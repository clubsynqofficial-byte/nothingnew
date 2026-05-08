import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

interface EventInfo {
  id: string
  title: string
  karak_points_reward: number
  attendee_count: number
  club_id: string
}

type Status = 'loading' | 'already' | 'success' | 'error'

export default function AttendPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [event, setEvent] = useState<EventInfo | null>(null)
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    if (eventId && user) checkIn()
  }, [eventId, user])

  async function checkIn() {
    if (!eventId || !user) return

    const { data: ev } = await supabase
      .from('events')
      .select('id, title, karak_points_reward, attendee_count, club_id')
      .eq('id', eventId)
      .single()

    if (!ev) { setStatus('error'); return }
    setEvent(ev)

    const { data: existing } = await supabase
      .from('event_attendees')
      .select('event_id')
      .eq('event_id', eventId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing) { setStatus('already'); return }

    await supabase.from('event_attendees').insert({ event_id: eventId, user_id: user.id })
    await supabase.from('events').update({ attendee_count: ev.attendee_count + 1 }).eq('id', eventId)

    if (ev.karak_points_reward > 0) {
      await supabase.from('karak_transactions').insert({
        user_id: user.id,
        points: ev.karak_points_reward,
        reason: `Attended: ${ev.title}`,
        event_id: eventId,
      })
    }

    setStatus('success')
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-dark)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      fontFamily: 'inherit',
    }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pop{0%{transform:scale(0.8);opacity:0}100%{transform:scale(1);opacity:1}}`}</style>

      <div style={{
        width: '100%', maxWidth: 380,
        background: 'var(--bg-card)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 24,
        padding: '40px 32px',
        textAlign: 'center',
        boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
        animation: 'pop 0.25s ease-out',
      }}>

        {status === 'loading' && (
          <>
            <div style={{
              width: 40, height: 40,
              border: '3px solid rgba(87,65,68,0.3)',
              borderTopColor: 'var(--accent)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 20px',
            }} />
            <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Checking you in…</div>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 8 }}>
              Checked In
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, lineHeight: 1.3 }}>
              {event?.title}
            </h2>
            {(event?.karak_points_reward ?? 0) > 0 && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'rgba(233,193,118,0.12)', border: '1px solid rgba(233,193,118,0.3)',
                borderRadius: 9999, padding: '6px 16px',
                fontSize: 14, fontWeight: 700, color: 'var(--gold)',
                marginTop: 12, marginBottom: 20,
              }}>
                +{event?.karak_points_reward} Karak Points
              </div>
            )}
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 28 }}>
              Your attendance has been recorded. Enjoy the event!
            </p>
            <button
              onClick={() => navigate('/')}
              style={{
                width: '100%', padding: '12px',
                background: 'var(--accent)', border: 'none',
                borderRadius: 12, color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Go to Home
            </button>
          </>
        )}

        {status === 'already' && (
          <>
            <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#22c55e', textTransform: 'uppercase', marginBottom: 8 }}>
              Already Checked In
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, lineHeight: 1.3 }}>
              {event?.title}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 28 }}>
              You're already checked in for this event.
            </p>
            <button
              onClick={() => navigate('/')}
              style={{
                width: '100%', padding: '12px',
                background: 'transparent', border: '1px solid rgba(87,65,68,0.35)',
                borderRadius: 12, color: 'var(--text-muted)',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Go to Home
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize: 56, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              Event Not Found
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 28 }}>
              This QR code may be invalid or the event has been removed.
            </p>
            <button
              onClick={() => navigate('/')}
              style={{
                width: '100%', padding: '12px',
                background: 'transparent', border: '1px solid rgba(87,65,68,0.35)',
                borderRadius: 12, color: 'var(--text-muted)',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Go to Home
            </button>
          </>
        )}
      </div>
    </div>
  )
}
