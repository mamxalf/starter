import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { z } from 'zod'
import { ActionDialog, ReasonField } from '@/components/action-dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { orpc } from '@/lib/api'
import { rpcErrorMessage } from '@/lib/errors'
import { formatDate, formatMoney } from '@/lib/format'

type Tenant = { id: string; name: string }

const reason = z.string().trim().min(5, 'Give a reason of at least 5 characters')

/** After a change, everything the tenant pages and the audit log show may be stale. */
function useRefresh() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.tenants.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.audit.key() }),
    ])
}

export function ExtendTrialDialog({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const refresh = useRefresh()
  const extend = useMutation(
    orpc.tenants.extendTrial.mutationOptions({
      onSuccess: async (result) => {
        toast.success(`Trial extended until ${formatDate(result.currentPeriodEnd)}`)
        await refresh()
        onClose()
      },
      onError: (error) => toast.error(rpcErrorMessage(error)),
    }),
  )
  const form = useForm({
    defaultValues: { days: 7, reason: '' },
    validators: { onSubmit: z.object({ days: z.number().int().min(1).max(60), reason }) },
    onSubmit: ({ value }) => extend.mutate({ tenantId: tenant.id, ...value }),
  })

  return (
    <ActionDialog
      title="Extend trial"
      target={tenant.name}
      description="Moves the period end later and sets the subscription to trialing. Open invoices move with it."
      submitLabel="Extend trial"
      pending={extend.isPending}
      onSubmit={() => void form.handleSubmit()}
      onClose={onClose}
    >
      <form.Field name="days">
        {(field) => (
          <Field data-invalid={field.state.meta.errors.length > 0}>
            <FieldLabel htmlFor="days">Days (1 to 60)</FieldLabel>
            <Input
              id="days"
              type="number"
              min={1}
              max={60}
              value={field.state.value}
              aria-invalid={field.state.meta.errors.length > 0}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(Number(event.target.value))}
            />
            {field.state.meta.errors.length > 0 && (
              <FieldError>Enter a whole number from 1 to 60</FieldError>
            )}
          </Field>
        )}
      </form.Field>
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

export function ChangePlanDialog({
  tenant,
  currentPlanCode,
  onClose,
}: {
  tenant: Tenant
  currentPlanCode: string | null
  onClose: () => void
}) {
  const refresh = useRefresh()
  const plans = useQuery(orpc.plans.list.queryOptions())
  const change = useMutation(
    orpc.tenants.changePlan.mutationOptions({
      onSuccess: async (result) => {
        toast.success(`Plan changed to ${result.planCode}`)
        await refresh()
        onClose()
      },
      onError: (error) => toast.error(rpcErrorMessage(error)),
    }),
  )
  const form = useForm({
    defaultValues: { planCode: '', reason: '' },
    validators: {
      onSubmit: z.object({ planCode: z.string().min(1, 'Choose a plan'), reason }),
    },
    onSubmit: ({ value }) => change.mutate({ tenantId: tenant.id, ...value }),
  })

  return (
    <ActionDialog
      title="Change plan"
      target={tenant.name}
      description="No proration: entitlements change immediately, the new price applies from the next invoice."
      submitLabel="Change plan"
      pending={change.isPending}
      onSubmit={() => void form.handleSubmit()}
      onClose={onClose}
    >
      <form.Field name="planCode">
        {(field) => (
          <Field data-invalid={field.state.meta.errors.length > 0}>
            <FieldLabel htmlFor="plan">New plan</FieldLabel>
            <Select value={field.state.value} onValueChange={field.handleChange}>
              <SelectTrigger
                id="plan"
                className="w-full"
                aria-invalid={field.state.meta.errors.length > 0}
              >
                <SelectValue placeholder="Choose a plan" />
              </SelectTrigger>
              <SelectContent>
                {(plans.data ?? [])
                  .filter((plan) => plan.code !== currentPlanCode)
                  .map((plan) => (
                    <SelectItem key={plan.code} value={plan.code}>
                      {plan.name} · {formatMoney(plan.price, plan.currency)} / {plan.interval}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {field.state.meta.errors.length > 0 && <FieldError>Choose a plan</FieldError>}
          </Field>
        )}
      </form.Field>
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

export function SuspendDialog({
  tenant,
  suspend,
  onClose,
}: {
  tenant: Tenant
  /** true = suspend the tenant, false = restore it. */
  suspend: boolean
  onClose: () => void
}) {
  const refresh = useRefresh()
  const mutation = useMutation(
    orpc.tenants.setSuspended.mutationOptions({
      onSuccess: async (result) => {
        toast.success(`Subscription is now ${result.status}`)
        await refresh()
        onClose()
      },
      onError: (error) => toast.error(rpcErrorMessage(error)),
    }),
  )
  const form = useForm({
    defaultValues: { reason: '' },
    validators: { onSubmit: z.object({ reason }) },
    onSubmit: ({ value }) =>
      mutation.mutate({ tenantId: tenant.id, suspended: suspend, reason: value.reason }),
  })

  return (
    <ActionDialog
      title={suspend ? 'Suspend tenant' : 'Unsuspend tenant'}
      target={tenant.name}
      description={
        suspend
          ? 'The workspace becomes read-only: members can still read their data but cannot change it.'
          : 'Restores the subscription to active. Overdue invoices stay open: the next billing cycle may suspend it again, so extend the trial instead if that is not wanted.'
      }
      submitLabel={suspend ? 'Suspend' : 'Unsuspend'}
      destructive={suspend}
      pending={mutation.isPending}
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
