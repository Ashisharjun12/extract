import { Navigate, useLocation } from 'react-router-dom'
import { useAdminAuth } from '@/store/admin-auth.store'
import { useTesterAuth } from '@/store/tester-auth.store'

function LoadingScreen() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <span className="size-8 animate-spin rounded-full border-4 border-muted border-t-foreground" />
    </div>
  )
}

export function AdminRoute({ children }) {
  const { isAuthenticated, loading } = useAdminAuth()
  const location = useLocation()
  if (loading) return <LoadingScreen />
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />
  return children
}

export function TesterRoute({ children }) {
  const { isAuthenticated, loading } = useTesterAuth()
  const location = useLocation()
  if (loading) return <LoadingScreen />
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />
  return children
}
