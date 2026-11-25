import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Avatar, Empty, ListItem, Screen, SearchBox, SectionTitle } from '../../components/ui';
import { api } from '../../lib/client';
import { count } from '../../core/format';

export default function Search() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [r, setR] = useState<any>(null);
  useEffect(() => {
    const t = setTimeout(() => { if (q.trim().length > 1) api.get('/api/search?q=' + encodeURIComponent(q)).then(setR).catch(() => {}); else setR(null); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const none = r && !r.users.length && !r.posts.length && !r.titles.length && !r.businesses.length && !r.campaigns.length;
  return (
    <Screen>
      <SearchBox value={q} onChange={setQ} placeholder="Creators, videos, films, businesses…" label="Search Mäka" />
      {r?.users.length ? <><SectionTitle>People</SectionTitle>{r.users.map((u: any) => <ListItem key={u.id} left={<Avatar user={u} />} title={u.displayName} subtitle={`@${u.handle} · ${count(u.followers)} followers`} onPress={() => router.push(`/u/${u.handle}`)} />)}</> : null}
      {r?.posts.length ? <><SectionTitle>Videos</SectionTitle>{r.posts.map((p: any) => <ListItem key={p.id} title={'@' + p.author.handle} subtitle={p.caption} onPress={() => router.push(`/p/${p.id}`)} />)}</> : null}
      {r?.titles.length ? <><SectionTitle>Cinema</SectionTitle>{r.titles.map((t: any) => <ListItem key={t.id} title={t.name} subtitle={t.genres} onPress={() => router.navigate('/cinema')} />)}</> : null}
      {r?.businesses.length ? <><SectionTitle>Market</SectionTitle>{r.businesses.map((b: any) => <ListItem key={b.id} title={b.name} subtitle={b.category} onPress={() => router.push(`/market/${b.id}`)} />)}</> : null}
      {r?.campaigns.length ? <><SectionTitle>Collabs</SectionTitle>{r.campaigns.map((c: any) => <ListItem key={c.id} title={c.title} subtitle={c.category} onPress={() => router.navigate('/collabs')} />)}</> : null}
      {none ? <Empty>No results.</Empty> : null}
    </Screen>
  );
}
