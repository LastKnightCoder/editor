/** 线型节奏：visible 为一段墨的可见长度（点线为 0，点由圆头形成），pitch 为一个周期 */
export interface DashRhythm {
  visible: number;
  pitch: number;
}

export interface DashFit {
  dash: number;
  gap: number;
  pitch: number;
  count: number;
}

export interface RectSide {
  d: string;
  length: number;
}

const f = (n: number) => Math.round(n * 100) / 100;

const clampRadius = (radius: number, width: number, height: number) => Math.max(0, Math.min(radius, width / 2, height / 2));

/** 四条边各自从上一个角的弧中点顺时针走到下一个角的弧中点：每个角由相邻两边各出半段拼成，角上永远是墨 */
export function roundedRectSides(width: number, height: number, radius: number): RectSide[] {
  const r = clampRadius(radius, width, height);
  const k = r * (1 - Math.SQRT1_2);
  const q = (Math.PI * r) / 4;
  const arc = (x: number, y: number) => (r > 0 ? ` A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y)}` : ` L${f(x)} ${f(y)}`);
  const hl = width - 2 * r + 2 * q;
  const vl = height - 2 * r + 2 * q;
  return [
    { d: `M${f(k)} ${f(k)}${arc(r, 0)} L${f(width - r)} 0${arc(width - k, k)}`, length: hl },
    {
      d: `M${f(width - k)} ${f(k)}${arc(width, r)} L${f(width)} ${f(height - r)}${arc(width - k, height - k)}`,
      length: vl,
    },
    {
      d: `M${f(width - k)} ${f(height - k)}${arc(width - r, height)} L${f(r)} ${f(height)}${arc(k, height - k)}`,
      length: hl,
    },
    {
      d: `M${f(k)} ${f(height - k)}${arc(0, height - r)} L${f(0)} ${f(r)}${arc(k, k)}`,
      length: vl,
    },
  ];
}

export function roundedRectPerimeter(width: number, height: number, radius: number): number {
  const r = clampRadius(radius, width, height);
  return 2 * (width + height) - 8 * r + 2 * Math.PI * r;
}

/** 节奏贴合到一段长度：整数个周期；capExtension 是圆头描边向两端多出的总长，用来让「可见长度」等于设计值 */
export function fitDash(length: number, rhythm: DashRhythm, capExtension: number): DashFit {
  if (length <= 0 || rhythm.pitch <= 0) return { dash: 0, gap: 0, pitch: 0, count: 0 };
  const count = Math.max(1, Math.round(length / rhythm.pitch));
  const pitch = length / count;
  const dash = Math.max(0, rhythm.visible * (pitch / rhythm.pitch) - capExtension);
  return { dash, gap: pitch - dash, pitch, count };
}
