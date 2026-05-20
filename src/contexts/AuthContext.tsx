import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { type Session, type User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { type Profile } from '../types'

export interface IncomingCallData {
  offer: RTCSessionDescriptionInit
  callerId: string
  callerName: string | null
}

interface AuthContextType {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  incomingCall: IncomingCallData | null
  rejectIncomingCall: () => void
  consumeIncomingCall: () => { data: IncomingCallData; peerCh: ReturnType<typeof supabase.channel> } | null
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
  incomingCall: null,
  rejectIncomingCall: () => {},
  consumeIncomingCall: () => null,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null)
  const incomingPeerChRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*, university:universities(*)')
      .eq('id', userId)
      .single()
    if (data) setProfile(data as Profile)
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user.id)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // ── Always-on personal call signaling channel ──────────────────────────
  useEffect(() => {
    if (!user) return
    const ch = supabase.channel(`user-vc-${user.id}`)

    ch.on('broadcast', { event: 'offer' }, ({ payload }) => {
      if (payload.from === user.id) return
      // Pre-subscribe to caller's channel so we can send answer / ICE / reject
      const callerCh = supabase.channel(`user-vc-${payload.from}`)
      callerCh.subscribe()
      incomingPeerChRef.current = callerCh
      setIncomingCall({ offer: payload.offer, callerId: payload.from, callerName: payload.callerName ?? null })
      // Browser notification
      if ('Notification' in window && Notification.permission === 'granted') {
        const n = new Notification('📹 Incoming video call', {
          body: `${payload.callerName ?? 'Someone'} is calling you`,
          tag: 'incoming-call',
          requireInteraction: true,
        })
        n.onclick = () => { window.focus(); n.close() }
      } else if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission()
      }
    })
    // Relay all other signals as window events so MessagesPage can handle WebRTC
    ch.on('broadcast', { event: 'answer' }, ({ payload }) => {
      if (payload.from === user.id) return
      window.dispatchEvent(new CustomEvent('vc:answer', { detail: payload }))
    })
    ch.on('broadcast', { event: 'end' },    () => {
      setIncomingCall(null)
      window.dispatchEvent(new CustomEvent('vc:end'))
    })
    ch.on('broadcast', { event: 'reject' }, () => {
      window.dispatchEvent(new CustomEvent('vc:reject'))
    })

    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user?.id])

  function rejectIncomingCall() {
    incomingPeerChRef.current?.send({ type: 'broadcast', event: 'reject', payload: { from: user?.id } })
    if (incomingPeerChRef.current) { supabase.removeChannel(incomingPeerChRef.current); incomingPeerChRef.current = null }
    setIncomingCall(null)
  }

  function consumeIncomingCall() {
    if (!incomingCall || !incomingPeerChRef.current) return null
    const result = { data: incomingCall, peerCh: incomingPeerChRef.current }
    incomingPeerChRef.current = null
    setIncomingCall(null)
    return result
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signOut, refreshProfile, incomingCall, rejectIncomingCall, consumeIncomingCall }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
