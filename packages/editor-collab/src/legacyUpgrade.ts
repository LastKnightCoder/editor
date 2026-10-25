import type { ContentNode } from "@tau/collaboration";
import { convertLegacyCodeBlock } from "@tau/editor/extensions/code-block/migration";
import {
  prepareContentContract,
  type ContentContract,
  type ContentContractDictionary,
} from "@tau/db-schema/content-contracts";
import { validateContentContracts } from "@tau/db-schema/content-contracts";
import {
  CONTENT_ENTITY_NODE_CONTRACTS,
  type ContentEntityKind,
  type ContentEntityReference,
} from "@tau/db-schema/content-identities";

export interface LegacyUpgradeResult {
  content: ContentNode[];
  contracts: ContentContractDictionary;
  views: { nodeId: string; owner: string; value: Record<string, unknown> }[];
  issues: { nodeId: string; reason: string }[];
}

/** 隔离升级入口：无法证明旧规格时保留原始载荷，不用已安装插件猜测其合并语义。 */
export async function convertLegacyContent(
  input: readonly ContentNode[],
  available: ContentContractDictionary,
  options: {
    shared: boolean;
    privateNodes?: ReadonlyMap<string, ContentNode>;
    publishPrivate?: ReadonlySet<string>;
    resolveEntity(kind: ContentEntityKind, localId: number): ContentEntityReference | null;
    createIdentity?: () => string;
  }
): Promise<LegacyUpgradeResult> {
  const dictionary = await validateContentContracts(available);
  const definitions = new Map<string, { id: string; contract: ContentContract }>();
  for (const [id, contract] of Object.entries(dictionary)) {
    if (contract.domain !== "editor-node" || !/^(tau|host)\./.test(contract.owner)) continue;
    const previous = definitions.get(contract.type);
    if (!previous || contract.dataVersion > previous.contract.dataVersion)
      definitions.set(contract.type, { id, contract });
  }
  const opaque = await prepareContentContract("tau.recovery", {
    type: "tau.recovery",
    dataVersion: 1,
    kind: "block",
    isVoid: true,
  });
  const contracts: Record<string, ContentContract> = {};
  const result: LegacyUpgradeResult = { content: [], contracts, views: [], issues: [] };
  const identities = new Set<string>();
  const createIdentity = options.createIdentity ?? (() => crypto.randomUUID());
  const counts = new Map<string, number>();
  const count = (nodes: readonly ContentNode[]) => {
    for (const node of nodes) {
      if (typeof node?.collabId === "string")
        counts.set(node.collabId, (counts.get(node.collabId) ?? 0) + 1);
      if (Array.isArray(node?.children)) count(node.children);
    }
  };
  count(input);
  const identity = (node: ContentNode) => {
    const id =
      typeof node.collabId === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(node.collabId) &&
      !identities.has(node.collabId)
        ? node.collabId
        : createIdentity();
    if (!id || identities.has(id)) throw new Error("升级生成的节点身份重复");
    identities.add(id);
    return id;
  };
  const retain = (node: ContentNode, id: string, reason: string): ContentNode => {
    contracts[opaque.id] = opaque.contract;
    result.issues.push({ nodeId: id, reason });
    return {
      type: opaque.contract.type,
      collabId: id,
      tauContract: opaque.id,
      reason,
      original: structuredClone(node),
      children: [{ text: "" }],
    };
  };
  const visit = (source: ContentNode, depth: number): ContentNode => {
    if (depth > 64 || !source || typeof source !== "object" || Array.isArray(source))
      throw new Error("旧正文结构无效");
    if (typeof source.text === "string" && !Array.isArray(source.children))
      return structuredClone(source);
    const id = identity(source);
    let node = structuredClone(source);
    if (node.type === "collaboration-placeholder") {
      const originalId = typeof source.collabId === "string" ? source.collabId : "";
      const original =
        counts.get(originalId) === 1 ? options.privateNodes?.get(originalId) : undefined;
      if (original && (!options.shared || options.publishPrivate?.has(originalId)))
        node = structuredClone(original);
      else
        return retain(
          {
            type: "collaboration-placeholder",
            collabId: originalId,
            label: typeof source.label === "string" ? source.label : "旧组件",
            children: [{ text: "" }],
          },
          id,
          "private-body-unavailable"
        );
    }
    const definition = definitions.get(String(node.type));
    if (!definition || !Array.isArray(node.children))
      return retain(node, id, "unknown-legacy-contract");
    const { contract } = definition;
    if (
      contract.dataVersion !== 1 &&
      !(
        contract.owner === "tau.code-block" &&
        contract.type === "code-block" &&
        contract.dataVersion === 2
      )
    )
      return retain(node, id, "unsupported-legacy-version");
    if (contract.type === "code-block" && contract.owner === "tau.code-block") {
      if (contract.dataVersion !== 2 || !definitions.has("code-step"))
        throw new Error("代码步骤升级定义尚未就绪");
      try {
        const converted = convertLegacyCodeBlock(node, createIdentity);
        node = converted.element as unknown as ContentNode;
        result.views.push({ nodeId: id, owner: contract.owner, value: { ...converted.view } });
        for (const conflict of converted.recovery) {
          node.recoveredRootSource = conflict.code;
          result.issues.push({ nodeId: id, reason: conflict.reason });
        }
      } catch {
        return retain(source, id, "invalid-legacy-code");
      }
    }
    const entity = CONTENT_ENTITY_NODE_CONTRACTS[contract.type];
    if (entity && entity.owner === contract.owner) {
      const field =
        entity.kind === "whiteboard-content"
          ? "whiteBoardContentId"
          : entity.kind === "data-table"
            ? "tableId"
            : "projectItemId";
      const localId = node[field];
      if (!Number.isSafeInteger(localId)) return retain(node, id, "invalid-entity-reference");
      const reference = options.resolveEntity(entity.kind, localId as number);
      if (!reference) return retain(node, id, "missing-entity");
      node.entityRef = reference;
      delete node[field];
    }
    if (contract.owner === "tau.list-item" && contract.type === "list-item") {
      if (node.isFold === true) {
        if (!Array.isArray(node.allContent)) return retain(source, id, "invalid-folded-list");
        node.children = [...node.children!, ...(node.allContent.slice(1) as ContentNode[])];
      }
      delete node.allContent;
    }
    const view: Record<string, unknown> = {};
    const viewFields =
      contract.owner === "tau.tabs" && contract.type === "tabs"
        ? ["activeKey"]
        : contract.owner === "tau.list-item" && contract.type === "list-item"
          ? ["isFold"]
          : [];
    for (const field of viewFields)
      if (Object.hasOwn(node, field)) {
        view[field] = node[field];
        delete node[field];
      }
    if (Object.keys(view).length)
      result.views.push({ nodeId: id, owner: contract.owner, value: view });
    if (contract.owner === "tau.typst" && contract.type === "typst") {
      if (typeof node.content !== "string" || !node.content.trim()) {
        if (typeof node.html === "string" && node.html.trim())
          return retain(source, id, "compiled-preview-without-source");
      } else for (const field of ["html", "compiledFrom", "compiledAt"]) delete node[field];
    }
    if (
      contract.owner === "tau.mermaid" &&
      contract.type === "mermaid" &&
      typeof node.chart === "string" &&
      node.chart.trim()
    )
      for (const field of ["svg", "compiledFrom", "compiledAt"]) delete node[field];
    for (const field of contract.textFields) {
      if (node[field] === undefined) node[field] = "";
      else if (typeof node[field] !== "string") return retain(source, id, "invalid-source-field");
    }
    contracts[definition.id] = contract;
    return {
      ...node,
      collabId: id,
      tauContract: definition.id,
      children: node.children!.map(child => visit(child, depth + 1)),
    };
  };
  result.content = input.map(node => visit(node, 0));
  await validateContentContracts(contracts);
  return result;
}
