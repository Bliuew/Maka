// Mäka design tokens: midnight charcoal, honey gold, warm cream.

export const colors = {
  bg: '#0b0b0d',
  app: '#0b0b0d',
  pane: '#151518',        // cards, sheets
  pane2: '#1d1d21',       // inputs, secondary buttons
  pane3: '#26262b',       // pressed / selected surfaces
  line: 'rgba(255,255,255,0.08)',
  lineStrong: 'rgba(255,255,255,0.14)',
  gold: '#f6c66f',
  gold2: '#e0a53f',
  goldSoft: 'rgba(246,198,111,0.14)',
  cream: '#fff4dd',
  muted: '#9e9ba3',
  faint: '#6d6a72',
  text: '#f5f3ee',
  green: '#7fdcae',
  red: '#ff6b7d',
  like: '#ff4d67',
  onGold: '#1a1310',
};

/** Inter, loaded in the root layout. Weight → font file (Android ignores fontWeight for custom fonts). */
export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
};

export function familyFor(weight?: string | number): string {
  const w = Number(weight ?? 400) || (weight === 'bold' ? 700 : 400);
  if (w >= 700) return font.bold;
  if (w >= 600) return font.semibold;
  if (w >= 500) return font.medium;
  return font.regular;
}

/** Type scale. */
export const type = {
  largeTitle: { fontFamily: font.bold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  title: { fontFamily: font.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  headline: { fontFamily: font.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: font.semibold, fontSize: 15, lineHeight: 21 },
  callout: { fontFamily: font.regular, fontSize: 14, lineHeight: 19 },
  caption: { fontFamily: font.medium, fontSize: 12, lineHeight: 16 },
  overline: { fontFamily: font.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.6, textTransform: 'uppercase' as const },
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };
export const space = (n: number) => n * 4;

export const TAGLINE = 'Feel The Power Of Love Within You';
export const BRAND = 'Mäka';
