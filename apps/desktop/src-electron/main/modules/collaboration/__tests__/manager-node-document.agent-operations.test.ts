// @vitest-environment node
import { host, resetAfterEach } from "./manager-node-document.mocks";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { NodeTree, readNodeDocument, captureScopedTextEdit } from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import ContentTable from "../../tables/content";
import { ContentDocumentTable } from "../../tables/content-document";
import { ContentDocumentBlocks } from "../../tables/content-document-blocks";
import { registerAgentEditExecution } from "../../agent-run-events";
import { NodeSessionUpdates } from "../node-session-updates";
import { SqliteNodeSessionJournal } from "../../content-runtime/sqlite-node-session-journal";
import { unregisterContentSession } from "../content-sessions";
import { restartHandoffRuntime, setup } from "./manager-node-document.helpers";

afterEach(resetAfterEach);

it.each([false, true])("正文范围提交和撤销保持其他内容完整（共享=%s）", async shared => {
  const { runtime, local, localStore, localId, event, db, server } = await setup(false, [
    "第一段",
    "第二段",
  ]);
  const sessionId = shared ? (await runtime.createContent(event, 7)).documentId : localId;
  const original = await local.agent.readEditSnapshot(db, 7);
  const snapshot = new Y.Doc();
  Y.applyUpdate(snapshot, original.state);
  const tree = new NodeTree(snapshot);
  try {
    const blockId = String(readNodeDocument(snapshot).content[0].collabId);
    const edit = captureScopedTextEdit(tree, "edit", blockId, 0, 1, "AI");
    const request = { ...original.identity, operationId: "scope-edit", scope: { edits: [edit] } };
    if (shared) {
      const transport = runtime.client.request.bind(runtime.client);
      let lost = 2;
      vi.spyOn(runtime.client, "request").mockImplementation(
        async (url, path, method, body, version) => {
          const result = await transport(url, path, method, body, version);
          if (path.endsWith("/operations/scope-edit") && lost > 0) {
            lost--;
            throw new Error("模拟响应丢失");
          }
          return result;
        }
      );
      expect(await local.agent.applyScopedEdit(db, 7, request)).toEqual({ status: "pending" });
    } else {
      const append = vi.spyOn(localStore, "append").mockImplementationOnce(() => {
        throw new Error("模拟本机落盘失败");
      });
      await expect(local.agent.applyScopedEdit(db, 7, request)).rejects.toThrow("模拟本机落盘失败");
      expect((await local.agent.readEditSnapshot(db, 7)).content).toEqual(original.content);
      append.mockRestore();
    }
    const applied = await local.agent.applyScopedEdit(db, 7, request);
    expect(applied.status).toBe("committed");
    if (applied.status !== "committed" || !applied.inverse) throw new Error("缺少撤销操作");
    expect(await local.agent.applyScopedEdit(db, 7, request)).toEqual(applied);
    const updated = await local.agent.readEditSnapshot(db, 7);
    expect(updated.content[0].children?.[0].text).toBe("AI一段");
    expect(updated.content[1]).toEqual(original.content[1]);
    const conflict = await local.agent.applyScopedEdit(db, 7, {
      ...request,
      operationId: "stale",
    });
    expect(conflict).toMatchObject({ status: "conflict", conflicts: [{ opId: "edit", blockId }] });
    const reverted = await local.agent.applyScopedEdit(db, 7, {
      ...original.identity,
      operationId: "scope-edit-undo",
      scope: applied.inverse,
    });
    expect(reverted.status).toBe("committed");
    expect((await local.agent.readEditSnapshot(db, 7)).content).toEqual(original.content);
    if (shared) expect(server.store.operations.sequence(sessionId)).toBe(2);
  } finally {
    tree.dispose();
    snapshot.destroy();
  }
});

it.each([false, true])("大段修改可原样撤销，超限不写入（共享=%s）", async shared => {
  const longOriginal = "原".repeat(40_000);
  const { runtime, local, localStore, localId, event, db, server } = await setup(false, [
    "原文",
    "第二段保留",
    longOriginal,
  ]);
  const sessionId = shared ? (await runtime.createContent(event, 7)).documentId : localId;
  const original = await local.agent.readEditSnapshot(db, 7);
  const originalSequence = shared ? server.store.operations.sequence(sessionId) : 0;
  const doc = new Y.Doc();
  Y.applyUpdate(doc, original.state);
  const tree = new NodeTree(doc);
  const propose = (proposalId: string, block: number, before: string, text: string) =>
    local.agent.suggestions.create(db, 7, {
      proposalId,
      conversationKey: proposalId,
      baseline: original.identity,
      items: [
        {
          edit: captureScopedTextEdit(
            tree,
            "edit",
            String(original.content[block].collabId),
            0,
            before.length,
            text
          ),
          beforeText: before,
          afterText: text,
        },
      ],
    })[0];
  const key = (id: string) =>
    `scoped-edit:${original.identity.documentId}:${original.identity.baselineId}:${original.identity.epoch}:${id}`;
  try {
    const oversized = propose("oversized", 2, longOriginal, "新句");
    expect(await local.agent.suggestions.accept(db, 7, [oversized.id])).toMatchObject([
      { id: oversized.id, status: "expired", error: expect.stringContaining("可撤销容量") },
    ]);
    expect((await local.agent.readEditSnapshot(db, 7)).content).toEqual(original.content);
    if (shared) {
      const ownerId = server.store.document(sessionId).owner_id;
      expect(server.store.operations.get(sessionId, oversized.id, ownerId)).toMatchObject({
        state: "ABORTED",
        reason: "UNDO_LIMIT",
      });
      expect(server.store.operations.sequence(sessionId)).toBe(originalSequence);
    } else expect(localStore.get(key(oversized.id), null)).toBeNull();

    // 正向回执在预算内，若额外记录重做，撤销回执会超限。
    const text = "新".repeat(12_000);
    const accepted = propose("large", 0, "原文", text);
    expect(await local.agent.suggestions.accept(db, 7, [accepted.id])).toEqual([
      { id: accepted.id, status: "accepted" },
    ]);
    const changed = (await local.agent.readEditSnapshot(db, 7)).content;
    expect(changed[0].children?.map(leaf => leaf.text).join("")).toBe(text);
    expect(changed.slice(1)).toEqual(original.content.slice(1));
    expect(await local.agent.suggestions.undo(db, 7, [accepted.id])).toEqual([
      { id: accepted.id, status: "undone" },
    ]);
    expect((await local.agent.readEditSnapshot(db, 7)).content).toEqual(original.content);
    if (shared) {
      const ownerId = server.store.document(sessionId).owner_id;
      const forward = server.store.operations.get(sessionId, accepted.id, ownerId);
      const reverse = server.store.operations.get(sessionId, `${accepted.id}-undo`, ownerId);
      expect(forward?.receipt?.inverse?.edits).toHaveLength(1);
      expect(reverse?.state).toBe("COMMITTED");
      expect(reverse?.receipt?.inverse).toBeUndefined();
      expect(server.store.operations.sequence(sessionId)).toBe(originalSequence + 2);
    } else {
      expect(localStore.get(key(accepted.id), null)).toMatchObject({
        inverse: { edits: [expect.anything()] },
      });
      expect(localStore.get(key(`${accepted.id}-undo`), null)).toMatchObject({
        hash: expect.any(String),
      });
    }
  } finally {
    tree.dispose();
    doc.destroy();
  }
});

it("停止 Agent 后真实本机队列只保留首个已提交片段并可撤销", async () => {
  const { local, localStore, db, localId } = await setup(false, ["第一段原文", "第二段保留"]);
  const original = await local.agent.readEditSnapshot(db, 7);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, original.state);
  const tree = new NodeTree(doc);
  const stop = registerAgentEditExecution("manager-scoped-edit");
  try {
    const id = String(original.content[0].collabId);
    const text = "甲乙丙丁戊己";
    const [item] = local.agent.suggestions.create(db, 7, {
      proposalId: "manager-stop",
      conversationKey: "test-chat",
      baseline: original.identity,
      mode: "direct",
      items: [
        {
          edit: captureScopedTextEdit(tree, "edit", id, 0, 2, text),
          beforeText: "第一",
          afterText: text,
        },
      ],
    });
    const append = localStore.append.bind(localStore);
    const spy = vi.spyOn(localStore, "append").mockImplementation((...args) => {
      append(...args);
      queueMicrotask(stop);
    });
    await local.agent.suggestions.accept(db, 7, [item.id], {
      typing: true,
      executionId: "manager-scoped-edit",
    });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    const saved = localStore.load(localId).doc;
    if (!saved) throw new Error("缺少落盘正文");
    try {
      const content = readNodeDocument(saved).content;
      expect(content[0].children?.[0].text).toBe("甲乙段原文");
      expect(content[1]).toEqual(original.content[1]);
    } finally {
      saved.destroy();
    }
    expect(
      local.agent.suggestions.list(db, { proposalId: "manager-stop" }).map(row => row.status)
    ).toEqual(["accepted", "pending"]);
    expect((await local.agent.suggestions.undo(db, 7, [item.id]))[0].status).toBe("undone");
    expect((await local.agent.readEditSnapshot(db, 7)).content).toEqual(original.content);
  } finally {
    stop();
    tree.dispose();
    doc.destroy();
  }
});

it("停止共享 Agent 时取消在途原操作，迟到的提交不写正文", async () => {
  const { runtime, local, db, event, server } = await setup(false, ["第一段原文", "第二段保留"]);
  const { documentId } = await runtime.createContent(event, 7);
  const original = await local.agent.readEditSnapshot(db, 7);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, original.state);
  const tree = new NodeTree(doc);
  const stop = registerAgentEditExecution("shared-stopped");
  let release!: () => void;
  let arrival!: () => void;
  let cancelled!: () => void;
  const delayed = new Promise<void>(resolve => {
    release = resolve;
  });
  const arrived = new Promise<void>(resolve => {
    arrival = resolve;
  });
  const cancelSeen = new Promise<void>(resolve => {
    cancelled = resolve;
  });
  try {
    const id = String(original.content[0].collabId);
    const [item] = local.agent.suggestions.create(db, 7, {
      proposalId: "shared-stop",
      conversationKey: "test-chat",
      baseline: original.identity,
      mode: "direct",
      items: [
        {
          edit: captureScopedTextEdit(tree, "edit", id, 0, 2, "替换"),
          beforeText: "第一",
          afterText: "替换",
        },
      ],
    });
    const transport = runtime.client.request.bind(runtime.client);
    vi.spyOn(runtime.client, "request").mockImplementation(
      async (url, path, method, body, version) => {
        if (method === "POST" && path.endsWith(`/operations/${item.id}`)) {
          arrival();
          await delayed;
        }
        const result = await transport(url, path, method, body, version);
        if (path.endsWith(`/operations/${item.id}/cancel`)) cancelled();
        return result;
      }
    );
    const pending = local.agent.suggestions.accept(db, 7, [item.id], {
      typing: true,
      executionId: "shared-stopped",
    });
    await arrived;
    stop();
    await cancelSeen;
    release();
    expect(await pending).toMatchObject([
      { id: item.id, status: "expired", error: "Agent 已停止，提交已取消" },
    ]);
    expect(server.store.operations.sequence(documentId)).toBe(0);
    expect((await local.agent.readEditSnapshot(db, 7)).content).toEqual(original.content);
  } finally {
    release();
    stop();
    tree.dispose();
    doc.destroy();
  }
});

it("整篇共享替换双丢响应后重开按原操作回执安装，重试只查询", async () => {
  const original = await setup();
  const { runtime, event, db, store, server, owner } = original;
  const { documentId } = await runtime.createContent(event, 7);
  const before = ContentTable.getContentById(db, 7)!;
  const body = replacementInput(before, "整篇已替换");
  const request = runtime.client.request.bind(runtime.client);
  const attempts: [string, string][] = [];
  const disconnected = vi.spyOn(runtime.client, "request").mockImplementation(async (...args) => {
    const answer = await request(...args);
    if (args[1].startsWith(`/v1/documents/${documentId}/operations/`)) {
      attempts.push([args[1], args[2] ?? "GET"]);
      throw new Error("服务器已答复，模拟连接断开");
    }
    return answer;
  });
  await expect(ContentTable.writeContent(db, 7, body)).rejects.toThrow(
    /CONTENT_REPLACEMENT_PENDING: [0-9a-f-]{36}/
  );
  disconnected.mockRestore();
  expect(attempts.map(([, method]) => method)).toEqual(["POST", "GET"]);
  const route = attempts[0][0];
  expect(attempts[1][0]).toBe(route);
  const operationId = route.split("/").at(-1)!;
  expect(server.store.operations.get(documentId, operationId, owner.id)?.state).toBe("COMMITTED");
  expect(server.store.operations.sequence(documentId)).toBe(1);
  expect(JSON.stringify(ContentTable.getContentById(db, 7)?.content)).not.toContain("整篇已替换");
  const draftId = `shared-replacement:${operationId}`;
  expect(
    store.db.prepare("SELECT applied FROM document_drafts WHERE view_id=?").get(draftId)
  ).toEqual({
    applied: 0,
  });

  const { local, shared, sharedLog } = await restartHandoffRuntime(original);
  const recovery = vi.spyOn(shared.documentClient(), "request");
  await local.open(event, { contentId: 7 });
  const accepted = await ContentTable.writeContent(db, 7, body);
  expect(JSON.stringify(accepted?.content)).toContain("整篇已替换");
  expect(
    sharedLog.db.prepare("SELECT applied FROM document_drafts WHERE view_id=?").get(draftId)
  ).toEqual({
    applied: 1,
  });
  expect(sharedLog.list().find(info => info.id === documentId)?.pending).toBe(false);
  expect(recovery.mock.calls.filter(([, path]) => path.includes("/operations/"))).toEqual([
    [host.serverUrl, route],
  ]);
  await expect(
    ContentTable.writeContent(db, 7, replacementInput(before, "过期另一个候选"))
  ).rejects.toThrow("CONTENT_VERSION_CONFLICT:");
  expect(server.store.operations.sequence(documentId)).toBe(1);
});

it("整篇共享替换查不到账本且未过原期限时保留候选，权限失败不推断终态", async () => {
  const { runtime, event, db, store, server } = await setup();
  const { documentId } = await runtime.createContent(event, 7);
  const body = replacementInput(ContentTable.getContentById(db, 7)!, "未提交的整篇候选");
  const request = runtime.client.request.bind(runtime.client);
  let route = "";
  let expiresAt = 0;
  const failures = vi.spyOn(runtime.client, "request").mockImplementation(async (...args) => {
    if (args[1].includes("/operations/") && args[2] === "POST") {
      route = args[1];
      expiresAt = (args[3] as { expiresAt: number }).expiresAt;
      throw new Error("连接在提交之前断开");
    }
    return request(...args);
  });
  await expect(ContentTable.writeContent(db, 7, body)).rejects.toThrow(
    "CONTENT_REPLACEMENT_PENDING:"
  );
  const operationId = route.split("/").at(-1)!;
  const draft = () =>
    store.db
      .prepare("SELECT applied FROM document_drafts WHERE view_id=?")
      .get(`shared-replacement:${operationId}`);
  expect(draft()).toEqual({ applied: 0 });
  expect(server.store.operations.sequence(documentId)).toBe(0);

  const outsider = server.store.register("已无权限的设备");
  failures.mockImplementation(async (...args) => {
    if (args[1] !== route) return request(...args);
    const denied = await server.app.inject({
      method: "GET",
      url: route,
      headers: { authorization: `Bearer ${outsider.id}:${outsider.secret}` },
    });
    expect(denied.statusCode).toBe(403);
    throw Object.assign(new Error("无法查看端点回执"), { status: denied.statusCode });
  });
  await expect(ContentTable.writeContent(db, 7, body)).rejects.toThrow("FORBIDDEN:");
  expect(draft()).toEqual({ applied: 0 });
  failures.mockRestore();

  vi.spyOn(runtime.client, "serverTime").mockReturnValue(expiresAt + 1);
  const expired = vi.spyOn(runtime.client, "request");
  await expect(ContentTable.writeContent(db, 7, body)).rejects.toThrow("deadline");
  expect(expired.mock.calls.filter(([, path]) => path === route)).toEqual([
    [host.serverUrl, route],
  ]);
  expect(draft()).toEqual({ applied: 0 });
  expect(server.store.operations.sequence(documentId)).toBe(0);
});

const stressResults: Record<string, unknown>[] = [];

async function measureStress(name: string, run: () => Promise<Record<string, unknown>>) {
  const started = performance.now();
  const before = process.memoryUsage();
  let result: Record<string, unknown> = { name, status: "running" };
  try {
    result = { name, status: "passed", ...(await run()) };
  } catch (error) {
    result = {
      name,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
    throw error;
  } finally {
    const after = process.memoryUsage();
    result = {
      ...result,
      elapsedMs: Math.round(performance.now() - started),
      heapUsedMiB: Math.round(after.heapUsed / 1024 / 1024),
      rssMiB: Math.round(after.rss / 1024 / 1024),
      rssChangeMiB: Math.round((after.rss - before.rss) / 1024 / 1024),
    };
    stressResults.push(result);
    console.info("[content-projection-stress]", JSON.stringify(result));
    const report = process.env.TAU_CONTENT_STRESS_REPORT;
    if (report) {
      mkdirSync(dirname(report), { recursive: true });
      writeFileSync(
        report,
        JSON.stringify(
          { recordedAt: new Date().toISOString(), node: process.version, scenarios: stressResults },
          null,
          2
        )
      );
    }
  }
}

function stressLatency(samples: number[]) {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    samples: samples.length,
    p50Ms: +sorted[Math.floor(sorted.length * 0.5)].toFixed(3),
    p95Ms: +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))].toFixed(3),
    maxMs: +sorted[sorted.length - 1].toFixed(3),
  };
}

function stressRandom(seed: number) {
  let state = seed;
  return (limit: number) => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % limit;
  };
}

// 显式开启压力场景，避免常规回归承担长文构建与持续保存的成本。
describe.runIf(process.env.TAU_CONTENT_STRESS === "1")("正文投影压力", () => {
  it("单个大块的大增量先按大小压缩，主库和缓存恢复保持一致", async () => {
    await measureStress("large-single-block", async () => {
      const original = "大段正文".repeat(60 * 1024);
      const addition = "新增".repeat(120 * 1024);
      const {
        local,
        localSessions,
        db,
        localId,
        localStore: store,
      } = await setup(false, [original]);
      const session = localSessions.get(localId)!;
      await local.project(session);
      const tree = new NodeTree(session.doc);
      const compact = vi.spyOn(store, "compact");
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
      local.startAutoFlush();
      const started = performance.now();
      try {
        tree.insertText("paragraph", 0, addition, {});
        const pending = store.db
          .prepare(
            "SELECT count(*) AS count,sum(length(state)) AS bytes FROM updates WHERE document_id=?"
          )
          .get(localId) as { count: number; bytes: number };
        expect(pending.count).toBe(1);
        expect(pending.bytes).toBeGreaterThan(512 * 1024);
        await vi.advanceTimersByTimeAsync(1000);
        expect(compact).toHaveBeenCalledOnce();
        expect(ContentDocumentTable.read(db, 7)!.content[0].children![0].text).toBe(
          addition + original
        );
        const restored = store.load(localId);
        try {
          expect(readNodeDocument(restored.doc).content[0].children![0].text).toBe(
            addition + original
          );
        } finally {
          restored.doc.destroy();
        }
        return {
          singleBlockCharacters: original.length + addition.length,
          inputBytes: pending.bytes,
          editAndCheckpointMs: +(performance.now() - started).toFixed(3),
          checkpoints: compact.mock.calls.length,
        };
      } finally {
        tree.dispose();
        vi.useRealTimers();
      }
    });
  }, 120000);

  it("自动保存二十轮：增量日志有界压缩，恢复后与主库一致", async () => {
    await measureStress("auto-flush-incremental", async () => {
      const {
        local,
        localSessions,
        db,
        localId,
        localStore: store,
      } = await setup(
        false,
        Array.from({ length: 128 }, () => "正文压力".repeat(64))
      );
      const session = localSessions.get(localId)!;
      await local.project(session);
      const tree = new NodeTree(session.doc);
      const compact = vi.spyOn(store, "compact");
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
      local.startAutoFlush();
      let expected = "正文压力".repeat(64);
      try {
        for (let round = 0; round < 20; round++) {
          for (let input = 0; input < 16; input++) {
            const token = `[${round}:${input}]`;
            tree.insertText("paragraph", 0, token, {});
            expected = token + expected;
          }
          await vi.advanceTimersByTimeAsync(1000);
          expect(session.projectedVersion).toEqual(session.projectionVersion);
          expect(
            ContentDocumentTable.read(db, 7)!
              .content[0].children!.map(leaf => leaf.text)
              .join("")
          ).toBe(expected);
        }
        expect(compact).toHaveBeenCalledTimes(2);
        const pending = store.db
          .prepare("SELECT count(*) AS count FROM updates WHERE document_id=?")
          .get(localId) as { count: number };
        expect(pending.count).toBe(64);
        const loaded = store.load(localId);
        try {
          expect(readNodeDocument(loaded.doc).content).toEqual(
            readNodeDocument(session.doc).content
          );
        } finally {
          loaded.doc.destroy();
        }
        return {
          autoFlushRounds: 20,
          inputs: 320,
          fullCheckpoints: compact.mock.calls.length,
          retainedUpdates: pending.count,
        };
      } finally {
        tree.dispose();
        vi.useRealTimers();
      }
    });
  }, 120000);

  it.each([
    [32, 256],
    [256, 512],
    [1024, 1024],
  ])(
    "长文 %i 段 × %i 字：空保存、契约与连续编辑",
    async (paragraphCount, paragraphLength) => {
      await measureStress(`long-${paragraphCount}-${paragraphLength}`, async () => {
        const text = "长文压力验证"
          .repeat(Math.ceil(paragraphLength / 6))
          .slice(0, paragraphLength);
        const expected = Array.from({ length: paragraphCount }, () => text);
        const { local, localSessions, localAssets, db, localId } = await setup(false, expected);
        const session = localSessions.get(localId)!;
        await local.project(session);
        db.prepare("UPDATE contents SET update_time=100 WHERE id=7").run();
        const tree = new NodeTree(session.doc);
        const read = vi.spyOn(ContentDocumentTable, "read");
        const localize = vi.spyOn(localAssets, "localizeDocument");
        const idle: number[] = [],
          saves: number[] = [];
        try {
          for (let iteration = 0; iteration < 500; iteration++) {
            const started = performance.now();
            await local.project(session);
            idle.push(performance.now() - started);
          }
          expect(read).not.toHaveBeenCalled();
          expect(localize).not.toHaveBeenCalled();
          read.mockRestore();
          for (let iteration = 0; iteration < 5; iteration++) {
            const definition = await prepareContentContract("stress.extra", {
              type: `stress.extra-${iteration}`,
              dataVersion: 1,
              kind: "block",
            });
            await tree.installContracts({ [definition.id]: definition.contract }, {});
            await local.project(session);
          }
          expect(localize).not.toHaveBeenCalled();
          expect(ContentTable.getContentById(db, 7)!.updateTime).toBe(100);
          for (let iteration = 0; iteration < 36; iteration++) {
            const index = iteration % 2 ? paragraphCount - 1 : 0;
            const id = index ? `paragraph-${index}` : "paragraph";
            const addition = `改${iteration}`;
            const started = performance.now();
            tree.insertText(id, 0, addition, {});
            expected[index] = addition + expected[index];
            await local.project(session);
            saves.push(performance.now() - started);
            expect(
              ContentDocumentTable.read(db, 7)!.content.map(node =>
                node.children!.map(leaf => leaf.text).join("")
              )
            ).toEqual(expected);
            expect(session.projectedVersion).toEqual(session.projectionVersion);
          }
          const operations = db
            .prepare(
              "SELECT count(*) AS count FROM operation WHERE operation_content_type='content'"
            )
            .get() as { count: number };
          expect(operations.count).toBe(36);
          expect(ContentTable.getContentById(db, 7)!.updateTime).toBeGreaterThan(100);
          return {
            characters: paragraphCount * paragraphLength,
            paragraphCount,
            idle: stressLatency(idle),
            editAndSave: stressLatency(saves),
            contractWrites: 5,
            operations: operations.count,
          };
        } finally {
          tree.dispose();
        }
      });
    },
    120000
  );

  it("同值属性与重复确认：不能产生编辑时间或编辑记录", async () => {
    await measureStress("idempotent-properties", async () => {
      const { local, localSessions, db, localId } = await setup();
      const session = localSessions.get(localId)!;
      await local.project(session);
      db.prepare("UPDATE contents SET update_time=100 WHERE id=7").run();
      const tree = new NodeTree(session.doc);
      const before = ContentDocumentTable.read(db, 7)!;
      try {
        for (let iteration = 0; iteration < 100; iteration++) {
          tree.setProperties("paragraph", { isFold: true, svg: "用户业务内容" }, {});
          await local.project(session);
        }
        expect(ContentTable.getContentById(db, 7)!.updateTime).toBe(100);
        expect(ContentDocumentTable.read(db, 7)).toEqual(before);
        expect(
          db.prepare("SELECT * FROM operation WHERE operation_content_type='content'").all()
        ).toHaveLength(0);
        return { sameValueTransactions: 100 };
      } finally {
        tree.dispose();
      }
    });
  }, 60000);

  it.each([7, 43, 137, 20261102])(
    "随机编辑种子 %i：增删改移与未投影冷缓存恢复",
    async seed => {
      await measureStress(`random-${seed}`, async () => {
        const {
          local,
          localSessions,
          db,
          localId,
          event,
          localStore: store,
        } = await setup(false, ["起点甲", "起点乙", "起点丙", "起点丁"]);
        let session = localSessions.get(localId)!;
        let tree = new NodeTree(session.doc);
        const contract = String(tree.nodeSnapshot("paragraph").tauContract);
        const expected = ["起点甲", "起点乙", "起点丙", "起点丁"].map((text, index) => ({
          id: index ? `paragraph-${index}` : "paragraph",
          text,
          level: undefined as number | undefined,
        }));
        const random = stressRandom(seed);
        const verify = () => {
          const actual = ContentDocumentTable.read(db, 7)!.content;
          expect(
            actual.map(node => ({
              id: node.collabId,
              text: node.children!.map(leaf => leaf.text).join(""),
              level: node.level,
            }))
          ).toEqual(expected);
          expect(session.projectedVersion).toEqual(session.projectionVersion);
        };
        let recoveries = 0,
          saves = 0;
        try {
          for (let step = 0; step < 256; step++) {
            const index = random(expected.length);
            const target = expected[index];
            const action = random(6);
            if (action === 0 && Array.from(target.text).length > 1) {
              const letters = Array.from(target.text);
              const point = random(letters.length);
              tree.deleteText(
                target.id,
                letters.slice(0, point).join("").length,
                letters[point].length,
                {}
              );
              letters.splice(point, 1);
              target.text = letters.join("");
            } else if (action === 1) {
              const level = random(7);
              tree.setProperties(target.id, { level }, {});
              target.level = level;
            } else if (action === 2 && expected.length > 1) {
              const destination = random(expected.length);
              tree.moveNode(target.id, null, destination, {});
              expected.splice(index, 1);
              expected.splice(destination, 0, target);
            } else if (action === 3 && expected.length < 12) {
              const created = { id: `new-${seed}-${step}`, text: `新增${step}`, level: undefined };
              tree.insertNode(
                {
                  type: "paragraph",
                  collabId: created.id,
                  tauContract: contract,
                  children: [{ type: "formatted", text: created.text }],
                },
                null,
                index,
                {},
                true
              );
              expected.splice(index, 0, created);
            } else if (action === 4 && expected.length > 1) {
              tree.removeNodes([target.id], {});
              expected.splice(index, 1);
            } else {
              const letters = Array.from(target.text);
              const point = random(letters.length + 1);
              const addition = ["中", "ab", "🙂", "é"][random(4)];
              tree.insertText(target.id, letters.slice(0, point).join("").length, addition, {});
              letters.splice(point, 0, addition);
              target.text = letters.join("");
            }
            if (step % 64 === 63) {
              tree.dispose();
              store.compact(localId, session.doc);
              unregisterContentSession(session);
              session.awareness.destroy();
              session.doc.destroy();
              localSessions.delete(localId);
              await local.open(event, { contentId: 7 });
              session = localSessions.get(localId)!;
              tree = new NodeTree(session.doc);
              recoveries++;
            }
            if (step % 8 === 7) {
              await local.project(session);
              verify();
              saves++;
            }
          }
          return {
            seed,
            mutations: 256,
            saves,
            coldRecoveries: recoveries,
            finalNodes: expected.length,
          };
        } finally {
          tree.dispose();
        }
      });
    },
    120000
  );

  it("源码、格式、撤销重做：各类正文事务都正常推进保存", async () => {
    await measureStress("source-format-history", async () => {
      const { local, localSessions, db, localId } = await setup();
      const session = localSessions.get(localId)!;
      const tree = new NodeTree(session.doc);
      const source = await prepareContentContract("stress.source", {
        type: "stress.source",
        dataVersion: 1,
        kind: "block",
        isVoid: true,
        collaboration: { textFields: ["code"] },
      });
      await tree.installContracts({ [source.id]: source.contract }, {});
      tree.insertNode(
        {
          type: "stress.source",
          collabId: "source",
          tauContract: source.id,
          code: "初始源码",
          children: [{ text: "" }],
        },
        null,
        1,
        {},
        true
      );
      await local.project(session);
      const origin = {};
      const history = tree.createUndoManager({
        trackedOrigins: new Set([origin]),
        captureTimeout: 0,
      });
      let expected = "初始源码";
      try {
        for (let step = 0; step < 80; step++) {
          const before = expected;
          const addition = `片段${step}🙂`;
          tree.doc.transact(
            () => tree.textField("source", "code").insert(expected.length, addition),
            origin
          );
          history.stopCapturing();
          expected += addition;
          await local.project(session);
          expect(ContentDocumentTable.read(db, 7)!.content[1].code).toBe(expected);
          history.undo();
          await local.project(session);
          expect(ContentDocumentTable.read(db, 7)!.content[1].code).toBe(before);
          history.redo();
          await local.project(session);
          expect(ContentDocumentTable.read(db, 7)!.content[1].code).toBe(expected);
          tree.formatText("paragraph", 0, 2, { bold: step % 2 === 0 ? true : null }, {});
          await local.project(session);
          expect(ContentDocumentTable.read(db, 7)!.content[0].children![0].bold).toBe(
            step % 2 === 0 ? true : undefined
          );
        }
        expect(session.projectedVersion).toEqual(session.projectionVersion);
        return { sourceEdits: 80, undos: 80, redos: 80, formatChanges: 80, saves: 320 };
      } finally {
        history.destroy();
        tree.dispose();
      }
    });
  }, 120000);

  it("投影重叠、写入后回滚与切库竞态：新输入始终可重试", async () => {
    await measureStress("overlap-rollback-database-switch", async () => {
      const { local, localSessions, localAssets, db, localId } = await setup();
      const session = localSessions.get(localId)!;
      await local.project(session);
      const tree = new NodeTree(session.doc);
      const originalLocalize = localAssets.localizeDocument.bind(localAssets);
      const originalCommit = ContentDocumentBlocks.commit.bind(ContentDocumentBlocks);
      let expected = "正文";
      try {
        for (let step = 0; step < 30; step++) {
          const addition = `前${step}`;
          tree.insertText("paragraph", 0, addition, {});
          expected = addition + expected;
          vi.spyOn(localAssets, "localizeDocument").mockImplementationOnce(async (...args) => {
            const value = await originalLocalize(...args);
            tree.insertText("paragraph", 0, "晚到", {});
            expected = "晚到" + expected;
            return value;
          });
          await Promise.all(Array.from({ length: 8 }, () => local.project(session)));
          expect(session.projectedVersion).not.toEqual(session.projectionVersion);
          const before = ContentDocumentTable.read(db, 7)!;
          vi.spyOn(ContentDocumentBlocks, "commit").mockImplementationOnce((...args) => {
            originalCommit(...args);
            throw new Error("写入后模拟故障，事务必须回滚");
          });
          await expect(local.project(session)).rejects.toThrow("事务必须回滚");
          expect(ContentDocumentTable.read(db, 7)).toEqual(before);
          expect(session.projectedVersion).not.toEqual(session.projectionVersion);
          vi.spyOn(localAssets, "localizeDocument").mockImplementationOnce(async (...args) => {
            const value = await originalLocalize(...args);
            host.databases.delete("library");
            return value;
          });
          await local.project(session);
          expect(ContentDocumentTable.read(db, 7)).toEqual(before);
          expect(session.projectionDirty).toBe(true);
          host.databases.set("library", db);
          await local.project(session);
          expect(
            ContentDocumentTable.read(db, 7)!
              .content[0].children!.map(leaf => leaf.text)
              .join("")
          ).toBe(expected);
          expect(session.projectedVersion).toEqual(session.projectionVersion);
        }
        return {
          rounds: 30,
          overlappingRequests: 240,
          lateInputs: 30,
          rollbacks: 30,
          databaseSwitches: 30,
        };
      } finally {
        host.databases.set("library", db);
        tree.dispose();
      }
    });
  }, 120000);

  it("双视图并发输入与重复增量：接纳后收敛且不重复文字", async () => {
    await measureStress("two-view-increments", async () => {
      const {
        local,
        localSessions,
        db,
        localId,
        localStore: store,
        localState: state,
      } = await setup();
      const session = localSessions.get(localId)!;
      await local.project(session);
      const queue = new NodeSessionUpdates(new SqliteNodeSessionJournal(store), state);
      const peers = [
        new NodeTree(new Y.Doc({ gc: false })),
        new NodeTree(new Y.Doc({ gc: false })),
      ];
      const updates: Uint8Array[][] = [[], []];
      try {
        peers.forEach((peer, index) => {
          Y.applyUpdate(peer.doc, Y.encodeStateAsUpdate(session.doc));
          peer.doc.on("update", update => updates[index].push(new Uint8Array(update)));
        });
        for (let step = 0; step < 120; step++)
          peers.forEach((peer, index) => peer.insertText("paragraph", 0, `[${index}:${step}]`, {}));
        const delivered = updates[0].flatMap((update, index) => [
          update,
          updates[1][index],
          ...(index % 4 === 0 ? [update, updates[1][index]] : []),
        ]);
        for (let offset = 0; offset < delivered.length; offset += 8) {
          await Promise.all(
            delivered
              .slice(offset, offset + 8)
              .map(update => queue.apply(session, update, () => {}))
          );
          await local.project(session);
        }
        const actual = ContentDocumentTable.read(db, 7)!
          .content[0].children!.map(leaf => leaf.text)
          .join("");
        for (let step = 0; step < 120; step++)
          for (let peer = 0; peer < 2; peer++)
            expect(actual.split(`[${peer}:${step}]`)).toHaveLength(2);
        const converged = Y.encodeStateAsUpdate(session.doc);
        for (const peer of peers) {
          Y.applyUpdate(peer.doc, converged);
          expect(peer.read()).toEqual(readNodeDocument(session.doc).content);
        }
        const loaded = store.load(localId);
        try {
          expect(readNodeDocument(loaded.doc).content).toEqual(
            readNodeDocument(session.doc).content
          );
        } finally {
          loaded.doc.destroy();
        }
        return {
          writers: 2,
          edits: 240,
          duplicateUpdates: delivered.length - 240,
          deliveredUpdates: delivered.length,
          parallelBatch: 8,
        };
      } finally {
        for (const peer of peers) {
          peer.dispose();
          peer.doc.destroy();
        }
      }
    });
  }, 120000);

  it("真实 WebSocket 六轮断线重连：离线编辑最终进入服务端", async () => {
    await measureStress("websocket-reconnect", async () => {
      const { runtime, db, event, server } = await setup(true);
      const shared = await runtime.createContent(event, 7);
      const session = runtime.content.sessions.get(shared.documentId)!;
      await vi.waitFor(() => expect(session.provider?.synced).toBe(true), { timeout: 10000 });
      await runtime.content.project(session);
      const tree = new NodeTree(session.doc);
      let expected = "正文";
      try {
        for (let round = 0; round < 6; round++) {
          for (const transport of runtime.transports.values()) transport.disconnect();
          await vi.waitFor(
            () =>
              expect(
                [...runtime.transports.values()].every(
                  transport => transport.status === "disconnected"
                )
              ).toBe(true),
            { timeout: 10000 }
          );
          for (let edit = 0; edit < 40; edit++) {
            const token = `[${round}:${edit}]`;
            tree.insertText("paragraph", 0, token, {});
            expected = token + expected;
          }
          await runtime.content.project(session);
          expect(
            ContentDocumentTable.read(db, 7)!
              .content[0].children!.map(leaf => leaf.text)
              .join("")
          ).toBe(expected);
          await Promise.all([...runtime.transports.values()].map(transport => transport.connect()));
          await vi.waitFor(
            () => {
              const remote = server.store.loadDocument(shared.documentId);
              try {
                expect(
                  readNodeDocument(remote)
                    .content[0].children!.map(leaf => leaf.text)
                    .join("")
                ).toBe(expected);
              } finally {
                remote.destroy();
              }
            },
            { timeout: 10000 }
          );
        }
        return { reconnects: 6, offlineEdits: 240 };
      } finally {
        tree.dispose();
      }
    });
  }, 120000);
});

function replacementInput(
  before: NonNullable<ReturnType<typeof ContentTable.getContentById>>,
  text: string
) {
  return {
    expectedRevision: before.revision,
    contracts: before.contracts,
    content: before.content.map(block =>
      "type" in block && block.type === "paragraph"
        ? { ...block, children: [{ type: "formatted" as const, text }] }
        : block
    ),
  };
}
