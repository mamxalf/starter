import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { orpc } from '@/lib/api'

export const Route = createFileRoute('/_app/')({
  component: Home,
})

function Home() {
  const { data: me } = useSuspenseQuery(orpc.me.queryOptions())
  return <p className="p-6">Signed in as {me.email}</p>
}
