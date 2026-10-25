import { elementView } from "@tau/editor/api";
import { Editor, Element, Node, Transforms, type Path } from "slate";
import { ReactEditor } from "slate-react";
import { canEditElement } from "../../../core/api/elementVersions";
import type { CodeBlockElement, CodeBlockV2Element, CodeStepElement } from "./types";

export function isCodeBlockV2(
  element: CodeBlockElement | CodeBlockV2Element
): element is CodeBlockV2Element {
  return (
    element.children.some(child => Element.isElement(child) && child.type === "code-step") ||
    (!("code" in element) && !("magicMove" in element))
  );
}

export const codeStepId = (editor: Editor, step: CodeStepElement): string =>
  step.collabId ?? ReactEditor.findKey(editor, step).id;

interface CodeBlockView {
  activeStepId?: string;
  isFold?: boolean;
  foldHeight?: number;
}
export function codeBlockView(editor: Editor, block: CodeBlockElement | CodeBlockV2Element) {
  return elementView(editor, block) as Omit<ReturnType<typeof elementView>, "getSnapshot"> & {
    getSnapshot(): CodeBlockView;
  };
}

export function activeCodeStep(editor: Editor, block: CodeBlockV2Element) {
  const selected = codeBlockView(editor, block).getSnapshot().activeStepId;
  const entries = block.children.flatMap((step, index) =>
    step.type === "code-step" ? [{ step, index }] : []
  );
  return (
    entries.find(({ step }) => codeStepId(editor, step) === selected) ??
    entries[0] ?? { step: undefined, index: -1 }
  );
}

function writablePath(editor: Editor, block: CodeBlockV2Element): Path {
  const identity = (block as unknown as { collabId?: string }).collabId;
  const entry = [...Node.elements(editor)].find(
    ([node]) =>
      node === block ||
      (identity && (node as unknown as { collabId?: string }).collabId === identity)
  );
  if (!entry || !Element.isElement(entry[0]) || !isCodeBlockV2(entry[0] as CodeBlockV2Element))
    throw new Error("代码块已失效");
  const path = entry[1];
  if (ReactEditor.isReadOnly(editor)) throw new Error("代码块只读");
  for (let depth = 1; depth <= path.length; depth++) {
    const node = Node.get(editor, path.slice(0, depth));
    if (Element.isElement(node) && !canEditElement(editor, node)) throw new Error("代码块只读");
  }
  return path;
}

export function insertCodeStep(editor: Editor, block: CodeBlockV2Element): void {
  const path = writablePath(editor, block);
  const live = Node.get(editor, path) as CodeBlockV2Element;
  const { step, index } = activeCodeStep(editor, live);
  const next: CodeStepElement = {
    type: "code-step",
    code: step?.code ?? "",
    ...(step?.highlightLines === undefined ? {} : { highlightLines: step.highlightLines }),
    children: [{ type: "formatted", text: "" }],
  };
  const destination = [...path, index + 1];
  Transforms.insertNodes(editor, next, { at: destination, voids: true });
  codeBlockView(editor, live).update({
    activeStepId: codeStepId(editor, Node.get(editor, destination) as CodeStepElement),
  });
}

export function removeCodeStep(
  editor: Editor,
  block: CodeBlockV2Element,
  keepOnlyActive = false
): void {
  const path = writablePath(editor, block);
  const live = Node.get(editor, path) as CodeBlockV2Element;
  if (live.children.filter(step => step.type === "code-step").length < 2) return;
  const { step, index } = activeCodeStep(editor, live);
  if (!step) return;
  const next = keepOnlyActive
    ? step
    : live.children[
        Math.min(index + 1, live.children.length - 1) === index ? index - 1 : index + 1
      ];
  Editor.withoutNormalizing(editor, () => {
    for (let position = live.children.length - 1; position >= 0; position--) {
      if (keepOnlyActive ? position !== index : position === index)
        Transforms.removeNodes(editor, { at: [...path, position], voids: true });
    }
  });
  codeBlockView(editor, live).update({ activeStepId: codeStepId(editor, next) });
}

export function updateCodeStep(
  editor: Editor,
  block: CodeBlockV2Element,
  patch: { title?: string; highlightLines?: string }
): void {
  const path = writablePath(editor, block);
  const { step, index } = activeCodeStep(editor, Node.get(editor, path) as CodeBlockV2Element);
  if (!step || !canEditElement(editor, step)) throw new Error("源码步骤只读");
  Transforms.setNodes(editor, patch, { at: [...path, index], voids: true });
}
