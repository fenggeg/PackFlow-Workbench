import * as TabsPrimitive from '@radix-ui/react-tabs'
import type {ComponentPropsWithoutRef} from 'react'
import {cn} from '@/lib/utils'

const Tabs = TabsPrimitive.Root

function TabsList({className, ...props}: ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'inline-flex h-8 items-center gap-1 rounded-[var(--radius)] bg-transparent p-0',
        className,
      )}
      {...props}
    />
  )
}

function TabsTrigger({className, ...props}: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-[var(--radius)] px-3 text-[13px] font-medium text-[var(--muted-foreground)] transition-colors duration-150 hover:text-[var(--foreground)] data-[state=active]:bg-[var(--card)] data-[state=active]:text-[var(--foreground)] data-[state=active]:shadow-none [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({className, ...props}: ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('mt-2 focus-visible:outline-none', className)}
      {...props}
    />
  )
}

export {Tabs, TabsList, TabsTrigger, TabsContent}
