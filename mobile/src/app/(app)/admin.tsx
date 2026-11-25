import React, { useState } from 'react';
import { View } from 'react-native';
import { Text, TextInput } from '../../components/Text';
import { Button, Card, Empty, Loading, Metrics, P, Row, Screen, SectionTitle, Tag, useLoad, styles as ui } from '../../components/ui';
import { api } from '../../lib/client';
import { useSession } from '../../lib/session';
import { useToast } from '../../lib/toast';
import { canSeeAdmin } from '../../core/gate';
import { colors } from '../../lib/theme';

const ACTIONS = ['dismiss', 'approve_content', 'remove_content', 'warning', 'restrict', 'suspend', 'ban', 'escalate'] as const;

export default function Admin() {
  const { me } = useSession();
  const toast = useToast();
  const allowed = canSeeAdmin(me);
  const { data, error, reload, refreshing } = useLoad(async () => {
    if (!allowed) return null;
    const [o, reports, appeals, biz, audit] = await Promise.all(['/api/admin/overview', '/api/admin/reports', '/api/admin/appeals', '/api/admin/businesses', '/api/admin/audit'].map((p) => api.get<any>(p)));
    return { o, reports, appeals, biz, audit };
  });
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (!allowed) return <Screen><Empty>Not available.</Empty></Screen>;
  if (!data) return <Loading error={error} onRetry={reload} />;
  const act = (fn: () => Promise<unknown>, msg: string) => async () => { try { await fn(); toast.show(msg); reload(); } catch (e) { toast.error(e); } };
  return (
    <Screen title="Moderation" intro="Every action is logged. Appeals go to a different reviewer." onRefresh={() => reload(true)} refreshing={refreshing}>
      <Metrics items={[[String(data.o.openReports), 'Open reports'], [String(data.o.openAppeals), 'Appeals'], [String(data.o.pendingBusinesses), 'Businesses']]} />
      <SectionTitle>Report queue (highest risk first)</SectionTitle>
      {data.reports.length ? data.reports.map((r: any) => (
        <Card key={r.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text, fontWeight: '800', flex: 1 }}>{r.reason} · {r.targetType}</Text>
            <Tag tone={r.priority >= 4 ? 'red' : undefined}>P{r.priority}{r.systemGenerated ? ' · auto' : ''}</Tag>
          </Row>
          <P muted>{r.details}</P>
          {r.evidence ? <View style={{ backgroundColor: '#000', borderRadius: 8, padding: 8 }}><Text style={{ color: colors.cream, fontFamily: 'monospace', fontSize: 12 }}>{r.evidence}</Text></View> : null}
          <P muted>Target: {r.targetUser ? '@' + r.targetUser.handle : '—'} · prior sanctions: {r.sanctionHistory.length} · suggested: <Text style={{ fontWeight: '800', color: colors.gold }}>{r.recommendedLevel}</Text></P>
          <TextInput style={[ui.field, { marginTop: 6 }]} placeholder="Reason (shown to user)" placeholderTextColor="#77737b" accessibilityLabel="Reason, shown to the user"
            value={notes[r.id] || ''} onChangeText={(t) => setNotes({ ...notes, [r.id]: t })} />
          <Row wrap style={{ marginTop: 8 }}>
            {ACTIONS.map((a) => <Button key={a} title={a.replace('_', ' ')} small variant={a === 'ban' ? 'danger' : 'secondary'} label={`${a.replace('_', ' ')} report about ${r.reason}`}
              onPress={act(() => api.post(`/api/admin/reports/${r.id}/resolve`, { action: a, note: notes[r.id] || '' }), 'Done: ' + a)} />)}
          </Row>
        </Card>
      )) : <Empty>Queue is clear.</Empty>}
      <SectionTitle>Appeals</SectionTitle>
      {data.appeals.length ? data.appeals.map((a: any) => (
        <Card key={a.id}>
          <P><Text style={{ fontWeight: '800' }}>@{a.user?.handle}</Text> appeals {a.sanction?.level}: {a.sanction?.reason}</P>
          <P>{a.body}</P>
          <Row><Button title="Overturn" small onPress={act(() => api.post(`/api/admin/appeals/${a.id}/decide`, { decision: 'overturned' }), 'Appeal overturned')} />
            <Button title="Uphold" small variant="secondary" onPress={act(() => api.post(`/api/admin/appeals/${a.id}/decide`, { decision: 'upheld' }), 'Appeal upheld')} /></Row>
        </Card>
      )) : <Empty>No open appeals.</Empty>}
      <SectionTitle>Business verification</SectionTitle>
      {data.biz.length ? data.biz.map((b: any) => (
        <Card key={b.id}>
          <P><Text style={{ fontWeight: '800' }}>{b.name}</Text> · {b.category} · reg {b.registration_ref}</P>
          <Row><Button title="Verify" small onPress={act(() => api.post(`/api/admin/businesses/${b.id}/verify`, { decision: 'verified' }), 'Business verified')} />
            <Button title="Reject" small variant="secondary" onPress={act(() => api.post(`/api/admin/businesses/${b.id}/verify`, { decision: 'rejected' }), 'Business rejected')} /></Row>
        </Card>
      )) : <Empty>None pending.</Empty>}
      <SectionTitle>Audit log</SectionTitle>
      {data.audit.slice(0, 40).map((a: any) => (
        <Row key={a.id} style={{ justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#221f24' }}>
          <Text style={{ color: colors.text, flex: 1 }}>{a.action} · {a.target_type || ''}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{new Date(a.created_at).toLocaleString()}</Text>
        </Row>
      ))}
    </Screen>
  );
}
