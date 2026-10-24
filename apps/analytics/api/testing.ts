import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import type { Env } from "./platform";

export function testEnvironment() {
  const sqlite = new DatabaseSync(":memory:");
  const directory = new URL("../infra/migrations/", import.meta.url);
  for (const filename of readdirSync(directory)
    .filter(file => file.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync(new URL(filename, directory), "utf8"));
  class Statement {
    constructor(
      readonly sql: string,
      readonly args: unknown[] = []
    ) {}
    bind(...args: unknown[]) {
      return new Statement(this.sql, args);
    }
    async first(column?: string) {
      const row = sqlite.prepare(this.sql).get(...(this.args as never[])) ?? null;
      return column ? (row?.[column] ?? null) : row;
    }
    async all() {
      return { results: sqlite.prepare(this.sql).all(...(this.args as never[])), success: true };
    }
    async run() {
      return this.execute();
    }
    execute() {
      if (/^\s*(SELECT|WITH)/i.test(this.sql))
        return { results: sqlite.prepare(this.sql).all(...(this.args as never[])), success: true };
      const result = sqlite.prepare(this.sql).run(...(this.args as never[]));
      return { success: true, results: [], meta: { changes: Number(result.changes) } };
    }
  }
  const objects = new Set<string>();
  const env = {
    DB: {
      prepare: (sql: string) => new Statement(sql),
      batch: async (statements: Statement[]) => {
        sqlite.exec("BEGIN");
        try {
          const result = statements.map(statement => statement.execute());
          sqlite.exec("COMMIT");
          return result;
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
      },
    },
    RELEASES: { head: async (key: string) => (objects.has(key) ? { key } : null) },
    ASSETS: { fetch: async () => new Response("统计后台") },
    ADMIN_TOKEN: "test-only-admin-token-".repeat(3),
    DOWNLOAD_HASH_KEY: "test-only-download-salt-".repeat(3),
    ALLOWED_ORIGINS: "https://taunote.app,http://localhost:5181",
    DOWNLOAD_ORIGIN: "https://dl.taunote.app",
    VERSION_LIMITER: { limit: async () => ({ success: true }) },
  } as unknown as Env;
  return { env, sqlite, objects };
}
