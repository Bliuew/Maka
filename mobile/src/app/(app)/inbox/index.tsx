import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Avatar, Button, Empty, Field, ListItem, Loading, Row, Screen, SectionTitle, Sheet, useLoad } from '../../../components/ui';
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
  if (!data) return <Loading error={error} onRetry={reload} />;
  const send = async () => {
    try {
      const memberIds = to.split(',').map((s) => s.trim().replace(/^@/, '')).filter(Boolean);
      const r = await api.post('/api/conversations', { memberIds, title: compose === 'group' ? title : undefined, message: msg });
      setCompose(null); setTo(''); setTitle(''); setMsg('');
      router.push(`/inbox/${r.id}`);
    } catch (e) { toast.error(e); }
  };
  return (
    <Screen eyebrow="Connect with kindness" title="✉ Inbox" intro="Private messages, group chats, brand conversations and activity." onRefresh={() => reload(true)} refreshing={refreshing}>
      <Row><Button title="New message" onPress={() => setCompose('chat')} /><Button title="New group" variant="secondary" onPress={() => setCompose('group')} /></Row>
      <SectionTitle>Messages</SectionTitle>
      {data.convs.length ? data.convs.map((c) => (
        <ListItem key={c.id} title={c.title} testID="conversation"
          subtitle={c.lastMessage ? (c.lastMessage.mine ? 'You: ' : '') + c.lastMessage.body : 'No messages yet'}
          left={c.isGroup ? <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#2a2219', alignItems: 'center', justifyContent: 'center' }}><Text>👥</Text></View> : <Avatar user={c.members[0]} />}
          right={c.unread ? <View style={{ backgroundColor: colors.gold, borderRadius: 10, minWidth: 20, paddingHorizontal: 6, alignItems: 'center' }}><Text style={{ color: colors.onGold, fontWeight: '900' }}>{c.unread}</Text></View> : undefined}
          label={`${c.title}${c.unread ? `, ${c.unread} unread` : ''}`}
          onPress={() => router.push(`/inbox/${c.id}`)} />
      )) : <Empty>No conversations yet.</Empty>}
      <SectionTitle right={<Button title="Mark all read" small variant="secondary" onPress={async () => { await api.post('/api/notifications/read'); await refreshUnread(); reload(); }} />}>Activity</SectionTitle>
      {data.notes.items.length ? data.notes.items.map((n: any) => (
        <ListItem key={n.id} title={n.text} subtitle={ago(n.createdAt) + (n.read ? '' : ' · new')}
          onPress={n.refType === 'post' ? () => router.push(`/p/${n.refId}`) : undefined} />
      )) : <Empty>No activity yet.</Empty>}
      <Sheet visible={!!compose} title={compose === 'group' ? 'New group' : 'New message'} onClose={() => setCompose(null)}>
        {compose === 'group' ? <Field label="Group name" value={title} onChangeText={setTitle} maxLength={60} /> : null}
        <Field label={compose === 'group' ? 'Members (handles, comma separated)' : 'To (handle)'} value={to} onChangeText={setTo} autoCapitalize="none" placeholder="@handle" />
        <Field label="Message" value={msg} onChangeText={setMsg} multiline maxLength={2000} />
        <Button title={compose === 'group' ? 'Create group' : 'Send'} block onPress={send} disabled={!to.trim() || !msg.trim()} />
      </Sheet>
    </Screen>
  );
}
