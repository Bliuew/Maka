// One full-screen story in the vertical feed.
import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { api, media } from '../lib/client';
import { count } from '../core/format';
import { colors } from '../lib/theme';
import { Avatar } from './ui';
import { ActionButton, type Post } from './post';
import { useSession } from '../lib/session';

type Props = {
  post: Post; height: number; active: boolean; nearby: boolean; muted: boolean;
  onToggleMute: () => void; onLike: () => void; onSave: () => void; onFollow: () => void; onShare: () => void;
  onComments: () => void; onMore: () => void; header?: React.ReactNode;
};

const viewed = new Set<string>();

type PlayerHandle = { toggle: () => void };

function Player({ uri, active, muted, onPausedChange, ref }: { uri: string; active: boolean; muted: boolean; onPausedChange: (p: boolean) => void; ref: React.Ref<PlayerHandle> }) {
  const player = useVideoPlayer({ uri }, (p) => { p.loop = true; p.muted = muted; });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const userPaused = useRef(false);
  // expo-video's player is an imperative native object: its properties are set by assignment.
  // eslint-disable-next-line react-hooks/immutability
  useEffect(() => { player.muted = muted; }, [muted, player]);
  useEffect(() => {
    if (active && !userPaused.current) player.play();
    if (!active) { player.pause(); userPaused.current = false; }
  }, [active, player]);
  useEffect(() => { onPausedChange(!isPlaying); }, [isPlaying, onPausedChange]);
  useImperativeHandle(ref, () => ({
    toggle: () => {
      if (player.playing) { userPaused.current = true; player.pause(); }
      else { userPaused.current = false; player.play(); }
    },
  }), [player]);
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} accessible={false} />;
}

export default function FeedItem(p: Props) {
  const { post } = p;
  const { me } = useSession();
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  const playRef = useRef<PlayerHandle | null>(null);
  const [heart] = useState(() => new Animated.Value(0));
  const lastTap = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mine = me?.id === post.author.id;
  const video = post.kind === 'video' ? media(post.videoUrl) : null;
  const still = media(post.imageUrl || post.posterUrl);

  // Count a view after 2 s on screen (once per session).
  useEffect(() => {
    if (!p.active || viewed.has(post.id)) return;
    const t = setTimeout(() => { viewed.add(post.id); api.post(`/api/posts/${post.id}/view`).catch(() => viewed.delete(post.id)); }, 2000);
    return () => clearTimeout(t);
  }, [p.active, post.id]);

  const onTap = () => {
    const t = Date.now();
    if (t - lastTap.current < 300) { // double tap = like
      if (tapTimer.current) clearTimeout(tapTimer.current);
      lastTap.current = 0;
      if (!post.liked) p.onLike();
      heart.setValue(1);
      Animated.timing(heart, { toValue: 0, duration: 800, useNativeDriver: true }).start();
      return;
    }
    lastTap.current = t;
    tapTimer.current = setTimeout(() => playRef.current?.toggle(), 280);
  };

  return (
    <View style={[s.story, { height: p.height }]} accessibilityLabel={`Post by @${post.author.handle}`} testID={`story-${post.id}`}>
      {still ? <Image source={{ uri: still }} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} /> : null}
      {video && p.nearby ? <Player uri={video} active={p.active} muted={p.muted} onPausedChange={setPaused} ref={playRef} /> : null}
      <Pressable style={StyleSheet.absoluteFill} onPress={onTap} accessibilityRole="button"
        accessibilityLabel={`${post.kind === 'video' ? 'Video' : 'Photo'} by @${post.author.handle}${post.altText ? ': ' + post.altText : ''}. Tap to ${paused ? 'play' : 'pause'}, double-tap to like.`}
        accessibilityActions={[{ name: 'activate' }, { name: 'longpress', label: 'Like' }]}
        onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'longpress') p.onLike(); else playRef.current?.toggle(); }} testID="story-surface" />
      {p.header}
      {video ? (
        <Pressable style={s.mute} onPress={p.onToggleMute} accessibilityRole="button" accessibilityLabel={p.muted ? 'Unmute' : 'Mute'} hitSlop={8}>
          <Text style={{ fontSize: 20 }}>{p.muted ? '🔇' : '🔊'}</Text>
        </Pressable>
      ) : null}
      {paused && p.active && video ? <Text style={s.pause} accessible={false} pointerEvents="none">❚❚</Text> : null}
      <Animated.Text pointerEvents="none" style={[s.heart, { opacity: heart, transform: [{ scale: heart.interpolate({ inputRange: [0, 1], outputRange: [1.4, 1] }) }] }]} accessible={false}>♥</Animated.Text>
      <View style={s.body} pointerEvents="box-none">
        <View style={s.handleRow}>
          <Pressable style={s.who} onPress={() => router.push(`/u/${post.author.handle}`)} accessibilityRole="button" accessibilityLabel={`Open @${post.author.handle}’s profile`}>
            <Avatar user={post.author} size={34} /><Text style={s.handle}>@{post.author.handle}</Text>
          </Pressable>
          {mine ? null : (
            <Pressable style={[s.follow, post.author.isFollowing && s.following]} onPress={p.onFollow} accessibilityRole="button"
              accessibilityState={{ selected: post.author.isFollowing }} accessibilityLabel={post.author.isFollowing ? `Following @${post.author.handle}` : `Follow @${post.author.handle}`} testID="follow">
              <Text style={s.followText}>{post.author.isFollowing ? 'Following' : '+ Follow'}</Text>
            </Pressable>
          )}
        </View>
        <Text style={s.caption} numberOfLines={4}>{post.caption}</Text>
        {post.isPaidPartnership ? <Text style={s.tagline}>Paid partnership</Text> : null}
        {post.author.isSample ? <Text style={s.tagline}>Sample account</Text> : null}
        {post.status !== 'published' ? <Text style={s.tagline}>Status: {post.status}</Text> : null}
      </View>
      <View style={s.actions}>
        <ActionButton glyph={post.liked ? '♥' : '♡'} on={post.liked} text={count(post.likes)} label={`Like, ${post.likes} likes`} onPress={p.onLike} testID="like" />
        <ActionButton glyph="💬" text={count(post.comments)} label={`Comments, ${post.comments}`} onPress={p.onComments} testID="comments" />
        <ActionButton glyph={post.saved ? '◆' : '◇'} on={post.saved} text="Save" label="Save" onPress={p.onSave} />
        <ActionButton glyph="↗" text="Share" label="Share" onPress={p.onShare} />
        <ActionButton glyph="⋯" text="More" label="More options and report" onPress={p.onMore} testID="more" />
      </View>
    </View>
  );
}

const shadow = { textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 6 };
const s = StyleSheet.create({
  story: { width: '100%', backgroundColor: '#000', overflow: 'hidden' },
  mute: { position: 'absolute', top: 60, right: 14, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  pause: { position: 'absolute', alignSelf: 'center', top: '42%', fontSize: 54, color: 'rgba(255,255,255,0.85)' },
  heart: { position: 'absolute', alignSelf: 'center', top: '38%', fontSize: 110, color: colors.gold },
  body: { position: 'absolute', left: 14, right: 84, bottom: 18 },
  handleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  handle: { color: '#fff', fontWeight: '800', fontSize: 16, ...shadow },
  follow: { borderWidth: 1, borderColor: colors.gold, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(0,0,0,0.35)' },
  following: { backgroundColor: 'rgba(246,198,111,0.25)' },
  followText: { color: colors.gold, fontWeight: '800' },
  caption: { color: '#fff', marginTop: 8, fontSize: 15, lineHeight: 20, ...shadow },
  tagline: { color: colors.cream, marginTop: 4, fontSize: 12, fontWeight: '700', ...shadow },
  actions: { position: 'absolute', right: 8, bottom: 22, gap: 12, alignItems: 'center' },
});
