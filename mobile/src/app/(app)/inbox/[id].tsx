import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../../components/Text';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Icon, Loading, styles as ui } from '../../../components/ui';
import { ReportSheet } from '../../../components/post';
import { api } from '../../../lib/client';
import { ago } from '../../../core/format';
import { on } from '../../../lib/events';
import { useSession } from '../../../lib/session';
import { useToast } from '../../../lib/toast';
import { colors } from '../../../lib/theme';

type Msg = { id: string; body: string; status: string; mine: boolean; createdAt: number; sender: any };

export default function Thread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { refreshUnread } = useSession();
  const [conv, setConv] = useState<any>(null);
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [report, setReport] = useState<string | null>(null);
  const last = useRef(0);
  const list = useRef<FlatList<Msg>>(null);

  const merge = (fresh: Msg[]) => {
    if (!fresh.length) return;
    last.current = Math.max(last.current, ...fresh.map((m) => m.createdAt));
    setMsgs((cur) => { const seen = new Set((cur || []).map((m) => m.id)); return [...(cur || []), ...fresh.filter((m) => !seen.has(m.id))]; });
  };
  const load = useCallback(async () => {
    try {
      const convs = await api.get<any[]>('/api/conversations');
      const c = convs.find((x) => x.id === id);
      if (!c) throw new Error('Conversation not found');
      setConv(c);
      const all = await api.get<Msg[]>(`/api/conversations/${id}/messages`);
      last.current = all.reduce((a, m) => Math.max(a, m.createdAt), 0);
      setMsgs(all); setError(null); refreshUnread();
    } catch (e: any) { setError(e.message); }
  }, [id, refreshUnread]);
  // Catch up on anything missed while disconnected: only messages after the last one we have.
  const catchUp = useCallback(async () => { try { merge(await api.get<Msg[]>(`/api/conversations/${id}/messages?since=${last.current}`)); } catch { /* offline */ } }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => on('message', (m) => { if (m.conversationId === id) catchUp(); }), [id, catchUp]);
  useEffect(() => on('realtime:open', catchUp), [catchUp]);
  useEffect(() => on('net:back', catchUp), [catchUp]);

  const send = async () => {
    const body = text.trim(); if (!body) return;
    setText('');
    try {
      const r = await api.post(`/api/conversations/${id}/messages`, { body });
      if (r.message) toast.show(r.message, true);
      await catchUp();
    } catch (e) { setText((cur) => cur || body); toast.error(e); }
  };

  if (!msgs || !conv) return <Loading error={error} onRetry={load} />;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.app }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: conv.title, headerRight: () => (
        <Pressable hitSlop={10} accessibilityRole="button" style={{ padding: 6 }}
          accessibilityLabel={conv.isGroup ? 'Leave group' : `View @${conv.members[0].handle}’s profile`}
          onPress={conv.isGroup ? async () => { await api.post(`/api/conversations/${id}/leave`); router.back(); } : () => router.push(`/u/${conv.members[0].handle}`)}>
          <Icon name={conv.isGroup ? 'exit-outline' : 'person-circle-outline'} size={26} />
        </Pressable>
      ) }} />
      <FlatList ref={list} data={msgs} keyExtractor={(m) => m.id} contentContainerStyle={{ padding: 14, gap: 8 }}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={<Text style={ui.muted}>Say hello</Text>}
        accessibilityLabel="Messages"
        renderItem={({ item: m }) => (
          <View style={[s.bubble, m.mine && s.me, m.status === 'held' && s.held]} accessible accessibilityLabel={`${m.mine ? 'You' : '@' + m.sender.handle}: ${m.body}. ${ago(m.createdAt)}${m.status === 'held' ? '. Held for review, not delivered' : ''}`} testID="bubble">
            {!m.mine ? <Text style={s.small}>@{m.sender.handle}</Text> : null}
            <Text style={[s.body, m.mine && { color: colors.onGold }]}>{m.body}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Text style={[s.small, m.mine && { color: '#5a4426' }]}>{ago(m.createdAt)}{m.status === 'held' ? ' · held for review, not delivered' : ''}</Text>
              {!m.mine ? <Pressable onPress={() => setReport(m.id)} accessibilityRole="button" accessibilityLabel={`Report message from @${m.sender.handle}`}><Text style={[s.small, { color: colors.gold }]}>Report</Text></Pressable> : null}
            </View>
          </View>
        )} />
      <View style={s.composer}>
        <TextInput value={text} onChangeText={setText} placeholder="Message…" placeholderTextColor={colors.faint} multiline
          style={s.input} accessibilityLabel="Message" maxLength={2000} testID="message-input" />
        <Pressable onPress={send} disabled={!text.trim()} accessibilityRole="button" accessibilityLabel="Send" accessibilityState={{ disabled: !text.trim() }} testID="message-send"
          style={[s.send, text.trim() ? { backgroundColor: colors.gold } : null]}>
          <Icon name="arrow-up" size={20} color={text.trim() ? colors.onGold : colors.faint} />
        </Pressable>
      </View>
      <ReportSheet target={report ? { type: 'message', id: report, label: 'Report message' } : null} onClose={() => setReport(null)} />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  bubble: { backgroundColor: colors.pane2, borderRadius: 16, padding: 10, maxWidth: '82%', alignSelf: 'flex-start' },
  me: { backgroundColor: colors.gold, alignSelf: 'flex-end' },
  held: { opacity: 0.6, borderWidth: 1, borderColor: colors.red },
  body: { color: colors.text, fontSize: 15, lineHeight: 20 },
  small: { color: colors.muted, fontSize: 11, marginTop: 2 },
  composer: { flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, alignItems: 'flex-end' },
  input: { flex: 1, backgroundColor: colors.pane2, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 120, color: colors.text },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pane2 },
});
