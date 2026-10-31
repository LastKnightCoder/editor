import { Element, type Descendant, type Node } from "slate";
import type { AnnotationElement } from "./types";

const isAnnotation = (node: Node): node is AnnotationElement =>
  Element.isElement(node) && node.type === "annotation";

// Slate 节点不可变：按节点缓存子树里的注解数，编辑只让改动路径上的节点重算
const countCache = new WeakMap<Node, number>();

const countAnnotations = (node: Node): number => {
  if (!Element.isElement(node)) return 0;
  if (isAnnotation(node)) return 1;
  const cached = countCache.get(node);
  if (cached !== undefined) return cached;
  const count = node.children.reduce((sum, child) => sum + countAnnotations(child), 0);
  countCache.set(node, count);
  return count;
};

const numberCache = new WeakMap<Descendant[], Map<AnnotationElement, number>>();

/**
 * 注解按文档顺序的序号（从 1 开始），与 Markdown 导出的脚注编号一致。
 * 不用 CSS counter：长文档分块渲染的 content-visibility 会隔离计数，每块重新从 1 数。
 */
export function getAnnotationNumbers(root: Descendant[]): Map<AnnotationElement, number> {
  const cached = numberCache.get(root);
  if (cached) return cached;
  const numbers = new Map<AnnotationElement, number>();
  const visit = (node: Node) => {
    if (isAnnotation(node)) numbers.set(node, numbers.size + 1);
    else if (countAnnotations(node) > 0 && Element.isElement(node)) node.children.forEach(visit);
  };
  root.forEach(visit);
  numberCache.set(root, numbers);
  return numbers;
}
