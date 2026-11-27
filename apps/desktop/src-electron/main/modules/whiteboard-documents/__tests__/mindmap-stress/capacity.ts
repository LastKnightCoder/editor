import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WHITEBOARD_LIMITS } from "@tau/collaboration";
import { StressDocument, inspect, stats, type ToolReply } from "./fixture";

const rejected = (reply: ToolReply) => {
  assert.equal(reply.ok, false, "超过协议预算必须拒绝");
  assert.equal(reply.error?.commitStatus, "not_applied");
  assert.equal(reply.error?.retry, "fix_arguments", "硬限额不能建议仅重读后原样重试");
  assert(reply.error?.message && reply.error.suggestion, "拒绝结果必须包含原因和修正建议");
};

export async function profileTextBatches(
  root: string,
  full: boolean,
  progress: (value: unknown) => void
) {
  const baseline = JSON.parse(
    readFileSync(join(root, "output/whiteboard-mindmap-stress/full/capacity.json"), "utf8")
  ) as {
    build: { runnerSha256: string };
    result: { volumes: { elements: number; batches: { operations: number; writeMs: number }[] }[] };
  };
  const comparisons: unknown[] = [];
  for (const count of full ? [1000, 5000] : [100]) {
    const f = await StressDocument.create(root, { elements: count });
    try {
      const slots = [...f.expectedLabels.keys()].filter(id => id.startsWith("node-")).slice(0, 8);
      const values: number[] = [];
      for (const size of [1, 10, 256, 256, 256]) {
        const ops = Array.from({ length: size }, (_, i) => ({
          kind: "edit_text",
          id: slots[i % slots.length],
          text: `容量-${count}-${size}-${i}`,
        }));
        await f.write(ops, slots);
        for (const op of ops) f.expectedLabels.set(op.id, op.text);
        if (size === 256) values.push(f.samples.write.at(-1) ?? 0);
        f.checkLedger();
        f.checkDisk();
      }
      const before = baseline.result.volumes
        .find(value => value.elements === count)
        ?.batches.find(value => value.operations === 256)?.writeMs;
      assert(before !== undefined, "对照报告必须包含同规模、同操作数的原始样本");
      const measurements = stats(values);
      const row = {
        elements: count,
        operationsPerBatch: 256,
        baselineSingleSampleMs: before,
        baselineBuild: baseline.build.runnerSha256,
        after: measurements,
        medianReductionPercent: (1 - measurements.p50ms / before) * 100,
        bytes: f.bytes(),
        note: "相同工作负载的单次基线与修复后三次样本，不代表长期 P95 保证",
      };
      comparisons.push(row);
      progress({ comparison: row });
    } finally {
      f.dispose();
    }
  }
  return { comparisons };
}

export async function capacity(root: string, full: boolean, progress: (value: unknown) => void) {
  const volumes: unknown[] = [];
  for (const count of full ? [100, 1000, 5000] : [100]) {
    const began = performance.now(),
      f = await StressDocument.create(root, { elements: count });
    try {
      const initialBytes = f.bytes();
      const slots = [...f.expectedLabels.keys()].filter(id => id.startsWith("node-")).slice(0, 8);
      const batches: unknown[] = [];
      for (const batch of [1, 10, 256]) {
        const operations = Array.from({ length: batch }, (_, i) => ({
          kind: "edit_text",
          id: slots[i % slots.length],
          text: `容量-${count}-${batch}-${i}`,
        }));
        const saved = await f.write(operations, slots);
        for (const op of operations) f.expectedLabels.set(op.id, op.text);
        f.checkLedger();
        f.checkDisk();
        const bytes = f.bytes(),
          beforeReplay = f.stateHash();
        const replay = await f.submit(saved.args, 1, true);
        assert.equal(replay.revision, saved.result.revision);
        assert.equal(f.stateHash(), beforeReplay);
        batches.push({
          operations: batch,
          writeMs: f.samples.write.at(-1),
          readMs: f.samples.read.at(-1),
          bytes,
        });
      }
      const hash = f.stateHash();
      rejected(
        await f.submit(
          await f.prepare(
            Array.from({ length: 257 }, () => ({ kind: "fold", id: f.roots[0], folded: false })),
            [f.roots[0]]
          )
        )
      );
      assert.equal(f.stateHash(), hash, "超批次预算不能写入部分操作");
      if (count === WHITEBOARD_LIMITS.elements) {
        rejected(
          await f.submit(
            await f.prepare(
              [{ kind: "insert", id: "over-limit", parentId: f.roots[0], text: "不得插入" }],
              [f.roots[0]]
            )
          )
        );
        assert.equal(f.stateHash(), hash, "元素额度耗尽时原图不能改变");
      }
      await f.restart();
      f.checkLedger();
      f.checkDisk();
      const item = {
        elements: count,
        initialBytes,
        finalBytes: f.bytes(),
        batches,
        elapsedMs: performance.now() - began,
        memory: process.memoryUsage(),
      };
      volumes.push(item);
      progress({ volume: item });
    } finally {
      f.dispose();
    }
  }

  const roots = await StressDocument.create(root, {
    elements: WHITEBOARD_LIMITS.richTextRoots,
    mindNodes: WHITEBOARD_LIMITS.richTextRoots,
    relations: 0,
  });
  let richTextQuota: unknown;
  try {
    const before = roots.stateHash();
    const refusal = await roots.submit(
      await roots.prepare(
        [{ kind: "insert", id: "too-many-bodies", parentId: roots.roots[0], text: "额外正文" }],
        [roots.roots[0]]
      )
    );
    rejected(refusal);
    assert.equal(roots.stateHash(), before);
    const existing = "node-2";
    await roots.write(
      [{ kind: "edit_text", id: existing, text: "达到正文根限额仍可改字" }],
      [existing]
    );
    roots.expectedLabels.set(existing, "达到正文根限额仍可改字");
    roots.checkLedger();
    richTextQuota = {
      limit: WHITEBOARD_LIMITS.richTextRoots,
      refusal: refusal.error,
      existingTextEdit: "passed",
    };
    progress({ richTextQuota });
  } finally {
    roots.dispose();
  }

  const deep = await StressDocument.create(root);
  let depthQuota: unknown;
  try {
    const operations = Array.from({ length: WHITEBOARD_LIMITS.payloadDepth - 1 }, (_, i) => ({
      kind: "insert",
      id: `depth-${i}`,
      parentId: i ? `depth-${i - 1}` : deep.roots[0],
      text: `层-${i}`,
    }));
    const created = await deep.write(operations, [deep.roots[0]]);
    const last = created.ids[`depth-${WHITEBOARD_LIMITS.payloadDepth - 2}`];
    assert(last);
    const before = deep.stateHash();
    const refusal = await deep.submit(
      await deep.prepare(
        [{ kind: "insert", id: "over-depth", parentId: last, text: "超过层级" }],
        [last]
      )
    );
    rejected(refusal);
    assert.equal(deep.stateHash(), before);
    inspect(deep.page());
    depthQuota = { validLevels: WHITEBOARD_LIMITS.payloadDepth, refusal: refusal.error };
    progress({ depthQuota });
  } finally {
    deep.dispose();
  }

  let documentQuota: unknown = { executed: false, profile: "smoke" };
  if (full) {
    const f = await StressDocument.create(root, {
      elements: 240,
      mindNodes: 2,
      relations: 0,
      fillerText: 30 * 1024,
    });
    try {
      let accepted = 0,
        refusal: ToolReply | undefined;
      for (let round = 0; round < 12; round++) {
        const operations = Array.from({ length: 32 }, (_, i) => ({
          kind: "insert",
          id: `bytes-${round}-${i}`,
          parentId: f.roots[0],
          text: "x".repeat(8192),
        }));
        const before = f.stateHash(),
          call = await f.prepare(operations, [f.roots[0]]),
          result = await f.submit(call);
        if (!result.ok) {
          rejected(result);
          assert.equal(f.stateHash(), before);
          refusal = result;
          break;
        }
        assert(result.ids);
        for (const op of operations) {
          const id = result.ids[op.id];
          assert(id);
          f.expectedLabels.set(id, op.text);
          f.expectedParents.set(id, f.roots[0]);
        }
        accepted += operations.length;
        progress({ documentBytes: f.bytes(), acceptedNewBodies: accepted });
      }
      assert(refusal, "测试必须确实命中文档字节预算，不能静默缩小场景");
      assert(f.bytes() <= WHITEBOARD_LIMITS.documentBytes);
      f.checkLedger();
      await f.restart();
      f.checkLedger();
      f.checkDisk();
      documentQuota = {
        executed: true,
        limit: WHITEBOARD_LIMITS.documentBytes,
        bytes: f.bytes(),
        acceptedNewBodies: accepted,
        refusal: refusal.error,
        writes: stats(f.samples.write),
      };
    } finally {
      f.dispose();
    }
  }
  return { volumes, richTextQuota, depthQuota, documentQuota };
}
