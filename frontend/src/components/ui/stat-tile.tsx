import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"

interface StatTileProps {
  label: string
  value: ReactNode
  sub?: ReactNode
  /** 0-100; draws a thin progress bar under the value */
  progress?: number
  tone?: "default" | "warning" | "danger" | "success"
  to?: string
  className?: string
}

const toneClass = {
  default: "text-foreground",
  warning: "text-warning",
  danger: "text-danger",
  success: "text-success",
}

/** One KPI. Put several in a StatStrip so they share a single card. */
export function StatTile({ label, value, sub, progress, tone = "default", to, className }: StatTileProps) {
  const body = (
    <>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className={cn("text-2xl font-semibold leading-tight tabular-nums tracking-tight", toneClass[tone])}>{value}</span>
      {progress !== undefined && (
        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-hairline">
          <span className="block h-full rounded-full bg-success transition-[width]" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </span>
      )}
      {sub && <span className="text-xs text-fg-faint">{sub}</span>}
    </>
  )
  const cls = cn("flex min-w-0 flex-col gap-1 px-5 py-4", className)
  return to ? (
    <Link to={to} className={cn(cls, "transition-colors hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none")}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

export function StatStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 overflow-hidden rounded-xl border bg-card lg:grid-cols-4",
        "[&>*]:border-hairline max-lg:[&>*:nth-child(odd)]:border-r max-lg:[&>*:nth-child(-n+2)]:border-b lg:[&>*+*]:border-l",
        className
      )}
    >
      {children}
    </div>
  )
}
