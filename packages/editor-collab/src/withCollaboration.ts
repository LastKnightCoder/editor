import * as Y from "yjs";
import {
  Editor,
  Element,
  Node,
  Range,
  Transforms,
  type Descendant,
  type Operation,
  type SetNodeOperation,
} from "slate";
import { withCursors, withYHistory, withYjs, YjsEditor } from "@slate-yjs/core";
import {
  getBody,
  getFields,
  getBlockFields,
  prepareNodes,
  sharedProperty,
  setSharedValue,
  sharedValueEquals,
  LOCAL_FIELDS,
  PRIVATE_BLOCKS,
  type ContentNode,
} from "@tau/collaboration";
import type { EditorCollaborationBinding } from "./types";

const PROJECTION_ORIGIN = Symbol("collaboration-projection");

/** 换绑入口：编辑器里所有读 binding 的闭包都经这里换到新绑定（见 rebindCollaboration） */
const REBINDABLE = new WeakMap<
  Editor,
  (next: EditorCollaborationBinding, cursors: boolean) => void
>();

export function withCollaboration<T extends Editor>(
  base: T,
  initialBinding: EditorCollaborationBinding,
  { cursors = true }: { cursors?: boolean } = {}
) {
  // 可变绑定：下面所有改写都在闭包里读它，换源时只换这一个引用
  let binding = initialBinding;
  let cursorsEnabled = cursors;
  const editor = withCursors(
    withYHistory(
      withYjs(base, binding.root || getBody(binding.doc), {
        localOrigin: binding.origin,
      })
    ),
    binding.awareness,
    { cursorDataField: "user", autoSend: false }
  );
  const sendCursorPosition = editor.sendCursorPosition;
  editor.sendCursorPosition = range => {
    // 失焦时保留最后选区，窗口关闭时由 awareness 移除。
    if (cursorsEnabled && range) sendCursorPosition(range);
  };
  // 只安装一次发送钩子；连接/换绑不重复叠加 onChange。
  const onChange = editor.onChange;
  editor.onChange = () => {
    onChange();
    if (YjsEditor.connected(editor)) editor.sendCursorPosition(editor.selection);
  };
  editor.undoManager.addToScope(getFields(binding.doc));
  const insertText = editor.insertText;
  editor.insertText = text => {
    // 删除全选内容可能使规范化插件替换节点，需先恢复有效选区再插入。
    if (editor.selection && Range.isExpanded(editor.selection)) {
      editor.deleteFragment();
      if (!editor.selection && editor.children.length > 0)
        Transforms.select(editor, Editor.start(editor, []));
    }
    insertText(text);
  };
  const localProperties = new Map<string, Record<string, unknown>>();
  const apply = editor.apply;
  let projecting = false;

  const hydrate = (ids?: Set<string>) => {
    if (projecting || !YjsEditor.connected(editor)) return;
    projecting = true;
    try {
      YjsEditor.withOrigin(editor, PROJECTION_ORIGIN, () =>
        Editor.withoutNormalizing(editor, () => {
          for (const [entry, path] of Node.descendants(editor)) {
            const node = entry as unknown as ContentNode;
            if (!node.children || typeof node.collabId !== "string") continue;
            if (ids && !ids.has(node.collabId)) continue;
            const block = getFields(binding.doc).get(node.collabId);
            const values: Record<string, unknown> = {
              ...localProperties.get(node.collabId),
            };
            if (block)
              for (const [key, value] of block) {
                if (sharedProperty(node.type || "", key))
                  values[key] = value instanceof Y.AbstractType ? value.toJSON() : value;
              }
            const properties: Record<string, unknown> = {};
            const next: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(values))
              if (!sharedValueEquals(node[key], value)) {
                properties[key] = node[key];
                next[key] = value;
              }
            if (Object.keys(next).length)
              apply({
                type: "set_node",
                path,
                properties,
                newProperties: next,
              } as SetNodeOperation);
          }
        })
      );
    } finally {
      projecting = false;
    }
  };

  // 同一批 Y 事件会先后触发 applyRemoteEvents 与 fields 监听，用微任务合并成一次投影；
  // 纯文本输入不改变块结构，无需全树扫描。
  let hydrateQueued = false;
  let hydrateAll = false;
  const hydrateIds = new Set<string>();
  const scheduleHydrate = (ids?: Set<string>) => {
    if (ids) for (const id of ids) hydrateIds.add(id);
    else hydrateAll = true;
    if (hydrateQueued) return;
    hydrateQueued = true;
    queueMicrotask(() => {
      hydrateQueued = false;
      const ids = hydrateAll ? undefined : new Set(hydrateIds);
      hydrateAll = false;
      hydrateIds.clear();
      hydrate(ids);
    });
  };
  const fieldsEventIds = (events: Y.YEvent<Y.AbstractType<any>>[]): Set<string> | undefined => {
    const ids = new Set<string>();
    for (const event of events) {
      const head = event.path[0];
      if (typeof head !== "string") return undefined;
      ids.add(head);
    }
    return ids;
  };
  const eventTouchesStructure = (event: Y.YEvent<Y.AbstractType<any>>): boolean => {
    if (event.path.length > 0) return true;
    const delta = (event as unknown as { delta?: { insert?: unknown }[] }).delta;
    if (!delta) return true;
    return delta.some(change => typeof change.insert !== "string" || "attributes" in change);
  };

  editor.apply = (operation: Operation) => {
    if (projecting || !YjsEditor.connected(editor) || !YjsEditor.isLocal(editor)) {
      apply(operation);
      return;
    }
    if (operation.type === "insert_node" && "children" in operation.node) {
      const original = operation.node as unknown as ContentNode;
      let node: ContentNode;
      binding.doc.transact(() => {
        node = prepareNodes(binding.doc, [original], binding.privateNodes, true)[0];
      }, binding.origin);
      if (PRIVATE_BLOCKS.has(original.type || "") && typeof node!.collabId === "string")
        binding.putPrivateNode?.(node!.collabId, binding.privateNodes.get(node!.collabId)!);
      apply({ ...operation, node: node! as unknown as Descendant });
      scheduleHydrate();
      return;
    }
    if (operation.type === "split_node") {
      const properties = operation.properties as Record<string, unknown> | null;
      if (properties && typeof properties.collabId === "string") {
        // 拆分会把原块的属性（含 collabId）复制给新块，必须为 新块分配新身份，
        // 否则两个块共享同一份源码字段，编辑一个另一个跟着变。
        const rest = { ...properties };
        delete rest.collabId;
        apply({ ...operation, properties: rest });
        const newPath = [...operation.path];
        newPath[operation.path.length - 1] += 1;
        apply({
          type: "set_node",
          path: newPath,
          properties: { collabId: properties.collabId },
          newProperties: { collabId: crypto.randomUUID() },
        } as SetNodeOperation);
        return;
      }
    }
    if (operation.type === "merge_node") {
      const properties = operation.properties as Record<string, unknown> | null;
      if (properties && typeof properties.collabId === "string") {
        // 合并携带被删块的身份会顶掉幸存块的字段映射，剥离后由幸存块保持自己的身份。
        const rest = { ...properties };
        delete rest.collabId;
        apply({ ...operation, properties: rest });
        return;
      }
    }
    if (operation.type === "set_node") {
      const node = Node.get(editor, operation.path) as unknown as ContentNode;
      // 私有块的属性编辑（如白板高度）只落持有数据的本机，不进入共享文档。
      if (
        node.type === "collaboration-placeholder" &&
        typeof node.collabId === "string" &&
        binding.privateNodes.has(node.collabId)
      ) {
        const next = {
          ...binding.privateNodes.get(node.collabId),
          ...(operation.newProperties as Record<string, unknown>),
          collabId: node.collabId,
        } as ContentNode;
        binding.privateNodes.set(node.collabId, next);
        binding.putPrivateNode?.(node.collabId, next);
        YjsEditor.withOrigin(editor, PROJECTION_ORIGIN, () => apply(operation));
        return;
      }
      if (typeof node.collabId === "string") {
        const properties = { ...operation.properties } as Record<string, unknown>;
        const newProperties = { ...operation.newProperties } as Record<string, unknown>;
        let hasSpecial = false;
        binding.doc.transact(() => {
          for (const key of new Set([...Object.keys(properties), ...Object.keys(newProperties)])) {
            if (LOCAL_FIELDS.has(key)) {
              const local = localProperties.get(node.collabId as string) || {};
              local[key] = newProperties[key];
              localProperties.set(node.collabId as string, local);
              // 本机视图状态变更（如激活 Tab）回调宿主，由其决定是否上报持久化
              binding.onLocalFieldChange?.(node.collabId as string, key, newProperties[key]);
            } else if (sharedProperty(node.type || "", key)) {
              const fields = getBlockFields(binding.doc, node.collabId as string);
              if (newProperties[key] === undefined) fields.delete(key);
              else setSharedValue(fields, key, newProperties[key]);
            } else continue;
            hasSpecial = true;
            delete properties[key];
            delete newProperties[key];
          }
        }, binding.origin);
        if (hasSpecial) {
          if (Object.keys(properties).length || Object.keys(newProperties).length)
            apply({
              ...operation,
              properties,
              newProperties,
            } as SetNodeOperation);
          YjsEditor.withOrigin(editor, PROJECTION_ORIGIN, () => apply(operation));
          scheduleHydrate(new Set([node.collabId as string]));
          return;
        }
      }
    }
    apply(operation);
  };
  const remote = editor.applyRemoteEvents;
  editor.applyRemoteEvents = (events, origin) => {
    remote(events, origin);
    if (events.some(eventTouchesStructure)) scheduleHydrate();
  };
  const connect = editor.connect;
  const disconnect = editor.disconnect;
  const update = (events: Y.YEvent<Y.AbstractType<any>>[]) =>
    scheduleHydrate(fieldsEventIds(events));
  editor.connect = () => {
    connect();
    getFields(binding.doc).observeDeep(update);
    hydrate();
  };
  editor.disconnect = () => {
    getFields(binding.doc).unobserveDeep(update);
    disconnect();
  };
  REBINDABLE.set(editor, (next, nextCursors) => {
    binding = next;
    cursorsEnabled = nextCursors;
  });
  return editor;
}

/**
 * 同谱系换源（01 §7.3 第 3 层）：把已装好的编辑器从旧绑定迁到新绑定。
 * 调用前编辑器必须已 disconnect（旧绑定的监听已摘除）。
 *
 * 结构共享是关键：slate-react 以节点对象身份作 key（NODE_TO_KEY），内容相同的子树
 * 换回旧对象，块组件（mermaid、codemirror 等）就不会重新挂载。
 */
export function rebindCollaboration(
  editor: Editor,
  next: EditorCollaborationBinding,
  { cursors = true }: { cursors?: boolean } = {}
): boolean {
  const setBinding = REBINDABLE.get(editor);
  if (!setBinding || !YjsEditor.isYjsEditor(editor)) return false;
  const target = editor as unknown as CollaborativeEditor;
  const previousChildren = target.children;
  const selection = target.selection;
  // 本地写入标识必须保持稳定：slate-yjs 把最近一次 withOrigin 的 origin 记在内部 WeakMap 里
  // 并与 localOrigin 比较来判断「这是本地改动吗」。换掉 localOrigin 会让本地编辑被判成远端，
  // 从此不再写回 Y.Doc。所以让新绑定沿用编辑器已有的 origin。
  next.origin = target.localOrigin as object;
  setBinding(next, cursors);
  target.sharedRoot = next.root || getBody(next.doc);
  target.awareness = next.awareness;
  target.undoManager.destroy();
  target.undoManager = new Y.UndoManager(target.sharedRoot, {
    trackedOrigins: new Set([target.localOrigin]),
  });
  target.undoManager.addToScope(getFields(next.doc));
  YjsEditor.connect(target);
  target.children = shareStructure(previousChildren, target.children);
  if (
    selection &&
    Node.has(target, selection.anchor.path) &&
    Node.has(target, selection.focus.path)
  )
    target.selection = selection;
  target.onChange();
  return true;
}

type CollaborativeEditor = ReturnType<typeof withCollaboration<Editor>>;

const sameContent = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * 内容相同的节点换回旧对象。按 collabId 对齐（前面插入删除了块时位置会整体错位，
 * 只按位置比较会让其后所有块都被判为不同），没有 collabId（文本叶子）时退回同位置。
 */
function shareStructure(previous: Descendant[], next: Descendant[]): Descendant[] {
  const byCollabId = new Map<string, Descendant>();
  const index = (nodes: Descendant[]) => {
    for (const node of nodes) {
      const collabId = (node as unknown as ContentNode).collabId;
      if (typeof collabId === "string" && !byCollabId.has(collabId)) byCollabId.set(collabId, node);
      if (Element.isElement(node)) index(node.children);
    }
  };
  index(previous);
  const visit = (node: Descendant, sameIndex: Descendant | undefined): Descendant => {
    const collabId = (node as unknown as ContentNode).collabId;
    const old = (typeof collabId === "string" ? byCollabId.get(collabId) : undefined) ?? sameIndex;
    if (old && sameContent(old, node)) return old;
    if (Element.isElement(node) && old && Element.isElement(old))
      return {
        ...node,
        children: node.children.map((child, childIndex) => visit(child, old.children[childIndex])),
      } as Descendant;
    return node;
  };
  return next.map((node, position) => visit(node, previous[position]));
}
