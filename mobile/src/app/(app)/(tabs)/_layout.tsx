import React from 'react';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../../components/Text';
import { Icon, type IconName } from '../../../components/ui';
import { colors, font } from '../../../lib/theme';
import { useSession } from '../../../lib/session';

function tabIcon(outline: IconName, filled: IconName) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Icon name={focused ? filled : outline} size={25} color={String(color)} />;
  };
}

function CreateIcon({ focused }: { focused: boolean }) {
  return (
    <View style={[s.create, focused && { backgroundColor: colors.gold2 }]}>
      <Icon name="add" size={26} color={colors.onGold} />
    </View>
  );
}

function HeaderButton({ icon, label, onPress, badge, testID }: { icon: IconName; label: string; onPress: () => void; badge?: number; testID?: string }) {
  return (
    <Pressable style={({ pressed }) => [s.ib, pressed && { opacity: 0.6 }]} onPress={onPress} accessibilityRole="button" accessibilityLabel={badge ? `${label}, ${badge} unread` : label} testID={testID}>
      <Icon name={icon} size={24} />
      {badge ? <View style={s.badge}><Text style={s.badgeText}>{badge > 9 ? '9+' : badge}</Text></View> : null}
    </Pressable>
  );
}

function Header() {
  const router = useRouter();
  const { unread, me } = useSession();
  return (
    <View style={s.top}>
      <Pressable style={s.brand} onPress={() => router.navigate('/')} accessibilityRole="button" accessibilityLabel="Mäka home">
        <Image source={require('../../../../assets/icon.png')} style={s.mark} accessible={false} />
        <Text style={s.brandText}>Mäka</Text>
      </Pressable>
      <View style={s.tools}>
        <HeaderButton icon="search-outline" label="Search" onPress={() => router.push('/search')} />
        <HeaderButton icon="paper-plane-outline" label="Inbox" onPress={() => router.push('/inbox')} badge={unread} testID="open-inbox" />
        {me?.role === 'admin' ? <HeaderButton icon="shield-checkmark-outline" label="Trust and Safety" onPress={() => router.push('/admin')} /> : null}
        <HeaderButton icon="person-circle-outline" label="Your profile" onPress={() => router.push('/profile')} testID="open-profile" />
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs screenOptions={{
      header: () => <Header />,
      tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, height: 64 + insets.bottom, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 10) },
      tabBarActiveTintColor: colors.text, tabBarInactiveTintColor: colors.faint,
      tabBarLabelStyle: { fontFamily: font.medium, fontSize: 10, letterSpacing: 0.1 },
      sceneStyle: { backgroundColor: colors.app },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', headerShown: false, tabBarIcon: tabIcon('home-outline', 'home'), tabBarAccessibilityLabel: 'Home feed' }} />
      <Tabs.Screen name="cinema" options={{ title: 'Cinema', tabBarIcon: tabIcon('film-outline', 'film'), tabBarAccessibilityLabel: 'Cinema' }} />
      <Tabs.Screen name="create" options={{ title: '', tabBarIcon: CreateIcon, tabBarAccessibilityLabel: 'Create a post' }} />
      <Tabs.Screen name="collabs" options={{ title: 'Collabs', tabBarIcon: tabIcon('briefcase-outline', 'briefcase'), tabBarAccessibilityLabel: 'Collaborations' }} />
      <Tabs.Screen name="market" options={{ title: 'Market', tabBarIcon: tabIcon('bag-handle-outline', 'bag-handle'), tabBarAccessibilityLabel: 'Market' }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  top: { height: 52, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bg },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  mark: { width: 30, height: 30, borderRadius: 7 },
  brandText: { color: colors.text, fontSize: 25, fontFamily: 'serif', fontWeight: '700', letterSpacing: -0.5 },
  tools: { flexDirection: 'row', gap: 2 },
  ib: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 6, right: 4, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: colors.like, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: colors.bg },
  badgeText: { color: '#fff', fontSize: 9, fontFamily: font.bold },
  create: { width: 46, height: 32, borderRadius: 10, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
});
