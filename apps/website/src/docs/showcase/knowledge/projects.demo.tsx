/**
 * 项目工作台：左边文档树，右边正文。点文件夹展开收起，点文档在右侧打开；
 * 点文档树顶部的视图按钮切到思维导图，同一棵树横向铺开，点节点同样打开文档。
 * 结构按 features/projects 的 ProjectList、ProjectItem 与 ProjectMindMapView 重建。
 */
import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Folder,
  FolderOpen,
  House,
  ListTree,
  MoreHorizontal,
  Network,
  Plus,
  Presentation,
  Sparkles,
  Table,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";

interface Node {
  id: string;
  title: string;
  icon?: LucideIcon;
  body?: string[];
  children?: Node[];
}

const TREE: Node[] = [
  {
    id: "basics",
    title: "基础",
    children: [
      {
        id: "why",
        title: "为什么要学会学习",
        body: [
          "大多数人从没学过「怎么学」。我们花十几年在学校里学知识，却很少有人教我们怎样学得更快、记得更牢。",
          "这一套文档整理我读过的方法，以及自己验证过有效的做法。",
        ],
      },
      {
        id: "brain",
        title: "大脑是怎么记住东西的",
        body: [
          "记忆不是录像，而是每次回想时的重建。越常被提取的记忆，越容易再次被提取。",
          "这也是为什么「回忆」比「重读」更有效。",
        ],
      },
    ],
  },
  {
    id: "methods",
    title: "方法",
    children: [
      {
        id: "active",
        title: "主动回忆",
        body: [
          "合上书，试着把刚读的内容复述一遍。卡住的地方，就是还没真正懂的地方。",
          "配合闪卡效果更好：每张卡只问一个问题。",
        ],
      },
      {
        id: "spaced",
        title: "间隔重复",
        body: [
          "在快要忘记的时候复习，比天天复习更省时间，也记得更牢。",
          "Tau 的闪卡会按这个规律自动安排复习。",
        ],
      },
      {
        id: "feynman",
        title: "费曼技巧",
        body: ["把一个概念讲给完全不懂的人听，讲不清楚的地方回去重学。"],
      },
    ],
  },
  {
    id: "map",
    title: "方法全景图",
    icon: Presentation,
    body: ["（白板）把所有方法摆在一张图上，按「理解」和「记忆」两条线归类。"],
  },
  {
    id: "log",
    title: "实践记录",
    icon: Table,
    body: ["（表格）每周记录用了哪个方法、花了多少时间、效果如何。"],
  },
];

const find = (nodes: Node[], id: string): Node | undefined => {
  for (const node of nodes) {
    if (node.id === id) return node;
    const hit = node.children && find(node.children, id);
    if (hit) return hit;
  }
  return undefined;
};

interface Placed {
  node: Node;
  depth: number;
  row: number;
}

/** 思维导图排布：项目名是根，往右逐层展开；叶子按行均分，父节点居中于子节点 */
function placeTree(nodes: Node[]): {
  placed: Placed[];
  rootRow: number;
  rows: number;
} {
  const placed: Placed[] = [];
  let row = 0;
  const walk = (node: Node, depth: number): number => {
    const kids = node.children ?? [];
    const at = kids.length
      ? (() => {
          const rows = kids.map(kid => walk(kid, depth + 1));
          return (rows[0] + rows[rows.length - 1]) / 2;
        })()
      : row++;
    placed.push({ node, depth, row: at });
    return at;
  };
  const rootRows = nodes.map(node => walk(node, 1));
  return {
    placed,
    rootRow: (rootRows[0] + rootRows[rootRows.length - 1]) / 2,
    rows: row,
  };
}

const COL_W = 124;
const ROW_H = 40;
const NODE_H = 30;
const ROOT_W = 92;
const NODE_W = 108;

function MindMapPane({ selected, onOpen }: { selected: string; onOpen: (id: string) => void }) {
  const { placed, rootRow, rows } = placeTree(TREE);
  const top = (r: number) => 14 + r * ROW_H;
  const left = (depth: number) => 10 + (depth === 0 ? 0 : ROOT_W + 26 + (depth - 1) * COL_W);
  const width = (depth: number) => (depth === 0 ? ROOT_W : NODE_W);
  const parentOf = new Map<string, Placed | "root">();
  for (const item of placed) for (const kid of item.node.children ?? []) parentOf.set(kid.id, item);
  for (const node of TREE) parentOf.set(node.id, "root");

  return (
    <div className="scrollbar-hide relative h-full overflow-auto">
      <div className="relative" style={{ width: left(3) + NODE_W + 12, height: top(rows) + 8 }}>
        <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
          {placed.map(item => {
            const parent = parentOf.get(item.node.id);
            const fromDepth = parent === "root" ? 0 : (parent?.depth ?? 0);
            const fromRow = parent === "root" ? rootRow : (parent?.row ?? 0);
            const x1 = left(fromDepth) + width(fromDepth);
            const y1 = top(fromRow) + NODE_H / 2;
            const x2 = left(item.depth);
            const y2 = top(item.row) + NODE_H / 2;
            const mx = (x1 + x2) / 2;
            return (
              <path
                key={item.node.id}
                d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke="var(--tau-accent)"
                strokeOpacity={item.depth === 1 ? 0.55 : 0.32}
                strokeWidth={item.depth === 1 ? 2 : 1.5}
              />
            );
          })}
        </svg>
        <div
          className="bg-accent text-ink-inverse absolute flex items-center gap-1.5 rounded-[10px] px-3 text-[12.5px] font-semibold shadow-[0_2px_8px_rgb(15_23_42/0.08)]"
          style={{
            left: left(0),
            top: top(rootRow),
            width: ROOT_W,
            height: NODE_H,
          }}
        >
          <FolderOpen className="size-3.5 shrink-0" strokeWidth={1.75} />
          <span className="truncate">学会学习</span>
        </div>
        {placed.map(item => {
          const folder = Boolean(item.node.children);
          const Icon = item.node.icon ?? (folder ? FolderOpen : FileText);
          const on = selected === item.node.id;
          return (
            <button
              key={item.node.id}
              type="button"
              onClick={() => !folder && onOpen(item.node.id)}
              className={cn(
                "group/mindmap-node animate-doc-in absolute flex items-center gap-1.5 rounded-[8px] px-2.5 text-left text-[12px] whitespace-nowrap shadow-[0_2px_8px_rgb(15_23_42/0.08)] transition-shadow duration-200 hover:shadow-[0_8px_24px_rgb(15_23_42/0.18)]",
                item.depth === 1
                  ? "bg-accent-soft text-accent-text font-medium"
                  : "bg-surface text-ink-1 ring-line-1 ring-1",
                on && "ring-accent ring-2 ring-offset-2 ring-offset-[var(--tau-bg-surface)]"
              )}
              style={{
                left: left(item.depth),
                top: top(item.row),
                width: NODE_W,
                height: NODE_H,
              }}
            >
              <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
              <span className="min-w-0 truncate">{item.node.title}</span>
              <span className="bg-surface ring-line-1 text-ink-2 absolute top-1/2 -right-6 grid size-5 -translate-y-1/2 place-items-center rounded-full opacity-0 ring-1 transition-opacity group-hover/mindmap-node:opacity-100">
                <Plus className="size-3" strokeWidth={1.75} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ProjectsDemo() {
  const [open, setOpen] = useState<Set<string>>(new Set(["methods"]));
  const [selected, setSelected] = useState("active");
  const [view, setView] = useState<"tree" | "mindmap">("tree");
  const doc = find(TREE, selected);

  const renderNodes = (nodes: Node[], depth: number) =>
    nodes.map(node => {
      const folder = Boolean(node.children);
      const expanded = open.has(node.id);
      const on = selected === node.id;
      const Icon = node.icon ?? (folder ? Folder : FileText);
      return (
        <div key={node.id}>
          <button
            type="button"
            onClick={() => {
              if (folder)
                setOpen(set => {
                  const next = new Set(set);
                  if (next.has(node.id)) next.delete(node.id);
                  else next.add(node.id);
                  return next;
                });
              else setSelected(node.id);
            }}
            className={cn(
              "group text-tau-meta flex min-h-[30px] w-full items-center gap-[6px] rounded-[6px] pr-1 pl-[4px] text-left transition-colors duration-150",
              on ? "bg-accent-soft text-accent-text" : "hover:bg-hover"
            )}
          >
            <span className="grid size-4 shrink-0 place-items-center">
              {folder && (
                <ChevronRight
                  className={cn(
                    "text-ink-3 size-3.5 transition-transform duration-200",
                    expanded && "rotate-90"
                  )}
                  strokeWidth={1.75}
                />
              )}
            </span>
            <Icon
              className={cn(
                "size-[15px] shrink-0",
                folder
                  ? depth === 0
                    ? "text-accent-text fill-accent-soft"
                    : "text-accent-text/60"
                  : on
                    ? "text-accent-text"
                    : "text-ink-3"
              )}
              strokeWidth={1.75}
            />
            <span className="min-w-0 flex-1 truncate">{node.title}</span>
            <span className="text-ink-3 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <MoreHorizontal className="size-3.5" strokeWidth={1.75} />
              {folder && <Plus className="size-3.5" strokeWidth={1.75} />}
            </span>
          </button>
          {folder && (
            <div
              className={cn(
                "ease-tau-out grid transition-[grid-template-rows] duration-200",
                expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              )}
            >
              <div className="before:bg-accent/20 relative min-h-0 overflow-hidden pl-[12px] before:absolute before:top-0 before:bottom-0 before:left-[11px] before:w-px">
                {renderNodes(node.children ?? [], depth + 1)}
              </div>
            </div>
          )}
        </div>
      );
    });

  return (
    <AppWindow active="projects" crumb="项目 / 学会学习" height={420}>
      <div className="flex h-full">
        <aside
          className={cn(
            "border-line-2 flex shrink-0 flex-col border-r px-2.5 transition-[width] duration-300",
            view === "tree" ? "w-[230px] max-sm:w-[170px]" : "w-[420px] max-sm:w-[220px]"
          )}
        >
          <div className="flex h-[52px] shrink-0 items-center gap-1 px-1">
            <House className="text-ink-2 size-4 shrink-0" strokeWidth={1.75} />
            <span className="text-tau-body flex min-w-0 items-center gap-1 truncate px-1.5 font-medium">
              <span className="truncate">学会学习</span>
              <ChevronDown className="size-3.5 shrink-0" strokeWidth={1.75} />
            </span>
            <span className="text-tau-meta text-ink-2 inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 max-sm:hidden">
              <Sparkles className="size-3" strokeWidth={1.75} />
              回顾
            </span>
            <span className="flex-1" />
            <button
              type="button"
              title={view === "tree" ? "切换到思维导图" : "切换到树视图"}
              onClick={() => setView(v => (v === "tree" ? "mindmap" : "tree"))}
              className="text-ink-2 hover:bg-hover hover:text-ink-1 grid size-6 shrink-0 place-items-center rounded-[6px]"
            >
              {view === "tree" ? (
                <ListTree className="size-4" strokeWidth={1.75} />
              ) : (
                <Network className="size-4" strokeWidth={1.75} />
              )}
            </button>
            <Plus className="text-ink-2 size-4 shrink-0" strokeWidth={1.75} />
          </div>
          <div key={view} className="animate-doc-in min-h-0 flex-1 pb-2">
            {view === "tree" ? (
              <div className="flex flex-col gap-px">{renderNodes(TREE, 0)}</div>
            ) : (
              <MindMapPane selected={selected} onOpen={setSelected} />
            )}
          </div>
        </aside>
        <article
          key={selected}
          className="animate-doc-in min-w-0 flex-1 overflow-y-auto px-8 pt-7 pb-6 max-sm:px-4"
        >
          <h3 className="border-line-1 border-b pb-3 text-[24px] font-bold">{doc?.title}</h3>
          <p className="text-ink-3 text-tau-tiny mt-2">创建于 10月3日 · 最后修改于 2 天前</p>
          {doc?.body?.map(paragraph => (
            <p key={paragraph} className="text-tau-body mt-4 leading-[1.85]">
              {paragraph}
            </p>
          ))}
        </article>
      </div>
    </AppWindow>
  );
}
