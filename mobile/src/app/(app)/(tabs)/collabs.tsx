import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/Text';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Banner, Button, Card, Choice, Icon, Empty, Field, ListItem, Loading, P, Pills, Screen, SectionTitle, Sheet, Tag, useLoad } from '../../../components/ui';
import { api, media } from '../../../lib/client';
import { money } from '../../../core/format';
import { useToast } from '../../../lib/toast';
import { colors } from '../../../lib/theme';

export default function Collabs() {
  const router = useRouter();
  const toast = useToast();
  const [cat, setCat] = useState('');
  const { data, error, reload, refreshing } = useLoad(async () => {
    const [c, mine] = await Promise.all([api.get('/api/campaigns' + (cat ? '?category=' + encodeURIComponent(cat) : '')), api.get('/api/me/applications')]);
    return { ...c, mine };
  }, [cat]);
  const [open, setOpen] = useState<any>(null);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [pitch, setPitch] = useState('');
  const [pf, setPf] = useState('');
  if (!data) return <Loading error={error} onRetry={reload} />;
  const openCampaign = async (id: string) => {
    try {
      const [c, studio] = await Promise.all([api.get('/api/campaigns/' + id), api.get('/api/studio')]);
      setPortfolio(studio.published); setPitch(''); setPf(''); setOpen(c);
    } catch (e) { toast.error(e); }
  };
  const apply = async () => {
    try {
      await api.post(`/api/campaigns/${open.id}/apply`, { pitch, portfolioPostId: pf || null });
      setOpen(null); toast.show('Application sent — the brand can now message you'); reload();
    } catch (e) { toast.error(e); }
  };
  return (
    <Screen title="Collabs" onRefresh={() => reload(true)} refreshing={refreshing}
      intro="Paid briefs from verified businesses, open to every verified creator.">
      <Card><Text style={{ color: colors.gold, fontWeight: '800' }}>Talent over follower count.</Text>
        <P>No nano, micro or mega tiers and no follower minimums. Brands choose on fit, creativity, quality and reliability.</P></Card>
      <Pills label="Category" value={cat} onChange={setCat} options={[{ value: '', label: 'All' }, ...data.categories.map((c: string) => ({ value: c, label: c }))]} />
      <SectionTitle>Open briefs ({data.items.length})</SectionTitle>
      {data.items.length ? data.items.map((c: any) => (
        <Pressable key={c.id} style={s.offer} onPress={() => openCampaign(c.id)} accessibilityRole="button"
          accessibilityLabel={`${c.title}. ${c.category}. ${money(c.compensationCents, c.currency)}${c.myApplication ? '. Applied' : ''}`} testID="offer">
          {media(c.imageUrl) ? <Image source={{ uri: media(c.imageUrl)! }} style={s.offerImg} contentFit="cover" /> : <View style={[s.offerImg, { alignItems: 'center', justifyContent: 'center' }]}><Icon name="briefcase-outline" size={30} color={colors.faint} /></View>}
          <View style={{ flex: 1 }}>
            <Text style={s.offerTitle}>{c.title}</Text>
            <Text style={{ color: colors.muted }} numberOfLines={2}>{c.brief}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Tag>{c.category}</Tag><Tag>{money(c.compensationCents, c.currency)}</Tag>
              {c.isSample ? <Tag tone="grey">Sample</Tag> : null}
              {c.myApplication ? <Tag tone="green">Applied · {c.myApplication.status}</Tag> : null}
            </View>
          </View>
        </Pressable>
      )) : <Empty>No open briefs right now.</Empty>}
      {data.mine.length ? <SectionTitle>My applications</SectionTitle> : null}
      {data.mine.map((a: any) => (
        <ListItem key={a.id} title={a.title} subtitle={a.status + (a.contract ? ' · contract ' + a.contract.status : '')}
          right={<Button title="Messages" small variant="secondary" onPress={() => router.push(`/inbox/${a.conversationId}`)} />} />
      ))}
      <P muted style={{ marginTop: 16 }}>Sample briefs are fictional. Real campaigns require a verified business, disclosure, a contract, and a connected payment provider before money moves.</P>
      <Sheet visible={!!open} title={open?.title || ''} onClose={() => setOpen(null)}>
        {open ? (
          <>
            <P>{open.brief}</P>
            <P><Text style={{ fontWeight: '800' }}>Deliverables:</Text> {open.deliverables}</P>
            <P><Text style={{ fontWeight: '800' }}>Pay:</Text> {money(open.compensationCents, open.currency)} · <Text style={{ fontWeight: '800' }}>Disclosure:</Text> {open.disclosure}</P>
            <P><Text style={{ fontWeight: '800' }}>Business:</Text> {open.business.name} (verified)</P>
            <Banner>{open.eligibility}{open.isSample ? ' This is a sample brief — no business will pay through it.' : ''}</Banner>
            {open.myApplication ? <Tag tone="green">You applied · {open.myApplication.status}</Tag> : (
              <>
                <Field label="Your pitch" value={pitch} onChangeText={setPitch} multiline placeholder="Your idea, why it fits, and how you’ll deliver it." testID="pitch" />
                <Choice label="Portfolio post (optional)" value={pf} onChange={setPf}
                  options={[{ value: '', label: 'None' }, ...portfolio.map((p) => ({ value: p.id, label: p.caption.slice(0, 50) || 'Untitled post' }))]} />
                <Button title="Submit application" block onPress={apply} disabled={pitch.trim().length < 20} testID="apply" />
              </>
            )}
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const s = StyleSheet.create({
  offer: { flexDirection: 'row', gap: 12, backgroundColor: colors.pane, borderRadius: 16, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#28252b' },
  offerImg: { width: 84, height: 108, borderRadius: 12, backgroundColor: colors.pane2 },
  offerTitle: { color: colors.text, fontWeight: '800', fontSize: 16, marginBottom: 4 },
});
