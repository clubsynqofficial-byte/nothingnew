import { useState, type ChangeEvent } from 'react'
import { useAuth } from '../../contexts/AuthContext'

interface Props {
  searchPlaceholder?: string
  onSearch?: (query: string) => void
  onMenuToggle?: () => void
}

export default function TopBar({ searchPlaceholder = 'Search...', onSearch, onMenuToggle }: Props) {
  const { profile } = useAuth()
  const [query, setQuery] = useState('')

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value)
    onSearch?.(e.target.value)
  }

  return (
    <header className="top-bar" style={{
      background: 'rgba(18,18,18,0.7)',
      backdropFilter: 'blur(16px)',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: 12,
    }}>
      {/* Hamburger — hidden on desktop via CSS */}
      <button
        className="hamburger"
        onClick={onMenuToggle}
        style={{
          display: 'none', // overridden by CSS on mobile
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          background: 'transparent',
          border: 'none',
          color: 'var(--text-primary)',
          borderRadius: 8,
          flexShrink: 0,
          padding: 0,
        }}
        aria-label="Open navigation"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Logo — hidden on mobile via CSS */}
      <div className="top-bar-logo-space" style={{ width: 216, flexShrink: 0 }}>
        <span style={{
          fontSize: 18,
          fontWeight: 900,
          letterSpacing: '0.18em',
          color: '#fff',
          textTransform: 'uppercase',
        }}>
          CLUBSYNQ
        </span>
      </div>

      {/* Search */}
      <div className="top-bar-search" style={{ flex: 1, maxWidth: 480, position: 'relative' }}>
        <svg
          style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={query}
          onChange={handleChange}
          style={{
            width: '100%',
            background: 'rgba(52,39,40,0.5)',
            border: '1px solid rgba(87,65,68,0.3)',
            borderRadius: 9999,
            padding: '9px 16px 9px 40px',
            color: 'var(--text-primary)',
            fontSize: 14,
            outline: 'none',
          }}
        />
      </div>

      {/* User avatar */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          fontWeight: 700,
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.1)',
          flexShrink: 0,
        }}>
          {profile?.full_name?.[0]?.toUpperCase() ?? '?'}
        </div>
      </div>
    </header>
  )
}
