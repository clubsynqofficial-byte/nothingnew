import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { PresenceProvider } from './contexts/PresenceContext'
import AppLayout from './components/layout/AppLayout'
import OnboardingModal from './components/OnboardingModal'
import LandingPage from './pages/landing/LandingPage'
import SignIn from './pages/auth/SignIn'
import SignUp from './pages/auth/SignUp'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import HomePage from './pages/home/HomePage'
import DiscoveryPage from './pages/discovery/DiscoveryPage'
import LeadershipPage from './pages/leadership/LeadershipPage'
import CollaborationPage from './pages/collaboration/CollaborationPage'
import TalentPage from './pages/talent/TalentPage'
import ClubsPage from './pages/clubs/ClubsPage'
import ClubProfilePage from './pages/clubs/ClubProfilePage'
import AttendPage from './pages/attend/AttendPage'
import ProfilePage from './pages/profile/ProfilePage'
import PositionsPage from './pages/positions/PositionsPage'
import MessagesPage from './pages/messages/MessagesPage'
import EventsPage from './pages/events/EventsPage'
import SettingsPage from './pages/settings/SettingsPage'
import TournamentsPage from './pages/tournaments/TournamentsPage'
import TournamentDetailPage from './pages/tournaments/TournamentDetailPage'
import TournamentScoreboardPage from './pages/tournaments/TournamentScoreboardPage'
import BasketballScoreboardPage from './pages/tournaments/BasketballScoreboardPage'
import FootballScoreboardPage from './pages/tournaments/FootballScoreboardPage'
import MatchCommandCenterPage from './pages/tournaments/MatchCommandCenterPage'
import MyTeamsPage from './pages/teams/MyTeamsPage'
import MatchCenterPage from './pages/matches/MatchCenterPage'
import MarketplacePage from './pages/marketplace/MarketplacePage'
import CreateShopPage from './pages/marketplace/CreateShopPage'
import ShopDetailPage from './pages/marketplace/ShopDetailPage'
import ScanPage from './pages/scan/ScanPage'
import QRPage from './pages/qr/QRPage'

function RootRoute() {
  const { session, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (session) {
    const pending = sessionStorage.getItem('post_auth_redirect')
    if (pending) { sessionStorage.removeItem('post_auth_redirect'); return <Navigate to={pending} replace /> }
    return <Navigate to="/home" replace />
  }
  return <LandingPage />
}

function IncomingCallToast() {
  const { incomingCall, rejectIncomingCall } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  if (!incomingCall) return null
  const initials = (incomingCall.callerName ?? '?').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
  function handleAccept() {
    if (location.pathname !== '/messages') navigate('/messages', { state: { autoAnswer: true } })
    else window.dispatchEvent(new CustomEvent('vc:user-accept'))
  }
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 99999, background: 'rgba(14,8,11,0.97)', border: '1px solid rgba(74,222,128,0.35)', borderRadius: 18, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 8px 40px rgba(0,0,0,0.7)', backdropFilter: 'blur(20px)', minWidth: 280, animation: 'vc-fade .25s ease both' }}>
      <style>{`@keyframes vc-fade{from{opacity:0}to{opacity:1}} @keyframes vc-pulse{0%,100%{opacity:1;box-shadow:0 0 8px rgba(74,222,128,.8)}50%{opacity:.5;box-shadow:0 0 18px rgba(74,222,128,.4)}} @keyframes vc-dot{0%,80%,100%{transform:scale(.6);opacity:.3}40%{transform:scale(1);opacity:1}}`}</style>
      <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg,#166534,#15803d)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 900, color: '#fff', flexShrink: 0, animation: 'vc-pulse 1.5s ease-in-out infinite' }}>{initials}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#fff', marginBottom: 3 }}>{incomingCall.callerName ?? 'Someone'}</div>
        <div style={{ fontSize: 11.5, color: 'rgba(74,222,128,0.8)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background:'rgba(74,222,128,.6)', animation:'vc-dot 1.4s ease-in-out infinite' }} />
          <span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background:'rgba(74,222,128,.6)', animation:'vc-dot 1.4s ease-in-out infinite', animationDelay:'.3s' }} />
          <span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background:'rgba(74,222,128,.6)', animation:'vc-dot 1.4s ease-in-out infinite', animationDelay:'.6s' }} />
          <span>Incoming video call</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button onClick={rejectIncomingCall} title="Decline" style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ transform: 'rotate(135deg)' }}><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
        </button>
        <button onClick={handleAccept} title="Accept" style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#16a34a,#22c55e)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 16px rgba(34,197,94,0.5)' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
        </button>
      </div>
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, profile } = useAuth()
  const [dismissed, setDismissed] = useState(false)
  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/" replace />
  const showOnboarding = profile && profile.onboarded === false && !dismissed
  return (
    <AppLayout>
      {showOnboarding && <OnboardingModal onDone={() => setDismissed(true)} />}
      <IncomingCallToast />
      {children}
    </AppLayout>
  )
}

function ProtectedRouteRaw({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to={`/signin?redirect=${encodeURIComponent(location.pathname)}`} replace />
  return <>{children}</>
}

// Basketball scoreboard: public view (?view=public) loads without auth or AppLayout
// so hundreds of viewers each only use 1 Realtime connection instead of 6.
// Admin view (no param) still requires auth + AppLayout as before.
function BasketballScoreboardRoute() {
  const [searchParams] = useSearchParams()
  if (searchParams.get('view') === 'public') return <BasketballScoreboardPage />
  return <ProtectedRoute><BasketballScoreboardPage /></ProtectedRoute>
}

function FootballScoreboardRoute() {
  const [searchParams] = useSearchParams()
  if (searchParams.get('view') === 'public') return <FootballScoreboardPage />
  return <ProtectedRoute><FootballScoreboardPage /></ProtectedRoute>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (session) return <Navigate to="/home" replace />
  return <>{children}</>
}

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-dark)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '0.2em', color: '#fff', marginBottom: 16 }}>
          CLUBSYNQ
        </div>
        <div style={{
          width: 32,
          height: 32,
          border: '3px solid rgba(87,65,68,0.3)',
          borderTopColor: 'var(--accent)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          margin: '0 auto',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  )
}

function ProfilePageWithKey() {
  const { userId } = useParams<{ userId: string }>()
  return <ProfilePage key={userId} />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRoute />} />
      <Route path="/signin" element={<PublicRoute><SignIn /></PublicRoute>} />
      <Route path="/signup" element={<PublicRoute><SignUp /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/home" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
      <Route path="/discovery" element={<ProtectedRoute><DiscoveryPage /></ProtectedRoute>} />
      <Route path="/leadership" element={<ProtectedRoute><LeadershipPage /></ProtectedRoute>} />
      <Route path="/collaboration" element={<ProtectedRoute><CollaborationPage /></ProtectedRoute>} />
      <Route path="/talent" element={<ProtectedRoute><TalentPage /></ProtectedRoute>} />
      <Route path="/clubs" element={<ProtectedRoute><ClubsPage /></ProtectedRoute>} />
      <Route path="/clubs/:clubId" element={<ProtectedRoute><ClubProfilePage /></ProtectedRoute>} />
      <Route path="/attend/:eventId" element={<ProtectedRouteRaw><AttendPage /></ProtectedRouteRaw>} />
      <Route path="/positions" element={<ProtectedRoute><PositionsPage /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><ProfilePage key="own" /></ProtectedRoute>} />
      <Route path="/profile/:userId" element={<ProtectedRoute><ProfilePageWithKey /></ProtectedRoute>} />
      <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
      <Route path="/events" element={<ProtectedRoute><EventsPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="/tournaments" element={<ProtectedRoute><TournamentsPage /></ProtectedRoute>} />
      <Route path="/tournaments/:tournamentId" element={<ProtectedRoute><TournamentDetailPage /></ProtectedRoute>} />
      <Route path="/tournaments/:tournamentId/scoreboard" element={<TournamentScoreboardPage />} />
      <Route path="/tournaments/:tournamentId/scoreboard/basketball" element={<BasketballScoreboardRoute />} />
      <Route path="/tournaments/:tournamentId/scoreboard/football" element={<FootballScoreboardRoute />} />
      <Route path="/tournaments/:tournamentId/control" element={<MatchCommandCenterPage />} />
      <Route path="/teams" element={<ProtectedRoute><MyTeamsPage /></ProtectedRoute>} />
      <Route path="/matches/:matchId" element={<ProtectedRoute><MatchCenterPage /></ProtectedRoute>} />
      <Route path="/marketplace" element={<ProtectedRoute><MarketplacePage /></ProtectedRoute>} />
      <Route path="/marketplace/create-shop" element={<ProtectedRoute><CreateShopPage /></ProtectedRoute>} />
      <Route path="/marketplace/shop/:shopId" element={<ProtectedRoute><ShopDetailPage /></ProtectedRoute>} />
      <Route path="/scan" element={<ProtectedRoute><ScanPage /></ProtectedRoute>} />
      <Route path="/qr" element={<ProtectedRoute><QRPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PresenceProvider>
          <AppRoutes />
        </PresenceProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
