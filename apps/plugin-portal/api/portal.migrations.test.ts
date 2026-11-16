import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

describe("数据库迁移对账", () => {
  it("有记录的旧数据库迁移保留提交和反馈且外键有效", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(
        readFileSync(new URL("../infra/migrations/0001_submissions.sql", import.meta.url), "utf8")
      );
      db.exec(
        "INSERT INTO publishers VALUES ('1','a',''); INSERT INTO submissions(id,publisher_id,client_request_id,status,created_at,updated_at,submitted_at) VALUES ('s','1','r','pending_review','now','now','now'); INSERT INTO submission_feedback VALUES ('f','s','1','r','author','已有意见','now')"
      );
      db.exec(
        readFileSync(
          new URL("../infra/migrations/0003_review_release.sql", import.meta.url),
          "utf8"
        )
      );
      expect(db.prepare("SELECT status FROM submissions WHERE id='s'").get()?.status).toBe(
        "pending_review"
      );
      expect(
        db.prepare("SELECT message FROM submission_feedback WHERE id='f'").get()?.message
      ).toBe("已有意见");
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      db.close();
    }
  });
  it("0008为已有发布记录回填分类与关键词", () => {
    const db = new DatabaseSync(":memory:");
    try {
      const run = (name: string) =>
        db.exec(readFileSync(new URL(`../infra/migrations/${name}`, import.meta.url), "utf8"));
      run("0001_submissions.sql");
      run("0003_review_release.sql");
      run("0004_release_catalog.sql");
      db.exec("PRAGMA foreign_keys=OFF");
      const insert = db.prepare(
        "INSERT INTO releases(id,plugin_id,version,submission_id,package_upload_id,publisher_id,object_key,sha256,size,content_json,repository,source_commit,state,created_at) VALUES(?,'p',?,?,'u','42','k','h',1,?,'repo','c','published','t')"
      );
      insert.run("a", "1.0.0", "s1", JSON.stringify({ manifest: { categories: ["sync"] } }));
      insert.run("b", "1.1.0", "s2", JSON.stringify({ manifest: {} }));
      run("0008_release_categories.sql");
      expect(db.prepare("SELECT categories,keywords FROM releases ORDER BY id").all()).toEqual([
        { categories: '["sync"]', keywords: "[]" },
        { categories: "[]", keywords: "[]" },
      ]);
    } finally {
      db.close();
    }
  });
  it("0004为已有发布记录回填目录资料列", () => {
    const db = new DatabaseSync(":memory:");
    try {
      const run = (name: string) =>
        db.exec(readFileSync(new URL(`../infra/migrations/${name}`, import.meta.url), "utf8"));
      run("0001_submissions.sql");
      run("0003_review_release.sql");
      db.exec("PRAGMA foreign_keys=OFF");
      db.prepare(
        "INSERT INTO releases(id,plugin_id,version,submission_id,package_upload_id,publisher_id,object_key,sha256,size,content_json,repository,source_commit,state,created_at) VALUES('r','p','1.0.0','s','u','42','k','h',1,?,'repo','c','published','t')"
      ).run(
        JSON.stringify({
          manifest: { name: "旧插件", description: "旧简介", minAppVersion: "0.58.0" },
        })
      );
      run("0004_release_catalog.sql");
      expect(db.prepare("SELECT name,description,min_app_version FROM releases").get()).toEqual({
        name: "旧插件",
        description: "旧简介",
        min_app_version: "0.58.0",
      });
    } finally {
      db.close();
    }
  });
  it("新库单步初始化得到当前结构，误重复初始化不会清空已有数据", () => {
    const db = new DatabaseSync(":memory:");
    try {
      const schema = readFileSync(
        new URL("../infra/migrations/0001_submissions.sql", import.meta.url),
        "utf8"
      );
      db.exec(schema);
      const columns = db
        .prepare("PRAGMA table_info(submissions)")
        .all()
        .map(row => row.name);
      expect(columns).toContain("content_json");
      expect(columns).toContain("source_commit");
      expect(columns).not.toContain("listing_json");
      expect(
        db
          .prepare("PRAGMA table_info(uploads)")
          .all()
          .map(row => row.name)
      ).not.toContain("kind");
      expect(db.prepare("SELECT count(*) AS n FROM submission_feedback").get()?.n).toBe(0);
      db.exec(
        "INSERT INTO publishers VALUES ('1','a',''); INSERT INTO uploads(id,publisher_id,status,file_name,size,created_at) VALUES ('u','1','ready','a',1,'now')"
      );
      expect(() => db.exec(schema)).toThrow();
      expect(db.prepare("SELECT count(*) AS n FROM uploads").get()?.n).toBe(1);
    } finally {
      db.close();
    }
  });
});
