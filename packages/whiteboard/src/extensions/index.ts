export * from "./builtins";
export type { WhiteboardExtensionError, WhiteboardExtensionErrorReason } from "./api";
export { defineElement } from "./api";
export type { TypedBoardElement, WhiteboardElementDefinition } from "./api";
export type { ElementContainmentSpec } from "./api";
export type {
  CreatePoint,
  CreatePointerContext,
  CreatePreviewOptions,
  CreateResult,
  CreateGestureSession,
  CustomCreateGesture,
  CreateBuildContext,
  ElementCreateSpec,
} from "./api";
export type { StandardSchemaV1 } from "./standard-schema";
export { WhiteboardValidationError } from "./validation";
export type { ElementValidationProblem } from "./validation";
export { bindTextContent } from "./textBinding";
export type { TextExtensionOptions, WhiteboardTextEditorProps } from "./text";
export { embeddedTextOptions } from "./text";
export type { MediaExtensionOptions } from "./media";
export { browserMediaOptions } from "./media";
