/**
 * account-sheet.tsx — claim / sign-in / sign-out form presented as a slide-up
 * sheet (modal route). Renders inside app/account.tsx.
 *
 * States:
 *   loading   → ActivityIndicator (token-tinted, invariant #6)
 *   anonymous → Create account / Sign in form (email + password)
 *   claimed   → email display + Sign out button
 *
 * On successful claim/sign-in:
 *   - resetAuthClient() → key-remount → ConvexAuthProvider re-reads token → queries re-bind
 *   - toast.success with warm voice
 *   - router.back() closes the modal
 *
 * On failure: inline sanitized error + toast.error(friendlyAuthError(...)).
 * Sheet stays open. Disable submit while pending.
 *
 * Token-only styling (invariant #6) — no hardcoded colors.
 * Accessibility: header role on title, labelled inputs, keyboard helpers,
 * modal dismisses via swipe/back.
 */

import { useAuthActions } from '@convex-dev/auth/react';
import { router } from 'expo-router';
import { useState } from 'react';
import type { ColorValue } from 'react-native';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Path, Svg } from 'react-native-svg';
import { toast } from 'sonner-native';
import { useResolveClassNames } from 'uniwind';

import { friendlyAuthError } from './auth-errors.js';
import { useAuthReset } from './auth-provider-gate.js';
import { useAccount } from './use-account.js';

type Mode = 'signUp' | 'signIn';

// ── Close button ───────────────────────────────────────────────────────────────
// The modal is a native-stack modal with no header; Android gives it no swipe-to-
// dismiss affordance, so this explicit control is the only reliable way out (the
// account is optional — the app is fully usable locally without it).

function dismissSheet() {
  // Prefer back (returns to wherever the sheet was opened from). Fall back to the
  // library if there's no back stack, so Close can never throw GO_BACK errors.
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/library');
  }
}

function CloseButton() {
  const mutedColor = useResolveClassNames('bg-text-muted').backgroundColor as ColorValue;
  return (
    <Pressable
      onPress={dismissSheet}
      accessibilityRole="button"
      accessibilityLabel="Close"
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      className="h-9 w-9 items-center justify-center rounded-full border border-line bg-surface-raised"
    >
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path d="M6 6l12 12M18 6 6 18" stroke={mutedColor} strokeWidth={2} strokeLinecap="round" />
      </Svg>
    </Pressable>
  );
}

// ── Claimed view ──────────────────────────────────────────────────────────────

function ClaimedView({ email }: { email: string | undefined }) {
  const { signOut } = useAuthActions();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    try {
      await signOut();
      toast.success('Signed out.');
      dismissSheet();
    } catch (err: unknown) {
      toast.error(friendlyAuthError(err, 'signOut'));
    } finally {
      setPending(false);
    }
  }

  return (
    <View className="gap-6">
      <View className="gap-1">
        <Text className="font-sans text-xs text-text-muted uppercase tracking-wider">
          Signed in as
        </Text>
        <Text className="font-sans text-base text-text" numberOfLines={1}>
          {email ?? '—'}
        </Text>
      </View>

      <Pressable
        onPress={() => { void handleSignOut(); }}
        disabled={pending}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        accessibilityState={{ disabled: pending }}
        className="items-center py-3 rounded-lg border border-line bg-surface-raised"
      >
        <Text className={pending ? 'font-sans text-base text-text-muted' : 'font-sans text-base text-text'}>
          {pending ? 'Signing out…' : 'Sign out'}
        </Text>
      </Pressable>
    </View>
  );
}

// ── Anonymous / auth form ─────────────────────────────────────────────────────

function AuthForm() {
  const { signIn } = useAuthActions();
  const resetAuthClient = useAuthReset();

  const [mode, setMode] = useState<Mode>('signUp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function clearError() {
    if (error) setError(null);
  }

  // Basic client-side validation
  function validate(): string | null {
    if (!email.trim()) return 'Email is required.';
    if (!password) return 'Password is required.';
    return null;
  }

  async function handleSubmit() {
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setPending(true);
    try {
      await signIn('password', { email: email.trim(), password, flow: mode });
      // Remount the ConvexAuthProvider so it re-reads the new (password) token
      // from SecureStore and re-runs setAuth — queries re-bind to the claimed identity.
      resetAuthClient();
      const successMsg = mode === 'signUp' ? 'Your library is saved.' : 'Welcome back.';
      toast.success(successMsg);
      dismissSheet();
    } catch (err: unknown) {
      const msg = friendlyAuthError(err, mode);
      setError(msg);
      toast.error(msg);
      setPending(false);
    }
  }

  return (
    <View className="gap-6">
      <View className="gap-4">
        {/* Email */}
        <View className="gap-1.5">
          <Text className="font-sans text-sm text-text font-medium" nativeID="email-label">
            Email
          </Text>
          <TextInput
            accessibilityLabel="Email"
            accessibilityLabelledBy="email-label"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChangeText={(t) => { setEmail(t); clearError(); }}
            editable={!pending}
            returnKeyType="next"
            className="font-sans text-base text-text bg-surface-raised border border-line rounded-lg px-4 py-3"
          />
        </View>

        {/* Password */}
        <View className="gap-1.5">
          <Text className="font-sans text-sm text-text font-medium" nativeID="password-label">
            Password
          </Text>
          <TextInput
            accessibilityLabel="Password"
            accessibilityLabelledBy="password-label"
            secureTextEntry
            autoCapitalize="none"
            autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
            placeholder="••••••••"
            value={password}
            onChangeText={(t) => { setPassword(t); clearError(); }}
            editable={!pending}
            returnKeyType="done"
            onSubmitEditing={() => { void handleSubmit(); }}
            className="font-sans text-base text-text bg-surface-raised border border-line rounded-lg px-4 py-3"
          />
        </View>

        {/* Inline error */}
        {error && (
          <Text
            className="font-sans text-sm text-destructive leading-snug"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            {error}
          </Text>
        )}

        {/* Submit button */}
        <Pressable
          onPress={() => { void handleSubmit(); }}
          disabled={pending}
          accessibilityRole="button"
          accessibilityLabel={pending ? 'Please wait' : mode === 'signUp' ? 'Create account' : 'Sign in'}
          accessibilityState={{ disabled: pending }}
          className={
            pending
              ? 'items-center py-3.5 rounded-lg bg-accent opacity-60'
              : 'items-center py-3.5 rounded-lg bg-accent'
          }
        >
          <Text className="font-sans text-base text-on-accent font-medium">
            {pending ? 'Please wait…' : mode === 'signUp' ? 'Create account' : 'Sign in'}
          </Text>
        </Pressable>
      </View>

      {/* Mode toggle */}
      <View className="border-t border-line pt-4 items-center">
        {mode === 'signUp' ? (
          <Text className="font-sans text-sm text-text-muted">
            {'Already have an account? '}
            <Text
              className="text-accent font-medium"
              onPress={() => { setMode('signIn'); setError(null); }}
              accessibilityRole="button"
              accessibilityLabel="Switch to sign in"
            >
              Sign in
            </Text>
          </Text>
        ) : (
          <Text className="font-sans text-sm text-text-muted">
            {'New here? '}
            <Text
              className="text-accent font-medium"
              onPress={() => { setMode('signUp'); setError(null); }}
              accessibilityRole="button"
              accessibilityLabel="Switch to create account"
            >
              Create account
            </Text>
          </Text>
        )}
      </View>
    </View>
  );
}

// ── Account sheet ─────────────────────────────────────────────────────────────

export function AccountSheet() {
  const { status, email } = useAccount();
  const accentColor = useResolveClassNames('bg-accent').backgroundColor as ColorValue;

  if (status === 'loading') {
    return (
      <View
        className="flex-1 items-center justify-center"
        accessibilityRole="none"
        accessibilityState={{ busy: true }}
        accessibilityLabel="Loading account"
      >
        <ActivityIndicator size="large" color={accentColor} accessibilityElementsHidden />
      </View>
    );
  }

  return (
    <View className="px-6 pt-3">
      {/* Header row: title + always-present close control. The title takes the
          remaining width (flex-1) and clips to one line so a long string can
          never squeeze the close button or break the row layout. */}
      <View className="flex-row items-start justify-between mb-3">
        <Text
          className="font-serif text-2xl text-text flex-1 pr-3"
          numberOfLines={1}
          accessibilityRole="header"
        >
          {status === 'claimed' ? 'Account' : 'Save your library'}
        </Text>
        <CloseButton />
      </View>

      {status === 'claimed' ? (
        <ClaimedView email={email} />
      ) : (
        <View>
          <Text className="font-sans text-sm text-text-muted mb-5 leading-relaxed">
            Create an account to sync your library and progress across devices. This is
            optional — you can keep reading on this device without one.
          </Text>
          <AuthForm />
        </View>
      )}
    </View>
  );
}
