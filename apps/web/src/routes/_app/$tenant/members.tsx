import type { Role } from '@starter/contracts'
import { formatDate, m } from '@starter/i18n'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  Input,
  inputStyles,
} from '@starter/ui'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { orpc } from '../../../lib/api'
import { firstError, rpcErrorMessage } from '../../../lib/forms'

export const Route = createFileRoute('/_app/$tenant/members')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(orpc.members.list.queryOptions()),
      context.queryClient.ensureQueryData(orpc.tenants.listInvitations.queryOptions()),
    ]),
  component: MembersPage,
})

const roleLabel: Record<Role, () => string> = {
  owner: () => m.role_owner(),
  admin: () => m.role_admin(),
  member: () => m.role_member(),
}

/** UX only (hides buttons). The API enforces the same rule in core/policy.ts. */
const canManage = (actor: Role, target: Role) =>
  target !== 'owner' && (actor === 'owner' || (actor === 'admin' && target === 'member'))

function MembersPage() {
  const { data: members } = useSuspenseQuery(orpc.members.list.queryOptions())
  const { data: invitations } = useSuspenseQuery(orpc.tenants.listInvitations.queryOptions())
  const { data: current } = useSuspenseQuery(orpc.tenants.current.queryOptions())
  const { data: me } = useSuspenseQuery(orpc.me.get.queryOptions())
  const isAdmin = current.role === 'owner' || current.role === 'admin'

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{m.members_title()}</h1>

      <Card>
        <CardBody className="flex flex-col divide-y divide-border p-0">
          {members.map((member) => (
            <MemberRow
              key={member.userId}
              member={member}
              actor={current.role}
              isSelf={member.userId === me.user.id}
            />
          ))}
        </CardBody>
      </Card>

      {isAdmin && <InviteForm actor={current.role} />}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>{m.invitations_pending()}</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col divide-y divide-border p-0">
            {invitations.length === 0 && (
              <p className="p-5 text-sm text-muted-foreground">{m.invitations_none()}</p>
            )}
            {invitations.map((invitation) => (
              <InvitationRow key={invitation.id} invitation={invitation} actor={current.role} />
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  )
}

type MemberItem = {
  userId: string
  email: string
  name: string | null
  role: Role
}

function MemberRow({
  member,
  actor,
  isSelf,
}: {
  member: MemberItem
  actor: Role
  isSelf: boolean
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.members.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.tenants.key() }),
    ])
  const changeRole = useMutation(orpc.members.changeRole.mutationOptions({ onSuccess: refresh }))
  const remove = useMutation(orpc.members.remove.mutationOptions({ onSuccess: refresh }))
  const transfer = useMutation(
    orpc.members.transferOwnership.mutationOptions({ onSuccess: refresh }),
  )
  const leave = useMutation(
    orpc.members.leave.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.me.key() })
        await navigate({ to: '/' })
      },
    }),
  )

  const display = member.name ?? member.email
  const manageable = !isSelf && canManage(actor, member.role)
  const busy = changeRole.isPending || remove.isPending || transfer.isPending || leave.isPending
  const error = changeRole.error ?? remove.error ?? transfer.error ?? leave.error

  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">
            {display}
            {isSelf && (
              <span className="ml-2 text-xs text-muted-foreground">({m.members_you()})</span>
            )}
          </p>
          {member.name && <p className="text-xs text-muted-foreground">{member.email}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {manageable && actor === 'owner' ? (
            <select
              aria-label={m.members_role()}
              className={inputStyles({ className: 'h-8 w-auto px-2' })}
              value={member.role}
              disabled={busy}
              onChange={(e) =>
                changeRole.mutate({
                  userId: member.userId,
                  role: e.target.value as 'admin' | 'member',
                })
              }
            >
              <option value="admin">{roleLabel.admin()}</option>
              <option value="member">{roleLabel.member()}</option>
            </select>
          ) : (
            <span className="text-sm text-muted-foreground">{roleLabel[member.role]()}</span>
          )}

          {actor === 'owner' && !isSelf && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (window.confirm(m.members_transfer_confirm({ name: display }))) {
                  transfer.mutate({ userId: member.userId })
                }
              }}
            >
              {m.members_transfer()}
            </Button>
          )}
          {manageable && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (window.confirm(m.members_remove_confirm({ name: display }))) {
                  remove.mutate({ userId: member.userId })
                }
              }}
            >
              {m.members_remove()}
            </Button>
          )}
          {isSelf && actor !== 'owner' && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (window.confirm(m.members_leave_confirm())) leave.mutate({})
              }}
            >
              {m.members_leave()}
            </Button>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-danger">{rpcErrorMessage(error)}</p>}
    </div>
  )
}

const NewInvite = z.object({ email: z.email(), role: z.enum(['admin', 'member']) })

function InviteForm({ actor }: { actor: Role }) {
  const queryClient = useQueryClient()
  const invite = useMutation(
    orpc.tenants.invite.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.tenants.key() }),
    }),
  )
  const form = useForm({
    defaultValues: { email: '', role: 'member' as 'admin' | 'member' },
    validators: { onSubmit: NewInvite },
    onSubmit: async ({ value }) => {
      await invite.mutateAsync(value)
      form.reset()
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.members_invite_title()}</CardTitle>
      </CardHeader>
      <CardBody>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <div className="min-w-56 flex-1">
            <form.Field name="email">
              {(field) => (
                <Field label={m.members_email()} error={firstError(field.state.meta.errors)}>
                  {(control) => (
                    <Input
                      {...control}
                      type="email"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  )}
                </Field>
              )}
            </form.Field>
          </div>
          {actor === 'owner' && (
            <form.Field name="role">
              {(field) => (
                <Field label={m.members_role()}>
                  {(control) => (
                    <select
                      {...control}
                      className={inputStyles({ className: 'w-auto' })}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value as 'admin' | 'member')}
                    >
                      <option value="member">{roleLabel.member()}</option>
                      <option value="admin">{roleLabel.admin()}</option>
                    </select>
                  )}
                </Field>
              )}
            </form.Field>
          )}
          <Button type="submit" disabled={invite.isPending}>
            {m.members_invite_send()}
          </Button>
          {invite.error && (
            <p className="w-full text-sm text-danger">{rpcErrorMessage(invite.error)}</p>
          )}
        </form>
      </CardBody>
    </Card>
  )
}

function InvitationRow({
  invitation,
  actor,
}: {
  invitation: { id: string; email: string; role: 'admin' | 'member'; expiresAt: Date }
  actor: Role
}) {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.tenants.key() })
  const resend = useMutation(orpc.tenants.resendInvitation.mutationOptions({ onSuccess: refresh }))
  const revoke = useMutation(orpc.tenants.revokeInvitation.mutationOptions({ onSuccess: refresh }))
  const busy = resend.isPending || revoke.isPending
  const error = resend.error ?? revoke.error

  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{invitation.email}</p>
          <p className="text-xs text-muted-foreground">
            {roleLabel[invitation.role]()} ·{' '}
            {m.invitations_expires({ date: formatDate(invitation.expiresAt) })}
          </p>
        </div>
        {(actor === 'owner' || invitation.role === 'member') && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => resend.mutate({ id: invitation.id })}
            >
              {m.invitations_resend()}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => revoke.mutate({ id: invitation.id })}
            >
              {m.invitations_revoke()}
            </Button>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-danger">{rpcErrorMessage(error)}</p>}
    </div>
  )
}
