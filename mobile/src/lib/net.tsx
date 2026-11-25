import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { colors } from './theme';
import { emit } from './events';

/** True when the device reports a network connection. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => NetInfo.addEventListener((s) => setOnline(s.isConnected !== false)), []);
  return online;
}

/** Banner shown while offline; emits 'net:back' when the connection returns so screens can refetch. */
export function OfflineBanner() {
  const online = useOnline();
  const was = useRef(true);
  useEffect(() => { if (online && !was.current) emit('net:back'); was.current = online; }, [online]);
  if (online) return null;
  return (
    <View style={styles.bar} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={styles.text}>You’re offline. We’ll reconnect automatically.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: '#3a1f24', paddingVertical: 6, paddingHorizontal: 12 },
  text: { color: colors.red, textAlign: 'center', fontWeight: '700', fontSize: 13 },
});
