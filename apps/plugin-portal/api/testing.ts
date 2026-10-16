import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import type { Env } from "./platform";

export function testEnvironment() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(new URL("../infra/migrations/0001_submissions.sql", import.meta.url), "utf8")
  );
  sqlite.exec(
    readFileSync(new URL("../infra/migrations/0003_review_release.sql", import.meta.url), "utf8")
  );
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
      const result = sqlite.prepare(this.sql).run(...(this.args as never[]));
      return { success: true, meta: { changes: Number(result.changes) } };
    }
  }
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const published = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const env = {
    DB: {
      prepare: (sql: string) => new Statement(sql),
      batch: async (statements: Statement[]) => {
        sqlite.exec("BEGIN");
        try {
          const results = [];
          for (const statement of statements) results.push(statement.execute());
          sqlite.exec("COMMIT");
          return results;
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
      },
    },
    PENDING: {
      put: async (
        key: string,
        bytes: Uint8Array,
        options: { httpMetadata: { contentType: string } }
      ) => {
        objects.set(key, { bytes, contentType: options.httpMetadata.contentType });
      },
      delete: async (key: string) => {
        objects.delete(key);
      },
      get: async (key: string) => {
        const value = objects.get(key);
        return value
          ? {
              arrayBuffer: async () =>
                value.bytes.buffer.slice(
                  value.bytes.byteOffset,
                  value.bytes.byteOffset + value.bytes.byteLength
                ),
              httpMetadata: { contentType: value.contentType },
            }
          : null;
      },
    },
    WEB_ORIGIN: "http://localhost:5173",
    RELEASES: {
      put: async (
        key: string,
        bytes: Uint8Array,
        options: { httpMetadata: { contentType: string } }
      ) => {
        published.set(key, { bytes, contentType: options.httpMetadata.contentType });
      },
      get: async (key: string) => {
        const value = published.get(key);
        return value
          ? {
              arrayBuffer: async () =>
                value.bytes.buffer.slice(
                  value.bytes.byteOffset,
                  value.bytes.byteOffset + value.bytes.byteLength
                ),
            }
          : null;
      },
    },
    API_ORIGIN: "http://localhost:8787",
    GITHUB_CLIENT_ID: "test-client",
    GITHUB_CLIENT_SECRET: "test-only-secret",
    TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  } as unknown as Env;
  return { env, sqlite, objects, published };
}
