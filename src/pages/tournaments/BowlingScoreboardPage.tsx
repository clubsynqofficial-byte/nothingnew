import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { computeGame, maxPinsForNextRoll, type BowlingFrame } from '../../lib/bowling'

interface Bowler {
  id: string
  team_name: string
  logo_url: string | null
}

interface Scorecard {
  id: string
  tournament_id: string
  team_id: string
  rolls: number[]
  total_score: number
  status: 'not_started' | 'in_progress' | 'completed'
  lane: number | null
}

function laneKey(lane: number | null): string {
  return lane === null ? 'Unassigned' : `Lane ${lane}`
}

const CSS = `
@keyframes bwl-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes bwl-pop{0%{transform:scale(1)}40%{transform:scale(1.15)}100%{transform:scale(1)}}
@keyframes bwl-pulse{0%,100%{opacity:1}50%{opacity:.4}}
`

// Renders each roll as bowling notation (X / - or a digit). `standing` tracks pins
// left in the current rack, resetting to 10 after a strike or spare (relevant for
// frame 10, which can span up to three rolls across up to two racks).
function frameCell(frame: BowlingFrame): string[] {
  const labels: string[] = []
  let standing = 10
  for (const pins of frame.rolls) {
    if (pins === standing) {
      labels.push(standing === 10 ? 'X' : '/')
      standing = 10
    } else {
      labels.push(pins === 0 ? '-' : String(pins))
      standing -= pins
    }
  }
  return labels
}

function FrameGrid({ frames, total, size = 1 }: { frames: BowlingFrame[]; total: number | null; size?: number }) {
  return (
    <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10 * size, overflow: 'hidden' }}>
      {frames.map((frame, i) => {
        const isTenth = i === 9
        const labels = frameCell(frame)
        return (
          <div key={i} style={{ flex: isTenth ? 1.4 : 1, minWidth: 0, borderRight: i < 9 ? '1px solid rgba(255,255,255,0.1)' : 'none' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', height: 22 * size }}>
              <span style={{ flex: 1, fontSize: 10 * size, color: 'rgba(255,255,255,0.3)', textAlign: 'center', lineHeight: `${22 * size}px` }}>{i + 1}</span>
            </div>
            <div style={{ display: 'flex', height: 26 * size }}>
              {Array.from({ length: isTenth ? 3 : 2 }).map((_, ri) => (
                <span key={ri} style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12 * size, fontWeight: 800, color: '#fff',
                  borderRight: ri < (isTenth ? 2 : 1) ? '1px solid rgba(255,255,255,0.08)' : 'none',
                }}>
                  {labels[ri] ?? ''}
                </span>
              ))}
            </div>
            <div style={{ height: 24 * size, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.03)' }}>
              <span style={{ fontSize: 13 * size, fontWeight: 900, color: frame.score !== null ? '#e9c176' : 'rgba(255,255,255,0.15)' }}>
                {frame.score ?? '–'}
              </span>
            </div>
          </div>
        )
      })}
      <div style={{ width: 52 * size, flexShrink: 0, background: 'rgba(233,193,118,0.08)', borderLeft: '1px solid rgba(233,193,118,0.25)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 8 * size, color: 'rgba(233,193,118,0.6)', fontWeight: 700, letterSpacing: '0.08em' }}>TOTAL</span>
        <span style={{ fontSize: 18 * size, fontWeight: 900, color: '#e9c176' }}>{total ?? 0}</span>
      </div>
    </div>
  )
}

// ── Public leaderboard view ────────────────────────────────────────────────
export function BowlingPublicView({ tournamentId }: { tournamentId: string }) {
  const [tournamentName, setTournamentName] = useState('')
  const [bowlers, setBowlers] = useState<Bowler[]>([])
  const [cards, setCards] = useState<Scorecard[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    const [{ data: t }, { data: teams }, { data: sc }] = await Promise.all([
      supabase.from('tournaments').select('name').eq('id', tournamentId).single(),
      supabase.from('tournament_teams').select('id,team_name,logo_url').eq('tournament_id', tournamentId).eq('status', 'accepted'),
      supabase.from('bowling_scorecards').select('*').eq('tournament_id', tournamentId),
    ])
    if (t) setTournamentName(t.name)
    if (teams) setBowlers(teams as unknown as Bowler[])
    if (sc) setCards(sc as unknown as Scorecard[])
    setLoading(false)
  }, [tournamentId])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    const ch = supabase.channel(`bowling-public-${tournamentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bowling_scorecards', filter: `tournament_id=eq.${tournamentId}` }, () => fetchAll())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [tournamentId, fetchAll])

  const cardByTeam = Object.fromEntries(cards.map(c => [c.team_id, c]))
  const rows = bowlers.map(b => {
    const card = cardByTeam[b.id]
    const game = computeGame(card?.rolls ?? [])
    return { bowler: b, card, game }
  }).sort((a, b) => (b.game.total ?? -1) - (a.game.total ?? -1))

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#070b14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{CSS}</style>
      <div style={{ width: 28, height: 28, border: '3px solid rgba(255,255,255,0.08)', borderTopColor: 'rgba(255,255,255,0.5)', borderRadius: '50%' }} />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#070b14', color: '#fff', fontFamily: 'inherit', padding: '32px 20px 80px' }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <span style={{ fontSize: 34 }}>🎳</span>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>{tournamentName}</h1>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Bowling Leaderboard</span>
          </div>
        </div>

        {rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.25)' }}>No bowlers registered yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {rows.map((row, i) => (
              <div key={row.bowler.id} style={{ background: 'rgba(255,255,255,0.025)', border: `1px solid ${i === 0 && row.game.total !== null ? 'rgba(233,193,118,0.35)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 16, padding: 16, animation: `bwl-in 0.35s ${Math.min(i * 0.04, 0.4)}s ease both` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ width: 26, textAlign: 'center', fontSize: 15, fontWeight: 900, color: i === 0 ? '#e9c176' : i === 1 ? '#94a3b8' : i === 2 ? '#b87333' : 'rgba(255,255,255,0.3)' }}>
                    {i + 1}
                  </span>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, overflow: 'hidden', flexShrink: 0 }}>
                    {row.bowler.logo_url ? <img src={row.bowler.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : row.bowler.team_name[0]}
                  </div>
                  <span style={{ flex: 1, fontSize: 14.5, fontWeight: 700 }}>{row.bowler.team_name}</span>
                  {row.card?.status === 'in_progress' && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', animation: 'bwl-pulse 1.4s ease-in-out infinite' }} />Live
                    </span>
                  )}
                  {row.card?.status === 'completed' && <span style={{ fontSize: 10, fontWeight: 800, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Final</span>}
                  {(!row.card || row.card.status === 'not_started') && <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.25)' }}>Not started</span>}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <FrameGrid frames={row.game.frames} total={row.game.total} size={0.82} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Admin control view ─────────────────────────────────────────────────────
function BowlingAdminPage({ tournamentId }: { tournamentId: string }) {
  const [tournamentName, setTournamentName] = useState('')
  const [bowlers, setBowlers] = useState<Bowler[]>([])
  const [cards, setCards] = useState<Scorecard[]>([])
  const [selectedBowlerId, setSelectedBowlerId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const cardsRef = useRef<Scorecard[]>([])
  cardsRef.current = cards

  const fetchAll = useCallback(async () => {
    const [{ data: t }, { data: teams }, { data: sc }] = await Promise.all([
      supabase.from('tournaments').select('name').eq('id', tournamentId).single(),
      supabase.from('tournament_teams').select('id,team_name,logo_url').eq('tournament_id', tournamentId).eq('status', 'accepted').order('team_name'),
      supabase.from('bowling_scorecards').select('*').eq('tournament_id', tournamentId),
    ])
    if (t) setTournamentName(t.name)
    if (teams) {
      setBowlers(teams as unknown as Bowler[])
      setSelectedBowlerId(prev => prev ?? (teams[0]?.id ?? null))
    }
    if (sc) setCards(sc as unknown as Scorecard[])
    setLoading(false)
  }, [tournamentId])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    const ch = supabase.channel(`bowling-admin-${tournamentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bowling_scorecards', filter: `tournament_id=eq.${tournamentId}` }, () => fetchAll())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [tournamentId, fetchAll])

  const selectedCard = cards.find(c => c.team_id === selectedBowlerId) ?? null
  const rolls = selectedCard?.rolls ?? []
  const game = computeGame(rolls)
  const maxPins = maxPinsForNextRoll(rolls)

  const cardByTeam = Object.fromEntries(cards.map(c => [c.team_id, c]))
  const laneGroups = new Map<string, Bowler[]>()
  for (const b of bowlers) {
    const key = laneKey(cardByTeam[b.id]?.lane ?? null)
    if (!laneGroups.has(key)) laneGroups.set(key, [])
    laneGroups.get(key)!.push(b)
  }
  const sortedLaneGroups = [...laneGroups.entries()].sort((a, b) => {
    if (a[0] === 'Unassigned') return 1
    if (b[0] === 'Unassigned') return -1
    return parseInt(a[0].replace('Lane ', '')) - parseInt(b[0].replace('Lane ', ''))
  })
  const maxLaneUsed = Math.max(0, ...cards.map(c => c.lane ?? 0))
  const laneOptions = Array.from({ length: maxLaneUsed + 1 }, (_, i) => i + 1) // always offer one fresh lane beyond the highest in use

  async function ensureCard(teamId: string): Promise<Scorecard> {
    const existing = cardsRef.current.find(c => c.team_id === teamId)
    if (existing) return existing
    const { data } = await supabase.from('bowling_scorecards').insert({ tournament_id: tournamentId, team_id: teamId }).select().single()
    const created = data as unknown as Scorecard
    setCards(prev => [...prev, created])
    return created
  }

  async function moveToLane(teamId: string, lane: number) {
    const card = await ensureCard(teamId)
    await supabase.from('bowling_scorecards').update({ lane }).eq('id', card.id)
    setCards(prev => prev.map(c => c.team_id === teamId ? { ...c, lane } : c))
  }

  async function saveRolls(teamId: string, newRolls: number[]) {
    setSaving(true)
    const g = computeGame(newRolls)
    const status: Scorecard['status'] = newRolls.length === 0 ? 'not_started' : g.gameComplete ? 'completed' : 'in_progress'
    const card = await ensureCard(teamId)
    await supabase.from('bowling_scorecards').update({
      rolls: newRolls, total_score: g.total ?? 0, status, updated_at: new Date().toISOString(),
    }).eq('id', card.id)
    setCards(prev => prev.map(c => c.team_id === teamId ? { ...c, rolls: newRolls, total_score: g.total ?? 0, status } : c))
    setSaving(false)
  }

  async function addRoll(pins: number) {
    if (!selectedBowlerId || game.gameComplete) return
    await saveRolls(selectedBowlerId, [...rolls, pins])
  }

  async function undoRoll() {
    if (!selectedBowlerId || rolls.length === 0) return
    await saveRolls(selectedBowlerId, rolls.slice(0, -1))
  }

  async function resetCard() {
    if (!selectedBowlerId) return
    await saveRolls(selectedBowlerId, [])
  }

  const glass = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#070b14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{CSS}</style>
      <div style={{ width: 28, height: 28, border: '3px solid rgba(255,255,255,0.08)', borderTopColor: 'rgba(255,255,255,0.5)', borderRadius: '50%' }} />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#070b14', color: '#fff', fontFamily: 'inherit' }}>
      <style>{CSS}</style>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 22 }}>🎳</span>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{tournamentName}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Bowling Command Center</div>
        </div>
        <select value={selectedBowlerId ?? ''} onChange={e => setSelectedBowlerId(e.target.value)} style={{ padding: '9px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#fff', fontSize: 13, fontFamily: 'inherit' }}>
          {sortedLaneGroups.map(([lane, group]) => (
            <optgroup key={lane} label={lane}>
              {group.map(b => <option key={b.id} value={b.id}>{b.team_name}</option>)}
            </optgroup>
          ))}
        </select>
        <a href={`/tournaments/${tournamentId}/scoreboard/bowling?view=public`} target="_blank" rel="noreferrer" style={{ padding: '9px 16px', background: 'rgba(233,193,118,0.12)', border: '1px solid rgba(233,193,118,0.3)', borderRadius: 10, color: '#e9c176', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          Public Leaderboard ↗
        </a>
      </div>

      {bowlers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'rgba(255,255,255,0.3)' }}>No bowlers registered for this tournament yet.</div>
      ) : (
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px 80px' }}>
          <div style={{ borderRadius: 18, padding: '20px 20px 16px', marginBottom: 18, ...glass }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 800 }}>{bowlers.find(b => b.id === selectedBowlerId)?.team_name}</span>
                <select
                  value={selectedCard?.lane ?? ''}
                  onChange={e => selectedBowlerId && moveToLane(selectedBowlerId, parseInt(e.target.value))}
                  style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', padding: '2px 6px', borderRadius: 999, background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)', fontFamily: 'inherit', cursor: 'pointer' }}
                >
                  {!selectedCard?.lane && <option value="" disabled>Unassigned</option>}
                  {laneOptions.map(l => <option key={l} value={l}>Lane {l}</option>)}
                </select>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, color: game.gameComplete ? '#4ade80' : rolls.length ? '#f97316' : 'rgba(255,255,255,0.3)', background: game.gameComplete ? 'rgba(74,222,128,0.12)' : rolls.length ? 'rgba(249,115,22,0.12)' : 'rgba(255,255,255,0.05)' }}>
                {game.gameComplete ? 'Final' : rolls.length ? 'In Progress' : 'Not Started'}
              </span>
            </div>
            <div style={{ overflowX: 'auto', marginBottom: 4 }}>
              <FrameGrid frames={game.frames} total={game.total} />
            </div>
          </div>

          <div style={{ borderRadius: 18, padding: 20, ...glass }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
              {game.gameComplete ? 'Game complete' : `Next roll — up to ${maxPins} pin${maxPins !== 1 ? 's' : ''}`}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 14 }}>
              {Array.from({ length: 11 }).map((_, pins) => (
                <button key={pins} disabled={pins > maxPins || game.gameComplete || saving} onClick={() => addRoll(pins)} style={{
                  padding: '14px 0', borderRadius: 10, fontSize: 15, fontWeight: 800, fontFamily: 'inherit', cursor: pins > maxPins || game.gameComplete ? 'default' : 'pointer',
                  background: pins === 10 ? 'rgba(233,193,118,0.15)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${pins === 10 ? 'rgba(233,193,118,0.35)' : 'rgba(255,255,255,0.1)'}`,
                  color: pins > maxPins || game.gameComplete ? 'rgba(255,255,255,0.15)' : pins === 10 ? '#e9c176' : '#fff',
                  opacity: pins > maxPins || game.gameComplete ? 0.4 : 1,
                }}>
                  {pins === 10 ? 'X' : pins}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={undoRoll} disabled={rolls.length === 0 || saving} style={{ flex: 1, padding: '11px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontWeight: 700, fontSize: 13, cursor: rolls.length === 0 ? 'default' : 'pointer', fontFamily: 'inherit', opacity: rolls.length === 0 ? 0.4 : 1 }}>
                ↩ Undo Last Roll
              </button>
              <button onClick={resetCard} disabled={rolls.length === 0 || saving} style={{ flex: 1, padding: '11px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontWeight: 700, fontSize: 13, cursor: rolls.length === 0 ? 'default' : 'pointer', fontFamily: 'inherit', opacity: rolls.length === 0 ? 0.4 : 1 }}>
                Reset Scorecard
              </button>
            </div>
          </div>

          {/* Mini leaderboard, grouped by lane */}
          <div style={{ marginTop: 18, borderRadius: 18, padding: 18, ...glass }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>All Bowlers</div>
            {sortedLaneGroups.map(([lane, group]) => (
              <div key={lane} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, padding: '0 10px' }}>{lane}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {group.map(b => {
                    const c = cards.find(x => x.team_id === b.id)
                    const g = computeGame(c?.rolls ?? [])
                    return (
                      <div key={b.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px 4px 10px', borderRadius: 9,
                        background: b.id === selectedBowlerId ? 'rgba(233,193,118,0.08)' : 'transparent',
                      }}>
                        <button onClick={() => setSelectedBowlerId(b.id)} style={{
                          flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', minWidth: 0,
                          background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                        }}>
                          <span style={{ flex: 1, fontSize: 13, fontWeight: b.id === selectedBowlerId ? 700 : 500, color: b.id === selectedBowlerId ? '#e9c176' : 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.team_name}</span>
                          {c?.status === 'in_progress' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', animation: 'bwl-pulse 1.4s ease-in-out infinite', flexShrink: 0 }} />}
                          <span style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.4)', minWidth: 28, textAlign: 'right', flexShrink: 0 }}>{g.total ?? 0}</span>
                        </button>
                        <select
                          value={c?.lane ?? ''}
                          onChange={e => moveToLane(b.id, parseInt(e.target.value))}
                          style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 600, color: 'rgba(255,255,255,0.4)', padding: '3px 4px', borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'inherit', cursor: 'pointer' }}
                        >
                          {!c?.lane && <option value="" disabled>–</option>}
                          {laneOptions.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function BowlingScoreboardPage() {
  const [searchParams] = useSearchParams()
  const { tournamentId } = useParams<{ tournamentId: string }>()
  if (searchParams.get('view') === 'public') return <BowlingPublicView tournamentId={tournamentId!} />
  return <BowlingAdminPage tournamentId={tournamentId!} />
}
