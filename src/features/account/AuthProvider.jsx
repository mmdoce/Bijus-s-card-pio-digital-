import { createContext, useContext, useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { ActionLink, Button, EmptyState, LoadingState } from '../../components/ui'
import { supabase } from '../../lib/supabase'

const AuthContext = createContext(null)

function callbackError() {
  const url = new URL(window.location.href)
  const hash = new URLSearchParams(url.hash.slice(1))
  return url.searchParams.get('error_code') ?? hash.get('error_code')
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState({ session: null, loading: Boolean(supabase), recovery: false })
  const [identity, setIdentity] = useState(null)
  const [revision, setRevision] = useState(0)
  const [linkError] = useState(callbackError)

  useEffect(() => {
    if (!supabase) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setAuth(previous => ({
        session,
        loading: false,
        recovery: Boolean(session) && (event === 'PASSWORD_RECOVERY'
          || (previous.recovery && previous.session?.user.id === session.user.id && event !== 'SIGNED_OUT')),
      }))
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!auth.session) return
    let active = true
    const session = auth.session
    supabase.auth.getUser(session.access_token).then(({ data, error }) => {
      if (active) setIdentity({ session, revision, user: data.user?.id === session.user.id ? data.user : null, error: Boolean(error) })
    }, () => {
      if (active) setIdentity({ session, revision, user: null, error: true })
    })
    return () => { active = false }
  }, [auth.session, revision])

  function finishRecovery() {
    setAuth(previous => ({ ...previous, recovery: false }))
  }

  const valid = identity?.session === auth.session && identity?.revision === revision ? identity : null
  return <AuthContext.Provider value={{
    ...auth, loading: auth.loading || Boolean(auth.session && !valid), linkError, user: valid?.user ?? null,
    sessionError: valid?.error ?? false, retryIdentity: () => setRevision(value => value + 1), finishRecovery,
  }}>
    {children}
  </AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}

export function CustomerAccess() {
  const { user, loading, recovery, sessionError, retryIdentity } = useAuth()
  const { pathname } = useLocation()
  if (loading) return <LoadingState>Verificando sua sessão…</LoadingState>
  if (sessionError) return <EmptyState title="Não foi possível verificar sua sessão">
    <div className="actions"><Button secondary onClick={retryIdentity}>Tentar novamente</Button><ActionLink to="/login">Entrar novamente</ActionLink></div>
  </EmptyState>
  if (recovery) return <Navigate to="/redefinir-senha" replace />
  return user ? <Outlet /> : <Navigate to="/login" state={{ returnTo: pathname }} replace />
}
