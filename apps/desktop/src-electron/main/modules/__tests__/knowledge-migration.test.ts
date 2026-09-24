import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import fixture from "@tau/db-schema/fixtures/knowledge-to-project.sql?raw";
import {
  inspectKnowledgeMigration,
  migrateKnowledgeToProjects,
  readKnowledgeMapping,
} from "@tau/db-schema/src/knowledge-migration";
import {
  migrateKnowledgeCitations,
  migrateKnowledgeReferences,
} from "@tau/db-schema/src/knowledge-references";
import { migrateKnowledgeIndex } from "@tau/db-schema/src/knowledge-index-migration";
import indexSchema from "@tau/db-schema/schema/index.sql?raw";
import vectorSchema from "@tau/db-schema/schema/index/20_vec_template.sql?raw";
import * as sqliteVec from "sqlite-vec";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { upgradeKnowledgeDatabase } from "@tau/db-schema/src/knowledge-migration-node";
import { migrateKnowledgeTab } from "@tau/db-schema/src/knowledge-navigation";
import referenceCases from "@tau/db-schema/fixtures/knowledge-reference-cases.json";

const databases: Database.Database[] = [];
function readReport(db: Database.Database) {
  const row = db
    .prepare("SELECT value FROM migration_meta WHERE key='knowledge-to-project:v1'")
    .get() as { value: string };
  return JSON.parse(row.value);
}
function database() {
  const db = new Database(":memory:");
  databases.push(db);
  db.exec(schema);
  db.exec(fixture);
  return db;
}
afterEach(() => databases.splice(0).forEach(db => db.close()));

describe("知识库迁移", () => {
  it("引用转换遵守跨端共享样本", () => {
    for (const sample of referenceCases.objects) {
      expect(migrateKnowledgeReferences(sample.input, referenceCases.mapping)).toEqual(
        sample.expected
      );
    }
    for (const sample of referenceCases.citations) {
      expect(migrateKnowledgeCitations(sample.input, referenceCases.mapping)).toBe(sample.expected);
    }
  });
  // 历史结构样本存放在 git 历史中；浅克隆/无 .git 环境显式跳过，避免误报失败
  const hasGitHistory = (() => {
    try {
      execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { stdio: "ignore" });
      return true;
    } catch {
      console.warn("[knowledge-migration.test] 环境缺少 git 历史，跳过历史结构升级用例");
      return false;
    }
  })();
  it.skipIf(!hasGitHistory).each(["1a5e853e", "9f072e4e", "98de2f61", "092cadeb"])(
    "历史结构 %s 可由 Node 独立升级",
    revision => {
      const db = new Database(":memory:");
      databases.push(db);
      db.exec(
        execFileSync("git", ["show", `${revision}:packages/db-schema/schema/main.sql`], {
          encoding: "utf8",
        })
      );
      expect(migrateKnowledgeToProjects(db, () => {})).toMatchObject({
        projectCount: 0,
        itemCount: 0,
      });
      expect(migrateKnowledgeToProjects(db, () => {})).toBeNull();
    }
  );
  it("预检不写库，保留共享内容、关系、时间、标签、描述与局部发布范围", () => {
    const db = database();
    const before = db.prepare("SELECT * FROM contents WHERE id=20").get();
    expect(inspectKnowledgeMigration(db)).toMatchObject({
      projectCount: 2,
      itemCount: 2,
      repairedRelations: 1,
    });
    expect(db.prepare("SELECT count(*) AS n FROM project").get()).toEqual({ n: 1 });
    const backup = vi.fn();
    const report = migrateKnowledgeToProjects(db, backup)!;
    expect(backup).toHaveBeenCalledOnce();
    expect(report.mapping).toEqual({ projects: { 1: 9, 2: 10 }, items: { 1: 5, 2: 6 } });
    expect(db.prepare("SELECT * FROM contents WHERE id=20").get()).toEqual(before);
    expect(
      db
        .prepare(
          "SELECT children,parents,projects,tags,content_id,create_time,update_time FROM project_item WHERE id=5"
        )
        .get()
    ).toEqual({
      children: "[6]",
      parents: "[]",
      projects: "[9]",
      tags: '["标签"]',
      content_id: 21,
      create_time: 15,
      update_time: 16,
    });
    expect(db.prepare("SELECT parents,projects FROM project_item WHERE id=6").get()).toEqual({
      parents: "[5]",
      projects: "[9,10]",
    });
    const root = db.prepare("SELECT * FROM project WHERE id=9").get() as any;
    expect(root).toMatchObject({
      pinned: 1,
      archived: 0,
      project_type: "document-tree",
      create_time: 11,
      update_time: 12,
    });
    expect(JSON.parse(root.desc).map((block: any) => block.children[0].text)).toEqual([
      "简介",
      "根正文",
    ]);
    expect(
      db.prepare("SELECT content_type,content_id,parent_path FROM publish_selections").get()
    ).toEqual({
      content_type: "project",
      content_id: 9,
      parent_path: '{"mode":"partial","nodes":[6]}',
    });
    expect(db.prepare("SELECT file_path,source_type,source_id FROM publish_history").get()).toEqual(
      { file_path: "/docs/document/1/2.html", source_type: "project", source_id: 9 }
    );
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE name IN ('documents','document_items')")
        .all()
    ).toEqual([]);
    expect(db.prepare("SELECT * FROM operation").all()).toEqual([]);
    expect(
      JSON.parse((db.prepare("SELECT content FROM contents WHERE id=21").get() as any).content)[0]
    ).toMatchObject({ contentType: "project-item", refId: 6, contentId: 20 });
  });

  it("统计按各类型前值归并，重复迁移无副作用", () => {
    const db = database();
    migrateKnowledgeToProjects(db, () => {});
    expect(
      db
        .prepare("SELECT content FROM statistic ORDER BY date")
        .all()
        .map((row: any) => JSON.parse(row.content))
    ).toEqual([
      { count: 1, wordsCount: 4 },
      { count: 3, wordsCount: 10 },
      { count: 4, wordsCount: 14 },
      { count: 2.5, wordsCount: 9.5 },
    ]);
    const backup = vi.fn();
    expect(migrateKnowledgeToProjects(db, backup)).toBeNull();
    expect(backup).not.toHaveBeenCalled();
    expect(readKnowledgeMapping(db)?.items[2]).toBe(6);
  });

  it.each([
    ["循环", "UPDATE document_items SET children='[1]' WHERE id=2"],
    ["正文", "UPDATE document_items SET content_id=999 WHERE id=1"],
    ["JSON", "UPDATE document_items SET tags='bad' WHERE id=1"],
  ])("预检拒绝%s，不调用备份或改动目标表", (message, sql) => {
    const db = database();
    db.exec(sql);
    const backup = vi.fn();
    expect(() => migrateKnowledgeToProjects(db, backup)).toThrow(message);
    expect(backup).not.toHaveBeenCalled();
    expect(db.prepare("SELECT count(*) AS n FROM project").get()).toEqual({ n: 1 });
  });

  it("悬空子节点引用按旧版删除残留剔除并继续迁移", () => {
    const db = database();
    db.exec("UPDATE document_items SET children='[999]' WHERE id=1");
    migrateKnowledgeToProjects(db, () => {});
    expect(db.prepare("SELECT children FROM project_item WHERE id=5").get()).toEqual({
      children: "[]",
    });
    const report = readReport(db);
    expect(report.repairedDanglingRefs).toBe(1);
    expect(report.recoveredOrphans).toEqual([]);
    expect(report.rescueProjectId).toBeNull();
  });

  it("孤儿节点收拢进未挂载项目，引用正常转换", () => {
    const db = database();
    db.exec(`
      UPDATE documents SET children='[]' WHERE id=1;
      INSERT INTO operation(operation_time,operation_id,operation_content_type,operation_action) VALUES
        (1,1,'document-item','create');
    `);
    migrateKnowledgeToProjects(db, () => {});
    const report = readReport(db);
    expect(report.recoveredOrphans).toEqual([1]);
    // 孤儿照常分配映射：可达节点 2 拿 5，孤儿 1 拿 6；收容项目占据根之后的 11
    expect(report.mapping.items).toEqual({ "2": 5, "1": 6 });
    expect(report.rescueProjectId).toBe(11);
    expect(db.prepare("SELECT count(*) AS n FROM project_item").get()).toEqual({ n: 3 });
    expect(db.prepare("SELECT title,children FROM project WHERE id=11").get()).toEqual({
      title: "未挂载文档",
      children: "[6]",
    });
    // 孤儿的 projects 指向收容项目，operation 引用按映射正常转换
    expect(db.prepare("SELECT projects FROM project_item WHERE id=6").get()).toEqual({
      projects: "[11]",
    });
    expect(db.prepare("SELECT operation_content_type,operation_id FROM operation").get()).toEqual({
      operation_content_type: "project-item",
      operation_id: 6,
    });
  });

  it("备份失败停止迁移", () => {
    const db = database();
    expect(() =>
      migrateKnowledgeToProjects(db, () => {
        throw new Error("备份失败");
      })
    ).toThrow("备份失败");
    expect(db.prepare("SELECT count(*) AS n FROM documents").get()).toEqual({ n: 2 });
  });

  it("后置引用校验失败回滚新项目、标签列及旧表删除", () => {
    const db = database();
    db.exec('UPDATE publish_selections SET parent_path=\'{"mode":"partial","nodes":[999]}\'');
    expect(() => migrateKnowledgeToProjects(db, () => {})).toThrow("999");
    expect(db.prepare("SELECT count(*) AS n FROM documents").get()).toEqual({ n: 2 });
    expect(db.prepare("SELECT count(*) AS n FROM project").get()).toEqual({ n: 1 });
    expect(readKnowledgeMapping(db)).toBeNull();
  });

  it("空库也能升级", () => {
    const db = new Database(":memory:");
    databases.push(db);
    db.exec(schema);
    const backup = vi.fn();
    // 无知识库数据只补列并登记版本，不产生备份与空映射报告
    expect(migrateKnowledgeToProjects(db, backup)).toBeNull();
    expect(backup).not.toHaveBeenCalled();
    expect(
      db.prepare("SELECT value FROM migration_meta WHERE key='data-model-version'").get()
    ).toEqual({ value: "1" });
  });

  it("不含业务表的空库文件仅登记模型版本，不进入建列流程", () => {
    const db = new Database(":memory:");
    databases.push(db);
    const backup = vi.fn();
    expect(migrateKnowledgeToProjects(db, backup)).toBeNull();
    expect(backup).not.toHaveBeenCalled();
    expect(
      db.prepare("SELECT value FROM migration_meta WHERE key='data-model-version'").get()
    ).toEqual({ value: "1" });
    expect(migrateKnowledgeToProjects(db, backup)).toBeNull();
  });

  it("悬空协作绑定按正文存活性降级或清除，可映射绑定正常转换", () => {
    const db = database();
    // 历史遗留的孤儿绑定是外键约束外写入的，这里关闭约束以复现。
    db.pragma("foreign_keys = OFF");
    db.exec(`
      INSERT INTO collaboration_bindings(content_id,content_created_at,server_url,document_id,source_type,source_id,source_title) VALUES
       (20,1,'https://s','d1','document-item',999,'已删节点'),
       (21,1,'https://s','d2','document-item',2,'共享文档'),
       (30,9,'https://s','d3','document-item',888,'孤儿');
    `);
    migrateKnowledgeToProjects(db, () => {});
    expect(
      db
        .prepare(
          "SELECT content_id,source_type,source_id FROM collaboration_bindings ORDER BY content_id"
        )
        .all()
    ).toEqual([
      { content_id: 20, source_type: "retired-document-item", source_id: 999 },
      { content_id: 21, source_type: "project-item", source_id: 6 },
    ]);
  });

  it("迁移失败重试复用首份备份，skipBackup 不产生备份", () => {
    const directory = mkdtempSync(join(tmpdir(), "tau-knowledge-"));
    const path = join(directory, "main.db");
    const db = new Database(path);
    try {
      db.exec(schema);
      db.exec(fixture);
      db.exec('UPDATE publish_selections SET parent_path=\'{"mode":"partial","nodes":[999]}\'');
      expect(() => upgradeKnowledgeDatabase(db, path)).toThrow();
      expect(() => upgradeKnowledgeDatabase(db, path)).toThrow();
      expect(readdirSync(directory).filter(name => name.endsWith(".bak"))).toHaveLength(1);
    } finally {
      db.close();
      rmSync(directory, { recursive: true, force: true });
    }
    const skipDirectory = mkdtempSync(join(tmpdir(), "tau-knowledge-"));
    const skipPath = join(skipDirectory, "main.db");
    const skipDb = new Database(skipPath);
    try {
      skipDb.exec(schema);
      skipDb.exec(fixture);
      upgradeKnowledgeDatabase(skipDb, skipPath, { skipBackup: true });
      expect(readdirSync(skipDirectory).filter(name => name.endsWith(".bak"))).toHaveLength(0);
    } finally {
      skipDb.close();
      rmSync(skipDirectory, { recursive: true, force: true });
    }
  });

  it("旧关联字段转换为项目关联，并保留正文身份", () => {
    const db = database();
    db.exec(
      "INSERT INTO cards(id,create_time,update_time,tags,content_id) VALUES(3,1,2,'[]',20); UPDATE document_items SET is_card=1,card_id=3 WHERE id=2"
    );
    migrateKnowledgeToProjects(db, () => {});
    expect(
      db.prepare("SELECT ref_type,ref_id,content_id FROM project_item WHERE id=6").get()
    ).toEqual({ ref_type: "card", ref_id: 3, content_id: 20 });
  });

  it("磁盘备份包含 WAL 中的正文，恢复前的旧表仍完整", () => {
    const directory = mkdtempSync(join(tmpdir(), "tau-knowledge-"));
    const path = join(directory, "main.db");
    const db = new Database(path);
    try {
      db.exec(schema);
      db.exec(fixture);
      db.pragma("journal_mode = WAL");
      db.prepare("UPDATE contents SET count=42 WHERE id=20").run();
      upgradeKnowledgeDatabase(db, path);
      const backup = readdirSync(directory).find(name => name.endsWith(".bak"));
      expect(backup).toBeTruthy();
      const snapshot = new Database(join(directory, backup!), { readonly: true });
      try {
        expect(snapshot.prepare("SELECT count FROM contents WHERE id=20").get()).toEqual({
          count: 42,
        });
        expect(snapshot.prepare("SELECT COUNT(*) AS n FROM documents").get()).toEqual({ n: 2 });
        expect(readKnowledgeMapping(snapshot)).toBeNull();
      } finally {
        snapshot.close();
      }
    } finally {
      db.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("旧页面历史映射到项目，失效详情降级到列表", () => {
    const mapping = { projects: { 1: 9 }, items: { 2: 6 } };
    expect(
      migrateKnowledgeTab({ type: "documentDetail", params: { id: 1, itemId: 2 } }, mapping)
    ).toEqual({ type: "projectDetail", params: { id: 9, itemId: 6 } });
    expect(
      migrateKnowledgeTab({ type: "documentDetail", params: { id: 99 } }, mapping)
    ).toMatchObject({ type: "projectList", params: undefined });
  });

  it("拒绝未来模型版本且不改动数据", () => {
    const db = database();
    db.exec("INSERT INTO migration_meta VALUES('data-model-version','2')");
    const backup = vi.fn();
    expect(() => migrateKnowledgeToProjects(db, backup)).toThrow("DB_MODEL_INCOMPATIBLE");
    expect(backup).not.toHaveBeenCalled();
  });

  it("索引身份升级复用向量且幂等，不清除其他类型", () => {
    const db = database();
    migrateKnowledgeToProjects(db, () => {});
    const index = new Database(":memory:");
    databases.push(index);
    index.loadExtension(sqliteVec.getLoadablePath());
    index.exec(indexSchema);
    index.exec(vectorSchema.replaceAll("__VEC_DIMENSION__", "3"));
    index
      .prepare(
        "INSERT INTO content_fts(prefixed_id,type,content,title,update_time,chunk_index) VALUES('document-item:2','document-item','正文','标题',18,0)"
      )
      .run();
    const vector = new Float32Array([1, 0, 0]);
    index
      .prepare(
        "INSERT INTO vec_documents(prefixed_id,type,content,update_time,vec_embedding) VALUES('document-item:2','document-item','正文',18.0,?)"
      )
      .run(Buffer.from(vector.buffer));
    index
      .prepare(
        "INSERT INTO content_fts(prefixed_id,type,content,title,update_time,chunk_index) VALUES('card:3','card','卡片','',18,0)"
      )
      .run();
    migrateKnowledgeIndex(db, index);
    migrateKnowledgeIndex(db, index);
    const otherClient = new Database(":memory:");
    databases.push(otherClient);
    otherClient.exec(schema);
    const mapping = readKnowledgeMapping(db)!;
    otherClient
      .prepare("INSERT INTO migration_meta(key,value) VALUES('knowledge-to-project:v1',?)")
      .run(JSON.stringify({ mapping: { items: mapping.items, projects: mapping.projects } }));
    migrateKnowledgeIndex(otherClient, index);
    expect(index.prepare("SELECT prefixed_id,type FROM vec_documents").all()).toEqual([
      { prefixed_id: "project-item:6", type: "project-item" },
    ]);
    expect(
      (index.prepare("SELECT vec_embedding FROM vec_documents").get() as any).vec_embedding
    ).toEqual(Buffer.from(vector.buffer));
    expect(index.prepare("SELECT prefixed_id FROM content_fts ORDER BY prefixed_id").all()).toEqual(
      [{ prefixed_id: "card:3" }, { prefixed_id: "project-item:6" }]
    );
  });

  it("转换结构化引用和 Markdown 引用，保留代码和普通文字", () => {
    const mapping = { items: { 2: 6 }, projects: { 1: 9 } };
    expect(
      migrateKnowledgeReferences(
        { type: "document-card-list", documentItemId: 2, children: [{ text: "document-item" }] },
        mapping
      )
    ).toEqual({
      type: "project-card-list",
      projectItemId: 6,
      children: [{ text: "document-item" }],
    });
    const citation = ":ref[旧文档]{id=2 type=document-item}";
    expect(
      migrateKnowledgeCitations(
        `${citation}\n\`${citation}\`\n\`\`\`ts\n${citation}\n\`\`\``,
        mapping
      )
    ).toBe(`:ref[旧文档]{id=6 type=project-item}\n\`${citation}\`\n\`\`\`ts\n${citation}\n\`\`\``);
  });
});
