import Database from "better-sqlite3";
import { installContentLibraryBaseline } from "./content-baseline";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import * as Y from "yjs";
import {
  createNodeDocument,
  createLegacySnapshot,
  readNodeDocument,
  readSharedContent,
  collectSharedResources,
  ASSET_PREFIX,
  validateNodeDocument,
  type ContentNode,
  type ContentVersionUpgrade,
  type DocumentMigration,
  type MigrationReceipt,
  type SourceBinding,
} from "@tau/collaboration";
import {
  canonicalContractJson,
  type ContentContractDictionary,
} from "@tau/db-schema/content-contracts";
import {
  CONTENT_ENTITY_NODE_CONTRACTS,
  type ContentEntityRelation,
  type ContentEntityKind,
} from "@tau/db-schema/content-identities";
import { ContentIdentityTable } from "../tables/content-identity";
import { ContentDocumentTable, type ContentDocumentWrite } from "../tables/content-document";
import { applyContentEntityRelations } from "../tables/content-entity-relations";
import { getContentLength } from "@/utils/helper";
import {
  ContentLocalState,
  type LocalMigrationRecord,
  type LocalMigrationPlan,
} from "./content-local-state";
import { ContentRecoveryStore } from "./content-recovery";
import { CollaborationLocalStore } from "./local-store";
import { CollaborationAssetService } from "./asset-service";
import { convertLegacyContent, type LegacyUpgradeResult } from "@tau/editor-collab";
import { contentRevision } from "./content-sessions";
import type { RuntimeSession } from "./types";
import { ContentRetention } from "./content-retention";
import { contentRecoveryResources } from "./content-recovery-resources";

const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const json = (value: unknown) => Buffer.from(JSON.stringify(value));
function comparableLegacyContent(content: ContentNode[]): string {
  const visit = (node: ContentNode): ContentNode => {
    const value = { ...node };
    delete value.collabId;
    if (typeof node.text === "string" && !node.children) return { ...value, type: "formatted" };
    return { ...value, ...(node.children ? { children: node.children.map(visit) } : {}) };
  };
  return canonicalContractJson(content.map(visit));
}
interface Installation {
  source?: SourceBinding;
  cacheRevision: string;
  expectedContent: string;
  previousRevision?: string;
  document: ContentDocumentWrite;
  views: LegacyUpgradeResult["views"];
  issues: LegacyUpgradeResult["issues"];
  oldRelations: ContentEntityRelation[];
  library?: {
    source_id: string;
    baseline_id: string;
    confirmed_snapshot: string | null;
    create_time: number;
  };
  entities: {
    entity_kind: ContentEntityKind;
    entity_id: string;
    local_id: number;
    created_at: number;
    retired_at: number | null;
  }[];
}

/** 本机升级按耐久决定续做三个存储；回执只在所属存储事务提交后登记。 */
export class ContentMigration {
  constructor(
    private readonly state: ContentLocalState,
    private readonly cache: CollaborationLocalStore,
    private readonly assets: CollaborationAssetService,
    private readonly recovery: ContentRecoveryStore,
    private readonly currentDatabase: (db: Database.Database) => boolean = db => db.open
  ) {}

  async prepare(
    db: Database.Database | undefined,
    session: RuntimeSession,
    contracts: ContentContractDictionary,
    remote?: { operation?: DocumentMigration; document: Y.Doc; workspaceId: string },
    versionUpgrade?: ContentVersionUpgrade
  ): Promise<LocalMigrationRecord<Extract<LocalMigrationPlan, { kind?: undefined }>>> {
    if (
      !session.info.frozen ||
      Boolean(remote) !== (session.info.mode !== "local" && session.info.status === "active")
    )
      throw new Error("升级须先暂停原正文会话并确认服务端屏障");
    if (
      remote?.operation &&
      (remote.operation.state !== "PENDING" ||
        remote.operation.documentId !== session.info.id ||
        !remote.operation.frozenRevision ||
        hash(Y.encodeStateAsUpdate(remote.document)) !== remote.operation.frozenRevision)
    )
      throw new Error("服务端屏障与候选来源不一致");
    const privateNodes = this.cache.legacyPrivateNodes(session.info.id);
    const adoption = Boolean(remote && !remote.operation);
    if (!adoption && !versionUpgrade && session.doc.getMap("meta").get("version") !== 1)
      throw new Error("该正文无需旧格式转换");
    const source = session.info.source;
    const row =
      source &&
      (db?.prepare("SELECT content,create_time FROM contents WHERE id=?").get(source.contentId) as
        | { content: string; create_time: number }
        | undefined);
    const previous = source && db ? ContentDocumentTable.read(db, source.contentId) : null;
    if (
      source &&
      (!db ||
        !row ||
        row.create_time !== source.contentCreatedAt ||
        (!adoption && !versionUpgrade && previous))
    )
      throw new Error("原正文基线已变化");
    const workspaceId = source?.databaseName ?? remote?.workspaceId;
    if (!workspaceId) throw new Error("缺少原资料库归属");
    const staging = mkdtempSync(join(this.recovery.directory, ".preparing-"));
    let isolated: Database.Database | undefined;
    let candidate: Y.Doc | undefined;
    try {
      if (db && source && !ContentIdentityTable.library(db)) {
        const working = join(staging, "working.db");
        await db.backup(working);
        isolated = new Database(working);
        ContentIdentityTable.establishBaseline(isolated);
      }
      const sourceDatabase = isolated ?? db;
      const staged = new Map<string, ReturnType<typeof ContentIdentityTable.stageReference>>();
      const resolveEntity = (kind: ContentEntityKind, id: number) => {
        if (!sourceDatabase) return null;
        try {
          const key = `${kind}:${id}`;
          let value = staged.get(key);
          if (!value) {
            value = ContentIdentityTable.stageReference(sourceDatabase, kind, id);
            staged.set(key, value);
          }
          return value.reference;
        } catch {
          return null;
        }
      };
      const value =
        adoption || versionUpgrade
          ? readNodeDocument(remote?.document ?? session.doc)
          : remote
            ? readSharedContent(remote.document)
            : readSharedContent(session.doc, privateNodes);
      let conflictingLocalContent = false;
      if (row && !remote && !versionUpgrade) {
        const projection = createLegacySnapshot({ ...value, content: JSON.parse(row.content) });
        try {
          conflictingLocalContent =
            comparableLegacyContent(readSharedContent(projection).content) !==
            comparableLegacyContent(value.content);
        } finally {
          projection.destroy();
        }
      }
      const legacyResources = new Set<string>();
      for (const original of [session.doc, remote?.document])
        if (original?.getMap("meta").get("version") === 1)
          collectSharedResources(original).forEach(reference => legacyResources.add(reference));
      for (const reference of legacyResources)
        if (reference.startsWith(ASSET_PREFIX)) {
          try {
            await this.assets.localizeReference(session.info.serverUrl, session.info.id, reference);
          } catch {
            // 下载失败仍保留原引用，由恢复文件清单明确记录缺失。
          }
        }
      if (versionUpgrade) {
        const original = remote?.document ?? session.doc;
        if (hash(Y.encodeStateAsUpdate(original)) !== versionUpgrade.expectedRevision)
          throw new Error("正文在准备转换期间已变化，请取消后重新准备");
        validateVersionUpgrade(
          value.content,
          versionUpgrade.content,
          original.getMap("node-tree:contracts").toJSON() as ContentContractDictionary,
          contracts
        );
      }
      const converted: LegacyUpgradeResult = versionUpgrade
        ? { content: versionUpgrade.content, contracts, views: [], issues: [] }
        : adoption
          ? {
              content: value.content,
              contracts: remote!.document
                .getMap("node-tree:contracts")
                .toJSON() as ContentContractDictionary,
              views: [],
              issues: [],
            }
          : await convertLegacyContent(value.content, contracts, {
              shared: Boolean(remote),
              privateNodes: privateNodes,
              resolveEntity,
            });
      const baselineId = adoption
          ? String(remote!.document.getMap("meta").get("baselineId"))
          : randomUUID(),
        expectedEpoch =
          remote?.operation?.expectedEpoch ?? Number(session.doc.getMap("meta").get("epoch") ?? 0);
      const targetEpoch = adoption
        ? Number(remote!.document.getMap("meta").get("epoch"))
        : expectedEpoch + 1;
      const convertedValue = { ...value, content: converted.content };
      if (adoption) {
        candidate = new Y.Doc({ gc: false });
        Y.applyUpdate(candidate, Y.encodeStateAsUpdate(remote!.document));
        await validateNodeDocument(candidate, {
          documentId: session.info.id,
          baselineId,
          epoch: targetEpoch,
        });
        if (targetEpoch <= expectedEpoch) throw new Error("新基线代次未前进，不能替换原会话");
      } else
        candidate = await createNodeDocument(
          { documentId: session.info.id, baselineId, epoch: targetEpoch },
          remote
            ? convertedValue
            : await this.assets.prepareLocalDocument(
                session.info.id,
                convertedValue,
                converted.contracts
              ),
          converted.contracts
        );
      const projection = await this.assets.localizeDocument(
        session.info.serverUrl,
        session.info.id,
        readNodeDocument(candidate),
        converted.contracts
      );
      const oldRelations: ContentEntityRelation[] = [];
      const visit = (node: ContentNode) => {
        const entity = CONTENT_ENTITY_NODE_CONTRACTS[String(node.type)];
        if (entity) {
          const field =
            entity.kind === "whiteboard-content"
              ? "whiteBoardContentId"
              : entity.kind === "data-table"
                ? "tableId"
                : "projectItemId";
          if (Number.isSafeInteger(node[field])) {
            try {
              const target = resolveEntity(entity.kind, node[field] as number);
              if (!target) return;
              oldRelations.push({
                nodeId: String(node.collabId ?? oldRelations.length),
                slot: "entityRef",
                target,
              });
            } catch {
              /* 原本缺失的实体保留在恢复清单中。 */
            }
          }
        }
        node.children?.forEach(visit);
        if (node.type === "list-item" && node.isFold === true && Array.isArray(node.allContent))
          (node.allContent.slice(1) as ContentNode[]).forEach(visit);
      };
      if (row && sourceDatabase) (JSON.parse(row.content) as ContentNode[]).forEach(visit);
      const dependencies =
        sourceDatabase && source
          ? new ContentRetention(this.state).dependencies(
              sourceDatabase,
              workspaceId,
              [{ kind: "content", id: source.contentId }],
              session.info.id
            )
          : [];
      const installation: Installation = {
        source,
        cacheRevision: contentRevision(session),
        expectedContent: hash(row?.content ?? ""),
        previousRevision: previous?.revision,
        document: {
          documentId: previous?.documentId ?? randomUUID(),
          contracts: converted.contracts,
          content: projection.content,
        },
        views: converted.views,
        issues: converted.issues,
        oldRelations,
        library: sourceDatabase
          ?.prepare(
            "SELECT source_id,baseline_id,confirmed_snapshot,create_time FROM library_identity WHERE id=1"
          )
          .get() as Installation["library"],
        entities: [
          ...((isolated
            ?.prepare("SELECT * FROM entity_identities")
            .all() as Installation["entities"]) ?? []),
          ...[...staged.values()].map(value => value.entity),
        ],
      };
      const bytes = Y.encodeStateAsUpdate(candidate),
        operationId = remote?.operation?.id ?? randomUUID();
      const resources = this.assets.recoveryFiles(session.info.id, [
        ...legacyResources,
        ...(sourceDatabase ? contentRecoveryResources(sourceDatabase, dependencies) : []),
      ]);
      const drafts = this.state
        .documentDrafts(workspaceId)
        .filter(draft => draft.documentId === session.info.id);
      const receipt = this.recovery.save({
        workspaceId,
        reason: "migration",
        provenance: {
          operationId,
          documentId: session.info.id,
          source,
          issues: converted.issues,
          unresolvedLegacySource: !source && privateNodes.size > 0,
        },
        missing: resources.missing,
        files: [
          ...(row
            ? [
                {
                  name: "source-projection.json",
                  bytes: json({
                    source,
                    content: JSON.parse(row.content),
                    contracts: previous?.contracts ?? null,
                  }),
                },
              ]
            : []),
          { name: "document-before.bin", bytes: Y.encodeStateAsUpdate(session.doc) },
          { name: "private-before.json", bytes: json([...privateNodes]) },
          {
            name: "input-drafts.json",
            bytes: json(
              this.state
                .inputDrafts(workspaceId)
                .filter(draft => draft.documentId === session.info.id)
            ),
          },
          {
            name: "node-views.json",
            bytes: json(
              this.state.db
                .prepare("SELECT * FROM node_views WHERE workspace_id=? AND document_id=?")
                .all(workspaceId, source?.contentDocumentId ?? session.info.id)
            ),
          },
          ...drafts.flatMap((draft, index) => {
            const { state, ...metadata } = draft;
            return [
              { name: `view-${index}.bin`, bytes: state },
              { name: `view-${index}.json`, bytes: json(metadata) },
            ];
          }),
          { name: "candidate.bin", bytes },
          { name: "installation.json", bytes: json(installation) },
          { name: "resources.json", bytes: json(resources.resources) },
          ...resources.files,
        ],
      });
      this.state.replaceHolds(workspaceId, `recovery:${receipt.id}`, "recovery", [
        ...this.state.holders(workspaceId, `document:${session.info.id}`),
        ...oldRelations.map(relation => relation.target),
      ]);
      if (conflictingLocalContent)
        throw new Error(
          `本机旧缓存与主库正文不同，两个版本已保全，核对前不自动覆盖。保全位置：${receipt.manifestPath}`
        );
      return this.state.begin({
        operationId,
        workspaceId,
        documentId: session.info.id,
        expectedEpoch,
        targetEpoch,
        remote: Boolean(remote?.operation),
        expiresAt: remote?.operation?.expiresAt ?? Date.now() + 10 * 60_000,
        fingerprint: {
          expectedRevision: remote?.operation?.frozenRevision ?? contentRevision(session),
          candidateHash: hash(bytes),
          targetVersion: 2,
          baselineId,
        },
        recovery: receipt,
      });
    } finally {
      candidate?.destroy();
      isolated?.close();
      rmSync(staging, { recursive: true, force: true });
    }
  }

  async install(
    db: Database.Database | undefined,
    operationId: string,
    checkpoint?: (phase: "decision" | "main" | "collaboration") => void
  ): Promise<Y.Doc> {
    let record = this.state.migration(operationId);
    if (!record) throw new Error("迁移操作不存在");
    if (record.plan.kind === "whiteboard") throw new Error("白板迁移须经白板文档安装器");
    if (record.phase === "ABORTED" || record.phase === "EXPIRED")
      throw new Error("已终止的迁移不能继续");
    if (record.phase === "COMPLETE") return this.cache.load(record.plan.documentId).doc;
    this.recovery.verify(record.plan.recovery);
    const installation = JSON.parse(
      this.recovery.readFile(record.plan.recovery, "installation.json").toString()
    ) as Installation;
    const bytes = this.recovery.readFile(record.plan.recovery, "candidate.bin");
    if (hash(bytes) !== record.plan.fingerprint.candidateHash)
      throw new Error("转换候选摘要不匹配");
    const candidate = new Y.Doc({ gc: false });
    try {
      Y.applyUpdate(candidate, bytes);
      await validateNodeDocument(candidate, {
        documentId: record.plan.documentId,
        baselineId: record.plan.fingerprint.baselineId,
        epoch: record.plan.targetEpoch ?? record.plan.expectedEpoch + 1,
      });
      if (db && !this.currentDatabase(db)) throw new Error("原资料库连接已变化，转换等待重试");
      record = this.state.migration(operationId)!;
      if (record.phase === "COMPLETE") {
        candidate.destroy();
        return this.cache.load(record.plan.documentId).doc;
      }
      if (record.phase === "ABORTED" || record.phase === "EXPIRED")
        throw new Error("已终止的迁移不能继续");
      if (!record.decision) {
        if (record.plan.remote) throw new Error("须先确认服务端迁移裁决");
        if (installation.source) {
          if (!db) throw new Error("原资料库未打开");
          this.checkOriginal(db, installation);
        }
        const current = this.cache.load(record.plan.documentId);
        try {
          if (hash(Y.encodeStateAsUpdate(current.doc)) !== installation.cacheRevision)
            throw new Error("原协作缓存已变化，请取消并重新准备");
        } finally {
          current.doc.destroy();
        }
        record = this.state.decideLocal(operationId, "commit");
        checkpoint?.("decision");
      }
      const receipt = record.decision!;
      if (installation.source) {
        if (!db) throw new Error("原资料库未打开，已保留服务端裁决等待恢复");
        this.installMain(db, record, installation, receipt);
      }
      this.state.installed(operationId, "main", receipt);
      checkpoint?.("main");
      this.cache.db.transaction(() => {
        const installed = this.state.migration(operationId)!.installations.collaboration;
        if (installed) {
          if (canonicalContractJson(installed) !== canonicalContractJson(receipt))
            throw new Error("本机安装回执冲突");
          return;
        }
        const previous = this.cache.load(record!.plan.documentId);
        try {
          if (hash(Y.encodeStateAsUpdate(previous.doc)) !== installation.cacheRevision)
            throw new Error("原缓存与迁移计划不符，已保留待恢复");
        } finally {
          previous.doc.destroy();
        }
        const metadata = this.cache.load(record!.plan.documentId);
        try {
          if (metadata.info.source && db) {
            const installed = ContentDocumentTable.read(db, metadata.info.source.contentId)!;
            metadata.info.source = {
              ...metadata.info.source,
              librarySourceId: ContentIdentityTable.library(db)!.sourceId,
              contentDocumentId: installed.documentId,
              projectionRevision: installed.revision,
            };
            this.cache.metadata(metadata.info);
          }
        } finally {
          metadata.doc.destroy();
        }
        this.cache.compact(record!.plan.documentId, candidate);
        this.cache.clearLegacyPrivateNodes(record!.plan.documentId);
        for (const view of installation.views) {
          const key = {
            workspaceId: record!.plan.workspaceId,
            documentId: installation.document.documentId,
            nodeId: view.nodeId,
            owner: view.owner,
          };
          const previous = this.state.readView(key);
          this.state.writeView(
            key,
            { ...view.value, ...previous?.value },
            previous?.revision ?? null
          );
        }
        checkpoint?.("collaboration");
        this.state.installed(operationId, "collaboration", receipt);
        this.state.complete(operationId, receipt);
      })();
      return candidate;
    } catch (failure) {
      candidate.destroy();
      throw failure;
    }
  }

  private checkOriginal(db: Database.Database, installation: Installation) {
    const source = installation.source!;
    const row = db
      .prepare("SELECT content,create_time FROM contents WHERE id=?")
      .get(source.contentId) as { content: string; create_time: number } | undefined;
    if (
      !row ||
      row.create_time !== source.contentCreatedAt ||
      hash(row.content) !== installation.expectedContent
    )
      throw new Error("原正文已变化，迁移不能覆盖");
    const library = ContentIdentityTable.library(db);
    if (library && library.sourceId !== installation.library!.source_id)
      throw new Error("资料库来源已变化，迁移不能跨来源安装");
  }

  private installMain(
    db: Database.Database,
    record: LocalMigrationRecord,
    installation: Installation,
    receipt: MigrationReceipt
  ) {
    db.transaction(() => {
      const marker = db
        .prepare(
          "SELECT migration_operation_id,migration_receipt FROM content_documents WHERE content_id=?"
        )
        .get(installation.source!.contentId) as
        | { migration_operation_id: string; migration_receipt: string }
        | undefined;
      if (marker?.migration_operation_id === record.plan.operationId) {
        if (
          canonicalContractJson(JSON.parse(marker.migration_receipt)) !==
          canonicalContractJson(receipt)
        )
          throw new Error("主库安装回执冲突");
        const current = ContentDocumentTable.read(db, installation.source!.contentId);
        const identity = db
          .prepare("SELECT create_time FROM contents WHERE id=?")
          .get(installation.source!.contentId) as { create_time: number } | undefined;
        const library = ContentIdentityTable.library(db);
        if (
          !current ||
          current.documentId !== installation.document.documentId ||
          identity?.create_time !== installation.source!.contentCreatedAt ||
          library?.sourceId !== installation.library?.source_id ||
          library?.baselineId !== installation.library?.baseline_id ||
          canonicalContractJson(current.content) !==
            canonicalContractJson(installation.document.content) ||
          canonicalContractJson(current.contracts) !==
            canonicalContractJson(installation.document.contracts)
        )
          throw new Error("主库在安装中断后已有新内容或来源变化，不能恢复旧候选");
        return;
      }
      this.checkOriginal(db, installation);
      if (marker && !installation.previousRevision) throw new Error("正文已由另一操作转换");
      installContentLibraryBaseline(db, {
        library: installation.library!,
        entities: installation.entities,
      });
      const originalTime = db
        .prepare("SELECT update_time FROM contents WHERE id=?")
        .get(installation.source!.contentId) as { update_time: number };
      ContentDocumentTable.commit(db, installation.source!.contentId, installation.document, {
        installDocument: true,
        count: getContentLength(installation.document.content as import("slate").Descendant[]),
        expectedRevision: installation.previousRevision,
        ...(installation.previousRevision
          ? {}
          : {
              applyRelations: (
                _removed: readonly ContentEntityRelation[],
                added: readonly ContentEntityRelation[]
              ) => applyContentEntityRelations(db, installation.oldRelations, added),
            }),
      });
      if (!installation.previousRevision)
        db.prepare("UPDATE contents SET update_time=? WHERE id=?").run(
          originalTime.update_time,
          installation.source!.contentId
        );
      db.prepare(
        "UPDATE content_documents SET migration_operation_id=?,migration_receipt=? WHERE content_id=?"
      ).run(
        record.plan.operationId,
        canonicalContractJson(receipt),
        installation.source!.contentId
      );
    })();
  }
}

/** 作者迁移只改已声明版本的业务属性，正文结构与未迁移节点保持原样。 */
function validateVersionUpgrade(
  before: ContentNode[],
  after: ContentNode[],
  previous: ContentContractDictionary,
  next: ContentContractDictionary
): void {
  for (const [id, contract] of Object.entries(previous))
    if (canonicalContractJson(next[id]) !== canonicalContractJson(contract))
      throw new Error("版本转换不能篡改已有契约");
  const visit = (left: ContentNode[], right: ContentNode[], depth = 0) => {
    if (depth > 64 || !Array.isArray(right) || left.length !== right.length)
      throw new Error("版本转换不能修改正文结构");
    left.forEach((node, index) => {
      const result = right[index];
      if (!result || typeof result !== "object") throw new Error("转换节点无效");
      if (!Array.isArray(node.children)) {
        if (canonicalContractJson(node) !== canonicalContractJson(result))
          throw new Error("版本转换不能修改正文文本");
        return;
      }
      if (node.collabId !== result.collabId || node.type !== result.type)
        throw new Error("版本转换不能修改节点身份");
      if (node.tauContract === result.tauContract) {
        const attributes = ({ children: _children, ...value }: ContentNode) => value;
        if (canonicalContractJson(attributes(node)) !== canonicalContractJson(attributes(result)))
          throw new Error("未转换版本的节点不能附带修改");
      } else {
        const old = previous[String(node.tauContract)],
          current = next[String(result.tauContract)];
        if (
          !old ||
          !current ||
          old.domain !== "editor-node" ||
          current.domain !== "editor-node" ||
          old.owner !== current.owner ||
          old.type !== current.type ||
          old.kind !== current.kind ||
          old.isVoid !== current.isVoid ||
          current.dataVersion <= old.dataVersion
        )
          throw new Error("节点版本转换与原归属或结构不符");
      }
      visit(node.children, result.children!, depth + 1);
    });
  };
  visit(before, after);
}
