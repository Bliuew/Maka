import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Button, Field, Screen } from '../../components/ui';
import { api } from '../../lib/client';
import { useSession } from '../../lib/session';
import { useToast } from '../../lib/toast';

export default function SignIn() {
  const router = useRouter();
  const { signIn } = useSession();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const submit = async () => {
    try { const r = await api.post('/api/auth/login', { email, password }); signIn(r.token, r.user); }
    catch (e) { toast.error(e); }
  };
  return (
    <Screen title="Welcome back" right={<Button title="Back" icon="chevron-back" small variant="ghost" onPress={() => router.back()} />}>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" testID="si-email" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" testID="si-pass" onSubmitEditing={submit} />
      <Button title="Sign in" block onPress={submit} testID="si-submit" />
    </Screen>
  );
}
