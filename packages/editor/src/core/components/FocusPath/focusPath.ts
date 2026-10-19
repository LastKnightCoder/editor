import { Editor, Element, Node, type Path } from "slate";

export interface FocusPath {
  /** 光标所在的元素祖先链（不含 editor 本身），由外到内 */
  path: Path[];
  /** 聚焦单元：链上最深的块元素（段落、标题、void 块等），行内元素不算 */
  unit: Path | null;
}

/** 元素在聚焦路径上的角色：unit = 聚焦单元，path = 链上的祖先，null = 链外 */
export type FocusRole = "unit" | "path" | null;

export const FOCUS_PATH_ATTR = "data-focus-path";
export const FOCUS_UNIT_ATTR = "data-focus-unit";

/**
 * 聚焦模式的样式：只让「边界」元素退后——不在聚焦路径上、且不在另一个已退后元素或聚焦单元之内，
 * 透明度不会层层相乘，也不去覆盖元素自身的 opacity / transition。退后程度取宿主的 --ed-focus-dim（缺省 0.26）。
 */
export const FOCUS_MODE_CLASS =
  "[&_[data-slate-node=element]:not([data-focus-path]):not([data-slate-node=element]:not([data-focus-path])_*):not([data-focus-unit]_*)]:opacity-[var(--ed-focus-dim,0.26)]";

const EMPTY: FocusPath = { path: [], unit: null };

/**
 * 聚焦路径：只由文档结构决定，与元素类型和渲染 DOM 无关。
 * 链外的元素即「同级兄弟」——列表的其他项、表格的其他单元格、其余顶层块都在链外。
 */
export function focusPathOf(editor: Editor, at: Path | null | undefined): FocusPath {
  if (!at || !Node.has(editor, at)) return EMPTY;
  const path: Path[] = [];
  let unit: Path | null = null;
  for (const [node, nodePath] of Node.levels(editor, at)) {
    if (!Element.isElement(node)) continue;
    path.push(nodePath);
    if (!Editor.isInline(editor, node)) unit = nodePath;
  }
  return { path, unit };
}

/**
 * 元素在聚焦路径上的角色，按节点对象身份判断：不经 findPath（依赖渲染期维护的节点索引，
 * 协作同步整体替换节点对象后、重渲染前会给出过期路径或找不到路径）。
 * 传入的 element 须是当前文档树里的节点对象，旧对象一律视为链外。
 */
export function focusRoleOf(
  editor: Editor,
  element: Element,
  at: Path | null | undefined
): FocusRole {
  if (!at || !Node.has(editor, at)) return null;
  let onPath = false;
  let unit: Node | null = null;
  for (const [node] of Node.levels(editor, at)) {
    if (!Element.isElement(node)) continue;
    if (node === element) onPath = true;
    if (!Editor.isInline(editor, node)) unit = node;
  }
  if (!onPath) return null;
  return unit === element ? "unit" : "path";
}
