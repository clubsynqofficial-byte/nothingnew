import { useState, type ReactNode } from 'react'
import SideNav from './SideNav'
import TopBar from './TopBar'

interface Props {
  children: ReactNode
  searchPlaceholder?: string
  onSearch?: (q: string) => void
}

export default function AppLayout({ children, searchPlaceholder, onSearch }: Props) {
  const [navOpen, setNavOpen] = useState(false)

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
