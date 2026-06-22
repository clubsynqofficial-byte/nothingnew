import { useRef, useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

interface Props {
  onClose: () => void
  successEvent?: string | null  // event title to flash as "just registered"
}

interface AttendedEvent {
  event_id: string
  title: string
  start_time: string | null
  karak_points_reward: number
  checked_in_at: string | null
}

export default function UserQRModal({ onClose, successEvent }: Props) {
  const { user, profile } = useAuth()
  const cardRef = useRef<HTMLDivElement>(null)
  const [events, setEvents] = useState<AttendedEvent[]>([])
  const [loading, setLoading] = useState(true)

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  useEffect(() => {
    if (!user) return
    fetchAttended()
  }, [user])

  async function fetchAttended() {
    setLoading(true)
    const { data } = await supabase
      .from('event_attendees')
      .select('event_id, checked_in_at, event:events(title, start_time, karak_points_reward)')
      .eq('user_id', user!.id)
      .order('checked_in_at', { ascending: false })
      .limit(20)

    if (data) {
      setEvents(data.map((r: any) => ({
        event_id: r.event_id,
        title: r.event?.title ?? 'Event',
        start_time: r.event?.start_time ?? null,
        karak_points_reward: r.event?.karak_points_reward ?? 0,
        checked_in_at: r.checked_in_at,
      })))
    }
    setLoading(false)
  }

  if (!user) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, paddingTop: 'calc(64px + 24px)',
      }}
      onClick={onClose}
    >
      <div
        ref={cardRef}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 28,
          padding: '28px 24px 24px',
          maxWidth: 360, width: '100%',
          maxHeight: 'calc(100vh - 120px)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 40px 100px rgba(0,0,0,0.7)',
          animation: 'qrPop 0.22s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <style>{`@keyframes qrPop{from{opacity:0;transform:scale(0.9)}to{opacity:1;transform:scale(1)}}`}</style>

        {/* ── Success banner ── */}
        {successEvent && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: 12, padding: '10px 14px', marginBottom: 16,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#4ade80' }}>Successfully registered!</div>
              <div style={{ fontSize: 11.5, color: 'rgba(74,222,128,0.7)', marginTop: 1 }}>{successEvent}</div>
            </div>
          </div>
        )}

        {/* ── Avatar + name ── */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 800, color: '#fff',
            margin: '0 auto 10px', overflow: 'hidden',
            border: '3px solid rgba(138,21,56,0.4)',
          }}>
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : initials
            }
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            {profile?.full_name ?? 'Student'}
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: 'rgba(233,193,118,0.1)', border: '1px solid rgba(233,193,118,0.25)',
            borderRadius: 9999, padding: '3px 12px',
            fontSize: 12, fontWeight: 700, color: 'var(--gold)',
          }}>
            {profile?.karak_points ?? 0} Karak Points
          </div>
        </div>

        {/* ── QR Code ── */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{
            background: '#fff', borderRadius: 16,
            padding: 14, display: 'inline-block',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }}>
            <QRCodeSVG value={user.id} size={180} level="M" />
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10, marginBottom: 0, lineHeight: 1.5 }}>
            Show this to the event organiser to check in
          </p>
        </div>

        {/* ── Registered events ── */}
        <div style={{
          flex: 1, minHeight: 0,
          borderTop: '1px solid rgba(255,255,255,0.07)',
          paddingTop: 14, overflowY: 'auto',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 10 }}>
            Registered Events
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid rgba(138,21,56,.3)', borderTopColor: 'var(--accent)', animation: 'qrSpin .7s linear infinite', margin: '0 auto' }} />
              <style>{`@keyframes qrSpin{to{transform:rotate(360deg)}}`}</style>
            </div>
          ) : events.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
              No events yet — get scanning!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {events.map(ev => (
                <div key={ev.event_id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 11,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                    background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ev.title}
                    </div>
                    {ev.start_time && (
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
                        {new Date(ev.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </div>
                    )}
                  </div>
                  {ev.karak_points_reward > 0 && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', flexShrink: 0 }}>
                      +{ev.karak_points_reward} pts
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Close ── */}
        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '10px', marginTop: 16,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12, color: 'var(--text-muted)',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit', flexShrink: 0,
          }}
        >
          Close
        </button>
      </div>
    </div>
  )
}
