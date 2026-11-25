import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { Text } from '../../components/Text';
import * as Linking from 'expo-linking';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { Avatar, Button, Card, Choice, Empty, Field, ListItem, Loading, P, Row, Screen, SectionTitle, Sheet, useLoad } from '../../components/ui';
import { api, serverUrl, setToken } from '../../lib/client';
import { money } from '../../core/format';
import { useSession } from '../../lib/session';
import { useToast } from '../../lib/toast';
import { colors } from '../../lib/theme';

export default function Settings() {
  const toast = useToast();
  const { me, setMe, signOut } = useSession();
  const { data, error, reload, refreshing } = useLoad(async () => {
    const [blocked, muted, sanctions, reports, orders] = await Promise.all(['/api/me/blocked', '/api/me/muted', '/api/me/sanctions', '/api/me/reports', '/api/me/orders'].map((p) => api.get<any[]>(p)));
    return { blocked, muted, sanctions, reports, orders };
  });
  const [dm, setDm] = useState(me?.dmPolicy || 'everyone');
  const [remix, setRemix] = useState(me?.defaultRemix || 'followers');
  const [filter, setFilter] = useState((me?.commentFilter || []).join(', '));
  const [appeal, setAppeal] = useState<string | null>(null);
  const [appealText, setAppealText] = useState('');
  const [del, setDel] = useState(false);
  const [pw, setPw] = useState('');
  if (!data || !me) return <Loading error={error} onRetry={reload} />;
  const act = (fn: () => Promise<unknown>) => async () => { try { await fn(); } catch (e) { toast.error(e); } };

  const exportData = act(async () => {
    const json = JSON.stringify(await api.get('/api/me/export'), null, 2);
    if (Platform.OS === 'web') { toast.show('Export ready (' + Math.round(json.length / 1024) + ' KB)'); return; }
    const f = new File(Paths.cache, 'maka-data-export.json');
    f.create({ overwrite: true }); f.write(json);
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(f.uri, { mimeType: 'application/json', dialogTitle: 'Your Mäka data' });
    else toast.show('Saved to ' + f.uri);
  });

  return (
    <Screen onRefresh={() => reload(true)} refreshing={refreshing}>
      <SectionTitle>Who can message me</SectionTitle>
      <View>
        <Choice label="Who can message me" value={dm} onChange={setDm} options={[{ value: 'everyone', label: 'Everyone (19+ verified)' }, { value: 'following', label: 'Only people I follow' }, { value: 'nobody', label: 'Nobody' }]} />
        <Text style={{ color: colors.muted, fontWeight: '500', fontSize: 13, marginTop: 22 }}>DEFAULT STITCH / REMIX PERMISSION</Text>
        <Choice label="Default stitch or remix permission" value={remix} onChange={setRemix} options={[{ value: 'everyone', label: 'Everyone' }, { value: 'followers', label: 'Followers' }, { value: 'nobody', label: 'Nobody' }]} />
        <Field label="Hide comments containing (comma separated)" value={filter} onChangeText={setFilter} autoCapitalize="none" />
        <Button title="Save" block onPress={act(async () => {
          setMe(await api.patch('/api/me', { dmPolicy: dm, defaultRemix: remix, commentFilter: filter.split(',').map((s: string) => s.trim()).filter(Boolean) }));
          toast.show('Settings saved');
        })} />
      </View>

      <SectionTitle>Blocked accounts</SectionTitle>
      {data.blocked.length ? data.blocked.map((u) => <ListItem key={u.id} left={<Avatar user={u} />} title={'@' + u.handle}
        right={<Button title="Unblock" small variant="secondary" label={`Unblock @${u.handle}`} onPress={act(async () => { await api.del(`/api/users/${u.id}/block`); toast.show('Unblocked'); reload(); })} />} />) : <Empty>None.</Empty>}
      <SectionTitle>Muted accounts</SectionTitle>
      {data.muted.length ? data.muted.map((u) => <ListItem key={u.id} left={<Avatar user={u} />} title={'@' + u.handle}
        right={<Button title="Unmute" small variant="secondary" label={`Unmute @${u.handle}`} onPress={act(async () => { await api.del(`/api/users/${u.id}/mute`); toast.show('Unmuted'); reload(); })} />} />) : <Empty>None.</Empty>}

      <SectionTitle>Your reports</SectionTitle>
      {data.reports.length ? data.reports.map((r) => <ListItem key={r.id} title={`${r.reason} (${r.target_type})`} subtitle={r.status} />) : <Empty>None.</Empty>}

      <SectionTitle>Account standing</SectionTitle>
      {data.sanctions.length ? data.sanctions.map((s: any) => (
        <Card key={s.id}>
          <P><Text style={{ fontWeight: '800' }}>{s.level}:</Text> {s.reason}</P>
          <P muted>{new Date(s.created_at).toLocaleString()}{s.revoked ? ' · overturned' : ''}</P>
          {s.revoked ? null : <Button title="Appeal" small variant="secondary" onPress={() => { setAppealText(''); setAppeal(s.id); }} />}
        </Card>
      )) : <Empty icon="shield-checkmark-outline">Your account is in good standing.</Empty>}

      <SectionTitle>Orders</SectionTitle>
      {data.orders.length ? data.orders.map((o) => <ListItem key={o.id} title={`${o.business} · ${o.status}`} subtitle={money(o.totalCents, o.currency)}
        right={o.status === 'awaiting_payment' ? (
          <Row>
            <Button title="Pay" small onPress={act(async () => { const r = await api.post(`/api/orders/${o.id}/checkout`); await Linking.openURL(r.url); })} />
            <Button title="Cancel" small variant="secondary" onPress={act(async () => { await api.post(`/api/orders/${o.id}/cancel`); toast.show('Order cancelled'); reload(); })} />
          </Row>
        ) : undefined} />) : <Empty>No orders.</Empty>}

      <SectionTitle>Your data & legal</SectionTitle>
      <Row wrap>
        <Button title="Download my data" variant="secondary" onPress={exportData} />
        <Button title="Privacy Policy" variant="secondary" onPress={() => Linking.openURL(serverUrl() + '/privacy.html')} />
        <Button title="Community Guidelines" variant="secondary" onPress={() => Linking.openURL(serverUrl() + '/guidelines.html')} />
      </Row>
      <Row wrap style={{ marginTop: 8 }}>
        <Button title="Sign out" variant="secondary" onPress={signOut} testID="sign-out" />
        <Button title="Delete account" variant="danger" onPress={() => { setPw(''); setDel(true); }} />
      </Row>
      <P muted style={{ marginTop: 16 }}>Age status: {me.ageStatus} (19+). We keep only the verification result, never ID images.</P>

      <Sheet visible={!!appeal} title="Appeal" onClose={() => setAppeal(null)}>
        <P>Explain why you think this decision was wrong. A different reviewer will look at it.</P>
        <Field label="Your appeal" value={appealText} onChangeText={setAppealText} multiline maxLength={2000} />
        <Button title="Submit appeal" block disabled={!appealText.trim()} onPress={act(async () => { await api.post('/api/appeals', { sanctionId: appeal, body: appealText }); setAppeal(null); toast.show('Appeal submitted'); })} />
      </Sheet>
      <Sheet visible={del} title="Delete account" onClose={() => setDel(false)}>
        <P>This permanently removes your profile, posts and comments. Enter your password to confirm.</P>
        <Field label="Password" value={pw} onChangeText={setPw} secureTextEntry autoComplete="current-password" />
        <Button title="Delete my account" variant="danger" block onPress={act(async () => { await api.del('/api/me', { password: pw }); setToken(null); setMe(null); })} />
      </Sheet>
    </Screen>
  );
}
