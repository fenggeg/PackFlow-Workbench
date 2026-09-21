import {Slot} from '@radix-ui/react-slot'
import type {VariantProps} from 'class-variance-authority'
import type {ButtonHTMLAttributes} from 'react'
import {cn} from '@/lib/utils'
import {buttonVariants} from '@/components/ui/button-variants'

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {asChild?: boolean}) {
  const Comp = asChild ? Slot : 'button'
  return <Comp data-slot="button" className={cn(buttonVariants({variant, size, className}))} {...props} />
}

// eslint-disable-next-line react-refresh/only-export-components -- shadcn convention: variants co-located with component
export {Button, buttonVariants}
