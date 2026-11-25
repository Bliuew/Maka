// Which part of the app a person may see. Mirrors the server's strict 19+ gate:
// nothing in the community is reachable until age verification is complete.
// (The server enforces this too; this only decides which screens to show.)

export type Me = { id: string; role: 'user' | 'admin'; ageStatus: 'unverified' | 'pending' | 'verified' | 'failed' | 'review'; handle?: string; displayName?: string; avatarUrl?: string | null; [k: string]: any };
export type Area = 'auth' | 'age' | 'app';

export function areaFor(token: string | null, me: Me | null): Area {
  if (!token || !me) return 'auth';
  if (me.ageStatus !== 'verified') return 'age';
  return 'app';
}

/** Route groups each area may visit (Expo Router segment names). */
export const AREA_GROUPS: Record<Area, string[]> = {
  auth: ['(auth)'],
  age: ['(age)'],
  app: ['(app)'],
};

export const homeFor = (area: Area): string => (area === 'auth' ? '/welcome' : area === 'age' ? '/verify' : '/');

export const canSeeAdmin = (me: Me | null): boolean => !!me && me.role === 'admin' && me.ageStatus === 'verified';
