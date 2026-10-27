import { Badge } from '@/components/ui/badge'

const VARIANT = {
  active: 'default',
  trialing: 'secondary',
  past_due: 'outline',
  suspended: 'destructive',
  canceled: 'outline',
} as const

export function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>
  const variant = VARIANT[status as keyof typeof VARIANT] ?? 'outline'
  return <Badge variant={variant}>{status.replace('_', ' ')}</Badge>
}
