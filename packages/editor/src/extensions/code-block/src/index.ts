import "./augmentations";
import { codeBlockV2Extension as codeBlockExtension } from "./extensions/code-block";
export default codeBlockExtension;
export { codeBlockExtension };
export type { CodeBlockElement, CodeBlockMagicMove, CodeBlockMagicMoveStep } from "./types";
export { insertCodeBlock } from "./insert";

export { codeBlockV2Extension, codeStepElement } from "./extensions/code-block";
