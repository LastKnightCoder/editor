import { createHash } from "node:crypto";
import { CollaborationLocalStore } from "../local-store";
// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { DocumentInstallReceipt } from "@tau/collaboration";
import { ContentLocalState, type LocalInstallationPlan } from "../content-local-state";

const cleanup: (() => void)[] = [];
afterEach(() =>
  cleanup
    .splice(0)
    .reverse()
    .forEach(run => run())
);
function setup() {
  const directory = mkdtempSync(join(tmpdir(), "tau-local-content-"));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  let state = new ContentLocalState(new CollaborationLocalStore(directory).db);
  cleanup.push(() => state.db.close());
  const candidate = Buffer.from("whiteboard-candidate");
  const candidateHash = createHash("sha256").update(candidate).digest("hex");
  const plan: LocalInstallationPlan = {
    kind: "whiteboard",
    operationId: "op",
    workspaceId: "workspace",
    documentId: "document",
    expectedEpoch: 4,
    fingerprint: {
      expectedRevision: "old-revision",
      candidateHash,
      targetVersion: 3,
      baselineId: "new-baseline",
    },
    prepared: { candidate: candidate.toString("base64"), installation: "{}", conversion: "{}" },
  };
  const receipt: DocumentInstallReceipt = {
    operationId: "op",
    documentId: "document",
    epoch: 5,
    revision: candidateHash,
    version: 3,
    baselineId: "new-baseline",
  };
  return {
    get state() {
      return state;
    },
    plan,
    receipt,
    reopen: () => {
      state.db.close();
      state = new ContentLocalState(new CollaborationLocalStore(directory).db);
    },
  };
}

describe("本机视图、持有与迁移日志", () => {
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
    context.state.replaceHolds("workspace", "other-view", "undo", [ref]);
    context.reopen();
    expect(context.state.holders("workspace")).toHaveLength(2);
    context.state.replaceHolds("workspace", "room", "shared-membership", []);
    expect(context.state.isHeld("workspace", ref)).toBe(true);
    expect(context.state.isHeld("other", ref)).toBe(false);
    expect(context.state.isHeld("workspace", { ...ref, sourceId: "other" })).toBe(false);
  });
});

it("按文档查询待恢复操作使用索引，已完成历史不会混入或逐篇全表扫描", () => {
  const { state, plan } = setup();
  state.begin(plan);
  state.begin({ ...plan, documentId: "another", operationId: "another-op" });
  state.begin({ ...plan, documentId: "finished", operationId: "finished-op" });
  state.db
    .prepare(
      "UPDATE migrations SET record=json_set(record,'$.phase','COMPLETE') WHERE operation_id='finished-op'"
    )
    .run();
  expect(state.pendingInstallations("document").map(record => record.plan.operationId)).toEqual([
    "op",
  ]);
  expect(state.pendingInstallations("finished")).toEqual([]);
  expect(
    state
      .pendingInstallations()
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
