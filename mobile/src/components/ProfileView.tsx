import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from './Text';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Button, Empty, Field, Icon, Loading, Overline, P, Screen, Sheet, Tag, useLoad, type IconName } from './ui';
import { CombGrid, HexAvatar, Honeycomb } from './hex';
import { ReportSheet } from './post';
import { api, media } from '../lib/client';
import { count } from '../core/format';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import { uploadAsset, waitForMedia } from '../lib/uploads';
import { colors, font, type, words } from '../lib/theme';

export default function ProfileView({ userKey }: { userKey: string }) {
  const router = useRouter();
  const toast = useToast();
  const { me, setMe } = useSession();
  const { data, error, reload, refreshing, setData } = useLoad(() => api.get('/api/users/' + encodeURIComponent(userKey)), [userKey]);
  const [more, setMore] = useState(false);
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<'posts' | 'saved' | 'portfolio'>('posts');
  const [saved, setSaved] = useState<any[] | null>(null);
  const [portfolio, setPortfolio] = useState<any[] | null>(null);
  const openTab = (t: 'posts' | 'saved' | 'portfolio') => {
    setTab(t);
    if (t === 'saved') api.get<any[]>('/api/me/saved').then(setSaved).catch(toast.error);
    if (t === 'portfolio') api.get<any[]>('/api/me/applications').then(setPortfolio).catch(toast.error);
  };
  const [report, setReport] = useState(false);
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(''); const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState<{ uri: string; file?: Blob } | null>(null);
  if (!data) return <Loading error={error} onRetry={reload} />;
  const u = data.user;
  const own = u.id === me?.id;
  const shown: any[] = tab === 'saved' ? saved || [] : data.posts;
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

  const tabs: { key: 'posts' | 'saved' | 'portfolio'; label: string; icon?: IconName }[] = own
    ? [{ key: 'posts', label: 'Cells' }, { key: 'saved', label: 'Saved', icon: 'bookmark-outline' }, { key: 'portfolio', label: 'Portfolio' }]
    : [{ key: 'posts', label: 'Cells' }];
  const stat = (n: number, label: string, a11y: string) => (
    <View accessible accessibilityLabel={`${n} ${a11y}`}><Text style={s.statN}>{count(n)}</Text><Text style={s.statL}>{label}</Text></View>
  );
  const pad = width - 40;
  return (
    <Screen onRefresh={() => reload(true)} refreshing={refreshing}>
      <View style={{ marginHorizontal: -20, height: 170 }}>
        <Honeycomb width={width} height={170} />
      </View>
      <View style={{ marginTop: -62 }}><HexAvatar user={u} size={118} /></View>
      <Text style={s.name} accessibilityRole="header">{u.displayName}</Text>
      <Text style={s.handle}>@{u.handle}</Text>
      {u.bio ? <Text style={s.bio}>{u.bio}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {u.isSample ? <Tag tone="grey">Sample account</Tag> : null}
        {data.banned ? <Tag tone="red">Account removed</Tag> : null}
        {own ? <Tag tone="green">19+ verified</Tag> : u.followsYou ? <Tag tone="grey">Follows you</Tag> : null}
      </View>
      <View style={s.stats}>
        {stat(u.followers, words.followers, 'followers')}
        {stat(u.following, 'following', 'following')}
        {stat(u.posts, words.posts, 'posts')}
      </View>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
        {own ? (
          <>
            <View style={{ flex: 1 }}><Button title="Edit profile" block onPress={() => { setName(u.displayName); setBio(u.bio); setAvatar(null); setEdit(true); }} /></View>
            <View style={{ flex: 1 }}><Button title="Studio" variant="secondary" block onPress={() => router.push('/studio')} /></View>
            {me?.role === 'admin' ? <Button title="" icon="shield-checkmark-outline" label="Trust and Safety" variant="secondary" onPress={() => router.push('/admin')} /> : null}
            <Button title="" icon="settings-outline" label="Settings and safety" variant="secondary" onPress={() => router.push('/settings')} testID="open-settings" />
          </>
        ) : u.isBlocked ? (
          <View style={{ flex: 1 }}><Button title="Unblock" variant="secondary" block onPress={act(async () => { await api.del(`/api/users/${u.id}/block`); toast.show('Unblocked'); reload(); })} /></View>
        ) : (
          <>
            <View style={{ flex: 1 }}><Button title={u.isFollowing ? 'Following' : 'Follow'} variant={u.isFollowing ? 'secondary' : 'primary'} block onPress={follow} label={u.isFollowing ? `Unfollow @${u.handle}` : `Follow @${u.handle}`} /></View>
            <View style={{ flex: 1 }}><Button title="Message" variant="secondary" block onPress={act(async () => { const r = await api.post('/api/conversations', { memberIds: [u.id] }); router.push(`/inbox/${r.id}`); })} /></View>
            <Button title="" icon="ellipsis-horizontal" variant="secondary" label="More options" onPress={() => setMore(true)} testID="user-more" />
          </>
        )}
      </View>

      <View style={s.tabs} accessibilityRole="tablist">
        {tabs.map((t) => (
          <Pressable key={t.key} style={s.tab} onPress={() => openTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }} accessibilityLabel={t.label}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {t.icon ? <Icon name={t.icon} size={18} color={tab === t.key ? colors.gold : colors.muted} /> : null}
              <Text style={[s.tabText, tab === t.key && { color: colors.gold }]}>{t.label}</Text>
            </View>
            <View style={[s.tabBar, tab !== t.key && { opacity: 0 }]} />
          </Pressable>
        ))}
      </View>

      {u.isBlocked ? <P muted>You blocked this account.</P> : tab === 'portfolio' ? (
        <>
          <Overline>Collaborations</Overline>
          {portfolio?.length ? portfolio.map((a: any) => (
            <View key={a.id} style={s.portfolioRow}>
              <Text style={{ color: colors.text, fontSize: 16, flex: 1 }} numberOfLines={1}>{a.title}</Text>
              <Text style={{ color: colors.muted }}>{a.contract ? `contract ${a.contract.status}` : a.status}</Text>
            </View>
          )) : <Empty icon="briefcase-outline">Your collaboration work will appear here.</Empty>}
        </>
      ) : (
        <>
          <Overline>{tab === 'saved' ? 'Saved to your jar' : own ? 'Your comb grows one cell per piece' : `${u.displayName}’s comb`}</Overline>
          {shown.length ? (
            <CombGrid width={pad} items={shown.map((p: any) => ({ ...p, cover: media(p.posterUrl) }))}
              onPress={(p: any) => router.push(`/p/${p.id}`)} label={(p: any) => `Open post: ${p.caption.slice(0, 60) || 'Untitled'}. ${p.views} views`}
              emptyCells={Math.max(0, 9 - shown.length)} />
          ) : (
            <View style={{ alignItems: 'center' }}>
              <CombGrid width={pad} items={[]} onPress={() => {}} label={() => ''} emptyCells={6} />
              <Text style={{ color: colors.muted, marginTop: 14, marginBottom: 12 }}>{tab === 'saved' ? 'Nothing saved yet' : own ? 'Share your first cell' : 'No cells yet'}</Text>
              {own && tab === 'posts' ? <Button title="Create your first post" onPress={() => router.navigate('/create')} /> : null}
            </View>
          )}
        </>
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
  name: { ...type.largeTitle, fontSize: 38, lineHeight: 44, marginTop: 14 },
  handle: { color: colors.muted, fontSize: 16, marginTop: 2 },
  bio: { color: colors.text, fontSize: 16, lineHeight: 23, marginTop: 14 },
  stats: { flexDirection: 'row', gap: 40, marginTop: 20, marginBottom: 20 },
  statN: { fontFamily: font.display, fontSize: 22, color: colors.text },
  statL: { color: colors.muted, fontSize: 15, marginTop: 2 },
  tabs: { flexDirection: 'row', marginTop: 26, marginHorizontal: -20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.lineStrong },
  tab: { flex: 1, alignItems: 'center', paddingTop: 12 },
  tabText: { color: colors.muted, fontSize: 16, fontFamily: font.medium },
  tabBar: { width: 46, height: 4, borderRadius: 2, backgroundColor: colors.gold, marginTop: 12, shadowColor: colors.gold, shadowOpacity: 0.7, shadowRadius: 6 },
  portfolioRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.lineStrong },
});
