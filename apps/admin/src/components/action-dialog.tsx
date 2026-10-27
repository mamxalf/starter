import type { FormEvent, ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'

/**
 * Every mutation goes through this: a confirmation naming the target, a required reason, and a
 * form the caller owns (TanStack Form). Mount it only while open, so its state resets each time.
 */
export function ActionDialog(props: {
  title: string
  /** What is being changed, shown verbatim: tenant name, user email, job id. */
  target: string
  description: ReactNode
  submitLabel: string
  destructive?: boolean
  pending: boolean
  onSubmit: () => void
  onClose: () => void
  children: ReactNode
}) {
  return (
    <AlertDialog open onOpenChange={(open) => !open && !props.pending && props.onClose()}>
      <AlertDialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event: FormEvent) => {
            event.preventDefault()
            event.stopPropagation()
            props.onSubmit()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{props.title}</AlertDialogTitle>
            <AlertDialogDescription>{props.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Target: </span>
            <span className="font-medium">{props.target}</span>
          </div>
          <FieldGroup>{props.children}</FieldGroup>
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={props.pending}>
              Cancel
            </AlertDialogCancel>
            <Button
              type="submit"
              variant={props.destructive ? 'destructive' : 'default'}
              disabled={props.pending}
            >
              {props.pending ? 'Working…' : props.submitLabel}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const asIssues = (errors: readonly unknown[]) =>
  errors.map((error) =>
    typeof error === 'string' ? { message: error } : (error as { message?: string }),
  )

/** The mandatory reason (min 5 characters), recorded in the platform audit log. */
export function ReasonField(props: {
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  errors: readonly unknown[]
}) {
  const invalid = props.errors.length > 0
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor="reason">Reason</FieldLabel>
      <Textarea
        id="reason"
        value={props.value}
        placeholder="Why is this change being made? (min. 5 characters)"
        aria-invalid={invalid}
        onBlur={props.onBlur}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {invalid && <FieldError errors={asIssues(props.errors)} />}
    </Field>
  )
}
