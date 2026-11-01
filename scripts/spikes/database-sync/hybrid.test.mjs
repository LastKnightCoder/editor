import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { HybridReplica, synchronizeHybrid } from "./hybrid-replica.mjs";
import { linearDigest as hash } from "./linear-replica.mjs";
import { canonical } from "./replica.mjs";
import { serveLinear } from "./linear-transport.mjs";
import { synchronizeHybridHttp } from "./hybrid-transport.mjs";
import { Y, createNodeDocument, readNodeDocument } from "./collaboration-runtime.mjs";

async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "tau-yjs-hybrid-"));
  const peers = [];
  const authority = await HybridReplica.open(join(directory, "desktop.db"), { device: "desktop" });
  peers.push(authority);
  await authority.createNote(1, "甲乙");
  const mobile = await HybridReplica.open(join(directory, "mobile.db"), {
    device: "mobile",
    snapshot: authority.exportSnapshot(),
  });
  peers.push(mobile);
  t.after(() => {
    for (const peer of peers) peer.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const reopen = async device => {
    const peer = await HybridReplica.open(join(directory, `${device}.db`), { device });
    peers.push(peer);
    return peer;
  };
  return { directory, peers, authority, mobile, reopen };
}
const text = peer =>
  peer
    .readNote(1)
    .content.flatMap(node => node.children ?? [])
    .map(node => node.text ?? "")
    .join("");
const prefix = peer =>
  peer.editNote(1, ({ tree, origin }) => tree.insertText("paragraph-1", 0, "电脑", origin));
const suffix = peer =>
  peer.editNote(1, ({ tree, origin }) => tree.insertText("paragraph-1", 2, "手机", origin));
function envelope(snapshot) {
  const body = canonical(snapshot);
  return { id: hash(body), body };
}

test("真实协议 2 同篇离线输入用 Yjs 合并，普通 HTTP 只传增量，不要求选择库", async t => {
  const { authority, mobile } = await fixture(t);
  await prefix(authority);
  await suffix(mobile);
  const server = await serveLinear(authority);
  try {
    const result = await synchronizeHybridHttp(mobile, server.url);
    assert.equal(result.kind, "incremental");
    assert.equal(result.libraryChoiceRequired, false);
    assert.equal(result.wire.snapshotUploaded, false);
    assert.equal(text(authority), "电脑甲乙手机");
    assert.equal(text(mobile), text(authority));
    assert.equal(authority.branches().length, 0);
    assert.equal(authority.copies().length, 0);
    assert.deepEqual(authority.snapshotRows(), mobile.snapshotRows());
  } finally {
    await server.close();
  }
});

test("两端离线修改后全部重启，基线身份和未确认更新保持不变", async t => {
  const { authority, mobile, reopen } = await fixture(t);
  const baseline = authority.readNote(1).identity;
  await prefix(authority);
  await suffix(mobile);
  const state = mobile.entry(1).stateHash;
  authority.close();
  mobile.close();
  const a = await reopen("desktop");
  const b = await reopen("mobile");
  assert.equal(b.entry(1).stateHash, state);
  assert.deepEqual(b.readNote(1).identity, baseline);
  assert.equal(b.db.prepare("SELECT count(*) AS n FROM _linear_document_outbox").get().n, 1);
  await synchronizeHybrid(b, a);
  assert.equal(text(b), "电脑甲乙手机");
  assert.deepEqual(b.readNote(1).identity, baseline);
  assert.equal(b.db.prepare("SELECT count(*) AS n FROM _linear_document_outbox").get().n, 0);
});

test("主线和本机增量回收并丢弃确认缓存后，快照补齐仍合并原 CRDT，不从 JSON 重建", async t => {
  const { authority, mobile, reopen } = await fixture(t);
  await prefix(authority);
  await suffix(mobile);
  const baseline = mobile.readNote(1).identity;
  authority.compact();
  mobile.compact();
  mobile.db.exec("DELETE FROM _linear_ack_snapshot");
  authority.close();
  mobile.close();
  const a = await reopen("desktop");
  const b = await reopen("mobile");
  const result = await synchronizeHybrid(b, a);
  assert.equal(result.kind, "snapshot");
  assert.equal(text(b), "电脑甲乙手机");
  assert.deepEqual(b.readNote(1).identity, baseline);
  assert.equal(a.branches().length, 0);
  assert.equal(b.db.prepare("SELECT count(*) AS n FROM _linear_document_outbox").get().n, 0);
});

test("只有 DeleteSet 改变而状态向量未增长的删除，也能跨离线和快照保留", async t => {
  const { authority, mobile } = await fixture(t);
  const before = new Y.Doc({ gc: false });
  Y.applyUpdate(before, Buffer.from(authority.entry(1).state, "base64"));
  const vector = Y.encodeStateVector(before);
  before.destroy();
  await authority.editNote(1, ({ tree, origin }) => tree.deleteText("paragraph-1", 1, 1, origin));
  const after = new Y.Doc({ gc: false });
  Y.applyUpdate(after, Buffer.from(authority.entry(1).state, "base64"));
  assert.deepEqual(Y.encodeStateVector(after), vector);
  after.destroy();
  await mobile.editNote(1, ({ tree, origin }) => tree.insertText("paragraph-1", 2, "丙", origin));
  authority.compact();
  await synchronizeHybrid(mobile, authority);
  assert.equal(text(mobile), "甲丙");
  assert.equal(text(authority), "甲丙");
  assert.equal(authority.branches().length, 0);
});

test("旧 JSON 和假修订的普通回写被拒绝，重启从耐久二进制自愈投影", async t => {
  const { authority, reopen } = await fixture(t);
  await prefix(authority);
  const revision = authority.entry(1).stateHash;
  const head = authority.state().head;
  assert.throws(
    () =>
      authority.transaction(db => db.prepare("UPDATE contents SET content='[]' WHERE id=1").run()),
    /BODY_WRITE_REQUIRES_YJS/
  );
  assert.throws(
    () =>
      authority.transaction(db =>
        db.prepare("UPDATE content_documents SET revision='old' WHERE content_id=1").run()
      ),
    /BODY_WRITE_REQUIRES_YJS/
  );
  assert.equal(authority.state().head, head);
  authority.db.exec(
    "BEGIN; UPDATE _linear_state SET applying=2; UPDATE contents SET content='[]',count=0 WHERE id=1; UPDATE content_documents SET revision='old' WHERE content_id=1; UPDATE _linear_state SET applying=0; COMMIT"
  );
  authority.close();
  const restored = await reopen("desktop");
  assert.equal(text(restored), "电脑甲乙");
  assert.equal(restored.entry(1).stateHash, revision);
  assert.equal(
    restored.db.prepare("SELECT revision FROM content_documents").get().revision,
    revision
  );
  assert.notEqual(restored.db.prepare("SELECT content FROM contents").get().content, "[]");
  assert.equal(restored.branches().length, 0);
});

test("远端旧 JSON 写包属于协议违约，不生成库冲突副本也不覆盖正文", async t => {
  const { authority, mobile } = await fixture(t);
  mobile.transaction(tx => tx.update("cards", [1], { is_top: 1 }), { scoped: true });
  const bundle = mobile.bundle();
  const commit = bundle.commits[0];
  const before = mobile.rows("contents")[0];
  commit.ops = [{ table: "contents", key: [1], before, after: { ...before, content: "[]" } }];
  commit.rows = [{ table: "contents", key: [1], version: mobile.rowVersion("contents", [1]) }];
  delete commit.id;
  commit.id = hash(commit);
  await assert.rejects(authority.acceptBundle(bundle), /BODY_WRITE_REQUIRES_YJS/);
  assert.equal(text(authority), "甲乙");
  assert.equal(authority.branches().length, 0);
});

test("快照含旧 JSON 但带新 CRDT 时重建投影，不把旧文本回灌编辑器", async t => {
  const { authority, mobile } = await fixture(t);
  await prefix(authority);
  await suffix(mobile);
  authority.compact();
  const response = await authority.acceptBundle(mobile.bundle());
  assert.equal(response.kind, "snapshot");
  const snapshot = JSON.parse(response.snapshot.body);
  snapshot.rows.contents[0].content = "[]";
  snapshot.rows.contents[0].count = 0;
  snapshot.rows.content_documents[0].revision = "old-json";
  snapshot.dataHash = hash(snapshot.rows);
  response.snapshot = envelope(snapshot);
  response.dataHash = snapshot.dataHash;
  await mobile.installResponse(response);
  assert.equal(text(mobile), "电脑甲乙手机");
  assert.deepEqual(mobile.snapshotRows(), authority.snapshotRows());
  assert.equal(mobile.branches().length, 0);
});

test("确认快照中的陈旧 JSON 触发快照补齐，不影响未上传的正文更新", async t => {
  const { authority, mobile } = await fixture(t);
  await suffix(mobile);
  const ack = JSON.parse(
    mobile.db.prepare("SELECT payload FROM _linear_ack_snapshot").get().payload
  );
  const body = JSON.parse(ack.body);
  body.rows.contents[0].content = "[]";
  body.dataHash = hash(body.rows);
  mobile.db.prepare("UPDATE _linear_ack_snapshot SET payload=?").run(canonical(envelope(body)));
  assert.equal(mobile.bundle().forceSnapshot, true);
  await prefix(authority);
  const result = await synchronizeHybrid(mobile, authority);
  assert.equal(result.kind, "snapshot");
  assert.equal(text(mobile), "电脑甲乙手机");
  assert.equal(authority.branches().length, 0);
});

test("正文和独立元数据同时变化时都自动处理，不要求用户选择库", async t => {
  const { authority, mobile } = await fixture(t);
  await prefix(authority);
  await suffix(mobile);
  mobile.transaction(tx => tx.update("cards", [1], { is_top: 1 }), { scoped: true });
  const result = await synchronizeHybrid(mobile, authority);
  assert.equal(text(mobile), "电脑甲乙手机");
  assert.equal(authority.rows("cards")[0].is_top, 1);
  assert.equal(authority.branches().length, 0);
  assert.equal(result.libraryChoiceRequired, false);
});

test("真实元数据冲突仍不阻断已确认的正文合并，整库副本只是后台保全", async t => {
  const { directory, authority, mobile } = await fixture(t);
  await prefix(authority);
  await suffix(mobile);
  authority.transaction(tx => tx.update("cards", [1], { tags: '["desktop"]' }), { scoped: true });
  mobile.transaction(tx => tx.update("cards", [1], { tags: '["mobile"]' }), { scoped: true });
  const result = await synchronizeHybrid(mobile, authority);
  assert.equal(result.mode, "conflict");
  assert.equal(result.libraryChoiceRequired, false);
  assert.equal(authority.branches().length, 1);
  assert.equal(text(authority), "电脑甲乙手机");
  assert.equal(text(mobile), text(authority));
  assert.equal(authority.rows("cards")[0].tags, '["desktop"]');
  const file = authority.exportBranch(result.branchId, join(directory, "body-backup.db"));
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const stored = db.prepare("SELECT state FROM _linear_documents WHERE content_id=1").get();
    const doc = new Y.Doc({ gc: false });
    try {
      Y.applyUpdate(doc, stored.state);
      assert.ok(readNodeDocument(doc).content[0].children.some(node => node.text.includes("手机")));
    } finally {
      doc.destroy();
    }
  } finally {
    db.close();
  }
});

test("段落拆分格式与标题并发修改仍复用稳定节点身份合并", async t => {
  const { authority, mobile } = await fixture(t);
  const contract = authority.readNote(1).content[0].tauContract;
  await authority.editNote(1, ({ tree, doc, origin }) => {
    tree.splitNode(
      "paragraph-1",
      1,
      { type: "paragraph", collabId: "split-paragraph", tauContract: contract, children: [] },
      origin
    );
    tree.formatText("paragraph-1", 0, 1, { bold: true }, origin);
    doc.getText("title").insert(0, "电脑");
  });
  await mobile.editNote(1, ({ tree, doc, origin }) => {
    tree.insertText("paragraph-1", 2, "手机", origin);
    doc.getText("title").insert(2, "手机");
  });
  await synchronizeHybrid(mobile, authority);
  assert.equal(text(mobile), "甲乙手机");
  assert.equal(mobile.readNote(1).title, "电脑笔记手机");
  assert.equal(mobile.readNote(1).content.length, 2);
  assert.equal(mobile.readNote(1).content[0].collabId, "paragraph-1");
  assert.ok(mobile.readNote(1).content[0].children[0].bold);
  assert.equal(authority.branches().length, 0);
});

test("同步响应等待期间的新输入不会被安装覆盖，自动重试后保留全部意图", async t => {
  const { authority, mobile } = await fixture(t);
  await prefix(authority);
  await suffix(mobile);
  const response = await authority.acceptBundle(mobile.bundle());
  await mobile.editNote(1, ({ tree, origin }) =>
    tree.insertText("paragraph-1", 0, "新输入", origin)
  );
  await assert.rejects(mobile.installResponse(response), /LOCAL_CHANGED_DURING_SYNC/);
  assert.ok(text(mobile).startsWith("新输入"));
  await synchronizeHybrid(mobile, authority);
  for (const expected of ["电脑", "新输入", "甲乙", "手机"])
    assert.ok(text(mobile).includes(expected));
  assert.equal(text(mobile), text(authority));
  assert.equal(authority.branches().length, 0);
});

test("用户极端选择整库版本后，旧代离线正文只保全为单篇副本，不覆盖新选择", async t => {
  const { directory, peers, authority, mobile } = await fixture(t);
  const offline = await HybridReplica.open(join(directory, "offline.db"), {
    device: "offline",
    snapshot: authority.exportSnapshot(),
  });
  peers.push(offline);
  await offline.editNote(1, ({ tree, origin }) =>
    tree.insertText("paragraph-1", 0, "旧端", origin)
  );
  await prefix(authority);
  await suffix(mobile);
  authority.transaction(tx => tx.update("cards", [1], { tags: '["desktop"]' }), { scoped: true });
  mobile.transaction(tx => tx.update("cards", [1], { tags: '["mobile"]' }), { scoped: true });
  const conflict = await synchronizeHybrid(mobile, authority);
  await authority.chooseBranch(conflict.branchId, { expectedHead: authority.state().head });
  const copies = authority.branches().length;
  const result = await synchronizeHybrid(offline, authority);
  assert.equal(result.libraryChoiceRequired, false);
  assert.equal(authority.branches().length, copies);
  assert.equal(authority.copies().length, 1);
  assert.equal(text(authority), "甲乙手机");
  assert.ok(
    authority.copies()[0].document.content[0].children.some(node => node.text.includes("旧端"))
  );
});

test("相同 JSON 另造的 Y.Doc 无法冒充原基线，只保存单篇副本，不要求选库", async t => {
  const { authority, mobile } = await fixture(t);
  const old = mobile.entry(1);
  const doc = new Y.Doc({ gc: false });
  Y.applyUpdate(doc, Buffer.from(old.state, "base64"));
  const contracts = doc.getMap("node-tree:contracts").toJSON();
  doc.destroy();
  const fresh = await createNodeDocument(
    mobile.readNote(1).identity,
    mobile.readNote(1),
    contracts
  );
  const bytes = Y.encodeStateAsUpdate(fresh);
  fresh.destroy();
  mobile.db.exec("BEGIN; UPDATE _linear_state SET applying=2");
  mobile.persist({ ...old, state: Buffer.from(bytes).toString("base64"), stateHash: hash(bytes) });
  mobile.projectAll();
  mobile.db.exec("UPDATE _linear_state SET applying=0; COMMIT");
  await suffix(mobile);
  const result = await synchronizeHybrid(mobile, authority);
  assert.equal(authority.branches().length, 0);
  assert.equal(authority.copies().length, 1);
  assert.ok(
    authority.copies()[0].document.content[0].children.some(node => node.text.includes("手机"))
  );
  assert.equal(text(mobile), "甲乙");
  assert.equal(result.libraryChoiceRequired, false);
});

test("远端已删除笔记时保全离线正文，不复活记录也不要求选择库", async t => {
  const { authority, mobile } = await fixture(t);
  await suffix(mobile);
  authority.transaction(db => {
    db.prepare("DELETE FROM cards WHERE id=1").run();
    db.prepare("DELETE FROM content_documents WHERE content_id=1").run();
    db.prepare("DELETE FROM contents WHERE id=1").run();
  });
  await synchronizeHybrid(mobile, authority);
  assert.equal(authority.rows("contents").length, 0);
  assert.equal(mobile.rows("contents").length, 0);
  assert.equal(mobile.readNote(1).deleted, true);
  assert.equal(text(mobile), "甲乙手机");
  assert.equal(authority.branches().length, 0);
});

test("正文提交后丢失响应，重发只确认一次，输入不会重复", async t => {
  const { authority, mobile } = await fixture(t);
  await suffix(mobile);
  const server = await serveLinear(authority, { dropReplyOnce: true });
  try {
    await assert.rejects(synchronizeHybridHttp(mobile, server.url));
    assert.equal(text(authority), "甲乙手机");
    assert.equal(mobile.db.prepare("SELECT count(*) AS n FROM _linear_document_outbox").get().n, 1);
    await synchronizeHybridHttp(mobile, server.url);
    assert.equal(text(mobile), "甲乙手机");
    assert.equal(authority.branches().length, 0);
    assert.equal(mobile.db.prepare("SELECT count(*) AS n FROM _linear_document_outbox").get().n, 0);
  } finally {
    await server.close();
  }
});

test("快照安装中断时正文状态投影和 outbox 一起回滚，重启后能补齐", async t => {
  const { authority, mobile, reopen } = await fixture(t);
  await prefix(authority);
  await suffix(mobile);
  const before = mobile.entry(1).stateHash;
  authority.compact();
  const result = await authority.acceptBundle(mobile.bundle());
  await assert.rejects(mobile.installResponse(result, { failAfterRows: 1 }), /INSTALL_INTERRUPTED/);
  assert.equal(mobile.entry(1).stateHash, before);
  assert.equal(text(mobile), "甲乙手机");
  assert.equal(mobile.db.prepare("SELECT count(*) AS n FROM _linear_document_outbox").get().n, 1);
  mobile.close();
  const restarted = await reopen("mobile");
  await synchronizeHybrid(restarted, authority);
  assert.equal(text(restarted), "电脑甲乙手机");
  assert.deepEqual(restarted.snapshotRows(), authority.snapshotRows());
  assert.equal(authority.branches().length, 0);
});

test("正文状态写入后进程退出不会留下半份保存，已提交的更新可重启续传", async t => {
  const { directory, authority, mobile, reopen } = await fixture(t);
  mobile.close();
  const module = new URL("./hybrid-replica.mjs", import.meta.url).href;
  const path = join(directory, "mobile.db");
  const run = crash =>
    spawnSync(
      process.execPath,
      [
        ...process.execArgv,
        "--input-type=module",
        "-e",
        `import{HybridReplica}from${JSON.stringify(module)};const r=await HybridReplica.open(${JSON.stringify(path)},{device:'mobile'});await r.editNote(1,({tree,origin})=>tree.insertText('paragraph-1',2,'手机',origin),{crashAfterState:${crash}});process.exit(17);`,
      ],
      { encoding: "utf8" }
    );
  let child = run(true);
  assert.equal(child.status, 17, child.stderr);
  let restored = await reopen("mobile");
  assert.equal(text(restored), "甲乙");
  assert.equal(restored.db.prepare("SELECT count(*) AS n FROM _linear_document_outbox").get().n, 0);
  restored.close();
  child = run(false);
  assert.equal(child.status, 17, child.stderr);
  restored = await reopen("mobile");
  assert.equal(text(restored), "甲乙手机");
  assert.equal(restored.db.prepare("SELECT count(*) AS n FROM _linear_document_outbox").get().n, 1);
  await synchronizeHybrid(restored, authority);
  assert.equal(text(authority), "甲乙手机");
});

test("非法身份写入或损坏增量不确认，不修改正文，也不会弹出库选择", async t => {
  const { authority, mobile } = await fixture(t);
  const head = mobile.state().head;
  await assert.rejects(
    mobile.editNote(1, ({ doc }) => doc.getMap("meta").set("baselineId", "invalid")),
    /身份|基线/
  );
  assert.equal(mobile.state().head, head);
  await suffix(mobile);
  const bundle = mobile.bundle();
  bundle.commits[0].document.update = "broken";
  await assert.rejects(authority.acceptBundle(bundle), /COMMIT_IDENTITY/);
  assert.equal(text(authority), "甲乙");
  assert.equal(mobile.db.prepare("SELECT count(*) AS n FROM _linear_document_outbox").get().n, 1);
  assert.equal(authority.branches().length, 0);
});

test("同一端并发准备两个编辑仍保留两次意图，再与另一端离线编辑合并", async t => {
  const { authority, mobile } = await fixture(t);
  await Promise.all([
    mobile.editNote(1, ({ tree, origin }) => tree.insertText("paragraph-1", 0, "一", origin)),
    mobile.editNote(1, ({ tree, origin }) => tree.insertText("paragraph-1", 2, "二", origin)),
  ]);
  await prefix(authority);
  await synchronizeHybrid(mobile, authority);
  assert.ok(text(mobile).includes("一"));
  assert.ok(text(mobile).includes("二"));
  assert.ok(text(mobile).includes("电脑"));
  assert.equal(authority.branches().length, 0);
});

test("编辑准备期间库代次改变时不把旧意图冒充新代保存", async t => {
  const { mobile } = await fixture(t);
  const before = mobile.entry(1).stateHash;
  await assert.rejects(
    mobile.editNote(1, ({ tree, origin }) => {
      tree.insertText("paragraph-1", 0, "旧上下文", origin);
      mobile.db.prepare("UPDATE _linear_state SET epoch='new-library-epoch'").run();
    }),
    /DOCUMENT_EPOCH_CHANGED/
  );
  assert.equal(mobile.entry(1).stateHash, before);
  assert.equal(text(mobile), "甲乙");
  assert.equal(mobile.db.prepare("SELECT count(*) AS n FROM _linear_document_outbox").get().n, 0);
});
