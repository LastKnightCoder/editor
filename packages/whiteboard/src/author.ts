/** 白板作者入口保持无 DOM 副作用，定义可在纯数据宿主中求值。 */
export { defineElement, defineWhiteboardExtension } from "./extensions/api";
export type {
  WhiteboardAPI,
  WhiteboardExtension,
  WhiteboardElementDefinition,
  WhiteboardContributions,
  TypedBoardElement,
  ElementCreateSpec,
  WhiteboardSnapshot,
} from "./extensions/api";
export type { BoardElement } from "./types/element";
export { useWhiteboardAPI } from "./extensions/context";
export { useSketch } from "./extensions/authorHooks";
export * as sketch from "./authorSketch";
export { default as SketchPaths } from "./components/SketchPaths";
export type { SketchPath } from "./utils/sketch/types";
export type { Vec } from "./utils/sketch/geometry";
export type { SchematicShape, SchematicFill } from "./types/schematic";
export type { ResolvedSketch, ElementSketch, PageSketch } from "./types/sketch";
