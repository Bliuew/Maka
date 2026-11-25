import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import FeedItem from '../../../components/FeedItem';
import { CommentsSheet, MoreSheet, usePostActions, type Post } from '../../../components/post';
import { Button, Loading } from '../../../components/ui';
import { api } from '../../../lib/client';
import { on } from '../../../lib/events';
import { colors } from '../../../lib/theme';

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

  const tabs = (
    <View style={s.tabs} accessibilityRole="tablist">
      {(['following', 'foryou'] as Mode[]).map((m) => (
        <Pressable key={m} onPress={() => switchMode(m)} accessibilityRole="tab" accessibilityState={{ selected: mode === m }} accessibilityLabel={m === 'foryou' ? 'For You' : 'Following'} testID={`mode-${m}`}>
          <Text style={[s.tab, mode === m && s.tabOn]}>{m === 'foryou' ? 'For You' : 'Following'}</Text>
        </Pressable>
      ))}
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
  tabs: { position: 'absolute', top: 12, alignSelf: 'center', flexDirection: 'row', gap: 22, zIndex: 2 },
  tab: { color: 'rgba(255,255,255,0.7)', fontWeight: '800', fontSize: 16, paddingVertical: 6, textShadowColor: '#000', textShadowRadius: 6 },
  tabOn: { color: '#fff', borderBottomWidth: 2, borderBottomColor: colors.gold },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16, backgroundColor: colors.app },
  emptyText: { color: colors.muted, textAlign: 'center', lineHeight: 21 },
});
