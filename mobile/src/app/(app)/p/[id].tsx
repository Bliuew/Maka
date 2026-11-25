import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import FeedItem from '../../../components/FeedItem';
import { CommentsSheet, MoreSheet, usePostActions, type Post } from '../../../components/post';
import { Icon, Loading, useLoad } from '../../../components/ui';
import { api } from '../../../lib/client';
import { feedState } from '../(tabs)/index';

export default function SinglePost() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const focused = useIsFocused();
  const { data: post, error, reload, setData } = useLoad<Post>(() => api.get('/api/posts/' + id), [id]);
  const [h, setH] = useState(0);
  const [muted, setMuted] = useState(feedState.muted);
  const [comments, setComments] = useState(false);
  const [more, setMore] = useState(false);
  const actions = usePostActions((p) => setData((x: Post) => ({ ...x, ...p })));
  if (!post) return <Loading error={error} onRetry={reload} />;
  const back = (
    <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="button" accessibilityLabel="Back"
      style={{ position: 'absolute', top: 12, left: 12, zIndex: 3, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
      <Icon name="chevron-back" size={26} color="#fff" />
    </Pressable>
  );
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
      {h ? <FeedItem post={post} height={h} active={focused} nearby muted={muted} header={back}
        onToggleMute={() => { feedState.muted = !muted; setMuted(!muted); }}
        onLike={() => actions.like(post)} onSave={() => actions.save(post)} onFollow={() => actions.follow(post)} onShare={() => actions.share(post)}
        onComments={() => setComments(true)} onMore={() => setMore(true)} /> : null}
      <CommentsSheet postId={post.id} visible={comments} onClose={() => setComments(false)} onCountChange={reload} />
      <MoreSheet post={more ? post : null} onClose={() => setMore(false)} onChanged={(kind, p) => {
        if (kind === 'updated' && p) setData(p); else router.replace('/');
      }} />
    </View>
  );
}
