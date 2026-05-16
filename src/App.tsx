import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { PresenceProvider } from './contexts/PresenceContext'
import AppLayout from './components/layout/AppLayout'
import OnboardingModal from './components/OnboardingModal'
import LandingPage from './pages/landing/LandingPage'
import SignIn from './pages/auth/SignIn'
import SignUp from './pages/auth/SignUp'
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

function RootRoute() {
  const { session, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (session) return <Navigate to="/home" replace />
  return <LandingPage />
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
