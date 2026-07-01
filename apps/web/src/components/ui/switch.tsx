/**
 * switch.tsx — shadcn-idiom Switch primitive for Ember web.
 *
 * A thin wrapper over the `radix-ui` umbrella package's `Switch` primitive
 * (already a dependency — NO new dep added). Token-only classes (invariant #6):
 *   - Track: `bg-accent` (checked) / `bg-text-muted` (unchecked)
 *   - Thumb: `bg-surface-raised`
 *   - Focus ring: `focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2`
 *
 * Radix gives `role="switch"` + full keyboard semantics (Space to toggle) for free.
 * Forwards ref + all standard Radix Root props (checked, onCheckedChange, disabled, …).
 */

import * as React from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

function Switch({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  ref?: React.Ref<React.ElementRef<typeof SwitchPrimitive.Root>>;
}) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      data-slot="switch"
      className={cn(
        // Track geometry + shape
        'peer relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent',
        // Track color — token-only (invariant #6)
        'bg-text-muted data-[state=checked]:bg-accent',
        // Transition
        'transition-colors duration-200 ease-in-out',
        // Disabled
        'disabled:cursor-not-allowed disabled:opacity-50',
        // Focus ring — accent, matches the rest of components/ui
        'outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          // Thumb size + shape + token color (invariant #6)
          'pointer-events-none block h-5 w-5 rounded-full bg-surface-raised shadow-sm',
          // Animate position with the track state
          'transition-transform duration-200 ease-in-out',
          'translate-x-0 data-[state=checked]:translate-x-5',
        )}
      />
    </SwitchPrimitive.Root>
  );
}

Switch.displayName = SwitchPrimitive.Root.displayName;

export { Switch };
