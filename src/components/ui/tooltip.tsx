import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type {ComponentPropsWithoutRef} from 'react'
import {cn} from '@/lib/utils'

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'z-50 max-w-64 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--foreground)] px-2.5 py-1.5 text-[12px] text-[var(--background)] shadow-none animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
}

export {Tooltip, TooltipTrigger, TooltipContent, TooltipProvider}
