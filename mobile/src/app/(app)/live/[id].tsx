import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Button, Loading, P, Screen, Text, useLoad } from '../../../components/ui';
import { HexAvatar } from '../../../components/hex';
import { ReportSheet } from '../../../components/post';
import { api, media } from '../../../lib/client';
import { useSession } from '../../../lib/session';
import { useToast } from '../../../lib/toast';
import { colors, type } from '../../../lib/theme';

function LivePlayer({ url }: { url: string }) {
  const player = useVideoPlayer({ uri: url }, (p) => p.play());
  return <VideoView player={player} style={{ width: '100%', aspectRatio: 9 / 16, backgroundColor: '#000', borderRadius: 14 }} contentFit="cover" nativeControls={false} />;
}

export default function WatchLive() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { me } = useSession();
  const [report, setReport] = useState(false);
  const { data, error, reload } = useLoad(async () => (await api.get('/api/live')).streams.find((x: any) => x.id === id) || null, [id]);
  if (data === null && !error) return <Loading />;
  if (!data) return <Screen title="Live"><P muted>This live has ended.</P></Screen>;
  const host = data.host;
  return (
    <Screen>
      {data.playbackUrl ? <LivePlayer url={media(data.playbackUrl)!} /> : <P muted>Connecting…</P>}
      <View style={s.row}>
        <HexAvatar user={host} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={type.headline}>{data.title}</Text>
          <Text style={{ color: colors.muted }}>@{host.handle} · live</Text>
        </View>
      </View>
      {host.id === me?.id || me?.role === 'admin'
        ? <Button title="End live" variant="danger" block onPress={async () => { try { await api.post(`/api/live/${id}/end`); router.back(); } catch (e) { toast.error(e); } }} />
        : <Button title="Report live" icon="flag-outline" variant="secondary" block onPress={() => setReport(true)} />}
      <ReportSheet target={report ? { type: 'live', id: data.id, label: 'Report live' } : null} onClose={() => { setReport(false); reload(); }} />
    </Screen>
  );
}

const s = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 } });
