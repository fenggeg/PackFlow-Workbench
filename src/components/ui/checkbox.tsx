import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import {Check, Minus} from 'lucide-react'
import type {ComponentPropsWithoutRef} from 'react'
import {cn} from '@/lib/utils'

function Checkbox({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer size-4 shrink-0 rounded-[3px] border border-[var(--border-strong)] bg-[var(--card)] shadow-none transition-colors duration-150 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-[var(--primary)] data-[state=checked]:bg-[var(--primary)] data-[state=checked]:text-[var(--primary-foreground)] data-[state=indeterminate]:border-[var(--primary)] data-[state=indeterminate]:bg-[var(--primary)] data-[state=indeterminate]:text-[var(--primary-foreground)]',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="group flex items-center justify-center text-current">
        <Check className="size-3 group-data-[state=indeterminate]:hidden" strokeWidth={3} />
        <Minus className="hidden size-3 group-data-[state=indeterminate]:block" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export {Checkbox}
