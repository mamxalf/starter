import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Building2Icon, UserIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { orpc } from '@/lib/api'
import { useDebounced } from '@/lib/use-debounced'

/** Cmd/Ctrl+K: jump to a tenant (name or slug) or a user (email prefix). Search runs on the server. */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const [term, setTerm] = useState('')
  const q = useDebounced(term.trim(), 200)
  const enabled = open && q.length >= 2

  const tenants = useQuery({
    ...orpc.tenants.list.queryOptions({ input: { q, pageSize: 5 } }),
    enabled,
  })
  const users = useQuery({
    ...orpc.users.search.queryOptions({ input: { q, pageSize: 5 } }),
    enabled,
  })

  useEffect(() => {
    if (!open) setTerm('')
  }, [open])

  const go = (action: () => Promise<void>) => {
    onOpenChange(false)
    void action()
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search"
      description="Find a tenant or user"
    >
      {/* The server already filtered; cmdk's own filtering would hide valid matches. */}
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search tenants and users…"
          value={term}
          onValueChange={setTerm}
        />
        <CommandList>
          <CommandEmpty>{enabled ? 'No results.' : 'Type at least 2 characters.'}</CommandEmpty>
          {(tenants.data?.items.length ?? 0) > 0 && (
            <CommandGroup heading="Tenants">
              {tenants.data?.items.map((tenant) => (
                <CommandItem
                  key={tenant.id}
                  value={`tenant-${tenant.id}`}
                  onSelect={() =>
                    go(() =>
                      navigate({ to: '/tenants/$tenantId', params: { tenantId: tenant.id } }),
                    )
                  }
                >
                  <Building2Icon />
                  <span>{tenant.name}</span>
                  <span className="text-muted-foreground">{tenant.slug}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {(users.data?.items.length ?? 0) > 0 && (
            <CommandGroup heading="Users">
              {users.data?.items.map((user) => (
                <CommandItem
                  key={user.id}
                  value={`user-${user.id}`}
                  onSelect={() =>
                    go(() => navigate({ to: '/users/$userId', params: { userId: user.id } }))
                  }
                >
                  <UserIcon />
                  <span>{user.email}</span>
                  {user.name && <span className="text-muted-foreground">{user.name}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
