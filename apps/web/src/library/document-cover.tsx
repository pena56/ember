/**
 * document-cover.tsx — a PDF's cover image, or a styled placeholder.
 *
 * Renders the rasterised first page from useCover when available; otherwise a
 * warm, token-driven placeholder (a paper sheet with the title's initial) so the
 * grid never shows a broken/empty tile. Two sizes:
 *   - 'card'  → fills a 3/4 tile (grid)
 *   - 'thumb' → a small fixed chip (list row)
 *
 * Token-only styling (invariant #6). The image itself is decorative — the card's
 * "Open {title}" button already names the item — so it's aria-hidden.
 */

import { useCover } from './use-cover.js';

interface DocumentCoverProps {
  docId: string;
  contentType: string;
  title: string;
  variant: 'card' | 'thumb';
}

function Placeholder({ title, variant }: { title: string; variant: 'card' | 'thumb' }) {
  const initial = title.trim()[0]?.toUpperCase() ?? '·';
  return (
    <div
      aria-hidden="true"
      className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-raised to-surface"
    >
      <span
        className={[
          'font-serif font-semibold text-accent/70 select-none',
          variant === 'card' ? 'text-5xl' : 'text-lg',
        ].join(' ')}
      >
        {initial}
      </span>
    </div>
  );
}

export function DocumentCover({ docId, contentType, title, variant }: DocumentCoverProps) {
  const cover = useCover(docId, contentType);

  const frame =
    variant === 'card'
      ? 'aspect-[3/4] w-full overflow-hidden rounded-md border border-line bg-surface'
      : 'h-14 w-11 shrink-0 overflow-hidden rounded-sm border border-line bg-surface';

  return (
    <div className={frame}>
      {cover !== undefined ? (
        <img
          src={cover}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover object-top"
        />
      ) : (
        <Placeholder title={title} variant={variant} />
      )}
    </div>
  );
}
