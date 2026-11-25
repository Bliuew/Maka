import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/Text';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Button, Card, Empty, Loading, P, Pills, Screen, SearchBox, Tag, useLoad } from '../../../components/ui';
import { api, media } from '../../../lib/client';
import { colors } from '../../../lib/theme';

export default function Market() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [cat, setCat] = useState('');
  useEffect(() => { const t = setTimeout(() => setTerm(q), 250); return () => clearTimeout(t); }, [q]);
  const { data, error, reload, refreshing } = useLoad(() => api.get(`/api/market/businesses?q=${encodeURIComponent(term)}&category=${encodeURIComponent(cat)}`), [term, cat]);
  return (
    <Screen title="Market" intro="Shop verified independent businesses." onRefresh={() => reload(true)} refreshing={refreshing}>
      <SearchBox value={q} onChange={setQ} />
      {!data ? <Loading error={error} onRetry={reload} /> : (
        <>
          <Pills label="Category" value={cat} onChange={setCat} options={[{ value: '', label: 'All' }, ...data.categories.map((c: string) => ({ value: c, label: c }))]} />
          <View style={s.grid}>
            {data.items.length ? data.items.map((b: any) => (
              <Pressable key={b.id} style={s.tile} onPress={() => router.push(`/market/${b.id}`)} accessibilityRole="button" accessibilityLabel={`${b.name}, ${b.category}, ${b.productCount} products${b.isSample ? ', sample store' : ''}`} testID="store">
                {media(b.coverUrl) ? <Image source={{ uri: media(b.coverUrl)! }} style={s.pic} contentFit="cover" /> : <View style={s.pic} />}
                <View style={{ padding: 10 }}>
                  <Text style={s.name}>{b.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{b.category} · {b.productCount} products</Text>
                  {b.isSample ? <Tag tone="grey">Sample store</Tag> : null}
                </View>
              </Pressable>
            )) : <Empty>No matching stores.</Empty>}
          </View>
        </>
      )}
      <Card style={{ marginTop: 16 }}>
        <Text style={{ color: colors.gold, fontWeight: '800' }}>Sell on Mäka</Text>
        <P>Register your business for verification, then open a storefront and post creator campaigns.</P>
        <Button title="Business tools" icon="storefront-outline" variant="secondary" small onPress={() => router.push('/studio')} />
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48%', backgroundColor: colors.pane, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#28252b' },
  pic: { width: '100%', height: 110, backgroundColor: colors.pane2 },
  name: { color: colors.text, fontWeight: '800' },
});
