import type { Descendant } from "slate";

/** 代码块控制器按 uuid 登记，图片导出的展示副本使用独立身份。 */
export function isolatePreviewContent(
  content: readonly Descendant[],
  scope: string,
  isKnown: (type: string) => boolean
): Descendant[] {
  const visit = (node: Descendant): Descendant => {
    if (!("children" in node) || !isKnown(node.type)) return node;
    if (node.type === "code-block") return { ...node, uuid: `${scope}-${node.uuid}` };
    const children = node.children.map(visit);
    return children.every((child, index) => child === node.children[index])
      ? node
      : ({ ...node, children } as Descendant);
  };
  return content.map(visit);
}
