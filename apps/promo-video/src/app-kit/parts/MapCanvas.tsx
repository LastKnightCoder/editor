/**
 * 知识地图画布（SVG）。同一份数据两种画法：
 *  - app：照 components/LinkGraph Canvas2DRenderer 的视觉（主题色 oklch 节点、ink-3 连线、底色描边的主题名）；
 *  - star：视频夜景的星图（发光节点、金色细线、衬线主题名）。
 * 生长动画沿用 core/timeline.ts 的口径：节点按 born 次序出现，半径走弹簧 1 − e^(−7t)·cos(10t)，连线由先出现的一端伸向后出现的一端。
 */
import { fonts, palette } from "../../brand/tokens";
import { MAP_EDGES, MAP_H, MAP_NODES, MAP_W, OLD_CARD_ID, TODAY_IDS, TOPICS, type MapNode } from "../../mock/map";

const POP = 0.06;

const spring = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.exp(-7 * t) * Math.cos(10 * t));
const nodeT = (node: MapNode, growth: number) => Math.max(0, Math.min(1, (growth - node.born) / POP));

export type MapCanvasProps = {
  variant: "app" | "star";
  width: number;
  height: number;
  /** 生长进度 0→1；1 为完整地图 */
  growth?: number;
  /** 主题名显隐 */
  labels?: number;
  /** 聚焦：其余节点降到 0.25 */
  focus?: { ids: number[]; amount: number };
  /** 洞见「呼应」弧线描出进度 */
  insight?: number;
  /** 显示节点标题；text 覆盖节点自带的标题（不同影片的故事线用不同标题） */
  titles?: { id: number; opacity: number; above?: boolean; text?: string }[];
  /** 今天节点的高亮（星图金色 / 应用 accent） */
  todayGlow?: number;
};

export function MapCanvas({ variant, width, height, growth = 1, labels = 1, focus, insight = 0, titles = [], todayGlow = 0 }: MapCanvasProps) {
  const k = Math.min(width / MAP_W, height / MAP_H);
  const star = variant === "star";
  const visibleShare = MAP_NODES.filter(n => growth >= n.born).length / MAP_NODES.length;
  const dim = (id: number) => (focus && !focus.ids.includes(id) ? 1 - 0.75 * focus.amount : 1);
  const hueFill = (hue: number) => (star ? `oklch(0.9 0.07 ${hue})` : `oklch(0.76 0.075 ${hue})`);
  const surface = "var(--tau-bg-surface)";

  const card = MAP_NODES[TODAY_IDS.card];
  const old = MAP_NODES[OLD_CARD_ID];
  const mx = (card.x + old.x) / 2;
  const my = (card.y + old.y) / 2 - 70;
  const arc = `M ${card.x} ${card.y} Q ${mx} ${my} ${old.x} ${old.y}`;

  return (
    <svg width={width} height={height} viewBox={`${(MAP_W - width / k) / 2} ${(MAP_H - height / k) / 2} ${width / k} ${height / k}`} style={{ overflow: "visible" }}>
      <defs>
        <filter id={`glow-${variant}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={star ? 5 : 6} />
        </filter>
      </defs>

      <g>
        {MAP_EDGES.map(([a, b], i) => {
          const na = MAP_NODES[a];
          const nb = MAP_NODES[b];
          const [first, second] = na.born <= nb.born ? [na, nb] : [nb, na];
          const t = nodeT(second, growth);
          if (t <= 0 || nodeT(first, growth) <= 0) return null;
          const x2 = first.x + (second.x - first.x) * Math.min(1, t * 1.4);
          const y2 = first.y + (second.y - first.y) * Math.min(1, t * 1.4);
          const today = na.today || nb.today;
          const alpha = Math.min(dim(a), dim(b));
          return (
            <line
              key={i}
              x1={first.x}
              y1={first.y}
              x2={x2}
              y2={y2}
              stroke={star ? (today ? palette.night.gold : "rgba(230, 196, 127, 0.9)") : "var(--tau-ink-3)"}
              strokeOpacity={(star ? (today ? 0.75 : 0.22) : 0.45) * alpha}
              strokeWidth={(star ? (today ? 1.4 : 0.8) : 1.1) / Math.max(k, 0.5)}
            />
          );
        })}
      </g>

      {star && (
        <g filter={`url(#glow-${variant})`} opacity={0.85}>
          {MAP_NODES.map(node => {
            const t = nodeT(node, growth);
            if (t <= 0) return null;
            const hue = TOPICS[node.topic].hue;
            return (
              <circle
                key={node.id}
                cx={node.x}
                cy={node.y}
                r={node.r * 1.8 * spring(t)}
                fill={node.today ? palette.night.gold : hueFill(hue)}
                opacity={Math.min(1, t * 2) * dim(node.id) * (node.today ? 0.9 : 0.55)}
              />
            );
          })}
        </g>
      )}

      <g>
        {MAP_NODES.map(node => {
          const t = nodeT(node, growth);
          if (t <= 0) return null;
          const hue = TOPICS[node.topic].hue;
          const r = Math.max(1.2, node.r * spring(t));
          const isToday = node.today && todayGlow > 0;
          return (
            <g key={node.id} opacity={Math.min(1, t * 2) * dim(node.id)}>
              {isToday && !star && <circle cx={node.x} cy={node.y} r={r * 3.2} fill="var(--tau-accent)" opacity={0.28 * todayGlow} filter={`url(#glow-${variant})`} />}
              <circle
                cx={node.x}
                cy={node.y}
                r={star ? r * 0.8 : r}
                fill={node.today ? (star ? palette.night.star : isToday ? "var(--tau-accent)" : hueFill(hue)) : hueFill(hue)}
                stroke={star ? "none" : surface}
                strokeOpacity={0.9}
                strokeWidth={star || r <= 2.5 ? 0 : Math.min(2, r * 0.35)}
              />
              {isToday && star && <circle cx={node.x} cy={node.y} r={r * 2.2} fill="none" stroke={palette.night.gold} strokeOpacity={0.6 * todayGlow} strokeWidth={1 / k} />}
            </g>
          );
        })}
      </g>

      {insight > 0 && (
        <g>
          <path
            d={arc}
            fill="none"
            stroke={star ? palette.night.gold : "var(--tau-info)"}
            strokeWidth={(star ? 2.2 : 1.8) / Math.max(k, 0.5)}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - insight}
          />
          {[card, old].map((n, i) => (
            <circle
              key={i}
              cx={n.x}
              cy={n.y}
              r={Math.max(4.5, n.r + 2)}
              fill="none"
              stroke={star ? palette.night.gold : "var(--tau-info)"}
              strokeWidth={1.6 / Math.max(k, 0.5)}
              opacity={Math.min(1, insight * 2)}
            />
          ))}
        </g>
      )}

      <g opacity={labels * Math.min(1, visibleShare * 3)}>
        {TOPICS.map(topic => {
          const size = (star ? 22 : Math.round(Math.min(18, 13 + Math.sqrt(topic.count) * 0.3))) / k;
          const members = MAP_NODES.filter(n => n.topic === topic.id);
          const cx = members.reduce((s, n) => s + n.x, 0) / members.length;
          const cy = members.reduce((s, n) => s + n.y, 0) / members.length;
          const dimmed = focus ? 1 - 0.6 * focus.amount : 1;
          return (
            <text
              key={topic.id}
              x={cx}
              y={cy}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={size}
              fontWeight={star ? 500 : 600}
              letterSpacing={star ? "0.25em" : undefined}
              fontFamily={star ? fonts.display : "var(--tau-font)"}
              fill={star ? palette.night.ink : "var(--tau-ink-1)"}
              fillOpacity={(star ? 0.78 : 1) * dimmed}
              stroke={star ? "rgba(5, 9, 24, 0.85)" : surface}
              strokeOpacity={0.9}
              strokeWidth={Math.max(3, size * 0.32 * k) / k}
              strokeLinejoin="round"
              paintOrder="stroke"
            >
              {topic.label}
            </text>
          );
        })}
      </g>

      {titles.map(({ id, opacity, above, text }) => {
        const node = MAP_NODES[id];
        const title = text ?? node?.title;
        if (!node || !title || opacity <= 0) return null;
        const size = (star ? 17 : 12) / k;
        return (
          <text
            key={id}
            x={node.x}
            y={above ? node.y - node.r - 8 / k : node.y + node.r + 6 / k + size * 0.9}
            textAnchor="middle"
            fontSize={size}
            fontFamily={star ? fonts.caption : "var(--tau-font)"}
            fill={star ? palette.night.ink : "var(--tau-ink-1)"}
            opacity={opacity}
            stroke={star ? "rgba(5, 9, 24, 0.9)" : surface}
            strokeWidth={4 / k}
            strokeLinejoin="round"
            paintOrder="stroke"
          >
            {title}
          </text>
        );
      })}
    </svg>
  );
}
