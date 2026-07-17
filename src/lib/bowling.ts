// Standard ten-pin bowling scoring engine.
// The game is stored as a flat sequence of roll pin-counts; frame boundaries
// and scores (including strike/spare bonus chaining) are derived from it.

export interface BowlingFrame {
  rolls: number[]
  score: number | null // null until enough subsequent rolls exist to resolve strike/spare bonuses
}

export interface BowlingGame {
  frames: BowlingFrame[] // always 10 entries, unfilled ones have rolls: []
  total: number | null // final total once frame 10 is resolved, else running total of resolved frames
  gameComplete: boolean
}

function frameBoundaries(rolls: number[]): number[][] {
  const frames: number[][] = []
  let i = 0
  for (let f = 0; f < 10 && i < rolls.length; f++) {
    if (f === 9) {
      frames.push(rolls.slice(i, i + 3))
      i += Math.min(3, rolls.length - i)
    } else if (rolls[i] === 10) {
      frames.push([10])
      i += 1
    } else {
      frames.push(rolls.slice(i, i + 2))
      i += Math.min(2, rolls.length - i)
    }
  }
  return frames
}

export function isFrame10Complete(r: number[]): boolean {
  if (r.length < 2) return false
  if (r[0] === 10) return r.length === 3
  if (r[0] + r[1] === 10) return r.length === 3
  return r.length === 2
}

export function computeGame(rolls: number[]): BowlingGame {
  const raw = frameBoundaries(rolls)
  const scored: BowlingFrame[] = []
  let running = 0

  for (let f = 0; f < raw.length; f++) {
    const frame = raw[f]
    const sum = frame.reduce((a, b) => a + b, 0)
    const isStrike = f < 9 && frame[0] === 10
    const isSpare = f < 9 && frame.length === 2 && sum === 10

    let bonusNeeded = 0
    if (isStrike) bonusNeeded = 2
    else if (isSpare) bonusNeeded = 1

    if (bonusNeeded > 0) {
      const following: number[] = []
      for (let k = f + 1; k < raw.length && following.length < bonusNeeded; k++) {
        for (const r of raw[k]) {
          following.push(r)
          if (following.length === bonusNeeded) break
        }
      }
      if (following.length < bonusNeeded) {
        scored.push({ rolls: frame, score: null })
        continue
      }
      running += sum + following.reduce((a, b) => a + b, 0)
      scored.push({ rolls: frame, score: running })
    } else if (f === 9 && !isFrame10Complete(frame)) {
      scored.push({ rolls: frame, score: null })
    } else {
      running += sum
      scored.push({ rolls: frame, score: running })
    }
  }

  while (scored.length < 10) scored.push({ rolls: [], score: null })

  const gameComplete = raw.length === 10 && isFrame10Complete(raw[9])
  const lastResolved = [...scored].reverse().find(f => f.score !== null)
  return {
    frames: scored,
    total: lastResolved ? lastResolved.score : (rolls.length ? 0 : null),
    gameComplete,
  }
}

// Max pins selectable for the next roll, given the game so far. Handles frame 10's
// pin-reset behaviour after a strike or spare within that frame.
export function maxPinsForNextRoll(rolls: number[]): number {
  const raw = frameBoundaries(rolls)
  const frameIdx = raw.length === 0 ? 0 : (isCurrentFrameDone(raw[raw.length - 1], raw.length - 1) ? raw.length : raw.length - 1)
  if (frameIdx >= 10) return 0
  const current = raw[frameIdx] ?? []

  if (frameIdx < 9) {
    if (current.length === 0) return 10
    return 10 - current[0]
  }
  // Frame 10
  if (current.length === 0) return 10
  if (current.length === 1) return current[0] === 10 ? 10 : 10 - current[0]
  // current.length === 2 (only reachable if a 3rd roll is allowed)
  const isStrike = current[0] === 10
  const isSpare = !isStrike && current[0] + current[1] === 10
  if (isStrike) return current[1] === 10 ? 10 : 10 - current[1]
  if (isSpare) return 10
  return 0
}

function isCurrentFrameDone(frame: number[], frameIdx: number): boolean {
  if (frameIdx === 9) return isFrame10Complete(frame)
  if (frame[0] === 10) return true
  return frame.length === 2
}

export function isGameComplete(rolls: number[]): boolean {
  return computeGame(rolls).gameComplete
}
