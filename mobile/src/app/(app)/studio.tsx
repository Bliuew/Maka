import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Avatar, Banner, Button, Card, Empty, Field, ListItem, Loading, Metrics, P, Row, Screen, SectionTitle, Sheet, Tag, useLoad } from '../../components/ui';
import { api } from '../../lib/client';
import { count, money } from '../../core/format';
import { useToast } from '../../lib/toast';
import { colors } from '../../lib/theme';

type Form = null | { kind: 'business' } | { kind: 'campaign'; biz: string } | { kind: 'product'; biz: string } | { kind: 'applicants'; biz: string; list: any[] };

export default function Studio() {
  const router = useRouter();
  const toast = useToast();
  const { data, error, reload, refreshing } = useLoad(async () => {
    const [s, apps, bizs] = await Promise.all([api.get('/api/studio'), api.get<any[]>('/api/me/applications'), api.get<any[]>('/api/me/businesses')]);
    return { s, apps, bizs };
  });
  const [form, setForm] = useState<Form>(null);
  const [v, setV] = useState<Record<string, string>>({});
  if (!data) return <Loading error={error} onRetry={reload} />;
  const { s, apps, bizs } = data;
  const e = s.earnings;
  const set = (k: string) => (x: string) => setV({ ...v, [k]: x });
  const act = (fn: () => Promise<unknown>) => async () => { try { await fn(); } catch (err) { toast.error(err); } };
  const open = (f: Form) => { setV({}); setForm(f); };
  const row = (p: any, right?: React.ReactNode) => (
    <ListItem key={p.id} title={p.caption.slice(0, 50) || 'Untitled'} right={right}
      subtitle={p.status === 'published' ? `${count(p.views)} views · ${count(p.likes)} likes · ${count(p.comments)} comments` : p.status + (p.mediaError ? ' · ' + p.mediaError : '')} />
  );

  return (
    <Screen eyebrow="Creator Studio" title="Your studio" intro={s.eligibility} onRefresh={() => reload(true)} refreshing={refreshing}>
      <Metrics items={[[count(s.totals.views), 'Views'], [count(s.totals.likes), 'Likes'], [count(s.totals.comments), 'Comments']]} />
      <SectionTitle>Earnings</SectionTitle>
      <Card>
        <Text style={{ color: colors.gold, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' }}>From real, compliant revenue only</Text>
        <Text style={{ color: colors.text, fontSize: 30, fontWeight: '900', marginVertical: 6 }} testID="earnings-total">{money(e.availableCents + e.pendingCents, e.currency)}</Text>
        <P>Pending {money(e.pendingCents)} · Available {money(e.availableCents)} · Paid out {money(e.paidOutCents)}</P>
        {e.payoutsNote ? <P muted>{e.payoutsNote}</P> : null}
      </Card>
      {e.ledger.map((x: any) => <ListItem key={x.id} title={`${x.source} · ${x.status}`} right={<Text style={{ color: colors.text }}>{money(x.amountCents, x.currency)}</Text>} />)}
      {s.drafts.length ? <><SectionTitle>Drafts</SectionTitle>{s.drafts.map((p: any) => row(p, <Button title="Publish" small onPress={act(async () => { await api.patch('/api/posts/' + p.id, { publish: true }); toast.show('Published'); reload(); })} />))}</> : null}
      {s.processing.length ? <><SectionTitle>Processing</SectionTitle>{s.processing.map((p: any) => row(p))}</> : null}
      {s.held.length ? <><SectionTitle>Held for review</SectionTitle>{s.held.map((p: any) => row(p))}</> : null}
      <SectionTitle>Published</SectionTitle>
      {s.published.length ? s.published.map((p: any) => row(p, <Button title="Open" small variant="secondary" onPress={() => router.push(`/p/${p.id}`)} />)) : <Empty>Nothing published yet.</Empty>}

      <SectionTitle>Collaborations</SectionTitle>
      {apps.length ? apps.map((a) => (
        <ListItem key={a.id} title={a.title} subtitle={`Application ${a.status}${a.contract ? ` · contract ${a.contract.status} · ${money(a.contract.amountCents, a.contract.currency)}` : ''}`}
          right={a.contract?.status === 'offered' ? <Button title="Sign" small onPress={act(async () => { const r = await api.post(`/api/contracts/${a.contract.id}/sign`); toast.show(r.note || 'Contract ' + r.status); reload(); })} />
            : a.contract?.status === 'signed' ? <Button title="Mark delivered" small onPress={act(async () => { const r = await api.post(`/api/contracts/${a.contract.id}/deliver`); toast.show(r.note || 'Contract ' + r.status); reload(); })} /> : undefined} />
      )) : <Empty>No applications yet. Browse open briefs in Collabs.</Empty>}

      <SectionTitle>Business tools</SectionTitle>
      {bizs.map((b) => (
        <Card key={b.id}>
          <Row style={{ justifyContent: 'space-between' }}><Text style={{ color: colors.text, fontWeight: '800' }}>{b.name}</Text><Tag tone={b.verification === 'verified' ? 'green' : 'grey'}>{b.verification}</Tag></Row>
          {b.verification === 'verified' ? (
            <Row wrap style={{ marginTop: 10 }}>
              <Button title="Post campaign" small onPress={() => open({ kind: 'campaign', biz: b.id })} />
              <Button title="Add product" small variant="secondary" onPress={() => open({ kind: 'product', biz: b.id })} />
              <Button title="Applicants" small variant="secondary" onPress={act(async () => open({ kind: 'applicants', biz: b.id, list: await api.get(`/api/businesses/${b.id}/applications`) }))} />
            </Row>
          ) : <P muted>Awaiting verification by the Mäka team.</P>}
        </Card>
      ))}
      <Button title="Register a business" variant="secondary" onPress={() => open({ kind: 'business' })} />

      <Sheet visible={!!form} onClose={() => setForm(null)} title={form?.kind === 'business' ? 'Register a business' : form?.kind === 'campaign' ? 'Post a campaign' : form?.kind === 'product' ? 'Add product' : 'Applicants'}>
        {form?.kind === 'business' ? (
          <>
            <Field label="Business name" value={v.name || ''} onChangeText={set('name')} />
            <Field label="Category" value={v.category || ''} onChangeText={set('category')} placeholder="Beauty, Fashion, Food…" />
            <Field label="Description" value={v.description || ''} onChangeText={set('description')} multiline />
            <Field label="Website" value={v.website || ''} onChangeText={set('website')} autoCapitalize="none" keyboardType="url" />
            <Field label="Business registration / tax number" value={v.registrationRef || ''} onChangeText={set('registrationRef')} />
            <Button title="Submit for verification" block onPress={act(async () => { const r = await api.post('/api/businesses', v); setForm(null); toast.show(r.message); reload(); })} />
          </>
        ) : form?.kind === 'campaign' ? (
          <>
            <Banner>Campaigns are open to every eligible creator. Follower minimums and creator tiers are not allowed.</Banner>
            <Field label="Title" value={v.title || ''} onChangeText={set('title')} />
            <Field label="Brief" value={v.brief || ''} onChangeText={set('brief')} multiline />
            <Field label="Deliverables" value={v.deliverables || ''} onChangeText={set('deliverables')} />
            <Field label="Paid compensation (CAD)" value={v.pay || ''} onChangeText={set('pay')} keyboardType="numeric" />
            <Button title="Publish campaign" block onPress={act(async () => {
              await api.post(`/api/businesses/${form.biz}/campaigns`, { title: v.title, brief: v.brief, deliverables: v.deliverables, compensationCents: Math.round(Number(v.pay) * 100) });
              setForm(null); toast.show('Campaign published');
            })} />
          </>
        ) : form?.kind === 'product' ? (
          <>
            <Field label="Name" value={v.name || ''} onChangeText={set('name')} />
            <Field label="Description" value={v.description || ''} onChangeText={set('description')} multiline />
            <Field label="Price (CAD)" value={v.price || ''} onChangeText={set('price')} keyboardType="decimal-pad" />
            <Field label="Stock" value={v.stock ?? '10'} onChangeText={set('stock')} keyboardType="number-pad" />
            <Button title="Add product" block onPress={act(async () => {
              await api.post(`/api/businesses/${form.biz}/products`, { name: v.name, description: v.description, priceCents: Math.round(Number(v.price) * 100), stock: Number(v.stock ?? 10) });
              setForm(null); toast.show('Product added');
            })} />
          </>
        ) : form?.kind === 'applicants' ? (
          <>
            <P muted>Listed in the order they applied. Judge on the pitch, portfolio and track record — not follower count.</P>
            {form.list.length ? form.list.map((a) => (
              <Card key={a.id}>
                <Row><Avatar user={a.creator} size={30} /><Text style={{ color: colors.text, fontWeight: '800', flex: 1 }}>@{a.creator.handle}</Text><Tag>{a.status}</Tag></Row>
                <P muted>{a.campaign}</P><P>{a.pitch}</P>
                <P muted>Completed collaborations: {a.completedCollaborations}</P>
                <Row wrap>
                  {(['shortlisted', 'accepted', 'declined'] as const).map((st) => <Button key={st} title={st} small variant="secondary" onPress={act(async () => { await api.post(`/api/applications/${a.id}/decision`, { status: st }); toast.show('Applicant ' + st); setForm(null); })} />)}
                  <Button title="Message" small onPress={() => { setForm(null); router.push(`/inbox/${a.conversationId}`); }} />
                </Row>
              </Card>
            )) : <Empty>No applications yet.</Empty>}
          </>
        ) : null}
        <View style={{ height: 12 }} />
      </Sheet>
    </Screen>
  );
}
