import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash, randomBytes } from "node:crypto";
import { HistoryReplica, openCheckpoint } from "./history-replica.mjs";
import { canonical, exchange } from "./replica.mjs";
import { auditContracts, requireAdapters } from "./contracts.mjs";
import { serveHistory, recoverOverHttp } from "./history-transport.mjs";

test("跨版本恢复材料需要显式升级适配，不猜测重放，不推进回执或覆盖旧库", t => {
  const {
    replicas: [authority, mobile, laptop],
  } = fixture(t);
  put(laptop, "offline", "keep");
  const original = laptop.snapshot();
  const [entry] = laptop.exportRecoveryArchive();
  entry.batch.schema = "older-schema";
  entry.fingerprint = createHash("sha256").update(canonical(entry.batch)).digest("hex");
  const contents = { ...entry };
  delete contents.seal;
  entry.seal = createHash("sha256").update(canonical(contents)).digest("hex");
  const before = authority.frontier();
  assert.throws(() => authority.recoverArchive([entry]), /UPGRADE_REQUIRED/);
  assert.deepEqual(authority.frontier(), before);
  assert.equal(authority.receipt("laptop", 1), undefined);
  assert.deepEqual(laptop.snapshot(), original);
  assert.equal(laptop.exportRecoveryArchive().length, 1);
  assert.equal(mobile.rows("plugin_kv").length, 0);
});

test("大量离线操作分批提交，中途停止后保留旧库，重试不重复提交已确认页", async t => {
  const {
    replicas: [authority, mobile, laptop],
  } = fixture(t);
  for (let index = 0; index < 12; index++) put(laptop, `offline-${index}`, `value-${index}`);
  authority.retire(laptop);
  cut(authority, [mobile]);
  const before = laptop.snapshot();
  const server = await serveHistory(authority);
  try {
    await assert.rejects(
      recoverOverHttp(laptop, server.url, {
        pageEntries: 3,
        afterPage: () => {
          throw new Error("stop-after-first-page");
        },
      }),
      /stop-after/
    );
    assert.equal(authority.rows("plugin_kv").length, 3);
    assert.deepEqual(laptop.snapshot(), before);
    assert.equal(laptop.exportRecoveryArchive().length, 12);
    await recoverOverHttp(laptop, server.url, { pageEntries: 3 });
    assert.equal(authority.rows("plugin_kv").length, 12);
    assert.equal(
      authority.db.prepare("SELECT count(*) AS n FROM _spike_receipts WHERE device='laptop'").get()
        .n,
      12
    );
    assert.deepEqual(authority.replicatedSnapshot(), laptop.replicatedSnapshot());
  } finally {
    await server.close();
  }
});

function fixture(t, names = ["desktop", "mobile", "laptop"]) {
  const directory = mkdtempSync(join(tmpdir(), "tau-offline-history-"));
  const replicas = [];
  for (const [slot, device] of names.entries())
    replicas.push(
      new HistoryReplica(join(directory, `${device}.db`), {
        device,
        slot: slot + 1,
        baseline: replicas[0]?.initialBaseline(),
      })
    );
  for (const replica of replicas.slice(1)) replicas[0].register(replica);
  t.after(() => {
    for (const replica of replicas) replica.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { directory, replicas };
}
function put(replica, key, value) {
  replica.transaction(db =>
    db
      .prepare(
        "INSERT INTO plugin_kv VALUES('spike',?,?,1) ON CONFLICT(plugin_id,key) DO UPDATE SET value=excluded.value"
      )
      .run(key, value)
  );
}
function cut(authority, active) {
  const checkpoint = authority.createCheckpoint();
  for (const peer of active) {
    peer.installCheckpoint(checkpoint);
    authority.acknowledge(peer);
  }
  authority.compact();
  return checkpoint;
}
function rewrite(envelope, change) {
  const body = openCheckpoint(envelope);
  change(body);
  const text = canonical(body);
  return { id: createHash("sha256").update(text).digest("hex"), body: text };
}

test("98 表契约全覆盖，业务未实现与 Schema 漂移均不能静默放行", t => {
  const {
    replicas: [authority],
  } = fixture(t, ["desktop"]);
  assert.equal(authority.contracts.length, 98);
  assert.ok(
    authority.contracts.every(rule => rule.columns.length && rule.deletion && rule.restore)
  );
  assert.equal(
    authority.contracts.find(rule => rule.table === "flashcard_reviews").readiness,
    "blocked"
  );
  assert.throws(
    () =>
      requireAdapters(
        authority.contracts,
        authority.contracts.map(rule => rule.table)
      ),
    /UNSUPPORTED_RULE/
  );
  const unchanged = authority.snapshot();
  assert.throws(
    () =>
      authority.transaction(db =>
        db.prepare("UPDATE excerpt_provider SET update_time=update_time+1").run()
      ),
    /UNSUPPORTED_RULE/
  );
  assert.deepEqual(authority.snapshot(), unchanged);
  assert.equal(authority.db.prepare("SELECT count(*) AS n FROM _spike_outbox").get().n, 0);
  authority.db.exec("CREATE TABLE unreviewed(id INTEGER PRIMARY KEY)");
  assert.throws(() => auditContracts(authority.db), /漂移/);
});

test("长期离线的活跃设备阻止回收，显式退役后才允许检查点覆盖旧历史", t => {
  const {
    replicas: [authority, mobile, laptop],
  } = fixture(t);
  put(authority, "key", "v1");
  exchange(authority, mobile);
  exchange(authority, laptop);
  put(authority, "key", "v2");
  exchange(authority, mobile);
  let checkpoint = authority.createCheckpoint();
  mobile.installCheckpoint(checkpoint);
  authority.acknowledge(mobile);
  const before = authority.db.prepare("SELECT count(*) AS n FROM _spike_batches").get().n;
  assert.throws(() => authority.compact(), /ACTIVE_PEER/);
  assert.equal(authority.db.prepare("SELECT count(*) AS n FROM _spike_batches").get().n, before);
  authority.retire(laptop);
  checkpoint = cut(authority, [mobile]);
  assert.equal(authority.db.prepare("SELECT count(*) AS n FROM _spike_batches").get().n, 0);
  assert.equal(authority.rows("plugin_kv")[0].value, "v2");
  assert.throws(() => authority.exportSince(laptop.frontier()), /NEEDS_CHECKPOINT/);
  assert.ok(openCheckpoint(checkpoint).receipts.length >= 2);
});

test("回收后离线设备带新增编辑删除回来，冲突链完整保全，新来源可继续同步", async t => {
  const { directory, replicas } = fixture(t);
  const [authority, mobile, laptop] = replicas;
  for (const key of ["safe", "delete-local", "delete-remote", "restored"])
    put(authority, key, "initial");
  exchange(authority, mobile);
  exchange(authority, laptop);
  put(laptop, "new-offline", "new");
  put(laptop, "safe", "offline-edit");
  laptop.transaction(db => db.prepare("DELETE FROM plugin_kv WHERE key='delete-local'").run());
  put(laptop, "delete-remote", "must-not-resurrect");
  put(laptop, "restored", "must-not-overwrite-new-generation");
  authority.transaction(db =>
    db.prepare("UPDATE plugin_kv SET update_time=9 WHERE key='safe'").run()
  );
  authority.transaction(db =>
    db.prepare("DELETE FROM plugin_kv WHERE key IN ('delete-remote','restored')").run()
  );
  const deletion = authority.head("plugin_kv", ["spike", "restored"]);
  authority.restore("plugin_kv", ["spike", "restored"], `${deletion.device}:${deletion.sequence}`);
  exchange(authority, mobile);
  authority.retire(laptop);
  cut(authority, [mobile]);
  const oldActor = laptop.state.device;
  const server = await serveHistory(authority);
  try {
    await recoverOverHttp(laptop, server.url);
  } finally {
    await server.close();
  }
  assert.equal(laptop.rows("plugin_kv").find(row => row.key === "new-offline").value, "new");
  assert.equal(laptop.rows("plugin_kv").find(row => row.key === "safe").value, "offline-edit");
  assert.equal(laptop.rows("plugin_kv").find(row => row.key === "safe").update_time, 9);
  assert.equal(
    laptop.rows("plugin_kv").some(row => row.key === "delete-local" || row.key === "delete-remote"),
    false
  );
  assert.equal(laptop.rows("plugin_kv").find(row => row.key === "restored").value, "initial");
  assert.equal(laptop.recoveryBranches().length, 2);
  assert.equal(laptop.recoveryBranches()[0].changes[0].after.value, "must-not-resurrect");
  assert.equal(
    laptop.recoveryBranches()[1].changes[0].after.value,
    "must-not-overwrite-new-generation"
  );
  assert.notEqual(laptop.state.device, oldActor);
  assert.equal(laptop.exportRecoveryArchive().length, 0);
  assert.deepEqual(authority.replicatedSnapshot(), laptop.replicatedSnapshot());
  laptop.close();
  const restarted = new HistoryReplica(join(directory, "laptop.db"), { device: "laptop", slot: 3 });
  replicas.push(restarted);
  put(restarted, "after-rejoin", "works");
  authority.register(restarted);
  exchange(restarted, authority);
  assert.equal(authority.rows("plugin_kv").find(row => row.key === "after-rejoin").value, "works");
});

test("服务端已接收但确认丢失，回收后的恢复请求不会重复应用", async t => {
  const {
    replicas: [authority, mobile, laptop],
  } = fixture(t);
  put(laptop, "once", "one");
  exchange(laptop, authority);
  exchange(authority, mobile);
  put(laptop, "new-rebase", "two");
  const original = laptop.exportRecoveryArchive()[0];
  authority.retire(laptop);
  cut(authority, [mobile]);
  const server = await serveHistory(authority, { dropReplyOnce: true });
  try {
    await assert.rejects(recoverOverHttp(laptop, server.url));
    assert.equal(authority.rows("plugin_kv").filter(row => row.key === "new-rebase").length, 1);
    assert.equal(authority.receipt("laptop", 2).status, "rebased");
    await recoverOverHttp(laptop, server.url);
  } finally {
    await server.close();
  }
  assert.equal(authority.rows("plugin_kv").filter(row => row.key === "once").length, 1);
  assert.equal(authority.rows("plugin_kv").filter(row => row.key === "new-rebase").length, 1);
  assert.equal(
    authority.receipt(original.batch.device, original.batch.sequence).fingerprint,
    original.fingerprint
  );
  assert.equal(authority.recoveryBranches().length, 0);
});

test("安装检查点前未保护本机修改时拒绝覆盖，安装中断和重启保留整个旧副本", t => {
  const { directory, replicas } = fixture(t);
  const [authority, mobile, laptop] = replicas;
  put(authority, "remote", "one");
  exchange(authority, mobile);
  exchange(authority, laptop);
  put(laptop, "unsent", "do-not-lose");
  authority.retire(laptop);
  const first = cut(authority, [mobile]);
  const old = laptop.snapshot();
  assert.throws(() => laptop.installCheckpoint(first, { reincarnate: true }), /NOT_PROTECTED/);
  assert.deepEqual(laptop.snapshot(), old);
  authority.recoverArchive(laptop.exportRecoveryArchive());
  const next = authority.createCheckpoint();
  assert.throws(
    () => laptop.installCheckpoint(next, { reincarnate: true, failAfterRows: 1 }),
    /INTERRUPTED/
  );
  assert.deepEqual(laptop.snapshot(), old);
  assert.equal(laptop.exportRecoveryArchive().length, 1);
  laptop.close();
  const reopened = new HistoryReplica(join(directory, "laptop.db"), { device: "laptop", slot: 3 });
  replicas.push(reopened);
  reopened.installCheckpoint(next, { reincarnate: true });
  assert.deepEqual(reopened.replicatedSnapshot(), authority.replicatedSnapshot());
});

test("旧代墓碑恢复材料在日志回收后仍可用，旧消息不能复活对象", t => {
  const {
    replicas: [authority, mobile, laptop],
  } = fixture(t);
  put(authority, "shared", "before-delete");
  exchange(authority, mobile);
  exchange(authority, laptop);
  put(laptop, "shared", "stale");
  const stale = laptop.exportRecoveryArchive()[0].batch;
  authority.transaction(db => db.prepare("DELETE FROM plugin_kv").run());
  exchange(authority, mobile);
  authority.retire(laptop);
  cut(authority, [mobile]);
  assert.throws(() => authority.receive(stale), /NEEDS_CHECKPOINT/);
  const deleted = authority.head("plugin_kv", ["spike", "shared"]);
  authority.restore("plugin_kv", ["spike", "shared"], `${deleted.device}:${deleted.sequence}`);
  exchange(authority, mobile);
  assert.equal(mobile.rows("plugin_kv")[0].value, "before-delete");
  assert.equal(mobile.head("plugin_kv", ["spike", "shared"]).generation, 1);
});

test("内容块回收保持当前状态、冲突分支和检查点根；历史确实缩小", t => {
  const {
    replicas: [authority, mobile, laptop],
  } = fixture(t);
  for (let index = 0; index < 12; index++)
    put(authority, "large", randomBytes(12 * 1024).toString("base64"));
  exchange(authority, mobile);
  exchange(authority, laptop);
  put(authority, "large", "desktop-branch");
  put(laptop, "large", "offline-branch");
  exchange(authority, laptop);
  exchange(authority, mobile);
  const conflicts = authority.conflicts();
  const before = authority.db.prepare("SELECT count(*) AS n FROM _spike_chunks").get().n;
  cut(authority, [mobile, laptop]);
  assert.ok(authority.db.prepare("SELECT count(*) AS n FROM _spike_chunks").get().n < before);
  assert.deepEqual(authority.conflicts(), conflicts);
  assert.deepEqual(authority.replicatedSnapshot(), mobile.replicatedSnapshot());
  assert.equal(authority.db.prepare("SELECT count(*) AS n FROM _spike_batches").get().n, 0);
});

test("检查点之后新收到的数据、坏块、回退快照和丢失冲突材料都不能被安装掩盖", t => {
  const {
    replicas: [authority, mobile, laptop],
  } = fixture(t);
  put(authority, "large", "字".repeat(6000));
  exchange(authority, mobile);
  exchange(authority, laptop);
  const first = authority.createCheckpoint();
  put(authority, "newer", "new");
  exchange(authority, mobile);
  assert.throws(() => mobile.installCheckpoint(first), /LOCAL_HISTORY_NOT_PROTECTED/);
  const second = authority.createCheckpoint();
  mobile.installCheckpoint(second);
  assert.throws(() => mobile.installCheckpoint(first), /ROLLBACK/);
  const corrupt = rewrite(second, body => {
    body.chunks[0].data = Buffer.from("corrupt").toString("base64");
  });
  assert.throws(() => laptop.installCheckpoint(corrupt));
  assert.equal(
    laptop.rows("plugin_kv").some(row => row.key === "newer"),
    false
  );
  assert.throws(() => authority.compact(), /ACTIVE_PEER/);
});

test("离线设备代为持有的未到发布者的第三方修改也会被保全与补齐", t => {
  const {
    replicas: [authority, mobile, laptop],
  } = fixture(t);
  put(authority, "baseline", "one");
  exchange(authority, mobile);
  exchange(authority, laptop);
  put(mobile, "relayed", "not-on-authority");
  exchange(mobile, laptop);
  authority.retire(mobile);
  authority.retire(laptop);
  cut(authority, []);
  const first = authority.createCheckpoint();
  assert.throws(() => laptop.installCheckpoint(first), /NOT_PROTECTED/);
  authority.recoverArchive(laptop.exportRecoveryArchive({ includeRelay: true }));
  const next = authority.createCheckpoint();
  laptop.installCheckpoint(next, { reincarnate: true });
  assert.equal(
    laptop.rows("plugin_kv").find(row => row.key === "relayed").value,
    "not-on-authority"
  );
  assert.deepEqual(authority.replicatedSnapshot(), laptop.replicatedSnapshot());
});

test("离线删除恢复链可在回收后按原顺序重建，恢复凭据映射到新提交", t => {
  const {
    replicas: [authority, mobile, laptop],
  } = fixture(t);
  put(authority, "shared", "original");
  exchange(authority, mobile);
  exchange(authority, laptop);
  laptop.transaction(db => db.prepare("DELETE FROM plugin_kv").run());
  const deletion = laptop.head("plugin_kv", ["spike", "shared"]);
  laptop.restore("plugin_kv", ["spike", "shared"], `${deletion.device}:${deletion.sequence}`);
  put(laptop, "shared", "after-offline-restore");
  authority.retire(laptop);
  cut(authority, [mobile]);
  authority.recoverArchive(laptop.exportRecoveryArchive());
  const cp = authority.createCheckpoint();
  laptop.installCheckpoint(cp, { reincarnate: true });
  assert.equal(laptop.rows("plugin_kv")[0].value, "after-offline-restore");
  assert.equal(laptop.head("plugin_kv", ["spike", "shared"]).generation, 1);
  assert.equal(authority.recoveryBranches().length, 0);
});

test("保全的大字段冲突可跨再次回收存在，检查点缺失保全材料时禁止覆盖", t => {
  const {
    replicas: [authority, mobile, laptop],
  } = fixture(t);
  put(authority, "shared", "original");
  exchange(authority, mobile);
  exchange(authority, laptop);
  const offline = randomBytes(9000).toString("base64");
  put(laptop, "shared", offline);
  authority.transaction(db => db.prepare("DELETE FROM plugin_kv").run());
  exchange(authority, mobile);
  authority.retire(laptop);
  cut(authority, [mobile]);
  authority.recoverArchive(laptop.exportRecoveryArchive());
  const cp = authority.createCheckpoint();
  const missing = rewrite(cp, body => {
    body.branches = [];
  });
  assert.throws(
    () => laptop.installCheckpoint(missing, { reincarnate: true }),
    /LOCAL_OUTBOX_NOT_PROTECTED/
  );
  mobile.installCheckpoint(cp);
  authority.acknowledge(mobile);
  authority.compact();
  assert.equal(authority.recoveryBranches()[0].changes[0].after.value, offline);
  laptop.installCheckpoint(cp, { reincarnate: true });
  assert.equal(laptop.recoveryBranches()[0].changes[0].after.value, offline);
  assert.equal(laptop.rows("plugin_kv").length, 0);
});

test("检查点发布后继续编辑会阻止旧切点回收，不丢失新日志", t => {
  const {
    replicas: [authority, mobile],
  } = fixture(t, ["desktop", "mobile"]);
  put(authority, "key", "one");
  exchange(authority, mobile);
  const cp = authority.createCheckpoint();
  mobile.installCheckpoint(cp);
  authority.acknowledge(mobile);
  put(authority, "key", "two");
  const before = authority.db.prepare("SELECT count(*) AS n FROM _spike_batches").get().n;
  assert.throws(() => authority.compact(), /CHECKPOINT_MOVED/);
  assert.equal(authority.db.prepare("SELECT count(*) AS n FROM _spike_batches").get().n, before);
  exchange(authority, mobile);
  assert.equal(mobile.rows("plugin_kv")[0].value, "two");
});

test("只增加恢复材料而日志进度未变时，旧检查点也不能清掉新材料", t => {
  const {
    replicas: [authority, mobile, laptop],
  } = fixture(t);
  put(authority, "shared", "before");
  exchange(authority, mobile);
  exchange(authority, laptop);
  const value = randomBytes(9000).toString("base64");
  put(laptop, "shared", value);
  authority.transaction(db => db.prepare("DELETE FROM plugin_kv").run());
  exchange(authority, mobile);
  authority.retire(laptop);
  cut(authority, [mobile]);
  const cp = authority.createCheckpoint();
  mobile.installCheckpoint(cp);
  authority.acknowledge(mobile);
  const frontier = authority.frontier();
  authority.recoverArchive(laptop.exportRecoveryArchive());
  assert.deepEqual(authority.frontier(), frontier);
  assert.throws(() => authority.compact(), /CHECKPOINT_MOVED/);
  assert.equal(authority.recoveryBranches()[0].changes[0].after.value, value);
  cut(authority, [mobile]);
  assert.equal(authority.recoveryBranches()[0].changes[0].after.value, value);
});
