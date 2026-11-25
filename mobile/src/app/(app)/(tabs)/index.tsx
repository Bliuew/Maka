import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/Text';
import { useIsFocused, useRouter } from 'expo-router';
import FeedItem from '../../../components/FeedItem';
import { CommentsSheet, MoreSheet, usePostActions, type Post } from '../../../components/post';
import { Button, Loading } from '../../../components/ui';
import { api } from '../../../lib/client';
import { on } from '../../../lib/events';
import { colors, font } from '../../../lib/theme';

type ViewToken = { index?: number | null; isViewable: boolean };
type Mode = 'foryou' | 'following';
export const feedState = { muted: true };

export default function Feed() {
  const router = useRouter();
  const focused = useIsFocused();
  const [mode, setMode] = useState<Mode>('foryou');
  const [items, setItems] = useState<Post[] | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [height, setHeight] = useState(0);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(feedState.muted);
  const [refreshing, setRefreshing] = useState(false);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [moreFor, setMoreFor] = useState<Post | null>(null);
  const loadingMore = useRef(false);

  const load = useCallback(async (m: Mode) => {
    try {
      const r = await api.get(`/api/feed?mode=${m}`);
      setItems(r.items); setCursor(r.nextCursor); setActive(0); setError(null);
    } catch (e: any) { setError(e.message); }
  }, []);
  // Load the feed for the selected tab; ignore late responses after a quick tab switch.
  useEffect(() => {
    let ignore = false;
    api.get(`/api/feed?mode=${mode}`)
      .then((r) => { if (!ignore) { setItems(r.items); setCursor(r.nextCursor); setActive(0); setError(null); } })
      .catch((e) => { if (!ignore) setError(e.message); });
    return () => { ignore = true; };
  }, [mode]);
  const switchMode = (m: Mode) => { if (m === mode) return; setItems(null); setMode(m); };
  useEffect(() => on('net:back', () => { if (!items?.length) load(mode); }), [items, mode, load]);
  useEffect(() => on('post_status', () => load(mode)), [mode, load]);

  const more = async () => {
    if (cursor == null || loadingMore.current) return;
    loadingMore.current = true;
    try { const r = await api.get(`/api/feed?mode=${mode}&cursor=${cursor}`); setItems((x) => [...(x || []), ...r.items.filter((p: Post) => !(x || []).some((y) => y.id === p.id))]); setCursor(r.nextCursor); }
    catch { /* retried on next scroll */ } finally { loadingMore.current = false; }
  };

  const replace = (p: Post) => setItems((xs) => xs?.map((x) => (x.id === p.id ? { ...x, ...p } : x.author.id === p.author?.id ? { ...x, author: p.author } : x)) ?? xs);
  const actions = usePostActions(replace);
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const v = viewableItems.find((x) => x.isViewable);
    if (v?.index != null) setActive(v.index);
  }, []);

  // Feed switcher, as in the founder's Home design: For You first, gold bar under the active tab.
  const tabs = (
    <View style={s.top} pointerEvents="box-none">
      <View style={s.tabs} accessibilityRole="tablist">
        {(['foryou', 'following'] as Mode[]).map((m) => (
          <Pressable key={m} onPress={() => switchMode(m)} accessibilityRole="tab" accessibilityState={{ selected: mode === m }} accessibilityLabel={m === 'foryou' ? 'For You' : 'Following'} testID={`mode-${m}`}>
            <Text style={[s.tab, mode === m && s.tabOn]}>{m === 'foryou' ? 'For You' : 'Following'}</Text>
            <View style={[s.indicator, mode !== m && { opacity: 0 }]} />
          </Pressable>
        ))}
      </View>
    </View>
  );

  if (error && !items) return <Loading error={error} onRetry={() => load(mode)} />;
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }} onLayout={(e) => setHeight(Math.round(e.nativeEvent.layout.height))}>
      {!items || !height ? <Loading /> : items.length === 0 ? (
        <View style={s.empty}>
          {tabs}
          <Text style={s.emptyText}>{mode === 'following' ? 'Posts from people you follow appear here. Follow creators from For You or Search.' : 'No posts yet. Be the first to share something.'}</Text>
          <Button title="Create a post" onPress={() => router.navigate('/create')} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          renderItem={({ item, index }) => (
            <FeedItem post={item} height={height} active={focused && index === active} nearby={Math.abs(index - active) <= 1} muted={muted}
              header={tabs}
              onToggleMute={() => { feedState.muted = !muted; setMuted(!muted); }}
              onLike={() => actions.like(item)} onSave={() => actions.save(item)} onFollow={() => actions.follow(item)} onShare={() => actions.share(item)}
              onComments={() => setCommentsFor(item.id)} onMore={() => setMoreFor(item)} />
          )}
          pagingEnabled snapToInterval={height} snapToAlignment="start" decelerationRate="fast" showsVerticalScrollIndicator={false}
          getItemLayout={(_d, i) => ({ length: height, offset: height * i, index: i })}
          onViewableItemsChanged={onViewable} viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          onEndReached={more} onEndReachedThreshold={1.5}
          windowSize={3} initialNumToRender={2} maxToRenderPerBatch={2} removeClippedSubviews
          refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(mode); setRefreshing(false); }}
          accessibilityLabel="Video feed. Swipe up for the next video."
          testID="feed"
        />
      )}
      <CommentsSheet postId={commentsFor} visible={!!commentsFor} onClose={() => setCommentsFor(null)}
        onCountChange={() => commentsFor && api.get('/api/posts/' + commentsFor).then(replace).catch(() => {})} />
      <MoreSheet post={moreFor} onClose={() => setMoreFor(null)} onChanged={(kind, p) => {
        if (kind === 'updated' && p) replace(p);
        else load(mode);
      }} />
    </View>
  );
}

const s = StyleSheet.create({
  top: { position: 'absolute', top: 10, left: 0, right: 0, alignItems: 'center', zIndex: 2 },
  tabs: { flexDirection: 'row', gap: 40 },
  tab: { color: colors.muted, fontFamily: font.displayBold, fontSize: 19, paddingTop: 6, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6 },
  tabOn: { color: colors.text, fontFamily: font.display },
  indicator: { alignSelf: 'center', width: 30, height: 4, borderRadius: 2, backgroundColor: colors.gold, marginTop: 6, shadowColor: colors.gold, shadowOpacity: 0.8, shadowRadius: 6 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16, backgroundColor: colors.app },
  emptyText: { color: colors.muted, textAlign: 'center', lineHeight: 21 },
});
