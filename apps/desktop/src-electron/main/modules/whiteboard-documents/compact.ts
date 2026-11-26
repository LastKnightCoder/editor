import * as Y from "yjs";
import { isDeepStrictEqual } from "node:util";
import {
  WhiteboardModel,
  type WhiteboardReference,
  type WhiteboardPlacement,
} from "@tau/collaboration";

function cloneValue(value: unknown) {
  return value instanceof Y.AbstractType ? value.clone() : structuredClone(value);
}

function checkChannels(value: unknown) {
  if (
    (value instanceof Y.Map && value._start !== null) ||
    (value instanceof Y.Array && [...value._map.values()].some(item => !item.deleted))
  )
    throw new Error("白板存储含有未识别的混合字段");
}

// toJSON 会把带标记、嵌入和片段分界的富文本转成字符串。
function contents(value: unknown): unknown {
  checkChannels(value);
  if (value instanceof Y.Map)
    return ["map", new Map([...value].map(([key, entry]) => [key, contents(entry)]))];
  if (value instanceof Y.Array) return ["array", value.toArray().map(contents)];
  if (value instanceof Y.Text)
    return [
      value instanceof Y.XmlText ? "xml-text" : "text",
      value.getAttributes(),
      value.toDelta(),
    ];
  if (value instanceof Y.AbstractType) throw new Error("白板包含未支持的共享类型");
  return value;
}

function currentOrders(model: WhiteboardModel) {
  checkChannels(model.orders);
  checkChannels(model.pageOrder);
  const orders = new Map<string, WhiteboardReference[]>();
  for (const [key, order] of model.orders) {
    checkChannels(order);
    orders.set(
      key,
      order
        .toArray()
        .filter(
          ref =>
            (model.elements.get(ref.id)?.get("placement") as WhiteboardPlacement)?.token ===
            ref.token
        )
    );
  }
  const pages = model.pageOrder
    .toArray()
    .filter(ref => model.pages.get(ref.id)?.get("placement") === ref.token);
  return { orders, pages };
}

/** 从完整本机检查点重建，保留所有业务记录、恢复区、逻辑身份及未知插件字段。 */
export async function compactLocalWhiteboard(state: Uint8Array): Promise<Uint8Array | null> {
  const source = new WhiteboardModel(new Y.Doc({ gc: false }));
  const fresh = new Y.Doc({ gc: false });
  const reopened = new WhiteboardModel(new Y.Doc({ gc: false }));
  try {
    Y.applyUpdate(source.doc, state);
    if (source.doc.share.has("meta")) return null;
    await source.validate();
    const { orders, pages } = currentOrders(source);
    fresh.transact(() => {
      for (const [name, root] of source.doc.share) {
        if (name === "whiteboard:orders") {
          const target = fresh.getMap(name);
          for (const [key, refs] of orders) target.set(key, Y.Array.from(refs));
        } else if (root instanceof Y.Map) {
          const target = fresh.getMap(name);
          for (const [key, value] of root) target.set(key, cloneValue(value));
        } else if (root instanceof Y.Array) {
          fresh
            .getArray(name)
            .push(name === "whiteboard:page-order" ? pages : root.toArray().map(cloneValue));
        } else if (root instanceof Y.Text) {
          const target =
            root instanceof Y.XmlText ? fresh.get(name, Y.XmlText) : fresh.getText(name);
          target.applyDelta(root.toDelta());
          for (const [key, value] of Object.entries(root.getAttributes()))
            target.setAttribute(key, value);
        } else throw new Error("白板包含无法完整重建的共享根");
      }
    });
    const bytes = Y.encodeStateAsUpdate(fresh);
    if (bytes.length > state.length * 0.8) return null;
    Y.applyUpdate(reopened.doc, bytes);
    await reopened.validate();
    if (!isDeepStrictEqual(source.read(), reopened.read()))
      throw new Error("白板清理前后投影不一致");
    // 逐根核对，包括不在页面投影里的记录及可恢复文字。
    for (const [name, root] of source.doc.share) {
      if (name === "whiteboard:orders") {
        const restored = new Map(
          [...reopened.orders].map(([key, order]) => [key, order.toArray()])
        );
        if (isDeepStrictEqual(orders, restored)) continue;
      } else if (name === "whiteboard:page-order") {
        if (isDeepStrictEqual(pages, reopened.pageOrder.toArray())) continue;
      } else if (isDeepStrictEqual(contents(root), contents(reopened.doc.share.get(name))))
        continue;
      throw new Error("白板清理前后记录不一致");
    }
    return bytes;
  } finally {
    source.doc.destroy();
    fresh.destroy();
    reopened.doc.destroy();
  }
}
