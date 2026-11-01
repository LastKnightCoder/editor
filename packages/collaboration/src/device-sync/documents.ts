import * as Y from "yjs";
import {
  createContentMetrics,
  normalizeContentMetricRules,
  type ContentMetricRule,
} from "@tau/db-schema/content-metrics";
import { mapNodeResources } from "@tau/db-schema/content-resources";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import { canonicalContractJson } from "@tau/db-schema/content-contracts";
import { applyNodeDocumentUpdate, readNodeDocument, validateNodeDocument } from "../node-document";
import { base64ToBytes, bytesToBase64 } from "../encoding";
import type { DeviceDocument, PreparedDeviceDocument } from "./protocol";

export function combineDeviceMetrics(
  previous: readonly ContentMetricRule[] = [],
  incoming: readonly ContentMetricRule[] = [],
  preferIncoming = false
) {
  const rules = new Map<string, ContentMetricRule>();
  for (const rule of preferIncoming ? [...previous, ...incoming] : [...incoming, ...previous])
    rules.set(rule.type, rule);
  return normalizeContentMetricRules(
    [...rules.values()].sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : 0))
  );
}
export function deviceMetricsForContracts(
  contracts: ContentContractDictionary,
  rules: readonly ContentMetricRule[] = []
) {
  const byType = new Map<string, ContentMetricRule>();
  for (const contract of Object.values(contracts)) {
    const old = byType.get(contract.type);
    byType.set(contract.type, {
      type: contract.type,
      textFields: [...new Set([...(old?.textFields ?? []), ...contract.textFields])],
    });
  }
  return combineDeviceMetrics(
    [...byType.values()],
    rules.filter(rule => byType.has(rule.type)),
    true
  );
}
export const deviceDocumentIdentity = (entry: DeviceDocument) => ({
  documentId: entry.documentId,
  baselineId: entry.baselineId,
  epoch: entry.epoch,
});
export function restoreDeviceDocument(entry: DeviceDocument): Y.Doc {
  if (typeof entry.state !== "string" || entry.state.length > 12 * 1024 * 1024)
    throw new Error("DEVICE_SYNC_DOCUMENT_BUDGET: 正文超过同步预算");
  const doc = new Y.Doc({ gc: false });
  try {
    Y.applyUpdate(doc, base64ToBytes(entry.state));
    if (doc.store.pendingDs || doc.store.pendingStructs)
      throw new Error("DEVICE_SYNC_DOCUMENT_DEPENDENCY: 正文缺少前序状态");
    return doc;
  } catch (error) {
    doc.destroy();
    throw error;
  }
}
export async function prepareDeviceDocument(
  entry: DeviceDocument
): Promise<PreparedDeviceDocument> {
  if (
    !Number.isSafeInteger(entry.contentId) ||
    entry.contentId <= 0 ||
    !Number.isSafeInteger(entry.updatedAt) ||
    entry.updatedAt < 0
  )
    throw new Error("DEVICE_SYNC_DOCUMENT: 正文编号或时间无效");
  if (
    !entry.paths ||
    typeof entry.paths !== "object" ||
    Array.isArray(entry.paths) ||
    Object.entries(entry.paths).some(
      ([reference, path]) =>
        !/^tau-collab-local:[a-f0-9-]{36}$/.test(reference) ||
        typeof path !== "string" ||
        !/^~\/\.editor\/resources\/device-sync\/[a-f0-9]{64}\.(png|jpg|webp|gif|bin)$/.test(path)
    )
  )
    throw new Error("DEVICE_SYNC_ASSET_PATH: 正文资源映射无效");
  const doc = restoreDeviceDocument(entry);
  try {
    await validateNodeDocument(doc, deviceDocumentIdentity(entry));
    const value = readNodeDocument(doc);
    const contracts = doc.getMap("node-tree:contracts").toJSON() as ContentContractDictionary;
    const metricRules = deviceMetricsForContracts(contracts, entry.metricRules),
      metrics = createContentMetrics(metricRules);
    const visit = (nodes: typeof value.content): typeof value.content =>
      nodes.map(node =>
        Array.isArray(node.children)
          ? {
              ...mapNodeResources(
                node,
                contracts[String(node.tauContract)]?.resources,
                reference => entry.paths[reference] ?? reference
              ),
              children: visit(node.children),
            }
          : node
      );
    const content = visit(value.content);
    return {
      ...entry,
      metricRules,
      state: bytesToBase64(Y.encodeStateAsUpdate(doc)),
      projection: {
        content,
        contracts,
        title: value.title,
        count: metrics.count(content),
        contentJson: canonicalContractJson(content),
        contractsJson: canonicalContractJson(contracts),
      },
    };
  } finally {
    doc.destroy();
  }
}
export async function mergeDeviceDocument(
  local: DeviceDocument,
  incoming: DeviceDocument,
  preferIncomingMetrics = false
) {
  if (
    JSON.stringify(deviceDocumentIdentity(local)) !==
    JSON.stringify(deviceDocumentIdentity(incoming))
  )
    throw new Error("DEVICE_SYNC_BASELINE_CHANGED: 正文基线不同");
  for (const [reference, path] of Object.entries(incoming.paths))
    if (local.paths[reference] && local.paths[reference] !== path)
      throw new Error("DEVICE_SYNC_ASSET_ID_CHANGED: 同一资源身份指向不同文件");
  const doc = restoreDeviceDocument(local);
  let candidate: Y.Doc | undefined;
  try {
    candidate = await applyNodeDocumentUpdate(
      doc,
      base64ToBytes(incoming.state),
      deviceDocumentIdentity(local)
    );
    return prepareDeviceDocument({
      ...local,
      metricRules: combineDeviceMetrics(
        local.metricRules,
        incoming.metricRules,
        preferIncomingMetrics
      ),
      updatedAt: Math.max(local.updatedAt, incoming.updatedAt),
      paths: { ...local.paths, ...incoming.paths },
      state: bytesToBase64(Y.encodeStateAsUpdate(candidate)),
    });
  } finally {
    candidate?.destroy();
    doc.destroy();
  }
}
