import { useRef, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ImportDropzoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

// ── Ember flame SVG ───────────────────────────────────────────────────────────

function EmberFlame({ isDragOver }: { isDragOver: boolean }) {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={[
        'motion-safe:transition-transform duration-300',
        isDragOver ? 'scale-110' : 'scale-100',
      ].join(' ')}
    >
      {/* outer flame */}
      <path
        d="M24 4C24 4 14 16 14 26C14 31.523 18.477 36 24 36C29.523 36 34 31.523 34 26C34 20 30 14 28 10C28 10 27 18 24 20C21 18 24 4 24 4Z"
        className={isDragOver ? 'fill-accent' : 'fill-accent opacity-90'}
      />
      {/* inner glow */}
      <path
        d="M24 20C24 20 19 25 19 29C19 31.761 21.239 34 24 34C26.761 34 29 31.761 29 29C29 25 24 20 24 20Z"
        className="fill-surface-raised opacity-50"
      />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ImportDropzone({ onFiles, disabled = false }: ImportDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Only clear if leaving the dropzone entirely (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) {
      onFiles(dropped);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length > 0) {
      onFiles(picked);
    }
    // Reset so the same file can be re-selected after a dedupe notice
    e.target.value = '';
  }

  function handleButtonClick() {
    inputRef.current?.click();
  }

  return (
    <div
      role="region"
      aria-label="Import PDF dropzone"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={[
        'flex flex-col items-center gap-5 rounded-xl border-2 border-dashed px-8 py-12',
        'bg-surface-raised motion-safe:transition-colors duration-200',
        isDragOver
          ? 'border-accent bg-accent/5'
          : 'border-line hover:border-accent/50',
      ].join(' ')}
    >
      <EmberFlame isDragOver={isDragOver} />

      <div className="flex flex-col items-center gap-2 text-center">
        <p className="font-serif text-xl font-semibold text-text">
          Add to your library
        </p>
        <p className="font-sans text-sm text-text-muted max-w-xs text-balance leading-relaxed">
          {isDragOver
            ? 'Release to add, the fire is ready.'
            : 'Drop a PDF here, or browse your files to begin building your collection.'}
        </p>
      </div>

      <button
        type="button"
        onClick={handleButtonClick}
        disabled={disabled}
        className={[
          'font-sans text-sm font-medium px-6 py-3 rounded-lg',
          'bg-accent text-white',
          'hover:opacity-90 active:opacity-80',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          'transition-opacity duration-150',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        ].join(' ')}
      >
        Add PDF
      </button>

      {/* Hidden file input — accepts PDF, multiple */}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleInputChange}
      />
    </div>
  );
}
