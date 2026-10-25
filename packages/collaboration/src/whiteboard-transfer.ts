import {
  prepareContentContract,
  prepareWhiteboardContract,
  validateContentContracts,
  NODE_CONTRACT_PROPERTY,
  type DataContract,
  type PreparedContentContract,
  type PreparedWhiteboardContract,
} from "@tau/db-schema/content-contracts";
import {
  contentResourceSlots,
  contentResourceValues,
  mapNodeResources,
} from "@tau/db-schema/content-resources";
import { collectWhiteboardDocumentResources } from "./whiteboard-document";
import { isSafeResource } from "./resource-policy";
import { assertWhiteboardJson } from "./whiteboard-contract";
import { NODE_TREE_LIMITS } from "./model-limits";
import type { ContentNode } from "./protocol";
import type { WhiteboardModel } from "./whiteboard-model";
import type { WhiteboardElementSnapshot, WhiteboardModelCommand } from "./whiteboard-types";

import type { TransferElement, WhiteboardTransfer } from "./whiteboard-types";
export type { TransferElement, WhiteboardTransfer } from "./whiteboard-types";
const flatten = (nodes: readonly TransferElement[]): TransferElement[] =>
  nodes.flatMap(node => [node, ...flatten(node.children)]);
function validBase64(value: string): boolean {
  if (value.length % 4 || /[^A-Za-z0-9+/=]/.test(value)) return false;
  const padding = value.indexOf("=");
  return (
    padding < 0 ||
    padding === value.length - 1 ||
    (padding === value.length - 2 && value.endsWith("=="))
  );
}
function textChunks(value: string): { offset: number; text: string }[] {
  const result: { offset: number; text: string }[] = [];
  let offset = 0;
  while (offset < value.length) {
    let end = Math.min(value.length, offset + 16384);
    if (
      end < value.length &&
      /[\uD800-\uDBFF]/.test(value[end - 1]) &&
      /[\uDC00-\uDFFF]/.test(value[end])
    )
      end--;
    result.push({ offset, text: value.slice(offset, end) });
    offset = end;
  }
  return result;
}
export function whiteboardTransferResources(
  bundle: Pick<WhiteboardTransfer, "pages" | "contracts">
): string[] {
  const refs = new Set<string>();
  const scan = (payload: unknown, contract: DataContract) => {
    for (const slot of contentResourceSlots(payload, contract.resources))
      for (const value of contentResourceValues(slot)) refs.add(value);
  };
  const body = (node: ContentNode) => {
    const contract = bundle.contracts[String(node[NODE_CONTRACT_PROPERTY])];
    if (contract) scan(node, contract);
    node.children?.forEach(body);
  };
  for (const node of flatten(bundle.pages.flatMap(page => page.elements))) {
    const contract = bundle.contracts[node.contractId];
    if (!contract || contract.domain !== "whiteboard-element" || contract.type !== node.type)
      throw new Error("白板包缺少精确契约");
    scan(node.data, contract);
    if (Array.isArray(node.body)) node.body.forEach(body);
  }
  return [...refs].sort();
}
export function exportWhiteboardTransfer(
  model: WhiteboardModel,
  sourceDocumentId: string,
  elementIds?: readonly string[],
  scope: { pageIds?: readonly string[]; includeRecovery?: boolean } = {}
): WhiteboardTransfer {
  const selected = elementIds && new Set(elementIds),
    contracts: Record<string, DataContract> = {};
  const used = (id: string) => {
    const contract = model.contracts.get(id);
    if (!contract) throw new Error("导出契约缺失");
    contracts[id] = contract;
  };
  const body = (value: ContentNode) => {
    if (typeof value[NODE_CONTRACT_PROPERTY] === "string")
      used(value[NODE_CONTRACT_PROPERTY] as string);
    value.children?.forEach(body);
  };
  const convert = (node: WhiteboardElementSnapshot): TransferElement => {
    used(node.contractId);
    if (Array.isArray(node.body)) node.body.forEach(body);
    const { fieldBindings: _fields, recoveryReason: _recovery, children, ...value } = node;
    return { ...value, children: children.map(convert) };
  };
  const pick = (nodes: readonly WhiteboardElementSnapshot[]): TransferElement[] =>
    nodes.flatMap(node =>
      !selected || selected.has(node.id) ? [convert(node)] : pick(node.children)
    );
  const snapshot = model.read();
  if (snapshot.recovery.length && !selected && !scope.pageIds)
    throw new Error("白板仍有未确认页面归属的元素，请先处理恢复区再完整导出");
  const pages = snapshot.pages
    .filter(page => !scope.pageIds || scope.pageIds.includes(page.id))
    .map(page => ({
      id: page.id,
      title: page.title,
      ...(page.sketch ? { sketch: page.sketch } : {}),
      elements: pick([...page.children, ...(scope.includeRecovery === false ? [] : page.recovery)]),
    }))
    .filter(page => !selected || page.elements.length);
  const copied = new Set(flatten(pages.flatMap(page => page.elements)).map(node => node.id));
  const bundle: WhiteboardTransfer = {
    format: "whiteboard-transfer-v1",
    sourceDocumentId,
    title: snapshot.title,
    pages,
    contracts,
    resources: [],
    presentations: (snapshot.presentations ?? [])
      .map(sequence => ({
        ...sequence,
        frames: sequence.frames
          .map(frame => ({ ...frame, elements: frame.elements.filter(id => copied.has(id)) }))
          .filter(frame => frame.elements.length),
      }))
      .filter(sequence => sequence.frames.length),
  };
  bundle.resources = whiteboardTransferResources(bundle);
  if (bundle.resources.some(ref => !isSafeResource(ref)))
    throw new Error("资源尚未托管，不能把本机路径放入白板包");
  return structuredClone(bundle);
}
export async function prepareWhiteboardTransfer(
  model: WhiteboardModel,
  bundle: WhiteboardTransfer,
  options: {
    pageId?: string;
    targetDocumentId: string;
    knownContractIds?: ReadonlySet<string>;
    baseline?: boolean;
    importResource?: (reference: string, sourceDocumentId: string) => Promise<string>;
  }
) {
  if (
    !bundle ||
    typeof bundle !== "object" ||
    Array.isArray(bundle) ||
    bundle.format !== "whiteboard-transfer-v1" ||
    typeof bundle.title !== "string" ||
    typeof bundle.sourceDocumentId !== "string" ||
    !Array.isArray(bundle.pages) ||
    !Array.isArray(bundle.resources) ||
    !Array.isArray(bundle.presentations) ||
    (bundle.assets !== undefined && !Array.isArray(bundle.assets))
  )
    throw new Error("白板包格式不支持");
  assertWhiteboardJson(bundle, -4 * NODE_TREE_LIMITS.depth - 8);
  if (new TextEncoder().encode(JSON.stringify(bundle)).byteLength > 32 * 1024 * 1024)
    throw new Error("白板包超过文件预算");
  const assetIds = new Set<string>();
  let assetBytes = 0;
  for (const asset of bundle.assets ?? []) {
    if (
      !asset ||
      typeof asset !== "object" ||
      Object.keys(asset).some(key => !["reference", "name", "mime", "base64"].includes(key)) ||
      typeof asset.reference !== "string" ||
      !/^tau-collab-(asset|local):/.test(asset.reference) ||
      !bundle.resources.includes(asset.reference) ||
      assetIds.has(asset.reference) ||
      typeof asset.name !== "string" ||
      typeof asset.mime !== "string" ||
      typeof asset.base64 !== "string" ||
      !validBase64(asset.base64)
    )
      throw new Error("资源包内容无效或重复");
    assetBytes +=
      (asset.base64.length / 4) * 3 -
      (asset.base64.endsWith("==") ? 2 : asset.base64.endsWith("=") ? 1 : 0);
    if (assetBytes > 16 * 1024 * 1024) throw new Error("白板包资源超过预算");
    assetIds.add(asset.reference);
  }
  if (
    Object.keys(bundle).some(
      key =>
        ![
          "format",
          "sourceDocumentId",
          "title",
          "pages",
          "contracts",
          "resources",
          "presentations",
          "assets",
        ].includes(key)
    )
  )
    throw new Error("白板包包含未知信封字段");
  const checkTree = (nodes: readonly TransferElement[], depth: number) => {
    if (!Array.isArray(nodes) || depth > NODE_TREE_LIMITS.depth + 1)
      throw new Error("白板包结构超过层级预算");
    for (const node of nodes) {
      if (
        depth > NODE_TREE_LIMITS.depth ||
        Object.keys(node).some(
          key =>
            ![
              "id",
              "type",
              "contractId",
              "name",
              "geometry",
              "style",
              "data",
              "body",
              "entity",
              "children",
            ].includes(key)
        )
      )
        throw new Error("白板包节点结构无效");
      assertWhiteboardJson(node.data);
      assertWhiteboardJson(node.style);
      assertWhiteboardJson(node.geometry);
      checkTree(node.children, depth + 1);
    }
  };
  for (const page of bundle.pages) checkTree(page.elements, 1);
  await validateContentContracts(bundle.contracts);
  const refs = whiteboardTransferResources(bundle);
  if (JSON.stringify(refs) !== JSON.stringify([...bundle.resources].sort()))
    throw new Error("资源清单不完整");
  if (options.baseline && (model.pages.size || model.elements.size || model.title.length))
    throw new Error("基线候选只能构建到空文档");
  const mapped = new Map<string, string>(),
    owned = new Set(collectWhiteboardDocumentResources(model.doc));
  for (const ref of refs) {
    if (!isSafeResource(ref)) throw new Error("白板包包含本机路径");
    if (
      /^tau-collab-(asset|local):/.test(ref) &&
      !(
        options.baseline ||
        (bundle.sourceDocumentId !== "" &&
          bundle.sourceDocumentId === options.targetDocumentId &&
          owned.has(ref))
      )
    ) {
      if (!options.importResource) throw new Error("资源须先按目标文档权限导入，原内容未改变");
      const target = await options.importResource(ref, bundle.sourceDocumentId);
      if (!target || !isSafeResource(target) || target === ref)
        throw new Error("跨文档资源导入未完成");
      mapped.set(ref, target);
    }
  }
  const prepared: (PreparedContentContract | PreparedWhiteboardContract)[] = [];
  for (const [id, contract] of Object.entries(bundle.contracts)) {
    const value =
      contract.domain === "whiteboard-element"
        ? await prepareWhiteboardContract(contract.owner, {
            type: contract.type,
            dataVersion: contract.dataVersion,
            resources: contract.resources,
            structure: contract.structure,
            collaboration: { textFields: contract.textFields },
          })
        : await prepareContentContract(contract.owner, {
            type: contract.type,
            dataVersion: contract.dataVersion,
            resources: contract.resources,
            kind: contract.kind,
            isVoid: contract.isVoid,
            collaboration: { textFields: contract.textFields },
          });
    if (value.id !== id) throw new Error("白板包契约摘要不匹配");
    prepared.push(value);
  }
  const ids = new Map<string, string>(),
    groups = new Map<string, string>();
  for (const node of flatten(bundle.pages.flatMap(page => page.elements))) {
    if (ids.has(node.id)) throw new Error("白板包存在重复元素身份");
    ids.set(node.id, options.baseline ? node.id : crypto.randomUUID());
  }
  const commands: WhiteboardModelCommand[] = [];
  const scalarText = (type: "edit_title" | "edit_page_title", value: string, id?: string) => {
    for (const { offset, text } of textChunks(value)) {
      const edit = { offset, remove: 0, text };
      commands.push(type === "edit_title" ? { type, edit } : { type, id: id!, edit });
    }
  };
  if (!options.pageId && !model.read().title && typeof bundle.title === "string")
    scalarText("edit_title", bundle.title);
  const initialBodies: { id: string; preserveIds?: boolean; body: ContentNode[] }[] = [];
  const textCommands = (id: string, field: string | null, value: string) => {
    for (const { offset, text } of textChunks(value))
      commands.push({ type: "edit_text", id, field, edit: { offset, remove: 0, text } });
  };
  const body = (node: ContentNode): ContentNode => {
    const contract = bundle.contracts[String(node[NODE_CONTRACT_PROPERTY])];
    const value = contract
      ? mapNodeResources(node, contract.resources, ref => mapped.get(ref))
      : { ...node };
    const { collabId: _id, ...copied } = value;
    if (options.baseline && typeof _id === "string") copied.collabId = _id;
    return { ...copied, ...(node.children ? { children: node.children.map(body) } : {}) };
  };
  const create = (node: TransferElement, parent: { kind: "page" | "element"; id: string }) => {
    const contract = bundle.contracts[node.contractId];
    let data: Record<string, import("@tau/db-schema/content-contracts").DataJson> = {
      ...mapNodeResources(node.data, contract.resources, ref => mapped.get(ref)),
    };
    if (
      !options.baseline &&
      contract.owner === "host.whiteboard" &&
      options.knownContractIds?.has(node.contractId)
    ) {
      data = { ...data };
      if (typeof data.groupId === "string") {
        if (!groups.has(data.groupId)) groups.set(data.groupId, crypto.randomUUID());
        data.groupId = groups.get(data.groupId)!;
      }
      if (node.type === "arrow")
        for (const key of ["source", "target"]) {
          const end = data[key] as Record<string, unknown> | undefined;
          if (!end || typeof end.bindId !== "string") continue;
          const target = ids.get(end.bindId);
          if (target) data[key] = { ...end, bindId: target } as never;
          else if (
            !bundle.sourceDocumentId ||
            bundle.sourceDocumentId !== options.targetDocumentId
          ) {
            const { bindId: _bind, connectId: _connect, customOffset: _offset, ...fallback } = end;
            data[key] = fallback as never;
          }
        }
    }
    const id = ids.get(node.id)!;
    commands.push({
      type: "create",
      id,
      contractId: node.contractId,
      data: {},
      geometry: node.geometry,
      parent,

      ...(node.entity ? { entity: node.entity } : {}),
    });
    for (const [key, value] of Object.entries(data)) {
      if (contract.textFields.includes(key)) {
        if (typeof value !== "string") throw new Error("白板文本无效");
        textCommands(id, key, value);
      } else commands.push({ type: "set_data", id, patch: { [key]: value } });
    }
    if (Array.isArray(node.body))
      initialBodies.push({ id, body: node.body.map(body), preserveIds: options.baseline });
    else if (typeof node.body === "string") textCommands(id, null, node.body);
    if (node.name !== undefined)
      commands.push({ type: "set_node", id, patch: { name: node.name } });
    for (const [key, value] of Object.entries(node.style))
      commands.push({ type: "set_node", id, patch: { style: { [key]: value } } });
    node.children.forEach(child => create(child, { kind: "element", id }));
  };
  for (const page of bundle.pages) {
    const id = options.pageId ?? (options.baseline ? page.id : crypto.randomUUID());
    if (!options.pageId) {
      commands.push({ type: "create_page", id, title: "" });
      scalarText("edit_page_title", page.title, id);
      if (page.sketch) commands.push({ type: "set_page_sketch", id, sketch: page.sketch });
    }
    page.elements.forEach(node => create(node, { kind: "page", id }));
  }
  if (bundle.presentations.length) {
    const before = model.read().presentations ?? [];
    const copies = bundle.presentations.map(sequence => ({
      ...sequence,
      id: options.baseline ? sequence.id : crypto.randomUUID(),
      frames: sequence.frames.map(frame => ({
        id: options.baseline ? frame.id : crypto.randomUUID(),
        elements: frame.elements.map(id => {
          const mapped = ids.get(id);
          if (!mapped) throw new Error("演示引用超出复制范围");
          return mapped;
        }),
      })),
    }));
    commands.push({ type: "set_presentation", before, after: [...before, ...copies] });
  }
  if (!commands.length) throw new Error("白板包没有可导入内容");
  model.preflight(candidate => candidate.submitChunks(commands, null, prepared, initialBodies));
  return { commands, prepared, ids, initialBodies };
}
