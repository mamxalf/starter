import type { AdminOutputs } from '@starter/contracts/admin'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { ActionDialog, ReasonField } from '@/components/action-dialog'
import { CopyableId } from '@/components/copyable-id'
import { columnHelper, DataTable } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { orpc } from '@/lib/api'
import { rpcErrorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'

const PAGE_SIZE = 20

export const Route = createFileRoute('/_app/jobs')({
  validateSearch: z.object({ page: z.number().int().min(1).default(1) }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      orpc.jobs.listFailed.queryOptions({ input: { ...deps, pageSize: PAGE_SIZE } }),
    ),
  component: JobsPage,
})

type Job = AdminOutputs['jobs']['listFailed']['items'][number]

function JobsPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data } = useSuspenseQuery(
    orpc.jobs.listFailed.queryOptions({ input: { ...search, pageSize: PAGE_SIZE } }),
  )
  const [retrying, setRetrying] = useState<Job | null>(null)

  // Stable reference: TanStack Table re-derives its models whenever `columns` changes identity.
  const columns = useMemo(() => {
    const column = columnHelper<Job>()
    return column.columns([
      column.accessor('queue', { header: 'Queue', cell: (info) => <code>{info.getValue()}</code> }),
      column.accessor('payloadSummary', {
        header: 'Payload',
        cell: (info) => <code className="block max-w-xs truncate text-xs">{info.getValue()}</code>,
      }),
      column.accessor('error', {
        header: 'Error',
        cell: (info) => <span className="block max-w-xs truncate">{info.getValue() ?? '—'}</span>,
      }),
      column.accessor('failedAt', {
        header: 'Failed',
        cell: (info) => formatDateTime(info.getValue()),
      }),
      column.accessor('retryCount', { header: 'Retries' }),
      column.accessor('id', {
        header: 'Job ID',
        cell: (info) => <CopyableId value={info.getValue()} />,
      }),
      column.display({
        id: 'actions',
        cell: (info) => (
          <Button size="sm" variant="outline" onClick={() => setRetrying(info.row.original)}>
            Retry
          </Button>
        ),
      }),
    ])
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Failed jobs</h1>
      <p className="text-sm text-muted-foreground">
        Jobs that ran out of retries, newest first. Payloads are summarised; links and credentials
        are hidden.
      </p>
      <DataTable
        columns={columns}
        data={data.items}
        empty="No failed jobs."
        pagination={{
          page: search.page,
          pageSize: PAGE_SIZE,
          total: data.total,
          onPageChange: (page) => navigate({ search: { page } }),
        }}
      />
      {retrying && <RetryDialog job={retrying} onClose={() => setRetrying(null)} />}
    </div>
  )
}

function RetryDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  const queryClient = useQueryClient()
  const retry = useMutation(
    orpc.jobs.retry.mutationOptions({
      onSuccess: async () => {
        toast.success('Job put back in its queue')
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: orpc.jobs.key() }),
          queryClient.invalidateQueries({ queryKey: orpc.audit.key() }),
        ])
        onClose()
      },
      onError: (error) => toast.error(rpcErrorMessage(error)),
    }),
  )
  const form = useForm({
    defaultValues: { reason: '' },
    validators: {
      onSubmit: z.object({
        reason: z.string().trim().min(5, 'Give a reason of at least 5 characters'),
      }),
    },
    onSubmit: ({ value }) =>
      retry.mutate({ queue: job.queue, jobId: job.id, reason: value.reason }),
  })

  return (
    <ActionDialog
      title="Retry job"
      target={`${job.queue} · ${job.id}`}
      description="The job goes back in its queue and the worker runs it again."
      submitLabel="Retry job"
      pending={retry.isPending}
      onSubmit={() => void form.handleSubmit()}
      onClose={onClose}
    >
      <form.Field name="reason">
        {(field) => (
          <ReasonField
            value={field.state.value}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
            errors={field.state.meta.errors}
          />
        )}
      </form.Field>
    </ActionDialog>
  )
}
