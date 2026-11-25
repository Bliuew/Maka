import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Banner, Button, Field, P, Screen } from '../../../components/ui';
import { api, setToken } from '../../../lib/client';
import { useSession } from '../../../lib/session';
import { useToast } from '../../../lib/toast';

// Stands in for a real provider's hosted check. The server only exposes the
// endpoint behind it while the TEST provider is active, and never in production.
export default function AgeSimulator() {
  const { checkId } = useLocalSearchParams<{ checkId: string }>();
  const router = useRouter();
  const { setMe } = useSession();
  const toast = useToast();
  const [identity, setIdentity] = useState(() => 'test-person-' + Math.random().toString(36).slice(2, 8));
  const [closed, setClosed] = useState(false);
  const sim = (outcome: 'verified' | 'under_age' | 'failed') => async () => {
    try {
      const r = await api.post('/api/age/test/complete', { checkId, outcome, testIdentity: identity });
      if (r.outcome === 'under_age') { setClosed(true); return; }
      if (r.user) setMe(r.user);
      if (r.outcome === 'verified') toast.show('Age confirmed. Welcome to Mäka 🐝');
      else router.replace('/verify');
    } catch (e) { toast.error(e); }
  };
  if (closed) {
    return (
      <Screen title="Mäka is for adults 19+">
        <P>We couldn’t confirm you are 19 or older, so the account has been closed and its personal details removed.</P>
        <Button title="OK" onPress={() => { setToken(null); setMe(null); }} />
      </Screen>
    );
  }
  return (
    <Screen title="Simulated result">
      <Banner test>AGE-VERIFICATION SIMULATOR — TEST ONLY. This page stands in for a real provider’s hosted check so the rest of Mäka can be developed and tested. It verifies nothing.</Banner>
      <Field label="Test identity (used to demo ban-evasion checks)" value={identity} onChangeText={setIdentity} autoCapitalize="none" />
      <Button title="Simulate: verified adult (19+)" block onPress={sim('verified')} testID="sim-verified" />
      <Button title="Simulate: under 19" variant="secondary" block onPress={sim('under_age')} />
      <Button title="Simulate: check failed" variant="secondary" block onPress={sim('failed')} />
    </Screen>
  );
}
