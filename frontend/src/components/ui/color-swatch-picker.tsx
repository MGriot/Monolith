import { useId, useState, type ReactNode } from "react"
import { Check, Plus } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { COLOR_PRESETS } from "@/constants/colors"
import { cn } from "@/lib/utils"

interface ColorSwatchPickerProps {
  value?: string | null
  onChange: (color: string) => void
  className?: string
  size?: "sm" | "md"
}

/** Inline row of preset swatches plus a custom colour button. */
export function ColorSwatchPicker({ value, onChange, className, size = "md" }: ColorSwatchPickerProps) {
  const inputId = useId()
  const isCustom = !!value && !COLOR_PRESETS.some((p) => p.value.toLowerCase() === value.toLowerCase())
  const dim = size === "sm" ? "h-5 w-5" : "h-6 w-6"
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {COLOR_PRESETS.map((p) => {
        const selected = value?.toLowerCase() === p.value
        return (
          <button
            key={p.value}
            type="button"
            className={cn(
              dim,
              "flex items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              selected && "ring-2 ring-foreground ring-offset-2 ring-offset-background"
            )}
            style={{ backgroundColor: p.value }}
            onClick={() => onChange(p.value)}
            title={p.name}
            aria-label={`Colour ${p.name}`}
            aria-pressed={selected}
          >
            {selected && <Check className="h-3 w-3 text-white" />}
          </button>
        )
      })}
      <label
        htmlFor={inputId}
        className={cn(
          dim,
          "flex cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-fg-ghost transition-colors hover:border-muted-foreground",
          isCustom && "border-solid border-transparent ring-2 ring-foreground ring-offset-2 ring-offset-background"
        )}
        style={isCustom ? { backgroundColor: value! } : undefined}
        title="Custom colour"
      >
        {!isCustom && <Plus className="h-3 w-3 text-fg-faint" />}
        <span className="sr-only">Custom colour</span>
      </label>
      <input
        id={inputId}
        type="color"
        className="sr-only"
        value={value || "#64748b"}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

/** A colour dot that opens the swatch picker in a popover; used in dense rows. */
export function ColorDotPicker({
  value,
  onChange,
  label = "Change colour",
  className,
  children,
}: {
  value: string
  onChange: (color: string) => void
  label?: string
  className?: string
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className={cn(
            "h-4 w-4 shrink-0 rounded-full ring-offset-background transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            className
          )}
          style={{ backgroundColor: value }}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <ColorSwatchPicker
          value={value}
          onChange={(c) => {
            onChange(c)
            setOpen(false)
          }}
          size="sm"
          className="max-w-[188px]"
        />
      </PopoverContent>
    </Popover>
  )
}
