import * as Y from "yjs";
import { WHITEBOARD_LIMITS, type WhiteboardModel } from "@tau/collaboration";

/** 用来回平移累积真实 V1 历史，保持场景中每个元素的原始坐标。 */
export function seedGeometryHistory(model: WhiteboardModel, frameId: string, target: number) {
  const frame = model.read().pages[0].children.find(node => node.id === frameId);
  if (
    !frame ||
    model.doc.gc ||
    !Number.isSafeInteger(target) ||
    target <= 0 ||
    target > WHITEBOARD_LIMITS.documentBytes
  )
    throw new Error("容量场景参数无效");
  const nodes = [frame, ...frame.children],
    origin = {};
  let bytes = Y.encodeStateAsUpdate(model.doc).byteLength,
    batches = 0;
  model.prepareLocalTranslations();
  while (bytes < target && batches < 256) {
    for (const dx of [1, 0]) {
      const values = nodes.map(({ id, geometry: g }) => ({
        id,
        geometry: model.geometryValue(g.x + dx, g.y, g.width, g.height, g.rotation),
      }));
      if (!model.tryLocalGeometries(values, origin))
        model.submitChunks(
          values.map(value => ({
            type: "set_node",
            id: value.id,
            patch: { geometry: value.geometry },
          })),
          origin
        );
      batches++;
    }
    bytes = Y.encodeStateAsUpdate(model.doc).byteLength;
  }
  if (bytes < target) throw new Error("未准备到指定的真实历史体积");
  return { bytes, batches };
}
