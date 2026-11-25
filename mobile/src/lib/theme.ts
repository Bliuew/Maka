// Mäka design tokens, taken from the founder's screen designs:
// warm near-black, deep honey gold, cream text, hexagon motif.

export const colors = {
  bg: '#0d0b08',
  app: '#0d0b08',
  pane: '#1b1814',        // cards, sheets
  pane2: '#221e19',       // inputs, secondary surfaces
  pane3: '#2b2620',       // pressed / selected
  line: '#2c2822',
  lineStrong: '#3a352d',
  gold: '#e3a82f',
  gold2: '#c3922f',
  goldSoft: 'rgba(227,168,47,0.14)',
  honeyTop: '#d6c597',    // honey-cell gradient (top)
  honeyBottom: '#c4922e', // honey-cell gradient (bottom)
  cream: '#f4ead5',
  text: '#f4ead5',
  muted: '#a99f8c',
  faint: '#6e665a',
  green: '#8fd3a6',
  red: '#ef7d6b',
  like: '#e3a82f',        // nectar is honey-coloured
  onGold: '#1a140a',
};

/** Figtree for text, Bricolage Grotesque for display headings (loaded in the root layout). */
export const font = {
  regular: 'Figtree_400Regular',
  medium: 'Figtree_500Medium',
  semibold: 'Figtree_600SemiBold',
  bold: 'Figtree_700Bold',
  display: 'BricolageGrotesque_800ExtraBold',
  displayBold: 'BricolageGrotesque_700Bold',
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
  largeTitle: { fontFamily: font.display, fontSize: 36, lineHeight: 42, letterSpacing: -1 },
  title: { fontFamily: font.display, fontSize: 26, lineHeight: 31, letterSpacing: -0.6 },
  headline: { fontFamily: font.displayBold, fontSize: 19, lineHeight: 24, letterSpacing: -0.3 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22 },
  callout: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: font.medium, fontSize: 12, lineHeight: 16 },
  overline: { fontFamily: font.medium, fontSize: 12, lineHeight: 16, letterSpacing: 1.4, textTransform: 'uppercase' as const, color: '#a99f8c' },
};

export const radius = { sm: 8, md: 10, lg: 14, xl: 22, pill: 999 };
export const space = (n: number) => n * 4;

export const TAGLINE = 'Feel The Power Of Love Within You';
export const BRAND = 'Mäka';

/** Mäka's words for social actions (screen readers still get plain words). */
export const words = { followers: 'swarm', posts: 'cells', likes: 'nectar', comments: 'replies', save: 'Jar' };
