import { Editor, Path, Transforms, type PathRef } from "slate";
import { setOrInsertNode } from "@tau/editor/api";
import type { ImageElement, AudioElement, VideoElement } from "../types";

/** 先在原落点插完整批占位，避免首块替换段落后丢失后续文件或追随异步期间的新选区。 */
export function insertMediaBatch(
  editor: Editor,
  nodes: readonly (ImageElement | AudioElement | VideoElement)[]
): PathRef[] {
  const targets: PathRef[] = [];
  try {
    Editor.withoutNormalizing(editor, () => {
      for (const node of nodes) {
        const previous = targets[targets.length - 1]?.current;
        const path = previous ? Path.next(previous) : setOrInsertNode(editor, node);
        if (!path) break;
        if (previous) Transforms.insertNodes(editor, node, { at: path });
        targets.push(Editor.pathRef(editor, path));
      }
    });
    return targets;
  } catch (error) {
    for (const target of targets) target.unref();
    throw error;
  }
}
