import { CollaborationLocalStore } from "../local-store";
// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { DocumentMigration, MigrationReceipt } from "@tau/collaboration";
import { ContentLocalState, type LocalMigrationPlan } from "../content-local-state";

const cleanup: (() => void)[] = [];
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach(run => run())
);
function setup(remote = true) {
  const directory = mkdtempSync(join(tmpdir(), "tau-local-content-"));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  let state = new ContentLocalState(new CollaborationLocalStore(directory).db);
  cleanup.push(() => state.db.close());
  const recovery = {
    id: "backup",
    manifestHash: "b".repeat(64),
    manifestPath: join(directory, "manifest.json"),
  };
  state.registerRecovery(recovery, "workspace");
  const plan: LocalMigrationPlan = {
    operationId: "op",
    workspaceId: "workspace",
    documentId: "document",
    expectedEpoch: 4,
    remote,
    fingerprint: {
      expectedRevision: "old-revision",
      candidateHash: "a".repeat(64),
      targetVersion: 2,
      baselineId: "new-baseline",
    },
    recovery,
  };
  const receipt: MigrationReceipt = {
    operationId: "op",
    documentId: "document",
    epoch: 5,
    revision: "a".repeat(64),
    version: 2,
    baselineId: "new-baseline",
  };
  const operation: DocumentMigration = {
    id: "op",
    documentId: "document",
    actorId: "owner",
    expectedEpoch: 4,
    expiresAt: 100,
    state: "COMMITTED",
    fingerprint: plan.fingerprint,
    receipt,
  };
  return {
    get state() {
      return state;
    },
    plan,
    receipt,
    operation,
    reopen: () => {
      state.db.close();
      state = new ContentLocalState(new CollaborationLocalStore(directory).db);
    },
  };
}

describe("本机视图、持有与迁移日志", () => {
  it("共享准备重启沿用同一日志，形成候选后原行续做，取消记录不能复活", () => {
    const context = setup();
    const preparation = {
      operationId: "op",
      workspaceId: "workspace",
      documentId: "document",
      expectedEpoch: 4,
      expiresAt: 100,
    };
    context.state.prepareRemote(preparation);
    context.reopen();
    expect(context.state.preparation("document")).toEqual(preparation);
    context.state.begin({ ...context.plan, expiresAt: 100 });
    expect(context.state.preparation("document")).toBeNull();
    expect(context.state.db.prepare("SELECT count(*) AS n FROM migrations").get()).toEqual({
      n: 1,
    });
    const second = setup();
    second.state.prepareRemote(preparation);
    second.state.finishPreparation({ ...second.operation, state: "EXPIRED" });
    expect(() => second.state.begin({ ...second.plan, expiresAt: 100 })).toThrow("复活");
  });

  it("输入草稿重启可读，迟到批次不覆盖新输入，只按正确代次的耐久正文确认", () => {
    const context = setup();
    const identity = {
      workspaceId: "workspace",
      documentId: "document",
      baselineId: "baseline",
      epoch: 4,
    };
    const draft = {
      nodeId: "node",
      field: "code",
      value: "未提交草稿",
      revision: "field:1",
      sequence: 1,
    };
    context.state.saveInputDraft(identity, "view", draft);
    context.reopen();
    expect(context.state.inputDrafts("workspace")).toMatchObject([draft]);
    context.state.saveInputDraft(identity, "view", { ...draft, value: "更新的草稿", sequence: 2 });
    context.state.saveInputDraft(identity, "view", draft);
    expect(context.state.inputDrafts("workspace")[0].value).toBe("更新的草稿");
    expect(() => context.state.saveInputDraft(identity, "view", { ...draft, sequence: 2 })).toThrow(
      "身份冲突"
    );
    expect(() =>
      context.state.saveInputDraft({ ...identity, workspaceId: "other" }, "view", {
        ...draft,
        sequence: 3,
      })
    ).toThrow("来源");
    context.state.confirmInputDrafts("document", "baseline", 5, () => "更新的草稿");
    expect(context.state.inputDrafts("workspace")).toHaveLength(1);
    context.state.confirmInputDrafts("document", "baseline", 4, () => "其他正文");
    expect(context.state.inputDrafts("workspace")).toHaveLength(1);
    context.state.confirmInputDrafts("document", "baseline", 4, () => "更新的草稿");
    context.reopen();
    expect(context.state.inputDrafts("workspace")).toEqual([]);
  });

  it("视图按完整身份隔离，重启保留，过期更新和非 JSON 数据不写入", () => {
    const context = setup();
    const key = {
      workspaceId: "workspace",
      documentId: "document",
      nodeId: "node",
      owner: "plugin",
    };
    const saved = context.state.writeView(key, { activeStepId: "step", isFold: true }, null);
    context.reopen();
    expect(context.state.readView(key)).toEqual(saved);
    for (const field of Object.keys(key))
      expect(context.state.readView({ ...key, [field]: "other" })).toBeNull();
    expect(() => context.state.writeView(key, { isFold: false }, null)).toThrow("已变化");
    expect(() => context.state.writeView(key, { bad: Infinity }, saved.revision)).toThrow();
    expect(context.state.readView(key)).toEqual(saved);
  });

  it("不同本机持有者独立保存，释放一个不影响其他持有且不修改主库计数", () => {
    const context = setup();
    const ref = { sourceId: "source", kind: "data-table" as const, entityId: "entity" };
    context.state.replaceHolds("workspace", "room", "shared-membership", [ref, ref]);
    context.state.replaceHolds("workspace", "backup", "recovery", [ref]);
    context.reopen();
    expect(context.state.holders("workspace")).toHaveLength(2);
    context.state.replaceHolds("workspace", "room", "shared-membership", []);
    expect(context.state.isHeld("workspace", ref)).toBe(true);
    expect(context.state.isHeld("other", ref)).toBe(false);
    expect(context.state.isHeld("workspace", { ...ref, sourceId: "other" })).toBe(false);
  });

  it("提交响应丢失后只查询续做，逐个安装边界重启也不回退已提交决定", () => {
    const context = setup();
    context.state.begin(context.plan);
    context.reopen();
    expect(context.state.observeRemote("op", null).phase).toBe("BACKED_UP");
    expect(() => context.state.begin({ ...context.plan, operationId: "another" })).toThrow(
      "待恢复"
    );
    context.state.observeRemote("op", context.operation);
    context.reopen();
    expect(() =>
      context.state.observeRemote("op", { ...context.operation, state: "ABORTED" })
    ).toThrow();
    for (const target of ["main", "collaboration"] as const) {
      context.state.installed("op", target, context.receipt);
      context.reopen();
      expect(context.state.migration("op")!.installations[target]).toEqual(context.receipt);
    }
    expect(context.state.complete("op", context.receipt).phase).toBe("COMPLETE");
    context.reopen();
    expect(context.state.observeRemote("op", context.operation).phase).toBe("COMPLETE");
    expect(context.state.recovery("backup")).toEqual(context.plan.recovery);
  });

  it.each(["ABORTED", "EXPIRED"] as const)("%s 终态重启后不复活，不能更换同一操作的候选", phase => {
    const context = setup();
    context.state.begin(context.plan);
    context.state.observeRemote("op", { ...context.operation, state: phase, receipt: undefined });
    context.reopen();
    expect(context.state.observeRemote("op", null).phase).toBe(phase);
    expect(() => context.state.observeRemote("op", context.operation)).toThrow("不能复活");
    expect(() =>
      context.state.begin({
        ...context.plan,
        fingerprint: { ...context.plan.fingerprint, candidateHash: "c".repeat(64) },
      })
    ).toThrow("更换计划");
    expect(context.state.begin({ ...context.plan, operationId: "retry" }).phase).toBe("BACKED_UP");
  });

  it("纯本机提交使用自己的耐久决定，部分安装不能宣布完成", () => {
    const context = setup(false);
    context.state.begin(context.plan);
    expect(() => context.state.observeRemote("op", context.operation)).toThrow("纯本机");
    context.state.decideLocal("op", "commit");
    context.reopen();
    expect(() => context.state.decideLocal("op", "abort")).toThrow("继续安装");
    context.state.installed("op", "main", context.receipt);
    expect(() => context.state.complete("op", context.receipt)).toThrow("尚未安装");
    expect(() =>
      context.state.installed("op", "collaboration", { ...context.receipt, epoch: 9 })
    ).toThrow();
    expect(context.state.migration("op")!.installations.collaboration).toBeUndefined();
  });
});

it("按文档查询待恢复操作使用索引，已完成历史不会混入或逐篇全表扫描", () => {
  const { state, plan } = setup(false);
  state.begin(plan);
  state.begin({ ...plan, documentId: "another", operationId: "another-op" });
  state.begin({ ...plan, documentId: "finished", operationId: "finished-op" });
  state.db
    .prepare(
      "UPDATE migrations SET record=json_set(record,'$.phase','COMPLETE') WHERE operation_id='finished-op'"
    )
    .run();
  expect(state.pendingMigrations("document").map(record => record.plan.operationId)).toEqual([
    "op",
  ]);
  expect(state.pendingMigrations("finished")).toEqual([]);
  expect(
    state
      .pendingMigrations()
      .map(record => record.plan.operationId)
      .sort()
  ).toEqual(["another-op", "op"]);
  const query =
    "SELECT record FROM migrations WHERE document_id=? AND json_extract(record,'$.phase') NOT IN ('PREPARING','COMPLETE','ABORTED','EXPIRED')";
  expect(JSON.stringify(state.db.prepare(`EXPLAIN QUERY PLAN ${query}`).all("document"))).toContain(
    "migrations_document"
  );
  expect(
    JSON.stringify(
      state.db
        .prepare(
          "EXPLAIN QUERY PLAN SELECT record FROM migrations WHERE json_extract(record,'$.phase') NOT IN ('PREPARING','COMPLETE','ABORTED','EXPIRED')"
        )
        .all()
    )
  ).toContain("migrations_pending");
});
