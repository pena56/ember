/**
 * app/dev/blob-sync-13d.tsx — throwaway device-verify screen for Unit 13d.
 *
 * Interactive checks:
 *  (1) Crypto round-trip + cross-platform parity (a known noble-produced
 *      ciphertext decrypts correctly with native-crypto-box).
 *  (2) Import → badge goes Syncing… → synced live (no remount).
 *  (3) >50 MB synthetic doc → "Too large to sync" badge, excluded from quota meter.
 *
 * DELETE this file + its entry in app/dev/index.tsx once confirmed green on device.
 * The real adapters (native-crypto-box.ts, blob-sync-scheduler.ts, etc.) stay.
 */

import { gcm } from '@noble/ciphers/aes.js';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StorageMeter } from '../../src/library/storage-meter.js';
import { createNativeCryptoBox } from '../../src/store/native-crypto-box.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function StatusRow({ label, status }: { label: string; status: 'pending' | 'pass' | 'fail' }) {
  const color =
    status === 'pass' ? 'text-accent' :
    status === 'fail' ? 'text-streak-lit' :
    'text-text-muted';
  const icon = status === 'pass' ? '✓' : status === 'fail' ? '✗' : '…';
  return (
    <View className="flex-row items-center gap-2 py-1">
      <Text className={`font-sans text-sm ${color}`}>{icon}</Text>
      <Text className="font-sans text-sm text-text flex-1">{label}</Text>
    </View>
  );
}

// ── Crypto check ──────────────────────────────────────────────────────────────

type CheckStatus = 'pending' | 'pass' | 'fail';

interface CryptoChecks {
  roundTrip: CheckStatus;
  crossPlatform: CheckStatus;
}

function useCryptoChecks(): CryptoChecks {
  const [checks, setChecks] = useState<CryptoChecks>({
    roundTrip: 'pending',
    crossPlatform: 'pending',
  });

  useEffect(() => {
    void (async () => {
      const key = new Uint8Array(32).fill(0x42);
      const iv = new Uint8Array(12).fill(0x01);
      const plaintext = new Uint8Array([1, 2, 3, 4, 5]);

      // Round-trip
      try {
        const box = createNativeCryptoBox(key, () => iv);
        const ciphertext = await box.encrypt(plaintext);
        const recovered = await box.decrypt(ciphertext);
        const ok = recovered.length === plaintext.length && recovered.every((b, i) => b === plaintext[i]);
        setChecks((c) => ({ ...c, roundTrip: ok ? 'pass' : 'fail' }));
      } catch {
        setChecks((c) => ({ ...c, roundTrip: 'fail' }));
      }

      // Cross-platform: a noble-produced ciphertext (simulating web crypto output)
      // must decrypt with native-crypto-box.
      try {
        const nobleCt = gcm(key, iv).encrypt(plaintext);
        const webBlob = new Uint8Array(12 + nobleCt.byteLength);
        webBlob.set(iv, 0);
        webBlob.set(nobleCt, 12);

        const box = createNativeCryptoBox(key, () => iv);
        const recovered = await box.decrypt(webBlob);
        const ok = recovered.length === plaintext.length && recovered.every((b, i) => b === plaintext[i]);
        setChecks((c) => ({ ...c, crossPlatform: ok ? 'pass' : 'fail' }));
      } catch {
        setChecks((c) => ({ ...c, crossPlatform: 'fail' }));
      }
    })();
  }, []);

  return checks;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function BlobSync13dScreen() {
  const crypto = useCryptoChecks();

  return (
    <View className="flex-1 bg-surface">
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 24 }}>
          <Text className="font-serif text-2xl text-text" accessibilityRole="header">
            13d Blob-sync verify
          </Text>
          <Text className="font-sans text-xs text-text-muted">
            DELETE this screen once confirmed green on device.
          </Text>

          {/* (1) Crypto checks */}
          <View className="gap-2">
            <Text className="font-sans text-sm font-medium text-text">
              (1) Crypto (node-testable native-crypto-box)
            </Text>
            <StatusRow label="Round-trip: encrypt → decrypt === plaintext" status={crypto.roundTrip} />
            <StatusRow label="Cross-platform: web-produced (noble) ciphertext decrypts" status={crypto.crossPlatform} />
          </View>

          {/* (2) Library badge check — instruction */}
          <View className="gap-2">
            <Text className="font-sans text-sm font-medium text-text">
              (2) Library badge (manual — check on Library tab)
            </Text>
            <Text className="font-sans text-xs text-text-muted">
              Import a PDF on this device. The row should show &quot;Syncing…&quot; and transition to no badge (synced) without remounting.
            </Text>
          </View>

          {/* (3) Over-cap check — instruction */}
          <View className="gap-2">
            <Text className="font-sans text-sm font-medium text-text">
              (3) Over-cap badge (manual — check on Library tab)
            </Text>
            <Text className="font-sans text-xs text-text-muted">
              Import a file larger than the server fileCap (≥50 MB). The row should show &quot;Too large to sync — kept on this device&quot; and the file should be excluded from the quota meter.
            </Text>
          </View>

          {/* Storage meter */}
          <View className="gap-2">
            <Text className="font-sans text-sm font-medium text-text">
              Storage meter (requires auth)
            </Text>
            <StorageMeter />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
