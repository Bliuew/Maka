// Hexagon building blocks for Mäka's honeycomb design language (flat-top hexagons).
import React, { useId } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { ClipPath, Defs, Image as SvgImage, LinearGradient, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../lib/theme';
import { media } from '../lib/client';
import { Icon, type IconName } from './ui';

/** Points of a flat-top hexagon filling a w×h box, inset by `i`. */
export function hexPoints(w: number, h: number, i = 0): string {
  const x0 = i, x1 = w * 0.25 + i / 2, x2 = w * 0.75 - i / 2, x3 = w - i, y0 = i, ym = h / 2, y1 = h - i;
  return `${x1},${y0} ${x2},${y0} ${x3},${ym} ${x2},${y1} ${x1},${y1} ${x0},${ym}`;
}
export const hexHeight = (w: number) => Math.round(w * 0.866);
const sid = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '');

/** A hexagon with optional fill/stroke and centred content. */
export function Hex({ size, fill = colors.pane, stroke, strokeWidth = 2, children, style }: {
  size: number; fill?: string; stroke?: string; strokeWidth?: number; children?: React.ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const h = hexHeight(size);
  return (
    <View style={[{ width: size, height: h, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg width={size} height={h} style={{ position: 'absolute' }}>
        <Polygon points={hexPoints(size, h, stroke ? strokeWidth / 2 : 0)} fill={fill} stroke={stroke} strokeWidth={stroke ? strokeWidth : 0} strokeLinejoin="round" />
      </Svg>
      {children}
    </View>
  );
}

/** Pressable hexagon icon button (feed rail, create button). */
export function HexButton({ icon, size = 52, fill = colors.pane, iconColor = colors.gold, iconSize, onPress, label, testID, selected }: {
  icon: IconName; size?: number; fill?: string; iconColor?: string; iconSize?: number; onPress?: () => void; label: string; testID?: string; selected?: boolean;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={selected === undefined ? undefined : { selected }} testID={testID} hitSlop={6}
      style={({ pressed }) => [pressed && { transform: [{ scale: 0.9 }] }]}>
      <Hex size={size} fill={fill}><Icon name={icon} size={iconSize ?? Math.round(size * 0.42)} color={iconColor} /></Hex>
    </Pressable>
  );
}

/** Profile picture clipped to a hexagon, with a gold outline. */
export function HexAvatar({ user, size = 56, ring = true }: { user?: { avatarUrl?: string | null } | null; size?: number; ring?: boolean }) {
  const id = sid(useId());
  const h = hexHeight(size);
  const uri = media(user?.avatarUrl);
  const inset = ring ? 3 : 0;
  return (
    <View style={{ width: size, height: h }} accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={h}>
        <Defs><ClipPath id={`c${id}`}><Polygon points={hexPoints(size, h, inset + 1)} /></ClipPath></Defs>
        <Polygon points={hexPoints(size, h, inset)} fill={colors.pane} />
        {uri ? <SvgImage href={{ uri }} x={0} y={0} width={size} height={h} preserveAspectRatio="xMidYMid slice" clipPath={`url(#c${id})`} /> : null}
        {ring ? <Polygon points={hexPoints(size, h, 1.5)} fill="none" stroke={colors.gold} strokeWidth={Math.max(2, size / 28)} strokeLinejoin="round" /> : null}
      </Svg>
      {uri ? null : <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}><Icon name="person-outline" size={size * 0.4} color={colors.gold} /></View>}
    </View>
  );
}

/** A honey cell: dark hexagon filled with honey from the bottom (0–1), or showing an image. */
export function HoneyCell({ size, fill = 1, imageUri, style }: { size: number; fill?: number; imageUri?: string | null; style?: StyleProp<ViewStyle> }) {
  const id = sid(useId());
  const h = hexHeight(size);
  const top = h * (1 - Math.max(0, Math.min(1, fill)));
  return (
    <View style={[{ width: size, height: h }, style]}>
      <Svg width={size} height={h}>
        <Defs>
          <ClipPath id={`h${id}`}><Polygon points={hexPoints(size, h)} /></ClipPath>
          <LinearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.honeyTop} /><Stop offset="1" stopColor={colors.honeyBottom} />
          </LinearGradient>
        </Defs>
        <Polygon points={hexPoints(size, h)} fill={colors.pane} />
        {imageUri ? <SvgImage href={{ uri: imageUri }} x={0} y={0} width={size} height={h} preserveAspectRatio="xMidYMid slice" clipPath={`url(#h${id})`} />
          : <Rect x={0} y={top} width={size} height={h - top} fill={`url(#g${id})`} clipPath={`url(#h${id})`} />}
      </Svg>
    </View>
  );
}

/** Honeycomb banner: outlined hexagons with a warm glow. */
export function Honeycomb({ width, height, cell = 34 }: { width: number; height: number; cell?: number }) {
  const id = sid(useId());
  const h = hexHeight(cell);
  const polys: string[] = [];
  for (let col = 0, x = -cell / 2; x < width + cell; col++, x += cell * 0.75) {
    for (let y = col % 2 ? -h / 2 : 0; y < height + h; y += h) {
      const pts = hexPoints(cell, h).split(' ').map((p) => { const [px, py] = p.split(',').map(Number); return `${px + x},${py + y}`; }).join(' ');
      polys.push(pts);
    }
  }
  return (
    <Svg width={width} height={height}>
      <Defs>
        <RadialGradient id={`r${id}`} cx="0.65" cy="0.3" r="0.7">
          <Stop offset="0" stopColor="#7a5a1c" /><Stop offset="0.55" stopColor="#2a2114" /><Stop offset="1" stopColor={colors.bg} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill={`url(#r${id})`} />
      {polys.map((p, i) => <Polygon key={i} points={p} fill="none" stroke="#8a6a2a" strokeOpacity={0.55} strokeWidth={1.4} />)}
    </Svg>
  );
}

/** Staggered comb of cells: rows of three, every other row shifted by half a cell. */
export function CombGrid<T extends { id: string }>({ items, width, onPress, label, emptyCells = 0 }: {
  items: (T & { cover?: string | null })[]; width: number; onPress: (item: T) => void; label: (item: T) => string; emptyCells?: number;
}) {
  const size = Math.floor(width / 3.2);
  const h = hexHeight(size);
  const all: ((T & { cover?: string | null }) | null)[] = [...items, ...Array.from({ length: emptyCells }, () => null)];
  const rows: typeof all[] = [];
  for (let i = 0; i < all.length; i += 3) rows.push(all.slice(i, i + 3));
  return (
    <View style={{ alignItems: 'center' }}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', marginTop: r ? -h * 0.18 : 0, marginLeft: r % 2 ? size * 0.55 : 0, gap: size * 0.08 }}>
          {row.map((it, c) => it ? (
            <Pressable key={it.id} onPress={() => onPress(it)} accessibilityRole="button" accessibilityLabel={label(it)} testID="thumb">
              <HoneyCell size={size} imageUri={it.cover} />
            </Pressable>
          ) : <HoneyCell key={`e${r}${c}`} size={size} fill={0} />)}
        </View>
      ))}
    </View>
  );
}
