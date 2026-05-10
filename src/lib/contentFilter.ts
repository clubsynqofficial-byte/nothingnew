/** Normalise text before matching: lowercase + common leet-speak substitutions */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[@4]/g, 'a')
    .replace(/3/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/0/g, 'o')
    .replace(/[$5]/g, 's')
    .replace(/7/g, 't')
    .replace(/\s+/g, ' ')
    .trim()
}

// All terms are matched against normalised text with word-boundary awareness.
const BLOCKED_TERMS: string[] = [
  // Strong profanity
  'fuck', 'fuk', 'fvck', 'fucc', 'fck',
  'shit', 'shyt', 'sheit',
  'asshole', 'arsehole',
  'bitch', 'biatch', 'bytch',
  'cunt',
  'dick', 'dicc',
  'cock',
  'pussy',
  'whore',
  'slut',
  'bastard',
  // Slurs
  'nigger', 'nigga',
  'faggot', 'fagot',
  'retard',
  // Self-harm / threats
  'kys',
  'kill yourself',
  'kill urself',
  'hang yourself',
  'go die',
  'go kill',
  // NSFW content
  'porn', 'porno', 'pornography',
  'nude', 'nudes',
  'hentai',
  'onlyfans',
  // Explicit sexual acts
  'blowjob', 'blow job',
  'handjob', 'hand job',
  'masturbat',
  'orgasm',
  'ejaculat',
  'dildo',
  'bdsm',
  // Hate speech
  'nazi', 'nazism',
  'kkk',
  'white power',
  'white supremacy',
  // Violence / crime
  'rape', 'rapist', 'raping',
  'genocide',
  'terrorism',
  'terrorist',
]

/** Returns the first blocked term found in normalised text, or null if clean. */
function findBlocked(normalised: string): string | null {
  for (const term of BLOCKED_TERMS) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
    const re = new RegExp(`(?<![a-z])${escaped}(?![a-z])`)
    if (re.test(normalised)) return term
  }
  return null
}

export interface FilterResult {
  ok: boolean
  reason?: string
}

/**
 * Checks one or more text strings for NSFW / inappropriate content.
 * Pass every user-supplied field you want validated.
 * Returns { ok: true } if all clean, { ok: false, reason } if any field fails.
 */
export function filterText(...texts: string[]): FilterResult {
  for (const raw of texts) {
    if (!raw?.trim()) continue
    const hit = findBlocked(normalise(raw))
    if (hit) {
      return {
        ok: false,
        reason: 'Your content contains inappropriate language. Please revise it before posting.',
      }
    }
  }
  return { ok: true }
}

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
])
const ALLOWED_IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif)$/i
const MAX_IMAGE_MB = 10

/**
 * Validates an uploaded image file: type, extension, and size.
 * Does NOT perform AI-based NSFW detection — use a server-side service for that.
 */
export function validateImage(file: File): FilterResult {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return { ok: false, reason: 'Only images are allowed (JPEG, PNG, GIF, WebP).' }
  }
  if (!ALLOWED_IMAGE_EXT.test(file.name)) {
    return { ok: false, reason: 'Invalid file extension. Allowed: jpg, jpeg, png, gif, webp.' }
  }
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
    return { ok: false, reason: `Image must be under ${MAX_IMAGE_MB} MB.` }
  }
  return { ok: true }
}
