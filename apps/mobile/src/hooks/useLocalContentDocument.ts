import { matchingInputDrafts, nodeRetentions } from "../features/collaboration/core/retention";
import * as Y from "yjs";
import * as tauri from "../services/tauri";
import {
  bytesToBase64,
  base64ToBytes,
  readNodeDocument,
  validateNodeDocument,
} from "@tau/collaboration";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Descendant } from "slate";
import {
  createNodeDocument,
  NodeTree,
  LOCAL_ASSET_PREFIX,
  isSafeResource,
  type ContentNode,
} from "@tau/collaboration";
import { createNodeTreeDocument } from "@tau/editor-collab";
import { createValueDocument, type EditorDocument, type EditorKit } from "@tau/editor";
import { mapNodeResources } from "@tau/db-schema/content-resources";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import { IEditorNodeViews } from "@tau/editor/source-contracts";
import { IResourceService } from "@tau/shared/host-services";
import { mobileContentPlugins } from "../app/plugins/content";
import { getMobileContentKit } from "../services/editorKit";
import type { ContentDetailResponse } from "../types";
import { toast } from "../components/toast";

export type LocalContentDocument = EditorDocument & {
  flush(): Promise<void>;
};

export const contentLineage = (contentId?: number) => `content:${contentId ?? 0}`;

export default function useLocalContentDocument(options: {
  contentId?: number;
  content: Descendant[];
  metadata?: ContentDetailResponse;
  version: number;
  kit?: EditorKit;
  guard?: () => void;
  canWrite?: () => boolean;
  onChange: (value: Descendant[], contracts?: ContentContractDictionary) => void;
}): LocalContentDocument | undefined {
  const latest = useRef(options);
  latest.current = options;
  const assertActive = () => latest.current.guard?.();
  const canWrite = () => {
    try {
      assertActive();
      return latest.current.canWrite?.() !== false;
    } catch {
      return false;
    }
  };
  const identity = (value: typeof options) =>
    JSON.stringify([
      value.contentId,
      value.metadata?.librarySourceId,
      value.metadata?.documentId,
      value.version,
    ]);
  const key = identity(options);
  const [reload] = useState(0);
  const revision = useSyncExternalStore(
    mobileContentPlugins.subscribe,
    mobileContentPlugins.getRevision,
    mobileContentPlugins.getRevision
  );
  const [loaded, setLoaded] = useState<{
    key: string;
    tree: NodeTree;
    paths: Map<string, string>;
    metadata: tauri.CachedContentSession;
    views: Record<string, Record<string, unknown>>;
    persist: (update?: Uint8Array) => Promise<void>;
    preserveDraft: NonNullable<
      import("@tau/editor-collab").ContentCollaborationBinding["preserveInputDraft"]
    >;
    flush: () => Promise<void>;
    map: (nodes: ContentNode[], transform: (url: string) => string) => ContentNode[];
  }>();
  const [storageError, setStorageError] = useState<string>();
  const [prepared, setPrepared] = useState<{
    key: string;
    tree: NodeTree;
    document: LocalContentDocument;
    revision: number;
  }>();
  useEffect(() => {
    const current = latest.current;
    if (!current.contentId || !current.metadata?.contracts) {
      setLoaded(undefined);
      return;
    }
    let cancelled = false,
      tree: NodeTree | undefined;
    let dispose = () => {};
    setStorageError(undefined);
    const paths = new Map<string, string>(),
      references = new Map<string, string>();
    const contracts = current.metadata.contracts;
    const map = (
      nodes: ContentNode[],
      transform: (url: string) => string,
      dictionary = (tree?.contracts.toJSON() as ContentContractDictionary) ?? contracts
    ): ContentNode[] =>
      nodes.map(node => {
        if (!Array.isArray(node.children)) return node;
        const contract = dictionary[String(node.tauContract)];
        return {
          ...mapNodeResources(node, contract?.resources, transform),
          children: map(node.children, transform, dictionary),
        };
      });
    const content = map(structuredClone(current.content) as ContentNode[], path => {
      if (isSafeResource(path)) return path;
      let reference = references.get(path);
      if (!reference) {
        reference = LOCAL_ASSET_PREFIX + crypto.randomUUID();
        references.set(path, reference);
        paths.set(reference, path);
      }
      return reference;
    });
    void (async () => {
      assertActive();
      if (
        !current.metadata?.documentId ||
        !current.metadata.librarySourceId ||
        !current.metadata.revision
      )
        throw new Error("正文来源身份尚未建立");
      const cacheId = `local:${current.metadata.librarySourceId}:${current.metadata.documentId}`;
      let cached = await tauri.collabReadCache(cacheId);
      assertActive();
      let doc: Y.Doc | undefined;
      let metadata: tauri.CachedContentSession;
      if (cached) {
        const restored = cached;
        try {
          if (
            restored.metadata.source?.librarySourceId !== current.metadata.librarySourceId ||
            restored.metadata.source?.contentDocumentId !== current.metadata.documentId
          )
            throw new Error("本机缓存来源与正文不一致");
          doc = new Y.Doc({ gc: false });
          Y.applyUpdate(doc, base64ToBytes(restored.state));
          for (const update of restored.updates) Y.applyUpdate(doc, base64ToBytes(update));
          await validateNodeDocument(doc, {
            documentId: restored.metadata.source.contentDocumentId!,
            baselineId: restored.metadata.baselineId,
            epoch: restored.metadata.epoch,
          });
          const resourcePaths = new Map(Object.entries(restored.metadata.resourcePaths ?? {}));
          const value = map(
            readNodeDocument(doc).content,
            reference => resourcePaths.get(reference) ?? reference,
            doc.getMap("node-tree:contracts").toJSON() as ContentContractDictionary
          );
          if (
            restored.metadata.source.projectionRevision !== current.metadata.revision &&
            JSON.stringify(value) !== JSON.stringify(current.content)
          )
            throw new Error("主库正文已被其他入口更新");
        } catch (failure) {
          // 本机缓存可重建：读不出或与主库对不上时备份后按主库重建，不阻断编辑。
          doc?.destroy();
          doc = undefined;
          assertActive();
          await tauri.collabDiscardCache(
            cacheId,
            failure instanceof Error ? failure.message : "本机缓存不可读"
          );
          assertActive();
          cached = null;
        }
      }
      if (cached && doc) {
        metadata = cached.metadata;
        paths.clear();
        references.clear();
        for (const [reference, path] of Object.entries(metadata.resourcePaths ?? {})) {
          paths.set(reference, path);
          references.set(path, reference);
        }
        metadata.source!.projectionRevision = current.metadata.revision;
      } else {
        doc = await createNodeDocument(
          { documentId: current.metadata.documentId, baselineId: crypto.randomUUID(), epoch: 0 },
          { title: "", bannerBg: "", bannerPosition: "center", content },
          contracts
        );
        metadata = {
          id: cacheId,
          mode: "local",
          title: "",
          ownerId: "local",
          role: "owner",
          status: "active",
          members: [],
          updatedAt: Date.now(),
          serverUrl: "",
          connection: "connected",
          pending: false,
          leaving: false,
          baselineId: String(doc.getMap("meta").get("baselineId")),
          epoch: 0,
          source: {
            databaseName: current.metadata.librarySourceId,
            librarySourceId: current.metadata.librarySourceId,
            contentDocumentId: current.metadata.documentId,
            contentId: current.contentId!,
            contentCreatedAt: current.metadata.createTime,
            projectionRevision: current.metadata.revision,
          },
        };
      }
      let tail = Promise.resolve();
      const pendingUpdates: Uint8Array[] = [];
      const inputDrafts = new Map(
        (cached?.inputDrafts ?? []).map(draft => [
          JSON.stringify([draft.viewId, draft.nodeId, draft.field]),
          draft,
        ])
      );
      try {
        metadata.resourcePaths = Object.fromEntries(paths);
        assertActive();
        await tauri.collabWriteCache(
          {
            documentId: cacheId,
            ...nodeRetentions(doc),
            metadata,
            state: bytesToBase64(Y.encodeStateAsUpdate(doc)),
            expectedRevision: cached?.revision,
            confirmedDrafts: matchingInputDrafts(doc, [...inputDrafts.values()]),
          },
          true
        );
        assertActive();
        if (cancelled) {
          doc.destroy();
          return;
        }
        tree = new NodeTree(doc);
        const persist = (update: Uint8Array = new Uint8Array()) => {
          if (update.byteLength) pendingUpdates.push(Uint8Array.from(update));
          tail = tail
            .catch(() => undefined)
            .then(async () => {
              assertActive();
              const updates = pendingUpdates.slice();
              const drafts = [...inputDrafts.values()];
              const confirmedDrafts = matchingInputDrafts(doc, drafts);
              const state = bytesToBase64(
                updates.length ? Y.mergeUpdates(updates) : new Uint8Array()
              );
              await validateNodeDocument(doc, {
                documentId: metadata.source!.contentDocumentId!,
                baselineId: metadata.baselineId,
                epoch: metadata.epoch,
              });
              for (const draft of drafts) {
                assertActive();
                await tauri.collabInputDraft({
                  ...draft,
                  documentId: cacheId,
                  baselineId: metadata.baselineId,
                  epoch: metadata.epoch,
                });
              }
              assertActive();
              metadata.resourcePaths = Object.fromEntries(paths);
              await tauri.collabWriteCache({
                documentId: cacheId,
                ...nodeRetentions(doc),
                metadata,
                state,
                confirmedDrafts,
              });
              assertActive();
              pendingUpdates.splice(0, updates.length);
              for (const draft of confirmedDrafts) {
                const key = JSON.stringify([draft.viewId, draft.nodeId, draft.field]);
                if (inputDrafts.get(key)?.sequence === draft.sequence) inputDrafts.delete(key);
              }
              if (!cancelled) setStorageError(undefined);
            });
          void tail.catch(failure => {
            if (!cancelled) {
              const message =
                failure instanceof Error ? failure.message : "本机保存失败，当前输入仍在内存中";
              setStorageError(message);
              toast.error(message);
            }
          });
          return tail;
        };
        const update = (bytes: Uint8Array) => {
          metadata.pending = true;
          void persist(bytes).catch(() => {});
        };
        doc.on("update", update);
        dispose = () => doc.off("update", update);
        assertActive();
        const views = await tauri.collabNodeViews(cacheId);
        assertActive();
        if (cancelled) {
          dispose();
          tree.dispose();
          doc.destroy();
          return;
        }
        const viewId = crypto.randomUUID();
        let sequence = 0;
        const preserveDraft: NonNullable<
          import("@tau/editor-collab").ContentCollaborationBinding["preserveInputDraft"]
        > = (nodeId, field, draft) => {
          assertActive();
          if (!canWrite()) throw new Error("当前正文不可编辑");
          const payload = {
            documentId: cacheId,
            baselineId: metadata.baselineId,
            epoch: metadata.epoch,
            viewId,
            nodeId,
            field,
            ...draft,
            sequence: ++sequence,
          };
          inputDrafts.set(JSON.stringify([viewId, nodeId, field]), payload);
          void persist().catch(() => {});
        };
        setLoaded({
          key,
          tree,
          paths,
          map,
          metadata,
          views,
          persist,
          preserveDraft,
          flush: () => tail.catch(() => persist()),
        });
        const restored = map(
          readNodeDocument(doc).content,
          reference => paths.get(reference) ?? reference
        );
        if (JSON.stringify(restored) !== JSON.stringify(current.content))
          current.onChange(
            restored as Descendant[],
            tree.contracts.toJSON() as ContentContractDictionary
          );
      } catch (failure) {
        tree?.dispose();
        doc.destroy();
        throw failure;
      }
    })().catch(failure => {
      if (!cancelled) {
        const message =
          failure instanceof Error ? failure.message : "正文契约无法读取，已保留原数据";
        setStorageError(message);
        toast.error(message);
      }
    });
    return () => {
      cancelled = true;
      dispose();
      tree?.dispose();
      tree?.doc.destroy();
    };
  }, [key, reload]);

  useEffect(() => {
    if (!loaded || loaded.key !== key) return;
    let cancelled = false;
    const kit = options.kit ?? getMobileContentKit();
    void mobileContentPlugins
      .prepareEditorContracts(kit.extensions)
      .then(async catalog => {
        if (cancelled) return;
        assertActive();
        if (canWrite())
          await loaded.tree.installContracts(
            catalog.additionalContracts(loaded.tree.contracts.toJSON()),
            null
          );
        if (cancelled) return;
        assertActive();
        const source = createNodeTreeDocument(loaded.tree, {
          lineage: contentLineage(options.contentId),
          versions: catalog,
          cursors: false,
          normalizeOnConnect: false,
          readonly: !!storageError || !canWrite(),
          canWrite,
          preserveInputDraft: loaded.preserveDraft,
          onChange: value => {
            if (identity(latest.current) !== key || !canWrite()) return;
            const content = loaded.map(
              value as ContentNode[],
              reference => loaded.paths.get(reference) ?? reference
            ) as Descendant[];
            const contracts = loaded.tree.contracts.toJSON() as ContentContractDictionary;
            if (identity(latest.current) === key) latest.current.onChange(content, contracts);
          },
        });
        const resources = kit.registry.get(IResourceService);
        const document: LocalContentDocument = {
          ...source,
          flush: loaded.flush,
          services: register => {
            source.services?.(register);
            register(IEditorNodeViews, {
              read: nodeId => loaded.views[nodeId] ?? {},
              write: async (nodeId, patch) => {
                assertActive();
                if (!canWrite()) throw new Error("当前正文不可编辑");
                const owner = loaded.tree.contract(nodeId)?.owner;
                if (!owner || loaded.tree.isDeleted(nodeId)) throw new Error("节点已失效");
                const value = await tauri.collabUpdateNodeView(
                  loaded.metadata.id,
                  nodeId,
                  owner,
                  patch
                );
                assertActive();
                if (!canWrite()) throw new Error("当前正文不可编辑");
                loaded.views[nodeId] = value;
                return value;
              },
            });
            register(IResourceService, {
              ...resources,
              remoteResourceToLocal: reference =>
                resources.remoteResourceToLocal?.(loaded.paths.get(reference) ?? reference) ??
                Promise.resolve(loaded.paths.get(reference) ?? reference),
              upload: async file => {
                assertActive();
                if (!canWrite()) throw new Error("当前正文不可编辑");
                const path = await resources.upload(file);
                assertActive();
                if (!canWrite()) throw new Error("当前正文不可编辑");
                if (isSafeResource(path)) return path;
                const reference = LOCAL_ASSET_PREFIX + crypto.randomUUID();
                loaded.paths.set(reference, path);
                return reference;
              },
            });
          },
        };
        setPrepared({ key, tree: loaded.tree, document, revision });
      })
      .catch(failure => {
        if (!cancelled)
          toast.error(failure instanceof Error ? failure.message : "节点声明无法装配");
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, key, revision, options.contentId, options.kit, storageError]);
  useEffect(() => {
    if (!loaded || loaded.key !== key || !options.metadata?.revision || !loaded.metadata.source)
      return;
    if (loaded.metadata.source.projectionRevision === options.metadata.revision) return;
    loaded.metadata.source.projectionRevision = options.metadata.revision;
    loaded.metadata.pending =
      JSON.stringify(
        loaded.map(
          readNodeDocument(loaded.tree.doc).content,
          reference => loaded.paths.get(reference) ?? reference
        )
      ) !== JSON.stringify(options.metadata.content);
    void loaded.persist().catch(() => {});
  }, [loaded, key, options.metadata?.revision]);
  const preview = useMemo(
    () =>
      options.contentId
        ? {
            ...createValueDocument(
              options.metadata?.contracts
                ? options.content
                : [
                    {
                      type: "paragraph",
                      children: [
                        {
                          type: "formatted",
                          text: "此文档格式不受支持，无法编辑。",
                        },
                      ],
                    },
                  ],
              undefined,
              {
                lineage: contentLineage(options.contentId),
                readonly: true,
              }
            ),
            flush: async () => {},
          }
        : undefined,
    [key]
  );
  return prepared?.key === key && prepared.tree === loaded?.tree && prepared.revision === revision
    ? prepared.document
    : preview;
}
