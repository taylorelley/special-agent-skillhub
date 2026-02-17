import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { getConvexClient } from '../convex/client'
import { UserBootstrap } from './UserBootstrap'

export function AppProviders({ children }: { children: React.ReactNode }) {
  const convex = getConvexClient()
  return (
    <ConvexAuthProvider
      client={convex}
      replaceURL={(relativeUrl) => {
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', relativeUrl)
        }
      }}
    >
      <UserBootstrap />
      {children}
    </ConvexAuthProvider>
  )
}
