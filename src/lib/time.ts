/** Parses a Supabase timestamp string as UTC, ensuring correct local-time conversion. */
export function parseTS(iso: string): Date {
  // If string has no timezone indicator, append Z to treat as UTC
  if (iso && !iso.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(iso)) {
    return new Date(iso + 'Z')
  }
  return new Date(iso)
}
