import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/$tenant/')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$tenant/projects', params })
  },
})
