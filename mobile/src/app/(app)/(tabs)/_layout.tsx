import React from 'react';
import { StyleSheet, View, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../../../components/ui';
import { Hex } from '../../../components/hex';
import { colors, font } from '../../../lib/theme';

function tabIcon(outline: IconName, filled: IconName) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return (
      <View style={{ alignItems: 'center' }}>
        <View style={{ height: 8, justifyContent: 'center' }}>{focused ? <Hex size={8} fill={colors.gold} /> : null}</View>
        <Icon name={focused ? filled : outline} size={21} color={String(color)} />
      </View>
    );
  };
}

function CreateIcon({ focused }: { focused: boolean }) {
  return (
    <View style={s.createWrap}>
      <Hex size={58} fill={focused ? colors.gold2 : colors.gold}><Icon name="add" size={30} color={colors.onGold} /></Hex>
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, height: 70 + insets.bottom, paddingTop: 4, paddingBottom: Math.max(insets.bottom, 10) },
      tabBarActiveTintColor: colors.gold, tabBarInactiveTintColor: colors.muted,
      tabBarLabelStyle: { fontFamily: font.medium, fontSize: 12, letterSpacing: 0.4, marginTop: 2 },
      sceneStyle: { backgroundColor: colors.app },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('home-outline', 'home'), tabBarAccessibilityLabel: 'Home feed' }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover', tabBarIcon: tabIcon('compass-outline', 'compass'), tabBarAccessibilityLabel: 'Discover' }} />
      <Tabs.Screen name="create" options={{ title: 'Create', tabBarIcon: CreateIcon, tabBarAccessibilityLabel: 'Create a post' }} />
      <Tabs.Screen name="cinema" options={{ title: 'Cinema', tabBarIcon: tabIcon('film-outline', 'film'), tabBarAccessibilityLabel: 'Cinema' }} />
      <Tabs.Screen name="market" options={{ title: 'Market', tabBarIcon: tabIcon('storefront-outline', 'storefront'), tabBarAccessibilityLabel: 'Market' }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  createWrap: { marginTop: -22 },
});
