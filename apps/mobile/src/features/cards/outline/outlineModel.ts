import { Editor, Node, Transforms, type Descendant } from "slate";
import { inSingleUndoStep } from "../blockSelection/blockOps";

/** 大纲中的一行：对应一个顶层块，index 为其在传入序列中的位置 */
export type OutlineRow = {
  index: number;
  type: string;
  /** 标题级别；非标题块为 null */
  level: number | null;
  label: string;
  /** 章节范围终点（不含）：标题为其后第一个同级或更高级标题的位置，非标题为 index + 1 */
  sectionEnd: number;
};

/** 可见单元：折叠标题覆盖整节 [start, end)，其余单元只含一行 */
export type OutlineUnit = {
  key: number;
  start: number;
  end: number;
  row: OutlineRow;
  /** 折叠标题所含的块数（不含标题本身） */
  childCount: number;
};

const LABEL_MAX_LENGTH = 40;

/** 空文本时的类型描述；未登记的类型统一为「内容块」 */
const TYPE_LABELS: Record<string, string> = {
  paragraph: "空段落",
  header: "空标题",
  "check-list": "待办",
  "bulleted-list": "列表",
  "numbered-list": "有序列表",
  blockquote: "引用",
  callout: "提示块",
  detail: "折叠块",
  "highlight-block": "高亮块",
  tabs: "标签页",
  image: "图片",
  video: "视频",
  audio: "音频",
  webview: "网页",
  "block-math": "公式",
  mermaid: "流程图",
  plantuml: "PlantUML 图",
  typst: "Typst",
  "divide-line": "分割线",
  "front-matter": "文档属性",
};

type LooseElement = {
  type?: string;
  level?: number;
  language?: string;
  children?: unknown[];
};

function headerLevel(node: Descendant): number | null {
  const element = node as LooseElement;
  return element.type === "header" && typeof element.level === "number" ? element.level : null;
}

function describeEmptyBlock(element: LooseElement): string {
  if (element.type === "code-block") {
    return element.language ? `代码块 · ${element.language}` : "代码块";
  }
  return TYPE_LABELS[element.type ?? ""] ?? "内容块";
}

/** 首行摘要：去首尾空白后取第一行、最多 40 字；表格与空文本按类型描述 */
function resolveLabel(node: Descendant): string {
  const element = node as LooseElement;
  // 表格的 Node.string 是各单元格文本首尾相接，不可读，直接给行数
  if (element.type === "table") {
    return `表格 · ${element.children?.length ?? 0} 行`;
  }
  const firstLine = Node.string(node).trim().split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (!firstLine) return describeEmptyBlock(element);
  return Array.from(firstLine).slice(0, LABEL_MAX_LENGTH).join("");
}

/** 每个顶层块一行 */
export function buildOutlineRows(children: readonly Descendant[]): OutlineRow[] {
  const levels = children.map(headerLevel);
  return children.map((node, index) => {
    const level = levels[index];
    let sectionEnd = index + 1;
    if (level !== null) {
      sectionEnd = children.length;
      for (let next = index + 1; next < children.length; next += 1) {
        const nextLevel = levels[next];
        if (nextLevel !== null && nextLevel <= level) {
          sectionEnd = next;
          break;
        }
      }
    }
    return {
      index,
      type: (node as LooseElement).type ?? "",
      level,
      label: resolveLabel(node),
      sectionEnd,
    };
  });
}

/** 标题下是否有可折叠的内容 */
export function isCollapsibleRow(row: OutlineRow): boolean {
  return row.level !== null && row.sectionEnd > row.index + 1;
}

/**
 * 按顺序生成可见单元。collapsed 存的是单元 key（经 keyOf 由位置换算），
 * 折叠的标题覆盖整节，节内行不再单独出现（嵌套折叠以外层为准）。
 */
export function visibleUnits(
  rows: readonly OutlineRow[],
  collapsed: ReadonlySet<number>,
  keyOf: (index: number) => number = index => index
): OutlineUnit[] {
  const units: OutlineUnit[] = [];
  let position = 0;
  while (position < rows.length) {
    const row = rows[position];
    const key = keyOf(position);
    const end = isCollapsibleRow(row) && collapsed.has(key) ? row.sectionEnd : position + 1;
    units.push({ key, start: position, end, row, childCount: end - position - 1 });
    position = end;
  }
  return units;
}

/**
 * 把第 from 个可见单元覆盖的整段原始下标移到第 to 个位置
 * （to 为移除该单元后在可见单元序列中的插入位），返回新 order。
 */
export function moveUnit(
  order: readonly number[],
  units: readonly OutlineUnit[],
  from: number,
  to: number
): number[] {
  if (from < 0 || from >= units.length || from === to) return [...order];
  const segments = units.map(unit => order.slice(unit.start, unit.end));
  const [moving] = segments.splice(from, 1);
  const target = Math.max(0, Math.min(to, segments.length));
  segments.splice(target, 0, moving);
  return segments.flat();
}

export function isIdentityOrder(order: readonly number[]): boolean {
  return order.every((value, index) => value === index);
}

/**
 * 会话快照已失效：打开期间顶层块被外部改动（如协作）。
 * Slate 修改节点会生成新对象，逐个比对顶层块引用即可发现块数不变时的内容改动。
 */
export function isSnapshotStale(editor: Editor, snapshot: readonly Descendant[]): boolean {
  return (
    editor.children.length !== snapshot.length ||
    editor.children.some((node, index) => node !== snapshot[index])
  );
}

/** 把顶层块重排为 order（原始下标的排列），合并为一个撤销步；恒等排列不改动文档 */
export function applyOrder(editor: Editor, order: readonly number[]): void {
  if (isIdentityOrder(order)) return;
  const current = editor.children.map((_, index) => index);
  inSingleUndoStep(editor, () => {
    for (let target = 0; target < order.length; target += 1) {
      const source = current.indexOf(order[target]);
      if (source === target || source < 0) continue;
      Transforms.moveNodes(editor, { at: [source], to: [target] });
      const [moved] = current.splice(source, 1);
      current.splice(target, 0, moved);
    }
  });
}
