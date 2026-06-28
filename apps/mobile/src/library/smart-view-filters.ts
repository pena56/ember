/**
 * smart-view-filters.ts — pure predicates for the smart-view bar (Unit 15c).
 *
 * Leaf module (no RN imports) so node-env tests can import the real helper
 * instead of re-implementing it.
 */

import type { SmartView, SmartViewQuery } from '@ember/core';

/**
 * Detect an ad-hoc tag filter — a query with tagIds that has no corresponding
 * saved SmartView. This triggers the "Save view" affordance.
 */
export function isAdHocTagFilter(query: SmartViewQuery, savedViews: SmartView[]): boolean {
  if (!query.tagIds || query.tagIds.length === 0) return false;
  return !savedViews.some(
    (v) =>
      Array.isArray(v.query.tagIds) &&
      v.query.tagIds.length === query.tagIds!.length &&
      v.query.tagIds.every((id) => query.tagIds!.includes(id)),
  );
}
