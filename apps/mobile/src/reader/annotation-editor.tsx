/**
 * annotation-editor.tsx — native floating editor card for highlights and notes.
 *
 * Sibling to selection-toolbar.tsx; absolutely positioned by the screen at the
 * tapped annotation rect (same placement/clamp math). Renders nothing when no
 * annotation is editing.
 *
 * Design: a warm Ember marginalia card — amber ink on warm-white stock. The swatches
 * sit in a quiet row like ink blots (current color ringed in accent); the note field
 * has the texture of a notebook page; delete is a whisper, not a siren — reachable but
 * calm, no confirm modal (delete is reversible-enough offline, 10c product decision).
 *
 * Highlight editing → swatch row + note field + delete.
 * Note editing (incl. unsaved draft) → note field (required; Save disabled when empty)
 * + delete. No swatches. Closing a draft empty discards (nothing written — 10a).
 *
 * All colors come from tokens (invariant #6); swatch classes are literal `bg-highlight-*`
 * (the SWATCH_CLASS safelist pattern shared with selection-toolbar.tsx). Every control
 * carries accessibilityRole + accessibilityLabel and pressed-opacity feedback.
 */

import { useState } from 'react';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Path, Svg } from 'react-native-svg';
import { useResolveClassNames } from 'uniwind';

import type { Annotation, HighlightColor } from '@ember/core';
import { HIGHLIGHT_COLORS } from '@ember/core';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AnnotationEditorProps {
  /** The annotation being edited (may be an unsaved draft note when `isDraft`). */
  annotation: Annotation;
  /** True when editing a freshly-created, not-yet-persisted note draft. */
  isDraft?: boolean | undefined;
  /** Recolor a highlight. */
  onRecolor: (color: HighlightColor) => void;
  /** Save the note text (empty string clears on a highlight; persists a draft note). */
  onEditNote: (text: string) => void;
  /** Delete the annotation. */
  onDelete: () => void;
  /** Dismiss the editor. */
  onClose: () => void;
  /**
   * Render as a bottom sheet (full-width, rounded top, grabber) rather than a
   * free-floating card. The screen uses this so the editor rises cleanly above
   * the keyboard instead of jamming against a screen edge.
   */
  sheet?: boolean;
  /** Absolute position style passed in by the screen (WebView-viewport → overlay coords). */
  style?: StyleProp<ViewStyle>;
}

// ── Per-color literal class names (safelist — shared with selection-toolbar) ──

const SWATCH_CLASS: Record<HighlightColor, string> = {
  yellow: 'bg-highlight-yellow',
  green:  'bg-highlight-green',
  blue:   'bg-highlight-blue',
  pink:   'bg-highlight-pink',
};

const COLOR_LABEL: Record<HighlightColor, string> = {
  yellow: 'Recolor yellow',
  green:  'Recolor green',
  blue:   'Recolor blue',
  pink:   'Recolor pink',
};

// ── Glyphs (token-inked) ──────────────────────────────────────────────────────

function TrashGlyph({ color }: { color: ColorValue }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7h16" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
      <Path
        d="M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7"
        stroke={color}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
      <Path d="M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" stroke={color} strokeWidth={1.7} strokeLinejoin="round" />
    </Svg>
  );
}

function CloseGlyph({ color }: { color: ColorValue }) {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
      <Path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AnnotationEditor({
  annotation,
  isDraft = false,
  onRecolor,
  onEditNote,
  onDelete,
  onClose,
  sheet = false,
  style,
}: AnnotationEditorProps) {
  const accent = useResolveClassNames('bg-accent').backgroundColor as ColorValue;
  const onAccent = useResolveClassNames('text-on-accent').color as ColorValue;
  const muted = useResolveClassNames('text-text-muted').color as ColorValue;
  const text = useResolveClassNames('text-text').color as ColorValue;

  // Seed note text from the annotation; reset inline when the edited id changes
  // (React's "store previous prop in state" pattern — avoids set-state-in-effect).
  const [noteText, setNoteText] = useState<string>(() => annotation.note ?? '');
  const [prevId, setPrevId] = useState<string>(annotation.id);
  if (annotation.id !== prevId) {
    setPrevId(annotation.id);
    setNoteText(annotation.note ?? '');
  }

  const isNote = annotation.kind === 'note';
  const noteIsEmpty = noteText.trim() === '';
  // Save is meaningful only when there is something to write (note required for a
  // draft / note-kind; a highlight can save to clear, so always allowed there).
  const saveDisabled = isNote && noteIsEmpty;

  function handleSave() {
    if (saveDisabled) return;
    onEditNote(noteText.trim());
  }

  // Blur saves only when the text actually changed, so dismissing the keyboard on an
  // unchanged note never enqueues a redundant edit (one no-op write = one wasted
  // HLC-stamped outbox entry — invariant #2 hygiene). The explicit Save button always fires.
  function handleBlur() {
    if (saveDisabled) return;
    if (noteText.trim() === (annotation.note ?? '')) return;
    onEditNote(noteText.trim());
  }

  return (
    <View
      // Decorative lift above the WebView; not exposed to accessibility. As a sheet the
      // shadow casts upward (negative y); as a floating card it casts downward.
      style={[
        style as ViewStyle,
        { shadowColor: '#000', shadowOffset: { width: 0, height: sheet ? -3 : 3 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 8 },
      ]}
      className={
        sheet
          ? 'rounded-t-3xl bg-surface-raised border-t border-x border-line px-5 pt-2.5 pb-7'
          : 'rounded-2xl bg-surface-raised border border-line px-3.5 pt-3 pb-3'
      }
      accessibilityViewIsModal
    >
      {/* Grabber — sheet only; signals a draggable/dismissable sheet. */}
      {sheet && (
        <View className="self-center w-9 h-1 rounded-full bg-line mb-2.5" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
      )}

      {/* Header: kind label + close */}
      <View className="flex-row items-center justify-between mb-2.5">
        <Text className="font-sans text-[10px] font-semibold tracking-[2px] uppercase text-accent">
          {isNote ? 'Note' : 'Highlight'}
        </Text>
        <Pressable
          onPress={onClose}
          className="w-7 h-7 -mr-1 items-center justify-center rounded-md"
          accessibilityRole="button"
          accessibilityLabel="Close editor"
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 0.55 })}
        >
          <CloseGlyph color={muted} />
        </Pressable>
      </View>

      {/* Swatch row — highlight only */}
      {!isNote && (
        <View
          className="flex-row items-center gap-2 mb-3"
          accessibilityRole="radiogroup"
          accessibilityLabel="Recolor highlight"
        >
          {HIGHLIGHT_COLORS.map((color) => {
            const active = color === annotation.color;
            return (
              <Pressable
                key={color}
                onPress={() => { onRecolor(color); }}
                className={`w-8 h-8 rounded-full ${SWATCH_CLASS[color]}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={COLOR_LABEL[color]}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.6 : 1,
                  // Active swatch wears an accent ring (resolved token).
                  borderWidth: active ? 2.5 : 0,
                  borderColor: accent as string,
                })}
              />
            );
          })}
        </View>
      )}

      {/* Note field */}
      <TextInput
        value={noteText}
        onChangeText={setNoteText}
        onBlur={handleBlur}
        placeholder="Add a note…"
        placeholderTextColor={muted as string}
        multiline
        textAlignVertical="top"
        // A fresh draft opens straight into typing (keyboard + sheet rise together).
        autoFocus={isDraft}
        accessibilityLabel="Note text"
        className="rounded-lg bg-surface border border-line px-3 py-2.5 font-sans text-sm text-text"
        style={{ minHeight: isNote ? 88 : 64, color: text as string }}
      />

      {/* Action row: delete (calm) + save */}
      <View className="flex-row items-center justify-between mt-3">
        <Pressable
          onPress={onDelete}
          className="flex-row items-center gap-1.5 rounded-md px-1.5 py-1.5 -ml-1"
          accessibilityRole="button"
          accessibilityLabel={isNote ? 'Delete note' : 'Delete highlight'}
          style={({ pressed }) => ({ opacity: pressed ? 0.55 : 0.6 })}
        >
          <TrashGlyph color={muted} />
          <Text className="font-sans text-xs text-text-muted">Remove</Text>
        </Pressable>

        <Pressable
          onPress={handleSave}
          disabled={saveDisabled}
          className="rounded-lg bg-accent px-4 py-2"
          accessibilityRole="button"
          accessibilityLabel="Save note"
          accessibilityState={{ disabled: saveDisabled }}
          style={({ pressed }) => ({ opacity: saveDisabled ? 0.35 : pressed ? 0.8 : 1 })}
        >
          <Text className="font-sans text-xs font-semibold" style={{ color: onAccent as string }}>
            Save
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
