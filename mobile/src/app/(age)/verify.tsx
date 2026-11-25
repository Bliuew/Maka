import React, { useState } from 'react';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Banner, Button, Choice, Loading, P, Screen, useLoad } from '../../components/ui';
import { api } from '../../lib/client';
import { useSession } from '../../lib/session';
import { useToast } from '../../lib/toast';

type Method = { id: string; label: string; note: string };

export default function Verify() {
  const router = useRouter();
  const { me, setMe, signOut, refreshMe } = useSession();
  const toast = useToast();
  const { data, error, reload } = useLoad(() => api.get<{ isTestMode: boolean; methods: Method[]; threshold: number }>('/api/age/methods'));
  const [method, setMethod] = useState<string>('');
  if (!data) return <Loading error={error} onRetry={reload} />;
  const chosen = method || data.methods[0]?.id;
  const st = me?.ageStatus;
  const msg = ({
    pending: 'You started a check. You can continue it or choose another method.',
    failed: 'That check didn’t complete. You can try again or pick another method.',
    review: 'Your verification is under review by our team. We’ll notify you when it’s done.',
  } as Record<string, string>)[st || ''];

  const start = async () => {
    try {
      const r = await api.post('/api/age/start', { method: chosen });
      if (me) setMe({ ...me, ageStatus: 'pending' });
      const m = /age-test\/([\w-]+)/.exec(r.redirectUrl);
      if (r.isTestMode && m) router.push(`/age-test/${m[1]}`);
      else await Linking.openURL(r.redirectUrl); // a real provider's hosted check
    } catch (e) { toast.error(e); }
  };

  return (
    <Screen title="Confirm you’re 19 or older" onRefresh={() => refreshMe().catch(() => {})}
      intro="Pick one method. We only keep the result, never your ID or selfie.">
      {data.isTestMode ? <Banner test>TEST MODE. No real age-verification provider is connected yet. The next step is a simulator for development and testing only. Production will not start in this mode.</Banner> : null}
      {msg ? <Banner>{msg}</Banner> : null}
      {st === 'review' ? null : (
        <>
          <Choice label="Verification method" value={chosen} onChange={setMethod} options={data.methods.map((m) => ({ value: m.id, label: m.label, note: m.note }))} />
          <Button title="Start verification" block onPress={start} testID="age-start" />
        </>
      )}
      <Button title="Sign out" variant="secondary" block onPress={signOut} />
      <P muted style={{ marginTop: 12 }}>Mäka does not allow anyone under 19, with no exceptions.</P>
    </Screen>
  );
}
