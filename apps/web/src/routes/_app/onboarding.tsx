import { Slug } from '@starter/contracts'
import { getLocale, m } from '@starter/i18n'
import { Button, Card, CardBody, CardHeader, CardTitle, Field, Input } from '@starter/ui'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { orpc } from '../../lib/api'
import { firstError, rpcErrorMessage } from '../../lib/forms'

export const Route = createFileRoute('/_app/onboarding')({ component: Onboarding })

const OnboardingForm = z.object({ name: z.string().min(2).max(80), slug: Slug })

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)

function Onboarding() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const create = useMutation(orpc.tenants.create.mutationOptions())

  const form = useForm({
    defaultValues: { name: '', slug: '' },
    validators: { onSubmit: OnboardingForm },
    onSubmit: async ({ value }) => {
      const tenant = await create.mutateAsync({
        ...value,
        defaultLocale: getLocale(),
      })
      await queryClient.invalidateQueries({ queryKey: orpc.me.key() })
      await navigate({ to: '/$tenant/projects', params: { tenant: tenant.slug } })
    },
  })

  return (
    <Card className="mx-auto mt-10 max-w-md">
      <CardHeader>
        <CardTitle>{m.onboarding_title()}</CardTitle>
      </CardHeader>
      <CardBody>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.Field name="name">
            {(field) => (
              <Field label={m.onboarding_name()} error={firstError(field.state.meta.errors)}>
                {(control) => (
                  <Input
                    {...control}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => {
                      field.handleChange(e.target.value)
                      form.setFieldValue('slug', slugify(e.target.value))
                    }}
                  />
                )}
              </Field>
            )}
          </form.Field>
          <form.Field name="slug">
            {(field) => (
              <Field
                label={m.onboarding_slug()}
                hint={`app/${field.state.value || '…'}`}
                error={firstError(field.state.meta.errors)}
              >
                {(control) => (
                  <Input
                    {...control}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                )}
              </Field>
            )}
          </form.Field>
          {create.error && <p className="text-sm text-danger">{rpcErrorMessage(create.error)}</p>}
          <Button type="submit" disabled={create.isPending}>
            {m.action_create()}
          </Button>
        </form>
      </CardBody>
    </Card>
  )
}
