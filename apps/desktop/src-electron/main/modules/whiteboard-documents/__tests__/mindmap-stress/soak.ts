import assert from "node:assert/strict";
import { StressDocument, stats, type PreparedCall } from "./fixture";

export async function soak(root: string, full: boolean, progress: (value: unknown) => void) {
  const f = await StressDocument.create(root, { elements: 64, mindNodes: 54, relations: 4 });
  const rounds = full ? 1000 : 6,
    resources: unknown[] = [];
  let first: PreparedCall | undefined,
    firstRevision: number | undefined,
    replays = 0,
    restarts = 0;
  const intervals: { round: number; p95ms: number; documentBytes: number }[] = [];
  try {
    for (let round = 0; round < rounds; round++) {
      const ops = [
        { kind: "edit_text", id: "node-2", text: `持续甲-${round}` },
        { kind: "edit_text", id: "node-3", text: `持续乙-${round}` },
      ];
      const saved = await f.write(ops, ["node-2", "node-3"]);
      first ??= saved.args;
      firstRevision ??= saved.result.revision;
      for (const op of ops) f.expectedLabels.set(op.id, op.text);
      if (round % 10 === 0) await f.humanTitle("人");
      if (round % 50 === 0) {
        const before = f.stateHash();
        const replay = await f.submit({ ...first, target: f.actor().target }, 1, true);
        assert.equal(replay.revision, firstRevision);
        assert.equal(f.stateHash(), before);
        replays++;
      }
      f.checkLedger();
      if ((round + 1) % 100 === 0 || round === rounds - 1) {
        const row = {
          round: round + 1,
          p95ms: stats(f.samples.write.slice(-100)).p95ms,
          documentBytes: f.bytes(),
        };
        intervals.push(row);
        resources.push({
          ...row,
          ...process.memoryUsage(),
          activeResources: process.getActiveResourcesInfo(),
        });
        assert.equal(f.sessions.holders().length, 3, "重复调用不能积累活动视图");
        f.checkDisk();
        progress({ soak: row, replays, restarts });
      }
      if ((round + 1) % 200 === 0) {
        await f.restart();
        f.checkLedger();
        restarts++;
      }
    }
    assert(first);
    const before = f.stateHash(),
      replay = await f.submit({ ...first, target: f.actor().target }, 1, true);
    assert.equal(replay.revision, firstRevision);
    assert.equal(f.stateHash(), before);
    f.checkLedger();
    f.checkDisk();
    return {
      rounds,
      agentOperations: rounds * 2,
      humanWrites: Math.ceil(rounds / 10),
      replays: replays + 1,
      restarts,
      writes: stats(f.samples.write),
      intervals,
      resources,
      durationMeaning: "同一文档跨大量轮次与重开；操作加速执行，不代表数小时在线",
    };
  } finally {
    f.dispose();
  }
}
