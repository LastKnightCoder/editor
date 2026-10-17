export {
  defineElement,
  defineWhiteboardExtension,
  useWhiteboardAPI,
  useSketch,
  usePageSketch,
  AttrPopover,
  AttrToggle,
  OptionGrid,
  Seg,
  SketchPopover,
  sketch,
  SketchPaths,
} from "@tau/whiteboard/author";
export type { SketchPath, Vec } from "@tau/whiteboard/author";
export type {
  SchematicShape,
  SchematicFill,
  ResolvedSketch,
  ElementSketch,
  PageSketch,
  SketchLevel,
} from "@tau/whiteboard/author";
export type {
  WhiteboardAPI,
  WhiteboardExtension,
  WhiteboardElementDefinition,
  WhiteboardContributions,
  TypedBoardElement,
  ElementCreateSpec,
  WhiteboardSnapshot,
  BoardElement,
  WhiteboardToolProps,
} from "@tau/whiteboard/author";
import { createServiceId } from "@tau/shared/service-contract";
import type { PluginStorage } from "./contract";

/** 由宿主按插件和工作区绑定，交互扩展通过 requires 声明后获取。 */
export const IPluginStorage = createServiceId<PluginStorage>("tau.plugin.storage");
