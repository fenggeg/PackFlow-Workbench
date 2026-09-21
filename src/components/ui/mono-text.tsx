import type {HTMLAttributes} from 'react'
import {cn} from '@/lib/utils'

type MonoTextProps = HTMLAttributes<HTMLElement> & {
  as?: 'span' | 'code' | 'div'
}

export function MonoText({className, children, as = 'span', ...props}: MonoTextProps) {
  const Comp = as
  return (
    <Comp
      className={cn(
        'font-[family-name:var(--font-mono)] text-[12px] tracking-[-0.01em] text-[var(--foreground)]',
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  )
}
