import { type ReactNode } from 'react'
import SideNav from './SideNav'
import TopBar from './TopBar'

interface Props {
  children: ReactNode
  searchPlaceholder?: string
  onSearch?: (q: string) => void
}

export default function AppLayout({ children, searchPlaceholder, onSearch }: Props) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-dark)' }}>
      <TopBar searchPlaceholder={searchPlaceholder} onSearch={onSearch} />
      <SideNav />
      <main style={{ marginLeft: 240, marginTop: 64, flex: 1, minHeight: 'calc(100vh - 64px)', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  )
}
