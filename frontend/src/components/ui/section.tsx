import type { HTMLAttributes, ReactNode } from "react"
import { cn } from "@/lib/utils"

/** The one sanctioned uppercase label: small, quiet, used for group headings. */
export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("text-[11px] font-medium uppercase leading-4 tracking-[0.05em] text-fg-faint", className)} {...props} />
}

interface SectionProps {
  icon?: ReactNode
  title: string
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}

/** A titled, bordered block inside a dialog or editor pane. */
export function Section({ icon, title, description, actions, children, className }: SectionProps) {
  return (
    <section className={cn("space-y-4 rounded-lg border bg-background p-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          {icon && <div className="mt-0.5 text-muted-foreground">{icon}</div>}
          <div>
            <h4 className="text-sm font-semibold leading-tight">{title}</h4>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

/** Card-level panel used on pages: header row (title, description, actions) above its body. */
export function Panel({
  title,
  description,
  icon,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-xl border bg-card text-card-foreground", className)}>
      <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
        <div className="flex min-w-0 items-start gap-2">
          {icon && <span className="mt-0.5 text-fg-faint [&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold leading-tight">{title}</h3>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className={cn("min-h-0 flex-1 px-5 pb-5", bodyClassName)}>{children}</div>
    </section>
  )
}
