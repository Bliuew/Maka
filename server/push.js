// Phone push notifications through the Expo push service (which delivers via APNs and FCM).
// PUSH_PROVIDER=expo, optional EXPO_ACCESS_TOKEN. The app also needs its EAS project ID and,
// on Android, Firebase credentials uploaded to EAS. Off until configured.
// Pushes carry only short, non-sensitive text: message bodies are never included.
const TOKEN_RE = /^Expo(nent)?PushToken\[[\w-]+\]$/;
export const validPushToken = (t) => TOKEN_RE.test(String(t || ''));

export function createPush(env = process.env, { onInvalidToken } = {}) {
  if (env.PUSH_PROVIDER !== 'expo') return null;
  const url = env.EXPO_PUSH_URL || 'https://exp.host/--/api/v2/push/send';
  return {
    provider: 'expo',
    async send(tokens, { title, body, data }) {
      for (let i = 0; i < tokens.length; i += 100) {
        const batch = tokens.slice(i, i + 100);
        const headers = { 'content-type': 'application/json', accept: 'application/json' };
        if (env.EXPO_ACCESS_TOKEN) headers.authorization = `Bearer ${env.EXPO_ACCESS_TOKEN}`;
        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(batch.map((to) => ({ to, title, body, data, sound: 'default' }))) });
        const out = await res.json().catch(() => ({}));
        (out.data || []).forEach((ticket, k) => {
          if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') onInvalidToken?.(batch[k]);
        });
      }
    },
  };
}
