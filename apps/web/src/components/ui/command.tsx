/**
 * Command — lightweight combobox primitive built on Radix Popover + controlled
 * state. Not shadcn's cmdk wrapper (cmdk is a separate dep); this is a minimal
 * bespoke implementation using the project's existing token/utility set.
 *
 * Usage:
 *   <Command>
 *     <CommandInput value={q} onValueChange={setQ} placeholder="Search…" />
 *     <CommandList>
 *       <CommandEmpty>Nothing found.</CommandEmpty>
 *       <CommandItem onSelect={() => …}>Label</CommandItem>
 *     </CommandList>
 *   </Command>
 */

import * as React from "react"
import { SearchIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// ── Root ──────────────────────────────────────────────────────────────────────

function Command({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="command"
      className={cn("flex flex-col overflow-hidden", className)}
      {...props}
    />
  )
}

// ── Input ─────────────────────────────────────────────────────────────────────

interface CommandInputProps extends React.ComponentProps<"input"> {
  onValueChange?: (value: string) => void;
}

function CommandInput({
  className,
  value,
  onValueChange,
  onChange,
  ...props
}: CommandInputProps) {
  return (
    <div className="flex items-center gap-2 border-b border-line px-3 py-2" data-slot="command-input-wrapper">
      <SearchIcon className="size-3.5 shrink-0 text-text-muted opacity-60" />
      <input
        data-slot="command-input"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-controls="command-list"
        aria-expanded="true"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onValueChange?.(e.target.value);
          onChange?.(e);
        }}
        className={cn(
          "flex-1 bg-transparent font-sans text-sm text-text placeholder:text-text-muted outline-none",
          className,
        )}
        {...props}
      />
    </div>
  )
}

// ── List ──────────────────────────────────────────────────────────────────────

function CommandList({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="command-list"
      role="listbox"
      className={cn("max-h-56 overflow-y-auto overscroll-contain py-1", className)}
      {...props}
    />
  )
}

// ── Empty ─────────────────────────────────────────────────────────────────────

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="command-empty"
      className={cn("py-6 text-center font-sans text-sm text-text-muted", className)}
      {...props}
    />
  )
}

// ── Item ──────────────────────────────────────────────────────────────────────

interface CommandItemProps extends Omit<React.ComponentProps<"div">, "onSelect"> {
  onSelect?: () => void;
  selected?: boolean;
  disabled?: boolean;
}

function CommandItem({
  className,
  onSelect,
  selected,
  disabled,
  ...props
}: CommandItemProps) {
  return (
    <div
      data-slot="command-item"
      role="option"
      aria-selected={selected}
      aria-disabled={disabled}
      data-selected={selected}
      data-disabled={disabled}
      onClick={disabled ? undefined : onSelect}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.();
        }
      }}
      tabIndex={disabled ? -1 : 0}
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-3 py-1.5 font-sans text-sm text-text outline-none",
        "hover:bg-surface focus-visible:bg-surface",
        selected && "bg-surface",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      {...props}
    />
  )
}

// ── Separator ─────────────────────────────────────────────────────────────────

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="command-separator"
      className={cn("-mx-1 my-1 h-px bg-line", className)}
      {...props}
    />
  )
}

export {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
}
