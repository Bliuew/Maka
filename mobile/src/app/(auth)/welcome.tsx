import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Field, Text } from '../../components/ui';
import { HoneyCell } from '../../components/hex';
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
        <HoneyCell size={118} fill={0.72} style={{ alignSelf: 'center', marginTop: 28 }} />
        <Text style={s.title} accessibilityRole="header">Your hive starts here</Text>
        <Text style={s.sub}>Watch free licensed films, share your work, and find brands that want you, whatever your follower count.</Text>
        {showServer ? (
          <View style={{ marginTop: 8 }}>
            <Field label="Server address" value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://staging.example.com" />
            <Button title="Use this server" small variant="secondary" block onPress={() => { setServerUrl(server || null); toast.show('Server set to ' + serverUrl()); }} />
          </View>
        ) : null}
      </ScrollView>
      <View style={s.ctas}>
        <Button title="Create account" block onPress={() => router.push('/signup')} />
        <Button title="Log in" variant="secondary" block onPress={() => router.push('/signin')} />
        <Text style={s.legal}>Adults 19 and above only.</Text>
        <Pressable onPress={() => setShowServer(!showServer)} accessibilityRole="button" accessibilityLabel={showServer ? 'Hide server settings' : 'Server settings (test builds)'} hitSlop={8}>
          <Text style={s.server}>{showServer ? 'Hide server settings' : 'Server settings'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingTop: 16, paddingBottom: 8 },
  logoCard: { alignSelf: 'center', width: '56%', backgroundColor: colors.cream, borderRadius: 24, padding: 12 },
  logo: { width: '100%', aspectRatio: 512 / 341 },
  title: { ...type.largeTitle, fontSize: 32, lineHeight: 38, textAlign: 'center', marginTop: 26 },
  sub: { ...type.body, color: colors.muted, textAlign: 'center', marginTop: 12, lineHeight: 25 },
  ctas: { paddingHorizontal: 28, paddingTop: 8 },
  legal: { ...type.caption, fontFamily: font.regular, color: colors.muted, textAlign: 'center', marginTop: 16 },
  server: { ...type.caption, color: colors.faint, textAlign: 'center', marginTop: 10, textDecorationLine: 'underline' },
});
