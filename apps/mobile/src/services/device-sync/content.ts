import { mobileContentMetrics } from "../../app/plugins/content";
import * as Y from "yjs";
import {
  bytesToBase64,
  readDocumentIdentity,
  NodeTree,
  validateNodeDocument,
  base64ToBytes,
  LOCAL_ASSET_PREFIX,
  isSafeResource,
} from "@tau/collaboration";
import { applyNodeTreeContent } from "@tau/editor-collab";
import { mapNodeResources } from "@tau/db-schema/content-resources";
import {
  canonicalContractJson,
  type ContentContractDictionary,
} from "@tau/db-schema/content-contracts";
import type { ContentNode } from "@tau/collaboration";
import {
  combineDeviceMetrics,
  mergeDeviceDocument,
  prepareDeviceDocument,
} from "@tau/collaboration/src/device-sync/documents";
import type { DeviceDocument, DeviceJsonIntent } from "@tau/collaboration/src/device-sync/protocol";
import { assertContentWriteContext, type ContentWriteContext } from "../content-write-context";
import {
  deviceAsset,
  deviceStore,
  readDeviceContent,
  readRawDeviceContent,
  wakeDeviceSync,
  deviceSyncDatabase,
} from "./native";

const live = new Map<
  string,
  {
    contentId: number;
    name: string;
    entries: Set<(entry: DeviceDocument) => void>;
    flushers: Set<() => Promise<unknown>>;
  }
>();
const confirmed = new Map<string, Set<string>>();
const documentGenerations = new WeakMap<Y.Doc, string>();
const projectionHash = async (value: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
const keyOf = (contentId: number, name = deviceSyncDatabase()) => JSON.stringify([name, contentId]);
export async function consumeDeviceProjection(contentId: number, content: unknown[]) {
  const snapshots = confirmed.get(keyOf(contentId));
  return snapshots ? snapshots.delete(await projectionHash(canonicalContractJson(content))) : false;
}
export function registerDeviceContent(
  contentId: number,
  receive: (entry: DeviceDocument) => void,
  flush: () => Promise<unknown>
) {
  const name = deviceSyncDatabase(),
    key = keyOf(contentId, name),
    value = live.get(key) ?? {
      contentId,
      name,
      entries: new Set<(entry: DeviceDocument) => void>(),
      flushers: new Set<() => Promise<unknown>>(),
    };
  value.entries.add(receive);
  value.flushers.add(flush);
  live.set(key, value);
  return () => {
    value.entries.delete(receive);
    value.flushers.delete(flush);
    if (!value.entries.size) {
      live.delete(key);
      confirmed.delete(key);
    }
  };
}
export async function flushDeviceContent() {
  for (const value of live.values())
    if (value.name === deviceSyncDatabase()) for (const flush of value.flushers) await flush();
}
export async function refreshDeviceContent() {
  for (const { contentId, name, entries } of live.values()) {
    if (name !== deviceSyncDatabase()) continue;
    const entry = await readDeviceContent(contentId, name);
    if (entry) for (const receive of entries) receive(entry);
  }
}
export async function persistDeviceContent(
  contentId: number,
  doc: Y.Doc,
  paths: Map<string, string>,
  expectedRevision?: string,
  expectedGeneration?: string
) {
  const name = deviceSyncDatabase();
  if (!name) return false;
  if (!documentGenerations.has(doc))
    documentGenerations.set(
      doc,
      expectedGeneration ?? (await deviceStore<string>("generation", {}, name))
    );
  const status = await deviceStore<{ state: unknown }>("status", {}, name);
  if (!status.state) return false;
  const portable: Record<string, string> = {};
  for (const [reference, path] of paths) {
    if (/^~\/\.editor\/resources\/device-sync\/[a-f0-9]{64}\.(png|jpg|webp|gif|bin)$/.test(path))
      portable[reference] = path;
    else
      try {
        portable[reference] = await deviceAsset<string>("import", { path });
      } catch {
        /* 缺图保留引用，正文仍可耐久保存。 */
      }
  }
  const incoming: DeviceDocument = {
    contentId,
    ...readDocumentIdentity(doc),
    state: bytesToBase64(Y.encodeStateAsUpdate(doc)),
    paths: portable,
    updatedAt: Date.now(),
    metricRules: mobileContentMetrics.rules,
  };
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await readDeviceContent(contentId, name);
    if (current?.state === incoming.state) incoming.updatedAt = current.updatedAt;
    const document = current
      ? await mergeDeviceDocument(current, incoming)
      : await prepareDeviceDocument(incoming);
    try {
      await deviceStore(
        "save-document",
        {
          document,
          expectedState: current?.state,
          expectedGeneration: documentGenerations.get(doc),
          ...(!current && expectedRevision ? { expectedRevision } : {}),
        },
        name
      );
      for (const [reference, path] of Object.entries(document.paths)) paths.set(reference, path);
      const input = await prepareDeviceDocument(incoming);
      const snapshots = confirmed.get(keyOf(contentId, name)) ?? new Set<string>();
      snapshots.add(await projectionHash(input.projection.contentJson));
      while (snapshots.size > 16) snapshots.delete(snapshots.values().next().value!);
      confirmed.set(keyOf(contentId, name), snapshots);
      while (confirmed.size > 128) confirmed.delete(confirmed.keys().next().value!);
      wakeDeviceSync();
      return true;
    } catch (error) {
      if (!String(error).includes("DEVICE_SYNC_RETRY") || attempt === 3) throw error;
    }
  }
  return false;
}

export async function replaceDeviceContent(
  params: {
    contentId: number;
    content: unknown[];
    contracts?: ContentContractDictionary;
    expectedRevision?: string;
    expectedDocumentId?: string;
    expectedSourceId?: string;
  },
  context: ContentWriteContext
) {
  assertContentWriteContext(context);
  const name = context.database;
  if (!name) return false;
  const current = await readDeviceContent(params.contentId, name);
  if (!current) return false;
  const doc = new Y.Doc({ gc: false });
  Y.applyUpdate(doc, base64ToBytes(current.state));
  const tree = new NodeTree(doc);
  try {
    await tree.installContracts(params.contracts ?? {}, null);
    const contracts = tree.contracts.toJSON() as ContentContractDictionary;
    const paths = { ...current.paths },
      references = new Map(Object.entries(paths).map(([reference, path]) => [path, reference]));
    const map = async (nodes: ContentNode[]): Promise<ContentNode[]> =>
      Promise.all(
        nodes.map(async node => {
          if (!Array.isArray(node.children)) return node;
          const replacements = new Map<string, string>();
          mapNodeResources(node, contracts[String(node.tauContract)]?.resources, reference => {
            if (!reference.startsWith("http") && !reference.startsWith("tau-collab-"))
              replacements.set(
                reference,
                references.get(reference) ?? LOCAL_ASSET_PREFIX + crypto.randomUUID()
              );
            return reference;
          });
          for (const [path, reference] of replacements) {
            paths[reference] = await deviceAsset<string>("import", { path });
          }
          return {
            ...mapNodeResources(
              node,
              contracts[String(node.tauContract)]?.resources,
              reference => replacements.get(reference) ?? reference
            ),
            children: await map(node.children),
          };
        })
      );
    applyNodeTreeContent(tree, await map(params.content as ContentNode[]), {});
    await validateNodeDocument(doc, readDocumentIdentity(doc));
    const document = await prepareDeviceDocument({
      ...current,
      state: bytesToBase64(Y.encodeStateAsUpdate(doc)),
      paths,
      updatedAt: Date.now(),
      metricRules: combineDeviceMetrics(current.metricRules, mobileContentMetrics.rules),
    });
    assertContentWriteContext(context);
    await deviceStore(
      "save-document",
      {
        document,
        expectedState: current.state,
        expectedRevision: params.expectedRevision,
        expectedDocumentId: params.expectedDocumentId,
        expectedSourceId: params.expectedSourceId,
        expectedGeneration: context.generation,
      },
      name
    );
    wakeDeviceSync();
    return true;
  } finally {
    tree.dispose();
    doc.destroy();
  }
}

let resolving = Promise.resolve();
export function resolveDeviceJsonIntents(
  contentId?: number,
  name = deviceSyncDatabase()
): Promise<void> {
  if (!name) return Promise.resolve();
  const task = resolving
    .catch(() => {})
    .then(async () => {
      const generation = await deviceStore<string>("generation", {}, name);
      for (const intent of await deviceStore<DeviceJsonIntent[]>("intents", {}, name)) {
        if (contentId !== undefined && intent.contentId !== contentId) continue;
        const current = await readRawDeviceContent(intent.contentId, name);
        if (!current) throw new Error("DEVICE_SYNC_RETRY: 正文基线缺失");
        const doc = new Y.Doc({ gc: false });
        Y.applyUpdate(doc, base64ToBytes(intent.base.state));
        const tree = new NodeTree(doc);
        try {
          await tree.installContracts(intent.contracts, null);
          const paths = { ...intent.base.paths },
            reverse = new Map(Object.entries(paths).map(([reference, path]) => [path, reference]));
          const map = async (nodes: ContentNode[]): Promise<ContentNode[]> =>
            Promise.all(
              nodes.map(async node => {
                if (!Array.isArray(node.children)) return node;
                const replacements = new Map<string, string>();
                mapNodeResources(
                  node,
                  intent.contracts[String(node.tauContract)]?.resources,
                  reference => {
                    if (reverse.has(reference))
                      replacements.set(reference, reverse.get(reference)!);
                    else if (!isSafeResource(reference))
                      replacements.set(reference, LOCAL_ASSET_PREFIX + crypto.randomUUID());
                    return reference;
                  }
                );
                for (const [path, reference] of replacements)
                  if (!paths[reference])
                    try {
                      paths[reference] = await deviceAsset<string>("import", { path });
                    } catch {
                      /* 原引用仍保留在待转换意图。 */
                    }
                return {
                  ...mapNodeResources(
                    node,
                    intent.contracts[String(node.tauContract)]?.resources,
                    reference => replacements.get(reference) ?? reference
                  ),
                  children: await map(node.children),
                };
              })
            );
          applyNodeTreeContent(tree, await map(intent.content), {});
          await validateNodeDocument(doc, readDocumentIdentity(doc));
          const document = await mergeDeviceDocument(current, {
            ...intent.base,
            state: bytesToBase64(Y.encodeStateAsUpdate(doc)),
            paths,
            updatedAt: Date.now(),
            metricRules: combineDeviceMetrics(current.metricRules, mobileContentMetrics.rules),
          });
          await deviceStore(
            "save-document",
            {
              document,
              expectedState: current.state,
              intentToken: intent.token,
              expectedGeneration: generation,
            },
            name
          );
        } finally {
          tree.dispose();
          doc.destroy();
        }
      }
    });
  resolving = task;
  return task;
}
