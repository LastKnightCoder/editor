/**
 * OKLCH 取色与 WCAG 对比度工具。
 * 思维导图主题用它从「色相 + 彩度」种子派生各层级颜色：OKLCH 的 L 在感知上均匀，
 * 同一 L 下不同色相的明暗接近，才能保证一套主题里每个分支的对比度一致。
 */

export interface Tone {
  hex: string;
  /** WCAG 相对亮度（0~1） */
  luminance: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

function oklchToLinearRgb(l: number, c: number, h: number): [number, number, number] {
  const a = c * Math.cos(toRad(h));
  const b = c * Math.sin(toRad(h));
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
}

const EPS = 1e-4;
const inGamut = (rgb: [number, number, number]) => rgb.every(v => v >= -EPS && v <= 1 + EPS);

const encode = (v: number) => {
  const x = Math.min(1, Math.max(0, v));
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
};

const decode = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

const luminanceOf = ([r, g, b]: [number, number, number]) => {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return 0.2126 * clamp(r) + 0.7152 * clamp(g) + 0.0722 * clamp(b);
};

/** OKLCH → sRGB；超出色域时保持 L、H 不变，二分降低彩度 */
export function oklch(l: number, c: number, h: number): Tone {
  const L = Math.min(1, Math.max(0, l));
  let rgb = oklchToLinearRgb(L, c, h);
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = c;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinearRgb(L, mid, h))) lo = mid;
      else hi = mid;
    }
    rgb = oklchToLinearRgb(L, lo, h);
  }
  const hex =
    "#" +
    rgb
      .map(v =>
        Math.round(encode(v) * 255)
          .toString(16)
          .padStart(2, "0")
      )
      .join("");
  // 亮度按量化后的 hex 计算，和最终渲染的颜色一致（避免四舍五入让对比度差一点点）
  return hexTone(hex);
}

export function hexTone(hex: string): Tone {
  const n = hex.replace("#", "");
  const rgb = [0, 2, 4].map(i => decode(parseInt(n.slice(i, i + 2), 16) / 255)) as [
    number,
    number,
    number,
  ];
  return { hex: `#${n.toLowerCase()}`, luminance: luminanceOf(rgb) };
}

export function contrast(a: Tone, b: Tone): number {
  const [hi, lo] = a.luminance > b.luminance ? [a, b] : [b, a];
  return (hi.luminance + 0.05) / (lo.luminance + 0.05);
}

/**
 * 从目标亮度出发，沿 direction 逐步调整 L，直到与 against 的对比度达标。
 * 调到尽头仍不达标时返回最后一档（调用方的单测会兜住这种情况）。
 */
export function fitTone(
  l: number,
  c: number,
  h: number,
  against: Tone,
  minRatio: number,
  direction: "darker" | "lighter"
): Tone {
  const step = direction === "darker" ? -0.01 : 0.01;
  let tone = oklch(l, c, h);
  for (let cur = l; cur >= 0 && cur <= 1; cur += step) {
    tone = oklch(cur, c, h);
    if (contrast(tone, against) >= minRatio) return tone;
  }
  return tone;
}
