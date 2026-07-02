/**
 * theme-control.tsx — theme picker (System / Light / Dark).
 *
 * A dropdown menu (shadcn's canonical mode-toggle pattern) rather than a
 * segmented control: it stays compact and fully responsive on narrow/mobile
 * viewports where a 3-segment inline control would crowd. The trigger shows the
 * current choice; the menu is a single-select radio group with a check on the
 * active option.
 *
 * Token-driven — no hardcoded colors (invariant #6).
 */

import { Check, ChevronDown, Monitor, Moon, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.js';

import type { ThemePreference } from './resolve-app-theme.js';
import { useTheme } from './use-theme.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const PREFERENCES: ThemePreference[] = ['system', 'warm-light', 'warm-dark'];
const LABELS: Record<ThemePreference, string> = {
  system: 'System',
  'warm-light': 'Light',
  'warm-dark': 'Dark',
};
const ICONS: Record<ThemePreference, LucideIcon> = {
  system: Monitor,
  'warm-light': Sun,
  'warm-dark': Moon,
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ThemeControl() {
  const { preference, setPreference } = useTheme();
  const CurrentIcon = ICONS[preference];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="Theme"
          className="justify-between gap-2 rounded-sm min-w-[8rem]"
        >
          <span className="flex items-center gap-2">
            <CurrentIcon className="size-4 text-text-muted" />
            <span className="font-sans">{LABELS[preference]}</span>
          </span>
          <ChevronDown className="size-4 text-text-muted" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[8rem] rounded-sm">
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(v) => { setPreference(v as ThemePreference); }}
        >
          {PREFERENCES.map((pref) => {
            const Icon = ICONS[pref];
            const active = preference === pref;
            return (
              <DropdownMenuRadioItem
                key={pref}
                value={pref}
                // Hide the default left indicator dot; we show a trailing check instead.
                className="gap-2 rounded-sm pl-2 [&>span:first-child]:hidden"
              >
                <Icon className="size-4 text-text-muted" />
                <span className="flex-1 font-sans">{LABELS[pref]}</span>
                {active && <Check className="size-4 text-accent" />}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
