/**
 * select-continue-reading.ts — pure selector: join positions↔documents, drop
 * orphans, sort by recency, map to ContinueReadingItem[].
 *
 * No DOM / React — unit-tested without rendering.
 */

import type { Document, ReadingPosition } from '@ember/core';

export interface ContinueReadingItem {
  docId: string;
  title: string;
  page: number;
  updatedAt: string;
}

/**
 * Join each position to its document by `position.id === document.id`.
 * Orphaned positions (no matching document) are silently dropped — a deleted
 * or missing document must not crash the Today screen (invariant #1).
 *
 * Sorted most-recently-read first by `updatedAt` (HLC string sorts in agreement
 * with recency per the 06a encode invariant). Stable for equal stamps.
 */
export function selectContinueReading(
  positions: ReadingPosition[],
  documents: Document[],
): ContinueReadingItem[] {
  const docMap = new Map<string, Document>(documents.map((d) => [d.id, d]));

  const items: ContinueReadingItem[] = [];

  for (const position of positions) {
    const doc = docMap.get(position.id);
    if (!doc) continue; // drop orphan

    items.push({
      docId: position.id,
      title: doc.title,
      page: position.page,
      updatedAt: position.updatedAt,
    });
  }

  items.sort((a, b) => {
    if (a.updatedAt > b.updatedAt) return -1;
    if (a.updatedAt < b.updatedAt) return 1;
    return 0;
  });

  return items;
}
