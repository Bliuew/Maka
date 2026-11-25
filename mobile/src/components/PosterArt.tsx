// Vector poster art for titles without a poster image: a sun over a skyline with
// honeycomb outlines. Drawn from the title's id so each title looks different.
import React from 'react';
import Svg, { Circle, Defs, LinearGradient, Polygon, Rect, Stop } from 'react-native-svg';
import { colors } from '../lib/theme';
import { hexPoints } from './hex';

function seeded(id: string) {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 1000) / 1000;
}

export default function PosterArt({ id, width, height }: { id: string; width: number; height: number }) {
  const r = seeded(id);
  const sunR = Math.min(width, height) * (0.3 + r() * 0.12);
  const sx = width * (0.35 + r() * 0.3), sy = height * (0.42 + r() * 0.1);
  const ground = height * 0.78;
  const blocks: { x: number; w: number; h: number }[] = [];
  for (let x = 0; x < width;) { const w = width * (0.08 + r() * 0.1); blocks.push({ x, w, h: height * (0.08 + r() * 0.22) }); x += w + width * 0.02; }
  const hexes = Array.from({ length: 4 }, () => ({ x: r() * width * 0.85, y: r() * height * 0.6, s: width * (0.1 + r() * 0.06) }));
  return (
    <Svg width={width} height={height} accessible={false}>
      <Defs>
        <LinearGradient id={`sky${id}`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#1f1b16" /><Stop offset="1" stopColor="#120f0b" /></LinearGradient>
      </Defs>
      <Rect width={width} height={height} fill={`url(#sky${id})`} />
      <Circle cx={sx} cy={sy} r={sunR} fill={colors.honeyBottom} />
      <Circle cx={sx} cy={sy} r={sunR * 0.63} fill="#e8d29b" />
      {hexes.map((h, i) => <Polygon key={i} points={hexPoints(h.s, h.s * 0.866).split(' ').map((p) => { const [a, b] = p.split(',').map(Number); return `${a + h.x},${b + h.y}`; }).join(' ')} fill="none" stroke="#6b5a3a" strokeWidth={1.6} />)}
      {blocks.map((b, i) => <Rect key={i} x={b.x} y={ground - b.h} width={b.w} height={b.h + 2} fill="#0d0b08" />)}
      <Rect x={0} y={ground} width={width} height={height - ground} fill="#0d0b08" />
    </Svg>
  );
}
