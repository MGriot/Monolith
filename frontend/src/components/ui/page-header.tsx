import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  /** extra row under the title, e.g. a filter bar */
  children?: ReactNode
  className?: string
}

export function PageHeader({ title, description, actions, children, className }: PageHeaderProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

/**
 * The page's single scroll container plus the standard gutter. The layout's <main> doesn't scroll,
 * so a page wraps its content in exactly one PageBody and adds no other overflow wrappers.
 */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="h-full overflow-y-auto bg-subtle/50">
      <div className={cn("mx-auto space-y-6 px-4 py-5 md:px-6 lg:px-8 lg:py-6", className)}>{children}</div>
    </div>
  )
}
