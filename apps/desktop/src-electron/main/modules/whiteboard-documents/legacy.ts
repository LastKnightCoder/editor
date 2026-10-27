import { randomUUID } from "node:crypto";
import {
  createWhiteboardBaseline,
  type ContentNode,
  type TransferElement,
  type WhiteboardTransfer,
} from "@tau/collaboration";
import {
  prepareWhiteboardContract,
  type ContentContractDictionary,
  type DataJson,
} from "@tau/db-schema/content-contracts";
import {
  mapNodeResources,
  contentResourceSlots,
  contentResourceValues,
} from "@tau/db-schema/content-resources";
import type { ContentEntityKind, ContentEntityReference } from "@tau/db-schema/content-identities";
import { prepareBuiltinWhiteboardTypes } from "@tau/whiteboard/contracts";

export interface LegacyWhiteboardPage {
  id: string;
  title: string;
  data: { version?: number; children: Record<string, unknown>[]; [key: string]: unknown };
}
export interface LegacyWhiteboardContext {
  documentId: string;
  title: string;
  editorContracts: ContentContractDictionary;
  resolveEntity(kind: ContentEntityKind, id: number): ContentEntityReference | null;
  mapResource(reference: string): Promise<string>;
  /** 画布内嵌正文按当前节点声明补齐身份与契约（与正文自愈同一份修复） */
  repairBody(
    nodes: unknown[]
  ): Promise<{ content: ContentNode[]; contracts: ContentContractDictionary }>;
}

/** 仅接管旧画布及其内嵌正文的持有；外部 contents 仍拥有自己的引用账。 */
export async function legacyWhiteboardReferenceCounts(pages: readonly { data: string }[]) {
  const builtin = await prepareBuiltinWhiteboardTypes();
  const references: { kind: "whiteboard-content" | "data-table"; id: number }[] = [];
  const reference = (node: Record<string, unknown>) => {
    const kind =
      node.type === "whiteboard"
        ? "whiteboard-content"
        : node.type === "database"
          ? "data-table"
          : null;
    const id = kind === "whiteboard-content" ? node.whiteBoardContentId : node.tableId;
    if (kind && Number.isSafeInteger(id) && Number(id) > 0)
      references.push({ kind, id: Number(id) });
  };
  const body = (nodes: unknown) => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      reference(node);
      body(node.children);
      if (node.type === "list-item" && node.isFold === true && Array.isArray(node.allContent))
        body(node.allContent.slice(1));
    }
  };
  const canvas = (nodes: unknown) => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      reference(node);
      if (node.contentId === undefined && node.entityRef === undefined) {
        let value: unknown = node;
        const property = builtin.types[String(node.type)]?.bodyProperty;
        for (const part of property?.split(".") ?? [])
          value =
            value && typeof value === "object"
              ? (value as Record<string, unknown>)[part]
              : undefined;
        if (property) body(value);
      }
      canvas(node.children);
    }
  };
  for (const page of pages) canvas(JSON.parse(page.data).children);
  return references;
}

/** 打开旧 JSON 白板页时自愈调用；缺少历史定义的元素保留原载荷，不运行已安装插件的迁移。 */
export async function convertLegacyWhiteboard(
  pages: readonly LegacyWhiteboardPage[],
  context: LegacyWhiteboardContext
) {
  const builtin = await prepareBuiltinWhiteboardTypes();
  const opaque = await prepareWhiteboardContract("host.whiteboard.recovery", {
    type: "host.whiteboard.recovery",
    dataVersion: 1,
    structure: { container: "free", joins: ["layout"], reference: "entity" },
  });
  const contracts: Record<string, import("@tau/db-schema/content-contracts").DataContract> = {};
  const issues: {
    pageId: string;
    nodeId: string;
    reason: string;
    frameId?: string;
    previousId?: string;
  }[] = [];
  const mapping: { pageId: string; path: number[]; previousId: unknown; id: string }[] = [];
  const views = pages.map(page => ({
    pageId: page.id,
    selection: page.data.selection ?? null,
    viewPort: page.data.viewPort ?? null,
  }));
  const counts = new Map<string, number>();
  const count = (nodes: Record<string, unknown>[], depth = 0) => {
    if (!Array.isArray(nodes) || depth > 64) throw new Error("旧白板结构无效或超深");
    for (const node of nodes) {
      if (!node || typeof node !== "object" || Array.isArray(node))
        throw new Error("旧白板节点无效");
      if (typeof node.id === "string") counts.set(node.id, (counts.get(node.id) ?? 0) + 1);
      if (node.children !== undefined) count(node.children as Record<string, unknown>[], depth + 1);
    }
  };
  pages.forEach(page => {
    if (page.data.version !== undefined && page.data.version !== 1 && page.data.version !== 2)
      throw new Error("旧白板版本无法识别");
    count(page.data.children);
  });
  const identities = new Map(
    [...counts]
      .filter(([, count]) => count === 1)
      .map(([id]) => [id, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(id) ? id : randomUUID()])
  );
  const resourceRefs = new Set<string>();
  const resources = async (
    payload: Record<string, unknown>,
    declaration: Parameters<typeof contentResourceSlots>[1]
  ) => {
    const mapped = new Map<string, string>();
    for (const slot of contentResourceSlots(payload, declaration))
      for (const ref of contentResourceValues(slot)) {
        const next = await context.mapResource(ref);
        mapped.set(ref, next);
        resourceRefs.add(next);
      }
    return mapNodeResources(payload, declaration, ref => mapped.get(ref));
  };
  const visit = async (
    source: Record<string, unknown>,
    pageId: string,
    path: number[]
  ): Promise<TransferElement> => {
    const id =
      typeof source.id === "string" ? (identities.get(source.id) ?? randomUUID()) : randomUUID();
    mapping.push({ pageId, path, previousId: source.id ?? null, id });
    const points =
      source.type === "arrow" && Array.isArray(source.points)
        ? (source.points as { x: number; y: number }[])
        : [];
    const bounds =
      points.length > 0 &&
      points.every(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))
        ? {
            x: Math.min(...points.map(point => point.x)),
            y: Math.min(...points.map(point => point.y)),
            width:
              Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x)),
            height:
              Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y)),
          }
        : undefined;
    const geometry = Object.fromEntries(
      ["x", "y", "width", "height", "rotation"].map(key => [
        key,
        source[key] ?? (key === "rotation" ? 0 : bounds?.[key as keyof typeof bounds]),
      ])
    ) as unknown as TransferElement["geometry"];
    const children = await Promise.all(
      ((source.children ?? []) as Record<string, unknown>[]).map((node, index) =>
        visit(node, pageId, [...path, index])
      )
    );
    const pluginContract = Object.entries(context.editorContracts).flatMap(([id, contract]) =>
      contract.domain === "whiteboard-element" &&
      contract.owner === "taunote.stickman" &&
      contract.type === source.type &&
      contract.dataVersion === 1
        ? [{ id, contract }]
        : []
    )[0];
    const codec: (typeof builtin.types)[string] | undefined =
      builtin.types[String(source.type)] ??
      (pluginContract ? { contractId: pluginContract.id } : undefined);
    const declaration =
      builtin.prepared.find(entry => entry.id === codec?.contractId) ?? pluginContract;
    const retain = (reason: string, entity?: ContentEntityReference): TransferElement => {
      contracts[opaque.id] = opaque.contract;
      issues.push({ pageId, nodeId: id, reason });
      const { children: _children, ...original } = source;
      return {
        id,
        type: opaque.contract.type,
        contractId: opaque.id,
        geometry,
        style: {},
        data: { original: structuredClone(original) as DataJson },
        children,
        ...(entity ? { entity } : {}),
      };
    };
    if (
      !declaration ||
      (source.schemaVersion !== undefined && (!pluginContract || source.schemaVersion !== 1)) ||
      (source.dataVersion !== undefined && (!pluginContract || source.dataVersion !== 1))
    )
      return retain("unknown-legacy-contract");
    if (
      source.type === "arrow" &&
      [source.source, source.target].some(
        end =>
          end &&
          typeof end === "object" &&
          typeof (end as { bindId?: unknown }).bindId === "string" &&
          counts.get((end as { bindId: string }).bindId) !== 1
      )
    )
      return retain("ambiguous-connection");
    let body: unknown = source;
    for (const part of codec.bodyProperty?.split(".") ?? [])
      body = body && typeof body === "object" ? (body as Record<string, unknown>)[part] : undefined;
    let entity: ContentEntityReference | undefined;
    const localRef = source.entityRef as { kind?: ContentEntityKind; id?: number } | undefined;
    const kind =
      localRef?.kind ??
      (source.type === "video"
        ? "video-note"
        : source.type === "whiteboard"
          ? "whiteboard-content"
          : "content");
    const localId =
      localRef?.id ?? source.videoNoteId ?? source.whiteBoardContentId ?? source.contentId;
    if (localId !== undefined) {
      if (!Number.isSafeInteger(localId)) return retain("invalid-entity-reference");
      entity = context.resolveEntity(kind, localId as number) ?? undefined;
      if (!entity) return retain("missing-entity");
      if (source.type === "richtext") {
        if (entity.kind !== "content") return retain("invalid-entity-reference", entity);
        // 独立正文继续由原会话持有，画布缓存不能变成另一份可编辑正文。
        body = [];
      } else if (declaration.contract.structure.reference !== "entity")
        return retain("external-content-retained", entity);
    }
    const data: Record<string, unknown> = structuredClone(
      (source.data ?? {}) as Record<string, unknown>
    );
    const excluded = new Set([
      "id",
      "type",
      "children",
      "x",
      "y",
      "width",
      "height",
      "rotation",
      "style",
      "name",
      "data",
      "entityRef",
      "contentId",
      "videoNoteId",
      "whiteBoardContentId",
      "schemaVersion",
      "dataVersion",
      ...(codec.transientProperties ?? []),
    ]);
    for (const [key, value] of Object.entries(source))
      if (!excluded.has(key)) data[key] = structuredClone(value);
    if (source.type === "arrow")
      for (const key of ["source", "target"]) {
        const end = data[key] as { bindId?: unknown } | undefined;
        if (end && typeof end.bindId === "string" && identities.has(end.bindId))
          data[key] = { ...end, bindId: identities.get(end.bindId)! };
      }
    if (codec.bodyProperty) {
      const parts = codec.bodyProperty.split(".");
      let cursor = data;
      for (const part of parts.slice(0, -1)) cursor = cursor[part] as Record<string, unknown>;
      if (cursor) delete cursor[parts.at(-1)!];
    }
    for (const field of declaration.contract.textFields)
      if (data[field] === undefined) data[field] = "";
    let convertedBody: ContentNode[] | undefined;
    if (codec.bodyProperty) {
      if (source.type === "arrow" && body === undefined) body = [];
      if (!Array.isArray(body)) return retain("missing-or-invalid-body");
      const converted = await context.repairBody(body);
      Object.assign(contracts, converted.contracts);
      const mapBody = async (node: ContentNode): Promise<ContentNode> => ({
        ...(await resources(node, converted.contracts[String(node.tauContract)]?.resources)),
        ...(node.children ? { children: await Promise.all(node.children.map(mapBody)) } : {}),
      });
      convertedBody = await Promise.all(converted.content.map(mapBody));
    }
    contracts[declaration.id] = declaration.contract;
    return {
      id,
      type: declaration.contract.type,
      contractId: declaration.id,
      geometry,
      style: (source.style ?? {}) as TransferElement["style"],
      data: (await resources(data, declaration.contract.resources)) as TransferElement["data"],
      children,
      ...(typeof source.name === "string" ? { name: source.name } : {}),
      ...(convertedBody ? { body: convertedBody } : {}),
      ...(entity ? { entity } : {}),
    };
  };
  const bundle: WhiteboardTransfer = {
    format: "whiteboard-transfer-v1",
    sourceDocumentId: context.documentId,
    title: context.title,
    pages: [],
    contracts,
    resources: [],
    presentations: [],
  };
  for (const page of pages) {
    bundle.pages.push({
      id: page.id,
      title: page.title,
      elements: await Promise.all(
        page.data.children.map((node, index) => visit(node, page.id, [index]))
      ),
      ...(page.data.sketch
        ? { sketch: page.data.sketch as WhiteboardTransfer["pages"][number]["sketch"] }
        : {}),
    });
  }
  // 所有页面先完成换号，演示才能引用后续页面的元素。
  const references = new Map<string, typeof mapping>();
  for (const entry of mapping) {
    if (typeof entry.previousId !== "string") continue;
    const candidates = references.get(entry.previousId) ?? [];
    candidates.push(entry);
    references.set(entry.previousId, candidates);
  }
  for (const page of pages) {
    if (Array.isArray(page.data.presentationSequences))
      for (const sequence of page.data
        .presentationSequences as WhiteboardTransfer["presentations"]) {
        if (bundle.presentations.some(value => value.id === sequence.id))
          throw new Error("旧演示身份重复，须先确认归属");
        bundle.presentations.push({
          ...structuredClone(sequence),
          frames: sequence.frames.map(frame => {
            const occurrences = new Map<string, number>();
            for (const id of frame.elements) occurrences.set(id, (occurrences.get(id) ?? 0) + 1);
            const resolved = new Map<string, { ids: string[]; next: number }>();
            for (const [id, count] of occurrences) {
              const all = references.get(id) ?? [];
              const local = all.filter(entry => entry.pageId === page.id);
              const candidates = local.length ? local : all;
              if (candidates.length === 1 || (candidates.length > 1 && candidates.length === count))
                resolved.set(id, { ids: candidates.map(entry => entry.id), next: 0 });
              else
                issues.push({
                  pageId: page.id,
                  nodeId: sequence.id,
                  frameId: frame.id,
                  previousId: id,
                  reason: candidates.length
                    ? "ambiguous-presentation-reference"
                    : "missing-presentation-reference",
                });
            }
            return {
              ...structuredClone(frame),
              elements: [
                ...new Set(
                  frame.elements.flatMap(id => {
                    const target = resolved.get(id);
                    if (!target) return [];
                    return [target.ids[target.ids.length === 1 ? 0 : target.next++]];
                  })
                ),
              ],
            };
          }),
        });
      }
  }
  bundle.resources = [...resourceRefs].sort();
  const doc = await createWhiteboardBaseline(bundle);
  return { doc, bundle, issues, mapping, views };
}
