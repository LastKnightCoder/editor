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
import { createValueDocument, type EditorDocument } from "@tau/editor";
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
  recoveryNeeded?: boolean;
  adopt?: () => Promise<void>;
};

export const contentLineage = (contentId?: number) => `content:${contentId ?? 0}`;

export default function useLocalContentDocument(options: {
  contentId?: number;
  content: Descendant[];
  metadata?: ContentDetailResponse;
  version: number;
  onChange: (value: Descendant[], contracts?: ContentContractDictionary) => void;
}): LocalContentDocument | undefined {
  const latest = useRef(options);
  latest.current = options;
  const identity = (value: typeof options) =>
    JSON.stringify([
      value.contentId,
      value.metadata?.librarySourceId,
      value.metadata?.documentId,
      value.version,
    ]);
  const key = identity(options);
  const [reload, setReload] = useState(0);
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
      if (
        !current.metadata?.documentId ||
        !current.metadata.librarySourceId ||
        !current.metadata.revision
      )
        throw new Error("正文来源身份尚未建立");
      const cacheId = `local:${current.metadata.librarySourceId}:${current.metadata.documentId}`;
      const cached = await tauri.collabReadCache(cacheId);
      let doc: Y.Doc;
      let metadata: tauri.CachedContentSession;
      if (cached) {
        metadata = cached.metadata;
        if (
          metadata.source?.librarySourceId !== current.metadata.librarySourceId ||
          metadata.source?.contentDocumentId !== current.metadata.documentId
        )
          throw new Error("本机缓存来源不匹配，原数据已保留");
        paths.clear();
        references.clear();
        for (const [reference, path] of Object.entries(metadata.resourcePaths ?? {})) {
          paths.set(reference, path);
          references.set(path, reference);
        }
        doc = new Y.Doc({ gc: false });
        try {
          Y.applyUpdate(doc, base64ToBytes(cached.state));
          for (const update of cached.updates) Y.applyUpdate(doc, base64ToBytes(update));
          await validateNodeDocument(doc, {
            documentId: metadata.source.contentDocumentId!,
            baselineId: metadata.baselineId,
            epoch: metadata.epoch,
          });
          const value = map(
            readNodeDocument(doc).content,
            reference => paths.get(reference) ?? reference,
            doc.getMap("node-tree:contracts").toJSON() as ContentContractDictionary
          );
          if (
            metadata.source.projectionRevision !== current.metadata.revision &&
            JSON.stringify(value) !== JSON.stringify(current.content)
          )
            throw new Error("主库正文已被更新，原本机输入已保留，需先处理恢复副本");
          metadata.source.projectionRevision = current.metadata.revision;
        } catch (failure) {
          doc.destroy();
          throw failure;
        }
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
              for (const draft of drafts)
                await tauri.collabInputDraft({
                  ...draft,
                  documentId: cacheId,
                  baselineId: metadata.baselineId,
                  epoch: metadata.epoch,
                });
              metadata.resourcePaths = Object.fromEntries(paths);
              await tauri.collabWriteCache({
                documentId: cacheId,
                ...nodeRetentions(doc),
                metadata,
                state,
                confirmedDrafts,
              });
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
        const views = await tauri.collabNodeViews(cacheId);
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
    const kit = getMobileContentKit();
    void mobileContentPlugins
      .prepareEditorContracts(kit.extensions)
      .then(async catalog => {
        if (cancelled) return;
        await loaded.tree.installContracts(
          catalog.additionalContracts(loaded.tree.contracts.toJSON()),
          null
        );
        if (cancelled) return;
        const source = createNodeTreeDocument(loaded.tree, {
          lineage: contentLineage(options.contentId),
          versions: catalog,
          cursors: false,
          normalizeOnConnect: false,
          readonly: !!storageError,
          preserveInputDraft: loaded.preserveDraft,
          onChange: value => {
            if (identity(latest.current) !== key) return;
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
                const owner = loaded.tree.contract(nodeId)?.owner;
                if (!owner || loaded.tree.isDeleted(nodeId)) throw new Error("节点已失效");
                const value = await tauri.collabUpdateNodeView(
                  loaded.metadata.id,
                  nodeId,
                  owner,
                  patch
                );
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
                const path = await resources.upload(file);
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
  }, [loaded, key, revision, options.contentId, storageError]);
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
                          text: "此文档须先在桌面端完成升级。原始内容已保留，可在协作中心导出本机副本。",
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
    : preview && {
        ...preview,
        recoveryNeeded: Boolean(storageError && options.metadata?.contracts),
        adopt: async () => {
          const metadata = latest.current.metadata;
          if (!metadata?.contracts || !metadata.documentId || !metadata.librarySourceId)
            throw new Error("请先在桌面完成转换");
          const cacheId = `local:${metadata.librarySourceId}:${metadata.documentId}`;
          const cached = await tauri.collabReadCache(cacheId);
          if (!cached) throw new Error("原缓存缺失，不能确认采用");
          const resourcePaths: Record<string, string> = {};
          const map = (nodes: ContentNode[]): ContentNode[] =>
            nodes.map(node =>
              !node.children
                ? node
                : {
                    ...mapNodeResources(
                      node,
                      metadata.contracts![String(node.tauContract)]?.resources,
                      path => {
                        if (isSafeResource(path)) return path;
                        const reference = LOCAL_ASSET_PREFIX + crypto.randomUUID();
                        resourcePaths[reference] = path;
                        return reference;
                      }
                    ),
                    children: map(node.children),
                  }
            );
          const content = map(latest.current.content as ContentNode[]);
          const doc = await createNodeDocument(
            { documentId: metadata.documentId, baselineId: crypto.randomUUID(), epoch: 0 },
            { title: "", bannerBg: "", bannerPosition: "center", content },
            metadata.contracts
          );
          try {
            await tauri.collabAdoptCache({
              documentId: cacheId,
              state: bytesToBase64(Y.encodeStateAsUpdate(doc)),
              ...nodeRetentions(doc),
              expectedRevision: cached.revision,
              metadata: {
                ...cached.metadata,
                resourcePaths,
                baselineId: String(doc.getMap("meta").get("baselineId")),
                epoch: 0,
                pending: false,
                source: {
                  ...cached.metadata.source!,
                  projectionRevision: metadata.revision ?? undefined,
                },
              },
            });
            setLoaded(undefined);
            setPrepared(undefined);
            setReload(value => value + 1);
          } finally {
            doc.destroy();
          }
        },
      };
}
