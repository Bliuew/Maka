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
import { colors, font, type, words } from '../lib/theme';
import { Icon, type IconName } from './ui';
import { Hex, HexAvatar } from './hex';
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

function RailButton({ icon, label, text, sub, color, onPress, testID, selected, size = 50 }: { icon: IconName; label: string; text?: string; sub?: string; color?: string; onPress: () => void; testID?: string; selected?: boolean; size?: number }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={selected === undefined ? undefined : { selected }} testID={testID}
      style={({ pressed }) => [s.rail, pressed && { transform: [{ scale: 0.9 }] }]} hitSlop={4}>
      <Hex size={size} fill="rgba(27,24,20,0.92)"><Icon name={icon} size={Math.round(size * 0.46)} color={color || colors.gold} /></Hex>
      {text !== undefined ? <Text style={s.railText}>{text}</Text> : null}
      {sub ? <Text style={s.railSub}>{sub}</Text> : null}
    </Pressable>
  );
}

/** Caption with hashtags in honey gold. */
function Caption({ text }: { text: string }) {
  const parts = text.split(/(#[\p{L}\p{N}_]+)/u);
  return <Text style={s.caption} numberOfLines={3}>{parts.map((p, i) => (p.startsWith('#') ? <Text key={i} style={{ color: colors.gold }}>{p}</Text> : p))}</Text>;
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
        {post.caption ? <Caption text={post.caption} /> : null}
        {post.kind === 'video' ? (
          <View style={s.sound}><Icon name="musical-notes-outline" size={16} color={colors.gold} /><Text style={s.soundText} numberOfLines={1}>Original sound - {post.author.displayName}</Text></View>
        ) : null}
        <View style={s.chips}>
          {post.isPaidPartnership ? <Text style={s.chip}>Paid partnership</Text> : null}
          {post.author.isSample ? <Text style={s.chip}>Sample account</Text> : null}
          {post.status !== 'published' ? <Text style={s.chip}>{post.status}</Text> : null}
        </View>
        <View style={s.followRow}>
          <Text style={s.swarm} accessibilityLabel={`${post.author.followers} followers`}><Text style={{ fontFamily: font.bold }}>{count(post.author.followers)}</Text> {words.followers}</Text>
          {mine ? null : (
            <Pressable onPress={() => { tap(); p.onFollow(); }} accessibilityRole="button" testID="follow" accessibilityState={{ selected: post.author.isFollowing }}
              accessibilityLabel={post.author.isFollowing ? `Following @${post.author.handle}` : `Follow @${post.author.handle}`}
              style={[s.followBtn, post.author.isFollowing && s.followingBtn]}>
              <Text style={[s.followText, post.author.isFollowing && { color: colors.text }]}>{post.author.isFollowing ? 'Following' : 'Follow'}</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={s.actions}>
        <Pressable onPress={() => router.push(`/u/${post.author.handle}`)} accessibilityRole="button" accessibilityLabel={`Open @${post.author.handle}’s profile`} style={{ marginBottom: 4 }}>
          <HexAvatar user={post.author} size={56} ring={false} />
        </Pressable>
        <RailButton icon={post.liked ? 'heart' : 'heart-outline'} selected={post.liked} text={count(post.likes)} sub={words.likes} label={`Like, ${post.likes} likes`} onPress={like} testID="like" size={54} />
        <RailButton icon="chatbubble-outline" text={count(post.comments)} sub={words.comments} label={`Comments, ${post.comments}`} onPress={p.onComments} testID="comments" />
        <RailButton icon={post.saved ? 'bookmark' : 'bookmark-outline'} selected={post.saved} sub={words.save} label={post.saved ? 'Saved to your Jar' : 'Save to your Jar'} onPress={p.onSave} />
        <RailButton icon="arrow-redo-outline" sub="Share" label="Share" onPress={p.onShare} />
        <RailButton icon="ellipsis-horizontal" label="More options and report" onPress={p.onMore} testID="more" size={40} />
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
  body: { position: 'absolute', left: 18, right: 92, bottom: 22 },
  handle: { color: colors.text, fontFamily: font.display, fontSize: 20, letterSpacing: -0.3, ...shadow },
  caption: { ...type.body, color: colors.text, marginTop: 6, ...shadow },
  sound: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  soundText: { color: colors.muted, fontSize: 14, flexShrink: 1, ...shadow },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { ...type.caption, color: colors.text, backgroundColor: 'rgba(27,24,20,0.8)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  followRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 },
  swarm: { color: colors.text, fontSize: 15, ...shadow },
  followBtn: { backgroundColor: colors.gold, borderRadius: 10, paddingHorizontal: 20, height: 42, justifyContent: 'center' },
  followingBtn: { backgroundColor: 'rgba(13,11,8,0.6)', borderWidth: 1, borderColor: colors.lineStrong },
  followText: { color: colors.onGold, fontFamily: font.medium, fontSize: 15 },
  actions: { position: 'absolute', right: 10, bottom: 24, alignItems: 'center', gap: 10 },
  rail: { alignItems: 'center', minWidth: 52 },
  railText: { color: colors.text, fontFamily: font.medium, fontSize: 14, marginTop: 3, ...shadow },
  railSub: { color: colors.muted, fontSize: 12, ...shadow },
});
