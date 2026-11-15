import { codeBlockMap } from "./src/extensions/code-block/utils/controllerMaps.ts";
import { codeBlockView, codeStepId, isCodeBlockV2 } from "./src/codeSteps.ts";
import type { Editor } from "slate";
import type { CodeBlockElement, CodeBlockV2Element } from "./src/types/index.ts";
export type { CodeBlockController, CodeCursorPosition } from "./src/extensions/code-block/types.ts";
export const getCodeBlockController = (uuid: string) => codeBlockMap.get(uuid);

/** 查找跳转只更新运行时视图。 */
export function revealCodeStep(
  editor: Editor,
  block: CodeBlockElement | CodeBlockV2Element,
  index?: number
) {
  const step = index === undefined || !isCodeBlockV2(block) ? undefined : block.children[index];
  codeBlockView(editor, block).update({
    isFold: false,
    ...(step?.type === "code-step" && { activeStepId: codeStepId(editor, step) }),
  });
}
