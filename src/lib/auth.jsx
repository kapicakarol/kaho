import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation } from 'react-router'
import { api } from './api'
import { Splash } from '../components/ui'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = ładowanie

  useEffect(() => {
    let alive = true
    api.auth.getUser().then((u) => alive && setUser(u ?? null))
    const off = api.auth.onChange((u) => setUser(u ?? null))
    return () => { alive = false; off() }
  }, [])

  const value = useMemo(() => ({
    user: user ?? null,
    loading: user === undefined,
    signIn: api.auth.signIn,
    signUp: api.auth.signUp,
    signOut: api.auth.signOut,
  }), [user])

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)

// Tylko dla twórców / hostów. Uczniowie nigdy tu nie trafiają.
export function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <Splash />
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />
  return children
}
