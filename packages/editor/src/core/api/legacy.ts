import type { EditorExtension } from "./extension";

/**
 * kit 接受的扩展。旧 `IExtension` 适配层已随三端迁移完成而删除（2026-09-30，
 * docs/editor-refactor DECISIONS）：所有扩展都是 defineExtension 的产物。
 * `AnyExtension` 保留为 `EditorExtension` 的别名，等全仓标注自然更替后再收。
 */
export type AnyExtension = EditorExtension;

export const toEditorExtension = (extension: AnyExtension): EditorExtension => extension;

/** 扩展贡献的元素类型 */
export const elementTypesOf = (extension: EditorExtension): string[] =>
  (extension.elements ?? []).map(element => element.type);
