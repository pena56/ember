/**
 * tag-picker.tsx — RN Modal sheet for tagging a document (Unit 15c).
 *
 * Mirror of annotation-editor.tsx sheet pattern: warm card, swatch row,
 * TextInput search, pressed-opacity, token-only (invariant #6).
 *
 * Features:
 *   - Search/filter existing tags
 *   - Toggle tag on/off for the current doc (tagDoc / untagDoc)
 *   - Inline create when typed name has no dedupe match (+ color swatch row)
 *   - Per-tag manage: rename, recolor (editTag), delete (deleteTag) with confirm
 *
 * No hardcoded palette — TAG_BG safelist map routes TagColor → bg-tag-* class (invariant #6).
 */

import { useState } from 'react';
import type { ColorValue } from 'react-native';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Path, Svg } from 'react-native-svg';
import { useResolveClassNames } from 'uniwind';

import type { Tag, TagColor } from '@ember/core';
import { DEFAULT_TAG_COLOR, TAG_COLORS, normalizeTagName, tagDedupeKey } from '@ember/core';

import { TAG_BG } from './tag-colors.js';

// ── Tag color label (display names for the swatch row) ─────────────────────────

const TAG_COLOR_LABEL: Record<TagColor, string> = {
  gray:   'Gray',
  red:    'Red',
  amber:  'Amber',
  green:  'Green',
  blue:   'Blue',
  purple: 'Purple',
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TagPickerProps {
  visible: boolean;
  onClose: () => void;
  /** All tags in the library. */
  tags: Tag[];
  /** Tag ids currently applied to this document. */
  appliedTagIds: string[];
  onTagDoc: (tagId: string) => Promise<void>;
  onUntagDoc: (tagId: string) => Promise<void>;
  onCreateTag: (name: string, color: TagColor) => Promise<void>;
  onEditTag: (tag: Tag, patch: { name?: string; color?: TagColor }) => Promise<void>;
  onDeleteTag: (id: string) => Promise<void>;
}

// ── Glyphs ────────────────────────────────────────────────────────────────────

function CloseGlyph({ color }: { color: ColorValue }) {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
      <Path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function CheckGlyph({ color }: { color: ColorValue }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12l5 5L19 7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── Color swatch row ──────────────────────────────────────────────────────────

function SwatchRow({
  selected,
  onSelect,
}: {
  selected: TagColor;
  onSelect: (c: TagColor) => void;
}) {
  const accent = useResolveClassNames('bg-accent').backgroundColor as ColorValue;

  return (
    <View
      className="flex-row items-center gap-2"
      accessibilityRole="radiogroup"
      accessibilityLabel="Tag color"
    >
      {TAG_COLORS.map((color) => {
        const isActive = color === selected;
        return (
          <Pressable
            key={color}
            onPress={() => { onSelect(color); }}
            className={`w-7 h-7 rounded-full ${TAG_BG[color]}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${TAG_COLOR_LABEL[color]} ${isActive ? ', selected' : ''}`}
            style={({ pressed }) => ({
              opacity: pressed ? 0.6 : 1,
              borderWidth: isActive ? 2.5 : 0,
              borderColor: accent as string,
            })}
          />
        );
      })}
    </View>
  );
}

// ── Per-tag manage row ────────────────────────────────────────────────────────

function TagManageSheet({
  tag,
  visible,
  onRename,
  onRecolor,
  onDelete,
  onClose,
}: {
  tag: Tag | null;
  visible: boolean;
  onRename: (tag: Tag, newName: string) => Promise<void>;
  onRecolor: (tag: Tag, color: TagColor) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'menu' | 'rename' | 'confirm-delete'>('menu');
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState('');
  const [color, setColor] = useState<TagColor>(DEFAULT_TAG_COLOR);
  const muted = useResolveClassNames('text-text-muted').color as ColorValue;

  function handleOpen() {
    if (!tag) return;
    setMode('menu');
    setNewName(tag.name);
    setColor(tag.color);
    setNameError('');
  }

  function handleClose() {
    setMode('menu');
    setNewName('');
    setNameError('');
    onClose();
  }

  async function handleRename() {
    if (!tag) return;
    const trimmed = normalizeTagName(newName);
    if (!trimmed) {
      setNameError("Tag name can't be empty.");
      return;
    }
    setNameError('');
    await onRename(tag, trimmed);
    handleClose();
  }

  async function handleRecolor(newColor: TagColor) {
    if (!tag) return;
    setColor(newColor);
    await onRecolor(tag, newColor);
  }

  async function handleDelete() {
    if (!tag) return;
    await onDelete(tag.id);
    handleClose();
  }

  if (!tag) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      onShow={handleOpen}
      accessibilityViewIsModal
    >
      <Pressable
        className="flex-1 justify-end bg-black/40"
        onPress={handleClose}
        accessibilityLabel="Dismiss"
        accessibilityRole="button"
      >
        <Pressable
          onPress={() => {/* absorb */}}
          className="bg-surface-raised rounded-t-3xl border-t border-x border-line px-5 pt-2.5 pb-8"
          style={{ shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 8 }}
        >
          {/* Grabber */}
          <View className="self-center w-9 h-1 rounded-full bg-line mb-3" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />

          {mode === 'menu' && (
            <>
              <Text className="font-serif text-lg text-text mb-1">{tag.name}</Text>

              {/* Recolor */}
              <View className="py-3">
                <Text className="font-sans text-xs text-text-muted mb-2 uppercase tracking-wide">Color</Text>
                <SwatchRow selected={color} onSelect={(c) => { void handleRecolor(c); }} />
              </View>
              <View className="h-px bg-line" />

              {/* Rename */}
              <Pressable
                onPress={() => { setMode('rename'); }}
                className="py-3.5"
                accessibilityRole="button"
                accessibilityLabel={`Rename ${tag.name}`}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Text className="font-sans text-sm text-text">Rename</Text>
              </Pressable>
              <View className="h-px bg-line" />

              {/* Delete */}
              <Pressable
                onPress={() => { setMode('confirm-delete'); }}
                className="py-3.5"
                accessibilityRole="button"
                accessibilityLabel={`Delete ${tag.name}`}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Text className="font-sans text-sm text-text-muted">Delete tag</Text>
              </Pressable>
            </>
          )}

          {mode === 'rename' && (
            <>
              <Text className="font-serif text-lg text-text mb-3">Rename tag</Text>
              <TextInput
                value={newName}
                onChangeText={(v) => { setNewName(v); setNameError(''); }}
                placeholder="Tag name…"
                placeholderTextColor={muted as string}
                autoFocus
                accessibilityLabel="Tag name"
                className="rounded-lg bg-surface border border-line px-3 py-2.5 font-sans text-sm text-text mb-2"
              />
              {nameError ? (
                <Text className="font-sans text-xs text-accent mb-2">{nameError}</Text>
              ) : null}
              <View className="flex-row justify-end gap-3 mt-1">
                <Pressable
                  onPress={() => { setMode('menu'); setNameError(''); }}
                  className="px-4 py-2 rounded-lg"
                  accessibilityRole="button"
                  accessibilityLabel="Cancel rename"
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Text className="font-sans text-sm text-text-muted">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => { void handleRename(); }}
                  className="px-4 py-2 rounded-lg bg-accent"
                  accessibilityRole="button"
                  accessibilityLabel="Save rename"
                  style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
                >
                  <Text className="font-sans text-sm font-medium text-on-accent">Save</Text>
                </Pressable>
              </View>
            </>
          )}

          {mode === 'confirm-delete' && (
            <>
              <Text className="font-serif text-lg text-text mb-2">{`Delete "${tag.name}"?`}</Text>
              <Text className="font-sans text-sm text-text-muted mb-4">
                {'This removes the tag from all books. Books you\'ve tagged will keep their other tags.'}
              </Text>
              <View className="flex-row justify-end gap-3">
                <Pressable
                  onPress={() => { setMode('menu'); }}
                  className="px-4 py-2 rounded-lg"
                  accessibilityRole="button"
                  accessibilityLabel="Cancel delete"
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Text className="font-sans text-sm text-text-muted">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => { void handleDelete(); }}
                  className="px-4 py-2 rounded-lg border border-line"
                  accessibilityRole="button"
                  accessibilityLabel="Confirm delete tag"
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Text className="font-sans text-sm text-text-muted">Delete</Text>
                </Pressable>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Tag row ───────────────────────────────────────────────────────────────────

function TagRow({
  tag,
  isApplied,
  onToggle,
  onManage,
}: {
  tag: Tag;
  isApplied: boolean;
  onToggle: () => void;
  onManage: () => void;
}) {
  const accent = useResolveClassNames('bg-accent').backgroundColor as ColorValue;

  return (
    <View className="flex-row items-center gap-2 py-2">
      {/* Color swatch */}
      <View
        className={`w-4 h-4 rounded-full ${TAG_BG[tag.color]} shrink-0`}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />

      {/* Toggle */}
      <Pressable
        onPress={onToggle}
        className="flex-1 flex-row items-center gap-2"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isApplied }}
        accessibilityLabel={`${tag.name}${isApplied ? ', applied' : ''}`}
        hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <Text className="font-sans text-sm text-text flex-1" numberOfLines={1}>{tag.name}</Text>
        {isApplied && (
          <View
            className="w-5 h-5 rounded-full bg-accent items-center justify-center"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <CheckGlyph color={accent} />
          </View>
        )}
      </Pressable>

      {/* ⋯ manage */}
      <Pressable
        onPress={onManage}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`Manage ${tag.name}`}
        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 0.4 })}
      >
        <Text className="font-sans text-sm text-text-muted">⋯</Text>
      </Pressable>
    </View>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * TagPicker — a bottom-sheet Modal for tagging a document.
 *
 * Shows existing tags (searchable/filterable), toggleable on/off.
 * When the typed name has no dedupe match, shows inline create with color picker.
 * Long-press or ⋯ on a tag row opens per-tag manage (rename/recolor/delete).
 */
export function TagPicker({
  visible,
  onClose,
  tags,
  appliedTagIds,
  onTagDoc,
  onUntagDoc,
  onCreateTag,
  onEditTag,
  onDeleteTag,
}: TagPickerProps) {
  const [search, setSearch] = useState('');
  const [newColor, setNewColor] = useState<TagColor>(DEFAULT_TAG_COLOR);
  const [managingTag, setManagingTag] = useState<Tag | null>(null);
  const muted = useResolveClassNames('text-text-muted').color as ColorValue;

  const appliedSet = new Set(appliedTagIds);

  const normalizedSearch = normalizeTagName(search);
  const searchKey = tagDedupeKey(normalizedSearch);

  const filtered = normalizedSearch
    ? tags.filter((t) => t.name.toLowerCase().includes(searchKey))
    : tags;

  const hasExactMatch = normalizedSearch
    ? tags.some((t) => tagDedupeKey(t.name) === searchKey)
    : false;

  const showCreate = normalizedSearch.length > 0 && !hasExactMatch;

  function handleClose() {
    setSearch('');
    setNewColor(DEFAULT_TAG_COLOR);
    onClose();
  }

  async function handleToggle(tag: Tag) {
    if (appliedSet.has(tag.id)) {
      await onUntagDoc(tag.id);
    } else {
      await onTagDoc(tag.id);
    }
  }

  async function handleCreate() {
    if (!normalizedSearch) return;
    await onCreateTag(normalizedSearch, newColor);
    setSearch('');
    setNewColor(DEFAULT_TAG_COLOR);
  }

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={handleClose}
        accessibilityViewIsModal
      >
        <Pressable
          className="flex-1 justify-end bg-black/40"
          onPress={handleClose}
          accessibilityLabel="Dismiss"
          accessibilityRole="button"
        >
          <Pressable
            onPress={() => {/* absorb */}}
            className="bg-surface-raised rounded-t-3xl border-t border-x border-line px-5 pt-2.5 pb-8"
            style={{ shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 8 }}
          >
            {/* Grabber */}
            <View className="self-center w-9 h-1 rounded-full bg-line mb-3" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />

            {/* Header */}
            <View className="flex-row items-center justify-between mb-3">
              <Text className="font-serif text-xl text-text">Tags</Text>
              <Pressable
                onPress={handleClose}
                className="w-7 h-7 -mr-1 items-center justify-center rounded-md"
                accessibilityRole="button"
                accessibilityLabel="Close tag picker"
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 0.55 })}
              >
                <CloseGlyph color={muted} />
              </Pressable>
            </View>

            {/* Search */}
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Find or create a tag…"
              placeholderTextColor={muted as string}
              accessibilityLabel="Search or create tag"
              className="rounded-lg bg-surface border border-line px-3 py-2.5 font-sans text-sm text-text mb-3"
            />

            {/* Tag list */}
            <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled">
              {filtered.map((tag) => {
                const isApplied = appliedSet.has(tag.id);
                return (
                  <TagRow
                    key={tag.id}
                    tag={tag}
                    isApplied={isApplied}
                    onToggle={() => { void handleToggle(tag); }}
                    onManage={() => { setManagingTag(tag); }}
                  />
                );
              })}

              {filtered.length === 0 && !showCreate && (
                <Text className="font-sans text-sm text-text-muted py-4 text-center">
                  No tags yet
                </Text>
              )}
            </ScrollView>

            {/* Inline create */}
            {showCreate && (
              <View className="mt-3 pt-3 border-t border-line gap-3">
                <Text className="font-sans text-xs text-text-muted uppercase tracking-wide">
                  {`Create "${normalizedSearch}"`}
                </Text>
                <SwatchRow selected={newColor} onSelect={setNewColor} />
                <Pressable
                  onPress={() => { void handleCreate(); }}
                  className="py-2.5 rounded-lg bg-accent items-center"
                  accessibilityRole="button"
                  accessibilityLabel={`Create tag ${normalizedSearch}`}
                  style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
                >
                  <Text className="font-sans text-sm font-medium text-on-accent">
                    Create tag
                  </Text>
                </Pressable>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Per-tag manage sheet */}
      <TagManageSheet
        tag={managingTag}
        visible={managingTag !== null}
        onRename={async (tag, newName) => { await onEditTag(tag, { name: newName }); }}
        onRecolor={async (tag, color) => { await onEditTag(tag, { color }); }}
        onDelete={onDeleteTag}
        onClose={() => { setManagingTag(null); }}
      />
    </>
  );
}
