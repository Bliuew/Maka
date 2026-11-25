import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../../components/Text';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useRouter } from 'expo-router';
import { Banner, Button, Check, Choice, Field, Icon, P, Pills, Screen, Sheet } from '../../../components/ui';
import { Hex } from '../../../components/hex';
import { api } from '../../../lib/client';
import { useSession } from '../../../lib/session';
import { useToast } from '../../../lib/toast';
import { getPending, setPending, uploadAsset, waitForMedia, type PendingUpload } from '../../../lib/uploads';
import { colors, font } from '../../../lib/theme';

type Kind = 'video' | 'image';
type Mode = 'video' | 'image' | 'carousel' | 'text';
type Picked = { uri: string; file?: Blob; type: Kind; fileName?: string | null };

function Preview({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri }, (p) => { p.muted = true; p.loop = true; });
  return <VideoView player={player} style={{ width: '100%', height: 300, borderRadius: 10, backgroundColor: '#000' }} nativeControls contentFit="contain" />;
}

export default function Create() {
  const router = useRouter();
  const toast = useToast();
  const { me } = useSession();
  const [mode, setMode] = useState<Mode>('video');
  const kind: Kind = mode === 'video' ? 'video' : 'image';
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [textBody, setTextBody] = useState('');
  const [textStyle, setTextStyle] = useState<'honey' | 'midnight' | 'cream'>('honey');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [caption, setCaption] = useState('');
  const [altText, setAltText] = useState('');
  const [remixPolicy, setRemix] = useState<string>(me?.defaultRemix || 'followers');
  const [allowComments, setAllowComments] = useState(true);
  const [paid, setPaid] = useState(false);
  const [original, setOriginal] = useState(false);
  const [captionsVtt, setVtt] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  // An unfinished upload from an earlier session can be resumed if the file is still on the device.
  const [step, setStep] = useState<'capture' | 'details'>('capture');
  const [remixSheet, setRemixSheet] = useState(false);
  const [drafts, setDrafts] = useState(0);
  useEffect(() => { api.get('/api/studio').then((r) => setDrafts(r.drafts.length)).catch(() => {}); }, []);
  const [pending, setPendingState] = useState<PendingUpload | null>(() => {
    const p = getPending();
    return p && Platform.OS !== 'web' && new File(p.uri).exists ? p : null;
  });
  useEffect(() => { if (!pending && getPending()) setPending(null); }, [pending]);

  const pick = async (source: 'camera' | 'library') => {
    try {
      const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { toast.show(source === 'camera' ? 'Camera access is needed to record. You can allow it in Settings.' : 'Photo library access is needed to choose a file.', true); return; }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: kind === 'video' ? 'videos' : 'images', videoMaxDuration: 600, quality: 1, exif: false };
      const r = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      setPicked({ uri: a.uri, file: (a as any).file, type: kind, fileName: a.fileName });
    } catch (e) { toast.error(e); }
  };

  const pickMany = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { toast.show('Photo library access is needed to choose photos.', true); return; }
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsMultipleSelection: true, selectionLimit: 10 - photos.length, orderedSelection: true, quality: 1, exif: false });
      if (r.canceled) return;
      setPhotos([...photos, ...r.assets.map((a) => ({ uri: a.uri, file: (a as any).file, type: 'image' as Kind, fileName: a.fileName }))].slice(0, 10));
    } catch (e) { toast.error(e); }
  };

  const reset = () => { setPicked(null); setPhotos([]); setTextBody(''); setStep('capture'); setCaption(''); setAltText(''); setVtt(null); setOriginal(false); };
  const finish = (r: any) => {
    if (r.held) { toast.show('Your post is held for review because it may break the Community Guidelines.', true); router.push('/studio'); return; }
    if (r.post.status === 'draft') { toast.show('Draft saved to Creator Studio'); router.push('/studio'); return; }
    toast.show('Posted'); reset(); router.push(`/p/${r.post.id}`);
  };
  const common = (draft: boolean) => ({ remixPolicy, allowComments, paidPartnership: paid, draft });

  const submitText = async (draft: boolean) => {
    if (!original) { toast.show('Please confirm this is your own writing.', true); return; }
    try { setProgress(1); finish(await api.post('/api/posts', { kind: 'text', caption: textBody, textStyle, ...common(draft) })); }
    catch (e) { toast.error(e); } finally { setProgress(null); }
  };

  const submitCarousel = async (draft: boolean) => {
    if (!original) { toast.show('Please confirm you have the rights to share these photos.', true); return; }
    try {
      const ids: string[] = [];
      for (const [i, ph] of photos.entries()) {
        setStatus(`Uploading photo ${i + 1} of ${photos.length}…`);
        const id = await uploadAsset(ph, 'image', {}, (f) => setProgress((i + f) / photos.length));
        const st = await waitForMedia(api, id);
        if (st.status !== 'ready') throw new Error(`Photo ${i + 1} could not be processed: ${st.error || 'unknown error'}`);
        ids.push(id);
      }
      setStatus('');
      setPending(null); setPendingState(null);
      finish(await api.post('/api/posts', { kind: 'carousel', mediaIds: ids, caption, altText, ...common(draft) }));
    } catch (e: any) {
      toast.error(e);
      setStatus(e?.code === 'offline' || e?.status === 0 ? 'Upload paused. Publish again when you’re back online; finished photos continue where they stopped.' : '');
    } finally { setProgress(null); }
  };

  const publish = (draft: boolean) => (mode === 'text' ? submitText(draft) : mode === 'carousel' ? submitCarousel(draft) : submit(draft));
  const canContinue = mode === 'text' ? textBody.trim().length > 0 : mode === 'carousel' ? photos.length >= 2 : !!picked;

  const pickCaptions = async () => {
    try {
      const r: any = await File.pickFileAsync({ mimeTypes: ['text/vtt', 'text/plain', '*/*'] } as any);
      if (r?.canceled || !r?.result) return;
      const text = await r.result.text();
      if (!text.startsWith('WEBVTT')) { toast.show('Captions must be a WebVTT (.vtt) file.', true); return; }
      setVtt(text); toast.show('Captions attached');
    } catch (e) { toast.error(e); }
  };

  const submit = async (draft: boolean, resumeFrom?: PendingUpload) => {
    const asset = resumeFrom ? { uri: resumeFrom.uri } : picked;
    const k = (resumeFrom?.kind || kind) as Kind;
    const form = resumeFrom?.form || { caption, altText, captionsVtt, remixPolicy, allowComments, paidPartnership: paid, draft };
    if (!asset) { toast.show('Choose a video or photo first.', true); return; }
    if (!resumeFrom && !original) { toast.show('Please confirm you have the rights to share this.', true); return; }
    try {
      setProgress(0); setStatus('Uploading…');
      const mediaId = await uploadAsset(asset, k, form, (f) => { setProgress(f); setStatus(`Uploading… ${Math.round(f * 100)}%`); });
      setStatus('Processing (checking and optimising your file)…');
      const r = await api.post('/api/posts', { mediaId, ...form });
      setPending(null); setPendingState(null);
      if (r.held) { toast.show('Your post is held for review because the caption may break the Community Guidelines.', true); router.push('/studio'); return; }
      const s = await waitForMedia(api, mediaId);
      if (s.status !== 'ready') throw new Error('Your file could not be processed: ' + (s.error || 'unknown error'));
      if (r.post.status === 'draft') { toast.show('Draft saved to Creator Studio'); router.push('/studio'); return; }
      toast.show('Posted'); reset();
      router.push(`/p/${r.post.id}`);
    } catch (e: any) {
      toast.error(e);
      setStatus(e?.code === 'offline' || e?.status === 0 ? 'Upload paused. Tap Resume upload when you’re back online and it will continue where it stopped.' : '');
      if (Platform.OS !== 'web') setPendingState(getPending());
    } finally { setProgress(null); }
  };

  const busy = progress !== null;
  const remixLabel = { followers: 'Followers', everyone: 'Everyone', nobody: 'Nobody' }[remixPolicy] || remixPolicy;
  const resumeBanner = pending && !busy ? (
    <Banner>An upload didn’t finish{pending.state ? ` (${Math.round((pending.state.received / pending.size) * 100)}% sent)` : ''}. You can resume it without starting over.
      {'\n'}<Text style={{ color: colors.gold, fontWeight: '700' }} onPress={() => submit(!!pending.form.draft, pending)} accessibilityRole="button">Resume upload</Text>
      {'   '}<Text style={{ color: colors.muted }} onPress={() => { setPending(null); setPendingState(null); }} accessibilityRole="button">Discard</Text></Banner>
  ) : null;

  if (step === 'capture') {
    return (
      <Screen title="Create" right={<Pressable onPress={() => router.navigate('/')} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={{ marginTop: 6 }}><Icon name="close" size={30} /></Pressable>}>
        {resumeBanner}
        <Pills label="Post type" value={mode} onChange={(v) => { if (v === 'live') { router.push('/live'); return; } setMode(v as Mode); setPicked(null); }}
          options={[{ value: 'video', label: 'Video' }, { value: 'image', label: 'Photo' }, { value: 'carousel', label: 'Carousel' }, { value: 'text', label: 'Text' }, { value: 'live', label: 'Live' }]} />
        <View style={st.panel}>
          {mode === 'text' ? (
            <View style={{ alignSelf: 'stretch', gap: 12 }}>
              <View style={[st.textPreview, textStyle === 'midnight' ? { backgroundColor: colors.bg } : textStyle === 'cream' ? { backgroundColor: colors.cream } : { backgroundColor: colors.honeyBottom }]}>
                <TextInput value={textBody} onChangeText={setTextBody} multiline maxLength={500} placeholder="What’s on your mind?" accessibilityLabel="Your text post" testID="text-body"
                  placeholderTextColor={textStyle === 'midnight' ? colors.faint : 'rgba(26,20,10,0.5)'}
                  style={{ color: textStyle === 'midnight' ? colors.cream : colors.onGold, fontFamily: font.display, fontSize: 26, lineHeight: 31, textAlign: 'center', minHeight: 200 }} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14 }} accessibilityRole="radiogroup" accessibilityLabel="Background">
                {(['honey', 'midnight', 'cream'] as const).map((k) => (
                  <Pressable key={k} onPress={() => setTextStyle(k)} accessibilityRole="radio" accessibilityState={{ selected: textStyle === k }} accessibilityLabel={`${k} background`}
                    style={[st.swatch, { backgroundColor: k === 'honey' ? colors.honeyBottom : k === 'midnight' ? colors.bg : colors.cream }, textStyle === k && { borderColor: colors.gold, borderWidth: 3 }]} />
                ))}
              </View>
              <Text style={st.recHint}>{textBody.length}/500</Text>
            </View>
          ) : mode === 'carousel' ? (
            <View style={{ alignSelf: 'stretch', gap: 14, alignItems: 'center' }}>
              {photos.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }} style={{ alignSelf: 'stretch' }}>
                  {photos.map((ph, i) => (
                    <View key={ph.uri + i}>
                      <Image source={{ uri: ph.uri }} style={st.thumb} contentFit="cover" accessibilityLabel={`Photo ${i + 1}`} />
                      <Pressable onPress={() => setPhotos(photos.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={`Remove photo ${i + 1}`} style={st.remove} hitSlop={6}><Icon name="close" size={14} color={colors.onGold} /></Pressable>
                      <Text style={st.thumbNum}>{i + 1}</Text>
                    </View>
                  ))}
                </ScrollView>
              ) : <View style={{ marginTop: 90 }}><Hex size={92} fill={colors.pane2}><Icon name="images-outline" size={38} color={colors.gold} /></Hex></View>}
              <Text style={st.recHint}>{photos.length ? `${photos.length} of 10 photos` : 'Choose 2 to 10 photos'}</Text>
              {photos.length < 10 ? <Button title={photos.length ? 'Add more photos' : 'Choose photos'} icon="images-outline" small variant="secondary" onPress={pickMany} testID="pick-photos" /> : null}
            </View>
          ) : picked ? (
            <>
              {picked.type === 'video' ? <Preview uri={picked.uri} /> : <Image source={{ uri: picked.uri }} style={{ width: '100%', height: 300, borderRadius: 10 }} contentFit="contain" accessibilityLabel="Selected photo preview" />}
              <Button title="Choose another" small variant="secondary" onPress={() => setPicked(null)} />
            </>
          ) : (
            <>
              <Pressable onPress={() => pick('camera')} disabled={Platform.OS === 'web'} accessibilityRole="button" accessibilityLabel={kind === 'video' ? 'Record video' : 'Take photo'}
                style={({ pressed }) => [{ marginTop: 120 }, pressed && { transform: [{ scale: 0.94 }] }, Platform.OS === 'web' && { opacity: 0.5 }]}>
                <Hex size={92} fill={colors.gold}><View style={st.recDot} /></Hex>
              </Pressable>
              <Text style={st.recHint}>{kind === 'video' ? 'Tap to record · up to 10 min' : 'Tap to take a photo'}</Text>
              <Button title="Upload from library" icon="images-outline" small variant="secondary" onPress={() => pick('library')} testID="pick-library" />
            </>
          )}
        </View>
        <Pressable style={st.row} onPress={() => router.push('/studio')} accessibilityRole="button" accessibilityLabel={`Drafts, ${drafts}`}>
          <Text style={st.rowText}>Drafts ({drafts})</Text><Icon name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
        <Pressable style={st.row} onPress={() => setRemixSheet(true)} accessibilityRole="button" accessibilityLabel={`Who can remix: ${remixLabel}`}>
          <Text style={st.rowText}>Who can remix: <Text style={{ color: colors.muted }}>{remixLabel}</Text></Text><Icon name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
        <Button title="Next: Edit" block disabled={!canContinue} onPress={() => setStep('details')} testID="next-edit" />
        <Sheet visible={remixSheet} title="Who can stitch or remix" onClose={() => setRemixSheet(false)}>
          <Choice label="Who can stitch or remix this" value={remixPolicy} onChange={(v) => { setRemix(v); setRemixSheet(false); }} options={[
            { value: 'followers', label: 'Followers' }, { value: 'everyone', label: 'Everyone' }, { value: 'nobody', label: 'Nobody' }]} />
        </Sheet>
      </Screen>
    );
  }

  return (
    <Screen title="Edit" right={<Pressable onPress={() => setStep('capture')} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} style={{ marginTop: 6 }}><Icon name="chevron-back" size={30} /></Pressable>}>
      {resumeBanner}
      {mode === 'text' ? <Banner>Your text post: “{textBody.trim().slice(0, 80)}{textBody.trim().length > 80 ? '…' : ''}”</Banner> : (
        <>
          <Field label="Caption" value={caption} onChangeText={setCaption} multiline maxLength={2200} placeholder="Say something about it. Add #hashtags" testID="caption" />
          <Field label="Description for screen readers" value={altText} onChangeText={setAltText} maxLength={300} placeholder={mode === 'carousel' ? 'What the photos show' : 'What happens in the video or photo'} />
        </>
      )}
      {mode === 'video' ? <View style={{ marginTop: 12 }}><Button title={captionsVtt ? 'Captions attached' : 'Add captions (.vtt)'} icon={captionsVtt ? 'checkmark-circle' : 'text-outline'} small variant="secondary" onPress={pickCaptions} /></View> : null}
      <Check label="Allow replies" value={allowComments} onChange={setAllowComments} />
      <Check label="This is a paid partnership (adds a disclosure label)" value={paid} onChange={setPaid} />
      <Check label={mode === 'text' ? 'This is my own writing' : 'This is my original work, or I have the rights to share it'} value={original} onChange={setOriginal} testID="original" />
      {busy ? (
        <View style={{ height: 6, backgroundColor: colors.pane2, borderRadius: 3, marginTop: 16, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round((progress || 0) * 100) }}>
          <View style={{ width: `${Math.round((progress || 0) * 100)}%`, height: 6, backgroundColor: colors.gold }} />
        </View>
      ) : null}
      {status ? <P muted>{status}</P> : null}
      <Button title="Publish" block onPress={() => publish(false)} disabled={busy || !canContinue} testID="publish" />
      <Button title="Save draft" variant="secondary" block onPress={() => publish(true)} disabled={busy || !canContinue} />
    </Screen>
  );
}

const st = StyleSheet.create({
  panel: { marginTop: 14, minHeight: 360, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.pane, alignItems: 'center', padding: 14, gap: 14 },
  recDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.onGold },
  recHint: { color: colors.muted, fontSize: 14, letterSpacing: 0.4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.lineStrong },
  rowText: { color: colors.text, fontSize: 17 },
  textPreview: { borderRadius: 12, padding: 20, justifyContent: 'center', minHeight: 240 },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.lineStrong },
  thumb: { width: 92, height: 120, borderRadius: 10, backgroundColor: colors.pane2 },
  remove: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  thumbNum: { position: 'absolute', bottom: 6, left: 8, color: '#fff', fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 4 },
});
