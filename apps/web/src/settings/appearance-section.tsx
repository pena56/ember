/**
 * appearance-section.tsx — Appearance (theme) settings section.
 *
 * Hosts the System / Light / Dark ThemeControl, relocated here from the shell
 * chrome. Uses the shared SettingsSection shell.
 *
 * Token-only styling (invariant #6 — no hardcoded colors).
 */

import { ThemeControl } from '../theme/theme-control.js';

import { SettingsSection } from './settings-section.js';

export function AppearanceSection() {
  return (
    <SettingsSection title="Appearance" description="Choose how Ember looks while you read.">
      <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <p className="font-sans text-sm text-text">Theme</p>
          <p className="font-sans text-sm text-text-muted">
            Follow your system, or keep it always light or dark.
          </p>
        </div>
        <ThemeControl />
      </div>
    </SettingsSection>
  );
}
