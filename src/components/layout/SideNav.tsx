import { NavLink } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

const NAV_ITEMS = [
  { path: '/discovery', label: 'Discovery' },
  { path: '/leadership', label: 'Leadership' },
  { path: '/collaboration', label: 'Collaboration' },
  { path: '/talent', label: 'Talent' },
  { path: '/clubs', label: 'Clubs' },
]

interface Props {
  open?: boolean
  onClose?: () => void
}

export default function SideNav({ open = false, onClose }: Props) {
  const { profile, signOut } = useAuth()

  return (
    <>
      {/* Backdrop overlay — shown on mobile when nav is open */}
      <div
        className={`nav-backdrop${open ? ' open' : ''}`}
        onClick={onClose}
      />

      <aside
        className={`side-nav${open ? ' open' : ''}`}
        style={{
          width: 240,
          minHeight: '100vh',
          background: 'rgba(18,18,18,0.95)',
          backdropFilter: 'blur(20px)',
          borderRight: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          flexDirection: 'column',
          paddingTop: 72,
        }}
      >
        {/* Nav links */}
        <nav style={{ flex: 1, padding: '16px 8px', overflowY: 'auto' }}>
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={onClose}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '11px 16px',
                borderRadius: 8,
                textDecoration: 'none',
                fontSize: 15,
                fontWeight: isActive ? 500 : 400,
                color: isActive ? '#fff' : 'var(--text-muted)',
                background: isActive ? 'rgba(138,21,56,0.2)' : 'transparent',
                borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                marginBottom: 2,
                transition: 'color 0.15s, background 0.15s',
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom */}
        <div style={{ padding: '16px 12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {profile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 700,
                color: '#fff',
                flexShrink: 0,
              }}>
                {profile.full_name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {profile.full_name ?? 'Student'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {profile.karak_points} pts
                </div>
              </div>
            </div>
          )}
          <button
            onClick={signOut}
            style={{
              width: '100%',
              padding: '7px',
              background: 'transparent',
              border: '1px solid rgba(87,65,68,0.3)',
              borderRadius: 8,
              color: 'var(--text-muted)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Sign Out
          </button>
        </div>
      </aside>
    </>
  )
}
