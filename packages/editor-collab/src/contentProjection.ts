import * as Y from "yjs";
import { yTextToSlateElement } from "@slate-yjs/core";
import { Text, type Descendant } from "slate";
import { createParagraph } from "@tau/editor/api/paragraph";

const normalizeText = (node: Descendant): Descendant =>
  Text.isText(node)
    ? { ...node, type: "formatted" }
    : ({ ...node, children: node.children.map(normalizeText) } as Descendant);

export function readYjsContent(root: Y.XmlText): Descendant[] {
  const children = root.length ? yTextToSlateElement(root).children : [];
  return children.length ? children.map(normalizeText) : [createParagraph()];
}

function ownedSnapshot<T>(value: T): { value: T; cacheable: boolean } {
  const copy = structuredClone(value);
  const objects: object[] = [];
  const seen = new WeakSet<object>();
  const collect = (item: unknown): boolean => {
    if (!item || typeof item !== "object") return true;
    if (seen.has(item)) return false;
    seen.add(item);
    if (!Array.isArray(item) && Object.prototype.toString.call(item) !== "[object Object]")
      return false;
    objects.push(item);
    return Object.values(item).every(collect);
  };
  const cacheable = collect(copy);
  if (cacheable) objects.forEach(Object.freeze);
  return { value: copy, cacheable };
}

/** 快照独立于 Y.Doc 和 Slate；只复用未变的顶层块，块内转换沿用原库规范化。 */
export function createContentProjection(root: Y.XmlText) {
  const cache = new WeakMap<Y.XmlText, Descendant>();
  let snapshot: readonly Descendant[] | undefined;
  let transactions = 0;
  const begin = () => {
    transactions++;
  };
  const end = () => {
    transactions--;
  };
  const invalidate = (events: Y.YEvent<Y.AbstractType<unknown>>[]) => {
    snapshot = undefined;
    for (const event of events) {
      let target = event.target;
      while (target.parent && target.parent !== root) target = target.parent;
      if (target instanceof Y.XmlText && target !== root) cache.delete(target);
      if (event.target === root && event instanceof Y.YTextEvent) {
        for (const change of event.delta) {
          if (change.insert instanceof Y.XmlText) cache.delete(change.insert);
        }
      }
    }
  };
  root.doc?.on("beforeTransaction", begin);
  root.doc?.on("afterTransaction", end);
  root.observeDeep(invalidate);
  return {
    read(): readonly Descendant[] {
      // 事务尚未完成观察器通知时不读缓存，避免嵌套写入发布过期快照。
      if (transactions) return ownedSnapshot(readYjsContent(root)).value;
      if (snapshot) return snapshot;
      const delta = root.toDelta() as Array<{ insert: unknown }>;
      if (delta.some(part => !(part.insert instanceof Y.XmlText))) {
        const owned = ownedSnapshot(readYjsContent(root));
        if (owned.cacheable) snapshot = owned.value;
        return owned.value;
      }
      let cacheable = true;
      const content = delta.map(part => {
        const block = part.insert as Y.XmlText;
        let node = cache.get(block);
        if (!node) {
          const owned = ownedSnapshot(normalizeText(yTextToSlateElement(block)));
          node = owned.value;
          if (owned.cacheable) cache.set(block, node);
          else cacheable = false;
        }
        return node;
      });
      const next = Object.freeze(
        content.length ? content : [ownedSnapshot(createParagraph()).value]
      );
      if (cacheable) snapshot = next;
      return next;
    },
    dispose() {
      root.unobserveDeep(invalidate);
      root.doc?.off("beforeTransaction", begin);
      root.doc?.off("afterTransaction", end);
      snapshot = undefined;
    },
  };
}
