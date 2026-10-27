import type { ErrorComponentProps } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'
import { rpcErrorMessage } from '@/lib/errors'

/** For detail routes: "Tenant not found" and friends, without implying anything about access. */
export function RouteError({ error }: ErrorComponentProps) {
  return (
    <div className="flex flex-col items-start gap-2 py-8">
      <p className="text-lg font-medium">{rpcErrorMessage(error)}</p>
      <Link to="/tenants" className="text-sm underline">
        Back to tenants
      </Link>
    </div>
  )
}
