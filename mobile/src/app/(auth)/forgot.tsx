import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Banner, Button, Field, P, Screen } from '../../components/ui';
import { api } from '../../lib/client';
import { useToast } from '../../lib/toast';

export default function Forgot() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email || '');
  const [sent, setSent] = useState(false);
  const submit = async () => {
    try { await api.post('/api/auth/forgot', { email }); setSent(true); }
    catch (e) { toast.error(e); }
  };
  return (
    <Screen title="Reset password" right={<Button title="Back" icon="chevron-back" small variant="ghost" onPress={() => router.back()} />}>
      <P muted>Enter the email on your account. We’ll send a link to choose a new password.</P>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" testID="fp-email" onSubmitEditing={submit} />
      {sent ? <Banner icon="mail-outline">If an account uses {email.trim()}, a reset link is on its way. It expires in 30 minutes. Check your spam folder if you don’t see it.</Banner> : null}
      <Button title={sent ? 'Send again' : 'Send reset link'} block disabled={!email.trim()} onPress={submit} testID="fp-submit" />
      {sent ? <Button title="Back to sign in" variant="secondary" block onPress={() => router.back()} /> : null}
    </Screen>
  );
}
