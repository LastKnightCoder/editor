import { visit } from "unist-util-visit";
import { remarkDocumentReference } from "@tau/shared";

interface ReferenceNode {
  type: string;
  value?: string;
  children?: ReferenceNode[];
  data?: { hProperties?: Record<string, unknown> };
}

export default function remarkSectionReference() {
  const base = remarkDocumentReference();
  return (tree: ReferenceNode) => {
    const blocks: Array<number | undefined> = [];
    visit(tree, "text", (node: ReferenceNode) => {
      for (const match of (node.value ?? "").matchAll(
        /:(ref|content-link)\[[^\]]+\]\{([^}]+)\}/g
      )) {
        const value =
          match[1] === "ref" ? /(?:^|\s)block=(?:"(\d+)"|(\d+))(?:\s|$)/.exec(match[2]) : null;
        const block = value ? Number(value[1] ?? value[2]) : undefined;
        blocks.push(Number.isSafeInteger(block) ? block : undefined);
      }
    });
    base(tree);
    let index = 0;
    visit(tree, "documentReference", (node: ReferenceNode) => {
      const block = blocks[index++];
      if (block !== undefined && node.data?.hProperties)
        node.data.hProperties["data-block"] = block;
    });
  };
}
