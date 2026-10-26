/**
 * 知识地图：三个主题簇的节点与连线。悬停节点时只保留它和相邻节点，其余淡出，并弹出预览；
 * 顶部按类型筛选只调淡未命中的节点，不改颜色。画法参照 features/knowledge-map 的 LinkGraph。
 */
import { useMemo, useState } from "react";
import { cn } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";
import { seededRandom } from "../../../lib/random.ts";

type Kind = "卡片" | "文章" | "项目文档";

interface GraphNode {
  id: number;
  title: string;
  kind: Kind;
  cluster: number;
  x: number;
  y: number;
}

const CLUSTERS = [
  { name: "专注", cx: 26, cy: 38, color: "var(--tau-tag-1)" },
  { name: "学习方法", cx: 70, cy: 32, color: "var(--tau-tag-2)" },
  { name: "写作", cx: 50, cy: 74, color: "var(--tau-tag-3)" },
];

const TITLES: [string, Kind, number][] = [
  ["专注是可以练习的能力", "卡片", 0],
  ["Deep Work 读书笔记", "文章", 0],
  ["注意力残留", "卡片", 0],
  ["浅层工作的虚假满足", "卡片", 0],
  ["无聊是创造力的入口", "卡片", 0],
  ["间隔重复", "项目文档", 1],
  ["主动回忆", "项目文档", 1],
  ["费曼技巧", "卡片", 1],
  ["用闪卡学语言", "文章", 1],
  ["记忆是重建", "卡片", 1],
  ["为什么你很忙却没做成事", "文章", 2],
  ["开头最难", "卡片", 2],
  ["每天写 500 字", "卡片", 2],
  ["第三季度复盘", "文章", 2],
];

const EDGES: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 3],
  [0, 4],
  [2, 3],
  [5, 6],
  [5, 8],
  [6, 7],
  [6, 9],
  [7, 9],
  [10, 11],
  [10, 3],
  [11, 12],
  [12, 13],
  [1, 10],
  [8, 5],
  [4, 11],
  [9, 0],
];

function buildNodes(): GraphNode[] {
  const rand = seededRandom(5);
  return TITLES.map(([title, kind, cluster], id) => {
    const center = CLUSTERS[cluster];
    const angle = rand() * Math.PI * 2;
    const radius = 7 + rand() * 9;
    return {
      id,
      title,
      kind,
      cluster,
      x: center.cx + Math.cos(angle) * radius * 1.3,
      y: center.cy + Math.sin(angle) * radius,
    };
  });
}

const FILTERS: ("全部" | Kind)[] = ["全部", "卡片", "文章", "项目文档"];

export default function MapDemo() {
  const nodes = useMemo(buildNodes, []);
  const [hover, setHover] = useState<number | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("全部");

  const neighbors = useMemo(() => {
    if (hover === null) return null;
    const set = new Set([hover]);
    EDGES.forEach(([a, b]) => {
      if (a === hover) set.add(b);
      if (b === hover) set.add(a);
    });
    return set;
  }, [hover]);

  const dim = (node: GraphNode) =>
    (neighbors !== null && !neighbors.has(node.id)) || (filter !== "全部" && node.kind !== filter);

  const hovered = hover === null ? null : nodes[hover];

  return (
    <AppWindow crumb="知识地图" height={430}>
      <div className="flex h-full flex-col">
        <div className="mt-5 flex h-10 shrink-0 items-center gap-3 px-8 max-sm:px-4">
          <h3 className="text-tau-title-lg font-semibold tracking-[-0.01em]">知识地图</h3>
          <span className="text-tau-meta text-ink-2 max-sm:hidden">
            卡片 8 · 文章 4 · 项目文档 2
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 px-8 pb-3 max-sm:px-4">
          {FILTERS.map(item => (
            <button
              key={item}
              type="button"
              aria-pressed={filter === item}
              onClick={() => setFilter(item)}
              className={cn(
                "text-tau-sm h-7 rounded-full border px-3 transition-colors",
                filter === item && item !== "全部"
                  ? "border-accent text-accent-text"
                  : "border-line-1 text-ink-2 hover:text-ink-1"
              )}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="border-line-2 relative min-h-0 flex-1 border-t">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full"
            aria-hidden="true"
          >
            {EDGES.map(([a, b]) => {
              const on =
                neighbors === null ||
                (neighbors.has(a) && neighbors.has(b) && (a === hover || b === hover));
              return (
                <line
                  key={`${a}-${b}`}
                  x1={nodes[a].x}
                  y1={nodes[a].y}
                  x2={nodes[b].x}
                  y2={nodes[b].y}
                  stroke="var(--tau-ink-3)"
                  strokeWidth={on && hover !== null ? 1.4 : 0.8}
                  vectorEffect="non-scaling-stroke"
                  className="transition-opacity duration-200"
                  opacity={on ? (hover !== null ? 0.8 : 0.35) : 0.06}
                />
              );
            })}
          </svg>
          {CLUSTERS.map(cluster => (
            <span
              key={cluster.name}
              className="text-ink-3 text-tau-sm pointer-events-none absolute -translate-x-1/2 font-semibold"
              style={{ left: `${cluster.cx}%`, top: `${cluster.cy - 22}%` }}
            >
              {cluster.name}
            </span>
          ))}
          {nodes.map(node => {
            const size = node.kind === "文章" ? 16 : node.kind === "项目文档" ? 14 : 11;
            return (
              <button
                key={node.id}
                type="button"
                aria-label={node.title}
                onMouseEnter={() => setHover(node.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(node.id)}
                onBlur={() => setHover(null)}
                className={cn(
                  "absolute -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--tau-bg-surface)] transition-[opacity,transform] duration-200",
                  dim(node) ? "opacity-15" : "opacity-100",
                  hover === node.id && "scale-125"
                )}
                style={{
                  left: `${node.x}%`,
                  top: `${node.y}%`,
                  width: size,
                  height: size,
                  background: CLUSTERS[node.cluster].color,
                }}
              />
            );
          })}
          {hovered && (
            <div
              className="bg-surface border-line-1 shadow-float animate-doc-in pointer-events-none absolute z-10 w-[220px] rounded-[12px] border px-3.5 py-3"
              style={{
                left: `min(calc(${hovered.x}% + 14px), calc(100% - 232px))`,
                top: `min(calc(${hovered.y}% + 12px), calc(100% - 92px))`,
              }}
            >
              <span className="text-ink-3 text-tau-tiny">
                {hovered.kind} · {CLUSTERS[hovered.cluster].name}
              </span>
              <p className="text-tau-body mt-1 font-semibold">{hovered.title}</p>
              <p className="text-ink-3 text-tau-tiny mt-1">{(neighbors?.size ?? 1) - 1} 处关联</p>
            </div>
          )}
        </div>
      </div>
    </AppWindow>
  );
}
