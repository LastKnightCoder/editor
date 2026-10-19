import "./augmentations";
import codeBlockExtension from "./extensions/code-block";
export default codeBlockExtension;
export { codeBlockExtension };
export type { CodeBlockElement, CodeBlockMagicMove, CodeBlockMagicMoveStep } from "./types";
export { insertCodeBlock } from "./insert";
