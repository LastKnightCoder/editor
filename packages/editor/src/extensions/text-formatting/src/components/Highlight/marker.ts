import { getInlinePaletteEntry } from "../../inline-palette.ts";
import type { HighlightStyle } from "../../types.ts";

export type MarkerStyle = Exclude<HighlightStyle, "flat">;

/** 一种笔触在某色某明暗下的三张背景切片：左笔头、中段、右笔头 */
export interface MarkerTiles {
  left: string;
  mid: string;
  right: string;
  /** 中段平铺切片的宽度 */
  midSize: string;
}

/**
 * 每种笔触的不透明度（浅 / 深）。浅色纸用正片叠底；深色纸叠底看不见，
 * 只能普通混合并压低透明度，保证字色与笔迹的对比度。
 */
const ALPHA: Record<MarkerStyle, [number, number]> = {
  chisel: [0.4, 0.28],
  swipe: [0.46, 0.32],
  grain: [0.5, 0.32],
};

/** 切片的纵向坐标系：0–100 对应文字内容区高度 */
const TOP = 6;
const BOTTOM = 95;

const rgba = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${Math.min(1, alpha).toFixed(3)})`;
};

const random = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
};

const toUrl = (width: number, body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width} 100' preserveAspectRatio='none'>${body}</svg>`
  )}")`;

const pointsPath = (points: [number, number][]) =>
  "M" + points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L") + " Z";

/** 平铺中段的上下沿：两端回到基线，横向平铺无缝，也与笔头对齐 */
function jitterBand(
  width: number,
  top: number,
  bottom: number,
  amp: number,
  step: number,
  r: () => number
) {
  const upper: [number, number][] = [];
  const lower: [number, number][] = [];
  for (let x = 0; x <= width; x += step) {
    const end = x === 0 || x >= width;
    upper.push([x, end ? top : top + (r() - 0.5) * amp]);
    lower.push([x, end ? bottom : bottom + (r() - 0.5) * amp]);
  }
  return pointsPath([...upper, ...lower.reverse()]);
}

/** 笔头与中段共用的内部纹理（积墨的上下沿 + 两道细纹），裁进各自的轮廓，接缝处连续 */
function chiselTexture(width: number, color: string, alpha: number) {
  return (
    `<rect x='0' y='${TOP}' width='${width}' height='9' fill='${rgba(color, alpha * 0.5)}'/>` +
    `<rect x='0' y='${BOTTOM - 10}' width='${width}' height='10' fill='${rgba(color, alpha * 0.6)}'/>` +
    `<rect x='0' y='42' width='${width}' height='2.5' fill='${rgba(color, alpha * 0.35)}'/>` +
    `<rect x='0' y='66' width='${width}' height='2' fill='${rgba(color, alpha * 0.3)}'/>`
  );
}

/** A 平头荧光笔：两端平行斜切；起笔一侧略积墨，收笔一侧略淡，都在笔头内渐变到中段的浓度 */
function chisel(color: string, alpha: number, r: () => number): MarkerTiles {
  const midWidth = 64;
  const capWidth = 10;
  const fill = rgba(color, alpha);
  const mid =
    `<clipPath id='c'><path d='${jitterBand(midWidth, TOP, BOTTOM, 5, 8, r)}'/></clipPath>` +
    `<g clip-path='url(#c)'><rect width='${midWidth}' height='100' fill='${fill}'/>${chiselTexture(midWidth, color, alpha)}</g>`;
  const leftShape = `M3 ${TOP} L${capWidth} ${TOP} L${capWidth} ${BOTTOM} L1.2 ${BOTTOM} Q0 ${BOTTOM} 0.3 ${BOTTOM - 4} Z`;
  const rightShape = `M0 ${TOP} L${capWidth - 0.6} ${TOP} Q${capWidth} ${TOP} ${capWidth - 0.3} ${TOP + 4} L7 ${BOTTOM} L0 ${BOTTOM} Z`;
  const cap = (shape: string, gradient: string) =>
    `<defs><linearGradient id='g'>${gradient}</linearGradient></defs>` +
    `<clipPath id='c'><path d='${shape}'/></clipPath>` +
    `<g clip-path='url(#c)'><rect width='${capWidth}' height='100' fill='url(#g)'/>${chiselTexture(capWidth, color, alpha)}</g>`;
  return {
    left: toUrl(
      capWidth,
      cap(
        leftShape,
        `<stop offset='0' stop-color='${rgba(color, alpha * 1.3)}'/><stop offset='1' stop-color='${fill}'/>`
      )
    ),
    mid: toUrl(midWidth, mid),
    right: toUrl(
      capWidth,
      cap(
        rightShape,
        `<stop offset='0' stop-color='${fill}'/><stop offset='1' stop-color='${rgba(color, alpha * 0.8)}'/>`
      )
    ),
    midSize: `${midWidth}px`,
  };
}
/** B 下半划线：只盖字身下半，圆头 */
function swipe(color: string, alpha: number, r: () => number): MarkerTiles {
  const midWidth = 64;
  const top = 50;
  const fill = rgba(color, alpha);
  const edge = `<rect x='0' y='${BOTTOM - 7}' width='CAPW' height='7' fill='${rgba(color, alpha * 0.45)}'/>`;
  const mid =
    `<clipPath id='c'><path d='${jitterBand(midWidth, top, BOTTOM, 5, 8, r)}'/></clipPath>` +
    `<g clip-path='url(#c)'><rect width='${midWidth}' height='100' fill='${fill}'/>${edge.replace("CAPW", String(midWidth))}</g>`;
  const cap = (d: string) =>
    `<clipPath id='c'><path d='${d}'/></clipPath>` +
    `<g clip-path='url(#c)'><rect width='10' height='100' fill='${fill}'/>${edge.replace("CAPW", "10")}</g>`;
  return {
    left: toUrl(
      10,
      cap(`M10 ${top} Q2 ${top + 2} 1 ${(top + BOTTOM) / 2} Q2 ${BOTTOM} 10 ${BOTTOM} Z`)
    ),
    mid: toUrl(midWidth, mid),
    right: toUrl(
      10,
      cap(`M0 ${top} Q8 ${top + 3} 9 ${(top + BOTTOM) / 2} Q8 ${BOTTOM - 1} 0 ${BOTTOM} Z`)
    ),
    midSize: `${midWidth}px`,
  };
}

/** C 干笔颗粒：毛边 + 横向噪声镂空；笔头与中段都是「淡底 + 颗粒」两层，浓度一致 */
function grain(color: string, alpha: number, r: () => number): MarkerTiles {
  const midWidth = 96;
  const top = 8;
  const bottom = 93;
  const noise = (seed: number) =>
    `<filter id='n' x='0' y='0' width='100%' height='100%'>` +
    `<feTurbulence type='fractalNoise' baseFrequency='0.035 0.6' numOctaves='2' seed='${seed}' stitchTiles='stitch'/>` +
    `<feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 1.75'/>` +
    `<feComposite in='SourceGraphic' operator='in'/></filter>`;
  const layers = (d: string, seed: number) =>
    `<defs>${noise(seed)}</defs>` +
    `<path d='${d}' fill='${rgba(color, alpha * 0.35)}'/>` +
    `<path d='${d}' fill='${rgba(color, alpha)}' filter='url(#n)'/>`;
  const leftEdge = `M10 ${top} L5 10 L7 22 L2 34 L5 48 L1 62 L4 76 L2 ${bottom} L10 ${bottom} Z`;
  const rightEdge = `M0 ${top} L6 12 L4 26 L9 40 L5 55 L8 70 L3 84 L6 ${bottom} L0 ${bottom} Z`;
  return {
    left: toUrl(10, layers(leftEdge, Math.floor(r() * 1000))),
    mid: toUrl(
      midWidth,
      layers(jitterBand(midWidth, top, bottom, 10, 6, r), Math.floor(r() * 1000))
    ),
    right: toUrl(10, layers(rightEdge, Math.floor(r() * 1000))),
    midSize: `${midWidth}px`,
  };
}

const MAKERS: Record<MarkerStyle, (color: string, alpha: number, r: () => number) => MarkerTiles> =
  {
    chisel,
    swipe,
    grain,
  };

const cache = new Map<string, MarkerTiles>();

/** 某笔触某色某明暗的切片，所有高亮共用一份；未知色值返回 undefined */
export function markerTiles(
  style: MarkerStyle,
  colorId: unknown,
  dark: boolean
): MarkerTiles | undefined {
  const entry = getInlinePaletteEntry(colorId);
  if (!entry) return undefined;
  const key = `${style}|${entry.id}|${dark ? 1 : 0}`;
  let tiles = cache.get(key);
  if (!tiles) {
    const color = dark ? entry.dark : entry.light;
    const seed = 97 + (hash(key) % 100000);
    tiles = MAKERS[style](color, ALPHA[style][dark ? 1 : 0], random(seed));
    cache.set(key, tiles);
  }
  return tiles;
}
