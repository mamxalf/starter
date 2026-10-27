import type { AdminOutputs } from '@starter/contracts/admin'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { columnHelper, DataTable } from '@/components/data-table'
import { Input } from '@/components/ui/input'
import { orpc } from '@/lib/api'
import { formatDate } from '@/lib/format'

const PAGE_SIZE = 20

export const Route = createFileRoute('/_app/users/')({
  validateSearch: z.object({
    page: z.number().int().min(1).default(1),
    q: z.string().optional(),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      orpc.users.search.queryOptions({ input: { ...deps, pageSize: PAGE_SIZE } }),
    ),
  component: UsersPage,
})

type Row = AdminOutputs['users']['search']['items'][number]
const column = columnHelper<Row>()
const columns = column.columns([
  column.accessor('email', {
    header: 'Email',
    cell: (info) => (
      <Link
        to="/users/$userId"
        params={{ userId: info.row.original.id }}
        className="font-medium hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  column.accessor('name', { header: 'Name', cell: (info) => info.getValue() ?? '—' }),
  column.accessor('createdAt', { header: 'Created', cell: (info) => formatDate(info.getValue()) }),
])

function UsersPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data } = useSuspenseQuery(
    orpc.users.search.queryOptions({ input: { ...search, pageSize: PAGE_SIZE } }),
  )

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Users</h1>
      <Input
        className="max-w-xs"
        placeholder="Email starts with…"
        defaultValue={search.q}
        onChange={(event) =>
          navigate({
            search: (s) => ({ ...s, page: 1, q: event.target.value || undefined }),
            replace: true,
          })
        }
      />
      <DataTable
        columns={columns}
        data={data.items}
        empty="No users match."
        pagination={{
          page: search.page,
          pageSize: PAGE_SIZE,
          total: data.total,
          onPageChange: (page) => navigate({ search: (s) => ({ ...s, page }) }),
        }}
      />
    </div>
  )
}
