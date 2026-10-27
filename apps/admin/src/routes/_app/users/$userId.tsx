import type { AdminOutputs } from '@starter/contracts/admin'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { CopyableId } from '@/components/copyable-id'
import { columnHelper, DataTable } from '@/components/data-table'
import { RouteError } from '@/components/route-error'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { orpc } from '@/lib/api'
import { formatDate, formatDateTime } from '@/lib/format'

export const Route = createFileRoute('/_app/users/$userId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      orpc.users.get.queryOptions({ input: { userId: params.userId } }),
    ),
  errorComponent: RouteError,
  component: UserPage,
})

type Membership = AdminOutputs['users']['get']['memberships'][number]
const column = columnHelper<Membership>()
const columns = column.columns([
  column.accessor('tenantName', {
    header: 'Tenant',
    cell: (info) => (
      <Link
        to="/tenants/$tenantId"
        params={{ tenantId: info.row.original.tenantId }}
        className="font-medium hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  column.accessor('tenantSlug', { header: 'Slug', cell: (info) => <code>{info.getValue()}</code> }),
  column.accessor('role', {
    header: 'Role',
    cell: (info) => <Badge variant="outline">{info.getValue()}</Badge>,
  }),
  column.accessor('joinedAt', { header: 'Joined', cell: (info) => formatDate(info.getValue()) }),
])

function UserPage() {
  const { userId } = Route.useParams()
  const { data } = useSuspenseQuery(orpc.users.get.queryOptions({ input: { userId } }))
  const { user } = data

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{user.name ?? user.email}</h1>
      <Card>
        <CardHeader>
          <CardTitle>User</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">ID</dt>
            <dd>
              <CopyableId value={user.id} />
            </dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd>{user.email}</dd>
            <dt className="text-muted-foreground">Locale</dt>
            <dd>{user.locale ?? '—'}</dd>
            <dt className="text-muted-foreground">Created</dt>
            <dd>{formatDateTime(user.createdAt)}</dd>
          </dl>
        </CardContent>
      </Card>
      <h2 className="text-lg font-medium">Memberships</h2>
      <DataTable columns={columns} data={data.memberships} empty="Not a member of any tenant." />
    </div>
  )
}
