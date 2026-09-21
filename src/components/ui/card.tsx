import type {HTMLAttributes} from 'react'
import {cn} from '@/lib/utils'

function Card({className, ...props}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]',
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({className, ...props}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-col gap-1 px-4 py-3', className)}
      {...props}
    />
  )
}

function CardTitle({className, ...props}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h4
      data-slot="card-title"
      className={cn('text-[13px] font-semibold leading-5 text-[var(--foreground)]', className)}
      {...props}
    />
  )
}

function CardDescription({className, ...props}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="card-description"
      className={cn('text-[12px] text-[var(--muted-foreground)]', className)}
      {...props}
    />
  )
}

function CardContent({className, ...props}: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-content" className={cn('px-4 pb-4', className)} {...props} />
}

function CardFooter({className, ...props}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-slot="card-footer" className={cn('flex items-center px-4 pb-4', className)} {...props} />
  )
}

export {Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter}
