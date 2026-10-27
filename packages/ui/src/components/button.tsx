import type { ComponentProps } from 'react'
import { tv, type VariantProps } from 'tailwind-variants'

// Raised buttons take the theme's border + shadow (and "press" shadow); ghost stays flat in every theme.
const raised = [
  'border-ui shadow-ui',
  'active:translate-x-px active:translate-y-px active:shadow-ui-press',
]

export const buttonStyles = tv({
  base: [
    'inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap',
    'rounded-ui transition-[transform,box-shadow] duration-100',
    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring',
    'disabled:pointer-events-none disabled:opacity-50',
  ],
  variants: {
    variant: {
      primary: [...raised, 'bg-primary text-primary-foreground'],
      secondary: [...raised, 'bg-surface text-surface-foreground backdrop-blur-ui'],
      danger: [...raised, 'bg-danger text-danger-foreground'],
      ghost: 'bg-transparent text-foreground hover:bg-muted',
    },
    size: {
      sm: 'h-8 px-3 text-sm',
      md: 'h-10 px-4 text-sm',
      lg: 'h-12 px-6 text-base',
    },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
})

export type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonStyles>

export function Button({ variant, size, className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonStyles({ variant, size, className })} {...props} />
}
