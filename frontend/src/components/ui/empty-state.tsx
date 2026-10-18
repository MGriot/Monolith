import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  text?: ReactNode
  action?: ReactNode
  /** sm keeps dashboard panels short (about 120px); md is for empty pages and tabs */
  size?: "sm" | "md"
  className?: string
}

export function EmptyState({ icon, title, text, action, size = "md", className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-center text-muted-foreground",
        size === "sm" ? "px-4 py-6" : "px-6 py-10",
        className
      )}
    >
      {icon && <div className="mb-1 text-fg-ghost [&_svg]:h-6 [&_svg]:w-6">{icon}</div>}
      <p className="text-sm font-medium text-fg-soft">{title}</p>
      {text && <p className="max-w-sm text-xs text-fg-faint">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
