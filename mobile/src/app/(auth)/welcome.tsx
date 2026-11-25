import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Button, Field, P, Screen } from '../../components/ui';
import { BRAND, TAGLINE, colors } from '../../lib/theme';
import { serverUrl, setServerUrl } from '../../lib/client';
import { useToast } from '../../lib/toast';

export default function Welcome() {
  const router = useRouter();
  const toast = useToast();
  const [showServer, setShowServer] = useState(false);
  const [server, setServer] = useState(serverUrl());
  return (
    <Screen>
      <View style={s.logoCard}>
        {/* Founder-approved artwork, used unchanged. */}
        <Image source={require('../../../assets/brand/approved-logo.webp')} style={s.logo} contentFit="contain" accessibilityLabel={`${BRAND} — ${TAGLINE}`} testID="approved-logo" />
      </View>
      <P style={{ textAlign: 'center' }}>A respectful community for creators, film lovers and businesses. <Text style={{ fontWeight: '800' }}>Strictly 19+.</Text></P>
      <View style={{ gap: 10, marginTop: 18 }}>
        <Button title="Create account" block onPress={() => router.push('/signup')} />
        <Button title="Sign in" variant="secondary" block onPress={() => router.push('/signin')} />
      </View>
      <P muted style={{ textAlign: 'center', marginTop: 18 }}>You’ll confirm you are 19 or older with a privacy-first verification method before you can use {BRAND}.</P>
      <View style={{ marginTop: 28 }}>
        <Button title={showServer ? 'Hide server settings' : 'Server settings (test builds)'} small variant="secondary" onPress={() => setShowServer(!showServer)} />
        {showServer ? (
          <>
            <Field label="Server address" value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://staging.example.com" />
            <View style={{ marginTop: 8 }}><Button title="Use this server" small onPress={() => { setServerUrl(server || null); toast.show('Server set to ' + serverUrl()); }} /></View>
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  logoCard: { backgroundColor: colors.cream, borderRadius: 22, marginTop: 24, marginBottom: 18, padding: 8, alignItems: 'center' },
  logo: { width: '100%', aspectRatio: 512 / 341 },
});
