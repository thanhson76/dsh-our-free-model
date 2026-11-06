import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Compose the base components the way shadcn maintains its source, importing only the primitives needed at this stage.
export const cn = (...values: ClassValue[]) => twMerge(clsx(values))

type ButtonVariant = 'default' | 'outline' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

export function Button({ className, variant = 'default', size, busy = false, asChild = false, children, disabled, ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; busy?: boolean; asChild?: boolean }) {
  const Component = asChild ? Slot : 'button'
  return <Component type="button" className={cn('ui-button', `ui-button-${variant}`, size && `ui-button-${size}`, busy && 'is-busy', className)}
    disabled={disabled || busy} data-busy={busy || undefined} {...props}>
    {busy && <Spinner className="ui-button-spinner" aria-hidden="true" />}{children}
  </Component>
}

export function Card({ className, interactive = false, ...props }:
  React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return <div className={cn('ui-card', interactive && 'ui-card-interactive', className)} {...props} />
}

export function Badge({ className, tone = 'neutral', dot = false, children, ...props }:
  React.HTMLAttributes<HTMLSpanElement> & { tone?: 'neutral' | 'success' | 'warning' | 'blue'; dot?: boolean }) {
  return <span className={cn('ui-badge', `ui-badge-${tone}`, className)} {...props}>
    {dot && <span className="ui-badge-dot" aria-hidden="true" />}{children}
  </span>
}

export function Input({ className, invalid = false, ...props }:
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input aria-invalid={invalid || undefined} className={cn('ui-input', invalid && 'is-invalid', className)} {...props} />
}

/** 16px spinning indicator, used with a button’s busy state or on its own; only the transform animates. */
export function Spinner({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('ui-spinner', className)} role="status" aria-label="Loading" {...props} />
}

/** Pure-CSS tooltip: put the text in tip, visible on hover/focus. No positioning dependency is introduced. */
export function Tooltip({ className, tip, children, ...props }:
  React.HTMLAttributes<HTMLSpanElement> & { tip: string }) {
  return <span className={cn('ui-tooltip', className)} data-tip={tip} {...props}>{children}</span>
}

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <kbd className={cn('ui-kbd', className)} {...props} />
}

/** Controlled small switch: the class contract matches the existing .ui-switch exactly (on means enabled). */
export function Switch({ className, checked = false, onCheckedChange, disabled, ...props }:
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & { checked?: boolean; onCheckedChange?: (next: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={checked} disabled={disabled}
    className={cn('ui-switch', checked && 'on', className)}
    onClick={event => { props.onClick?.(event); if (!event.defaultPrevented) onCheckedChange?.(!checked) }} {...props}>
    <span aria-hidden="true" />
  </button>
}
