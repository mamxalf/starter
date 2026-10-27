import type { AdminOutputs } from '@starter/contracts/admin'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { columnHelper, DataTable } from '@/components/data-table'
import { orpc } from '@/lib/api'
import { formatDateTime } from '@/lib/format'

const PAGE_SIZE = 25

export const Route = createFileRoute('/_app/audit')({
  validateSearch: z.object({ page: z.number().int().min(1).default(1) }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      orpc.audit.list.queryOptions({ input: { ...deps, pageSize: PAGE_SIZE } }),
    ),
  component: AuditPage,
})

type Event = AdminOutputs['audit']['list']['items'][number]
const column = columnHelper<Event>()
const columns = column.columns([
  column.accessor('createdAt', { header: 'When', cell: (info) => formatDateTime(info.getValue()) }),
  column.accessor('actorEmail', { header: 'Admin', cell: (info) => info.getValue() ?? '—' }),
  column.accessor('action', { header: 'Action', cell: (info) => <code>{info.getValue()}</code> }),
  column.display({
    id: 'target',
    header: 'Target',
    cell: (info) => {
      const { tenantId, targetType, targetId } = info.row.original
      if (tenantId) {
        return (
          <Link to="/tenants/$tenantId" params={{ tenantId }} className="hover:underline">
            tenant {tenantId.slice(0, 8)}…
          </Link>
        )
      }
      return targetType ? `${targetType} ${targetId ?? ''}` : '—'
    },
  }),
  column.accessor('reason', {
    header: 'Reason',
    cell: (info) => <span className="block max-w-sm">{info.getValue()}</span>,
  }),
  column.accessor('metadata', {
    header: 'Details',
    cell: (info) => (
      <code className="block max-w-xs truncate text-xs">{JSON.stringify(info.getValue())}</code>
    ),
  }),
])

function AuditPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data } = useSuspenseQuery(
    orpc.audit.list.queryOptions({ input: { ...search, pageSize: PAGE_SIZE } }),
  )

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <p className="text-sm text-muted-foreground">
        Every change made from this back-office, newest first.
      </p>
      <DataTable
        columns={columns}
        data={data.items}
        empty="Nothing recorded yet."
        pagination={{
          page: search.page,
          pageSize: PAGE_SIZE,
          total: data.total,
          onPageChange: (page) => navigate({ search: { page } }),
        }}
      />
    </div>
  )
}
