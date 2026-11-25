// Phone notifications. Registers this device with the Mäka server after sign-in, and opens
// the right screen when a notification is tapped. Quietly does nothing when push isn't set
// up for this build (no EAS project ID or, on Android, no Firebase credentials), on web,
// or when the person says no to notifications.
import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { useRouter } from 'expo-router';
import { api } from './client';

let registered: string | null = null;
const native = Platform.OS === 'ios' || Platform.OS === 'android';

if (native) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

async function register() {
  if (!native || !Device.isDevice || registered) return;
  const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId || (Constants as any).easConfig?.projectId;
  if (!projectId) return; // push isn't set up for this build
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Mäka', importance: AndroidImportance.HIGH });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api.post('/api/me/push-tokens', { token, platform: Platform.OS });
  registered = token;
}

// Call before signing out so this phone stops getting the account's notifications.
export async function unregisterPush() {
  if (!registered) return;
  const token = registered; registered = null;
  try { await api.del('/api/me/push-tokens', { token }); } catch { /* signed out anyway */ }
}

function routeFor(data: any): string | null {
  if (!data) return null;
  if (data.refType === 'conversation' && data.refId) return `/inbox/${data.refId}`;
  if (data.refType === 'post' && data.refId) return `/p/${data.refId}`;
  if (data.refType === 'order') return '/settings';
  return '/inbox';
}

export function usePush() {
  const router = useRouter();
  useEffect(() => {
    if (!native) return;
    register().catch(() => { /* not available on this build */ });
    const open = (r: Notifications.NotificationResponse | null) => {
      const to = routeFor(r?.notification.request.content.data);
      if (to) router.push(to as any);
    };
    const last = Notifications.getLastNotificationResponse();
    if (last) open(last);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [router]);
}
