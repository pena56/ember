/**
 * tag-colors.ts — TagColor → bg-tag-* safelist map (Unit 15c).
 *
 * Pure leaf module (no RN imports) so node-env tests can assert the map directly
 * and uniwind statically sees the literal class names. No hardcoded palette —
 * the classes resolve to the --color-tag-* tokens (invariant #6). Pattern mirrors
 * SWATCH_CLASS in annotation-editor.tsx.
 */

import type { TagColor } from '@ember/core';

export const TAG_BG: Record<TagColor, string> = {
  gray:   'bg-tag-gray',
  red:    'bg-tag-red',
  amber:  'bg-tag-amber',
  green:  'bg-tag-green',
  blue:   'bg-tag-blue',
  purple: 'bg-tag-purple',
};
