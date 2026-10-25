import { describe, expect, it } from "vitest";
import {
  beginDocumentMigration,
  freezeDocumentMigration,
  commitDocumentMigration,
  cancelDocumentMigration,
  refreshDocumentMigration,
  type MigrationDocument,
  type MigrationFingerprint,
} from "./document-migration";

const initial: MigrationDocument = {
  id: "document",
  ownerId: "owner",
  epoch: 1,
  version: 2,
  revision: "original",
  baselineId: "base-1",
};
const request = { id: "operation", actorId: "owner", expectedEpoch: 1, expiresAt: 1000 };
const candidate: MigrationFingerprint = {
  expectedRevision: "original",
  candidateHash: "a".repeat(64),
  targetVersion: 2,
  baselineId: "base-2",
};
const prepared = () => {
  const started = beginDocumentMigration(initial, request, undefined, 100);
  return freezeDocumentMigration(started.document, started.operation, "owner", 200);
};

describe("文档迁移裁决", () => {
  it("成功安装一次，响应丢失后相同重试只返回原回执", () => {
    const state = prepared();
    const committed = commitDocumentMigration(
      state.document,
      state.operation,
      "owner",
      candidate,
      300
    );
    expect(committed.install).toBe(true);
    expect(committed.operation.state).toBe("COMMITTED");
    expect(committed.document.epoch).toBe(2);
    const retried = commitDocumentMigration(
      committed.document,
      committed.operation,
      "owner",
      candidate,
      1500
    );
    expect(retried.install).toBe(false);
    expect(retried.operation.receipt).toEqual(committed.operation.receipt);
    expect(retried.document).toEqual(committed.document);
  });

  it("提交先赢时取消不回退正文", () => {
    const state = prepared();
    const committed = commitDocumentMigration(
      state.document,
      state.operation,
      "owner",
      candidate,
      300
    );
    const cancelled = cancelDocumentMigration(
      committed.document,
      request,
      committed.operation,
      400
    );
    expect(cancelled.operation.state).toBe("COMMITTED");
    expect(cancelled.document).toEqual(committed.document);
  });

  it("取消先赢后相同基线的迟到提交也被终态拒绝", () => {
    const state = prepared();
    const cancelled = cancelDocumentMigration(state.document, request, state.operation, 250);
    const late = commitDocumentMigration(
      cancelled.document,
      cancelled.operation,
      "owner",
      candidate,
      300
    );
    expect(late.operation.state).toBe("ABORTED");
    expect(late.install).toBe(false);
    expect(late.document).toEqual(initial);
  });

  it("超时后即使正文未变化也不能复活操作", () => {
    const state = prepared();
    const expired = refreshDocumentMigration(state.document, state.operation, 1000);
    expect(expired.operation.state).toBe("EXPIRED");
    expect(
      commitDocumentMigration(expired.document, expired.operation, "owner", candidate, 1001).install
    ).toBe(false);
    const retry = beginDocumentMigration(
      expired.document,
      { ...request, expiresAt: 2000 },
      expired.operation,
      1100
    );
    expect(retry.operation.state).toBe("EXPIRED");
    const fresh = beginDocumentMigration(
      expired.document,
      { ...request, id: "fresh", expiresAt: 2000 },
      undefined,
      1100
    );
    expect(fresh.operation.state).toBe("PENDING");
  });

  it("取消未知操作封住迟到的首次请求", () => {
    const cancelled = cancelDocumentMigration(initial, request, undefined, 200);
    const started = beginDocumentMigration(initial, request, cancelled.operation, 300);
    expect(started.operation.state).toBe("ABORTED");
    expect(started.document.migrationId).toBeUndefined();
  });

  it("同一 ID 换候选冲突，原有回执不受影响", () => {
    const state = prepared();
    const committed = commitDocumentMigration(
      state.document,
      state.operation,
      "owner",
      candidate,
      300
    );
    expect(() =>
      commitDocumentMigration(
        committed.document,
        committed.operation,
        "owner",
        { ...candidate, candidateHash: "b".repeat(64) },
        400
      )
    ).toThrow("更换迁移候选");
    expect(committed.operation.receipt?.revision).toBe(candidate.candidateHash);
  });

  it("冻结前编辑纳入最终基线，冻结后修订或代次变化拒绝候选", () => {
    const started = beginDocumentMigration(initial, request, undefined, 100);
    const frozen = freezeDocumentMigration(
      { ...started.document, revision: "latest" },
      started.operation,
      "owner",
      200
    );
    expect(frozen.operation.frozenRevision).toBe("latest");
    const result = commitDocumentMigration(
      frozen.document,
      frozen.operation,
      "owner",
      candidate,
      300
    );
    expect(result.operation.state).toBe("ABORTED");
    expect(result.document.revision).toBe("latest");
    expect(result.install).toBe(false);
  });

  it("终止旧操作不解除其它迁移的屏障", () => {
    const state = prepared();
    const document = { ...state.document, migrationId: "another", frozen: true };
    const expired = refreshDocumentMigration(document, state.operation, 1001);
    expect(expired.document.migrationId).toBe("another");
    expect(expired.document.frozen).toBe(true);
  });

  it("拒绝非所有者、跨文档复用、复用旧 CRDT 基线和未冻结提交", () => {
    expect(() =>
      beginDocumentMigration(initial, { ...request, actorId: "member" }, undefined, 100)
    ).toThrow("所有者");
    const state = prepared();
    expect(() =>
      commitDocumentMigration(
        { ...state.document, id: "another" },
        state.operation,
        "owner",
        candidate,
        300
      )
    ).toThrow("身份");
    expect(
      commitDocumentMigration(
        state.document,
        state.operation,
        "owner",
        { ...candidate, baselineId: "base-1" },
        300
      ).operation.state
    ).toBe("ABORTED");
    const started = beginDocumentMigration(initial, request, undefined, 100);
    expect(
      commitDocumentMigration(started.document, started.operation, "owner", candidate, 200)
        .operation.state
    ).toBe("ABORTED");
  });
});
