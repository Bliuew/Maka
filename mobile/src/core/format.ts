// Display helpers shared by every screen. Mirrors web/js/ui.js so numbers read the same.

export const count = (n: number | null | undefined): string => {
  const v = n ?? 0;
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1e4) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(v);
};

export const money = (cents: number | null | undefined, currency = 'CAD'): string => {
  const amount = (cents || 0) / 100;
  try {
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
};

export const ago = (t: number, nowMs: number = Date.now()): string => {
  const s = (nowMs - t) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  if (s < 604800) return Math.floor(s / 86400) + 'd';
  return new Date(t).toLocaleDateString();
};

export const initial = (name?: string | null): string => (name || '?').trim().charAt(0).toUpperCase() || '?';
