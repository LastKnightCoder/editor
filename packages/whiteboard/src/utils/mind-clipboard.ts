import { produce } from "immer";
import type { Descendant } from "slate";

import type { BoardElement, MindNodeElement } from "../types";
import { buildMindRootElement } from "../extensions/creators/mind";
import MindUtil from "./MindUtil";
import { outlineToMarkdown, type MindOutline } from "./mind-markdown";

const isMind = (element: BoardElement): element is MindNodeElement & BoardElement =>
  element.type === "mind-node";

/** 选中的全是导图节点时，复制得到的缩进列表；混有其他元素返回 null */
export function mindClipboardText(elements: readonly BoardElement[]): string | null {
  if (!elements.length || !elements.every(isMind)) return null;
  return outlineToMarkdown(elements.map(element => MindUtil.toOutline(element)));
}

type TransferNode = {
  id: string;
  type: string;
  geometry?: Record<string, number>;
  data?: Record<string, unknown>;
  style?: Record<string, unknown>;
  body?: unknown;
  entity?: unknown;
  children?: TransferNode[];
};

/** 协作白板包里的导图节点 → 画布节点；正文协作版本按目标文档当前版本重新声明 */
const fromTransfer = (node: TransferNode): MindNodeElement =>
  ({
    ...node.geometry,
    ...node.data,
    id: node.id,
    type: "mind-node",
    level: 2,
    actualHeight: node.geometry?.height ?? 0,
    childrenHeight: 0,
    leftChildrenHeight: 0,
    rightChildrenHeight: 0,
    data: node.data ?? {},
    style: node.style ?? {},
    text: stripContracts(Array.isArray(node.body) ? (node.body as Descendant[]) : []),
    ...(node.entity ? { entity: node.entity } : {}),
    children: (node.children ?? []).map(fromTransfer),
  }) as unknown as MindNodeElement;

const stripContracts = (nodes: Descendant[]): Descendant[] =>
  nodes.map(node => {
    if (!node || typeof node !== "object" || !("children" in node)) return node;
    const { tauContract: _contract, ...rest } = node as typeof node & Record<string, unknown>;
    return { ...rest, children: stripContracts(node.children as Descendant[]) } as Descendant;
  });

/** 白板自己的剪贴板 JSON（本机或协作白板包） */
export function isWhiteboardPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const value = payload as { source?: string; format?: string };
  return value.source === "editor-white-board" || value.format === "whiteboard-transfer-v1";
}

/**
 * 剪贴板里的白板内容如果全是导图节点，取出这些子树；其他情况返回 null，交给普通粘贴。
 * 带资源引用的白板包需要跨文档导入资源，也交给普通粘贴。
 */
export function mindSubtreesFromPayload(payload: unknown): MindNodeElement[] | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as {
    source?: string;
    format?: string;
    elements?: BoardElement[];
    pages?: Array<{ elements?: TransferNode[] }>;
    resources?: unknown[];
  };
  if (value.source === "editor-white-board") {
    const elements = Array.isArray(value.elements) ? value.elements : [];
    return elements.length && elements.every(isMind) ? (elements as MindNodeElement[]) : null;
  }
  if (value.format === "whiteboard-transfer-v1") {
    if (value.resources?.length) return null;
    const elements = (value.pages ?? []).flatMap(page => page.elements ?? []);
    return elements.length && elements.every(element => element.type === "mind-node")
      ? elements.map(fromTransfer)
      : null;
  }
  return null;
}

/** 挂到别的导图下时去掉只属于根节点的字段 */
export function asBranch(node: MindNodeElement): MindNodeElement {
  return produce(node, draft => {
    const record = draft as unknown as Record<string, unknown>;
    for (const key of ["themeId", "themeStyle", "layout"]) {
      delete record[key];
      const data = record.data as Record<string, unknown> | undefined;
      if (data && key in data) delete data[key];
    }
  });
}

const CENTRAL_TOPIC: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "中心主题", bold: true }] },
] as unknown as Descendant[];

/** 大纲 → 一张新导图：第一层只有一项时它就是中心主题，否则用「中心主题」作根 */
export function mindRootFromOutline(
  outline: readonly MindOutline[],
  at: { x: number; y: number },
  fontSize: number
): MindNodeElement {
  const single = outline.length === 1 ? outline[0] : null;
  const branches = single ? single.children : outline;
  const root = buildMindRootElement(at.x, at.y, fontSize);
  const children = MindUtil.nodesFromOutline(branches, fontSize).map(child =>
    produce(child, draft => {
      MindUtil.updateNodeDirectionAndLevel(draft, "right", 1);
    })
  );
  return MindUtil.layout({
    ...root,
    defaultFocus: false,
    text: single ? single.text : CENTRAL_TOPIC,
    children,
  });
}
