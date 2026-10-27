import { m } from '@starter/i18n'
import { Button, Card, CardBody } from '@starter/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { orpc } from '../../lib/api'
import { rpcErrorMessage } from '../../lib/forms'

/** Link from the invitation email. Sign-in is enforced by the _app layout first. */
export const Route = createFileRoute('/_app/invite/$token')({ component: AcceptInvite })

function AcceptInvite() {
  const { token } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const accept = useMutation(
    orpc.tenants.acceptInvitation.mutationOptions({
      onSuccess: async (tenant) => {
        await queryClient.invalidateQueries({ queryKey: orpc.me.key() })
        await navigate({ to: '/$tenant/projects', params: { tenant: tenant.slug } })
      },
    }),
  )
  return (
    <Card className="mx-auto mt-10 max-w-md">
      <CardBody className="flex flex-col gap-3">
        <Button onClick={() => accept.mutate({ token })} disabled={accept.isPending}>
          {m.invite_accept()}
        </Button>
        {accept.error && <p className="text-sm text-danger">{rpcErrorMessage(accept.error)}</p>}
      </CardBody>
    </Card>
  )
}
