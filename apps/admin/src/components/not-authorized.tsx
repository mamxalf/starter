import { useClientAuth } from '@starter/auth/react'
import { Button } from '@/components/ui/button'

/** Shown when the API answers NOT_FOUND to /me. Deliberately says nothing about why. */
export function NotAuthorized() {
  const auth = useClientAuth()
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-2xl font-semibold">Not authorized</h1>
        <Button variant="outline" onClick={() => void auth.signOut()}>
          Sign out
        </Button>
      </div>
    </div>
  )
}
