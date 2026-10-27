import { type ComponentProps, type ReactNode, useId } from 'react'
import { tv } from 'tailwind-variants'

export const inputStyles = tv({
  base: [
    'h-10 w-full rounded-ui border-ui bg-surface px-3 text-sm text-surface-foreground',
    'placeholder:text-muted-foreground backdrop-blur-ui',
    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring',
    'aria-invalid:border-danger',
  ],
})

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={inputStyles({ className })} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={inputStyles({ className: ['h-auto min-h-24 py-2', className] })}
      {...props}
    />
  )
}

/**
 * Library-agnostic form field: label + control + hint/error.
 * Forms (TanStack Form today) pass `error`; swapping the form library touches call sites
 * only through this component's props.
 */
export function Field(props: {
  label: string
  error?: string
  hint?: string
  children: (control: {
    id: string
    'aria-invalid': boolean
    'aria-describedby'?: string
  }) => ReactNode
}) {
  const id = useId()
  const messageId = `${id}-message`
  const message = props.error ?? props.hint
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {props.label}
      </label>
      {props.children({
        id,
        'aria-invalid': Boolean(props.error),
        'aria-describedby': message ? messageId : undefined,
      })}
      {message && (
        <p
          id={messageId}
          className={props.error ? 'text-sm text-danger' : 'text-sm text-muted-foreground'}
        >
          {message}
        </p>
      )}
    </div>
  )
}
