import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { LinearReplica, syncLinear, unpackLinearSnapshot } from "./linear-replica.mjs";
import { serveLinear, synchronizeLinear } from "./linear-transport.mjs";

test("SQLite 原生级联不能删除另一端后来新增的行，额外副作用回滚为整库冲突", t => {
  const { authority, mobile } = fixture(t);
  authority.transaction(db =>
    db
      .prepare(
        "INSERT INTO chat_group(id,name,parent_id,create_time,update_time) VALUES(1,'parent',NULL,1,1),(2,'old-child',1,1,1)"
      )
      .run()
  );
  syncLinear(mobile, authority);
  mobile.transaction(tx => tx.remove("chat_group", [1]), { scoped: true });
  authority.transaction(
    tx =>
      tx.insert("chat_group", {
        id: 3,
        name: "new-child",
        parent_id: 1,
        create_time: 1,
        update_time: 1,
      }),
    { scoped: true }
  );
  const result = syncLinear(mobile, authority);
  assert.equal(result.mode, "conflict");
  assert.match(result.conflict, /UNDECLARED_APPLY_EFFECT|OPAQUE_FORK|DEPENDENCY/);
  assert.equal(authority.rows("chat_group").find(row => row.id === 3).name, "new-child");
  assert.equal(authority.rows("chat_group").length, 3);
});

test("两边新建内容的整数 ID 撞号时完整保全，不把两条新内容当成同一条", t => {
  const { authority, mobile } = fixture(t);
  for (const [peer, value] of [
    [authority, "desktop-new"],
    [mobile, "mobile-new"],
  ])
    peer.transaction(
      tx => tx.insert("contents", { create_time: 1, update_time: 1, content: value }),
      { scoped: true }
    );
  const result = syncLinear(mobile, authority);
  assert.equal(result.mode, "conflict");
  assert.equal(text(authority, 3), "desktop-new");
  const saved = JSON.parse(
    authority.db.prepare("SELECT payload FROM _linear_branches WHERE id=?").get(result.branchId)
      .payload
  );
  assert.equal(saved.rows.contents.find(row => row.id === 3).content, "mobile-new");
});

test("包含二进制状态和 RESTRICT 外键的完整库能备份安装与选择", t => {
  const { directory, authority, mobile } = fixture(t);
  authority.transaction(db => {
    db.prepare(
      "INSERT INTO white_boards(id,create_time,update_time,title) VALUES(20,1,1,'board')"
    ).run();
    db.prepare(
      "INSERT INTO white_board_contents(id,create_time,update_time,data) VALUES(21,1,1,'{}')"
    ).run();
    db.prepare(
      "INSERT INTO whiteboard_documents(document_id,source_id,baseline_id,epoch,board_id,board_created_at,revision,revision_hash,creation_hash,state,contracts,snapshot,create_time,update_time) VALUES('board','library','baseline',1,20,1,1,'revision','creation',?,'{}','{}',1,1)"
    ).run(Buffer.from([0, 255, 128, 42]));
    db.prepare("INSERT INTO whiteboard_document_pages VALUES('board','page',21,1,1,0)").run();
  });
  syncLinear(mobile, authority);
  edit(mobile, 1, "mobile");
  edit(authority, 1, "desktop");
  const conflict = syncLinear(mobile, authority);
  assert.equal(conflict.mode, "conflict");
  assert.deepEqual(authority.snapshotRows(), mobile.snapshotRows());
  const path = authority.exportBranch(conflict.branchId, join(directory, "binary-copy.db"));
  const copy = new DatabaseSync(path, { readOnly: true });
  try {
    assert.deepEqual(
      Buffer.from(copy.prepare("SELECT state FROM whiteboard_documents").get().state),
      Buffer.from([0, 255, 128, 42])
    );
    assert.equal(copy.prepare("SELECT count(*) AS n FROM whiteboard_document_pages").get().n, 1);
  } finally {
    copy.close();
  }
  authority.chooseBranch(conflict.branchId, { expectedHead: authority.state().head });
  assert.deepEqual(authority.db.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(authority.rows("whiteboard_document_pages").length, 1);
});

function fixture(t, { seed = true } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "tau-linear-test-"));
  const peers = [];
  const authority = new LinearReplica(join(directory, "desktop.db"), { device: "desktop" });
  peers.push(authority);
  if (seed)
    authority.transaction(db => {
      db.prepare(
        "INSERT INTO contents(id,create_time,update_time,content) VALUES(1,1,1,'note-A'),(2,1,1,'note-B')"
      ).run();
      db.prepare(
        "INSERT INTO todo_group(id,title,create_time,update_time) VALUES(7,'group',1,1)"
      ).run();
    });
  const mobile = new LinearReplica(join(directory, "mobile.db"), {
    device: "mobile",
    snapshot: authority.exportSnapshot(),
  });
  peers.push(mobile);
  t.after(() => {
    for (const peer of peers) peer.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { directory, peers, authority, mobile };
}
const edit = (peer, id, content) =>
  peer.transaction(tx => tx.update("contents", [id], { content }), { scoped: true });
const text = (peer, id) => peer.rows("contents").find(row => row.id === id)?.content;

test("电脑改 A 手机改 B 自动接续，多次离线事务都保留，回传使用增量", t => {
  const { authority, mobile } = fixture(t);
  edit(authority, 1, "desktop-A");
  edit(mobile, 2, "mobile-B-1");
  edit(mobile, 2, "mobile-B-2");
  const result = syncLinear(mobile, authority);
  assert.equal(result.mode, "rebased");
  assert.equal(result.kind, "incremental");
  assert.equal("snapshot" in result, false);
  assert.equal(text(mobile, 1), "desktop-A");
  assert.equal(text(mobile, 2), "mobile-B-2");
  assert.deepEqual(authority.snapshotRows(), mobile.snapshotRows());
  assert.equal(authority.branches().length, 0);
});

test("等待同步响应期间继续编辑时不覆盖新输入，下一轮可安全重试", t => {
  const { authority, mobile } = fixture(t);
  edit(authority, 1, "desktop");
  edit(mobile, 2, "first-mobile");
  const response = authority.acceptBundle(mobile.bundle());
  edit(mobile, 2, "new-input-during-sync");
  assert.throws(() => mobile.installResponse(response), /LOCAL_CHANGED_DURING_SYNC/);
  assert.equal(text(mobile, 2), "new-input-during-sync");
  syncLinear(mobile, authority);
  assert.equal(text(authority, 2), "new-input-during-sync");
  assert.equal(text(authority, 1), "desktop");
});

test("通过 HTTP 列出完整副本并选择主版本，随后各端快照对齐", async t => {
  const { authority, mobile } = fixture(t);
  edit(authority, 1, "desktop");
  edit(mobile, 1, "mobile");
  const server = await serveLinear(authority);
  try {
    const conflict = await synchronizeLinear(mobile, server.url);
    assert.equal(conflict.wire.snapshotUploaded, true);
    const copies = await (await fetch(`${server.url}/branches`)).json();
    assert.equal(copies.length, 1);
    assert.ok(copies[0].bytes > 0);
    const selected = await fetch(`${server.url}/choose`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: copies[0].id, expectedHead: authority.state().head }),
    });
    assert.equal(selected.ok, true);
    await synchronizeLinear(mobile, server.url);
    assert.equal(text(mobile, 1), "mobile");
    assert.deepEqual(authority.snapshotRows(), mobile.snapshotRows());
    assert.equal(authority.branches().length, 2);
  } finally {
    await server.close();
  }
});

test("正常 HTTP 同步双向只传事务，其他大笔记不随每次同步上传", async t => {
  const { authority, mobile } = fixture(t);
  authority.transaction(db =>
    db
      .prepare("INSERT INTO contents(id,create_time,update_time,content) VALUES(3,1,1,?)")
      .run("unrelated".repeat(128 * 1024))
  );
  syncLinear(mobile, authority);
  const fullBytes = Buffer.byteLength(mobile.exportSnapshot().body);
  edit(authority, 1, "desktop-A");
  edit(mobile, 2, "mobile-B");
  const server = await serveLinear(authority);
  try {
    const result = await synchronizeLinear(mobile, server.url);
    assert.equal(result.kind, "incremental");
    assert.equal(result.wire.snapshotUploaded, false);
    assert.ok(result.wire.sentBytes < 20000 && result.wire.receivedBytes < 20000);
    assert.ok(fullBytes > 1024 * 1024);
    assert.deepEqual(authority.snapshotRows(), mobile.snapshotRows());
    t.diagnostic(JSON.stringify({ fullBytes, ...result.wire }));
  } finally {
    await server.close();
  }
});

test("同一版本的任意业务表可以线性复制，不需要逐表合并处理器", t => {
  const { authority, mobile } = fixture(t);
  mobile.transaction(db => db.prepare("UPDATE excerpt_provider SET update_time=123").run());
  const result = syncLinear(mobile, authority);
  assert.equal(result.mode, "incremental");
  assert.equal(authority.rows("excerpt_provider")[0].update_time, 123);
  assert.equal(authority.tables.length, 98);
  assert.deepEqual(authority.snapshotRows(), mobile.snapshotRows());
});

test("写入行不同但读取依据改变时保留整库，防止写偏差", t => {
  const { authority, mobile } = fixture(t);
  authority.transaction(
    tx => {
      tx.read("contents", [2]);
      tx.update("contents", [1], { content: "desktop-off" });
    },
    { scoped: true }
  );
  mobile.transaction(
    tx => {
      tx.read("contents", [1]);
      tx.update("contents", [2], { content: "mobile-off" });
    },
    { scoped: true }
  );
  const result = syncLinear(mobile, authority);
  assert.equal(result.mode, "conflict");
  assert.match(result.conflict, /DEPENDENCY/);
  assert.equal(text(authority, 1), "desktop-off");
  assert.equal(text(authority, 2), "note-B");
  assert.equal(authority.branches().length, 1);
});

test("父分组删除和离线新增待办虽写不同记录，父级依赖仍能阻止孤儿", t => {
  const { authority, mobile } = fixture(t);
  mobile.transaction(
    tx => {
      assert.ok(tx.read("todo_group", [7]));
      tx.insert("todo_item", {
        id: 8,
        group_id: 7,
        title: "offline",
        create_time: 1,
        update_time: 1,
      });
    },
    { scoped: true }
  );
  authority.transaction(tx => tx.remove("todo_group", [7]), { scoped: true });
  const result = syncLinear(mobile, authority);
  assert.equal(result.mode, "conflict");
  assert.equal(authority.rows("todo_item").length, 0);
  const branch = unpackLinearSnapshot(
    JSON.parse(mobile.db.prepare("SELECT payload FROM _linear_ack_snapshot").get().payload)
  );
  assert.equal(branch.rows.todo_group.length, 0);
  assert.equal(authority.branches().length, 1);
});

test("查询范围出现新记录时表级守卫保护幻读，旧观察值不能伪装成新读取", t => {
  const { authority, mobile } = fixture(t);
  const observed = mobile.rowVersion("contents", [1]);
  mobile.transaction(
    tx => {
      tx.scan("todo_group");
      tx.update("contents", [2], { content: "based-on-group-count" });
    },
    { scoped: true }
  );
  authority.transaction(
    tx => tx.insert("todo_group", { id: 9, title: "new", create_time: 1, update_time: 1 }),
    { scoped: true }
  );
  assert.equal(syncLinear(mobile, authority).mode, "conflict");
  edit(mobile, 1, "newer");
  assert.throws(
    () => mobile.transaction(tx => tx.expect("contents", [1], observed), { scoped: true }),
    /STALE_OBSERVATION/
  );
});

test("不同主键竞争唯一业务键时不半写，整库副本保留另一份实体", t => {
  const { authority, mobile } = fixture(t);
  const insert = (peer, id) =>
    peer.transaction(
      tx => {
        tx.read("contents", [1]);
        tx.insert("plugin_entities", {
          id,
          plugin_id: "spike",
          kind: "kind",
          key: "same",
          title: String(id),
          content_id: 1,
          create_time: 1,
          update_time: 1,
        });
      },
      { scoped: true }
    );
  insert(authority, 100);
  insert(mobile, 200);
  const result = syncLinear(mobile, authority);
  assert.equal(result.mode, "conflict");
  assert.match(result.conflict, /UNIQUE/);
  assert.deepEqual(
    authority.rows("plugin_entities").map(row => row.id),
    [100]
  );
  const copy = JSON.parse(
    authority.db.prepare("SELECT payload FROM _linear_branches WHERE id=?").get(result.branchId)
      .payload
  );
  assert.deepEqual(
    copy.rows.plugin_entities.map(row => row.id),
    [200]
  );
});

test("同一记录被删除再建立后，值相同也不能接纳旧写入", t => {
  const { authority, mobile } = fixture(t);
  edit(mobile, 1, "old-mobile-edit");
  authority.transaction(db => {
    db.prepare("DELETE FROM contents WHERE id=1").run();
    db.prepare(
      "INSERT INTO contents(id,create_time,update_time,content) VALUES(1,1,1,'note-A')"
    ).run();
  });
  const result = syncLinear(mobile, authority);
  assert.equal(result.mode, "conflict");
  assert.equal(text(authority, 1), "note-A");
});

test("长期离线且主线日志已清理，不同内容仍可自动接续；干净设备用快照追赶", t => {
  const { directory, peers, authority, mobile } = fixture(t);
  const clean = new LinearReplica(join(directory, "clean.db"), {
    device: "clean",
    snapshot: authority.exportSnapshot(),
  });
  peers.push(clean);
  edit(authority, 1, "desktop-after-long-offline");
  authority.compact();
  assert.equal(authority.db.prepare("SELECT count(*) AS n FROM _linear_commits").get().n, 0);
  edit(mobile, 2, "offline-B");
  const result = syncLinear(mobile, authority);
  assert.equal(result.mode, "rebased");
  assert.equal(result.kind, "snapshot");
  assert.equal(text(mobile, 2), "offline-B");
  const pulled = syncLinear(clean, authority);
  assert.equal(pulled.kind, "snapshot");
  assert.deepEqual(clean.snapshotRows(), authority.snapshotRows());
});

test("本机离线日志也压缩后，主线未变可快照接续，回应丢失重试不制造冲突", async t => {
  const { authority, mobile } = fixture(t);
  edit(mobile, 1, "offline-1");
  edit(mobile, 2, "offline-2");
  mobile.compact();
  const server = await serveLinear(authority, { dropReplyOnce: true });
  try {
    await assert.rejects(synchronizeLinear(mobile, server.url));
    const result = await synchronizeLinear(mobile, server.url);
    assert.equal(result.mode, "current");
    assert.equal(result.kind, "snapshot");
  } finally {
    await server.close();
  }
  assert.equal(text(authority, 1), "offline-1");
  assert.equal(text(authority, 2), "offline-2");
  assert.equal(authority.branches().length, 0);
  edit(mobile, 2, "next-edit");
  assert.equal(syncLinear(mobile, authority).mode, "incremental");
});

test("两边都改且本机已无增量证据时保留完整库，不猜测合并", t => {
  const { authority, mobile } = fixture(t);
  edit(mobile, 2, "mobile");
  mobile.compact();
  edit(authority, 1, "desktop");
  authority.compact();
  const result = syncLinear(mobile, authority);
  assert.equal(result.mode, "conflict");
  assert.equal(result.conflict, "SNAPSHOT_FORK");
  assert.equal(authority.branches().length, 1);
  assert.equal(text(authority, 1), "desktop");
  assert.equal(text(mobile, 1), "desktop");
});

test("整库冲突副本可导出 SQLite 供选择，选择前后两份内容均完整保留", t => {
  const { directory, authority, mobile } = fixture(t);
  edit(mobile, 1, "mobile-choice");
  mobile.transaction(
    tx =>
      tx.insert("plugin_records", {
        id: "mobile-record",
        plugin_id: "spike",
        collection: "c",
        data: "{}",
        create_time: 1,
        update_time: 1,
      }),
    { scoped: true }
  );
  edit(authority, 1, "desktop-choice");
  const result = syncLinear(mobile, authority);
  assert.equal(result.mode, "conflict");
  const path = authority.exportBranch(result.branchId, join(directory, "mobile-copy.db"));
  const copy = new DatabaseSync(path, { readOnly: true });
  try {
    assert.equal(
      copy
        .prepare(
          "SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
        .get().n,
      98
    );
    assert.equal(
      copy.prepare("SELECT content FROM contents WHERE id=1").get().content,
      "mobile-choice"
    );
    assert.equal(copy.prepare("SELECT count(*) AS n FROM plugin_records").get().n, 1);
    assert.deepEqual(copy.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    copy.close();
  }
  const oldHead = authority.state().head;
  edit(authority, 2, "latest-desktop");
  assert.throws(
    () => authority.chooseBranch(result.branchId, { expectedHead: oldHead }),
    /CHOICE_HEAD/
  );
  const chosen = authority.chooseBranch(result.branchId, { expectedHead: authority.state().head });
  assert.equal(text(authority, 1), "mobile-choice");
  assert.equal(authority.branches().length, 2);
  const displaced = join(directory, "desktop-copy.db");
  authority.exportBranch(chosen.previous, displaced);
  const old = new DatabaseSync(displaced, { readOnly: true });
  try {
    assert.equal(
      old.prepare("SELECT content FROM contents WHERE id=2").get().content,
      "latest-desktop"
    );
  } finally {
    old.close();
  }
  assert.equal(syncLinear(mobile, authority).kind, "snapshot");
  assert.deepEqual(authority.snapshotRows(), mobile.snapshotRows());
  edit(mobile, 2, "after-choice");
  assert.equal(syncLinear(mobile, authority).mode, "incremental");
});

test("增量被接纳后本机安装失败，旧编辑完整保留，服务端回收后重试可补齐", t => {
  const { authority, mobile } = fixture(t);
  edit(authority, 1, "desktop");
  edit(mobile, 2, "mobile");
  const before = mobile.snapshotRows();
  const bundle = mobile.bundle();
  const response = authority.acceptBundle(bundle);
  assert.throws(() => mobile.installResponse(response, { failAfterRows: 1 }), /INTERRUPTED/);
  assert.deepEqual(mobile.snapshotRows(), before);
  assert.equal(mobile.db.prepare("SELECT count(*) AS n FROM _linear_local").get().n, 1);
  authority.compact();
  const retried = syncLinear(mobile, authority);
  assert.equal(retried.kind, "snapshot");
  assert.deepEqual(authority.snapshotRows(), mobile.snapshotRows());
  assert.equal(authority.branches().length, 0);
});

test("选择整库版本中断时旧主库和冲突副本不变，旧代设备不会覆盖新选择", t => {
  const { directory, peers, authority, mobile } = fixture(t);
  const other = new LinearReplica(join(directory, "other.db"), {
    device: "other",
    snapshot: authority.exportSnapshot(),
  });
  peers.push(other);
  edit(other, 2, "old-epoch-pending");
  edit(authority, 1, "desktop");
  edit(mobile, 1, "mobile");
  const result = syncLinear(mobile, authority);
  const before = authority.snapshotRows();
  assert.throws(
    () =>
      authority.chooseBranch(result.branchId, {
        expectedHead: authority.state().head,
        failAfterRows: 1,
      }),
    /INTERRUPTED/
  );
  assert.deepEqual(authority.snapshotRows(), before);
  assert.equal(authority.branches().length, 1);
  authority.chooseBranch(result.branchId, { expectedHead: authority.state().head });
  const late = syncLinear(other, authority);
  assert.equal(late.mode, "conflict");
  assert.equal(late.conflict, "EPOCH_FORK");
  assert.equal(text(authority, 1), "mobile");
  assert.equal(text(authority, 2), "note-B");
});

test("进程在快照安装中直接退出，重开仍保留旧库和全部未确认事务", t => {
  const { directory, peers, authority, mobile } = fixture(t);
  edit(authority, 1, "desktop");
  authority.compact();
  edit(mobile, 2, "mobile");
  const before = mobile.snapshotRows();
  const response = authority.acceptBundle(mobile.bundle());
  const file = join(directory, "response.json");
  writeFileSync(file, JSON.stringify(response));
  mobile.close();
  const moduleUrl = new URL("./linear-replica.mjs", import.meta.url).href;
  const script = `import{readFileSync}from'node:fs';import{LinearReplica}from${JSON.stringify(moduleUrl)};const r=new LinearReplica(${JSON.stringify(join(directory, "mobile.db"))},{device:'mobile'});r.installResponse(JSON.parse(readFileSync(${JSON.stringify(file)},'utf8')),{crashAfterRows:1});`;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
  });
  assert.equal(child.status, 17, child.stderr);
  const reopened = new LinearReplica(join(directory, "mobile.db"), { device: "mobile" });
  peers.push(reopened);
  assert.deepEqual(reopened.snapshotRows(), before);
  assert.equal(reopened.db.prepare("SELECT count(*) AS n FROM _linear_local").get().n, 1);
  syncLinear(reopened, authority);
  assert.deepEqual(reopened.snapshotRows(), authority.snapshotRows());
});

test("不透明 SQL 和错误资料库不会绕过同步保护", t => {
  const { authority, mobile } = fixture(t);
  mobile.transaction(db =>
    db.prepare("UPDATE contents SET content='opaque-mobile' WHERE id=2").run()
  );
  edit(authority, 1, "desktop");
  const result = syncLinear(mobile, authority);
  assert.equal(result.mode, "conflict");
  assert.equal(result.conflict, "OPAQUE_FORK");
  const before = authority.state().head;
  assert.throws(() => authority.transaction(db => db.exec("COMMIT")), /authorized|authorization/);
  assert.equal(authority.state().head, before);
  const packet = mobile.bundle();
  const body = JSON.parse(packet.snapshot.body);
  body.library = "different-library";
  packet.snapshot.body = JSON.stringify(body);
  packet.snapshot.id = createHash("sha256").update(packet.snapshot.body).digest("hex");
  packet.snapshotId = packet.snapshot.id;
  assert.throws(() => authority.acceptBundle(packet), /BUNDLE_SNAPSHOT/);
  assert.equal(authority.state().head, before);
});
