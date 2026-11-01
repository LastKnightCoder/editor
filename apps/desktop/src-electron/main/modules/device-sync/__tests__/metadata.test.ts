// @vitest-environment node
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import MAIN from "@tau/db-schema/schema/main.sql?raw";
import SQL from "@tau/db-schema/schema/device-sync.sql?raw";
import { DeviceSyncEngine, synchronizeDevice } from "@tau/collaboration/src/device-sync/engine";
import { mergeMetadata } from "@tau/collaboration/src/device-sync/metadata";
import { metadataRules } from "@tau/collaboration/src/device-sync/metadata-contract";
import type { DeviceState } from "@tau/collaboration/src/device-sync/protocol";
import { DeviceDatabaseStore, initializeDeviceSyncDatabase } from "../database-store";

const databases: Database.Database[] = [];
afterEach(() => databases.splice(0).forEach(db => db.close()));

function pair() {
  const state: DeviceState = {
    library: randomUUID(),
    schema: "metadata-fixture",
    node: randomUUID(),
    authority: "",
    epoch: randomUUID(),
    head: randomUUID(),
    ackHead: "",
    ackSeq: 0,
    enabled: true,
    revision: 0,
  };
  state.authority = state.node;
  state.ackHead = state.head;
  const create = (node: string) => {
    const db = new Database(":memory:");
    databases.push(db);
    db.exec(MAIN);
    initializeDeviceSyncDatabase(db, SQL);
    db.prepare("INSERT INTO _tau_device_state(id,payload) VALUES(1,?)").run(
      JSON.stringify({ ...state, node })
    );
    initializeDeviceSyncDatabase(db, SQL);
    const store = new DeviceDatabaseStore(db, () => {
      throw new Error("本用例不应改写正文");
    });
    return { db, store, engine: new DeviceSyncEngine(store) };
  };
  const authority = create(state.node);
  const replica = create(randomUUID());
  return {
    authority,
    replica,
    sync: () => synchronizeDevice(replica.engine, offer => authority.engine.accept(offer)),
  };
}

function excerpt(db: Database.Database, id: number, externalId = "book:mark", note = "", time = 1) {
  db.prepare(
    "INSERT INTO excerpt(id,source_type,source_key,source_title,external_id,quote,note,create_time,update_time) VALUES(?,'weread','book','书',?,'原文',?,?,?)"
  ).run(id, externalId, note, time, time);
}

it("旧协议来源不能进入编号归并，拒绝时不写入材料", async () => {
  const { authority, replica } = pair();
  excerpt(replica.db, 1);
  const offer = await replica.engine.offer();
  await expect(authority.engine.accept({ ...offer, protocol: 2 })).rejects.toThrow(
    "DEVICE_SYNC_VERSION"
  );
  expect(authority.db.prepare("SELECT count(*) AS count FROM excerpt").get()).toEqual({ count: 0 });
});

it.each([
  [101, 202],
  [101, 101],
])("两端离线重复导入：身份 %s/%s 归并且重发、下一次修改仍收敛", async (left, right) => {
  const { authority, replica, sync } = pair();
  excerpt(authority.db, left, "book:mark", "想法", 10);
  excerpt(replica.db, right, "book:mark", "想法", 20);
  const reply = await sync();
  expect(reply.preserved).not.toBe(true);
  expect(authority.db.prepare("SELECT id,quote,note,create_time FROM excerpt").all()).toEqual(
    replica.db.prepare("SELECT id,quote,note,create_time FROM excerpt").all()
  );
  expect(replica.db.prepare("SELECT id FROM excerpt").all()).toEqual([{ id: left }]);
  await sync();
  replica.db.prepare("UPDATE excerpt SET note='新想法',update_time=30 WHERE id=?").run(left);
  await sync();
  expect(authority.db.prepare("SELECT note FROM excerpt").get()).toEqual({ note: "新想法" });
  expect(authority.db.prepare("SELECT count(*) AS count FROM _tau_device_branches").get()).toEqual({
    count: 0,
  });
});

it("不同对象占用相同本地编号：分配空闲编号，谱系跟随来源映射", async () => {
  const { authority, replica, sync } = pair();
  excerpt(authority.db, 1, "desktop:mark");
  excerpt(replica.db, 1, "mobile:mark");
  replica.db
    .prepare(
      "INSERT INTO entity_lineage(src_kind,src_id,dst_kind,dst_id,relation,create_time) VALUES('excerpt','1','card','77','excerpt_of',1)"
    )
    .run();
  await sync();
  const mobile = authority.db
    .prepare("SELECT id FROM excerpt WHERE external_id='mobile:mark'")
    .get() as { id: number };
  expect(mobile.id).not.toBe(1);
  expect(authority.db.prepare("SELECT src_id FROM entity_lineage").get()).toEqual({
    src_id: String(mobile.id),
  });
  expect(replica.db.prepare("SELECT src_id FROM entity_lineage").get()).toEqual({
    src_id: String(mobile.id),
  });
  expect(authority.db.prepare("SELECT count(*) AS count FROM excerpt").get()).toEqual({ count: 2 });
});

it("同一逻辑对象不同编号：谱系去重后仍指向协调端对象", async () => {
  const { authority, replica, sync } = pair();
  excerpt(authority.db, 101);
  excerpt(replica.db, 202);
  for (const [db, id] of [
    [authority.db, 101],
    [replica.db, 202],
  ] as const)
    db.prepare(
      "INSERT INTO entity_lineage(src_kind,src_id,dst_kind,dst_id,relation,create_time) VALUES('excerpt',?,'card','77','excerpt_of',1)"
    ).run(String(id));
  await sync();
  expect(authority.db.prepare("SELECT src_id FROM entity_lineage").all()).toEqual([
    { src_id: "101" },
  ]);
  expect(replica.db.prepare("SELECT src_id FROM entity_lineage").all()).toEqual([
    { src_id: "101" },
  ]);
});

it("不同想法不被同身份去重吞掉，整批来源保全且确认后不重复卡住", async () => {
  const { authority, replica, sync } = pair();
  excerpt(authority.db, 101, "book:mark", "电脑想法");
  excerpt(replica.db, 202, "book:mark", "手机想法");
  excerpt(replica.db, 203, "other:mark");
  const reply = await sync();
  expect(reply.preserved).toBe(true);
  expect(authority.db.prepare("SELECT note FROM excerpt").all()).toEqual([{ note: "电脑想法" }]);
  const saved = authority.db.prepare("SELECT payload FROM _tau_device_branches").get() as {
    payload: string;
  };
  expect(JSON.parse(saved.payload).rows.excerpt).toHaveLength(2);
  expect(JSON.parse(saved.payload).rows.excerpt[0].note).toBe("手机想法");
  await sync();
  expect(authority.db.prepare("SELECT count(*) AS count FROM _tau_device_branches").get()).toEqual({
    count: 1,
  });
});

it("编号映射遇到插件私有载荷时保全，不替换 JSON 中的相同数字", async () => {
  const { authority, replica, sync } = pair();
  excerpt(authority.db, 101);
  excerpt(replica.db, 202);
  replica.db
    .prepare("INSERT INTO plugin_kv VALUES('weread','private','{\"id\":202,\"page\":202}',1)")
    .run();
  expect((await sync()).preserved).toBe(true);
  const saved = authority.db.prepare("SELECT payload FROM _tau_device_branches").get() as {
    payload: string;
  };
  expect(JSON.parse(saved.payload).rows.plugin_kv[0].value).toBe('{"id":202,"page":202}');
  expect(authority.db.prepare("SELECT count(*) AS count FROM plugin_kv").get()).toEqual({
    count: 0,
  });
});

it("非主键唯一约束错误统一分类，回放失败不提交行、历史或确认", async () => {
  const { authority, replica } = pair();
  excerpt(authority.db, 101);
  excerpt(replica.db, 202);
  const offer = await replica.engine.offer(true);
  const view = await authority.store.read();
  await expect(
    authority.store.commit({
      expectedSequence: view.sequence,
      expectedHead: view.state.head,
      state: view.state,
      changes: offer.changes,
    })
  ).rejects.toThrow("DEVICE_SYNC_UNIQUE");
  expect(authority.db.prepare("SELECT id FROM excerpt").all()).toEqual([{ id: 101 }]);
  expect((await authority.store.read()).state.head).toBe(view.state.head);
  expect(authority.db.prepare("SELECT count(*) AS count FROM _tau_device_receipts").get()).toEqual({
    count: 0,
  });
});

it("同一归并器支持其他声明式对象及普通外键，无需添加领域分支", () => {
  const object = {
    name: "objects",
    columns: ["id", "external", "title"],
    key: ["id"],
    parents: [],
  };
  const edge = { name: "edges", columns: ["id", "object_id"], key: ["id"], parents: ["objects"] };
  const incoming = { id: 20, external: "same", title: "标题" };
  const result = mergeMetadata(
    [object, edge],
    { objects: [{ ...incoming, id: 10 }], edges: [] },
    [
      { table: "objects", key: [20], before: null, after: incoming },
      { table: "edges", key: ["edge"], before: null, after: { id: "edge", object_id: 20 } },
    ],
    {
      objects: { identity: ["external"], generatedKey: true },
      edges: { references: [{ column: "object_id", table: "objects" }] },
    }
  );
  expect(result.changes).toEqual([
    { table: "edges", key: ["edge"], before: null, after: { id: "edge", object_id: 10 } },
  ]);
});

it("归并契约覆盖当前字段，逻辑身份必须有真实唯一约束保护", () => {
  const { authority } = pair();
  for (const [name, rule] of Object.entries(metadataRules)) {
    const fields = authority.db.pragma(`table_info(${name})`) as { name: string }[];
    expect(rule.columns?.slice().sort(), name).toEqual(fields.map(field => field.name).sort());
    if (!rule.identity) continue;
    const indexes = authority.db.pragma(`index_list(${name})`) as {
      name: string;
      unique: number;
      partial: number;
    }[];
    const keys = indexes
      .filter(index => index.unique && !index.partial)
      .map(index =>
        (authority.db.pragma(`index_info(${index.name})`) as { name: string }[]).map(
          column => column.name
        )
      );
    expect(keys, name).toContainEqual(rule.identity);
  }
});

it("声明式多态引用保留类型和前缀，并更新目标创建身份，空载荷不阻挡映射", () => {
  const tables = [
    { name: "objects", columns: ["id", "external", "create_time"], key: ["id"], parents: [] },
    { name: "edges", columns: ["id", "kind", "ref", "created", "data"], key: ["id"], parents: [] },
  ];
  const incoming = { id: 20, external: "same", create_time: 200 };
  const edge = { id: "edge", kind: "material", ref: "object:20", created: 200, data: "{}" };
  const result = mergeMetadata(
    tables,
    { objects: [{ ...incoming, id: 10, create_time: 100 }], edges: [] },
    [
      { table: "objects", key: [20], before: null, after: incoming },
      { table: "edges", key: ["edge"], before: null, after: edge },
      {
        table: "edges",
        key: ["other"],
        before: null,
        after: { ...edge, id: "other", kind: "other" },
      },
    ],
    {
      objects: { identity: ["external"], generatedKey: true, timestamps: ["create_time"] },
      edges: {
        opaque: ["data"],
        references: [
          {
            column: "ref",
            table: "objects",
            when: { column: "kind", value: "material" },
            prefix: "object:",
            createdAt: "created",
          },
        ],
      },
    }
  );
  expect(result.changes.map(change => change.after)).toEqual([
    { ...edge, ref: "object:10", created: 100 },
    { ...edge, id: "other", kind: "other" },
  ]);
});
