import { useState, useEffect, type ReactNode } from 'react'
import SideNav from './SideNav'
import TopBar from './TopBar'
import FloatingChat from '../FloatingChat'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

interface Props {
  children: ReactNode
}

export default function AppLayout({ children }: Props) {
  const [navOpen, setNavOpen] = useState(false)
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return
    const ping = () => supabase.rpc('touch_last_seen')
    ping()
    const id = setInterval(ping, 60_000)
    return () => clearInterval(id)
  }, [user])

  return (
    <div className="app-shell">
      <TopBar onMenuToggle={() => setNavOpen(o => !o)} />
      <SideNav open={navOpen} onClose={() => setNavOpen(false)} />
      <main className="main-content">
        {children}
      </main>
      <FloatingChat />
    </div>
  )
}
