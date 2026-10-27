import type { AdminOutputs } from '@starter/contracts/admin'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { columnHelper, DataTable } from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { orpc } from '@/lib/api'
import { formatDate } from '@/lib/format'

const PAGE_SIZE = 20
const STATUSES = ['trialing', 'active', 'past_due', 'suspended', 'canceled'] as const

/** Search, status and page live in the URL: shareable, survive refresh, typos are compile errors. */
export const Route = createFileRoute('/_app/tenants/')({
  validateSearch: z.object({
    page: z.number().int().min(1).default(1),
    q: z.string().optional(),
    status: z.enum(STATUSES).optional(),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      orpc.tenants.list.queryOptions({ input: { ...deps, pageSize: PAGE_SIZE } }),
    ),
  component: TenantsPage,
})

type Row = AdminOutputs['tenants']['list']['items'][number]
const column = columnHelper<Row>()
const columns = column.columns([
  column.accessor('name', {
    header: 'Tenant',
    cell: (info) => (
      <Link
        to="/tenants/$tenantId"
        params={{ tenantId: info.row.original.id }}
        className="font-medium hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  column.accessor('slug', { header: 'Slug', cell: (info) => <code>{info.getValue()}</code> }),
  column.accessor('planName', { header: 'Plan', cell: (info) => info.getValue() ?? '—' }),
  column.accessor('status', {
    header: 'Status',
    cell: (info) => <StatusBadge status={info.getValue()} />,
  }),
  column.accessor('currentPeriodEnd', {
    header: 'Period ends',
    cell: (info) => formatDate(info.getValue()),
  }),
  column.accessor('memberCount', { header: 'Members' }),
  column.accessor('createdAt', { header: 'Created', cell: (info) => formatDate(info.getValue()) }),
])

function TenantsPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data } = useSuspenseQuery(
    orpc.tenants.list.queryOptions({ input: { ...search, pageSize: PAGE_SIZE } }),
  )

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Tenants</h1>
      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          placeholder="Search name or slug…"
          defaultValue={search.q}
          onChange={(event) =>
            navigate({
              search: (s) => ({ ...s, page: 1, q: event.target.value || undefined }),
              replace: true,
            })
          }
        />
        <Select
          value={search.status ?? 'all'}
          onValueChange={(value) =>
            navigate({
              search: (s) => ({
                ...s,
                page: 1,
                status: value === 'all' ? undefined : (value as (typeof STATUSES)[number]),
              }),
            })
          }
        >
          <SelectTrigger className="w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {status.replace('_', ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DataTable
        columns={columns}
        data={data.items}
        empty="No tenants match."
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
