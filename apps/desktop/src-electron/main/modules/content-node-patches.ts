import { applySegmentEdits, type TextEdit } from "@/entity/text-edits";

export interface NodePatchContext {
  firstText: string;
  identityKey?: string;
}
export type NodeAttributePatcher = (
  attributes: Record<string, unknown>,
  context: NodePatchContext
) => Record<string, unknown> | null;
export type TextPatcher = (text: string) => string | null;
export type ParagraphPatcher = (
  text: string,
  parent: Record<string, unknown>,
  index: number
) => readonly TextEdit[];

export interface PatchNode {
  text?: string;
  children?: PatchNode[];
  type?: string;
}
export function nodeText(node: PatchNode | undefined): string {
  return node ? (node.text ?? (node.children ?? []).map(nodeText).join("")) : "";
}

export function patchParagraph(node: PatchNode, edits: readonly TextEdit[]): number {
  const leaves: PatchNode[] = [];
  const walk = (child: PatchNode) => {
    if (typeof child.text === "string") leaves.push(child);
    else child.children?.forEach(walk);
  };
  walk(node);
  return applySegmentEdits(
    leaves.map(leaf => ({
      text: leaf.text ?? "",
      write: (index, remove, insert) => {
        const text = leaf.text ?? "";
        leaf.text = text.slice(0, index) + insert + text.slice(index + remove);
      },
    })),
    edits
  );
}
