// Post interactions shared by the feed, single-post view and profiles:
// like, save, follow, share, comments, report / report-and-block, mute, block.
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Share, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../lib/client';
import { useSession } from '../lib/session';
import { useToast } from '../lib/toast';
import { ago } from '../core/format';
import { colors } from '../lib/theme';
import { Avatar, Banner, Button, Check, Choice, Empty, Field, P, Row, Sheet, Tag, styles } from './ui';

export type Post = any;

export function usePostActions(onChange: (p: Post) => void) {
  const toast = useToast();
  return {
    like: async (p: Post) => { try { onChange(p.liked ? await api.del(`/api/posts/${p.id}/like`) : await api.post(`/api/posts/${p.id}/like`)); } catch (e) { toast.error(e); } },
    save: async (p: Post) => {
      try { const r = p.saved ? await api.del(`/api/posts/${p.id}/save`) : await api.post(`/api/posts/${p.id}/save`); onChange(r); toast.show(r.saved ? 'Saved to your collection' : 'Removed from saved'); }
      catch (e) { toast.error(e); }
    },
    follow: async (p: Post) => {
      try {
        const u = p.author.isFollowing ? await api.del(`/api/users/${p.author.id}/follow`) : await api.post(`/api/users/${p.author.id}/follow`);
        onChange({ ...p, author: u });
        toast.show(u.isFollowing ? `Following @${u.handle}` : `Unfollowed @${u.handle}`);
        return u;
      } catch (e) { toast.error(e); }
    },
    share: async (p: Post) => { try { await Share.share({ message: `@${p.author.handle} on Mäka ${p.shareUrl}`, url: p.shareUrl }); } catch { /* cancelled */ } },
  };
}

// ---------- comments ----------
export function CommentsSheet({ postId, visible, onClose, onCountChange }: { postId: string | null; visible: boolean; onClose: () => void; onCountChange?: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [text, setText] = useState('');
  const [reportId, setReportId] = useState<string | null>(null);
  const load = useCallback(async () => { if (postId) setData(await api.get(`/api/posts/${postId}/comments`)); }, [postId]);
  useEffect(() => {
    if (!visible || !postId) return;
    let ignore = false;
    api.get(`/api/posts/${postId}/comments`).then((r) => { if (!ignore) setData(r); }).catch(toast.error);
    return () => { ignore = true; };
  }, [visible, postId, toast]);
  const close = () => { setData(null); onClose(); };
  const send = async () => {
    const body = text;
    setText(''); // clear now so typing during the request isn't wiped; restored on failure
    try {
      const r = await api.post(`/api/posts/${postId}/comments`, { body });
      toast.show(r.held ? r.message : 'Comment posted', !!r.held);
      await load(); onCountChange?.();
    } catch (e) { setText((cur) => cur || body); toast.error(e); }
  };
  const del = async (id: string) => { try { await api.del('/api/comments/' + id); await load(); onCountChange?.(); } catch (e) { toast.error(e); } };
  return (
    <Sheet visible={visible} title="Comments" onClose={close}>
      <Banner>Respectful discussion only. Constructive criticism is welcome; harassment, racism, threats and ridicule are not.</Banner>
      {!data ? <Empty>Loading…</Empty> : data.comments.length ? data.comments.map((c: any) => (
        <View key={c.id} style={{ flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#221f24' }} testID="comment">
          <Avatar user={c.author} size={30} />
          <View style={{ flex: 1 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={styles.liTitle}>@{c.author.handle} <Text style={styles.muted}>· {ago(c.createdAt)}</Text></Text>
              <Row>
                {c.canDelete ? <Button title="Delete" small variant="secondary" onPress={() => del(c.id)} label="Delete comment" /> : null}
                {!c.mine ? <Button title="⚑" small variant="secondary" onPress={() => setReportId(c.id)} label={`Report comment by @${c.author.handle}`} /> : null}
              </Row>
            </Row>
            <P>{c.body}</P>
            {c.status === 'held' ? <Tag>Held for review — only you can see this</Tag> : null}
          </View>
        </View>
      )) : <Empty>No comments yet. Start a kind conversation.</Empty>}
      {data?.allowComments ? (
        <>
          <Field label="Add a comment" value={text} onChangeText={setText} multiline maxLength={500} placeholder="Add a respectful comment…" testID="comment-input" />
          <Button title="Post comment" onPress={send} disabled={!text.trim()} block testID="comment-send" />
        </>
      ) : data ? <P muted>The creator has turned off comments.</P> : null}
      <ReportSheet target={reportId ? { type: 'comment', id: reportId } : null} onClose={() => setReportId(null)} />
    </Sheet>
  );
}

// ---------- reporting ----------
let reasonsCache: Record<string, string> | null = null;
type ReportTarget = { type: 'post' | 'comment' | 'user' | 'message'; id: string; label?: string };

export function ReportSheet({ target, onClose, onBlocked }: { target: ReportTarget | null; onClose: () => void; onBlocked?: () => void }) {
  return (
    <Sheet visible={!!target} title={target?.label || 'Report'} onClose={onClose}>
      {target ? <ReportForm key={target.type + target.id} target={target} onClose={onClose} onBlocked={onBlocked} /> : null}
    </Sheet>
  );
}

function ReportForm({ target, onClose, onBlocked }: { target: ReportTarget; onClose: () => void; onBlocked?: () => void }) {
  const toast = useToast();
  const [reasons, setReasons] = useState<Record<string, string> | null>(reasonsCache);
  const [reason, setReason] = useState('bullying');
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  useEffect(() => {
    if (!reasonsCache) api.get('/api/reports/reasons').then((r) => { reasonsCache = r; setReasons(r); }).catch(toast.error);
  }, [toast]);
  const submit = async () => {
    try {
      const r = await api.post('/api/reports', { targetType: target.type, targetId: target.id, reason, details, alsoBlock });
      onClose(); toast.show(r.blocked ? 'Reported and blocked' : 'Report submitted — thank you');
      if (r.blocked) onBlocked?.();
    } catch (e) { toast.error(e); }
  };
  return (
    <>
      <P>Reports are reviewed by trained people. The person won’t be told who reported them.</P>
      {reasons ? <Choice label="Reason" value={reason} onChange={setReason} options={Object.entries(reasons).map(([value, label]) => ({ value, label }))} /> : <Empty>Loading…</Empty>}
      <Field label="Details (optional)" value={details} onChangeText={setDetails} multiline maxLength={1000} />
      <Check label="Also block this person" value={alsoBlock} onChange={setAlsoBlock} testID="report-also-block" />
      <Button title="Submit report" block onPress={submit} testID="report-submit" />
    </>
  );
}

// ---------- more options ----------
type Changed = (kind: 'hidden' | 'updated' | 'deleted', p?: Post) => void;
export function MoreSheet({ post, onClose, onChanged }: { post: Post | null; onClose: () => void; onChanged: Changed }) {
  return post ? <MoreBody key={post.id} post={post} onClose={onClose} onChanged={onChanged} /> : null;
}

function MoreBody({ post, onClose, onChanged }: { post: Post; onClose: () => void; onChanged: Changed }) {
  const { me } = useSession();
  const toast = useToast();
  const router = useRouter();
  const [remix, setRemix] = useState<any>(null);
  const [report, setReport] = useState(false);
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState<string>(post.caption);
  const [allowComments, setAllowComments] = useState<boolean>(post.allowComments);
  const [remixPolicy, setRemixPolicy] = useState<string>(post.remixPolicy);
  useEffect(() => { api.get(`/api/posts/${post.id}/remix-permission`).then(setRemix).catch(() => {}); }, [post.id]);
  const mine = post.author.id === me?.id;
  const act = (fn: () => Promise<void>) => async () => { try { await fn(); } catch (e) { toast.error(e); } };
  const confirm = (title: string, msg: string, fn: () => void) => Alert.alert(title, msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Confirm', style: 'destructive', onPress: fn }]);
  return (
    <>
      <Sheet visible={!report} title={mine ? 'Your post' : 'Options'} onClose={onClose}>
        {mine ? (editing ? (
          <>
            <Field label="Caption" value={caption} onChangeText={setCaption} multiline maxLength={2200} />
            <Check label="Allow comments" value={allowComments} onChange={setAllowComments} />
            <Choice label="Who can stitch or remix" value={remixPolicy} onChange={setRemixPolicy} options={[{ value: 'everyone', label: 'Everyone' }, { value: 'followers', label: 'Followers' }, { value: 'nobody', label: 'Nobody' }]} />
            <Button title="Save" block onPress={act(async () => { const r = await api.patch('/api/posts/' + post.id, { caption, allowComments, remixPolicy }); toast.show('Post updated'); onChanged('updated', r); onClose(); })} />
          </>
        ) : (
          <View style={{ gap: 4 }}>
            <Button title="Edit caption & permissions" variant="secondary" block onPress={() => setEditing(true)} />
            <Button title="Delete post" variant="danger" block onPress={() => confirm('Delete this post?', 'This cannot be undone.', act(async () => { await api.del('/api/posts/' + post.id); toast.show('Post deleted'); onChanged('deleted'); onClose(); }))} />
          </View>
        )) : (
          <View style={{ gap: 4 }}>
            <Button title="Not interested" variant="secondary" block onPress={act(async () => { await api.post(`/api/posts/${post.id}/not-interested`); toast.show('We’ll show you less like this'); onChanged('hidden'); onClose(); })} />
            <Button title="⚑ Report post" variant="secondary" block onPress={() => setReport(true)} testID="report-post" />
            <Button title={`Mute @${post.author.handle}`} variant="secondary" block onPress={act(async () => { await api.post(`/api/users/${post.author.id}/mute`); toast.show('Muted. You won’t see their posts or comments.'); onChanged('hidden'); onClose(); })} />
            <Button title={`Block @${post.author.handle}`} variant="danger" block onPress={() => confirm(`Block @${post.author.handle}?`, 'They won’t be able to see your posts, comment, follow or message you.',
              act(async () => { await api.post(`/api/users/${post.author.id}/block`); toast.show(`Blocked @${post.author.handle}`); onChanged('hidden'); onClose(); }))} />
            <Button title={`View @${post.author.handle}’s profile`} variant="secondary" block onPress={() => { onClose(); router.push(`/u/${post.author.handle}`); }} />
          </View>
        )}
        {remix ? <P muted style={{ marginTop: 12 }}>Stitch/remix: {remix.allowed ? 'allowed for you' : 'not allowed'} (creator setting: {remix.policy}). {remix.note}</P> : null}
      </Sheet>
      <ReportSheet target={report ? { type: 'post', id: post.id, label: 'Report post' } : null} onClose={() => { setReport(false); onClose(); }} onBlocked={() => onChanged('hidden')} />
    </>
  );
}

export function ActionButton({ glyph, label, text, on, onPress, testID }: { glyph: string; label: string; text: string; on?: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={on === undefined ? undefined : { selected: on }} testID={testID}
      style={{ alignItems: 'center', minWidth: 48, minHeight: 48, justifyContent: 'center' }} hitSlop={6}>
      <Text style={{ fontSize: 28, color: on ? colors.gold : '#fff', textShadowColor: '#000', textShadowRadius: 6 }}>{glyph}</Text>
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', textShadowColor: '#000', textShadowRadius: 4 }}>{text}</Text>
    </Pressable>
  );
}

