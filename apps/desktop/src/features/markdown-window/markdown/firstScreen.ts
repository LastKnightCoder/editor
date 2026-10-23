import type { Descendant } from "slate";

interface Budget {
  values: number;
  characters: number;
}

function consume(value: unknown, budget: Budget): boolean {
  if (--budget.values < 0) return false;
  if (typeof value === "string") budget.characters -= value.length;
  else if (Array.isArray(value)) {
    for (const child of value) if (!consume(child, budget)) return false;
  } else if (value && typeof value === "object") {
    for (const child of Object.values(value)) if (!consume(child, budget)) return false;
  }
  return budget.characters >= 0;
}

export function needsFirstScreen(content: readonly Descendant[]): boolean {
  return content.length > 120 || !consume(content, { values: 6000, characters: 50000 });
}

/** 只预览预算内的完整块，避免截断复杂块造成交接重排。 */
export function firstScreenContent(content: readonly Descendant[]): Descendant[] {
  const budget = { values: 2400, characters: 16000 };
  const result: Descendant[] = [];
  for (const node of content.slice(0, 24)) {
    if (!consume(node, budget)) break;
    result.push(node);
  }
  return result;
}

/** 代码块控制器按 uuid 登记，展示副本必须使用独立的运行时身份。 */
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
