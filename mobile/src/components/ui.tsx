// Mäka UI kit. Every touchable carries an accessibility role and label.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView,
  StyleSheet, View, type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from './Text';
import { colors, font, radius, type } from '../lib/theme';
import { on } from '../lib/events';
import { initial } from '../core/format';
import { media } from '../lib/client';

export { Text, TextInput };
export type IconName = React.ComponentProps<typeof Ionicons>['name'];
export const Icon = ({ name, size = 22, color = colors.text, style }: { name: IconName; size?: number; color?: string; style?: any }) => (
  <Ionicons name={name} size={size} color={color} style={style} accessible={false} importantForAccessibility="no" />
);

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
        {eyebrow ? <Text style={[type.overline, { marginBottom: 6 }]}>{eyebrow}</Text> : null}
        <Text style={type.largeTitle} accessibilityRole="header">{title}</Text>
        {intro ? <Text style={[type.callout, { color: colors.muted, marginTop: 6 }]}>{intro}</Text> : null}
      </View>
      {right}
    </View>
  ) : null;
  if (!scroll) return <View style={[styles.screen, style]}>{head}{children}</View>;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={[{ paddingBottom: 48 }, style]} keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.gold} /> : undefined}>
      {head}
      <View style={styles.pad}>{children}</View>
    </ScrollView>
  );
}

/** Skeleton placeholder while content loads (or an error with retry). */
export function Loading({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  const [pulse] = useState(() => new Animated.Value(0.45));
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.9, duration: 650, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.45, duration: 650, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  if (error) {
    return (
      <View style={styles.center}>
        <Icon name="cloud-offline-outline" size={40} color={colors.faint} />
        <Text style={[type.headline, { marginTop: 12 }]}>Couldn’t load this</Text>
        <Text style={[type.callout, { color: colors.muted, textAlign: 'center', marginTop: 4, marginBottom: 16 }]}>{error}</Text>
        {onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} /> : null}
      </View>
    );
  }
  return (
    <View style={[styles.screen, { padding: 16 }]} accessibilityLabel="Loading" accessibilityRole="progressbar">
      <ActivityIndicator style={{ position: 'absolute', opacity: 0 }} />
      {[0.55, 0.9, 0.75, 0.6].map((w, i) => (
        <Animated.View key={i} style={{ opacity: pulse, marginBottom: 18 }}>
          <View style={{ height: i === 0 ? 28 : 72, width: i === 0 ? `${w * 100}%` : '100%', borderRadius: radius.md, backgroundColor: colors.pane2 }} />
        </Animated.View>
      ))}
    </View>
  );
}

export const SectionTitle = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <View style={styles.sectionRow}><Text style={type.headline} accessibilityRole="header">{children}</Text>{right}</View>
);
/** Uppercase, letter-spaced section label (e.g. EMERGING CREATORS). */
export const Overline = ({ children, right, style }: { children: React.ReactNode; right?: React.ReactNode; style?: any }) => (
  <View style={[styles.sectionRow, style]}><Text style={type.overline} accessibilityRole="header">{children}</Text>{right}</View>
);
export const P = ({ children, muted, style }: { children: React.ReactNode; muted?: boolean; style?: any }) => (
  <Text style={[type.body, { marginVertical: 4 }, muted && { color: colors.muted, ...type.callout }, style]}>{children}</Text>
);
export const Row = ({ children, style, wrap }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; wrap?: boolean }) => (
  <View style={[styles.row, wrap && { flexWrap: 'wrap' }, style]}>{children}</View>
);
export const Card = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[styles.card, style]}>{children}</View>;
export const Empty = ({ children, icon = 'sparkles-outline' }: { children: React.ReactNode; icon?: IconName }) => (
  <View style={styles.empty}>
    <Icon name={icon} size={22} color={colors.faint} />
    <Text style={[type.callout, { color: colors.muted, flex: 1 }]}>{children}</Text>
  </View>
);

// ---------- controls ----------
export function Button({ title, onPress, variant = 'primary', disabled, small, block, label, testID, busy: busyProp, icon }: {
  title: string; onPress?: () => unknown; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; disabled?: boolean; small?: boolean; block?: boolean;
  label?: string; testID?: string; busy?: boolean; icon?: IconName;
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
  const fg = variant === 'primary' ? colors.onGold : variant === 'danger' ? colors.red : variant === 'ghost' ? colors.gold : colors.text;
  return (
    <Pressable onPress={press} disabled={disabled || isBusy} accessibilityRole="button" accessibilityLabel={label || title}
      accessibilityState={{ disabled: !!(disabled || isBusy), busy: isBusy }} testID={testID}
      style={({ pressed }) => [styles.btn, styles[variant], small && styles.btnSmall, block && { alignSelf: 'stretch', marginTop: 14 },
        (disabled || isBusy) && { opacity: 0.45 }, pressed && { opacity: 0.75, transform: [{ scale: 0.985 }] }]}>
      {isBusy ? <ActivityIndicator color={fg} /> : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={small ? 16 : 18} color={fg} /> : null}
          <Text style={[small ? styles.btnTextSmall : styles.btnText, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={styles.label} nativeID={'lbl-' + label}>{label}</Text>
      <TextInput placeholderTextColor={colors.faint} accessibilityLabel={label} accessibilityLabelledBy={'lbl-' + label}
        {...props}
        onFocus={(e) => { setFocused(true); props.onFocus?.(e); }} onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
        style={[styles.field, focused && styles.fieldFocus, props.multiline && { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }, props.style]} />
    </View>
  );
}

export function Check({ label, value, onChange, testID }: { label: string; value: boolean; onChange: (v: boolean) => void; testID?: string }) {
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="checkbox" accessibilityState={{ checked: value }} accessibilityLabel={label} testID={testID} style={styles.check}>
      <View style={[styles.box, value && styles.boxOn]}>{value ? <Icon name="checkmark" size={16} color={colors.onGold} /> : null}</View>
      <Text style={[type.callout, { flex: 1 }]}>{label}</Text>
    </Pressable>
  );
}

/** Single-choice list (radio rows), iOS settings style. */
export function Choice<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string; note?: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.group}>
      {options.map((o, i) => {
        const on = value === o.value;
        return (
          <Pressable key={o.value || 'none'} onPress={() => onChange(o.value)} accessibilityRole="radio" accessibilityState={{ selected: on }}
            accessibilityLabel={o.label + (o.note ? '. ' + o.note : '')}
            style={({ pressed }) => [styles.option, i > 0 && styles.optionDivider, pressed && { backgroundColor: colors.pane3 }]}>
            <View style={{ flex: 1 }}>
              <Text style={type.bodyStrong}>{o.label}</Text>
              {o.note ? <Text style={[type.callout, { color: colors.muted, marginTop: 2 }]}>{o.note}</Text> : null}
            </View>
            <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Horizontal filter chips. */
export function Pills<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 10 }} accessibilityLabel={label}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <Pressable key={o.value || 'all'} onPress={() => onChange(o.value)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={o.label}
            style={[styles.pill, on && styles.pillOn]}>
            <Text style={[styles.pillText, on && { color: colors.onGold }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Compact notice with an icon. `test` marks test-mode notices in gold. */
export const Banner = ({ children, test, icon }: { children: React.ReactNode; test?: boolean; icon?: IconName }) => (
  <View style={[styles.banner, test && styles.bannerTest]} accessibilityRole="text">
    <Icon name={icon || (test ? 'flask-outline' : 'information-circle-outline')} size={20} color={test ? colors.gold : colors.muted} />
    <Text style={[type.callout, { flex: 1, color: test ? colors.cream : colors.text }]}>{children}</Text>
  </View>
);

export const Tag = ({ children, tone }: { children: React.ReactNode; tone?: 'green' | 'grey' | 'red' }) => (
  <View style={[styles.tag, tone === 'green' && { backgroundColor: 'rgba(127,220,174,0.12)' }, tone === 'red' && { backgroundColor: 'rgba(255,107,125,0.12)' }, tone === 'grey' && { backgroundColor: colors.pane2 }]}>
    <Text style={[styles.tagText, tone === 'green' && { color: colors.green }, tone === 'red' && { color: colors.red }, tone === 'grey' && { color: colors.muted }]}>{children}</Text>
  </View>
);

export function Avatar({ user, size = 40, ring }: { user?: { avatarUrl?: string | null; displayName?: string } | null; size?: number; ring?: boolean }) {
  const uri = media(user?.avatarUrl);
  const inner = (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]} accessible={false} importantForAccessibility="no-hide-descendants">
      {uri ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" transition={150} /> :
        <Text style={{ color: colors.gold, fontFamily: font.semibold, fontSize: size * 0.4 }}>{initial(user?.displayName)}</Text>}
    </View>
  );
  if (!ring) return inner;
  return <View style={{ padding: 2, borderRadius: size, borderWidth: 2, borderColor: colors.gold }}>{inner}</View>;
}

export function ListItem({ title, subtitle, left, right, onPress, label, testID }: {
  title: string; subtitle?: string; left?: React.ReactNode; right?: React.ReactNode; onPress?: () => void; label?: string; testID?: string;
}) {
  const body = (
    <>
      {left}
      <View style={{ flex: 1 }}>
        <Text style={type.bodyStrong} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[type.callout, { color: colors.muted, marginTop: 1 }]} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-forward" size={18} color={colors.faint} /> : null)}
    </>
  );
  const a11y = label || [title, subtitle].filter(Boolean).join('. ');
  if (!onPress) return <View style={styles.li} accessible accessibilityLabel={a11y}>{body}</View>;
  return <Pressable style={({ pressed }) => [styles.li, pressed && { opacity: 0.7 }]} onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} testID={testID}>{body}</Pressable>;
}

/** Profile-style stats row. */
export function Metrics({ items }: { items: [string, string][] }) {
  return (
    <View style={styles.metrics}>
      {items.map(([n, l], i) => (
        <View key={l} style={[styles.metric, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.lineStrong }]} accessible accessibilityLabel={`${n} ${l}`}>
          <Text style={styles.metricN}>{n}</Text><Text style={[type.caption, { color: colors.muted, marginTop: 2 }]}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

/** Bottom sheet with a grabber and an accessible close button. */
export function Sheet({ visible, title, onClose, children, footer }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} accessibilityViewIsModal>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.shade}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} accessibilityLabel={title}>
          <View style={styles.grabber} />
          <View style={styles.sheetHead}>
            <Text style={[type.headline, { flex: 1 }]} accessibilityRole="header" numberOfLines={1}>{title}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} testID="sheet-close" style={styles.closeBtn}>
              <Icon name="close" size={20} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{children}</ScrollView>
          {footer ? <View style={styles.sheetFooter}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search businesses and products', label = 'Search marketplace', testID = 'search-input' }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string; testID?: string }) {
  return (
    <View style={styles.search}>
      <Icon name="search" size={18} color={colors.faint} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.faint} accessibilityLabel={label}
        style={[type.body, { flex: 1, paddingVertical: 10, color: colors.text }]} autoCapitalize="none" autoCorrect={false} testID={testID} />
      {value ? <Pressable onPress={() => onChange('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}><Icon name="close-circle" size={18} color={colors.faint} /></Pressable> : null}
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.app },
  pad: { paddingHorizontal: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: colors.app },
  pagehead: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 8, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 30, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  card: { backgroundColor: colors.pane, borderRadius: radius.lg, padding: 18, marginVertical: 6, borderWidth: 1, borderColor: colors.line },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  btn: { minHeight: 48, borderRadius: radius.md, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  btnSmall: { minHeight: 36, paddingHorizontal: 14, borderRadius: 10 },
  primary: { backgroundColor: colors.gold },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.lineStrong },
  danger: { backgroundColor: 'rgba(239,125,107,0.12)' },
  ghost: { backgroundColor: 'transparent', paddingHorizontal: 8 },
  btnText: { fontFamily: font.medium, fontSize: 16 },
  btnTextSmall: { fontFamily: font.semibold, fontSize: 13 },
  label: { ...type.caption, color: colors.muted, marginBottom: 6 },
  field: { ...type.body, backgroundColor: colors.pane2, borderRadius: radius.md, color: colors.text, paddingHorizontal: 14, minHeight: 48, borderWidth: 1, borderColor: 'transparent' },
  fieldFocus: { borderColor: colors.gold },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, minHeight: 44 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pane2 },
  boxOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  group: { marginTop: 10, backgroundColor: colors.pane, borderRadius: radius.lg, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, minHeight: 52 },
  optionDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineStrong },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.gold },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.gold },
  pill: { paddingHorizontal: 16, height: 40, justifyContent: 'center', borderRadius: radius.pill },
  pillOn: { backgroundColor: colors.gold },
  pillText: { fontFamily: font.medium, fontSize: 15, color: colors.muted },
  banner: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderRadius: radius.md, backgroundColor: colors.pane, padding: 12, marginVertical: 8 },
  bannerTest: { backgroundColor: 'rgba(246,198,111,0.10)', borderWidth: 1, borderColor: 'rgba(246,198,111,0.35)' },
  tag: { backgroundColor: colors.goldSoft, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start', marginRight: 6, marginTop: 6 },
  tagText: { fontFamily: font.semibold, fontSize: 11, color: colors.gold },
  avatar: { backgroundColor: colors.pane3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  li: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 60, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  metrics: { flexDirection: 'row', marginVertical: 14 },
  metric: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  metricN: { fontFamily: font.bold, fontSize: 19, color: colors.text, letterSpacing: -0.3 },
  shade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.pane, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 8, maxHeight: '90%' },
  sheetFooter: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, marginHorizontal: -16, paddingHorizontal: 12, paddingTop: 10 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: colors.lineStrong, marginBottom: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, minHeight: 40 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.pane2, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.pane2, borderRadius: radius.md, paddingHorizontal: 12, marginTop: 8 },
  // legacy aliases used by some screens
  muted: { ...type.callout, color: colors.muted },
  liTitle: { ...type.bodyStrong },
  p: { ...type.body },
  h2: { ...type.title },
});
