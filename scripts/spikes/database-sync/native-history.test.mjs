import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes, createHash } from "node:crypto";
import { HistoryReplica, openCheckpoint } from "./history-replica.mjs";
import { SemanticReplica } from "./semantic-replica.mjs";
import { canonical, exchange } from "./replica.mjs";

const native = { skip: !process.env.TAU_SPIKE_RUST_BIN };
function fixture(t, names = ["desktop", "mobile", "laptop"], ReplicaType = HistoryReplica) {
  const directory = mkdtempSync(join(tmpdir(), "tau-native-history-"));
  const replicas = [];
  for (const [slot, device] of names.entries())
    replicas.push(
      new ReplicaType(join(directory, `${device}.db`), {
        device,
        slot: slot + 1,
        baseline: replicas[0]?.initialBaseline(),
      })
    );
  for (const peer of replicas.slice(1)) replicas[0].register?.(peer);
  t.after(() => {
    for (const peer of replicas) peer.close();
    rmSync(directory, { recursive: true, force: true });
  });
  let request = 0;
  function invoke(device, command, input, extra) {
    const path = join(directory, `request-${request++}.json`);
    writeFileSync(path, JSON.stringify(input));
    return spawnSync(
      process.env.TAU_SPIKE_RUST_BIN,
      [
        join(directory, `${device}.db`),
        command,
        path,
        ...(extra === undefined ? [] : [String(extra)]),
      ],
      { encoding: "utf8" }
    );
  }
  function success(device, command, input, extra) {
    const result = invoke(device, command, input, extra);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  }
  function reopen(device, slot) {
    const peer = new ReplicaType(join(directory, `${device}.db`), { device, slot });
    replicas.push(peer);
    return peer;
  }
  return { directory, replicas, invoke, success, reopen };
}
function put(peer, key, value) {
  peer.transaction(db =>
    db
      .prepare(
        "INSERT INTO plugin_kv VALUES('spike',?,?,1) ON CONFLICT(plugin_id,key) DO UPDATE SET value=excluded.value"
      )
      .run(key, value)
  );
}
function compact(authority, peers) {
  const cp = authority.createCheckpoint();
  for (const peer of peers) {
    peer.installCheckpoint(cp);
    authority.acknowledge(peer);
  }
  authority.compact();
  return cp;
}

test("Rust 与 Node 共用文本和二进制差量样例，损坏摘要明确拒绝", native, t => {
  const {
    replicas: [authority],
    success,
    invoke,
  } = fixture(t, ["desktop"]);
  const before = `中文🙂${randomBytes(9000).toString("base64")}`;
  const after = `${before.slice(0, 2000)}新内容${before.slice(2000)}`;
  const binary = randomBytes(9000);
  const edited = Buffer.from(binary);
  edited[300] ^= 255;
  for (const [previous, value] of [
    [null, before],
    [before, after],
    [{ $blob: binary.toString("hex") }, { $blob: edited.toString("hex").toUpperCase() }],
  ]) {
    const encoded = authority.codec.encode(value, previous);
    assert.deepEqual(success("desktop", "decode-field", { encoded, previous }), value);
  }
  const encoded = authority.codec.encode(after, before);
  encoded.hash = "0".repeat(64);
  assert.notEqual(invoke("desktop", "decode-field", { encoded, previous: before }).status, 0);
});

test("Rust 接收 Node 新协议并反向发出大字段差量，原生日志可由 Node 恢复", native, t => {
  for (const ReplicaType of [SemanticReplica, HistoryReplica]) {
    const { replicas, success, reopen } = fixture(t, ["desktop", "mobile"], ReplicaType);
    const [authority, mobile] = replicas;
    let value = `原生${randomBytes(12 * 1024).toString("base64")}`;
    put(authority, "shared", value);
    mobile.close();
    success("mobile", "receive", authority.exportSince({})[0]);
    value = `${value.slice(0, 2000)}修改${value.slice(2000)}`;
    put(authority, "shared", value);
    success("mobile", "receive", authority.exportSince({}).at(-1));
    const next = `${value}Rust追加`;
    const batch = success("mobile", "emit", { key: "shared", value: next });
    assert.equal(batch.protocol, authority.protocol);
    assert.equal(batch.changes[0].patch.value.codec, "splice");
    authority.receive(batch);
    const reopened = reopen("mobile", 2);
    if (reopened.protocol === 3) assert.equal(reopened.exportRecoveryArchive().length, 1);
    assert.deepEqual(reopened.snapshot(), authority.snapshot());
    assert.equal(authority.rows("plugin_kv")[0].value, next);
  }
});

test("Rust 离线写入在历史回收后重新提交，原生安装检查点后继续发送", native, t => {
  const { replicas, success, invoke, reopen } = fixture(t);
  const [authority, mobile, laptop] = replicas;
  put(authority, "baseline", "one");
  exchange(authority, mobile);
  exchange(authority, laptop);
  laptop.close();
  const nativeBatch = success("laptop", "emit", {
    key: "offline-native",
    value: randomBytes(6000).toString("base64"),
  });
  success("laptop", "emit", { key: "baseline", value: "offline-conflict" });
  const offline = reopen("laptop", 3);
  const archive = offline.exportRecoveryArchive();
  assert.equal(
    archive[0].fingerprint,
    createHash("sha256").update(canonical(nativeBatch)).digest("hex")
  );
  put(authority, "desktop-new", "two");
  authority.transaction(db => db.prepare("DELETE FROM plugin_kv WHERE key='baseline'").run());
  exchange(authority, mobile);
  authority.retire(offline);
  const old = compact(authority, [mobile]);
  offline.close();
  assert.notEqual(invoke("laptop", "install", old).status, 0);
  authority.recoverArchive(archive);
  const fresh = authority.createCheckpoint();
  assert.equal(success("laptop", "verify", fresh).verified, true);
  assert.equal(success("laptop", "install", fresh).installed, true);
  const recovered = reopen("laptop", 3);
  assert.equal(recovered.recoveryBranches()[0].changes[0].after.value, "offline-conflict");
  assert.notEqual(recovered.state.device, "laptop");
  assert.deepEqual(recovered.replicatedSnapshot(), authority.replicatedSnapshot());
  recovered.close();
  const next = success("laptop", "emit", { key: "after-native-install", value: "works" });
  authority.receive(next);
  assert.equal(
    authority.rows("plugin_kv").find(row => row.key === "after-native-install").value,
    "works"
  );
});

test("Rust 检查点安装进程中途退出，旧库和未上传材料仍完整，重试成功", native, t => {
  const { replicas, success, invoke, reopen } = fixture(t);
  const [authority, mobile, laptop] = replicas;
  put(authority, "baseline", "one");
  exchange(authority, mobile);
  exchange(authority, laptop);
  put(laptop, "local", "protected");
  const before = laptop.snapshot();
  const archive = laptop.exportRecoveryArchive();
  authority.retire(laptop);
  compact(authority, [mobile]);
  authority.recoverArchive(archive);
  const fresh = authority.createCheckpoint();
  laptop.close();
  assert.equal(invoke("laptop", "install", fresh, 1).status, 17);
  const old = reopen("laptop", 3);
  assert.deepEqual(old.snapshot(), before);
  assert.equal(old.exportRecoveryArchive().length, 1);
  old.close();
  success("laptop", "install", fresh);
  const complete = reopen("laptop", 3);
  assert.deepEqual(complete.replicatedSnapshot(), authority.replicatedSnapshot());
});

test("Rust 未实现领域的增量不会半写；坏检查点块不会覆盖旧数据", native, t => {
  const { replicas, invoke, reopen } = fixture(t, ["desktop", "mobile"]);
  const [authority, mobile] = replicas;
  authority.transaction(db =>
    db
      .prepare("INSERT INTO todo_group(id,title,create_time,update_time) VALUES(7,'分组',1,1)")
      .run()
  );
  mobile.close();
  let result = invoke("mobile", "receive", authority.exportSince({})[0]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /UNSUPPORTED_RULE/);
  const unchanged = reopen("mobile", 2);
  assert.deepEqual(unchanged.frontier(), {});
  put(authority, "large", "值".repeat(6000));
  const envelope = authority.createCheckpoint();
  const body = openCheckpoint(envelope);
  body.chunks[0].data = Buffer.from("broken").toString("base64");
  const text = canonical(body);
  const bad = { id: createHash("sha256").update(text).digest("hex"), body: text };
  unchanged.close();
  result = invoke("mobile", "install", bad);
  assert.notEqual(result.status, 0);
  const after = reopen("mobile", 2);
  assert.equal(after.rows("plugin_kv").length, 0);
  assert.equal(after.rows("todo_group").length, 0);
});
