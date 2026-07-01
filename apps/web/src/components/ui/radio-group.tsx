/**
 * radio-group.tsx — shadcn-idiom RadioGroup primitive for Ember web.
 *
 * A thin wrapper over the `radix-ui` umbrella package's `RadioGroup` primitive
 * (already a dependency via @radix-ui/react-radio-group — NO new dep added).
 * Token-only classes (invariant #6):
 *   - Item ring: `border border-line` (unchecked) / `border-accent` (checked)
 *   - Indicator dot: `bg-accent` filled circle
 *   - Focus ring: `focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2`
 *
 * Radix gives `role="radiogroup"` on the root, `role="radio"` + roving tabindex +
 * arrow-key navigation + `aria-checked` on each item for free — no hand-rolled a11y.
 * Forwards ref + all standard Radix Root/Item props.
 */

import * as React from 'react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

function RadioGroup({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root> & {
  ref?: React.Ref<React.ElementRef<typeof RadioGroupPrimitive.Root>>;
}) {
  return (
    <RadioGroupPrimitive.Root
      ref={ref}
      data-slot="radio-group"
      className={cn('flex flex-col', className)}
      {...props}
    />
  );
}

RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

function RadioGroupItem({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item> & {
  ref?: React.Ref<React.ElementRef<typeof RadioGroupPrimitive.Item>>;
}) {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      data-slot="radio-group-item"
      className={cn(
        // Size + shape
        'h-5 w-5 shrink-0 rounded-full',
        // Border ring — token-only (invariant #6); accent border when checked
        'border-2 border-line data-[state=checked]:border-accent',
        // Focus ring — accent, matches rest of components/ui
        'outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        // Disabled
        'disabled:cursor-not-allowed disabled:opacity-50',
        // Flex for centering the indicator dot
        'flex items-center justify-center',
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        className="flex items-center justify-center"
      >
        {/* Ember dot: accent-filled circle inside the checked ring — mirrors mobile DeviceRadioDot */}
        <div className="h-2.5 w-2.5 rounded-full bg-accent" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

export { RadioGroup, RadioGroupItem };
