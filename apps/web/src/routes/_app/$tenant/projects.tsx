import { formatDate, m } from '@starter/i18n'
import { Button, Card, CardBody, Field, Input } from '@starter/ui'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { orpc } from '../../../lib/api'
import { firstError, rpcErrorMessage } from '../../../lib/forms'

const PAGE_SIZE = 20

/**
 * Example list page. Filters live in the URL as typed search params:
 * shareable, survive refresh, and a typo in a param name is a compile error.
 */
export const Route = createFileRoute('/_app/$tenant/projects')({
  validateSearch: z.object({
    page: z.number().int().min(1).default(1),
    q: z.string().optional(),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      orpc.projects.list.queryOptions({ input: { ...deps, pageSize: PAGE_SIZE } }),
    ),
  component: ProjectsPage,
})

function ProjectsPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data } = useSuspenseQuery(
    orpc.projects.list.queryOptions({ input: { ...search, pageSize: PAGE_SIZE } }),
  )
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{m.projects_title()}</h1>
        <Input
          className="max-w-xs"
          placeholder={m.action_search()}
          defaultValue={search.q}
          onChange={(e) =>
            navigate({ search: { page: 1, q: e.target.value || undefined }, replace: true })
          }
        />
      </div>

      <NewProjectForm />

      <Card>
        <CardBody className="flex flex-col divide-y divide-border p-0">
          {data.items.length === 0 && (
            <p className="p-5 text-sm text-muted-foreground">{m.projects_empty()}</p>
          )}
          {data.items.map((project) => (
            <ProjectRow key={project.id} project={project} />
          ))}
        </CardBody>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{m.projects_count({ count: data.total })}</span>
        <div className="flex gap-2">
          <Link from={Route.fullPath} search={(s) => ({ ...s, page: Math.max(1, s.page - 1) })}>
            ←
          </Link>
          <span>
            {search.page} / {pages}
          </span>
          <Link from={Route.fullPath} search={(s) => ({ ...s, page: Math.min(pages, s.page + 1) })}>
            →
          </Link>
        </div>
      </div>
    </div>
  )
}

const NewProject = z.object({ name: z.string().trim().min(1).max(120) })

function NewProjectForm() {
  const queryClient = useQueryClient()
  const create = useMutation(
    orpc.projects.create.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.projects.key() }),
    }),
  )
  const form = useForm({
    defaultValues: { name: '' },
    validators: { onSubmit: NewProject },
    onSubmit: async ({ value }) => {
      await create.mutateAsync({ name: value.name, description: null })
      form.reset()
    },
  })

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <div className="flex-1">
        <form.Field name="name">
          {(field) => (
            <Field label={m.projects_new()} error={firstError(field.state.meta.errors)}>
              {(control) => (
                <Input
                  {...control}
                  placeholder={m.projects_name()}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              )}
            </Field>
          )}
        </form.Field>
      </div>
      <Button type="submit" disabled={create.isPending}>
        {m.action_create()}
      </Button>
      {create.error && <p className="text-sm text-danger">{rpcErrorMessage(create.error)}</p>}
    </form>
  )
}

function ProjectRow({ project }: { project: { id: string; name: string; createdAt: Date } }) {
  const queryClient = useQueryClient()
  const remove = useMutation(
    orpc.projects.remove.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.projects.key() }),
    }),
  )
  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <div>
        <p className="font-medium">{project.name}</p>
        <p className="text-xs text-muted-foreground">{formatDate(project.createdAt)}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        disabled={remove.isPending}
        onClick={() => remove.mutate({ id: project.id })}
      >
        {m.action_delete()}
      </Button>
    </div>
  )
}
