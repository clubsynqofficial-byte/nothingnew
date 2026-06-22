import { useState, useEffect, useRef, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

interface EventOption {
  id: string
  title: string
  karak_points_reward: number
  start_time: string | null
}

interface ScanResult {
  userId: string
  name: string
  avatar: string | null
  status: 'success' | 'already' | 'not_found' | 'error'
  points: number
  ts: number
}

const READER_ID = 'qr-scan-reader'

export default function ScanPage() {
  const { user, profile } = useAuth()

  const [events, setEvents] = useState<EventOption[]>([])
  const [selectedEvent, setSelectedEvent] = useState<EventOption | null>(null)
  const [phase, setPhase] = useState<'select' | 'scan'>('select')
  const [lastResult, setLastResult] = useState<ScanResult | null>(null)
  const [history, setHistory] = useState<ScanResult[]>([])
  const [processing, setProcessing] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const scannerRef = useRef<Html5Qrcode | null>(null)
  const lastScannedRef = useRef<{ id: string; time: number }>({ id: '', time: 0 })
  const processingRef = useRef(false)

  // Load events for this organiser
  useEffect(() => {
    if (!user || !profile) return
    loadEvents()
  }, [user, profile])

  async function loadEvents() {
    if (!user) return
    const { data } = await supabase
      .from('events')
      .select('id, title, karak_points_reward, start_time')
      .order('start_time', { ascending: false })
      .limit(50)
    setEvents((data ?? []) as EventOption[])
  }

  // Start camera scanner
  const startScanner = useCallback(async () => {
    setCameraError(null)
    await new Promise(r => setTimeout(r, 100)) // let DOM mount

    try {
      const scanner = new Html5Qrcode(READER_ID)
      scannerRef.current = scanner
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        handleQRScan,
        () => {},
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setCameraError(msg.includes('Permission') ? 'Camera permission denied.' : 'Could not access camera.')
    }
  }, [selectedEvent])

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch {}
      scannerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (phase === 'scan') startScanner()
    return () => { stopScanner() }
  }, [phase])

  async function handleQRScan(text: string) {
    if (processingRef.current) return
    const now = Date.now()
    if (lastScannedRef.current.id === text && now - lastScannedRef.current.time < 4000) return
    lastScannedRef.current = { id: text, time: now }

    processingRef.current = true
    setProcessing(true)
    const result = await processAttendance(text)
    setLastResult(result)
    setHistory(h => [result, ...h].slice(0, 50))
    setProcessing(false)
    processingRef.current = false
  }

  async function processAttendance(scannedUserId: string): Promise<ScanResult> {
    const base: Pick<ScanResult, 'userId' | 'ts'> = { userId: scannedUserId, ts: Date.now() }

    // Validate UUID format
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRe.test(scannedUserId)) {
      return { ...base, name: 'Unknown QR', avatar: null, status: 'not_found', points: 0 }
    }

    const { data: attendeeProfile } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('id', scannedUserId)
      .maybeSingle()

    if (!attendeeProfile) {
      return { ...base, name: 'User not found', avatar: null, status: 'not_found', points: 0 }
    }

    const name = attendeeProfile.full_name ?? 'Student'
    const avatar = attendeeProfile.avatar_url ?? null

    if (!selectedEvent) {
      return { ...base, name, avatar, status: 'error', points: 0 }
    }

    const { data: existing } = await supabase
      .from('event_attendees')
      .select('event_id')
      .eq('event_id', selectedEvent.id)
      .eq('user_id', scannedUserId)
      .maybeSingle()

    if (existing) {
      return { ...base, name, avatar, status: 'already', points: 0 }
    }

    await supabase.from('event_attendees').insert({ event_id: selectedEvent.id, user_id: scannedUserId })

    const pts = selectedEvent.karak_points_reward ?? 0
    if (pts > 0) {
      await supabase.from('karak_transactions').insert({
        user_id: scannedUserId,
        points: pts,
        reason: `Attended: ${selectedEvent.title}`,
        event_id: selectedEvent.id,
      })
    }

    return { ...base, name, avatar, status: 'success', points: pts }
  }

  const statusColor = (s: ScanResult['status']) =>
    s === 'success' ? '#22c55e' : s === 'already' ? '#f59e0b' : '#ef4444'

  const statusLabel = (s: ScanResult['status']) =>
    s === 'success' ? 'Checked In' : s === 'already' ? 'Already Checked In' : 'Not Found'

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 20px' }}>
      <style>{`
        #${READER_ID} { border-radius: 16px; overflow: hidden; }
        #${READER_ID} video { border-radius: 16px; }
        @keyframes scanResultIn { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 6 }}>
          Attendance Scanner
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Scan Members In</h1>
      </div>

      {phase === 'select' && (
        <>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>
              Choose an event
            </div>
            {events.length === 0 ? (
              <div style={{ fontSize: 14, color: 'var(--text-muted)', padding: '20px', textAlign: 'center', background: 'var(--bg-card)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
                No events found for your clubs.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {events.map(ev => (
                  <button
                    key={ev.id}
                    onClick={() => setSelectedEvent(selectedEvent?.id === ev.id ? null : ev)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                      background: selectedEvent?.id === ev.id ? 'rgba(138,21,56,0.18)' : 'var(--bg-card)',
                      border: `1px solid ${selectedEvent?.id === ev.id ? 'rgba(138,21,56,0.45)' : 'rgba(255,255,255,0.07)'}`,
                      textAlign: 'left', transition: 'border-color 0.15s, background 0.15s',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{ev.title}</div>
                      {ev.start_time && (
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                          {new Date(ev.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                    {ev.karak_points_reward > 0 && (
                      <div style={{
                        fontSize: 12, fontWeight: 700, color: 'var(--gold)',
                        background: 'rgba(233,193,118,0.1)', border: '1px solid rgba(233,193,118,0.2)',
                        borderRadius: 9999, padding: '3px 10px', whiteSpace: 'nowrap', flexShrink: 0,
                      }}>
                        +{ev.karak_points_reward} pts
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            disabled={!selectedEvent}
            onClick={() => setPhase('scan')}
            style={{
              width: '100%', padding: '13px',
              background: selectedEvent ? 'var(--accent)' : 'rgba(138,21,56,0.25)',
              border: 'none', borderRadius: 12,
              color: selectedEvent ? '#fff' : 'rgba(255,255,255,0.3)',
              fontSize: 15, fontWeight: 700, cursor: selectedEvent ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s',
            }}
          >
            Start Scanning
          </button>
        </>
      )}

      {phase === 'scan' && selectedEvent && (
        <>
          {/* Event badge */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(138,21,56,0.12)', border: '1px solid rgba(138,21,56,0.3)',
            borderRadius: 12, padding: '10px 14px', marginBottom: 20,
          }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>Scanning for</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{selectedEvent.title}</div>
            </div>
            <button
              onClick={async () => { await stopScanner(); setPhase('select'); setLastResult(null) }}
              style={{
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8, padding: '6px 12px', color: 'var(--text-muted)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Change
            </button>
          </div>

          {/* Last scan result */}
          {lastResult && (
            <div
              key={lastResult.ts}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--bg-card)', border: `1px solid ${statusColor(lastResult.status)}40`,
                borderRadius: 14, padding: '14px 16px', marginBottom: 16,
                animation: 'scanResultIn 0.2s ease',
              }}
            >
              <div style={{
                width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 700, color: '#fff',
              }}>
                {lastResult.avatar
                  ? <img src={lastResult.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : lastResult.name[0]?.toUpperCase()
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {lastResult.name}
                </div>
                <div style={{ fontSize: 12, color: statusColor(lastResult.status), fontWeight: 600, marginTop: 2 }}>
                  {statusLabel(lastResult.status)}
                  {lastResult.status === 'success' && lastResult.points > 0 && ` · +${lastResult.points} pts`}
                </div>
              </div>
              <div style={{ fontSize: 22 }}>
                {lastResult.status === 'success' ? '✓' : lastResult.status === 'already' ? '⚠' : '✗'}
              </div>
            </div>
          )}

          {processing && (
            <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Processing…</div>
          )}

          {/* Camera */}
          {cameraError ? (
            <div style={{
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 14, padding: '24px', textAlign: 'center',
              fontSize: 13, color: '#f87171',
            }}>
              {cameraError}
            </div>
          ) : (
            <div style={{
              background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 18, overflow: 'hidden',
            }}>
              <div id={READER_ID} />
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 10 }}>
                Recent Scans ({history.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {history.slice(0, 10).map((r, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: statusColor(r.status),
                    }} />
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: statusColor(r.status), fontWeight: 600 }}>
                      {statusLabel(r.status)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
