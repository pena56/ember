/**
 * smart-view-bar.tsx — horizontal pill row for switching smart views (Unit 15c).
 *
 * Renders built-in pills (All · Untagged · In Progress · Finished · Recently Added)
 * then user-saved view pills, then an optional "Save view" affordance when the
 * active query is an unsaved ad-hoc tag filter.
 *
 * Active pill uses the accent-underline idiom from ThemeControl (library-screen.tsx:48).
 * Saved-view pills expose a ⋯ manage affordance (rename / delete) via a small Modal.
 *
 * Design: warm/literary/quiet — pills sit in a shallow horizontal ScrollView, calm
 * weight, token-only colors. No hardcoded palette (invariant #6).
 */

import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ColorValue } from 'react-native';
import { useResolveClassNames } from 'uniwind';

import type { SmartView, SmartViewQuery } from '@ember/core';
import { BUILT_IN_SMART_VIEWS, normalizeTagName } from '@ember/core';

import { isAdHocTagFilter } from './smart-view-filters.js';
import type { ActiveView } from './use-library-tags.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SmartViewBarProps {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  savedViews: SmartView[];
  /** Called when the user saves the current ad-hoc filter as a new smart view. */
  onSaveView: (name: string) => Promise<void>;
  /** Called when the user renames a saved view. */
  onRenameView: (view: SmartView, newName: string) => Promise<void>;
  /** Called when the user deletes a saved view (after confirm). */
  onDeleteView: (id: string) => Promise<void>;
}

// ── Save view modal ───────────────────────────────────────────────────────────

function SaveViewModal({
  visible,
  onSave,
  onClose,
}: {
  visible: boolean;
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const muted = useResolveClassNames('text-text-muted').color as ColorValue;

  async function handleSave() {
    const trimmed = normalizeTagName(name);
    if (!trimmed) {
      setError('Please enter a name for this view.');
      return;
    }
    setError('');
    await onSave(trimmed);
    setName('');
    onClose();
  }

  function handleClose() {
    setName('');
    setError('');
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      accessibilityViewIsModal
    >
      <Pressable
        className="flex-1 bg-black/40 justify-center px-8"
        onPress={handleClose}
        accessibilityLabel="Dismiss"
        accessibilityRole="button"
      >
        <Pressable
          onPress={() => {/* absorb tap so overlay dismiss doesn't fire inside the card */}}
          className="bg-surface-raised rounded-2xl border border-line p-5 gap-4"
          style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 }}
        >
          <Text className="font-serif text-xl text-text">Save this view</Text>
          <TextInput
            value={name}
            onChangeText={(v) => { setName(v); setError(''); }}
            placeholder="View name…"
            placeholderTextColor={muted as string}
            autoFocus
            accessibilityLabel="View name"
            className="rounded-lg bg-surface border border-line px-3 py-2.5 font-sans text-sm text-text"
          />
          {error ? (
            <Text className="font-sans text-xs text-accent">{error}</Text>
          ) : null}
          <View className="flex-row justify-end gap-3">
            <Pressable
              onPress={handleClose}
              className="px-4 py-2 rounded-lg"
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text className="font-sans text-sm text-text-muted">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => { void handleSave(); }}
              className="px-4 py-2 rounded-lg bg-accent"
              accessibilityRole="button"
              accessibilityLabel="Save view"
              style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
            >
              <Text className="font-sans text-sm font-medium text-on-accent">Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Manage view modal ─────────────────────────────────────────────────────────

function ManageViewModal({
  view,
  visible,
  onRename,
  onDelete,
  onClose,
}: {
  view: SmartView | null;
  visible: boolean;
  onRename: (view: SmartView, newName: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const muted = useResolveClassNames('text-text-muted').color as ColorValue;

  function handleClose() {
    setRenaming(false);
    setNewName('');
    setError('');
    setConfirmDelete(false);
    onClose();
  }

  async function handleRename() {
    if (!view) return;
    const trimmed = normalizeTagName(newName);
    if (!trimmed) {
      setError('Please enter a name.');
      return;
    }
    setError('');
    await onRename(view, trimmed);
    handleClose();
  }

  async function handleDelete() {
    if (!view) return;
    await onDelete(view.id);
    handleClose();
  }

  if (!view) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      accessibilityViewIsModal
    >
      <Pressable
        className="flex-1 bg-black/40 justify-center px-8"
        onPress={handleClose}
        accessibilityLabel="Dismiss"
        accessibilityRole="button"
      >
        <Pressable
          onPress={() => {/* absorb */}}
          className="bg-surface-raised rounded-2xl border border-line p-5 gap-4"
          style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 }}
        >
          <Text className="font-serif text-lg text-text">{view.name}</Text>

          {renaming ? (
            <>
              <TextInput
                value={newName}
                onChangeText={(v) => { setNewName(v); setError(''); }}
                placeholder="New name…"
                placeholderTextColor={muted as string}
                autoFocus
                accessibilityLabel="New view name"
                className="rounded-lg bg-surface border border-line px-3 py-2.5 font-sans text-sm text-text"
              />
              {error ? (
                <Text className="font-sans text-xs text-accent">{error}</Text>
              ) : null}
              <View className="flex-row justify-end gap-3">
                <Pressable
                  onPress={() => { setRenaming(false); setNewName(''); setError(''); }}
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
                  accessibilityLabel="Save new name"
                  style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
                >
                  <Text className="font-sans text-sm font-medium text-on-accent">Rename</Text>
                </Pressable>
              </View>
            </>
          ) : confirmDelete ? (
            <>
              <Text className="font-sans text-sm text-text-muted">
                {`Delete "${view.name}"? This can’t be undone.`}
              </Text>
              <View className="flex-row justify-end gap-3">
                <Pressable
                  onPress={() => { setConfirmDelete(false); }}
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
                  accessibilityLabel="Confirm delete view"
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Text className="font-sans text-sm text-text-muted">Delete</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View className="gap-2">
              <Pressable
                onPress={() => { setRenaming(true); setNewName(view.name); }}
                className="py-3 rounded-lg"
                accessibilityRole="button"
                accessibilityLabel={`Rename ${view.name}`}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Text className="font-sans text-sm text-text">Rename</Text>
              </Pressable>
              <View className="h-px bg-line" />
              <Pressable
                onPress={() => { setConfirmDelete(true); }}
                className="py-3 rounded-lg"
                accessibilityRole="button"
                accessibilityLabel={`Delete ${view.name}`}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <Text className="font-sans text-sm text-text-muted">Delete</Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * SmartViewBar — a horizontal ScrollView of pill Pressables.
 *
 * Order: built-in views → saved views → "Save view" affordance (ad-hoc only).
 * Active pill: accent-underline idiom (border-b-2 border-accent), like ThemeControl.
 * Each pill: accessibilityRole="button" + accessibilityState={{ selected }}.
 */
export function SmartViewBar({
  activeView,
  setActiveView,
  savedViews,
  onSaveView,
  onRenameView,
  onDeleteView,
}: SmartViewBarProps) {
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [manageView, setManageView] = useState<SmartView | null>(null);

  const showSave = isAdHocTagFilter(activeView.query, savedViews);

  function selectBuiltin(key: string, query: SmartViewQuery) {
    setActiveView({ kind: 'builtin', key, query });
  }

  function selectSaved(view: SmartView) {
    setActiveView({ kind: 'saved', id: view.id, query: view.query });
  }

  function isBuiltinActive(key: string) {
    return activeView.kind === 'builtin' && activeView.key === key;
  }

  function isSavedActive(id: string) {
    return activeView.kind === 'saved' && activeView.id === id;
  }

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 6 }}
        style={{ flexShrink: 0 }}
        accessibilityRole="tablist"
        accessibilityLabel="Library views"
      >
        {/* Built-in pills */}
        {BUILT_IN_SMART_VIEWS.map(({ key, name, query }) => {
          const isActive = isBuiltinActive(key);
          return (
            <Pressable
              key={key}
              onPress={() => { selectBuiltin(key, query); }}
              className={
                isActive
                  ? 'px-3 py-1.5 border-b-2 border-accent'
                  : 'px-3 py-1.5 border-b-2 border-transparent'
              }
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={name}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text
                className={
                  isActive
                    ? 'font-sans text-sm text-text font-medium'
                    : 'font-sans text-sm text-text-muted'
                }
              >
                {name}
              </Text>
            </Pressable>
          );
        })}

        {/* Saved view pills */}
        {savedViews.map((view) => {
          const isActive = isSavedActive(view.id);
          return (
            <View key={view.id} className="flex-row items-center">
              <Pressable
                onPress={() => { selectSaved(view); }}
                className={
                  isActive
                    ? 'px-3 py-1.5 border-b-2 border-accent'
                    : 'px-3 py-1.5 border-b-2 border-transparent'
                }
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={view.name}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <Text
                  className={
                    isActive
                      ? 'font-sans text-sm text-text font-medium'
                      : 'font-sans text-sm text-text-muted'
                  }
                >
                  {view.name}
                </Text>
              </Pressable>
              {/* ⋯ manage affordance */}
              <Pressable
                onPress={() => { setManageView(view); }}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Manage ${view.name}`}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 0.45 })}
                className="ml-0.5 pb-0.5"
              >
                <Text className="font-sans text-sm text-text-muted">⋯</Text>
              </Pressable>
            </View>
          );
        })}

        {/* "Save view" affordance — only when active query is an unsaved ad-hoc tag filter */}
        {showSave && (
          <Pressable
            onPress={() => { setSaveModalOpen(true); }}
            className="px-3 py-1.5 rounded-full border border-line"
            accessibilityRole="button"
            accessibilityLabel="Save this view"
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Text className="font-sans text-xs text-text-muted">+ Save view</Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Save view modal */}
      <SaveViewModal
        visible={saveModalOpen}
        onSave={onSaveView}
        onClose={() => { setSaveModalOpen(false); }}
      />

      {/* Manage saved view modal */}
      <ManageViewModal
        view={manageView}
        visible={manageView !== null}
        onRename={onRenameView}
        onDelete={onDeleteView}
        onClose={() => { setManageView(null); }}
      />
    </>
  );
}
