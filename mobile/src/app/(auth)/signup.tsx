import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Button, Check, Field, P, Screen } from '../../components/ui';
import { api } from '../../lib/client';
import { useSession } from '../../lib/session';
import { useToast } from '../../lib/toast';

export default function SignUp() {
  const router = useRouter();
  const { signIn } = useSession();
  const toast = useToast();
  const [f, setF] = useState({ email: '', password: '', handle: '', displayName: '', inviteCode: '' });
  const [accept, setAccept] = useState(false);
  const [invite, setInvite] = useState(false);
  useEffect(() => { api.get('/api/health').then((h) => setInvite(!!h.inviteRequired)).catch(() => {}); }, []);
  const up = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const submit = async () => {
    try {
      const r = await api.post('/api/auth/register', { ...f, acceptTerms: accept });
      signIn(r.token, r.user); // the gate moves the person to the age check
    } catch (e) { toast.error(e); }
  };
  return (
    <Screen title="Join Mäka" intro="Strictly for adults aged 19+. Your public handle can differ from your legal name." right={<Button title="← Back" small variant="secondary" onPress={() => router.back()} />}>
      <Field label="Email" value={f.email} onChangeText={up('email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" testID="su-email" />
      <Field label="Password (10+ characters)" value={f.password} onChangeText={up('password')} secureTextEntry autoComplete="new-password" testID="su-pass" />
      <Field label="Handle" value={f.handle} onChangeText={up('handle')} autoCapitalize="none" autoCorrect={false} placeholder="yourname" testID="su-handle" />
      <Field label="Display name" value={f.displayName} onChangeText={up('displayName')} maxLength={40} testID="su-name" />
      {invite ? <Field label="Invite code" value={f.inviteCode} onChangeText={up('inviteCode')} autoCapitalize="none" /> : null}
      <Check value={accept} onChange={setAccept} testID="su-terms"
        label="I agree to the Community Guidelines (no bullying, racism, threats, doxxing or ridicule) and the Terms & Privacy Policy." />
      <P muted>Privacy Policy and Terms: available from Settings once you join, and on the Mäka website.</P>
      <Button title="Continue to age check" block onPress={submit} testID="su-submit" />
    </Screen>
  );
}
