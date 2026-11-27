import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { D1PreparedStatement } from "@cloudflare/workers-types";
import { catalogData } from "./catalog-data";
import { testEnvironment } from "./testing";
import { handle } from "./index";

let f: ReturnType<typeof testEnvironment>;
const day = "2026-11-24",
  windowStart = "2026-11-18";
beforeEach(() => {
  f = testEnvironment();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(`${day}T12:00:00Z`);
});
afterEach(() => {
  f.sqlite.close();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function seed(target = f, id = "r1", version = "1.0.0") {
  target.sqlite.exec(`INSERT OR IGNORE INTO publishers VALUES('author','author','');
    INSERT OR IGNORE INTO plugins(id,publisher_id,repository_id,repository) VALUES('test.plugin','author','repo','repo');`);
  target.sqlite
    .prepare(
      "INSERT INTO uploads(id,publisher_id,status,file_name,size,created_at) VALUES(?,'author','ready','p.zip',1,'now')"
    )
    .run(id);
  target.sqlite
    .prepare(
      "INSERT INTO submissions(id,publisher_id,client_request_id,status,created_at,updated_at) VALUES(?,'author',?,'approved','now','now')"
    )
    .run(id, id);
  const manifest = {
    formatVersion: 3,
    apiVersion: 1,
    platform: "portable",
    profile: "web-v1",
    targets: { desktop: { minAppVersion: "0.59.0" } },
  };
  target.sqlite
    .prepare(`INSERT INTO releases(id,plugin_id,version,submission_id,package_upload_id,publisher_id,object_key,sha256,size,content_json,repository,source_commit,state,created_at,published_at,name,categories)
    VALUES(?,'test.plugin',?,?,?,'author','object','digest',1,?,'repo','commit','published','now','2026-11-24','测试插件','["page"]')`)
    .run(id, version, id, id, JSON.stringify({ manifest }));
}
const load = (target = f) => catalogData(target.env, day, windowStart);
const visible = async () => {
  const response = await handle(
    new Request(f.env.API_ORIGIN + "/v2/catalog/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "desktop" }),
    }),
    f.env
  );
  expect(response.status).toBe(200);
  return (await response.json()).data;
};

it("缓存命中后发布、撤回、禁用与恢复仍立即改变公开目录", async () => {
  seed();
  expect((await visible()).items[0].latest.version).toBe("1.0.0");
  seed(f, "r2", "2.0.0");
  expect((await visible()).items[0].latest.version).toBe("2.0.0");
  f.sqlite.exec("UPDATE releases SET revoked_at='now' WHERE id='r2'");
  expect((await visible()).items[0].latest.version).toBe("1.0.0");
  f.sqlite.exec("UPDATE plugins SET disabled_at='now'");
  expect((await visible()).items).toEqual([]);
  f.sqlite.exec("UPDATE plugins SET disabled_at=NULL");
  expect((await visible()).items[0].latest.version).toBe("1.0.0");
  f.sqlite.exec("DELETE FROM release_targets WHERE release_id='r1'");
  expect((await visible()).items).toEqual([]);
});

it("目录统计有界缓存，过期或跨 UTC 日重新取数", async () => {
  seed();
  f.sqlite.exec(`INSERT INTO plugin_download_totals VALUES('test.plugin',3);
    INSERT INTO plugin_download_daily VALUES('test.plugin','2026-11-18',3)`);
  expect((await load()).recent.get("test.plugin")).toBe(3);
  f.sqlite.exec("UPDATE plugin_download_totals SET downloads=7");
  expect((await load()).totals.get("test.plugin")).toBe(3);
  vi.advanceTimersByTime(299_999);
  expect((await load()).totals.get("test.plugin")).toBe(3);
  // 统计到期、跨日都应能在版本资料暂不可读时完成刷新。
  const prepare = f.env.DB.prepare.bind(f.env.DB);
  vi.spyOn(f.env.DB, "prepare").mockImplementation(sql => {
    if (sql.includes("AS current_package")) throw new Error("重复读取版本资料");
    return prepare(sql);
  });
  vi.advanceTimersByTime(1);
  expect((await load()).totals.get("test.plugin")).toBe(7);
  expect(
    (await catalogData(f.env, "2026-11-25", "2026-11-19")).recent.get("test.plugin")
  ).toBeUndefined();
});

it("不同数据库的同名插件不共享缓存，作者公开资料变更即时失效", async () => {
  seed();
  await load();
  const other = testEnvironment();
  try {
    seed(other);
    other.sqlite.exec("UPDATE releases SET name='另一个环境'");
    expect((await load(other)).versions.get("test.plugin")?.[0].name).toBe("另一个环境");
    f.sqlite.exec("UPDATE publishers SET login='new-author'");
    expect((await load()).versions.get("test.plugin")?.[0].login).toBe("new-author");
  } finally {
    other.sqlite.close();
  }
});

function deferred() {
  let resolve: () => void = () => {
    throw new Error("等待器尚未初始化");
  };
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

it("加载期间下架不会污染新缓存，旧加载失败不清除正在使用的新数据", async () => {
  seed();
  const arrived = deferred(),
    resume = deferred();
  let paused = false;
  const prepare = f.env.DB.prepare.bind(f.env.DB);
  function wrap(statement: D1PreparedStatement): D1PreparedStatement {
    return new Proxy(statement, {
      get(target, key, receiver) {
        if (key === "bind") return (...args: unknown[]) => wrap(target.bind(...args));
        if (key === "all")
          return async <T>() => {
            const result = await target.all<T>();
            if (!paused) {
              paused = true;
              arrived.resolve();
              await resume.promise;
            }
            return result;
          };
        return Reflect.get(target, key, receiver);
      },
    });
  }
  vi.spyOn(f.env.DB, "prepare").mockImplementation(sql =>
    sql.includes("AS current_package") ? wrap(prepare(sql)) : prepare(sql)
  );
  const old = load();
  await arrived.promise;
  f.sqlite.exec("UPDATE plugins SET disabled_at='now'");
  expect((await load()).versions.size).toBe(0);
  resume.resolve();
  await expect(old).rejects.toThrow("插件目录正在更新");
  expect((await load()).versions.size).toBe(0);
});

it("数据库校验失败时即使有缓存也报错，失败恢复后可以重新读取", async () => {
  seed();
  await load();
  f.sqlite.exec("ALTER TABLE catalog_revision RENAME TO unavailable_revision");
  await expect(load()).rejects.toThrow();
  f.sqlite.exec("ALTER TABLE unavailable_revision RENAME TO catalog_revision");
  expect((await load()).versions.get("test.plugin")?.[0].version).toBe("1.0.0");
});

it("已有发布库应用缓存迁移保留包资料，回滚事务也回滚失效标记", async () => {
  const previous = testEnvironment({ catalogCacheSchema: false });
  try {
    seed(previous);
    const before = previous.sqlite
      .prepare("SELECT id,content_json,sha256,state FROM releases")
      .all();
    previous.sqlite.exec(
      readFileSync(new URL("../infra/migrations/0014_catalog_cache.sql", import.meta.url), "utf8")
    );
    expect(
      previous.sqlite.prepare("SELECT id,content_json,sha256,state FROM releases").all()
    ).toEqual(before);
    await load(previous);
    previous.sqlite.exec("BEGIN; UPDATE plugins SET disabled_at='now'; ROLLBACK");
    expect((await load(previous)).versions.get("test.plugin")?.[0].version).toBe("1.0.0");
    previous.sqlite.exec("UPDATE plugins SET disabled_at='now'");
    expect((await load(previous)).versions.size).toBe(0);
    expect(previous.sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    previous.sqlite.close();
  }
});
