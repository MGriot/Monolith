import { Avatar, AvatarFallback, AvatarImage } from "./avatar"
import { cn } from "@/lib/utils"

interface UserAvatarProps {
  user?: {
    full_name?: string | null
    email?: string | null
  } | null
  className?: string
  fallbackClassName?: string
}

export function UserAvatar({ user, className, fallbackClassName }: UserAvatarProps) {
  const name = user?.full_name || user?.email || "Unknown"
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2)

  // Consistent background color based on name
  const getBackgroundColor = (str: string) => {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash)
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase()
    return "#" + "00000".substring(0, 6 - c.length) + c
  }

  const bgColor = user ? getBackgroundColor(name) : "#cbd5e1"

  return (
    <Avatar className={cn("h-8 w-8 border border-slate-200", className)}>
      <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${name}&backgroundColor=${bgColor.replace('#', '')}`} />
      <AvatarFallback className={cn("text-[10px] font-bold text-white", fallbackClassName)} style={{ backgroundColor: bgColor }}>
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}
