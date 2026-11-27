import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { journalKey } from "../../journal";
import { StressDocument, bodyText, inspect, type PreparedCall, type ToolReply } from "./fixture";

const operations = (f: StressDocument, label: string) => [
  { kind: "insert", id: "group", parentId: f.roots[0], text: label },
  { kind: "insert", id: "one", parentId: "group", text: "节点一" },
  { kind: "insert", id: "two", parentId: "group", text: "节点二" },
  { kind: "summary", id: "summary", nodeIds: ["one", "two"], text: "摘要" },
  { kind: "boundary", id: "boundary", nodeIds: ["one", "two"], title: "恢复范围" },
  { kind: "note", id: "group", contentId: f.noteId },
  { kind: "relation", id: "relation", from: "summary", to: f.roots[1], text: "恢复关系" },
];

function remember(f: StressDocument, reply: ToolReply, label: string) {
  assert(reply.ids);
  const ids = reply.ids;
  const labels = {
    group: label,
    one: "节点一",
    two: "节点二",
    summary: "摘要",
    relation: "恢复关系",
  };
  for (const [alias, text] of Object.entries(labels)) {
    const id = ids[alias];
    assert(id);
    f.expectedLabels.set(id, text);
    f.expectedParents.set(
      id,
      alias === "group" ? f.roots[0] : alias === "relation" ? null : ids.group
    );
  }
  const index = inspect(f.page()),
    group = index.nodes.get(ids.group);
  assert(group);
  assert.equal(bodyText(group.body), label);
  assert(group.entity && group.entity.kind === "content");
  assert.equal(group.children.filter(node => node.id === ids.summary).length, 1);
}

async function killAt(killer: string, f: StressDocument, point: string, file: string) {
  return new Promise<{ signal: NodeJS.Signals | null; exitCode: number | null; marker: string }>(
    (resolve, reject) => {
      const child = spawn(
        process.execPath,
        [killer, f.directory, String(f.contentId), point, file],
        { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
      );
      let output = "",
        errors = "",
        hit = false;
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`未命中提交切点 ${point}: ${errors.slice(-4000)}`));
      }, 20000);
      child.once("error", error => {
        clearTimeout(timeout);
        reject(error);
      });
      child.stdout.on("data", bytes => {
        output += String(bytes);
        if (!hit && output.includes(`@@CUT:${point}@@`)) {
          hit = true;
          assert(child.kill("SIGKILL"), "父进程必须实际终止子进程");
        }
      });
      child.stderr.on("data", bytes => {
        errors += String(bytes);
      });
      child.once("exit", (code, signal) => {
        clearTimeout(timeout);
        try {
          assert(hit, `子进程提前退出：${errors.slice(-4000)}`);
          assert(child.killed, "必须由父进程触发 OS 级终止");
          assert(
            signal === "SIGKILL" || (process.platform === "win32" && code !== 0),
            `异常终止结果：${code}/${signal}`
          );
          resolve({ signal, exitCode: code, marker: point });
        } catch (error) {
          reject(error);
        }
      });
    }
  );
}

export async function recovery(
  root: string,
  killer: string,
  full: boolean,
  progress: (value: unknown) => void
) {
  const f = await StressDocument.create(root);
  const cuts: unknown[] = [],
    failures: unknown[] = [];
  try {
    for (const point of [
      "journal-transaction",
      "journal-committed",
      "projection-transaction",
      "before-reply",
    ]) {
      for (let iteration = 0; iteration < (full ? 10 : 1); iteration++) {
        const label = `${point}-${iteration}`,
          call = await f.prepare(operations(f, label), f.roots, 1, label);
        const lease = f.actor().lease,
          before = f.sessions.snapshot(lease.leaseId, 1).revision;
        const request = {
          domain: "mindmap",
          owner: "stress-agent-1",
          pageId: f.pageId,
          requestId: call.requestId,
          preconditions: call.preconditions,
          operations: call.operations,
        };
        const file = join(f.directory, "request.json");
        writeFileSync(file, JSON.stringify(request));
        f.stopSessions();
        const killed = await killAt(killer, f, point, file);
        const durable = f.journal.load(journalKey(lease.identity));
        assert(durable);
        assert.equal(durable.revision, before + Number(point !== "journal-transaction"));
        const projected = f.db
          .prepare("SELECT revision FROM whiteboard_documents WHERE document_id=?")
          .get(f.documentId) as { revision: number };
        assert.equal(projected.revision, before + Number(point === "before-reply"));
        await f.restart();
        const args: PreparedCall = { ...call, target: f.actor().target };
        const saved = await f.submit(args);
        assert.equal(saved.ok, true, JSON.stringify(saved.error));
        const replay = await f.submit(args, 1, true);
        assert.equal(replay.revision, saved.revision);
        assert.deepEqual(replay.ids, saved.ids);
        assert.equal(saved.revision, before + 1);
        remember(f, saved, label);
        f.checkLedger();
        f.checkDisk();
        cuts.push({
          ...killed,
          iteration,
          durableBeforeReopen: durable.revision,
          revisionAfterReplay: saved.revision,
        });
      }
      progress({ completedCut: point, attempts: full ? 10 : 1 });
    }
    for (const point of ["journal-reject", "projection-reject"]) {
      const label = `fault-${point}`,
        args = await f.prepare(operations(f, label), f.roots);
      const before = f.stateHash(),
        revision = f.actor().revision;
      if (point === "journal-reject")
        f.journal.db.exec(
          "CREATE TEMP TRIGGER reject_stress_write AFTER INSERT ON updates BEGIN SELECT RAISE(ABORT,'stress journal failure'); END"
        );
      else
        f.db.exec(
          "CREATE TEMP TRIGGER reject_stress_write AFTER UPDATE OF revision ON whiteboard_documents BEGIN SELECT RAISE(ABORT,'stress projection failure'); END"
        );
      const refused = await f.submit(args);
      assert.equal(refused.ok, false);
      if (point === "journal-reject") {
        assert.equal(f.stateHash(), before);
        assert.equal(f.actor().revision, revision);
      } else {
        assert.equal(refused.error?.commitStatus, "saved");
        assert.equal(refused.error.retry, "same_request");
        assert.notEqual(f.stateHash(), before);
      }
      if (point === "journal-reject") f.journal.db.exec("DROP TRIGGER reject_stress_write");
      else f.db.exec("DROP TRIGGER reject_stress_write");
      const saved = await f.submit(args);
      assert.equal(saved.ok, true, JSON.stringify(saved.error));
      remember(f, saved, label);
      f.checkLedger();
      f.checkDisk();
      assert.equal((await f.submit(args, 1, true)).revision, saved.revision);
      failures.push({ point, feedback: refused.error, recoveredRevision: saved.revision });
    }
    const expectedNotes = [...inspect(f.page()).nodes.values()]
      .filter(node => node.entity?.kind === "content")
      .map(node => node.id)
      .sort();
    const held = f.db
      .prepare(
        "SELECT node_id FROM whiteboard_entity_relations WHERE document_id=? AND entity_kind='content'"
      )
      .all(f.documentId) as { node_id: string }[];
    assert.deepEqual(
      held.map(row => row.node_id).sort(),
      expectedNotes,
      "请求重放不能重复持有笔记引用"
    );
    const oldActor = f.actor(),
      oldTool = oldActor.tools[0];
    assert(oldTool);
    await f.restart();
    const stale = await oldTool.executor({ target: oldActor.target, nodeId: f.roots[0] });
    assert(stale && typeof stale !== "string");
    assert.equal(JSON.parse(stale.content).error.code, "TARGET_EXPIRED");
    f.checkLedger();
    f.checkDisk();
    return {
      osLevelProcessTerminations: cuts.length,
      cuts,
      injectedStorageFailures: failures,
      preservedNoteReferences: expectedNotes.length,
      expiredViewRejected: true,
      finalBytes: f.bytes(),
    };
  } finally {
    f.dispose();
  }
}
