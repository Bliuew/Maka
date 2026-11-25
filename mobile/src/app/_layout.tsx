import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold } from '@expo-google-fonts/figtree';
import { BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '../lib/session';
import { ToastProvider } from '../lib/toast';
import { OfflineBanner } from '../lib/net';
import { AREA_GROUPS, homeFor } from '../core/gate';
import { colors } from '../lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

/** Strict 19+: keep each person inside the area their account allows. */
function Gate() {
  const { ready: sessionReady, area } = useSession();
  // Hold the splash until Figtree, Bricolage Grotesque and the icon font are ready (or failed), so text never flashes in a fallback font.
  const [fontsLoaded, fontError] = useFonts({ Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold, ...Ionicons.font });
  const ready = sessionReady && (fontsLoaded || !!fontError);
  const segments = useSegments();
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    SplashScreen.hideAsync().catch(() => {});
    const group = segments[0] as string | undefined;
    if (!group || !AREA_GROUPS[area].includes(group)) router.replace(homeFor(area) as any);
  }, [ready, area, segments, router]);
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.app }, animation: 'fade' }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(age)" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        <ToastProvider>
          <SessionProvider>
            <OfflineBanner />
            <Gate />
          </SessionProvider>
        </ToastProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
