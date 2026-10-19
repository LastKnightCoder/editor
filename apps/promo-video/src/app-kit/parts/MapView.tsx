/**
 * 知识地图画布（Deep Work 版），照 components/LinkGraph/renderers/Canvas2DRenderer.ts 的地图模式用 SVG 重画：
 *  - 三级语义缩放：scale < 1.3 只有大主题名（岛中心）；1.3–2.4 大主题名退到岛上沿、显出子主题名；≥ 2.4 显卡片标题（按度数避让，14 字截断）；
 *  - 连线 ink-3·0.45，聚焦时相连的线变 accent、其余节点降到 0.25；当前节点 accent + 3.2 倍辉光；桥接节点外加细环；
 *  - 生长回放：节点按 reveal 弹簧长出，连线等两端都出现后从先出现的一端画出，主题名按已出现比例 × 3 淡入。
 * 坐标系是窗口里的画布像素；lens 是镜头在窗口之外额外推近的倍数——位置随镜头放大，
 * 字号、半径、线宽按 lens 反向缩小，屏幕上看起来就是软件自己把地图放大了 lens 倍。
 */
import type { CSSProperties, ReactNode } from "react";
import { DEEP_BOUNDS, DEEP_EDGES, DEEP_NODES, DEEP_SUBS, DEEP_TOPICS, SUB_SHAPES, TOPIC_SHAPES, type DeepNode } from "../../mock/deepmap";

export const MAP_SUBTOPIC_LABEL_SCALE = 1.3;
export const MAP_CARD_LABEL_SCALE = 2.4;
const DIMMED_ALPHA = 0.25;
const LABEL_CELL = 18;

export type MapViewport = { x: number; y: number; scale: number };
export type Rect = { left: number; top: number; right: number; bottom: number };

export type MapArc = {
  a: number;
  b: number;
  /** 描出进度 0→1 */
  draw: number;
  linked?: boolean;
};

export type MapInsightLayer = {
  arcs: MapArc[];
  /** 选中第几处（其余降到 0.2）；amount 为渐变 */
  selected?: { index: number; amount: number };
  /** 「问了没写」虚线圈（地图坐标） */
  pin?: { x: number; y: number; appear: number };
};

export type MapViewProps = {
  width: number;
  height: number;
  view: MapViewport;
  lens?: number;
  /** 可见区域（画布像素），用于剔除画外的节点与标签 */
  visible?: Rect;
  /** 生长回放：每个节点的显现程度，不传表示没在播放 */
  reveal?: (node: DeepNode) => number;
  /** 当前节点：accent 填充 + 辉光 */
  current?: number[];
  /** 聚焦（同悬停）：相连的线变 accent，其余节点降淡 */
  focus?: { id: number; amount: number };
  /** 片中现场连上的线：从 a 伸向 b（t 为伸出进度），之后和普通连线一样参与聚焦与回放 */
  growing?: { a: number; b: number; t: number }[];
  insight?: MapInsightLayer;
  /** 悬停标题：节点正下方 12px，垫 bg·0.88 圆角底板（远景下只有它显示卡片标题） */
  hoverLabel?: { id: number; opacity: number };
  /** 节点旁的标题签（洞见选中时，地图自己没画标题才显示） */
  chips?: { id: number; opacity: number }[];
  children?: ReactNode;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const spring = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.exp(-7 * t) * Math.cos(10 * t));
const truncate = (s: string, limit = 14) => ([...s].length > limit ? `${[...s].slice(0, limit).join("")}…` : s);
/** 文字宽度估算：中文、全角按字号，西文按 0.56 倍 */
const textWidth = (s: string, size: number) => [...s].reduce((w, ch) => w + (/[⺀-￯]/.test(ch) ? size : size * 0.56), 0);
const overlaps = (a: Rect, b: Rect) => !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);

export const nodeFill = (hue: number) => `oklch(0.62 0.085 ${hue})`;

/** 整张地图适配 width × height 的画布（四周留 10%） */
export function fitView(width: number, height: number): MapViewport {
  const { minX, maxX, minY, maxY } = DEEP_BOUNDS;
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, scale: Math.min(width / (maxX - minX), height / (maxY - minY)) * 0.9 };
}

/** 地图坐标 → 画布像素 */
export function mapProjector(view: MapViewport, width: number, height: number) {
  return (x: number, y: number) => [(x - view.x) * view.scale + width / 2, (y - view.y) * view.scale + height / 2] as const;
}

/** 呼应弧线：二次贝塞尔，控制点在中垂线上，偏移 max(24, 长度 × 0.22)（按屏幕像素算） */
function arcPath(ax: number, ay: number, bx: number, by: number, lens: number) {
  const len = Math.hypot(bx - ax, by - ay);
  const off = Math.max(24, len * lens * 0.22) / lens;
  const nx = -(by - ay) / (len || 1);
  const ny = (bx - ax) / (len || 1);
  const cx = (ax + bx) / 2 + nx * off;
  const cy = (ay + by) / 2 + ny * off;
  return { d: `M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`, apex: { x: (ax + bx) / 4 + cx / 2, y: (ay + by) / 4 + cy / 2 } };
}

export function arcApex(arc: { a: number; b: number }, view: MapViewport, width: number, height: number, lens = 1) {
  const p = mapProjector(view, width, height);
  const [ax, ay] = p(DEEP_NODES[arc.a].x, DEEP_NODES[arc.a].y);
  const [bx, by] = p(DEEP_NODES[arc.b].x, DEEP_NODES[arc.b].y);
  return arcPath(ax, ay, bx, by, lens).apex;
}

export function MapView({ width, height, view, lens = 1, visible, reveal, current = [], focus, growing = [], insight, hoverLabel, chips = [], children }: MapViewProps) {
  const toCanvas = mapProjector(view, width, height);
  const scale = view.scale * lens;
  const px = (v: number) => v / lens;
  const area = visible ?? { left: 0, top: 0, right: width, bottom: height };
  const inArea = (x: number, y: number, pad: number) => x > area.left - pad && x < area.right + pad && y > area.top - pad && y < area.bottom + pad;

  const shown = (n: DeepNode) => (reveal ? clamp01(reveal(n)) : 1);
  const emphasis = focus ? clamp01(focus.amount) : 0;
  const adjacent = new Set<number>();
  if (focus) {
    for (const [a, b] of DEEP_EDGES) {
      if (a === focus.id) adjacent.add(b);
      if (b === focus.id) adjacent.add(a);
    }
    for (const g of growing) {
      if (g.a === focus.id && g.t > 0) adjacent.add(g.b);
    }
  }
  const currentSet = new Set(current);

  const pos = DEEP_NODES.map(n => toCanvas(n.x, n.y));
  const radius = (n: DeepNode) => px(Math.max(1.2, n.radius * scale));

  // —— 连线
  const edgeWidth = px(Math.max(0.5, 1.1 * Math.min(1, scale)));
  const hiWidth = px(Math.max(1, 1.8 * Math.min(1, scale)));
  const normal: string[] = [];
  const high: string[] = [];
  const edges = [...DEEP_EDGES.map(([a, b]) => ({ a, b, t: 1 })), ...growing.filter(g => g.t > 0)];
  for (const { a, b, t } of edges) {
    const sa = shown(DEEP_NODES[a]);
    const sb = shown(DEEP_NODES[b]);
    if (sa <= 0 || sb <= 0) continue;
    let [ax, ay] = pos[a];
    let [bx, by] = pos[b];
    // 片中现场连的线从 a 伸向 b；回放时从先出现的一端画向后出现的一端
    let amount = t;
    if (sa < 1 || sb < 1) {
      if (sa < sb) [ax, ay, bx, by] = [bx, by, ax, ay];
      amount = Math.min(sa, sb);
    }
    bx = ax + (bx - ax) * amount;
    by = ay + (by - ay) * amount;
    if (!inArea(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax) + 40) && !inArea(Math.max(ax, bx), Math.max(ay, by), Math.abs(bx - ax) + 40)) continue;
    const d = `M${ax.toFixed(1)} ${ay.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}`;
    if (emphasis > 0 && (a === focus!.id || b === focus!.id)) high.push(d);
    else normal.push(d);
  }

  // 现场连线伸出途中，线头带一个 accent 光点（只在伸出期间）
  const tips = growing
    .filter(g => g.t > 0 && g.t < 1)
    .map(g => {
      const [ax, ay] = pos[g.a];
      const [bx, by] = pos[g.b];
      return { x: ax + (bx - ax) * g.t, y: ay + (by - ay) * g.t, key: `${g.a}-${g.b}` };
    });

  // —— 节点
  const nodeEls: ReactNode[] = [];
  const glows: ReactNode[] = [];
  const candidates: DeepNode[] = [];
  for (const n of DEEP_NODES) {
    const appear = shown(n);
    if (appear <= 0) continue;
    const isGrowing = appear < 1;
    const [cx, cy] = pos[n.id];
    const r = radius(n) * (isGrowing ? spring(appear) : 1);
    if (r <= 0 || !inArea(cx, cy, r * 3.2 + 4)) continue;
    const isCurrent = currentSet.has(n.id);
    const dimmed = emphasis > 0 && n.id !== focus!.id && !adjacent.has(n.id);
    let alpha = 1;
    if (dimmed) alpha *= 1 - (1 - DIMMED_ALPHA) * emphasis;
    if (isGrowing) alpha *= Math.min(1, appear * 2);
    if (isCurrent) glows.push(<circle key={`g${n.id}`} cx={cx} cy={cy} r={r * 3.2} fill="url(#map-glow)" />);
    const stroke = r * lens > 2.5 && !isGrowing && (!dimmed || emphasis < 0.5);
    nodeEls.push(
      <g key={n.id} opacity={alpha}>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={isCurrent ? "var(--tau-accent)" : nodeFill(DEEP_TOPICS[n.topic].hue)}
          stroke={stroke ? (isCurrent ? "color-mix(in srgb, var(--tau-accent) 35%, transparent)" : "var(--tau-bg-surface)") : undefined}
          strokeOpacity={stroke && !isCurrent ? 0.9 : undefined}
          strokeWidth={stroke ? px(Math.min(2, r * lens * 0.35)) : undefined}
        />
        {n.bridge && !isGrowing && !dimmed && !isCurrent && scale >= 0.55 && <circle cx={cx} cy={cy} r={r + px(2.5)} fill="none" stroke="var(--tau-ink-1)" strokeOpacity={0.45} strokeWidth={px(1)} />}
      </g>
    );
    if (n.title && !isGrowing && (isCurrent || scale >= MAP_CARD_LABEL_SCALE - 0.15)) candidates.push(n);
  }

  // —— 卡片标题：按优先级（当前态 > 度数）避让
  const titleWeight = smooth(MAP_CARD_LABEL_SCALE - 0.15, MAP_CARD_LABEL_SCALE + 0.15, scale);
  const titleEls: ReactNode[] = [];
  if (titleWeight > 0) {
    const placed: Rect[] = [];
    candidates.sort((a, b) => (currentSet.has(b.id) ? 1e4 : 0) + b.degree - ((currentSet.has(a.id) ? 1e4 : 0) + a.degree));
    for (const n of candidates) {
      const [cx, cy] = pos[n.id];
      const text = truncate(n.title!);
      const half = px(textWidth(text, 12) / 2 + 2);
      const top = cy + radius(n) + px(4);
      const box = { left: cx - half, right: cx + half, top, bottom: top + px(LABEL_CELL) };
      if (!inArea(cx, cy, 40) || placed.some(o => overlaps(box, o))) continue;
      placed.push(box);
      const dimmed = emphasis > 0 && n.id !== focus!.id && !adjacent.has(n.id);
      titleEls.push(
        <text
          key={n.id}
          x={cx}
          y={top}
          dominantBaseline="hanging"
          textAnchor="middle"
          fontSize={px(12)}
          fill="var(--tau-ink-1)"
          opacity={titleWeight * (dimmed ? 1 - (1 - DIMMED_ALPHA) * emphasis : 1)}
        >
          {text}
        </text>
      );
    }
  }

  // —— 主题名 / 子主题名
  const mapLabelWeight = 1 - titleWeight;
  const subWeight = smooth(MAP_SUBTOPIC_LABEL_SCALE - 0.12, MAP_SUBTOPIC_LABEL_SCALE + 0.12, scale);
  const labelEls: ReactNode[] = [];
  // 悬停标题先占位，与它重叠的主题名让位
  const hoverBox = (() => {
    if (!hoverLabel || hoverLabel.opacity <= 0.05) return null;
    const n = DEEP_NODES[hoverLabel.id];
    const [cx, cy] = pos[n.id];
    const half = px(textWidth(truncate(n.title ?? ""), 12) / 2 + 8);
    const top = cy + radius(n) + px(1);
    return { left: cx - half, right: cx + half, top, bottom: top + px(LABEL_CELL) };
  })();
  if (mapLabelWeight > 0) {
    const placed: Rect[] = [];
    const reserved = hoverBox ? [hoverBox] : [];
    const presence = (pred: (n: DeepNode) => boolean) => {
      if (!reveal) return 1;
      let sum = 0;
      let count = 0;
      for (const n of DEEP_NODES) if (pred(n)) ((sum += shown(n)), count++);
      return count ? Math.min(1, (sum / count) * 3) : 0;
    };
    const draw = (key: string, text: string, x: number, y: number, size: number, weight: number, alpha: number, force: boolean) => {
      if (alpha <= 0 || !inArea(x, y, 40)) return;
      const half = px(textWidth(text, size) / 2 + 6);
      const box = { left: x - half, right: x + half, top: y - px(size * 0.8), bottom: y + px(size * 0.8) };
      if (reserved.some(o => overlaps(box, o))) return;
      if (!force && placed.some(o => overlaps(box, o))) return;
      placed.push(box);
      labelEls.push(
        <text
          key={key}
          x={x}
          y={y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={px(size)}
          fontWeight={weight}
          fill="var(--tau-ink-1)"
          fillOpacity={alpha}
          stroke="var(--tau-bg-surface)"
          strokeOpacity={0.9}
          strokeWidth={px(Math.max(3, size * 0.32))}
          strokeLinejoin="round"
          paintOrder="stroke"
        >
          {text}
        </text>
      );
    };
    DEEP_TOPICS.forEach(topic => {
      const shape = TOPIC_SHAPES[topic.id];
      const alpha = presence(n => n.topic === topic.id);
      const size = Math.round(Math.min(18, 13 + Math.sqrt(shape.count) * 0.3));
      const [cx, cy] = toCanvas(shape.x, shape.y);
      const top = cy - shape.radius * 0.72 * view.scale;
      draw(`t${topic.id}`, topic.label, cx, cy + (top - cy) * subWeight, size, 600, alpha * (1 - 0.45 * subWeight) * mapLabelWeight, subWeight < 0.5);
    });
    if (subWeight > 0) {
      DEEP_SUBS.forEach(sub => {
        const shape = SUB_SHAPES[sub.id];
        if (shape.count < 3) return;
        const [cx, cy] = toCanvas(shape.x, shape.y);
        draw(`s${sub.id}`, sub.label, cx, cy, 12, 500, 0.85 * presence(n => n.sub === sub.id) * subWeight * mapLabelWeight, false);
      });
    }
  }

  if (hoverLabel && hoverLabel.opacity > 0) {
    const n = DEEP_NODES[hoverLabel.id];
    const [cx, cy] = pos[n.id];
    const text = truncate(n.title ?? "");
    const w = px(textWidth(text, 12) + 4);
    const top = cy + radius(n) + px(4);
    titleEls.push(
      <g key="hover" opacity={hoverLabel.opacity}>
        <rect x={cx - w / 2 - px(4)} y={top - px(3)} width={w + px(8)} height={px(LABEL_CELL)} rx={px(4)} fill="var(--tau-bg-surface)" fillOpacity={0.88} />
        <text x={cx} y={top} dominantBaseline="hanging" textAnchor="middle" fontSize={px(12)} fill="var(--tau-ink-1)">
          {text}
        </text>
      </g>
    );
  }

  // —— 洞见覆盖层
  const insightEls: ReactNode[] = [];
  if (insight) {
    insight.arcs.forEach((arc, i) => {
      if (arc.draw <= 0) return;
      const [ax, ay] = pos[arc.a];
      const [bx, by] = pos[arc.b];
      const { d } = arcPath(ax, ay, bx, by, lens);
      const color = arc.linked ? "var(--tau-ink-3)" : "var(--tau-info)";
      const sel = insight.selected;
      const opacity = sel && sel.index !== i ? 1 - 0.8 * sel.amount : 1;
      const glow = sel && sel.index === i ? sel.amount : 0;
      const dot = (n: DeepNode) => px(Math.max(4.5, n.radius * scale * 0.35));
      insightEls.push(
        <g key={`arc${i}`} opacity={opacity} style={glow > 0 ? { filter: `drop-shadow(0 0 ${3 * glow}px var(--tau-accent-soft))` } : undefined}>
          <path d={d} fill="none" stroke={color} strokeWidth={px(1.8)} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - arc.draw} />
          {[arc.a, arc.b].map(id => (
            <circle key={id} cx={pos[id][0]} cy={pos[id][1]} r={dot(DEEP_NODES[id])} fill={color} opacity={Math.min(1, arc.draw * 3)} />
          ))}
          {glow > 0 &&
            [arc.a, arc.b].map(id => (
              <circle key={`ring${id}`} cx={pos[id][0]} cy={pos[id][1]} r={Math.max(px(7), radius(DEEP_NODES[id]) + px(4))} fill="none" stroke="var(--tau-accent)" strokeWidth={px(2)} opacity={glow} />
            ))}
        </g>
      );
    });
    if (insight.pin && insight.pin.appear > 0) {
      const [cx, cy] = toCanvas(insight.pin.x, insight.pin.y);
      const sel = insight.selected;
      insightEls.push(
        <g key="pin" opacity={insight.pin.appear * (sel ? 1 - 0.8 * sel.amount : 1)}>
          <circle cx={cx} cy={cy} r={px(14)} fill="var(--tau-bg-surface)" fillOpacity={0.6} stroke="var(--tau-warn)" strokeWidth={px(1.5)} strokeDasharray={`${px(4)} ${px(3)}`} />
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={px(14)} fontWeight={600} fill="var(--tau-warn)">
            ?
          </text>
        </g>
      );
    }
  }

  const chipStyle = (id: number, opacity: number): CSSProperties => {
    const [cx, cy] = pos[id];
    return {
      left: cx,
      top: cy - radius(DEEP_NODES[id]) - px(6),
      opacity,
      transform: `translate(-50%, -100%) scale(${1 / lens})`,
      transformOrigin: "50% 100%",
    };
  };

  return (
    <div className="relative" style={{ width, height }}>
      <svg width={width} height={height} className="absolute inset-0 overflow-visible" style={{ fontFamily: "var(--tau-font)" }}>
        <defs>
          <radialGradient id="map-glow">
            <stop offset="31%" stopColor="var(--tau-accent)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--tau-accent)" stopOpacity={0} />
          </radialGradient>
        </defs>
        <path d={normal.join("")} fill="none" stroke="var(--tau-ink-3)" strokeOpacity={0.45 * (1 - 0.6 * emphasis)} strokeWidth={edgeWidth} />
        {high.length > 0 && <path d={high.join("")} fill="none" stroke="var(--tau-ink-3)" strokeOpacity={0.45 * (1 - emphasis)} strokeWidth={edgeWidth} />}
        {high.length > 0 && <path d={high.join("")} fill="none" stroke="var(--tau-accent)" strokeOpacity={emphasis} strokeWidth={hiWidth} strokeLinecap="round" />}
        {tips.map(tip => (
          <g key={tip.key}>
            <circle cx={tip.x} cy={tip.y} r={px(11)} fill="var(--tau-accent)" opacity={0.22} />
            <circle cx={tip.x} cy={tip.y} r={px(4)} fill="var(--tau-accent)" />
          </g>
        ))}
        {glows}
        {nodeEls}
        {labelEls}
        {titleEls}
        {insightEls}
      </svg>
      {chips.map(({ id, opacity }) =>
        opacity > 0 ? (
          <span key={id} className="bg-surface shadow-float text-ink-1 absolute max-w-[180px] truncate rounded-full px-2 py-px text-[12px] whitespace-nowrap" style={chipStyle(id, opacity)}>
            {DEEP_NODES[id].title}
          </span>
        ) : null
      )}
      {children}
    </div>
  );
}
