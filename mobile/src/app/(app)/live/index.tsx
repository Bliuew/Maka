import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Banner, Button, Card, Field, Icon, P, Row, Screen, Tag, Text } from '../../../components/ui';
import { Hex } from '../../../components/hex';
import { api } from '../../../lib/client';
import { useToast } from '../../../lib/toast';
import { colors, font, type } from '../../../lib/theme';

type Ready = { id: string; ingestUrl: string; streamKey: string };

// Go live. Hosts broadcast from a streaming app (Larix Broadcaster, Streamlabs or OBS)
// using the server address and private key shown here. Until a streaming service is
// connected on the server, Mäka says so plainly.
export default function GoLive() {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const [status, setStatus] = useState<'created' | 'live' | 'ended'>('created');

  useEffect(() => {
    if (!ready || status !== 'created') return;
    const t = setInterval(async () => {
      try { const l = await api.get(`/api/live/${ready.id}`); setStatus(l.status); } catch { /* keep waiting */ }
    }, 4000);
    return () => clearInterval(t);
  }, [ready, status]);

  const go = async () => {
    setNotice(null);
    try { setReady(await api.post('/api/live', { title })); setStatus('created'); }
    catch (e: any) {
      if (e.code === 'live_not_configured' || e.code === 'live_adapter_missing') setNotice(e.message);
      else toast.error(e);
    }
  };
  const end = async () => {
    try { await api.post(`/api/live/${ready!.id}/end`); setStatus('ended'); } catch (e) { toast.error(e); }
  };
  const copy = async (label: string, value: string) => { await Clipboard.setStringAsync(value); toast.show(`${label} copied`); };

  if (ready) {
    return (
      <Screen eyebrow="Live" title={title}>
        <Row style={{ marginBottom: 12 }}>
          {status === 'live' ? <Tag tone="green">You’re live</Tag> : status === 'ended' ? <Tag tone="grey">Ended</Tag> : <Tag tone="grey">Waiting for your broadcast</Tag>}
        </Row>
        {status === 'created' ? (
          <>
            <P muted>Open a streaming app such as Larix Broadcaster, Streamlabs or OBS, add a custom RTMP server with these details, and start broadcasting. Mäka puts you live as soon as the video arrives.</P>
            <Card>
              <Text style={[type.caption, { color: colors.muted }]}>Server</Text>
              <Text style={{ color: colors.text, fontFamily: font.medium, marginVertical: 4 }} selectable>{ready.ingestUrl}</Text>
              <Button title="Copy server" small variant="secondary" icon="copy-outline" onPress={() => copy('Server', ready.ingestUrl)} />
              <Text style={[type.caption, { color: colors.muted, marginTop: 14 }]}>Stream key (keep it private)</Text>
              <Text style={{ color: colors.text, fontFamily: font.medium, marginVertical: 4 }}>{'•'.repeat(12)}{ready.streamKey.slice(-4)}</Text>
              <Button title="Copy stream key" small variant="secondary" icon="key-outline" onPress={() => copy('Stream key', ready.streamKey)} testID="copy-key" />
            </Card>
          </>
        ) : null}
        {status === 'live' ? <P muted>Your live is showing on Discover. Stop broadcasting in your streaming app or tap End live.</P> : null}
        {status === 'ended' ? <P muted>Your live has ended and its stream key no longer works.</P> : null}
        {status !== 'ended'
          ? <Button title={status === 'live' ? 'End live' : 'Cancel'} variant="danger" block onPress={end} testID="end-live" />
          : <Button title="Done" block onPress={() => router.back()} />}
      </Screen>
    );
  }

  return (
    <Screen eyebrow="Live" title="Go live">
      <View style={{ alignItems: 'center', marginVertical: 18 }}>
        <Hex size={96} fill={colors.pane2}><Icon name="radio-outline" size={40} color={colors.gold} /></Hex>
      </View>
      <Field label="Title" value={title} onChangeText={setTitle} maxLength={100} placeholder="What’s your live about?" testID="live-title" />
      <P muted>Lives are for verified adults, follow the Community Guidelines, and can be reported like any post.</P>
      {notice ? <Banner icon="radio-outline">{notice}</Banner> : null}
      <Button title="Go live" icon="radio-outline" block disabled={!title.trim()} onPress={go} testID="go-live" />
      <Button title="Back to Create" variant="secondary" block onPress={() => router.back()} />
    </Screen>
  );
}
