import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../../components/Text';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { Banner, Button, Icon, Loading, P, Row, Screen, Sheet, Tag, useLoad } from '../../../components/ui';
import { api, media } from '../../../lib/client';
import { money } from '../../../core/format';
import { useToast } from '../../../lib/toast';
import { colors } from '../../../lib/theme';

export default function Storefront() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const { data, error, reload } = useLoad(() => api.get('/api/market/businesses/' + id), [id]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [bag, setBag] = useState(false);
  const [result, setResult] = useState<{ order: any; message: string } | null>(null);
  if (!data) return <Loading error={error} onRetry={reload} />;
  const products = Object.fromEntries(data.products.map((p: any) => [p.id, p]));
  const items = Object.values(cart).reduce((a, n) => a + n, 0);
  const lines = Object.entries(cart).map(([pid, qty]) => ({ p: products[pid], qty }));
  const total = lines.reduce((a, l) => a + l.p.priceCents * l.qty, 0);
  const place = async () => {
    try {
      const o = await api.post('/api/orders', { businessId: id, items: Object.entries(cart).map(([productId, qty]) => ({ productId, qty })) });
      setCart({});
      try { await api.post(`/api/orders/${o.orderId}/checkout`); }
      catch (e: any) { setResult({ order: o, message: e.message }); }
    } catch (e) { toast.error(e); }
  };
  return (
    <Screen title={data.business.name} intro={data.business.description}>
      <Row wrap><Tag tone="green">Verified business</Tag>{data.business.isSample ? <Tag tone="grey">Sample store</Tag> : null}</Row>
      <View style={s.grid}>
        {data.products.map((p: any) => (
          <View key={p.id} style={s.tile} accessible={false}>
            {media(p.imageUrl) ? <Image source={{ uri: media(p.imageUrl)! }} style={s.pic} contentFit="cover" accessibilityLabel={p.name} /> : <View style={[s.pic, { alignItems: 'center', justifyContent: 'center' }]}><Icon name="bag-handle-outline" size={30} color={colors.faint} /></View>}
            <View style={{ padding: 10 }}>
              <Text style={s.name}>{p.name}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={2}>{p.description}</Text>
              <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
                <Text style={{ color: colors.text, fontWeight: '800' }}>{money(p.priceCents, p.currency)}</Text>
                {p.inStock ? <Button title="Add" small label={`Add ${p.name} to bag`} onPress={() => { setCart({ ...cart, [p.id]: (cart[p.id] || 0) + 1 }); toast.show('Added to bag'); }} testID="add-cart" /> : <Tag tone="grey">Sold out</Tag>}
              </Row>
            </View>
          </View>
        ))}
      </View>
      <Button title={`View bag (${items})`} block disabled={!items} onPress={() => setBag(true)} testID="view-bag" />
      <Sheet visible={bag} title="Your bag" onClose={() => { setBag(false); setResult(null); }}>
        {result ? (
          <>
            <P><Text style={{ fontWeight: '800' }}>Order {result.order.orderId}</Text> saved · {money(result.order.totalCents, result.order.currency)}</P>
            <Banner>{result.message}</Banner>
            <P muted>You can find it in Settings & safety under Orders, and cancel it at any time.</P>
            <Button title="OK" variant="secondary" block onPress={() => { setBag(false); setResult(null); }} />
          </>
        ) : (
          <>
            {lines.map((l) => <Row key={l.p.id} style={{ justifyContent: 'space-between', paddingVertical: 6 }}><Text style={{ color: colors.text }}>{l.p.name} × {l.qty}</Text><Text style={{ color: colors.text }}>{money(l.p.priceCents * l.qty, l.p.currency)}</Text></Row>)}
            <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}><Text style={{ color: colors.text, fontWeight: '800' }}>Total</Text><Text style={{ color: colors.text, fontWeight: '800' }}>{money(total)}</Text></Row>
            <P muted>Taxes and shipping are calculated at checkout. Card details are entered with the payment provider and never stored by Mäka.</P>
            <Button title="Place order & pay" block onPress={place} disabled={!lines.length} testID="place-order" />
          </>
        )}
      </Sheet>
    </Screen>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  tile: { width: '48%', backgroundColor: colors.pane, borderRadius: 14, overflow: 'hidden' },
  pic: { width: '100%', height: 110, backgroundColor: colors.pane2 },
  name: { color: colors.text, fontWeight: '800' },
});
