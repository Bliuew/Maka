import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/Text';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Banner, Button, Empty, Loading, P, Pills, Row, Screen, SectionTitle, Sheet, useLoad } from '../../../components/ui';
import PosterArt from '../../../components/PosterArt';
import { api, media } from '../../../lib/client';
import { useToast } from '../../../lib/toast';
import { colors, font, type } from '../../../lib/theme';

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
      <View style={StyleSheet.absoluteFill} onLayout={undefined}>
        {media(t.posterUrl) ? <Image source={{ uri: media(t.posterUrl)! }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <PosterArt id={t.id} width={160} height={240} />}
      </View>
      <View style={s.posterTxt}><Text style={s.posterName} numberOfLines={2}>{t.name}</Text></View>
    </Pressable>
  );
  const kindLabel = (k: string) => ({ movie: 'Feature film', series: 'Series', documentary: 'Documentary' }[k] || k);
  return (
    <Screen eyebrow="Free to watch" title="Cinema" onRefresh={() => reload(true)} refreshing={refreshing}>
      {hero && !f.list ? (
        <View style={s.feature}>
          <View style={s.featureArt}>
            {media(hero.posterUrl) ? <Image source={{ uri: media(hero.posterUrl)! }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <PosterArt id={hero.id} width={400} height={260} />}
            {hero.isPlaceholder ? <View style={s.sampleTag}><Text style={s.sampleText}>Sample</Text></View> : null}
            <View style={s.featureTitleWrap}>
              <Text style={s.featureKind}>{kindLabel(hero.kind)}</Text>
              <Text style={s.featureTitle} numberOfLines={2}>{hero.name}</Text>
            </View>
          </View>
          <View style={s.featureBody}>
            <Text style={s.featureInfo}>{hero.availability.playable ? `Free with ads in ${data.territory}.` : hero.isPlaceholder ? 'Placeholder title. No film has been licensed yet, so it can’t be played.' : hero.availability.message}</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}><Button title={hero.availability.playable ? 'Play free' : 'Not available'} icon={hero.availability.playable ? 'play' : undefined} block disabled={!hero.availability.playable} onPress={() => openTitle(hero.id)} /></View>
              <View style={{ flex: 1 }}><Button title="Details" variant="secondary" block onPress={() => openTitle(hero.id)} /></View>
            </View>
          </View>
        </View>
      ) : null}
      {data.continueWatching.length ? (
        <>
          <SectionTitle>Continue watching</SectionTitle>
          {data.continueWatching.map((t: Title) => (
            <Pressable key={t.id} style={s.cw} onPress={() => openTitle(t.id)} accessibilityRole="button" accessibilityLabel={`Continue ${t.name}`}>
              <View style={{ width: 100 }}>{poster(t)}</View>
              <Text style={s.cwName}>{t.name}</Text>
            </Pressable>
          ))}
        </>
      ) : null}
      <Pills label="Type" value={f.list ? 'watchlist' : f.kind} onChange={(v) => setF(v === 'watchlist' ? { ...f, list: f.list ? '' : 'watchlist' } : { ...f, kind: v, list: '' })}
        options={[{ value: '', label: 'All' }, { value: 'movie', label: 'Movies' }, { value: 'series', label: 'Series' }, { value: 'documentary', label: 'Documentaries' }, { value: 'watchlist', label: 'My List' }]} />
      <Pills label="Genre" value={f.genre} onChange={(v) => setF({ ...f, genre: v })} options={[{ value: '', label: 'Any genre' }, ...data.genres.map((g: string) => ({ value: g, label: g }))]} />
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
              <Button title={open.availability.playable ? 'Watch free' : 'Not available'} icon={open.availability.playable ? 'play' : undefined} disabled={!open.availability.playable} onPress={play} testID="play-title" />
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
  poster: { width: '48%', aspectRatio: 2 / 3, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.pane2, justifyContent: 'flex-end', borderWidth: 1, borderColor: colors.line },
  posterTxt: { padding: 10, backgroundColor: 'rgba(13,11,8,0.72)' },
  posterName: { color: colors.text, fontFamily: font.displayBold, fontSize: 16, lineHeight: 19 },
  feature: { marginTop: 14, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.pane },
  featureArt: { height: 260, overflow: 'hidden', justifyContent: 'flex-end' },
  sampleTag: { position: 'absolute', top: 14, left: 14, backgroundColor: 'rgba(13,11,8,0.8)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  sampleText: { color: colors.text, fontSize: 13 },
  featureTitleWrap: { position: 'absolute', left: 20, right: 20, bottom: 14 },
  featureKind: { ...type.overline, color: colors.cream },
  featureTitle: { fontFamily: font.display, fontSize: 38, lineHeight: 42, letterSpacing: -1, color: '#efdcaa' },
  featureBody: { padding: 20, gap: 16 },
  featureInfo: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  cw: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 12 },
  cwName: { color: colors.text, fontSize: 16 },
});
