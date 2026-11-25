import React from 'react';
import { Pressable, StyleSheet, Text, View, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { colors } from '../../../lib/theme';
import { useSession } from '../../../lib/session';

function icon(glyph: string) {
  return function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ color, fontSize: 20 }} accessible={false}>{glyph}</Text>;
  };
}

function Header() {
  const router = useRouter();
  const { unread, me } = useSession();
  return (
    <View style={s.top}>
      <Pressable style={s.brand} onPress={() => router.navigate('/')} accessibilityRole="button" accessibilityLabel="Mäka home">
        <Image source={require('../../../../assets/icon.png')} style={s.bee} accessible={false} />
        <Text style={s.brandText}>Mäka</Text>
      </Pressable>
      <View style={s.tools}>
        <Pressable style={s.ib} onPress={() => router.push('/search')} accessibilityRole="button" accessibilityLabel="Search"><Text style={s.ibText}>⌕</Text></Pressable>
        <Pressable style={s.ib} onPress={() => router.push('/inbox')} accessibilityRole="button" accessibilityLabel={unread ? `Inbox, ${unread} unread` : 'Inbox'} testID="open-inbox">
          <Text style={s.ibText}>✉</Text>
          {unread ? <View style={s.dot}><Text style={s.dotText}>{unread > 9 ? '9+' : unread}</Text></View> : null}
        </Pressable>
        {me?.role === 'admin' ? <Pressable style={s.ib} onPress={() => router.push('/admin')} accessibilityRole="button" accessibilityLabel="Trust and Safety"><Text style={s.ibText}>⚖</Text></Pressable> : null}
        <Pressable style={s.ib} onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel="Your profile" testID="open-profile"><Text style={s.ibText}>◉</Text></Pressable>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      header: () => <Header />,
      tabBarStyle: { backgroundColor: '#0c0c0f', borderTopColor: '#252125', height: 64, paddingBottom: 8 },
      tabBarActiveTintColor: colors.gold, tabBarInactiveTintColor: '#cfcacb',
      tabBarLabelStyle: { fontWeight: '700' },
      sceneStyle: { backgroundColor: colors.app },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('⌂'), tabBarAccessibilityLabel: 'Home feed' }} />
      <Tabs.Screen name="cinema" options={{ title: 'Cinema', tabBarIcon: icon('▣'), tabBarAccessibilityLabel: 'Cinema' }} />
      <Tabs.Screen name="create" options={{ title: 'Create', tabBarIcon: icon('✚'), tabBarAccessibilityLabel: 'Create a post' }} />
      <Tabs.Screen name="collabs" options={{ title: 'Collabs', tabBarIcon: icon('♡'), tabBarAccessibilityLabel: 'Collaborations' }} />
      <Tabs.Screen name="market" options={{ title: 'Market', tabBarIcon: icon('▤'), tabBarAccessibilityLabel: 'Market' }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  top: { height: 56, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0c0c0f', borderBottomWidth: 1, borderBottomColor: '#252125' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  bee: { width: 32, height: 32, borderRadius: 8 },
  brandText: { color: colors.text, fontSize: 24, fontWeight: '700', fontFamily: 'serif' },
  tools: { flexDirection: 'row', gap: 4 },
  ib: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  ibText: { color: '#f9f1df', fontSize: 22 },
  dot: { position: 'absolute', top: 4, right: 2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  dotText: { color: colors.onGold, fontSize: 10, fontWeight: '900' },
});
