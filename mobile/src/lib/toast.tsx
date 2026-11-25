import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from './theme';

type Toast = { show: (msg: string, isError?: boolean) => void; error: (e: unknown) => void };
const Ctx = createContext<Toast | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const show = useCallback((text: string, err = false) => {
    setMsg({ text, err });
    AccessibilityInfo.announceForAccessibility?.(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), err ? 4500 : 2800);
  }, []);
  const value = useMemo<Toast>(() => ({ show, error: (e: any) => show(e?.message || 'Something went wrong.', true) }), [show]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {msg ? (
        <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 90 }]}>
          <View style={[styles.toast, msg.err && styles.err]} accessibilityLiveRegion="polite" accessibilityRole="alert" testID="toast">
            <Text style={styles.text}>{msg.text}</Text>
          </View>
        </View>
      ) : null}
    </Ctx.Provider>
  );
}

export function useToast(): Toast {
  const t = useContext(Ctx);
  if (!t) throw new Error('useToast outside ToastProvider');
  return t;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: { backgroundColor: colors.pane3, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, maxWidth: 480, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  err: { backgroundColor: '#3a1d24', borderColor: 'rgba(255,107,125,0.4)' },
  text: { color: colors.text, fontWeight: '500', fontSize: 14, textAlign: 'center' },
});
