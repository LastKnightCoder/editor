import type { SharedContent, ContentNode } from "@tau/collaboration";
import {
  base64ToBytes,
  collectNodeDocumentResources,
  isCollaborationResource,
  isSafeResource,
  validateNodeDocument,
} from "@tau/collaboration";
import * as Y from "yjs";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import {
  contentResourceSlots,
  contentResourceValues,
  mapNodeResources,
} from "@tau/db-schema/content-resources";
import {
  collabReadCache,
  collabResource,
  type CollaborationResourceContext,
} from "../../../services/tauri";

interface ContentResourceSource {
  doc: Y.Doc;
  localize(references: string[]): Promise<Record<string, string>>;
}
const sources = new Map<string, Set<ContentResourceSource>>();

export function registerContentResourceSource(id: string, source: ContentResourceSource) {
  const entries = sources.get(id) ?? new Set<ContentResourceSource>();
  entries.add(source);
  sources.set(id, entries);
  return () => {
    entries.delete(source);
    if (!entries.size && sources.get(id) === entries) sources.delete(id);
  };
}

export async function localizeFragmentResources(
  sourceId: string,
  content: ContentNode[],
  contracts: ContentContractDictionary
): Promise<ContentNode[]> {
  const value = await mapDocumentResources(
    { title: "", bannerBg: "", bannerPosition: "center", content },
    contracts,
    async references => {
      const local = references.filter(
        reference =>
          (!isSafeResource(reference) && !reference.startsWith("data:")) ||
          isCollaborationResource(reference)
      );
      if (!local.length) return {};
      const complete = (mapped: Record<string, string>) => {
        if (
          local.some(reference => !mapped[reference] || isCollaborationResource(mapped[reference]))
        )
          throw new Error("来源附件尚未保存为可复制的资源");
        return mapped;
      };
      const entries = sources.get(sourceId);
      const source = [...(entries ?? [])].find(entry => {
        const allowed = new Set(collectNodeDocumentResources(entry.doc));
        return local.every(reference => allowed.has(reference));
      });
      if (source) {
        const result = await source.localize(local);
        if (!sources.get(sourceId)?.has(source)) throw new Error("复制来源已变化，请重新复制");
        return complete(result);
      }
      const cached = await collabReadCache(sourceId);
      if (!cached || cached.metadata.id !== sourceId)
        throw new Error("图片的来源文档不可用，请重新复制");
      const doc = new Y.Doc({ gc: false });
      try {
        Y.applyUpdate(doc, base64ToBytes(cached.state));
        for (const update of cached.updates) Y.applyUpdate(doc, base64ToBytes(update));
        const localSession = cached.metadata.mode === "local";
        await validateNodeDocument(
          doc,
          {
            documentId: localSession ? cached.metadata.source!.contentDocumentId! : sourceId,
            baselineId: cached.metadata.baselineId,
            epoch: cached.metadata.epoch,
          },
          undefined,
          { allowLocalResources: localSession }
        );
        const allowed = new Set(collectNodeDocumentResources(doc));
        if (local.some(reference => !allowed.has(reference))) throw new Error("图片不属于复制来源");
        if (localSession) {
          return Object.fromEntries(
            local.map(reference => {
              const path = cached.metadata.resourcePaths?.[reference] ?? reference;
              if (isCollaborationResource(path)) throw new Error("来源附件缺少本地映射");
              return [reference, path];
            })
          );
        }
        return complete(
          await collabResource<Record<string, string>>(
            { serverUrl: cached.metadata.serverUrl, documentId: sourceId },
            "localize",
            local
          )
        );
      } finally {
        doc.destroy();
      }
    }
  );
  return value.content;
}

export async function mapDocumentResources(
  value: SharedContent,
  contracts: ContentContractDictionary,
  transform: (references: string[]) => Promise<Record<string, string>>,
  prepare = false
): Promise<SharedContent> {
  const references = new Set<string>();
  const add = (reference: string, field = "") => {
    if (reference && (!prepare || !isSafeResource(reference, field))) references.add(reference);
  };
  const visit = (nodes: ContentNode[]) => {
    for (const node of nodes) {
      if (!Array.isArray(node.children)) continue;
      const contract = contracts[String(node.tauContract)];
      if (!contract || contract.type !== node.type || contract.domain !== "editor-node")
        throw new Error("资源缺少匹配的节点契约");
      for (const slot of contentResourceSlots(node, contract.resources))
        for (const reference of contentResourceValues(slot)) add(reference);
      visit(node.children);
    }
  };
  visit(value.content);
  add(value.bannerBg, "bannerBg");
  const mapped = references.size ? await transform([...references]) : {};
  const apply = (nodes: ContentNode[]): ContentNode[] =>
    nodes.map(node =>
      Array.isArray(node.children)
        ? {
            ...mapNodeResources(
              node,
              contracts[String(node.tauContract)]?.resources,
              reference => mapped[reference]
            ),
            children: apply(node.children),
          }
        : node
    );
  return {
    ...value,
    bannerBg: mapped[value.bannerBg] ?? value.bannerBg,
    content: apply(value.content),
  };
}

export function prepareDocumentResources(
  context: CollaborationResourceContext,
  value: SharedContent,
  contracts: ContentContractDictionary
) {
  return mapDocumentResources(
    value,
    contracts,
    references => collabResource<Record<string, string>>(context, "prepare", references),
    true
  );
}

export function localizeDocumentResources(
  context: CollaborationResourceContext,
  value: SharedContent,
  contracts: ContentContractDictionary
) {
  return mapDocumentResources(value, contracts, references =>
    collabResource<Record<string, string>>(context, "localize", references)
  );
}
