// Shared UI building blocks. Every touchable carries an accessibility role and label.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle, type StyleProp,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../lib/theme';
import { on } from '../lib/events';
import { initial } from '../core/format';
import { media } from '../lib/client';

// ---------- data loading ----------
/** Load data when the screen gains focus and when the network returns; supports pull-to-refresh. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fnRef = useRef(fn);
  useLayoutEffect(() => { fnRef.current = fn; });
  const reload = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    try { setData(await fnRef.current()); setError(null); }
    catch (e: any) { setError(e?.message || 'Could not load.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  const depsKey = JSON.stringify(deps);
  useFocusEffect(useCallback(() => { void depsKey; reload(); }, [reload, depsKey]));
  useEffect(() => on('net:back', () => reload()), [reload]);
  return { data, error, loading, refreshing, reload, setData };
}

// ---------- layout ----------
export function Screen({ children, title, eyebrow, intro, onRefresh, refreshing, scroll = true, right, style }: {
  children: React.ReactNode; title?: string; eyebrow?: string; intro?: string; onRefresh?: () => void; refreshing?: boolean;
  scroll?: boolean; right?: React.ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const head = title ? (
    <View style={styles.pagehead}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.h1} accessibilityRole="header">{title}</Text>
        {intro ? <Text style={styles.intro}>{intro}</Text> : null}
      </View>
      {right}
    </View>
  ) : null;
  if (!scroll) return <View style={[styles.screen, style]}>{head}{children}</View>;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={[{ paddingBottom: 40 }, style]} keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.gold} /> : undefined}>
      {head}
      <View style={styles.pad}>{children}</View>
    </ScrollView>
  );
}

export function Loading({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      {error ? (
        <>
          <Text style={styles.muted}>Couldn’t load this screen.</Text>
          <Text style={[styles.muted, { marginVertical: 8 }]}>{error}</Text>
          {onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} /> : null}
        </>
      ) : <ActivityIndicator color={colors.gold} accessibilityLabel="Loading" />}
    </View>
  );
}

export const SectionTitle = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <View style={styles.sectionRow}><Text style={styles.section} accessibilityRole="header">{children}</Text>{right}</View>
);
export const P = ({ children, muted, style }: { children: React.ReactNode; muted?: boolean; style?: any }) => (
  <Text style={[styles.p, muted && styles.muted, style]}>{children}</Text>
);
export const Row = ({ children, style, wrap }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; wrap?: boolean }) => (
  <View style={[styles.row, wrap && { flexWrap: 'wrap' }, style]}>{children}</View>
);
export const Card = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[styles.card, style]}>{children}</View>;
export const Empty = ({ children }: { children: React.ReactNode }) => <Text style={[styles.muted, { marginVertical: 8 }]}>{children}</Text>;

// ---------- controls ----------
export function Button({ title, onPress, variant = 'primary', disabled, small, block, label, testID, busy: busyProp }: {
  title: string; onPress?: () => unknown; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean; small?: boolean; block?: boolean;
  label?: string; testID?: string; busy?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const isBusy = busy || !!busyProp;
  const press = async () => {
    if (!onPress || isBusy) return;
    const r = onPress();
    if (r && typeof (r as Promise<unknown>).then === 'function') {
      setBusy(true);
      try { await r; } catch { /* caller shows errors */ } finally { setBusy(false); }
    }
  };
  return (
    <Pressable onPress={press} disabled={disabled || isBusy} accessibilityRole="button" accessibilityLabel={label || title}
      accessibilityState={{ disabled: !!(disabled || isBusy), busy: isBusy }} testID={testID}
      style={({ pressed }) => [styles.btn, styles[variant], small && styles.btnSmall, block && { alignSelf: 'stretch', marginTop: 14 }, (disabled || isBusy) && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}>
      {isBusy ? <ActivityIndicator color={variant === 'primary' ? colors.onGold : colors.text} /> :
        <Text style={[styles.btnText, variant === 'primary' && { color: colors.onGold }, small && { fontSize: 13 }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.label} nativeID={'lbl-' + label}>{label}</Text>
      <TextInput placeholderTextColor="#77737b" accessibilityLabel={label} accessibilityLabelledBy={'lbl-' + label}
        {...props} style={[styles.field, props.multiline && { minHeight: 80, textAlignVertical: 'top' }, props.style]} />
    </View>
  );
}

export function Check({ label, value, onChange, testID }: { label: string; value: boolean; onChange: (v: boolean) => void; testID?: string }) {
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="checkbox" accessibilityState={{ checked: value }} accessibilityLabel={label} testID={testID} style={styles.check}>
      <View style={[styles.box, value && styles.boxOn]}>{value ? <Text style={{ color: colors.onGold, fontWeight: '900' }}>✓</Text> : null}</View>
      <Text style={[styles.p, { flex: 1, marginVertical: 0 }]}>{label}</Text>
    </Pressable>
  );
}

export function Choice<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string; note?: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ marginTop: 10, gap: 8 }}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="radio" accessibilityState={{ selected: value === o.value }}
          accessibilityLabel={o.label + (o.note ? '. ' + o.note : '')} style={[styles.method, value === o.value && styles.methodOn]}>
          <Text style={styles.methodTitle}>{o.label}</Text>
          {o.note ? <Text style={styles.muted}>{o.note}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

export function Pills<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }} accessibilityLabel={label}>
      {options.map((o) => (
        <Pressable key={o.value || 'all'} onPress={() => onChange(o.value)} accessibilityRole="button" accessibilityState={{ selected: value === o.value }} accessibilityLabel={o.label}
          style={[styles.pill, value === o.value && styles.pillOn]}>
          <Text style={[styles.pillText, value === o.value && { color: colors.gold }]}>{o.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export const Banner = ({ children, test }: { children: React.ReactNode; test?: boolean }) => (
  <View style={[styles.banner, test && styles.bannerTest]} accessibilityRole="text"><Text style={[styles.p, { marginVertical: 0 }, test && { color: '#ffe3a3' }]}>{children}</Text></View>
);

export const Tag = ({ children, tone }: { children: React.ReactNode; tone?: 'green' | 'grey' | 'red' }) => (
  <View style={[styles.tag, tone === 'green' && { borderColor: colors.green }, tone === 'red' && { borderColor: colors.red }, tone === 'grey' && { borderColor: colors.line }]}>
    <Text style={[styles.tagText, tone === 'green' && { color: colors.green }, tone === 'red' && { color: colors.red }, tone === 'grey' && { color: colors.muted }]}>{children}</Text>
  </View>
);

export function Avatar({ user, size = 40 }: { user?: { avatarUrl?: string | null; displayName?: string } | null; size?: number }) {
  const uri = media(user?.avatarUrl);
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]} accessible={false} importantForAccessibility="no-hide-descendants">
      {uri ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" /> :
        <Text style={{ color: colors.gold, fontWeight: '800', fontSize: size * 0.4 }}>{initial(user?.displayName)}</Text>}
    </View>
  );
}

export function ListItem({ title, subtitle, left, right, onPress, label, testID }: {
  title: string; subtitle?: string; left?: React.ReactNode; right?: React.ReactNode; onPress?: () => void; label?: string; testID?: string;
}) {
  const body = (
    <>
      {left}
      <View style={{ flex: 1 }}>
        <Text style={styles.liTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.muted} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right}
    </>
  );
  if (!onPress) return <View style={styles.li} accessible accessibilityLabel={label || [title, subtitle].filter(Boolean).join('. ')}>{body}</View>;
  return <Pressable style={styles.li} onPress={onPress} accessibilityRole="button" accessibilityLabel={label || [title, subtitle].filter(Boolean).join('. ')} testID={testID}>{body}</Pressable>;
}

export function Metrics({ items }: { items: [string, string][] }) {
  return (
    <View style={styles.metrics}>
      {items.map(([n, l]) => (
        <View key={l} style={styles.metric} accessible accessibilityLabel={`${n} ${l}`}>
          <Text style={styles.metricN}>{n}</Text><Text style={styles.muted}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

/** Bottom sheet modal with an accessible close button. */
export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} accessibilityViewIsModal>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.shade}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} accessibilityLabel={title}>
          <View style={styles.sheetHead}>
            <Text style={styles.h2} accessibilityRole="header">{title}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} testID="sheet-close"><Text style={{ color: colors.text, fontSize: 26 }}>×</Text></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search businesses and products…', label = 'Search marketplace' }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string }) {
  return <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#77737b" accessibilityLabel={label} style={[styles.field, { marginTop: 6 }]} autoCapitalize="none" testID="search-input" />;
}


export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.app },
  pad: { paddingHorizontal: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.app },
  pagehead: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  eyebrow: { color: colors.gold, fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  h1: { color: colors.text, fontSize: 26, fontWeight: '800', marginTop: 4 },
  h2: { color: colors.text, fontSize: 20, fontWeight: '800' },
  intro: { color: colors.muted, marginTop: 6, lineHeight: 20 },
  p: { color: colors.text, lineHeight: 21, marginVertical: 4 },
  muted: { color: colors.muted, lineHeight: 19 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 8 },
  section: { color: colors.cream, fontSize: 17, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  card: { backgroundColor: colors.pane, borderRadius: radius.md, borderWidth: 1, borderColor: '#28252b', padding: 14, marginVertical: 6 },
  btn: { minHeight: 46, borderRadius: radius.md, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  btnSmall: { minHeight: 34, paddingHorizontal: 12, borderRadius: 10 },
  primary: { backgroundColor: colors.gold },
  secondary: { backgroundColor: colors.pane2, borderWidth: 1, borderColor: colors.line },
  danger: { backgroundColor: '#3a1f24', borderWidth: 1, borderColor: colors.red },
  btnText: { color: colors.text, fontWeight: '800', fontSize: 15 },
  label: { color: colors.cream, fontWeight: '700', marginBottom: 6 },
  field: { backgroundColor: colors.pane2, borderWidth: 1, borderColor: colors.line, borderRadius: 12, color: colors.text, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, minHeight: 44 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.gold },
  method: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 14, backgroundColor: colors.pane },
  methodOn: { borderColor: colors.gold, backgroundColor: '#241d16' },
  methodTitle: { color: colors.text, fontWeight: '800', marginBottom: 2 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.pane },
  pillOn: { borderColor: colors.gold, backgroundColor: '#2b2117' },
  pillText: { color: colors.text, fontWeight: '700' },
  banner: { borderRadius: radius.md, borderWidth: 1, borderColor: '#4a3a24', backgroundColor: '#1d1813', padding: 12, marginVertical: 8 },
  bannerTest: { borderColor: colors.gold, backgroundColor: '#3a2a12' },
  tag: { borderWidth: 1, borderColor: colors.gold, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start', marginRight: 6, marginTop: 4 },
  tagText: { color: colors.gold, fontSize: 12, fontWeight: '700' },
  avatar: { backgroundColor: '#2a2219', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  li: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#221f24', minHeight: 56 },
  liTitle: { color: colors.text, fontWeight: '800' },
  metrics: { flexDirection: 'row', gap: 8, marginVertical: 8 },
  metric: { flex: 1, backgroundColor: colors.pane, borderRadius: radius.md, padding: 12, alignItems: 'center' },
  metricN: { color: colors.gold, fontSize: 20, fontWeight: '900' },
  shade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.pane, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, maxHeight: '88%' },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
});
