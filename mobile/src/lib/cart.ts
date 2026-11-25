// Shopping bags, one per store, shared by Market and storefront screens.
import { useSyncExternalStore } from 'react';

type Bag = Record<string, number>; // productId -> quantity
let bags: Record<string, Bag> = {};
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export const cart = {
  add(storeId: string, productId: string) {
    const bag = { ...(bags[storeId] || {}) };
    bag[productId] = (bag[productId] || 0) + 1;
    bags = { ...bags, [storeId]: bag }; notify();
  },
  clear(storeId: string) { bags = { ...bags, [storeId]: {} }; notify(); },
  get: (storeId: string): Bag => bags[storeId] || {},
};

export function useBag(storeId: string): Bag {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => bags[storeId] || EMPTY, () => EMPTY);
}
const EMPTY: Bag = {};
