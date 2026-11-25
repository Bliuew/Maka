import React, { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useRouter } from 'expo-router';
import { Banner, Button, Check, Choice, Field, P, Pills, Row, Screen } from '../../../components/ui';
import { api } from '../../../lib/client';
import { useSession } from '../../../lib/session';
import { useToast } from '../../../lib/toast';
import { getPending, setPending, uploadAsset, waitForMedia, type PendingUpload } from '../../../lib/uploads';
import { colors } from '../../../lib/theme';

type Kind = 'video' | 'image';
type Picked = { uri: string; file?: Blob; type: Kind; fileName?: string | null };

function Preview({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri }, (p) => { p.muted = true; p.loop = true; });
  return <VideoView player={player} style={{ width: '100%', height: 260, borderRadius: 14, backgroundColor: '#000', marginTop: 10 }} nativeControls contentFit="contain" />;
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
      toast.show('Posted! 🎉');
      setPicked(null); setCaption(''); setAltText(''); setVtt(null); setOriginal(false);
      router.push(`/p/${r.post.id}`);
    } catch (e: any) {
      toast.error(e);
      setStatus(e?.code === 'offline' || e?.status === 0 ? 'Upload paused — it will resume from where it stopped. Tap “Resume upload” when you’re back online.' : '');
      if (Platform.OS !== 'web') setPendingState(getPending());
    } finally { setProgress(null); }
  };

  const busy = progress !== null;
  return (
    <Screen eyebrow="Your voice matters" title="Create" intro="Share an original video or photo. No follower-based tiers — every creator starts on equal footing.">
      {pending && !busy ? (
        <Banner>An upload didn’t finish{pending.state ? ` (${Math.round((pending.state.received / pending.size) * 100)}% sent)` : ''}. You can resume it without starting over.
          {'\n'}<Text style={{ color: colors.gold, fontWeight: '800' }} onPress={() => submit(!!pending.form.draft, pending)} accessibilityRole="button">Resume upload</Text>
          {'   '}<Text style={{ color: colors.muted }} onPress={() => { setPending(null); setPendingState(null); }} accessibilityRole="button">Discard</Text></Banner>
      ) : null}
      <Pills label="Post type" value={kind} onChange={(v) => { setKind(v); setPicked(null); }} options={[{ value: 'video', label: '▸ Video' }, { value: 'image', label: '▧ Photo' }]} />
      <Row wrap>
        <Button title={kind === 'video' ? 'Record video' : 'Take photo'} onPress={() => pick('camera')} disabled={busy || Platform.OS === 'web'} />
        <Button title="Choose from library" variant="secondary" onPress={() => pick('library')} disabled={busy} testID="pick-library" />
      </Row>
      {picked ? (picked.type === 'video' ? <Preview uri={picked.uri} /> :
        <Image source={{ uri: picked.uri }} style={{ width: '100%', height: 260, borderRadius: 14, marginTop: 10 }} contentFit="contain" accessibilityLabel="Selected photo preview" />) : null}
      <Field label="Caption" value={caption} onChangeText={setCaption} multiline maxLength={2200} placeholder="Tell your story… #hashtags" testID="caption" />
      <Field label="Description for screen readers" value={altText} onChangeText={setAltText} maxLength={300} placeholder="What happens in the video or photo" />
      {kind === 'video' ? <View style={{ marginTop: 10 }}><Button title={captionsVtt ? 'Captions attached ✓' : 'Add captions file (.vtt, optional)'} small variant="secondary" onPress={pickCaptions} /></View> : null}
      <Choice label="Who can stitch or remix this" value={remixPolicy} onChange={setRemix} options={[
        { value: 'followers', label: 'Followers' }, { value: 'everyone', label: 'Everyone' }, { value: 'nobody', label: 'Nobody' }]} />
      <Check label="Allow comments" value={allowComments} onChange={setAllowComments} />
      <Check label="This is a paid partnership (adds a disclosure label)" value={paid} onChange={setPaid} />
      <Check label="This is my original content or I have the rights to share it" value={original} onChange={setOriginal} testID="original" />
      {busy ? (
        <View style={{ height: 8, backgroundColor: colors.pane2, borderRadius: 4, marginTop: 14, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round((progress || 0) * 100) }}>
          <View style={{ width: `${Math.round((progress || 0) * 100)}%`, height: 8, backgroundColor: colors.gold }} />
        </View>
      ) : null}
      {status ? <P muted>{status}</P> : null}
      <Row wrap style={{ marginTop: 6 }}>
        <Button title="Publish" onPress={() => submit(false)} disabled={busy || !picked} testID="publish" />
        <Button title="Save draft" variant="secondary" onPress={() => submit(true)} disabled={busy || !picked} />
      </Row>
    </Screen>
  );
}
