import type Database from "better-sqlite3";
import * as Y from "yjs";
import {
  readNodeDocument,
  readDocumentIdentity,
  validateNodeDocument,
  type ContentNode,
} from "@tau/collaboration";
import { contentSession } from "../collaboration/content-sessions";
import { mapNodeResources } from "@tau/db-schema/content-resources";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import { canonicalContractJson } from "@tau/db-schema/content-contracts";
import { createHash } from "node:crypto";
import type { PreparedDeviceDocument } from "@tau/collaboration/src/device-sync/protocol";
import { ContentDocumentTable } from "../tables/content-document";
import { createContentMetrics } from "@tau/db-schema/content-metrics";
import { desktopContentMetrics } from "../../../../shared/content-metrics";
import {
  combineDeviceMetrics,
  deviceMetricsForContracts,
} from "@tau/collaboration/src/device-sync/documents";
import {
  deviceDocument,
  readDeviceSyncState,
  withDeviceProjection,
  writeDeviceDocument,
} from "./database-store";

export async function restoreActiveDeviceContent(
  db: Database.Database,
  contentId: number,
  assertCurrent: () => void
) {
  const stored = ContentDocumentTable.read(db, contentId),
    active = contentSession(db, contentId);
  if (
    !stored ||
    active?.info.mode !== "local" ||
    !active.persistDeviceState ||
    active.info.source?.projectionRevision !== stored.revision
  )
    return false;
  await validateNodeDocument(active.doc, readDocumentIdentity(active.doc));
  assertCurrent();
  if (
    contentSession(db, contentId) !== active ||
    ContentDocumentTable.read(db, contentId)?.revision !== stored.revision
  )
    throw new Error("DEVICE_SYNC_RETRY: 正文恢复期间发生变化");
  active.persistDeviceState(active.doc);
  return Boolean(deviceDocument(db, contentId));
}

export function recordDeviceAudit(db: Database.Database, contentId: number) {
  const now = Date.now();
  if (
    db
      .prepare(
        "SELECT 1 FROM operation WHERE operation_content_type='content' AND operation_id=? AND operation_action='update' AND operation_time>=? LIMIT 1"
      )
      .get(contentId, now - 1000)
  )
    return;
  db.prepare(
    "INSERT INTO operation(operation_time,operation_id,operation_content_type,operation_action) VALUES (?,?,'content','update')"
  ).run(now, contentId);
}
export function projectDeviceDocument(
  db: Database.Database,
  document: PreparedDeviceDocument,
  options: { replica?: boolean; audit?: boolean } = {}
) {
  const stored = ContentDocumentTable.read(db, document.contentId);
  if (!stored) return;
  const contracts = { ...document.projection.contracts };
  for (const [id, contract] of Object.entries(stored.contracts))
    if (canonicalContractJson(contracts[id]) === canonicalContractJson(contract))
      contracts[id] = contract;
  const content = canonicalContractJson(document.projection.content),
    dictionary = canonicalContractJson(contracts);
  const changed = canonicalContractJson(stored.content) !== content;
  if (options.replica) {
    const problem = ContentDocumentTable.problem(document.projection.content, contracts);
    if (problem) throw new Error(problem);
  } else
    ContentDocumentTable.commit(
      db,
      document.contentId,
      { documentId: stored.documentId, content: document.projection.content, contracts },
      { expectedRevision: stored.revision, count: document.projection.count }
    );
  const revision = createHash("sha256")
    .update(content + "\n" + dictionary)
    .digest("hex");
  db.prepare("UPDATE contents SET content=?,count=?,update_time=? WHERE id=?").run(
    content,
    document.projection.count,
    document.updatedAt,
    document.contentId
  );
  db.prepare("UPDATE content_documents SET contracts=?,revision=? WHERE content_id=?").run(
    dictionary,
    revision,
    document.contentId
  );
  if (options.replica) return;
  db.prepare("UPDATE cards SET update_time=max(coalesce(update_time,0),?) WHERE content_id=?").run(
    document.updatedAt,
    document.contentId
  );
  db.prepare(
    "UPDATE diary_segments SET update_time=max(coalesce(update_time,0),?) WHERE content_id=?"
  ).run(document.updatedAt, document.contentId);
  db.prepare(
    "UPDATE diary_entries SET update_time=max(coalesce(update_time,0),?),word_count=coalesce((SELECT sum(c.count) FROM diary_segments s JOIN contents c ON c.id=s.content_id WHERE s.diary_id=diary_entries.id),0) WHERE id IN (SELECT diary_id FROM diary_segments WHERE content_id=?)"
  ).run(document.updatedAt, document.contentId);
  if (changed && options.audit !== false) recordDeviceAudit(db, document.contentId);
}

/** 主库先确认二进制与投影，协作缓存随后写入；重启以主库恢复合并基线。 */
export function persistDeviceContent(
  db: Database.Database,
  contentId: number,
  doc: Y.Doc,
  resolve: (reference: string) => string | null
) {
  if (!readDeviceSyncState(db)?.enabled) return false;
  const identity = readDocumentIdentity(doc);
  const previous = deviceDocument(db, contentId);
  const contracts = doc.getMap("node-tree:contracts").toJSON() as ContentContractDictionary;
  const paths = { ...previous?.paths };
  const value = readNodeDocument(doc);
  const visit = (nodes: ContentNode[]): ContentNode[] =>
    nodes.map(node =>
      Array.isArray(node.children)
        ? {
            ...mapNodeResources(node, contracts[String(node.tauContract)]?.resources, reference => {
              const path = resolve(reference);
              if (path) paths[reference] = path;
              return paths[reference] ?? reference;
            }),
            children: visit(node.children),
          }
        : node
    );
  const content = visit(value.content);
  const state = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
  const entry = {
    contentId,
    ...identity,
    state,
    paths,
    updatedAt: previous?.state === state ? previous.updatedAt : Date.now(),
    metricRules: deviceMetricsForContracts(
      contracts,
      combineDeviceMetrics(previous?.metricRules, desktopContentMetrics.rules, true)
    ),
  };
  if (previous && canonicalContractJson(previous) === canonicalContractJson(entry)) return false;
  if (db.prepare("SELECT 1 FROM _tau_device_json_intents WHERE content_id=?").get(contentId))
    throw new Error("DEVICE_SYNC_RETRY: 正文业务修改尚待转换");
  const stored = ContentDocumentTable.read(db, contentId),
    changed = Boolean(
      previous && stored && canonicalContractJson(stored.content) !== canonicalContractJson(content)
    );
  db.transaction(() => {
    writeDeviceDocument(db, entry);
    withDeviceProjection(db, () =>
      projectDeviceDocument(
        db,
        {
          ...entry,
          projection: {
            content,
            contracts,
            title: value.title,
            contentJson: canonicalContractJson(content),
            contractsJson: canonicalContractJson(contracts),
            count: createContentMetrics(entry.metricRules).count(content),
          },
        },
        { audit: false }
      )
    );
  })();
  return changed;
}
