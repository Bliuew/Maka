import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Banner, Button, Field, Icon, P, Screen, Text } from '../../../components/ui';
import { Hex } from '../../../components/hex';
import { api } from '../../../lib/client';
import { useToast } from '../../../lib/toast';
import { colors, type } from '../../../lib/theme';

// Go live. The video runs through a streaming service; until one is connected the
// server refuses and this screen says so plainly.
export default function GoLive() {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState<{ id: string; ingestUrl?: string; streamKey?: string } | null>(null);
  const go = async () => {
    setNotice(null);
    try { setReady(await api.post('/api/live', { title })); }
    catch (e: any) {
      if (e.code === 'live_not_configured' || e.code === 'live_adapter_missing') setNotice(e.message);
      else toast.error(e);
    }
  };
  return (
    <Screen eyebrow="Live" title="Go live">
      <View style={{ alignItems: 'center', marginVertical: 18 }}>
        <Hex size={96} fill={colors.pane2}><Icon name="radio-outline" size={40} color={colors.gold} /></Hex>
      </View>
      <Field label="Title" value={title} onChangeText={setTitle} maxLength={100} placeholder="What’s your live about?" testID="live-title" />
      <P muted>Lives are for verified adults, follow the Community Guidelines, and can be reported like any post.</P>
      {notice ? <Banner icon="radio-outline">{notice}</Banner> : null}
      {ready ? (
        <Banner icon="checkmark-circle-outline">Your stream is ready. Connect your broadcast app with the details below.{ready.ingestUrl ? `\nServer: ${ready.ingestUrl}` : ''}</Banner>
      ) : null}
      <Button title="Go live" icon="radio-outline" block disabled={!title.trim()} onPress={go} testID="go-live" />
      <Button title="Back to Create" variant="secondary" block onPress={() => router.back()} />
      <Text style={[type.caption, { color: colors.faint, marginTop: 14 }]}>Video for Live is delivered by a streaming service connected on the server.</Text>
    </Screen>
  );
}
