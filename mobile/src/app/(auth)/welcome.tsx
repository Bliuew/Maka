import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Field, Text } from '../../components/ui';
import { BRAND, TAGLINE, colors, font, type } from '../../lib/theme';
import { serverUrl, setServerUrl } from '../../lib/client';
import { useToast } from '../../lib/toast';

export default function Welcome() {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [showServer, setShowServer] = useState(false);
  const [server, setServer] = useState(serverUrl());
  return (
    <View style={[s.wrap, { paddingBottom: insets.bottom + 16 }]}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={s.logoCard}>
          {/* Founder-approved wordmark, used unchanged. */}
          <Image source={require('../../../assets/brand/approved-logo.webp')} style={s.logo} contentFit="contain" accessibilityLabel={`${BRAND}. ${TAGLINE}`} testID="approved-logo" />
        </View>
        {showServer ? (
          <View style={{ marginTop: 8 }}>
            <Field label="Server address" value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://staging.example.com" />
            <Button title="Use this server" small variant="secondary" block onPress={() => { setServerUrl(server || null); toast.show('Server set to ' + serverUrl()); }} />
          </View>
        ) : null}
      </ScrollView>
      <View style={s.ctas}>
        <Button title="Create account" block onPress={() => router.push('/signup')} />
        <Button title="Sign in" variant="secondary" block onPress={() => router.push('/signin')} />
        <Text style={s.legal}>
          <Text style={{ fontFamily: font.semibold, color: colors.text }}>Strictly 19+.</Text> You’ll verify your age before you start.
        </Text>
        <Pressable onPress={() => setShowServer(!showServer)} accessibilityRole="button" accessibilityLabel={showServer ? 'Hide server settings' : 'Server settings (test builds)'} hitSlop={8}>
          <Text style={s.server}>{showServer ? 'Hide server settings' : 'Server settings'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingTop: 28 },
  logoCard: { backgroundColor: colors.cream, borderRadius: 24, padding: 6, overflow: 'hidden' },
  logo: { width: '100%', aspectRatio: 512 / 341 },
  ctas: { paddingHorizontal: 20, paddingTop: 8 },
  legal: { ...type.caption, color: colors.muted, textAlign: 'center', marginTop: 14, lineHeight: 17 },
  server: { ...type.caption, color: colors.faint, textAlign: 'center', marginTop: 10, textDecorationLine: 'underline' },
});
