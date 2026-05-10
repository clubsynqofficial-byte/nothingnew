import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

const NAV_ITEMS = [
  { path: '/home', label: 'Home' },
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
  const { profile } = useAuth()
  const navigate = useNavigate()

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
              end={item.path === '/discovery'}
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
            <div
              onClick={() => { navigate('/profile'); onClose?.() }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderRadius: 8, padding: '4px', margin: '-4px -4px 0', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(138,21,56,0.12)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
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
                overflow: 'hidden',
              }}>
                {profile.avatar_url
                  ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : profile.full_name?.[0]?.toUpperCase() ?? '?'
                }
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
        </div>
      </aside>
    </>
  )
}
