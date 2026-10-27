import { SignInView } from '@starter/auth/react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/sign-in')({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: ({ context, search }) => {
    if (context.auth.isSignedIn) throw redirect({ href: search.redirect ?? '/' })
  },
  component: SignInPage,
})

function SignInPage() {
  const search = Route.useSearch()
  const router = useRouter()
  const target = search.redirect ?? '/'
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Platform admin</CardTitle>
        </CardHeader>
        <CardContent>
          <SignInView redirectTo={target} onSignedIn={() => router.history.push(target)} />
        </CardContent>
      </Card>
    </div>
  )
}
