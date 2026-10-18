import { cn } from "@/lib/utils"
import { User as UserIcon } from "lucide-react"

interface UserAvatarProps {
  user?: {
    full_name?: string | null
    email?: string | null
  } | null
  className?: string
  fallbackClassName?: string
}

export function UserAvatar({ user, className }: UserAvatarProps) {
  const name = user?.full_name || user?.email || ""
  const initials = name
    ? name.split(" ").map((n) => n[0]).join("").toUpperCase().substring(0, 2)
    : ""

  return (
    <div className={cn(
      "w-8 h-8 bg-muted rounded-full flex items-center justify-center border border-border shrink-0 overflow-hidden",
      className
    )}>
      {initials ? (
        // initials stay small so they fit the smallest (20px) avatars
        <span className="text-[0.65rem] font-semibold uppercase leading-none text-muted-foreground">{initials}</span>
      ) : (
        <UserIcon className="w-4 h-4 text-muted-foreground" />
      )}
    </div>
  )
}
