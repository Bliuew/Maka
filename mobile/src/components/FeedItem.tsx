// One full-screen story in the vertical feed.
import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Text } from './Text';
import { api, media } from '../lib/client';
import { count } from '../core/format';
import { colors, font, type } from '../lib/theme';
import { Avatar, Icon, type IconName } from './ui';
import { type Post } from './post';
import { useSession } from '../lib/session';

type Props = {
  post: Post; height: number; active: boolean; nearby: boolean; muted: boolean;
  onToggleMute: () => void; onLike: () => void; onSave: () => void; onFollow: () => void; onShare: () => void;
  onComments: () => void; onMore: () => void; header?: React.ReactNode;
};

const viewed = new Set<string>();
const tap = () => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

type PlayerHandle = { toggle: () => void };

function Player({ uri, active, muted, onPausedChange, ref }: { uri: string; active: boolean; muted: boolean; onPausedChange: (p: boolean) => void; ref: React.Ref<PlayerHandle> }) {
  const player = useVideoPlayer({ uri }, (p) => { p.loop = true; p.muted = muted; p.timeUpdateEventInterval = 0.25; });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const time = useEvent(player, 'timeUpdate', null);
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
  const progress = time && player.duration ? Math.min(1, time.currentTime / player.duration) : 0;
  return (
    <>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} accessible={false} />
      <View style={s.track} pointerEvents="none"><View style={[s.progress, { width: `${progress * 100}%` }]} /></View>
    </>
  );
}

function RailButton({ icon, label, text, color, onPress, testID, selected }: { icon: IconName; label: string; text?: string; color?: string; onPress: () => void; testID?: string; selected?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={selected === undefined ? undefined : { selected }} testID={testID}
      style={({ pressed }) => [s.rail, pressed && { transform: [{ scale: 0.88 }] }]} hitSlop={6}>
      <Icon name={icon} size={33} color={color || '#fff'} style={s.iconShadow} />
      {text !== undefined ? <Text style={s.railText}>{text}</Text> : null}
    </Pressable>
  );
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

  const like = () => { if (!post.liked) tap(); p.onLike(); };
  const onSurface = () => {
    const t = Date.now();
    if (t - lastTap.current < 300) { // double tap = like
      if (tapTimer.current) clearTimeout(tapTimer.current);
      lastTap.current = 0;
      if (!post.liked) like();
      heart.setValue(1);
      Animated.timing(heart, { toValue: 0, duration: 900, useNativeDriver: true }).start();
      return;
    }
    lastTap.current = t;
    tapTimer.current = setTimeout(() => playRef.current?.toggle(), 280);
  };

  return (
    <View style={[s.story, { height: p.height }]} accessibilityLabel={`Post by @${post.author.handle}`} testID={`story-${post.id}`}>
      {still ? <Image source={{ uri: still }} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} /> : null}
      {video && p.nearby ? <Player uri={video} active={p.active} muted={p.muted} onPausedChange={setPaused} ref={playRef} /> : null}
      <LinearGradient colors={['rgba(0,0,0,0.45)', 'transparent']} style={s.topShade} pointerEvents="none" />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={s.bottomShade} pointerEvents="none" />
      <Pressable style={StyleSheet.absoluteFill} onPress={onSurface} accessibilityRole="button"
        accessibilityLabel={`${post.kind === 'video' ? 'Video' : 'Photo'} by @${post.author.handle}${post.altText ? ': ' + post.altText : ''}. Tap to ${paused ? 'play' : 'pause'}, double-tap to like.`}
        accessibilityActions={[{ name: 'activate' }, { name: 'longpress', label: 'Like' }]}
        onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'longpress') like(); else playRef.current?.toggle(); }} testID="story-surface" />
      {p.header}
      {video ? (
        <Pressable style={s.mute} onPress={p.onToggleMute} accessibilityRole="button" accessibilityLabel={p.muted ? 'Unmute' : 'Mute'} hitSlop={10}>
          <Icon name={p.muted ? 'volume-mute' : 'volume-high'} size={18} color="#fff" />
        </Pressable>
      ) : null}
      {paused && p.active && video ? <View style={s.pause} pointerEvents="none"><Icon name="play" size={64} color="rgba(255,255,255,0.85)" /></View> : null}
      <Animated.View pointerEvents="none" style={[s.heart, { opacity: heart, transform: [{ scale: heart.interpolate({ inputRange: [0, 1], outputRange: [1.35, 1] }) }] }]}>
        <Icon name="heart" size={110} color={colors.like} />
      </Animated.View>

      <View style={s.body} pointerEvents="box-none">
        <Pressable onPress={() => router.push(`/u/${post.author.handle}`)} accessibilityRole="button" accessibilityLabel={`Open @${post.author.handle}’s profile`} style={{ alignSelf: 'flex-start' }}>
          <Text style={s.handle}>@{post.author.handle}</Text>
        </Pressable>
        {post.caption ? <Text style={s.caption} numberOfLines={3}>{post.caption}</Text> : null}
        <View style={s.chips}>
          {post.isPaidPartnership ? <Text style={s.chip}>Paid partnership</Text> : null}
          {post.author.isSample ? <Text style={s.chip}>Sample account</Text> : null}
          {post.status !== 'published' ? <Text style={s.chip}>{post.status}</Text> : null}
        </View>
      </View>

      <View style={s.actions}>
        <View style={s.avatarWrap}>
          <Pressable onPress={() => router.push(`/u/${post.author.handle}`)} accessibilityRole="button" accessibilityLabel={`Open @${post.author.handle}’s profile`}>
            <View style={s.avatarRing}><Avatar user={post.author} size={46} /></View>
          </Pressable>
          {mine ? null : (
            <Pressable style={[s.follow, post.author.isFollowing && s.following]} onPress={() => { tap(); p.onFollow(); }} accessibilityRole="button" hitSlop={8}
              accessibilityState={{ selected: post.author.isFollowing }} accessibilityLabel={post.author.isFollowing ? `Following @${post.author.handle}` : `Follow @${post.author.handle}`} testID="follow">
              <Icon name={post.author.isFollowing ? 'checkmark' : 'add'} size={14} color={post.author.isFollowing ? colors.onGold : '#fff'} />
            </Pressable>
          )}
        </View>
        <RailButton icon={post.liked ? 'heart' : 'heart-outline'} color={post.liked ? colors.like : '#fff'} selected={post.liked} text={count(post.likes)} label={`Like, ${post.likes} likes`} onPress={like} testID="like" />
        <RailButton icon="chatbubble-ellipses-outline" text={count(post.comments)} label={`Comments, ${post.comments}`} onPress={p.onComments} testID="comments" />
        <RailButton icon={post.saved ? 'bookmark' : 'bookmark-outline'} color={post.saved ? colors.gold : '#fff'} selected={post.saved} text="Save" label="Save" onPress={p.onSave} />
        <RailButton icon="arrow-redo-outline" text="Share" label="Share" onPress={p.onShare} />
        <RailButton icon="ellipsis-horizontal" label="More options and report" onPress={p.onMore} testID="more" />
      </View>
    </View>
  );
}

const shadow = { textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 } };
const s = StyleSheet.create({
  story: { width: '100%', backgroundColor: '#000', overflow: 'hidden' },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0, height: 140 },
  bottomShade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 280 },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.18)' },
  progress: { height: 2, backgroundColor: colors.cream },
  mute: { position: 'absolute', top: 56, right: 16, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 18, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  pause: { position: 'absolute', alignSelf: 'center', top: '42%' },
  heart: { position: 'absolute', alignSelf: 'center', top: '36%' },
  body: { position: 'absolute', left: 16, right: 92, bottom: 22 },
  handle: { color: '#fff', fontFamily: font.bold, fontSize: 16, ...shadow },
  caption: { ...type.body, color: '#fff', marginTop: 6, ...shadow },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { ...type.caption, color: '#fff', backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  actions: { position: 'absolute', right: 10, bottom: 20, alignItems: 'center', gap: 16 },
  avatarWrap: { alignItems: 'center', marginBottom: 6 },
  avatarRing: { borderWidth: 1.5, borderColor: '#fff', borderRadius: 26, padding: 1 },
  follow: { position: 'absolute', bottom: -9, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.like, alignItems: 'center', justifyContent: 'center' },
  following: { backgroundColor: colors.gold },
  rail: { alignItems: 'center', minWidth: 48, minHeight: 48, justifyContent: 'center' },
  iconShadow: { textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6 },
  railText: { color: '#fff', fontFamily: font.semibold, fontSize: 12, marginTop: 2, ...shadow },
});
