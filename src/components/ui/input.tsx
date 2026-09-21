import type {InputHTMLAttributes} from 'react'
import {cn} from '@/lib/utils'

function Input({className, type, ...props}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(
        'flex h-8 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--card)] px-3 py-1 text-[13px] text-[var(--foreground)] shadow-none transition-colors duration-150 placeholder:text-[var(--placeholder)] focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[rgba(23,23,23,0.08)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export {Input}
