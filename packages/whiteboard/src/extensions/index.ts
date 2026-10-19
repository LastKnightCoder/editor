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
export type {
  TextExtensionOptions,
  WhiteboardTextEditorProps,
  WhiteboardRichTextService,
} from "./text";
export { embeddedTextOptions, IWhiteboardRichText, createEmbeddedRichTextService } from "./text";
export type { MediaCapabilities, MediaExtensionOptions, VideoSourceEntry } from "./media";
export { browserMediaInfo } from "./media";
// 宿主与扩展作者只依赖白板包即可构建服务注册表与声明服务标识
export { createServiceId, type ServiceIdentifier } from "@tau/shared/service-contract";
export { createServiceRegistry, type ServiceRegistry } from "@tau/shared/service-registry";
export type { ServiceRegister, ServiceRegistration } from "@tau/shared/service-registry";
