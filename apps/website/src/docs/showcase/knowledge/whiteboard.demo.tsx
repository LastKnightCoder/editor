/**
 * 白板：一张思维导图。选中节点按 Tab 加子节点、Enter 加兄弟节点，双击改名；
 * 右下角在「普通」和「手绘」画风间切换。工具栏与状态栏按 packages/whiteboard 的 Toolbar、StatusBar 重建。
 */
import { useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  AudioLines,
  Columns3,
  FileText,
  Frame,
  Globe,
  Image as ImageIcon,
  Maximize,
  Minus,
  MousePointer2,
  Network,
  PenLine,
  Play,
  Plus,
  Presentation,
  Shapes,
  Type,
  Video,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";
import { seededRandom } from "../../../lib/random.ts";

interface MindNode {
  id: number;
  parent: number | null;
  text: string;
}

const INITIAL: MindNode[] = [
  { id: 1, parent: null, text: "深度工作" },
  { id: 2, parent: 1, text: "为什么重要" },
  { id: 3, parent: 1, text: "怎么练习" },
  { id: 4, parent: 1, text: "常见阻碍" },
  { id: 5, parent: 3, text: "固定时段" },
  { id: 6, parent: 3, text: "拥抱无聊" },
  { id: 7, parent: 4, text: "消息通知" },
];

/** 分支色：一级分支各取一色，子孙沿用 */
const BRANCH = [
  "var(--tau-tag-1)",
  "var(--tau-tag-3)",
  "var(--tau-tag-2)",
  "var(--tau-tag-4)",
  "var(--tau-tag-5)",
];

const TOOLS: { icon: LucideIcon; label: string; group: number }[] = [
  { icon: MousePointer2, label: "选择", group: 0 },
  { icon: Shapes, label: "形状", group: 1 },
  { icon: ArrowUpRight, label: "箭头", group: 1 },
  { icon: PenLine, label: "手写", group: 1 },
  { icon: Type, label: "文本", group: 1 },
  { icon: Network, label: "思维导图", group: 1 },
  { icon: ImageIcon, label: "图片", group: 2 },
  { icon: Video, label: "视频", group: 2 },
  { icon: AudioLines, label: "音频", group: 2 },
  { icon: Globe, label: "网页", group: 2 },
  { icon: FileText, label: "文档", group: 3 },
  { icon: Presentation, label: "白板", group: 3 },
  { icon: Frame, label: "画框", group: 4 },
  { icon: Columns3, label: "分栏", group: 4 },
];

interface Placed {
  node: MindNode;
  x: number;
  y: number;
  depth: number;
  color: string;
}

/** 根在左，子节点向右展开，叶子按行均分高度 */
function layout(nodes: MindNode[]): Placed[] {
  const childrenOf = (id: number) => nodes.filter(node => node.parent === id);
  const placed: Placed[] = [];
  let row = 0;
  const walk = (node: MindNode, depth: number, color: string): number => {
    const kids = childrenOf(node.id);
    let y: number;
    if (!kids.length) y = row++;
    else {
      const ys = kids.map((kid, index) =>
        walk(kid, depth + 1, depth === 0 ? BRANCH[index % BRANCH.length] : color)
      );
      y = (ys[0] + ys[ys.length - 1]) / 2;
    }
    placed.push({ node, x: depth, y, depth, color });
    return y;
  };
  walk(nodes[0], 0, "var(--tau-ink-1)");
  return placed;
}

const COL = 150;
const ROW_H = 46;

function roughPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rand: () => number,
  sketch: boolean
) {
  const mx = (x1 + x2) / 2;
  if (!sketch) return `M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
  const j = () => (rand() - 0.5) * 4;
  const one = () =>
    `M${x1 + j()} ${y1 + j()}C${mx + j()} ${y1 + j()} ${mx + j()} ${y2 + j()} ${x2 + j()} ${y2 + j()}`;
  return one() + one();
}

export default function WhiteboardDemo() {
  const [nodes, setNodes] = useState(INITIAL);
  const [selected, setSelected] = useState(3);
  const [editing, setEditing] = useState<number | null>(null);
  const [sketch, setSketch] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const placed = useMemo(() => layout(nodes), [nodes]);
  const rows = Math.max(...placed.map(item => item.y)) + 1;
  const offsetY = Math.max(0, (330 - rows * ROW_H) / 2);
  const pos = (item: Placed) => ({
    left: 28 + item.x * COL,
    top: offsetY + item.y * ROW_H + 50,
  });

  const add = (kind: "child" | "sibling") => {
    const current = nodes.find(node => node.id === selected);
    if (!current) return;
    if (kind === "sibling" && current.parent === null) return;
    const id = Math.max(...nodes.map(node => node.id)) + 1;
    const parent = kind === "child" ? current.id : current.parent;
    setNodes(list => {
      // 兄弟节点插在当前节点后面
      const index = list.findIndex(node => node.id === current.id);
      const next = [...list];
      next.splice(kind === "child" ? list.length : index + 1, 0, {
        id,
        parent,
        text: "新主题",
      });
      return next;
    });
    setSelected(id);
    setEditing(id);
  };

  const rand = seededRandom(7);

  return (
    <AppWindow active="whiteboard" crumb="白板 / 深度工作" height={430}>
      <div
        ref={boardRef}
        tabIndex={0}
        aria-label="思维导图示意：选中节点后按 Tab 加子节点，Enter 加兄弟节点"
        onKeyDown={event => {
          if (editing !== null) return;
          if (event.key === "Tab") {
            event.preventDefault();
            add("child");
          } else if (event.key === "Enter") {
            event.preventDefault();
            add("sibling");
          } else if (event.key === " ") {
            event.preventDefault();
            setEditing(selected);
          }
        }}
        className={cn(
          "relative h-full overflow-hidden outline-none",
          "bg-[radial-gradient(var(--tau-line-1)_1px,transparent_1px)] bg-[length:14px_14px]"
        )}
        style={sketch ? { fontFamily: "var(--tau-font-hand)" } : undefined}
      >
        <div className="bg-surface shadow-lift ring-line-2 absolute top-3 left-1/2 z-[3] flex -translate-x-1/2 items-center gap-0.5 rounded-[12px] p-1 ring-1">
          {TOOLS.map((tool, index) => {
            const Icon = tool.icon;
            const on = tool.label === "思维导图";
            return (
              <span
                key={tool.label}
                className={cn(
                  "flex items-center",
                  (tool.group === 2 || tool.group === 3) && "max-sm:hidden"
                )}
              >
                {index > 0 && TOOLS[index - 1].group !== tool.group && (
                  <span className="size-2 flex-none" />
                )}
                <span
                  title={tool.label}
                  className={cn(
                    "grid size-[30px] place-items-center rounded-[8px]",
                    on ? "bg-accent-soft text-accent-text" : "text-ink-2"
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.75} />
                </span>
              </span>
            );
          })}
        </div>

        <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
          {placed
            .filter(item => item.node.parent !== null)
            .map(item => {
              const parent = placed.find(other => other.node.id === item.node.parent);
              if (!parent) return null;
              const from = pos(parent);
              const to = pos(item);
              const parentWidth = parent.depth === 0 ? 104 : 96;
              return (
                <path
                  key={item.node.id}
                  d={roughPath(
                    from.left + parentWidth,
                    from.top + 16,
                    to.left,
                    to.top + 16,
                    rand,
                    sketch
                  )}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={sketch ? 1.4 : 2}
                  strokeLinecap="round"
                />
              );
            })}
        </svg>

        {placed.map(item => {
          const on = selected === item.node.id;
          const root = item.depth === 0;
          return (
            <div
              key={item.node.id}
              onClick={() => {
                setSelected(item.node.id);
                boardRef.current?.focus();
              }}
              onDoubleClick={() => setEditing(item.node.id)}
              className={cn(
                "animate-doc-in absolute flex h-8 cursor-pointer items-center px-3 text-[13px] whitespace-nowrap transition-[box-shadow] duration-150",
                root ? "w-[104px] justify-center font-semibold text-[14px]" : "w-[96px]",
                root
                  ? sketch
                    ? "border-ink-1 rounded-[14px_10px_16px_9px] border-[1.5px] bg-transparent"
                    : "bg-ink-1 text-ink-inverse rounded-[10px]"
                  : sketch
                    ? "rounded-[9px_12px_8px_11px] border-[1.5px] border-[var(--branch)] bg-transparent"
                    : "border-b-2 border-[var(--branch)]",
                on && "ring-accent ring-2 ring-offset-2 ring-offset-[var(--tau-bg-surface)]"
              )}
              style={{ ...pos(item), ["--branch" as string]: item.color }}
            >
              {editing === item.node.id ? (
                <input
                  autoFocus
                  defaultValue={item.node.text}
                  aria-label="节点文字"
                  onFocus={event => event.currentTarget.select()}
                  onBlur={event => {
                    const text = event.currentTarget.value.trim() || item.node.text;
                    setNodes(list =>
                      list.map(node => (node.id === item.node.id ? { ...node, text } : node))
                    );
                    setEditing(null);
                    boardRef.current?.focus();
                  }}
                  onKeyDown={event => {
                    if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
                  }}
                  className="w-full bg-transparent outline-none select-text"
                />
              ) : (
                <span className="truncate">{item.node.text}</span>
              )}
            </div>
          );
        })}

        <div className="text-ink-3 text-tau-tiny absolute bottom-4 left-4 z-[3] flex items-center gap-3 max-sm:hidden">
          <span>
            <kbd className="bg-hover rounded px-1 font-mono">Tab</kbd> 子节点
          </span>
          <span>
            <kbd className="bg-hover rounded px-1 font-mono">Enter</kbd> 兄弟节点
          </span>
          <span>双击改名</span>
        </div>

        <div className="bg-surface shadow-lift ring-line-2 absolute right-3 bottom-3 z-[3] flex items-center gap-0.5 rounded-[12px] p-1 text-[12px] ring-1">
          <button
            type="button"
            onClick={() => setSketch(value => !value)}
            className="text-ink-2 hover:bg-hover flex h-[30px] items-center gap-1.5 rounded-[8px] px-2.5"
          >
            <PenLine className="size-3.5" strokeWidth={1.75} />
            {sketch ? "手绘 · 自然" : "普通"}
          </button>
          <span className="text-ink-2 grid size-[30px] place-items-center" title="缩小">
            <Minus className="size-3.5" strokeWidth={1.75} />
          </span>
          <span className="text-ink-2 grid h-[30px] min-w-12 place-items-center tabular-nums">
            100%
          </span>
          <span className="text-ink-2 grid size-[30px] place-items-center" title="放大">
            <Plus className="size-3.5" strokeWidth={1.75} />
          </span>
          <span className="text-ink-2 grid size-[30px] place-items-center" title="全览">
            <Maximize className="size-3.5" strokeWidth={1.75} />
          </span>
          <span className="text-ink-2 flex h-[30px] items-center gap-1.5 rounded-[8px] px-2.5">
            <Play className="size-3.5" strokeWidth={1.75} />
            演示
          </span>
        </div>
      </div>
    </AppWindow>
  );
}
