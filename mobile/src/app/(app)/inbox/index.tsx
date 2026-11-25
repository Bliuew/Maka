import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/Text';
import { useRouter } from 'expo-router';
import { Avatar, Button, Icon, Empty, Field, Loading, Screen, SearchBox, SectionTitle, Sheet, useLoad, type IconName } from '../../../components/ui';
import { api } from '../../../lib/client';
import { ago } from '../../../core/format';
import { on } from '../../../lib/events';
import { useSession } from '../../../lib/session';
import { useToast } from '../../../lib/toast';
import { colors } from '../../../lib/theme';

export default function Inbox() {
  const router = useRouter();
  const toast = useToast();
  const { refreshUnread } = useSession();
  const { data, error, reload, refreshing } = useLoad(async () => {
    const [convs, notes] = await Promise.all([api.get<any[]>('/api/conversations'), api.get('/api/notifications')]);
    return { convs, notes };
  });
  useEffect(() => on('message', () => reload()), [reload]);
  useEffect(() => on('notification', () => reload()), [reload]);
  const [compose, setCompose] = useState<null | 'chat' | 'group'>(null);
  const [to, setTo] = useState(''); const [title, setTitle] = useState(''); const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  if (!data) return <Loading error={error} onRetry={reload} />;
  const send = async () => {
    try {
      const memberIds = to.split(',').map((s) => s.trim().replace(/^@/, '')).filter(Boolean);
      const r = await api.post('/api/conversations', { memberIds, title: compose === 'group' ? title : undefined, message: msg });
      setCompose(null); setTo(''); setTitle(''); setMsg('');
      router.push(`/inbox/${r.id}`);
    } catch (e) { toast.error(e); }
  };
  const term = q.trim().toLowerCase();
  const convs = term ? data.convs.filter((c) => c.title.toLowerCase().includes(term)) : data.convs;
  const typeIcon: Record<string, IconName> = { like: 'heart', comment: 'chatbubble', follow: 'person-add', application: 'briefcase', sanction: 'shield', appeal: 'shield-checkmark' };
  return (
    <Screen title="Inbox" onRefresh={() => reload(true)} refreshing={refreshing}
      right={<View style={{ flexDirection: 'row', marginTop: 4 }}>
        <Pressable onPress={() => setCompose('group')} accessibilityRole="button" accessibilityLabel="New group" style={st.headBtn} hitSlop={6}><Icon name="people-outline" size={25} /></Pressable>
        <Pressable onPress={() => setCompose('chat')} accessibilityRole="button" accessibilityLabel="New message" style={st.headBtn} hitSlop={6}><Icon name="create-outline" size={25} /></Pressable>
      </View>}>
      <SearchBox value={q} onChange={setQ} placeholder="Search" label="Search conversations" />
      <SectionTitle>Messages</SectionTitle>
      {convs.length ? convs.map((c) => (
        <Pressable key={c.id} style={({ pressed }) => [st.conv, pressed && { opacity: 0.7 }]} onPress={() => router.push(`/inbox/${c.id}`)} testID="conversation"
          accessibilityRole="button" accessibilityLabel={`${c.title}${c.unread ? `, ${c.unread} unread` : ''}`}>
          {c.isGroup ? <View style={st.groupAvatar}><Icon name="people" size={24} color={colors.gold} /></View> : <Avatar user={c.members[0]} size={56} />}
          <View style={{ flex: 1 }}>
            <Text style={[st.convTitle, c.unread ? { fontWeight: '700' } : null]} numberOfLines={1}>{c.title}</Text>
            <Text style={[st.preview, c.unread ? { color: colors.text, fontWeight: '600' } : null]} numberOfLines={1}>
              {c.lastMessage ? `${c.lastMessage.mine ? 'You: ' : ''}${c.lastMessage.body} · ${ago(c.lastMessage.at)}` : 'No messages yet'}
            </Text>
          </View>
          {c.unread ? <View style={st.dot} /> : null}
        </Pressable>
      )) : <Empty icon="paper-plane-outline">{term ? 'No matching conversations.' : 'No messages yet. Start a conversation from someone’s profile.'}</Empty>}
      <SectionTitle right={data.notes.unread ? <Button title="Mark all read" small variant="ghost" onPress={async () => { await api.post('/api/notifications/read'); await refreshUnread(); reload(); }} /> : undefined}>Activity</SectionTitle>
      {data.notes.items.length ? data.notes.items.map((n: any) => (
        <Pressable key={n.id} style={st.note} disabled={n.refType !== 'post'} onPress={() => router.push(`/p/${n.refId}`)} accessibilityRole={n.refType === 'post' ? 'button' : 'text'} accessibilityLabel={`${n.text}, ${ago(n.createdAt)}`}>
          <View style={st.noteIcon}><Icon name={typeIcon[n.type] || 'notifications'} size={18} color={n.type === 'like' ? colors.like : colors.gold} /></View>
          <Text style={[st.noteText, !n.read && { fontWeight: '600' }]} numberOfLines={2}>{n.text} <Text style={{ color: colors.faint }}>{ago(n.createdAt)}</Text></Text>
          {!n.read ? <View style={st.dot} /> : null}
        </Pressable>
      )) : <Empty icon="notifications-outline">No activity yet.</Empty>}
      <Sheet visible={!!compose} title={compose === 'group' ? 'New group' : 'New message'} onClose={() => setCompose(null)}>
        {compose === 'group' ? <Field label="Group name" value={title} onChangeText={setTitle} maxLength={60} /> : null}
        <Field label={compose === 'group' ? 'Members (handles, comma separated)' : 'To (handle)'} value={to} onChangeText={setTo} autoCapitalize="none" placeholder="@handle" />
        <Field label="Message" value={msg} onChangeText={setMsg} multiline maxLength={2000} />
        <Button title={compose === 'group' ? 'Create group' : 'Send'} block onPress={send} disabled={!to.trim() || !msg.trim()} />
      </Sheet>
    </Screen>
  );
}

const st = StyleSheet.create({
  headBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  conv: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, minHeight: 72 },
  groupAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.pane3, alignItems: 'center', justifyContent: 'center' },
  convTitle: { fontSize: 15, color: colors.text, fontWeight: '500' },
  preview: { fontSize: 14, color: colors.muted, marginTop: 2 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.gold },
  note: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  noteIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.pane2, alignItems: 'center', justifyContent: 'center' },
  noteText: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 19 },
});
