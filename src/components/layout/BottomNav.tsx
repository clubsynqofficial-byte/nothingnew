import { NavLink } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

const TABS = [
  {
    path: '/home',
    label: 'Home',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
        <polyline points="9 21 9 12 15 12 15 21"/>
      </svg>
    ),
  },
  {
    path: '/discovery',
    label: 'Discover',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    ),
  },
  {
    path: '/events',
    label: 'Events',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    path: '/messages',
    label: 'Messages',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
  {
    path: '/profile',
    label: 'Profile',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
]

export default function BottomNav() {
  const { profile } = useAuth()

  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {TABS.map(tab => (
        <NavLink
          key={tab.path}
          to={tab.path}
          end={tab.path === '/home' || tab.path === '/profile'}
          className={({ isActive }) => `bn-tab${isActive ? ' bn-active' : ''}`}
        >
          <span className="bn-icon">
            {tab.path === '/profile' && profile?.avatar_url
              ? <img src={profile.avatar_url} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', border: '2px solid transparent' }} className="bn-avatar" />
              : tab.icon
            }
          </span>
          <span className="bn-label">{tab.label}</span>
        </NavLink>
      ))}

      <style>{`
        .bottom-nav {
          display: none;
          position: fixed;
          bottom: 0; left: 0; right: 0;
          height: calc(58px + env(safe-area-inset-bottom));
          padding-bottom: env(safe-area-inset-bottom);
          background: rgba(12,6,9,0.97);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border-top: 1px solid rgba(255,255,255,0.07);
          z-index: 46;
          align-items: stretch;
          justify-content: space-around;
        }
        .bn-tab {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          text-decoration: none;
          color: rgba(255,255,255,0.38);
          padding: 6px 0;
          transition: color 0.15s;
          -webkit-tap-highlight-color: transparent;
          position: relative;
        }
        .bn-tab.bn-active {
          color: var(--accent);
        }
        .bn-tab.bn-active .bn-avatar {
          border-color: var(--accent) !important;
        }
        .bn-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
        }
        .bn-label {
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.02em;
          line-height: 1;
        }
        @media (max-width: 768px) {
          .bottom-nav { display: flex; }
        }
      `}</style>
    </nav>
  )
}
