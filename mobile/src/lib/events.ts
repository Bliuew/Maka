// Tiny in-app event bus so screens can react to realtime events.
type Fn = (data: any) => void;
const listeners = new Map<string, Set<Fn>>();
export function on(type: string, fn: Fn): () => void {
  const set = listeners.get(type) ?? new Set<Fn>();
  set.add(fn); listeners.set(type, set);
  return () => { set.delete(fn); };
}
export function emit(type: string, data?: any) { for (const fn of listeners.get(type) ?? []) fn(data); }
