import React from 'react';
import { Stack } from 'expo-router';
import { colors, font } from '../../lib/theme';

export default function AppLayout() {
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text, headerShadowVisible: false,
      headerTitleStyle: { fontFamily: font.semibold, fontSize: 17 }, headerBackButtonDisplayMode: 'minimal',
      contentStyle: { backgroundColor: colors.app },
    }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="p/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="u/[handle]" options={{ title: '', headerTransparent: true }} />
      <Stack.Screen name="profile" options={{ title: '', headerTransparent: true }} />
      <Stack.Screen name="search" options={{ title: 'Search' }} />
      <Stack.Screen name="inbox/index" options={{ title: '' }} />
      <Stack.Screen name="inbox/[id]" options={{ title: 'Conversation' }} />
      <Stack.Screen name="market/[id]" options={{ title: '' }} />
      <Stack.Screen name="studio" options={{ title: '' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings & safety' }} />
      <Stack.Screen name="admin" options={{ title: '' }} />
      <Stack.Screen name="collabs" options={{ title: '' }} />
      <Stack.Screen name="live/index" options={{ title: '' }} />
      <Stack.Screen name="live/[id]" options={{ title: '' }} />
    </Stack>
  );
}
