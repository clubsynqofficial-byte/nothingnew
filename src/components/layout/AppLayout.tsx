import { useState, useEffect, type ReactNode } from 'react'
import SideNav from './SideNav'
import TopBar from './TopBar'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

interface Props {
  children: ReactNode
  searchPlaceholder?: string
  onSearch?: (q: string) => void
}

export default function AppLayout({ children, searchPlaceholder, onSearch }: Props) {
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
      <TopBar
        searchPlaceholder={searchPlaceholder}
        onSearch={onSearch}
        onMenuToggle={() => setNavOpen(o => !o)}
      />
      <SideNav open={navOpen} onClose={() => setNavOpen(false)} />
      <main className="main-content">
        {children}
      </main>
    </div>
  )
}
