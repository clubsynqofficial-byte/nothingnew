import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

export type PresenceStatus = 'online' | 'away' | 'offline'

interface PresenceCtx {
  /** userId → their manual status (from DB, updated in real-time) */
  statusMap: Record<string, PresenceStatus>
  /** set of userIds who are currently connected */
  connectedSet: Set<string>
  myStatus: PresenceStatus
  setMyStatus: (s: PresenceStatus) => Promise<void>
}

const PresenceContext = createContext<PresenceCtx>({
  statusMap: {},
  connectedSet: new Set(),
  myStatus: 'online',
  setMyStatus: async () => {},
})

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [statusMap, setStatusMap]       = useState<Record<string, PresenceStatus>>({})
  const [connectedSet, setConnectedSet] = useState<Set<string>>(new Set())
  const [myStatus, setMyStatusState]    = useState<PresenceStatus>('online')
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    if (!user) return

    // ── 1. Load own saved status ──────────────────────────────────────────
    supabase
      .from('profiles')
      .select('manual_status')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        const saved = (data?.manual_status as PresenceStatus | null) ?? 'online'
        setMyStatusState(saved)
      })

    // ── 2. Presence channel — who is connected ────────────────────────────
    const presenceCh = supabase.channel('presence-global', {
      config: { presence: { key: user.id } },
    })
    presenceChannelRef.current = presenceCh

    presenceCh
      .on('presence', { event: 'sync' }, () => {
        setConnectedSet(new Set(Object.keys(presenceCh.presenceState())))
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          await presenceCh.track({ user_id: user.id })
        }
      })

    // ── 3. postgres_changes — real-time manual_status updates ─────────────
    const statusCh = supabase
      .channel('profile-status-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        payload => {
          const uid    = payload.new.id as string
          const status = payload.new.manual_status as PresenceStatus | null
          if (!uid || !status) return
          setStatusMap(prev => ({ ...prev, [uid]: status }))
          if (uid === user.id) setMyStatusState(status)
        }
      )
      .subscribe()

    return () => {
      presenceChannelRef.current = null
      supabase.removeChannel(presenceCh)
      supabase.removeChannel(statusCh)
    }
  }, [user])

  const setMyStatus = useCallback(async (s: PresenceStatus) => {
    // Optimistic local update — UI reflects immediately
    setMyStatusState(s)
    setStatusMap(prev => user ? { ...prev, [user.id]: s } : prev)
    // Write to DB → postgres_changes fires for all other subscribers
    if (user) {
      await supabase.from('profiles').update({ manual_status: s }).eq('id', user.id)
    }
  }, [user])

  return (
    <PresenceContext.Provider value={{ statusMap, connectedSet, myStatus, setMyStatus }}>
      {children}
    </PresenceContext.Provider>
  )
}

export const usePresence = () => useContext(PresenceContext)
