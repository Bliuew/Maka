import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/Text';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Banner, Button, Empty, Icon, Loading, P, Pills, Row, Screen, SectionTitle, Sheet, useLoad } from '../../../components/ui';
import { api, media } from '../../../lib/client';
import { useToast } from '../../../lib/toast';
import { colors } from '../../../lib/theme';

type Title = any;

// Plays only what the server has authorised: a licensed stream, in the viewer's territory, inside a rights window.
function LicensedPlayer({ url }: { url: string }) {
  const player = useVideoPlayer({ uri: url }, (p) => p.play());
  return <VideoView player={player} style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 12 }} nativeControls contentFit="contain" />;
}

export default function Cinema() {
  const toast = useToast();
  const [f, setF] = useState({ kind: '', genre: '', list: '' });
  const qs = Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const { data, error, reload, refreshing } = useLoad(() => api.get('/api/cinema?' + qs), [qs]);
  const [open, setOpen] = useState<Title | null>(null);
  const [stream, setStream] = useState<string | null>(null);
  if (!data) return <Loading error={error} onRetry={reload} />;
  const hero = data.items[0];
  const openTitle = async (id: string) => { try { setStream(null); setOpen(await api.get('/api/cinema/' + id)); } catch (e) { toast.error(e); } };
  const play = async () => { try { const r = await api.post(`/api/cinema/${open.id}/play`); setStream(r.streamUrl); } catch (e) { toast.error(e); } };
  const watchlist = async () => {
    try {
      const r = open.inWatchlist ? await api.del(`/api/cinema/${open.id}/watchlist`) : await api.post(`/api/cinema/${open.id}/watchlist`);
      setOpen({ ...open, inWatchlist: r.inWatchlist }); toast.show(r.inWatchlist ? 'Added to My List' : 'Removed from My List');
    } catch (e) { toast.error(e); }
  };
  const poster = (t: Title) => (
    <Pressable key={t.id} style={s.poster} onPress={() => openTitle(t.id)} accessibilityRole="button"
      accessibilityLabel={`${t.name}. ${t.genres.join(', ')}. ${t.availability.playable ? 'Free with ads' : t.isPlaceholder ? 'Placeholder, cannot play' : 'Unavailable'}`} testID="poster">
      {media(t.posterUrl) ? <Image source={{ uri: media(t.posterUrl)! }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}><Icon name="film-outline" size={34} color={colors.faint} /></View>}
      <View style={s.posterTxt}><Text style={s.posterName}>{t.name}</Text>
        <Text style={s.posterSub}>{t.genres.join(' · ')} · {t.availability.playable ? 'Free with ads' : t.isPlaceholder ? 'Placeholder' : 'Unavailable'}</Text></View>
    </Pressable>
  );
  return (
    <Screen title="Cinema" intro={`Free with ads · no subscription · titles licensed for ${data.territory}`} onRefresh={() => reload(true)} refreshing={refreshing}>
      <Pills label="Type" value={f.list ? 'watchlist' : f.kind} onChange={(v) => setF(v === 'watchlist' ? { ...f, list: f.list ? '' : 'watchlist' } : { ...f, kind: v, list: '' })}
        options={[{ value: '', label: 'All' }, { value: 'movie', label: 'Movies' }, { value: 'series', label: 'Series' }, { value: 'documentary', label: 'Documentaries' }, { value: 'watchlist', label: 'My List' }]} />
      <Pills label="Genre" value={f.genre} onChange={(v) => setF({ ...f, genre: v })} options={[{ value: '', label: 'Any genre' }, ...data.genres.map((g: string) => ({ value: g, label: g }))]} />
      {data.licensedCount === 0 ? <Banner>No films are licensed yet. The titles below are fictional placeholders to show how Cinema works — none of them can play.</Banner> : null}
      {hero && !f.list ? (
        <Pressable style={s.hero} onPress={() => openTitle(hero.id)} accessibilityRole="button" accessibilityLabel={`Featured: ${hero.name}. View details`}>
          {media(hero.posterUrl) ? <Image source={{ uri: media(hero.posterUrl)! }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}><Icon name="film-outline" size={44} color={colors.faint} /></View>}
          <View style={s.heroTxt}><Text style={s.badge}>{hero.isPlaceholder ? 'Fictional placeholder' : 'Featured'}</Text><Text style={s.heroName}>{hero.name}</Text><Text style={s.posterSub}>{hero.genres.join(' · ')}</Text></View>
        </Pressable>
      ) : null}
      {data.continueWatching.length ? <><SectionTitle>Continue watching</SectionTitle><View style={s.grid}>{data.continueWatching.map(poster)}</View></> : null}
      <SectionTitle>{f.list ? 'My List' : 'Browse'}</SectionTitle>
      <View style={s.grid}>{data.items.length ? data.items.map(poster) : <Empty>Nothing here yet.</Empty>}</View>
      <Sheet visible={!!open} title={open?.name || ''} onClose={() => { setOpen(null); setStream(null); }}>
        {open ? (
          <>
            {stream ? <LicensedPlayer url={stream} /> : media(open.posterUrl) ? <Image source={{ uri: media(open.posterUrl)! }} style={{ width: '100%', height: 180, borderRadius: 13 }} contentFit="cover" accessible={false} /> : null}
            <P><Text style={{ fontWeight: '800' }}>{open.genres.join(' · ')}</Text> · {open.kind} · {open.language.toUpperCase()} · Rated {open.maturity}</P>
            <P>{open.synopsis}</P>
            {open.availability.playable ? null : <Banner>{open.availability.message}</Banner>}
            <Row wrap>
              <Button title={open.availability.playable ? 'Watch free' : 'Not available'} icon="play" disabled={!open.availability.playable} onPress={play} testID="play-title" />
              <Button title={open.inWatchlist ? 'In My List' : 'My List'} icon={open.inWatchlist ? 'checkmark' : 'add'} variant="secondary" onPress={watchlist} testID="watchlist" />
            </Row>
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  poster: { width: '48%', aspectRatio: 2 / 3, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.pane2, justifyContent: 'flex-end' },
  posterTxt: { padding: 10, backgroundColor: 'rgba(0,0,0,0.55)' },
  posterName: { color: '#fff', fontWeight: '800' },
  posterSub: { color: colors.cream, fontSize: 12, marginTop: 2 },
  hero: { height: 200, borderRadius: 18, overflow: 'hidden', marginVertical: 10, justifyContent: 'flex-end', backgroundColor: colors.pane2 },
  heroTxt: { padding: 14, backgroundColor: 'rgba(0,0,0,0.5)' },
  heroName: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 4 },
  badge: { color: colors.onGold, backgroundColor: colors.gold, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, fontWeight: '800', fontSize: 12, overflow: 'hidden' },
});
