import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { constants, DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { Replica, exchange } from "./replica.mjs";
import { SemanticReplica } from "./semantic-replica.mjs";
import { randomBytes, createHash } from "node:crypto";
import { serveReplica, startAutoSync, synchronize } from "./transport.mjs";

function fixture(t, devices = ["desktop", "mobile"], ReplicaType = Replica) {
  const directory = mkdtempSync(join(tmpdir(), "tau-database-sync-"));
  const replicas = [];
  for (const [index, device] of devices.entries())
    replicas.push(
      new ReplicaType(join(directory, `${device}.db`), {
        device,
        slot: index + 1,
        baseline: replicas[0]?.initialBaseline(),
      })
    );
  t.after(() => {
    for (const replica of replicas) replica.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { directory, replicas };
}

function insertCard(replica, text) {
  return replica.transaction(db => {
    const contentId = replica.allocateId();
    const cardId = replica.allocateId();
    db.prepare("INSERT INTO contents(id,create_time,update_time,content) VALUES(?,1,1,?)").run(
      contentId,
      JSON.stringify([{ type: "paragraph", children: [{ text }] }])
    );
    db.prepare(
      "INSERT INTO content_documents(content_id,document_id,format_version,contracts,revision) VALUES(?,?,2,'{}','initial')"
    ).run(contentId, `document-${contentId}`);
    db.prepare("INSERT INTO cards(id,create_time,update_time,content_id) VALUES(?,1,1,?)").run(
      cardId,
      contentId
    );
    return { cardId, contentId };
  });
}

function writeSetting(replica, key, value) {
  replica.transaction(db =>
    db
      .prepare(
        "INSERT INTO plugin_kv VALUES('spike',?,?,1) ON CONFLICT(plugin_id,key) DO UPDATE SET value=excluded.value"
      )
      .run(key, JSON.stringify(value))
  );
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function waitFor(predicate) {
  const deadline = Date.now() + 4000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("自动同步超时");
    await delay(20);
  }
}

test("真实主库 98 表均安装捕获，覆盖组合键、唯一键和 BLOB", t => {
  const {
    replicas: [left, right],
  } = fixture(t);
  assert.equal(left.tables.length, 98);
  assert.deepEqual(left.tableMap.get("content_links").key, ["content_id", "target_content_id"]);
  assert.deepEqual(left.tableMap.get("whiteboard_documents").blobs, ["state"]);
  assert.equal(
    left.db
      .prepare(
        "SELECT count(*) AS n FROM sqlite_master WHERE type='trigger' AND name LIKE '_spike_%'"
      )
      .get().n,
    294
  );
  assert.deepEqual(left.snapshot(), right.snapshot());
  assert.throws(
    () => left.db.prepare("INSERT INTO plugin_kv VALUES('spike','unsafe','{}',1)").run(),
    /outside transaction/
  );
});

test("携带设备外出：离线各改多个业务域，回来只补增量，98 表一致", t => {
  const {
    replicas: [left, right],
  } = fixture(t);
  const baseline = insertCard(left, "共同基线");
  exchange(left, right);
  const desktopCard = insertCard(left, "电脑离线新建");
  const mobileCard = insertCard(right, "手机离线新建");
  assert.notEqual(desktopCard.cardId, mobileCard.cardId);
  left.transaction(db => db.prepare("UPDATE cards SET is_top=1 WHERE id=?").run(baseline.cardId));
  right.transaction(db => {
    const groupId = right.allocateId();
    db.prepare("INSERT INTO todo_group(id,title,create_time,update_time) VALUES(?,'出差',1,1)").run(
      groupId
    );
    db.prepare(
      "INSERT INTO todo_item(id,group_id,title,create_time,update_time) VALUES(?,?,'买车票',1,1)"
    ).run(right.allocateId(), groupId);
    db.prepare(
      "INSERT INTO plugin_records VALUES('record-mobile','expense','entries',?,1,1,NULL)"
    ).run(JSON.stringify({ amount: 42 }));
    db.prepare("INSERT INTO content_links VALUES(?,?,1)").run(
      baseline.contentId,
      mobileCard.contentId
    );
  });
  assert.equal(exchange(left, right), 4);
  assert.deepEqual(left.snapshot(), right.snapshot());
  assert.equal(left.rows("cards").length, 3);
  assert.equal(left.rows("todo_item").length, 1);
  assert.equal(left.rows("plugin_records").length, 1);
  assert.equal(exchange(left, right), 0);
});

test("手机未打开：电脑修改已持久化，手机随后通过 HTTP 自动追赶", async t => {
  const {
    replicas: [left, right],
  } = fixture(t);
  insertCard(left, "手机未打开时的修改");
  const server = await serveReplica(left);
  let stop;
  try {
    const errors = [];
    stop = startAutoSync(right, server.url, { onError: error => errors.push(error.message) });
    await waitFor(() => right.rows("cards").length === 1);
    writeSetting(right, "from-mobile", true);
    await waitFor(() => left.rows("plugin_kv").length === 1);
    await stop();
    assert.deepEqual(errors, []);
    assert.deepEqual(left.snapshot(), right.snapshot());
  } finally {
    await stop?.();
    await server.close();
  }
});

test("同记录并发分叉按逻辑版本收敛，两个版本可查，后续编辑消解分叉", t => {
  const {
    replicas: [left, right],
  } = fixture(t);
  writeSetting(left, "shared", "基线");
  exchange(left, right);
  writeSetting(left, "shared", "电脑修改");
  writeSetting(right, "shared", "手机修改");
  exchange(left, right);
  assert.deepEqual(left.snapshot(), right.snapshot());
  assert.equal(left.conflicts().length, 1);
  assert.deepEqual(left.conflicts(), right.conflicts());
  assert.equal(left.conflicts()[0].versions.length, 2);
  writeSetting(left, "shared", "确认后的新版本");
  exchange(left, right);
  assert.equal(left.conflicts().length, 0);
  assert.equal(left.exportSince().length, 4);
  assert.deepEqual(left.snapshot(), right.snapshot());
});

test("删除遇到离线旧编辑不会复活，即使旧编辑逻辑时钟更高", t => {
  const {
    replicas: [left, right],
  } = fixture(t);
  writeSetting(left, "shared", "基线");
  exchange(left, right);
  left.transaction(db => db.prepare("DELETE FROM plugin_kv WHERE key='shared'").run());
  for (let index = 0; index < 5; index++) writeSetting(right, `unrelated-${index}`, index);
  writeSetting(right, "shared", "离线旧编辑");
  exchange(left, right);
  assert.equal(
    left.rows("plugin_kv").some(row => row.key === "shared"),
    false
  );
  assert.deepEqual(left.snapshot(), right.snapshot());
  assert.equal(left.conflicts().length, 1);
  assert.throws(() => writeSetting(right, "shared", "复用旧身份"), /retired identity/);
});

test("乱序先拒绝、补齐后接纳；重复和被篡改的操作身份不重复写入", t => {
  const {
    replicas: [left, right],
  } = fixture(t);
  writeSetting(left, "first", 1);
  writeSetting(left, "second", 2);
  const [first, second] = left.exportSince();
  assert.throws(() => right.receive(second), /缺少先行/);
  assert.deepEqual(right.frontier(), {});
  right.receive(first);
  right.receive(second);
  assert.equal(right.receive(first), "duplicate");
  assert.throws(() => right.receive({ ...first, clock: 50 }), /不同内容/);
  assert.throws(() => right.receive({ ...first, group: "another-library" }), /资料库/);
  assert.throws(() => right.receive({ ...first, schema: "old-schema" }), /Schema/);
  assert.deepEqual(left.snapshot(), right.snapshot());
});

test("跨表事务接收一半失败：行、变更日志和确认进度共同回滚，重试成功", t => {
  const { directory, replicas } = fixture(t);
  const [left, right] = replicas;
  insertCard(left, "原子提交");
  const [batch] = left.exportSince();
  assert.equal(batch.changes.length, 3);
  assert.throws(() => right.receive(batch, { failAfterChanges: 1 }), /接收中断/);
  assert.equal(right.rows("contents").length, 0);
  assert.equal(right.exportSince().length, 0);
  assert.deepEqual(right.frontier(), {});
  right.close();
  const restarted = new Replica(join(directory, "mobile.db"), { device: "mobile", slot: 2 });
  replicas.push(restarted);
  restarted.receive(batch);
  assert.deepEqual(left.snapshot(), restarted.snapshot());
});

test("发送后丢失响应：重试幂等，接收端无重复记录和回声日志", async t => {
  const {
    replicas: [left, right],
  } = fixture(t);
  insertCard(right, "确认前断线");
  const server = await serveReplica(left, { dropReplyOnce: true });
  try {
    await assert.rejects(synchronize(right, server.url));
    assert.equal(left.rows("cards").length, 1);
    await synchronize(right, server.url);
    assert.equal(left.rows("cards").length, 1);
    assert.equal(left.exportSince().length, 1);
    assert.deepEqual(left.snapshot(), right.snapshot());
  } finally {
    await server.close();
  }
});

test("真实子进程退出：已提交修改和 outbox 可恢复，未提交事务无半份数据", t => {
  const { directory, replicas } = fixture(t, []);
  const moduleUrl = new URL("./replica.mjs", import.meta.url).href;
  for (const committed of [false, true]) {
    const path = join(directory, `${committed}.db`);
    const script = `import {Replica} from ${JSON.stringify(moduleUrl)}; const replica=new Replica(${JSON.stringify(path)},{device:'desktop',slot:1}); replica.transaction(db=>{db.prepare("INSERT INTO plugin_kv VALUES('spike','crash','{}',1)").run(); ${committed ? "" : "process.exit(17);"}}); process.exit(17);`;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8",
    });
    assert.equal(child.status, 17, child.stderr);
    const restarted = new Replica(path, { device: "desktop", slot: 1 });
    replicas.push(restarted);
    assert.equal(restarted.rows("plugin_kv").length, committed ? 1 : 0);
    assert.equal(restarted.exportSince().length, committed ? 1 : 0);
  }
});

test("第三设备可转发原始来源日志，来源设备退出后仍可追赶", t => {
  const {
    replicas: [left, middle, right],
  } = fixture(t, ["desktop", "mobile", "laptop"]);
  insertCard(left, "经手机转发");
  exchange(left, middle);
  left.close();
  exchange(middle, right);
  assert.deepEqual(middle.snapshot(), right.snapshot());
  assert.deepEqual(middle.frontier(), right.frontier());
});

test("三个副本分叉按不同连接顺序交换，业务状态和冲突视图相同", t => {
  const {
    replicas: [left, middle, right],
  } = fixture(t, ["desktop", "mobile", "laptop"]);
  writeSetting(left, "shared", "基线");
  exchange(left, middle);
  exchange(left, right);
  writeSetting(left, "shared", "电脑");
  writeSetting(middle, "shared", "手机");
  writeSetting(right, "shared", "笔记本");
  exchange(middle, right);
  exchange(left, right);
  exchange(middle, left);
  assert.deepEqual(left.snapshot(), middle.snapshot());
  assert.deepEqual(left.snapshot(), right.snapshot());
  assert.deepEqual(left.conflicts(), middle.conflicts());
  assert.deepEqual(left.conflicts(), right.conflicts());
});

test("白板二进制状态可捕获和传输，不被 JSON 字符串化损坏", t => {
  const {
    replicas: [left, right],
  } = fixture(t);
  left.transaction(db => {
    db.prepare(
      "INSERT INTO whiteboard_documents(document_id,source_id,baseline_id,epoch,revision,revision_hash,creation_hash,state,contracts,snapshot,create_time,update_time) VALUES('board','library','baseline',1,1,'revision','creation',?,'{}','{}',1,1)"
    ).run(Buffer.from([0, 255, 128, 42]));
  });
  exchange(left, right);
  assert.deepEqual(left.snapshot(), right.snapshot());
  assert.deepEqual(right.rows("whiteboard_documents")[0].state, { $blob: "00FF802A" });
});

test("已知边界：跨记录唯一约束冲突整批拒绝，保持数据和进度，等待领域裁决", t => {
  const {
    replicas: [left, right],
  } = fixture(t);
  const { contentId } = insertCard(left, "共同正文");
  exchange(left, right);
  for (const replica of [left, right])
    replica.transaction(db =>
      db
        .prepare(
          "INSERT INTO plugin_entities(id,plugin_id,kind,key,content_id,create_time,update_time) VALUES(?,'spike','kind','same-key',?,1,1)"
        )
        .run(replica.allocateId(), contentId)
    );
  const before = right.snapshot();
  const frontier = right.frontier();
  assert.throws(() => right.receive(left.exportSince(frontier)[0]), /UNIQUE constraint/);
  assert.deepEqual(right.snapshot(), before);
  assert.deepEqual(right.frontier(), frontier);
});

test("反例：直接互套 SQLite changeset 并总选远端，主键碰撞会导致两边不同", () => {
  const databases = [new DatabaseSync(":memory:"), new DatabaseSync(":memory:")];
  try {
    const updates = databases.map((db, index) => {
      db.exec("CREATE TABLE cards(id INTEGER PRIMARY KEY, title TEXT)");
      const session = db.createSession();
      db.prepare("INSERT INTO cards(title) VALUES(?)").run(index === 0 ? "电脑新增" : "手机新增");
      const update = session.changeset();
      session.close();
      return update;
    });
    databases[0].applyChangeset(updates[1], {
      onConflict: () => constants.SQLITE_CHANGESET_REPLACE,
    });
    databases[1].applyChangeset(updates[0], {
      onConflict: () => constants.SQLITE_CHANGESET_REPLACE,
    });
    assert.notDeepEqual(
      databases[0].prepare("SELECT * FROM cards").all(),
      databases[1].prepare("SELECT * FROM cards").all()
    );
  } finally {
    for (const db of databases) db.close();
  }
});

test("真实删除守门触发器的副作用随同事务复制，稳定身份退役结果一致", t => {
  const {
    replicas: [left, right],
  } = fixture(t);
  left.transaction(db => {
    db.prepare("INSERT INTO contents(id,create_time,update_time,content) VALUES(7,1,1,'[]')").run();
    db.prepare("INSERT INTO entity_identities VALUES('content','stable-content',7,1,NULL)").run();
  });
  exchange(left, right);
  left.transaction(db => db.prepare("DELETE FROM contents WHERE id=7").run());
  exchange(left, right);
  assert.deepEqual(left.snapshot(), right.snapshot());
  assert.ok(right.rows("entity_identities")[0].retired_at > 0);
});

test(
  "Rust rusqlite 原生写入的变更日志可在重启后由 Node 读取并同步",
  { skip: !process.env.TAU_SPIKE_RUST_BIN },
  t => {
    const { directory, replicas } = fixture(t);
    const [left, right] = replicas;
    right.close();
    const native = spawnSync(process.env.TAU_SPIKE_RUST_BIN, [join(directory, "mobile.db")], {
      encoding: "utf8",
    });
    assert.equal(native.status, 0, native.stderr);
    const restarted = new Replica(join(directory, "mobile.db"), { device: "mobile", slot: 2 });
    replicas.push(restarted);
    assert.equal(restarted.exportSince().length, 1);
    assert.equal(restarted.exportSince()[0].changes.length, 4);
    exchange(left, restarted);
    assert.deepEqual(left.snapshot(), restarted.snapshot());
    assert.equal(left.rows("todo_item")[0].title, "原生离线写入");
    assert.deepEqual(left.rows("whiteboard_documents")[0].state, { $blob: "00FF802A" });
  }
);

test("反例：数据库未声明外键的业务关联可收敛成孤儿，仍需领域一致性裁决", t => {
  const {
    replicas: [left, right],
  } = fixture(t);
  left.transaction(db =>
    db
      .prepare("INSERT INTO todo_group(id,title,create_time,update_time) VALUES(7,'共同分组',1,1)")
      .run()
  );
  exchange(left, right);
  left.transaction(db => db.prepare("DELETE FROM todo_group WHERE id=7").run());
  right.transaction(db =>
    db
      .prepare(
        "INSERT INTO todo_item(id,group_id,title,create_time,update_time) VALUES(?,7,'离线新待办',1,1)"
      )
      .run(right.allocateId())
  );
  exchange(left, right);
  assert.deepEqual(left.snapshot(), right.snapshot());
  assert.equal(left.rows("todo_group").length, 0);
  assert.equal(left.rows("todo_item")[0].group_id, 7);
  assert.deepEqual(left.db.prepare("PRAGMA foreign_key_check").all(), []);
});

test("唯一约束冲突及其关联进入冲突区，不阻塞后续事务，改名后原身份和关联恢复", t => {
  const {
    replicas: [left, middle, right],
  } = fixture(t, ["desktop", "mobile", "laptop"], SemanticReplica);
  left.transaction(db =>
    db.prepare("INSERT INTO contents(id,create_time,update_time,content) VALUES(7,1,1,'[]')").run()
  );
  exchange(left, middle);
  exchange(left, right);
  for (const replica of [left, middle, right]) {
    replica.transaction(db => {
      const id = replica.allocateId();
      db.prepare(
        "INSERT INTO plugin_entities(id,plugin_id,kind,key,title,content_id,create_time,update_time) VALUES(?,'spike','kind','same-key',?,7,1,1)"
      ).run(id, replica.state.device);
      db.prepare("INSERT INTO plugin_links VALUES(?,'spike',?,'card','7',1,'',0,'{}',1)").run(
        `${replica.state.device}-link`,
        id
      );
    });
    writeSetting(replica, replica.state.device, "后续事务");
  }
  exchange(middle, right);
  exchange(left, right);
  exchange(left, middle);
  assert.equal(left.rows("plugin_entities").length, 1);
  assert.equal(left.rows("plugin_links").length, 1);
  assert.equal(left.preserved().length, 4);
  assert.equal(left.rows("plugin_kv").length, 3);
  assert.deepEqual(left.snapshot(), middle.snapshot());
  assert.deepEqual(left.snapshot(), right.snapshot());
  assert.deepEqual(left.preserved(), right.preserved());
  const loser = left.preserved().find(item => item.table === "plugin_entities");
  left.editPreserved(loser.table, loser.key, { key: "renamed" });
  exchange(left, middle);
  exchange(middle, right);
  assert.equal(right.rows("plugin_entities").length, 2);
  assert.equal(right.rows("plugin_links").length, 2);
  const active = left.rows("plugin_entities").find(row => row.key === "same-key");
  left.transaction(db => db.prepare("DELETE FROM plugin_entities WHERE id=?").run(active.id));
  exchange(left, middle);
  exchange(middle, right);
  assert.deepEqual(
    left.rows("plugin_entities").map(row => row.key),
    ["renamed"]
  );
  assert.deepEqual(left.snapshot(), right.snapshot());
});

test("父级删除后子项进入待整理，普通编辑不改原归属，恢复父级不覆盖用户重新归类", t => {
  const {
    replicas: [left, right],
  } = fixture(t, ["desktop", "mobile"], SemanticReplica);
  left.transaction(db => {
    for (const id of [7, 8])
      db.prepare("INSERT INTO todo_group(id,title,create_time,update_time) VALUES(?,?,1,1)").run(
        id,
        `分组${id}`
      );
    db.prepare(
      "INSERT INTO todo_item(id,group_id,title,create_time,update_time) VALUES(9,7,'原待办',1,1)"
    ).run();
  });
  exchange(left, right);
  left.transaction(db => db.prepare("DELETE FROM todo_group WHERE id=7").run());
  right.transaction(db =>
    db
      .prepare(
        "INSERT INTO todo_item(id,group_id,title,create_time,update_time) VALUES(10,7,'离线新待办',1,1)"
      )
      .run()
  );
  exchange(left, right);
  assert.ok(left.rows("todo_item").every(row => row.group_id === -1));
  assert.equal(left.rows("todo_group").find(row => row.id === -1).title, "待整理");
  right.transaction(db =>
    db.prepare("UPDATE todo_item SET title='在待整理中编辑' WHERE id=9").run()
  );
  right.transaction(db => db.prepare("UPDATE todo_item SET group_id=8 WHERE id=10").run());
  const deletion = left.head("todo_group", [7]);
  left.restore("todo_group", [7], `${deletion.device}:${deletion.sequence}`);
  exchange(left, right);
  assert.equal(left.rows("todo_item").find(row => row.id === 9).group_id, 7);
  assert.equal(left.rows("todo_item").find(row => row.id === 9).title, "在待整理中编辑");
  assert.equal(left.rows("todo_item").find(row => row.id === 10).group_id, 8);
  assert.equal(
    left.rows("todo_group").some(row => row.id === -1),
    false
  );
  assert.deepEqual(left.snapshot(), right.snapshot());
});

test("未出现过的父级使子项暂存而非制造假父级，父级到达后自动呈现", t => {
  const {
    replicas: [left, right],
  } = fixture(t, ["desktop", "mobile"], SemanticReplica);
  left.transaction(db =>
    db
      .prepare(
        "INSERT INTO todo_item(id,group_id,title,create_time,update_time) VALUES(7,99,'等待父级',1,1)"
      )
      .run()
  );
  exchange(left, right);
  assert.equal(right.rows("todo_item").length, 0);
  assert.equal(right.preserved()[0].reason, "missing-parent");
  left.transaction(db =>
    db
      .prepare("INSERT INTO todo_group(id,title,create_time,update_time) VALUES(99,'迟到父级',1,1)")
      .run()
  );
  exchange(left, right);
  assert.equal(right.rows("todo_item")[0].group_id, 99);
  assert.equal(right.preserved().length, 0);
  assert.deepEqual(left.snapshot(), right.snapshot());
});

test("恢复开启新代，迟到旧编辑和旧删除不能覆盖；新代仍可再次删除与恢复", t => {
  const { directory, replicas } = fixture(t, ["desktop", "mobile", "laptop"], SemanticReplica);
  const [left, middle, right] = replicas;
  writeSetting(left, "shared", "删除前原值");
  exchange(left, middle);
  exchange(left, right);
  left.transaction(db => db.prepare("DELETE FROM plugin_kv WHERE key='shared'").run());
  right.transaction(db => db.prepare("DELETE FROM plugin_kv WHERE key='shared'").run());
  for (let index = 0; index < 6; index++) writeSetting(middle, `other-${index}`, index);
  writeSetting(middle, "shared", "离线旧编辑");
  const deleted = left.head("plugin_kv", ["spike", "shared"]);
  left.restore("plugin_kv", ["spike", "shared"], `${deleted.device}:${deleted.sequence}`);
  left.close();
  const restarted = new SemanticReplica(join(directory, "desktop.db"), {
    device: "desktop",
    slot: 1,
  });
  replicas.push(restarted);
  exchange(restarted, middle);
  exchange(middle, right);
  exchange(right, restarted);
  assert.equal(
    restarted.rows("plugin_kv").find(row => row.key === "shared").value,
    JSON.stringify("删除前原值")
  );
  assert.equal(restarted.head("plugin_kv", ["spike", "shared"]).generation, 1);
  restarted.transaction(db => db.prepare("DELETE FROM plugin_kv WHERE key='shared'").run());
  assert.throws(
    () =>
      restarted.restore("plugin_kv", ["spike", "shared"], `${deleted.device}:${deleted.sequence}`),
    /删除已变化/
  );
  const next = restarted.head("plugin_kv", ["spike", "shared"]);
  restarted.restore("plugin_kv", ["spike", "shared"], `${next.device}:${next.sequence}`);
  exchange(restarted, middle);
  exchange(middle, right);
  assert.equal(right.head("plugin_kv", ["spike", "shared"]).generation, 2);
  assert.deepEqual(restarted.snapshot(), right.snapshot());
});

test("并发恢复仍收敛，伪造未观察删除的恢复操作不推进确认", t => {
  const {
    replicas: [left, right],
  } = fixture(t, ["desktop", "mobile"], SemanticReplica);
  writeSetting(left, "shared", 1);
  left.transaction(db => db.prepare("DELETE FROM plugin_kv").run());
  exchange(left, right);
  const deletion = left.head("plugin_kv", ["spike", "shared"]);
  for (const replica of [left, right])
    replica.restore("plugin_kv", ["spike", "shared"], `${deletion.device}:${deletion.sequence}`);
  const batch = structuredClone(right.exportSince(left.frontier())[0]);
  batch.changes[0].generation = 7;
  const before = left.frontier();
  assert.throws(() => left.receive(batch), /恢复未引用/);
  assert.deepEqual(left.frontier(), before);
  exchange(left, right);
  assert.deepEqual(left.snapshot(), right.snapshot());
  assert.equal(right.head("plugin_kv", ["spike", "shared"]).generation, 1);
});

test("大字段只传校验过的差量，分块复用，损坏差量回滚且可重启经 HTTP 补齐", async t => {
  const { directory, replicas } = fixture(t, ["desktop", "mobile"], SemanticReplica);
  const [left, right] = replicas;
  const noise = Buffer.concat(
    Array.from({ length: 2304 }, (_, index) =>
      createHash("sha256").update(`field-spike:${index}`).digest()
    )
  );
  let text = `中文🙂${noise.toString("base64")}`;
  left.transaction(db =>
    db.prepare("INSERT INTO contents(id,create_time,update_time,content) VALUES(7,1,1,?)").run(text)
  );
  exchange(left, right);
  const frontier = right.frontier();
  const initialChunkBytes = left.db
    .prepare("SELECT coalesce(sum(length(data)),0) AS n FROM _spike_chunks")
    .get().n;
  for (let index = 0; index < 30; index++) {
    text = `${text.slice(0, 2000)}变${index}${text.slice(2000)}`;
    left.transaction(db => db.prepare("UPDATE contents SET content=? WHERE id=7").run(text));
  }
  const batches = left.exportSince(frontier);
  assert.ok(batches.every(batch => Object.keys(batch.changes[0].patch).join() === "content"));
  const bad = structuredClone(batches[0]);
  bad.changes[0].patch.content.hash = "0".repeat(64);
  const unchanged = right.snapshot();
  assert.throws(() => right.receive(bad), /摘要校验/);
  assert.deepEqual(right.frontier(), frontier);
  assert.deepEqual(right.snapshot(), unchanged);
  const chunkCount = right.db.prepare("SELECT count(*) AS n FROM _spike_chunks").get().n;
  assert.throws(() => right.receive(batches[0], { failAfterChanges: 1 }), /接收中断/);
  assert.equal(right.db.prepare("SELECT count(*) AS n FROM _spike_chunks").get().n, chunkCount);
  assert.deepEqual(right.frontier(), frontier);
  assert.deepEqual(right.snapshot(), unchanged);
  const wireBytes = Buffer.byteLength(JSON.stringify(batches));
  const unoptimized = Buffer.byteLength(text) * 2 * 30;
  const extraChunkBytes =
    left.db.prepare("SELECT sum(length(data)) AS n FROM _spike_chunks").get().n - initialChunkBytes;
  assert.ok(wireBytes < unoptimized / 20, `${wireBytes} / ${unoptimized}`);
  assert.ok(extraChunkBytes < unoptimized / 5, `${extraChunkBytes} / ${unoptimized}`);
  right.close();
  const restarted = new SemanticReplica(join(directory, "mobile.db"), {
    device: "mobile",
    slot: 2,
  });
  replicas.push(restarted);
  const server = await serveReplica(left);
  try {
    await synchronize(restarted, server.url);
  } finally {
    await server.close();
  }
  assert.equal(restarted.rows("contents")[0].content, text);
  assert.deepEqual(left.snapshot(), restarted.snapshot());
  t.diagnostic(JSON.stringify({ wireBytes, extraChunkBytes, unoptimized }));
});

test("二进制差量准确还原任意字节，v1 接收器明确拒绝 v2 信封", t => {
  const {
    replicas: [left, right],
  } = fixture(t, ["desktop", "mobile"], SemanticReplica);
  const bytes = randomBytes(32 * 1024);
  left.transaction(db =>
    db
      .prepare(
        "INSERT INTO whiteboard_documents(document_id,source_id,baseline_id,epoch,revision,revision_hash,creation_hash,state,contracts,snapshot,create_time,update_time) VALUES('board','library','baseline',1,1,'revision','creation',?,'{}','{}',1,1)"
      )
      .run(bytes)
  );
  exchange(left, right);
  bytes[123] ^= 255;
  left.transaction(db =>
    db.prepare("UPDATE whiteboard_documents SET state=? WHERE document_id='board'").run(bytes)
  );
  const batch = left.exportSince(right.frontier())[0];
  assert.equal(batch.changes[0].patch.state.codec, "splice");
  exchange(left, right);
  assert.equal(
    right.rows("whiteboard_documents")[0].state.$blob,
    bytes.toString("hex").toUpperCase()
  );
  const {
    replicas: [legacy],
  } = fixture(t, ["legacy"]);
  assert.throws(() => legacy.receive(batch), /协议不匹配/);
});

test("约束投影失败时事实、冲突区和进度共同回滚，重开后可重试", t => {
  const { directory, replicas } = fixture(t, ["desktop", "mobile"], SemanticReplica);
  const [left, right] = replicas;
  left.transaction(db =>
    db
      .prepare("INSERT INTO todo_group(id,title,create_time,update_time) VALUES(7,'分组',1,1)")
      .run()
  );
  const [batch] = left.exportSince();
  const before = right.snapshot();
  assert.throws(() => right.receive(batch, { failAfterChanges: 1 }), /接收中断/);
  assert.deepEqual(right.snapshot(), before);
  assert.deepEqual(right.frontier(), {});
  assert.equal(right.exportSince().length, 0);
  assert.deepEqual(right.preserved(), []);
  right.close();
  const restarted = new SemanticReplica(join(directory, "mobile.db"), {
    device: "mobile",
    slot: 2,
  });
  replicas.push(restarted);
  restarted.receive(batch);
  assert.deepEqual(left.snapshot(), restarted.snapshot());
});

test("多表恢复在一个事务内完成，包含真实外键的父子记录不会恢复一半", t => {
  const {
    replicas: [left, right],
  } = fixture(t, ["desktop", "mobile"], SemanticReplica);
  const { contentId, cardId } = insertCard(left, "恢复聚合");
  exchange(left, right);
  left.transaction(db => {
    db.prepare("DELETE FROM cards WHERE id=?").run(cardId);
    db.prepare("DELETE FROM content_documents WHERE content_id=?").run(contentId);
    db.prepare("DELETE FROM contents WHERE id=?").run(contentId);
  });
  exchange(left, right);
  const items = [
    ["contents", contentId],
    ["content_documents", contentId],
    ["cards", cardId],
  ].map(([table, id]) => {
    const deletion = left.head(table, [id]);
    return { table, key: [id], expectedDeletion: `${deletion.device}:${deletion.sequence}` };
  });
  const before = left.frontier();
  assert.throws(
    () => left.restoreMany([...items.slice(0, 2), { ...items[2], expectedDeletion: "stale:1" }]),
    /删除已变化/
  );
  assert.deepEqual(left.frontier(), before);
  assert.equal(left.rows("contents").length, 0);
  left.restoreMany(items);
  const batch = left.exportSince(right.frontier())[0];
  assert.equal(batch.changes.length, 3);
  assert.throws(() => right.receive(batch, { failAfterChanges: 1 }), /接收中断/);
  assert.equal(right.rows("contents").length, 0);
  right.receive(batch);
  assert.deepEqual(left.snapshot(), right.snapshot());
  assert.deepEqual(right.db.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(right.rows("cards")[0].id, cardId);
});
