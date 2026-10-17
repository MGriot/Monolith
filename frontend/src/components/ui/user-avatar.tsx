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
      "w-8 h-8 bg-muted rounded-full flex items-center justify-center border border-border shrink-0 shadow-sm overflow-hidden",
      className
    )}>
      {initials ? (
        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter">{initials}</span>
      ) : (
        <UserIcon className="w-4 h-4 text-muted-foreground" />
      )}
    </div>
  )
}
