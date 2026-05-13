import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import PermissionAudit from './pages/PermissionAudit'
import SudoMonitor from './pages/SudoMonitor'
import FileIntegrity from './pages/FileIntegrity'
import ActivityLogs from './pages/ActivityLogs'
import SystemHealth from './pages/SystemHealth'
import Network from './pages/Network'
import Alerts from './pages/Alerts'
import Settings from './pages/Settings'
import Support from './pages/Support'

function PrivateRoute({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}

function PublicRoute({ children }) {
  const { user } = useAuth()
  return user ? <Navigate to="/dashboard" replace /> : children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard"        element={<Dashboard />} />
            <Route path="permission-audit" element={<PermissionAudit />} />
            <Route path="sudo-monitor"     element={<SudoMonitor />} />
            <Route path="file-integrity"   element={<FileIntegrity />} />
            <Route path="activity-logs"    element={<ActivityLogs />} />
            <Route path="system-health"    element={<SystemHealth />} />
            <Route path="network"          element={<Network />} />
            <Route path="alerts"           element={<Alerts />} />
            <Route path="settings"         element={<Settings />} />
            <Route path="support"          element={<Support />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
