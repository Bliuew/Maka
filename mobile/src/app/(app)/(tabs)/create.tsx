import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/Text';
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
import { colors } from '../../../lib/theme';

type Kind = 'video' | 'image';
type Picked = { uri: string; file?: Blob; type: Kind; fileName?: string | null };

function Preview({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri }, (p) => { p.muted = true; p.loop = true; });
  return <VideoView player={player} style={{ width: '100%', height: 300, borderRadius: 10, backgroundColor: '#000' }} nativeControls contentFit="contain" />;
}

export default function Create() {
  const router = useRouter();
  const toast = useToast();
  const { me } = useSession();
  const [kind, setKind] = useState<Kind>('video');
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
      toast.show('Posted');
      setPicked(null); setStep('capture'); setCaption(''); setAltText(''); setVtt(null); setOriginal(false);
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
        <Pills label="Post type" value={kind} onChange={(v) => { setKind(v); setPicked(null); }} options={[{ value: 'video', label: 'Video' }, { value: 'image', label: 'Photo' }]} />
        <View style={st.panel}>
          {picked ? (
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
        <Button title="Next: Edit" block disabled={!picked} onPress={() => setStep('details')} testID="next-edit" />
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
      <Field label="Caption" value={caption} onChangeText={setCaption} multiline maxLength={2200} placeholder="Say something about it. Add #hashtags" testID="caption" />
      <Field label="Description for screen readers" value={altText} onChangeText={setAltText} maxLength={300} placeholder="What happens in the video or photo" />
      {kind === 'video' ? <View style={{ marginTop: 12 }}><Button title={captionsVtt ? 'Captions attached' : 'Add captions (.vtt)'} icon={captionsVtt ? 'checkmark-circle' : 'text-outline'} small variant="secondary" onPress={pickCaptions} /></View> : null}
      <Check label="Allow replies" value={allowComments} onChange={setAllowComments} />
      <Check label="This is a paid partnership (adds a disclosure label)" value={paid} onChange={setPaid} />
      <Check label="This is my original work, or I have the rights to share it" value={original} onChange={setOriginal} testID="original" />
      {busy ? (
        <View style={{ height: 6, backgroundColor: colors.pane2, borderRadius: 3, marginTop: 16, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round((progress || 0) * 100) }}>
          <View style={{ width: `${Math.round((progress || 0) * 100)}%`, height: 6, backgroundColor: colors.gold }} />
        </View>
      ) : null}
      {status ? <P muted>{status}</P> : null}
      <Button title="Publish" block onPress={() => submit(false)} disabled={busy || !picked} testID="publish" />
      <Button title="Save draft" variant="secondary" block onPress={() => submit(true)} disabled={busy || !picked} />
    </Screen>
  );
}

const st = StyleSheet.create({
  panel: { marginTop: 14, minHeight: 360, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.pane, alignItems: 'center', padding: 14, gap: 14 },
  recDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.onGold },
  recHint: { color: colors.muted, fontSize: 14, letterSpacing: 0.4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.lineStrong },
  rowText: { color: colors.text, fontSize: 17 },
});
