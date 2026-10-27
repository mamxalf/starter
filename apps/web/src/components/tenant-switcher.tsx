import { m } from '@starter/i18n'
import { inputStyles } from '@starter/ui'
import { useNavigate, useParams } from '@tanstack/react-router'

/** Jumps between the workspaces the user belongs to, keeping them on the projects page. */
export function TenantSwitcher({
  tenants,
}: {
  tenants: { tenantId: string; slug: string; name: string }[]
}) {
  const { tenant } = useParams({ strict: false })
  const navigate = useNavigate()
  if (tenants.length === 0) return null
  return (
    <select
      aria-label={m.tenant_switch_label()}
      className={inputStyles({ className: 'h-8 w-auto max-w-56 px-2' })}
      value={tenant ?? ''}
      onChange={(e) => navigate({ to: '/$tenant/projects', params: { tenant: e.target.value } })}
    >
      {!tenant && <option value="" disabled />}
      {tenants.map((t) => (
        <option key={t.tenantId} value={t.slug}>
          {t.name}
        </option>
      ))}
    </select>
  )
}
