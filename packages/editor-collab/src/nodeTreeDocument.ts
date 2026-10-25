import { createEditor } from "slate";
import { projectNodeTree } from "./nodeTreeProjection";
import type { ContentNode } from "@tau/collaboration";
import type { Descendant, Editor } from "slate";
import { renderElementSpec, type EditorDocument } from "@tau/editor";
import type { ElementVersionAccess } from "@tau/editor/api";
import { createElement } from "react";
import type { ElementSpec } from "@tau/editor/contracts";
import type { NodeTree, NodeTreeHistory } from "@tau/collaboration";
import { withNodeTree, type NodeTreeEditor } from "./withNodeTree";
import {
  IEditorTextFields,
  IEditorNodeViews,
  type TextFieldSnapshot,
} from "@tau/editor/source-contracts";
import type { ContentCollaborationBinding } from "./types";
import { CollaborationContext } from "./context";
import { NodeTreeCursors } from "./NodeTreeCursors";

export interface NodeTreeDocumentOptions {
  preserveInputDraft?: (nodeId: string, field: string, snapshot: TextFieldSnapshot) => void;
  collaboration?: ContentCollaborationBinding;
  cursors?: boolean;
  history?: NodeTreeHistory;
  mutate?: (write: (target: NodeTree) => void, origin: object) => void;
  canWrite?: () => boolean;
  normalizeOnConnect?: boolean;
  lineage?: string;
  readonly?: boolean;
  onChange?: (value: Descendant[], editor: Editor) => void;
  versions?: {
    resolve(node: Record<string, unknown>): ElementVersionAccess | undefined;
    current(type: string): { id: string } | undefined;
  };
}

let bindingSequence = 0;
const bindingIdentities = new WeakMap<NodeTree, number>();
const collaborationEditors = new WeakMap<ContentCollaborationBinding, Set<NodeTreeEditor>>();

/** 节点树及注入历史由宿主持有；编辑视图只释放自身的订阅和写入来源。 */
export function createNodeTreeDocument(
  tree: NodeTree,
  options: NodeTreeDocumentOptions = {}
): EditorDocument {
  if (options.collaboration && options.collaboration.doc !== tree.doc)
    throw new Error("协作上下文属于另一份文档");
  if (options.history) tree.attachUndoManager(options.history);
  if (!bindingIdentities.has(tree)) bindingIdentities.set(tree, ++bindingSequence);
  const configuration = {
    prepareFragment: options.collaboration?.prepareFragment,
    preserveInputDraft: options.preserveInputDraft ?? options.collaboration?.preserveInputDraft,
    history: options.history,
    mutate: options.mutate,
    canWrite: options.canWrite,
    normalizeOnConnect: options.normalizeOnConnect,
    readonly: options.readonly,
    resolveVersion: options.versions
      ? (node: import("slate").Element) =>
          options.versions!.resolve(node as unknown as Record<string, unknown>)
      : undefined,
    currentContract: options.versions
      ? (type: string) => options.versions!.current(type)?.id
      : undefined,
  };
  const renderers = new WeakMap<ElementSpec, ReturnType<typeof renderElementSpec>>();
  const editors = options.collaboration
    ? (collaborationEditors.get(options.collaboration) ?? new Set<NodeTreeEditor>())
    : new Set<NodeTreeEditor>();
  if (options.collaboration) collaborationEditors.set(options.collaboration, editors);
  const retainEditor = (editor: NodeTreeEditor) => {
    editors.add(editor);
    if (options.collaboration)
      options.collaboration.flushLocal = () => {
        for (const current of editors) current.flushNodeTreeInputs();
      };
  };
  return {
    lineage: JSON.stringify([
      "node-tree",
      options.lineage ?? tree.doc.guid,
      tree.rootId,
      bindingIdentities.get(tree),
      options.history?.identity ?? "owned",
    ]),
    history: "external",
    readonly: options.readonly,
    initialValue: tree.read() as Descendant[],
    onChange: options.onChange,
    services: register => {
      if (options.collaboration?.nodeViews)
        register(IEditorNodeViews, options.collaboration.nodeViews);
      register(IEditorTextFields, {
        open(editor, element, field) {
          if (options.readonly) throw new Error("当前文档只读");
          return (editor as NodeTreeEditor).openNodeTextField(element, field);
        },
      });
    },
    binding: {
      wrap: options.collaboration
        ? children =>
            createElement(CollaborationContext.Provider, { value: options.collaboration }, children)
        : undefined,
      renderOverlay:
        options.collaboration && options.cursors !== false
          ? containerRef =>
              createElement(NodeTreeCursors, { binding: options.collaboration!, containerRef })
          : undefined,
      install: editor => withNodeTree(editor, tree, {}, configuration),
      connect: editor => {
        (editor as NodeTreeEditor).connectNodeTree();
        retainEditor(editor as NodeTreeEditor);
      },
      disconnect: editor => {
        (editor as NodeTreeEditor).disconnectNodeTree();
        editors.delete(editor as NodeTreeEditor);
      },
      splitUndoStep: editor => (editor as NodeTreeEditor).undoManager.stopCapturing(),
      rebind: editor => {
        const bound = editor as NodeTreeEditor;
        if (bound.nodeTree !== tree) return false;
        if (!bound.configureNodeTree(configuration)) return false;
        bound.connectNodeTree();
        retainEditor(bound);
        return true;
      },
      renderElement: props => {
        if (!options.versions) return undefined;
        const version = options.versions.resolve(
          props.element as unknown as Record<string, unknown>
        );
        if (version && version.access !== "none") {
          let renderer = renderers.get(version.element);
          if (!renderer) {
            renderer = renderElementSpec(version.element);
            renderers.set(version.element, renderer);
          }
          return renderer(props);
        }
        const id = (props.element as unknown as { collabId: string }).collabId;
        const inline = tree.contract(id)?.kind === "inline";
        return createElement(
          inline ? "span" : "div",
          { ...props.attributes, contentEditable: false },
          "该节点版本暂不可用，内容已保留",
          createElement("span", { hidden: true }, props.children)
        );
      },
    },
  };
}

/** 宿主已核对读取修订后，将快照差分转换为同一套稳定节点操作；调用方先在隔离文档上执行。 */
export function applyNodeTreeContent(tree: NodeTree, content: ContentNode[], origin: object): void {
  const prepare = (node: ContentNode): ContentNode => {
    if (!node.children) return structuredClone(node);
    const next: ContentNode & { collabId: string } = {
      ...structuredClone(node),
      collabId: typeof node.collabId === "string" ? node.collabId : crypto.randomUUID(),
      children: node.children.map(prepare),
    };
    if (tree.nodes.has(next.collabId) && !tree.isDeleted(next.collabId)) {
      const contract = tree.contract(next.collabId);
      if (contract && tree.properties(next.collabId).get("tauContract") === next.tauContract) {
        for (const field of contract.textFields) {
          if (typeof next[field] !== "string") throw new Error("源码字段必须是字符串");
          const text = tree.textField(next.collabId, field),
            before = text.toString(),
            after = next[field] as string;
          let start = 0,
            end = 0;
          while (start < before.length && start < after.length && before[start] === after[start])
            start++;
          while (
            end < before.length - start &&
            end < after.length - start &&
            before[before.length - end - 1] === after[after.length - end - 1]
          )
            end++;
          if (before.length - start - end) text.delete(start, before.length - start - end);
          if (after.length - start - end)
            text.insert(start, after.slice(start, after.length - end));
        }
      }
    }
    return next;
  };
  const next = tree.doc.transact(() => content.map(prepare), origin);
  const base = createEditor();
  const definition = (node: import("slate").Element) =>
    tree.contracts.get(String((node as unknown as ContentNode).tauContract)) as
      | import("@tau/db-schema/content-contracts").ContentContract
      | undefined;
  base.isInline = node => definition(node)?.kind === "inline";
  base.isVoid = node => definition(node)?.isVoid ?? false;
  base.normalizeNode = () => {};
  const editor = withNodeTree(base, tree, origin, { normalizeOnConnect: false });
  try {
    editor.connectNodeTree();
    projectNodeTree(editor, next as Descendant[]);
    editor.flushNodeTreeInputs();
  } finally {
    editor.disposeNodeTree();
  }
}
