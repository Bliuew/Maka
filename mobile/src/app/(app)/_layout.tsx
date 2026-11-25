import React from 'react';
import { Stack } from 'expo-router';
import { colors } from '../../lib/theme';

export default function AppLayout() {
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: '#0c0c0f' }, headerTintColor: colors.cream, headerTitleStyle: { fontWeight: '800' },
      contentStyle: { backgroundColor: colors.app },
    }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="p/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="u/[handle]" options={{ title: 'Profile' }} />
      <Stack.Screen name="profile" options={{ title: 'Your profile' }} />
      <Stack.Screen name="search" options={{ title: 'Search' }} />
      <Stack.Screen name="inbox/index" options={{ title: 'Inbox' }} />
      <Stack.Screen name="inbox/[id]" options={{ title: 'Conversation' }} />
      <Stack.Screen name="market/[id]" options={{ title: 'Storefront' }} />
      <Stack.Screen name="studio" options={{ title: 'Creator Studio' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings & safety' }} />
      <Stack.Screen name="admin" options={{ title: 'Trust & Safety' }} />
    </Stack>
  );
}
