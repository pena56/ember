import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "border-line bg-surface text-text placeholder:text-text-muted focus-visible:border-accent focus-visible:ring-accent/20 aria-invalid:border-destructive aria-invalid:ring-destructive/20 flex h-9 w-full rounded-md border px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-[3px] sm:text-sm",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
