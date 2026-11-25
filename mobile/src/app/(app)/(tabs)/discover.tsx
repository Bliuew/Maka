import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Empty, Icon, ListItem, Loading, Overline, Screen, SearchBox, Text, useLoad } from '../../../components/ui';
import { HexAvatar } from '../../../components/hex';
import { api } from '../../../lib/client';
import * as store from '../../../lib/storage';
import { count, money } from '../../../core/format';
import { useSession } from '../../../lib/session';
import { colors, font, type, words } from '../../../lib/theme';

const recent = (): string[] => { try { return JSON.parse(store.get(store.KEYS.recentSearches) || '[]'); } catch { return []; } };

export default function Discover() {
  const router = useRouter();
  const { me, unread } = useSession();
  const { data, error, reload, refreshing } = useLoad(() => api.get('/api/discover'));
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any>(null);
  const [history, setHistory] = useState<string[]>(recent);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const t = setTimeout(() => {
      api.get('/api/search?q=' + encodeURIComponent(term)).then(setResults).catch(() => {});
      const next = [term, ...recent().filter((x) => x.toLowerCase() !== term.toLowerCase())].slice(0, 6);
      store.set(store.KEYS.recentSearches, JSON.stringify(next)); setHistory(next);
    }, 450);
    return () => clearTimeout(t);
  }, [q]);
  const searching = q.trim().length >= 2;

  if (!data) return <Loading error={error} onRetry={reload} />;
  return (
    <Screen title="Discover" onRefresh={() => reload(true)} refreshing={refreshing}
      right={<View style={s.headIcons}>
        <Pressable onPress={() => router.push('/inbox')} accessibilityRole="button" accessibilityLabel={unread ? `Inbox, ${unread} unread` : 'Inbox'} style={s.headBtn} testID="open-inbox">
          <Icon name="paper-plane-outline" size={24} />
          {unread ? <View style={s.badge}><Text style={s.badgeText}>{unread > 9 ? '9+' : unread}</Text></View> : null}
        </Pressable>
        <Pressable onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel="Your profile" style={s.headBtn}>
          <HexAvatar user={me} size={32} />
        </Pressable>
      </View>}>
      <SearchBox value={q} onChange={(v) => { setQ(v); if (v.trim().length < 2) setResults(null); }} placeholder="Search people, films, brands, #hashtags" label="Search Mäka" />
      {!searching && history.length ? (
        <View style={s.recentRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, alignItems: 'center' }} style={{ flex: 1 }}>
            {history.map((h, i) => (
              <Pressable key={h} onPress={() => setQ(h)} accessibilityRole="button" accessibilityLabel={`Search again for ${h}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                {i ? <Text style={{ color: colors.faint }}>·</Text> : null}
                <Text style={s.recent} numberOfLines={1}>{h}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={() => { store.set(store.KEYS.recentSearches, null); setHistory([]); }} accessibilityRole="button" accessibilityLabel="Clear recent searches" hitSlop={8}>
            <Text style={s.clear}>Clear</Text>
          </Pressable>
        </View>
      ) : null}

      {searching ? (
        results ? (
          <>
            {results.users.length ? <><Overline>People</Overline>{results.users.map((u: any) => <ListItem key={u.id} left={<HexAvatar user={u} size={44} ring={false} />} title={'@' + u.handle} subtitle={`${u.displayName} · ${count(u.followers)} ${words.followers}`} onPress={() => router.push(`/u/${u.handle}`)} />)}</> : null}
            {results.posts.length ? <><Overline>{words.posts}</Overline>{results.posts.map((p: any) => <ListItem key={p.id} title={'@' + p.author.handle} subtitle={p.caption} onPress={() => router.push(`/p/${p.id}`)} />)}</> : null}
            {results.titles.length ? <><Overline>Films</Overline>{results.titles.map((t: any) => <ListItem key={t.id} title={t.name} subtitle={t.genres} onPress={() => router.navigate('/cinema')} />)}</> : null}
            {results.businesses.length ? <><Overline>Brands</Overline>{results.businesses.map((b: any) => <ListItem key={b.id} title={b.name} subtitle={b.category} onPress={() => router.push(`/market/${b.id}`)} />)}</> : null}
            {results.campaigns.length ? <><Overline>Collaborations</Overline>{results.campaigns.map((c: any) => <ListItem key={c.id} title={c.title} subtitle={c.category} onPress={() => router.push('/collabs')} />)}</> : null}
            {!results.users.length && !results.posts.length && !results.titles.length && !results.businesses.length && !results.campaigns.length ? <Empty icon="search-outline">No results for “{q.trim()}”.</Empty> : null}
          </>
        ) : <Empty icon="search-outline">Searching…</Empty>
      ) : (
        <>
          <Overline>Emerging creators</Overline>
          {data.creators.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 20 }} style={{ marginHorizontal: -20, paddingLeft: 20 }}>
              {data.creators.map((u: any) => (
                <Pressable key={u.id} style={s.creator} onPress={() => router.push(`/u/${u.handle}`)} accessibilityRole="button" accessibilityLabel={`@${u.handle}, eligible for campaigns`}>
                  <HexAvatar user={u} size={44} ring={false} />
                  <Text style={s.creatorHandle} numberOfLines={1}>@{u.handle}</Text>
                  <Text style={s.eligible}>Eligible for campaigns</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : <Empty icon="people-outline">New creators will appear here.</Empty>}

          <Overline>Trending hashtags</Overline>
          {data.hashtags.length ? data.hashtags.map((h: any) => (
            <Pressable key={h.tag} style={s.tagRow} onPress={() => setQ(h.tag)} accessibilityRole="button" accessibilityLabel={`${h.tag}, ${h.posts} posts`}>
              <Text style={s.tag}>{h.tag}</Text>
              <Text style={s.tagCount}>{h.posts.toLocaleString()} {words.posts}</Text>
            </Pressable>
          )) : <Empty icon="pricetag-outline">Hashtags used in the last two weeks will appear here.</Empty>}

          <Overline right={<Pressable onPress={() => router.push('/collabs')} accessibilityRole="button" accessibilityLabel="See all collaborations" hitSlop={8}><Text style={s.clear}>See all</Text></Pressable>}>Brand collaborations open</Overline>
          {data.campaigns.length ? data.campaigns.map((c: any) => (
            <Pressable key={c.id} style={s.brand} onPress={() => router.push('/collabs')} accessibilityRole="button" accessibilityLabel={`${c.business}: ${c.title}, ${money(c.compensationCents, c.currency)}`} testID="discover-campaign">
              <Icon name="storefront-outline" size={28} color={colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={s.brandName} numberOfLines={1}>{c.business}</Text>
                <Text style={s.brandSub} numberOfLines={1}>{c.title} · {money(c.compensationCents, c.currency)}{c.isSample ? ' · Sample' : ''}</Text>
              </View>
            </Pressable>
          )) : <Empty icon="briefcase-outline">No open collaborations right now.</Empty>}
          <Text style={[type.caption, { color: colors.faint, marginTop: 10 }]}>{data.eligibility}</Text>
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  headIcons: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  headBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 5, right: 3, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: colors.onGold, fontSize: 9, fontFamily: font.bold },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  recent: { color: colors.muted, fontSize: 15, maxWidth: 120 },
  clear: { color: colors.gold, fontFamily: font.medium, fontSize: 15 },
  creator: { width: 150, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.pane, padding: 16, gap: 10 },
  creatorHandle: { color: colors.text, fontFamily: font.medium, fontSize: 15 },
  eligible: { color: colors.gold, fontSize: 13, lineHeight: 18 },
  tagRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.lineStrong },
  tag: { color: colors.text, fontSize: 17, fontFamily: font.medium },
  tagCount: { color: colors.muted, fontSize: 14 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 18, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.pane, padding: 20, marginBottom: 10 },
  brandName: { ...type.title },
  brandSub: { color: colors.muted, fontSize: 15, marginTop: 2 },
});
