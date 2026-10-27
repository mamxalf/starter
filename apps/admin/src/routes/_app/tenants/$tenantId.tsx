import type { AdminOutputs } from '@starter/contracts/admin'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { CopyableId } from '@/components/copyable-id'
import { columnHelper, DataTable } from '@/components/data-table'
import { RouteError } from '@/components/route-error'
import { StatusBadge } from '@/components/status-badge'
import { ChangePlanDialog, ExtendTrialDialog, SuspendDialog } from '@/components/tenant-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { orpc } from '@/lib/api'
import { formatDate, formatDateTime, formatMoney } from '@/lib/format'

const TABS = ['overview', 'members', 'invoices', 'audit'] as const

export const Route = createFileRoute('/_app/tenants/$tenantId')({
  validateSearch: z.object({ tab: z.enum(TABS).default('overview') }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      orpc.tenants.get.queryOptions({ input: { tenantId: params.tenantId } }),
    ),
  errorComponent: RouteError,
  component: TenantPage,
})

type Detail = AdminOutputs['tenants']['get']

const members = columnHelper<Detail['members'][number]>()
const memberColumns = members.columns([
  members.accessor('email', {
    header: 'Email',
    cell: (info) => (
      <Link
        to="/users/$userId"
        params={{ userId: info.row.original.userId }}
        className="hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  members.accessor('name', { header: 'Name', cell: (info) => info.getValue() ?? '—' }),
  members.accessor('role', {
    header: 'Role',
    cell: (info) => <Badge variant="outline">{info.getValue()}</Badge>,
  }),
  members.accessor('joinedAt', { header: 'Joined', cell: (info) => formatDate(info.getValue()) }),
])

const invoices = columnHelper<Detail['invoices'][number]>()
const invoiceColumns = invoices.columns([
  invoices.accessor('id', {
    header: 'Invoice',
    cell: (info) => <CopyableId value={info.getValue()} />,
  }),
  invoices.display({
    id: 'amount',
    header: 'Amount',
    cell: (info) => formatMoney(info.row.original.amount, info.row.original.currency),
  }),
  invoices.accessor('status', {
    header: 'Status',
    cell: (info) => <Badge variant="outline">{info.getValue()}</Badge>,
  }),
  invoices.accessor('dueAt', { header: 'Due', cell: (info) => formatDate(info.getValue()) }),
  invoices.accessor('paidAt', { header: 'Paid', cell: (info) => formatDate(info.getValue()) }),
])

const events = columnHelper<Detail['auditEvents'][number]>()
const eventColumns = events.columns([
  events.accessor('createdAt', { header: 'When', cell: (info) => formatDateTime(info.getValue()) }),
  events.accessor('action', { header: 'Action', cell: (info) => <code>{info.getValue()}</code> }),
  events.accessor('actorEmail', { header: 'Actor', cell: (info) => info.getValue() ?? '—' }),
  events.display({
    id: 'target',
    header: 'Target',
    cell: (info) => {
      const { targetType, targetId } = info.row.original
      return targetType ? `${targetType} ${targetId ?? ''}` : '—'
    },
  }),
  events.accessor('metadata', {
    header: 'Details',
    cell: (info) => (
      <code className="block max-w-xs truncate text-xs">{JSON.stringify(info.getValue())}</code>
    ),
  }),
])

type Dialog = 'extend' | 'plan' | 'suspend' | 'unsuspend' | null

function TenantPage() {
  const { tenantId } = Route.useParams()
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data } = useSuspenseQuery(orpc.tenants.get.queryOptions({ input: { tenantId } }))
  const [dialog, setDialog] = useState<Dialog>(null)

  const { tenant, subscription } = data
  const status = subscription?.status ?? null
  const canExtend = status === 'trialing' || status === 'past_due' || status === 'suspended'
  const target = { id: tenant.id, name: tenant.name }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{tenant.name}</h1>
        <StatusBadge status={status} />
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => navigate({ search: { tab: value as (typeof TABS)[number] } })}
      >
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="members">Members ({data.members.length})</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Tenant</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
                <dt className="text-muted-foreground">ID</dt>
                <dd>
                  <CopyableId value={tenant.id} />
                </dd>
                <dt className="text-muted-foreground">Slug</dt>
                <dd>
                  <code>{tenant.slug}</code>
                </dd>
                <dt className="text-muted-foreground">Locale</dt>
                <dd>{tenant.defaultLocale}</dd>
                <dt className="text-muted-foreground">Custom domain</dt>
                <dd>{tenant.customDomain ?? '—'}</dd>
                <dt className="text-muted-foreground">Created</dt>
                <dd>{formatDateTime(tenant.createdAt)}</dd>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subscription</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {subscription ? (
                <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd>
                    {subscription.planName} (<code>{subscription.planCode}</code>)
                  </dd>
                  <dt className="text-muted-foreground">Price</dt>
                  <dd>
                    {formatMoney(subscription.price, subscription.currency)} /{' '}
                    {subscription.interval}
                  </dd>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    <StatusBadge status={subscription.status} />
                  </dd>
                  <dt className="text-muted-foreground">Period ends</dt>
                  <dd>{formatDateTime(subscription.currentPeriodEnd)}</dd>
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">No subscription.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={!canExtend} onClick={() => setDialog('extend')}>
                  Extend trial
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!subscription}
                  onClick={() => setDialog('plan')}
                >
                  Change plan
                </Button>
                {status === 'suspended' ? (
                  <Button size="sm" variant="outline" onClick={() => setDialog('unsuspend')}>
                    Unsuspend
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={!subscription || status === 'canceled'}
                    onClick={() => setDialog('suspend')}
                  >
                    Suspend
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members">
          <DataTable columns={memberColumns} data={data.members} empty="No members." />
        </TabsContent>
        <TabsContent value="invoices">
          <DataTable columns={invoiceColumns} data={data.invoices} empty="No invoices yet." />
        </TabsContent>
        <TabsContent value="audit">
          <p className="mb-2 text-sm text-muted-foreground">
            What this tenant's members did (latest 50). Platform actions are in the Audit log.
          </p>
          <DataTable columns={eventColumns} data={data.auditEvents} empty="No events." />
        </TabsContent>
      </Tabs>

      {dialog === 'extend' && <ExtendTrialDialog tenant={target} onClose={() => setDialog(null)} />}
      {dialog === 'plan' && (
        <ChangePlanDialog
          tenant={target}
          currentPlanCode={subscription?.planCode ?? null}
          onClose={() => setDialog(null)}
        />
      )}
      {(dialog === 'suspend' || dialog === 'unsuspend') && (
        <SuspendDialog
          tenant={target}
          suspend={dialog === 'suspend'}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}
