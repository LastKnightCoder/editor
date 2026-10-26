import * as Y from "yjs";
import type { Descendant } from "slate";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  NodeTree,
  readSharedContent,
  NODE_DOCUMENT_VERSION,
  type ContentSessionTarget,
  type SharedContent,
} from "@tau/collaboration";
import { createNodeTreeDocument, type ContentCollaborationBinding } from "@tau/editor-collab";
import {
  createValueDocument,
  type EditorDocument,
  type EditorKit,
  type AnyExtension,
} from "@tau/editor";
import useCollaborationDocument from "@/hooks/useCollaborationDocument";
import useContentSession from "@/hooks/useContentSession";
import { registerContentBinding } from "@/services/contentBindings";
import { collaborationKit } from "./useCollaborationKit";
import { desktopContentPlugins } from "../../shared/content-plugins";

const nodeTrees = new WeakMap<ContentCollaborationBinding, NodeTree>();
function treeFor(binding: ContentCollaborationBinding) {
  let tree = nodeTrees.get(binding);
  if (!tree) {
    tree = new NodeTree(binding.doc);
    nodeTrees.set(binding, tree);
    binding.doc.on("destroy", tree.dispose);
  }
  return tree;
}

export interface ContentDocument {
  /** 传给 `<Editor document>`；换源期间沿用上一份，编辑器不重建（01 §7.3 第 2、3 层） */
  document?: EditorDocument;
  binding?: ContentCollaborationBinding;
  article?: SharedContent;
  error?: string;
  /** 会话被冻结（主进程正在切换共享状态） */
  frozen: boolean;
  /** 正在换源：底层会话换了身份（发起 / 结束共享），新订阅还没就绪 */
  swapping: boolean;
  pendingUpgrade?: boolean;
}

/** 发起或结束共享时切换文档源，保留正文谱系以复用编辑器外壳。 */
export default function useContentDocument(
  contentId?: number,
  source?: Omit<ContentSessionTarget, "contentId">,
  scenarioKit?: EditorKit,
  extensions?: readonly AnyExtension[]
): ContentDocument & { sessionError?: string } {
  const { entry, error: sessionError, databaseName } = useContentSession(contentId, source);
  const documentId = entry?.documentId;
  const { binding, article, error, frozen, pendingUpgrade } = useCollaborationDocument(documentId);
  const lineage = contentId ? `content:${databaseName}:${contentId}` : undefined;
  const bound = useBoundContentDocument(binding, { frozen, kit: scenarioKit, extensions, lineage });
  useEffect(() => {
    if (!contentId || !binding) return;
    return registerContentBinding(contentId, binding);
  }, [contentId, binding]);
  return {
    ...bound,
    article,
    error: bound.error || error,
    sessionError,
    pendingUpgrade,
    swapping: Boolean(documentId) && bound.swapping,
  };
}

/** 正文页与独立协作房间共用版本准备和文档绑定。 */
export function useBoundContentDocument(
  binding: ContentCollaborationBinding | undefined,
  options: {
    frozen?: boolean;
    kit?: EditorKit;
    extensions?: readonly AnyExtension[];
    lineage?: string;
  } = {}
) {
  const { frozen = false, kit: scenarioKit, extensions, lineage } = options;
  const current = useRef<{ binding: ContentCollaborationBinding; document: EditorDocument }>(null);
  const retainedDoc = binding?.doc ?? current.current?.binding.doc;
  useSyncExternalStore(
    notify => {
      retainedDoc?.on("destroy", notify);
      return () => retainedDoc?.off("destroy", notify);
    },
    () => retainedDoc?.isDestroyed ?? false
  );
  if (binding?.doc.isDestroyed) binding = undefined;
  if (current.current?.binding.doc.isDestroyed) current.current = null;
  const pluginRevision = useSyncExternalStore(
    desktopContentPlugins.subscribe,
    desktopContentPlugins.getRevision,
    desktopContentPlugins.getRevision
  );
  const structured = binding?.doc.getMap("meta").get("version") === NODE_DOCUMENT_VERSION;
  const baseKit = structured ? collaborationKit(binding, scenarioKit) : undefined;
  const kit =
    baseKit && extensions?.length ? baseKit.extend({ extensions, override: true }) : baseKit;
  const [prepared, setPrepared] = useState<{
    binding: ContentCollaborationBinding;
    kit: EditorKit;
    revision: number;
    document: EditorDocument;
  }>();
  const [preparationError, setPreparationError] = useState<string>();
  useEffect(() => {
    setPreparationError(undefined);
    if (!binding || !structured || !kit) return;
    let cancelled = false;
    void desktopContentPlugins
      .prepareEditorContracts(kit.extensions)
      .then(async catalog => {
        if (cancelled || binding.doc.isDestroyed) return;
        const tree = treeFor(binding);
        if (!frozen)
          await tree.installContracts(
            catalog.additionalContracts(tree.contracts.toJSON()),
            binding.origin
          );
        if (cancelled || binding.doc.isDestroyed) return;
        const document = createNodeTreeDocument(tree, {
          lineage,
          collaboration: binding,
          versions: catalog,
          readonly: frozen,
          normalizeOnConnect: false,
        });
        setPrepared({ binding, kit, revision: pluginRevision, document });
      })
      .catch(failure => {
        if (!cancelled)
          setPreparationError(failure instanceof Error ? failure.message : "文档契约准备失败");
      });
    return () => {
      cancelled = true;
    };
  }, [binding, structured, kit, pluginRevision, lineage, frozen]);
  const contractReady =
    !structured ||
    Boolean(
      prepared &&
      prepared.binding === binding &&
      prepared.kit === kit &&
      prepared.revision === pluginRevision
    );
  // 文档源按 binding 缓存：每次渲染新建会被内核视为换了文档
  if (binding && structured && contractReady && prepared)
    current.current = { binding, document: prepared.document };
  else if (binding && !structured && current.current?.binding !== binding)
    current.current = {
      binding,
      document: createValueDocument(
        readSharedContent(binding.doc).content as Descendant[],
        undefined,
        { lineage, readonly: true }
      ),
    };
  return {
    document: current.current?.document,
    binding: binding ?? current.current?.binding,
    error: preparationError,
    frozen: Boolean(binding) && (frozen || !structured || !contractReady),
    swapping: !binding && Boolean(current.current),
  };
}

/** 带契约的临时草稿复用节点绑定；只有持久正文才打开主进程内容会话。 */
export function useTransientContentDocument(
  input: Descendant[] | undefined,
  contracts: ContentContractDictionary | undefined,
  kit: EditorKit,
  readonly: boolean,
  onChange: ComponentChange | undefined
) {
  const output = useRef<Descendant[] | undefined>(undefined),
    initial = useRef(input);
  if (input !== output.current) initial.current = input;
  const source = initial.current;
  const callback = useRef(onChange);
  callback.current = onChange;
  const revision = useSyncExternalStore(
    desktopContentPlugins.subscribe,
    desktopContentPlugins.getRevision,
    desktopContentPlugins.getRevision
  );
  const current = useRef<{ source: Descendant[]; tree: NodeTree } | undefined>(undefined);
  const trees = useRef(new Set<NodeTree>());
  const [prepared, setPrepared] = useState<{
    source: Descendant[];
    document: EditorDocument;
    revision: number;
    kit: EditorKit;
    readonly: boolean;
  }>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    setError(undefined);
    void desktopContentPlugins
      .prepareEditorContracts(kit.extensions)
      .then(async catalog => {
        let tree = current.current?.source === source ? current.current.tree : undefined;
        if (!tree) {
          const value = await catalog.createDocument(source, contracts);
          tree = new NodeTree(new Y.Doc({ gc: false }));
          try {
            await tree.installContracts(
              { ...value.contracts, ...catalog.additionalContracts(value.contracts) },
              null
            );
            value.content.forEach((node, index) =>
              tree!.insertNode(
                node as import("@tau/collaboration").ContentNode,
                null,
                index,
                null,
                true
              )
            );
            if (cancelled) {
              tree.dispose();
              tree.doc.destroy();
              return;
            }
            current.current = { source, tree };
            trees.current.add(tree);
          } catch (failure) {
            tree.dispose();
            tree.doc.destroy();
            throw failure;
          }
        } else
          await tree.installContracts(catalog.additionalContracts(tree.contracts.toJSON()), null);
        if (cancelled) return;
        setPrepared({
          source,
          revision,
          kit,
          readonly,
          document: createNodeTreeDocument(tree, {
            versions: catalog,
            readonly,
            normalizeOnConnect: false,
            onChange: (value, editor) => {
              output.current = value;
              callback.current?.(value, editor);
            },
          }),
        });
      })
      .catch(failure => {
        if (!cancelled)
          setError(failure instanceof Error ? failure.message : "草稿契约无法读取，原内容已保留");
      });
    return () => {
      cancelled = true;
    };
  }, [source, contracts, kit, readonly, revision]);
  useEffect(
    () => () => {
      for (const tree of trees.current) {
        tree.dispose();
        tree.doc.destroy();
      }
      trees.current.clear();
    },
    []
  );
  return {
    document:
      prepared &&
      prepared.source === source &&
      prepared.revision === revision &&
      prepared.kit === kit &&
      prepared.readonly === readonly
        ? prepared.document
        : undefined,
    error,
  };
}
type ComponentChange = NonNullable<
  import("react").ComponentProps<typeof import("@tau/editor").Editor>["onChange"]
>;
