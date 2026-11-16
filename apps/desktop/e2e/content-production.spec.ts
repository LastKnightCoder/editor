import { test, expect, type ElectronApplication, type Page } from "@playwright/test";
import { copyFile, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import * as Y from "yjs";
import {
  captureScopedTextEdit,
  type CollaborationState,
  type ContentNode,
  type DeviceIdentity,
  type NodeDocumentIdentity,
  type ScopedContentResult,
} from "@tau/collaboration";
import {
  prepareContentContract,
  type ContentContractDictionary,
} from "@tau/db-schema/content-contracts";
import type { ContentEntityReference } from "@tau/db-schema/content-identities";
import type {
  AssistantQueryResult,
  AssistantTask,
  TaskOperationResult,
} from "@tau/shared/task-assistant";
import { startCollaborationServer, type CollaborationTestServer } from "./collaboration/server";

import {
  append,
  availablePort,
  bodyText,
  close,
  contentRefCount,
  createSandbox,
  desktop,
  disposeSandbox,
  documentHead,
  invoke,
  launch,
  open,
  output,
  persistedNodes,
  prepareParagraphFixture,
  sendOnFreeze,
  subscribe,
  update,
  verifyContentStartup,
  withTree,
  type Audit,
  type Card,
} from "./content-production/harness";
const resultPath = join(output, "result.json");
const ownershipResultPath = join(output, "ownership-result.json");
const cardOwnershipResultPath = join(output, "card-ownership-result.json");
const projectOwnershipResultPath = join(output, "project-ownership-result.json");
const creationResultPath = join(output, "creation-result.json");
const replacementResultPath = join(output, "replacement-result.json");
const collaborationResultPath = join(output, "collaboration-result.json");
const primary = "content-production";
const secondary = "content-production-other";
const original = "原始中文🙂";
const addition = "｜生产IPC已保存";
const switchAddition = "｜切库时排空";
const closeAddition = "｜关库时排空";
const quitAddition = "｜退出时排空";
const otherBody = "另一资料库的同编号正文";
async function createOwnershipProject(
  page: Page,
  title = "正文归属",
  projectText = "项目正文保留🙂"
) {
  const preparedContent = await prepareParagraphFixture();
  const project = await invoke<{ id: number }>(page, "create-project", { title });
  const [, item] = await invoke<[unknown, { id: number; contentId: number }]>(
    page,
    "add-root-project-item",
    project.id,
    {
      title: "原始项目条目",
      projectItemType: "document",
      refType: "",
      ...preparedContent(projectText),
    }
  );
  return { project, projectText, item, preparedContent };
}

test("真实生产 IPC 创建、保存、切库、关闭与重开正文", async () => {
  test.setTimeout(180_000);
  const directory = await createSandbox("tau-content-production-");
  let running: ElectronApplication | undefined;
  let db: DatabaseSync | undefined;
  const timings: Record<string, number> = {};
  const openDatabase = (name: string) =>
    new DatabaseSync(join(directory, "home/.editor", `${name}.db`), { readOnly: true });
  const readDatabaseBody = (name: string, contentId: number) => {
    const database = openDatabase(name);
    try {
      return bodyText(persistedNodes(database, contentId));
    } finally {
      database.close();
    }
  };
  try {
    await rm(resultPath, { force: true });
    const artifact = await readFile(join(desktop, "dist-electron/main/index.js"));
    const port = await availablePort();
    let started = performance.now();
    let { app, page } = await launch(directory, port, app => {
      running = app;
    });
    const startupTables = await verifyContentStartup(page, directory);
    await invoke(page, "create-or-connect-database", primary);
    timings.launchAndConnectMs = performance.now() - started;
    const contract = await prepareContentContract("g0.paragraph", {
      type: "paragraph",
      dataVersion: 1,
      kind: "block",
    });
    const createCard = (text: string) =>
      invoke<Card>(page, "create-card", {
        tags: ["生产接线基准"],
        isTop: false,
        count: 0,
        content: [
          {
            type: "paragraph",
            tauContract: contract.id,
            children: [{ type: "formatted", text }],
          },
        ],
        contracts: { [contract.id]: contract.contract },
      });
    await invoke(page, "create-or-connect-database", secondary);
    const other = await createCard(otherBody);
    await invoke(page, "create-or-connect-database", primary);
    const card = await createCard(original);
    expect(card.id).toBeGreaterThan(0);
    expect(card.contentId).toBeGreaterThan(0);
    expect(card.contentId).toBe(other.contentId);
    started = performance.now();
    const entry = await open(page, card);
    const first = await subscribe(page, entry.documentId, "primary-view");
    timings.firstOpenMs = performance.now() - started;
    const delta = append(first, original, addition);
    const expected = original + addition;
    started = performance.now();
    await update(page, first, delta.bytes);
    const firstDatabase = openDatabase(primary);
    db = firstDatabase;
    await expect
      .poll(() => bodyText(persistedNodes(firstDatabase, card.contentId)), { timeout: 15_000 })
      .toBe(expected);
    timings.editAndDiskPollMs = performance.now() - started;
    const document = db
      .prepare("SELECT document_id,contracts FROM content_documents WHERE content_id=?")
      .get(card.contentId) as { document_id: string; contracts: string };
    expect(persistedNodes(db, card.contentId)[0].collabId).toBe(delta.blockId);
    expect(JSON.parse(document.contracts)[contract.id]).toEqual(contract.contract);
    expect(db.prepare("SELECT content_id,tags FROM cards WHERE id=?").get(card.id)).toMatchObject({
      content_id: card.contentId,
      tags: '["生产接线基准"]',
    });
    const firstAudit = await app.evaluate(
      () =>
        (globalThis as unknown as { __tauContentProductionAudit: Audit })
          .__tauContentProductionAudit
    );
    expect(firstAudit.entry).toBe(join(desktop, "dist-electron/main/index.js"));
    expect(firstAudit.port).not.toBe(24678);
    expect(firstAudit.nodeRemaps).toBeGreaterThan(0);
    db.close();
    db = undefined;

    const beforeSwitch = await subscribe(page, entry.documentId, first.viewId);
    await sendOnFreeze(page, beforeSwitch, append(beforeSwitch, expected, switchAddition).bytes);
    const switchedBody = expected + switchAddition;
    started = performance.now();
    await invoke(page, "create-or-connect-database", secondary);
    expect(readDatabaseBody(primary, card.contentId)).toBe(switchedBody);
    expect(readDatabaseBody(secondary, other.contentId)).toBe(otherBody);
    const otherEntry = await open(page, other);
    expect(otherEntry.documentId).not.toBe(entry.documentId);
    const otherRead = await invoke<{ content: ContentNode[] }>(
      page,
      "content:get-by-id",
      other.contentId
    );
    expect(bodyText(otherRead.content)).toBe(otherBody);
    await expect(subscribe(page, entry.documentId, "wrong-library-view")).rejects.toThrow(
      /内容不属于当前数据库|正文会话已失效/
    );
    const lateDelta = append(beforeSwitch, expected, "｜切库后的旧视图写入");
    await expect(update(page, beforeSwitch, lateDelta.bytes)).rejects.toThrow(
      /编辑视图已失效|内容不属于当前数据库|正文会话已失效/
    );
    timings.switchAndVerifyMs = performance.now() - started;

    await invoke(page, "create-or-connect-database", primary);
    const afterSwitch = await open(page, card);
    expect(afterSwitch.documentId).toBe(entry.documentId);
    const beforeClose = await subscribe(page, afterSwitch.documentId, "close-database-view");
    await sendOnFreeze(page, beforeClose, append(beforeClose, switchedBody, closeAddition).bytes);
    const closedBody = switchedBody + closeAddition;
    started = performance.now();
    await invoke(page, "close-database", primary);
    expect(readDatabaseBody(primary, card.contentId)).toBe(closedBody);
    timings.closeDatabaseAndVerifyMs = performance.now() - started;
    await invoke(page, "local-content:unsubscribe", beforeClose.viewId);

    await invoke(page, "create-or-connect-database", primary);
    const afterClose = await open(page, card);
    expect(afterClose.documentId).toBe(entry.documentId);
    const beforeQuit = await subscribe(page, afterClose.documentId, "quit-view");
    await sendOnFreeze(page, beforeQuit, append(beforeQuit, closedBody, quitAddition).bytes);
    const finalBody = closedBody + quitAddition;
    started = performance.now();
    await close(app);
    running = undefined;
    expect(readDatabaseBody(primary, card.contentId)).toBe(finalBody);
    expect(readDatabaseBody(secondary, other.contentId)).toBe(otherBody);
    timings.quitAndVerifyMs = performance.now() - started;
    started = performance.now();
    ({ app, page } = await launch(directory, port, app => {
      running = app;
    }));
    await invoke(page, "create-or-connect-database", primary);
    const reopened = await invoke<{ content: ContentNode[] }>(
      page,
      "content:get-by-id",
      card.contentId
    );
    expect(bodyText(reopened.content)).toBe(finalBody);
    const reopenedEntry = await open(page, card);
    expect(reopenedEntry.documentId).toBe(entry.documentId);
    const recovered = await subscribe(page, reopenedEntry.documentId, "recovered-view");
    expect(beforeQuit.documentIdentity.baselineId).toEqual(expect.any(String));
    expect(recovered.documentIdentity).toEqual(beforeQuit.documentIdentity);
    withTree(recovered, tree => {
      const nodes = tree.snapshot();
      expect(bodyText(nodes)).toBe(finalBody);
      expect(nodes[0].collabId).toBe(delta.blockId);
    });
    await invoke(page, "local-content:unsubscribe", recovered.viewId);
    timings.restartAndReadMs = performance.now() - started;
    db = openDatabase(primary);
    expect(
      db.prepare("SELECT document_id FROM content_documents WHERE content_id=?").get(card.contentId)
    ).toMatchObject({ document_id: document.document_id });
    expect(db.prepare("SELECT count(*) AS total FROM cards").get()).toMatchObject({ total: 1 });
    db.close();
    db = undefined;
    const finalAudit = await app.evaluate(
      () =>
        (globalThis as unknown as { __tauContentProductionAudit: Audit })
          .__tauContentProductionAudit
    );
    await close(app);
    running = undefined;
    await writeFile(
      resultPath,
      JSON.stringify(
        {
          status: "passed",
          artifactSha256: createHash("sha256").update(artifact).digest("hex"),
          timings,
          audits: [firstAudit, finalAudit],
          startup: { backgroundContentIpc: true, localStorageTables: startupTables },
          lifecycle: {
            matchingContentIds: true,
            crossLibrarySubscribeRejected: true,
            oldViewUpdateRejected: true,
            diskVerifiedAfter: ["switch", "close-database", "quit"],
            restartedSubscriptionVerified: true,
            restartedBaselineVerified: true,
          },
          scope:
            "真实生产主进程/模块/正文IPC/SQLite；RPC端口与网络及OS副作用由测试边界隔离；无视觉验收",
        },
        null,
        2
      )
    );
  } finally {
    db?.close();
    await disposeSandbox(directory, running);
  }
});

test("真实生产 IPC 共用项目正文、重复构建文章与删除最后持有者", async () => {
  test.setTimeout(180_000);
  const databaseName = "content-production-ownership";
  const directory = await createSandbox("tau-content-ownership-");
  let running: ElectronApplication | undefined;
  let db: DatabaseSync | undefined;
  try {
    await rm(ownershipResultPath, { force: true });
    const artifact = await readFile(join(desktop, "dist-electron/main/index.js"));
    const port = await availablePort();
    const started = performance.now();
    const { app, page } = await launch(directory, port, app => {
      running = app;
    });
    await invoke(page, "create-or-connect-database", databaseName);
    const { project, projectText, item, preparedContent } = await createOwnershipProject(page);
    const peerText = "连接对端";
    const peer = await invoke<Card>(page, "create-card", {
      tags: [],
      isTop: false,
      ...preparedContent(peerText),
    });
    expect(peer.contentId).not.toBe(item.contentId);
    expect(
      await invoke(page, "content-links:add-by-content-id", item.contentId, peer.contentId)
    ).toBe(true);

    const database = new DatabaseSync(join(directory, "home/.editor", `${databaseName}.db`), {
      readOnly: true,
    });
    db = database;
    const refCount = (contentId: number) => contentRefCount(database, contentId);
    const document = () => documentHead(database, item.contentId);
    const link = () =>
      database
        .prepare("SELECT 1 AS found FROM content_links WHERE content_id=? AND target_content_id=?")
        .get(Math.min(item.contentId, peer.contentId), Math.max(item.contentId, peer.contentId));
    const initialDocument = document();
    expect(initialDocument).toMatchObject({ document_id: expect.any(String) });
    expect(link()).toEqual({ found: 1 });
    const referenceCounts = [refCount(item.contentId)];

    type Article = { id: number; contentId: number; title: string; tags: string[] };
    const article = await invoke<Article>(page, "build-article-from-content", item.contentId);
    expect(article).toMatchObject({ contentId: item.contentId, title: "", tags: [] });
    expect(
      database.prepare("SELECT content_id,title,tags FROM articles WHERE id=?").get(article.id)
    ).toEqual({ content_id: item.contentId, title: "", tags: "[]" });
    referenceCounts.push(refCount(item.contentId));
    const repeated = await invoke<Article>(
      page,
      "build-article-from-content",
      item.contentId,
      "重试不覆盖原文题名"
    );
    expect(repeated).toMatchObject({
      id: article.id,
      contentId: item.contentId,
      title: "",
      tags: [],
    });
    expect(
      database.prepare("SELECT id FROM articles WHERE content_id=?").all(item.contentId)
    ).toEqual([{ id: article.id }]);
    referenceCounts.push(refCount(item.contentId));

    expect(await invoke(page, "delete-article", article.id)).toBe(1);
    expect(database.prepare("SELECT id FROM articles WHERE id=?").get(article.id)).toBeUndefined();
    referenceCounts.push(refCount(item.contentId));
    expect(document()).toEqual(initialDocument);
    expect(link()).toEqual({ found: 1 });
    const remaining = await invoke<{ contentId: number; content: ContentNode[] }>(
      page,
      "get-project-item",
      item.id
    );
    expect(remaining.contentId).toBe(item.contentId);
    expect(bodyText(remaining.content)).toBe(projectText);

    await invoke(page, "remove-root-project-item", project.id, item.id, false);
    referenceCounts.push(refCount(item.contentId));
    expect(referenceCounts).toEqual([1, 2, 2, 1, null]);
    expect(database.prepare("SELECT children FROM project WHERE id=?").get(project.id)).toEqual({
      children: "[]",
    });
    expect(database.prepare("SELECT id FROM project_item WHERE id=?").get(item.id)).toBeUndefined();
    expect(document()).toBeUndefined();
    expect(link()).toBeUndefined();
    expect(
      database
        .prepare("SELECT 1 FROM content_pending_releases WHERE content_id=?")
        .get(item.contentId)
    ).toBeUndefined();
    expect(refCount(peer.contentId)).toBe(1);
    expect(bodyText(persistedNodes(database, peer.contentId))).toBe(peerText);

    database.close();
    db = undefined;
    await close(app);
    running = undefined;
    await writeFile(
      ownershipResultPath,
      JSON.stringify(
        {
          status: "passed",
          artifactSha256: createHash("sha256").update(artifact).digest("hex"),
          elapsedMs: performance.now() - started,
          referenceCounts,
          reusedArticleId: repeated.id === article.id,
          defaultArticleTags: article.tags,
          survivingProjectBodyVerified: true,
          finalDocumentAndLinkRemoved: true,
          linkedPeerUnmodified: true,
        },
        null,
        2
      )
    );
  } finally {
    db?.close();
    await disposeSandbox(directory, running);
  }
});

test("真实生产 IPC 构建卡片复用、项目派生卡片独立持有及删除", async () => {
  test.setTimeout(180_000);
  const databaseName = "content-production-card-ownership";
  const directory = await createSandbox("tau-content-card-ownership-");
  let running: ElectronApplication | undefined;
  let db: DatabaseSync | undefined;
  try {
    await rm(cardOwnershipResultPath, { force: true });
    const artifact = await readFile(join(desktop, "dist-electron/main/index.js"));
    const port = await availablePort();
    const started = performance.now();
    const { app, page } = await launch(directory, port, app => {
      running = app;
    });
    await invoke(page, "create-or-connect-database", databaseName);
    const { project, projectText, item } = await createOwnershipProject(page);
    const { contentId } = item;
    const database = new DatabaseSync(join(directory, "home/.editor", `${databaseName}.db`), {
      readOnly: true,
    });
    db = database;
    const refCount = () => contentRefCount(database, contentId);
    const cardIds = () =>
      database.prepare("SELECT id FROM cards WHERE content_id=? ORDER BY id").all(contentId);
    const initialDocument = documentHead(database, contentId);
    expect(initialDocument).toMatchObject({ document_id: expect.any(String) });
    const referenceCounts = [refCount()];

    const built = await invoke<Card>(page, "build-card-from-content", contentId);
    expect(built.contentId).toBe(contentId);
    referenceCounts.push(refCount());
    const repeated = await invoke<Card>(page, "build-card-from-content", contentId);
    expect(repeated.id).toBe(built.id);
    expect(cardIds()).toEqual([{ id: built.id }]);
    referenceCounts.push(refCount());

    const first = await invoke<Card>(page, "create-card-from-project-item", item.id);
    expect(first.contentId).toBe(contentId);
    referenceCounts.push(refCount());
    const second = await invoke<Card>(page, "create-card-from-project-item", item.id);
    expect(second.contentId).toBe(contentId);
    expect(new Set([built.id, first.id, second.id]).size).toBe(3);
    expect(cardIds()).toEqual([{ id: built.id }, { id: first.id }, { id: second.id }]);
    referenceCounts.push(refCount());

    expect(await invoke(page, "delete-card", built.id)).toBe(1);
    referenceCounts.push(refCount());
    expect(await invoke(page, "cards:remove-scoped", { databaseName, id: first.id })).toBe(1);
    referenceCounts.push(refCount());
    expect(await invoke(page, "delete-card", second.id)).toBe(1);
    referenceCounts.push(refCount());
    const repeatedDelete = await invoke<number>(page, "cards:remove-scoped", {
      databaseName,
      id: second.id,
    });
    expect(repeatedDelete).toBe(0);
    referenceCounts.push(refCount());
    expect(cardIds()).toEqual([]);
    expect(documentHead(database, contentId)).toEqual(initialDocument);
    const remaining = await invoke<{ contentId: number; content: ContentNode[] }>(
      page,
      "get-project-item",
      item.id
    );
    expect(remaining.contentId).toBe(contentId);
    expect(bodyText(remaining.content)).toBe(projectText);

    const last = await invoke<Card>(page, "build-card-from-content", contentId);
    expect(last.contentId).toBe(contentId);
    referenceCounts.push(refCount());
    await invoke(page, "remove-root-project-item", project.id, item.id, false);
    referenceCounts.push(refCount());
    expect(await invoke(page, "delete-card", last.id)).toBe(1);
    referenceCounts.push(refCount());
    expect(referenceCounts).toEqual([1, 2, 2, 3, 4, 3, 2, 1, 1, 2, 1, null]);
    expect(cardIds()).toEqual([]);
    expect(database.prepare("SELECT id FROM project_item WHERE id=?").get(item.id)).toBeUndefined();
    expect(documentHead(database, contentId)).toBeUndefined();
    expect(
      database.prepare("SELECT 1 FROM content_pending_releases WHERE content_id=?").get(contentId)
    ).toBeUndefined();

    database.close();
    db = undefined;
    await close(app);
    running = undefined;
    await writeFile(
      cardOwnershipResultPath,
      JSON.stringify(
        {
          status: "passed",
          artifactSha256: createHash("sha256").update(artifact).digest("hex"),
          elapsedMs: performance.now() - started,
          referenceCounts,
          reusedBuiltCardId: repeated.id === built.id,
          projectConversionsCreatedSeparateCards: first.id !== second.id,
          repeatedDelete,
          survivingProjectBodyVerified: true,
          lastCardDeletionPurgedDocument: true,
        },
        null,
        2
      )
    );
  } finally {
    db?.close();
    await disposeSandbox(directory, running);
  }
});

test("真实生产 IPC 项目条目多处挂载，解除最后挂载只释放一份正文", async () => {
  test.setTimeout(180_000);
  const databaseName = "content-production-project-ownership";
  const directory = await createSandbox("tau-content-project-ownership-");
  let running: ElectronApplication | undefined;
  let db: DatabaseSync | undefined;
  try {
    await rm(projectOwnershipResultPath, { force: true });
    const artifact = await readFile(join(desktop, "dist-electron/main/index.js"));
    const port = await availablePort();
    const started = performance.now();
    const { app, page } = await launch(directory, port, app => {
      running = app;
    });
    await invoke(page, "create-or-connect-database", databaseName);
    const { project, projectText, item, preparedContent } = await createOwnershipProject(page);
    const destination = await createOwnershipProject(page, "第二个项目", "独立的父条目正文");
    const childText = "随原条目一起挂载的子正文";
    const [, child] = await invoke<[unknown, { id: number; contentId: number }]>(
      page,
      "add-child-project-item",
      item.id,
      {
        title: "原条目的子文档",
        projectItemType: "document",
        refType: "",
        ...preparedContent(childText),
      }
    );
    const database = new DatabaseSync(join(directory, "home/.editor", `${databaseName}.db`), {
      readOnly: true,
    });
    db = database;
    const counts = () => ({
      root: contentRefCount(database, item.contentId),
      child: contentRefCount(database, child.contentId),
    });
    const projectChildren = (id: number) =>
      database.prepare("SELECT children FROM project WHERE id=?").get(id);
    const itemPlacement = (id: number) =>
      database.prepare("SELECT parents,projects,children FROM project_item WHERE id=?").get(id);
    const originalDocument = documentHead(database, item.contentId);
    const originalChildDocument = documentHead(database, child.contentId);
    expect(originalDocument).toMatchObject({ document_id: expect.any(String) });
    expect(originalChildDocument).toMatchObject({ document_id: expect.any(String) });
    const referenceCounts = [counts()];

    const card = await invoke<Card>(page, "build-card-from-content", item.contentId);
    expect(card.contentId).toBe(item.contentId);
    referenceCounts.push(counts());
    await invoke(page, "add-ref-child-project-item", destination.item.id, item.id);
    const bothProjects = JSON.stringify([project.id, destination.project.id]);
    expect(projectChildren(project.id)).toEqual({ children: JSON.stringify([item.id]) });
    expect(projectChildren(destination.project.id)).toEqual({
      children: JSON.stringify([destination.item.id]),
    });
    expect(itemPlacement(destination.item.id)).toMatchObject({
      children: JSON.stringify([item.id]),
    });
    expect(itemPlacement(item.id)).toEqual({
      parents: JSON.stringify([destination.item.id]),
      projects: bothProjects,
      children: JSON.stringify([child.id]),
    });
    expect(itemPlacement(child.id)).toEqual({
      parents: JSON.stringify([item.id]),
      projects: bothProjects,
      children: "[]",
    });
    referenceCounts.push(counts());

    await invoke(page, "remove-root-project-item", project.id, item.id);
    referenceCounts.push(counts());
    expect(projectChildren(project.id)).toEqual({ children: "[]" });
    const remainingProject = JSON.stringify([destination.project.id]);
    expect(itemPlacement(item.id)).toMatchObject({
      parents: JSON.stringify([destination.item.id]),
      projects: remainingProject,
      children: JSON.stringify([child.id]),
    });
    expect(itemPlacement(child.id)).toMatchObject({ projects: remainingProject });
    const remainingChild = await invoke<{ contentId: number; content: ContentNode[] }>(
      page,
      "get-project-item",
      child.id
    );
    expect(remainingChild.contentId).toBe(child.contentId);
    expect(bodyText(remainingChild.content)).toBe(childText);
    expect(documentHead(database, item.contentId)).toEqual(originalDocument);
    expect(documentHead(database, child.contentId)).toEqual(originalChildDocument);

    const removeLastMount = () =>
      invoke(
        page,
        "remove-child-project-item",
        destination.project.id,
        destination.item.id,
        item.id
      );
    await removeLastMount();
    referenceCounts.push(counts());
    expect(itemPlacement(item.id)).toBeUndefined();
    expect(itemPlacement(child.id)).toBeUndefined();
    expect(itemPlacement(destination.item.id)).toMatchObject({ children: "[]" });
    expect(documentHead(database, child.contentId)).toBeUndefined();
    expect(documentHead(database, item.contentId)).toEqual(originalDocument);
    expect(await removeLastMount()).toBeNull();
    referenceCounts.push(counts());
    expect(referenceCounts).toEqual([
      { root: 1, child: 1 },
      { root: 2, child: 1 },
      { root: 2, child: 1 },
      { root: 2, child: 1 },
      { root: 1, child: null },
      { root: 1, child: null },
    ]);
    const survivingCard = await invoke<Card & { content: ContentNode[] }>(
      page,
      "get-card-by-id",
      card.id
    );
    expect(survivingCard.contentId).toBe(item.contentId);
    expect(bodyText(survivingCard.content)).toBe(projectText);
    expect(contentRefCount(database, destination.item.contentId)).toBe(1);
    expect(bodyText(persistedNodes(database, destination.item.contentId))).toBe(
      destination.projectText
    );
    expect(await invoke(page, "delete-project", destination.project.id)).toBe(1);
    expect(projectChildren(destination.project.id)).toBeUndefined();
    expect(itemPlacement(destination.item.id)).toBeUndefined();
    expect(contentRefCount(database, destination.item.contentId)).toBeNull();
    expect(projectChildren(project.id)).toEqual({ children: "[]" });
    expect(contentRefCount(database, card.contentId)).toBe(1);

    database.close();
    db = undefined;
    await close(app);
    running = undefined;
    await writeFile(
      projectOwnershipResultPath,
      JSON.stringify(
        {
          status: "passed",
          artifactSha256: createHash("sha256").update(artifact).digest("hex"),
          elapsedMs: performance.now() - started,
          referenceCounts,
          omittedNotDelete: ["remove-root-project-item", "remove-child-project-item"],
          subtreeSurvivedRootUnlink: true,
          childPurgedOnLastUnlink: true,
          repeatedUnlinkDidNotRelease: true,
          survivingCardBodyVerified: true,
          projectDeletionReleasedOnlyTarget: true,
        },
        null,
        2
      )
    );
  } finally {
    db?.close();
    await disposeSandbox(directory, running);
  }
});

test("真实生产 IPC 新建卡片、独立复制文章与创建待回收正文", async () => {
  test.setTimeout(180_000);
  const databaseName = "content-production-creation";
  const directory = await createSandbox("tau-content-creation-");
  let running: ElectronApplication | undefined;
  let db: DatabaseSync | undefined;
  try {
    await rm(creationResultPath, { force: true });
    const artifact = await readFile(join(desktop, "dist-electron/main/index.js"));
    const port = await availablePort();
    const started = performance.now();
    const { app, page } = await launch(directory, port, app => {
      running = app;
    });
    await invoke(page, "create-or-connect-database", databaseName);
    const preparedContent = await prepareParagraphFixture();
    const sourceText = "同一份初始快照🙂";
    const prepared = preparedContent(sourceText);
    const card = await invoke<Card>(page, "create-card", { ...prepared, tags: [], isTop: false });
    const source = await invoke<{
      id: number;
      content: ContentNode[];
      contracts: ContentContractDictionary;
    }>(page, "content:get-by-id", card.contentId);
    expect(source.id).toBe(card.contentId);
    expect(source.contracts).toEqual(prepared.contracts);
    expect(bodyText(source.content)).toBe(sourceText);
    // 复制的两份输入都取自正式读取返回的同一快照，包含原来的节点 ID。
    const snapshot = { content: source.content, contracts: source.contracts, count: 0 };
    const article = await invoke<{ id: number; contentId: number }>(page, "create-article", {
      ...snapshot,
      title: "复制所得的新文章",
      author: "",
      tags: [],
      links: [],
      bannerBg: "",
      bannerPosition: "center",
      isTop: false,
      isDelete: false,
    });
    const pendingId = await invoke<number>(page, "content:create-pending", snapshot);
    const contentIds = [card.contentId, article.contentId, pendingId];
    expect(contentIds.every(id => Number.isSafeInteger(id) && id > 0)).toBe(true);
    expect(new Set(contentIds).size).toBe(3);

    const database = new DatabaseSync(join(directory, "home/.editor", `${databaseName}.db`), {
      readOnly: true,
    });
    db = database;
    const documents = contentIds.map(contentId => documentHead(database, contentId));
    const snapshots = contentIds.map(contentId => persistedNodes(database, contentId));
    expect(snapshots[0]).toEqual(source.content);
    for (const [index, contentId] of contentIds.entries()) {
      expect(documents[index]).toMatchObject({ document_id: expect.any(String) });
      expect(snapshots[index][0].collabId).toEqual(expect.any(String));
      expect(bodyText(snapshots[index])).toBe(sourceText);
      const stored = database
        .prepare("SELECT contracts FROM content_documents WHERE content_id=?")
        .get(contentId) as { contracts: string };
      expect(JSON.parse(stored.contracts)).toEqual(prepared.contracts);
    }
    expect(new Set(documents.map(document => document?.document_id)).size).toBe(3);
    expect(new Set(snapshots.map(nodes => nodes[0].collabId)).size).toBe(3);
    expect(database.prepare("SELECT content_id FROM cards WHERE id=?").get(card.id)).toEqual({
      content_id: card.contentId,
    });
    expect(database.prepare("SELECT content_id FROM articles WHERE id=?").get(article.id)).toEqual({
      content_id: article.contentId,
    });
    const referenceCounts = contentIds.map(contentId => contentRefCount(database, contentId));
    expect(referenceCounts).toEqual([1, 1, 0]);
    expect(database.prepare("SELECT content_id FROM content_pending_releases").all()).toEqual([
      { content_id: pendingId },
    ]);

    const articleText = "只修改独立副本";
    const articleNodes = structuredClone(snapshots[1]);
    articleNodes[0].children = [{ type: "formatted", text: articleText }];
    await invoke(page, "content:update", article.contentId, {
      content: articleNodes,
      contracts: source.contracts,
      expectedRevision: documents[1]?.revision,
    });
    expect(bodyText(persistedNodes(database, article.contentId))).toBe(articleText);
    expect(persistedNodes(database, card.contentId)).toEqual(snapshots[0]);
    expect(persistedNodes(database, pendingId)).toEqual(snapshots[2]);

    database.close();
    db = undefined;
    await close(app);
    running = undefined;
    await writeFile(
      creationResultPath,
      JSON.stringify(
        {
          status: "passed",
          artifactSha256: createHash("sha256").update(artifact).digest("hex"),
          elapsedMs: performance.now() - started,
          referenceCounts,
          distinctContentDocumentAndNodeIds: true,
          contractsPreserved: true,
          pendingReleaseRecordedOnce: true,
          articleEditLeftSourceAndPendingUnchanged: true,
        },
        null,
        2
      )
    );
  } finally {
    db?.close();
    await disposeSandbox(directory, running);
  }
});

test("真实生产 IPC 分别校验冷写和活跃正文修订，并接受和撤销 Agent 建议", async () => {
  test.setTimeout(180_000);
  const databaseName = "content-production-replacement";
  const directory = await createSandbox("tau-content-replacement-");
  let running: ElectronApplication | undefined;
  let db: DatabaseSync | undefined;
  try {
    await rm(replacementResultPath, { force: true });
    const artifact = await readFile(join(desktop, "dist-electron/main/index.js"));
    const port = await availablePort();
    const started = performance.now();
    const { app, page } = await launch(directory, port, app => {
      running = app;
    });
    await invoke(page, "create-or-connect-database", databaseName);
    const preparedContent = await prepareParagraphFixture();
    const card = await invoke<Card>(page, "create-card", {
      ...preparedContent("新建正文"),
      tags: [],
      isTop: false,
    });
    const database = new DatabaseSync(join(directory, "home/.editor", `${databaseName}.db`), {
      readOnly: true,
    });
    db = database;

    type Snapshot = {
      content: ContentNode[];
      contracts: ContentContractDictionary;
      revision: string;
    };
    const read = () => invoke<Snapshot>(page, "content:get-by-id", card.contentId);
    const replace = (snapshot: Snapshot, text: string, expectedRevision = snapshot.revision) => {
      const content = structuredClone(snapshot.content);
      content[0].children = [{ type: "formatted", text }];
      return invoke<Snapshot>(page, "content:update", card.contentId, {
        content,
        contracts: snapshot.contracts,
        expectedRevision,
      });
    };
    const textOnDisk = () => bodyText(persistedNodes(database, card.contentId));
    const initial = await read();
    const initialHead = documentHead(database, card.contentId);
    const cold = await replace(initial, "关闭会话时的替换");
    expect(cold.revision).not.toBe(initial.revision);
    expect(documentHead(database, card.contentId)).toMatchObject({
      document_id: initialHead?.document_id,
      revision: cold.revision,
    });
    await expect(replace(cold, "过期冷写", initial.revision)).rejects.toThrow(/正文修订冲突/);
    expect(textOnDisk()).toBe("关闭会话时的替换");

    const entry = await open(page, card);
    const view = await subscribe(page, entry.documentId, "replacement-view");
    const live = await read();
    expect(live.revision).not.toBe(cold.revision);
    await expect(replace(live, "误用主库修订", cold.revision)).rejects.toThrow(
      /CONTENT_VERSION_CONFLICT/
    );
    expect(textOnDisk()).toBe("关闭会话时的替换");
    const replacedText = "活跃会话里的替换";
    await replace(live, replacedText);
    await expect.poll(textOnDisk).toBe(replacedText);

    const baseline = await invoke<{ identity: NodeDocumentIdentity }>(
      page,
      "content:edit-snapshot",
      card.contentId
    );
    expect(baseline.identity).toMatchObject(view.documentIdentity);
    const refreshedView = await subscribe(page, entry.documentId, view.viewId);
    const suggested = "经用户接受的 Agent 正文";
    const edit = withTree(refreshedView, tree =>
      captureScopedTextEdit(
        tree,
        "production-edit",
        String(tree.snapshot()[0].collabId),
        0,
        replacedText.length,
        suggested
      )
    );
    const [proposal] = await invoke<{ id: string }[]>(
      page,
      "content:suggestions-create",
      card.contentId,
      {
        proposalId: "production-proposal",
        conversationKey: "production-conversation",
        baseline: baseline.identity,
        items: [{ edit, beforeText: replacedText, afterText: suggested }],
      }
    );
    expect(
      await invoke(page, "content:suggestions-accept", card.contentId, [proposal.id])
    ).toMatchObject([{ id: proposal.id, status: "accepted" }]);
    await expect.poll(textOnDisk).toBe(suggested);
    expect(
      await invoke(page, "content:suggestions-undo", card.contentId, [proposal.id])
    ).toMatchObject([{ id: proposal.id, status: "undone" }]);
    await expect.poll(textOnDisk).toBe(replacedText);
    expect(documentHead(database, card.contentId)).toMatchObject({
      document_id: initialHead?.document_id,
    });
    expect(contentRefCount(database, card.contentId)).toBe(1);

    database.close();
    db = undefined;
    await invoke(page, "local-content:unsubscribe", view.viewId);
    await close(app);
    running = undefined;
    await writeFile(
      replacementResultPath,
      JSON.stringify(
        {
          status: "passed",
          artifactSha256: createHash("sha256").update(artifact).digest("hex"),
          elapsedMs: performance.now() - started,
          coldStaleRevisionRejected: true,
          liveRejectedStoredRevision: true,
          liveReplacementPersisted: true,
          suggestionAcceptedAndUndone: true,
          documentIdentityAndOwnershipPreserved: true,
        },
        null,
        2
      )
    );
  } finally {
    db?.close();
    await disposeSandbox(directory, running);
  }
});

test("真实生产 IPC 共享发布、撤权、未知回执与解绑交接", async () => {
  test.setTimeout(180_000);
  const directory = await createSandbox("tau-content-collaboration-");
  const databaseName = "content-production-collaboration";
  let running: ElectronApplication | undefined;
  let db: DatabaseSync | undefined;
  let server: CollaborationTestServer | undefined;
  let dropReceiptsFor: string | undefined;
  let droppedReceipts = 0;
  try {
    await rm(collaborationResultPath, { force: true });
    const artifact = await readFile(join(desktop, "dist-electron/main/index.js"));
    const started = performance.now();
    const service = await startCollaborationServer(
      desktop,
      join(output, "collaboration-server"),
      join(directory, "service"),
      ({ app }) => {
        app.addHook("onSend", async (request, reply, payload) => {
          if (request.url !== dropReceiptsFor || reply.statusCode !== 200) return payload;
          // 服务端完成正式处理后再断开响应，丢包期间客户端无法通过查询确认结果。
          droppedReceipts++;
          reply.hijack();
          request.raw.socket.destroy();
          return payload;
        });
      }
    );
    server = service.server;
    const rpcPort = await availablePort();
    const { app, page } = await launch(
      directory,
      rpcPort,
      process => {
        running = process;
      },
      service.url
    );
    const state = () => invoke<CollaborationState>(page, "collaboration:state");
    const owner = await invoke<CollaborationState>(
      page,
      "collaboration:set-nickname",
      "生产 IPC 作者"
    );
    expect(owner.serverUrl).toBe(service.url);
    const ownerId = owner.deviceId;
    if (!ownerId) throw new Error("生产协作命令未登记作者身份");
    await invoke(page, "create-or-connect-database", databaseName);
    const preparedContent = await prepareParagraphFixture();
    const initial = "发布前的正文🙂";
    const card = await invoke<Card>(page, "create-card", {
      ...preparedContent(initial),
      tags: [],
      isTop: false,
    });
    const database = new DatabaseSync(join(directory, "home/.editor", `${databaseName}.db`), {
      readOnly: true,
    });
    db = database;
    const initialHead = documentHead(database, card.contentId);
    const binding = () =>
      database
        .prepare("SELECT document_id,server_url FROM collaboration_bindings WHERE content_id=?")
        .get(card.contentId);
    const textOnDisk = () => bodyText(persistedNodes(database, card.contentId));
    const entry = await open(page, card);
    expect(entry.mode).toBe("local");
    const local = await subscribe(page, entry.documentId, "publish-local-view");
    const duringFreeze = "｜冻结时排空";
    const finalLocalText = initial + duringFreeze;
    const lastLocalUpdate = append(local, initial, duringFreeze);
    await sendOnFreeze(page, local, lastLocalUpdate.bytes);
    const { documentId: room, code } = await invoke<{ documentId: string; code: string }>(
      page,
      "collaboration:create-content",
      card.contentId,
      "card",
      card.id
    );
    expect(room).not.toBe(local.documentId);
    expect(binding()).toEqual({ document_id: room, server_url: service.url });
    expect(textOnDisk()).toBe(finalLocalText);
    await expect(update(page, local, lastLocalUpdate.bytes)).rejects.toThrow(/会话已失效/);
    expect(await open(page, card)).toMatchObject({ documentId: room, mode: "shared" });
    const shared = await subscribe(page, room, "published-shared-view", "collaboration");
    expect(withTree(shared, tree => bodyText(tree.snapshot()))).toBe(finalLocalText);
    expect(shared.documentIdentity.baselineId).not.toBe(local.documentIdentity.baselineId);
    const sharedSession = async () => (await state()).sessions.find(session => session.id === room);
    await expect.poll(sharedSession).toMatchObject({ connection: "connected", pending: false });

    const member = (await (
      await fetch(`${service.url}/v1/devices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: "生产 IPC 成员" }),
      })
    ).json()) as DeviceIdentity;
    const memberRequest = (route: string, payload?: object) =>
      fetch(`${service.url}${route}`, {
        method: payload ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${member.id}:${member.secret}`,
          ...(payload ? { "Content-Type": "application/json" } : {}),
        },
        body: payload && JSON.stringify(payload),
      });
    const joinResponse = await memberRequest("/v1/join-requests", { code });
    expect(joinResponse.ok).toBe(true);
    const joinRequest = (await joinResponse.json()) as {
      id: string;
      documentId: string;
      status: string;
    };
    expect(joinRequest).toMatchObject({ status: "pending", documentId: room });
    await invoke(page, "collaboration:decide", joinRequest.id, true);
    const roomRoute = `/v1/documents/${room}`;
    expect((await memberRequest(`${roomRoute}/protocol`)).status).toBe(200);
    await invoke(page, "collaboration:remove-member", room, member.id);
    expect((await memberRequest(`${roomRoute}/protocol`)).status).toBe(403);

    const changedText = "远端提交一次后恢复回执";
    const scope = {
      edits: [
        withTree(shared, tree =>
          captureScopedTextEdit(
            tree,
            "replace-shared-text",
            String(tree.snapshot()[0].collabId),
            0,
            finalLocalText.length,
            changedText
          )
        ),
      ],
    };
    const deniedOperationId = "production-revoked-member";
    const sequence = service.server.store.operations.sequence(room);
    const denied = await memberRequest(`${roomRoute}/operations/${deniedOperationId}`, {
      kind: "scoped-edit",
      version: 2,
      baselineId: shared.documentIdentity.baselineId,
      epoch: shared.documentIdentity.epoch,
      expiresAt: Date.now() + 60_000,
      updateHash: createHash("sha256").update(JSON.stringify(scope)).digest("hex"),
      scope,
    });
    expect(denied.status).toBe(403);
    expect(service.server.store.operations.get(room, deniedOperationId, member.id)).toBeNull();
    expect(service.server.store.operations.sequence(room)).toBe(sequence);

    const operationId = "production-shared-receipt";
    const apply = () =>
      invoke<ScopedContentResult>(page, "content:apply-scoped-edit", card.contentId, {
        ...shared.documentIdentity,
        operationId,
        scope,
      });
    dropReceiptsFor = `${roomRoute}/operations/${operationId}`;
    expect(await apply()).toEqual({ status: "pending" });
    expect(droppedReceipts).toBeGreaterThanOrEqual(2);
    const operation = service.server.store.operations.get(room, operationId, ownerId);
    expect(operation).toMatchObject({
      state: "COMMITTED",
      receipt: { inverse: { edits: [expect.any(Object)] } },
    });
    const operationResponsesDropped = droppedReceipts;
    dropReceiptsFor = undefined;
    expect(await apply()).toEqual({ status: "committed", inverse: operation?.receipt?.inverse });
    expect(service.server.store.operations.sequence(room)).toBe(sequence + 1);
    await expect.poll(textOnDisk).toBe(changedText);
    await expect.poll(sharedSession).toMatchObject({ connection: "connected", pending: false });

    await sendOnFreeze(page, shared, null, "collaboration");
    dropReceiptsFor = `${roomRoute}/close`;
    await expect(invoke(page, "collaboration:leave", room)).rejects.toThrow(/fetch failed/);
    expect(service.server.store.document(room)).toMatchObject({
      status: "closed",
      closed_revision: expect.any(String),
    });
    expect(droppedReceipts).toBeGreaterThan(operationResponsesDropped);
    expect(binding()).toEqual({ document_id: room, server_url: service.url });
    expect(await sharedSession()).toMatchObject({ leaving: true, frozen: true });
    expect(textOnDisk()).toBe(changedText);
    const closeResponsesDropped = droppedReceipts - operationResponsesDropped;
    dropReceiptsFor = undefined;
    await invoke(page, "collaboration:set-nickname", "生产 IPC 作者");
    await expect.poll(binding, { timeout: 25_000 }).toBeUndefined();

    const demoted = await open(page, card);
    expect(demoted).toMatchObject({ documentId: local.documentId, mode: "local", frozen: false });
    const resumed = await subscribe(page, demoted.documentId, "demoted-local-view");
    expect(resumed.documentIdentity.epoch).toBe(shared.documentIdentity.epoch + 1);
    expect(resumed.documentIdentity.baselineId).not.toBe(shared.documentIdentity.baselineId);
    expect(withTree(resumed, tree => bodyText(tree.snapshot()))).toBe(changedText);
    const afterDemotion = "｜解绑后继续编辑";
    const nextLocalUpdate = append(resumed, changedText, afterDemotion);
    expect(nextLocalUpdate.blockId).toBe(lastLocalUpdate.blockId);
    await expect(update(page, local, nextLocalUpdate.bytes)).rejects.toThrow(/视图已失效/);
    await expect(update(page, shared, nextLocalUpdate.bytes, "collaboration")).rejects.toThrow(
      /会话已失效/
    );
    await update(page, resumed, nextLocalUpdate.bytes);
    await expect.poll(textOnDisk).toBe(changedText + afterDemotion);
    expect(documentHead(database, card.contentId)?.document_id).toBe(initialHead?.document_id);
    expect(contentRefCount(database, card.contentId)).toBe(1);
    await invoke(page, "local-content:unsubscribe", resumed.viewId);
    database.close();
    db = undefined;
    await close(app);
    running = undefined;
    await writeFile(
      collaborationResultPath,
      JSON.stringify(
        {
          status: "passed",
          artifactSha256: createHash("sha256").update(artifact).digest("hex"),
          elapsedMs: performance.now() - started,
          productionPublishDrainedLocalView: true,
          ownerApprovedAndRevokedMember: true,
          revokedOperationStatus: denied.status,
          operationResponsesDropped,
          operationCommits: 1,
          originalInverseRecovered: true,
          closeResponsesDropped,
          unknownCloseKeptBinding: true,
          retryRestoredLocalEditingWithNewBaseline: true,
          previousViewsRejected: true,
          documentNodeAndOwnershipPreserved: true,
        },
        null,
        2
      )
    );
  } finally {
    db?.close();
    dropReceiptsFor = undefined;
    await disposeSandbox(directory, running, async () => server?.app.close());
  }
});

function readCacheRow(
  directory: string,
  mode: "local" | "shared",
  table: "settings" | "sessions",
  id: string
) {
  const file = mode === "local" ? "local-content/content.db" : "collaboration/collaboration.db";
  const cache = new DatabaseSync(join(directory, "home/.editor", file), { readOnly: true });
  try {
    if (table === "settings")
      return cache.prepare("SELECT value FROM settings WHERE key=?").get(id);
    return cache.prepare("SELECT metadata FROM sessions WHERE id=?").get(id);
  } finally {
    cache.close();
  }
}

async function killAfterBindingCommit(
  app: ElectronApplication,
  page: Page,
  fault: { phase: "publish" | "demote"; database: string; contentId: number; room?: string },
  command: string,
  ...args: unknown[]
) {
  await app.evaluate((_electron, fault) => {
    Object.assign(globalThis, { __tauContentProductionBindingCrash: fault });
  }, fault);
  const child = app.process();
  const exited = new Promise<NodeJS.Signals | null>(resolve => {
    child.once("exit", (_code, signal) => resolve(signal));
  });
  const invoked = invoke(page, command, ...args).catch(() => undefined);
  await expect.poll(() => child.signalCode, { timeout: 20_000 }).toBe("SIGKILL");
  expect(await exited).toBe("SIGKILL");
  await invoked;
}

for (const phase of ["publish", "demote"] as const) {
  test(`真实生产 IPC 主库提交后硬杀恢复（${phase}）`, async () => {
    test.setTimeout(180_000);
    const directory = await createSandbox(`tau-content-${phase}-crash-`);
    const name = `content-production-${phase}-crash`;
    const databasePath = join(directory, "home/.editor", `${name}.db`);
    const outcome = join(output, `${phase}-crash-result.json`);
    let running: ElectronApplication | undefined;
    let server: CollaborationTestServer | undefined;
    let db: DatabaseSync | undefined;
    const closeRequests: string[] = [];
    try {
      await rm(outcome, { force: true });
      const artifact = await readFile(join(desktop, "dist-electron/main/index.js"));
      const started = performance.now();
      const service = await startCollaborationServer(
        desktop,
        join(output, "collaboration-server"),
        join(directory, "service"),
        ({ app }) => {
          app.addHook("onRequest", async request => {
            if (request.method === "POST" && request.url.endsWith("/close"))
              closeRequests.push(request.url);
          });
        }
      );
      server = service.server;
      const start = async () =>
        launch(directory, await availablePort(), app => (running = app), service.url);
      const first = await start();
      await invoke(first.page, "create-or-connect-database", name);
      const owner = await invoke<CollaborationState>(
        first.page,
        "collaboration:set-nickname",
        "硬杀恢复作者"
      );
      const ownerId = owner.deviceId;
      if (!ownerId) throw new Error("未登记作者身份");
      const prepare = await prepareParagraphFixture();
      const before = "原正文🙂";
      const card = await invoke<Card>(first.page, "create-card", {
        ...prepare(before),
        tags: [],
        isTop: false,
      });
      const source = new DatabaseSync(databasePath, { readOnly: true });
      db = source;
      const binding = () =>
        source
          .prepare("SELECT document_id FROM collaboration_bindings WHERE content_id=?")
          .get(card.contentId) as { document_id: string } | undefined;
      const textOnDisk = () => bodyText(persistedNodes(source, card.contentId));
      const initialDocumentId = documentHead(source, card.contentId)?.document_id;
      const publish = (page: Page) =>
        invoke<{ documentId: string; code: string }>(
          page,
          "collaboration:create-content",
          card.contentId,
          "card",
          card.id
        );
      const localOpen = await open(first.page, card);
      const local = await subscribe(first.page, localOpen.documentId, "before-crash-local");
      const blockId = withTree(local, tree => tree.snapshot()[0].collabId);
      let room: string;
      let sharedIdentity: NodeDocumentIdentity | undefined;
      let preparedBaseline: string | undefined;
      let finalText: string;
      const fault = { phase, database: databasePath, contentId: card.contentId };
      if (phase === "publish") {
        const last = "｜冻结前最后输入";
        finalText = before + last;
        await sendOnFreeze(first.page, local, append(local, before, last).bytes);
        await killAfterBindingCommit(
          first.app,
          first.page,
          fault,
          "collaboration:create-content",
          card.contentId,
          "card",
          card.id
        );
        running = undefined;
        const bound = binding();
        if (!bound) throw new Error("硬杀后未发现已提交的房间绑定");
        room = bound.document_id;
        expect(readCacheRow(directory, "shared", "sessions", room)).toBeUndefined();
        expect(readCacheRow(directory, "local", "sessions", local.documentId)).toBeDefined();
        const saved = readCacheRow(
          directory,
          "local",
          "settings",
          `publishing:${local.documentId}`
        );
        if (typeof saved?.value !== "string") throw new Error("缺少原发布候选");
        const candidate = JSON.parse(saved.value);
        expect(candidate).toMatchObject({ documentId: room, serverUrl: service.url });
        preparedBaseline = candidate.baselineId;
        expect(service.server.store.document(room)).toMatchObject({
          owner_id: ownerId,
          status: "active",
        });
      } else {
        await sendOnFreeze(first.page, local, null);
        ({ documentId: room } = await publish(first.page));
        const shared = await subscribe(first.page, room, "before-crash-shared", "collaboration");
        sharedIdentity = shared.documentIdentity;
        const extra = "｜共享终稿";
        finalText = before + extra;
        await update(first.page, shared, append(shared, before, extra).bytes, "collaboration");
        await expect.poll(textOnDisk).toBe(finalText);
        await expect
          .poll(async () =>
            (await invoke<CollaborationState>(first.page, "collaboration:state")).sessions.find(
              session => session.id === room
            )
          )
          .toMatchObject({ connection: "connected", pending: false });
        await sendOnFreeze(first.page, shared, null, "collaboration");
        await killAfterBindingCommit(
          first.app,
          first.page,
          { ...fault, room },
          "collaboration:leave",
          room
        );
        running = undefined;
        expect(binding()).toBeUndefined();
        expect(readCacheRow(directory, "local", "sessions", local.documentId)).toBeUndefined();
        expect(readCacheRow(directory, "shared", "sessions", room)).toBeDefined();
        expect(readCacheRow(directory, "shared", "settings", `close-confirmed:${room}`)).toEqual({
          value: "true",
        });
        expect(service.server.store.document(room)).toMatchObject({
          owner_id: ownerId,
          status: "closed",
          closed_revision: expect.any(String),
        });
        const saved = readCacheRow(directory, "local", "settings", `demoting:${local.documentId}`);
        if (typeof saved?.value === "string") {
          const candidate = JSON.parse(saved.value);
          expect(candidate).toMatchObject({
            epoch: shared.documentIdentity.epoch + 1,
            info: {
              source: { projectionRevision: documentHead(source, card.contentId)?.revision },
            },
          });
          preparedBaseline = candidate.baselineId;
        }
      }
      const checkpoint = JSON.parse(
        await readFile(join(directory, `${phase}-after-library-commit.json`), "utf8")
      );
      expect(checkpoint).toEqual(
        phase === "publish"
          ? { phase, contentId: card.contentId, after: room }
          : { phase, contentId: card.contentId, before: room }
      );
      expect(textOnDisk()).toBe(finalText);
      const sequence = service.server.store.operations.sequence(room);
      const restarted = await start();
      await invoke(restarted.page, "create-or-connect-database", name);
      const entry = await open(restarted.page, card);
      const resumed =
        phase === "publish"
          ? await subscribe(restarted.page, entry.documentId, "resumed-shared", "collaboration")
          : await subscribe(restarted.page, entry.documentId, "resumed-local");
      expect(withTree(resumed, tree => bodyText(tree.snapshot()))).toBe(finalText);
      expect(withTree(resumed, tree => tree.snapshot()[0].collabId)).toBe(blockId);
      expect(documentHead(source, card.contentId)?.document_id).toBe(initialDocumentId);
      expect(contentRefCount(source, card.contentId)).toBe(1);
      if (phase === "publish") {
        expect(entry).toMatchObject({ documentId: room, mode: "shared", frozen: false });
        expect(resumed.documentIdentity.epoch).toBe(0);
        expect(resumed.documentIdentity.baselineId).toBe(preparedBaseline);
        expect(binding()).toEqual({ document_id: room });
        expect(await publish(restarted.page)).toMatchObject({ documentId: room });
        expect(service.server.store.list(ownerId).map(document => document.id)).toEqual([room]);
        await expect
          .poll(() =>
            readCacheRow(directory, "local", "settings", `publishing:${local.documentId}`)
          )
          .toBeUndefined();
        expect(readCacheRow(directory, "local", "sessions", local.documentId)).toBeUndefined();
        expect(readCacheRow(directory, "shared", "sessions", room)).toBeDefined();
        expect(closeRequests).toEqual([]);
      } else {
        expect(entry).toMatchObject({ documentId: local.documentId, mode: "local", frozen: false });
        if (!sharedIdentity) throw new Error("缺少解绑前基线");
        expect(resumed.documentIdentity.epoch).toBe(sharedIdentity.epoch + 1);
        expect(resumed.documentIdentity.baselineId).not.toBe(sharedIdentity.baselineId);
        expect(resumed.documentIdentity.baselineId).toBe(preparedBaseline);
        expect(
          readCacheRow(directory, "local", "settings", `demoting:${local.documentId}`)
        ).toBeUndefined();
        const retry = await open(restarted.page, card);
        const same = await subscribe(restarted.page, retry.documentId, resumed.viewId);
        expect(same.documentIdentity).toEqual(resumed.documentIdentity);
        const continued = "｜解绑后继续保存";
        await update(restarted.page, resumed, append(resumed, finalText, continued).bytes);
        await expect.poll(textOnDisk).toBe(finalText + continued);
        await expect
          .poll(() => readCacheRow(directory, "shared", "sessions", room), { timeout: 25_000 })
          .toBeUndefined();
        await sendOnFreeze(restarted.page, resumed, null);
        const newShare = await publish(restarted.page);
        expect(newShare.documentId).not.toBe(room);
        expect(binding()).toEqual({ document_id: newShare.documentId });
        expect(service.server.store.list(ownerId).map(document => document.id)).toEqual([
          newShare.documentId,
        ]);
        expect(closeRequests).toEqual([`/v1/documents/${room}/close`]);
      }
      expect(service.server.store.operations.sequence(room)).toBe(sequence);
      source.close();
      db = undefined;
      // 活跃的退出租约同常规关闭一样走保存屏障。
      if (phase === "publish") await sendOnFreeze(restarted.page, resumed, null, "collaboration");
      await close(restarted.app);
      running = undefined;
      await writeFile(
        outcome,
        JSON.stringify(
          {
            status: "passed",
            artifactSha256: createHash("sha256").update(artifact).digest("hex"),
            elapsedMs: performance.now() - started,
            phase,
            signal: "SIGKILL",
            checkpointBeforeSessionInstall: true,
            preservedBodyNodeAndOwnership: true,
            restoredEpoch: resumed.documentIdentity.epoch,
            closeRequests: closeRequests.length,
            resumedOriginalRoom: phase === "publish",
            republishedNewRoom: phase === "demote",
          },
          null,
          2
        )
      );
    } finally {
      db?.close();
      await disposeSandbox(directory, running, async () => server?.app.close());
    }
  });
}

test("真实生产 IPC 整篇条件替换双丢回执后重开按原操作恢复", async () => {
  test.setTimeout(180_000);
  const directory = await createSandbox("tau-content-condition-recovery-");
  const name = "content-production-condition-recovery";
  const outcome = join(output, "shared-replacement-restart-result.json");
  let running: ElectronApplication | undefined;
  let server: CollaborationTestServer | undefined;
  let db: DatabaseSync | undefined;
  let traceOperations = false;
  let drop = true;
  const traffic: { id: string; method: string; dropped: boolean }[] = [];
  try {
    await rm(outcome, { force: true });
    const artifact = await readFile(join(desktop, "dist-electron/main/index.js"));
    const started = performance.now();
    const service = await startCollaborationServer(
      desktop,
      join(output, "collaboration-server"),
      join(directory, "service"),
      ({ app }) => {
        app.addHook("onSend", async (request, reply, payload) => {
          const id = request.url.match(/^\/v1\/documents\/[^/]+\/operations\/([^/]+)$/)?.[1];
          if (!id || !traceOperations) return payload;
          const dropped = drop && reply.statusCode === 200;
          traffic.push({ id, method: request.method, dropped });
          if (dropped) {
            reply.hijack();
            request.raw.socket.destroy();
          }
          return payload;
        });
      }
    );
    server = service.server;
    const start = async () =>
      launch(directory, await availablePort(), app => (running = app), service.url);
    const first = await start();
    await invoke(first.page, "create-or-connect-database", name);
    const owner = await invoke<CollaborationState>(
      first.page,
      "collaboration:set-nickname",
      "整篇回执作者"
    );
    if (!owner.deviceId) throw new Error("未登记作者身份");
    const prepare = await prepareParagraphFixture();
    const card = await invoke<Card>(first.page, "create-card", {
      ...prepare("整篇替换的原始正文"),
      tags: [],
      isTop: false,
    });
    const database = new DatabaseSync(join(directory, "home/.editor", `${name}.db`), {
      readOnly: true,
    });
    db = database;
    const initialDocumentId = documentHead(database, card.contentId)?.document_id;
    const { documentId: room } = await invoke<{ documentId: string }>(
      first.page,
      "collaboration:create-content",
      card.contentId,
      "card",
      card.id
    );
    await open(first.page, card);
    await expect
      .poll(async () =>
        (await invoke<CollaborationState>(first.page, "collaboration:state")).sessions.find(
          session => session.id === room
        )
      )
      .toMatchObject({ connection: "connected", pending: false });
    type Snapshot = {
      content: ContentNode[];
      contracts: ContentContractDictionary;
      revision: string;
    };
    const read = (page: Page) => invoke<Snapshot>(page, "content:get-by-id", card.contentId);
    await expect
      .poll(async () => (await read(first.page)).revision)
      .toBe(service.server.store.protocols.state(room).revision);
    const snapshot = await read(first.page);
    const replacedText = "远端确认的整篇候选";
    const content = structuredClone(snapshot.content);
    content[0].children = [{ type: "formatted", text: replacedText }];
    const payload = { content, contracts: snapshot.contracts, expectedRevision: snapshot.revision };
    const apply = (page: Page, value = payload) =>
      invoke<Snapshot>(page, "content:update", card.contentId, value);
    const sequence = service.server.store.operations.sequence(room);
    traceOperations = true;
    let pending: unknown;
    try {
      await apply(first.page);
    } catch (error) {
      pending = error;
    }
    const posts = () => traffic.filter(item => item.method === "POST");
    expect(posts()).toHaveLength(1);
    const { id: operationId } = posts()[0];
    expect(traffic).toEqual(
      expect.arrayContaining([
        { id: operationId, method: "POST", dropped: true },
        { id: operationId, method: "GET", dropped: true },
      ])
    );
    expect(service.server.store.operations.get(room, operationId, owner.deviceId)).toMatchObject({
      state: "COMMITTED",
      expectedRevision: snapshot.revision,
    });
    expect(service.server.store.operations.sequence(room)).toBe(sequence + 1);
    const exited = new Promise<NodeJS.Signals | null>(resolve =>
      first.app.process().once("exit", (_code, signal) => resolve(signal))
    );
    first.app.process().kill("SIGKILL");
    expect(await exited).toBe("SIGKILL");
    running = undefined;
    drop = false;

    const restarted = await start();
    await invoke(restarted.page, "create-or-connect-database", name);
    expect(await open(restarted.page, card)).toMatchObject({ documentId: room, mode: "shared" });
    const recovered = await apply(restarted.page);
    expect(String(pending)).toContain(`CONTENT_REPLACEMENT_PENDING: ${operationId}`);
    expect(bodyText(recovered.content)).toBe(replacedText);
    expect(recovered.content[0].collabId).toBe(content[0].collabId);
    expect(traffic).toContainEqual({ id: operationId, method: "GET", dropped: false });
    const conflicting = structuredClone(payload);
    conflicting.content[0].children = [{ type: "formatted", text: "另一个陈旧请求" }];
    await expect(apply(restarted.page, conflicting)).rejects.toThrow(/CONTENT_VERSION_CONFLICT/);

    const outsider = (await (
      await fetch(`${service.url}/v1/devices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: "未加入的设备" }),
      })
    ).json()) as DeviceIdentity;
    const denied = await fetch(`${service.url}/v1/documents/${room}/operations/${operationId}`, {
      headers: { Authorization: `Bearer ${outsider.id}:${outsider.secret}` },
    });
    expect(denied.status).toBe(403);
    expect(posts()).toHaveLength(1);
    expect(service.server.store.operations.sequence(room)).toBe(sequence + 1);
    await expect.poll(() => bodyText(persistedNodes(database, card.contentId))).toBe(replacedText);
    expect(documentHead(database, card.contentId)?.document_id).toBe(initialDocumentId);
    expect(contentRefCount(database, card.contentId)).toBe(1);
    database.close();
    db = undefined;
    await close(restarted.app);
    running = undefined;
    await writeFile(
      outcome,
      JSON.stringify(
        {
          status: "passed",
          artifactSha256: createHash("sha256").update(artifact).digest("hex"),
          elapsedMs: performance.now() - started,
          operationsPosted: posts().length,
          originalIdQueriedAfterRestart: true,
          responsesDropped: traffic.filter(item => item.dropped).length,
          remoteSequencesAdded: 1,
          staleRevisionRejected: true,
          unauthorizedReceiptStatus: denied.status,
          stableDocumentNodeAndOwner: true,
        },
        null,
        2
      )
    );
  } finally {
    db?.close();
    await disposeSandbox(directory, running, async () => server?.app.close());
  }
});

test("真实生产 IPC 冷写和活跃正文待办保留身份，重启补齐索引", async () => {
  test.setTimeout(180_000);
  const directory = await createSandbox("tau-content-tasks-index-");
  const name = "content-production-tasks-index";
  const result = join(output, "tasks-index-result.json");
  const home = join(directory, "home/.editor");
  const index = join(home, "index", name, `${name}.index.db`);
  const earlierIndex = join(directory, "earlier.index.db");
  const initialTitle = "tauoldzephyr";
  const revisedTitle = "taunewopal";
  const editorAddition = " confirmed";
  const finalTitle = revisedTitle + editorAddition;
  let running: ElectronApplication | undefined;
  let db: DatabaseSync | undefined;
  try {
    await rm(result, { force: true });
    const artifact = await readFile(join(desktop, "dist-electron/main/index.js"));
    const start = async () => {
      const instance = await launch(directory, await availablePort(), app => (running = app));
      await invoke(instance.page, "create-or-connect-database", name);
      return instance;
    };
    const stop = async (app: ElectronApplication) => {
      await close(app);
      running = undefined;
    };
    const cold = await start();
    const prepare = await prepareParagraphFixture();
    const target = await invoke<Card>(cold.page, "create-card", {
      ...prepare("索引导航目标"),
      tags: [],
      isTop: false,
    });
    const whiteboard = await invoke<{ content: { id: number }; reference: ContentEntityReference }>(
      cold.page,
      "white-board-content:create-pending",
      { name: "待办正文的嵌入页", imgUrl: "", data: { children: [] } }
    );
    const [link, embed] = await Promise.all([
      prepareContentContract("host.content-link", {
        type: "content-link",
        dataVersion: 1,
        kind: "inline",
      }),
      prepareContentContract("host.whiteboard", {
        type: "whiteboard",
        dataVersion: 1,
        kind: "block",
        isVoid: true,
      }),
    ]);
    const body = prepare("保留粗体🙂");
    const source = await invoke<Card>(cold.page, "create-card", {
      ...body,
      tags: [],
      isTop: false,
      contracts: { ...body.contracts, [link.id]: link.contract, [embed.id]: embed.contract },
      content: [
        {
          ...body.content[0],
          children: [
            { ...body.content[0].children[0], bold: true },
            {
              type: "content-link",
              tauContract: link.id,
              refId: target.id,
              contentId: target.contentId,
              contentType: "card",
              contentTitle: "索引导航目标",
              children: [{ type: "formatted", text: "索引导航目标" }],
            },
            { type: "formatted", text: "。", italic: true },
          ],
        },
        {
          type: "whiteboard",
          tauContract: embed.id,
          whiteboardContentId: whiteboard.content.id,
          entityRef: whiteboard.reference,
          children: [{ type: "formatted", text: "" }],
        },
      ],
    });
    const main = new DatabaseSync(join(home, `${name}.db`), { readOnly: true });
    db = main;
    const originalHead = documentHead(main, source.contentId);
    const originalNodes = persistedNodes(main, source.contentId);
    const originalContractRows = Object.keys(body.contracts).concat(link.id, embed.id).sort();
    const originalRelations = () =>
      main
        .prepare(
          "SELECT node_id, slot, source_id, entity_kind, entity_id FROM content_entity_relations WHERE document_id=? ORDER BY node_id, slot"
        )
        .all(originalHead?.document_id as string);
    const expectedRelations = [
      {
        node_id: originalNodes[1].collabId,
        slot: "entityRef",
        source_id: whiteboard.reference.sourceId,
        entity_kind: whiteboard.reference.kind,
        entity_id: whiteboard.reference.entityId,
      },
    ];
    expect(originalRelations()).toEqual(expectedRelations);
    const tasks = (page: Page) =>
      invoke<AssistantQueryResult<AssistantTask>>(
        page,
        "task-assistant:read",
        "query_todos",
        { contentId: source.contentId },
        { databaseName: name }
      );
    const taskWrite = (page: Page, command: string, item: Record<string, unknown>) =>
      invoke<TaskOperationResult>(
        page,
        "task-assistant:write",
        command,
        item,
        "production-tasks-index",
        undefined,
        { databaseName: name }
      );
    const taskStart = await tasks(cold.page);
    expect(taskStart.items).toEqual([]);
    expect(taskStart.document).toMatchObject({ contentId: source.contentId });
    const created = await taskWrite(cold.page, "create_todo", {
      requestId: "cold-create-task",
      title: initialTitle,
      document: taskStart.document,
    });
    expect(created).toMatchObject({ status: "succeeded", operationId: expect.any(String) });
    const coldTask = (await tasks(cold.page)).items[0];
    expect(coldTask).toMatchObject({
      title: initialTitle,
      taskRef: { kind: "document", contentId: source.contentId },
    });
    if (coldTask.taskRef.kind !== "document") throw new Error("未创建正文待办");
    const taskRef = coldTask.taskRef;
    const taskNodes = persistedNodes(main, source.contentId).slice(2);
    expect(taskNodes).toHaveLength(1);
    const checkItem = taskNodes[0].children?.[0];
    expect(checkItem).toMatchObject({
      type: "check-list-item",
      taskId: taskRef.taskId,
      collabId: expect.any(String),
      children: [{ type: "paragraph", children: [{ text: initialTitle }] }],
    });
    const readIndex = () => {
      let database: DatabaseSync | undefined;
      try {
        database = new DatabaseSync(index, { readOnly: true });
        return {
          state: database
            .prepare("SELECT value FROM index_meta WHERE key='fts_rebuild_state'")
            .get(),
          terms: database
            .prepare("SELECT content FROM content_fts WHERE prefixed_id=? ORDER BY chunk_index")
            .all(`card:${source.id}`)
            .map(row => ({ content: String(row.content).replace(/\s+/g, " ") })),
          refs: database
            .prepare(
              "SELECT dst_kind, dst_id, dst_content_id FROM entity_refs WHERE src_content_id=?"
            )
            .all(source.contentId),
          embeds: database
            .prepare("SELECT page_id FROM whiteboard_embeds WHERE host_content_id=?")
            .all(source.contentId),
          tasks: database
            .prepare("SELECT task_id,title FROM doc_tasks WHERE content_id=?")
            .all(source.contentId),
        };
      } catch (error) {
        if (
          error instanceof Error &&
          /unable to open|no such table|database is locked/.test(error.message)
        )
          return null;
        throw error;
      } finally {
        database?.close();
      }
    };
    const assertIndex = async (title: string) => {
      await expect.poll(readIndex, { timeout: 25_000 }).toMatchObject({
        state: { value: "ready" },
        terms: expect.arrayContaining([{ content: expect.stringContaining(title) }]),
        refs: [{ dst_kind: "card", dst_id: target.id, dst_content_id: target.contentId }],
        embeds: [{ page_id: whiteboard.content.id }],
        tasks: [{ task_id: taskRef.taskId, title }],
      });
    };
    await assertIndex(initialTitle);
    await stop(cold.app);
    await copyFile(index, earlierIndex);

    const active = await start();
    const opened = await open(active.page, source);
    const view = await subscribe(active.page, opened.documentId, "production-tasks-index-view");
    const input = {
      requestId: "active-update-task",
      taskRef,
      revision: coldTask.revision,
      patch: { title: revisedTitle },
    };
    const updated = await taskWrite(active.page, "update_todo", input);
    expect(updated).toMatchObject({ status: "succeeded", operationId: expect.any(String) });
    const taskWriteHead = documentHead(main, source.contentId);
    expect(taskWriteHead?.revision).not.toBe(originalHead?.revision);
    expect(await taskWrite(active.page, "update_todo", input)).toEqual(updated);
    expect(documentHead(main, source.contentId)).toEqual(taskWriteHead);
    const stale = await taskWrite(active.page, "update_todo", {
      ...input,
      requestId: "stale-task-write",
    });
    expect(stale).toMatchObject({ status: "failed", error: { code: "VERSION_CONFLICT" } });
    const changedView = await subscribe(
      active.page,
      opened.documentId,
      "production-tasks-index-verify"
    );
    expect(changedView.documentIdentity).toEqual(view.documentIdentity);
    expect(withTree(changedView, tree => tree.snapshot()[2]?.children?.[0])).toMatchObject({
      taskId: taskRef.taskId,
      collabId: checkItem?.collabId,
      children: [{ type: "paragraph", children: [{ text: revisedTitle }] }],
    });
    await assertIndex(revisedTitle);
    const editorDelta = withTree(changedView, (tree, doc) => {
      const paragraph = tree.snapshot()[2]?.children?.[0]?.children?.[0];
      if (!paragraph?.collabId) throw new Error("待办标题没有可编辑的节点");
      const before = Y.encodeStateVector(doc);
      tree.insertText(String(paragraph.collabId), revisedTitle.length, editorAddition, "editor");
      return Array.from(Y.encodeStateAsUpdate(doc, before));
    });
    await update(active.page, changedView, editorDelta);
    await expect
      .poll(() =>
        main
          .prepare("SELECT format_version FROM content_documents WHERE content_id=?")
          .get(source.contentId)
      )
      .toEqual({ format_version: 3 });
    await assertIndex(finalTitle);
    const committed = documentHead(main, source.contentId);
    expect(committed?.revision).not.toBe(taskWriteHead?.revision);
    await invoke(active.page, "local-content:unsubscribe", changedView.viewId);
    await invoke(active.page, "local-content:unsubscribe", view.viewId);
    await stop(active.app);

    for (const recover of ["older-copy", "missing-index"] as const) {
      await rm(index, { force: true });
      await rm(`${index}-wal`, { force: true });
      await rm(`${index}-shm`, { force: true });
      if (recover === "older-copy") {
        await copyFile(earlierIndex, index);
        expect(readIndex()?.terms).toEqual(
          expect.arrayContaining([{ content: expect.stringContaining(initialTitle) }])
        );
      } else expect(readIndex()).toBeNull();

      const restarted = await start();
      await assertIndex(finalTitle);
      expect(readIndex()?.terms).not.toEqual(
        expect.arrayContaining([{ content: expect.stringContaining(initialTitle) }])
      );
      expect(
        await invoke(restarted.page, "fts-search-content", { query: revisedTitle, types: ["card"] })
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: source.id, type: "card", source: "fts" }),
        ])
      );
      expect(
        await invoke(restarted.page, "entity-context:get", { kind: "card", id: target.id })
      ).toMatchObject({ backlinks: [{ source: { ref: { kind: "card", id: source.id } } }] });
      expect((await tasks(restarted.page)).items).toMatchObject([{ taskRef, title: finalTitle }]);
      expect(documentHead(main, source.contentId)).toEqual(committed);
      expect(persistedNodes(main, source.contentId).slice(0, 2)).toEqual(originalNodes);
      expect(originalRelations()).toEqual(expectedRelations);
      expect(contentRefCount(main, target.contentId)).toBe(1);
      expect(contentRefCount(main, source.contentId)).toBe(1);
      expect(
        main
          .prepare("SELECT ref_count FROM white_board_contents WHERE id=?")
          .get(whiteboard.content.id)
      ).toEqual({ ref_count: 1 });
      const row = main
        .prepare("SELECT contracts, format_version FROM content_documents WHERE content_id=?")
        .get(source.contentId);
      expect(row).toMatchObject({ format_version: 3 });
      expect(Object.keys(JSON.parse(String(row?.contracts)))).toEqual(
        expect.arrayContaining(originalContractRows)
      );
      await stop(restarted.app);
    }
    await writeFile(
      result,
      JSON.stringify(
        {
          status: "passed",
          artifactSha256: createHash("sha256").update(artifact).digest("hex"),
          coldCreate: true,
          liveTaskUpdate: true,
          editorDeltaStoredAsBlocks: true,
          replayDidNotAdvanceRevision: true,
          staleRejected: true,
          rebuiltAfter: ["older-index-copy", "deleted-index"],
          checkedDerived: ["fts", "entity-refs", "whiteboard-embeds", "doc-tasks"],
          stableDocumentNodeTaskIdentityAndReferences: true,
        },
        null,
        2
      )
    );
  } finally {
    db?.close();
    await disposeSandbox(directory, running);
  }
});
