import * as Y from "yjs";
import {
  Editor,
  Element,
  Node,
  Path,
  Text,
  Transforms,
  type Descendant,
  type Operation,
  type Point,
  type Range,
} from "slate";
import {
  NodeTree,
  createNodeDocument,
  bytesToBase64,
  base64ToBytes,
  type NodeTreeHistory,
  type ContentNode,
} from "@tau/collaboration";
import { ReactEditor } from "slate-react";
import {
  canEditElement,
  setElementVersionResolver,
  captureEditorSubmission,
  notifierOf,
  type ElementVersionResolver,
} from "@tau/editor/api";
import {
  NODE_CONTRACT_PROPERTY,
  validateContentContracts,
  type ContentContractDictionary,
} from "@tau/db-schema/content-contracts";
import type { EditorTextField, TextFieldSnapshot } from "@tau/editor/source-contracts";
import { createTextFieldBinding } from "./textFieldBinding";
import { findNodePath, nodeIdentity, projectNodeTree } from "./nodeTreeProjection";

export interface NodeTreeEditorConfiguration {
  prepareFragment?: import("./types").ContentCollaborationBinding["prepareFragment"];
  preserveInputDraft?: (nodeId: string, field: string, snapshot: TextFieldSnapshot) => void;
  history?: NodeTreeHistory;
  mutate?: (write: (target: NodeTree) => void, origin: object) => void;
  canWrite?: () => boolean;
  normalizeOnConnect?: boolean;
  /** 宿主已校验的快照差分保留输入身份；普通编辑与粘贴仍分配新身份。 */
  preserveInsertedIdentities?: boolean;
  readonly?: boolean;
  resolveVersion?: ElementVersionResolver;
  currentContract?: (type: string) => string | undefined;
}

interface TreePoint {
  parent: string;
  position: Y.RelativePosition;
}

export interface NodeTreeSelection {
  rootId: string;
  anchor: string;
  focus: string;
}

export type NodeTreeEditor = Editor & {
  nodeTree: NodeTree;
  undoManager: NodeTreeHistory;
  connectNodeTree(): void;
  disconnectNodeTree(): void;
  disposeNodeTree(): void;
  undo(): void;
  redo(): void;
  openNodeTextField(element: Element, field: string): EditorTextField;
  captureNodeTreeSelection(): NodeTreeSelection | null;
  resolveNodeTreeSelection(value: unknown): Range | null;
  flushNodeTreeInputs(): void;
  configureNodeTree(configuration: NodeTreeEditorConfiguration): boolean;
};

const width = (node: Descendant) => (Text.isText(node) ? node.text.length : 1);
const properties = (node: Descendant): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(node).filter(([key]) => !["text", "children", "collabId"].includes(key))
  );
const withIdentities = (
  node: Descendant,
  current?: (type: string) => string | undefined
): Descendant =>
  Text.isText(node)
    ? { ...node }
    : ({
        ...node,
        ...(!(node as unknown as Record<string, unknown>)[NODE_CONTRACT_PROPERTY] && current
          ? {
              [NODE_CONTRACT_PROPERTY]: current(node.type),
            }
          : {}),
        collabId: crypto.randomUUID(),
        children: node.children.map(child => withIdentities(child, current)),
      } as unknown as Descendant);

/** 稳定节点模型的 Slate 适配；远端投影不产生新的共享写入。 */
export function withNodeTree<T extends Editor>(
  base: T,
  tree: NodeTree,
  origin: object,
  initialConfiguration: NodeTreeEditorConfiguration = {}
): T & NodeTreeEditor {
  const suppliedHistory = initialConfiguration.history;
  if (suppliedHistory) tree.attachUndoManager(suppliedHistory);
  const history = suppliedHistory ?? tree.createUndoManager({ trackedOrigins: new Set() });
  const editor = base as T & NodeTreeEditor;
  editor.nodeTree = tree;
  editor.undoManager = history;
  let disposed = false;
  let releaseOrigin: (() => void) | undefined;
  let connected = false;
  let projecting = false;
  let selection: { anchor: TreePoint; focus: TreePoint } | null = null;
  const fields = new Set<EditorTextField>();
  const apply = editor.apply;
  let configuration = initialConfiguration;
  editor.configureNodeTree = next => {
    if (disposed || next.history !== suppliedHistory) return false;
    configuration = next;
    setElementVersionResolver(editor, next.resolveVersion);
    return true;
  };
  editor.configureNodeTree(configuration);
  const setFragmentData = editor.setFragmentData;
  const insertData = editor.insertData;
  if (setFragmentData && insertData) {
    const mime = "application/x-tau-content";
    editor.setFragmentData = (data, event) => {
      setFragmentData(data, event);
      const content = editor.getFragment();
      const contracts: Record<string, ContentContractDictionary[string]> = {};
      const collect = (nodes: Descendant[]) => {
        for (const node of nodes)
          if (Element.isElement(node)) {
            const id = (node as unknown as Record<string, unknown>)[NODE_CONTRACT_PROPERTY];
            if (typeof id === "string" && tree.contracts.get(id))
              contracts[id] = tree.contracts.get(id)!;
            collect(node.children);
          }
      };
      collect(content);
      data.setData(
        mime,
        JSON.stringify({
          format: 2,
          sourceDocumentId: tree.doc.getMap("meta").get("documentId") ?? tree.doc.guid,
          content,
          contracts,
        })
      );
    };
    editor.insertData = async data => {
      const encoded = data.getData(mime);
      if (!encoded) return insertData(data);
      const submission = captureEditorSubmission(editor);
      const selection = editor.selection && Editor.rangeRef(editor, editor.selection);
      try {
        if (new TextEncoder().encode(encoded).length > 8 * 1024 * 1024)
          throw new Error("粘贴内容超过容量");
        const payload = JSON.parse(encoded);
        if (payload.format !== 2 || !Array.isArray(payload.content))
          throw new Error("粘贴内容格式无效");
        const contracts = await validateContentContracts(payload.contracts);
        let content = payload.content.map((node: Descendant) =>
          withIdentities(node, configuration.currentContract)
        );
        const candidate = await createNodeDocument(
          { documentId: "clipboard", baselineId: "clipboard", epoch: 0 },
          { title: "", bannerBg: "", bannerPosition: "center", content },
          { ...tree.contracts.toJSON(), ...contracts }
        );
        candidate.destroy();
        if (configuration.prepareFragment)
          content = await configuration.prepareFragment(
            String(payload.sourceDocumentId ?? ""),
            content,
            contracts
          );
        if (disposed || !connected || submission.check() || !selection?.current) return;
        await tree.installContracts(contracts, null);
        if (disposed || !connected || !selection.current) return;
        submission.commit(() => {
          if (!selection.current) return;
          Transforms.select(editor, selection.current);
          editor.insertFragment(content);
          return undefined;
        });
      } catch (failure) {
        notifierOf(editor).error(
          failure instanceof Error ? failure.message : "粘贴未完成，请保留原内容重试"
        );
      } finally {
        selection?.unref();
        submission.dispose();
      }
    };
  }
  const isInline = editor.isInline;
  const isVoid = editor.isVoid;
  const normalizeNode = editor.normalizeNode;
  editor.isInline = element => {
    if (!configuration.resolveVersion) return isInline(element);
    const id = nodeIdentity(element);
    return id ? tree.contract(id)?.kind === "inline" : isInline(element);
  };
  editor.isVoid = element => {
    if (!configuration.resolveVersion) return isVoid(element);
    const version = configuration.resolveVersion(element);
    return version?.access !== "edit" || Boolean(version.element.isVoid);
  };
  const editablePath = (path: Path) => {
    for (let depth = 1; depth <= path.length; depth++) {
      const at = path.slice(0, depth);
      if (!Node.has(editor, at)) return false;
      const node = Node.get(editor, at);
      if (Element.isElement(node) && !canEditElement(editor, node)) return false;
    }
    return true;
  };
  editor.normalizeNode = (entry, options) => {
    if (!editablePath(entry[1])) return;
    normalizeNode(entry, options);
  };

  const context = (path: Path) => {
    const parentPath = Path.parent(path);
    const parent = Node.get(editor, parentPath) as Editor | Element;
    const id = Editor.isEditor(parent) ? null : nodeIdentity(parent);
    if (id === undefined) throw new Error("节点缺少稳定身份");
    return {
      parent: id,
      offset: parent.children
        .slice(0, path[path.length - 1])
        .reduce((sum, child) => sum + width(child), 0),
      children: parent.children,
    };
  };
  const capturePoint = (point: Point): TreePoint | null => {
    if (!Node.has(editor, point.path)) return null;
    const location = context(point.path);
    if (!location.parent) return null;
    return {
      parent: location.parent,
      position: tree.capturePosition(location.parent, location.offset + point.offset),
    };
  };
  const rememberSelection = () => {
    const current = editor.selection;
    const anchor = current && capturePoint(current.anchor);
    const focus = current && capturePoint(current.focus);
    selection = anchor && focus ? { anchor, focus } : null;
  };
  const resolvePoint = (point: TreePoint): Point | null => {
    const resolved = tree.resolvePosition(point.position);
    if (!resolved) return null;
    const parentPath = findNodePath(editor, resolved.parent);
    if (!parentPath) return null;
    let offset = resolved.offset;
    const parent = Node.get(editor, parentPath) as Element;
    for (let index = 0; index < parent.children.length; index++) {
      const child = parent.children[index];
      if (Text.isText(child) && offset <= child.text.length)
        return { path: [...parentPath, index], offset };
      offset -= width(child);
    }
    return null;
  };
  editor.captureNodeTreeSelection = () => {
    if (!connected || !editor.selection) return null;
    const anchor = capturePoint(editor.selection.anchor),
      focus = capturePoint(editor.selection.focus);
    return anchor && focus
      ? {
          rootId: tree.rootId,
          anchor: bytesToBase64(Y.encodeRelativePosition(anchor.position)),
          focus: bytesToBase64(Y.encodeRelativePosition(focus.position)),
        }
      : null;
  };
  editor.resolveNodeTreeSelection = value => {
    if (!connected || !value || typeof value !== "object") return null;
    const range = value as NodeTreeSelection;
    if (
      range.rootId !== tree.rootId ||
      typeof range.anchor !== "string" ||
      typeof range.focus !== "string" ||
      range.anchor.length > 4096 ||
      range.focus.length > 4096
    )
      return null;
    try {
      const anchor = resolvePoint({
        parent: "",
        position: Y.decodeRelativePosition(base64ToBytes(range.anchor)),
      });
      const focus = resolvePoint({
        parent: "",
        position: Y.decodeRelativePosition(base64ToBytes(range.focus)),
      });
      return anchor && focus ? { anchor, focus } : null;
    } catch {
      return null;
    }
  };
  const refresh = (transaction: Y.Transaction) => {
    if (!connected || disposed || tree.isDisposed || transaction.origin === origin) return;
    const changes = tree.transactionChanges(transaction);
    if (!changes) return;
    projecting = true;
    try {
      if (changes.structural) projectNodeTree(editor, tree.read() as Descendant[]);
      else {
        for (const id of changes.nodes) {
          if (findNodePath(editor, id)) {
            projectNodeTree(editor, [structuredClone(tree.nodeSnapshot(id)) as Descendant], id);
          }
        }
      }
      const anchor = selection && resolvePoint(selection.anchor);
      const focus = selection && resolvePoint(selection.focus);
      editor.selection = anchor && focus ? { anchor, focus } : null;
      editor.onChange();
    } finally {
      projecting = false;
    }
  };

  editor.apply = (input: Operation) => {
    if (disposed) throw new Error("编辑器节点绑定已释放");
    if (connected && !projecting) history.assertActive(tree.doc);
    const normalized =
      input.type === "insert_node" && Text.isText(input.node)
        ? ({ ...input, node: { ...input.node, type: "formatted" } } as Operation)
        : input;
    if (!connected || projecting) {
      apply(normalized);
      return;
    }
    let operation = normalized;
    if (operation.type !== "set_selection") {
      const target = ["insert_node", "remove_node", "move_node"].includes(operation.type)
        ? Path.parent(operation.path)
        : operation.path;
      if (configuration.readonly || configuration.canWrite?.() === false || !editablePath(target))
        throw new Error("当前节点只读或版本不支持编辑");
      if (operation.type === "move_node" && !editablePath(Path.parent(operation.newPath)))
        throw new Error("目标节点只读");
    }
    if (operation.type === "insert_node" && Element.isElement(operation.node))
      operation = {
        ...operation,
        node: configuration.preserveInsertedIdentities
          ? operation.node
          : withIdentities(operation.node, configuration.currentContract),
      };
    let mergeContract: string | undefined;
    if (operation.type === "merge_node") {
      const node = Node.get(editor, operation.path);
      const previousPath = Path.previous(operation.path);
      const previous = Node.get(editor, previousPath);
      if (Element.isElement(node) && Element.isElement(previous)) {
        if (!editablePath(previousPath)) return;
        const sourceContract = tree.contract(nodeIdentity(node)!);
        const targetContract = tree.contract(nodeIdentity(previous)!);
        const sourceId = (node as unknown as Record<string, unknown>)[NODE_CONTRACT_PROPERTY];
        const targetId = (previous as unknown as Record<string, unknown>)[NODE_CONTRACT_PROPERTY];
        if (sourceId !== targetId) {
          if (
            !sourceContract ||
            !targetContract ||
            typeof targetId !== "string" ||
            sourceContract.type === targetContract.type ||
            sourceContract.kind !== targetContract.kind ||
            sourceContract.isVoid ||
            targetContract.isVoid ||
            sourceContract.textFields.length ||
            targetContract.textFields.length ||
            sourceContract.resources.length ||
            targetContract.resources.length
          )
            return;
          mergeContract = targetId;
        }
      }
    }
    const splitIdentity = crypto.randomUUID();
    const write = (tree: NodeTree) => {
      if (operation.type === "insert_node" && Element.isElement(operation.node)) {
        const location = context(operation.path);
        const node = operation.node;
        tree.insertNode(node as ContentNode, location.parent, location.offset, origin, true);
        operation = { ...operation, node };
      } else if (operation.type === "move_node") {
        const move = operation;
        const id = nodeIdentity(Node.get(editor, operation.path));
        if (!id) throw new Error("不能移动无身份节点");
        const destination = context(operation.newPath);
        const sameParent = Path.equals(Path.parent(operation.path), Path.parent(operation.newPath));
        const children = destination.children.filter(
          (_, index) => !sameParent || index !== move.path[move.path.length - 1]
        );
        const offset = children
          .slice(0, operation.newPath[operation.newPath.length - 1])
          .reduce((sum, child) => sum + width(child), 0);
        tree.moveNode(id, destination.parent, offset, origin);
      } else if (operation.type !== "set_selection") {
        const location = context(operation.path);
        const node = (
          operation.type === "insert_node" ? operation.node : Node.get(editor, operation.path)
        ) as Descendant;
        if (operation.type === "insert_text" || operation.type === "remove_text") {
          if (!location.parent) throw new Error("正文根不能直接编辑文本");
          if (operation.type === "insert_text")
            tree.insertText(
              location.parent,
              location.offset + operation.offset,
              operation.text,
              origin,
              properties(node)
            );
          else
            tree.deleteText(
              location.parent,
              location.offset + operation.offset,
              operation.text.length,
              origin
            );
        } else if (operation.type === "insert_node" && Text.isText(node)) {
          if (!location.parent) throw new Error("正文根不能直接插入文本");
          tree.insertText(location.parent, location.offset, node.text, origin, properties(node));
        } else if (operation.type === "remove_node") {
          if (Text.isText(node)) {
            if (!location.parent) throw new Error("正文根不能直接删除文本");
            tree.deleteText(location.parent, location.offset, node.text.length, origin);
          } else {
            const observed = [...Node.elements(node)].map(([element]) => {
              const id = nodeIdentity(element);
              if (!id) throw new Error("删除节点缺少稳定身份");
              return id;
            });
            tree.removeNodes(observed, origin);
          }
        } else if (operation.type === "set_node") {
          if (Element.isElement(node)) {
            const nextType = (operation.newProperties as { type?: string }).type;
            if (nextType && nextType !== node.type && tree.contract(nodeIdentity(node)!)) {
              const target = configuration.currentContract?.(nextType);
              if (!target) throw new Error("目标节点版本不可用");
              const previous = (node as unknown as Record<string, unknown>)[NODE_CONTRACT_PROPERTY];
              tree.convertNode(nodeIdentity(node)!, target, operation.newProperties, origin);
              operation = {
                ...operation,
                properties: { ...operation.properties, [NODE_CONTRACT_PROPERTY]: previous },
                newProperties: { ...operation.newProperties, [NODE_CONTRACT_PROPERTY]: target },
              } as unknown as Operation;
            } else tree.setProperties(nodeIdentity(node)!, operation.newProperties, origin);
          } else {
            if (!location.parent) throw new Error("正文根不能格式化文本");
            const marks = Object.fromEntries(
              Object.entries(operation.newProperties).map(([key, value]) => [key, value ?? null])
            );
            tree.formatText(location.parent, location.offset, node.text.length, marks, origin);
          }
        } else if (operation.type === "split_node" && Element.isElement(node)) {
          const id = splitIdentity;
          const next = { ...operation.properties, collabId: id, children: [] } as ContentNode;
          const offset = node.children
            .slice(0, operation.position)
            .reduce((sum, child) => sum + width(child), 0);
          tree.splitNode(nodeIdentity(node)!, offset, next, origin);
          operation = {
            ...operation,
            properties: { ...operation.properties, collabId: id },
          } as unknown as Operation;
        } else if (operation.type === "merge_node") {
          const previous = Node.get(editor, Path.previous(operation.path)) as Descendant;
          if (Element.isElement(node) && Element.isElement(previous)) {
            tree.doc.transact(() => {
              if (mergeContract)
                tree.convertNode(
                  nodeIdentity(node)!,
                  mergeContract,
                  { type: previous.type },
                  origin
                );
              tree.mergeNodes(nodeIdentity(node)!, nodeIdentity(previous)!, origin);
            }, origin);
          } else if (Text.isText(node) && Text.isText(previous) && location.parent) {
            const marks = {
              ...Object.fromEntries(Object.keys(properties(node)).map(key => [key, null])),
              ...properties(previous),
            };
            tree.formatText(location.parent, location.offset, node.text.length, marks, origin);
          }
        }
      }
    };
    if (operation.type !== "set_selection") {
      if (configuration.mutate) {
        try {
          configuration.mutate(write, origin);
        } catch (error) {
          projecting = true;
          try {
            projectNodeTree(editor, tree.read() as Descendant[]);
          } finally {
            projecting = false;
          }
          throw error;
        }
      } else write(tree);
    }
    apply(operation);
    rememberSelection();
  };

  editor.connectNodeTree = () => {
    if (disposed) throw new Error("编辑器节点绑定已释放");
    history.assertActive(tree.doc);
    if (connected) throw new Error("编辑器已经连接");
    editor.children = tree.read() as Descendant[];
    releaseOrigin = history.retainOrigin(origin);
    connected = true;
    tree.doc.on("afterTransaction", refresh);
    try {
      projecting = Boolean(configuration.readonly);
      try {
        if (configuration.normalizeOnConnect !== false) Editor.normalize(editor, { force: true });
      } finally {
        projecting = false;
      }
      if (selection) {
        const anchor = resolvePoint(selection.anchor);
        const focus = resolvePoint(selection.focus);
        editor.selection = anchor && focus ? { anchor, focus } : null;
      }
      rememberSelection();
      editor.onChange();
    } catch (error) {
      editor.disconnectNodeTree();
      throw error;
    }
  };

  editor.flushNodeTreeInputs = () => {
    for (const field of fields) field.flushInputs?.();
  };
  editor.disconnectNodeTree = () => {
    editor.flushNodeTreeInputs();
    tree.doc.off("afterTransaction", refresh);
    connected = false;
    releaseOrigin?.();
    releaseOrigin = undefined;
    history.stopCapturing();
    for (const field of fields) field.dispose();
    fields.clear();
  };
  editor.disposeNodeTree = () => {
    if (disposed) return;
    editor.disconnectNodeTree();
    disposed = true;
    tree.doc.off("destroy", editor.disposeNodeTree);
    if (!suppliedHistory) history.destroy();
  };
  tree.doc.on("destroy", editor.disposeNodeTree);

  editor.openNodeTextField = (element, field) => {
    if (disposed) throw new Error("编辑器节点绑定已释放");
    const id = nodeIdentity(element);
    if (!id) throw new Error("源码节点缺少身份");
    const handle = createTextFieldBinding(
      tree,
      id,
      field,
      editor.undoManager,
      () =>
        connected &&
        !configuration.readonly &&
        configuration.canWrite?.() !== false &&
        !ReactEditor.isReadOnly(editor) &&
        (() => {
          const path = findNodePath(editor, id);
          return Boolean(path && editablePath(path));
        })(),
      configuration.mutate,
      snapshot => configuration.preserveInputDraft?.(id, field, snapshot)
    );
    fields.add(handle);
    return {
      ...handle,
      dispose: () => {
        handle.dispose();
        fields.delete(handle);
      },
    };
  };
  editor.undo = () => {
    if (
      connected &&
      !configuration.readonly &&
      configuration.canWrite?.() !== false &&
      !ReactEditor.isReadOnly(editor)
    )
      editor.undoManager.undo();
  };
  editor.redo = () => {
    if (
      connected &&
      !configuration.readonly &&
      configuration.canWrite?.() !== false &&
      !ReactEditor.isReadOnly(editor)
    )
      editor.undoManager.redo();
  };
  return editor;
}
