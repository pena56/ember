/**
 * remove-document-dialog.tsx — destructive confirm for removing a PDF.
 *
 * Removing cascades: the file bytes, its tags, reading position, and highlights
 * are deleted on every device. Reading history (streak/stats) is preserved. The
 * copy states this plainly so the action is never a surprise.
 *
 * Token-only styling (invariant #6).
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog.js';

interface RemoveDocumentDialogProps {
  title: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function RemoveDocumentDialog({
  title,
  open,
  onOpenChange,
  onConfirm,
}: RemoveDocumentDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this book?</AlertDialogTitle>
          <AlertDialogDescription>
            {title !== null ? `"${title}" ` : 'This book '}
            and its highlights, tags, and saved place will be removed from all your
            devices. Your reading history and streak are kept. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
