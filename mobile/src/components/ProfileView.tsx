import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Avatar, Button, Card, Field, Icon, Loading, Metrics, P, Row, Screen, SectionTitle, Sheet, Tag, useLoad } from './ui';
import { ReportSheet } from './post';
import { api, media } from '../lib/client';
import { count } from '../core/format';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import { uploadAsset, waitForMedia } from '../lib/uploads';
import { colors } from '../lib/theme';

export default function ProfileView({ userKey }: { userKey: string }) {
  const router = useRouter();
  const toast = useToast();
  const { me, setMe } = useSession();
  const { data, error, reload, refreshing, setData } = useLoad(() => api.get('/api/users/' + encodeURIComponent(userKey)), [userKey]);
  const [more, setMore] = useState(false);
  const [report, setReport] = useState(false);
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(''); const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState<{ uri: string; file?: Blob } | null>(null);
  if (!data) return <Loading error={error} onRetry={reload} />;
  const u = data.user;
  const own = u.id === me?.id;
  const act = (fn: () => Promise<unknown>) => async () => { try { await fn(); } catch (e) { toast.error(e); } };
  const follow = act(async () => {
    const r = u.isFollowing ? await api.del(`/api/users/${u.id}/follow`) : await api.post(`/api/users/${u.id}/follow`);
    setData({ ...data, user: r }); toast.show(r.isFollowing ? `Following @${r.handle}` : `Unfollowed @${r.handle}`);
  });
  const block = () => Alert.alert(`Block @${u.handle}?`, 'They won’t be able to see your posts, comment, follow or message you.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Block', style: 'destructive', onPress: act(async () => { await api.post(`/api/users/${u.id}/block`); setMore(false); toast.show(`Blocked @${u.handle}`); reload(); }) },
  ]);
  const saveProfile = act(async () => {
    const body: any = { displayName: name, bio };
    if (avatar) {
      const id = await uploadAsset(avatar, 'image', {}, () => {});
      const s = await waitForMedia(api, id);
      if (s.status !== 'ready') throw new Error(s.error || 'Photo could not be processed.');
      body.avatarMediaId = id;
    }
    setMe(await api.patch('/api/me', body)); setEdit(false); toast.show('Profile saved'); reload();
  });
  const pickAvatar = act(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new Error('Photo library access is needed to choose a profile photo.');
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.9, exif: false });
    if (!r.canceled && r.assets[0]) setAvatar({ uri: r.assets[0].uri, file: (r.assets[0] as any).file });
  });

  return (
    <Screen onRefresh={() => reload(true)} refreshing={refreshing}>
      <Row style={{ marginTop: 16, gap: 14 }}>
        <Avatar user={u} size={72} />
        <View style={{ flex: 1 }}>
          <Text style={s.name} accessibilityRole="header">{u.displayName}</Text>
          <Text style={{ color: colors.muted }}>@{u.handle}</Text>
          <Row wrap>
            {u.isSample ? <Tag tone="grey">Sample account</Tag> : null}
            {data.banned ? <Tag tone="red">Account removed</Tag> : null}
            {own ? <Tag tone="green">19+ verified</Tag> : u.followsYou ? <Tag tone="grey">Follows you</Tag> : null}
          </Row>
        </View>
      </Row>
      {u.bio ? <P>{u.bio}</P> : null}
      <Metrics items={[[count(u.posts), 'Posts'], [count(u.followers), 'Followers'], [count(u.following), 'Following']]} />
      <Row style={{ marginTop: 4, alignItems: 'flex-end' }}>
        {own ? (
          <>
            <View style={{ flex: 1 }}><Button title="Edit profile" variant="secondary" small block onPress={() => { setName(u.displayName); setBio(u.bio); setAvatar(null); setEdit(true); }} /></View>
            <View style={{ flex: 1 }}><Button title="Studio" variant="secondary" small block onPress={() => router.push('/studio')} /></View>
            <View style={{ marginTop: 14 }}><Button title="" icon="settings-outline" label="Settings and safety" variant="secondary" small onPress={() => router.push('/settings')} testID="open-settings" /></View>
          </>
        ) : u.isBlocked ? (
          <Button title="Unblock" variant="secondary" onPress={act(async () => { await api.del(`/api/users/${u.id}/block`); toast.show('Unblocked'); reload(); })} />
        ) : (
          <>
            <View style={{ flex: 1 }}><Button title={u.isFollowing ? 'Following' : 'Follow'} variant={u.isFollowing ? 'secondary' : 'primary'} small block onPress={follow} label={u.isFollowing ? `Unfollow @${u.handle}` : `Follow @${u.handle}`} /></View>
            <View style={{ flex: 1 }}><Button title="Message" variant="secondary" small block onPress={act(async () => { const r = await api.post('/api/conversations', { memberIds: [u.id] }); router.push(`/inbox/${r.id}`); })} /></View>
            <View style={{ marginTop: 14 }}><Button title="" icon="ellipsis-horizontal" variant="secondary" small label="More options" onPress={() => setMore(true)} testID="user-more" /></View>
          </>
        )}
      </Row>
      <SectionTitle>{own ? 'Your content' : 'Posts'}</SectionTitle>
      {u.isBlocked ? <P muted>You blocked this account.</P> : data.posts.length ? (
        <View style={s.grid}>
          {data.posts.map((p: any) => (
            <Pressable key={p.id} style={s.thumb} onPress={() => router.push(`/p/${p.id}`)} accessibilityRole="button" accessibilityLabel={`Open post: ${p.caption.slice(0, 60) || 'Untitled'}. ${p.views} views`} testID="thumb">
              {media(p.posterUrl) ? <Image source={{ uri: media(p.posterUrl)! }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
              {p.status !== 'published' ? <Text style={s.badge}>{p.status}</Text> : null}
              <View style={s.viewsRow}><Icon name="play" size={12} color="#fff" /><Text style={s.views}>{count(p.views)}</Text></View>
            </Pressable>
          ))}
        </View>
      ) : (
        <Card><P muted style={{ textAlign: 'center' }}>{own ? 'Your posts will appear here.' : 'No posts yet.'}</P>{own ? <Button title="Create your first post" onPress={() => router.navigate('/create')} /> : null}</Card>
      )}
      <Sheet visible={more} title={'@' + u.handle} onClose={() => setMore(false)}>
        <Button title="Report account" icon="flag-outline" variant="secondary" block onPress={() => setReport(true)} testID="report-account" />
        <Button title={u.isMuted ? 'Unmute' : 'Mute'} variant="secondary" block onPress={act(async () => {
          if (u.isMuted) await api.del(`/api/users/${u.id}/mute`); else await api.post(`/api/users/${u.id}/mute`);
          setMore(false); toast.show(u.isMuted ? 'Unmuted' : 'Muted. You won’t see their posts or comments.'); reload();
        })} />
        <Button title="Block" variant="danger" block onPress={block} />
      </Sheet>
      <ReportSheet target={report ? { type: 'user', id: u.id, label: 'Report account' } : null} onClose={() => { setReport(false); setMore(false); }} onBlocked={reload} />
      <Sheet visible={edit} title="Edit profile" onClose={() => setEdit(false)}>
        <Field label="Display name" value={name} onChangeText={setName} maxLength={40} />
        <Field label="Bio" value={bio} onChangeText={setBio} maxLength={200} multiline />
        <View style={{ marginTop: 12 }}><Button title={avatar ? 'Photo selected' : 'Choose profile photo'} icon={avatar ? 'checkmark-circle' : 'image-outline'} variant="secondary" small onPress={pickAvatar} /></View>
        <Button title="Save profile" block onPress={saveProfile} />
      </Sheet>
    </Screen>
  );
}

const s = StyleSheet.create({
  name: { color: colors.text, fontSize: 21, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  thumb: { width: '32.5%', aspectRatio: 9 / 16, backgroundColor: colors.pane2, borderRadius: 8, overflow: 'hidden', justifyContent: 'flex-end' },
  viewsRow: { flexDirection: 'row', alignItems: 'center', gap: 3, padding: 6 },
  views: { color: '#fff', fontWeight: '600', fontSize: 12, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  badge: { position: 'absolute', top: 6, left: 6, color: colors.onGold, backgroundColor: colors.gold, borderRadius: 6, paddingHorizontal: 6, fontSize: 11, fontWeight: '800', overflow: 'hidden' },
});
