import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Button, Empty, Icon, Loading, Screen, SearchBox, Text, useLoad, type IconName } from '../../../components/ui';
import { Hex } from '../../../components/hex';
import { api, media } from '../../../lib/client';
import { cart } from '../../../lib/cart';
import { money } from '../../../core/format';
import { useToast } from '../../../lib/toast';
import { colors, font, type } from '../../../lib/theme';

const CATEGORY_ICON: Record<string, IconName> = { Beauty: 'water-outline', Fashion: 'shirt-outline', Electronics: 'headset-outline', 'Home & Living': 'home-outline', Home: 'home-outline', Entertainment: 'film-outline', Food: 'cafe-outline', Lifestyle: 'sparkles-outline' };

function ProductArt({ p, height }: { p: any; height: number }) {
  const uri = media(p.imageUrl);
  if (uri) return <Image source={{ uri }} style={{ width: '100%', height }} contentFit="cover" accessibilityLabel={p.name} />;
  return (
    <View style={{ height, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <LinearGradient colors={['#5a4318', '#241c10', colors.pane]} start={{ x: 0.7, y: 0 }} end={{ x: 0.1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Hex size={Math.round(height * 0.62)} fill={colors.pane}><Icon name={CATEGORY_ICON[p.category] || 'bag-handle-outline'} size={Math.round(height * 0.2)} color={colors.gold} /></Hex>
    </View>
  );
}

export default function Market() {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [cat, setCat] = useState('');
  const [demo, setDemo] = useState(false);
  useEffect(() => { const t = setTimeout(() => setTerm(q), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => { api.get('/api/health').then((h) => setDemo(h.integrations?.payments === 'not configured')).catch(() => {}); }, []);
  const { data, error, reload, refreshing } = useLoad(() => api.get(`/api/market/products?q=${encodeURIComponent(term)}&category=${encodeURIComponent(cat)}`), [term, cat]);
  const add = (p: any) => { cart.add(p.businessId, p.id); toast.show('Added to bag'); router.push(`/market/${p.businessId}`); };
  const [first, ...rest] = data?.items || [];
  return (
    <Screen eyebrow={demo ? 'Demo mode. No live payments.' : undefined} title="Market" onRefresh={() => reload(true)} refreshing={refreshing}>
      <SearchBox value={q} onChange={setQ} placeholder="Beauty, fashion, home and more" label="Search products" testID="market-search" />
      {!data ? <Loading error={error} onRetry={reload} /> : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 22, paddingVertical: 16 }}>
            {['', ...data.categories].map((c: string) => (
              <Pressable key={c || 'all'} onPress={() => setCat(c)} accessibilityRole="tab" accessibilityState={{ selected: cat === c }} accessibilityLabel={c || 'All'}>
                <Text style={[s.cat, cat === c && s.catOn]}>{c || 'All'}</Text>
                <View style={[s.catBar, cat !== c && { opacity: 0 }]} />
              </Pressable>
            ))}
          </ScrollView>
          {first ? (
            <View style={s.card} testID="product">
              <Pressable onPress={() => router.push(`/market/${first.businessId}`)} accessibilityRole="button" accessibilityLabel={`${first.name} from ${first.business}`}><ProductArt p={first} height={200} /></Pressable>
              <View style={{ padding: 20 }}>
                <Text style={s.store}>{first.business}{first.isSample ? ' · Sample' : ''}</Text>
                <Text style={s.name}>{first.name}</Text>
                <Text style={s.price}>{money(first.priceCents, first.currency)}</Text>
                {first.inStock ? <Button title="Add to cart" icon="bag-add-outline" block onPress={() => add(first)} testID="add-cart" /> : <Button title="Sold out" block disabled />}
              </View>
            </View>
          ) : <Empty icon="storefront-outline">No matching products.</Empty>}
          <View style={s.grid}>
            {rest.map((p: any) => (
              <View key={p.id} style={s.small} testID="product">
                <Pressable onPress={() => router.push(`/market/${p.businessId}`)} accessibilityRole="button" accessibilityLabel={`${p.name} from ${p.business}`}><ProductArt p={p} height={120} /></Pressable>
                <View style={{ padding: 12 }}>
                  <Text style={s.storeSmall} numberOfLines={1}>{p.business}</Text>
                  <Text style={s.nameSmall} numberOfLines={2}>{p.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                    <Text style={s.priceSmall}>{money(p.priceCents, p.currency)}</Text>
                    {p.inStock ? <Pressable onPress={() => add(p)} accessibilityRole="button" accessibilityLabel={`Add ${p.name} to cart`} testID="add-cart" style={s.addSmall}><Icon name="add" size={20} color={colors.onGold} /></Pressable>
                      : <Text style={{ color: colors.faint, fontSize: 12 }}>Sold out</Text>}
                  </View>
                </View>
              </View>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  cat: { color: colors.muted, fontSize: 16, fontFamily: font.medium },
  catOn: { color: colors.text },
  catBar: { height: 3, borderRadius: 2, backgroundColor: colors.gold, marginTop: 8 },
  card: { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.pane },
  store: { color: colors.muted, fontSize: 15 },
  name: { ...type.title, fontSize: 30, lineHeight: 34, marginTop: 6 },
  price: { fontFamily: font.display, fontSize: 26, color: colors.text, marginTop: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  small: { width: '48%', flexGrow: 1, maxWidth: '49%', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.pane },
  storeSmall: { color: colors.muted, fontSize: 12 },
  nameSmall: { color: colors.text, fontFamily: font.displayBold, fontSize: 16, lineHeight: 19, marginTop: 2 },
  priceSmall: { color: colors.text, fontFamily: font.bold, fontSize: 15 },
  addSmall: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
});
