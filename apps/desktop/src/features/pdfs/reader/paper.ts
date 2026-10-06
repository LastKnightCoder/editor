/**
 * 纸色：从页面位图边缘取 PDF 自己的纸色，页边与底纸据此着色（纸色属于文件数据，不随主题变化）。
 * 文字色由纸色朝黑 / 白推出、保证对比度；夜间页面按页面同一反色滤镜换算。
 * 取色失败（边缘杂色过多，如满版封面）时返回 null，调用方回到主题表面色。
 */

export type Rgb = [number, number, number];

export interface PaperPalette {
  paper: string;
  /** 正文（笔记）色 */
  ink: string;
  /** 悬停加深 */
  inkStrong: string;
  /** 提示、条数 */
  muted: string;
  /** 虚线分隔 */
  line: string;
  hover: string;
}

/** 与 PageFrame 夜间页面的 [filter:invert(0.88)_hue-rotate(180deg)] 一致 */
export const NIGHT_INVERT = 0.88;

const SAMPLE_WIDTH = 48;
/** 边缘像素里最多的那一档颜色至少占这么多，才认为是纸色 */
const DOMINANT_SHARE = 0.5;

const clamp255 = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
const css = ([r, g, b]: Rgb, alpha = 1) =>
  alpha === 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${alpha})`;

/** 边缘像素按 16 档量化取众数，返回该档的平均色 */
export function dominantEdgeColor(pixels: Rgb[]): Rgb | null {
  if (pixels.length === 0) return null;
  const buckets = new Map<number, { count: number; sum: Rgb }>();
  for (const [r, g, b] of pixels) {
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { count: 0, sum: [0, 0, 0] };
    bucket.count += 1;
    bucket.sum[0] += r;
    bucket.sum[1] += g;
    bucket.sum[2] += b;
    buckets.set(key, bucket);
  }
  let best: { count: number; sum: Rgb } | null = null;
  for (const bucket of buckets.values()) if (!best || bucket.count > best.count) best = bucket;
  if (!best || best.count / pixels.length < DOMINANT_SHARE) return null;
  return best.sum.map(v => Math.round(v / best.count)) as Rgb;
}

/** 从已加载的页面位图取纸色（缩到 48px 宽，取四边 2px 一圈） */
export function samplePaperColor(img: HTMLImageElement): Rgb | null {
  if (!img.naturalWidth || !img.naturalHeight) return null;
  const width = SAMPLE_WIDTH;
  const height = Math.max(4, Math.round((img.naturalHeight / img.naturalWidth) * width));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(img, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    const pixels: Rgb[] = [];
    const band = 2;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const edge = x < band || x >= width - band || y < band || y >= height - band;
        if (!edge) continue;
        const i = (y * width + x) * 4;
        pixels.push([data[i], data[i + 1], data[i + 2]]);
      }
    }
    return dominantEdgeColor(pixels);
  } catch {
    return null;
  }
}

/** 夜间页面：invert(0.88) 后 hue-rotate(180deg)（CSS 滤镜在 sRGB 上的矩阵） */
export function nightPaper([r, g, b]: Rgb): Rgb {
  const inv = (c: number) => NIGHT_INVERT * 255 + c * (1 - 2 * NIGHT_INVERT);
  const [ir, ig, ib] = [inv(r), inv(g), inv(b)];
  return [
    clamp255(-0.574 * ir + 1.43 * ig + 0.144 * ib),
    clamp255(0.426 * ir + 0.43 * ig + 0.144 * ib),
    clamp255(0.426 * ir + 1.43 * ig - 0.856 * ib),
  ];
}

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const mix = (from: Rgb, to: Rgb, t: number): Rgb =>
  from.map((v, i) => clamp255(v + (to[i] - v) * t)) as Rgb;

/** 从纸色出发朝黑 / 白推，直到对比度达标（保留纸的色相，像写在这张纸上） */
function inkOn(paper: Rgb, pole: Rgb, start: number, minContrast: number): Rgb {
  for (let t = start; t < 1; t += 0.05) {
    const ink = mix(paper, pole, t);
    if (contrast(ink, paper) >= minContrast) return ink;
  }
  return pole;
}

export function paperPalette(paper: Rgb): PaperPalette {
  const pole: Rgb = luminance(paper) > 0.36 ? [0, 0, 0] : [255, 255, 255];
  return {
    paper: css(paper),
    ink: css(inkOn(paper, pole, 0.55, 5.5)),
    inkStrong: css(inkOn(paper, pole, 0.7, 9)),
    muted: css(inkOn(paper, pole, 0.35, 3)),
    line: css(mix(paper, pole, 0.2)),
    hover: css(pole, 0.05),
  };
}
