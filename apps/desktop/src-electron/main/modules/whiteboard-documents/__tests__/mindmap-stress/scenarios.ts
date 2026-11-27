import assert from "node:assert/strict";
import { ContentIdentityTable } from "../../../tables/content-identity";
import { StressDocument, bodyText, inspect, stats, type PreparedCall } from "./fixture";

const randomOf = (seed: number) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed;
};

async function decorated(f: StressDocument, round: number) {
  const original = new Set(f.expectedParents.keys());
  const batch = await f.write([
    { kind: "insert", id: "branch", parentId: f.roots[0], text: "组合分支" },
    { kind: "note", id: "branch", contentId: f.noteId, title: "共享笔记" },
    { kind: "insert", id: "m1", parentId: "branch", text: "甲" },
    { kind: "insert", id: "m2", parentId: "branch", text: "乙" },
    { kind: "insert", id: "m3", parentId: "branch", text: "丙" },
    { kind: "summary", id: "summary", nodeIds: ["m1", "m2", "m3"], text: "总结" },
    { kind: "insert", id: "explanation", parentId: "summary", text: "补充" },
    { kind: "boundary", id: "boundary", nodeIds: ["m1", "m2", "m3"], title: "范围" },
    { kind: "relation", id: "link", from: "summary", to: f.roots[1], text: "关系" },
    { kind: "copy", id: "clone", sourceId: "branch", parentId: f.roots[1], side: "left" },
    { kind: "move", id: "m2", parentId: f.roots[1], side: "left" },
    { kind: "remove", id: "m1" },
    { kind: "remove", id: "m3" },
    { kind: "fold", id: "clone", scope: "depth", depth: 2 },
    {
      kind: "configure",
      id: f.roots[0],
      layout: round % 2 ? "org" : "tree",
      themeStyle: "outline",
    },
    { kind: "configure", id: f.roots[0], layout: "mind" },
  ]);
  const current = inspect(f.page()),
    branch = current.nodes.get(batch.ids.branch),
    clone = current.nodes.get(batch.ids.clone);
  assert(branch && clone);
  assert.equal(branch.children.length, 0, "源范围清空时概要及其后代必须一起退出");
  assert.equal(current.nodes.has(batch.ids.summary), false);
  assert.equal(current.nodes.has(batch.ids.link), false);
  assert.equal(current.parents.get(batch.ids.m2), f.roots[1]);
  assert.deepEqual(
    clone.children.filter(node => !node.data.summaryRange).map(node => bodyText(node.body)),
    ["甲", "乙", "丙"]
  );
  const summary = clone.children.find(node => node.data.summaryRange);
  assert(summary);
  assert.equal(bodyText(summary.body), "总结");
  assert.equal(bodyText(summary.children[0].body), "补充");
  assert(clone.entity && branch.entity);
  assert.deepEqual(clone.entity, branch.entity);
  assert.equal(ContentIdentityTable.resolve(f.db, clone.entity), f.noteId);
  assert.equal(current.sides.get(clone.id), "left");
  assert.equal(
    clone.children.some(node => [batch.ids.m1, batch.ids.m2, batch.ids.m3].includes(node.id)),
    false,
    "副本不能复用原节点身份"
  );
  await f.write(
    [
      { kind: "remove", id: batch.ids.branch },
      { kind: "remove", id: batch.ids.clone },
      { kind: "remove", id: batch.ids.m2 },
    ],
    [f.roots[0], f.roots[1], batch.ids.branch, batch.ids.clone, batch.ids.m2]
  );
  assert.deepEqual(new Set(inspect(f.page()).nodes.keys()), original);
  f.checkLedger();
}

export async function mixed(root: string, full: boolean, progress: (value: unknown) => void) {
  const seeds = full ? 20 : 1,
    rounds = full ? 50 : 4;
  const samples: number[] = [],
    readSamples: number[] = [],
    memories: unknown[] = [];
  let batches = 0,
    rejected = 0,
    replays = 0,
    restarts = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const f = await StressDocument.create(root),
      random = randomOf(seed);
    try {
      const slots = [...f.expectedLabels.keys()].filter(id => id.startsWith("node-"));
      for (let round = 0; round < rounds; round++) {
        const chosen = slots[random() % slots.length],
          renamed = `种子-${seed}-轮-${round}`;
        const batch = await f.write(
          [
            {
              kind: "insert",
              id: "added",
              parentId: f.roots[0],
              side: "left",
              text: `临时-${seed}-${round}`,
            },
            { kind: "move", id: "added", parentId: f.roots[1], side: "right" },
            { kind: "copy", id: "copied", sourceId: chosen, parentId: f.roots[0], side: "left" },
            { kind: "edit_text", id: "copied", text: "副本独立修改" },
            { kind: "edit_text", id: chosen, text: renamed },
            { kind: "fold", id: f.roots[0], folded: round % 2 === 0 },
          ],
          [...f.roots, chosen]
        );
        batches++;
        f.expectedLabels.set(chosen, renamed);
        f.expectedLabels.set(batch.ids.added, `临时-${seed}-${round}`);
        f.expectedParents.set(batch.ids.added, f.roots[1]);
        f.expectedLabels.set(batch.ids.copied, "副本独立修改");
        f.expectedParents.set(batch.ids.copied, f.roots[0]);
        f.checkLedger();
        if (round % 7 === 0) {
          const hash = f.stateHash(),
            replay = await f.submit(batch.args, 1, true);
          assert.equal(replay.revision, batch.result.revision);
          assert.equal(f.stateHash(), hash);
          replays++;
        }
        if (round % 5 === 0) {
          const before = f.stateHash();
          const refused = await f.submit(
            await f.prepare(
              [
                { kind: "insert", id: "must-rollback", parentId: f.roots[0], text: "不可残留" },
                { kind: "move", id: f.roots[0], parentId: "must-rollback" },
              ],
              [f.roots[0]]
            )
          );
          assert.equal(refused.ok, false);
          assert.equal(refused.error?.code, "CYCLE_DETECTED");
          assert.equal(refused.error.commitStatus, "not_applied");
          assert.equal(f.stateHash(), before);
          rejected++;
        }
        await f.write(
          [
            { kind: "remove", id: batch.ids.added },
            { kind: "remove", id: batch.ids.copied },
          ],
          [...f.roots, batch.ids.added, batch.ids.copied]
        );
        batches++;
        for (const id of [batch.ids.added, batch.ids.copied]) {
          f.expectedLabels.delete(id);
          f.expectedParents.delete(id);
        }
        f.checkLedger();
        if (round % 10 === 0) {
          await decorated(f, round);
          batches += 2;
          f.checkDisk();
          memories.push({ seed, round, documentBytes: f.bytes(), ...process.memoryUsage() });
        }
        if ((round + 1) % 10 === 0) {
          await f.restart();
          f.checkLedger();
          restarts++;
        }
      }
      f.checkDisk();
      samples.push(...f.samples.write);
      readSamples.push(...f.samples.read);
      progress({ seed, rounds, batches, rejected, replays, restarts, documentBytes: f.bytes() });
    } finally {
      f.dispose();
    }
  }
  return {
    seeds,
    roundsPerSeed: rounds,
    batches,
    rejected,
    replays,
    restarts,
    writes: stats(samples),
    reads: stats(readSamples),
    resourceSamples: memories,
    durationMeaning: "按操作轮数加速执行，不代表数小时在线运行",
  };
}

export async function concurrency(root: string, full: boolean, progress: (value: unknown) => void) {
  const seeds = full ? 20 : 1,
    rounds = full ? 50 : 5;
  let accepted = 0,
    conflicts = 0,
    humanWrites = 0,
    replays = 0;
  const durations: number[] = [],
    writes: number[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const f = await StressDocument.create(root, { elements: 50, mindNodes: 42, relations: 4 });
    try {
      const slots = [...f.expectedLabels.keys()].filter(id => id.startsWith("node-")).slice(0, 20);
      let firstSaved:
        | { args: PreparedCall; revision: number | undefined; owner: number }
        | undefined;
      for (let round = 0; round < rounds; round++) {
        const collision = round % 5 === 0;
        const make = (owner: number, start: number) =>
          slots.slice(start, start + 10).map((id, i) => ({
            kind: "edit_text",
            id,
            text: `作者-${owner}-种子-${seed}-轮-${round}-${i}`,
          }));
        const one = make(1, 0),
          two = make(2, collision ? 0 : 10);
        const a = await f.prepare(
            one,
            one.map(op => op.id),
            1
          ),
          b = await f.prepare(
            two,
            two.map(op => op.id),
            2
          );
        const began = performance.now();
        const [left, right] = await Promise.all([
          f.submit(a, 1),
          f.submit(b, 2),
          f.humanTitle("人"),
        ]);
        durations.push(performance.now() - began);
        humanWrites++;
        assert.equal(Number(left.ok) + Number(right.ok), collision ? 1 : 2);
        for (const [index, reply] of [left, right].entries()) {
          if (!reply.ok) {
            assert.equal(reply.error?.code, "PRECONDITION_CONFLICT");
            assert.equal(reply.error.commitStatus, "not_applied");
            conflicts++;
            continue;
          }
          const operations = index === 0 ? one : two,
            args = index === 0 ? a : b;
          for (const op of operations) f.expectedLabels.set(op.id, op.text);
          accepted += operations.length;
          firstSaved ??= { args, revision: reply.revision, owner: index + 1 };
          if (round % 7 === 0) {
            const replay = await f.submit(args, index + 1, true);
            assert.equal(replay.revision, reply.revision);
            replays++;
          }
        }
        f.checkLedger();
        for (const actor of f.actors.values())
          assert.equal(actor.model.read().pages[0].title, "人".repeat(round + 1) + "压力画布");
      }
      assert(firstSaved);
      const before = f.stateHash(),
        replay = await f.submit(firstSaved.args, firstSaved.owner, true);
      assert.equal(replay.revision, firstSaved.revision);
      assert.equal(f.stateHash(), before, "重放旧请求不能覆盖后来修改");
      const wrong = await f.submit(
        { ...firstSaved.args, operations: [{ kind: "fold", id: f.roots[0], folded: false }] },
        firstSaved.owner
      );
      assert.equal(wrong.error?.code, "REQUEST_ID_REUSED");
      assert.equal(f.stateHash(), before);
      f.checkDisk();
      await f.restart();
      f.checkLedger();
      writes.push(...f.samples.write);
      progress({ seed, rounds, accepted, conflicts, humanWrites, replays });
    } finally {
      f.dispose();
    }
  }
  return {
    seeds,
    roundsPerSeed: rounds,
    attemptedAgentOperations: seeds * rounds * 20,
    acceptedAgentOperations: accepted,
    conflictBatches: conflicts,
    humanWrites,
    replayedBatches: replays,
    roundTrips: stats(durations),
    writes: stats(writes),
  };
}
