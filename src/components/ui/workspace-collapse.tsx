import {useState, type ReactNode} from 'react'
import {ChevronDown} from 'lucide-react'
import {AnimatePresence} from 'motion/react'
import {cn} from '@/lib/utils'
import {motion} from '@/lib/motion'

export function WorkspaceCollapse({
  items,
  defaultOpenKeys,
}: {
  items: {key: string; label: string; children: ReactNode}[]
  defaultOpenKeys?: string[]
}) {
  const [openKeys, setOpenKeys] = useState<Set<string>>(
    () => new Set(defaultOpenKeys ?? []),
  )

  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]">
      {items.map((item, index) => {
        const open = openKeys.has(item.key)
        return (
          <div key={item.key} className={cn(index > 0 && 'border-t border-[var(--border)]')}>
            <button
              type="button"
              className="flex h-11 w-full items-center justify-between px-4 text-[13px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--accent)]"
              onClick={() => {
                setOpenKeys((prev) => {
                  const next = new Set(prev)
                  if (next.has(item.key)) next.delete(item.key)
                  else next.add(item.key)
                  return next
                })
              }}
              aria-expanded={open}
            >
              {item.label}
              <ChevronDown
                className={cn(
                  'size-4 text-[var(--muted-foreground)] transition-transform duration-150',
                  open && 'rotate-180',
                )}
              />
            </button>
            <AnimatePresence initial={false}>
              {open ? (
                <motion.div
                  key="content"
                  initial={{height: 0, opacity: 0}}
                  animate={{height: 'auto', opacity: 1}}
                  exit={{height: 0, opacity: 0}}
                  transition={{duration: 0.15, ease: [0.2, 0, 0, 1]}}
                  className="overflow-hidden"
                >
                  <div className="border-t border-[var(--border)] px-4 py-3">{item.children}</div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}
